import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  CorrectionApprovalPayload,
  PublicationManifestPayload,
  ResultSnapshotPayload,
  SubjectMark,
} from '../crypto/canonical.js';
import { MerkleProofStep } from '../crypto/merkle.js';
import { verifyCorrectionApproval } from '../crypto/signatures.js';
import {
  verifyResultRecord,
  VerifyResultOutput,
} from '../crypto/verifyResult.js';

export interface PendingCorrectionSummary {
  correction_request_id: string;
  from_version: number;
  subject_code: string;
  subject_name: string;
  old_marks: number;
  new_marks: number;
  reason: string;
  created_at: string;
  approvals_count: number;
  required_approvals: number;
  approvals: {
    approver_id: string;
    approver_name: string;
    approver_public_key: string;
    signature_hex: string;
    signature_valid: boolean;
    approved_at: string;
  }[];
}

export interface FullVerificationReport extends VerifyResultOutput {
  result_id: string;
  academic_term: string;
  current_version: number;
  status: string;
  published_at: string;
  batch_id: string;
  batch_name: string;
  student: {
    roll_number: string;
    masked_name: string;
    full_name?: string;
    department: string;
    semester: number;
  };
  merkle_proof_steps: MerkleProofStep[];
  leaf_index: number;
  institution_signature: string;
  manifest_json: PublicationManifestPayload;
  pending_corrections: PendingCorrectionSummary[];
}

/**
 * Masks a student's name for the public QR verification page so unnecessary
 * PII is not exposed publicly (e.g. "Harnoor Singh" -> "Harnoor S.").
 */
export function maskStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || 'Student';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Loads a single result and all its cryptographic artifacts from Supabase
 * and executes full signature, Merkle proof, and field-level tampering verification.
 */
