/**
 * AVAILABILITY MATERIALIZER — S7 (DECISIONS.md ledger row 102, Wave 3 schema ballot ratified as
 * recommended, decision-maker Aug 13, 2026; docs/briefs/WAVE3_SCHEMA_PROPOSALS.md).
 *
 * WHAT THIS IS
 * ────────────
 * `service_availability_patterns` (weekly repeat rules) and `service_availability_blackouts` are
 * AUTHORING data, not the §15 claim surface. This service expands a service's patterns minus its
 * blackouts into ordinary `vendor_availability_slots` rows — the SAME table `storage.bookSlot` /
 * `releaseSlot` / the checkout spine / the TTL sweep already read. Those are UNTOUCHED by this
 * file: it only ever INSERTs new slot rows; the claim machine's atomic conditionals, the sweep,
 * and every money path are unaware this service exists.
 *
 * ADD-ONLY, NEVER CLOBBER (the governing rule)
 * ──────────────────────────────────────────────
 * Every insert here is `ON CONFLICT (service_id, date, start_time) DO NOTHING` against the
 * migration-210 unique index. That means:
 *   - A manually-created slot at the same (service, date, start_time) is NEVER overwritten — its
 *     capacity, bookedCount, status, pricing, everything, survives untouched.
 *   - A slot that already has bookings (bookedCount > 0) is NEVER overwritten — re-materializing
 *     is a pure no-op for every date that already has a row.
 *   - Materializing NEVER DELETES or cancels a row. S7-Q3 (ratified): a blackout blocks FUTURE
 *     materialization/manual creation only — it never touches a slot that already exists,
 *     confirmed booking or not. Auto-cancelling a paid booking is a §15 violation waiting to
 *     happen, so this file does not do it, and never gains a delete path.
 *
 * WINDOW
 * ──────
 * S7-Q1 (no decision-maker recommendation; recorded integrator default, amendable): a rolling
 * 60-day window. Triggered on-demand at pattern-save and blackout-save time (server/routes.ts,
 * the availability-patterns/blackouts PUT handlers), and once daily by the horizon-extension
 * sweep below (registered in server/index.ts the same way stripeReconciliation is).
 *
 * FILED FOLLOW-UP (do not build here — needs its own ratification)
 * ──────────────────────────────────────────────────────────────
 * Stale un-booked slot cleanup on pattern change (e.g. a provider removes a Tuesday pattern —
 * previously-materialized future Tuesday slots stay forever, ADD-ONLY has no opposite) needs a
 * provenance column on `vendor_availability_slots` (e.g. `materializedFromPatternId`) to safely
 * distinguish a materializer-authored, never-booked slot from a manually-created or booked one
 * before anything could ever delete it. S11 (migration 213) built the GENERAL provenance column
 * (`materialized_from`, 'pattern' | 'date_range' | NULL) this note asked for — but only date-range
 * rows are stamped with it (see below); back-stamping pre-213 pattern-materialized rows, and the
 * cleanup pass itself, remain unbuilt and out of scope here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * S11 ADDITION (DECISIONS.md ledger row 107, docs/briefs/S11_STAY_BOOKING_PROPOSAL.md) — same
 * file, sibling function, same ADD-ONLY discipline: `materializeDateRangeAvailability` expands
 * `service_date_ranges` (S7, authoring-only until now) into the SAME `vendor_availability_slots`
 * table via the SAME `ON CONFLICT (service_id, date, start_time) DO NOTHING` upsert against the
 * SAME migration-210 index — see its own docblock below for the sentinel-start-time and
 * provenance-stamping detail the ballot required.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  providerServices,
  serviceAvailabilityPatterns,
  serviceAvailabilityBlackouts,
  serviceDateRanges,
  vendorAvailabilitySlots,
} from "@workspace/db";
import { logger } from "../infrastructure/logger";

/** S7-Q1 integrator default — amendable by the decision-maker. */
export const MATERIALIZATION_WINDOW_DAYS = 60;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 0=Sun..6=Sat, matching service_availability_patterns.dayOfWeek. Parsed as UTC midnight so the
 *  day-of-week never shifts with the server process's local timezone. */
function dayOfWeekOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function isBlackedOut(dateStr: string, blackouts: Array<{ startDate: string; endDate: string }>): boolean {
  return blackouts.some((b) => dateStr >= b.startDate && dateStr <= b.endDate);
}

export interface MaterializeResult {
  created: number;
  /** Pattern-occurrences that fell inside a blackout window and were deliberately not generated. */
  skippedBlackout: number;
}

/**
 * Expands ONE service's patterns minus its blackouts into vendor_availability_slots rows for a
 * rolling window starting today. Safe to call repeatedly (ADD-ONLY / ON CONFLICT DO NOTHING — see
 * header). A service with no patterns is a no-op (nothing to expand) — this is the honest state
 * for scheduled-method services that haven't authored a weekly rule yet, not an error.
 */
export async function materializeServiceAvailability(
  serviceId: string,
  windowDays: number = MATERIALIZATION_WINDOW_DAYS,
): Promise<MaterializeResult> {
  const [service] = await db
    .select({ id: providerServices.id, userId: providerServices.userId })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId));
  if (!service) return { created: 0, skippedBlackout: 0 };

  const patterns = await db.select().from(serviceAvailabilityPatterns)
    .where(eq(serviceAvailabilityPatterns.serviceId, serviceId));
  if (patterns.length === 0) return { created: 0, skippedBlackout: 0 };

  const blackouts = await db.select().from(serviceAvailabilityBlackouts)
    .where(eq(serviceAvailabilityBlackouts.serviceId, serviceId));

  const today = new Date();
  const todayUtcMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const rows: Array<{
    serviceId: string;
    providerId: string;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
  }> = [];
  let skippedBlackout = 0;

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(todayUtcMidnight);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = toDateStr(d);
    const dow = dayOfWeekOf(dateStr);
    const dayPatterns = patterns.filter((p) => p.dayOfWeek === dow);
    if (dayPatterns.length === 0) continue;
    if (isBlackedOut(dateStr, blackouts)) {
      skippedBlackout += dayPatterns.length;
      continue;
    }
    for (const p of dayPatterns) {
      rows.push({
        serviceId,
        providerId: service.userId,
        date: dateStr,
        startTime: p.startTime,
        endTime: p.endTime,
        capacity: p.capacity ?? 1,
      });
    }
  }

  if (rows.length === 0) return { created: 0, skippedBlackout };

  // ON CONFLICT DO NOTHING against the migration-210 unique index — the never-clobber guarantee.
  const inserted = await db.insert(vendorAvailabilitySlots)
    .values(rows)
    .onConflictDoNothing({
      target: [vendorAvailabilitySlots.serviceId, vendorAvailabilitySlots.date, vendorAvailabilitySlots.startTime],
    })
    .returning({ id: vendorAvailabilitySlots.id });

  return { created: inserted.length, skippedBlackout };
}

/**
 * Daily horizon-extension sweep: re-materializes every service that has at least one authoring
 * pattern, so the rolling 60-day window keeps advancing even for a provider who never revisits
 * their availability editor. ADD-ONLY per-service (see materializeServiceAvailability) — a
 * failure on one service is logged and does not abort the others (the stripeReconciliation
 * per-item-isolation posture, one bad row must not blind the sweep to every other service).
 */
