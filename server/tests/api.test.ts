import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '../src/config/env.js';
import {
  DEMO_PROFILES,
  requireAuth,
  requireRole,
  requireRoleCode,
} from '../src/middleware/auth.js';
import {
  createSignedSessionCookieValue,
  enforceJsonContentType,
  globalErrorHandler,
  revokeSessionToken,
  securityHeaders,
  SESSION_COOKIE_NAME,
  verifySignedSessionCookieValue,
} from '../src/middleware/security.js';

function createMockRes() {
  const headers: Record<string, string> = {};
  const res: Partial<Response> & {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
  } = {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name: string, value: any) {
      headers[name.toLowerCase()] = String(value);
      return this as Response;
    },
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(payload: unknown) {
      this.body = payload;
      return this as Response;
    },
  };
  return res;
}

describe('MarkSure Authentication, RBAC & Web Security Hardening Suite', () => {
  it('exposes valid 64-char hex Institution Ed25519 public key in env config', () => {
    expect(env.institutionId).toBe('MARKSURE-UNIV-01');
    expect(env.institutionPublicKeyHex).toHaveLength(64);
  });

  it('rejects unauthenticated requests with HTTP 401', async () => {
    const req = { headers: {} } as Request;
    const res = createMockRes();
    let nextCalled = false;

    await requireAuth(req, res as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('authenticates via signed HttpOnly session cookie and revokes session on logout', async () => {
    const cookieToken = createSignedSessionCookieValue({
      userId: DEMO_PROFILES['demo-approver-1'].id,
      email: DEMO_PROFILES['demo-approver-1'].email,
      roleCode: 'APPROVER_1',
    });

    expect(verifySignedSessionCookieValue(cookieToken)?.role_code).toBe('APPROVER_1');

    const req = {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieToken)}`,
      },
    } as Request;
    const res = createMockRes();
    let nextCalled = false;

    await requireAuth(req, res as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.role_code).toBe('APPROVER_1');
    expect(req.user?.full_name).toBe('Dr. Meera Kapoor');

    // Revoke session token and verify subsequent verification fails
    revokeSessionToken(cookieToken);
    expect(verifySignedSessionCookieValue(cookieToken)).toBeNull();
  });

  it('enforces granular RBAC across ADMIN, APPROVER_1, APPROVER_2, and STUDENT', async () => {
    const req = {
      headers: { authorization: 'Bearer demo-approver-2' },
    } as Request;
    const res = createMockRes();

    await requireAuth(req, res as Response, () => {});
    expect(req.user?.role_code).toBe('APPROVER_2');
    expect(req.user?.full_name).toBe('Dr. Karan Bedi');

    // APPROVER_2 passes requireRoleCode('APPROVER_1', 'APPROVER_2')
    let allowed = false;
    requireRoleCode('APPROVER_1', 'APPROVER_2')(req, res as Response, () => {
      allowed = true;
    });
    expect(allowed).toBe(true);

    // APPROVER_2 is blocked (403) from ADMIN-only endpoints
    let adminAllowed = false;
    requireRole('admin')(req, res as Response, () => {
      adminAllowed = true;
    });
    expect(adminAllowed).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('applies defensive HTTP security headers and rejects non-JSON bodies with HTTP 415', () => {
    const req = {
      method: 'POST',
      headers: { 'content-length': '42', 'content-type': 'text/plain' },
    } as unknown as Request;
    const res = createMockRes();

    securityHeaders(req, res as Response, () => {});
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    let nextCalled = false;
    enforceJsonContentType(req, res as Response, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
  });

  it('sanitizes 500 internal server errors without leaking stack traces or database secrets', () => {
    const req = {} as Request;
    const res = createMockRes();
    const internalErr = new Error(
      'FATAL: password authentication failed for user postgres at 10.0.0.1'
    );

    globalErrorHandler(internalErr, req, res as Response, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe(
      'An internal server error occurred while processing your request.'
    );
    expect(res.body.error).not.toContain('postgres');
    expect(res.body.reference_id).toMatch(/^MS-ERR-[0-9A-F]{8}$/);
  });
});
