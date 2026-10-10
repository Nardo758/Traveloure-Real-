/**
 * FD-1 — THE FREE-DRAFT CAP on a real database (decision-maker rulings, Oct 9, 2026; ledger
 * `2026-10-09-fd1-free-draft-cap`; migration 363).
 *
 *   F1  3 free drafts per window per plan owner; the 4th is refused with the numbers
 *   F2  one per plan: a second claim on the same plan is refused; a RELEASED run frees the plan
 *   F3  ruling 3: a released run (our failure) never counts
 *   F4  ruling 5: a paid-tier plan (`planGetsRoutedLegs` — a finished Optimize run) is not a free draft
 *   F5  QA accounts (`QA_ACCOUNT_EMAIL_DOMAIN`) are exempt and make no row
 *   F6  the claim is the concurrency guard: 6 parallel claims for one owner ⇒ exactly 3 claimed
 *   F7  promote records the plan a minted draft was written into; the status read matches the claim's count
 *   F8  the count-only teaser on a FREE plan: local picks and notes around a day's stops — counts, no ids;
 *       an untagged gem and a gem already on the plan are not counted; a day with no located stop has no key
 *   F9  a PAID plan gets no teaser at all
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { freeDraftRuns } from "@shared/schema";
import { claimFreeDraft, freeDraftStatus, promoteFreeDraft, releaseFreeDraft } from "../services/free-draft-cap.service";
import { localTeasersForTrip } from "../services/local-teaser.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fdc-${RUN}-${s}`;
const QA_DOMAIN = `qa-${RUN}.test`;
const users = {
  a: id("a"), b: id("b"), c: id("c"), paid: id("paid"), qa: id("qa"), race: id("race"),
};

async function trip(owner: string, k: string) {
  const tid = id(`trip-${k}`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${tid}, ${owner}, ${`FDC ${k}`}, 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft')`);
  return tid;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  process.env.QA_ACCOUNT_EMAIL_DOMAIN = QA_DOMAIN;
  for (const [k, uid] of Object.entries(users)) {
    const email = k === "qa" ? `${uid}@${QA_DOMAIN}` : `${uid}@t.test`;
    await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${uid}, ${email}, 'traveler')`);
  }
});

const CITY = `FdcCity${RUN}`;

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${`fdc-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE city = ${CITY}`);
  await db.execute(sql`DELETE FROM local_knowledge_nuggets WHERE city = ${CITY}`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE city = ${CITY}`);
  await db.delete(freeDraftRuns).where(inArray(freeDraftRuns.userId, Object.values(users)));
  await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${id("cmp")}`);
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${id("cmp")}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`fdc-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`fdc-${RUN}-%`}`);
  await pool.end();
});

test("F1 — three per window; the fourth is refused with the numbers", async () => {
  for (let i = 0; i < 3; i++) {
    const c = await claimFreeDraft({ rail: "trip", tripId: await trip(users.a, `a${i}`), countedUserId: users.a });
    assert.equal(c.kind, "claimed");
    assert.equal((c as any).used, i + 1);
  }
  const fourth = await claimFreeDraft({ rail: "trip", tripId: await trip(users.a, "a3"), countedUserId: users.a });
  assert.deepEqual(fourth, { kind: "refused", reason: "cap_reached", used: 3, limit: 3, windowDays: 30 });
});

test("F2 — one per plan; a released run frees the plan", async () => {
  const t = await trip(users.b, "b0");
  const first = await claimFreeDraft({ rail: "slip", tripId: t, countedUserId: users.b });
  assert.equal(first.kind, "claimed");
  const second = await claimFreeDraft({ rail: "slip", tripId: t, countedUserId: users.b });
  assert.deepEqual(second, { kind: "refused", reason: "plan_already_drafted" });
  await releaseFreeDraft((first as any).runId);
  const third = await claimFreeDraft({ rail: "slip", tripId: t, countedUserId: users.b });
  assert.equal(third.kind, "claimed");
});

test("F3 — ruling 3: a released run never counts", async () => {
  for (let i = 0; i < 3; i++) {
    const c = await claimFreeDraft({ rail: "quick_start", tripId: null, countedUserId: users.c });
    assert.equal(c.kind, "claimed");
    await releaseFreeDraft((c as any).runId);
  }
  assert.equal((await freeDraftStatus(users.c)).used, 0);
  assert.equal((await claimFreeDraft({ rail: "quick_start", tripId: null, countedUserId: users.c })).kind, "claimed");
});

test("F4 — ruling 5: a paid-tier plan is not a free draft", async () => {
  const t = await trip(users.paid, "p0");
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, start_date, end_date, status)
    VALUES (${id("cmp")}, ${users.paid}, ${t}, 'paid', 'Kyoto', '2027-11-11', '2027-11-13', 'completed')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source) VALUES (${id("var")}, ${id("cmp")}, 'Optimized', 'ai_optimized')`);
  assert.deepEqual(await claimFreeDraft({ rail: "trip", tripId: t, countedUserId: users.paid }), { kind: "not_free" });
  const rows = await db.select().from(freeDraftRuns).where(eq(freeDraftRuns.tripId, t));
  assert.equal(rows.length, 0);
});

test("F5 — QA accounts are exempt and make no row", async () => {
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await claimFreeDraft({ rail: "quick_start", tripId: null, countedUserId: users.qa }), { kind: "exempt" });
  }
  const rows = await db.select().from(freeDraftRuns).where(eq(freeDraftRuns.userId, users.qa));
  assert.equal(rows.length, 0);
  assert.equal((await freeDraftStatus(users.qa)).exempt, true);
});

test("F6 — the claim is the concurrency guard: 6 parallel claims ⇒ exactly 3", async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => claimFreeDraft({ rail: "quick_start", tripId: null, countedUserId: users.race })));
  assert.equal(results.filter((r) => r.kind === "claimed").length, 3);
  assert.equal(results.filter((r) => r.kind === "refused").length, 3);
});

test("F7 — promote records a minted plan, and the status read matches the claim's count", async () => {
  const t = await trip(users.c, "c-mint");
  const c = await claimFreeDraft({ rail: "quick_start", tripId: null, countedUserId: users.c });
  await promoteFreeDraft((c as any).runId, t);
  const [row] = await db.select().from(freeDraftRuns).where(eq(freeDraftRuns.id, (c as any).runId));
  assert.equal(row.status, "drafted");
  assert.equal(row.tripId, t);
  const status = await freeDraftStatus(users.c);
  assert.deepEqual({ used: status.used, limit: status.limit, windowDays: status.windowDays }, { used: 2, limit: 3, windowDays: 30 });
  await releaseFreeDraft((c as any).runId); // a promoted run is never released
  const [after] = await db.select().from(freeDraftRuns).where(eq(freeDraftRuns.id, (c as any).runId));
  assert.equal(after.status, "drafted");
});

test("F8 — the count-only teaser on a free plan", async () => {
  const t = id("trip-teaser");
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${t}, ${users.b}, 'teaser', ${`${CITY}, Japan`}, '2027-11-11', '2027-11-13', 'draft')`);
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("n-gion")}, ${CITY}, 'Japan', 'Gion', 'gion', 35.0037, 135.7788),
           (${id("n-arashi")}, ${CITY}, 'Japan', 'Arashiyama', 'arashiyama', 35.0094, 135.6668)`);
  await db.execute(sql`INSERT INTO travel_pulse_hidden_gems (id, city, place_name, neighborhood, source_class, reuse_class)
    VALUES (${id("g-on")}, ${CITY}, 'On plan', 'gion', 'local', 'reusable'),
           (${id("g-off")}, ${CITY}, 'Off plan', 'gion', 'local', 'reusable'),
           (${id("g-untagged")}, ${CITY}, 'AI', 'gion', NULL, NULL)`);
  await db.execute(sql`INSERT INTO local_knowledge_nuggets (id, expert_user_id, nugget_type, city, linked_neighbourhood, insight, source_class, reuse_class)
    VALUES (${id("nug")}, ${users.b}, 'tip', ${CITY}, 'Gion', 'Go early', 'local', 'reusable')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, latitude, longitude, gem_id)
    VALUES (${id("i1")}, ${t}, 1, 'Stop', '35.004', '135.778', ${id("g-on")}),
           (${id("i2")}, ${t}, 2, 'Unlocated', NULL, NULL, NULL)`);
  const teasers = await localTeasersForTrip(t);
  assert.deepEqual(teasers.get(1), { localPicks: 1, localNotes: 1 });
  assert.equal(teasers.has(2), false);
  assert.deepEqual(Object.keys(teasers.get(1)!).sort(), ["localNotes", "localPicks"], "counts only");
});

test("F9 — a paid plan gets no teaser", async () => {
  const [{ trip_id }] = (await db.execute(sql`SELECT trip_id FROM itinerary_comparisons WHERE id = ${id("cmp")}`)).rows as any[];
  assert.equal((await localTeasersForTrip(trip_id)).size, 0);
});
