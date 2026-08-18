/**
 * R9 — the ONE shared test-account exclusion predicate for the Partner Demand rollup
 * (ledger 2026-08-17-partner-demand-phase0-rulings R9 + phase2 rulings).
 *
 * EVERY `partner_demand_rollup` read (2B) filters seeded test accounts through THIS module and no
 * other — single-implementation posture, the same as the suppression floors. Two rollup reads
 * excluding test accounts two different ways is exactly the derivation-drift class §18 rule 1
 * forbids: the moment they disagree, one figure counts a seeded trip the other drops.
 *
 * Q6d (R7 DB pass): 74/217 trips (34%) belong to `@traveloure.test` accounts, Kyoto-concentrated —
 * so this predicate is load-bearing, not cosmetic (whether even Kyoto clears the 10-floor with
 * REAL trips is unproven until it is applied; that is Q9). Q6d surfaced NO other seed pattern, so
 * the pattern list is exactly one entry today. If a future seed introduces another test-email
 * shape, add it HERE (the one place) and every rollup read inherits it automatically.
 *
 * §13: a NULL / absent email is treated as a REAL account — the absence of a test marker is not
 * evidence of a test account, so we never drop a row for missing data (that would understate real
 * demand, the opposite error but still a guess).
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";

/** SQL LIKE patterns identifying seeded test accounts. The sole entry Q6d proved necessary. */
export const TEST_ACCOUNT_EMAIL_PATTERNS = ["%@traveloure.test"] as const;

/** JS-side predicate (assertions, in-memory filtering). True ⇒ the email is a seeded test account. */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith("@traveloure.test");
}

/**
 * Drizzle SQL fragment: "<emailCol> is a REAL (non-test) account". Compose into a rollup read's
 * WHERE, e.g. `.where(and(<market filter>, isRealAccountSql(users.email)))`. A real account
 * matches NONE of the test patterns; a NULL email is real (§13). Case-insensitive (ILIKE).
 */
export function isRealAccountSql(emailCol: SQL | AnyColumn): SQL {
  const notLike = TEST_ACCOUNT_EMAIL_PATTERNS.map((p) => sql`${emailCol} NOT ILIKE ${p}`);
  return sql`(${emailCol} IS NULL OR (${sql.join(notLike, sql` AND `)}))`;
}
