import dotenv from 'dotenv';
import { getPublicKeyFromPrivateHex } from '../crypto/signatures.js';

dotenv.config();

// Deterministic fallback dev keypair if .env does not specify INSTITUTION_PRIVATE_KEY_HEX yet
const DEFAULT_DEV_INSTITUTION_PRIVATE_KEY =
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

const rawInstPrivKey =
  process.env.INSTITUTION_PRIVATE_KEY_HEX?.trim() || DEFAULT_DEV_INSTITUTION_PRIVATE_KEY;

const derivedInstPubKey = getPublicKeyFromPrivateHex(rawInstPrivKey);

export const env = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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