export async function verifySingleResultFromDb(
  resultId: string,
  options: { qrLeafHash?: string; qrVersion?: number; includeFullName?: boolean } = {}
): Promise<FullVerificationReport> {
  const supabase = getSupabaseAdmin();

  const { data: resultRow, error: resErr } = await supabase
    .from('results')
    .select(
      'id, student_id, academic_term, subjects_json, current_version, latest_batch_id, status, created_at, updated_at, students(id, roll_number, full_name, department, semester)'
    )
    .eq('id', resultId)
    .single();

  if (resErr || !resultRow) {
    throw new Error(`Result record not found for ID: ${resultId}`);
  }

  // Load all immutable result_versions for this result
  const { data: versionRows, error: verErr } = await supabase
    .from('result_versions')
    .select('id, result_id, version, batch_id, snapshot_json, leaf_hash, created_at')
    .eq('result_id', resultId)
    .order('version', { ascending: true });

  if (verErr || !versionRows || versionRows.length === 0) {
    throw new Error(`Immutable result versions missing for result ID: ${resultId}`);
  }

  const originalVersionRow = versionRows[0];
  const latestVersionRow = versionRows[versionRows.length - 1];

  // Load Merkle proof for the latest version
  const { data: proofRow, error: proofErr } = await supabase
    .from('merkle_proofs')
    .select('id, result_version_id, batch_id, leaf_index, leaf_hash, proof_json')
    .eq('result_version_id', latestVersionRow.id)
    .single();

  if (proofErr || !proofRow) {
    throw new Error(`Merkle proof missing for result version ID: ${latestVersionRow.id}`);
  }

  // Load publication batch for the latest version
  const { data: batchRow, error: batchErr } = await supabase
    .from('publication_batches')
    .select(
      'id, batch_name, academic_term, merkle_root, record_count, manifest_json, institution_signature, institution_public_key, published_at'
    )
    .eq('id', latestVersionRow.batch_id)
    .single();

  if (batchErr || !batchRow) {
    throw new Error(`Publication batch missing for batch ID: ${latestVersionRow.batch_id}`);
  }

  // Load all correction requests (both finalized and pending) for this result
  const { data: allCorrectionRows } = await supabase
    .from('correction_requests')
    .select(
      'id, result_id, from_version, subject_code, subject_name, old_marks, new_marks, reason, canonical_payload_json, finalized_version, status, created_at, correction_approvals(id, approver_id, approver_public_key, signature_hex, approved_at, profiles(full_name))'
    )
    .eq('result_id', resultId)
    .order('created_at', { ascending: true });

  const finalizedRows = (allCorrectionRows || []).filter(
    (cr: any) => cr.status === 'finalized'
  );
  const pendingRows = (allCorrectionRows || []).filter(
    (cr: any) => cr.status === 'pending'
  );

  const correctionsInput = finalizedRows.map((cr: any) => {
    const payload: CorrectionApprovalPayload = cr.canonical_payload_json || {
      correction_request_id: cr.id,
      result_id: cr.result_id,
      from_version: cr.from_version,
      subject_code: cr.subject_code,
      old_marks: cr.old_marks,
      new_marks: cr.new_marks,
      reason: cr.reason,
    };

    const approvals = (cr.correction_approvals || []).map((a: any) => ({
      approver_id: a.approver_id,
      approver_name: a.profiles?.full_name || 'Authorized Approver',
      approver_public_key: a.approver_public_key,
      signature_hex: a.signature_hex,
      approved_at: a.approved_at,
    }));

    return {
      payload,
      finalized_version: cr.finalized_version,
      approvals,
    };
  });

  const pendingCorrections: PendingCorrectionSummary[] = pendingRows.map((cr: any) => {
    const payload: CorrectionApprovalPayload = cr.canonical_payload_json;
    const approvals = (cr.correction_approvals || []).map((a: any) => ({
      approver_id: a.approver_id,
      approver_name: a.profiles?.full_name || 'Authorized Approver',
      approver_public_key: a.approver_public_key,
      signature_hex: a.signature_hex,
      signature_valid: verifyCorrectionApproval(
        payload,
        a.signature_hex,
        a.approver_public_key
      ),
      approved_at: a.approved_at,
    }));

    return {
      correction_request_id: cr.id,
      from_version: cr.from_version,
      subject_code: cr.subject_code,
      subject_name: cr.subject_name,
      old_marks: cr.old_marks,
      new_marks: cr.new_marks,
      reason: cr.reason,
      created_at: cr.created_at,
      approvals_count: approvals.length,
      required_approvals: 2,
      approvals,
    };
  });

  const verifyOut = verifyResultRecord({
    currentResult: {
      id: resultRow.id,
      student_id: resultRow.student_id,
      academic_term: resultRow.academic_term,
      subjects_json: (resultRow.subjects_json || []) as SubjectMark[],
      current_version: Number(resultRow.current_version),
      status: resultRow.status,
    },
    latestVersion: {
      version: Number(latestVersionRow.version),
      snapshot_json: latestVersionRow.snapshot_json as ResultSnapshotPayload,
      leaf_hash: latestVersionRow.leaf_hash,
    },
    originalVersion: {
      version: Number(originalVersionRow.version),
      snapshot_json: originalVersionRow.snapshot_json as ResultSnapshotPayload,
      leaf_hash: originalVersionRow.leaf_hash,
    },
    merkleProof: {
      leaf_index: Number(proofRow.leaf_index),
      leaf_hash: proofRow.leaf_hash,
      proof_json: (proofRow.proof_json || []) as MerkleProofStep[],
    },
    batch: {
      id: batchRow.id,
      merkle_root: batchRow.merkle_root,
      manifest_json: batchRow.manifest_json as PublicationManifestPayload,
      institution_signature: batchRow.institution_signature,
      institution_public_key: batchRow.institution_public_key,
      published_at: batchRow.published_at,
    },
    trustedInstitutionPublicKeyHex: env.institutionPublicKeyHex,
    qrLeafHash: options.qrLeafHash,
    qrVersion: options.qrVersion,
    corrections: correctionsInput,
  });

  const studentObj = Array.isArray(resultRow.students)
    ? resultRow.students[0]
    : (resultRow.students as any);

  const fullName = studentObj?.full_name || 'Student';

  return {
    ...verifyOut,
    result_id: resultRow.id,
    academic_term: resultRow.academic_term,
    current_version: Number(resultRow.current_version),
    status: resultRow.status,
    published_at: batchRow.published_at,
    batch_id: batchRow.id,
    batch_name: batchRow.batch_name,
    student: {
      roll_number: studentObj?.roll_number || 'UNKNOWN',
      masked_name: maskStudentName(fullName),
      full_name: fullName, // Available for demo clarity while masked_name is also provided
      department: studentObj?.department || 'Computer Science and Engineering',
      semester: Number(studentObj?.semester || 1),
    },
    merkle_proof_steps: (proofRow.proof_json || []) as MerkleProofStep[],
    leaf_index: Number(proofRow.leaf_index),
    institution_signature: batchRow.institution_signature,
    manifest_json: batchRow.manifest_json as PublicationManifestPayload,
    pending_corrections: pendingCorrections,
  };
}
