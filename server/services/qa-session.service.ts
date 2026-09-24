/**
 * Q&A SESSIONS — a timed live chat an expert sells (Locked Decision 54, ledger
 * `2026-09-24-live-chat-qa-sessions`; decision-maker, Sep 24, 2026: "Q&A Sessions … let the
 * experts set the session time limits 15mins, 30mins 1hour etc").
 *
 * A Q&A Session is an ordinary listing on the `ask_me_anything` expert offering, delivered as
 * `async_messaging`, whose `duration_minutes` is the session length the expert chose. It is bought
 * through the one checkout. After that, either party presses Start and this service stamps
 * `booking_details.qaSession = { startedAt, endsAt, lengthMinutes, startedBy }` — the ONE writer of
 * that key (a §19d server-authored key; no client body can plant it).
 *
 *   ONE START. The stamp is an atomic conditional (§15): it lands only on a PAID (`confirmed`, with
 *     a PaymentIntent) booking that has no stamp yet, so a double press or two people pressing at
 *     once produce one session; a later press reads the session back.
 *   THE LENGTH IS THE ONE THAT WAS BOUGHT. It comes from the booking's purchase-time terms snapshot
 *     (`offering_contract_snapshot.terms.sessionLengthMinutes`), so an expert editing the listing
 *     later cannot shorten a session already sold. A booking made before that snapshot field
 *     existed falls back to the listing's current length, and the read says which it used (§13).
 *   NOTHING IS LOCKED AT THE END. The chat stays open — the stamp records the paid window, it does
 *     not cut anyone off mid-sentence. Completion is the EXISTING provider-declared rail for
 *     `async_messaging` (LD 47: the expert declares, the traveler's window runs).
 *   ONE 404 for "no such booking", "not yours" and "not a Q&A Session" (LD 40 posture).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import {
  QA_SESSION_OFFERING_KEY,
  isQaSessionLength,
  qaSessionState,
  type QaSessionState,
} from "@shared/live-availability";

/** Statuses a session may START from: paid and not yet completed, disputed or refunded. */
export const QA_SESSION_START_FROM_STATUSES = ["confirmed"] as const;

interface Row {
  id: string;
  traveler_id: string | null;
  provider_id: string | null;
  owner_id: string | null;
  status: string | null;
  has_payment: boolean;
  stamp: { startedAt?: string; endsAt?: string; lengthMinutes?: number; startedBy?: string } | null;
  snap_len: string | null;
  has_snap_terms: boolean;
  listing_len: number | null;
  offering_key: string | null;
  delivery_method: string | null;
  service_name: string | null;
}

export interface QaSessionView {
  bookingId: string;
  serviceName: string | null;
  viewer: "traveler" | "expert";
  status: string | null;
  paid: boolean;
  lengthMinutes: number | null;
  /** Where the length came from: the purchase-time snapshot, or the listing (older bookings). */
  lengthSource: "purchase" | "listing";
  state: QaSessionState | null;
  canStart: boolean;
}

export type QaSessionRefusal =
  | { ok: false; status: 404; reason: "not_found" }
  | { ok: false; status: 409; reason: "not_paid" | "no_session_length" | "not_startable" };

async function loadRow(bookingId: string): Promise<Row | null> {
  const r = await db.execute(sql`
    SELECT b.id, b.traveler_id, b.provider_id, s.user_id AS owner_id, b.status,
           (b.stripe_payment_intent_id IS NOT NULL) AS has_payment,
           b.booking_details->'qaSession' AS stamp,
           b.offering_contract_snapshot->'terms'->>'sessionLengthMinutes' AS snap_len,
           (b.offering_contract_snapshot ? 'terms') AS has_snap_terms,
           s.duration_minutes AS listing_len,
           s.expert_offering_type_key AS offering_key,
           s.delivery_method, s.service_name
    FROM service_bookings b
    JOIN provider_services s ON s.id = b.service_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `);
  return ((r.rows ?? [])[0] as unknown as Row) ?? null;
}

function viewerOf(row: Row, userId: string): "traveler" | "expert" | null {
  if (row.traveler_id && row.traveler_id === userId) return "traveler";
  if ((row.provider_id && row.provider_id === userId) || (row.owner_id && row.owner_id === userId)) return "expert";
  return null;
}

export function isQaSessionListing(offeringKey: string | null | undefined, deliveryMethod: string | null | undefined): boolean {
  return offeringKey === QA_SESSION_OFFERING_KEY && deliveryMethod === "async_messaging";
}

