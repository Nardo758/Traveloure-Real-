/**
 * Shape of the admin daily digest (ledger `2026-10-21-admin-qa-alerting`).
 *
 * Pure. The scheduler and `sendAdminDigestEmail` both call these so the subject
 * counts and the body cannot disagree. No second copy of the drift-alert
 * predicate or the payout exclusion.
 *
 * Payout exclusion is the existing test-account predicate (`is_test` or the QA
 * domain), the existing seed-email predicate, and the house domain
 * `@traveloure.internal` (concierge / transport / editorial). `SHOW_DEMO_EXPERTS`
 * relaxes seed exclusion on the public directory only — it is not read here.
 */
import { sql, type SQL } from "drizzle-orm";
import { isSeedExpertEmail, seedEmailSql } from "./expert-routability";
import { isTestAccount, testAccountSql } from "./test-account";
import { emailDomain } from "./qa-trip-pass.service";

/** House accounts. Not a seed domain and not the QA-domain setting. */
export const DIGEST_INTERNAL_EMAIL_DOMAIN = "traveloure.internal";

/** `platform_settings` key. The value is a UTC `YYYY-MM-DD`, or empty after a released claim. */
export const ADMIN_DIGEST_SENT_ON_KEY = "admin_daily_digest_sent_on";

/** UTC calendar date. The digest's "once a day" is this key, not a process clock. */
export function adminDigestDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * How many unread notifications to load before collapsing. The old `limit(20)`
 * let repeated drift rows crowd real leads out of the email.
 */
export const UNRESOLVED_ALERT_FETCH_CAP = 500;

/** Real (non-drift) unread alerts kept after the collapse. */
export const UNRESOLVED_LEAD_CAP = 20;

/**
 * The reconciliation job's digest line, written in `notifyDigest`
 * (`server/jobs/stripeReconciliation.ts`). One predicate, both readers.
 */
const SYSTEM_DRIFT_ALERT_RE = /payment\/booking drift exception\(s\) detected/i;

export function isSystemDriftAlertMessage(message: string | null | undefined): boolean {
  return SYSTEM_DRIFT_ALERT_RE.test(message ?? "");
}

export interface DigestLeadAlert {
  id: number;
  message: string;
  destination?: string | null;
  createdAt?: Date | string | null;
}

function alertTime(row: DigestLeadAlert): number {
  if (!row.createdAt) return 0;
  const t = new Date(row.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Newest system-drift alert only (its message already carries the latest count)
 * plus real leads, newest first, capped. Drift rows do not consume the lead cap.
 */
export function collapseUnresolvedLeadAlerts<T extends DigestLeadAlert>(
  rows: readonly T[],
  leadCap: number = UNRESOLVED_LEAD_CAP,
): T[] {
  const sorted = [...rows].sort((a, b) => {
    const byTime = alertTime(b) - alertTime(a);
    if (byTime !== 0) return byTime;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  const drift = sorted.find((row) => isSystemDriftAlertMessage(row.message));
  const leads = sorted.filter((row) => !isSystemDriftAlertMessage(row.message)).slice(0, leadCap);
  const kept = drift ? [...leads, drift] : leads;
  kept.sort((a, b) => {
    const byTime = alertTime(b) - alertTime(a);
    if (byTime !== 0) return byTime;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return kept;
}

export interface ReconciliationMismatchRow {
  type: string;
  rail?: string;
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
}

function presentId(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  return s.length > 0 ? s : null;
}

/** One row per type + booking, else type + charge, else type + PaymentIntent. */
export function reconciliationMismatchKey(row: ReconciliationMismatchRow): string {
  const type = row.type ?? "";
  const bookingId = presentId(row.bookingId);
  if (bookingId) return `${type}|booking|${bookingId}`;
  const chargeId = presentId(row.chargeId);
  if (chargeId) return `${type}|charge|${chargeId}`;
  const paymentIntentId = presentId(row.paymentIntentId);
  if (paymentIntentId) return `${type}|pi|${paymentIntentId}`;
  return `${type}|bare`;
}

/**
 * First occurrence wins. Callers pass newest-first so the kept row is the latest
 * copy of that booking and type.
 */
export function dedupeReconciliationMismatches<T extends ReconciliationMismatchRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = reconciliationMismatchKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function shapeAdminDigestLists<N extends DigestLeadAlert, M extends ReconciliationMismatchRow>(input: {
  unresolvedNotifications: readonly N[];
  reconciliationMismatches: readonly M[];
}): { unresolvedNotifications: N[]; reconciliationMismatches: M[] } {
  return {
    unresolvedNotifications: collapseUnresolvedLeadAlerts(input.unresolvedNotifications),
    reconciliationMismatches: dedupeReconciliationMismatches(input.reconciliationMismatches),
  };
}

/** Pure. True for a test account, a seed expert email, or a house `@traveloure.internal` account. */
export function isDigestPayoutExcluded(
  input: { isTest?: boolean | null; email?: string | null },
  qaDomain: string | null | undefined = undefined,
): boolean {
  if (isTestAccount({ isTest: input.isTest, email: input.email }, qaDomain)) return true;
  if (isSeedExpertEmail(input.email)) return true;
  return emailDomain(input.email) === DIGEST_INTERNAL_EMAIL_DOMAIN;
}

/** SQL form of `isDigestPayoutExcluded`. Does not read `SHOW_DEMO_EXPERTS`. */
export function digestPayoutExcludedSql(isTestExpr: SQL, emailExpr: SQL): SQL {
  return sql`(
    ${testAccountSql(isTestExpr, emailExpr)}
    OR ${seedEmailSql(emailExpr)}
    OR lower(split_part(coalesce(${emailExpr}, ''), '@', 2)) = ${DIGEST_INTERNAL_EMAIL_DOMAIN}
  )`;
}
