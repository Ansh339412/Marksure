import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifySingleResultFromDb } from '../services/verificationService.js';

export const studentRouter = Router();

// List logged-in student's own published results
studentRouter.get(
  '/results',
  requireAuth,
  requireRole('student'),
  async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();

      // Find student record linked to this user's profile_id (or fallback by full_name for demo)
      let { data: studentRow } = await supabase
        .from('students')
        .select('*')
        .eq('profile_id', req.user!.id)
        .maybeSingle();

      if (!studentRow) {
        const { data: byName } = await supabase
          .from('students')
          .select('*')
          .eq('full_name', req.user!.full_name)
          .maybeSingle();
        studentRow = byName;
      }

      if (!studentRow) {
        res.json({ student: null, results: [] });
        return;
      }

      const { data: resultRows, error: resErr } = await supabase
        .from('results')
        .select('id')
        .eq('student_id', studentRow.id)
        .order('created_at', { ascending: false });

      if (resErr) throw new Error(resErr.message);

      const detailedResults = [];
      for (const row of resultRows || []) {
        const report = await verifySingleResultFromDb(row.id, {
          includeFullName: true,
        });
        detailedResults.push(report);
      }

      res.json({
        student: studentRow,
        results: detailedResults,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load student results.',
      });
    }
  }
);

// View a specific result marksheet (Students can only view their own result; Admin/Approver can view any)
studentRouter.get('/results/:resultId', requireAuth, async (req, res) => {
  try {
    const { resultId } = req.params;
    const supabase = getSupabaseAdmin();

    if (req.user!.role === 'student') {
      const { data: resRow } = await supabase
        .from('results')
        .select('student_id, students(profile_id, full_name)')
        .eq('id', resultId)
        .maybeSingle();

      if (!resRow) {
        res.status(404).json({ error: 'Result not found.' });
        return;
      }

      const stu = Array.isArray(resRow.students) ? resRow.students[0] : (resRow.students as any);
      if (stu?.profile_id !== req.user!.id && stu?.full_name !== req.user!.full_name) {
        res.status(403).json({
          error: 'Unauthorized: Students may only access their own academic results.',
        });
        return;
      }
    }

    const report = await verifySingleResultFromDb(resultId, {
      includeFullName: true,
    });
    res.json({ result: report });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Result not found.',
    });
  }
});
