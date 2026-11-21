import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
  SubjectMark,
} from '../crypto/canonical.js';
import { computeLeafHash, computeLedgerEventHash } from '../crypto/hash.js';
import { buildMerkleTree } from '../crypto/merkle.js';
import { signPublicationManifest } from '../crypto/signatures.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureDemoDataSeeded } from '../scripts/seedDemoData.js';
import { appendLedgerEvent } from '../services/ledger.js';
import { verifySingleResultFromDb } from '../services/verificationService.js';

export const adminRouter = Router();

// List all students
adminRouter.get(
  '/students',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .order('roll_number', { ascending: true });

      if (error) throw new Error(error.message);
      res.json({ students: students || [] });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch students.',
      });
    }
  }
);

// Dashboard metrics are read directly from their source tables. Counts use
// Supabase's exact-count mode so they are not limited by the API page size.
adminRouter.get(
  '/summary',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const [students, pendingCorrections, ledger, batches, resultRows] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }),
        supabase
          .from('correction_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('ledger_events').select('id', { count: 'exact', head: true }),
        supabase.from('publication_batches').select('id', { count: 'exact', head: true }),
        supabase.from('results').select('id').order('created_at', { ascending: true }),
      ]);

      const queryError = [students, pendingCorrections, ledger, batches, resultRows].find(
        (query) => query.error
      )?.error;
      if (queryError) throw new Error(queryError.message);

      let integrityStatus: 'VERIFIED' | 'FAILED' | 'UNAVAILABLE' = 'VERIFIED';
      let integrityAlerts = 0;
      for (const row of resultRows.data || []) {
        try {
          const report = await verifySingleResultFromDb(row.id);
          if (
            report.verification_status === 'TAMPERED' ||
            report.verification_status === 'INVALID_SIGNATURE'
          ) {
            integrityAlerts += 1;
            integrityStatus = 'FAILED';
          }
        } catch {
          integrityStatus = 'UNAVAILABLE';
        }
      }

      const { data: ledgerRows, error: ledgerRowsError } = await supabase
        .from('ledger_events')
        .select('seq_no, prev_event_hash, event_hash, payload_json')
        .order('seq_no', { ascending: true });
      if (ledgerRowsError) throw new Error(ledgerRowsError.message);

      let chainValid = true;
      let expectedPrevHash = '0'.repeat(64);
      for (const event of ledgerRows || []) {
        const recomputedHash = computeLedgerEventHash(
          event.prev_event_hash,
          event.payload_json
        );
        if (
          event.prev_event_hash !== expectedPrevHash ||
          recomputedHash !== event.event_hash
        ) {
          chainValid = false;
          break;
        }
        expectedPrevHash = event.event_hash;
      }
      if (!chainValid) integrityStatus = 'FAILED';

      res.json({
        enrolled_students: students.count || 0,
        pending_corrections: pendingCorrections.count || 0,
        integrity_alerts: integrityAlerts,
        audit_ledger_events: ledger.count || 0,
        published_batches: batches.count || 0,
        ledger_chain_valid: chainValid,
        integrity_status: integrityStatus,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load dashboard summary.',
      });
    }
  }
);

