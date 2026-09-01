/**
 * E2E-ACCOUNT PURGE — FK-blocked accounts are NAMED, not silently swallowed (Lane 4, small-filed).
 *
 * The prod-boot purge (purgeE2EAccountsFromProd) neutralizes every @traveloure.test account (demote
 * + scramble password) then best-effort per-row deletes them. A row referenced by a NO-ACTION
 * foreign key cannot be deleted; before this fix the catch was empty, so the log said "FK-blocked"
 * without naming WHICH constraint. This proves the fix: the blocked account is reported WITH the
 * constraint that blocked it and the child table, so a later decision about clearing the child rows
 * can be made with the FK in hand — and the account stays NEUTRALIZED (never left as a live admin).
 *
 * Fixture reproduces a real block: affiliate_booking_requests.user_id → users.id is a NO-ACTION FK
 * (no onDelete), so a request row pins its user against deletion. (trips.user_id is ON DELETE SET
 * NULL and would NOT block — the honest blocker is a NO-ACTION child.)
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created and deleted by this file.
 * Run solo: npx tsx --test server/__tests__/e2e-purge-fk-naming.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { purgeE2EAccountsFromProd } from "../seeds/e2e-test-accounts.seed";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = `purgefk-${RUN}-user`;
const email = `purgefk-${RUN}@traveloure.test`;
const abrId = `purgefk-${RUN}-abr`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[purge-fk] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a recognized ` +
        `disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${userId}, ${email}, 'Purge', 'Fixture', 'admin')
  `);
  // A NO-ACTION child row that pins the user against deletion.
  await db.execute(sql`
    INSERT INTO affiliate_booking_requests (id, user_id, item_name, partner_name, affiliate_url)
    VALUES (${abrId}, ${userId}, 'Fixture item', 'Fixture partner', 'https://example.test/aff')
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE id = ${abrId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

test("an FK-blocked @traveloure.test account is reported WITH the blocking constraint, and stays neutralized", async () => {
  const result = await purgeE2EAccountsFromProd();

  const mine = result.blocked.find((b) => b.account === email);
  assert.ok(mine, `the FK-blocked fixture account must appear in the blocked list; got ${JSON.stringify(result.blocked)}`);
  // The constraint is NAMED (a real FK name), not the old silent-swallow placeholder.
  assert.notEqual(mine!.constraint, "", "constraint must be captured");
  assert.ok(
    !mine!.constraint.startsWith("<"),
    `constraint must be a real FK name, not a placeholder — got '${mine!.constraint}'`,
  );
  // The detail names the child table that pinned the row.
  assert.ok(
    /affiliate_booking_requests/.test(`${mine!.constraint} ${mine!.detail}`),
    `the block must point at affiliate_booking_requests; got constraint='${mine!.constraint}' detail='${mine!.detail}'`,
  );

  // Neutralized, not deleted: the row still exists and is demoted to a harmless 'user'.
  const rows = await db.execute(sql`SELECT role FROM users WHERE id = ${userId}`);
  assert.equal(rows.rows.length, 1, "FK-blocked account must NOT be deleted — it stays neutralized");
  assert.equal((rows.rows[0] as any).role, "user", "blocked account must be demoted to 'user' (neutralized)");
});