export async function materializeAllServicesWithPatterns(): Promise<{
  servicesProcessed: number;
  slotsCreated: number;
  failures: number;
}> {
  const distinctServices = await db
    .selectDistinct({ serviceId: serviceAvailabilityPatterns.serviceId })
    .from(serviceAvailabilityPatterns);

  let slotsCreated = 0;
  let failures = 0;
  for (const { serviceId } of distinctServices) {
    try {
      const { created } = await materializeServiceAvailability(serviceId);
      slotsCreated += created;
    } catch (err) {
      failures++;
      logger.error({ err, serviceId }, "[availability-materializer] horizon extension failed for service");
    }
  }
  return { servicesProcessed: distinctServices.length, slotsCreated, failures };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S11 — date-range materializer (DECISIONS.md ledger row 107, S11_STAY_BOOKING_PROPOSAL.md)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Sentinel `start_time` for a date-range-materialized night — NEVER NULL (S11-Q2, ratified).
 * A property/room night is a DATE, not a time-of-day, but the migration-210 unique index
 * (service_id, date, start_time) is deliberately NOT partial (Drizzle's `onConflictDoNothing`
 * needs a non-partial arbiter), and Postgres never treats two NULLs as colliding under standard
 * SQL semantics — so a NULL start_time would make `ON CONFLICT DO NOTHING` silently insert a
 * duplicate row on every re-materialize, and two overlapping ranges would silently double
 * inventory. A fixed non-null sentinel closes that landmine directly: the existing index behaves
 * exactly as the ADD-ONLY contract requires once the value is non-null.
 */
export const DATE_RANGE_SENTINEL_START_TIME = "00:00";

/** S11-Q1 (ratified): a range is bounded by its own start_date/end_date — no rolling-window
 *  concept, unlike a weekly pattern. This cap exists only to bound a mistaken/malicious
 *  multi-decade range; the write rail (PUT /api/provider/services/:id/date-ranges) REJECTS an
 *  oversized range at save time (400) — it is never silently truncated here or there (§13). */
export const DATE_RANGE_MAX_NIGHTS = 730;

/** [startDate, endDate] inclusive of BOTH ends — the number of nights the range spans. Matches
 *  the inclusive semantics `isBlackedOut` above already uses for blackouts (a blackout covering
 *  `startDate..endDate` blocks both boundary dates), and is deliberately DIFFERENT from the
 *  CART's checkIn/checkOut, which is exclusive-checkout (nightDatesBetween in payments.routes.ts,
 *  hotel semantics: the checkout day itself is not a consumed night). A `service_date_ranges` row
 *  expresses "every night from start_date to end_date, inclusive, is available" — a provider
 *  authoring block, not a specific stay — so conflating the two carriers would be a bug. */
export function nightDatesInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let d = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return dates;
}

/**
 * Expands ONE service's `service_date_ranges` rows minus its blackouts into
 * `vendor_availability_slots` rows — one row per night, sentinel `start_time` (never NULL, see
 * above), `capacity` from the range, `pricing.nightlyRate` snapshotted from `nightly_price` when
 * the provider set one (S7-Q4: NULL means inherit `provider_services.price` — leave that fallback
 * to read time, in `resolveStayNightlyRates`, rather than baking a possibly-stale flat price into
 * the snapshot). Each inserted row is stamped `materialized_from = 'date_range'` (migration 213).
 *
 * Safe to call repeatedly — identical ADD-ONLY / `ON CONFLICT DO NOTHING` discipline to
 * `materializeServiceAvailability` above: a manually-created row, a pattern-materialized row, or
 * an already-booked row at the same (service, date, start_time) is NEVER overwritten. A service
 * with no date-ranges is a no-op (the honest state for a property that hasn't authored one yet).
 */
