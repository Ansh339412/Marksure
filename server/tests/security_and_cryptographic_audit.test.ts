import { describe, expect, it } from 'vitest';
import {
  CorrectionApprovalPayload,
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
} from '../src/crypto/canonical.js';
import { computeLeafHash, computeLedgerEventHash } from '../src/crypto/hash.js';
import { buildMerkleTree, verifyMerkleProof } from '../src/crypto/merkle.js';
import {
  computeCorrectionPayloadHash,
  generateEd25519KeyPair,
  signCorrectionApproval,
  signPublicationManifest,
  verifyPublicationManifest,
} from '../src/crypto/signatures.js';
import { verifyResultRecord, VerifyResultInput } from '../src/crypto/verifyResult.js';
import { validateCorrectionApprovalPure } from '../src/services/correctionService.js';

function createVerificationFixture(): {
  input: VerifyResultInput;
  instKey: ReturnType<typeof generateEd25519KeyPair>;
  approver1: ReturnType<typeof generateEd25519KeyPair>;
  approver2: ReturnType<typeof generateEd25519KeyPair>;
} {
  const instKey = generateEd25519KeyPair();
  const approver1 = generateEd25519KeyPair();
  const approver2 = generateEd25519KeyPair();

  const snapshotV1: ResultSnapshotPayload = normalizeResultSnapshot({
    result_id: '11111111-1111-1111-1111-111111111111',
    student_id: '00000000-0000-0000-0000-000000000101',
    roll_number: 'BT2024001',
    academic_term: '2026-SEM5',
    version: 1,
    subjects: [
      { code: 'CS301', name: 'Data Structures & Algorithms', marks: 82, max_marks: 100 },
      { code: 'CS302', name: 'Operating Systems', marks: 88, max_marks: 100 },
    ],
  });

  const leafHashV1 = computeLeafHash(snapshotV1);
  const dummyLeaf2 = computeLeafHash({
    result_id: '22222222-2222-2222-2222-222222222222',
    student_id: '00000000-0000-0000-0000-000000000102',
    roll_number: 'BT2024002',
    academic_term: '2026-SEM5',
    version: 1,
    subjects: [
      { code: 'CS301', name: 'Data Structures & Algorithms', marks: 75, max_marks: 100 },
    ],
  });

  const tree = buildMerkleTree([leafHashV1, dummyLeaf2]);

  const manifest: PublicationManifestPayload = {
    batch_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    institution_id: 'MARKSURE-UNIV-01',
    academic_term: '2026-SEM5',
    merkle_root: tree.merkleRoot,
    record_count: 2,
    published_at: '2026-11-20T18:00:00.000Z',
  };

  const signature = signPublicationManifest(manifest, instKey.privateKeyHex);

  const input: VerifyResultInput = {
    currentResult: {
      id: snapshotV1.result_id,
      student_id: snapshotV1.student_id,
      academic_term: snapshotV1.academic_term,
      subjects_json: structuredClone(snapshotV1.subjects),
      current_version: 1,
      status: 'published',
    },
    latestVersion: {
      version: 1,
      snapshot_json: structuredClone(snapshotV1),
      leaf_hash: leafHashV1,
    },
    originalVersion: {
      version: 1,
      snapshot_json: structuredClone(snapshotV1),
      leaf_hash: leafHashV1,
    },
    merkleProof: {
      leaf_index: 0,
      leaf_hash: leafHashV1,
      proof_json: structuredClone(tree.proofs[0]),
    },
    batch: {
      id: manifest.batch_id,
      merkle_root: tree.merkleRoot,
      manifest_json: manifest,
      institution_signature: signature,
      institution_public_key: instKey.publicKeyHex,
      published_at: manifest.published_at,
    },
    trustedInstitutionPublicKeyHex: instKey.publicKeyHex,
  };

  return { input, instKey, approver1, approver2 };
}

