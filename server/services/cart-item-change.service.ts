/**
 * Part 5: SELECT-only eligibility, no payment writers or provider transport.
 * Normal paid policy stays UNKNOWN; positives require the isolated test seam.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { readCurrentCartActivity, snapshotSkipReason, CART_STATE_KEY } from "./cart-email-state.service";
import {
  cartReminderVerification, cartReminderVerificationEnabled, readTravelerCommerceActivity,
} from "./cart-reminder.service";
import type { MarketingTx } from "./marketing-delivery-policy.service";

export const CART_ITEM_CHANGED = "cart_item_changed";
export interface CartChangeValues {
  price: string; currency: string; availability: unknown;
}
export interface CartChange {
  cartItemId: string; travelerId: string; sequenceId: string; scope: string | null;
  capturedAt: string; recipient: string; title: string; key: string;
  previous: CartChangeValues; current: CartChangeValues;
  reasons: ("price_up" | "price_down" | "availability_loss")[];
}
export interface CartChangeAssessment {
  changes: CartChange[]; skipped: Record<string, number>;
}
/** Candidate fault seam, restricted to the existing isolated test gate. */
export const cartItemChangeVerification = { queryFault: false };

/** Exact bounded decimal normalization: no floating-point equality or huge BigInt. */
function money(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 24 ||
      !/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}
function availability(value: any, units: number): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!["active", "paused", "draft"].includes(value.status)) return null;
  if (value.status !== "active") return false;
  if (value.slot === null) return true; // Active service, no selected slot; not a reservation.
  const slot = value.slot;
  if (!slot || !["available", "limited", "fully_booked", "blocked"].includes(slot.status)) return null;
  if (!Number.isSafeInteger(slot.capacity) || !Number.isSafeInteger(slot.booked_count) ||
      slot.capacity < 0 || slot.booked_count < 0) return null;
  return ["available", "limited"].includes(slot.status) && slot.capacity - slot.booked_count >= units;
}
function values(raw: any, units: number): CartChangeValues | null {
  const price = money(raw?.price), available = availability(raw?.availability, units);
  return price && raw?.currency === "USD" && available !== null
    ? { price, currency: "USD", availability: {
      status: raw.availability.status, slot: raw.availability.slot,
    } } : null;
}

/** Shared send-time normalization; does not consult or mutate notified history. */
export { values as normalizeCartChangeValues };

/** A->B->A between sweeps is invisible; stable target keys are not event history. */
export function classifyCartItemChange(meta: unknown, currentRaw: unknown, units = 1):
  | { eligible: false; reason: string }
  | { eligible: true; previous: CartChangeValues; current: CartChangeValues; reasons: CartChange["reasons"]; capturedAt: string } {
  try {
    if (!Number.isSafeInteger(units) || units < 1) return { eligible: false, reason: "cart_quantity_unknown" };
    if (snapshotSkipReason(meta)) return { eligible: false, reason: "no_snapshot" };
    const state = (meta as any)[CART_STATE_KEY];
    if (!Number.isFinite(Date.parse(state.snapshot.captured_at))) return { eligible: false, reason: "no_snapshot" };
    const previous = values(state.notified ?? state.snapshot, units), current = values(currentRaw, units);
    if (!previous || !current) return { eligible: false, reason: "catalog_state_unknown" };
    const cents = (price: string) => BigInt(price.replace(".", ""));
    const reasons: CartChange["reasons"] = [];
    if (cents(current.price) > cents(previous.price)) reasons.push("price_up");
    if (cents(current.price) < cents(previous.price)) reasons.push("price_down");
    if (availability(previous.availability, units) && !availability(current.availability, units)) reasons.push("availability_loss");
    if (!reasons.length) return { eligible: false, reason: state.notified ? "already_notified" : "unchanged" };
    return { eligible: true, previous, current, reasons, capturedAt: state.snapshot.captured_at };
  } catch {
    return { eligible: false, reason: "catalog_state_unknown" };
  }
}

