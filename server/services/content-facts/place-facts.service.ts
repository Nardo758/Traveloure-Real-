/**
 * place_facts — the ONE writer and the plan readers (content sourcing brief §3/§6/§7; ledger
 * `2026-09-29-a5-draft-open-set`).
 *
 *   · INSERT-ONLY. `recordFacts` is the only writer; there is no UPDATE of a fact's content and no
 *     DELETE path. A newer fact supersedes an older one by the ranker's order, not by rewriting it.
 *   · The engine reads facts in ONE order — `rankFactsByOrigin`, in the upsell engine (the one
 *     ranker). Nothing here sorts facts itself.
 *   · The readers are PLAN-SCOPED: every one takes a trip id, and their only callers sit behind a
 *     plan's own read gate. No public route imports this module (pinned by
 *     server/__tests__/place-facts-public.db.test.ts).
 *   · The free path (brief §7) reads the cache and Places only; `budgetCents` is 0 here.
 */
import crypto from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { contentSources, placeFacts } from "@shared/schema";
import {
  asFactOrigin,
  factProvenanceLine,
  isConfirmableFact,
  isFactStale,
  isPublishable,
  needForItemType,
  type ContentNeed,
  type FactType,
  type FactView,
} from "@shared/content-facts";
import { rankFactsByOrigin } from "../upsell-engine.service";
import { factTtlDays, placesLookupsPerDraft } from "../../config/content-facts.config";
import type { FactDraft, SourceAdapter } from "./source-adapter";
import { sourcesForNeed } from "./places-adapter";
import { matchNamesItem, namedPlaceTokens, placeLookupText } from "@shared/place-name-gate";
import { mayFetchFresh, resolveFreshFetchBudget, type FreshFetchContext } from "./fresh-fetch";
import { TavilyExtractAdapter, type TavilyExtractDeps } from "./tavily-extract-adapter";
import { getTavilyClient } from "../tavily-client";
import { claudeService } from "../claude.service";
import { assertRobotsAllowed } from "../../utils/robots-txt";
import { ROBOTS_TXT_USER_AGENT_TOKEN } from "../../config/robots-txt.config";
import { loadPartnerHosts } from "../partner-hosts.service";

export async function recordFacts(drafts: FactDraft[], ctx: { planId: string | null; itemId: string | null }): Promise<number> {
  if (!drafts.length) return 0;
  await db.insert(placeFacts).values(
    drafts.map((d) => ({
      id: crypto.randomUUID(),
      placeRefKind: d.placeRefKind,
      placeRef: d.placeRef,
      placeLat: d.placeLat === null ? null : String(d.placeLat),
      placeLng: d.placeLng === null ? null : String(d.placeLng),
      market: d.market,
      need: d.need,
      factType: d.factType,
      value: d.value,
      origin: d.origin,
      sourceId: d.sourceId,
      sourceUrl: d.sourceUrl,
      license: d.license,
      fetchedAt: d.fetchedAt,
      expiresAt: d.expiresAt,
      costCents: String(d.costCents),
      planId: ctx.planId,
      itineraryItemId: ctx.itemId,
    })),
  );
  return drafts.length;
}

type FactRow = typeof placeFacts.$inferSelect;

/**
 * An unexpired Places answer to the SAME query, from any plan: reused for this item at zero cost,
 * keeping the ORIGINAL `fetched_at` and `expires_at`, so a copy never extends Google's 30-day window.
 */
async function cachedForQuery(query: string): Promise<FactDraft[] | null> {
  const [hit] = await db
    .select({ placeRef: placeFacts.placeRef })
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.origin, "places_api"),
        eq(placeFacts.factType, "location"),
        sql`${placeFacts.value}->>'query' = ${query}`,
        sql`${placeFacts.expiresAt} > now()`,
        isNull(placeFacts.supersededBy),
      ),
    )
    .limit(1);
  if (!hit) return null;
  const rows = await db
    .select()
    .from(placeFacts)
    .where(and(eq(placeFacts.placeRefKind, "place_id"), eq(placeFacts.placeRef, hit.placeRef), sql`${placeFacts.expiresAt} > now()`));
  const seen = new Set<string>();
  const out: FactDraft[] = [];
  for (const r of rankFactsByOrigin(rows)) {
    if (seen.has(r.factType)) continue;
    seen.add(r.factType);
    out.push({
      placeRefKind: "place_id",
      placeRef: r.placeRef,
      placeLat: r.placeLat === null ? null : Number(r.placeLat),
      placeLng: r.placeLng === null ? null : Number(r.placeLng),
      market: r.market,
      need: r.need as ContentNeed,
      factType: r.factType as FactType,
      value: r.value as Record<string, unknown>,
      origin: "places_api",
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      license: "restricted",
      fetchedAt: r.fetchedAt,
      expiresAt: r.expiresAt,
      costCents: 0,
    });
  }
  return out.length ? out : null;
}

