/**
 * Feedback phase A against a real database (ledger `2026-10-04-feedback-phase-a`; migration 345).
 *
 *   F1 a second tap UPDATES the row — one row per plan × moment × user, carrying the latest answer
 *   F2 two taps racing still leave ONE row (the write serialises on the plan row)
 *   F3 every context column is server-filled: surface from the moment, group_key from the manifest,
 *      city from the plan, build_sha from the serving build; text only with `other`
 *   F4 an unknown moment/code pair is refused (409) and text past the cap is refused (400), never cut
 *   F5 the moment opens only once the plan has a draft, closes once answered or dismissed; undo clears
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { clearFeedback, feedbackState, recordFeedback } from "../services/feedback.service";
import { FEEDBACK_DISMISSED, TAP_TEXT_MAX, feedbackText, isFeedbackPair } from "@shared/feedback";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb-${RUN}-${s}`;
const OWNER = id("owner");
const T = id("plan");

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${T}, ${OWNER}, 'Feedback', 'Kyoto, Japan', '2027-11-11', '2027-11-14', 'draft', 'vacation')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM feedback_events WHERE plan_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM ai_generated_itineraries WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

const rows = async () => (await db.execute(sql`SELECT * FROM feedback_events WHERE plan_id = ${T} ORDER BY created_at`)).rows as any[];

test("F5a no draft yet ⇒ the post_draft moment is not open", async () => {
  assert.deepEqual((await feedbackState(T, OWNER)).open, []);
  await db.execute(sql`INSERT INTO ai_generated_itineraries (id, trip_id, destination, start_date, end_date)
    VALUES (${id("draft")}, ${T}, 'Kyoto, Japan', '2027-11-11', '2027-11-14')`);
  const s = await feedbackState(T, OWNER);
  assert.deepEqual(s.open, ["post_draft"]);
  assert.equal(s.groupKey, "trip");
});

test("F1 a second tap updates the row; F3 context is server-filled", async () => {
  const a = await recordFeedback({ tripId: T, userId: OWNER, moment: "post_draft", code: "too_packed", text: null });
  assert.equal(a.updated, false);
  const b = await recordFeedback({ tripId: T, userId: OWNER, moment: "post_draft", code: "other", text: "More food, fewer temples" });
  assert.equal(b.updated, true);
  assert.equal(b.id, a.id);
  const r = await rows();
  assert.equal(r.length, 1, "one row per plan × moment × user");
  assert.equal(r[0].code, "other");
  assert.equal(r[0].text, "More food, fewer temples");
  assert.equal(r[0].surface, "slip");
  assert.equal(r[0].group_key, "trip");
  assert.equal(r[0].city, "Kyoto");
  assert.equal(r[0].user_id, OWNER);
  assert.ok(r[0].created_at);
  assert.ok("build_sha" in r[0]);
});

test("F2 two racing taps leave one row", async () => {
  await Promise.all([
    recordFeedback({ tripId: T, userId: OWNER, moment: "post_draft", code: "fits", text: null }),
    recordFeedback({ tripId: T, userId: OWNER, moment: "post_draft", code: "wrong_areas", text: null }),
  ]);
  assert.equal((await rows()).length, 1);
});

test("F4 unknown pairs are refused; text past the cap is refused, never cut", () => {
  assert.equal(isFeedbackPair("post_draft", "fits"), true);
  assert.equal(isFeedbackPair("post_draft", FEEDBACK_DISMISSED), true);
  assert.equal(isFeedbackPair("post_draft", "least_travel"), false, "a phase-B code is not a post_draft answer");
  assert.equal(isFeedbackPair("post_optimize", "least_travel"), false, "phase B has no codes yet");
  assert.equal(isFeedbackPair("post_bogus", "fits"), false);
  assert.deepEqual(feedbackText("fits", "ignored"), { ok: true, text: null }, "text rides only with other");
  assert.deepEqual(feedbackText("other", "x".repeat(TAP_TEXT_MAX)), { ok: true, text: "x".repeat(TAP_TEXT_MAX) });
  assert.deepEqual(feedbackText("other", "x".repeat(TAP_TEXT_MAX + 1)), { ok: false });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(path.join(here, "../routes/feedback.routes.ts"), "utf8");
  assert.match(route, /!isFeedbackPair\(moment, code\)\) \{\s*return res\.status\(409\)/);
  assert.match(route, /if \(!text\.ok\) return res\.status\(400\)/);
  assert.match(route, /\.strict\(\)/);
});

test("F5b answered or dismissed ⇒ closed; undo clears the row", async () => {
  assert.deepEqual((await feedbackState(T, OWNER)).open, []);
  assert.equal(await clearFeedback({ tripId: T, userId: OWNER, moment: "post_draft" }), true);
  assert.equal((await rows()).length, 0);
  assert.deepEqual((await feedbackState(T, OWNER)).open, ["post_draft"]);
  await recordFeedback({ tripId: T, userId: OWNER, moment: "post_draft", code: FEEDBACK_DISMISSED, text: null });
  assert.deepEqual((await feedbackState(T, OWNER)).open, [], "a dismissal persists — the tap does not come back");
});
