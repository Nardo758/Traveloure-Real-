/**
 * Neutral cart state only. No observers, scheduler, mail transport or payment hooks.
 * The enclosing cart mutation owns the commit. Post-payment cleanup is excluded.
 */
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";

export const CART_STATE_KEY = "_cart_automation";
export const CART_IDLE_MS = 60 * 60 * 1000;
const activityOrigin = new AsyncLocalStorage<boolean>();

/** Origin only, never a clock/observer. Stored timestamps remain the sole idle-time source. */
export function isCartActivityRequest(method: string, pathname: string): boolean {
  return method === "POST" && (
    /^\/api\/trips\/[^/]+\/items\/[^/]+\/route\/?$/.test(pathname) ||
    /^\/api\/quotes\/[^/]+\/accept\/?$/.test(pathname)
  );
}
export function withCartActivityOrigin<T>(task: () => T): T {
  return activityOrigin.run(true, task);
}
export function hasCartActivityOrigin(): boolean {
  return activityOrigin.getStore() === true;
}
export interface CartActivityStamp {
  at_ms: number;
  sequence_id: string;
}

/** Pure, bounded work: never traverses (or invokes getters on) legacy/client JSON. */
export function buildCartActivityStamp(
  _cartInput: unknown,
  serverTime: unknown,
  serverSequence: unknown,
): CartActivityStamp {
  return {
    at_ms: typeof serverTime === "number" && Number.isSafeInteger(serverTime) && serverTime >= 0
      ? serverTime : 0,
    sequence_id: typeof serverSequence === "string" ? serverSequence.slice(0, 100) : "",
  };
}

export const cartStateDependencies = { builder: buildCartActivityStamp };

/** The injectable builder is a verification seam, not an HTTP/client option. */
export function prepareCartActivity(
  builder: typeof buildCartActivityStamp = cartStateDependencies.builder,
): CartActivityStamp {
  try {
    return builder(null, Date.now(), randomUUID());
  } catch {
    throw new Error("Cart change could not be saved. Please retry.");
  }
}

export function cartObject(value: SQL): SQL {
  return sql`CASE WHEN jsonb_typeof(${value}) = 'object' THEN ${value} ELSE '{}'::jsonb END`;
}

function objectLiteral(value: unknown): SQL {
  // Actual HTTP JSON cannot have getters/cycles. This also fails safely for internal callers.
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return sql`'{}'::jsonb`;
    const encoded = JSON.stringify(value);
    return sql`${encoded}::jsonb`;
  } catch {
    return sql`'{}'::jsonb`;
  }
}

/** Client/display data cannot author, replace, or clear the server-owned envelope. */
export function preserveCartState(existing: SQL, display?: unknown): SQL {
  const old = cartObject(existing);
  const incoming = display === undefined ? old : cartObject(objectLiteral(display));
  return sql`(${incoming} - ${CART_STATE_KEY}) ||
    CASE WHEN ${old} ? ${CART_STATE_KEY}
      THEN jsonb_build_object(${CART_STATE_KEY}::text, ${old}->${CART_STATE_KEY})
      ELSE '{}'::jsonb END`;
}

/** All casts are guarded, including old JSON containing scalar/oversized fake timestamps. */
function activityMillis(meta: SQL): SQL {
  return sql`CASE
    WHEN jsonb_typeof(${meta} #> '{_cart_automation,activity,at_ms}') = 'number'
      AND (${meta} #>> '{_cart_automation,activity,at_ms}') ~ '^[0-9]{1,15}$'
    THEN CASE WHEN (${meta} #>> '{_cart_automation,activity,at_ms}')::bigint
      <= (extract(epoch from clock_timestamp()) * 1000)::bigint
      THEN (${meta} #>> '{_cart_automation,activity,at_ms}')::bigint ELSE 0::bigint END
    ELSE 0::bigint END`;
}

export function stampCartState(existing: SQL, stamp: CartActivityStamp, display?: unknown): SQL {
  const meta = preserveCartState(existing, display);
  const state = cartObject(sql`${meta}->${CART_STATE_KEY}`);
  const activity = objectLiteral(stamp);
  // A delayed writer cannot move the clock backwards or replace the newer sequence.
  return sql`${meta} || jsonb_build_object(${CART_STATE_KEY}::text,
    ${state} || jsonb_build_object('activity',
      CASE WHEN ${activityMillis(existing)} > ${stamp.at_ms}
        THEN ${existing} #> '{_cart_automation,activity}' ELSE ${activity} END))`;
}

/**
 * Provider cart money is billed in USD by the existing service-payment rail.
 * Capture the published unit price and raw availability facts, not a guessed quote
 * or a capacity reservation. Unknown/non-provider subjects get no snapshot.
 */
