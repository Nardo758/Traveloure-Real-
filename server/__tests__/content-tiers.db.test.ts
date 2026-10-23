/**
 * FD-2 — CONTENT-TIER TAGS on a real database (decision-maker rulings 1–9, Oct 9, 2026; ledger
 * `2026-10-09-fd2-content-tier-tags`; migrations 361/362).
 *
 *   D1  ruling 9: an item's source_class is stamped by the server at create — a client-supplied 'local'
 *       on a traveler item is IGNORED (stored 'public'); an expert item is 'local'; an unknown origin NULL
 *   D2  ruling 9: an item update cannot set source_class (the storage strip)
 *   D3  ruling 9: the client body schema drops source_class
 *   D4  migration 362 (run in a ROLLED-BACK transaction): a team-seeded gem becomes local + "Traveloure
 *       team"; a curated gem is verified by its curator; an AI-written gem stays UNTAGGED (ruling 3); a
 *       second run touches none of them
 *   D5  rulings 3 + 8: the draft gem read takes tagged, live rows only — untagged and expired-local are hidden
 *   D6  ruling 3: verifying an untagged gem makes the verifier its author (no team label); a second press
 *       is 409 and an unknown gem 404; the verified gem then reaches a draft
 *   D7  place_facts are born tagged from origin + license (recordFacts)
 *   D8  ruling 8: the nightly census counts expired local content and changes nothing; a clean
 *       target config is status ok, HTTP 200 { ok: true }
 *   D9  a missing refresh source completes the run: status failed, one error line per missing source,
 *       HTTP 200 { ok: false } — not a 500 — and no success heartbeat
 *   D10 a valid target is still checked when another source is missing; the counts and coverage still run
 *   D11 a census read failure is still HTTP 500
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { insertItineraryItemSchema, itineraryItems, jobHeartbeats, placeFacts, travelPulseHiddenGems } from "@shared/schema";
import type { ContentSourceTargets } from "@shared/content-source-targets";
import { storage } from "../storage";
import { travelPulseService } from "../services/travelpulse.service";
import { verifyGem } from "../services/gem-promotion.service";
import { recordFacts } from "../services/content-facts/place-facts.service";
import { placesCacheMaxDays } from "../config/content-facts.config";
import { contentExpiryCensusCrashed, contentExpiryCensusReportedFailure, runContentExpiryCensus } from "../jobs/contentExpiryCensus";
import { runJob } from "../routes/internal.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ctt-${RUN}-${s}`;
const OWNER = id("owner");
const ADMIN = id("admin");
const TRIP = id("trip");
const CITY = `TierCity-${RUN}`;

async function gem(k: string, extra: Record<string, unknown> = {}) {
  await db.insert(travelPulseHiddenGems).values({ id: id(k), city: CITY, placeName: `Gem ${k}`, gemScore: 50, ...extra } as any);
  return id(k);
}
async function gemRow(gid: string) {
  const [r] = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, gid));
  return r;
}

function hoursTarget(sourceId: string, host: string): ContentSourceTargets {
  return {
    [sourceId]: [{
      label: "Hours",
      url: `https://${host}/hours`,
      need: "stop.hours",
      anchor: { kind: "place", placeId: "ChIJcensusplace1" },
    }],
  };
}

function missingSourceLine(sourceId: string): string {
  return `${sourceId}: unknown_source — no content_sources row has this id`;
}

/** The same two predicates the census route passes to `runJob`. */
function censusHttp(job: string, targets?: ContentSourceTargets) {
  return runJob(
    job,
    () => runContentExpiryCensus(targets ? { targets } : {}),
    contentExpiryCensusCrashed,
    { isReportedFailure: contentExpiryCensusReportedFailure },
  );
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler'), (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${TRIP}, ${OWNER}, ${`Tier ${RUN}`}, 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft')
  `);
});

after(async () => {
  await db.delete(placeFacts).where(like(placeFacts.placeRef, `ctt-${RUN}-%`));
  await db.execute(sql`DELETE FROM content_sources WHERE id LIKE ${`ctt-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM job_heartbeats WHERE job_name LIKE ${`census-%-${RUN}`}`);
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, TRIP));
  await db.delete(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.city, CITY));
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${ADMIN})`);
  await pool.end();
});

test("D1 — ruling 9: source_class is the server's stamp; a client 'local' on a traveler item is ignored", async () => {
  const traveler = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Mine", origin: "traveler", sourceClass: "local" } as any);
  const expert = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Expert's", origin: "expert", sourceClass: "public" } as any);
  const unknown = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Unknown", sourceClass: "local" } as any);
  assert.equal(traveler.sourceClass, "public");
  assert.equal(expert.sourceClass, "local");
  assert.equal(unknown.sourceClass, null);
});

test("D2 — ruling 9: an item update cannot set source_class", async () => {
  const item = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Edit me", origin: "traveler" } as any);
  const updated = await storage.updateItineraryItem(item.id, { title: "Edited", sourceClass: "local" } as any);
  assert.equal(updated?.title, "Edited");
  assert.equal(updated?.sourceClass, "public");
});

test("D3 — ruling 9: the client body schema drops source_class", () => {
  const parsed = insertItineraryItemSchema.safeParse({ tripId: TRIP, dayNumber: 1, title: "x", sourceClass: "local" });
  assert.equal(parsed.success, true);
  assert.equal("sourceClass" in (parsed as any).data, false);
});

test("D4 — migration 362 tags team and curated gems, leaves AI gems untagged, and is idempotent", async () => {
  const team = await gem("bf-team", { aiGenerated: false });
  const curated = await gem("bf-curated", { aiGenerated: false, curatedByExpertId: ADMIN });
  const ai = await gem("bf-ai", { aiGenerated: true });
  const file = fs.readFileSync(path.join(process.cwd(), "server/migrations/362_content_tier_backfill.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(file);
    const read = async (gid: string) => (await client.query(
      "SELECT source_class, reuse_class, author_label, verified_by, verified_at FROM travel_pulse_hidden_gems WHERE id = $1", [gid],
    )).rows[0];
    const t = await read(team);
    assert.equal(t.source_class, "local");
    assert.equal(t.reuse_class, "reusable");
    assert.equal(t.author_label, "Traveloure team");
    const c = await read(curated);
    assert.equal(c.source_class, "local");
    assert.equal(c.verified_by, ADMIN);
    assert.equal(c.author_label, null);
    const a = await read(ai);
    assert.equal(a.source_class, null, "an AI-written gem stays untagged until a person verifies it");
    const second = await client.query(
      "UPDATE travel_pulse_hidden_gems SET source_class = 'local' WHERE source_class IS NULL AND id = ANY($1) AND COALESCE(ai_generated,false) = false RETURNING id",
      [[team, curated]],
    );
    assert.equal(second.rowCount, 0, "a second run touches none of the tagged rows");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("D5 — rulings 3 + 8: the draft gem read takes tagged, live rows only", async () => {
  const live = await gem("d-live", { sourceClass: "local", reuseClass: "reusable", gemScore: 90 });
  const untagged = await gem("d-untagged", { gemScore: 95 });
  const expired = await gem("d-expired", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() - 86_400_000), gemScore: 99 });
  const future = await gem("d-future", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() + 86_400_000), gemScore: 80 });
  const ids = (await travelPulseService.getDraftEligibleGems(CITY, 50)).map((g) => g.id);
  assert.ok(ids.includes(live));
  assert.ok(ids.includes(future));
  assert.ok(!ids.includes(untagged), "an untagged gem never reaches a draft");
  assert.ok(!ids.includes(expired), "an expired local gem is hidden at build time");
  assert.ok(await gemRow(expired), "and is not deleted");
  const all = (await travelPulseService.getHiddenGems(CITY, 50)).map((g) => g.id);
  assert.ok(all.includes(untagged), "the public read is unchanged");
});

test("D6 — ruling 3: verification makes the verifier the author; repeat 409; unknown 404", async () => {
  const g = await gem("v-ai", { aiGenerated: true });
  const ok = await verifyGem({ gemId: g, verifierUserId: ADMIN });
  assert.equal(ok.ok, true);
  const row = await gemRow(g);
  assert.equal(row.sourceClass, "local");
  assert.equal(row.verifiedBy, ADMIN);
  assert.ok(row.verifiedAt instanceof Date);
  assert.equal(row.authorLabel, null, "never 'Traveloure team' for machine output");
  const again = await verifyGem({ gemId: g, verifierUserId: ADMIN });
  assert.deepEqual(again, { ok: false, status: 409, message: "This gem is already verified" });
  const missing = await verifyGem({ gemId: id("nope"), verifierUserId: ADMIN });
  assert.equal(missing.ok, false);
  assert.equal((missing as any).status, 404);
  assert.ok((await travelPulseService.getDraftEligibleGems(CITY, 50)).some((x) => x.id === g));
});

test("D7 — place_facts are born tagged from origin + license", async () => {
  const now = new Date();
  const DAY = 86_400_000;
  // CS-1 item 2 (ledger `2026-10-19-cs1-live-facts`): a machine-read fact needs an expiry. Each row states one within its
  // own cap: Places ≤ 30 days (Google's cache limit, `placesCacheMaxDays`), the crawled rows within their source's
  // refresh interval, which this fixture sets on the source row.
  const SOURCE_INTERVAL_DAYS = 14;
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, refresh_interval_days, active)
    VALUES (${id("src")}, 'D7 source', 'https://example.invalid/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', ${SOURCE_INTERVAL_DAYS}, false)`);
  const crawled = { sourceId: id("src"), sourceUrl: "https://example.invalid/hours", expiresAt: new Date(now.getTime() + SOURCE_INTERVAL_DAYS * DAY) };
  const base = { placeRefKind: "free_text", placeLat: null, placeLng: null, market: null, need: "stop.hours", factType: "hours", value: { text: "9-5" }, sourceId: null, sourceUrl: null, fetchedAt: now, expiresAt: null, costCents: 0 };
  // GH-1: the writer refuses a Google hours draft whatever its expiry.
  assert.equal(
    await recordFacts([{ ...base, placeRef: id("f-places-hours"), origin: "places_api", license: "restricted", expiresAt: new Date(now.getTime() + placesCacheMaxDays() * DAY) }] as any, { planId: null, itemId: null }),
    0,
    "a Places hours fact is refused",
  );
  await recordFacts([
    // An obviously fake point (not a real place); the tags are what D7 checks.
    { ...base, placeRef: id("f-places"), origin: "places_api", license: "restricted", factType: "location", value: { lat: 0.001, lng: 0.001 }, expiresAt: new Date(now.getTime() + placesCacheMaxDays() * DAY) },
    { ...base, ...crawled, placeRef: id("f-official"), origin: "crawled", license: "official" },
    { ...base, ...crawled, placeRef: id("f-partner"), origin: "crawled", license: "partner" },
  ] as any, { planId: null, itemId: null });
  assert.ok(placesCacheMaxDays() <= 30, "the Places cap is Google's 30 days at most");
  const rows = await db.select().from(placeFacts).where(inArray(placeFacts.placeRef, [id("f-places"), id("f-places-hours"), id("f-official"), id("f-partner")]));
  assert.equal(rows.some((r) => r.placeRef === id("f-places-hours")), false, "no Places hours row is stored");
  const by = Object.fromEntries(rows.map((r) => [r.placeRef, [r.sourceClass, r.reuseClass]]));
  assert.deepEqual(by[id("f-places")], ["public", "display_in_plan"]);
  assert.deepEqual(by[id("f-official")], ["public", "link_only"]);
  assert.deepEqual(by[id("f-partner")], ["public", "internal"]);
});

