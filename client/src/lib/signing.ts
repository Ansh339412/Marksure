import * as ed from '@noble/ed25519';
import { apiFetch } from './api';

export interface CorrectionApprovalPayload {
  correction_request_id: string;
  result_id: string;
  from_version: number;
  subject_code: string;
  old_marks: number;
  new_marks: number;
  reason: string;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedObj: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        sortedObj[key] = sortKeysDeep(record[key]);
      }
    }
    return sortedObj;
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function formatCorrectionSigningMessage(payload: CorrectionApprovalPayload): string {
  return `MARKSURE_CORRECTION_V1:${canonicalize(payload)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Signs a canonical correction approval payload client-side using the approver's
 * 64-character hex Ed25519 private key. Returns a 128-character hex signature.
 */
export async function signCorrectionPayloadClientSide(
  payload: CorrectionApprovalPayload,
  approverPrivateKeyHex: string
): Promise<string> {
  const cleanPrivKey = approverPrivateKeyHex.trim().toLowerCase();
  if (!HEX_64_REGEX.test(cleanPrivKey)) {
    throw new Error(
      'Invalid signing key format. An Ed25519 private key must be a 64-character hexadecimal string.'
    );
  }
  const message = formatCorrectionSigningMessage(payload);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await ed.signAsync(msgBytes, cleanPrivKey);
  return bytesToHex(sigBytes);
}

/**
 * Derives the 64-character hex public key from a 64-character hex private key in the browser.
 */
export async function getPublicKeyHexClientSide(privateKeyHex: string): Promise<string> {
  const cleanPrivKey = privateKeyHex.trim().toLowerCase();
  if (!HEX_64_REGEX.test(cleanPrivKey)) {
    throw new Error('Ed25519 private key must be a 64-character hexadecimal string.');
  }
  const pubBytes = await ed.getPublicKeyAsync(cleanPrivKey);
  return bytesToHex(pubBytes);
}

/**
 * Retrieves the authenticated approver's development test signing key from the
 * protected non-production server endpoint (never hardcoded in frontend bundles).
 */
export async function fetchAuthorizedDevSigningKey(): Promise<{
  role_code: string;
  public_key_hex: string;
  private_key_hex: string;
}> {
  return apiFetch('/api/auth/dev-signing-key');
}
