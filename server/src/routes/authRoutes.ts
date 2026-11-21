import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  AuthenticatedUser,
  DEMO_PROFILES,
  findDemoProfileByEmailOrId,
  requireAuth,
  requireRole,
  resolveRoleCodeFromProfile,
} from '../middleware/auth.js';
import {
  clearHttpOnlySessionCookie,
  createRateLimiter,
  createSignedSessionCookieValue,
  parseCookies,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
  setHttpOnlySessionCookie,
} from '../middleware/security.js';

export const authRouter = Router();

// Account lockout / brute-force tracking per email
const failedLoginTracker = new Map<
  string,
  { failures: number; lockedUntil: number }
>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const loginRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'auth_login',
  message: 'Too many authentication attempts from this network address. Please try again later.',
});

// Development-only signing keys (kept strictly server-side, never bundled into frontend code)
const DEV_ONLY_SIGNING_KEYS: Record<string, string> = {
  APPROVER_1: '1111111111111111111111111111111111111111111111111111111111111111',
  APPROVER_2: '2222222222222222222222222222222222222222222222222222222222222222',
};

// Public configuration endpoint for the login page (does NOT expose secrets or private keys)
authRouter.get('/config', (_req, res) => {
  res.json({
    institution_id: env.institutionId,
    dev_workspace_enabled: env.allowDevIdentities,
    identities: env.allowDevIdentities
      ? Object.entries(DEMO_PROFILES).map(([key, profile]) => ({
          identity_key: key,
          email: profile.email,
          full_name: profile.full_name,
          designation: profile.designation,
          department: profile.department,
          role: profile.role,
          role_code: profile.role_code,
          registration_id: profile.registration_id,
          public_key_hex: profile.public_key_hex,
        }))
      : [],
  });
});

// Standard Institutional Email & Password Authentication (Sets HttpOnly Session Cookie)
authRouter.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        error: 'Institutional email address and password are required.',
        code: 'INVALID_INPUT',
        status: 400,
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check account lockout status
    const lockRecord = failedLoginTracker.get(normalizedEmail);
    if (lockRecord && Date.now() < lockRecord.lockedUntil) {
      const waitSec = Math.ceil((lockRecord.lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(waitSec));
      res.status(429).json({
        error: `Account temporarily locked due to repeated failed sign-in attempts. Retry in ${waitSec} seconds.`,
        code: 'ACCOUNT_LOCKED',
        status: 429,
        retry_after_seconds: waitSec,
      });
      return;
    }

    if (!isSupabaseConfigured()) {
      res.status(503).json({
        error: 'Authentication provider is currently unavailable.',
        code: 'AUTH_PROVIDER_UNAVAILABLE',
        status: 503,
      });
      return;
    }

    const anonClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      const prev = failedLoginTracker.get(normalizedEmail) || {
        failures: 0,
        lockedUntil: 0,
      };
      const nextFailures = prev.failures + 1;
      failedLoginTracker.set(normalizedEmail, {
        failures: nextFailures,
        lockedUntil:
          nextFailures >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : 0,
      });

      // Generic error message to prevent account enumeration
      res.status(401).json({
        error: 'Invalid institutional credentials. Please verify your email and password.',
        code: 'INVALID_CREDENTIALS',
        status: 401,
      });
      return;
    }

    // Clear failed attempts on successful authentication
    failedLoginTracker.delete(normalizedEmail);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, public_key_hex')
      .eq('id', data.user.id)
      .maybeSingle();

    const matchedDev = env.allowDevIdentities
      ? findDemoProfileByEmailOrId(normalizedEmail)
      : undefined;
    const resolvedUser: AuthenticatedUser = matchedDev || {
      id: data.user.id,
      email: normalizedEmail,
      full_name: profile?.full_name || data.user.email || 'Institutional User',
      role: (profile?.role as any) || 'student',
      role_code: resolveRoleCodeFromProfile({
        email: normalizedEmail,
        role: (profile?.role as any) || 'student',
        public_key_hex: profile?.public_key_hex,
      }),
      public_key_hex: profile?.public_key_hex || null,
    };

    const cookieValue = createSignedSessionCookieValue({
      userId: resolvedUser.id,
      email: resolvedUser.email,
      roleCode: resolvedUser.role_code,
    });

    setHttpOnlySessionCookie(res, cookieValue);
    res.json({
      user: resolvedUser,
      session_token: cookieValue,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to complete authentication request.',
      code: 'AUTH_INTERNAL_ERROR',
      status: 500,
    });
  }
});

// Protected Role Workspace Session Initializer (Strictly disabled in production)
authRouter.post('/dev-session', loginRateLimiter, (req, res) => {
  if (!env.allowDevIdentities) {
    res.status(403).json({
      error: 'Development identity workspaces are strictly disabled in this environment.',
      code: 'DEV_IDENTITIES_DISABLED',
      status: 403,
    });
    return;
  }

  const { identity_key } = req.body || {};
  if (!identity_key || !(identity_key in DEMO_PROFILES)) {
    res.status(400).json({
      error: 'Unknown development identity key.',
      code: 'INVALID_IDENTITY',
      status: 400,
    });
    return;
  }

  const profile = DEMO_PROFILES[identity_key];
  const cookieValue = createSignedSessionCookieValue({
    userId: profile.id,
    email: profile.email,
    roleCode: profile.role_code,
  });

  setHttpOnlySessionCookie(res, cookieValue);
  res.json({
    user: profile,
    session_token: cookieValue,
  });
});

// Protected Signing Key Retrieval (Scoped strictly to development and authenticated approver)
authRouter.get(
  '/dev-signing-key',
  requireAuth,
  requireRole('approver'),
  (req, res) => {
    if (!env.allowDevIdentities) {
      res.status(403).json({
        error: 'Development signing keys are strictly disabled in this environment.',
        code: 'DEV_KEYS_DISABLED',
        status: 403,
      });
      return;
    }

    const roleCode = req.user!.role_code;
    const privKey = DEV_ONLY_SIGNING_KEYS[roleCode];
    if (!privKey) {
      res.status(404).json({
        error: 'No development signing key configured for this approver identity.',
        code: 'KEY_NOT_FOUND',
        status: 404,
      });
      return;
    }

    res.json({
      role_code: roleCode,
      public_key_hex: req.user!.public_key_hex,
      private_key_hex: privKey,
    });
  }
);

// Session Logout & Invalidation
authRouter.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    revokeSessionToken(cookieToken);
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    revokeSessionToken(authHeader.slice('Bearer '.length).trim());
  }
  clearHttpOnlySessionCookie(res);
  res.json({ status: 'signed_out' });
});

// Current Authenticated Identity
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
