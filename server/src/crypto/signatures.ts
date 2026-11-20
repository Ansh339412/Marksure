import crypto from 'node:crypto';
import * as ed from '@noble/ed25519';
import {
  canonicalize,
  CorrectionApprovalPayload,
  PublicationManifestPayload,
} from './canonical.js';
import { sha256Hex } from './hash.js';

// Configure @noble/ed25519 to use Node's built-in SHA-512 for synchronous operations
ed.etc.sha512Sync = (...messages: Uint8Array[]) => {
  const hash = crypto.createHash('sha512');
  for (const msg of messages) {
    hash.update(msg);
  }
  return new Uint8Array(hash.digest());
};

export interface Ed25519KeyPair {
  privateKeyHex: string; // 64 hex chars (32 bytes)
  publicKeyHex: string;  // 64 hex chars (32 bytes)
}

/**
 * Generates a fresh Ed25519 keypair in 64-character lowercase hex format.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privBytes = ed.utils.randomPrivateKey();
  const pubBytes = ed.getPublicKey(privBytes);
  return {
    privateKeyHex: Buffer.from(privBytes).toString('hex'),
    publicKeyHex: Buffer.from(pubBytes).toString('hex'),
  };
}

/**
 * Derives the 64-char hex Ed25519 public key from a 64-char hex private key.
 */
export function getPublicKeyFromPrivateHex(privateKeyHex: string): string {
  const pubBytes = ed.getPublicKey(privateKeyHex);
  return Buffer.from(pubBytes).toString('hex');
}

/**
 * Signs an arbitrary UTF-8 string message using a 64-char hex Ed25519 private key.
 * Returns a 128-char hex signature.
 */
export function signMessageHex(message: string, privateKeyHex: string): string {
  const msgBytes = Buffer.from(message, 'utf8');
  const sigBytes = ed.sign(msgBytes, privateKeyHex);
  return Buffer.from(sigBytes).toString('hex');
}

/**
 * Verifies a 128-char hex Ed25519 signature against a UTF-8 message and 64-char hex public key.
 */
export function verifyMessageHex(
  message: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    if (
      typeof signatureHex !== 'string' ||
      signatureHex.length !== 128 ||
      typeof publicKeyHex !== 'string' ||
      publicKeyHex.length !== 64
    ) {
      return false;
    }
    const msgBytes = Buffer.from(message, 'utf8');
    return ed.verify(signatureHex, msgBytes, publicKeyHex);
  } catch {
    return false;
  }
}

/**
 * Formats and signs an institutional publication manifest:
 * Message = "MARKSURE_MANIFEST_V1:" + canonicalJson(manifest)
 */
export function signPublicationManifest(
  manifest: PublicationManifestPayload,
  institutionPrivateKeyHex: string
): string {
  const message = `MARKSURE_MANIFEST_V1:${canonicalize(manifest)}`;
  return signMessageHex(message, institutionPrivateKeyHex);
}

/**
 * Verifies an institutional publication manifest signature against a trusted public key.
 */
export function verifyPublicationManifest(
  manifest: PublicationManifestPayload,
  signatureHex: string,
  institutionPublicKeyHex: string
): boolean {
  const message = `MARKSURE_MANIFEST_V1:${canonicalize(manifest)}`;
  return verifyMessageHex(message, signatureHex, institutionPublicKeyHex);
}

/**
 * Builds the exact domain-separated message string that approvers sign for a correction request.
 */
export function formatCorrectionSigningMessage(payload: CorrectionApprovalPayload): string {
  return `MARKSURE_CORRECTION_V1:${canonicalize(payload)}`;
}

/**
 * Computes SHA-256 hex digest of the canonical correction payload.
 */
export function computeCorrectionPayloadHash(payload: CorrectionApprovalPayload): string {
  return sha256Hex(formatCorrectionSigningMessage(payload));
}

/**
 * Signs a correction approval payload (used in unit tests and client-side signing parity).
 */
export function signCorrectionApproval(
  payload: CorrectionApprovalPayload,
  approverPrivateKeyHex: string
): string {
  const message = formatCorrectionSigningMessage(payload);
  return signMessageHex(message, approverPrivateKeyHex);
}

/**
 * Verifies an approver's Ed25519 signature on a canonical correction payload.
 */
export function verifyCorrectionApproval(
  payload: CorrectionApprovalPayload,
  signatureHex: string,
  approverPublicKeyHex: string
): boolean {
  const message = formatCorrectionSigningMessage(payload);
  return verifyMessageHex(message, signatureHex, approverPublicKeyHex);
}
