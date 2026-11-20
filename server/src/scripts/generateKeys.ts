import { generateEd25519KeyPair } from '../crypto/signatures.js';

console.log('=== MarkSure Ed25519 Keypair Generator ===\n');

const institution = generateEd25519KeyPair();
const approver1 = generateEd25519KeyPair();
const approver2 = generateEd25519KeyPair();

console.log('1. INSTITUTION KEYPAIR (Put Private Key ONLY in server/.env):');
console.log(`INSTITUTION_PRIVATE_KEY_HEX=${institution.privateKeyHex}`);
console.log(`INSTITUTION_PUBLIC_KEY_HEX=${institution.publicKeyHex}\n`);

console.log('2. APPROVER 1 (Dean of Examinations — Register Public Key in profiles):');
console.log(`DEMO_APPROVER_1_PRIVATE_KEY_HEX=${approver1.privateKeyHex}`);
console.log(`DEMO_APPROVER_1_PUBLIC_KEY_HEX=${approver1.publicKeyHex}\n`);

console.log('3. APPROVER 2 (Controller of Examinations — Register Public Key in profiles):');
console.log(`DEMO_APPROVER_2_PRIVATE_KEY_HEX=${approver2.privateKeyHex}`);
console.log(`DEMO_APPROVER_2_PUBLIC_KEY_HEX=${approver2.publicKeyHex}\n`);
