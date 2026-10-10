/**
 * SS-1b — the market-level official refresh job, on a real database (ledger `2026-10-10-ss1b-official-refresh`).
 * The Tavily client, the model and robots are stubs: no network, and every call is counted.
 *
 *   J1  an eligible source's due target is read ONCE: the fact is born `official_refresh`, with its source id,
 *       the target URL, a verbatim quote, `verified_at` = the read and `expires_at` = that + the interval; tagged
 *       public + link_only; no plan, no item
 *   J2  the same target is not read again inside its interval (no client call)
 *   J3  the ceiling: a source that has spent its day is not read (no client call)
 *   J4  ineligible sources are skipped by name (no ceiling, unchecked terms, inactive) — no client call
 *   J5  unsourced is never written: a quote not on the page is refused by the adapter, and the writer refuses
 *       an official_refresh row with no URL, no source or no quote
 *   J6  a target naming a source no row holds is reported and never read
 *   J7  a station-anchored last train is placed by its OSM node — resolved ONCE (the next read reuses it, no
 *       lookup), with "© OpenStreetMap contributors" in `value.point`; OSM "no such station" ⇒ stored with NO
 *       coordinate; OSM unreachable ⇒ the target is deferred with nothing read
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { runOfficialRefresh } from "../jobs/officialRefresh";
import { recordFacts } from "../services/content-facts/place-facts.service";
import type { ContentSourceTargets } from "@shared/content-source-targets";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `or_${RUN.replace(/-/g, "")}_${s}`;
const HOME = `https://www.or-${RUN}.example.jp/`;
const URL_TEMPLE = `${HOME}temple/`;
const URL_TRAIN = `${HOME}last-train/`;
const PLACE_ID = `ChIJor${RUN}temple01`;
const PAGE = "Kiyomizu-dera. Last admission 16:30 on weekdays. Keihan Main Line: last train from Gion-Shijo 00:20 (weekdays).";

let calls = 0;
let modelAnswer: unknown = null;
const deps = {
  client: () => ({
    search: async () => {
      calls++;
      return { results: [] };
    },
    extract: async () => {
      calls++;
      return { results: [{ rawContent: PAGE }] };
    },
  }) as any,
  complete: async () => ({ result: modelAnswer }),
  robots: async () => {},
  partnerHosts: async () => [],
};

async function source(id: string, over: Record<string, string> = {}) {
  const v = {
    active: "true", terms: "now()", interval: "30", ceiling: "25", covers: "{stop.hours,transport.local}", ...over,
  };
  await db.execute(sql.raw(`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, terms_checked_at, refresh_interval_days, cost_ceiling_cents_per_day, active)
    VALUES ('${id}', 'Fixture ${id}', '${HOME}', 'kyoto', 'tavily_extract', '${v.covers}', '{}', 'official', ${v.terms}, ${v.interval}, ${v.ceiling}, ${v.active})`));
}

const templeTarget = (id: string): ContentSourceTargets => ({
  [id]: [{ label: "Kiyomizu-dera", url: URL_TEMPLE, need: "stop.hours", anchor: { kind: "place", placeId: PLACE_ID } }],
});

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const k of ["ok", "spent", "noceil", "unchecked", "inactive", "train"]) {
    await source(sid(k), k === "noceil" ? { ceiling: "NULL" } : k === "unchecked" ? { terms: "NULL" } : k === "inactive" ? { active: "false" } : {});
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE source_id LIKE ${`or_${RUN.replace(/-/g, "")}_%`}`);
  await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'sourceId' LIKE ${`or_${RUN.replace(/-/g, "")}_%`}`);
  await db.execute(sql`DELETE FROM content_sources WHERE id LIKE ${`or_${RUN.replace(/-/g, "")}_%`}`);
  await pool.end();
});

const lastAdmission = {
  facts: [{ factType: "last_admission", text: "Last entry is 16:30 on weekdays.", quote: "Last admission 16:30 on weekdays.", fields: { byWeekday: { "1": "16:30", "2": "16:30", "3": "16:30", "4": "16:30", "5": "16:30" } } }],
};

test("J1/J2 — a due target is read once, born official_refresh with full provenance; not read again inside its interval", async () => {
  modelAnswer = lastAdmission;
  calls = 0;
  const now = new Date();
  const r1 = await runOfficialRefresh({ now, targets: templeTarget(sid("ok")), adapterDeps: deps });
  assert.equal(r1.error, undefined);
  assert.deepEqual(r1.sources.map((s) => [s.sourceId, s.read, s.facts]), [[sid("ok"), 1, 1]]);
  assert.equal(calls, 1, "one extract, no search — the URL is known");
  const rows: any[] = (await db.execute(sql`SELECT * FROM place_facts WHERE source_id = ${sid("ok")}`)).rows;
  assert.equal(rows.length, 1);
  const f = rows[0];
  assert.equal(f.origin, "official_refresh");
  assert.equal(f.source_url, URL_TEMPLE);
  assert.equal(f.license, "official");
  assert.equal(f.place_ref_kind, "place_id");
  assert.equal(f.place_ref, PLACE_ID);
  assert.equal(f.value.quote, "Last admission 16:30 on weekdays.");
  assert.equal(f.plan_id, null);
  assert.equal(f.itinerary_item_id, null);
  assert.equal([f.source_class, f.reuse_class].join("/"), "public/link_only");
  assert.ok(f.verified_at, "verified_at is the read");
  assert.equal(new Date(f.expires_at).getTime() - new Date(f.verified_at).getTime(), 30 * 86_400_000, "expires = verified + 30 days");

  calls = 0;
  const r2 = await runOfficialRefresh({ now: new Date(now.getTime() + 86_400_000), targets: templeTarget(sid("ok")), adapterDeps: deps });
  assert.deepEqual(r2.sources.map((s) => [s.read, s.notDue]), [[0, 1]]);
  assert.equal(calls, 0);
});

test("J3 — a source that has spent its daily ceiling is not read", async () => {
  await db.execute(sql`INSERT INTO api_usage_logs (id, provider, endpoint, operation, estimated_cost_cents, success, metadata, created_at)
    VALUES (${crypto.randomUUID()}, 'tavily', 'extract', 'extract', 250, true, ${JSON.stringify({ purpose: "content_facts", sourceId: sid("spent") })}::jsonb, now())`);
  calls = 0;
  const r = await runOfficialRefresh({ targets: templeTarget(sid("spent")), adapterDeps: deps });
  assert.deepEqual(r.sources.map((s) => [s.read, s.stoppedAt]), [[0, "ceiling_reached"]]);
  assert.equal(calls, 0);
});

test("J4 — ineligible sources are skipped by name", async () => {
  calls = 0;
  const r = await runOfficialRefresh({
    targets: { ...templeTarget(sid("noceil")), ...templeTarget(sid("unchecked")), ...templeTarget(sid("inactive")) },
    adapterDeps: deps,
  });
  assert.deepEqual(Object.fromEntries(r.sources.map((s) => [s.sourceId, s.skipped])), {
    [sid("noceil")]: "no_ceiling", [sid("unchecked")]: "terms_unchecked", [sid("inactive")]: "inactive",
  });
  assert.equal(calls, 0);
});

test("J5 — unsourced is never written", async () => {
  // A quote that is not on the page is refused by the adapter; nothing reaches the writer.
  modelAnswer = { facts: [{ ...lastAdmission.facts[0], quote: "Last admission 17:00 every day." }] };
  await db.execute(sql`DELETE FROM place_facts WHERE source_id = ${sid("ok")}`);
  await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'sourceId' = ${sid("ok")}`);
  const r = await runOfficialRefresh({ targets: templeTarget(sid("ok")), adapterDeps: deps });
  assert.deepEqual(r.sources.map((s) => [s.read, s.facts]), [[1, 0]]);
  // The writer refuses an official_refresh draft without its provenance.
  const base = {
    placeRefKind: "place_id" as const, placeRef: PLACE_ID, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours" as const,
    factType: "hours" as const, value: { text: "x", quote: "Open 9:00" }, origin: "official_refresh" as const, sourceId: sid("ok"),
    sourceUrl: URL_TEMPLE, license: "official" as const, fetchedAt: new Date(), verifiedAt: new Date(), expiresAt: new Date(), costCents: 0,
  };
  assert.equal(await recordFacts([{ ...base, sourceUrl: null }], { planId: null, itemId: null }), 0);
  assert.equal(await recordFacts([{ ...base, sourceId: null }], { planId: null, itemId: null }), 0);
  assert.equal(await recordFacts([{ ...base, value: { text: "x" } }], { planId: null, itemId: null }), 0);
  assert.equal(await recordFacts([{ ...base, license: "editorial" }], { planId: null, itemId: null }), 0);
  const n: any = (await db.execute(sql`SELECT count(*)::int AS n FROM place_facts WHERE source_id = ${sid("ok")}`)).rows[0];
  assert.equal(n.n, 0);
});

test("J6 — a target naming a source no row holds is reported and never read", async () => {
  calls = 0;
  const r = await runOfficialRefresh({ targets: templeTarget(sid("ghost")), adapterDeps: deps });
  assert.equal(r.sources.length, 0);
  assert.ok(r.targetProblems.some((p) => p.includes(sid("ghost")) && p.includes("unknown_source")));
  assert.equal(calls, 0);
});

const trainFact = {
  facts: [{
    factType: "last_service", text: "Last weekday train from Gion-Shijo is 00:20.", quote: "last train from Gion-Shijo 00:20 (weekdays)",
    fields: { operator: "Keihan", line: "Main Line", station: "Gion-Shijo", lastDeparture: "00:20", weekdays: [1, 2, 3, 4, 5], validFrom: "2026-03-01", validTo: "2027-03-01" },
  }],
};
const NODE = 1_000_000 + Math.floor(Math.random() * 1_000_000);
const trainTarget = (slug: string, osmNodeId = NODE): ContentSourceTargets => ({
  [sid("train")]: [{ label: "Keihan — last trains, Gion-Shijo", url: URL_TRAIN, need: "transport.local.last_service", anchor: { kind: "station", stationSlug: slug, osmNodeId } }],
});

test("J7 — a station is placed by its OSM node, resolved once, attributed; no match ⇒ unplaced; unreachable ⇒ deferred", async () => {
  modelAnswer = trainFact;
  const slug = `gion-shijo-${RUN.replace(/[^a-z0-9]/g, "")}`;
  const asked: { osmNodeId: number; name: string }[] = [];
  const osm = (answer: "hit" | "miss" | "down") => async (q: { osmNodeId: number; name: string }) => {
    asked.push(q);
    return answer === "down" ? ("unreachable" as const) : answer === "miss" ? null
      : { lat: 35.0037212, lng: 135.7722146, matchedName: "Gion-Shijo", attribution: "© OpenStreetMap contributors" as const };
  };

  // Unreachable ⇒ deferred, nothing read, nothing spent.
  calls = 0;
  const r0 = await runOfficialRefresh({ targets: trainTarget(slug), adapterDeps: deps, resolveStation: osm("down") });
  assert.deepEqual(r0.sources.map((s) => [s.read, s.stations]), [[0, { deferred: 1 }]]);
  assert.equal(calls, 0);

  // Resolved: the fact carries the node's point and the attribution.
  const r1 = await runOfficialRefresh({ targets: trainTarget(slug), adapterDeps: deps, resolveStation: osm("hit") });
  assert.deepEqual(r1.sources.map((s) => [s.read, s.facts, s.stations]), [[1, 1, { resolved: 1 }]]);
  assert.deepEqual(asked.at(-1), { osmNodeId: NODE, name: slug.replace(/-/g, " ") });
  const f: any = (await db.execute(sql`SELECT * FROM place_facts WHERE source_id = ${sid("train")}`)).rows[0];
  assert.equal(f.fact_type, "last_service");
  assert.equal(f.place_ref, `station:${slug}`);
  assert.equal(Number(f.place_lat), 35.0037212);
  assert.equal(Number(f.place_lng), 135.7722146);
  assert.deepEqual(f.value.point, { provider: "openstreetmap", osmNodeId: NODE, matchedName: "Gion-Shijo", attribution: "© OpenStreetMap contributors" });

  // Once: the next read (a full interval later) reuses the stored point and asks OSM nothing.
  const n = asked.length;
  const later = new Date(Date.now() + 31 * 86_400_000);
  const r2 = await runOfficialRefresh({ now: later, targets: trainTarget(slug), adapterDeps: deps, resolveStation: osm("hit") });
  assert.deepEqual(r2.sources.map((s) => [s.read, s.stations]), [[1, { reused: 1 }]]);
  assert.equal(asked.length, n, "no second lookup");

  // No such station ⇒ the fact is stored with no coordinate; nothing guessed.
  const other = `${slug}-x`;
  const r3 = await runOfficialRefresh({ now: new Date(later.getTime() + 31 * 86_400_000), targets: trainTarget(other, NODE + 1), adapterDeps: deps, resolveStation: osm("miss") });
  assert.deepEqual(r3.sources.map((s) => [s.read, s.stations]), [[1, { unlocated: 1 }]]);
  const g: any = (await db.execute(sql`SELECT * FROM place_facts WHERE source_id = ${sid("train")} AND place_ref = ${`station:${other}`}`)).rows[0];
  assert.equal(g.place_lat, null, "no coordinate is guessed");
  assert.equal(g.value.point, undefined);
});
