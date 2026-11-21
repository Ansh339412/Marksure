import React, { createContext, useCallback, useContext, useEffect, useState, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { ApiError } from '../../lib/api';

/* ============================================================================
   1. PAGE TRANSITION WRAPPER (Respects prefers-reduced-motion via CSS)
   ============================================================================ */
export { PageTransition } from '../../motion/Motion';

/* ============================================================================
   2. BREADCRUMBS
   ============================================================================ */
export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-sm text-stone-600"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="hover:text-zinc-900 font-medium transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-bold text-zinc-900' : ''}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* ============================================================================
   3. BUTTON (15–16px comfortable touch targets + subtle press state)
   ============================================================================ */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses =
    size === 'sm'
      ? 'px-3 py-1.5 text-sm'
      : size === 'lg'
      ? 'px-6 py-3 text-base'
      : 'px-4 py-2 text-[15px]';

  const variantClasses = {
    primary: 'bg-[#7F1D1D] hover:bg-[#651717] text-white border border-[#7F1D1D]',
    secondary: 'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-900',
    outline:
      'bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300',
    danger:
      'bg-red-50 hover:bg-red-100 text-red-900 border border-red-300',
    ghost: 'bg-transparent hover:bg-stone-100 text-stone-700',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all active:translate-y-px cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#7F1D1D]/40 ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ============================================================================
   4. INPUT & SELECT WITH VALIDATION FEEDBACK
   ============================================================================ */
export function FormField({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-800 mb-1.5">
        {label}
        {required && <span className="text-[#7F1D1D] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[13px] text-stone-500 mt-1.5">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-red-700 font-semibold mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

/* ============================================================================
   5. MODAL & CONFIRMATION DIALOG
   ============================================================================ */
export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) { dialog.close(); return; }
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      }}
      className={`ms-dialog bg-white border border-stone-300 rounded-xl w-full ${maxWidth} p-0 text-zinc-900`}>
      <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
        <h3 id={titleId} className="text-base font-bold">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Close modal" className="p-2 rounded"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm Action',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} maxWidth="max-w-md">
      <p className="text-[15px] text-stone-700 leading-relaxed">{description}</p>
      <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-end gap-2.5">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Processing...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ============================================================================
   6. CENTRALIZED API ERROR & ALERT BANNER
   ============================================================================ */
export function ErrorAlert({
  error,
  onRetry,
  onDismiss,
}: {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  if (!error) return null;

  const isApiErr = error instanceof ApiError;
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred.';
  const status = isApiErr ? error.status : undefined;
  const code = isApiErr ? error.code : undefined;
  const refId = isApiErr ? error.referenceId : undefined;

  return (
    <div
      role="alert"
      className="p-4 rounded-lg bg-red-50 border border-red-300 text-red-950 text-sm flex items-start justify-between gap-3"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold flex flex-wrap items-center gap-2">
            <span>{message}</span>
            {status && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-900">
                HTTP {status} {code ? `• ${code}` : ''}
              </span>
            )}
          </div>
          {refId && (
            <div className="font-mono text-xs text-red-800">
              Diagnostic Reference ID: {refId}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-red-100 text-red-900 border border-red-300 text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss alert"
            className="p-1 text-red-700 hover:bg-red-100 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   7. SKELETON LOADERS & EMPTY STATES
   ============================================================================ */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading records"
      className="bg-white border border-stone-300 rounded-lg overflow-hidden divide-y divide-stone-200"
    >
      <div className="p-4 bg-stone-100 flex items-center justify-between">
        <div className="h-4 w-52 bg-stone-300 rounded animate-pulse" />
        <div className="h-4 w-32 bg-stone-300 rounded animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-4">
          <div className="h-4 w-36 bg-stone-200 rounded animate-pulse" />
          <div className="h-4 w-44 bg-stone-200 rounded animate-pulse" />
          <div className="h-4 flex-1 bg-stone-200 rounded animate-pulse" />
          <div className="h-6 w-28 bg-stone-200 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ms-content-enter p-10 text-center bg-white border border-stone-300 rounded-lg">
      <Info className="w-8 h-8 text-stone-400 mx-auto mb-2.5" />
      <h3 className="text-base font-bold text-zinc-900">{title}</h3>
      <p className="text-sm text-stone-600 mt-1 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ============================================================================
   8. PAGINATION
   ============================================================================ */
export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);

  return (
    <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
      <div>
        Showing <strong className="text-zinc-900 font-mono">{start}</strong> to{' '}
        <strong className="text-zinc-900 font-mono">{end}</strong> of{' '}
        <strong className="text-zinc-900 font-mono">{totalItems}</strong> records
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-stone-300 text-zinc-800 text-sm font-semibold disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>
        <span className="font-mono text-sm px-2">
          Page {currentPage} of {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-stone-300 text-zinc-800 text-sm font-semibold disabled:opacity-40 cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   9. TOAST NOTIFICATION SYSTEM
   ============================================================================ */
export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

interface ToastContextValue {
  notify: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const notify = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
    timers.current.add(timer);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`ms-toast-enter pointer-events-auto p-4 rounded-lg border shadow-md flex items-start justify-between gap-3 text-sm ${
              t.type === 'success'
                ? 'bg-white border-emerald-400 text-zinc-900'
                : t.type === 'error'
                ? 'bg-white border-red-400 text-zinc-900'
                : t.type === 'warning'
                ? 'bg-white border-amber-400 text-zinc-900'
                : 'bg-white border-stone-300 text-zinc-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {t.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              ) : t.type === 'error' ? (
                <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{t.title}</div>
                {t.message && (
                  <div className="text-stone-600 text-[13px] mt-0.5 leading-snug">
                    {t.message}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Close notification"
              className="text-stone-400 hover:text-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      notify: () => {},
    };
  }
  return ctx;
}
