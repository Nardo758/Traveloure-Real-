/**
 * blog-race-weekend.db.test.ts — blog generator lane, type 3 (ledger `2026-09-30-blog-race-weekend`).
 *
 *   R1  pickGettingThereLeg: an estimate is not a leg (`no_leg`); every computed leg over budget is
 *       `beyond_budget`; otherwise the QUICKER computed mode, as a mode only
 *   R2  refusals before any model call: not motorsport (stated vertical), unknown market, the A8
 *       service off, no venue coordinates, no computed leg, beyond budget (budget stated, minutes not)
 *   R3  the prompt carries `gettingThere: { from, mode }` and NO minute or distance; the draft check
 *       refuses a printed minute count, a link, and a third market city
 *   R4  the generator makes a platform DRAFT (Suzuka from Kyoto) carrying the event; a second run
 *       spends no model call; the public read's door is type 1's live door
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/blog-race-weekend.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents } from "@shared/schema";
import type { ResolvedLeg } from "@shared/leg-resolution";
import type { LegMode } from "@shared/travel-speeds";
import { BlogError, getPublishedBySlug, publishPost } from "../blog-posts.service";
import {
  checkRaceWeekendDraft,
  draftRaceWeekend,
  pickGettingThereLeg,
  racePromptFacts,
  type RaceWeekendDeps,
  type RaceWeekendFacts,
} from "../blog-race-weekend.service";
import { loadEventGuideFacts } from "../blog-event-facts.service";

// Letters only: the fixture title carries RUN, and a digit run like "83" would read as a number the
// facts contain, defeating R3's "no minute reaches the prompt / an unknown number is refused" checks.
const RUN = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "abcdefghijklmnop"[b % 16]).join("");
const ADMIN = `race-${RUN}-admin`;
const GP = `race-${RUN}-gp`;
const JAZZ = `race-${RUN}-jazz`;
const NOWHERE = `race-${RUN}-nowhere`;
const DAY = 86_400_000;
const noHosts = async () => [] as string[];

const leg = (mode: LegMode, minutes: number, basis: ResolvedLeg["basis"] = "routes"): ResolvedLeg =>
  ({ mode, minutes, distanceMeters: 50_000, basis, label: basis === "est" ? "est." : null });
/** Suzuka from Kyoto: 97 minutes by train, 83 by car (the car is quicker). */
const resolver = (table: Partial<Record<LegMode, ResolvedLeg>>) => async () => async (_f: unknown, _t: unknown, m: LegMode) => {
  const l = table[m];
  if (!l) throw new Error("no route");
  return l;
};
const on = (over: Partial<RaceWeekendDeps> = {}): RaceWeekendDeps => ({
  partnerHosts: noHosts,
  serviceEnabled: () => true,
  budgetMinutes: 180,
  legResolver: resolver({ transit: leg("transit", 97), drive: leg("drive", 83) }),
  ...over,
});

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  const base = { source: "manual", city: "Kyoto", nights: 2, startsAt: new Date(Date.now() + 40 * DAY) };
  await db.insert(cityEvents).values([
    { ...base, id: GP, sourceId: `${GP}-src`, series: "Japanese Grand Prix", title: `Japanese Grand Prix ${RUN}`, venue: "Suzuka Circuit",
      venueLat: 34.8431, venueLng: 136.541, vertical: "motorsport", seriesKey: "japanese-grand-prix" },
    { ...base, id: JAZZ, sourceId: `${JAZZ}-src`, title: `Jazz ${RUN}`, venue: "Hall", venueLat: 35.0, venueLng: 135.7, vertical: "music" },
    { ...base, id: NOWHERE, sourceId: `${NOWHERE}-src`, title: `Rally ${RUN}`, venue: "Somewhere", vertical: "motorsport" },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE created_by = ${ADMIN}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id IN (${GP}, ${JAZZ}, ${NOWHERE})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN}`).catch(() => {});
});

test("R1: an estimate is not a leg; over budget is refused; the quicker computed mode wins", () => {
  assert.deepEqual(pickGettingThereLeg([leg("transit", 60, "est"), null], 180), { refused: "no_leg" });
  assert.deepEqual(pickGettingThereLeg([leg("transit", 200), leg("drive", 190, "matrix")], 180), { refused: "beyond_budget" });
  assert.deepEqual(pickGettingThereLeg([leg("transit", 97), leg("drive", 83)], 180), { mode: "drive" });
  assert.deepEqual(pickGettingThereLeg([leg("transit", 97), leg("drive", 20, "est")], 180), { mode: "transit" }, "an estimate never wins on speed");
});

test("R2: every refusal lands before any model call", async () => {
  let calls = 0;
  const model = async () => { calls++; return {}; };
  const code = (c: string, extra?: (e: BlogError) => boolean) => (e: unknown) => e instanceof BlogError && e.code === c && (!extra || extra(e));
  await assert.rejects(draftRaceWeekend({ eventId: `${GP}-x` }, ADMIN, on({ model })), code("no_city_event"));
  await assert.rejects(draftRaceWeekend({ eventId: JAZZ }, ADMIN, on({ model })), code("not_motorsport"));
  await assert.rejects(draftRaceWeekend({ eventId: GP, fromMarket: "atlantis" }, ADMIN, on({ model })), code("unknown_market"));
  await assert.rejects(draftRaceWeekend({ eventId: GP }, ADMIN, on({ model, serviceEnabled: () => false })), code("travel_time_service_off"));
  await assert.rejects(draftRaceWeekend({ eventId: NOWHERE }, ADMIN, on({ model })), code("no_venue_location"));
  await assert.rejects(draftRaceWeekend({ eventId: GP }, ADMIN, on({ model, legResolver: resolver({ transit: leg("transit", 70, "est") }) })), code("no_leg"));
  await assert.rejects(
    draftRaceWeekend({ eventId: GP }, ADMIN, on({ model, budgetMinutes: 60 })),
    code("beyond_budget", (e) => e.details?.budgetMinutes === 60 && !JSON.stringify(e.details).includes("83")),
  );
  assert.equal(calls, 0);
});

test("R3: the prompt carries { from, mode } and no minute; the check refuses printed minutes, links and a third market", async () => {
  const base = (await loadEventGuideFacts(GP, { partnerHosts: noHosts }))!;
  const facts: RaceWeekendFacts = { ...base, gettingThere: { from: "Kyoto", mode: "drive" } };
  const prompt = JSON.stringify(racePromptFacts(facts));
  assert.equal(/"gettingThere":\{"from":"Kyoto","mode":"drive"\}/.test(prompt), true);
  assert.equal(prompt.includes("83") || prompt.includes("minutes"), false);
  const d = (body: string) => checkRaceWeekendDraft({ title: "Race weekend", summary: "", body }, facts);
  assert.ok(!("error" in d("Suzuka Circuit is within reach of Kyoto by car.")));
  assert.deepEqual(d("Suzuka is 83 minutes from Kyoto by car."), { error: "race_weekend_unknown_number" });
  assert.deepEqual(d("Book at https://example.com from Kyoto."), { error: "race_weekend_foreign_link" });
  assert.deepEqual(d("Come from Kyoto or Porto."), { error: "race_weekend_unknown_market" });
});

test("R4: Suzuka from Kyoto — a platform draft with the live door; a re-run spends no model call", async () => {
  let calls = 0;
  let seen = "";
  const post = await draftRaceWeekend({ eventId: GP, fromMarket: "kyoto" }, ADMIN, on({
    model: async (i) => { calls++; seen = i.user; return { title: "Race weekend from Kyoto", summary: "The Japanese Grand Prix.", body: "Suzuka Circuit is within reach of Kyoto by car. Start a plan around the race." }; },
  }));
  assert.equal(post.status, "draft");
  assert.equal(post.authorship, "platform");
  assert.equal(post.contentType, "race_weekend");
  assert.equal(post.cityEventId, GP);
  assert.equal(post.marketSlug, "kyoto");
  assert.equal(seen.includes('"mode": "drive"'), true, "the quicker computed mode");
  assert.equal(/\b(83|97)\b/.test(seen), false, "the leg's minutes never reach the model");
  await assert.rejects(
    draftRaceWeekend({ eventId: GP, fromMarket: "kyoto" }, ADMIN, on({ model: async () => { calls++; return {}; } })),
    (e: unknown) => e instanceof BlogError && e.code === "already_drafted",
  );
  assert.equal(calls, 1);
  await publishPost(post.id, ADMIN);
  const pub = (await getPublishedBySlug(post.slug))!;
  assert.equal(pub.planDoor?.venue, "Suzuka Circuit");
  assert.equal(pub.seriesDoors, null);
  await db.update(cityEvents).set({ withdrawnAt: new Date() }).where(eq(cityEvents.id, GP));
  assert.equal((await getPublishedBySlug(post.slug))!.planDoor, null);
});
