/**
 * SH-1 item 12 (ledger `2026-10-19-sh1-test-flag`): WHICH ACCOUNTS ARE TEST ACCOUNTS, stated ONCE (§18 rule 1).
 *
 *   A test account is one whose `users.is_test` is TRUE, OR whose email is on the QA domain named by the
 *   `QA_ACCOUNT_EMAIL_DOMAIN` setting (`isQaDomainAccount`, exact match). There is NO second domain.
 *   `is_test` NULL reads as false (migration 397 adds the column nullable, no default).
 *
 * A test account's listings are left out of every PUBLIC reader (search, the destination page, Browse, the
 * provider directory), and the account is never routed, listed or shown as an expert. Owner and by-id reads
 * are deliberately NOT gated: the owner still sees their own listings. `SHOW_DEMO_EXPERTS` never relaxes this.
 *
 * Negative space: the demand rollups keep their own patterns in `demand-test-exclusion.ts`
 * (`%@traveloure.test`, and row 176 the QA domain `traveloure-qa.test`); moving them onto this
 * predicate is a logged follow-up, not part of this lane.
 */
import { sql, type SQL } from "drizzle-orm";
import { isQaDomainAccount } from "./qa-trip-pass.service";

/** The QA domain setting, normalised (lower case, no leading "@"); null when unset. */
export function qaAccountDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  const d = (env.QA_ACCOUNT_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

/** Pure. Is this a test account? */
export function isTestAccount(
  input: { isTest?: boolean | null; email?: string | null },
  qaDomain: string | null = qaAccountDomain(),
): boolean {
  return input.isTest === true || isQaDomainAccount(input.email ?? null, qaDomain);
}

/** SQL form of `isTestAccount` over a users `is_test` expression and a users-email expression. */
export function testAccountSql(isTestExpr: SQL, emailExpr: SQL, qaDomain: string | null = qaAccountDomain()): SQL {
  if (!qaDomain) return sql`(COALESCE(${isTestExpr}, FALSE))`;
  return sql`(COALESCE(${isTestExpr}, FALSE) OR lower(split_part(coalesce(${emailExpr}, ''), '@', 2)) = ${qaDomain})`;
}

/** A WHERE clause over a listing's owner column: TRUE unless the owner is a test account. */
export function notTestOwnerListingSql(ownerUserIdColumn: SQL | { getSQL(): SQL }): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM users tu WHERE tu.id = ${ownerUserIdColumn} AND ${testAccountSql(sql`tu.is_test`, sql`tu.email`)})`;
}

/** The test accounts among `userIds` (one query). */
export async function testAccountUserIds(userIds: readonly string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const { db } = await import("../db");
  const r = await db.execute(sql`
    SELECT u.id FROM users u
    WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) AND ${testAccountSql(sql`u.is_test`, sql`u.email`)}
  `);
  return new Set((r.rows ?? []).map((row: any) => String(row.id)));
}

/** The same exclusion over rows already read: drops every row a test account owns. */
export async function withoutTestOwnerListings<T>(rows: readonly T[], ownerOf: (row: T) => string | null | undefined): Promise<T[]> {
  const test = await testAccountUserIds(rows.map((r) => ownerOf(r) ?? "").filter(Boolean));
  return test.size === 0 ? [...rows] : rows.filter((r) => !test.has(ownerOf(r) ?? ""));
}

/** Is this ONE account a test account? Reads the row. */
export async function isTestAccountId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await testAccountUserIds([userId])).has(userId);
}
