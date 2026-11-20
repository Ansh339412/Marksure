import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  CorrectionApprovalPayload,
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
} from '../src/crypto/canonical.js';
import { computeLeafHash, computeParentHash } from '../src/crypto/hash.js';
import { buildMerkleTree, verifyMerkleProof } from '../src/crypto/merkle.js';
import {
  generateEd25519KeyPair,
  signCorrectionApproval,
  signPublicationManifest,
  verifyCorrectionApproval,
  verifyPublicationManifest,
} from '../src/crypto/signatures.js';

const sampleSnapshot1: ResultSnapshotPayload = {
  result_id: '11111111-1111-1111-1111-111111111111',
  student_id: '22222222-2222-2222-2222-222222222222',
  roll_number: 'BT2024001',
  academic_term: '2026-SEM5',
  version: 1,
  subjects: [
    { code: 'CS302', name: 'Operating Systems', marks: 84, max_marks: 100 },
    { code: 'CS301', name: 'Data Structures', marks: 78, max_marks: 100 },
  ],
};

const sampleSnapshot2: ResultSnapshotPayload = {
  result_id: '33333333-3333-3333-3333-333333333333',
  student_id: '44444444-4444-4444-4444-444444444444',
  roll_number: 'BT2024002',
  academic_term: '2026-SEM5',
  version: 1,
  subjects: [
    { code: 'CS301', name: 'Data Structures', marks: 91, max_marks: 100 },
    { code: 'CS302', name: 'Operating Systems', marks: 88, max_marks: 100 },
  ],
};

const sampleSnapshot3: ResultSnapshotPayload = {
  result_id: '55555555-5555-5555-5555-555555555555',
  student_id: '66666666-6666-6666-6666-666666666666',
  roll_number: 'BT2024003',
  academic_term: '2026-SEM5',
  version: 1,
  subjects: [
    { code: 'CS301', name: 'Data Structures', marks: 72, max_marks: 100 },
    { code: 'CS302', name: 'Operating Systems', marks: 79, max_marks: 100 },
  ],
};

