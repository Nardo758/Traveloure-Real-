/**
 * blog-official-facts.db.test.ts — ruling R-p (ledger `2026-10-03-official-facts-public-ok`; migration
 * 341). A crawled fact reaches a public page ONLY from an official source marked public_ok, ONLY for
 * an operational fact type, and ONLY with its attribution.
 *
 *   O1  the event-guide facts carry the official public_ok source's HOURS fact; its DESCRIPTION, a
 *       fact from an official source never answered (NULL), and a fact with no source URL are all
 *       left out; one source line per URL: "from <source name>" + "checked <date>"
 *   O2  the attribution URL never reaches the model's prompt (the draft carries no links)
 *   O3  render path: the drafted, published post's public read carries that source line, linking to
 *       the fact's own URL — what the post page renders through `blogSourceView`
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/blog-official-facts.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents, contentSources, placeFacts } from "@shared/schema";
import { getPublishedBySlug, publishPost } from "../blog-posts.service";
import { loadEventGuideFacts } from "../blog-event-facts.service";
import { draftEventWeekendGuide, eventGuideSlug, promptFacts } from "../blog-event-guide.service";
import { lettersOnlyId } from "../../__tests__/fixtures/letters-only-id";

// Letters only: fixture titles carry RUN, and the draft check refuses a number the facts lack.
const RUN = lettersOnlyId();
const ADMIN = `offacts-${RUN}-admin`;
const EV = `offacts-${RUN}-ev`;
const PUBLIC_SRC = `offacts_${RUN}_public`;
const UNANSWERED_SRC = `offacts_${RUN}_unanswered`;
const SOURCE_NAME = `Kyoto Official ${RUN}`;
const HOURS_URL = `https://kyoto.example/${RUN}/hours`;
const FETCHED = new Date("2026-10-02T09:00:00Z");
const DAY = 86_400_000;
const noHosts = async () => [] as string[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  const src = { market: "kyoto", adapter: "tavily_extract", covers: ["stop.hours"], doesNotCover: [], licenseClass: "official", termsCheckedAt: FETCHED, active: true };
  await db.insert(contentSources).values([
    { ...src, id: PUBLIC_SRC, name: SOURCE_NAME, publicOk: true, publicOkCheckedAt: FETCHED },
    { ...src, id: UNANSWERED_SRC, name: `Unanswered ${RUN}`, publicOk: null },
  ] as any);
  await db.insert(cityEvents).values({
    id: EV, source: "manual", sourceId: `${EV}-src`, title: `Lantern Recital ${RUN}`, city: "Kyoto", venue: "ROHM Theatre",
    startsAt: new Date(Date.now() + 30 * DAY), nights: 1, vertical: "music",
  } as any);
  const base = { placeRefKind: "event_id", placeRef: EV, market: "kyoto", need: "stop.hours", origin: "crawled", license: "official", fetchedAt: FETCHED };
  await db.insert(placeFacts).values([
    { ...base, id: `${EV}-hours`, factType: "hours", value: { text: "The box office opens an hour before doors." }, sourceId: PUBLIC_SRC, sourceUrl: HOURS_URL },
    { ...base, id: `${EV}-desc`, factType: "description", value: { text: `DESCRIPTION-${RUN}` }, sourceId: PUBLIC_SRC, sourceUrl: `https://kyoto.example/${RUN}/about` },
    { ...base, id: `${EV}-unans`, factType: "hours", value: { text: `UNANSWERED-${RUN}` }, sourceId: UNANSWERED_SRC, sourceUrl: `https://kyoto.example/${RUN}/u` },
    { ...base, id: `${EV}-nourl`, factType: "closure", value: { text: `NOURL-${RUN}` }, sourceId: PUBLIC_SRC, sourceUrl: null },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE created_by = ${ADMIN}`).catch(() => {});
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref = ${EV}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id = ${EV}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_sources WHERE id IN (${PUBLIC_SRC}, ${UNANSWERED_SRC})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN}`).catch(() => {});
});

test("O1: only the official public_ok source's operational fact, with one attributed source line", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  assert.deepEqual(facts.venueFacts, [{ factType: "hours", text: "The box office opens an hour before doors." }]);
  assert.deepEqual(facts.venueFactSources, [
    { url: HOURS_URL, title: `from ${SOURCE_NAME}`, publisher: "checked 2 Oct 2026", retrievedAt: FETCHED },
  ]);
});

test("O2: the attribution link never reaches the model", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  const prompt = JSON.stringify(promptFacts(facts));
  assert.equal(prompt.includes(HOURS_URL), false);
  assert.equal(prompt.includes("venueFactSources"), false);
  assert.ok(prompt.includes("The box office opens an hour before doors."), "the fact itself is a prompt fact");
});

test("O3: the published post's public read carries 'from <source>' → the fact's URL, 'checked <date>'", async () => {
  const facts = (await loadEventGuideFacts(EV, { partnerHosts: noHosts }))!;
  const post = await draftEventWeekendGuide(EV, ADMIN, {
    partnerHosts: noHosts,
    refusedHosts: noHosts,
    model: async () => ({ title: facts.event.title, summary: "A weekend around one recital.", body: "The box office opens an hour before doors. Stay close to the venue." }),
  });
  await publishPost(post.id, ADMIN);
  const pub = (await getPublishedBySlug(eventGuideSlug(facts)))!;
  const line = pub.sources.find((s: any) => s.url === HOURS_URL);
  assert.ok(line, JSON.stringify(pub.sources));
  assert.equal(line.title, `from ${SOURCE_NAME}`);
  assert.equal(line.publisher, "checked 2 Oct 2026");
  assert.equal(pub.sources.some((s: any) => /about|\/u$/.test(s.url)), false, "excluded facts bring no source line");
});
