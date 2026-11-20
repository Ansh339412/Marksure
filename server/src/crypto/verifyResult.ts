import {
  CorrectionApprovalPayload,
  PublicationManifestPayload,
  ResultSnapshotPayload,
  SubjectMark,
} from './canonical.js';
import { computeLeafHash } from './hash.js';
import { MerkleProofStep, verifyMerkleProof } from './merkle.js';
import {
  verifyCorrectionApproval,
  verifyPublicationManifest,
} from './signatures.js';

export type VerificationStatus =
  | 'VERIFIED'
  | 'CORRECTED'
  | 'TAMPERED'
  | 'INVALID_SIGNATURE';

export interface SubjectFieldDiff {
  subject_code: string;
  subject_name: string;
  max_marks: number;
  original_v1_marks: number | null;
  verified_snapshot_marks: number | null;
  current_db_marks: number | null;
  is_corrected: boolean;
  is_tampered: boolean;
}

export interface VerifiedCorrectionRecord {
  correction_request_id: string;
  from_version: number;
  finalized_version: number | null;
  subject_code: string;
  old_marks: number;
  new_marks: number;
  reason: string;
  approvals: {
    approver_id: string;
    approver_name?: string;
    approver_public_key: string;
    signature_hex: string;
    signature_valid: boolean;
    approved_at: string;
  }[];
  two_approvals_valid: boolean;
}

export interface VerifyResultInput {
  currentResult: {
    id: string;
    student_id: string;
    academic_term: string;
    subjects_json: SubjectMark[];
    current_version: number;
    status: string;
  };
  latestVersion: {
    version: number;
    snapshot_json: ResultSnapshotPayload;
    leaf_hash: string;
  };
  originalVersion: {
    version: number;
    snapshot_json: ResultSnapshotPayload;
    leaf_hash: string;
  };
  merkleProof: {
    leaf_index: number;
    leaf_hash: string;
    proof_json: MerkleProofStep[];
  };
  batch: {
    id: string;
    merkle_root: string;
    manifest_json: PublicationManifestPayload;
    institution_signature: string;
    institution_public_key: string;
    published_at: string;
  };
  trustedInstitutionPublicKeyHex: string;
  qrLeafHash?: string;
  qrVersion?: number;
  corrections?: {
    payload: CorrectionApprovalPayload;
    finalized_version: number | null;
    approvals: {
      approver_id: string;
      approver_name?: string;
      approver_public_key: string;
      signature_hex: string;
      approved_at: string;
    }[];
  }[];
}

export interface VerifyResultOutput {
  verification_status: VerificationStatus;
  summary_message: string;
  signature_valid: boolean;
  merkle_proof_valid: boolean;
  snapshot_hash_valid: boolean;
  qr_leaf_matches: boolean;
  direct_db_tampering_detected: boolean;
  recomputed_leaf_hash: string;
  stored_leaf_hash: string;
  merkle_root: string;
  institution_public_key: string;
  field_diffs: SubjectFieldDiff[];
  tampered_fields: SubjectFieldDiff[];
  verified_corrections: VerifiedCorrectionRecord[];
}

/**
 * Pure cryptographic and field-level verification engine.
 *
 * 1. Verifies the institution's Ed25519 signature on the publication manifest.
 * 2. Recomputes the SHA-256 leaf hash from the preserved snapshot and verifies its Merkle inclusion proof.
 * 3. Compares the live database `results.subjects_json` against the verified snapshot to pinpoint
 *    any direct SQL modification down to the exact subject and mark values.
 * 4. Verifies all two-approver Ed25519 signatures for any version > 1 correction.
 */
