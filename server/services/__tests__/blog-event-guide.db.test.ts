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
 *   E8  the draft check refuses a banned phrase and an event or trip date that has already ended
 *   E9  publish refuses the same two things and leaves the post a draft
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/blog-event-guide.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents, placeFacts } from "@shared/schema";
import { BlogError, createPost, getPublishedBySlug, publishPost } from "../blog-posts.service";
import { loadEventGuideFacts, rankStayNear } from "../blog-event-facts.service";
import { checkEventGuideDraft, checkPlatformDraft, draftEventWeekendGuide, eventGuideSlug, promptFacts } from "../blog-event-guide.service";
import { lettersOnlyId } from "../../__tests__/fixtures/letters-only-id";
import { numbersInFacts } from "@shared/draft-facts-check";

// Letters only: fixture titles carry RUN, and a digit run like "12" would read as a number the facts
// contain, defeating the "an invented number is refused" check.
const RUN = lettersOnlyId();
const ADMIN = `evguide-${RUN}-admin`;
const EV = `evguide-${RUN}-ev`;
const NEIGHBOUR = `evguide-${RUN}-nb`;
const PAST = `evguide-${RUN}-past`;
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
    { ...base, id: `${EV}-fa`, value: { text: `PLACES-${RUN}` }, origin: "places_api", license: "restricted" },
    { ...base, id: `${EV}-fb`, value: { text: "Doors open an hour before the first set." }, origin: "event", license: "official" },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE created_by = ${ADMIN}`).catch(() => {});
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref = ${EV}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id IN (${EV}, ${NEIGHBOUR}, ${PAST})`).catch(() => {});
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
  // The "invented" numbers are chosen OUTSIDE the facts' own numbers: the fixture dates are now + 30 days
  // read in Kyoto time, so a fixed "12" collided with the neighbouring event's day whenever that day was the
  // 12th, and the refusal under test silently became an allowed fact.
  const allowed = numbersInFacts(promptFacts(facts));
  const invented = (from: number) => {
    let n = from;
    while (allowed.has(String(n))) n++;
    return n;
  };
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: `Tickets from $${invented(85)}.` }, facts), { error: "event_guide_unknown_number" });
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: `Gion is ${invented(12)} minutes away.` }, facts), { error: "event_guide_unknown_number" });
  // A measurement is refused even when its number happens to be a fact (a date, a time): public posts never
  // state a distance or a duration (ruling 2026-09-30-public-content-facts-rank-only).
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: `Gion is ${invented(12)} km away.` }, facts), { error: "event_guide_unknown_number" });
  assert.deepEqual(checkEventGuideDraft({ title: "t", body: `Gion is ${day} minutes away.` }, facts), { error: "event_guide_unknown_number" });
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

const NOW = new Date("2026-10-21T03:00:00Z"); // noon in Asia/Tokyo

