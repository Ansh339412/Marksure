import { Link, useNavigate } from 'react-router-dom';
import {
  FileQuestion,
  ShieldAlert,
  ServerCrash,
  WifiOff,
  ArrowLeft,
  Home,
  RefreshCw,
} from 'lucide-react';
import { PageTransition } from '../components/ui/DesignSystem';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <PageTransition className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-white border border-stone-300 rounded p-8 text-center">
        <div className="w-12 h-12 rounded bg-stone-100 border border-stone-300 flex items-center justify-center mx-auto mb-4 text-zinc-800">
          <FileQuestion className="w-6 h-6" />
        </div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#7F1D1D]">
          HTTP 404 • Resource Not Found
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mt-1">Page not found</h1>
        <p className="text-xs text-stone-600 mt-2 max-w-md mx-auto leading-relaxed">
          The academic record, verification endpoint, or administrative workspace URL you
          requested does not exist or may have been relocated.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Previous View</span>
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#7F1D1D] hover:bg-[#651717] text-white text-xs font-bold transition"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Go to Workspace Home</span>
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}

export function ForbiddenPage({
  requiredRole,
}: {
  requiredRole?: string;
}) {
  return (
    <PageTransition className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-white border border-red-300 rounded p-8 text-center">
        <div className="w-12 h-12 rounded bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4 text-red-800">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-800">
          HTTP 403 • Authorization Restricted
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mt-1">
          Access to this workspace is restricted
        </h1>
        <p className="text-xs text-stone-600 mt-2 max-w-md mx-auto leading-relaxed">
          Your current institutional account does not hold the required role permissions
          {requiredRole ? ` (${requiredRole})` : ''} to view or modify this section. All
          unauthorized access attempts are logged.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Authorized Workspace</span>
          </Link>
          <Link
            to="/verify"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 text-xs font-semibold transition"
          >
            <span>Public Verification Portal</span>
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}

export function ServerErrorPage({
  referenceId,
  onRetry,
}: {
  referenceId?: string;
  onRetry?: () => void;
}) {
  return (
    <PageTransition className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-white border border-stone-300 rounded p-8 text-center">
        <div className="w-12 h-12 rounded bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4 text-red-800">
          <ServerCrash className="w-6 h-6" />
        </div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-800">
          HTTP 500 • System Processing Error
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mt-1">
          Unable to complete the requested operation
        </h1>
        <p className="text-xs text-stone-600 mt-2 max-w-md mx-auto leading-relaxed">
          An unexpected fault occurred while processing the academic registry request. No
          unpublished changes were committed.
        </p>
        {referenceId && (
          <div className="mt-4 inline-block px-3 py-1 rounded bg-stone-100 border border-stone-300 font-mono text-[11px] text-stone-700">
            Support Reference Identifier: <strong>{referenceId}</strong>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#7F1D1D] hover:bg-[#651717] text-white text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Operation</span>
            </button>
          )}
          <a
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 text-xs font-semibold transition"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Home</span>
          </a>
        </div>
      </div>
    </PageTransition>
  );
}

export function ServiceUnavailablePage({ onRetry }: { onRetry?: () => void }) {
  return (
    <PageTransition className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-white border border-amber-300 rounded p-8 text-center">
        <div className="w-12 h-12 rounded bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-800">
          <WifiOff className="w-6 h-6" />
        </div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-900">
          HTTP 503 • Service Temporarily Unavailable
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mt-1">
          Examination registry service is currently unreachable
        </h1>
        <p className="text-xs text-stone-600 mt-2 max-w-md mx-auto leading-relaxed">
          The platform could not establish a connection with the examination verification
          service. This may be due to temporary network interruption or scheduled
          maintenance.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#7F1D1D] hover:bg-[#651717] text-white text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
