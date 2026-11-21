import { getSupabaseAdmin } from '../config/supabase.js';
import { computeLedgerEventHash } from '../crypto/hash.js';

export type LedgerEventType =
  | 'BATCH_PUBLISHED'
  | 'CORRECTION_REQUESTED'
  | 'CORRECTION_APPROVED'
  | 'CORRECTION_FINALIZED'
  | 'CORRECTION_REJECTED';

const GENESIS_PREV_HASH = '0'.repeat(64);

// Atomic append queue to prevent forked hash chains during concurrent submissions
let appendQueue: Promise<any> = Promise.resolve();

async function doAppendLedgerEvent(params: {
  eventType: LedgerEventType;
  entityId: string;
  actorId: string;
  payload: Record<string, unknown>;
}): Promise<{ eventHash: string; prevEventHash: string }> {
  const supabase = getSupabaseAdmin();

  // Retry loop in case a concurrent transaction modified the ledger
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data: latestEvents, error: fetchErr } = await supabase
      .from('ledger_events')
      .select('event_hash, seq_no')
      .order('seq_no', { ascending: false })
      .limit(1);

    if (fetchErr) {
      throw new Error(`Failed to read latest ledger state: ${fetchErr.message}`);
    }

    const prevEventHash =
      latestEvents && latestEvents.length > 0
        ? String(latestEvents[0].event_hash)
        : GENESIS_PREV_HASH;

    const fullPayload = {
      ...params.payload,
      actor_id: params.actorId,
      entity_id: params.entityId,
      event_type: params.eventType,
    };

    const eventHash = computeLedgerEventHash(prevEventHash, fullPayload);

    const { error: insertErr } = await supabase.from('ledger_events').insert({
      event_type: params.eventType,
      entity_id: params.entityId,
      actor_id: params.actorId,
      payload_json: fullPayload,
      prev_event_hash: prevEventHash,
      event_hash: eventHash,
    });

    if (!insertErr) {
      return { eventHash, prevEventHash };
    }

    if (attempt === maxRetries) {
      throw new Error(`Failed to append ledger event after ${maxRetries} attempts: ${insertErr.message}`);
    }

    // Exponential backoff before retry
    await new Promise((r) => setTimeout(r, attempt * 50));
  }

  throw new Error('Unexpected ledger append termination.');
}

/**
 * Appends a tamper-evident hash-chained event to `public.ledger_events`.
 * Thread-safe and serialized through single-flight promise queuing.
 */
export async function appendLedgerEvent(params: {
  eventType: LedgerEventType;
  entityId: string;
  actorId: string;
  payload: Record<string, unknown>;
}): Promise<{ eventHash: string; prevEventHash: string }> {
  return new Promise((resolve, reject) => {
    appendQueue = appendQueue
      .then(async () => {
        try {
          const res = await doAppendLedgerEvent(params);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      })
      .catch((err) => {
        // Recover queue to unblock future items
        reject(err);
      });
  });
}
