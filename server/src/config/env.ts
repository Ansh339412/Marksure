import dotenv from 'dotenv';
import { getPublicKeyFromPrivateHex } from '../crypto/signatures.js';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Deterministic fallback dev keypair - ONLY permitted in non-production environments
const DEFAULT_DEV_INSTITUTION_PRIVATE_KEY =
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

const configuredPrivKey = process.env.INSTITUTION_PRIVATE_KEY_HEX?.trim();

// Section 3.B Security Requirement: Fail startup in production if institutional signing key is missing
if (isProduction && (!configuredPrivKey || configuredPrivKey === DEFAULT_DEV_INSTITUTION_PRIVATE_KEY)) {
  throw new Error(
    'FATAL SECURITY CONFIGURATION: INSTITUTION_PRIVATE_KEY_HEX must be explicitly set with a secure 64-character hex private key in production. Refusing to boot with insecure development fallback key.'
  );
}

const rawInstPrivKey = configuredPrivKey || DEFAULT_DEV_INSTITUTION_PRIVATE_KEY;
const derivedInstPubKey = getPublicKeyFromPrivateHex(rawInstPrivKey);

// Section 3.B Security Requirement: Separate institutional signing secret from session signing secret
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
if (isProduction && !configuredSessionSecret) {
  throw new Error(
    'FATAL SECURITY CONFIGURATION: SESSION_SECRET must be explicitly set in production for session token cryptographic integrity.'
  );
}
const sessionSecret =
  configuredSessionSecret || `dev_insecure_session_secret_for_local_testing_${rawInstPrivKey.slice(0, 16)}`;

// Section 3.A Security Requirement: Development identities and workspaces disabled in production by default
// Must be explicitly enabled with ALLOW_DEV_IDENTITIES=true and ONLY allowed when not in production
const allowDevIdentities =
  !isProduction && (process.env.ALLOW_DEV_IDENTITIES === 'true' || process.env.NODE_ENV === 'test');

// Section 3.C Security Requirement: Automatic demo data seeding disabled in production by default
const autoSeedDemoData =
  process.env.AUTO_SEED_DEMO_DATA === 'true' && !isProduction;

// Section 3.D Security Requirement: Canonical production frontend and explicit allowed origins
const CANONICAL_FRONTEND_HOST = 'https://client-anshpreet.vercel.app';
const rawCorsOrigin = process.env.CORS_ORIGIN?.trim() || '';
const parsedCustomOrigins = rawCorsOrigin
  ? rawCorsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(
  new Set([
    CANONICAL_FRONTEND_HOST,
    ...parsedCustomOrigins,
    ...(isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000']),
  ])
);

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv,
  isProduction,
  allowDevIdentities,
  autoSeedDemoData,
  sessionSecret,
  allowedOrigins,
  corsOrigin: rawCorsOrigin || CANONICAL_FRONTEND_HOST,
  supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || '',
  institutionId: process.env.INSTITUTION_ID?.trim() || 'MARKSURE-UNIV-01',
  institutionPrivateKeyHex: rawInstPrivKey,
  institutionPublicKeyHex:
    process.env.INSTITUTION_PUBLIC_KEY_HEX?.trim() || derivedInstPubKey,
};

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(env.supabaseUrl) &&
    env.supabaseUrl.startsWith('https://') &&
    !env.supabaseUrl.includes('YOUR_PROJECT_REF') &&
    Boolean(env.supabaseSecretKey)
  );
}
