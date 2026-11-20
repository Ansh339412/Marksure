import { getSupabaseAdmin } from '../config/supabase.js';
import { computeLedgerEventHash } from '../crypto/hash.js';

export type LedgerEventType =
  | 'BATCH_PUBLISHED'
  | 'CORRECTION_REQUESTED'
  | 'CORRECTION_APPROVED'
  | 'CORRECTION_FINALIZED'
  | 'CORRECTION_REJECTED';

const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Appends a tamper-evident hash-chained event to `public.ledger_events`.
 */
export async function appendLedgerEvent(params: {
  eventType: LedgerEventType;
  entityId: string;
  actorId: string;
  payload: Record<string, unknown>;
}): Promise<{ eventHash: string; prevEventHash: string }> {
  const supabase = getSupabaseAdmin();

  const { data: latestEvents } = await supabase
    .from('ledger_events')
    .select('event_hash, seq_no')
    .order('seq_no', { ascending: false })
    .limit(1);

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

  const { error } = await supabase.from('ledger_events').insert({
    event_type: params.eventType,
    entity_id: params.entityId,
    actor_id: params.actorId,
    payload_json: fullPayload,
    prev_event_hash: prevEventHash,
    event_hash: eventHash,
  });

  if (error) {
    throw new Error(`Failed to append ledger event: ${error.message}`);
  }

  return { eventHash, prevEventHash };
}
