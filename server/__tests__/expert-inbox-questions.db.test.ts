/**
 * L1-13 — the expert inbox's Ask-a-local questions (work plan
 * docs/planning/expert-console-ready-made-work-plan.md; ruling R-bj; migration 349).
 *
 *   Q1  on a buyer's ready-made copy the question reaches the listing's AUTHOR (real routes, real gate)
 *       with `fromYourReadyMadeTrip`, no asker identity and no id but the question's
 *   Q2  another expert outside the market sees nothing
 *   Q3  a market expert (gate injected) sees the LATEST question per item, not a superseded one, not a
 *       copy's question, not a plan with no market, and not a door-level interest row with no item
 *   A1  the author answers: 201, one answer row, a comment on the traveler's item thread by the author,
 *       a notification to the asker, and the question leaves the feed; a second answer is 409
 *   A2  an expert who may not see the question gets ONE 404 and nothing is written
 *   A3  the body is `.strict()` `{ answer }`, 1–2000 characters
 *   A4  two concurrent answers write ONE answer row (advisory-locked check-and-insert)
 *   P1  `expertMaySeeQuestion` pure cases, the asker's own question included
 *   S1  `/api/expert/inbox` is under the expert role backstop in `server/routes.ts`
 *
 * NEGATIVE SPACE (§18d): no fixture builds a byline-eligible expert (approved application, handle,
 * live storefront, verified neighbourhood); the market path injects the gate's answer (Q3, A4) and
 * the real gate is exercised only in its refusing direction (Q1, Q2). The role backstop is pinned by
 * source (S1), not by a live request through the full app. No money moves on either rail.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/expert-inbox-questions.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import inboxRoutes from "../routes/expert-inbox-questions.routes";
import {
  answerInboxQuestion,
  expertMaySeeQuestion,
  listInboxQuestions,
} from "../services/expert-inbox-questions.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  traveler: `l113-${RUN}-traveler`,
  author: `l113-${RUN}-author`,
  kyoto: `l113-${RUN}-kyoto`,
  other: `l113-${RUN}-other`,
  plain: `l113-${RUN}-plain`,
  copy: `l113-${RUN}-copy`,
  nomarket: `l113-${RUN}-nomarket`,
  build: `l113-${RUN}-build`,
  i1: `l113-${RUN}-i1`,
  i2: `l113-${RUN}-i2`,
  i3: `l113-${RUN}-i3`,
  listing: `l113-${RUN}-listing`,
  purchase: `l113-${RUN}-purchase`,
};
const q = {
  old: crypto.randomUUID(),
  plain: crypto.randomUUID(),
  copy: crypto.randomUUID(),
  door: crypto.randomUUID(),
  nomarket: crypto.randomUUID(),
};
const kyotoGate = async (expertId: string, market: string) => expertId === ids.kyoto && market === "kyoto";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[expert-inbox-questions] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function call(userId: string, method: "GET" | "POST", url: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(inboxRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function answersFor(questionId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM expert_question_answers WHERE question_event_id = ${questionId}`)).rows as any[];
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [
    [ids.traveler, "traveler"],
    [ids.author, "local_expert"],
    [ids.kyoto, "local_expert"],
    [ids.other, "local_expert"],
  ] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'L113', ${role}, ${role})`);
  }
  for (const [id, owner, author, dest] of [
    [ids.plain, ids.traveler, null, "Kyoto, Japan"],
    [ids.copy, ids.traveler, null, "Kyoto, Japan"],
    [ids.nomarket, ids.traveler, null, "Nowhereville"],
    [ids.build, null, ids.author, "Kyoto, Japan"],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
      VALUES (${id}, ${owner}, ${author}, 'L1-13', ${dest}, '2027-05-01', '2027-05-02', 'draft')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order) VALUES
    (${ids.i1}, ${ids.plain}, 'Nishiki Market', 1, 0),
    (${ids.i2}, ${ids.copy}, 'Philosopher''s Path', 2, 0),
    (${ids.i3}, ${ids.nomarket}, 'Somewhere', 1, 0)`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
    VALUES (${ids.listing}, ${ids.author}, ${ids.build}, 'Kyoto', 'L1-13 listing', 2, 'approved', true)`);
  await db.execute(sql`INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, clone_trip_id, status)
    VALUES (${ids.purchase}, ${ids.traveler}, ${ids.listing}, 3900, ${`pi_l113_${RUN}`}, ${ids.copy}, 'cloned')`);
  const ev = (id: string, trip: string, props: Record<string, unknown>, at: string) =>
    db.execute(sql`INSERT INTO funnel_events (id, user_id, trip_id, event_type, stage, properties, created_at)
      VALUES (${id}, ${ids.traveler}, ${trip}, 'expert_interest', 'SLIP', ${JSON.stringify(props)}::jsonb, ${at})`);
  await ev(q.old, ids.plain, { level: "ask", market: "kyoto", itemId: ids.i1, question: "Is it busy at 9?" }, "2026-10-01T09:00:00Z");
  await ev(q.plain, ids.plain, { level: "ask", market: "kyoto", itemId: ids.i1, question: "Best stall for tamagoyaki?" }, "2026-10-02T09:00:00Z");
  await ev(q.copy, ids.copy, { level: "ask", market: "kyoto", itemId: ids.i2, question: "Cherry blossoms in early April?" }, "2026-10-02T10:00:00Z");
  await ev(q.door, ids.plain, { level: "ask", market: "kyoto" }, "2026-10-02T11:00:00Z");
  await ev(q.nomarket, ids.nomarket, { level: "ask", itemId: ids.i3 }, "2026-10-02T12:00:00Z");
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_question_answers WHERE question_event_id IN (${q.old}, ${q.plain}, ${q.copy}, ${q.door}, ${q.nomarket})`);
  await db.execute(sql`DELETE FROM funnel_events WHERE id IN (${q.old}, ${q.plain}, ${q.copy}, ${q.door}, ${q.nomarket})`);
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.traveler}`);
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.plain}, ${ids.copy}, ${ids.nomarket}, ${ids.build})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.traveler}, ${ids.author}, ${ids.kyoto}, ${ids.other})`);
});

test("Q1: a copy's question reaches its author, with no asker identity", async () => {
  const r = await call(ids.author, "GET", "/api/expert/inbox/questions");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.questions, [
    {
      id: q.copy,
      question: "Cherry blossoms in early April?",
      itemTitle: "Philosopher's Path",
      dayNumber: 2,
      city: "Kyoto",
      askedAt: "2026-10-02T10:00:00.000Z",
      fromYourReadyMadeTrip: true,
    },
  ]);
  const text = JSON.stringify(r.body);
  for (const leak of [ids.traveler, ids.copy, ids.i2]) assert.equal(text.includes(leak), false, leak);
});

test("Q2: an expert outside the market sees nothing", async () => {
  const r = await call(ids.other, "GET", "/api/expert/inbox/questions");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.questions, []);
});

test("Q3: a market expert sees the latest question per item only", async () => {
  const list = await listInboxQuestions(ids.kyoto, { bylineEligible: kyotoGate });
  assert.deepEqual(list.map((x) => [x.id, x.question, x.fromYourReadyMadeTrip]), [[q.plain, "Best stall for tamagoyaki?", false]]);
});

test("A1: the author answers once; the traveler's item thread carries it", async () => {
  const r = await call(ids.author, "POST", `/api/expert/inbox/questions/${q.copy}/answer`, { answer: "  Usually the first week — go at dawn.  " });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const rows = await answersFor(q.copy);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].trip_id, rows[0].item_id, rows[0].expert_id, rows[0].answer, rows[0].status],
    [ids.copy, ids.i2, ids.author, "Usually the first week — go at dawn.", "answered"]);
  const c = await db.execute(sql`SELECT author_id, body FROM trip_item_comments WHERE id = ${r.body.commentId}`);
  assert.deepEqual([(c.rows[0] as any).author_id, (c.rows[0] as any).body], [ids.author, "Usually the first week — go at dawn."]);
  const n = await db.execute(sql`SELECT title FROM notifications WHERE user_id = ${ids.traveler} AND related_id = ${ids.i2}`);
  assert.equal(n.rows.length, 1);
  const feed = await call(ids.author, "GET", "/api/expert/inbox/questions");
  assert.deepEqual(feed.body.questions, []);
  const again = await call(ids.author, "POST", `/api/expert/inbox/questions/${q.copy}/answer`, { answer: "Second try" });
  assert.equal(again.status, 409);
  assert.equal((await answersFor(q.copy)).length, 1);
});

test("A2: an expert who may not see the question gets one 404", async () => {
  for (const id of [q.plain, q.nomarket, q.door, crypto.randomUUID()]) {
    const r = await call(ids.other, "POST", `/api/expert/inbox/questions/${id}/answer`, { answer: "Hi" });
    assert.equal(r.status, 404, id);
    assert.equal((await answersFor(id)).length, 0);
  }
});

test("A3: the body is a strict answer of 1–2000 characters", async () => {
  for (const body of [{ answer: "" }, { answer: "x".repeat(2001) }, { answer: "ok", expertId: ids.kyoto }, {}]) {
    const r = await call(ids.author, "POST", `/api/expert/inbox/questions/${q.plain}/answer`, body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal((await answersFor(q.plain)).length, 0);
});

test("A4: two concurrent answers write one row", async () => {
  const results = await Promise.allSettled([
    answerInboxQuestion(ids.kyoto, q.plain, "The one by the east end.", { bylineEligible: kyotoGate }),
    answerInboxQuestion(ids.kyoto, q.plain, "The one by the east end.", { bylineEligible: kyotoGate }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const rejected = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  assert.equal((await answersFor(q.plain)).length, 1);
});

test("P1: expertMaySeeQuestion", async () => {
  const yes = async () => true;
  const no = async () => false;
  assert.equal(await expertMaySeeQuestion("e", { askerId: "e", marketKey: "kyoto", readyMadeAuthorId: null }, yes), false);
  assert.equal(await expertMaySeeQuestion("e", { askerId: "t", marketKey: "kyoto", readyMadeAuthorId: "e" }, no), true);
  assert.equal(await expertMaySeeQuestion("e", { askerId: "t", marketKey: "kyoto", readyMadeAuthorId: "a" }, yes), false);
  assert.equal(await expertMaySeeQuestion("e", { askerId: "t", marketKey: null, readyMadeAuthorId: null }, yes), false);
  assert.equal(await expertMaySeeQuestion("e", { askerId: "t", marketKey: "kyoto", readyMadeAuthorId: null }, yes), true);
  assert.equal(await expertMaySeeQuestion("e", { askerId: "t", marketKey: "kyoto", readyMadeAuthorId: null }, no), false);
});

test("S1: /api/expert/inbox is under the expert role backstop", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes.ts"), "utf8");
  const block = src.slice(src.indexOf("const EXPERT_SELF_SERVICE_PREFIXES = ["), src.indexOf("const PROVIDER_SELF_SERVICE_PREFIXES"));
  assert.match(block, /"\/api\/expert\/inbox",/);
});
