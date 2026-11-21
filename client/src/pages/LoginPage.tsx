import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  ArrowRight,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';
import {
  Button,
  ErrorAlert,
  FormField,
  PageTransition,
  useToast,
} from '../components/ui/DesignSystem';
import { MarkSureLogo } from '../components/brand/MarkSureLogo';
import { InlineMarkSureLoader } from '../components/brand/MarkSureLoader';

interface ConfiguredIdentity {
  identity_key: string;
  email: string;
  full_name: string;
  designation: string;
  department?: string;
  role: string;
  role_code: 'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT';
  registration_id?: string;
  public_key_hex: string | null;
}

const ROLE_WORKSPACE_METADATA: Record<
  'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT',
  {
    roleTitle: string;
    targetPath: string;
    responsibilities: string[];
  }
> = {
  ADMIN: {
    roleTitle: 'Examination Administrator',
    targetPath: '/registry',
    responsibilities: [
      'Manage academic student records and semester enrollments.',
      'Publish examination result batches and generate SHA-256 Merkle roots.',
      'Initiate post-publication correction requests with mandatory justification.',
      'Review publication history and chronological audit logs.',
    ],
  },
  APPROVER_1: {
    roleTitle: 'Academic Approver',
    targetPath: '/corrections',
    responsibilities: [
      'Review submitted post-publication correction requests.',
      'Inspect original published marks and proposed marks.',
      'Verify the mandatory academic correction reason.',
      'Independently sign the canonical correction payload using the primary Ed25519 key.',
    ],
  },
  APPROVER_2: {
    roleTitle: 'Final Approver',
    targetPath: '/corrections',
    responsibilities: [
      'Review correction requests that have completed primary academic review.',
      'Independently verify the correction details and first signatory approval.',
      'Provide the second distinct Ed25519 digital signature.',
      'Authorize publication of the new result version only after both approvals are valid.',
    ],
  },
  STUDENT: {
    roleTitle: 'Student',
    targetPath: '/student',
    responsibilities: [
      'View published semester examination results and SGPA summary.',
      'Access and print the official digital statement of grades.',
      'Verify academic transcripts independently using QR codes.',
      'Inspect version history and authorized correction records.',
    ],
  },
};

const DEFAULT_HACKATHON_IDENTITIES: ConfiguredIdentity[] = [
  {
    identity_key: 'demo-admin',
    email: 'admin@marksure.edu',
    full_name: 'Mr. Arjun Malhotra',
    designation: 'Assistant Registrar (Examinations)',
    department: 'Division of Examination Operations',
    role: 'admin',
    role_code: 'ADMIN',
    public_key_hex: null,
  },
  {
    identity_key: 'demo-approver-1',
    email: 'dean.exams@marksure.edu',
    full_name: 'Dr. Meera Kapoor',
    designation: 'Deputy Controller of Examinations',
    department: 'Academic Scrutiny & Review Board',
    role: 'approver',
    role_code: 'APPROVER_1',
    public_key_hex: 'd04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737',
  },
  {
    identity_key: 'demo-approver-2',
    email: 'controller@marksure.edu',
    full_name: 'Dr. Karan Bedi',
    designation: 'Controller of Examinations',
    department: 'Office of the Controller of Examinations',
    role: 'approver',
    role_code: 'APPROVER_2',
    public_key_hex: 'a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0',
  },
  {
    identity_key: 'demo-student-1',
    email: 'harnoor.singh@student.marksure.edu',
    full_name: 'Harnoor Singh',
    designation: 'B.Tech Computer Science and Engineering',
    department: 'School of Computer Science and Engineering',
    registration_id: 'REG-2026-CSE-001',
    role: 'student',
    role_code: 'STUDENT',
    public_key_hex: null,
  },
];

