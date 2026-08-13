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
 * before anything could ever delete it. That column does not exist yet and is out of S7's ratified
 * scope — this comment is the record, and the same note is filed in the lane report.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  providerServices,
  serviceAvailabilityPatterns,
  serviceAvailabilityBlackouts,
  vendorAvailabilitySlots,
} from "@shared/schema";
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