/** Caller holds the existing traveler lock. Never assumes unsubscribe is consent needed here. */
export async function assessCartItemChanges(
  tx: MarketingTx, travelerId: string, scope: string | null, now: Date,
): Promise<CartChangeAssessment> {
  const result: CartChangeAssessment = { changes: [], skipped: {} };
  const skip = (reason: string) => { result.skipped[reason] = (result.skipped[reason] ?? 0) + 1; };
  if (!cartReminderVerificationEnabled() ||
      (await tx.execute(sql`SELECT current_schema() AS name`)).rows[0].name !== process.env.MESSAGING_VERIFICATION_SCHEMA) {
    skip("commerce_verification_disabled"); return result;
  }
  const account = (await tx.execute(sql`SELECT email, is_deleted, is_suspended FROM users WHERE id=${travelerId}`)).rows[0];
  if (!account || account.is_deleted) { skip("account_deleted"); return result; }
  if (account.is_suspended) { skip("account_suspended"); return result; }
  if (typeof account.email !== "string" || !/^[^@\s]+@traveloure-qa\.test$/i.test(account.email)) {
    skip("no_qa_account_recipient"); return result;
  }
  const rows = (await tx.execute(sql`SELECT id, content_meta AS "contentMeta", trip_id, itinerary_item_id, service_id, slot_id, quantity
    FROM cart_items WHERE user_id=${travelerId}
      AND experience_slug IS NOT DISTINCT FROM ${scope} FOR UPDATE`)).rows;
  const captured = rows.filter(row => {
    if (!snapshotSkipReason(row.contentMeta)) return true;
    skip("no_snapshot"); return false;
  });
  if (!captured.length) return result;
  const clock = readCurrentCartActivity(rows.map(row => ({ contentMeta: row.contentMeta })), now.getTime());
  if (!clock.eligible) { skip(clock.reason); return result; }
  if (rows.some(row => !row.trip_id || !row.itinerary_item_id || !row.service_id)) {
    skip("payment_correlation_ambiguous"); return result;
  }
  const paid = await readTravelerCommerceActivity(tx, travelerId, clock.lastActivityMs, clock.lastActivityMs);
  const subset = process.env.NODE_ENV === "test" && cartReminderVerification.recordedRailsOnly;
  if (!(subset ? paid.recordedClear : paid.allowed)) { skip(paid.reason!); return result; }
  for (const row of captured) {
    const quantity = row.quantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
      skip("cart_quantity_unknown"); continue;
    }
    if (process.env.NODE_ENV === "test" && cartItemChangeVerification.queryFault) {
      throw new Error("Injected item-change candidate query failure");
    }
    // Reuse precisely the published USD price / slot facts used by addedCartState.
    const catalog = (await tx.execute(sql`SELECT p.service_name AS title, p.price::text, p.price_type,
      jsonb_build_object('schedule', p.availability, 'status', p.status, 'slot',
        (SELECT jsonb_build_object('date', s.date, 'start_time', s.start_time, 'end_time', s.end_time,
          'capacity', s.capacity, 'booked_count', s.booked_count, 'status', s.status)
          FROM vendor_availability_slots s WHERE s.id=${row.slot_id} AND s.service_id=p.id)) AS availability
      FROM provider_services p JOIN itinerary_items i ON i.provider_service_id=p.id
        JOIN trips t ON t.id=i.trip_id
      WHERE p.id=${row.service_id} AND i.id=${row.itinerary_item_id}
        AND t.id=${row.trip_id} AND t.user_id=${travelerId}`)).rows[0];
    if (!catalog || !["fixed", "hourly", "per_person", "per_event"].includes(String(catalog.price_type))) {
      skip("catalog_state_unknown"); continue;
    }
    const snapshotSlot = (row.contentMeta as any)[CART_STATE_KEY].snapshot.availability?.slot;
    const slot = (catalog.availability as any)?.slot;
    if (Boolean(snapshotSlot) !== Boolean(slot) || (slot && ["date", "start_time", "end_time"].some(
      field => snapshotSlot?.[field] !== slot[field]))) {
      skip("availability_context_changed"); continue;
    }
    const decision = classifyCartItemChange(row.contentMeta, {
      price: catalog.price, currency: "USD", availability: catalog.availability,
    }, quantity);
    if (!decision.eligible) { skip(decision.reason); continue; }
    const digest = createHash("sha256").update(JSON.stringify([
      travelerId, row.id, decision.capturedAt, decision.current.price, decision.current.currency,
      availability(decision.current.availability, quantity),
    ])).digest("hex");
    result.changes.push({
      cartItemId: String(row.id), travelerId, sequenceId: clock.sequenceId, scope,
      recipient: account.email, title: String(catalog.title),
      key: `cart-item-changed:${digest}`, ...decision,
    });
  }
  return result;
}
