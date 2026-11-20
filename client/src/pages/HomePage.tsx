import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  GitCommitHorizontal,
  History,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { MarkSureLogo } from '../components/brand/MarkSureLogo';
import { StatusBadge, VerificationStatus } from '../components/StatusBadge';
import { PageTransition } from '../components/ui/DesignSystem';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';

type PreviewStateKey = 'verified' | 'corrected' | 'tampered';

interface IllustrativeScenario {
  key: PreviewStateKey;
  tabLabel: string;
  status: VerificationStatus;
  studentName: string;
  regNo: string;
  version: number;
  sgpa: string;
  leafHash: string;
  merkleRoot: string;
  ed25519Sig: string;
  note: string;
  subjects: {
    code: string;
    name: string;
    credits: number;
    publishedMarks: number;
    liveMarks: number;
    grade: string;
    changed?: 'corrected' | 'tampered';
    priorMarks?: number;
  }[];
}

const PREVIEW_SCENARIOS: Record<PreviewStateKey, IllustrativeScenario> = {
  verified: {
    key: 'verified',
    tabLabel: 'Verified Record',
    status: 'VERIFIED',
    studentName: 'Harnoor Singh',
    regNo: 'REG-2026-CSE-001',
    version: 1,
    sgpa: '9.40',
    leafHash: '7c4e91a0d8f23b61e5094a2c8d1f703b9a4c62e1d5f803a7b2c9e410d6f8a312',
    merkleRoot: '9f2a84c1e7b03d56a9124e8f0c3b75d2e6a194c8b3f07d25e9a1c64b8d0f3e71',
    ed25519Sig: '4b8e21c9a0f73d65e19284c0b7a3f5d1e8c692a4b0f37d15c9e824a6f0b3d719',
    note: 'Live database record matches the SHA-256 Merkle leaf and Ed25519 institutional signature.',
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', credits: 4, publishedMarks: 88, liveMarks: 88, grade: 'A+' },
      { code: 'MTH165', name: 'Engineering Mathematics', credits: 4, publishedMarks: 84, liveMarks: 84, grade: 'A+' },
      { code: 'PHY109', name: 'Applied Physics', credits: 4, publishedMarks: 79, liveMarks: 79, grade: 'A' },
      { code: 'CSE102', name: 'Computer Programming Lab', credits: 2, publishedMarks: 94, liveMarks: 94, grade: 'O' },
    ],
  },
  corrected: {
    key: 'corrected',
    tabLabel: 'Dual-Approval Correction',
    status: 'CORRECTED',
    studentName: 'Simran Kaur',
    regNo: 'REG-2026-CSE-002',
    version: 2,
    sgpa: '9.15',
    leafHash: '3a9d62f1c8e04b75a2193c8d0e6f41b7c9a285d3e0f714b6a8c9d203f5e1b740',
    merkleRoot: '6d1c85a3f9e02b47c8192d6e0a4f73b5c8e192a4d0f637b9e2c184a5f0d3b692',
    ed25519Sig: '8c3f19a4e7b02d65c9183e4f0a7b25d1c6e984a2b0f735d9e1c482a6f0b3d518',
    note: 'Authorized v1 → v2 revision signed independently by Academic Approver and Final Approver. Version 1 snapshot remains preserved.',
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', credits: 4, publishedMarks: 85, liveMarks: 85, grade: 'A+' },
      { code: 'MTH165', name: 'Engineering Mathematics', credits: 4, publishedMarks: 84, liveMarks: 84, grade: 'A+', changed: 'corrected', priorMarks: 76 },
      { code: 'PHY109', name: 'Applied Physics', credits: 4, publishedMarks: 82, liveMarks: 82, grade: 'A+' },
      { code: 'CSE102', name: 'Computer Programming Lab', credits: 2, publishedMarks: 90, liveMarks: 90, grade: 'O' },
    ],
  },
  tampered: {
    key: 'tampered',
    tabLabel: 'Tamper Detection',
    status: 'TAMPERED',
    studentName: 'Arshdeep Gill',
    regNo: 'REG-2026-CSE-003',
    version: 1,
    sgpa: '8.10',
    leafHash: '5e8b14c9a2f07d63e19482c0b5a7f3d9e6c184a2b0f735d1c9e824a6f0b3d714',
    merkleRoot: '9f2a84c1e7b03d56a9124e8f0c3b75d2e6a194c8b3f07d25e9a1c64b8d0f3e71',
    ed25519Sig: '4b8e21c9a0f73d65e19284c0b7a3f5d1e8c692a4b0f37d15c9e824a6f0b3d719',
    note: 'Unapproved direct database edit detected on CSE101 (Signed snapshot: 68 vs. Current DB: 92). Original institutional signature remains valid.',
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', credits: 4, publishedMarks: 68, liveMarks: 92, grade: 'B+', changed: 'tampered' },
      { code: 'MTH165', name: 'Engineering Mathematics', credits: 4, publishedMarks: 74, liveMarks: 74, grade: 'A' },
      { code: 'PHY109', name: 'Applied Physics', credits: 4, publishedMarks: 71, liveMarks: 71, grade: 'A' },
      { code: 'CSE102', name: 'Computer Programming Lab', credits: 2, publishedMarks: 82, liveMarks: 82, grade: 'A+' },
    ],
  },
};