export interface EnrichItem {
  id: string;
  title: string;
  type: string | null;
  /** The plan day the item sits on; absent ⇒ day 1 (the budget is shared across days, never by order). */
  dayNumber?: number | null;
  locationName?: string | null;
}

/**
 * Pure. Which items are looked up, in what order (ledger `2026-09-30-places-named-gate`):
 *   · only items that NAME a place (`namedPlaceTokens` non-empty) — a generic "Lunch at Traditional
 *     Restaurant" is never looked up;
 *   · round-robin ACROSS DAYS — every day's first named item, then every day's second, … — so the
 *     per-draft budget reaches the last day instead of being spent on the first two in plan order
 *     (production smoke test 3: 11/11 items with hours on days 1–2, 0/19 on days 3–5).
 */
export function lookupOrder(items: readonly EnrichItem[], city: string | null): Array<{ item: EnrichItem; tokens: Set<string> }> {
  const byDay = new Map<number, Array<{ item: EnrichItem; tokens: Set<string> }>>();
  for (const item of items) {
    const tokens = namedPlaceTokens(item, city);
    if (tokens.size === 0) continue;
    const day = item.dayNumber ?? 1;
    const list = byDay.get(day) ?? [];
    list.push({ item, tokens });
    byDay.set(day, list);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const out: Array<{ item: EnrichItem; tokens: Set<string> }> = [];
  for (let round = 0; ; round++) {
    let any = false;
    for (const d of days) {
      const e = byDay.get(d)![round];
      if (e) { out.push(e); any = true; }
    }
    if (!any) return out;
  }
}

/** Pure. The drafts of ONE Places answer, only when its matched name names the item; else none. */
export function attachableDrafts(drafts: FactDraft[], tokens: ReadonlySet<string>, city: string | null): FactDraft[] {
  const loc = drafts.find((d) => d.factType === "location");
  const name = loc && typeof loc.value?.name === "string" ? (loc.value.name as string) : null;
  return matchNamesItem(name, tokens, city) ? drafts : [];
}

/**
 * ONE info line per lookup ATTEMPT (decision-maker, Sep 30, 2026 — the spine logged failures only):
 * the place id, cache hit or miss, and latency. No query text and no plan id, so the log carries no
 * traveler content. A lookup that found no place logs `place_id=none`.
 *
 * SMOKE 4 (P1, ledger `2026-10-02-smoke4-draft-fixes`): the line now also carries the item's DAY and
 * its OUTCOME — `attached` (facts recorded), `unmatched` (a place came back but did not name the
 * item, so nothing was attached) or `none` (no place came back). Before this, an answer rejected by
 * the name gate logged as `lookup ok`, and an item skipped (unnamed, past the cap, no adapter) logged
 * nothing, so a day with no hours could not be told "never attempted" from "attempted and missed".
 * Skips now log one `skipped` line each with their reason.
 */
function logLookup(
  drafts: readonly FactDraft[],
  cache: "hit" | "miss",
  startedMs: number,
  day: number,
  outcome: "attached" | "unmatched" | "none",
): void {
  const placeId = drafts.find((d) => d.placeRefKind === "place_id")?.placeRef ?? "none";
  console.info(
    `[place-facts] lookup day=${day} outcome=${outcome} place_id=${placeId} cache=${cache} latency_ms=${Date.now() - startedMs}`,
  );
}

function logSkipped(day: number, reason: "unnamed" | "cap" | "no_adapter"): void {
  console.info(`[place-facts] skipped day=${day} reason=${reason}`);
}

function outcomeOf(drafts: readonly FactDraft[], kept: readonly FactDraft[]): "attached" | "unmatched" | "none" {
  return kept.length ? "attached" : drafts.length ? "unmatched" : "none";
}

/**
 * After a free draft commits: look up each drafted stop's facts (hours, dining basics, coordinates)
 * — cache first, then the Places spine. NEVER throws and never blocks the draft (§15b): a failed
 * lookup is logged and that item simply has no facts.
 *
 * THE CAP is `placesLookupsPerDraft()` — a COST cap, so it counts BILLED lookups only (a cache reuse
 * costs nothing and no longer spends it), and it is spent in `lookupOrder` (named places only, across
 * all days). A Places answer whose matched name is not in the item is dropped (`attachableDrafts`):
 * the call was spent, and nothing is recorded, because nothing true about THIS item came back (§13).
 */
export async function enrichPlanItems(input: {
  tripId: string;
  market: string | null;
  city: string | null;
  items: EnrichItem[];
  adapters?: SourceAdapter[];
}): Promise<{ looked: number; cached: number; recorded: number; unnamed: number; unmatched: number }> {
  const summary = { looked: 0, cached: 0, recorded: 0, unnamed: 0, unmatched: 0 };
  try {
    const cap = placesLookupsPerDraft();
    const order = lookupOrder(input.items, input.city);
    summary.unnamed = input.items.length - order.length;
    const ordered = new Set(order.map((o) => o.item));
    for (const it of input.items) if (!ordered.has(it)) logSkipped(it.dayNumber ?? 1, "unnamed");
    for (const { item, tokens } of order) {
      const day = item.dayNumber ?? 1;
      if (summary.looked >= cap) {
        logSkipped(day, "cap");
        continue;
      }
      const need = needForItemType(item.type);
      const adapters = sourcesForNeed(need, input.market, input.adapters);
      if (!adapters.length) {
        logSkipped(day, "no_adapter");
        continue;
      }
      // P2 (smoke 4): the visited place only — a two-place "A Alternative: B" title searched whole
      // returns A's facts for a visit to B.
      const lookupText = placeLookupText(item.title);
      const query = [lookupText, input.city].filter(Boolean).join(", ").slice(0, 300);
      try {
        const started = Date.now();
        const cached = await cachedForQuery(query);
        if (cached) {
          summary.cached += 1;
          const kept = attachableDrafts(cached, tokens, input.city);
          if (!kept.length) summary.unmatched += 1;
          summary.recorded += await recordFacts(kept, { planId: input.tripId, itemId: item.id });
          logLookup(cached, "hit", started, day, outcomeOf(cached, kept));
          continue;
        }
        summary.looked += 1;
        const drafts = await adapters[0].fetch({ need, market: input.market, query: { text: lookupText, city: input.city }, budgetCents: 0 });
        const kept = attachableDrafts(drafts, tokens, input.city);
        if (drafts.length && !kept.length) summary.unmatched += 1;
        summary.recorded += await recordFacts(kept, { planId: input.tripId, itemId: item.id });
        logLookup(drafts, "miss", started, day, outcomeOf(drafts, kept));
      } catch (err) {
        console.error("[place-facts] lookup failed for an item:", (err as Error)?.message ?? err);
      }
    }
  } catch (err) {
    console.error("[place-facts] enrichment failed:", (err as Error)?.message ?? err);
  }
  return summary;
}

async function rowsForTrip(tripId: string, itemIds?: string[]): Promise<FactRow[]> {
  return db
    .select()
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.planId, tripId),
        isNull(placeFacts.supersededBy),
        itemIds ? inArray(placeFacts.itineraryItemId, itemIds.length ? itemIds : ["__none__"]) : sql`true`,
      ),
    );
}

