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

/**
 * R16 (ledger 2026-08-18-partner-demand-2b) — SYNTHETIC-TRIP exclusion generalizes R9. Q9 surfaced
 * a SECOND synthetic class beside test accounts: AUTHORING trips — expert-authored ready-made
 * scaffolding (`trips.author_id` set; `userId` NULL). They are inventory an expert drafts, NOT
 * traveler demand, so counting them would overstate demand exactly as test accounts do (in Kyoto:
 * 24 of 72). This is the ONE synthetic predicate every rollup COMPUTATION and READ inherits — both
 * classes in one place so the two can never be excluded two different ways (§18 rule 1 / L6).
 *
 * The Q9 STRICT count (real account AND not authoring, n=29 for Kyoto) is canonical everywhere; the
 * loose framing (real account only, n=53) must never appear in a partner-facing or recruitment
 * figure (R16).
 */

/** JS-side: true ⇒ the trip is SYNTHETIC (a seeded test account OR an expert authoring listing). */
export function isSyntheticTrip(trip: {
  email?: string | null;
  authorId?: string | null;
}): boolean {
  return isTestAccountEmail(trip.email) || trip.authorId != null;
}

/**
 * Drizzle SQL fragment: "<emailCol>,<authorIdCol> is a REAL traveler trip" — a real account AND not
 * an authoring listing. The canonical R16 filter for every demand-rollup computation/read; compose
 * into a WHERE, e.g. `.where(and(<market filter>, isRealTripSql(users.email, trips.authorId)))`.
 * A NULL email is real (§13); a non-NULL author_id is synthetic (authoring inventory).
 */
export function isRealTripSql(emailCol: SQL | AnyColumn, authorIdCol: SQL | AnyColumn): SQL {
  return sql`(${isRealAccountSql(emailCol)} AND ${authorIdCol} IS NULL)`;
}
