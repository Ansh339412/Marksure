import {
  CheckCircle2,
  FileCheck2,
  ShieldAlert,
  AlertOctagon,
  Clock,
} from 'lucide-react';

export type VerificationStatus =
  | 'VERIFIED'
  | 'CORRECTED'
  | 'TAMPERED'
  | 'INVALID_SIGNATURE';

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: VerificationStatus;
  size?: 'sm' | 'lg';
}) {
  const isLg = size === 'lg';
  const baseClass = isLg
    ? 'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-bold uppercase tracking-wider border'
    : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border';

  switch (status) {
    case 'VERIFIED':
      return (
        <span
          className={`${baseClass} bg-emerald-50 text-emerald-900 border-emerald-300`}
        >
          <CheckCircle2
            className={isLg ? 'w-4 h-4 text-emerald-700' : 'w-3.5 h-3.5 text-emerald-700'}
          />
          <span>VERIFIED</span>
        </span>
      );
    case 'CORRECTED':
      return (
        <span
          className={`${baseClass} bg-sky-50 text-sky-900 border-sky-300`}
        >
          <FileCheck2
            className={isLg ? 'w-4 h-4 text-sky-700' : 'w-3.5 h-3.5 text-sky-700'}
          />
          <span>CORRECTED (2 SIGNATURES)</span>
        </span>
      );
    case 'TAMPERED':
      return (
        <span
          className={`${baseClass} bg-red-50 text-red-900 border-red-400`}
        >
          <ShieldAlert
            className={isLg ? 'w-4 h-4 text-red-700' : 'w-3.5 h-3.5 text-red-700'}
          />
          <span>TAMPERED</span>
        </span>
      );
    case 'INVALID_SIGNATURE':
      return (
        <span
          className={`${baseClass} bg-red-100 text-red-950 border-red-500`}
        >
          <AlertOctagon
            className={isLg ? 'w-4 h-4 text-red-800' : 'w-3.5 h-3.5 text-red-800'}
          />
          <span>INVALID SIGNATURE</span>
        </span>
      );
  }
}

export function PendingApprovalBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-300">
      <Clock className="w-3.5 h-3.5 text-amber-700" />
      <span>PENDING CORRECTION ({count}/2 SIGNED)</span>
    </span>
  );
}
