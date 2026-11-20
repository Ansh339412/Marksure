import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  CorrectionApprovalPayload,
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
  SubjectMark,
} from '../crypto/canonical.js';
import { computeLeafHash } from '../crypto/hash.js';
import { buildMerkleTree } from '../crypto/merkle.js';
import {
  computeCorrectionPayloadHash,
  signPublicationManifest,
  verifyCorrectionApproval,
} from '../crypto/signatures.js';
import { appendLedgerEvent } from './ledger.js';

export interface ExistingApprovalRecord {
  approver_id: string;
  approver_public_key: string;
  signature_hex: string;
  signed_payload_hash: string;
}

/**
 * Pure validation helper for a correction approval signature.
 * Enforces:
 * 1. Mandatory non-empty reason (>= 5 chars).
 * 2. Approver must have a registered 64-char Ed25519 public key.
 * 3. Approver cannot approve the same request twice (duplicate approver rejection).
 * 4. Signed payload hash must match the stored canonical request payload hash.
 * 5. Ed25519 signature must be mathematically valid for the canonical correction payload.
 */
export function validateCorrectionApprovalPure(params: {
  payload: CorrectionApprovalPayload;
  expectedPayloadHash: string;
  approverId: string;
  approverPublicKeyHex: string | null;
  signatureHex: string;
  existingApprovals: ExistingApprovalRecord[];
}): { valid: boolean; error?: string } {
  const {
    payload,
    expectedPayloadHash,
    approverId,
    approverPublicKeyHex,
    signatureHex,
    existingApprovals,
  } = params;

  if (!payload.reason || payload.reason.trim().length < 5) {
    return {
      valid: false,
      error: 'Correction request must include a mandatory reason of at least 5 characters.',
    };
  }

  if (!approverPublicKeyHex || approverPublicKeyHex.length !== 64) {
    return {
      valid: false,
      error: 'Approver does not have a valid registered 64-char Ed25519 public key.',
    };
  }

  const alreadyApproved = existingApprovals.some(
    (a) => a.approver_id === approverId || a.approver_public_key.toLowerCase() === approverPublicKeyHex.toLowerCase()
  );
  if (alreadyApproved) {
    return {
      valid: false,
      error:
        'DUPLICATE APPROVER REJECTED: The same approver cannot sign a correction request twice. Two distinct authorized approvers are required.',
    };
  }

  const recomputedHash = computeCorrectionPayloadHash(payload);
  if (recomputedHash !== expectedPayloadHash.toLowerCase()) {
    return {
      valid: false,
      error:
        'PAYLOAD TAMPERING DETECTED: The correction request payload or reason was modified after creation.',
    };
  }

  const sigValid = verifyCorrectionApproval(
    payload,
    signatureHex,
    approverPublicKeyHex
  );
  if (!sigValid) {
    return {
      valid: false,
      error:
        'INVALID ED25519 SIGNATURE: The provided signature does not match the canonical correction payload and the approver’s registered public key.',
    };
  }

  return { valid: true };
}

/**
 * Pure check for whether a correction request has at least two distinct, valid Ed25519 approvals
 * and is eligible to publish a new result version.
 */
