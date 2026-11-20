import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export const SESSION_COOKIE_NAME = 'marksure_sid';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours short-lived session

// Derive an HMAC signing secret from the server's private key configuration
const SESSION_HMAC_SECRET = crypto
  .createHash('sha256')
  .update(`MARKSURE_SESSION_KEY_V1:${env.institutionPrivateKeyHex}`)
  .digest();

export interface SessionPayload {
  sub: string;
  email: string;
  role_code: 'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT';
  iat: number;
  exp: number;
  jti: string;
}

// Track invalidated session IDs on logout
const revokedSessionJtis = new Set<string>();

export function createSignedSessionCookieValue(params: {
  userId: string;
  email: string;
  roleCode: 'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT';
}): string {
  const now = Date.now();
  const payload: SessionPayload = {
    sub: params.userId,
    email: params.email,
    role_code: params.roleCode,
    iat: now,
    exp: now + SESSION_TTL_MS,
    jti: crypto.randomUUID(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${mac}`;
}

export function verifySignedSessionCookieValue(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, mac] = parts;

    const expectedMac = crypto
      .createHmac('sha256', SESSION_HMAC_SECRET)
      .update(payloadB64)
      .digest('base64url');

    const macBuf = Buffer.from(mac);
    const expBuf = Buffer.from(expectedMac);
    if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionPayload;

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    if (revokedSessionJtis.has(payload.jti)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string): void {
  const payload = verifySignedSessionCookieValue(token);
  if (payload?.jti) {
    revokedSessionJtis.add(payload.jti);
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function setHttpOnlySessionCookie(res: Response, cookieValue: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearHttpOnlySessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

/**
 * Sets defensive HTTP security headers (Clickjacking, MIME sniffing, XSS, Referrer, CSP).
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), payment=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none'; base-uri 'self'"
  );
  next();
}

/**
 * Enforces application/json on state-changing requests with a body (HTTP 415 on unsupported media type).
 */
export function enforceJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > 0) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        res.status(415).json({
          error:
            'Unsupported Media Type: Request body must be encoded as application/json.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
          status: 415,
        });
        return;
      }
    }
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

/**
 * Sliding-window rate limiter factory (returns HTTP 429 Too Many Requests when exceeded).
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const ip = req.ip || req.socket?.remoteAddress || 'local';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);

    if (!existing || now > existing.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error:
          options.message ||
          `Too many requests. Please wait ${retryAfterSec} seconds before retrying.`,
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
        retry_after_seconds: retryAfterSec,
      });
      return;
    }

    next();
  };
}

/**
 * Centralized Express Error Handling Middleware.
 * Never leaks stack traces, database credentials, or internal paths to clients.
 */
export function globalErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const referenceId = `MS-ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  if (err?.type === 'entity.too.large' || err?.status === 413) {
    res.status(413).json({
      error: 'Payload Too Large: Request body exceeds the 512 KB institutional limit.',
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      reference_id: referenceId,
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Bad Request: Malformed JSON payload.',
      code: 'MALFORMED_JSON',
      status: 400,
      reference_id: referenceId,
    });
    return;
  }

  const status = Number(err?.statusCode || err?.status || 500);
  const safeMessage =
    status >= 500
      ? 'An internal server error occurred while processing your request.'
      : err?.message || 'Request could not be processed.';

  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[MarkSure Error ${referenceId}]`, err);
  }

  res.status(status).json({
    error: safeMessage,
    code: err?.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    status,
    reference_id: referenceId,
  });
}
