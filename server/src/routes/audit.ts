import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { computeLedgerEventHash } from '../crypto/hash.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifySingleResultFromDb } from '../services/verificationService.js';

export const auditRouter = Router();

// Verify and return the hash-chained append-only ledger_events table
auditRouter.get(
  '/ledger',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: events, error } = await supabase
        .from('ledger_events')
        .select('*, profiles(full_name, email, role)')
        .order('seq_no', { ascending: true });

      if (error) throw new Error(error.message);

      let expectedPrevHash = '0'.repeat(64);
      let chainValid = true;
      let brokenAtSeqNo: number | null = null;

      const verifiedEvents = (events || []).map((ev: any) => {
        const recomputedHash = computeLedgerEventHash(
          ev.prev_event_hash,
          ev.payload_json
        );
        const linkValid =
          ev.prev_event_hash === expectedPrevHash &&
          recomputedHash === ev.event_hash;

        if (!linkValid && chainValid) {
          chainValid = false;
          brokenAtSeqNo = Number(ev.seq_no);
        }

        expectedPrevHash = ev.event_hash;

        return {
          ...ev,
          recomputed_hash: recomputedHash,
          link_valid: linkValid,
        };
      });

      res.json({
        chain_valid: chainValid,
        broken_at_seq_no: brokenAtSeqNo,
        total_events: verifiedEvents.length,
        events: verifiedEvents.reverse(), // newest first for UI display
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load audit ledger.',
      });
    }
  }
);

// Run live cryptographic integrity & direct-DB tampering scan across all results
auditRouter.get(
  '/integrity-scan',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: resultRows, error } = await supabase
        .from('results')
        .select('id')
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      const reports = [];
      let verifiedCount = 0;
      let correctedCount = 0;
      let tamperedCount = 0;
      let invalidSigCount = 0;

      for (const row of resultRows || []) {
        const rep = await verifySingleResultFromDb(row.id, {
          includeFullName: true,
        });
        reports.push(rep);

        if (rep.verification_status === 'VERIFIED') verifiedCount++;
        else if (rep.verification_status === 'CORRECTED') correctedCount++;
        else if (rep.verification_status === 'TAMPERED') tamperedCount++;
        else if (rep.verification_status === 'INVALID_SIGNATURE') invalidSigCount++;
      }

      // Generate ready-to-use Supabase SQL Editor demo queries for the first result (e.g. BT2024001)
      let sqlTamperDemo = null;
      if (reports.length > 0) {
        const target = reports[0];
        const originalSubjects = target.field_diffs.map((f) => ({
          code: f.subject_code,
          name: f.subject_name,
          marks: f.verified_snapshot_marks,
          max_marks: f.max_marks,
        }));
        const tamperedSubjects = originalSubjects.map((s, idx) =>
          idx === 0 ? { ...s, marks: s.marks === 99 ? 45 : 99 } : s
        );

        sqlTamperDemo = {
          target_result_id: target.result_id,
          target_roll_number: target.student.roll_number,
          target_student_name: target.student.full_name || target.student.masked_name,
          subject_to_tamper: originalSubjects[0]?.code || 'CS301',
          signed_marks: originalSubjects[0]?.marks ?? 78,
          tampered_marks: tamperedSubjects[0]?.marks ?? 99,
          attack_sql: `-- Run this in Supabase SQL Editor to simulate a rogue DB admin directly altering ${target.student.roll_number}'s marks:\nUPDATE public.results\nSET subjects_json = '${JSON.stringify(tamperedSubjects)}'::jsonb\nWHERE id = '${target.result_id}';`,
          restore_sql: `-- Run this in Supabase SQL Editor to restore ${target.student.roll_number}'s marks back to the verified snapshot:\nUPDATE public.results\nSET subjects_json = '${JSON.stringify(originalSubjects)}'::jsonb\nWHERE id = '${target.result_id}';`,
        };
      }

      res.json({
        scanned_at: new Date().toISOString(),
        total_checked: reports.length,
        verified_count: verifiedCount,
        corrected_count: correctedCount,
        tampered_count: tamperedCount,
        invalid_signature_count: invalidSigCount,
        sql_tamper_demo: sqlTamperDemo,
        records: reports,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Integrity scan failed.',
      });
    }
  }
);