test("D8 — ruling 8: the census counts expired local content and changes nothing", async () => {
  const g = await gem("c-expired", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() - 3_600_000) });
  const before = await gemRow(g);
  // The shipped refresh config names `ginkakuji_official` (ledger `2026-10-12-ginkakuji-official-target`);
  // the deploy precondition is its registry row, so the fixture supplies it — and removes only a row it inserted.
  const inserted = await db.execute(sql`
    INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, active)
    VALUES ('ginkakuji_official', 'Ginkaku-ji official site', 'https://www.shokoku-ji.jp/', 'kyoto', 'tavily_extract', ARRAY['stop.hours'], ARRAY[]::text[], 'official', false)
    ON CONFLICT (id) DO NOTHING RETURNING id`);
  let out: Awaited<ReturnType<typeof runContentExpiryCensus>>;
  let http: Awaited<ReturnType<typeof censusHttp>>;
  try {
    out = await runContentExpiryCensus();
    http = await censusHttp(`census-ok-${RUN}`);
  } finally {
    if (inserted.rows.length) await db.execute(sql`DELETE FROM content_sources WHERE id = 'ginkakuji_official'`);
  }
  assert.deepEqual(out.errors, {});
  assert.equal(out.status, "ok");
  assert.deepEqual(out.targetProblems, []);
  assert.ok((out.expiredLocal.travel_pulse_hidden_gems ?? 0) >= 1);
  assert.equal(typeof out.untaggedGems, "number");
  assert.deepEqual(await gemRow(g), before, "nothing is deleted or rewritten");
  assert.equal(http.status, 200);
  assert.equal(http.body.ok, true);
  assert.equal((http.body.result as ContentExpiryShape).status, "ok");
  assert.deepEqual((http.body.result as ContentExpiryShape).errors, {});
  assert.deepEqual((http.body.result as ContentExpiryShape).targetProblems, []);
});