export function addedCartState(display: unknown, serviceId: string | SQL | null, slotId: string | null, stamp: CartActivityStamp, withActivity = true): SQL {
  const meta = withActivity ? stampCartState(sql`'{}'::jsonb`, stamp, display)
    : preserveCartState(sql`'{}'::jsonb`, display);
  const capturedAt = new Date(stamp.at_ms).toISOString();
  return sql`${meta} || jsonb_build_object(${CART_STATE_KEY}::text,
    ${cartObject(sql`${meta}->${CART_STATE_KEY}`)} || jsonb_build_object('snapshot',
      (SELECT jsonb_build_object(
        'price', p.price::text, 'currency', 'USD',
        'availability', jsonb_build_object(
          'schedule', p.availability, 'status', p.status,
          'slot', (SELECT jsonb_build_object(
            'date', s.date, 'start_time', s.start_time, 'end_time', s.end_time,
            'capacity', s.capacity, 'booked_count', s.booked_count, 'status', s.status)
            FROM vendor_availability_slots s WHERE s.id = ${slotId} AND s.service_id = p.id)),
        'captured_at', ${capturedAt}::text)
      FROM provider_services p WHERE p.id = ${serviceId} AND p.price IS NOT NULL)))`;
}

export async function replaceCartRowsWithActivity(
  userId: string,
  rows: { id: string; service_id: string; notes: string }[],
  executor: Executor = db,
  stamp = prepareCartActivity(),
): Promise<number> {
  const encoded = JSON.stringify(rows);
  const meta = addedCartState({}, sql`r.service_id`, null, stamp);
  const result = await executor.execute(sql`
    WITH removed AS (DELETE FROM cart_items WHERE user_id = ${userId} RETURNING id),
    inserted AS (
      INSERT INTO cart_items (id, user_id, service_id, quantity, notes, content_meta)
      SELECT r.id, ${userId}, r.service_id, 1, r.notes, ${meta}
      FROM jsonb_to_recordset(${encoded}::jsonb) AS r(id text, service_id text, notes text)
      CROSS JOIN (SELECT count(*) FROM removed) barrier
      RETURNING id)
    SELECT id FROM inserted`);
  return result.rows.length;
}

type Executor = Pick<typeof db, "execute">;

/** Preserve the writer's planned order/deduplication, but commit its whole migration once. */
export async function migrateCartRowsWithActivity(
  guestSessionId: string, userId: string, moveIds: string[], deleteIds: string[], duplicateIds: string[],
  executor: Executor = db, stamp = prepareCartActivity(),
): Promise<{ migrated: number; deduplicated: number }> {
  const meta = stampCartState(sql`cart_items.content_meta`, stamp);
  const result = await executor.execute(sql`
    WITH removed AS (
      DELETE FROM cart_items WHERE guest_session_id = ${guestSessionId}
        AND id = ANY(${sql.param(deleteIds)}::text[]) RETURNING id
    ), moved AS (
      UPDATE cart_items SET user_id = ${userId}, guest_session_id = NULL, content_meta = ${meta}
      WHERE guest_session_id = ${guestSessionId} AND id = ANY(${sql.param(moveIds)}::text[]) RETURNING id
    ), survivors AS (
      UPDATE cart_items SET content_meta = ${meta}
      WHERE guest_session_id = ${guestSessionId}
        AND NOT (id = ANY(${sql.param([...moveIds, ...deleteIds])}::text[]))
        AND (EXISTS (SELECT 1 FROM removed) OR EXISTS (SELECT 1 FROM moved))
      RETURNING id
    )
    SELECT (SELECT count(*) FROM moved)::integer AS migrated,
      (SELECT count(*) FROM removed WHERE id = ANY(${sql.param(duplicateIds)}::text[]))::integer AS deduplicated`);
  return result.rows[0] as { migrated: number; deduplicated: number };
}

/** One statement: disjoint deletion and survivor update; an empty cart closes its sequence. */
export async function deleteCartRowsWithActivity(
  predicate: SQL,
  executor: Executor = db,
  stamp: CartActivityStamp = prepareCartActivity(),
): Promise<string[]> {
  const meta = stampCartState(sql`cart_items.content_meta`, stamp);
  const result = await executor.execute(sql`
    WITH removed AS (
      DELETE FROM cart_items WHERE ${predicate}
      RETURNING id, user_id, guest_session_id
    ), stamped AS (
      UPDATE cart_items SET content_meta = ${meta}
      WHERE id NOT IN (SELECT id FROM removed)
        AND EXISTS (SELECT 1 FROM removed r WHERE
          (r.user_id IS NOT NULL AND r.user_id = cart_items.user_id)
          OR (r.user_id IS NULL AND r.guest_session_id IS NOT NULL
            AND r.guest_session_id = cart_items.guest_session_id))
      RETURNING id
    )
    SELECT id FROM removed`);
  return result.rows.map(row => String((row as { id: string }).id));
}

export type CartClockResult =
  | { eligible: false; reason: "empty_cart" | "no_activity_stamp" | "invalid_activity_stamp" | "not_idle" }
  | { eligible: true; sequenceId: string; lastActivityMs: number; idleMs: number };

