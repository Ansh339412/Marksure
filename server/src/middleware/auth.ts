import { NextFunction, Request, Response } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { isSupabaseConfigured } from '../config/env.js';
import {
  parseCookies,
  SESSION_COOKIE_NAME,
  verifySignedSessionCookieValue,
} from './security.js';

export type UserRole = 'student' | 'admin' | 'approver';
export type RoleCode = 'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT';

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  role_code: RoleCode;
  public_key_hex: string | null;
  designation?: string;
  registration_id?: string;
  department?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Fictional institutional development identities (configured for non-production verification)
export const DEMO_PROFILES: Record<string, AuthenticatedUser> = {
  'demo-admin': {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@marksure.edu',
    full_name: 'Mr. Arjun Malhotra',
    designation: 'Assistant Registrar (Examinations)',
    department: 'Division of Examination Operations',
    role: 'admin',
    role_code: 'ADMIN',
    public_key_hex: null,
  },
  'demo-approver-1': {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'dean.exams@marksure.edu',
    full_name: 'Dr. Meera Kapoor',
    designation: 'Deputy Controller of Examinations',
    department: 'Academic Scrutiny & Review Board',
    role: 'approver',
    role_code: 'APPROVER_1',
    public_key_hex: '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c',
  },
  'demo-approver-2': {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'controller@marksure.edu',
    full_name: 'Dr. Karan Bedi',
    designation: 'Controller of Examinations',
    department: 'Office of the Controller of Examinations',
    role: 'approver',
    role_code: 'APPROVER_2',
    public_key_hex: '24715704a7b57239962f59e73f00178d629032f1c370b6b948b3b034769221d6',
  },
  'demo-student-1': {
    id: '00000000-0000-0000-0000-000000000011',
    email: 'aarav.patel@student.marksure.edu',
    full_name: 'Harnoor Singh',
    designation: 'B.Tech Computer Science and Engineering',
    department: 'School of Computer Science and Engineering',
    registration_id: 'REG-2026-CSE-001',
    role: 'student',
    role_code: 'STUDENT',
    public_key_hex: null,
  },
};

export function resolveRoleCodeFromProfile(profile: {
  email: string;
  role: UserRole;
  public_key_hex?: string | null;
}): RoleCode {
  if (profile.role === 'admin') return 'ADMIN';
  if (profile.role === 'student') return 'STUDENT';
  const emailLower = (profile.email || '').toLowerCase();
  if (
    emailLower.includes('controller') ||
    profile.public_key_hex === DEMO_PROFILES['demo-approver-2'].public_key_hex
  ) {
    return 'APPROVER_2';
  }
  return 'APPROVER_1';
}

export function findDemoProfileByEmailOrId(
  identifier: string
): AuthenticatedUser | undefined {
  const lower = identifier.toLowerCase();
  return Object.values(DEMO_PROFILES).find(
    (p) => p.email.toLowerCase() === lower || p.id.toLowerCase() === lower
  );
}

/**
 * Verifies authentication via:
 * 1. HttpOnly signed session cookie (`marksure_sid`), OR
 * 2. Authorization Bearer token (Supabase Auth JWT or configured dev identity token).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Check HttpOnly session cookie first
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (cookieToken) {
      const sessionPayload = verifySignedSessionCookieValue(cookieToken);
      if (sessionPayload) {
        const matchedDev = findDemoProfileByEmailOrId(sessionPayload.email);
        if (matchedDev) {
          req.user = matchedDev;
          next();
          return;
        }

        if (isSupabaseConfigured()) {
          const supabase = getSupabaseAdmin();
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, full_name, role, public_key_hex')
            .eq('id', sessionPayload.sub)
            .maybeSingle();

          if (profile) {
            const roleCode = resolveRoleCodeFromProfile(profile as any);
            req.user = {
              ...(profile as any),
              role_code: roleCode,
            };
            next();
            return;
          }
        }
      }
    }

    // 2. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Authentication required. Please sign in to access this workspace.',
        code: 'UNAUTHORIZED',
        status: 401,
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    // Check signed session token if sent in Bearer header
    const bearerSession = verifySignedSessionCookieValue(token);
    if (bearerSession) {
      const matched = findDemoProfileByEmailOrId(bearerSession.email);
      if (matched) {
        req.user = matched;
        next();
        return;
      }
    }

    // Check configured institutional identity tokens
    const workspacesEnabled = process.env.ENABLE_ROLE_WORKSPACES !== 'false';
    if (token in DEMO_PROFILES && workspacesEnabled) {
      req.user = DEMO_PROFILES[token];
      next();
      return;
    }

    if (!isSupabaseConfigured()) {
      res.status(401).json({
        error: 'Invalid or expired authentication session.',
        code: 'UNAUTHORIZED',
        status: 401,
      });
      return;
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({
        error: 'Invalid or expired authentication token.',
        code: 'UNAUTHORIZED',
        status: 401,
      });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, public_key_hex')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(403).json({
        error: 'Institutional profile record not found for this account.',
        code: 'FORBIDDEN',
        status: 403,
      });
      return;
    }

    const matchedDev = findDemoProfileByEmailOrId(profile.email);
    req.user = {
      ...(profile as AuthenticatedUser),
      role_code:
        matchedDev?.role_code || resolveRoleCodeFromProfile(profile as any),
      designation: matchedDev?.designation,
      department: matchedDev?.department,
      registration_id: matchedDev?.registration_id,
    };
    next();
  } catch {
    res.status(500).json({
      error: 'An error occurred while verifying authentication status.',
      code: 'AUTH_VERIFICATION_ERROR',
      status: 500,
    });
  }
}

/**
 * Middleware factory restricting an endpoint to specific base roles ('admin' | 'approver' | 'student').
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
        status: 401,
      });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Your institutional role (${req.user.role_code}) is not authorized for this operation.`,
        code: 'FORBIDDEN',
        status: 403,
      });
      return;
    }
    next();
  };
}

/**
 * Middleware factory restricting an endpoint to exact institutional role codes
 * ('ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT').
 */
export function requireRoleCode(...allowedCodes: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
        status: 401,
      });
      return;
    }
    if (!allowedCodes.includes(req.user.role_code)) {
      res.status(403).json({
        error: `Access denied. Required authorization: ${allowedCodes.join(' or ')}. Active role: ${req.user.role_code}.`,
        code: 'FORBIDDEN',
        status: 403,
      });
      return;
    }
    next();
  };
}
