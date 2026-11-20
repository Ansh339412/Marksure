import { describe, expect, it } from 'vitest';
import { CorrectionApprovalPayload } from '../src/crypto/canonical.js';
import { computeLedgerEventHash } from '../src/crypto/hash.js';
import {
  computeCorrectionPayloadHash,
  generateEd25519KeyPair,
  signCorrectionApproval,
} from '../src/crypto/signatures.js';
import {
  validateCorrectionApprovalPure,
  validateTwoApprovalsBeforeFinalizePure,
} from '../src/services/correctionService.js';

describe('MarkSure Two-Approval Correction & Adversarial Security Suite', () => {
  const approver1 = generateEd25519KeyPair();
  const approver2 = generateEd25519KeyPair();
  const rogueKey = generateEd25519KeyPair();

  const basePayload: CorrectionApprovalPayload = {
    correction_request_id: '10000000-0000-0000-0000-000000000001',
    result_id: '20000000-0000-0000-0000-000000000002',
    from_version: 1,
    subject_code: 'CS301',
    old_marks: 78,
    new_marks: 85,
    reason: 'Verified answer script re-totaling error in Section B',
  };

  const payloadHash = computeCorrectionPayloadHash(basePayload);

  it('rejects publishing a correction with only one approval (Test #7 / Attack #8)', () => {
    const sig1 = signCorrectionApproval(basePayload, approver1.privateKeyHex);

    const check = validateTwoApprovalsBeforeFinalizePure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approvals: [
        {
          approver_id: 'approver-1',
          approver_public_key: approver1.publicKeyHex,
          signature_hex: sig1,
          signed_payload_hash: payloadHash,
        },
      ],
    });

    expect(check.ready).toBe(false);
    expect(check.error).toContain('SINGLE APPROVAL REJECTED');
  });

  it('rejects duplicate approver attempting to approve twice (Test #8 / Attack #6)', () => {
    const sig1 = signCorrectionApproval(basePayload, approver1.privateKeyHex);

    const dupAttempt = validateCorrectionApprovalPure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-1',
      approverPublicKeyHex: approver1.publicKeyHex,
      signatureHex: sig1,
      existingApprovals: [
        {
          approver_id: 'approver-1',
          approver_public_key: approver1.publicKeyHex,
          signature_hex: sig1,
          signed_payload_hash: payloadHash,
        },
      ],
    });

    expect(dupAttempt.valid).toBe(false);
    expect(dupAttempt.error).toContain('DUPLICATE APPROVER REJECTED');
  });

  it('rejects forged or invalid approval signatures (Test #9 / Attack #5)', () => {
    // Rogue key signs the payload while pretending to be Approver 2
    const forgedSig = signCorrectionApproval(basePayload, rogueKey.privateKeyHex);

    const check = validateCorrectionApprovalPure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-2',
      approverPublicKeyHex: approver2.publicKeyHex,
      signatureHex: forgedSig,
      existingApprovals: [],
    });

    expect(check.valid).toBe(false);
    expect(check.error).toContain('INVALID ED25519 SIGNATURE');
  });

  it('rejects changing correction reason or marks after approval (Attack #7)', () => {
    const sig1 = signCorrectionApproval(basePayload, approver1.privateKeyHex);

    // Admin or DB attacker changes the reason after Approver 1 signed
    const alteredPayload: CorrectionApprovalPayload = {
      ...basePayload,
      reason: 'Tampered reason after signature',
    };

    const check = validateCorrectionApprovalPure({
      payload: alteredPayload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-2',
      approverPublicKeyHex: approver2.publicKeyHex,
      signatureHex: sig1,
      existingApprovals: [],
    });

    expect(check.valid).toBe(false);
    expect(check.error).toContain('PAYLOAD TAMPERING DETECTED');
  });

  it('rejects replay of an old approval signature on a new correction request or version (Attack #12)', () => {
    // Old signature was signed for correction_request_id = 1000...001 (from_version = 1)
    const oldSig = signCorrectionApproval(basePayload, approver1.privateKeyHex);

    // New request has a different correction_request_id or from_version = 2
    const newRequestPayload: CorrectionApprovalPayload = {
      ...basePayload,
      correction_request_id: '99999999-9999-9999-9999-999999999999',
      from_version: 2,
    };
    const newPayloadHash = computeCorrectionPayloadHash(newRequestPayload);

    const replayCheck = validateCorrectionApprovalPure({
      payload: newRequestPayload,
      expectedPayloadHash: newPayloadHash,
      approverId: 'approver-1',
      approverPublicKeyHex: approver1.publicKeyHex,
      signatureHex: oldSig,
      existingApprovals: [],
    });

    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.error).toContain('INVALID ED25519 SIGNATURE');
  });

  it('succeeds when two distinct authorized approvers sign the exact canonical payload (Test #10)', () => {
    const sig1 = signCorrectionApproval(basePayload, approver1.privateKeyHex);
    const sig2 = signCorrectionApproval(basePayload, approver2.privateKeyHex);

    const app1Valid = validateCorrectionApprovalPure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-1',
      approverPublicKeyHex: approver1.publicKeyHex,
      signatureHex: sig1,
      existingApprovals: [],
    });
    expect(app1Valid.valid).toBe(true);

    const existing = [
      {
        approver_id: 'approver-1',
        approver_public_key: approver1.publicKeyHex,
        signature_hex: sig1,
        signed_payload_hash: payloadHash,
      },
    ];

    const app2Valid = validateCorrectionApprovalPure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approverId: 'approver-2',
      approverPublicKeyHex: approver2.publicKeyHex,
      signatureHex: sig2,
      existingApprovals: existing,
    });
    expect(app2Valid.valid).toBe(true);

    const finalizeReady = validateTwoApprovalsBeforeFinalizePure({
      payload: basePayload,
      expectedPayloadHash: payloadHash,
      approvals: [
        ...existing,
        {
          approver_id: 'approver-2',
          approver_public_key: approver2.publicKeyHex,
          signature_hex: sig2,
          signed_payload_hash: payloadHash,
        },
      ],
    });
    expect(finalizeReady.ready).toBe(true);
  });

  it('verifies hash-chained ledger integrity and detects tampering in event history', () => {
    const genesisPrev = '0'.repeat(64);
    const ev1Payload = { event_type: 'BATCH_PUBLISHED', batch_id: 'b1' };
    const ev1Hash = computeLedgerEventHash(genesisPrev, ev1Payload);

    const ev2Payload = { event_type: 'CORRECTION_REQUESTED', req_id: 'r1' };
    const ev2Hash = computeLedgerEventHash(ev1Hash, ev2Payload);

    // If an attacker modifies ev1Payload in ledger_events, ev1's recomputed hash no longer matches ev2's prev_event_hash
    const tamperedEv1Hash = computeLedgerEventHash(genesisPrev, {
      ...ev1Payload,
      batch_id: 'tampered',
    });
    expect(tamperedEv1Hash).not.toBe(ev1Hash);
    expect(computeLedgerEventHash(tamperedEv1Hash, ev2Payload)).not.toBe(ev2Hash);
  });
});
