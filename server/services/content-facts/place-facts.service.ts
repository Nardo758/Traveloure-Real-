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
import { placeFacts } from "@shared/schema";
import {
  asFactOrigin,
  factProvenanceLine,
  isFactStale,
  isPublishable,
  needForItemType,
  type ContentNeed,
  type FactType,
  type FactView,
} from "@shared/content-facts";
import { rankFactsByOrigin } from "../upsell-engine.service";
import { placesLookupsPerDraft } from "../../config/content-facts.config";
import type { FactDraft, SourceAdapter } from "./source-adapter";
import { sourcesForNeed } from "./places-adapter";
import { matchNamesItem, namedPlaceTokens } from "@shared/place-name-gate";

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
 * ONE info line per successful lookup (decision-maker, Sep 30, 2026 — the spine logged failures
 * only): the place id, cache hit or miss, and latency. No query text and no plan id, so the log
 * carries no traveler content. A lookup that found no place logs `place_id=none`.
 */
function logLookup(drafts: readonly FactDraft[], cache: "hit" | "miss", startedMs: number): void {
  const placeId = drafts.find((d) => d.placeRefKind === "place_id")?.placeRef ?? "none";
  console.info(`[place-facts] lookup ok place_id=${placeId} cache=${cache} latency_ms=${Date.now() - startedMs}`);
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
    for (const { item, tokens } of order) {
      if (summary.looked >= cap) break;
      const need = needForItemType(item.type);
      const adapters = sourcesForNeed(need, input.market, input.adapters);
      if (!adapters.length) continue;
      const query = [item.title, input.city].filter(Boolean).join(", ").slice(0, 300);
      try {
        const started = Date.now();
        const cached = await cachedForQuery(query);
        if (cached) {
          summary.cached += 1;
          const kept = attachableDrafts(cached, tokens, input.city);
          if (!kept.length) summary.unmatched += 1;
          summary.recorded += await recordFacts(kept, { planId: input.tripId, itemId: item.id });
          logLookup(cached, "hit", started);
          continue;
        }
        summary.looked += 1;
        const drafts = await adapters[0].fetch({ need, market: input.market, query: { text: item.title, city: input.city }, budgetCents: 0 });
        const kept = attachableDrafts(drafts, tokens, input.city);
        if (drafts.length && !kept.length) summary.unmatched += 1;
        summary.recorded += await recordFacts(kept, { planId: input.tripId, itemId: item.id });
        logLookup(drafts, "miss", started);
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

function toView(r: FactRow, now: Date): FactView | null {
  const origin = asFactOrigin(r.origin);
  if (!origin) return null;
  const f = { origin, license: r.license, verifiedAt: r.verifiedAt, fetchedAt: r.fetchedAt, expiresAt: r.expiresAt };
  return {
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
      const v = toView(r, now);
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
