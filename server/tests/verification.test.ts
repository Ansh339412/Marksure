import { describe, expect, it } from 'vitest';
import {
  CorrectionApprovalPayload,
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
} from '../src/crypto/canonical.js';
import { computeLeafHash } from '../src/crypto/hash.js';
import { buildMerkleTree } from '../src/crypto/merkle.js';
import {
  generateEd25519KeyPair,
  signCorrectionApproval,
  signPublicationManifest,
} from '../src/crypto/signatures.js';
import { verifyResultRecord, VerifyResultInput } from '../src/crypto/verifyResult.js';

function createBaseVerificationFixture(): {
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
      { code: 'CS301', name: 'Data Structures & Algorithms', marks: 78, max_marks: 100 },
      { code: 'CS302', name: 'Operating Systems', marks: 84, max_marks: 100 },
      { code: 'CS303', name: 'Cryptography & Network Security', marks: 91, max_marks: 100 },
    ],
  });

  const otherStudentLeaf = 'a'.repeat(64);
  const leafHashV1 = computeLeafHash(snapshotV1);
  const tree = buildMerkleTree([leafHashV1, otherStudentLeaf]);

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
      proof_json: tree.proofs[0],
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

describe('MarkSure Verification & Direct SQL Tampering Detection Engine', () => {
  it('returns VERIFIED when live database marks match the signed Merkle snapshot', () => {
    const { input } = createBaseVerificationFixture();
    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('VERIFIED');
    expect(report.signature_valid).toBe(true);
    expect(report.merkle_proof_valid).toBe(true);
    expect(report.direct_db_tampering_detected).toBe(false);
    expect(report.tampered_fields).toHaveLength(0);
  });

  it('detects direct SQL modification of a student mark, pinpoints the exact changed subject, and proves the original signature is still valid', () => {
    const { input } = createBaseVerificationFixture();

    // Simulate attacker running UPDATE results SET subjects_json = ... in Supabase SQL Editor
    // changing CS301 marks from 78 to 95
    input.currentResult.subjects_json[0].marks = 95;

    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('TAMPERED');
    expect(report.direct_db_tampering_detected).toBe(true);
    // Original publication signature & Merkle proof remain cryptographically valid!
    expect(report.signature_valid).toBe(true);
    expect(report.merkle_proof_valid).toBe(true);

    expect(report.tampered_fields).toHaveLength(1);
    expect(report.tampered_fields[0].subject_code).toBe('CS301');
    expect(report.tampered_fields[0].verified_snapshot_marks).toBe(78);
    expect(report.tampered_fields[0].current_db_marks).toBe(95);
  });

  it('detects tampering if an attacker modifies the stored snapshot in result_versions', () => {
    const { input } = createBaseVerificationFixture();

    // Attacker modifies BOTH results AND result_versions.snapshot_json without being able to forge the signed Merkle root
    input.currentResult.subjects_json[0].marks = 95;
    input.latestVersion.snapshot_json.subjects[0].marks = 95;

    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('TAMPERED');
    expect(report.snapshot_hash_valid).toBe(false);
    expect(report.merkle_proof_valid).toBe(false);
  });

  it('detects tampering if an attacker modifies a Merkle inclusion proof', () => {
    const { input } = createBaseVerificationFixture();
    input.merkleProof.proof_json[0].hash = 'f'.repeat(64);

    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('TAMPERED');
    expect(report.merkle_proof_valid).toBe(false);
  });

  it('returns INVALID_SIGNATURE if the signed Merkle root is replaced or institution signature is forged', () => {
    const { input } = createBaseVerificationFixture();
    input.batch.merkle_root = 'e'.repeat(64);
    input.batch.manifest_json.merkle_root = 'e'.repeat(64);

    const report = verifyResultRecord(input);

    expect(report.verification_status).toBe('INVALID_SIGNATURE');
    expect(report.signature_valid).toBe(false);
  });

  it('returns CORRECTED when version 2 is authorized by two distinct valid approver Ed25519 signatures and preserves version 1', () => {
    const { input, instKey, approver1, approver2 } = createBaseVerificationFixture();

    // Create version 2 snapshot where CS301 is corrected from 78 -> 85
    const snapshotV2 = structuredClone(input.originalVersion.snapshot_json);
    snapshotV2.version = 2;
    snapshotV2.subjects[0].marks = 85;

    const leafV2 = computeLeafHash(snapshotV2);
    const treeV2 = buildMerkleTree([leafV2]);
    const manifestV2: PublicationManifestPayload = {
      batch_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      institution_id: 'MARKSURE-UNIV-01',
      academic_term: '2026-SEM5',
      merkle_root: treeV2.merkleRoot,
      record_count: 1,
      published_at: '2026-11-20T19:00:00.000Z',
    };
    const sigV2 = signPublicationManifest(manifestV2, instKey.privateKeyHex);

    const corrPayload: CorrectionApprovalPayload = {
      correction_request_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      result_id: snapshotV2.result_id,
      from_version: 1,
      subject_code: 'CS301',
      old_marks: 78,
      new_marks: 85,
      reason: 'Question 3 re-totaling verified by exam committee',
    };

    const appSig1 = signCorrectionApproval(corrPayload, approver1.privateKeyHex);
    const appSig2 = signCorrectionApproval(corrPayload, approver2.privateKeyHex);

    input.currentResult.current_version = 2;
    input.currentResult.status = 'corrected';
    input.currentResult.subjects_json[0].marks = 85;
    input.latestVersion = {
      version: 2,
      snapshot_json: snapshotV2,
      leaf_hash: leafV2,
    };
    input.merkleProof = {
      leaf_index: 0,
      leaf_hash: leafV2,
      proof_json: treeV2.proofs[0],
    };
    input.batch = {
      id: manifestV2.batch_id,
      merkle_root: treeV2.merkleRoot,
      manifest_json: manifestV2,
      institution_signature: sigV2,
      institution_public_key: instKey.publicKeyHex,
      published_at: manifestV2.published_at,
    };
    input.corrections = [
      {
        payload: corrPayload,
        finalized_version: 2,
        approvals: [
          {
            approver_id: 'approver-1-id',
            approver_name: 'Prof. Anita Desai',
            approver_public_key: approver1.publicKeyHex,
            signature_hex: appSig1,
            approved_at: '2026-11-20T18:50:00.000Z',
          },
          {
            approver_id: 'approver-2-id',
            approver_name: 'Prof. Vikram Menon',
            approver_public_key: approver2.publicKeyHex,
            signature_hex: appSig2,
            approved_at: '2026-11-20T18:55:00.000Z',
          },
        ],
      },
    ];

    const report = verifyResultRecord(input);
    expect(report.verification_status).toBe('CORRECTED');
    expect(report.field_diffs[0].original_v1_marks).toBe(78);
    expect(report.field_diffs[0].verified_snapshot_marks).toBe(85);
    expect(report.field_diffs[0].current_db_marks).toBe(85);
    expect(report.field_diffs[0].is_corrected).toBe(true);
    expect(report.field_diffs[0].is_tampered).toBe(false);

    // If same approver signed twice instead of two distinct approvers -> must flag TAMPERED
    input.corrections[0].approvals[1].approver_id = 'approver-1-id';
    const dupReport = verifyResultRecord(input);
    expect(dupReport.verification_status).toBe('TAMPERED');
  });
});
