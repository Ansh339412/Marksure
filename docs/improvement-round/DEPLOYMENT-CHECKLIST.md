# MarkSure — Production Deployment & Operational Runbook

**Target Deployments:**
- **Frontend:** Vercel (`https://client-anshpreet.vercel.app`)
- **Backend:** Render (`https://marksure-api.onrender.com`)
- **Database:** Supabase PostgreSQL (`https://muiuocdyijlrcjxffcqf.supabase.co`)

---

## 1. Production Environment Variables Checklist

### A. Render (Backend Service)
Ensure the following environment variables are set in the Render Dashboard (**Environment** tab):

| Variable Name | Required | Example / Description |
|---|---|---|
| `NODE_ENV` | **YES** | `production` (Triggers strict security assertions) |
| `PORT` | **YES** | `4000` (Render default is assigned dynamically or 4000) |
| `INSTITUTION_PRIVATE_KEY_HEX` | **YES** | 64-character lowercase hexadecimal Ed25519 seed/private key (**NEVER** use default fallback key) |
| `SESSION_SECRET` | **YES** | High-entropy random 64-character alphanumeric string for HMAC session cookies |
| `CORS_ORIGIN` | **YES** | `https://client-anshpreet.vercel.app` (Canonical frontend origin) |
| `SUPABASE_URL` | **YES** | `https://muiuocdyijlrcjxffcqf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | Server-side privileged service key (begins with `eyJ...`) |
| `ALLOW_DEV_IDENTITIES` | **NO** | `false` (Omit or set to `false` in production) |
| `AUTO_SEED_DEMO_DATA` | **NO** | `false` (Omit or set to `false` in production) |

---

### B. Vercel (Frontend Project)
Ensure the following variables are configured in the Vercel Project Settings:

| Variable Name | Required | Value |
|---|---|---|
| `VITE_API_URL` | **YES** | `https://marksure-api.onrender.com` |
| `VITE_CANONICAL_HOST` | **YES** | `https://client-anshpreet.vercel.app` |

---

## 2. Institutional Key Generation & Rotation Runbook

### Key Generation Procedure
To generate a cryptographically secure 64-character Ed25519 keypair for production:

```bash
# Run one-liner using Node.js crypto module
node -e "const crypto = require('crypto'); const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519'); console.log('INSTITUTION_PRIVATE_KEY_HEX=' + privateKey.export({ format: 'jwk' }).d); console.log('INSTITUTION_PUBLIC_KEY_HEX=' + publicKey.export({ format: 'jwk' }).x);"
```

Alternatively, use the built-in helper in `server/src/crypto/signatures.ts`:
```ts
import { generateEd25519KeyPair } from './crypto/signatures.js';
const { privateKeyHex, publicKeyHex } = generateEd25519KeyPair();
```

### Key Rotation Steps
1. **Prepare New Keypair:** Generate `K_new` (Private & Public key).
2. **Update Database Batch History:** Existing published batches remain permanently anchored to the key they were signed with (`institution_public_key` stored in `publication_batches`).
3. **Deploy Backend Key:** Set `INSTITUTION_PRIVATE_KEY_HEX=K_new_private` in Render environment settings.
4. **Trigger Zero-Downtime Redeploy:** Render restarts the server. All future batches will be signed with `K_new`. The verification engine continues to verify historic batches against their stored public keys.

---

## 3. Database Migration Runbook (Supabase)

Execute migrations sequentially in the Supabase SQL Editor:

1. **Migration 001 (`supabase/migrations/001_initial_schema.sql`):**
   - Core tables: `profiles`, `students`, `publication_batches`, `merkle_proofs`, `results`, `result_versions`, `correction_requests`, `correction_approvals`, `ledger_events`.
2. **Migration 002 (`supabase/migrations/002_security_and_constraints.sql`):**
   - Unique composite constraint on approvals:
     ```sql
     ALTER TABLE correction_approvals
     ADD CONSTRAINT uq_correction_approval_approver UNIQUE (correction_request_id, approver_id);
     ```
   - Expanded ledger event check constraint:
     ```sql
     ALTER TABLE ledger_events DROP CONSTRAINT IF EXISTS ledger_events_event_type_check;
     ALTER TABLE ledger_events ADD CONSTRAINT ledger_events_event_type_check
       CHECK (event_type IN ('BATCH_PUBLISHED', 'CORRECTION_REQUESTED', 'CORRECTION_APPROVED', 'CORRECTION_FINALIZED', 'CORRECTION_REJECTED', 'RESULT_REVOKED'));
     ```
   - Unique index on publication batches:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS idx_publication_batches_term_merkle
     ON publication_batches (academic_term, merkle_root);
     ```

---

## 4. Deployment Verification Checklist

### Step 1: Backend Smoke Tests (Render)
- [ ] Ping health check: `GET https://marksure-api.onrender.com/health` returns `{"status":"ok"}`.
- [ ] Verify dev identities are disabled:
  ```bash
  curl -X POST https://marksure-api.onrender.com/api/auth/dev-session \
    -H "Content-Type: application/json" \
    -d '{"identity_id":"demo-admin"}'
  ```
  **Expected:** HTTP 403 `{"error":"Development identities and workspaces are disabled in this environment.","code":"DEV_IDENTITIES_DISABLED"}`.
- [ ] Verify dev key endpoint is blocked:
  ```bash
  curl https://marksure-api.onrender.com/api/auth/dev-signing-key/approver-1
  ```
  **Expected:** HTTP 403 `{"error":"Development signing keys are disabled in production.","code":"DEV_KEYS_DISABLED"}`.

### Step 2: Frontend Smoke Tests (Vercel)
- [ ] Open `https://client-anshpreet.vercel.app` in incognito window.
- [ ] Verify home page loads and interactive preview displays scenarios.
- [ ] Navigate to `/verify`: Public verification directory loads without requiring login.
- [ ] Verify student names are masked (`H****** S****`) and no raw PII is exposed.
- [ ] Click through a sample result verification: Merkle inclusion proof and Ed25519 signature verify successfully (`status: VERIFIED`).

---

## 5. Rollback Plan

If a deployment failure occurs:

1. **Render (Backend):**
   - Go to Render Dashboard -> **MarkSure API** -> **Deploys**.
   - Locate the previous successful build and click **Rollback to this deploy**.
   - Rollback completes in under 60 seconds.
2. **Vercel (Frontend):**
   - Go to Vercel Dashboard -> **MarkSure Client** -> **Deployments**.
   - Click the three dots on the previous working deployment and click **Promote to Production**.
   - Instant DNS switchover with zero downtime.
3. **Database (Supabase):**
   - Migration `002` consists solely of non-destructive additive constraints. If needed:
     ```sql
     ALTER TABLE correction_approvals DROP CONSTRAINT IF EXISTS uq_correction_approval_approver;
     DROP INDEX IF EXISTS idx_publication_batches_term_merkle;
     ```