export function validateTwoApprovalsBeforeFinalizePure(params: {
  payload: CorrectionApprovalPayload;
  expectedPayloadHash: string;
  approvals: ExistingApprovalRecord[];
}): { ready: boolean; error?: string } {
  const { payload, expectedPayloadHash, approvals } = params;

  if (approvals.length < 2) {
    return {
      ready: false,
      error: `SINGLE APPROVAL REJECTED: MarkSure requires 2 distinct signed approvals before publishing a correction (currently has ${approvals.length} of 2).`,
    };
  }

  const distinctApproverIds = new Set<string>();
  const distinctPubKeys = new Set<string>();

  for (const app of approvals) {
    if (app.signed_payload_hash.toLowerCase() !== expectedPayloadHash.toLowerCase()) {
      return {
        ready: false,
        error: 'Stored approval payload hash does not match the canonical correction request.',
      };
    }

    const sigOk = verifyCorrectionApproval(
      payload,
      app.signature_hex,
      app.approver_public_key
    );
    if (!sigOk) {
      return {
        ready: false,
        error: `Invalid Ed25519 signature found for approver ${app.approver_id}.`,
      };
    }

    distinctApproverIds.add(app.approver_id);
    distinctPubKeys.add(app.approver_public_key.toLowerCase());
  }

  if (distinctApproverIds.size < 2 || distinctPubKeys.size < 2) {
    return {
      ready: false,
      error:
        'DUPLICATE APPROVER REJECTED: Corrections must be signed by two different authorized approvers with distinct Ed25519 public keys.',
    };
  }

  return { ready: true };
}

/**
 * Finalizes an approved correction request once 2 distinct valid Ed25519 signatures exist:
 * - Preserves old version(s) in `result_versions`
 * - Creates a new signed `publication_batches` manifest for `newVersion = from_version + 1`
 * - Inserts `result_versions` (v2) and `merkle_proofs`
 * - Updates `results` (`subjects_json`, `current_version`, `latest_batch_id`, `status = 'corrected'`)
 * - Marks `correction_requests.status = 'finalized'`
 * - Appends `CORRECTION_FINALIZED` to `ledger_events`
 */
