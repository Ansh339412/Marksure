import crypto from 'node:crypto';
import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  CorrectionApprovalPayload,
  ResultSnapshotPayload,
} from '../crypto/canonical.js';
import {
  computeCorrectionPayloadHash,
  formatCorrectionSigningMessage,
} from '../crypto/signatures.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  ExistingApprovalRecord,
  finalizeApprovedCorrectionInDb,
  validateCorrectionApprovalPure,
} from '../services/correctionService.js';
import { appendLedgerEvent } from '../services/ledger.js';

export const correctionsRouter = Router();

// List all correction requests with student details and existing approvals
correctionsRouter.get(
  '/',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: requests, error } = await supabase
        .from('correction_requests')
        .select(
          '*, results(id, academic_term, current_version, students(roll_number, full_name, department)), profiles!correction_requests_requested_by_fkey(full_name, email), correction_approvals(id, approver_id, approver_public_key, signature_hex, signed_payload_hash, approved_at, profiles(full_name, email))'
        )
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      const formatted = (requests || []).map((cr: any) => ({
        ...cr,
        signing_message: formatCorrectionSigningMessage(cr.canonical_payload_json),
      }));

      res.json({ requests: formatted });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to load correction requests.',
      });
    }
  }
);

// Submit a new correction request (Admin only)
correctionsRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { result_id, subject_code, new_marks, reason } = req.body || {};
      if (!result_id || !subject_code || new_marks === undefined || !reason) {
        res.status(400).json({
          error: 'result_id, subject_code, new_marks, and a mandatory reason are required.',
        });
        return;
      }

      const cleanReason = String(reason).trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: 'Mandatory reason must be at least 5 characters explaining the grade change.',
        });
        return;
      }

      const proposedMarks = Number(new_marks);
      if (!Number.isInteger(proposedMarks) || proposedMarks < 0 || proposedMarks > 100) {
        res.status(400).json({
          error: 'new_marks must be an integer between 0 and 100.',
        });
        return;
      }

      const supabase = getSupabaseAdmin();

      // Load current result & latest immutable snapshot
      const { data: resultRow, error: resErr } = await supabase
        .from('results')
        .select('id, current_version')
        .eq('id', result_id)
        .single();

      if (resErr || !resultRow) {
        res.status(404).json({ error: 'Target result record not found.' });
        return;
      }

      const { data: latestVersionRow, error: verErr } = await supabase
        .from('result_versions')
        .select('*')
        .eq('result_id', result_id)
        .eq('version', resultRow.current_version)
        .single();

      if (verErr || !latestVersionRow) {
        res.status(404).json({ error: 'Verified snapshot for current version not found.' });
        return;
      }

      const snapshot = latestVersionRow.snapshot_json as ResultSnapshotPayload;
      const cleanCode = String(subject_code).trim().toUpperCase();
      const targetSubject = snapshot.subjects.find(
        (s) => s.code.toUpperCase() === cleanCode
      );

      if (!targetSubject) {
        res.status(400).json({
          error: `Subject ${cleanCode} does not exist on result ${result_id}.`,
        });
        return;
      }

      if (Number(targetSubject.marks) === proposedMarks) {
        res.status(400).json({
          error: `Proposed new marks (${proposedMarks}) are identical to current published marks.`,
        });
        return;
      }

      // Prevent duplicate pending requests for the same result & version
      const { data: existingPending } = await supabase
        .from('correction_requests')
        .select('id')
        .eq('result_id', result_id)
        .eq('status', 'pending');

      if (existingPending && existingPending.length > 0) {
        res.status(409).json({
          error:
            'A pending correction request already exists for this result. Complete its two-approver review first.',
        });
        return;
      }

      const requestId = crypto.randomUUID();
      const canonicalPayload: CorrectionApprovalPayload = {
        correction_request_id: requestId,
        result_id: String(result_id),
        from_version: Number(resultRow.current_version),
        subject_code: cleanCode,
        old_marks: Number(targetSubject.marks),
        new_marks: proposedMarks,
        reason: cleanReason,
      };

      const payloadHash = computeCorrectionPayloadHash(canonicalPayload);

      const { data: createdRow, error: insertErr } = await supabase
        .from('correction_requests')
        .insert({
          id: requestId,
          result_id,
          from_version: resultRow.current_version,
          subject_code: cleanCode,
          subject_name: targetSubject.name,
          old_marks: targetSubject.marks,
          new_marks: proposedMarks,
          reason: cleanReason,
          canonical_payload_json: canonicalPayload,
          payload_hash: payloadHash,
          requested_by: req.user!.id,
          status: 'pending',
        })
        .select('*')
        .single();

      if (insertErr || !createdRow) {
        throw new Error(insertErr?.message || 'Failed to insert correction request.');
      }

      await appendLedgerEvent({
        eventType: 'CORRECTION_REQUESTED',
        entityId: requestId,
        actorId: req.user!.id,
        payload: {
          ...canonicalPayload,
          payload_hash: payloadHash,
          requested_by_name: req.user!.full_name,
        },
      });

      res.status(201).json({
        correction_request: createdRow,
        canonical_payload_to_sign: canonicalPayload,
        signing_message: formatCorrectionSigningMessage(canonicalPayload),
        payload_hash: payloadHash,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to create correction request.',
      });
    }
  }
);

