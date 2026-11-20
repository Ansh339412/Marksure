import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  ShieldCheck,
  QrCode,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { MarksheetPage } from './MarksheetPage';
import {
  calculateAcademicSummary,
  INSTITUTION_CONTEXT,
} from '../lib/academicPolicy';
import { PendingApprovalBadge, StatusBadge } from '../components/StatusBadge';
import {
  EmptyState,
  ErrorAlert,
  PageTransition,
  SkeletonTable,
} from '../components/ui/DesignSystem';

export function StudentDashboard() {
  const [student, setStudent] = useState<any | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function loadMyResults() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ student: any; results: any[] }>(
        '/api/student/results'
      );
      setStudent(res.student);
      setResults(res.results || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyResults();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <ErrorAlert error={error} onRetry={loadMyResults} />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <EmptyState
          title="No published examination records found"
          description="Your Semester 1 End-Term Examination result has not been published yet. Once the Examination Branch signs the batch Merkle root, your digital transcript and QR verification code will appear here."
        />
      </div>
    );
  }

  const primaryResult = results[0];
  const summary = calculateAcademicSummary(primaryResult.field_diffs || []);
  const verifyPath = `/verify/${primaryResult.result_id}?v=${primaryResult.current_version}&leaf=${primaryResult.stored_leaf_hash}`;
  const pendingList = primaryResult.pending_corrections || [];

  return (
    <PageTransition className="space-y-2 pb-8">
      {/* Student Portal Summary Header (Hidden when printing the marksheet below) */}
      <div className="no-print max-w-4xl mx-auto pt-6 px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="bg-white border border-stone-300 rounded p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>
                  Student Academic Examination Portal • Session{' '}
                  {INSTITUTION_CONTEXT.academicSession}
                </span>
              </div>
              <h1 className="text-xl font-bold text-zinc-900 mt-0.5">
                {student?.full_name || primaryResult.student.full_name} (
                <span className="font-mono">{primaryResult.student.roll_number}</span>)
              </h1>
              <p className="text-xs text-stone-600 mt-0.5">
                Programme: <strong>{INSTITUTION_CONTEXT.programme}</strong> • Department:{' '}
                <strong>{primaryResult.student.department}</strong> • Semester{' '}
                <strong>{primaryResult.student.semester}</strong>
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5">
              <StatusBadge status={primaryResult.verification_status} />
              {pendingList.length > 0 && (
                <PendingApprovalBadge count={pendingList[0].approvals_count} />
              )}
              <span className="text-[11px] font-mono text-stone-500">
                Published: {new Date(primaryResult.published_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* 4-Metric Student Result Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Semester GPA (SGPA)
              </div>
              <div className="text-lg font-mono font-bold text-[#7F1D1D] mt-0.5">
                {summary.sgpa} / 10.00
              </div>
            </div>
            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Aggregate Marks
              </div>
              <div className="text-lg font-mono font-bold text-zinc-900 mt-0.5">
                {summary.totalObtained} / {summary.totalMax} ({summary.percentage}%)
              </div>
            </div>
            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Earned Credits & Status
              </div>
              <div className="text-sm font-bold text-emerald-800 mt-1">
                {summary.resultStatus} ({summary.earnedCredits}/{summary.totalCredits}{' '}
                Credits)
              </div>
            </div>
            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Merkle Ledger Version
              </div>
              <div className="text-sm font-mono font-bold text-zinc-900 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  Version {primaryResult.current_version} (Leaf #{primaryResult.leaf_index})
                </span>
              </div>
            </div>
          </div>

          {/* Quick Verification & Print Bar */}
          <div className="mt-4 pt-3.5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-stone-600 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>
                Anchored in Signed Batch Merkle Root{' '}
                <code className="font-mono text-zinc-800">
                  {primaryResult.merkle_root.slice(0, 16)}...
                </code>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={verifyPath}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-semibold transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Verify Transcript via Public QR Link</span>
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#7F1D1D] hover:bg-[#651717] text-white font-bold transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Transcript</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Official Statement of Academic Grades */}
      {results.map((r) => (
        <MarksheetPage key={r.result_id} embeddedResultId={r.result_id} />
      ))}
    </PageTransition>
  );
}
