import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  History,
  Lock,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildPublicVerifyUrl,
  buildRelativeVerifyPath,
} from '../lib/verificationUrl';
import { PendingApprovalBadge, StatusBadge } from '../components/StatusBadge';
import {
  calculateAcademicSummary,
  evaluateSubjectGrade,
  getCourseCredits,
  GRADING_SCALE,
  INSTITUTION_CONTEXT,
} from '../lib/academicPolicy';
import {
  ErrorAlert,
  PageTransition,
  SkeletonTable,
} from '../components/ui/DesignSystem';
import { MarkSureLogo } from '../components/brand/MarkSureLogo';
import { SectionTransitionLoader } from '../components/brand/MarkSureLoader';

export function MarksheetPage({ embeddedResultId }: { embeddedResultId?: string }) {
  const params = useParams<{ resultId: string }>();
  const resultId = embeddedResultId || params.resultId;

  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function loadMarksheet() {
    if (!resultId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ result: any }>(`/api/student/results/${resultId}`);
      setReport(res.result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarksheet();
  }, [resultId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
        <SectionTransitionLoader
          active={loading}
          title="Retrieving official academic transcript"
          subtitle="Verifying SHA-256 Merkle inclusion proof and institutional Ed25519 signature..."
        />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <ErrorAlert
          error={error || new Error('Academic transcript record not found.')}
          onRetry={loadMarksheet}
        />
      </div>
    );
  }

  const verifyPath = buildRelativeVerifyPath(report.result_id, {
    v: report.current_version,
    leaf: report.stored_leaf_hash,
  });
  // Point QR code strictly to public canonical production verifier URL
  const fullQrUrl = buildPublicVerifyUrl(report.result_id, {
    v: report.current_version,
    leaf: report.stored_leaf_hash,
  });
  const summary = calculateAcademicSummary(report.field_diffs || []);
  const pendingCorrections = report.pending_corrections || [];

  return (
    <PageTransition className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        {!embeddedResultId ? (
          <Link
            to="/registry"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800 hover:text-zinc-950 bg-white px-3.5 py-2 rounded-md border border-stone-300"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Registry</span>
          </Link>
        ) : (
          <div className="text-sm font-semibold text-stone-600">
            Official Academic Transcript &amp; Cryptographic QR Verification
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={verifyPath}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 px-4 py-2 rounded-md transition"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Public Verification</span>
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 text-sm font-bold bg-[#7F1D1D] hover:bg-[#651717] text-white px-4 py-2 rounded-md transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Export Transcript (PDF)</span>
          </button>
        </div>
      </div>

      {/* Formal Academic Statement of Grades Document */}
      <div className="print-sheet bg-white border border-stone-400 rounded-lg overflow-hidden">
        {/* Top Institutional Banner */}
        <div className="p-6 sm:p-8 border-b-2 border-[#7F1D1D] bg-stone-50/60">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <MarkSureLogo variant="icon" size="md" className="mt-0.5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[#7F1D1D]">
                  {INSTITUTION_CONTEXT.institutionLabel} •{' '}
                  {INSTITUTION_CONTEXT.department}
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 mt-1">
                  Statement of Academic Grades — {INSTITUTION_CONTEXT.examinationName}
                </h1>
                <p className="text-sm text-stone-600 mt-1">
                  {INSTITUTION_CONTEXT.campusLocation} • Verified via{' '}
                  <strong>MarkSure</strong> Cryptographic Academic Ledger
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5">
              <StatusBadge status={report.verification_status} />
              {pendingCorrections.length > 0 && (
                <PendingApprovalBadge count={pendingCorrections[0].approvals_count} />
              )}
              <div className="text-xs font-mono text-stone-600">
                Publication Version: <strong>v{report.current_version}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Student & Programme Metadata Grid */}
        <div className="p-6 border-b border-stone-300 grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Student Name
            </div>
            <div className="font-bold text-base text-zinc-900 mt-0.5">
              {report.student.full_name || report.student.masked_name}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Registration Number
            </div>
            <div className="font-bold text-base font-mono text-zinc-900 mt-0.5">
              {report.student.roll_number}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Programme &amp; Department
            </div>
            <div className="font-semibold text-zinc-900 mt-0.5">
              B.Tech ({report.student.department})
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Session &amp; Semester
            </div>
            <div className="font-semibold text-zinc-900 mt-0.5">
              Session {INSTITUTION_CONTEXT.academicSession} • Semester{' '}
              {report.student.semester}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Examination Term Code
            </div>
            <div className="font-mono font-semibold text-zinc-900 mt-0.5">
              {report.academic_term}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Published Timestamp
            </div>
            <div className="font-mono text-zinc-900 mt-0.5">
              {new Date(report.published_at).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Semester GPA (SGPA)
            </div>
            <div className="font-mono font-bold text-base text-[#7F1D1D] mt-0.5">
              {summary.sgpa} / 10.00
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Result Classification
            </div>
            <div className="font-bold text-emerald-800 mt-0.5">
              {summary.resultStatus} ({summary.earnedCredits}/{summary.totalCredits}{' '}
              Credits)
            </div>
          </div>
        </div>

        {/* Subject-Wise Marks, Credits, and Grades Table */}
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[15px] border border-stone-300">
              <thead>
                <tr className="bg-zinc-900 text-white text-xs uppercase tracking-wider">
                  <th className="py-3 px-3.5 border border-zinc-700">Course Code</th>
                  <th className="py-3 px-3.5 border border-zinc-700">Course Title</th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Credits
                  </th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Max Marks
                  </th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Verified Marks
                  </th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Grade
                  </th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Grade Point
                  </th>
                  <th className="py-3 px-3.5 border border-zinc-700 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {(report.field_diffs || []).map((f: any) => {
                  const marks = Number(f.verified_snapshot_marks ?? 0);
                  const credits = getCourseCredits(f.subject_code);
                  const grade = evaluateSubjectGrade(marks);
                  const pendingSub = pendingCorrections.find(
                    (p: any) => p.subject_code === f.subject_code
                  );

                  return (
                    <tr key={f.subject_code} className="hover:bg-stone-50">
                      <td className="py-3 px-3.5 border border-stone-200 font-mono font-bold text-zinc-900">
                        {f.subject_code}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 font-medium text-zinc-900">
                        <div>{f.subject_name}</div>
                        {f.is_corrected && (
                          <div className="text-xs text-sky-800 font-semibold mt-0.5">
                            Authorized Correction: v1 ({f.original_v1_marks}) → v
                            {report.current_version} ({f.verified_snapshot_marks})
                          </div>
                        )}
                        {pendingSub && (
                          <div className="text-xs text-amber-800 font-semibold mt-0.5">
                            Pending Request: {pendingSub.old_marks} →{' '}
                            {pendingSub.new_marks} ({pendingSub.approvals_count}/2
                            Approvals — Not Yet Applied)
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-mono text-stone-700">
                        {credits}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-mono text-stone-600">
                        {f.max_marks}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-mono font-bold text-zinc-900">
                        {marks}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-mono font-bold text-zinc-900">
                        {grade.letter}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-mono text-stone-700">
                        {grade.gradePoint}
                      </td>
                      <td className="py-3 px-3.5 border border-stone-200 text-center font-bold text-emerald-800">
                        {grade.passed ? 'PASS' : 'REAPPEAR'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-100 font-bold text-zinc-900 text-sm">
                  <td
                    colSpan={2}
                    className="py-3 px-3.5 border border-stone-300 text-right"
                  >
                    Semester Aggregate
                  </td>
                  <td className="py-3 px-3.5 border border-stone-300 text-center font-mono">
                    {summary.totalCredits}
                  </td>
                  <td className="py-3 px-3.5 border border-stone-300 text-center font-mono">
                    {summary.totalMax}
                  </td>
                  <td className="py-3 px-3.5 border border-stone-300 text-center font-mono">
                    {summary.totalObtained} ({summary.percentage}%)
                  </td>
                  <td
                    colSpan={2}
                    className="py-3 px-3.5 border border-stone-300 text-center font-mono text-[#7F1D1D]"
                  >
                    SGPA: {summary.sgpa}
                  </td>
                  <td className="py-3 px-3.5 border border-stone-300 text-center text-emerald-800">
                    {summary.resultStatus}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pending Correction Notice */}
          {pendingCorrections.length > 0 && (
            <div className="mt-5 p-4 rounded-lg bg-amber-50 border border-amber-300 text-sm space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-950 uppercase tracking-wider text-xs">
                <Clock className="w-4 h-4 text-amber-700" />
                <span>
                  Pending Correction Request (1 of 2 Required Approvals Recorded — Not
                  Applied)
                </span>
              </div>
              {pendingCorrections.map((pc: any) => (
                <div key={pc.correction_request_id} className="text-amber-900 space-y-1">
                  <div>
                    Course <strong>{pc.subject_code} ({pc.subject_name})</strong>: Proposed
                    change from <strong>{pc.old_marks}</strong> to{' '}
                    <strong>{pc.new_marks}</strong>. Official published marks remain{' '}
                    <strong>{pc.old_marks} (Version {pc.from_version})</strong> until the
                    second authorized signatory approves.
                  </div>
                  <div>
                    <strong>Mandatory Reason:</strong> <em>{pc.reason}</em>
                  </div>
                  <div className="font-mono text-xs text-amber-800">
                    Signed Approver #1: {pc.approvals[0]?.approver_name || 'Pending'} •
                    Awaiting Approver #2 (Dr. Karan Bedi, Controller of Examinations)
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Finalized Two-Approval Correction History */}
          {report.verified_corrections && report.verified_corrections.length > 0 && (
            <div className="mt-5 p-4 rounded-lg bg-sky-50 border border-sky-300 text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold text-sky-950 uppercase tracking-wider text-xs">
                <History className="w-4 h-4 text-sky-700" />
                <span>Append-Only Two-Approval Correction History</span>
              </div>
              {report.verified_corrections.map((c: any) => (
                <div
                  key={c.correction_request_id}
                  className="bg-white p-3.5 rounded border border-sky-200 space-y-1"
                >
                  <div className="font-bold text-zinc-900">
                    Course {c.subject_code}: Marks updated from {c.old_marks} (v
                    {c.from_version}) → {c.new_marks} (v{c.finalized_version})
                  </div>
                  <div className="text-stone-700">
                    <strong>Mandatory Reason:</strong> <em>{c.reason}</em>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.approvals.map((a: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded text-xs font-mono"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Approver #{i + 1}: {a.approver_name} ({a.signature_hex.slice(0, 12)}
                        ...)
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cryptographic Provenance & QR Verification Block */}
          <div className="mt-6 pt-5 border-t border-stone-300 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-8 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-bold text-zinc-900 uppercase tracking-wider text-xs">
                <Lock className="w-4 h-4 text-[#7F1D1D]" />
                <span>Cryptographic Provenance &amp; Merkle Inclusion Seal</span>
              </div>
              <div className="p-3.5 rounded bg-stone-100 border border-stone-300 font-mono text-xs text-zinc-800 space-y-1 break-all">
                <div>
                  <strong className="text-stone-600">Record UUID:</strong> {report.result_id}
                </div>
                <div>
                  <strong className="text-stone-600">Snapshot SHA-256 Leaf Hash:</strong>{' '}
                  {report.stored_leaf_hash}
                </div>
                <div>
                  <strong className="text-stone-600">Batch Merkle Root:</strong>{' '}
                  {report.merkle_root}
                </div>
                <div>
                  <strong className="text-stone-600">Institution Ed25519 Signature:</strong>{' '}
                  {report.institution_signature.slice(0, 64)}...
                </div>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                <strong>Independent QR Verification:</strong> Scanning this QR code verifies
                the student&apos;s published result record against the institution&apos;s
                Ed25519-signed Merkle tree root and checks the live database for any
                unauthorized post-publication edits.
              </p>
            </div>

            <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-lg border border-stone-300 bg-stone-50">
              <div className="bg-white p-2.5 rounded border border-stone-300">
                <QRCodeSVG value={fullQrUrl} size={132} level="M" />
              </div>
              <span className="mt-2 text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Scan to Verify Transcript
              </span>
              <Link
                to={verifyPath}
                className="no-print mt-1 text-xs text-[#7F1D1D] font-bold hover:underline"
              >
                Verify Record Online →
              </Link>
            </div>
          </div>

          {/* Documented Grading Scale Footnote */}
          <div className="mt-5 pt-3 border-t border-stone-200 text-xs text-stone-500 flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>Grading Policy (10-Point Scale):</strong>{' '}
              {GRADING_SCALE.map(
                (g) => `${g.letter} (${g.minMarks}–${g.maxMarks}: ${g.gradePoint} pts)`
              ).join(' • ')}
            </div>
            <div className="font-mono">
              MarkSure Cryptographic Academic Transcript
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
