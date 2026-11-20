import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Plus,
  Send,
  RefreshCw,
  QrCode,
  FileText,
  RotateCcw,
  Search,
  Filter,
  History,
  KeyRound,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  PendingApprovalBadge,
  StatusBadge,
  VerificationStatus,
} from '../components/StatusBadge';
import {
  calculateAcademicSummary,
  INSTITUTION_CONTEXT,
  SEMESTER_1_COURSES,
} from '../lib/academicPolicy';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  FormField,
  Modal,
  PageTransition,
  Pagination,
  SkeletonTable,
  useToast,
} from '../components/ui/DesignSystem';
import { InlineMarkSureLoader } from '../components/brand/MarkSureLoader';
import { useAuth } from '../context/AuthContext';

interface StudentRecord {
  id: string;
  roll_number: string;
  full_name: string;
  department: string;
  semester: number;
}

interface SubjectEntry {
  code: string;
  name: string;
  marks: number;
  max_marks: number;
}

export function AdminDashboard() {
  const { user } = useAuth();
  const { notify } = useToast();

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Table search, status filter & pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'VERIFIED' | 'PENDING_CORRECTION' | 'CORRECTED' | 'TAMPERED'
  >('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  // Modals & Collapsible panels
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [confirmReinitOpen, setConfirmReinitOpen] = useState(false);
  const [activeRegistryTab, setActiveRegistryTab] = useState<'RESULTS' | 'STUDENTS'>('RESULTS');

  // Publish Batch form state
  const [batchName, setBatchName] = useState(
    'End-Term Examination — B.Tech CSE Semester 1 (Session 2026–27)'
  );
  const [academicTerm, setAcademicTerm] = useState('2026-27-SEM1');
  const [marksByStudent, setMarksByStudent] = useState<Record<string, SubjectEntry[]>>({});

  // Add Student form state
  const [newRoll, setNewRoll] = useState('');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('Computer Science and Engineering');
  const [newSem, setNewSem] = useState(1);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [stuRes, resRes, batchRes, ledgerRes] = await Promise.allSettled([
        apiFetch<{ students: StudentRecord[] }>('/api/admin/students'),
        apiFetch<{ results: any[] }>('/api/admin/results'),
        apiFetch<{ batches: any[] }>('/api/admin/batches'),
        apiFetch<{ events: any[] }>('/api/audit/ledger'),
      ]);

      if (stuRes.status === 'fulfilled') {
        const sortedStudents = (stuRes.value.students || []).sort((a, b) =>
          a.roll_number.localeCompare(b.roll_number)
        );
        setStudents(sortedStudents);

        setMarksByStudent((prev) => {
          const initMarks: Record<string, SubjectEntry[]> = { ...prev };
          for (const s of sortedStudents) {
            if (!initMarks[s.id]) {
              initMarks[s.id] = SEMESTER_1_COURSES.map((c) => ({
                code: c.code,
                name: c.name,
                marks: 80,
                max_marks: c.max_marks,
              }));
            }
          }
          return initMarks;
        });
      }

      if (resRes.status === 'fulfilled') {
        const sortedResults = (resRes.value.results || []).sort((a, b) =>
          a.student.roll_number.localeCompare(b.student.roll_number)
        );
        setResults(sortedResults);
      }

      if (batchRes.status === 'fulfilled') {
        setBatches(batchRes.value.batches || []);
      }

      if (ledgerRes.status === 'fulfilled') {
        setRecentEvents((ledgerRes.value.events || []).slice(0, 6));
      }

      // If all four requests failed, surface the error
      if (
        stuRes.status === 'rejected' &&
        resRes.status === 'rejected' &&
        batchRes.status === 'rejected' &&
        ledgerRes.status === 'rejected'
      ) {
        setError(stuRes.reason);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.student.roll_number.toLowerCase().includes(q) ||
        (r.student.full_name || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'PENDING_CORRECTION') {
        return (r.pending_corrections || []).length > 0;
      }
      return r.verification_status === statusFilter;
    });
  }, [results, searchQuery, statusFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        s.roll_number.toLowerCase().includes(q) ||
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.department || '').toLowerCase().includes(q)
      );
    });
  }, [students, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, currentPage]);

  const pendingCorrectionsCount = useMemo(
    () =>
      results.reduce(
        (sum, r) => sum + ((r.pending_corrections || []).length > 0 ? 1 : 0),
        0
      ),
    [results]
  );

  const tamperedCount = useMemo(
    () =>
      results.filter(
        (r) =>
          r.verification_status === 'TAMPERED' ||
          r.verification_status === 'INVALID_SIGNATURE'
      ).length,
    [results]
  );

  function handleMarkChange(studentId: string, subIndex: number, value: number) {
    const bounded = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setMarksByStudent((prev) => {
      const copy = [...(prev[studentId] || [])];
      copy[subIndex] = { ...copy[subIndex], marks: bounded };
      return { ...prev, [studentId]: copy };
    });
  }

  async function handlePublishBatch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const entries = students.map((s) => ({
        student_id: s.id,
        subjects:
          marksByStudent[s.id] ||
          SEMESTER_1_COURSES.map((c) => ({
            code: c.code,
            name: c.name,
            marks: 80,
            max_marks: 100,
          })),
      }));

      const res = await apiFetch<{
        merkle_root: string;
        results_published: any[];
      }>('/api/admin/results/publish', {
        method: 'POST',
        body: JSON.stringify({
          batch_name: batchName,
          academic_term: academicTerm,
          entries,
        }),
      });

      notify({
        type: 'success',
        title: 'Examination Batch Published',
        message: `Published ${res.results_published.length} records. Merkle Root: ${res.merkle_root.slice(
          0,
          16
        )}...`,
      });
      setShowPublishPanel(false);
      await loadAll();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setStudentFormError(null);
    const cleanRoll = newRoll.trim().toUpperCase();
    const cleanName = newName.trim();

    if (cleanRoll.length < 4) {
      setStudentFormError('Registration number must be at least 4 characters.');
      return;
    }
    if (cleanName.length < 2) {
      setStudentFormError('Student full name must be at least 2 characters.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{ student: StudentRecord }>('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          roll_number: cleanRoll,
          full_name: cleanName,
          department: newDept,
          semester: newSem,
        }),
      });

      const newStudent = res.student;
      setStudents((prev) =>
        [...prev, newStudent].sort((a, b) => a.roll_number.localeCompare(b.roll_number))
      );
      setMarksByStudent((prev) => ({
        ...prev,
        [newStudent.id]: SEMESTER_1_COURSES.map((c) => ({
          code: c.code,
          name: c.name,
          marks: 80,
          max_marks: c.max_marks,
        })),
      }));

      setNewRoll('');
      setNewName('');
      setShowAddStudentModal(false);
      setActiveRegistryTab('STUDENTS');
      notify({
        type: 'success',
        title: 'Student Registered',
        message: `Added ${cleanRoll} (${cleanName}) to the academic directory.`,
      });
      await loadAll();
    } catch (err: any) {
      setStudentFormError(
        err?.message || 'Unable to register student. Please check the values and retry.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRegistry(mode: 'reseed' | 'empty') {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/demo/reset', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setConfirmReinitOpen(false);
      notify({
        type: 'info',
        title: 'Registry Synchronized',
        message: res.message,
      });
      if (mode === 'empty') {
        setShowPublishPanel(true);
      }
      await loadAll();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = user?.role === 'admin';

  return (
    <PageTransition className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Registry Header */}
      <div className="bg-white border border-stone-300 rounded p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7F1D1D]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              Division of Examination Operations • Session{' '}
              {INSTITUTION_CONTEXT.academicSession}
            </span>
          </div>
          <h1 className="ms-page-title text-zinc-900 mt-1">
            Examination Result Registry &amp; Cryptographic Ledger
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Programme: <strong>{INSTITUTION_CONTEXT.programme}</strong> • Department:{' '}
            <strong>{INSTITUTION_CONTEXT.department}</strong> • Term:{' '}
            <strong className="font-mono">{INSTITUTION_CONTEXT.academicTermCode}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={loadAll}
            disabled={loading || busy}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Verify Live Registry</span>
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowAddStudentModal(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Student</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => setShowPublishPanel(!showPublishPanel)}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Batch Publisher</span>
                {showPublishPanel ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </Button>

              <Button
                variant="primary"
                onClick={() => setConfirmReinitOpen(true)}
                disabled={busy}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reinitialize Academic Dataset</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Compact Operational Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white border border-stone-300 rounded-lg p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Published Batches
          </div>
          <div className="ms-metric-value text-zinc-900 mt-1 font-mono">
            {batches.length}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Ed25519 Signed Manifests
          </div>
        </div>

        <div className="bg-white border border-stone-300 rounded-lg p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Enrolled Students
          </div>
          <div className="ms-metric-value text-zinc-900 mt-1 font-mono">
            {students.length}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            B.Tech CSE • Semester 1
          </div>
        </div>

        <div className="bg-white border border-amber-300 rounded-lg p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Pending Corrections
          </div>
          <div className="ms-metric-value text-amber-900 mt-1 font-mono">
            {pendingCorrectionsCount}
          </div>
          <div className="text-xs text-amber-700 mt-1">
            Awaiting 2nd Approver Signature
          </div>
        </div>

        <div
          className={`bg-white border rounded-lg p-4 ${
            tamperedCount > 0 ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
          }`}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-red-800">
            Integrity Alerts
          </div>
          <div className="ms-metric-value text-red-900 mt-1 font-mono">
            {tamperedCount}
          </div>
          <div className="text-xs text-red-700 mt-1">
            Unapproved Database Edits
          </div>
        </div>

        <div className="bg-white border border-stone-300 rounded-lg p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Audit Ledger Events
          </div>
          <div className="ms-metric-value text-zinc-900 mt-1 font-mono">
            {recentEvents.length}
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1">
            SHA-256 Chain Verified
          </div>
        </div>
      </div>

      <ErrorAlert
        error={error}
        onRetry={loadAll}
        onDismiss={() => setError(null)}
      />

      {/* Collapsible Batch Publisher Drawer */}
      {showPublishPanel && isAdmin && (
        <div className="ms-page-enter bg-white border border-stone-300 rounded p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Cryptographic Result Batch Publishing Workspace
              </h2>
              <p className="text-xs text-stone-600">
                Canonicalizes subject marks → computes SHA-256 leaf hashes → builds Merkle tree → signs root with Institution Ed25519 key.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleResetRegistry('empty')}
                disabled={busy}
              >
                Clear Published Term Batch
              </Button>
            </div>
          </div>

          <form onSubmit={handlePublishBatch} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Examination Batch Title" required>
                <input
                  type="text"
                  required
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-stone-300"
                />
              </FormField>
              <FormField label="Academic Term Code" required>
                <input
                  type="text"
                  required
                  value={academicTerm}
                  onChange={(e) => setAcademicTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-stone-300 font-mono"
                />
              </FormField>
            </div>

            <div className="max-h-72 overflow-y-auto border border-stone-200 rounded divide-y divide-stone-200">
              {students.map((stu) => {
                const stuSubjects =
                  marksByStudent[stu.id] ||
                  SEMESTER_1_COURSES.map((c) => ({
                    code: c.code,
                    name: c.name,
                    marks: 80,
                    max_marks: 100,
                  }));
                return (
                  <div key={stu.id} className="p-3 bg-stone-50/60">
                    <div className="text-xs font-bold text-zinc-900 mb-2">
                      <span className="font-mono">{stu.roll_number}</span> — {stu.full_name}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {stuSubjects.map((sub, idx) => (
                        <div
                          key={sub.code}
                          className="bg-white p-2 rounded border border-stone-200 flex items-center justify-between"
                        >
                          <span className="text-[11px] font-mono font-bold text-stone-700">
                            {sub.code}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            required
                            value={sub.marks}
                            onChange={(e) =>
                              handleMarkChange(stu.id, idx, Number(e.target.value))
                            }
                            className="w-12 px-1.5 py-0.5 text-xs font-mono font-bold text-right rounded border border-stone-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={busy || students.length === 0}
              >
                {busy ? (
                  <InlineMarkSureLoader
                    size={18}
                    label="Generating Merkle Proofs & Ed25519 Signature..."
                  />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      Publish &amp; Sign Examination Batch ({students.length} Students)
                    </span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MAIN FOCUS: Published Results Registry Table */}
      <div className="bg-white border border-stone-300 rounded overflow-hidden">
        {/* Top Tab Bar Switching between Published Results & Enrolled Students */}
        <div className="flex border-b border-stone-300 bg-stone-100/70 px-4 pt-2.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveRegistryTab('RESULTS')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeRegistryTab === 'RESULTS'
                ? 'border-[#7F1D1D] text-[#7F1D1D] bg-white rounded-t'
                : 'border-transparent text-stone-600 hover:text-zinc-900'
            }`}
          >
            Published Results Registry ({results.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveRegistryTab('STUDENTS')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeRegistryTab === 'STUDENTS'
                ? 'border-[#7F1D1D] text-[#7F1D1D] bg-white rounded-t'
                : 'border-transparent text-stone-600 hover:text-zinc-900'
            }`}
          >
            Enrolled Student Directory ({students.length})
          </button>
        </div>

        <div className="p-4 border-b border-stone-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-stone-50/70">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
              {activeRegistryTab === 'RESULTS'
                ? `Published Examination Results & Live Cryptographic Verification (${filteredResults.length} of ${results.length})`
                : `Enrolled Student Records & Admission Directory (${filteredStudents.length} of ${students.length})`}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {activeRegistryTab === 'RESULTS'
                ? 'Every record is verified live against its Merkle inclusion proof and Ed25519 institutional manifest signature.'
                : 'Official roster of enrolled students in the database, including records awaiting batch publication and unlinked profiles.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2" />
              <input
                type="text"
                aria-label="Search records"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Roll No or Name..."
                className="pl-8 pr-3 py-1 text-xs rounded border border-stone-300 bg-white focus:outline-none focus:border-zinc-900 w-56"
              />
            </div>

            {/* Filter Pills (Results view only) */}
            {activeRegistryTab === 'RESULTS' && (
              <div className="flex items-center gap-1 text-[11px] font-semibold">
                <Filter className="w-3.5 h-3.5 text-stone-400 mr-1" />
                {(
                  [
                    { id: 'ALL', label: 'All' },
                    { id: 'VERIFIED', label: 'Verified' },
                    { id: 'PENDING_CORRECTION', label: 'Pending (1/2)' },
                    { id: 'CORRECTED', label: 'Corrected' },
                    { id: 'TAMPERED', label: 'Tampered' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded border transition cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} />
          </div>
        ) : activeRegistryTab === 'STUDENTS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-100/70 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  <th className="py-2.5 px-3.5">Registration No</th>
                  <th className="py-2.5 px-3.5">Student Full Name</th>
                  <th className="py-2.5 px-3.5">Department &amp; Semester</th>
                  <th className="py-2.5 px-3.5">Auth Profile Link</th>
                  <th className="py-2.5 px-3.5">Examination Status</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-500 text-sm">
                      No enrolled students found matching &ldquo;{searchQuery}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((stu) => {
                    const publishedRes = results.find(
                      (r) => r.student?.roll_number === stu.roll_number
                    );
                    const hasProfile = Boolean((stu as any).profile_id);

                    return (
                      <tr key={stu.id} className="hover:bg-stone-50 transition">
                        <td className="py-3 px-3.5 font-mono font-bold text-zinc-900">
                          {stu.roll_number}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-zinc-900">
                          {stu.full_name}
                        </td>
                        <td className="py-3 px-3.5 text-stone-600 text-xs">
                          {stu.department} • Sem {stu.semester}
                        </td>
                        <td className="py-3 px-3.5">
                          {hasProfile ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Linked User Profile</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-300 text-xs">
                              <span>Enrolled Record (Unlinked)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          {publishedRes ? (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge
                                status={publishedRes.verification_status as VerificationStatus}
                              />
                              <span className="font-mono text-xs text-stone-500">
                                v{publishedRes.current_version}
                              </span>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-xs font-semibold">
                              Awaiting Batch Publication
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          {publishedRes ? (
                            <div className="inline-flex items-center gap-1.5">
                              <Link
                                to={`/marksheet/${publishedRes.result_id}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 text-xs font-semibold"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Transcript</span>
                              </Link>
                              <Link
                                to={`/verify/${publishedRes.result_id}?v=${publishedRes.current_version}&leaf=${publishedRes.stored_leaf_hash}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>Verify</span>
                              </Link>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShowPublishPanel(true);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#7F1D1D] hover:bg-[#651717] text-white text-xs font-bold transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Publish Marks</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No matching examination records found"
              description="No published student records match your current search query or verification filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                  }}
                >
                  Reset Search & Filters
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[15px]">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-300 text-xs font-bold text-stone-700 uppercase tracking-wider">
                    <th className="py-3 px-4">Registration No</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Course Marks (CSE101 • MTH165 • PHY109 • MEC107 • PEL121 • CSE102)</th>
                    <th className="py-3 px-4 text-center">Total / SGPA</th>
                    <th className="py-3 px-4">Verification &amp; Governance Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {paginatedResults.map((r) => {
                    const summary = calculateAcademicSummary(r.field_diffs || []);
                    const pendingList = r.pending_corrections || [];
                    const hasPending = pendingList.length > 0;
                    const isTampered =
                      r.verification_status === 'TAMPERED' ||
                      r.verification_status === 'INVALID_SIGNATURE';

                    return (
                      <tr
                        key={r.result_id}
                        className={`transition-colors ${
                          isTampered
                            ? 'bg-red-50/70 hover:bg-red-50'
                            : hasPending
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="py-3 px-3.5 font-mono font-bold text-zinc-900 whitespace-nowrap">
                          <div>{r.student.roll_number}</div>
                          <div className="text-[10px] font-normal text-stone-500">
                            v{r.current_version} • Leaf #{r.leaf_index}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-zinc-900">
                            {r.student.full_name || r.student.masked_name}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            B.Tech CSE • Sem {r.student.semester}
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="flex flex-wrap gap-1">
                            {(r.field_diffs || []).map((f: any) => {
                              const pendingForSub = pendingList.find(
                                (p: any) => p.subject_code === f.subject_code
                              );
                              return (
                                <span
                                  key={f.subject_code}
                                  className={`px-1.5 py-0.5 rounded border font-mono text-[11px] ${
                                    f.is_tampered
                                      ? 'bg-red-100 text-red-950 border-red-400 font-bold'
                                      : f.is_corrected
                                      ? 'bg-sky-100 text-sky-950 border-sky-300 font-bold'
                                      : pendingForSub
                                      ? 'bg-amber-100 text-amber-950 border-amber-300 font-semibold'
                                      : 'bg-stone-50 text-stone-800 border-stone-200'
                                  }`}
                                >
                                  {f.subject_code}: <strong>{f.current_db_marks}</strong>
                                  {f.is_tampered && (
                                    <span className="text-red-800">
                                      {' '}
                                      (Signed: {f.verified_snapshot_marks})
                                    </span>
                                  )}
                                  {pendingForSub && (
                                    <span className="text-amber-800">
                                      {' '}
                                      (→{pendingForSub.new_marks} Pending 1/2)
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 text-center font-mono whitespace-nowrap">
                          <div className="font-bold text-zinc-900">
                            {summary.totalObtained}/{summary.totalMax}
                          </div>
                          <div className="text-[11px] text-stone-600">
                            SGPA: <strong>{summary.sgpa}</strong> ({summary.resultStatus})
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge
                              status={r.verification_status as VerificationStatus}
                            />
                            {hasPending && (
                              <PendingApprovalBadge
                                count={pendingList[0].approvals_count}
                              />
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/marksheet/${r.result_id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-stone-100 text-zinc-900 border border-stone-300 font-semibold transition"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Transcript</span>
                            </Link>
                            <Link
                              to={`/corrections?resultId=${r.result_id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-stone-100 hover:bg-stone-200 text-zinc-800 border border-stone-300 font-semibold transition"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Correction</span>
                            </Link>
                            <Link
                              to={`/verify/${r.result_id}?v=${r.current_version}&leaf=${r.stored_leaf_hash}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-semibold transition"
                            >
                              <QrCode className="w-3 h-3" />
                              <span>Verify</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredResults.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Bottom 2-Column Strip: Signed Publication Batches & Recent Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white border border-stone-300 rounded p-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Signed Merkle Publication Batches ({batches.length})
            </h3>
            <span className="text-[11px] font-mono text-stone-500">
              Algorithm: SHA-256 + Ed25519
            </span>
          </div>
          <div className="space-y-2.5">
            {batches.map((b) => (
              <div
                key={b.id}
                className="p-3 rounded bg-stone-50 border border-stone-200 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-900">{b.batch_name}</span>
                  <span className="font-mono text-[11px] text-stone-600">
                    {b.record_count} record(s)
                  </span>
                </div>
                <div className="font-mono text-[11px] text-stone-600 truncate">
                  <strong className="text-zinc-800">Merkle Root:</strong> {b.merkle_root}
                </div>
                <div className="font-mono text-[11px] text-stone-600 truncate">
                  <strong className="text-zinc-800">Ed25519 Sig:</strong>{' '}
                  {b.institution_signature}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-stone-300 rounded p-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#7F1D1D]" />
              <span>Recent Append-Only Audit Events</span>
            </h3>
            <Link
              to="/audit"
              className="text-xs font-semibold text-[#7F1D1D] hover:underline"
            >
              Open Full Audit Ledger →
            </Link>
          </div>
          <div className="space-y-2">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded bg-stone-50 border border-stone-200 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-white font-mono text-[10px] font-bold shrink-0">
                    #{ev.seq_no}
                  </span>
                  <span className="font-mono font-bold text-zinc-900 text-[11px] shrink-0">
                    {ev.event_type}
                  </span>
                  <span className="text-stone-600 truncate text-[11px]">
                    by {ev.profiles?.full_name || 'Examination Authority'}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-stone-500 shrink-0">
                  {ev.event_hash.slice(0, 12)}...
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      <Modal
        open={showAddStudentModal}
        title="Register Student in Academic Directory"
        onClose={() => setShowAddStudentModal(false)}
      >
        <form onSubmit={handleAddStudent} className="space-y-4">
          <FormField
            label="Registration Number"
            required
            hint="Format: REG-2026-CSE-009"
          >
            <input
              type="text"
              required
              placeholder="REG-2026-CSE-009"
              value={newRoll}
              onChange={(e) => setNewRoll(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded border border-stone-300 font-mono"
            />
          </FormField>

          <FormField label="Student Full Name" required>
            <input
              type="text"
              required
              placeholder="Gurpreet Sidhu"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded border border-stone-300"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Academic Department" required>
              <input
                type="text"
                required
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-stone-300"
              />
            </FormField>
            <FormField label="Semester" required>
              <input
                type="number"
                min={1}
                max={8}
                required
                value={newSem}
                onChange={(e) => setNewSem(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs rounded border border-stone-300"
              />
            </FormField>
          </div>

          {studentFormError && (
            <p className="text-xs text-red-700 font-medium">{studentFormError}</p>
          )}

          <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddStudentModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Register Student
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reinitialize Dataset Confirmation Dialog */}
      <ConfirmDialog
        open={confirmReinitOpen}
        title="Reinitialize Institutional Registry Dataset"
        description="This action will reset the Semester 1 examination batch, regenerate all 8 student SHA-256 Merkle proofs and Ed25519 signatures, and restore the baseline verification records."
        confirmLabel="Reinitialize Dataset"
        busy={busy}
        onConfirm={() => handleResetRegistry('reseed')}
        onCancel={() => setConfirmReinitOpen(false)}
      />
    </PageTransition>
  );
}
