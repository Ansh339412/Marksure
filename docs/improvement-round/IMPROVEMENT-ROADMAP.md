# MarkSure — Improvement & Production Roadmap

**Target Deployment:** Vercel (Frontend), Render (Backend), Supabase (PostgreSQL)  
**Branch:** `improvement-round`  

---

## 1. Prioritization Matrix

Tasks are classified into four strategic tiers:
- **P0 (Immediate / Critical):** Essential security hardening, cryptographic correctness, and fatal bug resolutions. Must be completed before any production release.
- **P1 (Important):** Operational reliability, API robustness, rate limiting, and core UX improvements.
- **P2 (Desirable):** Developer ergonomics, performance caching, enhanced mobile views, and observability.
- **P3 (Long-Term):** Enterprise integrations, hardware security keys, and multi-tenant university support.

---

## 2. Detailed Task Backlog

### Tier P0 — Immediate Production Blockers

| Task ID | Title & Description | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|
| **P0-01** | **Disable Development Identities in Production**<br>Ensure `demo-admin`, `demo-approver-*`, and mock signing endpoints are completely inaccessible in production. | None | **DONE** | Requests to `/api/auth/dev-session` return 403 `DEV_IDENTITIES_DISABLED`. Bearer demo tokens rejected. |
| **P0-02** | **Separate Session Secret & Fail-Fast Key Check**<br>Decouple session cookie HMAC from the institutional signing key; crash server if `INSTITUTION_PRIVATE_KEY_HEX` is missing in production. | None | **DONE** | Server throws fatal exception on startup if key is default or missing. `SESSION_SECRET` enforced. |
| **P0-03** | **Ledger Event Concurrency Mutex**<br>Serialize ledger appending to prevent forked hash chains under concurrent batch publication. | None | **DONE** | `appendQueue` executes sequentially; unit tests confirm monotonic SHA-256 event chaining. |
| **P0-04** | **Student Privacy / Masked Public Verification**<br>Omit full legal student names from unauthenticated public verify routes (`/api/verify/:resultId`). | None | **DONE** | Public JSON returns masked names (e.g. `H****** S****`); full names restricted to authenticated roles. |
| **P0-05** | **Batch Publishing Transaction Compensation**<br>Ensure rollback/cleanup occurs if any student record insertion fails mid-batch. | None | **DONE** | Partial records deleted across `merkle_proofs`, `results`, and `publication_batches` on failure. |

---

### Tier P1 — Operational & Architectural Improvements

| Task ID | Title & Description | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|
| **P1-01** | **Database Unique Constraints on Approvers**<br>Prevent duplicate approvals for the same correction request at the database level. | Supabase Migration | **DONE** | Schema constraint `uq_correction_approval_approver` applied in migration `002`. |
| **P1-02** | **Frontend Mark Entry Validation**<br>Require explicit mark entry [0-100] instead of defaulting missing subject scores to 80. | None | **DONE** | Administrator must explicitly enter scores or use clearly-labeled prototype fill button. |
| **P1-03** | **Render Cold Start Resilience**<br>Implement automated health check polling and exponential backoff retry in frontend `apiFetch`. | P0 | **DONE** | Failed network requests retry up to 2 times with informative cold start toast banner. |
| **P1-04** | **Distributed Ledger Locking (PostgreSQL Advisory Locks)**<br>Upgrade in-memory mutex to `pg_advisory_xact_lock` for multi-instance Render scalability. | P0-03 | **PLANNED** | Concurrent requests across multiple worker nodes serialize cleanly on PostgreSQL. |
| **P1-05** | **Rate Limiting on Verification & Auth Endpoints**<br>Apply express-rate-limit to `/api/auth/login` (5 req/min) and `/api/verify` (60 req/min). | None | **PLANNED** | Automated brute-force scans receive HTTP 429 Too Many Requests. |

---

### Tier P2 — UX, Performance & Observability

| Task ID | Title & Description | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|
| **P2-01** | **Collapsible Cryptographic Hex Inspector**<br>Default long hashes (SHA-256 leaves, Ed25519 signatures) into expandable drawers for cleaner UI. | None | **DONE** | Verification page prioritizes verification status while providing full audit trail on demand. |
| **P2-02** | **Mobile-Responsive Registry Tables**<br>Ensure publication registry and student directories scroll smoothly on mobile viewports. | None | **DONE** | Horizontal overflow wrappers applied with sticky header rows. |
| **P2-03** | **Structured JSON Logging & Metrics**<br>Add Pino structured logging and request tracing (Correlation ID) across all API routes. | None | **PLANNED** | Render logs emit JSON with `requestId`, `actorId`, `event`, and execution time. |

---

### Tier P3 — Long-Term Strategic Roadmap

| Task ID | Title & Description | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|
| **P3-01** | **Cloud KMS Integration for Institutional Signing**<br>Store institutional private keys in Google Cloud KMS or AWS KMS with HSM backing. | P0-02 | **PLANNED** | Manifest signatures computed via KMS sign API without key exposure in memory. |
| **P3-02** | **WebAuthn / FIDO2 Approver Signatures**<br>Replace browser memory keys with YubiKey / Touch ID hardware-backed Ed25519 signing. | None | **PLANNED** | Dual approver signatures generated via WebAuthn hardware authenticator assertion. |
| **P3-03** | **Decentralized Anchor (L2 / Timestamping Service)**<br>Periodically anchor the Merkle root of publication batches to a public L2 ledger (e.g. Arbitrum/Polygon). | P0-03 | **PLANNED** | Timestamp proof publicly verifiable against Ethereum/L2 block headers. |
