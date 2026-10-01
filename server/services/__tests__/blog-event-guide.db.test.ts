/**
 * blog-event-guide.db.test.ts — blog generator lane, type 1 (ledger `2026-09-30-blog-event-guide`).
 *
 *   E1  no live city_events row ⇒ `no_city_event`, before any model call
 *   E2  the ticket link survives only when R208 and the partner registry allow it
 *   E3  venue facts are PUBLISHABLE ONLY — a Places fact about the event never reaches the facts
 *   E4  stay ranking keeps the matrix ORDER and drops every minute and every estimate
 *   E5  the draft check refuses an invented number, any link, and another operating market
 *   E6  the generator makes a platform DRAFT carrying the event; a second run spends no model call;
 *       the admin create rail cannot make an event type by hand
 *   E7  the public read's "Start this plan" door comes from the LIVE event row, carries no id, and
 *       disappears when the event is withdrawn
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/blog-event-guide.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents, placeFacts } from "@shared/schema";
import { BlogError, createPost, getPublishedBySlug, publishPost } from "../blog-posts.service";
import { loadEventGuideFacts, rankStayNear } from "../blog-event-facts.service";
import { checkEventGuideDraft, draftEventWeekendGuide, eventGuideSlug, promptFacts } from "../blog-event-guide.service";

// Letters only: fixture titles carry RUN, and a digit run like "12" would read as a number the facts
// contain, defeating the "an invented number is refused" check.
const RUN = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "abcdefghijklmnop"[b % 16]).join("");
const ADMIN = `evguide-${RUN}-admin`;
const EV = `evguide-${RUN}-ev`;
const NEIGHBOUR = `evguide-${RUN}-nb`;
const DAY = 86_400_000;
const start = new Date(Date.now() + 30 * DAY);
const noHosts = async () => [] as string[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  await db.insert(cityEvents).values([
    {
      id: EV, source: "manual", sourceId: `${EV}-src`, series: "Kyoto Jazz Weekend", title: `Kyoto Jazz Weekend ${RUN}`,
      city: "Kyoto", venue: "ROHM Theatre", venueLat: null, venueLng: null, startsAt: start, endsAt: null, nights: 1,
      ticketUrl: "https://www.stubhub.com/kyoto-jazz", vertical: "music", seriesKey: "kyoto-jazz-weekend",
    },
    {
      id: NEIGHBOUR, source: "manual", sourceId: `${NEIGHBOUR}-src`, title: `Gion Lantern Night ${RUN}`,
      city: "Kyoto", venue: "Yasaka Shrine", startsAt: new Date(start.getTime() + DAY), nights: 1,
    },
  ] as any);
  const base = { placeRefKind: "event_id", placeRef: EV, market: "kyoto", need: "stop.hours", factType: "hours", fetchedAt: new Date() };
  await db.insert(placeFacts).values([
    { ...base, id: `${EV}-f1`, value: { text: `PLACES-${RUN}` }, origin: "places_api", license: "restricted" },
    { ...base, id: `${EV}-f2`, value: { text: "Doors open an hour before the first set." }, origin: "event", license: "official" },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE created_by = ${ADMIN}`).catch(() => {});
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref = ${EV}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id IN (${EV}, ${NEIGHBOUR})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN}`).catch(() => {});
});

test("E1: no live city_events row refuses before any model call", async () => {
  let calls = 0;
  await assert.rejects(
    draftEventWeekendGuide(`missing-${RUN}`, ADMIN, { partnerHosts: noHosts, model: async () => { calls++; return {}; } }),
    (e: unknown) => e instanceof BlogError && e.code === "no_city_event",
  );
  assert.equal(calls, 0);
});

test("E2 + E3: resale link dropped; only publishable venue facts; the week's other event is listed", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  assert.equal(facts.event.ticketUrl, null, "StubHub is a resale host (R208) and never reaches a post");
  assert.equal(facts.event.vertical, "music");
  assert.equal(facts.event.seriesKey, "kyoto-jazz-weekend");
  assert.deepEqual(facts.venueFacts, [{ factType: "hours", text: "Doors open an hour before the first set." }]);
  assert.equal(JSON.stringify(facts).includes(`PLACES-${RUN}`), false, "a Places fact never reaches the facts");
  assert.deepEqual(facts.stayNear, [], "no venue coordinates ⇒ no stay section, never an estimate");
  assert.ok(facts.alsoOn.some((o) => o.title === `Gion Lantern Night ${RUN}`));
});

test("E4: stay ranking is the matrix ORDER only — estimates dropped, minutes never carried", () => {
  const t = (minutes: number, basis: "matrix" | "est") =>
    basis === "matrix"
      ? { basis, minutes, mode: "transit" as const, originSlug: "a", destSlug: "b" }
      : { basis, minutes, mode: "transit" as const, reason: "no_centroid" as any, straightLineMeters: 1 };
  const ranked = rankStayNear([
    { slug: "gion", name: "Gion", time: t(14, "matrix") },
    { slug: "okazaki", name: "Okazaki", time: t(6, "matrix") },
    { slug: "far", name: "Far", time: t(2, "est") },
  ]);
  assert.deepEqual(ranked, [{ rank: 1, neighbourhood: "Okazaki" }, { rank: 2, neighbourhood: "Gion" }]);
  assert.equal(JSON.stringify(ranked).includes("14"), false);
});

test("E5: the check refuses an invented number, any link, and another market; the event's own facts pass", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  const day = String(Number(facts.event.firstDate.slice(8)));
  const ok = checkEventGuideDraft({ title: facts.event.title, body: `On ${day} at ${facts.event.startTime}, stay close by.` }, facts);
  assert.ok(!("error" in ok), JSON.stringify(ok));
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: "Tickets from $85." }, facts), { error: "event_guide_unknown_number" });
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: "Gion is 12 minutes away." }, facts), { error: "event_guide_unknown_number" });
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: "Buy at https://viagogo.com/x" }, facts), { error: "event_guide_foreign_link" });
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: "Then fly on to Goa." }, facts), { error: "event_guide_unknown_market" });
  assert.equal(JSON.stringify(promptFacts(facts)).includes(EV), false, "the row id is not a fact");
});

test("E6: a platform draft carrying the event; re-run spends no model call; no hand-made event type", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  let calls = 0;
  const post = await draftEventWeekendGuide(EV, ADMIN, {
    partnerHosts: noHosts,
    model: async () => { calls++; return { title: facts.event.title, summary: "A weekend around one show.", body: "Stay close to the venue. Start a plan around it." }; },
  });
  assert.equal(post.status, "draft", "never published by the generator");
  assert.equal(post.authorship, "platform");
  assert.equal(post.contentType, "event_weekend_guide");
  assert.equal(post.cityEventId, EV);
  assert.equal(post.slug, eventGuideSlug(facts));
  await assert.rejects(
    draftEventWeekendGuide(EV, ADMIN, { partnerHosts: noHosts, model: async () => { calls++; return {}; } }),
    (e: unknown) => e instanceof BlogError && e.code === "already_drafted",
  );
  assert.equal(calls, 1);
  await assert.rejects(
    createPost({ contentType: "series_follow", slug: `hand-${RUN}`, title: "t", body: "b" }, ADMIN),
    (e: unknown) => e instanceof BlogError && e.code === "event_guide_requires_generator",
  );
});

test("E7: the public door is the LIVE event row, carries no id, and goes when the event is withdrawn", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  const slug = eventGuideSlug(facts);
  const [row] = (await db.execute(sql`SELECT id FROM blog_posts WHERE slug = ${slug}`)).rows as any[];
  await publishPost(row.id, ADMIN);
  const pub = (await getPublishedBySlug(slug))!;
  assert.equal(pub.planDoor?.title, "Kyoto Jazz Weekend", "the series name anchors the plan, as the events strip does");
  assert.equal(pub.planDoor?.venue, "ROHM Theatre");
  assert.equal(JSON.stringify(pub.planDoor).includes(EV), false, "no id on the public read");
  await db.update(cityEvents).set({ withdrawnAt: new Date() }).where(eq(cityEvents.id, EV));
  assert.equal((await getPublishedBySlug(slug))!.planDoor, null);
  await db.update(cityEvents).set({ withdrawnAt: null }).where(eq(cityEvents.id, EV));
});
