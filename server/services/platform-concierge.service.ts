/**
 * THE PLATFORM'S OWN BOOKING CONCIERGE ACCOUNT — ONE helper, read everywhere.
 *
 * Locked Decision 51 (ledger `2026-09-18-platform-concierge-listing`, migration 313):
 * "the platform may itself offer Booking Concierge in every market" — ratified mechanism (1)
 * seed an approved `local_expert_forms` row for a reserved platform account naming all
 * operating markets, reusing the two live gates (`GET /api/experts`'s location filter,
 * `lead-routing.service.ts`'s scorer) with NO bypass predicate; (2) no split — the fee's expert
 * share is NOT minted when the listing owner is this account; (3) ranking — the platform's
 * listing carries no specialties/history and ranks last through the existing scorer's own floor.
 *
 * WHY A HELPER AND NOT A HARDCODED ID (§18 rule 1). The reserved account's id is a migration
 * constant, but "which user id is the platform account" is a FACT two unrelated call sites need
 * (the completion-mint skip in `storage.ts`, the hand-off pool branch in
 * `concierge-handoff.service.ts`) — a hardcoded id repeated at each site is the derivation-drift
 * class §18 rule 1 names, and the migration seed already has a home for exactly this fact:
 * `platform_settings` (key `platform_concierge_user_id`), the same key/value table
 * `platform-flags.ts` already reads for cached cross-cutting settings.
 *
 * §13 — NULL = NO PLATFORM LISTING SEEDED YET. Migration 313 has not necessarily run on every
 * environment that imports this module (a fresh dev DB before migrations, a test DB that seeds
 * its own fixtures). Every caller MUST treat `null` as "there is no platform-owned listing" —
 * never as an error, and never by falling back to a guessed id. Neither `mintCompletionEarnings-
 * ForBooking` nor `createHandoffRequestsForBooking` throws when this returns `null`; the ordinary
 * (non-platform) path just runs unchanged.
 *
 * Cached per process with a short TTL — the same shape `platform-flags.ts` uses — because this is
 * read on the two hottest money paths this ruling touches (every booking completion, every
 * concierge hand-off) and the value NEVER changes after migration 313 seeds it once.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const PLATFORM_CONCIERGE_USER_ID_SETTING_KEY = "platform_concierge_user_id";

const TTL_MS = 60_000;

let cachedId: string | null | undefined; // undefined = not yet read this TTL window
let cachedAt = 0;

/** Test/ops seam — never called in production request handling. */
export function invalidatePlatformConciergeCache(): void {
  cachedId = undefined;
  cachedAt = 0;
}

/**
 * Reads `platform_settings.platform_concierge_user_id`. Returns `null` when the row is absent
 * (migration 313 not yet applied, or a test DB with no seed) or on a read error — the fail-open
 * shape every other platform-settings reader in this codebase uses (`getSetting` in
 * `commission.ts`, `getPlatformFlag` in `platform-flags.ts`): a settings-table hiccup must not
 * turn every ordinary (non-platform) booking's mint/hand-off path into a 500.
 */
export async function getPlatformConciergeUserId(): Promise<string | null> {
  const now = Date.now();
  if (cachedId !== undefined && now - cachedAt < TTL_MS) return cachedId;
  try {
    const result = await db.execute(sql`
      SELECT setting_value FROM platform_settings
      WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}
      LIMIT 1
    `);
    const row = result.rows?.[0] as { setting_value: string | null } | undefined;
    const value = row?.setting_value ?? null;
    cachedId = value && value.trim().length > 0 ? value.trim() : null;
    cachedAt = now;
    return cachedId;
  } catch (err) {
    console.warn("[platform-concierge] Failed to load platform concierge user id — treating as unseeded:", err);
    cachedId = null;
    cachedAt = now;
    return null;
  }
}

/**
 * `userId` is a `provider_services.userId` / `service_bookings.providerId` value already in
 * hand — this never issues a second query beyond the (cached) settings read above.
 */
export async function isPlatformConciergeUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const platformId = await getPlatformConciergeUserId();
  return platformId !== null && platformId === userId;
}