type ContentExpiryShape = Awaited<ReturnType<typeof runContentExpiryCensus>>;

test("D9 — a missing source completes the run: status failed, one line each, HTTP 200, not a 500", async () => {
  const a = id("miss-a");
  const b = id("miss-b");
  const targets = {
    ...hoursTarget(a, `a-${RUN}.example.test`),
    ...hoursTarget(b, `b-${RUN}.example.test`),
  };
  const job = `census-miss-${RUN}`;
  const beforeHb = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, job));
  const out = await runContentExpiryCensus({ targets });
  assert.equal(out.status, "failed");
  assert.deepEqual(out.errors, {});
  assert.deepEqual(out.targetProblems, [missingSourceLine(a), missingSourceLine(b)]);
  assert.equal(typeof out.expiredLocal.travel_pulse_hidden_gems, "number", "the count still finished");
  const http = await censusHttp(job, targets);
  assert.equal(http.status, 200);
  assert.equal(http.body.ok, false);
  assert.equal(http.body.job, job);
  assert.equal(http.body.error, [missingSourceLine(a), missingSourceLine(b)].join("\n"));
  assert.equal(String(http.body.error).split("\n").length, 2);
  const result = http.body.result as ContentExpiryShape;
  assert.equal(result.status, "failed");
  assert.deepEqual(result.targetProblems, out.targetProblems);
  const afterHb = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, job));
  assert.deepEqual(afterHb, beforeHb, "a target-problem run does not stamp a success heartbeat");
});