export function verifyResultRecord(input: VerifyResultInput): VerifyResultOutput {
  const {
    currentResult,
    latestVersion,
    originalVersion,
    merkleProof,
    batch,
    trustedInstitutionPublicKeyHex,
    qrLeafHash,
    qrVersion,
    corrections = [],
  } = input;

  // Step 1: Verify institution public key & Ed25519 manifest signature
  const pubKeyMatchesTrusted =
    batch.institution_public_key.toLowerCase() ===
    trustedInstitutionPublicKeyHex.toLowerCase();

  const manifestRootMatchesBatch =
    batch.manifest_json?.merkle_root?.toLowerCase() ===
    batch.merkle_root.toLowerCase();

  const manifestSigValid =
    pubKeyMatchesTrusted &&
    manifestRootMatchesBatch &&
    verifyPublicationManifest(
      batch.manifest_json,
      batch.institution_signature,
      trustedInstitutionPublicKeyHex
    );

  // Step 2: Recompute SHA-256 leaf hash of the stored immutable snapshot & verify Merkle inclusion proof
  const recomputedLeafHash = computeLeafHash(latestVersion.snapshot_json);
  const snapshotHashValid =
    recomputedLeafHash === latestVersion.leaf_hash.toLowerCase() &&
    recomputedLeafHash === merkleProof.leaf_hash.toLowerCase();

  const merkleProofValid =
    snapshotHashValid &&
    verifyMerkleProof(
      recomputedLeafHash,
      merkleProof.proof_json,
      batch.merkle_root
    );

  // Optional out-of-band QR leaf check
  let qrLeafMatches = true;
  if (qrLeafHash && qrLeafHash.trim().length > 0) {
    const cleanQrLeaf = qrLeafHash.trim().toLowerCase();
    if (qrVersion === 1 && latestVersion.version !== 1) {
      qrLeafMatches = cleanQrLeaf === originalVersion.leaf_hash.toLowerCase();
    } else if (!qrVersion || qrVersion === latestVersion.version) {
      qrLeafMatches = cleanQrLeaf === recomputedLeafHash;
    }
  }

  // Step 3: Compare live database `results.subjects_json` against verified snapshot subjects
  const v1Map = new Map<string, SubjectMark>();
  for (const s of originalVersion.snapshot_json.subjects || []) {
    v1Map.set(s.code.toUpperCase(), s);
  }

  const verifiedMap = new Map<string, SubjectMark>();
  for (const s of latestVersion.snapshot_json.subjects || []) {
    verifiedMap.set(s.code.toUpperCase(), s);
  }

  const liveMap = new Map<string, SubjectMark>();
  for (const s of currentResult.subjects_json || []) {
    liveMap.set(String(s.code).toUpperCase(), s);
  }

  const allCodes = Array.from(
    new Set([...v1Map.keys(), ...verifiedMap.keys(), ...liveMap.keys()])
  ).sort();

  const fieldDiffs: SubjectFieldDiff[] = allCodes.map((code) => {
    const v1Sub = v1Map.get(code);
    const verSub = verifiedMap.get(code);
    const liveSub = liveMap.get(code);

    const origMarks = v1Sub ? Number(v1Sub.marks) : null;
    const verMarks = verSub ? Number(verSub.marks) : null;
    const liveMarks = liveSub ? Number(liveSub.marks) : null;

    const isTampered =
      verMarks === null ||
      liveMarks === null ||
      verMarks !== liveMarks ||
      (verSub && liveSub && Number(verSub.max_marks) !== Number(liveSub.max_marks)) ||
      false;

    const isCorrected =
      !isTampered &&
      origMarks !== null &&
      verMarks !== null &&
      origMarks !== verMarks;

    return {
      subject_code: code,
      subject_name: verSub?.name || liveSub?.name || v1Sub?.name || code,
      max_marks: Number(verSub?.max_marks ?? liveSub?.max_marks ?? 100),
      original_v1_marks: origMarks,
      verified_snapshot_marks: verMarks,
      current_db_marks: liveMarks,
      is_corrected: isCorrected,
      is_tampered: isTampered,
    };
  });

  const tamperedFields = fieldDiffs.filter((f) => f.is_tampered);
  const versionMismatch = currentResult.current_version !== latestVersion.version;
  const directDbTamperingDetected = tamperedFields.length > 0 || versionMismatch;

  // Step 4: Verify two-approver signatures on any finalized corrections
  const verifiedCorrections: VerifiedCorrectionRecord[] = corrections.map((c) => {
    const checkedApprovals = c.approvals.map((a) => ({
      ...a,
      signature_valid: verifyCorrectionApproval(
        c.payload,
        a.signature_hex,
        a.approver_public_key
      ),
    }));

    const distinctValidApprovers = new Set(
      checkedApprovals
        .filter((a) => a.signature_valid)
        .map((a) => a.approver_id)
    );

    return {
      correction_request_id: c.payload.correction_request_id,
      from_version: c.payload.from_version,
      finalized_version: c.finalized_version,
      subject_code: c.payload.subject_code,
      old_marks: c.payload.old_marks,
      new_marks: c.payload.new_marks,
      reason: c.payload.reason,
      approvals: checkedApprovals,
      two_approvals_valid: distinctValidApprovers.size >= 2,
    };
  });

  const allCorrectionsValid =
    latestVersion.version === 1 ||
    (verifiedCorrections.length >= latestVersion.version - 1 &&
      verifiedCorrections.every((vc) => vc.two_approvals_valid));

  // Final status decision
  let status: VerificationStatus = 'VERIFIED';
  let summaryMessage =
    'Result is authentic. Live database marks match the Merkle-verified institutional snapshot.';

  if (!manifestSigValid) {
    status = 'INVALID_SIGNATURE';
    summaryMessage =
      'CRITICAL: Institutional Ed25519 signature on the publication batch is invalid or the Merkle root was replaced.';
  } else if (!snapshotHashValid || !merkleProofValid || !qrLeafMatches) {
    status = 'TAMPERED';
    summaryMessage =
      'ALERT: Stored snapshot or Merkle inclusion proof failed cryptographic verification against the signed Merkle root.';
  } else if (directDbTamperingDetected) {
    status = 'TAMPERED';
    const changedCodes = tamperedFields.map((f) => f.subject_code).join(', ');
    summaryMessage = `ALERT: Direct database modification detected! The live database record does not match the signed snapshot (${changedCodes || 'version mismatch'}), while the original institutional Ed25519 signature remains valid.`;
  } else if (!allCorrectionsValid) {
    status = 'TAMPERED';
    summaryMessage =
      'ALERT: Result version was incremented without two valid, distinct approver Ed25519 signatures.';
  } else if (latestVersion.version > 1) {
    status = 'CORRECTED';
    summaryMessage = `Result is authentic and reflects an authorized Version ${latestVersion.version} correction signed by two distinct institutional approvers. Original Version 1 snapshot is preserved.`;
  }

  return {
    verification_status: status,
    summary_message: summaryMessage,
    signature_valid: manifestSigValid,
    merkle_proof_valid: merkleProofValid,
    snapshot_hash_valid: snapshotHashValid,
    qr_leaf_matches: qrLeafMatches,
    direct_db_tampering_detected: directDbTamperingDetected,
    recomputed_leaf_hash: recomputedLeafHash,
    stored_leaf_hash: latestVersion.leaf_hash,
    merkle_root: batch.merkle_root,
    institution_public_key: batch.institution_public_key,
    field_diffs: fieldDiffs,
    tampered_fields: tamperedFields,
    verified_corrections: verifiedCorrections,
  };
}
