/**
 * CS-1 item 2 — every fact reader reads live facts only, on a real database (ledger `2026-10-19-cs1-live-facts`).
 *
 *   LF1  the writer refuses a machine-read fact with no expires_at; a traveler's own note with none is stored
 *   LF2  the plan: an expired reviewed official last entry is not in the plan's facts or the feasibility checks, and the
 *        stop shows "Last entry not checked yet. See <Place>'s official site before you go." with the top-level link;
 *        a live one is read and draws no waiting line; a legacy machine row with no expiry is not read; the traveler's
 *        note with no expiry is
 *   LF3  last services: an expired one is not read, a live one is
 *   LF4  covering events: an expired event fact is not read, a live one is
 *   LF5  the event guide's fact builder (public page + blog generators): an expired fact is dropped; a live one is
 *        stamped BY CODE "Checked <date> · Source: <site>", the model never sees the stamp, and the body carries it
 *   LF6  an expert cannot confirm an expired fact
 *   LF7  a stop whose stored official hours expired shows "Hours not checked yet. See <Place>'s official site before you
 *        go." with the top-level link; the expired hours are never read
 *
 * The coverage census and where-to-stay's neighbourhood line are proven without a database in
 * server/__tests__/live-facts-readers.test.ts (LR1–LR2).
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents, placeFacts } from "@shared/schema";
import {
  confirmFactAsNugget,
  factsForTrip,
  feasibilityFactsForTrip,
  hoursWaitingForTrip,
  lastEntryWaitingForTrip,
  lastServicesForMarket,
  recordFacts,
  recordMachineFacts,
} from "../services/content-facts/place-facts.service";
import { coveringEventsForTrip } from "../services/content-facts/covering-events";
import { loadEventGuideFacts } from "../services/blog-event-facts.service";
import { promptFacts, withFactStamps } from "../services/blog-event-guide.service";

const RUN = crypto.randomUUID().slice(0, 8).replace(/-/g, "");
const id = (s: string) => `lf_${RUN}_${s}`;
const owner = id("owner");
const reviewer = id("reviewer");
const trip = id("trip");
const SRC = id("src");
const MARKET = `lf${RUN}`;
const PLACE_OLD = `ChIJ-${RUN}-old`;
const PLACE_LIVE = `ChIJ-${RUN}-live`;
const DAY = 86_400_000;
const now = new Date();
const CHECKED = new Date(now.getTime() - 40 * DAY);
const EXPIRED = new Date(now.getTime() - 10 * DAY);
const LIVE = new Date(now.getTime() + 20 * DAY);
let eventId = "";

const lastEntry = (placeRef: string, over: Record<string, unknown> = {}) =>
  ({
    placeRefKind: "place_id",
    placeRef,
    placeLat: null,
    placeLng: null,
    market: "kyoto",
    need: "stop.hours",
    factType: "last_admission",
    value: { byWeekday: { "0": "16:30", "1": "16:30", "2": "16:30", "3": "16:30", "4": "16:30", "5": "16:30", "6": "16:30" }, quote: "Last admission 16:30" },
    origin: "official_refresh",
    sourceId: SRC,
    sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/visit/",
    license: "official",
    fetchedAt: CHECKED,
    expiresAt: EXPIRED,
    verifiedAt: CHECKED,
    verifiedBy: reviewer,
    costCents: 0,
    ...over,
  }) as any;

const lastService = (station: string, expiresAt: Date) =>
  ({
    placeRefKind: "free_text",
    placeRef: `${station}-${RUN}`,
    // A placeholder point, not a real place (the repo is public); the reader only needs one.
    placeLat: 10,
    placeLng: 10,
    market: MARKET,
    need: "transport.local",
    factType: "last_service",
    value: { operator: "Kyoto City Subway", line: "Tozai", station, lastDeparture: "23:30", weekdays: [0, 1, 2, 3, 4, 5, 6], validFrom: "2026-01-01", validTo: "2027-12-31", quote: "Last train 23:30", point: { provider: "openstreetmap", osmNodeId: 1, attribution: "© OpenStreetMap contributors" } },
    origin: "official_refresh",
    sourceId: SRC,
    sourceUrl: "https://www.city.kyoto.lg.jp/kotsu/",
    license: "official",
    fetchedAt: CHECKED,
    expiresAt,
    verifiedAt: CHECKED,
    verifiedBy: reviewer,
    costCents: 0,
  }) as any;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler'), (${reviewer}, ${`${reviewer}@t.test`}, 'admin')`);
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, terms_checked_at, active, refresh_interval_days, public_ok)
    VALUES (${SRC}, 'Kinkaku-ji', 'https://www.shokoku-ji.jp/kinkakuji/', 'kyoto', 'tavily_extract', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30, true)`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${trip}, ${owner}, 'LF', 'Kyoto, Japan', 'kyoto', '2027-05-10', '2027-05-12', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, origin, sort_order, google_place_id, routing_status) VALUES
    (${id("old")}, ${trip}, 1, 'Kinkaku-ji', '16:45', 60, 'traveler', 1, ${PLACE_OLD}, 'in_planning'),
    (${id("live")}, ${trip}, 1, 'Ginkaku-ji', '16:45', 60, 'traveler', 2, ${PLACE_LIVE}, 'in_planning')`);
  const [ev] = await db
    .insert(cityEvents)
    .values({ source: "manual", sourceId: id("event"), title: `LF ${RUN}`, city: "Kyoto", venue: "ROHM Theatre", startsAt: new Date(now.getTime() + 20 * DAY), nights: 1 } as any)
    .returning({ id: cityEvents.id });
  eventId = ev.id;
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref LIKE ${`ChIJ-${RUN}-%`} OR place_ref LIKE ${`%-${RUN}`} OR place_ref = ${eventId} OR market = ${MARKET} OR plan_id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id = ${eventId}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_sources WHERE id = ${SRC}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${reviewer})`).catch(() => {});
  await pool.end();
});

test("LF1 — the writer refuses a machine fact with no expiry", async () => {
  const refused = await recordMachineFacts([lastEntry(PLACE_OLD, { expiresAt: null, verifiedBy: null })], { planId: null, itemId: null });
  assert.equal(refused, 0, "no_expiry");
  const note = await recordFacts(
    [{ ...lastEntry(`ChIJ-${RUN}-note`), factType: "tip", need: "stop.hours", origin: "traveler_note", sourceId: null, sourceUrl: null, license: null, verifiedBy: null, verifiedAt: null, expiresAt: null, value: { text: `NOTE-${RUN}` } }],
    { planId: trip, itemId: id("live") },
  );
  assert.equal(note, 1, "a traveler's note keeps its rule: no expiry, stored");
});

test("LF2 — the plan reads live facts only, and an expired last entry waits with the official link", async () => {
  assert.equal(await recordFacts([lastEntry(PLACE_OLD)], { planId: null, itemId: null }), 1);
  assert.equal(await recordFacts([lastEntry(PLACE_LIVE, { expiresAt: LIVE })], { planId: null, itemId: null }), 1);
  // A legacy machine row from before the writer refused one (raw insert): never read.
  await db.insert(placeFacts).values({ ...lastEntry(PLACE_OLD), id: id("legacy"), expiresAt: null, value: { byWeekday: { "1": "15:00" }, quote: "15:00" }, sourceClass: "public", reuseClass: "link_only" } as any);

  const views = await factsForTrip(trip, now);
  assert.equal((views[id("old")] ?? []).some((v) => v.factType === "last_admission"), false, "expired: not read");
  assert.equal((views[id("live")] ?? []).some((v) => v.factType === "last_admission"), true, "live: read");
  assert.equal((views[id("live")] ?? []).some((v) => (v.value as any)?.text === `NOTE-${RUN}`), true, "the traveler's note is read");
  assert.equal(JSON.stringify(views).includes("15:00"), false, "the legacy no-expiry row is never read");
  assert.equal(JSON.stringify(views).includes("may have changed"), false);

  const feas = JSON.stringify(await feasibilityFactsForTrip(trip, "kyoto", now));
  assert.equal(feas.includes(PLACE_OLD), false, "the feasibility checks never read the expired fact");

  const waiting = await lastEntryWaitingForTrip(trip, now);
  assert.deepEqual(waiting[id("old")], {
    text: "Last entry not checked yet. See Kinkaku-ji's official site before you go.",
    linkText: "Kinkaku-ji's official site",
    url: "https://www.shokoku-ji.jp/",
  });
  assert.equal(waiting[id("live")], undefined, "a live reviewed last entry draws no waiting line");
});

test("LF3 — last services: expired is not read, live is", async () => {
  assert.equal(await recordFacts([lastService("Higashiyama", EXPIRED), lastService("Keage", LIVE)], { planId: null, itemId: null }), 2);
  const rows = JSON.stringify(await lastServicesForMarket(MARKET, now));
  assert.equal(rows.includes("Higashiyama"), false);
  assert.equal(rows.includes("Keage"), true);
});

test("LF4 — covering events: expired is not read, live is", async () => {
  const ev = (title: string, expiresAt: Date) =>
    ({
      ...lastEntry(`ChIJ-${RUN}-ev-${title}`),
      market: "kyoto",
      need: "event",
      factType: "event",
      value: { title, startDate: "2027-05-09", endDate: "2027-05-13", quote: title },
      expiresAt,
    }) as any;
  await db.insert(placeFacts).values([
    { ...ev(`OLD-${RUN}`, EXPIRED), id: id("ev-old"), sourceClass: "public", reuseClass: "link_only" },
    { ...ev(`NEW-${RUN}`, LIVE), id: id("ev-new"), sourceClass: "public", reuseClass: "link_only" },
  ] as any);
  const out = JSON.stringify(await coveringEventsForTrip({ destination: "Kyoto, Japan", startDate: "2027-05-10", endDate: "2027-05-12", now }));
  assert.equal(out.includes(`OLD-${RUN}`), false);
  assert.equal(out.includes(`NEW-${RUN}`), true);
});

test("LF5 — the event guide drops an expired fact and stamps a live one with source and checked date", async () => {
  const base = { placeRefKind: "event_id", placeRef: eventId, market: "kyoto", need: "stop.hours", origin: "crawled", license: "official", fetchedAt: CHECKED, verifiedBy: reviewer, sourceId: SRC, sourceClass: "public", reuseClass: "link_only", costCents: "0" };
  await db.insert(placeFacts).values([
    { ...base, id: id("g-old"), factType: "hours", value: { text: `GUIDE-OLD-${RUN}` }, sourceUrl: "https://www.shokoku-ji.jp/a", expiresAt: EXPIRED },
    { ...base, id: id("g-new"), factType: "hours", value: { text: `GUIDE-NEW-${RUN}` }, sourceUrl: "https://www.shokoku-ji.jp/b", expiresAt: LIVE },
  ] as any);
  const facts = await loadEventGuideFacts(eventId, { partnerHosts: async () => [], now });
  assert.ok(facts);
  assert.equal(JSON.stringify(facts).includes(`GUIDE-OLD-${RUN}`), false, "expired: dropped everywhere");
  assert.ok(facts!.venueFacts.some((f) => f.text === `GUIDE-NEW-${RUN}`), "live: copied");
  const stamp = facts!.factStamps.find((f) => f.text === `GUIDE-NEW-${RUN}`);
  assert.match(stamp?.stamp ?? "", /^Checked \d{1,2} \S+ \d{4} · Source: Kinkaku-ji$/, "code writes the stamp from stored fields");
  // The model never sees a stamp; the generators append them to the body themselves.
  assert.equal(JSON.stringify(promptFacts(facts!)).includes("Checked"), false);
  assert.equal(JSON.stringify(promptFacts(facts!)).includes("Kinkaku-ji"), false);
  const body = withFactStamps("Body.", facts!);
  assert.ok(body.startsWith("Body.\n\n"));
  assert.ok(body.includes(`GUIDE-NEW-${RUN} — ${stamp!.stamp}`));
  assert.doesNotMatch(body, /verified|confirmed/i);
});

test("LF7 — a stop whose stored official hours expired shows the hours line with the official link", async () => {
  await recordFacts([{ ...lastEntry(PLACE_OLD), factType: "hours", value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"], quote: "9:00 AM – 5:00 PM" } }], { planId: null, itemId: null });
  const waiting = await hoursWaitingForTrip(trip, now);
  assert.deepEqual(waiting[id("old")], {
    text: "Hours not checked yet. See Kinkaku-ji's official site before you go.",
    linkText: "Kinkaku-ji's official site",
    url: "https://www.shokoku-ji.jp/",
  });
  assert.equal(waiting[id("live")], undefined, "no expired hours stored for that place");
  const views = await factsForTrip(trip, now);
  assert.equal((views[id("old")] ?? []).some((v) => v.factType === "hours"), false, "the expired hours are never read");
});

test("LF6 — an expired fact cannot be confirmed", async () => {
  await db.insert(placeFacts).values({
    ...lastEntry(`ChIJ-${RUN}-crawl`),
    id: id("crawl"),
    factType: "tip",
    origin: "crawled",
    verifiedAt: null,
    verifiedBy: null,
    value: { text: "Arrive early." },
    planId: trip,
    itineraryItemId: id("live"),
    sourceClass: "public",
    reuseClass: "link_only",
  } as any);
  await assert.rejects(confirmFactAsNugget({ tripId: trip, factId: id("crawl"), expertId: reviewer }), (e: any) => e.code === "expired" && e.status === 409);
});