test("D10 — a valid target is still checked when another source is missing", async () => {
  const valid = id("src-ok");
  const missing = id("src-missing");
  const host = `ok-${RUN}.example.test`;
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, active)
    VALUES (${valid}, 'D10 source', ${`https://${host}/`}, 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', false)`);
  try {
    const targets = { ...hoursTarget(valid, host), ...hoursTarget(missing, `no-${RUN}.example.test`) };
    const out = await runContentExpiryCensus({ targets });
    assert.equal(out.status, "failed");
    assert.deepEqual(out.errors, {});
    assert.deepEqual(out.targetProblems, [missingSourceLine(missing)]);
    assert.equal(out.targetProblems.some((line) => line.includes(valid)), false);
    for (const table of ["travel_pulse_hidden_gems", "local_knowledge_nuggets", "place_facts"]) {
      assert.equal(typeof out.expiredLocal[table], "number", `${table} was counted`);
    }
    assert.equal(typeof out.untaggedGems, "number");
    assert.ok(out.coverage.kyoto, "the coverage pass still ran");
    const http = await censusHttp(`census-mix-${RUN}`, targets);
    assert.equal(http.status, 200);
    assert.equal(http.body.ok, false);
    assert.deepEqual((http.body.result as ContentExpiryShape).targetProblems, [missingSourceLine(missing)]);
  } finally {
    await db.execute(sql`DELETE FROM content_sources WHERE id = ${valid}`);
  }
});

test("D11 — a census read failure is still HTTP 500", async () => {
  const job = `census-read-${RUN}`;
  const http = await runJob(
    job,
    async () => ({
      status: "failed",
      errors: { travel_pulse_hidden_gems: "relation missing" },
      targetProblems: [missingSourceLine("ghost")],
    }),
    contentExpiryCensusCrashed,
    { isReportedFailure: contentExpiryCensusReportedFailure },
  );
  assert.equal(http.status, 500);
  assert.equal(http.body.ok, false);
  assert.equal(http.body.error, `job ${job} reported failure`);
  assert.deepEqual((http.body.result as { targetProblems: string[] }).targetProblems, [missingSourceLine("ghost")]);
});