/** The registry fields `isPublishable`'s official-source path reads (ruling R-p), keyed by source id. */
type SourceFacts = { name: string; licenseClass: string; publicOk: boolean | null };
async function sourcesFor(rows: FactRow[]): Promise<Map<string, SourceFacts>> {
  const ids = Array.from(new Set(rows.map((r) => r.sourceId).filter((x): x is string => !!x)));
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: contentSources.id, name: contentSources.name, licenseClass: contentSources.licenseClass, publicOk: contentSources.publicOk })
    .from(contentSources)
    .where(inArray(contentSources.id, ids));
  return new Map(found.map((s) => [s.id, { name: s.name, licenseClass: s.licenseClass, publicOk: s.publicOk }]));
}

function toView(r: FactRow, now: Date, sources: Map<string, SourceFacts> = new Map()): FactView | null {
  const origin = asFactOrigin(r.origin);
  if (!origin) return null;
  const src = r.sourceId ? sources.get(r.sourceId) : undefined;
  const f = {
    origin,
    license: r.license,
    verifiedAt: r.verifiedAt,
    fetchedAt: r.fetchedAt,
    expiresAt: r.expiresAt,
    factType: r.factType,
    sourceLicenseClass: src?.licenseClass ?? null,
    sourcePublicOk: src?.publicOk ?? null,
  };
  return {
    id: r.id,
    confirmable: isConfirmableFact({ origin, license: r.license, verifiedAt: r.verifiedAt }),
    factType: r.factType as FactType,
    need: r.need as ContentNeed,
    value: r.value as Record<string, unknown>,
    origin,
    sourceUrl: r.sourceUrl ?? null,
    provenance: factProvenanceLine(f, now),
    stale: isFactStale(f, now),
    publishable: isPublishable(f),
  };
}

