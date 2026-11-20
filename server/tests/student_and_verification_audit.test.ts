import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_VERIFY_HOST,
  buildPublicVerifyUrl,
} from '../../client/src/lib/verificationUrl.js';
import { buildMerkleTree } from '../src/crypto/merkle.js';
import { computeLeafHash } from '../src/crypto/hash.js';
import { normalizeResultSnapshot } from '../src/crypto/canonical.js';
import {
  signPublicationManifest,
  verifyPublicationManifest,
} from '../src/crypto/signatures.js';
import { env } from '../src/config/env.js';

describe('MarkSure Production Audit & Verification Integrity Suite', () => {
  it('QR Code URLs strictly target the canonical public verification route', () => {
    const mockResultId = 'b1e2a3c4-1111-2222-3333-444455556666';
    const mockLeafHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const mockVersion = 1;

    const qrUrl = buildPublicVerifyUrl(mockResultId, {
      v: mockVersion,
      leaf: mockLeafHash,
    });

    // 1. Must use canonical production host
    expect(qrUrl.startsWith(CANONICAL_PUBLIC_VERIFY_HOST)).toBe(true);

    // 2. Must target /verify/{resultId}
    expect(qrUrl).toContain(`/verify/${mockResultId}`);

    // 3. Must NEVER target localhost, marksheet, or protected routes
    expect(qrUrl).not.toContain('localhost');
    expect(qrUrl).not.toContain('/marksheet');
    expect(qrUrl).not.toContain('/registry');
    expect(qrUrl).not.toContain('/admin');

    // 4. Must preserve leaf commitment and version query parameters
    expect(qrUrl).toContain(`v=${mockVersion}`);
    expect(qrUrl).toContain(`leaf=${mockLeafHash}`);

    // 5. Must NOT contain private keys or bearer tokens
    expect(qrUrl).not.toContain('Bearer');
    expect(qrUrl).not.toContain('token');
    expect(qrUrl).not.toContain('key');
  });

  it('Merkle proof inclusion and institutional Ed25519 signature validate end-to-end', () => {
    const studentSnapshot = normalizeResultSnapshot({
      student_roll_number: 'REG-2026-CSE-001',
      student_full_name: 'Harnoor Singh',
      academic_term: '2026-27-SEM1',
      version: 1,
      subjects: [
        { code: 'CSE101', name: 'Data Structures and Algorithms', marks: 88, max_marks: 100 },
        { code: 'CSE102', name: 'Computer System Architecture', marks: 82, max_marks: 100 },
        { code: 'CSE103', name: 'Discrete Mathematics', marks: 91, max_marks: 100 },
        { code: 'CSE104', name: 'Database Management Systems', marks: 85, max_marks: 100 },
      ],
    });

    const leafHash = computeLeafHash(studentSnapshot);
    expect(leafHash).toHaveLength(64);

    const tree = buildMerkleTree([leafHash]);
    expect(tree.merkleRoot).toHaveLength(64);
    expect(tree.merkleRoot).toBe(leafHash); // Single-leaf tree root equals leaf

    // Sign manifest with institutional private key
    const manifest = {
      institution_id: env.institutionId,
      academic_term: '2026-27-SEM1',
      merkle_root: tree.merkleRoot,
      record_count: 1,
      published_at: new Date().toISOString(),
    };

    const signature = signPublicationManifest(manifest, env.institutionPrivateKeyHex);
    expect(signature).toHaveLength(128);

    const isValid = verifyPublicationManifest(manifest, signature, env.institutionPublicKeyHex);
    expect(isValid).toBe(true);
  });

  it('rejects tampered manifest payloads against institutional signature', () => {
    const manifest = {
      institution_id: env.institutionId,
      academic_term: '2026-27-SEM1',
      merkle_root: 'a'.repeat(64),
      record_count: 10,
      published_at: '2026-11-20T00:00:00.000Z',
    };

    const signature = signPublicationManifest(manifest, env.institutionPrivateKeyHex);

    // Tamper with record count
    const tamperedManifest = {
      ...manifest,
      record_count: 99,
    };

    const isValid = verifyPublicationManifest(
      tamperedManifest,
      signature,
      env.institutionPublicKeyHex
    );
    expect(isValid).toBe(false);
  });
});
