/**
 * One expert application per user, even when two submits race (board #1725).
 *
 * The routes refuse a second application after reading `getLocalExpertForm`, but two simultaneous
 * submits both read "none" and both inserted — `local_expert_forms` has no UNIQUE(user_id).
 * `storage.createLocalExpertForm` now takes a per-user transaction advisory lock and repeats the
 * existence check inside it.
 *
 *   R1  five concurrent creates for one user ⇒ exactly one row, four ExpertApplicationExistsError.
 *   R2  a sequential second create is refused the same way, naming the existing row.
 *   R3  different users do not block each other.
 *
 * Needs a disposable Postgres (DATABASE_URL) with migrations applied.
 * Run: npx tsx --test server/__tests__/expert-application-race.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage, ExpertApplicationExistsError } from "../storage";

const run = crypto.randomUUID().slice(0, 8);
const userA = `race-a-${run}`;
const userB = `race-b-${run}`;

before(async () => {
  for (const id of [userA, userB]) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@race.test`}, 'Race', 'Tester', 'user')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id IN (${userA}, ${userB})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${userA}, ${userB})`).catch(() => {});
});

const formFor = (userId: string) => ({ userId, city: "Kyoto", bio: "Born and raised." }) as any;

async function rowsFor(userId: string): Promise<number> {
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM local_expert_forms WHERE user_id = ${userId}`);
  return (r.rows ?? r)[0].n;
}

test("R1: concurrent creates for one user make exactly one row", async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => storage.createLocalExpertForm(formFor(userA))));
  const ok = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(refused.length, 4);
  for (const r of refused) assert.ok((r as PromiseRejectedResult).reason instanceof ExpertApplicationExistsError);
  assert.equal(await rowsFor(userA), 1);
});

test("R2: a sequential second create is refused and names the existing row", async () => {
  const [existing]: any = ((await db.execute(sql`SELECT id FROM local_expert_forms WHERE user_id = ${userA}`)) as any).rows;
  await assert.rejects(storage.createLocalExpertForm(formFor(userA)), (err: unknown) => {
    assert.ok(err instanceof ExpertApplicationExistsError);
    assert.equal(err.existingFormId, existing.id);
    return true;
  });
  assert.equal(await rowsFor(userA), 1);
});

test("R3: another user is not blocked", async () => {
  const form = await storage.createLocalExpertForm(formFor(userB));
  assert.equal(form.userId, userB);
  assert.equal(await rowsFor(userB), 1);
});
