# MarkSure 

### Academic Records Integrity & Verification Platform

**Every result has a history. Every change has proof.**

MarkSure is an academic results publishing and verification platform built to make published records independently verifiable and unauthorized changes detectable. It combines SHA-256 hashing, a domain-separated Merkle tree, Ed25519 digital signatures, QR-based verification and a dual-approval correction workflow.

> MarkSure is an independently developed software project. It is not an official product of, or endorsed by, any university or institution.

<p align="center">
  <a href="https://github.com/Ansh339412/Marksure">Repository</a>
  ·
  <a href="https://github.com/Ansh339412/Marksure/issues">Report an issue</a>
</p>

---

## Why MarkSure?

A conventional results database can show what a record contains today, but that alone does not prove what was originally published. If a privileged user changes a mark directly in the database, the application needs an independent reference to detect the difference.

MarkSure addresses this by preserving a cryptographically verifiable publication record. A verifier can validate an individual result against its Merkle proof and the institution's signed publication data, then compare it with the current record.

## Core capabilities

| Capability | What it does |
| --- | --- |
| Result publishing | Publishes academic result records and creates a cryptographic commitment for the batch. |
| Merkle verification | Generates and validates an inclusion proof for an individual result. |
| Institutional signatures | Uses Ed25519 signatures to authenticate publication data. |
| QR verification | Provides a QR-linked route for checking an individual result. |
| Controlled corrections | Supports correction requests with a reason and two distinct approver identities. |
| Tamper detection | Compares the current record with the protected published record and reports differences. |
| Audit history | Exposes publication, correction and verification-related history. |
| Role-based workspaces | Separates administrator, approver and student experiences. |

## How verification works

1. An administrator submits a batch of result records.
2. The backend validates and canonically serializes each record.
3. SHA-256 hashes are generated for the records.
4. The hashes are assembled into a Merkle tree.
5. The resulting Merkle root is included in publication data and signed using Ed25519.
6. An individual result can be checked using its stored snapshot and Merkle inclusion proof.
7. The verifier validates the proof and institutional signature, then compares the current database record with the published record.

A valid Merkle proof establishes that a record belongs to the committed batch. The digital signature authenticates the publication commitment, assuming the signing key and trusted public-key configuration are secure.

### Correction workflow

A correction request includes the proposed change and its reason. Two different authorized approvers must independently approve the same correction payload. The backend validates both signatures before applying the correction and preserving the previous version.

A single approval must not finalize a correction.

### Verification outcomes

The application communicates the result of verification using explicit states, including:

- **Verified** — the cryptographic checks pass and the current record matches the published record.
- **Tampered** — the current record differs from the protected published record.
- **Invalid signature / proof** — a required cryptographic check fails.
- **Corrected** — an authorized correction has been recorded, with the relevant version history retained.

The exact status depends on the verification logic and response returned by the backend.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    React + TypeScript                    │
│  Home · Login · Admin · Student · Corrections · Verify   │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTP / JSON
┌────────────────────────────▼─────────────────────────────┐
│                 Node.js + Express API                    │
│                                                          │
│  Authentication & roles     Result management            │
│  Publication workflow       Correction approvals         │
│  QR verification            Audit operations              │
└───────────────┬─────────────────────────┬────────────────┘
                │                         │
