/**
 * MarkSure Public Verification URL Utility
 *
 * Guarantees all generated QR codes and public share links point strictly
 * to the canonical public verification gateway (e.g. https://client-anshpreet.vercel.app/verify/{resultId})
 * and NEVER to localhost, private/protected admin routes, marksheet views, or preview URLs.
 */

export const CANONICAL_PUBLIC_VERIFY_HOST = 'https://client-anshpreet.vercel.app';

export const PUBLIC_VERIFY_BASE_URL: string = (() => {
  const envUrl = (import.meta.env.VITE_PUBLIC_VERIFY_BASE_URL as string | undefined)?.trim();
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl.replace(/\/$/, '');
  }
  // If running in production or preview on Vercel, enforce canonical public verifier or current origin if valid
  if (import.meta.env.PROD) {
    return CANONICAL_PUBLIC_VERIFY_HOST;
  }
  // In development, default to canonical production verifier for QR codes so physical mobile scans
  // resolve to the live deployed verifier rather than an unreachable localhost IP.
  return CANONICAL_PUBLIC_VERIFY_HOST;
})();

export interface PublicVerifyParams {
  v?: number | string;
  leaf?: string;
}

/**
 * Constructs a fully qualified public verification URL for QR codes and deep links.
 * Example: https://client-anshpreet.vercel.app/verify/b1e2a3c4-...?v=1&leaf=e3b0c44...
 */
export function buildPublicVerifyUrl(
  resultId: string,
  params?: PublicVerifyParams
): string {
  const cleanId = String(resultId || '').trim();
  const search = new URLSearchParams();

  if (params?.v !== undefined && params.v !== null && params.v !== '') {
    search.set('v', String(params.v));
  }
  if (params?.leaf) {
    search.set('leaf', String(params.leaf).trim());
  }

  const queryStr = search.toString();
  return `${CANONICAL_PUBLIC_VERIFY_HOST}/verify/${cleanId}${queryStr ? `?${queryStr}` : ''}`;
}

/**
 * Returns the in-app relative path for client-side React Router navigation.
 */
export function buildRelativeVerifyPath(
  resultId: string,
  params?: PublicVerifyParams
): string {
  const cleanId = String(resultId || '').trim();
  const search = new URLSearchParams();

  if (params?.v !== undefined && params.v !== null && params.v !== '') {
    search.set('v', String(params.v));
  }
  if (params?.leaf) {
    search.set('leaf', String(params.leaf).trim());
  }

  const queryStr = search.toString();
  return `/verify/${cleanId}${queryStr ? `?${queryStr}` : ''}`;
}
