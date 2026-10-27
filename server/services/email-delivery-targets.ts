/**
 * Delivery target for must-have and security outbox rows (row 170, Z-10).
 * Read only. Never writes a row. The digest counts the result. A miss does
 * not send an alert.
 *
 * The clock starts at metadata.readdressedAt when that stamp is a real UTC
 * instant, otherwise created_at. A malformed stamp falls back to created_at
 * and does not throw. Rows from before the firstAttemptAt stamp have no
 * first attempt to measure.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { outboxDeliveryPrioritySql } from "./email-outbox-classes";
import { emailSendsEnabled, emailTemplateAllowlist } from "./email.service";

/** The only place the 15-minute number lives. The SQL is built from it. */
export const EMAIL_DELIVERY_TARGETS = {
  mustHaveAndSecurityMs: 15 * 60 * 1000,
} as const;

export interface DeliveryTargetMisses {
  windowHours: 24;
  lateFirstAttempts: number;
  notYetAttempted: number;
  misses: number;
}

const ISO_UTC_RE = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$";

/**
 * timestamptz of an ISO UTC string, or NULL. An impossible calendar day
 * (for example February 31) is NULL. A cast of a value that fails the
 * guard is not evaluated, so a bad stamp cannot throw.
 */
function safeIsoTimestamptz(raw: SQL): SQL {
  const year = sql`substring(${raw} from 1 for 4)::int`;
  const month = sql`substring(${raw} from 6 for 2)::int`;
  const day = sql`substring(${raw} from 9 for 2)::int`;
  const hour = sql`substring(${raw} from 12 for 2)::int`;
  const minute = sql`substring(${raw} from 15 for 2)::int`;
  const second = sql`substring(${raw} from 18 for 2)::int`;
  const leap = sql`((${year} % 4 = 0 AND ${year} % 100 <> 0) OR ${year} % 400 = 0)`;
  const maxDay = sql`(CASE ${month}
    WHEN 2 THEN CASE WHEN ${leap} THEN 29 ELSE 28 END
    WHEN 4 THEN 30
    WHEN 6 THEN 30
    WHEN 9 THEN 30
    WHEN 11 THEN 30
    ELSE 31
  END)`;
  return sql`(CASE
    WHEN ${raw} ~ ${ISO_UTC_RE}
     AND ${month} BETWEEN 1 AND 12
     AND ${hour} BETWEEN 0 AND 23
     AND ${minute} BETWEEN 0 AND 59
     AND ${second} BETWEEN 0 AND 59
     AND ${day} BETWEEN 1 AND ${maxDay}
    THEN (${raw})::timestamptz
    ELSE NULL
  END)`;
}

function clockStartSql(): SQL {
  return sql`COALESCE(${safeIsoTimestamptz(sql`metadata->>'readdressedAt'`)}, created_at)`;
}

function targetInterval(): SQL {
  return sql`(${EMAIL_DELIVERY_TARGETS.mustHaveAndSecurityMs} * INTERVAL '1 millisecond')`;
}

function countOf(result: { rows?: unknown[] }): number {
  const row = result.rows?.[0] as { n?: unknown } | undefined;
  const n = Number(row?.n ?? NaN);
  if (!Number.isFinite(n)) throw new Error("delivery target count was not a number");
  return n;
}

/**
 * Throws on a database error. The scheduler catches that. Counts only:
 * no address, no subject, no id.
 *
 * lateFirstAttempts: priority rows with a parsed firstAttemptAt, no
 * gateHeldAt, firstAttemptAt more than 15 minutes after the clock, and
 * created_at or firstAttemptAt inside the last 24 hours (the window is
 * NOW() minus 24 hours, in SQL).
 *
 * notYetAttempted: priority rows with neither stamp, status pending or
 * processing, attempt_count 0, clock more than 15 minutes ago, and only
 * while sends are on and the type is on the template allowlist. No time
 * window. Sends off, or an empty allowlist, counts 0.
 */
export async function loadDeliveryTargetMisses(): Promise<DeliveryTargetMisses> {
  const clock = clockStartSql();
  const firstAt = safeIsoTimestamptz(sql`metadata->>'firstAttemptAt'`);
  const lateResult = await db.execute(sql`
    SELECT count(*)::int AS n
      FROM email_outbox
     WHERE ${outboxDeliveryPrioritySql()}
       AND metadata->>'firstAttemptAt' IS NOT NULL
       AND metadata->>'gateHeldAt' IS NULL
       AND ${firstAt} IS NOT NULL
       AND (${firstAt} - ${clock}) > ${targetInterval()}
       AND (
         created_at >= NOW() - INTERVAL '24 hours'
         OR ${firstAt} >= NOW() - INTERVAL '24 hours'
       )
  `);
  const lateFirstAttempts = countOf(lateResult);

  let notYetAttempted = 0;
  const allowlist = emailTemplateAllowlist();
  if (emailSendsEnabled() && allowlist.length > 0) {
    const list = sql.join(allowlist.map((name) => sql`${name}`), sql`, `);
    const waiting = await db.execute(sql`
      SELECT count(*)::int AS n
        FROM email_outbox
       WHERE ${outboxDeliveryPrioritySql()}
         AND metadata->>'firstAttemptAt' IS NULL
         AND metadata->>'gateHeldAt' IS NULL
         AND status IN ('pending', 'processing')
         AND attempt_count = 0
         AND ${clockStartSql()} < NOW() - ${targetInterval()}
         AND email_type = ANY(ARRAY[${list}]::text[])
    `);
    notYetAttempted = countOf(waiting);
  }

  return {
    windowHours: 24,
    lateFirstAttempts,
    notYetAttempted,
    misses: lateFirstAttempts + notYetAttempted,
  };
}
