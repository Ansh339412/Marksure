import crypto from 'node:crypto';
import { canonicalize, normalizeResultSnapshot, ResultSnapshotPayload } from './canonical.js';

/**
 * Computes lowercase 64-character SHA-256 hex digest of a UTF-8 string.
 */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Computes domain-separated leaf hash for a canonical result snapshot:
 * SHA256("MARKSURE_LEAF_V1:" + canonicalJson)
 */
export function computeLeafHash(snapshot: ResultSnapshotPayload): string {
  const normalized = normalizeResultSnapshot(snapshot);
  const canonicalJson = canonicalize(normalized);
  return sha256Hex(`MARKSURE_LEAF_V1:${canonicalJson}`);
}

/**
 * Computes domain-separated Merkle parent node hash:
 * SHA256("MARKSURE_NODE_V1:" + leftHex + ":" + rightHex)
 */
export function computeParentHash(leftHex: string, rightHex: string): string {
  return sha256Hex(`MARKSURE_NODE_V1:${leftHex.toLowerCase()}:${rightHex.toLowerCase()}`);
}

/**
 * Computes hash-chain digest for an append-only ledger event:
 * SHA256("MARKSURE_LEDGER_V1:" + prevHash + ":" + canonicalPayload)
 */
export function computeLedgerEventHash(prevEventHash: string, eventPayload: unknown): string {
  return sha256Hex(`MARKSURE_LEDGER_V1:${prevEventHash}:${canonicalize(eventPayload)}`);
}