// Add a new student
adminRouter.post(
  '/students',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { roll_number, full_name, department, semester } = req.body || {};
      const cleanRoll = String(roll_number || '').trim().toUpperCase();
      const cleanName = String(full_name || '').trim();
      const cleanDept = String(department || '').trim();

      if (!cleanRoll || cleanRoll.length < 4) {
        res.status(400).json({
          error: 'Registration number (roll_number) is required and must be at least 4 characters.',
          code: 'INVALID_ROLL_NUMBER',
        });
        return;
      }

      if (!cleanName || cleanName.length < 2) {
        res.status(400).json({
          error: 'Student full name is required and must be at least 2 characters.',
          code: 'INVALID_FULL_NAME',
        });
        return;
      }

      if (!cleanDept) {
        res.status(400).json({
          error: 'Academic department is required.',
          code: 'INVALID_DEPARTMENT',
        });
        return;
      }

      const semNum = Number(semester ?? 1);
      if (!Number.isInteger(semNum) || semNum < 1 || semNum > 12) {
        res.status(400).json({
          error: 'Semester must be an integer between 1 and 12.',
          code: 'INVALID_SEMESTER',
        });
        return;
      }

      const supabase = getSupabaseAdmin();

      // Check if student with same roll_number already exists (HTTP 409 Conflict)
      const { data: existingStudent } = await supabase
        .from('students')
        .select('id, roll_number, full_name')
        .eq('roll_number', cleanRoll)
        .maybeSingle();

      if (existingStudent) {
        res.status(409).json({
          error: `A student with registration number "${cleanRoll}" is already registered (${existingStudent.full_name}).`,
          code: 'DUPLICATE_ROLL_NUMBER',
        });
        return;
      }

      const { data: student, error } = await supabase
        .from('students')
        .insert({
          roll_number: cleanRoll,
          full_name: cleanName,
          department: cleanDept,
          semester: semNum,
          profile_id: null,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505' || error.message.includes('unique constraint')) {
          res.status(409).json({
            error: `A student with registration number "${cleanRoll}" is already registered.`,
            code: 'DUPLICATE_ROLL_NUMBER',
          });
          return;
        }
        res.status(400).json({ error: error.message, code: 'STUDENT_INSERT_FAILED' });
        return;
      }

      res.status(201).json({ student });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create student.',
      });
    }
  }
);