// Submit a client-side Ed25519 signed approval (Approver role only)
correctionsRouter.post(
  '/:id/approve',
  requireAuth,
  requireRole('approver'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { signature_hex, auto_finalize = true } = req.body || {};

      if (!signature_hex || typeof signature_hex !== 'string') {
        res.status(400).json({
          error: 'signature_hex (128-character hex Ed25519 signature) is required.',
        });
        return;
      }

      const cleanSig = signature_hex.trim().toLowerCase();
      const supabase = getSupabaseAdmin();

      const { data: cr, error: crErr } = await supabase
        .from('correction_requests')
        .select('*, correction_approvals(*)')
        .eq('id', id)
        .single();

      if (crErr || !cr) {
        res.status(404).json({ error: 'Correction request not found.' });
        return;
      }

      if (cr.status !== 'pending') {
        res.status(400).json({
          error: `Correction request is already ${cr.status} and cannot accept new approvals.`,
        });
        return;
      }

      const payload: CorrectionApprovalPayload = cr.canonical_payload_json;
      const existingApprovals: ExistingApprovalRecord[] = (
        cr.correction_approvals || []
      ).map((a: any) => ({
        approver_id: a.approver_id,
        approver_public_key: a.approver_public_key,
        signature_hex: a.signature_hex,
        signed_payload_hash: a.signed_payload_hash,
      }));

      // Validate Ed25519 signature & distinct approver rules
      const validation = validateCorrectionApprovalPure({
        payload,
        expectedPayloadHash: cr.payload_hash,
        approverId: req.user!.id,
        approverPublicKeyHex: req.user!.public_key_hex,
        signatureHex: cleanSig,
        existingApprovals,
      });

      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const { data: insertedApproval, error: appErr } = await supabase
        .from('correction_approvals')
        .insert({
          correction_request_id: cr.id,
          approver_id: req.user!.id,
          approver_public_key: req.user!.public_key_hex!,
          signature_hex: cleanSig,
          signed_payload_hash: cr.payload_hash,
        })
        .select('*')
        .single();

      if (appErr || !insertedApproval) {
        res.status(400).json({
          error: appErr?.message || 'Failed to record approval signature.',
        });
        return;
      }

      const newTotalApprovals = existingApprovals.length + 1;

      await appendLedgerEvent({
        eventType: 'CORRECTION_APPROVED',
        entityId: cr.id,
        actorId: req.user!.id,
        payload: {
          correction_request_id: cr.id,
          result_id: cr.result_id,
          approver_id: req.user!.id,
          approver_name: req.user!.full_name,
          approver_public_key: req.user!.public_key_hex,
          signature_hex: cleanSig,
          approval_number: newTotalApprovals,
        },
      });

      // Automatically finalize and publish Version + 1 ONLY when 2 distinct valid approvals exist
      let finalizationResult = null;
      if (auto_finalize && newTotalApprovals >= 2) {
        finalizationResult = await finalizeApprovedCorrectionInDb({
          correctionRequestId: cr.id,
          actorId: req.user!.id,
        });
      }

      res.status(201).json({
        approval: insertedApproval,
        approvals_count: newTotalApprovals,
        finalized: Boolean(finalizationResult),
        finalization: finalizationResult,
        message: finalizationResult
          ? `2nd distinct Ed25519 signature verified! Result Version ${finalizationResult.finalized_version} has been cryptographically published while preserving Version ${cr.from_version}.`
          : `1st Ed25519 signature verified and recorded (1 of 2). Result remains at Version ${cr.from_version} until a second distinct authorized approver signs.`,
      });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err instanceof Error ? err.message : 'Failed to process approval.',
      });
    }
  }
);

// Explicit Finalize / Publish attempt endpoint (Demonstrates rejection when only 1 approval exists!)
correctionsRouter.post(
  '/:id/finalize',
  requireAuth,
  requireRole('admin', 'approver'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await finalizeApprovedCorrectionInDb({
        correctionRequestId: id,
        actorId: req.user!.id,
      });

      res.json({
        finalized: true,
        ...result,
      });
    } catch (err: any) {
      res.status(err?.statusCode || 400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Cannot finalize correction without two distinct valid approvals.',
      });
    }
  }
);

// Reject a pending correction request (Admin or Approver)
correctionsRouter.post(
  '/:id/reject',
  requireAuth,
  requireRole('admin', 'approver'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason = 'Rejected by examination scrutiny authority.' } = req.body || {};
      const cleanReason = String(reason).trim();

      const supabase = getSupabaseAdmin();
      const { data: cr, error: crErr } = await supabase
        .from('correction_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (crErr || !cr) {
        res.status(404).json({ error: 'Correction request not found.' });
        return;
      }

      if (cr.status !== 'pending') {
        res.status(400).json({
          error: `Correction request cannot be rejected because it is already ${cr.status}.`,
        });
        return;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('correction_requests')
        .update({
          status: 'rejected',
          finalized_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateErr) {
        throw new Error(`Failed to update correction status: ${updateErr.message}`);
      }

      await appendLedgerEvent({
        eventType: 'CORRECTION_REJECTED',
        entityId: cr.id,
        actorId: req.user!.id,
        payload: {
          correction_request_id: cr.id,
          result_id: cr.result_id,
          subject_code: cr.subject_code,
          rejected_by_id: req.user!.id,
          rejected_by_name: req.user!.full_name,
          rejected_by_role: req.user!.role,
          rejection_reason: cleanReason,
        },
      });

      res.json({
        rejected: true,
        status: 'rejected',
        correction_request: updated,
        message: `Correction request for ${cr.subject_code} has been officially rejected and archived to the audit ledger.`,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to reject correction request.',
      });
    }
  }
);