test("E8: banned phrases and a date that has already ended are refused; today and a later series date are not", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  for (const phrase of ["Trending", "HIDDEN GEMS", "Geisha", "back alley", "Back-Alleys", "Illuminations"]) {
    assert.deepEqual(
      checkEventGuideDraft({ title: "A night out", body: `Come for the ${phrase}.` }, facts),
      { error: "event_guide_banned_copy" },
      phrase,
    );
  }
  assert.ok(!("error" in checkEventGuideDraft({ title: "A night out", body: "A secret spot locals like." }, facts)), "secret is not on the blog list");

  const past = checkPlatformDraft(
    { title: "A night out", body: "Stay close to the venue." },
    { event: { city: "Kyoto", lastDate: "2026-10-20" } },
    ["Kyoto"],
    "event_guide",
    NOW,
  );
  assert.deepEqual(past, { error: "event_guide_past_date" });

  const today = checkPlatformDraft(
    { title: "A night out", body: "Stay close to the venue." },
    { event: { city: "Kyoto", lastDate: "2026-10-21" } },
    ["Kyoto"],
    "event_guide",
    NOW,
  );
  assert.ok(!("error" in today), JSON.stringify(today));

  const seriesOpen = checkPlatformDraft(
    { title: "A night out", body: "Stay close to the venue." },
    { instances: [{ city: "Kyoto", lastDate: "2026-10-01" }, { city: "Kyoto", lastDate: "2026-11-01" }] },
    ["Kyoto"],
    "series_follow",
    NOW,
  );
  assert.ok(!("error" in seriesOpen), JSON.stringify(seriesOpen));

  const seriesOver = checkPlatformDraft(
    { title: "A night out", body: "Stay close to the venue." },
    { instances: [{ city: "Kyoto", lastDate: "2026-09-01" }, { city: "Kyoto", lastDate: "2026-10-01" }] },
    ["Kyoto"],
    "series_follow",
    NOW,
  );
  assert.deepEqual(seriesOver, { error: "series_follow_past_date" });

  const tripOver = checkPlatformDraft(
    { title: "A night out", body: "Stay close to the venue." },
    { trip: { city: "Kyoto", endDate: "2026-10-01" } },
    ["Kyoto"],
    "event_guide",
    NOW,
  );
  assert.deepEqual(tripOver, { error: "event_guide_past_date" });

  const structuredWins = checkPlatformDraft(
    { title: "A night out", body: "The hall opened on 1 January 2020." },
    { event: { city: "Kyoto", firstDate: "2099-01-01", lastDate: "2099-01-01" } },
    ["Kyoto"],
    "event_guide",
    NOW,
  );
  assert.notEqual("error" in structuredWins && structuredWins.error, "event_guide_past_date");

  const proseOnly = checkPlatformDraft(
    { title: "A night out", body: "The hall opened on 1 January 2020." },
    { event: { city: "Kyoto" } },
    ["Kyoto"],
    "event_guide",
    NOW,
  );
  assert.deepEqual(proseOnly, { error: "event_guide_past_date" });
});

test("E9: publish refuses banned copy and a past event, and a future prose date still publishes", async () => {
  const banned = await createPost(
    { contentType: "travelpulse_weekly", slug: `pulse-banned-${RUN}`, title: "This week", body: "A hidden gem of a week." },
    ADMIN,
  );
  await assert.rejects(
    publishPost(banned.id, ADMIN),
    (e: unknown) => e instanceof BlogError && e.code === "banned_copy" && e.status === 422,
  );
  assert.equal((await db.execute(sql`SELECT status FROM blog_posts WHERE id = ${banned.id}`)).rows[0].status, "draft");

  const prosePast = await createPost(
    { contentType: "travelpulse_weekly", slug: `pulse-past-${RUN}`, title: "This week", body: "On 1 January 2020 the week began." },
    ADMIN,
  );
  await assert.rejects(
    publishPost(prosePast.id, ADMIN, { now: NOW }),
    (e: unknown) => e instanceof BlogError && e.code === "past_date" && e.status === 422,
  );

  const proseFuture = await createPost(
    {
      contentType: "travelpulse_weekly",
      slug: `pulse-future-${RUN}`,
      title: "Kyoto in November",
      body: "Checked 1 January 2020\nSee you on 1 June 2099.",
    },
    ADMIN,
  );
  const published = await publishPost(proseFuture.id, ADMIN, { now: NOW });
  assert.equal(published.status, "published");

  await db.insert(cityEvents).values({
    id: PAST, source: "manual", sourceId: `${PAST}-src`, title: `Past Night ${RUN}`,
    city: "Kyoto", venue: "A hall", startsAt: new Date("2020-01-15T03:00:00Z"), nights: 1,
  } as any);
  const eventPost = await createPost(
    {
      contentType: "event_weekend_guide",
      slug: `past-event-${RUN}`,
      title: "A night that ended",
      body: "Stay close to the venue. See you on 1 June 2099.",
      cityEventId: PAST,
    },
    ADMIN,
  );
  await assert.rejects(
    publishPost(eventPost.id, ADMIN, { now: NOW }),
    (e: unknown) => e instanceof BlogError && e.code === "past_date" && e.status === 422,
  );
  assert.equal((await db.execute(sql`SELECT status FROM blog_posts WHERE id = ${eventPost.id}`)).rows[0].status, "draft");
});
