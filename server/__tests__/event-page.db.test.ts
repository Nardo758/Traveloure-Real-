/**
 * An event's own page against a disposable database (ledger `2026-10-06-event-page`, events-page
 * brief 2b, rulings E2/E3).
 *
 *   EP1  an unknown source id, a withdrawn event and a malformed id are all "no page" (one 404)
 *   EP2  two live rows sharing a source id across sources are "no page" too (E2: never pick one)
 *   EP3  the live event's page: the card, the countdown, the organizer link only where the ticket
 *        url passes the refusal check, no organizer line otherwise
 *   EP4  "Good to know" carries only the attributable official fact, with its "from <source>" link
 *        and "checked <date>"; a fact with no URL and a fact from an unanswered source are left out;
 *        and the blog prompt still never carries those links
 *   EP5  an event with no official fact has an EMPTY "Good to know" (the section is absent)
 *   EP6  "More in <city>": same city, not ended, not withdrawn, not itself, soonest first
 *   EP7  verified locals: a count when there is one, null at zero (the line is absent)
 *   EP8  the count is R343-gated: of verified-neighbourhood candidates, only the ROUTABLE one counts —
 *        never an unverified, unpayable, seed, pending-application or form-less account
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents, contentSources, placeFacts } from "@shared/schema";
import { loadEventGuideFacts } from "../services/blog-event-facts.service";
import { promptFacts } from "../services/blog-event-guide.service";
import { composeMoreInCity, countVerifiedLocals, loadEventPage } from "../services/event-page.service";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `event-page-${RUN}-${s}`;
const DAY = 86_400_000;
const now = new Date();
const FETCHED = new Date("2026-10-02T09:00:00Z");
const SRC = `evpage_${RUN}_official`;
const SRC_UNANSWERED = `evpage_${RUN}_unanswered`;
const SOURCE_NAME = `Kyoto Official ${RUN}`;
const HOURS_URL = `https://kyoto.example/${RUN}/hours`;
const CITY = `Kyoto`;
const ids: Record<string, string> = {};
const ex = (k: string) => `evpage-${RUN}-${k}`;
const EXPERTS: Array<[string, string, string, string, string]> = [
  // key, email, application, identity, connect
  ["ok", `${ex("ok")}@routable.invalid`, "approved", "verified", "complete"],
  ["unverified", `${ex("unverified")}@routable.invalid`, "approved", "pending", "complete"],
  ["unpayable", `${ex("unpayable")}@routable.invalid`, "approved", "verified", "pending"],
  ["seed", `${ex("seed")}@example.com`, "approved", "verified", "complete"],
  ["pendingapp", `${ex("pendingapp")}@routable.invalid`, "pending", "verified", "complete"],
];
const noHosts = async () => [] as string[];
const facts = (id: string) => loadEventGuideFacts(id, { partnerHosts: noHosts, now });
const deps = (count = 0) => ({ facts: (id: string) => facts(id), verifiedCount: async () => count, now });

async function insertEvent(key: string, startDays: number, over: Partial<typeof cityEvents.$inferInsert> = {}) {
  const [row] = await db
    .insert(cityEvents)
    .values({
      source: "manual",
      sourceId: sid(key),
      title: `Event page ${RUN} ${key}`,
      city: CITY,
      venue: "ROHM Theatre",
      startsAt: new Date(now.getTime() + startDays * DAY),
      nights: 1,
      ...over,
    } as any)
    .returning({ id: cityEvents.id });
  ids[key] = row.id;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const [k, email, status, identity, connect] of EXPERTS) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ex(k)}, ${email}, 'EP', ${k}, 'local_expert')`);
    await db.execute(sql`
      INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, specialties,
                                      identity_verification_status, stripe_connect_status)
      VALUES (${`${ex(k)}-form`}, ${ex(k)}, 'EP', 'Fixture', ${`${ex(k)}@form.invalid`}, ${status}, '["Kyoto"]'::jsonb, '[]'::jsonb, ${identity}, ${connect})
    `);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ex("noform")}, ${`${ex("noform")}@routable.invalid`}, 'EP', 'noform', 'local_expert')`);
  await insertEvent("main", 20, { vertical: "music", ticketUrl: "https://www.rohmtheatrekyoto.jp/en/program/1" });
  await insertEvent("plain", 25, { ticketUrl: "not a url" });
  await insertEvent("withdrawn", 30, { withdrawnAt: new Date() });
  await insertEvent("ended", -5, { endsAt: new Date(now.getTime() - 3 * DAY), nights: 2 });
  await insertEvent("later", 40);
  await insertEvent("sooner", 10);
  await insertEvent("elsewhere", 12, { city: "Bogotá" });
  await insertEvent("twin-a", 50);
  await insertEvent("twin-b", 51, { source: "ticketmaster", sourceId: sid("twin-a") });

  const src = { market: "kyoto", adapter: "tavily_extract", covers: ["stop.hours"], doesNotCover: [], licenseClass: "official", termsCheckedAt: FETCHED, active: true };
  await db.insert(contentSources).values([
    { ...src, id: SRC, name: SOURCE_NAME, publicOk: true, publicOkCheckedAt: FETCHED },
    { ...src, id: SRC_UNANSWERED, name: `Unanswered ${RUN}`, publicOk: null },
  ] as any);
  const base = { placeRefKind: "event_id", placeRef: ids.main, market: "kyoto", need: "stop.hours", origin: "crawled", license: "official", fetchedAt: FETCHED };
  await db.insert(placeFacts).values([
    { ...base, id: `${RUN}-hours`, factType: "hours", value: { text: "Doors open an hour before the first set." }, sourceId: SRC, sourceUrl: HOURS_URL },
    { ...base, id: `${RUN}-nourl`, factType: "closure", value: { text: `NOURL-${RUN}` }, sourceId: SRC, sourceUrl: null },
    { ...base, id: `${RUN}-unans`, factType: "hours", value: { text: `UNANSWERED-${RUN}` }, sourceId: SRC_UNANSWERED, sourceUrl: `https://kyoto.example/${RUN}/u` },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE id LIKE ${`${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`event-page-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`evpage-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`evpage-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_sources WHERE id IN (${SRC}, ${SRC_UNANSWERED})`).catch(() => {});
  await pool.end();
});

test("EP1 unknown, withdrawn and malformed addresses are one 'no page'", async () => {
  assert.equal(await loadEventPage(sid("nope"), deps()), null);
  assert.equal(await loadEventPage(sid("withdrawn"), deps()), null);
  assert.equal(await loadEventPage(" padded ", deps()), null);
  assert.equal(await loadEventPage("x".repeat(201), deps()), null);
});

test("EP2 two live rows sharing a source id across sources are not resolved to either", async () => {
  assert.equal(await loadEventPage(sid("twin-a"), deps()), null);
});

test("EP3 the live event: card, countdown, organizer link only where it passes", async () => {
  const page = (await loadEventPage(sid("main"), deps()))!;
  assert.ok(page);
  assert.equal(page.event.id, ids.main);
  assert.equal(page.event.sourceId, sid("main"));
  assert.equal(page.event.vertical, "music");
  assert.equal(page.event.city, CITY);
  assert.match(page.countdown, /^Starts in \d+ days$/);
  assert.deepEqual(page.organizer, { url: "https://www.rohmtheatrekyoto.jp/en/program/1", host: "rohmtheatrekyoto.jp" });

  const plain = (await loadEventPage(sid("plain"), deps()))!;
  assert.equal(plain.event.vertical, null, "an unstated vertical is not guessed");
  assert.equal(plain.organizer, null, "a link that is not a URL draws no organizer line");
});

test("EP4 Good to know: the attributable official fact only, and never in the prompt", async () => {
  const page = (await loadEventPage(sid("main"), deps()))!;
  assert.deepEqual(page.goodToKnow, [
    { factType: "hours", text: "Doors open an hour before the first set.", label: `from ${SOURCE_NAME}`, sourceUrl: HOURS_URL, checked: "checked 2 Oct 2026" },
  ]);
  const json = JSON.stringify(page);
  assert.equal(json.includes(`NOURL-${RUN}`), false, "an unattributable fact is omitted");
  assert.equal(json.includes(`UNANSWERED-${RUN}`), false, "a source never marked public_ok is omitted");
  const prompt = JSON.stringify(promptFacts((await facts(ids.main))!));
  assert.equal(prompt.includes(HOURS_URL), false, "the event page's links stay out of the blog prompt");
  assert.equal(prompt.includes("attributedFacts"), false);
});

test("EP5 no official fact ⇒ an empty Good to know", async () => {
  const page = (await loadEventPage(sid("plain"), deps()))!;
  assert.deepEqual(page.goodToKnow, []);
});

test("EP6 More in the city: same city, not ended, not withdrawn, not itself, soonest first", async () => {
  // The composer over this run's rows alone (the shared test DB may hold other Kyoto events).
  const mine = await db.select().from(cityEvents).where(sql`${cityEvents.sourceId} LIKE ${`event-page-${RUN}-%`} AND ${cityEvents.city} = ${CITY}`);
  const rows = composeMoreInCity(mine, ids.main, now, 10).map((m) => m.sourceId);
  assert.deepEqual(rows, [sid("sooner"), sid("plain"), sid("later"), sid("twin-a"), sid("twin-a")]);
  // The page itself: none of the excluded rows, soonest first.
  const page = (await loadEventPage(sid("main"), deps()))!;
  for (const gone of ["main", "withdrawn", "ended", "elsewhere"]) {
    assert.equal(page.moreInCity.some((m) => m.sourceId === sid(gone)), false, gone);
  }
  const order = page.moreInCity.map((m) => m.firstDate);
  assert.deepEqual(order, [...order].sort(), "soonest first");
});

test("EP7 verified locals: a count, or null at zero", async () => {
  assert.equal((await loadEventPage(sid("main"), deps(3)))!.verifiedLocals, 3);
  assert.equal((await loadEventPage(sid("main"), deps(0)))!.verifiedLocals, null);
});

test("EP8 the verified count is R343-gated: only the routable candidate counts", async () => {
  const prev = process.env.SHOW_DEMO_EXPERTS;
  delete process.env.SHOW_DEMO_EXPERTS;
  try {
    const all = [...EXPERTS.map(([k]) => ex(k)), ex("noform")];
    assert.equal(await countVerifiedLocals("kyoto", { candidates: async () => all }), 1, "only the approved + verified + payable, non-seed account");
    assert.equal(await countVerifiedLocals("kyoto", { candidates: async () => [ex("ok")] }), 1);
    assert.equal(await countVerifiedLocals("kyoto", { candidates: async () => all.filter((id) => id !== ex("ok")) }), 0, "no routable candidate ⇒ 0 ⇒ the line is absent");
    assert.equal(await countVerifiedLocals("kyoto", { candidates: async () => [] }), 0);
  } finally {
    if (prev === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = prev;
  }
});