export function HomePage() {
  const { user } = useAuth();
  const [previewKey, setPreviewKey] = useState<PreviewStateKey>('verified');
  const [liveDirectory, setLiveDirectory] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<{ published_results: any[] }>('/api/verify')
      .then((res) => setLiveDirectory(res.published_results || []))
      .catch(() => {});
  }, []);

  const activePreview = PREVIEW_SCENARIOS[previewKey];

  // Match real database record UUID if available for direct 1-click live verification
  const matchingLiveRecord = liveDirectory.find(
    (r) => r.roll_number === activePreview.regNo
  );
  const liveVerifyUrl = matchingLiveRecord
    ? `/verify/${matchingLiveRecord.result_id}?v=${matchingLiveRecord.current_version}&leaf=${matchingLiveRecord.latest_leaf_hash}`
    : '/verify';

  const workspacePath = user
    ? user.role === 'student'
      ? '/student'
      : user.role === 'approver'
      ? '/corrections'
      : '/registry'
    : '/login';

  return (
    <PageTransition className="space-y-12 pb-16">
      {/* ====================================================================
          PHASE 3 — HERO SECTION
          ==================================================================== */}
      <section className="bg-white border-b border-stone-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Editorial Brand Positioning & CTAs */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-stone-100 border border-stone-300">
                <span className="w-2 h-2 rounded-full bg-[#7F1D1D]" />
                <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-zinc-900">
                  ACADEMIC RECORDS INTEGRITY PLATFORM
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="ms-hero-heading text-zinc-900">
                  Academic results.
                  <br />
                  <span className="text-[#7F1D1D]">Verified.</span> Protected.
                  Trusted.
                </h1>
                <p className="text-lg sm:text-xl font-semibold text-stone-800 tracking-tight">
                  Every result has a record. Every change has proof.
                </p>
              </div>

              <p className="ms-body-lg text-stone-600 max-w-xl">
                Publish, verify and manage academic results with cryptographic
                integrity, transparent correction approvals and independently
                verifiable records.
              </p>

              {/* Primary & Secondary CTAs */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <Link
                  to="/verify"
                  className="inline-flex items-center justify-center gap-2.5 bg-[#7F1D1D] hover:bg-[#651717] active:translate-y-px text-white font-bold text-base px-6 py-3.5 rounded-md shadow-xs transition"
                >
                  <FileCheck2 className="w-5 h-5" />
                  <span>Verify a Result</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  to={workspacePath}
                  className="inline-flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:translate-y-px text-white font-semibold text-base px-6 py-3.5 rounded-md transition"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {user
                      ? `Open ${user.role_code} Workspace`
                      : 'Institutional Access'}
                  </span>
                </Link>
              </div>

              {/* Concise Trust-Focused Feature Row */}
              <div className="pt-5 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#7F1D1D] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-zinc-900">
                      Cryptographic verification
                    </div>
                    <div className="text-xs text-stone-600 mt-0.5">
                      SHA-256 Merkle proofs &amp; Ed25519 signatures
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <KeyRound className="w-5 h-5 text-[#7F1D1D] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-zinc-900">
                      Dual-approval corrections
                    </div>
                    <div className="text-xs text-stone-600 mt-0.5">
                      Two distinct signatories &amp; mandatory reason
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <History className="w-5 h-5 text-[#7F1D1D] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-zinc-900">
                      Verifiable publication history
                    </div>
                    <div className="text-xs text-stone-600 mt-0.5">
                      Preserved snapshots &amp; hash-chained ledger
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Layered Product Interface Visual */}
            <div className="lg:col-span-6">
              <div className="bg-[#F6F5F1] border border-stone-300 rounded-xl p-4 sm:p-5 space-y-4">
                {/* Interactive Architecture State Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-stone-600">
                    Interactive Architecture Preview
                  </span>
                  <div className="inline-flex rounded-md bg-white border border-stone-300 p-0.5">
                    {(
                      ['verified', 'corrected', 'tampered'] as PreviewStateKey[]
                    ).map((k) => {
                      const item = PREVIEW_SCENARIOS[k];
                      const active = previewKey === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setPreviewKey(k)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-zinc-900 text-white'
                              : 'text-stone-700 hover:text-zinc-900'
                          }`}
                        >
                          {item.tabLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* LAYER 1: Academic Result Document Card */}
                <div className="bg-white border-2 border-zinc-900 rounded-lg overflow-hidden shadow-xs">
                  {/* Document Header */}
                  <div className="px-4 py-3.5 bg-stone-50 border-b-2 border-[#7F1D1D] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <MarkSureLogo variant="icon" size="sm" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
                          {INSTITUTION_CONTEXT.institutionLabel}
                        </div>
                        <div className="text-sm font-bold text-zinc-900">
                          Statement of Academic Grades • Session{' '}
                          {INSTITUTION_CONTEXT.academicSession}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={activePreview.status} />
                  </div>

                  {/* Student Metadata Strip */}
                  <div className="px-4 py-2.5 bg-stone-100/70 border-b border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-stone-500 block text-[11px]">
                        Student
                      </span>
                      <strong className="text-zinc-900">
                        {activePreview.studentName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[11px]">
                        Registration No
                      </span>
                      <strong className="font-mono text-zinc-900">
                        {activePreview.regNo}
                      </strong>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[11px]">
                        Publication Version
                      </span>
                      <strong className="font-mono text-zinc-900">
                        Version {activePreview.version}
                      </strong>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[11px]">
                        Verified SGPA
                      </span>
                      <strong className="font-mono text-[#7F1D1D]">
                        {activePreview.sgpa} / 10.00
                      </strong>
                    </div>
                  </div>

                  {/* Subject Marks Mini Table */}
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-stone-300 text-[11px] font-bold uppercase text-stone-600">
                            <th className="py-1.5 pr-2">Course</th>
                            <th className="py-1.5 px-2 text-center">Signed</th>
                            <th className="py-1.5 px-2 text-center">Live DB</th>
                            <th className="py-1.5 pl-2 text-right">Integrity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200">
                          {activePreview.subjects.map((sub) => (
                            <tr
                              key={sub.code}
                              className={
                                sub.changed === 'tampered'
                                  ? 'bg-red-50 font-semibold'
                                  : sub.changed === 'corrected'
                                  ? 'bg-sky-50/70'
                                  : ''
                              }
                            >
                              <td className="py-2 pr-2">
                                <span className="font-mono font-bold text-zinc-900">
                                  {sub.code}
                                </span>{' '}
                                <span className="text-stone-700">
                                  {sub.name}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center font-mono font-bold text-emerald-900">
                                {sub.publishedMarks}/100
                              </td>
                              <td
                                className={`py-2 px-2 text-center font-mono font-bold ${
                                  sub.changed === 'tampered'
                                    ? 'text-red-700'
                                    : 'text-zinc-900'
                                }`}
                              >
                                {sub.liveMarks}/100
                              </td>
                              <td className="py-2 pl-2 text-right font-mono text-[11px]">
                                {sub.changed === 'tampered' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-bold">
                                    MISMATCH ({sub.publishedMarks}→{sub.liveMarks})
                                  </span>
                                ) : sub.changed === 'corrected' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold">
                                    2-SIG ({sub.priorMarks}→{sub.publishedMarks})
                                  </span>
                                ) : (
                                  <span className="text-emerald-800 font-semibold">
                                    ✓ MATCH
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Status Note */}
                    <div
                      className={`mt-3 p-2.5 rounded border text-xs flex items-start gap-2 ${
                        activePreview.status === 'TAMPERED'
                          ? 'bg-red-50 border-red-300 text-red-950'
                          : activePreview.status === 'CORRECTED'
                          ? 'bg-sky-50 border-sky-300 text-sky-950'
                          : 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                      }`}
                    >
                      {activePreview.status === 'TAMPERED' ? (
                        <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      )}
                      <span>{activePreview.note}</span>
                    </div>
                  </div>
                </div>

                {/* LAYER 2: Connected Cryptographic Proof & QR Card */}
                <div className="bg-zinc-900 text-stone-200 rounded-lg p-4 border border-zinc-800 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-9 space-y-1.5 font-mono text-xs">
                    <div className="flex items-center gap-2 font-sans font-bold text-xs uppercase tracking-wider text-[#FCA5A5]">
                      <GitCommitHorizontal className="w-4 h-4" />
                      <span>
                        Cryptographic Proof &amp; Signed Publication Manifest
                      </span>
                    </div>
                    <div className="truncate text-stone-300">
                      <span className="text-stone-400">SHA-256 Leaf:</span>{' '}
                      {activePreview.leafHash}
                    </div>
                    <div className="truncate text-stone-300">
                      <span className="text-stone-400">Merkle Root:</span>{' '}
                      {activePreview.merkleRoot}
                    </div>
                    <div className="truncate text-emerald-400">
                      <span className="text-stone-400">Ed25519 Sig:</span>{' '}
                      {activePreview.ed25519Sig}
                    </div>
                    <div className="pt-1 font-sans">
                      <Link
                        to={liveVerifyUrl}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white hover:text-[#FCA5A5] underline"
                      >
                        <span>
                          Inspect Live Record ({activePreview.regNo}) in Public
                          Verifier
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  <div className="sm:col-span-3 flex flex-col items-center justify-center bg-white p-2 rounded-md text-zinc-900">
                    <QRCodeSVG
                      value={`${window.location.origin}${liveVerifyUrl}`}
                      size={76}
                      level="M"
                    />
                    <span className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-800">
                      QR Verify
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          ARCHITECTURAL PILLARS SECTION
          ==================================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-300 pb-4">
          <div>
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F1D1D]">
              End-to-End Cryptographic Lifecycle
            </div>
            <h2 className="ms-section-heading text-zinc-900 mt-1">
              Engineered for Institutional Examination Integrity
            </h2>
          </div>
          <Link
            to="/verify"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#7F1D1D] hover:underline"
          >
            <span>Explore Live Published Directory</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-stone-300 rounded-lg p-6 space-y-3">
            <div className="w-10 h-10 rounded-md bg-[#7F1D1D]/10 border border-[#7F1D1D]/25 flex items-center justify-center text-[#7F1D1D] font-mono font-bold text-sm">
              01
            </div>
            <h3 className="ms-card-heading text-zinc-900">
              Deterministic Merkle Publishing
            </h3>
            <p className="text-base text-stone-600 leading-relaxed">
              Every student&apos;s semester marksheet is canonically serialized,
              hashed with domain-separated SHA-256, and anchored into a batch
              Merkle tree signed by the institution&apos;s Ed25519 key.
            </p>
          </div>

          <div className="bg-white border border-stone-300 rounded-lg p-6 space-y-3">
            <div className="w-10 h-10 rounded-md bg-[#7F1D1D]/10 border border-[#7F1D1D]/25 flex items-center justify-center text-[#7F1D1D] font-mono font-bold text-sm">
              02
            </div>
            <h3 className="ms-card-heading text-zinc-900">
              Dual-Custody Ed25519 Corrections
            </h3>
            <p className="text-base text-stone-600 leading-relaxed">
              Post-publication revisions require a mandatory reason and two
              independent Ed25519 signatures from distinct authorized
              signatories. All prior result versions remain preserved.
            </p>
          </div>

          <div className="bg-white border border-stone-300 rounded-lg p-6 space-y-3">
            <div className="w-10 h-10 rounded-md bg-[#7F1D1D]/10 border border-[#7F1D1D]/25 flex items-center justify-center text-[#7F1D1D] font-mono font-bold text-sm">
              03
            </div>
            <h3 className="ms-card-heading text-zinc-900">
              Direct Database Tampering Detection
            </h3>
            <p className="text-base text-stone-600 leading-relaxed">
              Scanning a printed marksheet QR code compares live database rows
              against the signed Merkle snapshot, pinpointing unauthorized
              direct SQL modifications down to the exact subject and mark.
            </p>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
