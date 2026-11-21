import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

/**
 * Custom Animated MarkSure Symbol SVG
 *
 * Construction Sequence:
 * 1. Geometric document folio outline draws itself via SVG stroke-dashoffset.
 * 2. Internal cryptographic record bars and Merkle leaf node appear in sequence.
 * 3. Verification checkmark draws itself smoothly into the root vertex.
 * 4. Subtle root-node pulse indicates active cryptographic processing.
 */
export function AnimatedMarkSureSymbol({
  size = 56,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="10"
        fill="#7F1D1D"
        className="ms-loader-container"
      />
      {/* Step 1: Geometric Document Outline */}
      <path
        d="M13 9H28L35 16V36C35 37.6569 33.6569 39 32 39H13C11.3431 39 10 37.6569 10 36V12C10 10.3431 11.3431 9 13 9Z"
        stroke="#FAF9F6"
        strokeWidth="2.4"
        strokeLinejoin="round"
        pathLength="100"
        className="ms-loader-folio"
      />
      <path
        d="M28 9V16H35"
        stroke="#FAF9F6"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="100"
        className="ms-loader-corner"
      />
      {/* Step 2: Internal Record Lines & Merkle Node */}
      <line
        x1="15"
        y1="16"
        x2="23"
        y2="16"
        stroke="#FCA5A5"
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength="100"
        className="ms-loader-line-1"
      />
      <line
        x1="15"
        y1="22"
        x2="21"
        y2="22"
        stroke="#FCA5A5"
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength="100"
        className="ms-loader-line-2"
      />
      <circle
        cx="15.5"
        cy="29.5"
        r="2"
        fill="#FCA5A5"
        className="ms-loader-node-1"
      />
      {/* Step 3: Verification Checkmark */}
      <path
        d="M17.5 29.5L22 34L32 22"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="100"
        className="ms-loader-check"
      />
      {/* Step 4: Cryptographic Root Vertex */}
      <circle
        cx="32"
        cy="22"
        r="2.2"
        fill="#34D399"
        className="ms-loader-root-dot"
      />
    </svg>
  );
}

/**
 * Intelligent Delayed Visibility Hook
 * Avoids flashing full-section loaders on fast (< 300ms) operations.
 */
export function useDelayedVisibility(active: boolean, delayMs = 300): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}

/**
 * FORM A: Initial Application Loader
 * Displayed during initial application startup & session verification.
 */
export function InitialAppLoader({
  message = 'Securing your academic records',
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="p-4 rounded-2xl bg-white border border-stone-300 shadow-xs">
        <AnimatedMarkSureSymbol size={64} />
      </div>
      <div className="mt-5 font-extrabold text-2xl tracking-tight text-zinc-900">
        Mark<span className="text-[#7F1D1D]">Sure</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-stone-600">{message}</p>
      <div className="mt-2 font-mono text-xs text-stone-400 uppercase tracking-widest">
        SHA-256 Merkle Tree • Ed25519 Verification
      </div>
    </div>
  );
}

/**
 * FORM B: Compact Inline Loader
 * Used inside buttons, cards, and action controls.
 */
export function InlineMarkSureLoader({
  size = 20,
  label,
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2"
    >
      <AnimatedMarkSureSymbol size={size} />
      {label && <span className="text-sm font-medium">{label}</span>}
    </span>
  );
}

/**
 * FORM C: Section Transition Loader
 * Smoothly appears only when a section data fetch takes longer than delayMs.
 */
export function SectionTransitionLoader({
  active = true,
  delayMs = 280,
  title = 'Synchronizing examination registry',
  subtitle = 'Verifying cryptographic hashes and institutional records...',
}: {
  active?: boolean;
  delayMs?: number;
  title?: string;
  subtitle?: string;
}) {
  const show = useDelayedVisibility(active, delayMs);
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="ms-page-enter bg-white border border-stone-300 rounded-lg p-8 flex flex-col items-center justify-center text-center my-4"
    >
      <AnimatedMarkSureSymbol size={48} />
      <div className="mt-4 font-bold text-base text-zinc-900">{title}</div>
      <p className="mt-1 text-sm text-stone-600 max-w-md">{subtitle}</p>
    </div>
  );
}

