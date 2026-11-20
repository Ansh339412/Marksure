import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Database,
  History,
  Copy,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Link2,
  Filter,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PendingApprovalBadge, StatusBadge } from '../components/StatusBadge';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';
import {
  Button,
  EmptyState,
  ErrorAlert,
  PageTransition,
  SkeletonTable,
  useToast,
} from '../components/ui/DesignSystem';

const EVENT_TYPE_LABELS: Record<string, { title: string; badgeClass: string }> = {
  BATCH_PUBLISHED: {
    title: 'Examination Result Batch Published',
    badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  CORRECTION_REQUESTED: {
    title: 'Mark Correction Request Initiated',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  CORRECTION_APPROVED: {
    title: 'Approver Ed25519 Signature Recorded',
    badgeClass: 'bg-stone-100 text-zinc-900 border-stone-300',
  },
  CORRECTION_FINALIZED: {
    title: 'Dual-Approval Correction Finalized & Published',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-300',
  },
};

export function AuditDashboardPage() {
  const { notify } = useToast();
  const [scanData, setScanData] = useState<any | null>(null);
  const [ledgerData, setLedgerData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [eventFilter, setEventFilter] = useState<string>('ALL');

  async function runAuditScan() {
    setLoading(true);
    setError(null);
    try {
      const [scanRes, ledgerRes] = await Promise.all([
        apiFetch<any>('/api/audit/integrity-scan'),
        apiFetch<any>('/api/audit/ledger'),
      ]);
      scanRes.records = (scanRes.records || []).sort((a: any, b: any) =>
        a.student.roll_number.localeCompare(b.student.roll_number)
      );
      setScanData(scanRes);
      setLedgerData(ledgerRes);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAuditScan();
  }, []);

  function copySql(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    notify({
      type: 'info',
      title: 'SQL Command Copied',
      message: 'Copied SQL command to clipboard for execution in Supabase SQL Editor.',
    });
    setTimeout(() => setCopiedLabel(null), 2500);
  }

  const filteredEvents = useMemo(() => {
    const events = ledgerData?.events || [];
    if (eventFilter === 'ALL') return events;
    return events.filter((ev: any) => ev.event_type === eventFilter);
  }, [ledgerData, eventFilter]);

  function summarizeEventPayload(ev: any): string {
    const p = ev.payload_json || {};
    switch (ev.event_type) {
      case 'BATCH_PUBLISHED':
        return `Published "${p.batch_name || p.academic_term}" (${p.record_count} student records). Merkle Root: ${(
          p.merkle_root || ''
        ).slice(0, 18)}...`;
      case 'CORRECTION_REQUESTED':
        return `Student ${p.roll_number || ''} • Course ${p.subject_code}: Proposed change ${p.old_marks} → ${p.new_marks} (from v${p.from_version}). Reason: "${p.reason}"`;
      case 'CORRECTION_APPROVED':
        return `Approval #${p.approval_number} signed by ${p.approver_name} (Ed25519 Signature: ${(
          p.signature_hex || ''
        ).slice(0, 20)}...)`;
      case 'CORRECTION_FINALIZED':
        return `Student ${p.roll_number || ''} • Course ${p.subject_code}: Finalized v${p.from_version} → v${p.finalized_version} (${p.old_marks} → ${p.new_marks}) after 2 distinct approvals.`;
      default:
        return JSON.stringify(p);
    }
  }

  return (
    <PageTransition className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="bg-white border border-stone-300 rounded p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
            <Database className="w-3.5 h-3.5" />
            <span>
              Cryptographic Audit & Database Integrity Forensics • Session{' '}
              {INSTITUTION_CONTEXT.academicSession}
            </span>
          </div>
          <h1 className="ms-page-title text-zinc-900 mt-1">
            Append-Only Audit History &amp; Direct SQL Tampering Monitor
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Verifies every published record against its immutable Merkle snapshot and audits
            the chronological SHA-256 hash chain across all examination events.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={runAuditScan}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-Scan Database & Ledger</span>
        </Button>
      </div>

      <ErrorAlert error={error} onRetry={runAuditScan} onDismiss={() => setError(null)} />

      {/* Compact Audit Metrics Strip */}
      {scanData && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-3.5 rounded border border-stone-300">
            <div className="text-[11px] text-stone-500 font-bold uppercase">
              Records Audited
            </div>
            <div className="text-xl font-bold font-mono text-zinc-900 mt-1">
              {scanData.total_checked}
            </div>
          </div>
          <div className="bg-white p-3.5 rounded border border-emerald-300">
            <div className="text-[11px] text-emerald-800 font-bold uppercase">
              Verified Intact
            </div>
            <div className="text-xl font-bold font-mono text-emerald-900 mt-1">
              {scanData.verified_count}
            </div>
          </div>
          <div className="bg-white p-3.5 rounded border border-sky-300">
            <div className="text-[11px] text-sky-800 font-bold uppercase">
              Corrected (2 Sigs)
            </div>
            <div className="text-xl font-bold font-mono text-sky-900 mt-1">
              {scanData.corrected_count}
            </div>
          </div>
          <div
            className={`p-3.5 rounded border ${
              scanData.tampered_count > 0
                ? 'bg-red-50 border-red-400'
                : 'bg-white border-stone-300'
            }`}
          >
            <div className="text-[11px] text-red-800 font-bold uppercase">
              Tampered Records
            </div>
            <div className="text-xl font-bold font-mono text-red-900 mt-1">
              {scanData.tampered_count}
            </div>
          </div>
          <div className="bg-white p-3.5 rounded border border-stone-300">
            <div className="text-[11px] text-stone-500 font-bold uppercase">
              Ledger Hash Chain
            </div>
            <div className="text-xs font-bold text-emerald-800 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {ledgerData?.chain_valid ? 'INTACT' : 'BROKEN'} (
                {ledgerData?.total_events || 0} events)
              </span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          {/* Chronological Readable Audit Event History */}
          {ledgerData && (
            <div className="bg-white border border-stone-300 rounded overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#7F1D1D]" />
                    <span>
                      Chronological Append-Only Audit Ledger ({filteredEvents.length} of{' '}
                      {ledgerData.total_events} Events)
                    </span>
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Every publication, correction request, signature approval, and version
                    finalization is hash-chained (
                    <code className="font-mono">prev_event_hash → event_hash</code>).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 text-[11px] font-semibold">
                    <Filter className="w-3.5 h-3.5 text-stone-400 mr-1" />
                    {[
                      { id: 'ALL', label: 'All Events' },
                      { id: 'BATCH_PUBLISHED', label: 'Publications' },
                      { id: 'CORRECTION_REQUESTED', label: 'Requests' },
                      { id: 'CORRECTION_APPROVED', label: 'Signatures' },
                      { id: 'CORRECTION_FINALIZED', label: 'Finalized' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setEventFilter(f.id)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                          eventFilter === f.id
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                      ledgerData.chain_valid
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-red-50 text-red-900 border-red-300'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>
                      {ledgerData.chain_valid
                        ? 'SHA-256 HASH CHAIN VERIFIED'
                        : `CHAIN BROKEN AT SEQ #${ledgerData.broken_at_seq_no}`}
                    </span>
                  </span>
                </div>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="No audit events match filter"
                    description="Select a different event category filter above to view chronological ledger entries."
                  />
                </div>
              ) : (
                <div className="divide-y divide-stone-200">
                  {filteredEvents.map((ev: any) => {
                    const meta = EVENT_TYPE_LABELS[ev.event_type] || {
                      title: ev.event_type,
                      badgeClass: 'bg-stone-100 text-stone-800 border-stone-300',
                    };

                    return (
                      <div
                        key={ev.id}
                        className="p-4 hover:bg-stone-50/70 transition space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-zinc-900 text-white font-mono text-[11px] font-bold">
                              Event #{ev.seq_no}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border ${meta.badgeClass}`}
                            >
                              {meta.title}
                            </span>
                            <span className="text-xs text-stone-600">
                              Actor:{' '}
                              <strong className="text-zinc-900">
                                {ev.profiles?.full_name || 'Examination Authority'}
                              </strong>
                            </span>
                          </div>
                          <span className="text-xs font-mono text-stone-500">
                            {new Date(ev.created_at).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-800 leading-relaxed">
                          {summarizeEventPayload(ev)}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-stone-500 pt-0.5">
                          <span>
                            <strong>Prev Hash:</strong> {ev.prev_event_hash.slice(0, 24)}
                            ...
                          </span>
                          <span>
                            <strong className="text-zinc-800">Event SHA-256:</strong>{' '}
                            {ev.event_hash}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Live Database Integrity Scan Table */}
          {scanData && scanData.records.length > 0 && (
            <div className="bg-white border border-stone-300 rounded overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                  Live Database vs. Signed Merkle Snapshot Comparison
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-300 text-[11px] font-bold text-stone-700 uppercase">
                      <th className="py-2.5 px-3.5">Student Record</th>
                      <th className="py-2.5 px-3.5">Version</th>
                      <th className="py-2.5 px-3.5">Ed25519 Sig</th>
                      <th className="py-2.5 px-3.5">Merkle Proof</th>
                      <th className="py-2.5 px-3.5">Course Marks Audit</th>
                      <th className="py-2.5 px-3.5">Verification Status</th>
                      <th className="py-2.5 px-3.5 text-right">Forensic Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {scanData.records.map((r: any) => {
                      const hasPending = (r.pending_corrections || []).length > 0;
                      return (
                        <tr
                          key={r.result_id}
                          className={
                            r.verification_status === 'TAMPERED'
                              ? 'bg-red-50/70'
                              : hasPending
                              ? 'bg-amber-50/40'
                              : 'hover:bg-stone-50'
                          }
                        >
                          <td className="py-3 px-3.5">
                            <div className="font-mono font-bold text-zinc-900">
                              {r.student.roll_number}
                            </div>
                            <div className="text-stone-600">{r.student.full_name}</div>
                          </td>
                          <td className="py-3 px-3.5 font-mono font-bold">
                            v{r.current_version}
                          </td>
                          <td className="py-3 px-3.5 font-mono">
                            {r.signature_valid ? (
                              <span className="text-emerald-800 font-bold">VALID</span>
                            ) : (
                              <span className="text-red-700 font-bold">INVALID</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-mono">
                            {r.merkle_proof_valid ? (
                              <span className="text-emerald-800 font-bold">VALID</span>
                            ) : (
                              <span className="text-red-700 font-bold">FAILED</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex flex-wrap gap-1">
                              {r.field_diffs.map((f: any) => (
                                <span
                                  key={f.subject_code}
                                  className={`px-1.5 py-0.5 rounded border font-mono text-[11px] ${
                                    f.is_tampered
                                      ? 'bg-red-100 text-red-950 border-red-400 font-bold'
                                      : f.is_corrected
                                      ? 'bg-sky-100 text-sky-950 border-sky-300 font-semibold'
                                      : 'bg-stone-50 text-stone-700 border-stone-200'
                                  }`}
                                >
                                  {f.subject_code}: {f.current_db_marks}
                                  {f.is_tampered &&
                                    ` (Signed: ${f.verified_snapshot_marks})`}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex flex-col items-start gap-1">
                              <StatusBadge status={r.verification_status} />
                              {hasPending && (
                                <PendingApprovalBadge
                                  count={r.pending_corrections[0].approvals_count}
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <Link
                              to={`/verify/${r.result_id}?v=${r.current_version}&leaf=${r.stored_leaf_hash}`}
                              className="font-bold text-[#7F1D1D] hover:underline"
                            >
                              Inspect Proof →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Direct SQL Forensics Verification Helper */}
          {scanData?.sql_tamper_demo && (
            <div className="bg-white border border-stone-300 rounded overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#7F1D1D]" />
                    <span>
                      Database Integrity Verification Commands (Direct SQL Modification
                      Audit)
                    </span>
                  </h2>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Record <strong>Arshdeep Gill (REG-2026-CSE-003)</strong> contains an
                    unapproved direct database edit on <strong>CSE101 (68 → 92)</strong>.
                    You can also test direct database verification in Supabase SQL Editor on{' '}
                    <strong>{scanData.sql_tamper_demo.target_roll_number}</strong>:
                  </p>
                </div>
                <a
                  href="https://supabase.com/dashboard/project/muiuocdyijlrcjxffcqf/sql/new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  <span>Open Supabase SQL Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3.5 rounded bg-stone-50 border border-stone-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-900">
                      1. Unapproved Direct SQL Update ({scanData.sql_tamper_demo.target_roll_number} •{' '}
                      {scanData.sql_tamper_demo.subject_to_tamper}:{' '}
                      {scanData.sql_tamper_demo.signed_marks} →{' '}
                      {scanData.sql_tamper_demo.tampered_marks})
                    </span>
                    <button
                      type="button"
                      onClick={() => copySql(scanData.sql_tamper_demo.attack_sql, 'attack')}
                      className="inline-flex items-center gap-1 text-xs font-semibold bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 px-2.5 py-1 rounded cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedLabel === 'attack' ? 'Copied' : 'Copy SQL'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded bg-zinc-900 text-stone-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {scanData.sql_tamper_demo.attack_sql}
                  </pre>
                </div>

                <div className="p-3.5 rounded bg-stone-50 border border-stone-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">
                      2. Restore Record to Signed Snapshot ({scanData.sql_tamper_demo.target_roll_number}{' '}
                      • Restore to {scanData.sql_tamper_demo.signed_marks})
                    </span>
                    <button
                      type="button"
                      onClick={() => copySql(scanData.sql_tamper_demo.restore_sql, 'restore')}
                      className="inline-flex items-center gap-1 text-xs font-semibold bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 px-2.5 py-1 rounded cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedLabel === 'restore' ? 'Copied' : 'Copy SQL'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded bg-zinc-900 text-stone-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {scanData.sql_tamper_demo.restore_sql}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}
