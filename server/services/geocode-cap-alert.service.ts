/**
 * Daily geocode-cap alert (ledger 2026-10-25-custom-location-geocode).
 *
 * spend-guard.service.ts refuses a metered call with a typed error and does not write a usage
 * row. It has no warning fraction, so this alert fires only when the geocode daily cap is
 * reached — not at a guessed fraction of it.
 *
 * The admin digest already includes unread `admin_notifications` rows, and that digest is the
 * only mail path. This module writes that row (via raiseOpsAlert) and one staff `notifications`
 * row per admin. It does not send mail itself.
 *
 * NEVER THROWS. A missed alert must not change the cap refusal the caller is already returning.
 * Dedupe is a read-then-write of today's digest row, not a unique index: two concurrent refusals
 * can both insert. That is the same non-atomic posture as the spend breaker.
 */

export const GEOCODE_CAP_DIGEST_TYPE = "maps_geocode_daily_cap";
export const GEOCODE_CAP_STAFF_TYPE = "maps_geocode_cap";
export const GEOCODE_CAP_REASON = "cap_reached";
export const GEOCODE_CAP_ENV = "MAPS_GEOCODE_DAILY_CAP";

export interface GeocodeCapAlertInput {
  used: number | null;
  cap: number;
  now?: Date;
}

export interface GeocodeCapDigestRow {
  type: string;
  message: string;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface GeocodeCapStaffRow {
  userId: string;
  type: string;
  title: string;
  message: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}

export interface GeocodeCapAlertDeps {
  alreadyRecordedToday: (day: string, since: Date) => Promise<boolean>;
  writeDigest: (row: GeocodeCapDigestRow) => Promise<void>;
  adminUserIds: () => Promise<string[]>;
  writeStaff: (row: GeocodeCapStaffRow) => Promise<void>;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function geocodeCapAlertMessage(used: number | null, cap: number): string {
  const usedText = used === null ? "unreadable" : String(used);
  return (
    `Google geocode daily cap reached (${usedText} of ${cap} calls, ${GEOCODE_CAP_ENV}). ` +
    "Custom-location placement is refusing with cap_reached until the next UTC day."
  );
}

function defaultDeps(): GeocodeCapAlertDeps {
  return {
    async alreadyRecordedToday(_day, since) {
      const { db } = await import("../db");
      const { adminNotifications } = await import("@shared/schema");
      const { and, eq, gte } = await import("drizzle-orm");
      const rows = await db
        .select({ id: adminNotifications.id })
        .from(adminNotifications)
        .where(and(eq(adminNotifications.type, GEOCODE_CAP_DIGEST_TYPE), gte(adminNotifications.createdAt, since)))
        .limit(1);
      return rows.length > 0;
    },
    async writeDigest(row) {
      const { raiseOpsAlert } = await import("./ops-alert.service");
      await raiseOpsAlert({
        type: row.type,
        message: row.message,
        reason: row.reason,
        metadata: row.metadata,
      });
    },
    async adminUserIds() {
      const { getAdminUserIds } = await import("./content-query.service");
      return getAdminUserIds();
    },
    async writeStaff(row) {
      const { db } = await import("../db");
      const { notifications } = await import("@shared/schema");
      await db.insert(notifications).values({
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        dedupeKey: row.dedupeKey,
        data: row.data,
      });
    },
  };
}

export async function recordGeocodeCapAlert(
  input: GeocodeCapAlertInput,
  deps: GeocodeCapAlertDeps = defaultDeps(),
): Promise<void> {
  try {
    const now = input.now ?? new Date();
    const day = utcDay(now);
    if (await deps.alreadyRecordedToday(day, startOfUtcDay(now))) return;
    const message = geocodeCapAlertMessage(input.used, input.cap);
    const metadata = { used: input.used, cap: input.cap, capEnv: GEOCODE_CAP_ENV, day };
    await deps.writeDigest({
      type: GEOCODE_CAP_DIGEST_TYPE,
      message,
      reason: GEOCODE_CAP_REASON,
      metadata,
    });
    const adminIds = await deps.adminUserIds();
    for (const userId of adminIds) {
      await deps.writeStaff({
        userId,
        type: GEOCODE_CAP_STAFF_TYPE,
        title: "Geocode daily cap reached",
        message,
        dedupeKey: `maps-geocode-cap:${day}:${userId}`,
        data: { ...metadata, reason: GEOCODE_CAP_REASON },
      });
    }
  } catch {
    // never throws
  }
}