// Cryptographic Result Batch Publishing Engine
adminRouter.post(
  '/results/publish',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { batch_name, academic_term, entries } = req.body || {};

      if (!batch_name || !academic_term || !Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({
          error: 'batch_name, academic_term, and a non-empty entries array are required.',
        });
        return;
      }

      const cleanTerm = String(academic_term).trim().toUpperCase();
      const supabase = getSupabaseAdmin();

      // 1. Validate all students exist and do not already have published results for this term
      const studentIds = entries.map((e: any) => String(e.student_id).trim());
      const { data: studentRows, error: stuErr } = await supabase
        .from('students')
        .select('id, roll_number, full_name, department, semester')
        .in('id', studentIds);

      if (stuErr || !studentRows || studentRows.length !== studentIds.length) {
        res.status(400).json({
          error: 'One or more student_id values were not found in the students table.',
        });
        return;
      }

      const studentById = new Map(studentRows.map((s) => [s.id, s]));

      const { data: existingResults } = await supabase
        .from('results')
        .select('id, student_id')
        .eq('academic_term', cleanTerm)
        .in('student_id', studentIds);

      if (existingResults && existingResults.length > 0) {
        const dupRolls = existingResults
          .map((r) => studentById.get(r.student_id)?.roll_number || r.student_id)
          .join(', ');
        res.status(409).json({
          error: `Results for ${cleanTerm} are already published for: ${dupRolls}. Published results are immutable — submit a Two-Approval Correction Request or use "Reset Demo Data" for a fresh run.`,
        });
        return;
      }

      // 2. Validate subject marks and build canonical ResultSnapshotPayloads
      const preparedItems: {
        resultId: string;
        studentId: string;
        rollNumber: string;
        normalizedSnapshot: ResultSnapshotPayload;
        leafHash: string;
      }[] = [];

      for (const entry of entries) {
        const student = studentById.get(String(entry.student_id).trim());
        if (!student) {
          res.status(400).json({ error: `Unknown student_id: ${entry.student_id}` });
          return;
        }

        if (!Array.isArray(entry.subjects) || entry.subjects.length === 0) {
          res.status(400).json({
            error: `Student ${student.roll_number} must have at least one subject.`,
          });
          return;
        }

        for (const sub of entry.subjects as SubjectMark[]) {
          const marks = Number(sub.marks);
          const maxMarks = Number(sub.max_marks || 100);
          if (
            !sub.code ||
            !sub.name ||
            !Number.isInteger(marks) ||
            marks < 0 ||
            marks > maxMarks
          ) {
            res.status(400).json({
              error: `Invalid subject marks for ${student.roll_number} (${sub.code}): marks must be an integer between 0 and ${maxMarks}.`,
            });
            return;
          }
        }

        const resultId = crypto.randomUUID();
        const normalizedSnapshot = normalizeResultSnapshot({
          result_id: resultId,
          student_id: student.id,
          roll_number: student.roll_number,
          academic_term: cleanTerm,
          version: 1,
          subjects: entry.subjects,
        });

        const leafHash = computeLeafHash(normalizedSnapshot);
        preparedItems.push({
          resultId,
          studentId: student.id,
          rollNumber: student.roll_number,
          normalizedSnapshot,
          leafHash,
        });
      }

      // 3. Build Merkle Tree and Inclusion Proofs
      const leafHashes = preparedItems.map((item) => item.leafHash);
      const merkleTree = buildMerkleTree(leafHashes);

      // 4. Create & Sign Publication Manifest with Institution Ed25519 Private Key
      const batchId = crypto.randomUUID();
      const publishedAt = new Date().toISOString();
      const manifest: PublicationManifestPayload = {
        batch_id: batchId,
        institution_id: env.institutionId,
        academic_term: cleanTerm,
        merkle_root: merkleTree.merkleRoot,
        record_count: preparedItems.length,
        published_at: publishedAt,
      };

      const institutionSignature = signPublicationManifest(
        manifest,
        env.institutionPrivateKeyHex
      );

      // 5. Persist publication_batches
      const { data: batchRow, error: batchErr } = await supabase
        .from('publication_batches')
        .insert({
          id: batchId,
          batch_name: String(batch_name).trim(),
          academic_term: cleanTerm,
          merkle_root: merkleTree.merkleRoot,
          record_count: preparedItems.length,
          manifest_json: manifest,
          institution_signature: institutionSignature,
          institution_public_key: env.institutionPublicKeyHex,
          published_by: req.user!.id,
          published_at: publishedAt,
        })
        .select('*')
        .single();

      if (batchErr || !batchRow) {
        throw new Error(`Failed to store publication batch: ${batchErr?.message}`);
      }

      // 6. Persist results, result_versions (immutable v1 snapshot), and merkle_proofs
      const publishedResultsSummary = [];
      const insertedResultIds: string[] = [];
      const insertedVersionIds: string[] = [];

      try {
        for (let idx = 0; idx < preparedItems.length; idx++) {
          const item = preparedItems[idx];
          const proofSteps = merkleTree.proofs[idx];

          const { error: resInsertErr } = await supabase.from('results').insert({
            id: item.resultId,
            student_id: item.studentId,
            academic_term: cleanTerm,
            subjects_json: item.normalizedSnapshot.subjects,
            current_version: 1,
            latest_batch_id: batchId,
            status: 'published',
          });

          if (resInsertErr) {
            throw new Error(`Failed to insert result for ${item.rollNumber}: ${resInsertErr.message}`);
          }
          insertedResultIds.push(item.resultId);

          const versionId = crypto.randomUUID();
          const { error: verInsertErr } = await supabase.from('result_versions').insert({
            id: versionId,
            result_id: item.resultId,
            version: 1,
            batch_id: batchId,
            snapshot_json: item.normalizedSnapshot,
            leaf_hash: item.leafHash,
          });

          if (verInsertErr) {
            throw new Error(
              `Failed to insert immutable snapshot for ${item.rollNumber}: ${verInsertErr.message}`
            );
          }
          insertedVersionIds.push(versionId);

          const { error: proofInsertErr } = await supabase.from('merkle_proofs').insert({
            result_version_id: versionId,
            batch_id: batchId,
            leaf_index: idx,
            leaf_hash: item.leafHash,
            proof_json: proofSteps,
          });

          if (proofInsertErr) {
            throw new Error(
              `Failed to insert Merkle proof for ${item.rollNumber}: ${proofInsertErr.message}`
            );
          }

          publishedResultsSummary.push({
            result_id: item.resultId,
            student_id: item.studentId,
            roll_number: item.rollNumber,
            version: 1,
            leaf_hash: item.leafHash,
            leaf_index: idx,
            proof_length: proofSteps.length,
            qr_verify_path: `/verify/${item.resultId}?v=1&leaf=${item.leafHash}`,
          });
        }
      } catch (err) {
        // Roll back partial batch inserts to guarantee transactional consistency
        await supabase.from('merkle_proofs').delete().eq('batch_id', batchId);
        await supabase.from('result_versions').delete().eq('batch_id', batchId);
        if (insertedResultIds.length > 0) {
          await supabase.from('results').delete().in('id', insertedResultIds);
        }
        await supabase.from('publication_batches').delete().eq('id', batchId);
        throw err;
      }

      // 7. Append BATCH_PUBLISHED event to hash-chained ledger
      const ledgerReceipt = await appendLedgerEvent({
        eventType: 'BATCH_PUBLISHED',
        entityId: batchId,
        actorId: req.user!.id,
        payload: {
          batch_id: batchId,
          batch_name: String(batch_name).trim(),
          academic_term: cleanTerm,
          merkle_root: merkleTree.merkleRoot,
          institution_signature: institutionSignature,
          record_count: preparedItems.length,
          result_ids: preparedItems.map((i) => i.resultId),
        },
      });

      res.status(201).json({
        batch: batchRow,
        merkle_root: merkleTree.merkleRoot,
        institution_signature: institutionSignature,
        institution_public_key: env.institutionPublicKeyHex,
        ledger_event_hash: ledgerReceipt.eventHash,
        results_published: publishedResultsSummary,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to publish result batch.',
      });
    }
  }
);

