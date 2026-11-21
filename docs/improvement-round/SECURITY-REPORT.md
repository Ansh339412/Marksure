# MarkSure — Application Security & Threat Model Report

**Audit Target:** MarkSure Academic Records Integrity & Verification Platform  
**Branch:** `improvement-round`  
**Security Focus:** Cryptographic Integrity, Key Management, RBAC, PII Protection, Ledger Chaining

---

## 1. Threat Model & Security Posture

### A. Assets Under Protection
1. **Academic Credential Validity:** Student grades, credits, SGPA/CGPA, and marksheet veracity.
2. **Institutional Ed25519 Private Key:** The authoritative institutional signing key used to attest batches.
3. **Approver Ed25519 Private Keys:** The volatile client-held signing keys held by dual academic approvers.
4. **Audit Trail / Ledger Continuity:** Immutable SHA-256 hash chain recording batches, corrections, and revocations.
5. **Student Privacy:** Protection of student PII (full names, contact info) from unauthenticated scrapers.

### B. Threat Actors
- **Unauthenticated External Scraper:** Attempts to harvest student rosters or forge credential verification URLs.
- **Rogue / Compromised Database Administrator:** Has direct write access to Supabase PostgreSQL and attempts to silently alter marks or insert unapproved grade changes.
- **Single Compromised Approver:** An internal staff member attempting to unilaterally modify grades without secondary authorized approval.
- **Malicious Student / Insider:** Attempts to tamper with client-side cookies or manipulate verification parameters.

---

## 2. Vulnerability Catalog & Mitigations

### VULN-01: Unauthenticated Privilege Escalation via Development Workspaces (CRITICAL)
- **CVSS Score:** 9.8 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
- **Description:** `POST /api/auth/dev-session` and `Bearer demo-admin` headers allowed any caller to assume administrative or approver roles without authentication when development identities were enabled.
- **Reproduction:**
  ```bash
  curl -X POST https://marksure-api.onrender.com/api/auth/dev-session \
    -H "Content-Type: application/json" \
    -d '{"identity_id":"demo-admin"}'
  ```
  Returns full admin JWT/session cookie.
- **Mitigation Implemented:**
  - Evaluated `env.allowDevIdentities` strictly as `false` in production.
  - Return HTTP 403 `DEV_IDENTITIES_DISABLED` on all dev endpoints in production.
  - Blocked `demo-*` tokens in `requireAuth` middleware.

---

### VULN-02: Key Conflation & Deterministic Private Key Fallback (HIGH)
- **CVSS Score:** 8.6 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)
- **Description:** If `INSTITUTION_PRIVATE_KEY_HEX` was omitted from environment variables, the server silently defaulted to `DEFAULT_DEV_INSTITUTION_PRIVATE_KEY` (`1111...`). An attacker could forge institutional manifest signatures using this known key. In addition, the session HMAC secret was derived from the institutional private key.
- **Mitigation Implemented:**
  - Added a fatal check during startup in `server/src/config/env.ts` when `NODE_ENV === 'production'` if the key is missing or matches the default development key.
  - Introduced an isolated `SESSION_SECRET` variable, decoupling session tokens from asymmetric signing keys.

---

### VULN-03: Insecure Cross-Origin Request Forgery (CORS/CSRF) Configuration (MEDIUM)
- **CVSS Score:** 6.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N)
- **Description:** CORS policy permitted arbitrary subdomains of `*.vercel.app`, allowing malicious preview deployments or unvetted Vercel domains to send authenticated cross-origin requests.
- **Mitigation Implemented:**
  - Restricted CORS to `https://client-anshpreet.vercel.app` and explicit configured origins.
  - Added strict `csrfOriginCheck` middleware validating incoming `Origin` and `Referer` headers on state-changing requests (`POST`, `PUT`, `DELETE`).

---

### VULN-04: Student PII Exposure on Public QR Verification Route (MEDIUM)
- **CVSS Score:** 5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)
- **Description:** The public QR verification endpoint `GET /api/verify/:resultId` hardcoded `includeFullName: true`, leaking the full legal name of students to anyone scanning a QR code or enumerating UUIDs.
- **Mitigation Implemented:**
  - Defaulted `includeFullName: false` on public routes.
  - Returned masked student names (e.g., `H****** S****`) for all unauthenticated public verification views. Full names are only viewable within authenticated administrative and student portals.

---

### VULN-05: Ledger Hash Chain Concurrency Race (HIGH)
- **CVSS Score:** 7.5 (CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:H)
- **Description:** `appendLedgerEvent` performed a non-atomic read-then-insert operation. If two publication or correction operations occurred simultaneously, both would adopt the same `prev_event_hash`, causing a permanent fork in the audit chain.
- **Mitigation Implemented:**
  - Wrapped `appendLedgerEvent` in an in-memory asynchronous execution queue (`appendQueue`).
  - Added an optimistic retry mechanism (up to 3 attempts with exponential backoff) if database insertion encounters conflicts.

---

## 3. Cryptographic Verification Integrity Check

The platform enforces the following immutable cryptographic guarantees:

```
[Canonical Result JSON] ---> SHA-256 ---> [Leaf Hash]
                                                |
                                          [Merkle Tree]
                                                |
                                        [Merkle Root] + Manifest
                                                |
                                        Ed25519 Signature (Institution Key)
```

1. **Leaf Tamper Detection:** Any alteration to marks, roll numbers, student IDs, or subject codes alters the computed SHA-256 leaf hash, immediately failing Merkle inclusion proof verification and triggering `TAMPERED` status.
2. **Direct DB SQL Modification Detection:** If a DBA updates the live database table `results.subjects_json` without modifying the snapshot, MarkSure flags `TAMPERED` and pinpoints the exact changed subject codes and score differentials.
3. **Dual-Approval Workflow:** Any revision to marks requires two distinct Ed25519 signatures from authorized approvers (`APPROVER_1` and `APPROVER_2`). Unilateral modifications are strictly rejected by both the backend API and client verification engines.

---

## 4. Remaining Security Risks & Hardening Recommendations

1. **Distributed Concurrency:** The current in-memory promise mutex in `ledger.ts` serializes writes on a single backend instance. If deployed across multiple horizontal Render worker instances, a distributed lock (e.g., Redis Redlock or Postgres advisory lock `pg_advisory_xact_lock`) should be enabled.
2. **Database Row Level Security (RLS):** Currently, the backend uses `SUPABASE_SERVICE_ROLE_KEY`. Direct client access to Supabase tables should remain disabled, and Postgres RLS policies should be enforced to restrict direct database connections.
3. **Key Management Service (KMS):** The institutional private key should ideally be hosted inside a Cloud KMS (e.g., AWS KMS or Google Cloud KMS) rather than in environment variables.
