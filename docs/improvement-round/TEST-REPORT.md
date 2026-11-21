# MarkSure — Automated Test & Verification Report

**Date:** November 21, 2026  
**Test Framework:** Vitest v3.2.7  
**Runtime:** Node.js v24.20.0 (TypeScript / ESM)  
**Total Test Files:** 6  
**Total Tests Executed:** 43 passed (100% passing)  
**Total Duration:** ~1.6s  

---

## 1. Summary of Test Suites & Coverage

| Test File | Test Count | Status | Key Capabilities Tested |
|---|---|---|---|
| `tests/crypto.test.ts` | 6 | **PASS** | Canonical JSON ordering, leaf hashing, Merkle tree construction (odd/even), Ed25519 manifest & correction signatures |
| `tests/verification.test.ts` | 6 | **PASS** | Dual-signature verification, SQL mark tampering detection, Merkle proof evaluation |
| `tests/api.test.ts` | 6 | **PASS** | Cookie-based session authentication, RBAC boundaries (`ADMIN`, `APPROVER_1`, `APPROVER_2`, `STUDENT`), HTTP defensive headers, error sanitization |
| `tests/corrections_and_security.test.ts` | 8 | **PASS** | Adversarial correction rejection: single approver blocked, duplicate approvers blocked, payload tampering blocked, hash mismatch blocked |
| `tests/student_and_verification_audit.test.ts` | 3 | **PASS** | Public verification URL formatting (canonical Vercel host), student directory parsing, null-profile handling |
| `tests/security_and_cryptographic_audit.test.ts` | 14 | **PASS** | Complete 14-scenario cryptographic audit (tampering, invalid signatures, malformed keys, odd leaves, single-leaf trees, monotonic ledger chaining) |

---

## 2. Comprehensive 14-Scenario Cryptographic Audit

The newly implemented test suite `server/tests/security_and_cryptographic_audit.test.ts` directly validates the core verification invariants:

1. **Scenario 1 (Valid Record):** Untampered records correctly verify Merkle proofs, institutional signatures, and match live DB state (`status: VERIFIED`).
2. **Scenario 2 (Altered Marks):** Modifying a single score by 1 mark triggers `status: TAMPERED` and pinpoints the altered course code.
3. **Scenario 3 (Altered Student ID):** Direct database modifications replacing `student_id` are detected as `TAMPERED` (`student_id mismatch`).
4. **Scenario 4 (Altered Subject Code):** Direct modification of a course code in the database triggers `TAMPERED`.
5. **Scenario 5 (Corrupted Merkle Proof):** Replacing an intermediate sibling hash with invalid bytes causes proof verification to fail (`status: TAMPERED`).
6. **Scenario 6 (Wrong Public Key):** Evaluating an institutional signature against an unapproved public key returns `INVALID_SIGNATURE`.
7. **Scenario 7 (Altered Publication Manifest):** Changing manifest fields (e.g. `record_count`) after signing invalidates the Ed25519 signature (`INVALID_SIGNATURE`).
8. **Scenario 8 (Invalid Signature Bytes):** Corrupted hex strings or invalid byte lengths fail safely and return boolean `false` without crashing the server.
9. **Scenario 9 (Unregistered Approver Key):** A correction approval signed with an unauthorized private key is rejected (`INVALID ED25519 SIGNATURE`).
10. **Scenario 10 (Duplicate Approver Attempt):** The same approver attempting to submit both approvals on a request is rejected (`DUPLICATE APPROVER REJECTED`).
11. **Scenario 11 (Odd Number of Leaves):** Merkle tree construction properly balances odd leaf counts (3, 5, 7) and generates valid inclusion proofs for all leaves.
12. **Scenario 12 (Single-Leaf Merkle Tree):** A tree with 1 leaf correctly resolves the root to the leaf itself with an empty proof path (`[]`).
13. **Scenario 13 (Empty Merkle Tree Handling):** Passing an empty array safely throws a controlled exception without system corruption.
14. **Scenario 14 (Monotonic Ledger Chaining):** Demonstrates that modifying any prior event breaks subsequent event hashes throughout the ledger chain.

---

## 3. Audit Failures & Resolutions

During the execution of this improvement round, the following test failures were identified and resolved:

### A. Test Timeout on Real Network Call
- **Failure:** `api.test.ts` timed out when `env.allowDevIdentities` was strictly disabled in production mode because it attempted to contact remote Supabase servers for mock user profiles.
- **Resolution:** Gated demo identities to `!isProduction && (process.env.ALLOW_DEV_IDENTITIES === 'true' || process.env.NODE_ENV === 'test')`. In test mode, mock profiles resolve locally without remote network delays.

### B. Student ID DB Tampering Detection
- **Failure:** Scenario 3 initially evaluated `VERIFIED` when `student_id` was altered directly in `currentResult`.
- **Root Cause:** `verifyResultRecord` previously only checked for subject discrepancies and version changes.
- **Resolution:** Enhanced `verifyResultRecord` to explicitly check `student_id` and `academic_term` between `currentResult` and `latestVersion.snapshot_json`.

### C. Merkle Proof Field Naming Mismatch
- **Failure:** Scenario 5 initially passed verification even after attempting to tamper with the proof.
- **Root Cause:** Test attempted to mutate `.sibling_hash` instead of the typed field `.hash`.
- **Resolution:** Corrected property access to `.hash`. Proof validation immediately failed as expected.

---

## 4. Test Execution Guide

To run all automated test suites locally:

```bash
# Inside the server directory
cd server
npm test

# Run a specific test suite
npx vitest run tests/security_and_cryptographic_audit.test.ts

# Run with test coverage
npx vitest run --coverage
```

### Client Build Verification:
```bash
cd ../client
npm run build
```
Result: Vite 6 compiled 1,625 modules in ~5.4s without any TypeScript or bundling warnings.
