import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FileEdit,
  KeyRound,
  CheckCircle2,
  ShieldAlert,
  Lock,
  UserCheck,
  Send,
  ExternalLink,
  Clock,
  History,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  CorrectionApprovalPayload,
  fetchAuthorizedDevSigningKey,
  getPublicKeyHexClientSide,
  signCorrectionPayloadClientSide,
} from '../lib/signing';
import { useAuth } from '../context/AuthContext';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';
import {
  Button,
  EmptyState,
  ErrorAlert,
  FormField,
  PageTransition,
  SkeletonTable,
  useToast,
} from '../components/ui/DesignSystem';

export function CorrectionsPage() {
  const { user, loginWithDevIdentity } = useAuth();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const queryResultId = searchParams.get('resultId') || '';

  const [results, setResults] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // New Correction Request form state
  const [selectedResultId, setSelectedResultId] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('CSE101');
  const [newMarks, setNewMarks] = useState<number>(88);
  const [reason, setReason] = useState(
    'Answer script re-totaling error in Section B verified by examination scrutiny committee.'
  );
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Client-side Ed25519 private key input per approver (never hardcoded in frontend bundle)
  const [privKeyHex, setPrivKeyHex] = useState('');
  const [usingUnregisteredTestKey, setUsingUnregisteredTestKey] = useState(false);

  async function syncApproverKey() {
    setUsingUnregisteredTestKey(false);
    try {
      const keyData = await fetchAuthorizedDevSigningKey();
      setPrivKeyHex(keyData.private_key_hex);
      return keyData.private_key_hex;
    } catch {
      return '';
    }
  }

  useEffect(() => {
    setPrivKeyHex('');
    setUsingUnregisteredTestKey(false);
    if (user?.role === 'approver') {
      syncApproverKey();
    }
  }, [user?.id, user?.role_code]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [resData, corrData] = await Promise.all([
        apiFetch<{ results: any[] }>('/api/admin/results'),
        apiFetch<{ requests: any[] }>('/api/corrections'),
      ]);
      const sortedResults = (resData.results || []).sort((a, b) =>
        a.student.roll_number.localeCompare(b.student.roll_number)
      );
      setResults(sortedResults);
      setRequests(corrData.requests || []);
      if (queryResultId && sortedResults.some((r) => r.result_id === queryResultId)) {
        setSelectedResultId(queryResultId);
      } else if (!selectedResultId && sortedResults.length > 0) {
        setSelectedResultId(sortedResults[0].result_id);
        const firstSub = sortedResults[0].field_diffs?.[0]?.subject_code || 'CSE101';
        setSelectedSubjectCode(firstSub);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [queryResultId]);

  async function handleSwitchRole(identityKey: string) {
    setError(null);
    setBusy(true);
    try {
      const u = await loginWithDevIdentity(identityKey);
      notify({
        type: 'info',
        title: 'Active Signatory Changed',
        message: `${u.full_name} (${u.designation || u.role_code})`,
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormValidationError(null);
    setError(null);

    const cleanReason = reason.trim();
    if (cleanReason.length < 10) {
      setFormValidationError(
        'Mandatory justification must be at least 10 characters explaining the verified academic basis.'
      );
      return;
    }
    if (!Number.isInteger(Number(newMarks)) || newMarks < 0 || newMarks > 100) {
      setFormValidationError('Proposed marks must be an integer between 0 and 100.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{
        correction_request: any;
      }>('/api/corrections', {
        method: 'POST',
        body: JSON.stringify({
          result_id: selectedResultId,
          subject_code: selectedSubjectCode,
          new_marks: Number(newMarks),
          reason: cleanReason,
        }),
      });
      notify({
        type: 'success',
        title: 'Correction Request Registered',
        message: `Payload digest locked (${res.correction_request.payload_hash.slice(
          0,
          14
        )}...). Awaiting two independent Ed25519 signatures.`,
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignAndApprove(cr: any, overrideKeyHex?: string) {
    setError(null);
    setBusy(true);
    try {
      let keyToUse = (overrideKeyHex ?? privKeyHex).trim();

      // If key wasn't loaded yet (e.g. slow network after switching approver) and user didn't intentionally select the unregistered test key, fetch/verify it now
      if (!usingUnregisteredTestKey && !overrideKeyHex && user?.role === 'approver') {
        const derivedPub = keyToUse
          ? await getPublicKeyHexClientSide(keyToUse).catch(() => '')
          : '';
        if (!keyToUse || (user.public_key_hex && derivedPub !== user.public_key_hex.toLowerCase())) {
          const freshKey = await syncApproverKey();
          if (freshKey) {
            keyToUse = freshKey;
          }
        }
      }

      if (!keyToUse) {
        throw new Error(
          'Provide your 64-character hexadecimal Ed25519 signing key to authorize this request.'
        );
      }

      const payload: CorrectionApprovalPayload = cr.canonical_payload_json;
      const signatureHex = await signCorrectionPayloadClientSide(payload, keyToUse);

      const res = await apiFetch<{
        message: string;
        approvals_count: number;
        finalized: boolean;
      }>(`/api/corrections/${cr.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          signature_hex: signatureHex,
          auto_finalize: true,
        }),
      });

      notify({
        type: 'success',
        title: res.finalized
          ? 'Dual Authorization Complete — New Version Published'
          : 'First Ed25519 Signature Verified (1 of 2)',
        message: res.message,
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleAttemptSingleApprovalFinalize(correctionId: string) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/corrections/${correctionId}/finalize`, {
        method: 'POST',
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const selectedResultObj = results.find((r) => r.result_id === selectedResultId);
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const finalizedRequests = requests.filter((r) => r.status === 'finalized');

  return (
    <PageTransition className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header & Role Workspace Selector */}
      <div className="bg-white border border-stone-300 rounded p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
            <KeyRound className="w-3.5 h-3.5" />
            <span>
              Dual-Custody Result Modification Protocol • Session{' '}
              {INSTITUTION_CONTEXT.academicSession}
            </span>
          </div>
          <h1 className="ms-page-title text-zinc-900 mt-1">
            Two-Approver Correction Review &amp; Signature Console
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Post-publication mark changes require a mandatory reason and independent Ed25519 digital signatures from <strong>Dr. Meera Kapoor (APPROVER_1)</strong> and <strong>Dr. Karan Bedi (APPROVER_2)</strong>.
          </p>
        </div>

        {/* Signatory Switcher Strip */}
        <div className="bg-stone-50 p-3 rounded border border-stone-300 text-xs shrink-0">
          <div className="text-[11px] text-stone-500 font-semibold mb-1.5">
            Active Signatory Session:{' '}
            <strong className="text-zinc-900">
              {user?.full_name} ({user?.role_code})
            </strong>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleSwitchRole('demo-admin')}
              disabled={busy}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                user?.role_code === 'ADMIN'
                  ? 'bg-[#7F1D1D] text-white border-[#7F1D1D]'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
              }`}
            >
              Mr. Arjun Malhotra (ADMIN)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchRole('demo-approver-1')}
              disabled={busy}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                user?.role_code === 'APPROVER_1'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
              }`}
            >
              Dr. Meera Kapoor (APPROVER_1)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchRole('demo-approver-2')}
              disabled={busy}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                user?.role_code === 'APPROVER_2'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
              }`}
            >
              Dr. Karan Bedi (APPROVER_2)
            </button>
          </div>
        </div>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Pending Approvals Queue & Correction History */}
        <div className="lg:col-span-8 space-y-6">
          {/* Client-Side Ed25519 Key Panel */}
          <div className="bg-white border border-stone-300 rounded p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900">
                <Lock className="w-3.5 h-3.5 text-[#7F1D1D]" />
                <span>Client-Side Ed25519 Signing Key Custody</span>
              </div>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300">
                RFC 8032 Client-Side Signature
              </span>
            </div>
            <p className="text-xs text-stone-600 mb-3">
              The signing key is held exclusively in volatile browser memory to compute the
              128-character Ed25519 signature over the canonical payload. The server verifies
              the signature against the signatory&apos;s registered public key.
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => {
                  setUsingUnregisteredTestKey(false);
                  setPrivKeyHex(
                    '1111111111111111111111111111111111111111111111111111111111111111'
                  );
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                  privKeyHex ===
                  '1111111111111111111111111111111111111111111111111111111111111111'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-stone-100 hover:bg-stone-200 text-zinc-800 border-stone-300'
                }`}
              >
                Load Key: Dr. Meera Kapoor (APPROVER_1)
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsingUnregisteredTestKey(false);
                  setPrivKeyHex(
                    '2222222222222222222222222222222222222222222222222222222222222222'
                  );
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                  privKeyHex ===
                  '2222222222222222222222222222222222222222222222222222222222222222'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-stone-100 hover:bg-stone-200 text-zinc-800 border-stone-300'
                }`}
              >
                Load Key: Dr. Karan Bedi (APPROVER_2)
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsingUnregisteredTestKey(true);
                  setPrivKeyHex(
                    '9999999999999999999999999999999999999999999999999999999999999999'
                  );
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${
                  usingUnregisteredTestKey
                    ? 'bg-red-700 text-white border-red-700'
                    : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                }`}
              >
                Test Unregistered Key Rejection
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={privKeyHex}
                onChange={(e) => {
                  setPrivKeyHex(e.target.value);
                  setUsingUnregisteredTestKey(false);
                }}
                placeholder={
                  user?.role === 'approver'
                    ? '64-character hexadecimal Ed25519 private key...'
                    : 'Select an Approver identity above to load their signing key...'
                }
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded border border-stone-300 bg-stone-50"
              />
            </div>
            {usingUnregisteredTestKey && (
              <div className="mt-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-1.5">
                Unregistered test key (9999...9999) is currently loaded to demonstrate signature rejection. Click &ldquo;Restore My Registered Key&rdquo; above to sign with {user?.full_name}&apos;s valid registered key.
              </div>
            )}
          </div>

          {/* Pending Correction Requests Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700" />
                <span>Pending Correction Requests ({pendingRequests.length})</span>
              </h2>
              <span className="text-xs text-stone-500">
                Requires 2 distinct valid signatures to publish Version + 1
              </span>
            </div>

            {loading ? (
              <SkeletonTable rows={3} />
            ) : pendingRequests.length === 0 ? (
              <EmptyState
                title="No pending correction requests"
                description="All submitted correction requests have completed dual-custody authorization. Use the form on the right to register a new correction request."
              />
            ) : (
              pendingRequests.map((cr) => {
                const stu = cr.results?.students;
                const approvals = cr.correction_approvals || [];

                return (
                  <div
                    key={cr.id}
                    className="bg-white border-2 border-amber-400 rounded overflow-hidden"
                  >
                    {/* Top Status Banner */}
                    <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-300 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                        <Clock className="w-4 h-4 text-amber-700" />
                        <span>
                          AWAITING SECOND APPROVAL ({approvals.length} OF 2 SIGNATURES) —
                          CORRECTION NOT YET APPLIED
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-amber-900">
                        Published Record Remains at Version {cr.from_version} (Marks:{' '}
                        {cr.old_marks})
                      </span>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Student & Marks Comparison Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200">
                        <div>
                          <div className="text-xs font-mono font-bold text-[#7F1D1D]">
                            {stu?.roll_number} • B.Tech CSE (Semester 1)
                          </div>
                          <h3 className="text-base font-bold text-zinc-900 mt-0.5">
                            {stu?.full_name} — {cr.subject_code}: {cr.subject_name}
                          </h3>
                          <div className="text-xs text-stone-500 mt-0.5">
                            Initiated by:{' '}
                            <strong>
                              {cr.profiles?.full_name || 'Mr. Arjun Malhotra'}
                            </strong>
                          </div>
                        </div>

                        {/* Side-by-Side Original vs Proposed Marks */}
                        <div className="flex items-center gap-3 bg-stone-50 p-3 rounded border border-stone-300 shrink-0">
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase text-stone-500">
                              Original (v{cr.from_version})
                            </div>
                            <div className="text-lg font-mono font-bold text-zinc-900">
                              {cr.old_marks}/100
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-stone-400" />
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase text-[#7F1D1D]">
                              Proposed (v{cr.from_version + 1})
                            </div>
                            <div className="text-lg font-mono font-bold text-[#7F1D1D]">
                              {cr.new_marks}/100
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Mandatory Reason & Canonical Payload */}
                      <div className="p-3.5 rounded bg-stone-50 border border-stone-200 text-xs space-y-1.5">
                        <div>
                          <strong className="text-zinc-900 uppercase tracking-wider text-[11px]">
                            Mandatory Academic Reason:
                          </strong>{' '}
                          <span className="text-stone-800">{cr.reason}</span>
                        </div>
                        <div className="font-mono text-[11px] text-stone-500 break-all">
                          <strong className="text-stone-700">
                            Canonical Signing Payload:
                          </strong>{' '}
                          {cr.signing_message}
                        </div>
                      </div>

                      {/* Dual-Custody Approval Slots */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          {
                            slot: 1,
                            expectedTitle:
                              'Academic Approver — Dr. Meera Kapoor (Deputy Controller)',
                          },
                          {
                            slot: 2,
                            expectedTitle:
                              'Final Approver — Dr. Karan Bedi (Controller of Examinations)',
                          },
                        ].map((slotInfo, idx) => {
                          const app = approvals[idx];
                          return (
                            <div
                              key={slotInfo.slot}
                              className={`p-3.5 rounded border text-xs ${
                                app
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                  : 'bg-stone-50 border-dashed border-stone-300 text-stone-600'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span>Signatory Slot #{slotInfo.slot}</span>
                                {app ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                    VERIFIED SIGNATURE
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-amber-800 font-semibold">
                                    PENDING SIGNATURE
                                  </span>
                                )}
                              </div>
                              {app ? (
                                <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
                                  <div className="font-sans font-bold text-zinc-900">
                                    {app.profiles?.full_name || 'Authorized Approver'}
                                  </div>
                                  <div className="truncate text-stone-600">
                                    PubKey: {app.approver_public_key}
                                  </div>
                                  <div className="truncate text-emerald-800 font-semibold">
                                    Ed25519 Sig: {app.signature_hex}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-1.5 text-[11px] text-stone-500">
                                  Required Signatory: <strong>{slotInfo.expectedTitle}</strong>.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Footer */}
                      <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={() => handleAttemptSingleApprovalFinalize(cr.id)}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>
                            Verify Single-Approval Lock ({approvals.length}/2 Approvals)
                          </span>
                        </Button>

                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy || user?.role !== 'approver'}
                          onClick={() => handleSignAndApprove(cr)}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>
                            {user?.role === 'approver'
                              ? `Sign Payload & Authorize as ${user.full_name}`
                              : 'Select Approver 1 or Approver 2 Session Above to Sign'}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Finalized Correction History */}
          <div className="space-y-3 pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
              <History className="w-4 h-4 text-sky-700" />
              <span>
                Finalized Two-Approver Correction History ({finalizedRequests.length})
              </span>
            </h2>

            {finalizedRequests.length === 0 ? (
              <div className="bg-white border border-stone-300 rounded p-5 text-xs text-stone-500">
                No finalized corrections recorded in this session yet. Complete the second
                signature on <strong>Simran Kaur (REG-2026-CSE-002)</strong> above as{' '}
                <strong>Dr. Karan Bedi (APPROVER_2)</strong> to publish Version 2.
              </div>
            ) : (
              finalizedRequests.map((cr) => {
                const stu = cr.results?.students;
                const approvals = cr.correction_approvals || [];

                return (
                  <div
                    key={cr.id}
                    className="bg-white border border-stone-300 rounded p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-xs text-zinc-900">
                          {stu?.roll_number}
                        </span>{' '}
                        <span className="font-bold text-sm text-zinc-900">
                          — {stu?.full_name} ({cr.subject_code}: {cr.old_marks} →{' '}
                          {cr.new_marks})
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-300 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-700" />
                        <span>
                          VERSION {cr.finalized_version} PUBLISHED (v{cr.from_version}{' '}
                          PRESERVED)
                        </span>
                      </span>
                    </div>

                    <div className="text-xs text-stone-700">
                      <strong>Mandatory Reason:</strong> <em>{cr.reason}</em>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      {approvals.map((a: any, i: number) => (
                        <div
                          key={i}
                          className="p-2 rounded bg-stone-50 border border-stone-200 truncate"
                        >
                          <strong className="font-sans text-zinc-900">
                            Signatory #{i + 1}: {a.profiles?.full_name}
                          </strong>{' '}
                          • Sig: {a.signature_hex.slice(0, 20)}...
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-3 text-xs pt-1">
                      <Link
                        to={`/marksheet/${cr.result_id}`}
                        className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:underline"
                      >
                        <span>View v{cr.finalized_version} Transcript</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      <Link
                        to={`/verify/${cr.result_id}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#7F1D1D] hover:underline"
                      >
                        <span>Verify Signed Trail</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Initiate Correction Request Form (Admin) */}
        <div className="lg:col-span-4 bg-white border border-stone-300 rounded p-5 h-fit">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2 mb-1">
            <FileEdit className="w-4 h-4 text-[#7F1D1D]" />
            <span>Initiate Correction Request</span>
          </h2>
          <p className="text-xs text-stone-600 mb-4">
            Submitted by <strong>Mr. Arjun Malhotra (ADMIN)</strong>. Generates a deterministic
            canonical JSON payload requiring two distinct approver signatures.
          </p>

          <form onSubmit={handleCreateRequest} noValidate className="space-y-3.5">
            <FormField label="Student Examination Record" required>
              <select
                value={selectedResultId}
                onChange={(e) => setSelectedResultId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
              >
                {results.map((r) => (
                  <option key={r.result_id} value={r.result_id}>
                    {r.student.roll_number} — {r.student.full_name} (v{r.current_version})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Course Subject" required>
              <select
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
              >
                {(selectedResultObj?.field_diffs || []).map((f: any) => (
                  <option key={f.subject_code} value={f.subject_code}>
                    {f.subject_code} — {f.subject_name} (Published:{' '}
                    {f.verified_snapshot_marks}/100)
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Proposed New Marks (0–100)" required>
              <input
                type="number"
                min={0}
                max={100}
                required
                value={newMarks}
                onChange={(e) => setNewMarks(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-stone-300"
              />
            </FormField>

            <FormField
              label="Mandatory Academic Justification"
              required
              error={formValidationError}
            >
              <textarea
                rows={3}
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300"
              />
            </FormField>

            <Button
              type="submit"
              variant="secondary"
              disabled={busy || user?.role !== 'admin'}
              className="w-full"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {user?.role === 'admin'
                  ? 'Register Correction Request'
                  : 'Switch to Mr. Arjun Malhotra (ADMIN) to Submit'}
              </span>
            </Button>
          </form>
        </div>
      </div>
    </PageTransition>
  );
}
