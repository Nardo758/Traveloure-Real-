import crypto from "node:crypto";
import { db } from "../db";
import { funnelEvents } from "../../shared/schema";

/**
 * Funnel events store IDS and ENUMS only — never a token, a secret or free text (ledger
 * `2026-09-27-funnel-share-token-purged`). The T7 `viral_share` event used to write the plan's
 * share token into `properties.refToken`; that token is a LIVE 90-day read grant on the plan, so
 * anyone able to read `funnel_events` could open it. The share rail now records the non-secret
 * `shared_trips.id` (`sharedTripId`) instead, and the tracker enforces the rule for every caller:
 *
 *  - `refToken` is NEVER stored raw. When a caller supplies one (signup's `?ref=` attribution
 *    code is client free text), only its one-way SHA-256 hex is kept, as `refTokenSha256`.
 *  - any `eventData` key whose NAME says it carries a credential (token / secret / password /
 *    api key / credential) is dropped, so a future caller cannot reintroduce the leak through the
 *    free-form bag. `*Sha256` keys are digests, not credentials, and pass.
 */
const CREDENTIAL_KEY = /(token|secret|password|passwd|api[_-]?key|credential)/i;

export function isCredentialShapedKey(key: string): boolean {
  if (/Sha256$/.test(key)) return false;
  return CREDENTIAL_KEY.test(key);
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** Builds the `properties` bag exactly as it is stored. Pure; exported for tests. */
export function buildFunnelProperties(params: {
  expertRequestId?: number;
  bookingId?: string | number;
  source?: string;
  refToken?: string;
  eventData?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const { expertRequestId, bookingId, source, refToken, eventData } = params;
  const extra: Record<string, unknown> = {};
  if (expertRequestId !== undefined) extra.expertRequestId = expertRequestId;
  if (bookingId !== undefined) extra.bookingId = String(bookingId);
  if (source !== undefined) extra.source = source;
  if (eventData) {
    for (const [k, v] of Object.entries(eventData)) {
      if (isCredentialShapedKey(k)) continue;
      extra[k] = v;
    }
  }
  // Written AFTER eventData so a caller-supplied `refTokenSha256` can never stand in for it.
  if (typeof refToken === "string" && refToken.length > 0) {
    extra.refTokenSha256 = sha256Hex(refToken);
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

export async function trackFunnelEvent(params: {
  userId?: string | number;
  sessionId?: string;
  eventType: string;
  funnelStage: string; // "T0"–"T7" or "T1_ACCOUNT_CREATED" — normalized to "TX" prefix
  tripId?: string | number;
  expertRequestId?: number;
  bookingId?: string | number;
  source?: string;
  /** Hashed before storage — the raw value is never written (see header). */
  refToken?: string;
  eventData?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { userId, sessionId, eventType, funnelStage, tripId } = params;

    // Normalize to "TX" prefix — existing schema is stage varchar(4)
    const stage = funnelStage.split("_")[0].slice(0, 4);

    await db.insert(funnelEvents).values({
      userId: userId !== undefined ? String(userId) : undefined,
      sessionId,
      eventType,
      stage,
      tripId: tripId !== undefined ? String(tripId) : undefined,
      properties: buildFunnelProperties(params),
    });
  } catch (err) {
    // Never block the main flow for analytics
    console.error("[FUNNEL TRACK ERROR]", err);
  }
}