/**
 * The plan's facts per item: the FIRST fact of each type in the engine's order. Plan-scoped — the
 * caller has already authorized the viewer for this plan. Every view carries its provenance line.
 */
export async function factsForTrip(tripId: string, now: Date = new Date()): Promise<Record<string, FactView[]>> {
  const rows = await rowsForTrip(tripId);
  const sources = await sourcesFor(rows);
  const byItem = new Map<string, FactRow[]>();
  for (const r of rows) {
    if (!r.itineraryItemId) continue;
    const list = byItem.get(r.itineraryItemId) ?? [];
    list.push(r);
    byItem.set(r.itineraryItemId, list);
  }
  const out: Record<string, FactView[]> = {};
  byItem.forEach((list, itemId) => {
    const seen = new Set<string>();
    const views: FactView[] = [];
    for (const r of rankFactsByOrigin(list, now)) {
      if (seen.has(r.factType)) continue;
      const v = toView(r, now, sources);
      if (!v) continue;
      seen.add(r.factType);
      views.push(v);
    }
    if (views.length) out[itemId] = views;
  });
  return out;
}

/**
 * Coordinates a plan's items have ONLY as facts (the item row carries none): the first `location`
 * fact per item, unexpired. Plan-fit reads these so a drafted plan's stops count as located; a Places
 * coordinate is never copied onto the item row, where it would outlive Google's 30-day cache.
 */
