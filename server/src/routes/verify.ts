import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  maskStudentName,
  verifySingleResultFromDb,
} from '../services/verificationService.js';

export const verifyRouter = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

// Public directory of published result records
verifyRouter.get('/', async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from('results')
      .select(
        'id, academic_term, current_version, status, updated_at, students(roll_number, full_name, department), result_versions(version, leaf_hash)'
      )
      .limit(30);

    if (error) throw new Error(error.message);

    const directory = (rows || [])
      .map((r: any) => {
        const stu = Array.isArray(r.students) ? r.students[0] : r.students;
        const versions = Array.isArray(r.result_versions) ? r.result_versions : [];
        const latestVer = versions.sort((a: any, b: any) => b.version - a.version)[0];
        return {
          result_id: r.id,
          roll_number: stu?.roll_number || 'UNKNOWN',
          masked_name: maskStudentName(stu?.full_name || 'Student'),
          department: stu?.department || 'Computer Science and Engineering',
          academic_term: r.academic_term,
          current_version: r.current_version,
          latest_leaf_hash: latestVer?.leaf_hash || '',
        };
      })
      .sort((a, b) => a.roll_number.localeCompare(b.roll_number));

    res.json({ published_results: directory });
  } catch (err) {
    res.status(503).json({
      error:
        err instanceof Error
          ? err.message
          : 'Verification registry is temporarily unavailable.',
      code: 'REGISTRY_UNAVAILABLE',
      status: 503,
    });
  }
});

// Public QR Verification Endpoint (No authentication required)
verifyRouter.get('/:resultId', async (req, res) => {
  try {
    const { resultId } = req.params;
    if (!resultId || !UUID_REGEX.test(resultId.trim())) {
      res.status(422).json({
        error:
          'Malformed verification identifier. Expected a valid 36-character Result Record UUID.',
        code: 'MALFORMED_VERIFICATION_URL',
        status: 422,
      });
      return;
    }

    const qrLeafHash = typeof req.query.leaf === 'string' ? req.query.leaf.trim() : undefined;
    if (qrLeafHash && !HEX_64_REGEX.test(qrLeafHash)) {
      res.status(422).json({
        error:
          'Malformed QR leaf hash commitment. Expected a 64-character hexadecimal SHA-256 digest.',
        code: 'MALFORMED_QR_LEAF',
        status: 422,
      });
      return;
    }

    const qrVersion =
      typeof req.query.v === 'string' && !Number.isNaN(Number(req.query.v))
        ? Number(req.query.v)
        : undefined;

    // Section 3.E Privacy Requirement: Never leak full student names on the public verification endpoint
    const report = await verifySingleResultFromDb(resultId.trim(), {
      qrLeafHash,
      qrVersion,
      includeFullName: false,
    });

    res.json(report);
  } catch (err) {
    res.status(404).json({
      error:
        err instanceof Error
          ? err.message
          : 'Published academic record not found for the requested identifier.',
      code: 'RESULT_NOT_FOUND',
      status: 404,
    });
  }
});