┌───────────────▼──────────────┐  ┌───────▼────────────────┐
│       Supabase              │  │   Cryptographic layer  │
│       PostgreSQL            │  │                        │
│       Auth / records        │  │   SHA-256              │
│       Versions / history    │  │   Merkle tree          │
│                             │  │   Ed25519 signatures   │
└─────────────────────────────┘  └────────────────────────┘
```

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Icons | Lucide React |
| QR codes | qrcode.react |
| Backend | Node.js, Express 4, TypeScript |
| Database and authentication | Supabase, PostgreSQL, Supabase Auth |
| Cryptography | `@noble/ed25519`, SHA-256, Merkle tree |
| Frontend hosting configuration | Vercel |
| Backend deployment configuration | Render |
| Version control | Git, GitHub |

## Repository structure

```text
Marksure/
├── Agents.md
├── LICENSE
├── render.yaml
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── crypto/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── index.ts
│   ├── .env.example
│   └── package.json
└── supabase/
```

## Run locally

### Prerequisites

- Node.js (LTS recommended)
- npm
- Git
- A Supabase project

### 1. Clone the repository

```bash
git clone https://github.com/Ansh339412/Marksure.git
cd Marksure
```

### 2. Configure the backend

```bash
cd server
npm install
```

Copy `.env.example` to `.env` and fill in the required values:

```env
PORT=4000
CORS_ORIGIN=http://localhost:5173

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

INSTITUTION_ID=MARKSURE-UNIV-01
INSTITUTION_PRIVATE_KEY_HEX=
INSTITUTION_PUBLIC_KEY_HEX=
```

Generate an Ed25519 keypair using the project's provided script:

```bash
npm run generate:keys
```

Store the generated private key securely. Never commit it or expose it to the browser.

Start the API:

```bash
npm run dev
```

The API uses port `4000` by default. Its health endpoint is available at:

```text
http://localhost:4000/api/health
```

### 3. Configure the frontend

In a second terminal:

```bash
cd client
npm install
```

Copy `.env.example` to `.env`:

```env
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Start the frontend:

```bash
npm run dev
```

Vite will print the local development URL, usually `http://localhost:5173`.

### 4. Production builds and tests

Frontend production build:

```bash
cd client
npm run build
```

Backend build and tests:

```bash
cd server
npm run build
npm test
```

## API overview

The Express application mounts the following route groups:

| Route prefix | Purpose |
| --- | --- |
| `/api/health` | Service health, institution identifier and cryptographic configuration metadata. |
| `/api/auth` | Authentication-related operations. |
| `/api/admin` | Administrative result and publication operations. |
| `/api/student` | Student-facing academic records. |
| `/api/verify` | Public result verification. |
| `/api/corrections` | Correction requests and approvals. |
| `/api/audit` | Audit and integrity-related operations. |

See the route implementations in `server/src/routes/` for the current endpoint details and request contracts.

## Security notes

MarkSure uses cryptographic verification as one layer of a broader security model. Correctness depends on implementation, configuration, identity controls and key protection.

- Keep the institution's Ed25519 private key on the server or in a dedicated key-management system.
- Never expose Supabase secret/service credentials through `VITE_*` variables or frontend bundles.
- Obtain trusted public keys from a trusted institutional configuration, not from untrusted QR parameters.
- Enforce authorization on the backend; frontend route guards are not a security boundary.
- Require two distinct authorized approvers and verify signatures over the exact correction payload.
- Preserve original publication data and historical versions.
- Treat database triggers as supplementary controls, not as protection against privileged database tampering.
- For stronger production assurance, store signed publication manifests and backups independently of the primary database and consider external anchoring.
- Restrict CORS to the actual application origins in production. Do not use a wildcard origin with credentialed requests.
- Do not use real student records or production credentials in development fixtures.

**Deployment is not the same as a security audit.** A production institutional rollout should include key-management design, access-control review, backup and recovery procedures, monitoring, privacy review and independent penetration testing.

## Deployment

The repository includes:

- `client/vercel.json` for client-side route rewrites on Vercel.
- `render.yaml` for the Express API service on Render.

Configure the environment variables in the hosting providers' dashboards. Use the exact production frontend origin for the backend's `CORS_ORIGIN` setting and verify the deployed API health endpoint before directing users to the application.

## Contributing

Issues and improvements are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Run the relevant build and tests.
5. Open a pull request describing the change and its verification.

Do not include credentials, private keys, real student data or other sensitive information in commits or issues.

## License

This project is distributed under the license in [LICENSE](LICENSE).

---

<p align="center">
  <strong>MarkSure</strong><br/>
  Making academic records verifiable, accountable and trustworthy.
</p>