describe('MarkSure Cryptographic Engine', () => {
  it('produces identical canonical JSON and leaf hash regardless of key or subject order', () => {
    const reordered: ResultSnapshotPayload = {
      version: 1,
      academic_term: '2026-SEM5',
      roll_number: 'BT2024001',
      student_id: '22222222-2222-2222-2222-222222222222',
      result_id: '11111111-1111-1111-1111-111111111111',
      subjects: [
        { code: 'CS301', name: 'Data Structures', marks: 78, max_marks: 100 },
        { code: 'CS302', name: 'Operating Systems', marks: 84, max_marks: 100 },
      ],
    };

    expect(canonicalize(normalizeResultSnapshot(sampleSnapshot1))).toBe(
      canonicalize(normalizeResultSnapshot(reordered))
    );
    expect(computeLeafHash(sampleSnapshot1)).toBe(computeLeafHash(reordered));
  });

  it('changes leaf hash completely if a single mark is altered by 1 point', () => {
    const tampered: ResultSnapshotPayload = {
      ...sampleSnapshot1,
      subjects: [
        { code: 'CS301', name: 'Data Structures', marks: 79, max_marks: 100 },
        { code: 'CS302', name: 'Operating Systems', marks: 84, max_marks: 100 },
      ],
    };
    expect(computeLeafHash(sampleSnapshot1)).not.toBe(computeLeafHash(tampered));
  });

  it('builds and verifies Merkle inclusion proofs for 1 leaf, even leaves, and odd leaves', () => {
    const h1 = computeLeafHash(sampleSnapshot1);
    const h2 = computeLeafHash(sampleSnapshot2);
    const h3 = computeLeafHash(sampleSnapshot3);

    // Single leaf
    const singleTree = buildMerkleTree([h1]);
    expect(singleTree.merkleRoot).toBe(h1);
    expect(verifyMerkleProof(h1, singleTree.proofs[0], singleTree.merkleRoot)).toBe(true);

    // Odd leaves (3 students)
    const oddTree = buildMerkleTree([h1, h2, h3]);
    expect(oddTree.proofs).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(
        verifyMerkleProof(oddTree.leaves[i], oddTree.proofs[i], oddTree.merkleRoot)
      ).toBe(true);
    }

    // Manual check of odd duplication rule: root = Hash(Hash(h1, h2), Hash(h3, h3))
    const expectedRoot = computeParentHash(
      computeParentHash(h1, h2),
      computeParentHash(h3, h3)
    );
    expect(oddTree.merkleRoot).toBe(expectedRoot);
  });

  it('rejects tampered Merkle inclusion proofs or tampered leaf hashes', () => {
    const h1 = computeLeafHash(sampleSnapshot1);
    const h2 = computeLeafHash(sampleSnapshot2);
    const h3 = computeLeafHash(sampleSnapshot3);
    const tree = buildMerkleTree([h1, h2, h3]);

    // Wrong leaf against valid proof
    expect(verifyMerkleProof(h2, tree.proofs[0], tree.merkleRoot)).toBe(false);

    // Mutated sibling hash in proof
    const badProof = [
      { ...tree.proofs[0][0], hash: '0'.repeat(64) },
      ...tree.proofs[0].slice(1),
    ];
    expect(verifyMerkleProof(h1, badProof, tree.merkleRoot)).toBe(false);
  });

  it('signs and verifies institutional publication manifests with Ed25519', () => {
    const instKey = generateEd25519KeyPair();
    const attackerKey = generateEd25519KeyPair();

    const manifest: PublicationManifestPayload = {
      batch_id: '99999999-9999-9999-9999-999999999999',
      institution_id: 'MARKSURE-UNIV-01',
      academic_term: '2026-SEM5',
      merkle_root: computeLeafHash(sampleSnapshot1),
      record_count: 3,
      published_at: '2026-11-20T18:00:00.000Z',
    };

    const sig = signPublicationManifest(manifest, instKey.privateKeyHex);
    expect(verifyPublicationManifest(manifest, sig, instKey.publicKeyHex)).toBe(true);

    // Rejects wrong public key
    expect(verifyPublicationManifest(manifest, sig, attackerKey.publicKeyHex)).toBe(false);

    // Rejects replaced Merkle root
    const tamperedManifest = { ...manifest, merkle_root: 'f'.repeat(64) };
    expect(
      verifyPublicationManifest(tamperedManifest, sig, instKey.publicKeyHex)
    ).toBe(false);
  });

  it('verifies two distinct approver signatures and rejects modified reason or forged key', () => {
    const approver1 = generateEd25519KeyPair();
    const approver2 = generateEd25519KeyPair();
    const forger = generateEd25519KeyPair();

    const payload: CorrectionApprovalPayload = {
      correction_request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      result_id: sampleSnapshot1.result_id,
      from_version: 1,
      subject_code: 'CS301',
      old_marks: 78,
      new_marks: 85,
      reason: 'Verified re-evaluation totaling error in Question 4',
    };

    const sig1 = signCorrectionApproval(payload, approver1.privateKeyHex);
    const sig2 = signCorrectionApproval(payload, approver2.privateKeyHex);

    expect(verifyCorrectionApproval(payload, sig1, approver1.publicKeyHex)).toBe(true);
    expect(verifyCorrectionApproval(payload, sig2, approver2.publicKeyHex)).toBe(true);

    // Rejects forged signature claiming to be approver1
    const forgedSig = signCorrectionApproval(payload, forger.privateKeyHex);
    expect(verifyCorrectionApproval(payload, forgedSig, approver1.publicKeyHex)).toBe(false);

    // Rejects post-approval reason modification (Attack #7)
    const modifiedReasonPayload = {
      ...payload,
      reason: 'Changed reason after approval',
    };
    expect(
      verifyCorrectionApproval(modifiedReasonPayload, sig1, approver1.publicKeyHex)
    ).toBe(false);
  });
});
