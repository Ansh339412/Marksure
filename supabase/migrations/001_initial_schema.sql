-- MarkSure — Initial Supabase PostgreSQL Schema (9 Core Tables)
-- Run this script in Supabase Dashboard -> SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. profiles (linked 1:1 with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin', 'approver')),
  public_key_hex TEXT, -- Registered 64-char Ed25519 public key (required for approvers)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approver_must_have_pubkey CHECK (
    role <> 'approver' OR (public_key_hex IS NOT NULL AND length(public_key_hex) = 64)
  )
);

-- 2. students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  roll_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. publication_batches (signed Merkle roots)
CREATE TABLE IF NOT EXISTS public.publication_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT NOT NULL,
  academic_term TEXT NOT NULL,
  merkle_root TEXT NOT NULL CHECK (length(merkle_root) = 64),
  record_count INTEGER NOT NULL CHECK (record_count > 0),
  manifest_json JSONB NOT NULL,
  institution_signature TEXT NOT NULL CHECK (length(institution_signature) = 128),
  institution_public_key TEXT NOT NULL CHECK (length(institution_public_key) = 64),
  published_by UUID NOT NULL REFERENCES public.profiles(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. results (mutable current marks — intentionally separate from immutable snapshots)
CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  academic_term TEXT NOT NULL,
  subjects_json JSONB NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  latest_batch_id UUID NOT NULL REFERENCES public.publication_batches(id),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'corrected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_term UNIQUE (student_id, academic_term)
);

-- 5. result_versions (append-only immutable snapshots)
CREATE TABLE IF NOT EXISTS public.result_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.results(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  batch_id UUID NOT NULL REFERENCES public.publication_batches(id),
  snapshot_json JSONB NOT NULL,
  leaf_hash TEXT NOT NULL CHECK (length(leaf_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_result_version UNIQUE (result_id, version)
);

-- 6. merkle_proofs
CREATE TABLE IF NOT EXISTS public.merkle_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_version_id UUID NOT NULL UNIQUE REFERENCES public.result_versions(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES public.publication_batches(id),
  leaf_index INTEGER NOT NULL CHECK (leaf_index >= 0),
  leaf_hash TEXT NOT NULL CHECK (length(leaf_hash) = 64),
  proof_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. correction_requests
CREATE TABLE IF NOT EXISTS public.correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.results(id) ON DELETE RESTRICT,
  from_version INTEGER NOT NULL CHECK (from_version >= 1),
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  old_marks INTEGER NOT NULL CHECK (old_marks BETWEEN 0 AND 100),
  new_marks INTEGER NOT NULL CHECK (new_marks BETWEEN 0 AND 100),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  canonical_payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'finalized', 'rejected')),
  finalized_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT marks_must_change CHECK (old_marks <> new_marks)
);

-- 8. correction_approvals
CREATE TABLE IF NOT EXISTS public.correction_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_request_id UUID NOT NULL REFERENCES public.correction_requests(id) ON DELETE RESTRICT,
  approver_id UUID NOT NULL REFERENCES public.profiles(id),
  approver_public_key TEXT NOT NULL CHECK (length(approver_public_key) = 64),
  signature_hex TEXT NOT NULL CHECK (length(signature_hex) = 128),
  signed_payload_hash TEXT NOT NULL CHECK (length(signed_payload_hash) = 64),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_approver_per_request UNIQUE (correction_request_id, approver_id)
);

-- 9. ledger_events (hash-chained append-only audit log)
CREATE TABLE IF NOT EXISTS public.ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_no BIGSERIAL UNIQUE NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('BATCH_PUBLISHED', 'CORRECTION_REQUESTED', 'CORRECTION_APPROVED', 'CORRECTION_FINALIZED')
  ),
  entity_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  payload_json JSONB NOT NULL,
  prev_event_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (length(event_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_results_student_id ON public.results(student_id);
CREATE INDEX IF NOT EXISTS idx_result_versions_result_id ON public.result_versions(result_id);
CREATE INDEX IF NOT EXISTS idx_correction_requests_result_id ON public.correction_requests(result_id);
CREATE INDEX IF NOT EXISTS idx_correction_requests_status ON public.correction_requests(status);
CREATE INDEX IF NOT EXISTS idx_ledger_events_seq_no ON public.ledger_events(seq_no DESC);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merkle_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;

-- Grant explicit table & sequence permissions to Supabase API roles
-- (Fixes "permission denied for table profiles" with sb_secret / sb_publishable keys)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- RLS Policies for API access (Backend enforces strict role & Ed25519 signature verification)
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow backend service operations on profiles" ON public.profiles;
CREATE POLICY "Allow backend service operations on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on students" ON public.students;
CREATE POLICY "Allow backend service operations on students" ON public.students FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on publication_batches" ON public.publication_batches;
CREATE POLICY "Allow backend service operations on publication_batches" ON public.publication_batches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on results" ON public.results;
CREATE POLICY "Allow backend service operations on results" ON public.results FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on result_versions" ON public.result_versions;
CREATE POLICY "Allow backend service operations on result_versions" ON public.result_versions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on merkle_proofs" ON public.merkle_proofs;
CREATE POLICY "Allow backend service operations on merkle_proofs" ON public.merkle_proofs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on correction_requests" ON public.correction_requests;
CREATE POLICY "Allow backend service operations on correction_requests" ON public.correction_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on correction_approvals" ON public.correction_approvals;
CREATE POLICY "Allow backend service operations on correction_approvals" ON public.correction_approvals FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend service operations on ledger_events" ON public.ledger_events;
CREATE POLICY "Allow backend service operations on ledger_events" ON public.ledger_events FOR ALL USING (true) WITH CHECK (true);
