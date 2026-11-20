import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  UserCheck,
  CheckCircle2,
  Building2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';
import { Button, ErrorAlert, PageTransition } from '../components/ui/DesignSystem';

export function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const [healthInfo, setHealthInfo] = useState<any | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch('/api/health')
      .then((data) => setHealthInfo(data))
      .catch((err) => setError(err));
  }, []);

  if (!user) return null;

  const permissionsByRole: Record<string, string[]> = {
    ADMIN: [
      'Manage academic student directory and semester enrollments',
      'Publish canonical examination result batches and generate SHA-256 Merkle trees',
      'Initiate post-publication correction requests with mandatory justification',
      'Inspect live database integrity and chronological audit logs',
    ],
    APPROVER_1: [
      'Review pending correction requests as Primary Academic Signatory',
      'Verify original versus proposed marks and mandatory academic reason',
      'Execute first independent Ed25519 digital signature over canonical correction payloads',
      'Audit published batches and cryptographic verification logs',
    ],
    APPROVER_2: [
      'Review pending correction requests as Final Authorization Signatory',
      'Independently verify first signatory approval and correction justification',
      'Execute second distinct Ed25519 digital signature to authorize version publication',
      'Audit published batches and cryptographic verification logs',
    ],
    STUDENT: [
      'Access personal published semester examination results and SGPA summary',
      'Download or print official digital statement of grades with embedded QR verification',
      'Inspect version history and authorized two-approver correction records',
    ],
  };

  return (
    <PageTransition className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="bg-white border border-stone-300 rounded p-5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Identity, Session Security & Cryptographic Key Custody</span>
        </div>
        <h1 className="ms-page-title text-zinc-900 mt-1">
          Institutional Account &amp; Key Custody Settings
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Review your authenticated institutional profile, role-based access permissions,
          session security configuration, and registered Ed25519 public key fingerprint.
        </p>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Profile & Session Security */}
        <div className="lg:col-span-7 bg-white border border-stone-300 rounded p-5 space-y-5">
          <div className="pb-3.5 border-b border-stone-200 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#7F1D1D]" />
              <span>Authenticated Institutional Identity</span>
            </h2>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 text-[11px] font-bold">
              ACTIVE SESSION
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Full Name
              </div>
              <div className="font-bold text-sm text-zinc-900 mt-0.5">
                {user.full_name}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Designation
              </div>
              <div className="font-semibold text-zinc-900 mt-0.5">
                {user.designation || user.role_code}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Institutional Email
              </div>
              <div className="font-mono text-zinc-900 mt-0.5">{user.email}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Authorization Role Code
              </div>
              <div className="font-mono font-bold text-[#7F1D1D] mt-0.5">
                {user.role_code}
              </div>
            </div>
            {user.registration_id && (
              <div>
                <div className="text-[10px] font-bold uppercase text-stone-500">
                  Student Registration Number
                </div>
                <div className="font-mono font-bold text-zinc-900 mt-0.5">
                  {user.registration_id}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Academic Session
              </div>
              <div className="font-semibold text-zinc-900 mt-0.5">
                {INSTITUTION_CONTEXT.academicSession} ({INSTITUTION_CONTEXT.academicTermCode})
              </div>
            </div>
          </div>

          {/* Registered Ed25519 Public Key */}
          {user.public_key_hex && (
            <div className="p-3.5 rounded bg-stone-50 border border-stone-300 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-900">
                <KeyRound className="w-3.5 h-3.5 text-[#7F1D1D]" />
                <span>Registered Ed25519 Signatory Public Key (64-Char Hex)</span>
              </div>
              <div className="font-mono text-xs text-zinc-800 break-all">
                {user.public_key_hex}
              </div>
              <p className="text-[11px] text-stone-500 pt-1">
                All correction approvals submitted under your identity are cryptographically
                verified against this public key in <code className="font-mono">public.profiles</code>.
              </p>
            </div>
          )}

          {/* Role Permissions Matrix */}
          <div className="pt-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              Authorized Capabilities for {user.role_code}
            </div>
            <ul className="space-y-1.5 text-xs text-stone-700">
              {(permissionsByRole[user.role_code] || []).map((perm, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{perm}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
            <span className="text-[11px] text-stone-500">
              Session Token Custody: HttpOnly SameSite=Lax Cookie
            </span>
            <Button variant="outline" onClick={() => logout()}>
              <LogOut className="w-3.5 h-3.5" />
              <span>Terminate Active Session</span>
            </Button>
          </div>
        </div>

        {/* Right: Platform Cryptographic Registry Info */}
        <div className="lg:col-span-5 bg-white border border-stone-300 rounded p-5 space-y-4 h-fit">
          <div className="pb-3 border-b border-stone-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#7F1D1D]" />
              <span>Institutional Cryptographic Registry</span>
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Institution Identifier
              </div>
              <div className="font-mono font-bold text-zinc-900 mt-0.5">
                {healthInfo?.institution_id || 'MARKSURE-UNIV-01'}
              </div>
            </div>

            <div className="p-3 rounded bg-stone-50 border border-stone-200">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Institution Trusted Ed25519 Public Key
              </div>
              <div className="font-mono text-[11px] text-zinc-800 break-all mt-0.5">
                {healthInfo?.institution_public_key || 'Loading...'}
              </div>
            </div>

            <div className="p-3 rounded bg-stone-50 border border-stone-200 space-y-1">
              <div className="text-[10px] font-bold uppercase text-stone-500">
                Active Security Controls
              </div>
              <div className="text-[11px] text-stone-700 space-y-1 pt-0.5">
                <div>• Domain-separated SHA-256 leaf & internal node hashing</div>
                <div>• RFC 8032 Ed25519 manifest and dual-custody approval signing</div>
                <div>• Server-side RBAC enforcement across all protected endpoints</div>
                <div>• HttpOnly session cookies with no localStorage token storage</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