/** One read of persisted JSONB and the database clock; no observer/history fallback. */
export async function queryCartClock(userId: string | null, guestSessionId: string | null = null): Promise<CartClockResult> {
  if (!userId && !guestSessionId) throw new Error("Cart owner is required");
  const result = await db.execute(sql`
    SELECT coalesce(jsonb_agg(jsonb_build_object('contentMeta', content_meta)), '[]'::jsonb) AS items,
      (extract(epoch from clock_timestamp()) * 1000)::bigint AS now_ms
    FROM cart_items WHERE ${userId
      ? sql`user_id = ${userId}` : sql`user_id IS NULL AND guest_session_id = ${guestSessionId}`}`);
  const row = result.rows[0] as { items: { contentMeta?: unknown }[]; now_ms: string };
  const clock = evaluateCartClock(row.items, Number(row.now_ms));
  if (!clock.eligible) logger.info({ reason: clock.reason }, "cart clock ineligible");
  return clock;
}

/** Caller supplies rows returned by the cart query; there is no observer-derived state. */
export function evaluateCartClock(rows: { contentMeta?: unknown }[], serverNowMs: number): CartClockResult {
  if (!rows.length) return { eligible: false, reason: "empty_cart" };
  let newest: CartActivityStamp | undefined;
  let malformed = false;
  for (const row of rows) {
    try {
      const state = (row.contentMeta as any)?.[CART_STATE_KEY];
      if (!state?.activity) continue;
      const a = state.activity;
      if (!Number.isSafeInteger(a.at_ms) || a.at_ms <= 0 ||
        typeof a.sequence_id !== "string" || !a.sequence_id || a.at_ms > serverNowMs) {
        malformed = true; continue;
      }
      if (!newest || a.at_ms > newest.at_ms ||
        (a.at_ms === newest.at_ms && a.sequence_id > newest.sequence_id)) newest = a;
    } catch { malformed = true; }
  }
  if (malformed) return { eligible: false, reason: "invalid_activity_stamp" };
  if (!newest) return { eligible: false, reason: "no_activity_stamp" };
  const idleMs = serverNowMs - newest.at_ms;
  if (idleMs < CART_IDLE_MS) return { eligible: false, reason: "not_idle" };
  return { eligible: true, sequenceId: newest.sequence_id, lastActivityMs: newest.at_ms, idleMs };
}

export function snapshotSkipReason(contentMeta: unknown): "no_snapshot" | null {
  try {
    const snapshot = (contentMeta as any)?.[CART_STATE_KEY]?.snapshot;
    return snapshot && typeof snapshot.price === "string" &&
      typeof snapshot.currency === "string" && snapshot.availability &&
      typeof snapshot.captured_at === "string" ? null : "no_snapshot";
  } catch { return "no_snapshot"; }
}

export function evaluateCartItemChange(contentMeta: unknown, current: {
  price: string; currency: string; availability: unknown;
}): "no_snapshot" | "unchanged" | "already_notified" | "changed" {
  if (snapshotSkipReason(contentMeta)) return "no_snapshot";
  const state = (contentMeta as any)[CART_STATE_KEY];
  const key = (v: any) => JSON.stringify([v.price, v.currency, v.availability]);
  if (state.notified && key(state.notified) === key(current)) return "already_notified";
  if (state.notified) return "changed";
  return key(state.snapshot) === key(current) ? "unchanged" : "changed";
}

/**
 * Records only a real already-queued row. No new mail kind, enqueue path or dispatcher.
 * Repeating the same row/value write is idempotent and never touches the activity stamp.
 */
export async function recordQueuedCartValues(
  cartItemId: string, outboxId: number, values: { price: string; currency: string; availability: unknown },
  executor: Executor = db,
): Promise<boolean> {
  const encoded = JSON.stringify({ ...values, outbox_id: outboxId });
  const result = await executor.execute(sql`
    UPDATE cart_items SET content_meta =
      jsonb_set(${cartObject(sql`content_meta`)}, '{_cart_automation}',
        ${cartObject(sql`content_meta->${CART_STATE_KEY}`)} ||
        jsonb_build_object('notified', ${encoded}::jsonb))
    WHERE id = ${cartItemId}
      AND EXISTS (SELECT 1 FROM email_outbox WHERE id = ${outboxId}
        AND email_type = 'cart_item_changed' AND status IN ('pending', 'processing', 'sent')
        AND metadata->>'cartItemId' = ${cartItemId})
      AND content_meta #> '{_cart_automation,snapshot}' IS NOT NULL
      AND content_meta #> '{_cart_automation,snapshot}' <> 'null'::jsonb
      AND ((content_meta #> '{_cart_automation,notified}') - 'outbox_id')
        IS DISTINCT FROM (${encoded}::jsonb - 'outbox_id')
    RETURNING id`);
  return result.rows.length === 1;
}
