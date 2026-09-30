/**
 * travelpulse-weekly.db.test.ts — TravelPulse PR 3 (ledger `2026-09-30-travelpulse-weekly`): the
 * platform weekly draft is written only from the displayed signal, refuses a thin week, refuses a
 * model that adds a number or a market, is one post per ISO week, and never publishes.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/travelpulse-weekly.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { BlogError } from "../blog-posts.service";
import {
  buildWeeklyFacts,
  checkWeeklyDraft,
  draftTravelPulseWeekly,
  isoWeek,
  weeklySlug,
  type WeeklyMarketSignal,
} from "../travelpulse-weekly.service";
import { PLATFORM_POST_LABEL } from "@shared/blog";

const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN = `tpweekly-${RUN}-admin`;
// A week no real data will ever hold, so the slug cannot collide with a production-shaped fixture.
const NOW = new Date("2099-03-04T09:00:00Z");

const SIGNAL: WeeklyMarketSignal[] = [
  { marketKey: "kyoto", cityName: "Kyoto", trend: 72, crowd: "high" },
  { marketKey: "porto", cityName: "Porto", trend: 55, crowd: null },
  { marketKey: "goa", cityName: "Goa", trend: 61, crowd: null },
  { marketKey: "jaipur", cityName: "Jaipur", trend: null, crowd: null },
];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
});
after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE slug = ${weeklySlug(NOW)}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN}`).catch(() => {});
});

test("W1: facts are only markets with a shown Trend number, highest first", () => {
  assert.deepEqual(buildWeeklyFacts(SIGNAL).map((f) => f.cityName), ["Kyoto", "Goa", "Porto"]);
});

test("W2: the ISO week and slug are stable", () => {
  assert.deepEqual(isoWeek(new Date("2026-09-30T12:00:00Z")), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek(new Date("2027-01-01T12:00:00Z")), { year: 2026, week: 53 });
  assert.equal(weeklySlug(new Date("2026-09-30T12:00:00Z")), "travelpulse-weekly-2026-w40");
});

test("W3: a draft that adds a number or a market not in the facts is refused whole", () => {
  const facts = buildWeeklyFacts(SIGNAL);
  const ok = checkWeeklyDraft({ title: "TravelPulse, week 10", summary: "s", body: "Kyoto is at 72." }, facts, NOW);
  assert.ok(!("error" in ok));
  assert.deepEqual(checkWeeklyDraft({ title: "t", body: "Kyoto hotels from $120." }, facts, NOW), { error: "weekly_draft_unknown_number" });
  assert.deepEqual(checkWeeklyDraft({ title: "t", body: "Jaipur is quiet." }, facts, NOW), { error: "weekly_draft_unknown_market" });
  assert.deepEqual(checkWeeklyDraft({ title: "", body: "x" }, facts, NOW), { error: "weekly_draft_malformed" });
});

test("W4: fewer markets than the minimum refuses before any model call", async () => {
  let calls = 0;
  await assert.rejects(
    draftTravelPulseWeekly(ADMIN, {
      now: NOW,
      signal: async () => SIGNAL.slice(0, 2),
      model: async () => { calls++; return {}; },
    }),
    (e: unknown) => e instanceof BlogError && e.code === "not_enough_signal",
  );
  assert.equal(calls, 0);
});

test("W5: the prompt carries only displayed facts; the post is a platform DRAFT; a second run is already_drafted with no model call", async () => {
  let prompt = "";
  let calls = 0;
  const post = await draftTravelPulseWeekly(ADMIN, {
    now: NOW,
    signal: async () => SIGNAL,
    model: async ({ user }) => {
      calls++;
      prompt = user;
      return { title: "TravelPulse, week 10", summary: "Kyoto leads.", body: "- Kyoto: 72, crowd high\n- Goa: 61\n- Porto: 55" };
    },
  });
  assert.equal(post.status, "draft", "the generator never publishes");
  assert.equal(post.authorship, "platform");
  assert.equal(post.contentType, "travelpulse_weekly");
  assert.equal(post.bylineExpertId, null);
  assert.equal(post.slug, weeklySlug(NOW));
  assert.match(prompt, /Kyoto: Trend 72; crowd high/);
  assert.doesNotMatch(prompt, /Jaipur/);
  assert.ok(PLATFORM_POST_LABEL.length > 0);

  await assert.rejects(
    draftTravelPulseWeekly(ADMIN, { now: NOW, signal: async () => SIGNAL, model: async () => { calls++; return {}; } }),
    (e: unknown) => e instanceof BlogError && e.code === "already_drafted",
  );
  assert.equal(calls, 1, "the second run spent no model call");
});