// List publication batches
adminRouter.get(
  '/batches',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: batches, error } = await supabase
        .from('publication_batches')
        .select('*, profiles(full_name, email)')
        .order('published_at', { ascending: false });

      if (error) throw new Error(error.message);
      res.json({ batches: batches || [] });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch publication batches.',
      });
    }
  }
);

// List all published results with live cryptographic verification status
adminRouter.get(
  '/results',
  requireAuth,
  requireRole('admin', 'approver'),
  async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: resultRows, error } = await supabase
        .from('results')
        .select('id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Section 5 Performance Improvement: Parallelize verification queries across results
      const verifiedResults = await Promise.all(
        (resultRows || []).map((row) =>
          verifySingleResultFromDb(row.id, {
            includeFullName: true,
          })
        )
      );

      res.json({ results: verifiedResults });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch results.',
      });
    }
  }
);

// Reset published results & ledger for clean development/testing rehearsals (Strictly disabled in production)
adminRouter.post(
  '/demo/reset',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      if (env.isProduction || !env.allowDevIdentities) {
        res.status(403).json({
          error: 'Demo reset operations are strictly forbidden in production environments.',
          code: 'FORBIDDEN_IN_PRODUCTION',
          status: 403,
        });
        return;
      }

      const mode = req.body?.mode || 'reseed';
      if (mode === 'empty') {
        const supabase = getSupabaseAdmin();
        await supabase.from('correction_approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('correction_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('merkle_proofs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('result_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('results').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('publication_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('ledger_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        res.json({
          status: 'reset_empty',
          message: 'Cleared published results so you can demonstrate batch publishing from scratch.',
        });
        return;
      }

      const seeded = await ensureDemoDataSeeded({ forceReset: true });
      res.json({
        status: 'reset_reseeded',
        message: seeded.message,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to reset demo data.',
      });
    }
  }
);