describe('MarkSure Senior Engineering Comprehensive Audit Test Suite', () => {
  // Scenario 1: Valid result record verification
  it('Scenario 1: returns VERIFIED and validates Merkle root & signature for untampered records', () => {
    const { input } = createVerificationFixture();
    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('VERIFIED');
    expect(report.signature_valid).toBe(true);
    expect(report.merkle_proof_valid).toBe(true);
    expect(report.snapshot_hash_valid).toBe(true);
    expect(report.direct_db_tampering_detected).toBe(false);
    expect(report.tampered_fields).toHaveLength(0);
  });

  // Scenario 2: Altered marks detected as TAMPERED
  it('Scenario 2: detects altered marks as TAMPERED with exact diff', () => {
    const { input } = createVerificationFixture();
    input.currentResult.subjects_json[0].marks = 99; // Attacker bumped from 82 to 99

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('TAMPERED');
    expect(report.direct_db_tampering_detected).toBe(true);
    expect(report.tampered_fields.some((d) => d.subject_code === 'CS301')).toBe(true);
  });

  // Scenario 3: Altered student ID detected as TAMPERED
  it('Scenario 3: detects altered student ID as TAMPERED', () => {
    const { input } = createVerificationFixture();
    input.currentResult.student_id = '00000000-0000-0000-0000-999999999999';

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('TAMPERED');
    expect(report.direct_db_tampering_detected).toBe(true);
    expect(report.summary_message).toContain('student_id mismatch');
  });

  // Scenario 4: Altered subject code detected as TAMPERED
  it('Scenario 4: detects altered subject code as TAMPERED', () => {
    const { input } = createVerificationFixture();
    input.currentResult.subjects_json[0].code = 'CS999';

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('TAMPERED');
    expect(report.direct_db_tampering_detected).toBe(true);
    expect(report.tampered_fields.length).toBeGreaterThan(0);
  });

  // Scenario 5: Invalid Merkle proof detected as TAMPERED
  it('Scenario 5: detects corrupted Merkle proof path as TAMPERED', () => {
    const { input } = createVerificationFixture();
    // Tamper with the proof sibling hash
    input.merkleProof.proof_json[0].hash = 'f'.repeat(64);

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('TAMPERED');
    expect(report.merkle_proof_valid).toBe(false);
  });

  // Scenario 6: Wrong institutional public key detected as INVALID_SIGNATURE
  it('Scenario 6: detects wrong institutional public key as INVALID_SIGNATURE', () => {
    const { input } = createVerificationFixture();
    const rogueKey = generateEd25519KeyPair();
    input.trustedInstitutionPublicKeyHex = rogueKey.publicKeyHex;

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('INVALID_SIGNATURE');
    expect(report.signature_valid).toBe(false);
  });

  // Scenario 7: Altered publication manifest detected as INVALID_SIGNATURE
  it('Scenario 7: detects altered publication manifest record_count as INVALID_SIGNATURE', () => {
    const { input } = createVerificationFixture();
    // Manifest was tampered with after signing
    (input.batch.manifest_json as any).record_count = 999;

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('INVALID_SIGNATURE');
    expect(report.signature_valid).toBe(false);
  });

  // Scenario 8: Invalid Ed25519 signature bytes
  it('Scenario 8: rejects corrupted Ed25519 signature bytes with safe boolean false', () => {
    const { input, instKey } = createVerificationFixture();
    const manifest = input.batch.manifest_json as PublicationManifestPayload;
    // Corrupt signature bytes
    const corruptSig = '00'.repeat(64);
    const isValid = verifyPublicationManifest(manifest, corruptSig, instKey.publicKeyHex);
    expect(isValid).toBe(false);

    // Malformed hex length
    const malformedHex = 'abc';
    const isMalformedValid = verifyPublicationManifest(manifest, malformedHex, instKey.publicKeyHex);
    expect(isMalformedValid).toBe(false);
  });

  // Scenario 9: Incorrect correction signature
  it('Scenario 9: rejects correction payload with signature from unregistered key', () => {
    const approverKey = generateEd25519KeyPair();
    const attackerKey = generateEd25519KeyPair();

    const payload: CorrectionApprovalPayload = {
      correction_request_id: '10000000-0000-0000-0000-000000000001',
      result_id: '20000000-0000-0000-0000-000000000002',
      from_version: 1,
      subject_code: 'CS301',
      old_marks: 70,
      new_marks: 85,
      reason: 'Re-evaluation mark addition',
    };

    const payloadHash = computeCorrectionPayloadHash(payload);
    const forgedSig = signCorrectionApproval(payload, attackerKey.privateKeyHex);

    const check = validateCorrectionApprovalPure({
      payload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-1',
      approverPublicKeyHex: approverKey.publicKeyHex, // registered key doesn't match attacker's signature
      signatureHex: forgedSig,
      existingApprovals: [],
    });

    expect(check.valid).toBe(false);
    expect(check.error).toContain('INVALID ED25519 SIGNATURE');
  });

  // Scenario 10: Duplicate approver rejection
  it('Scenario 10: rejects the same approver signing twice on the same request', () => {
    const approverKey = generateEd25519KeyPair();
    const payload: CorrectionApprovalPayload = {
      correction_request_id: '10000000-0000-0000-0000-000000000001',
      result_id: '20000000-0000-0000-0000-000000000002',
      from_version: 1,
      subject_code: 'CS301',
      old_marks: 70,
      new_marks: 85,
      reason: 'Re-evaluation mark addition',
    };
    const payloadHash = computeCorrectionPayloadHash(payload);
    const sig = signCorrectionApproval(payload, approverKey.privateKeyHex);

    const check = validateCorrectionApprovalPure({
      payload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-1',
      approverPublicKeyHex: approverKey.publicKeyHex,
      signatureHex: sig,
      existingApprovals: [
        {
          approver_id: 'approver-1',
          approver_public_key: approverKey.publicKeyHex,
          signature_hex: sig,
          signed_payload_hash: payloadHash,
        },
      ],
    });

    expect(check.valid).toBe(false);
    expect(check.error).toContain('DUPLICATE APPROVER REJECTED');
  });

  // Scenario 11: Odd number of Merkle leaves (e.g. 3, 5, 7)
  it('Scenario 11: computes valid proofs for odd number of leaves (3, 5, 7)', () => {
    for (const count of [3, 5, 7]) {
      const leaves = Array.from({ length: count }, (_, i) =>
        computeLeafHash({
          result_id: `res-${i}`,
          student_id: `stu-${i}`,
          roll_number: `ROLL-${i}`,
          academic_term: '2026-SEM1',
          version: 1,
          subjects: [{ code: 'CS101', name: 'Intro', marks: 80, max_marks: 100 }],
        })
      );

      const tree = buildMerkleTree(leaves);
      expect(tree.merkleRoot).toBeDefined();
      expect(tree.proofs).toHaveLength(count);

      // Verify every leaf proof independently
      for (let i = 0; i < count; i++) {
        const valid = verifyMerkleProof(leaves[i], tree.proofs[i], tree.merkleRoot);
        expect(valid).toBe(true);
      }
    }
  });

  // Scenario 12: Single-leaf Merkle tree
  it('Scenario 12: supports single-leaf Merkle tree where root equals leaf hash', () => {
    const leaf = 'e'.repeat(64);
    const tree = buildMerkleTree([leaf]);
    expect(tree.merkleRoot).toBe(leaf);
    expect(tree.proofs[0]).toEqual([]);
    expect(verifyMerkleProof(leaf, tree.proofs[0], tree.merkleRoot)).toBe(true);
  });

  // Scenario 13: Empty Merkle tree handling throws controlled error
  it('Scenario 13: handles empty Merkle leaf list safely without crash', () => {
    expect(() => buildMerkleTree([])).toThrow('Cannot build a Merkle tree with zero leaves.');
  });

  // Scenario 14: Hash-linked audit ledger monotonic integrity
  it('Scenario 14: verifies monotonic SHA-256 ledger chaining prevents history tampering', () => {
    const genesisHash = '0'.repeat(64);

    const event1Payload = {
      event_type: 'BATCH_PUBLISHED',
      entity_type: 'publication_batches',
      entity_id: 'batch-001',
      actor_id: 'admin-001',
      actor_role: 'admin',
      payload_json: { batch_name: 'Semester 1' },
      timestamp: '2026-11-20T10:00:00.000Z',
    };

    const event1Hash = computeLedgerEventHash(genesisHash, event1Payload);

    const event2Payload = {
      event_type: 'CORRECTION_REQUESTED',
      entity_type: 'correction_requests',
      entity_id: 'req-001',
      actor_id: 'admin-001',
      actor_role: 'admin',
      payload_json: { reason: 'Section B error' },
      timestamp: '2026-11-20T11:00:00.000Z',
    };

    const event2Hash = computeLedgerEventHash(event1Hash, event2Payload);

    // If attacker alters event 1 payload, event 1 hash changes and breaks the chain
    const tamperedEvent1Payload = {
      ...event1Payload,
      payload_json: { batch_name: 'Tampered Name' },
    };

    const tamperedEvent1Hash = computeLedgerEventHash(genesisHash, tamperedEvent1Payload);

    expect(tamperedEvent1Hash).not.toBe(event1Hash);
    expect(event2Hash).not.toBe(computeLedgerEventHash(tamperedEvent1Hash, event2Payload));
  });
});
