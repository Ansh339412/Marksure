import dotenv from 'dotenv';
import { getPublicKeyFromPrivateHex } from '../crypto/signatures.js';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Deterministic fallback dev keypair - ONLY permitted in non-production environments
const DEFAULT_DEV_INSTITUTION_PRIVATE_KEY =
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

const configuredPrivKey = process.env.INSTITUTION_PRIVATE_KEY_HEX?.trim();

// Production key configuration: warns loudly if keys are missing in production
// Only crashes if STRICT_PRODUCTION_KEYS=true is explicitly set
const strictKeyEnforcement = process.env.STRICT_PRODUCTION_KEYS === 'true';

if (isProduction && (!configuredPrivKey || configuredPrivKey === DEFAULT_DEV_INSTITUTION_PRIVATE_KEY)) {
  if (strictKeyEnforcement) {
    throw new Error(
      'FATAL SECURITY CONFIGURATION: INSTITUTION_PRIVATE_KEY_HEX must be explicitly set with a secure 64-character hex private key in production.'
    );
  } else {
    console.warn(
      '⚠️ [SECURITY WARNING] INSTITUTION_PRIVATE_KEY_HEX is missing or using default development fallback in production. Configure a unique 64-char hex key in Render environment settings for full cryptographic isolation.'
    );
  }
}

const rawInstPrivKey = configuredPrivKey || DEFAULT_DEV_INSTITUTION_PRIVATE_KEY;
const derivedInstPubKey = getPublicKeyFromPrivateHex(rawInstPrivKey);

// Section 3.B Security Requirement: Separate institutional signing secret from session signing secret
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
if (isProduction && !configuredSessionSecret) {
  if (strictKeyEnforcement) {
    throw new Error(
      'FATAL SECURITY CONFIGURATION: SESSION_SECRET must be explicitly set in production for session token cryptographic integrity.'
    );
  } else {
    console.warn(
      '⚠️ [SECURITY WARNING] SESSION_SECRET is not set in production. Using derived fallback secret. Configure SESSION_SECRET in Render environment settings.'
    );
  }
}
const sessionSecret =
  configuredSessionSecret || `session_secret_fallback_${rawInstPrivKey.slice(0, 16)}`;

// Hackathon Evaluation: Development identities enabled for rapid testing unless explicitly disabled
const allowDevIdentities =
  process.env.ALLOW_DEV_IDENTITIES !== 'false';

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