/**
 * SPECIALIZED VERIFICATION SEQUENCE PANEL
 * Maps strictly to real backend verification steps and actual backend verification outcomes.
 * Never marks a step as successful if the backend reports failure or tampering.
 */
export function VerificationSequencePanel({
  loading,
  report,
}: {
  loading: boolean;
  report: { current_version: number; student?: { roll_number: string }; signature_valid: boolean; merkle_proof_valid: boolean; leaf_index: number; direct_db_tampering_detected: boolean; tampered_fields?: unknown[]; verification_status: string } | null;
}) {
  if (loading) return (
    <div role="status" className="ms-verification-wait bg-white border border-stone-300 rounded-lg p-6 flex items-center gap-4">
      <AnimatedMarkSureSymbol size={42} />
      <div><h3 className="font-bold">Verifying the published record</h3>
      <p className="text-sm text-stone-600">Awaiting the server's signature, Merkle proof and record comparison results.</p>
      <div className="ms-progress-track" aria-hidden="true"><span /></div></div>
    </div>
  );
  if (!report) return null;

  const steps = [
    {
      label: 'Retrieving published record',
      detail: report
        ? `Snapshot v${report.current_version} retrieved (${report.student?.roll_number})`
        : 'Fetching immutable snapshot and publication manifest...',
      status: report
        ? 'done'
        : 'failed',
    },
    {
      label: 'Checking institutional signature',
      detail: report
        ? report.signature_valid
          ? 'Ed25519 signature verified against trusted institutional public key'
          : 'Ed25519 signature verification failed'
        : 'Validating RFC 8032 Ed25519 manifest signature...',
      status: report?.signature_valid
        ? 'done'
        : 'failed',
    },
    {
      label: 'Validating Merkle inclusion proof',
      detail: report
        ? report.merkle_proof_valid
          ? `Leaf #${report.leaf_index} hashes cleanly to signed Merkle root`
          : 'Merkle proof path failed against batch root'
        : 'Recomputing SHA-256 leaf digest and sibling hashes...',
      status: report?.merkle_proof_valid
        ? 'done'
        : 'failed',
    },
    {
      label: 'Comparing the current record',
      detail: report
        ? !report.direct_db_tampering_detected
          ? 'All live database subject marks match the signed snapshot'
          : `Mismatch detected: ${report.tampered_fields?.length || 1} subject field(s) altered in live database`
        : 'Auditing live database fields against preserved snapshot...',
      status: report.direct_db_tampering_detected ? 'tampered' : 'done',
    },
    {
      label: 'Final verification result',
      detail: `Final verdict: ${report.verification_status}`,
      status: report?.verification_status === 'VERIFIED' ||
          report?.verification_status === 'CORRECTED'
        ? 'done'
        : 'tampered',
    },
  ];

  return (
    <div className="ms-content-enter bg-white border border-stone-300 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <AnimatedMarkSureSymbol size={36} className="ms-loader-static" />
          <div>
            <h3 className="text-base font-bold text-zinc-900">
              {loading
                ? 'Executing Cryptographic Verification Sequence...'
                : 'Cryptographic Verification Pipeline Complete'}
            </h3>
            <p className="text-sm text-stone-600">
              Five-stage independent verification against signed Merkle ledger and live database
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const isDone = step.status === 'done';
          const isFailed = step.status === 'failed' || step.status === 'tampered';
          const isActive = step.status === 'active';

          return (
            <div
              key={idx}
              className={`p-3.5 rounded-lg border transition-colors ${
                isDone
                  ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                  : isFailed
                  ? 'bg-red-50/80 border-red-400 text-red-950'
                  : isActive
                  ? 'bg-stone-100 border-zinc-900 text-zinc-900'
                  : 'bg-stone-50 border-stone-200 text-stone-500'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono text-xs font-bold uppercase">
                  Step 0{idx + 1}
                </span>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : isFailed ? (
                  step.status === 'tampered' ? (
                    <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                  )
                ) : isActive ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7F1D1D] animate-ping" />
                ) : null}
              </div>
              <div className="font-bold text-sm leading-snug">{step.label}</div>
              <div className="text-xs mt-1 opacity-85 leading-relaxed">
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