export async function finalizeApprovedCorrectionInDb(params: {
  correctionRequestId: string;
  actorId: string;
}): Promise<{
  finalized_version: number;
  new_leaf_hash: string;
  new_merkle_root: string;
  new_batch_id: string;
}> {
  const supabase = getSupabaseAdmin();

  const { data: cr, error: crErr } = await supabase
    .from('correction_requests')
    .select('*, correction_approvals(*)')
    .eq('id', params.correctionRequestId)
    .single();

  if (crErr || !cr) {
    throw new Error('Correction request not found.');
  }

  if (cr.status === 'finalized') {
    throw new Error('This correction request has already been finalized.');
  }

  const payload: CorrectionApprovalPayload = cr.canonical_payload_json;
  const approvals: ExistingApprovalRecord[] = (cr.correction_approvals || []).map(
    (a: any) => ({
      approver_id: a.approver_id,
      approver_public_key: a.approver_public_key,
      signature_hex: a.signature_hex,
      signed_payload_hash: a.signed_payload_hash,
    })
  );

  const check = validateTwoApprovalsBeforeFinalizePure({
    payload,
    expectedPayloadHash: cr.payload_hash,
    approvals,
  });

  if (!check.ready) {
    const err = new Error(check.error || 'Two valid approvals are required.');
    (err as any).statusCode = 403;
    throw err;
  }

  // Load latest immutable snapshot for from_version (preserving old version!)
  const { data: prevVerRow, error: prevVerErr } = await supabase
    .from('result_versions')
    .select('*')
    .eq('result_id', cr.result_id)
    .eq('version', cr.from_version)
    .single();

  if (prevVerErr || !prevVerRow) {
    throw new Error(
      `Original snapshot version ${cr.from_version} not found for result ${cr.result_id}.`
    );
  }

  const prevSnapshot = prevVerRow.snapshot_json as ResultSnapshotPayload;
  const newVersion = Number(cr.from_version) + 1;

  const updatedSubjects: SubjectMark[] = prevSnapshot.subjects.map((s) =>
    s.code.toUpperCase() === String(cr.subject_code).toUpperCase()
      ? { ...s, marks: Number(cr.new_marks) }
      : { ...s }
  );

  const newSnapshot = normalizeResultSnapshot({
    ...prevSnapshot,
    version: newVersion,
    subjects: updatedSubjects,
  });

  const newLeafHash = computeLeafHash(newSnapshot);
  const merkleTree = buildMerkleTree([newLeafHash]);

  const batchId = crypto.randomUUID();
  const publishedAt = new Date().toISOString();
  const manifest: PublicationManifestPayload = {
    batch_id: batchId,
    institution_id: env.institutionId,
    academic_term: newSnapshot.academic_term,
    merkle_root: merkleTree.merkleRoot,
    record_count: 1,
    published_at: publishedAt,
  };

  const institutionSignature = signPublicationManifest(
    manifest,
    env.institutionPrivateKeyHex
  );

  // 1. Insert new signed publication batch for the correction version
  const { error: batchErr } = await supabase.from('publication_batches').insert({
    id: batchId,
    batch_name: `Authorized Correction v${newVersion} (${newSnapshot.roll_number} — ${cr.subject_code})`,
    academic_term: newSnapshot.academic_term,
    merkle_root: merkleTree.merkleRoot,
    record_count: 1,
    manifest_json: manifest,
    institution_signature: institutionSignature,
    institution_public_key: env.institutionPublicKeyHex,
    published_by: params.actorId,
    published_at: publishedAt,
  });

  if (batchErr) {
    throw new Error(`Failed to create correction publication batch: ${batchErr.message}`);
  }

  // 2. Append new immutable result_versions row (old v1 row remains untouched!)
  const newVersionId = crypto.randomUUID();
  const { error: verInsertErr } = await supabase.from('result_versions').insert({
    id: newVersionId,
    result_id: cr.result_id,
    version: newVersion,
    batch_id: batchId,
    snapshot_json: newSnapshot,
    leaf_hash: newLeafHash,
  });

  if (verInsertErr) {
    throw new Error(`Failed to append result_versions v${newVersion}: ${verInsertErr.message}`);
  }

  // 3. Insert Merkle proof for new version
  const { error: proofErr } = await supabase.from('merkle_proofs').insert({
    result_version_id: newVersionId,
    batch_id: batchId,
    leaf_index: 0,
    leaf_hash: newLeafHash,
    proof_json: merkleTree.proofs[0],
  });

  if (proofErr) {
    throw new Error(`Failed to insert Merkle proof for v${newVersion}: ${proofErr.message}`);
  }

  // 4. Update current `results` row to version + 1
  const { error: resUpdateErr } = await supabase
    .from('results')
    .update({
      subjects_json: newSnapshot.subjects,
      current_version: newVersion,
      latest_batch_id: batchId,
      status: 'corrected',
      updated_at: publishedAt,
    })
    .eq('id', cr.result_id);

  if (resUpdateErr) {
    throw new Error(`Failed to update results row: ${resUpdateErr.message}`);
  }

  // 5. Mark correction_requests as finalized
  const { error: crUpdateErr } = await supabase
    .from('correction_requests')
    .update({
      status: 'finalized',
      finalized_version: newVersion,
      finalized_at: publishedAt,
    })
    .eq('id', cr.id);

  if (crUpdateErr) {
    throw new Error(`Failed to finalize correction request status: ${crUpdateErr.message}`);
  }

  // 6. Append CORRECTION_FINALIZED event to hash-chained ledger
  await appendLedgerEvent({
    eventType: 'CORRECTION_FINALIZED',
    entityId: cr.id,
    actorId: params.actorId,
    payload: {
      correction_request_id: cr.id,
      result_id: cr.result_id,
      roll_number: newSnapshot.roll_number,
      subject_code: cr.subject_code,
      old_marks: cr.old_marks,
      new_marks: cr.new_marks,
      from_version: cr.from_version,
      finalized_version: newVersion,
      new_leaf_hash: newLeafHash,
      new_merkle_root: merkleTree.merkleRoot,
      approver_ids: approvals.map((a) => a.approver_id),
    },
  });

  return {
    finalized_version: newVersion,
    new_leaf_hash: newLeafHash,
    new_merkle_root: merkleTree.merkleRoot,
    new_batch_id: batchId,
  };
}
