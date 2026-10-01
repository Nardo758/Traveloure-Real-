/**
 * A6 (3) — TavilyExtractAdapter behind `mayFetchFresh` (ledger `2026-10-01-a6-tavily-extract`;
 * a6-design decision 3A; brief §6/§7). Fake Tavily client and fake model — no network.
 *
 *   T1  mayFetchFresh: the free draft (and anything unverified) has NO basis; paid run / expert action do
 *   T2  the budget is what is left of the plan, day and source caps; an unreadable meter is SPENT (fail closed)
 *   T3  THE FREE PATH CANNOT CALL IT: budget 0 ⇒ no client is even built; the free draft's enrichment,
 *       handed this adapter, makes zero Tavily calls; the free draft route never names the fresh rail
 *   T4  the 300-char quote cap and the verbatim rule: a long quote, an off-page quote and a type the
 *       need cannot hold are each refused by name — never trimmed
 *   T5  only the row's own host: off-host and resale results are skipped, and a robots refusal stops
 *       the extract
 *   T6  an expert action records crawled facts with source, URL, license and the lookup cost on ONE row
 *   T7  a plan already at its cap is refused before any call, with the reason named
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { like, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { contentSources } from "@shared/schema";
import { freshFetchBudget, mayFetchFresh } from "../services/content-facts/fresh-fetch";
import {
  TavilyExtractAdapter,
  admitExtractedFacts,
  tavilyLookupCostCents,
  type TavilyExtractDeps,
} from "../services/content-facts/tavily-extract-adapter";
import { enrichPlanItems, fetchFreshFactsForItem } from "../services/content-facts/place-facts.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `a6t-${RUN}-${s}`;
const SRC = `a6t_${RUN}_kyoto_city`;
const ids = { owner: id("owner"), expert: id("expert"), trip: id("trip"), trip2: id("trip2"), item: id("item"), item2: id("item2") };
const PAGE = "Kinkaku-ji opening hours: 9:00 to 17:00 every day. Admission 500 yen for adults.";

const row = {
  id: SRC, name: "Kyoto City Official", homepage: "https://kyoto.travel/", market: "kyoto", adapter: "tavily_extract",
  covers: ["stop.hours", "stop.ticketing"], doesNotCover: [] as string[], licenseClass: "official", active: true,
};

function fakeDeps(over: Partial<{ results: string[]; robotsThrows: boolean; facts: unknown[] }> = {}) {
  const calls = { built: 0, search: 0, extract: 0, model: 0, usage: [] as any[] };
  const deps: TavilyExtractDeps = {
    client: (usage) => {
      calls.built += 1;
      calls.usage.push(usage);
      return {
        search: (async () => { calls.search += 1; return { results: (over.results ?? ["https://kyoto.travel/kinkakuji"]).map((url) => ({ url })) }; }) as any,
        extract: (async () => { calls.extract += 1; return { results: [{ rawContent: PAGE }] }; }) as any,
      };
    },
    complete: async () => {
      calls.model += 1;
      return { result: { facts: over.facts ?? [{ factType: "hours", text: "Open 9:00–17:00 daily.", quote: "9:00 to 17:00 every day" }] } };
    },
    robots: async () => { if (over.robotsThrows) throw new Error("disallowed"); },
    partnerHosts: async () => ["klook.com"],
  };
  return { deps, calls };
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES
    (${ids.owner}, ${`${ids.owner}@t.test`}, 'A6', 'Owner', 'traveler'),
    (${ids.expert}, ${`${ids.expert}@t.test`}, 'A6', 'Expert', 'expert')`);
  for (const [t, it] of [[ids.trip, ids.item], [ids.trip2, ids.item2]]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
      VALUES (${t}, ${ids.owner}, 'A6 plan', 'Kyoto, Japan', '2027-05-03', '2027-05-06', 'draft', 'vacation')`);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
      VALUES (${it}, ${t}, 1, 'Kinkaku-ji', 'attraction', 'ai')`);
  }
  await db.insert(contentSources).values({ ...row, termsCheckedAt: new Date(), termsCheckedBy: ids.owner });
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${ids.trip}, ${ids.trip2})`);
  await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'tripId' IN (${ids.trip}, ${ids.trip2})`);
  await db.delete(contentSources).where(like(contentSources.id, `a6t_${RUN}_%`));
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.trip2})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`);
  await pool.end();
});

test("T1: only a paid run or an expert action has a basis", () => {
  assert.equal(mayFetchFresh({ kind: "free_draft", tripId: ids.trip }), null);
  assert.equal(mayFetchFresh(null), null);
  assert.equal(mayFetchFresh({ kind: "paid_run", tripId: ids.trip, runId: "run-1", actorId: null }), "paid_run");
  assert.equal(mayFetchFresh({ kind: "paid_run", tripId: ids.trip, runId: "", actorId: null }), null);
  assert.equal(mayFetchFresh({ kind: "expert_action", tripId: ids.trip, expertUserId: ids.expert }), "expert_action");
  assert.equal(mayFetchFresh({ kind: "expert_action", tripId: ids.trip, expertUserId: "" }), null);
});

test("T2: caps — plan, day, source, and a fail-closed meter", () => {
  const ctx = { kind: "expert_action" as const, tripId: ids.trip, expertUserId: ids.expert };
  const caps = { planCents: 25, dayCents: 300, sourceDayCents: 100 };
  assert.deepEqual(freshFetchBudget(ctx, { planCents: 5, dayCents: 10, sourceDayCents: 90 }, caps), { basis: "expert_action", budgetCents: 10 });
  assert.equal((freshFetchBudget(ctx, { planCents: 25, dayCents: 0, sourceDayCents: 0 }, caps) as any).reason, "plan_cap_reached");
  assert.equal((freshFetchBudget(ctx, { planCents: 0, dayCents: 300, sourceDayCents: 0 }, caps) as any).reason, "day_cap_reached");
  assert.equal((freshFetchBudget(ctx, { planCents: 0, dayCents: 0, sourceDayCents: 100 }, caps) as any).reason, "source_cap_reached");
  assert.equal((freshFetchBudget(ctx, { planCents: null, dayCents: 0, sourceDayCents: 0 }, caps) as any).reason, "meter_unreadable");
  assert.equal((freshFetchBudget({ kind: "free_draft" }, { planCents: 0, dayCents: 0, sourceDayCents: 0 }, caps) as any).reason, "not_paid_or_expert");
});

test("T3: the free path cannot call Tavily", async () => {
  const { deps, calls } = fakeDeps();
  const adapter = new TavilyExtractAdapter(row, deps);
  const none = await adapter.fetch({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: 0 });
  assert.deepEqual(none, []);
  assert.equal(adapter.lastOutcome, "refused_budget");
  const below = await adapter.fetch({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: tavilyLookupCostCents() / 2 });
  assert.deepEqual(below, []);
  // The free draft's enrichment, handed this adapter as its only source, passes budget 0.
  await enrichPlanItems({ tripId: ids.trip, market: "kyoto", city: "Kyoto", items: [{ id: ids.item, title: "Kinkaku-ji", type: "attraction" } as any], adapters: [adapter] });
  assert.equal(calls.built, 0, "no Tavily client was ever built");
  assert.equal(calls.search + calls.extract + calls.model, 0);
  // fetchFreshFactsForItem with a free-draft context returns before reading the registry.
  const free = await fetchFreshFactsForItem({ ctx: { kind: "free_draft", tripId: ids.trip }, tripId: ids.trip, item: { id: ids.item, title: "Kinkaku-ji", type: "attraction" }, market: "kyoto", city: "Kyoto", deps });
  assert.equal(free.outcome, "not_paid_or_expert");
  assert.equal(calls.built, 0);
  // The free draft route never names the fresh rail.
  const routes = fs.readFileSync(path.join(process.cwd(), "server/routes/content.routes.ts"), "utf8");
  assert.equal(/fetchFreshFactsForItem|TavilyExtractAdapter|mayFetchFresh|resolveFreshFetchBudget/.test(routes), false);
});

test("T4: quotes are capped at 300 characters and must be on the page", () => {
  const page = `Hours: 9 to 5. ${"x".repeat(400)}`;
  const r = admitExtractedFacts(
    { facts: [
      { factType: "hours", text: "Open 9 to 5.", quote: "Hours: 9 to 5." },
      { factType: "hours", text: "Long.", quote: "x".repeat(301) },
      { factType: "hours", text: "Invented.", quote: "Open around the clock" },
      { factType: "event", text: "Wrong type.", quote: "Hours: 9 to 5." },
    ] },
    { allowed: ["hours", "closure"], page, quoteMax: 300 },
  );
  assert.deepEqual(r.facts.map((f) => f.quote), ["Hours: 9 to 5."]);
  assert.deepEqual(r.refused.map((x) => x.reason), ["quote_too_long", "quote_not_on_page", "type_not_for_need"]);
});

test("T5: only the row's own host, never resale; robots stops the extract", async () => {
  const off = fakeDeps({ results: ["https://klook.com/kinkakuji", "https://stubhub.com/x", "https://elsewhere.org/a"] });
  const a1 = new TavilyExtractAdapter(row, off.deps);
  assert.deepEqual(await a1.fetch({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: 10 }), []);
  assert.equal(a1.lastOutcome, "no_result_on_host");
  assert.equal(off.calls.extract, 0);
  const robots = fakeDeps({ robotsThrows: true });
  const a2 = new TavilyExtractAdapter(row, robots.deps);
  assert.deepEqual(await a2.fetch({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: 10 }), []);
  assert.equal(a2.lastOutcome, "robots_disallowed");
  assert.equal(robots.calls.extract, 0);
});

test("T6: an expert action records crawled facts with cost on one row", async () => {
  const { deps, calls } = fakeDeps();
  const r = await fetchFreshFactsForItem({
    ctx: { kind: "expert_action", tripId: ids.trip, expertUserId: ids.expert },
    tripId: ids.trip, item: { id: ids.item, title: "Kinkaku-ji", type: "attraction" }, market: "kyoto", city: "Kyoto", deps,
  });
  assert.equal(r.outcome, "facts");
  assert.equal(r.recorded, 1);
  assert.equal(r.sourceId, SRC);
  assert.equal(calls.usage[0].metadata.purpose, "content_facts");
  assert.equal(calls.usage[0].metadata.tripId, ids.trip);
  assert.equal(calls.usage[0].metadata.basis, "expert_action");
  assert.equal(calls.usage[0].userId, ids.expert);
  const rows: any = await db.execute(sql`SELECT origin, source_id, source_url, license, cost_cents, value FROM place_facts WHERE plan_id = ${ids.trip}`);
  const facts = rows.rows ?? rows;
  assert.equal(facts.length, 1);
  assert.equal(facts[0].origin, "crawled");
  assert.equal(facts[0].source_id, SRC);
  assert.equal(facts[0].source_url, "https://kyoto.travel/kinkakuji");
  assert.equal(facts[0].license, "official");
  assert.equal(Number(facts[0].cost_cents), tavilyLookupCostCents());
  assert.equal(facts[0].value.quote, "9:00 to 17:00 every day");
});

test("T7: a plan at its cap is refused before any call", async () => {
  await db.execute(sql`INSERT INTO api_usage_logs (id, provider, endpoint, operation, estimated_cost_cents, cost_per_call_cents, metadata)
    VALUES (${id("usage")}, 'tavily', 'extract', 'tavily_extract', 100000, 160, ${JSON.stringify({ purpose: "content_facts", tripId: ids.trip2, sourceId: SRC })}::jsonb)`);
  const { deps, calls } = fakeDeps();
  const r = await fetchFreshFactsForItem({
    ctx: { kind: "expert_action", tripId: ids.trip2, expertUserId: ids.expert },
    tripId: ids.trip2, item: { id: ids.item2, title: "Kinkaku-ji", type: "attraction" }, market: "kyoto", city: "Kyoto", deps,
  });
  assert.equal(r.outcome, "plan_cap_reached");
  assert.equal(calls.built, 0);
});