export function LoginPage() {
  const { loginWithCredentials, loginWithDevIdentity } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [devWorkspaceEnabled, setDevWorkspaceEnabled] = useState(true);
  const [devIdentities, setDevIdentities] = useState<ConfiguredIdentity[]>(DEFAULT_HACKATHON_IDENTITIES);
  const [showDevIdentities, setShowDevIdentities] = useState(true);

  useEffect(() => {
    apiFetch<{
      dev_workspace_enabled: boolean;
      identities: ConfiguredIdentity[];
    }>('/api/auth/config')
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.identities) && cfg.identities.length > 0) {
          setDevIdentities(cfg.identities);
          setDevWorkspaceEnabled(Boolean(cfg.dev_workspace_enabled));
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_HACKATHON_IDENTITIES if offline/cold starting
      });
  }, []);

  async function handleCredentialSignIn(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setEmailError('Enter a valid institutional email address.');
      return;
    }
    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }

    setBusyKey('credentials');
    try {
      const user = await loginWithCredentials(cleanEmail, password);
      notify({
        type: 'success',
        title: 'Authenticated',
        message: `Signed in as ${user.full_name} (${user.role_code}).`,
      });
      const target =
        ROLE_WORKSPACE_METADATA[user.role_code]?.targetPath || '/';
      navigate(target);
    } catch (err) {
      setError(err);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDevIdentitySelect(identity: ConfiguredIdentity) {
    setError(null);
    setBusyKey(identity.identity_key);
    try {
      const user = await loginWithDevIdentity(identity.identity_key);
      notify({
        type: 'info',
        title: 'Workspace Session Initialized',
        message: `Active identity: ${user.full_name} (${user.designation || user.role_code}).`,
      });
      const target =
        ROLE_WORKSPACE_METADATA[user.role_code]?.targetPath || '/';
      navigate(target);
    } catch (err) {
      setError(err);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <PageTransition className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Institutional Access Header */}
      <div className="bg-white border border-stone-300 rounded-lg p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 pb-5 border-b border-stone-200">
          <div className="flex items-start gap-4">
            <MarkSureLogo variant="icon" size="md" className="mt-1" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#7F1D1D]">
                {INSTITUTION_CONTEXT.institutionLabel} •{' '}
                {INSTITUTION_CONTEXT.department}
              </div>
              <h1 className="ms-page-title text-zinc-900 mt-1">
                Secure Institutional Access
              </h1>
              <p className="text-base text-stone-600 mt-1">
                Sign in to access your authorized academic records and examination management workspace.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            <div className="px-3.5 py-2 rounded-md bg-stone-100 border border-stone-300 text-stone-700 font-mono text-xs">
              Session: <strong className="text-zinc-900">2026–27</strong> • Term:{' '}
              <strong className="text-zinc-900">2026-27-SEM1</strong>
            </div>
            <Link
              to="/verify"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm transition"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Public QR Verification Gateway</span>
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-stone-600">
          <div>{INSTITUTION_CONTEXT.governanceNotice}</div>
          <div className="font-mono text-xs text-stone-500 shrink-0">
            Session Custody: HttpOnly Cookie • Ed25519 Dual-Control
          </div>
        </div>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      {/* Primary Sign-In Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Primary Institutional Credential Authentication */}
        <div className="lg:col-span-5 bg-white border border-stone-300 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-900 mb-1.5">
              <Lock className="w-4 h-4 text-[#7F1D1D]" />
              <span>Institutional Account Authentication</span>
            </div>
            <p className="text-sm text-stone-600 mb-6">
              Enter your registered institutional email and password. Sessions are issued via
              signed HttpOnly cookies and protected by automated lockout policies.
            </p>

            <form onSubmit={handleCredentialSignIn} noValidate className="space-y-4">
              <FormField
                label="Institutional Email Address"
                required
                error={emailError}
              >
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@marksure.edu"
                  className="w-full px-3.5 py-2.5 text-[15px] rounded-md border border-stone-300 bg-white focus:outline-none focus:border-zinc-900"
                />
              </FormField>

              <FormField
                label="Account Password"
                required
                error={passwordError}
                hint="Protected against brute-force attempts (5-attempt lockout window)."
              >
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 text-[15px] rounded-md border border-stone-300 bg-white focus:outline-none focus:border-zinc-900"
                />
              </FormField>

              <div className="pt-0.5 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block mb-1.5">
                  Hackathon 1-Click Credentials:
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('admin@marksure.edu');
                      setPassword('Admin@12345');
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded text-stone-800 text-left font-semibold cursor-pointer truncate"
                  >
                    👑 Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('dean.exams@marksure.edu');
                      setPassword('Approver1@12345');
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded text-stone-800 text-left font-semibold cursor-pointer truncate"
                  >
                    ✍️ Approver 1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('controller@marksure.edu');
                      setPassword('Approver2@12345');
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded text-stone-800 text-left font-semibold cursor-pointer truncate"
                  >
                    🛡️ Approver 2
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('harnoor.singh@student.marksure.edu');
                      setPassword('Student@12345');
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded text-stone-800 text-left font-semibold cursor-pointer truncate"
                  >
                    🎓 Student
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={Boolean(busyKey)}
                className="w-full"
              >
                {busyKey === 'credentials' ? (
                  <InlineMarkSureLoader size={20} label="Verifying Credentials..." />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In to Institutional Workspace</span>
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-stone-200 text-xs text-stone-600 space-y-1">
            <div className="font-bold text-zinc-800 text-sm">
              Independent Transcript Verification
            </div>
            <div>
              External verifiers, employers, and academic auditors can verify printed QR
              transcripts without an account via the{' '}
              <Link to="/verify" className="text-[#7F1D1D] font-bold hover:underline">
                Public Verification Portal
              </Link>
              .
            </div>
          </div>
        </div>

        {/* Right: Protected Development Environment Workspace Identities */}
        <div className="lg:col-span-7 space-y-4">
          {devWorkspaceEnabled && devIdentities.length > 0 && (
            <div className="bg-white border border-stone-300 rounded-lg overflow-hidden">
              <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-900">
                    <KeyRound className="w-4 h-4 text-[#7F1D1D]" />
                    <span>Configured Institutional Role Workspaces</span>
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Select an authorized role profile to initialize an authenticated session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDevIdentities(!showDevIdentities)}
                  className="text-sm font-semibold text-stone-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>{showDevIdentities ? 'Hide' : 'Expand'}</span>
                  {showDevIdentities ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              {showDevIdentities && (
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {devIdentities.map((identity) => {
                    const meta =
                      ROLE_WORKSPACE_METADATA[identity.role_code] ||
                      ROLE_WORKSPACE_METADATA.STUDENT;
                    const isBusy = busyKey === identity.identity_key;

                    return (
                      <div
                        key={identity.identity_key}
                        className="border border-stone-300 rounded-lg flex flex-col justify-between bg-white hover:border-zinc-500 transition"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-200">
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wider text-[#7F1D1D]">
                                {meta.roleTitle}
                              </div>
                              <h3 className="ms-card-heading text-zinc-900 mt-0.5">
                                {identity.full_name}
                              </h3>
                              <div className="text-sm text-stone-600">
                                {identity.designation}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-300 font-mono text-xs font-bold text-zinc-800">
                              {identity.role_code}
                            </span>
                          </div>

                          {identity.registration_id && (
                            <div className="mt-2.5 text-xs font-mono text-stone-600">
                              Registration No: <strong>{identity.registration_id}</strong> •
                              Semester 1
                            </div>
                          )}

                          {identity.public_key_hex && (
                            <div className="mt-2.5 text-xs font-mono text-stone-500 bg-stone-50 px-2.5 py-1.5 rounded border border-stone-200 truncate">
                              Ed25519 PubKey: {identity.public_key_hex}
                            </div>
                          )}

                          <ul className="mt-3 space-y-1.5 text-xs text-stone-700 leading-relaxed">
                            {meta.responsibilities.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#7F1D1D] mt-1.5 shrink-0" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-stone-500 truncate max-w-[140px]">
                            {identity.email}
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => handleDevIdentitySelect(identity)}
                            className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 active:translate-y-px text-white text-sm font-semibold px-3.5 py-2 rounded-md transition cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <InlineMarkSureLoader size={18} label="Signing In..." />
                            ) : (
                              <>
                                <span>Access Workspace</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
