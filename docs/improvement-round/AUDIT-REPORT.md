# MarkSure — Senior Engineering Audit Report

**Product:** MarkSure — Academic Records Integrity & Verification Platform  
**Environment Audited:** Full-Stack Repository (React 19 + TypeScript frontend, Node.js + Express backend, Supabase DB, Ed25519 & Merkle Cryptography)  
**Audit Branch:** `improvement-round`  
**Production Targets:**
- Frontend: `https://client-anshpreet.vercel.app`
- Backend: `https://marksure-api.onrender.com`
- Repository: `https://github.com/Ansh339412/Marksure`

---

## 1. Executive Summary

This comprehensive audit was conducted to transition MarkSure from a prototype/demonstration implementation into a hardened, production-ready academic records verification platform. The evaluation examined architecture, application security, authentication & authorization, database schemas, cryptographic integrity, API reliability, responsive design, and automated testing.

The audit identified critical vulnerabilities and architectural bugs—including production exposure of development identities, key conflation, public student PII disclosure, ledger concurrency race conditions, and lack of transaction compensation during batch publishing. All high-severity and critical issues were remediated, verified via 43 automated unit/integration tests, and confirmed with clean production builds.

---

## 2. Categorized Findings & Inventory

| ID | Issue Description | Category | Severity | File Location | Resolution Status |
|---|---|---|---|---|---|
| **SEC-01** | Development identities and private key retrieval endpoints exposed in production | Potential Vulnerability | **CRITICAL** | `server/src/routes/authRoutes.ts`, `server/src/middleware/auth.ts`, `server/src/config/env.ts` | **FIXED** (Gated behind `ALLOW_DEV_IDENTITIES` and disabled in production) |
| **SEC-02** | Hardcoded institutional private key fallback and conflation with session HMAC signing secret | Potential Vulnerability | **HIGH** | `server/src/config/env.ts`, `server/src/middleware/security.ts` | **FIXED** (Startup fatal exception in prod; separated `SESSION_SECRET`) |
| **SEC-03** | Startup demo data auto-seeding overwriting production academic records | Confirmed Bug | **HIGH** | `server/src/index.ts`, `server/src/config/env.ts` | **FIXED** (Gated behind `AUTO_SEED_DEMO_DATA=true` & `!isProduction`) |
| **SEC-04** | Broad wildcard CORS (`*.vercel.app`) allowing cross-origin credentialed requests from unvetted preview deployments | Potential Vulnerability | **MEDIUM** | `server/src/index.ts`, `server/src/middleware/security.ts` | **FIXED** (Strict origin whitelist + Origin/Referer CSRF check) |
| **SEC-05** | Public verification directory and endpoints disclosing full student names without authentication | Potential Vulnerability | **MEDIUM** | `server/src/routes/verify.ts` | **FIXED** (Always masked `H****** S****` in public responses) |
| **REL-01** | Ledger hash chain fork risk under concurrent event writes | Confirmed Bug | **HIGH** | `server/src/services/ledger.ts` | **FIXED** (Serialized asynchronous promise queue with exponential backoff retry) |
| **REL-02** | Lack of compensation cleanup on partial batch publishing failure | Confirmed Bug | **MEDIUM** | `server/src/routes/admin.ts` | **FIXED** (Atomic compensation cleanup across all tables on error) |
| **REL-03** | Sequential N+1 query loop in administrative results listing | Technical Debt | **LOW** | `server/src/routes/admin.ts` | **FIXED** (Replaced with parallelized `Promise.all` resolution) |
| **DB-01** | Missing unique constraint allowing duplicate approver signatures in Supabase DB | Confirmed Bug | **MEDIUM** | `supabase/migrations/002_security_and_constraints.sql` | **FIXED** (Added unique constraint on `(correction_request_id, approver_id)`) |
| **UX-01** | Examination batch mark entry defaulted missing grades to 80 | UX Issue | **MEDIUM** | `client/src/pages/AdminDashboard.tsx` | **FIXED** (Strict mark validation [0-100] + optional explicit sample-load button) |

---

## 3. Deep-Dive Root Cause Analysis

### SEC-01: Development Identities in Production
- **Root Cause:** `authRoutes.ts` previously permitted any client to request `/dev-session` or supply `Bearer demo-admin` unless `ENABLE_ROLE_WORKSPACES === 'false'`. An attacker could forge an admin session by hitting the endpoint without any credentials.
- **Remediation:**
  - `env.allowDevIdentities` evaluates to `false` whenever `process.env.NODE_ENV === 'production'`.
  - `/dev-session` and `/dev-signing-key` immediately respond with HTTP 403 `DEV_IDENTITIES_DISABLED` when disabled.
  - `requireAuth` immediately rejects any `demo-*` tokens in production.

### SEC-02: Institutional Key Conflation
- **Root Cause:** `server/src/config/env.ts` fell back to a well-known deterministic private key (`1111...`) if `INSTITUTION_PRIVATE_KEY_HEX` was missing. Furthermore, the session cookie HMAC secret was derived from this private key.
- **Remediation:**
  - In production, missing or default institutional keys cause an immediate startup crash (`FATAL CONFIGURATION ERROR`).
  - A separate `SESSION_SECRET` environment variable is enforced, isolating session security from institutional signing.

### REL-01: Ledger Concurrency Forks
- **Root Cause:** Multiple concurrent requests invoking `appendLedgerEvent` independently queried `prev_event_hash` and calculated their own next hash before inserting, resulting in broken linear hash chains.
- **Remediation:**
  - Introduced an in-process serial execution queue (`appendQueue`) in `ledger.ts`.
  - Added an optimistic-locking retry loop (3 attempts with exponential backoff) if a transient database conflict occurs.

### UX-01: Defaulting Marks to 80
- **Root Cause:** In `AdminDashboard.tsx`, when an administrator clicked publish without entering custom scores, `marks` was initialized to `80`.
- **Remediation:**
  - Initialized marks to `0` and required explicit validation ensuring every subject mark is within `[0, c.max_marks]`.
  - Added an explicit "+ Auto-fill Sample Marks (Testing)" action clearly labeled for prototype evaluations.

---

## 4. What Was Fixed vs. What Remains

### Fixed in this Round:
- [x] Production gating of demo identities and private keys.
- [x] Key separation and fatal startup assertion for institutional keys.
- [x] Prevention of automatic demo data seeding in production.
- [x] Removal of PII (full student names) from public verification responses.
- [x] Mutex-serialized ledger event appending to prevent chain forks.
- [x] Batch publishing error compensation and N+1 query optimization.
- [x] Database schema migrations for unique approver constraints and check constraints.
- [x] Frontend mark entry validation and removal of arbitrary 80 score defaults.
- [x] Expanded cryptographic test coverage to 43 passing tests across 6 suites.

### Remaining Recommended Improvements (Next Cycle):
- [ ] Implement Redis-backed distributed lock for ledger event appending across multi-instance Render deployments.
- [ ] Integrate Supabase Row-Level Security (RLS) policies directly on `results` and `correction_requests` tables.
- [ ] Add hardware-backed WebAuthn/FIDO2 signing for approver private keys.