export async function materializeDateRangeAvailability(serviceId: string): Promise<MaterializeResult> {
  const [service] = await db
    .select({ id: providerServices.id, userId: providerServices.userId })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId));
  if (!service) return { created: 0, skippedBlackout: 0 };

  const ranges = await db.select().from(serviceDateRanges)
    .where(eq(serviceDateRanges.serviceId, serviceId));
  if (ranges.length === 0) return { created: 0, skippedBlackout: 0 };

  const blackouts = await db.select().from(serviceAvailabilityBlackouts)
    .where(eq(serviceAvailabilityBlackouts.serviceId, serviceId));

  const rows: Array<{
    serviceId: string;
    providerId: string;
    date: string;
    startTime: string;
    capacity: number;
    pricing: Record<string, unknown>;
    materializedFrom: string;
  }> = [];
  let skippedBlackout = 0;

  for (const range of ranges) {
    // Defensive only — the write rail already rejects an oversized range at save time (400, not
    // silent truncation). A range that somehow exceeds the cap (e.g. a pre-cap row) is capped
    // here rather than materializing an unbounded number of rows.
    const allDates = nightDatesInclusive(range.startDate, range.endDate);
    const dates = allDates.slice(0, DATE_RANGE_MAX_NIGHTS);
    const nightlyPrice = range.nightlyPrice != null ? parseFloat(range.nightlyPrice as unknown as string) : null;
    const pricing = nightlyPrice != null && Number.isFinite(nightlyPrice) ? { nightlyRate: nightlyPrice } : {};
    for (const dateStr of dates) {
      if (isBlackedOut(dateStr, blackouts)) {
        skippedBlackout++;
        continue;
      }
      rows.push({
        serviceId,
        providerId: service.userId,
        date: dateStr,
        startTime: DATE_RANGE_SENTINEL_START_TIME,
        capacity: range.capacity ?? 1,
        pricing,
        materializedFrom: "date_range",
      });
    }
  }

  if (rows.length === 0) return { created: 0, skippedBlackout };

  // ON CONFLICT DO NOTHING against the migration-210 unique index — the never-clobber guarantee.
  const inserted = await db.insert(vendorAvailabilitySlots)
    .values(rows)
    .onConflictDoNothing({
      target: [vendorAvailabilitySlots.serviceId, vendorAvailabilitySlots.date, vendorAvailabilitySlots.startTime],
    })
    .returning({ id: vendorAvailabilitySlots.id });

  return { created: inserted.length, skippedBlackout };
}

/**
 * S11-Q4 (ratified): a provider's price correction on `service_date_ranges` propagates to
 * already-materialized nights that are STILL UNBOOKED — `WHERE booked_count = 0 AND
 * materialized_from = 'date_range'` — and never touches a claimed/booked one (§18b posture:
 * booked inventory is never silently altered). Scoped per-range to `[startDate, endDate]`
 * inclusive, the same bound `materializeDateRangeAvailability` reads. Called on every
 * `date-ranges` save (replace-list — `service_date_ranges` rows are fully replaced, but the
 * already-materialized `vendor_availability_slots` rows are untouched by that replace, so without
 * this pass an edited price would silently keep quoting the OLD rate for a pre-existing range).
 * A range that was REMOVED from the new set is not visited here — its already-materialized,
 * unbooked nights simply keep their last-known price (ADD-ONLY: this pass never deletes or
 * orphan-handles a row; that is the filed stale-slot-cleanup follow-up, not built here).
 */
export async function repriceDateRangeAvailability(serviceId: string): Promise<{ repriced: number }> {
  const ranges = await db.select().from(serviceDateRanges)
    .where(eq(serviceDateRanges.serviceId, serviceId));
  if (ranges.length === 0) return { repriced: 0 };

  let repriced = 0;
  for (const range of ranges) {
    const nightlyPrice = range.nightlyPrice != null ? parseFloat(range.nightlyPrice as unknown as string) : null;
    const pricing = nightlyPrice != null && Number.isFinite(nightlyPrice) ? { nightlyRate: nightlyPrice } : {};
    const result = await db.update(vendorAvailabilitySlots)
      .set({ pricing, updatedAt: new Date() })
      .where(and(
        eq(vendorAvailabilitySlots.serviceId, serviceId),
        eq(vendorAvailabilitySlots.materializedFrom, "date_range"),
        eq(vendorAvailabilitySlots.bookedCount, 0),
        sql`${vendorAvailabilitySlots.date} BETWEEN ${range.startDate} AND ${range.endDate}`,
      ))
      .returning({ id: vendorAvailabilitySlots.id });
    repriced += result.length;
  }
  return { repriced };
}
