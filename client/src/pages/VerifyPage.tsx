import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Lock,
  GitCommitHorizontal,
  History,
  Database,
  RefreshCw,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PendingApprovalBadge, StatusBadge } from '../components/StatusBadge';
import {
  calculateAcademicSummary,
  evaluateSubjectGrade,
  getCourseCredits,
  INSTITUTION_CONTEXT,
} from '../lib/academicPolicy';
import {
  Button,
  ErrorAlert,
  PageTransition,
} from '../components/ui/DesignSystem';
import { MarkSureLogo } from '../components/brand/MarkSureLogo';
import { VerificationSequencePanel } from '../components/brand/MarkSureLoader';

export function VerifyPage() {
  const { resultId } = useParams<{ resultId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState(resultId || '');
  const [directory, setDirectory] = useState<any[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const requestVersion = useRef(0);
  const qrLeaf = searchParams.get('leaf') || '';
  const qrVer = searchParams.get('v') || '';

  async function loadDirectory() {
    try {
      const res = await apiFetch<{ published_results: any[] }>('/api/verify');
      setDirectory(res.published_results || []);
    } catch {
      // ignore directory errors
    }
  }

  async function runVerification(idToVerify: string) {
    const version = ++requestVersion.current;
    setReport(null);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (qrVer) query.set('v', qrVer);
      if (qrLeaf) query.set('leaf', qrLeaf);
      const qs = query.toString() ? `?${query.toString()}` : '';

      const data = await apiFetch<any>(`/api/verify/${idToVerify}${qs}`);
      if (version !== requestVersion.current) return;
      setReport(data);
      setVerifiedAt(new Date().toLocaleString());
    } catch (err) {
      if (version !== requestVersion.current) return;
      setReport(null);
      setError(err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadDirectory();
    if (resultId) {
      setSearchInput(resultId);
      runVerification(resultId);
    } else {
      setReport(null);
      setLoading(false);
      setError(null);
    }
    return () => { requestVersion.current++; };
  }, [resultId, qrLeaf, qrVer]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = searchInput.trim();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  }

  const caseA = directory.find((d) => d.roll_number === 'REG-2026-CSE-001');
  const caseB = directory.find((d) => d.roll_number === 'REG-2026-CSE-002');
  const caseC = directory.find((d) => d.roll_number === 'REG-2026-CSE-003');

  const summary = report ? calculateAcademicSummary(report.field_diffs || []) : null;
  const pendingCorrections = report?.pending_corrections || [];

  return (
    <PageTransition className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Institutional Verification Header */}
      <div className="bg-white border border-stone-300 rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-stone-200">
          <div className="flex items-start gap-4">
            <MarkSureLogo variant="icon" size="md" className="mt-1" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#7F1D1D]">
                {INSTITUTION_CONTEXT.institutionLabel} • Public Verification Gateway
              </div>
              <h1 className="ms-page-title text-zinc-900 mt-1">
                Independent Cryptographic Result Verification
              </h1>
              <p className="text-base text-stone-600 mt-1">
                No login required. Independently verifies the student&apos;s SHA-256 Merkle
                inclusion proof, checks the Institution Ed25519 digital signature, and compares
                live database records against the immutable published snapshot.
              </p>
            </div>
          </div>

          {resultId && (
            <Button
              variant="secondary"
              onClick={() => runVerification(resultId)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Re-Verify Live Database</span>
            </Button>
          )}
        </div>

        {/* Shortcuts identify records; only a server report supplies a verdict. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[caseA, caseB, caseC].filter(Boolean).map((record) => (
            <Link key={record.result_id}
              to={`/verify/${record.result_id}?v=${record.current_version}&leaf=${record.latest_leaf_hash}`}
              className="p-4 rounded-lg border border-stone-300 bg-stone-50 text-sm">
              <span className="font-bold">{record.roll_number}</span>
              <span className="block text-stone-600">{record.masked_name}</span>
              <span className="block text-xs text-stone-500 mt-1">Check published version {record.current_version}</span>
            </Link>
          ))}
        </div>

        {/* Record UUID Lookup Form */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              aria-label="Enter Result Record UUID"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter Result Record UUID from QR Code..."
              className="w-full pl-10 pr-4 py-2.5 rounded-md bg-stone-50 border border-stone-300 text-sm font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
            />
          </div>
          <Button type="submit" variant="primary" size="lg">
            Verify Record
          </Button>
        </form>
      </div>

      {/* Directory Grid when no specific resultId is selected */}
      {!resultId && directory.length > 0 && (
        <div className="bg-white border border-stone-300 rounded-lg p-6">
          <h2 className="ms-card-heading text-zinc-900 mb-1">
            Published Examination Records Directory ({directory.length} Students)
          </h2>
          <p className="text-sm text-stone-600 mb-4">
            Select any student record below to execute live cryptographic verification:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {directory.map((item) => (
              <Link
                key={item.result_id}
                to={`/verify/${item.result_id}?v=${item.current_version}&leaf=${item.latest_leaf_hash}`}
                className="p-4 rounded-lg border border-stone-300 hover:border-zinc-900 bg-stone-50/50 transition block"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-[#7F1D1D]">
                    {item.roll_number}
                  </span>
                  <span className="text-xs font-mono font-bold bg-white text-stone-700 px-2 py-0.5 rounded border border-stone-300">
                    v{item.current_version}
                  </span>
                </div>
                <div className="text-base font-bold text-zinc-900 mt-1.5">
                  {item.masked_name}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  B.Tech CSE • {item.academic_term}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ErrorAlert
        error={error}
        onRetry={resultId ? () => runVerification(resultId) : undefined}
        onDismiss={() => setError(null)}
      />

      {/* PHASE 2 — Specialized 5-Step Cryptographic Verification Sequence */}
      {(loading || report) && (
        <VerificationSequencePanel loading={loading} report={report} />
      )}

      {/* Full Verification Report */}
      {!loading && report && summary && (
        <div className="ms-page-enter space-y-6">
          {/* Primary Verification Verdict Banner */}
          <div
            className={`p-6 rounded-lg border-2 ${
              report.verification_status === 'VERIFIED'
                ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950'
                : report.verification_status === 'CORRECTED'
                ? 'bg-sky-50/70 border-sky-500 text-sky-950'
                : 'bg-red-50/90 border-red-600 text-red-950'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-black/10">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={report.verification_status} size="lg" />
                  {pendingCorrections.length > 0 && (
                    <PendingApprovalBadge count={pendingCorrections[0].approvals_count} />
                  )}
                  <span className="text-base font-mono font-bold">
                    {report.student.roll_number} — {report.student.full_name}
                  </span>
                </div>
                <p className="text-[15px] font-semibold mt-2.5">
                  {report.summary_message}
                </p>
              </div>

              <div className="text-left md:text-right font-mono text-xs space-y-1 shrink-0">
                <div>
                  <strong>Verified Timestamp:</strong> {verifiedAt}
                </div>
                <div>
                  <strong>Published Version:</strong> v{report.current_version} (
                  {new Date(report.published_at).toLocaleDateString()})
                </div>
              </div>
            </div>

            {/* Side-by-Side Tampered Field Pinpoint Box */}
            {report.direct_db_tampering_detected && (
              <div className="mt-5 p-5 rounded-lg bg-white border-2 border-red-500 text-zinc-900">
                <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wider text-red-800 mb-2">
                  <ShieldAlert className="w-5 h-5 text-red-700" />
                  <span>
                    Direct Database Tampering Detected — Exact Field Modification Report
                  </span>
                </div>
                <p className="text-sm text-stone-700 mb-4">
                  The original publication manifest&apos;s{' '}
                  <strong className="text-emerald-800">
                    Ed25519 Institutional Signature (VALID)
                  </strong>{' '}
                  and{' '}
                  <strong className="text-emerald-800">
                    Merkle Inclusion Proof (VALID)
                  </strong>{' '}
                  confirm the authentic published snapshot, while the live database row in{' '}
                  <code className="font-mono bg-stone-100 px-1.5 py-0.5 rounded">
                    public.results
                  </code>{' '}
                  was altered outside the application:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {report.tampered_fields.map((tf: any) => (
                    <div
                      key={tf.subject_code}
                      className="p-4 rounded-lg bg-red-50 border border-red-300 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-mono font-bold text-sm text-red-950">
                          Course: {tf.subject_code}
                        </div>
                        <div className="font-bold text-base text-zinc-900">
                          {tf.subject_name}
                        </div>
                        <div className="text-xs text-red-800 font-semibold mt-0.5">
                          Unapproved Direct Database Modification
                        </div>
                      </div>

                      <div className="flex items-center gap-3 bg-white p-3 rounded-md border border-red-300 font-mono shrink-0">
                        <div className="text-center">
                          <div className="text-xs uppercase text-emerald-800 font-bold">
                            Original Signed
                          </div>
                          <div className="text-xl font-bold text-emerald-900">
                            {tf.verified_snapshot_marks}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-red-500" />
                        <div className="text-center">
                          <div className="text-xs uppercase text-red-700 font-bold">
                            Current DB
                          </div>
                          <div className="text-xl font-bold text-red-700">
                            {tf.current_db_marks}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Correction Notice (1 of 2 Approvals) */}
            {pendingCorrections.length > 0 && (
              <div className="mt-5 p-5 rounded-lg bg-white border-2 border-amber-400 text-zinc-900 text-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900 uppercase tracking-wider">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>
                      Pending Dual-Custody Correction (1 of 2 Approvals Signed — Not Yet
                      Applied)
                    </span>
                  </div>
                  <Link
                    to="/corrections"
                    className="font-bold text-[#7F1D1D] hover:underline"
                  >
                    Review in Approver Console →
                  </Link>
                </div>
                {pendingCorrections.map((pc: any) => (
                  <div key={pc.correction_request_id} className="space-y-1.5 text-stone-700">
                    <div>
                      Course <strong>{pc.subject_code} ({pc.subject_name})</strong>: Proposed
                      change from <strong>{pc.old_marks}</strong> to{' '}
                      <strong>{pc.new_marks}</strong>. Because the second approval from{' '}
                      <strong>Dr. Karan Bedi (Controller of Examinations)</strong> is still
                      pending, the official verified result remains at{' '}
                      <strong>{pc.old_marks} (Version {pc.from_version})</strong>.
                    </div>
                    <div>
                      <strong>Mandatory Reason:</strong> <em>{pc.reason}</em>
                    </div>
                    <div className="font-mono text-xs text-emerald-800">
                      ✓ Approval #1 Verified: {pc.approvals[0]?.approver_name} (Ed25519 Sig:{' '}
                      {pc.approvals[0]?.signature_hex.slice(0, 24)}...)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Student Details & Side-by-Side Database Comparison Table */}
          <div className="bg-white border border-stone-300 rounded-lg overflow-hidden">
            <div className="p-5 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="ms-card-heading text-zinc-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#7F1D1D]" />
                  <span>
                    Subject-Wise Verification &amp; Live Database Comparison
                  </span>
                </h2>
                <p className="text-sm text-stone-600 mt-0.5">
                  Student: <strong>{report.student.full_name}</strong> (
                  <span className="font-mono">{report.student.roll_number}</span>) •{' '}
                  {INSTITUTION_CONTEXT.programme} ({report.student.department}) • Semester{' '}
                  {report.student.semester}
                </p>
              </div>
              <div className="text-sm font-mono">
                Verified Total: <strong>{summary.totalObtained}/{summary.totalMax}</strong> •
                SGPA: <strong className="text-[#7F1D1D]">{summary.sgpa}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[15px]">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-300 text-xs font-bold text-stone-700 uppercase tracking-wider">
                    <th className="py-3 px-4">Course Code &amp; Title</th>
                    <th className="py-3 px-4 text-center">Credits</th>
                    <th className="py-3 px-4 text-center">Original (v1)</th>
                    <th className="py-3 px-4 text-center">
                      Signed Snapshot (v{report.current_version})
                    </th>
                    <th className="py-3 px-4 text-center">Current Database Value</th>
                    <th className="py-3 px-4 text-center">Verified Grade</th>
                    <th className="py-3 px-4 text-right">Field Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {report.field_diffs.map((f: any) => {
                    const credits = getCourseCredits(f.subject_code);
                    const grade = evaluateSubjectGrade(
                      Number(f.verified_snapshot_marks ?? 0)
                    );
                    const pendingSub = pendingCorrections.find(
                      (p: any) => p.subject_code === f.subject_code
                    );

                    return (
                      <tr
                        key={f.subject_code}
                        className={
                          f.is_tampered
                            ? 'bg-red-50/90 font-semibold'
                            : f.is_corrected
                            ? 'bg-sky-50/50'
                            : pendingSub
                            ? 'bg-amber-50/40'
                            : 'hover:bg-stone-50'
                        }
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-zinc-900">
                            {f.subject_code}
                          </span>{' '}
                          <span className="text-stone-800">— {f.subject_name}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-stone-600">
                          {credits}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-stone-600">
                          {f.original_v1_marks} / {f.max_marks}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-900">
                          {f.verified_snapshot_marks} / {f.max_marks}
                        </td>
                        <td
                          className={`py-3 px-4 text-center font-mono font-bold ${
                            f.is_tampered ? 'text-red-700 text-base' : 'text-zinc-900'
                          }`}
                        >
                          {f.current_db_marks} / {f.max_marks}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-zinc-900">
                          {grade.letter} ({grade.gradePoint})
                        </td>
                        <td className="py-3 px-4 text-right">
                          {f.is_tampered ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-100 text-red-950 border border-red-400 text-xs font-bold">
                              TAMPERED (Original: {f.verified_snapshot_marks} → DB:{' '}
                              {f.current_db_marks})
                            </span>
                          ) : f.is_corrected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-100 text-sky-950 border border-sky-300 text-xs font-bold">
                              CORRECTED ({f.original_v1_marks} → {f.verified_snapshot_marks})
                            </span>
                          ) : pendingSub ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold">
                              VERIFIED (Pending →{pendingSub.new_marks}, 1/2 Signed)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 text-xs font-semibold">
                              VERIFIED MATCH
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Finalized Two-Approver Correction Trail */}
          {report.verified_corrections && report.verified_corrections.length > 0 && (
            <div className="bg-white border border-sky-300 rounded-lg p-5 space-y-3">
              <h2 className="ms-card-heading text-zinc-900 flex items-center gap-2">
                <History className="w-5 h-5 text-sky-700" />
                <span>Verified Two-Approver Correction Trail</span>
              </h2>
              {report.verified_corrections.map((c: any) => (
                <div
                  key={c.correction_request_id}
                  className="p-4 rounded-lg bg-sky-50/50 border border-sky-200 text-sm space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-zinc-900">
                      Course {c.subject_code}: {c.old_marks} (v{c.from_version}) →{' '}
                      {c.new_marks} (v{c.finalized_version})
                    </span>
                    <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold border border-emerald-300 text-xs">
                      2 Distinct Ed25519 Signatures Verified
                    </span>
                  </div>
                  <div className="text-stone-700">
                    <strong>Mandatory Reason:</strong> <em>{c.reason}</em>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {c.approvals.map((a: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded bg-white border border-stone-200 font-mono text-xs"
                      >
                        <div className="font-sans font-bold text-zinc-900">
                          Signatory #{idx + 1}: {a.approver_name}
                        </div>
                        <div className="text-stone-500 truncate">
                          PubKey: {a.approver_public_key}
                        </div>
                        <div className="text-emerald-800 truncate">
                          Ed25519 Sig: {a.signature_hex}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cryptographic Proof Inspector */}
          <details className="bg-white border border-stone-300 rounded-lg p-6 font-mono text-xs space-y-3">
            <summary className="cursor-pointer font-sans font-bold text-sm p-1">Inspect cryptographic proof and signatures</summary>
            <div className="flex items-center justify-between font-sans">
              <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wider text-zinc-900">
                <Lock className="w-4 h-4 text-[#7F1D1D]" />
                <span>Cryptographic Proof &amp; Signature Inspector</span>
              </div>
              <Link
                to={`/marksheet/${report.result_id}`}
                className="text-sm font-bold text-[#7F1D1D] hover:underline"
              >
                Open Printable QR Transcript →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded bg-stone-50 border border-stone-200 break-all">
                <div className="text-stone-500 font-sans font-bold text-xs uppercase mb-1">
                  Recomputed Snapshot SHA-256 Leaf Hash
                </div>
                {report.recomputed_leaf_hash}
              </div>
              <div className="p-3.5 rounded bg-stone-50 border border-stone-200 break-all">
                <div className="text-stone-500 font-sans font-bold text-xs uppercase mb-1">
                  Signed Batch Merkle Root
                </div>
                {report.merkle_root}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded bg-stone-50 border border-stone-200 break-all">
                <div className="text-stone-500 font-sans font-bold text-xs uppercase mb-1">
                  Institution Trusted Ed25519 Public Key
                </div>
                {report.institution_public_key}
              </div>
              <div className="p-3.5 rounded bg-stone-50 border border-stone-200 break-all">
                <div className="text-stone-500 font-sans font-bold text-xs uppercase mb-1">
                  Institution Ed25519 Manifest Signature
                </div>
                {report.institution_signature}
              </div>
            </div>

            <div className="p-3.5 rounded bg-stone-50 border border-stone-200">
              <div className="text-stone-600 font-sans font-bold text-xs uppercase mb-1.5 flex items-center gap-1.5">
                <GitCommitHorizontal className="w-4 h-4 text-[#7F1D1D]" />
                <span>
                  Merkle Inclusion Proof Path (Leaf Index #{report.leaf_index} •{' '}
                  {report.merkle_proof_steps.length} sibling hashes)
                </span>
              </div>
              {report.merkle_proof_steps.length === 0 ? (
                <div className="text-stone-500">
                  Single-leaf batch (Leaf Hash === Merkle Root)
                </div>
              ) : (
                <div className="space-y-1">
                  {report.merkle_proof_steps.map((step: any, idx: number) => (
                    <div key={idx} className="text-zinc-800 break-all">
                      Level {idx + 1} [{step.position.toUpperCase()} sibling]: {step.hash}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </PageTransition>
  );
}