function lengthOf(row: Row): { lengthMinutes: number | null; lengthSource: "purchase" | "listing" } {
  if (row.has_snap_terms) {
    const n = row.snap_len == null ? null : Number(row.snap_len);
    return { lengthMinutes: isQaSessionLength(n) ? n : null, lengthSource: "purchase" };
  }
  const n = row.listing_len == null ? null : Number(row.listing_len);
  return { lengthMinutes: isQaSessionLength(n) ? n : null, lengthSource: "listing" };
}

function toView(row: Row, viewer: "traveler" | "expert", now = new Date()): QaSessionView {
  const { lengthMinutes, lengthSource } = row.stamp?.lengthMinutes
    ? { lengthMinutes: row.stamp.lengthMinutes, lengthSource: lengthOf(row).lengthSource }
    : lengthOf(row);
  const paid = !!row.has_payment && (QA_SESSION_START_FROM_STATUSES as readonly string[]).includes(row.status ?? "");
  const state = lengthMinutes ? qaSessionState(lengthMinutes, row.stamp, now) : null;
  return {
    bookingId: row.id,
    serviceName: row.service_name,
    viewer,
    status: row.status,
    paid,
    lengthMinutes,
    lengthSource,
    state,
    canStart: paid && !!lengthMinutes && !row.stamp?.startedAt,
  };
}

export async function readQaSession(
  bookingId: string,
  userId: string,
): Promise<{ ok: true; view: QaSessionView } | QaSessionRefusal> {
  const row = await loadRow(bookingId);
  const viewer = row ? viewerOf(row, userId) : null;
  if (!row || !viewer || !isQaSessionListing(row.offering_key, row.delivery_method)) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  return { ok: true, view: toView(row, viewer) };
}

export async function startQaSession(
  bookingId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: true; view: QaSessionView; started: boolean } | QaSessionRefusal> {
  const row = await loadRow(bookingId);
  const viewer = row ? viewerOf(row, userId) : null;
  if (!row || !viewer || !isQaSessionListing(row.offering_key, row.delivery_method)) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (row.stamp?.startedAt) return { ok: true, view: toView(row, viewer, now), started: false };
  const { lengthMinutes } = lengthOf(row);
  if (!lengthMinutes) return { ok: false, status: 409, reason: "no_session_length" };

  const startedAt = now.toISOString();
  const endsAt = new Date(now.getTime() + lengthMinutes * 60_000).toISOString();
  const stamp = JSON.stringify({ startedAt, endsAt, lengthMinutes, startedBy: viewer });
  const claimed = await db.execute(sql`
    UPDATE service_bookings
    SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object('qaSession', ${stamp}::jsonb),
        updated_at = NOW()
    WHERE id = ${bookingId}
      AND status IN ('confirmed')
      AND stripe_payment_intent_id IS NOT NULL
      AND (booking_details->'qaSession') IS NULL
    RETURNING id
  `);
  const fresh = await loadRow(bookingId);
  if (!fresh) return { ok: false, status: 404, reason: "not_found" };
  if ((claimed.rows?.length ?? 0) === 0) {
    // Lost to a concurrent start (answer the session that exists), or never startable.
    if (fresh.stamp?.startedAt) return { ok: true, view: toView(fresh, viewer, now), started: false };
    return { ok: false, status: 409, reason: fresh.has_payment ? "not_startable" : "not_paid" };
  }

  // Tell the other person (ancillary — never fails the start, §15b).
  try {
    const otherId = viewer === "traveler" ? (fresh.provider_id ?? fresh.owner_id) : fresh.traveler_id;
    if (otherId) {
      const { displayNameOf, earnerConsolePath } = await import("./activity-email.service");
      const other = await storage.getUser(otherId);
      const who = (await displayNameOf(userId)) ?? (viewer === "traveler" ? "Your traveler" : "Your expert");
      await storage.createNotificationOnce({
        userId: otherId,
        type: "qa_session_started",
        title: "Q&A session started",
        message: `${who} started your ${lengthMinutes}-minute Q&A session.`,
        relatedId: bookingId,
        relatedType: "booking",
        data: {
          bookingId,
          workspacePath: viewer === "traveler" ? earnerConsolePath(other?.role, "bookings") : "/my-bookings",
        },
        dedupeKey: `qa-session-started:${bookingId}`,
      } as any);
    }
  } catch (err) {
    logger.warn({ err, bookingId }, "[qa-session] start notice failed (non-fatal)");
  }

  return { ok: true, view: toView(fresh, viewer, now), started: true };
}
