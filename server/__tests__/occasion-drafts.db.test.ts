/**
 * occasion-drafts.db.test.ts — end-to-end proofs for the Plus occasion-drafts scheduler.
 *
 * Ledger 2026-08-27-plus-is-delivery. Proves the dispatch's required behaviours against a real DB:
 *   1. an active-Plus member with a home city and an occasion 14 days out gets EXACTLY ONE draft
 *      (one ledger row, one trip with origin:'ai' items, one reminder email);
 *   2. a second run generates nothing (idempotent);
 *   3. a non-Plus member gets nothing;
 *   4. a member with no home city is SKIPPED, not errored;
 *   5. the endpoint + in-process timer firing in one window (two concurrent runs) → exactly ONE
 *      draft (the §15 claim is the guard);
 *   6. a generated draft sends exactly one email; a re-run sends none.
 *
 * Run solo:
 *   E2E_AI_STUB=1 NODE_ENV=test JOURNEY_DB_WRITES_OK=1 DATABASE_URL=... \
 *     npx tsx --test server/__tests__/occasion-drafts.db.test.ts
 */
process.env.E2E_AI_STUB = "1";
if (process.env.NODE_ENV === "production") throw new Error("refusing to run against NODE_ENV=production");

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runOccasionDrafts } from "../services/occasion-drafts.service";

const RUN = crypto.randomUUID().slice(0, 8);
const TODAY = new Date("2026-09-01T12:00:00Z");
const DUE_DATE = "2026-09-15"; // 14 days out from TODAY

const userIds: string[] = [];

function uid(tag: string): string {
  const id = `occ-${RUN}-${tag}`;
  userIds.push(id);
  return id;
}

async function makeUser(tag: string, opts: { homeCity: string | null; plus: boolean }): Promise<string> {
  const id = uid(tag);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, home_city, is_deleted, is_suspended)
    VALUES (${id}, ${`${id}@t.test`}, 'Occ', ${tag}, ${opts.homeCity}, false, false)
  `);
  if (opts.plus) {
    await db.execute(sql`
      INSERT INTO plan_memberships (id, user_id, plan_key, status, current_period_end, source)
      VALUES (${`${id}-mem`}, ${id}, 'plus_annual', 'active', ${new Date("2027-09-01T00:00:00Z")}, 'manual')
    `);
  }
  return id;
}

async function addOccasion(userId: string, tag: string, opts?: { date?: string; recurrence?: string; label?: string }): Promise<string> {
  const id = `${userId}-occ-${tag}`;
  await db.execute(sql`
    INSERT INTO occasions (id, user_id, template_key, occasion_date, recurrence, label, active)
    VALUES (${id}, ${userId}, 'date_night', ${opts?.date ?? DUE_DATE}, ${opts?.recurrence ?? "none"}, ${opts?.label ?? "Our night"}, true)
  `);
  return id;
}

async function draftCountForUser(userId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM occasion_drafts d
    JOIN occasions o ON o.id = d.occasion_id
    WHERE o.user_id = ${userId} AND d.generated_at IS NOT NULL
  `);
  return (r.rows[0] as any).n as number;
}

async function tripCountForUser(userId: string): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM trips WHERE user_id = ${userId}`);
  return (r.rows[0] as any).n as number;
}

async function aiItemCountForUser(userId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM itinerary_items i
    JOIN trips t ON t.id = i.trip_id
    WHERE t.user_id = ${userId} AND i.origin = 'ai'
  `);
  return (r.rows[0] as any).n as number;
}

async function emailCountForUser(userId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM email_outbox
    WHERE to_email = ${`${userId}@t.test`} AND email_type = 'occasion_reminder'
  `);
  return (r.rows[0] as any).n as number;
}

before(async () => {
  // Sanity: the scheduler must see a clean disposable DB with only our fixtures.
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
  assert.ok(
    ["localhost", "127.0.0.1", "::1", ""].includes(host) || process.env.JOURNEY_DB_WRITES_OK === "1",
    `refusing to write fixtures to non-disposable DB host '${host}'`,
  );
});

after(async () => {
  for (const id of userIds) {
    await db.execute(sql`DELETE FROM email_outbox WHERE to_email = ${`${id}@t.test`}`).catch(() => {});
    // occasion_drafts, occasions, plan_memberships, trips, itinerary_items cascade from the user.
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
});

test("Plus member 14 days out gets exactly one draft, one trip with AI items, one email", async () => {
  const user = await makeUser("happy", { homeCity: "Kyoto", plus: true });
  await addOccasion(user, "a");

  const result = await runOccasionDrafts({ today: TODAY });
  assert.ok(result.created >= 1, "at least this member's draft was created");

  assert.equal(await draftCountForUser(user), 1, "exactly one generated ledger row");
  assert.equal(await tripCountForUser(user), 1, "exactly one trip minted");
  assert.ok((await aiItemCountForUser(user)) > 0, "trip carries origin:'ai' itinerary items");
  assert.equal(await emailCountForUser(user), 1, "exactly one reminder email enqueued");
});

test("a second run generates nothing new for the same member (idempotent)", async () => {
  const user = await makeUser("idem", { homeCity: "Kyoto", plus: true });
  await addOccasion(user, "a");

  await runOccasionDrafts({ today: TODAY });
  assert.equal(await draftCountForUser(user), 1);
  assert.equal(await emailCountForUser(user), 1);

  const second = await runOccasionDrafts({ today: TODAY });
  assert.equal(await draftCountForUser(user), 1, "still exactly one draft after a re-run");
  assert.equal(await tripCountForUser(user), 1, "no duplicate trip");
  assert.equal(await emailCountForUser(user), 1, "no second email");
  assert.equal(second.created, 0, "the re-run created nothing (all cycles already claimed)");
});

test("a non-Plus member gets nothing", async () => {
  const user = await makeUser("free", { homeCity: "Kyoto", plus: false });
  await addOccasion(user, "a");

  await runOccasionDrafts({ today: TODAY });
  assert.equal(await draftCountForUser(user), 0, "no draft for a non-Plus member");
  assert.equal(await tripCountForUser(user), 0);
  assert.equal(await emailCountForUser(user), 0);
});

test("a Plus member with no home city is skipped, not errored", async () => {
  const user = await makeUser("nocity", { homeCity: null, plus: true });
  await addOccasion(user, "a");

  const result = await runOccasionDrafts({ today: TODAY });
  // Skipped cleanly — no draft, and the pass recorded zero errors overall.
  assert.equal(await draftCountForUser(user), 0, "no draft without a home city");
  assert.equal(result.errors, 0, "a missing home city is a skip, never an error");
});

test("endpoint + timer in one window (two concurrent runs) → exactly one draft", async () => {
  const user = await makeUser("race", { homeCity: "Kyoto", plus: true });
  await addOccasion(user, "a");

  const [r1, r2] = await Promise.all([
    runOccasionDrafts({ today: TODAY }),
    runOccasionDrafts({ today: TODAY }),
  ]);

  assert.equal(await draftCountForUser(user), 1, "exactly one draft despite two concurrent runs");
  assert.equal(await tripCountForUser(user), 1, "exactly one trip");
  assert.equal(await emailCountForUser(user), 1, "exactly one email");
  assert.equal(r1.created + r2.created >= 1, true);
});