export async function factPointsForTrip(tripId: string, now: Date = new Date()): Promise<Map<string, { lat: number; lng: number }>> {
  const rows = (await rowsForTrip(tripId)).filter((r) => r.factType === "location" && !isFactStale(r, now));
  const byItem = new Map<string, FactRow[]>();
  for (const r of rows) {
    if (!r.itineraryItemId) continue;
    byItem.set(r.itineraryItemId, [...(byItem.get(r.itineraryItemId) ?? []), r]);
  }
  const out = new Map<string, { lat: number; lng: number }>();
  byItem.forEach((list, itemId) => {
    const first = rankFactsByOrigin(list, now)[0];
    const lat = Number((first?.value as any)?.lat);
    const lng = Number((first?.value as any)?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.set(itemId, { lat, lng });
  });
  return out;
}

/**
 * A6 (3) — ONE fresh lookup for ONE plan item through the registry (ledger
 * `2026-10-01-a6-tavily-extract`). The basis is `mayFetchFresh(ctx)`: the free draft gets NO budget
 * and never reaches here with one. The first ACTIVE `tavily_extract` row that covers the item's
 * need in the plan's market is used — one source per call — and its facts go through the ONE writer.
 * Never throws for a refused or empty lookup; it says why.
 */
export async function fetchFreshFactsForItem(input: {
  ctx: FreshFetchContext;
  tripId: string;
  item: { id: string; title: string; type: string | null };
  market: string | null;
  city: string | null;
  deps?: Partial<TavilyExtractDeps>;
}): Promise<{ recorded: number; outcome: string; sourceId: string | null; refused: { factType: string; reason: string }[] }> {
  const basis = mayFetchFresh(input.ctx);
  if (!basis) return { recorded: 0, outcome: "not_paid_or_expert", sourceId: null, refused: [] };
  const need = needForItemType(input.item.type);
  const rows = await db
    .select()
    .from(contentSources)
    .where(and(eq(contentSources.active, true), eq(contentSources.adapter, "tavily_extract")))
    .orderBy(contentSources.id);
  const deps: TavilyExtractDeps = { ...defaultTavilyExtractDeps(), ...(input.deps ?? {}) };
  const actorId = input.ctx.kind === "expert_action" ? input.ctx.expertUserId : input.ctx.kind === "paid_run" ? input.ctx.actorId : null;
  const runId = input.ctx.kind === "paid_run" ? input.ctx.runId : null;
  const source = rows.find((r) => new TavilyExtractAdapter(r, deps).covers(need, input.market));
  if (!source) return { recorded: 0, outcome: "no_source_for_need", sourceId: null, refused: [] };
  const budget = await resolveFreshFetchBudget(input.ctx, source);
  if (!budget.basis) return { recorded: 0, outcome: budget.reason, sourceId: source.id, refused: [] };
  const adapter = new TavilyExtractAdapter(source, deps, { tripId: input.tripId, itemId: input.item.id, basis, actorId, runId });
  const drafts = await adapter.fetch({
    need,
    market: input.market,
    query: { text: input.item.title, city: input.city },
    budgetCents: budget.budgetCents,
  });
  const recorded = await recordFacts(drafts, { planId: input.tripId, itemId: input.item.id });
  return { recorded, outcome: adapter.lastOutcome ?? "no_facts", sourceId: source.id, refused: adapter.lastRefused };
}

function defaultTavilyExtractDeps(): TavilyExtractDeps {
  return {
    client: (usage) => getTavilyClient({ usage }),
    complete: (opts) => claudeService.completeJson(opts),
    robots: (url) => assertRobotsAllowed(url, ROBOTS_TXT_USER_AGENT_TOKEN),
    partnerHosts: () => loadPartnerHosts(),
  };
}

export class FactConfirmError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

/**
 * A6 (4) — an expert CONFIRMS a crawled fact (ledger `2026-10-01-a6-expert-confirm`; brief §8). Insert-
 * only, as the table requires: a NEW row is written with origin `expert_nugget`, `verified_by` = the
 * expert, `verified_at = now()`, the fact's statement as the expert's word (`value.text`) and a
 * pointer back to what it confirmed — the source page's verbatim quote is NOT carried into the nugget,
 * because a verified nugget is publishable and the quote is the page's text, not the expert's. The
 * confirmed row then points at its successor through ONE atomic conditional
 * (`superseded_by IS NULL`), so a second confirm — concurrent or repeated — is refused, never doubled.
 * The caller has verified the expert is a §12 write-status advisor on this plan and passes the
 * byline gate for its market.
 */
export async function confirmFactAsNugget(input: { tripId: string; factId: string; expertId: string }): Promise<{ nuggetId: string }> {
  return db.transaction(async (tx) => {
    const [fact] = await tx
      .select()
      .from(placeFacts)
      .where(and(eq(placeFacts.id, input.factId), eq(placeFacts.planId, input.tripId)));
    if (!fact) throw new FactConfirmError("not_found", 404);
    if (fact.supersededBy) throw new FactConfirmError("already_superseded", 409);
    if (!isConfirmableFact({ origin: fact.origin, license: fact.license, verifiedAt: fact.verifiedAt })) {
      throw new FactConfirmError("not_confirmable", 409);
    }
    const text = typeof (fact.value as any)?.text === "string" ? String((fact.value as any).text).trim() : "";
    if (!text) throw new FactConfirmError("no_statement", 409);
    const now = new Date();
    const ttl = factTtlDays(fact.factType as FactType);
    const nuggetId = crypto.randomUUID();
    await tx.insert(placeFacts).values({
      id: nuggetId,
      placeRefKind: fact.placeRefKind,
      placeRef: fact.placeRef,
      placeLat: fact.placeLat,
      placeLng: fact.placeLng,
      market: fact.market,
      need: fact.need,
      factType: fact.factType,
      value: { text, confirmedFromFactId: fact.id },
      origin: "expert_nugget",
      sourceId: null,
      sourceUrl: null,
      license: null,
      verifiedBy: input.expertId,
      verifiedAt: now,
      fetchedAt: now,
      expiresAt: ttl == null ? null : new Date(now.getTime() + ttl * 86_400_000),
      costCents: "0",
      planId: fact.planId,
      itineraryItemId: fact.itineraryItemId,
    });
    const claimed = await tx
      .update(placeFacts)
      .set({ supersededBy: nuggetId })
      .where(and(eq(placeFacts.id, fact.id), isNull(placeFacts.supersededBy)))
      .returning({ id: placeFacts.id });
    if (!claimed.length) throw new FactConfirmError("already_superseded", 409);
    return { nuggetId };
  });
}
