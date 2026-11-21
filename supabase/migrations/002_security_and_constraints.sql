-- ============================================================================
-- MarkSure Migration 002: Security, Constraints & Audit Integrity
-- ============================================================================

-- 1. Ensure correction_approvals has a composite unique constraint preventing duplicate approvals by the same approver
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_correction_approval_approver'
  ) THEN
    ALTER TABLE public.correction_approvals
      ADD CONSTRAINT uq_correction_approval_approver
      UNIQUE (correction_request_id, approver_id);
  END IF;
END $$;

-- 2. Update ledger_events event_type CHECK constraint to support CORRECTION_REJECTED
DO $$
BEGIN
  ALTER TABLE public.ledger_events
    DROP CONSTRAINT IF EXISTS ledger_events_event_type_check;

  ALTER TABLE public.ledger_events
    ADD CONSTRAINT ledger_events_event_type_check
    CHECK (event_type IN (
      'BATCH_PUBLISHED',
      'CORRECTION_REQUESTED',
      'CORRECTION_APPROVED',
      'CORRECTION_FINALIZED',
      'CORRECTION_REJECTED'
    ));
END $$;

-- 3. Ensure publication_batches has unique index on (academic_term, merkle_root) for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_publication_batches_term_root
  ON public.publication_batches (academic_term, merkle_root);

-- 4. Enable RLS and verify policies
ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merkle_proofs ENABLE ROW LEVEL SECURITY;
