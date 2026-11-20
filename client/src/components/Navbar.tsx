import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  FileCheck2,
  Lock,
  KeyRound,
  Database,
  LayoutDashboard,
  Building2,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Home,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { INSTITUTION_CONTEXT } from '../lib/academicPolicy';
import { Breadcrumbs, BreadcrumbItem } from './ui/DesignSystem';
import { MarkSureLogo } from './brand/MarkSureLogo';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: ('ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT')[];
  public?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Platform Overview',
    to: '/',
    icon: Home,
    public: true,
  },
  {
    label: 'Examination Registry',
    to: '/registry',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'APPROVER_1', 'APPROVER_2'],
  },
  {
    label: 'Academic Records',
    to: '/student',
    icon: LayoutDashboard,
    roles: ['STUDENT'],
  },
  {
    label: 'Two-Approver Authorization',
    to: '/corrections',
    icon: KeyRound,
    roles: ['ADMIN', 'APPROVER_1', 'APPROVER_2'],
  },
  {
    label: 'Audit & Tampering Monitor',
    to: '/audit',
    icon: Database,
    roles: ['ADMIN', 'APPROVER_1', 'APPROVER_2'],
  },
  {
    label: 'Public QR Verification',
    to: '/verify',
    icon: FileCheck2,
    public: true,
  },
  {
    label: 'Account & Key Custody',
    to: '/settings',
    icon: Settings,
    roles: ['ADMIN', 'APPROVER_1', 'APPROVER_2', 'STUDENT'],
  },
];

function computeBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const base: BreadcrumbItem[] = [{ label: 'MarkSure', to: '/' }];
  if (pathname === '/') {
    base.push({ label: 'Platform Overview' });
  } else if (pathname === '/login') {
    base.push({ label: 'Secure Institutional Access' });
  } else if (pathname === '/registry') {
    base.push({ label: 'Examination Registry' });
  } else if (pathname === '/student') {
    base.push({ label: 'Student Academic Records' });
  } else if (pathname.startsWith('/marksheet')) {
    base.push({ label: 'Examination Registry', to: '/registry' });
    base.push({ label: 'Official Academic Transcript' });
  } else if (pathname.startsWith('/corrections')) {
    base.push({ label: 'Two-Approver Correction Authorization' });
  } else if (pathname.startsWith('/audit')) {
    base.push({ label: 'Audit Logs & Tampering Monitor' });
  } else if (pathname.startsWith('/verify')) {
    base.push({ label: 'Public Cryptographic Verification' });
  } else if (pathname.startsWith('/settings')) {
    base.push({ label: 'Account & Key Custody Settings' });
  } else {
    base.push({ label: 'Workspace' });
  }
  return base;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.public) return true;
    if (!user) return false;
    if (!item.roles) return true;
    return item.roles.includes(user.role_code);
  });

  function isItemActive(item: NavItem): boolean {
    if (item.to === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(item.to);
  }

  const breadcrumbs = computeBreadcrumbs(location.pathname);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5F1] text-zinc-900">
      {/* Top Institutional Context Bar */}
      <div className="no-print bg-zinc-900 text-stone-300 text-[13px] border-b border-zinc-800">
        <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#F87171] shrink-0" />
            <span className="font-semibold text-white">
              {INSTITUTION_CONTEXT.institutionLabel}
            </span>
            <span className="hidden md:inline text-stone-400">
              • {INSTITUTION_CONTEXT.department} • Academic Session{' '}
              {INSTITUTION_CONTEXT.academicSession}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="hidden sm:inline text-stone-400">
              {INSTITUTION_CONTEXT.programmeShort} • Term{' '}
              {INSTITUTION_CONTEXT.academicTermCode}
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-emerald-300 border border-zinc-700 text-[11px] uppercase tracking-wider">
              SHA-256 Merkle + Ed25519
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Enterprise Sidebar Navigation (Desktop) */}
        <aside
          aria-label="Primary Workspace Navigation"
          className={`no-print hidden md:flex flex-col bg-white border-r border-stone-300 transition-all duration-200 shrink-0 ${
            collapsed ? 'w-20' : 'w-72'
          }`}
        >
          {/* Brand Header */}
          <div className="h-16 px-4 border-b border-stone-200 flex items-center justify-between">
            <Link to="/" className="flex items-center overflow-hidden">
              <MarkSureLogo
                variant={collapsed ? 'icon' : 'full'}
                size="sm"
              />
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded text-stone-500 hover:text-zinc-900 hover:bg-stone-100 transition cursor-pointer"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1.5">
            {!collapsed && (
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
                Workspace Modules
              </div>
            )}
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[15px] font-semibold transition-colors ${
                    active
                      ? 'bg-[#7F1D1D] text-white shadow-2xs'
                      : 'text-stone-700 hover:text-zinc-950 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer Identity */}
          <div className="p-4 border-t border-stone-200 bg-stone-50/70">
            {user ? (
              <div className="space-y-3">
                {!collapsed && (
                  <div className="leading-snug">
                    <div className="text-sm font-bold text-zinc-900 truncate">
                      {user.full_name}
                    </div>
                    <div className="text-xs text-stone-600 truncate">
                      {user.designation || user.role_code}
                    </div>
                    <div className="mt-1.5 inline-block px-2 py-0.5 rounded bg-stone-200/80 text-zinc-800 font-mono text-xs font-bold">
                      Role: {user.role_code}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign Out"
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-stone-100 text-zinc-800 px-3 py-2 rounded-md text-sm font-semibold border border-stone-300 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>Sign Out</span>}
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-2.5 rounded-md text-sm font-semibold transition"
              >
                <Lock className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Institutional Access</span>}
              </Link>
            )}
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Compact Top Header Bar */}
          <header className="no-print h-16 bg-white border-b border-stone-300 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation menu"
                className="md:hidden p-2 rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <Link to="/" className="md:hidden shrink-0">
                <MarkSureLogo variant="compact" size="xs" />
              </Link>
              <div className="hidden sm:block truncate">
                <Breadcrumbs items={breadcrumbs} />
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm shrink-0">
              {user ? (
                <div className="flex items-center gap-2.5">
                  <span className="hidden lg:inline-block text-stone-600">
                    Authenticated:{' '}
                    <strong className="text-zinc-900">{user.full_name}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded bg-stone-100 border border-stone-300 font-mono text-xs font-bold text-zinc-800">
                    {user.role_code}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/verify"
                    className="hidden sm:inline-flex items-center gap-1.5 text-zinc-800 hover:text-zinc-950 font-semibold px-3 py-1.5 rounded-md hover:bg-stone-100 text-sm transition"
                  >
                    <FileCheck2 className="w-4 h-4 text-[#7F1D1D]" />
                    <span>Verify a Result</span>
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 bg-[#7F1D1D] hover:bg-[#651717] text-white px-4 py-2 rounded-md text-sm font-bold transition"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Institutional Access</span>
                  </Link>
                </div>
              )}
            </div>
          </header>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="no-print md:hidden bg-white border-b border-stone-300 p-4 space-y-1.5 shadow-md">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[15px] font-semibold ${
                      active
                        ? 'bg-[#7F1D1D] text-white'
                        : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[15px] font-semibold text-red-800 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out ({user.full_name})</span>
                </button>
              )}
            </div>
          )}

          {/* Main Workspace Canvas */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
