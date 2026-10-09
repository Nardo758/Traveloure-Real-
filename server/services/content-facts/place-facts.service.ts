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
import { canonicalAreaLine } from "@shared/place-address";
import crypto from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { contentSources, itineraryItems, placeFacts } from "@shared/schema";
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
import { PlacesAdapter, sourcesForNeed } from "./places-adapter";
import { LookupScheduler } from "./lookup-scheduler.pure";
import { gatedMapsCall } from "../maps-billing/maps-billing.service";
import { LookupProgress } from "./lookup-progress";
import { pendingLookupItemIds } from "./lookup-progress.pure";
import { isPointOfInterest, matchNamesItem, namedPlaceTokens, placeLookupText, titleNamesAnArea } from "@shared/place-name-gate";
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
 * R-u (surface step 3): a place ID an earlier answer to this SAME query text already resolved — a
 * free shortcut to the ID (no API call at all). Never the cache key itself: the key is the ID.
 */
export async function knownPlaceIdForQuery(query: string): Promise<string | null> {
  const [hit] = await db
    .select({ placeRef: placeFacts.placeRef })
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.origin, "places_api"),
        eq(placeFacts.placeRefKind, "place_id"),
        eq(placeFacts.factType, "location"),
        sql`${placeFacts.value}->>'query' = ${query}`,
        sql`${placeFacts.expiresAt} > now()`,
        isNull(placeFacts.supersededBy),
      ),
    )
    .limit(1);
  return hit?.placeRef ?? null;
}

/**
 * R-u: THE CACHE, KEYED BY PLACE ID. Every unexpired Places fact for this place, from ANY plan,
 * reused at zero cost and keeping its ORIGINAL `fetched_at` and `expires_at` — so a copy never
 * extends Google's 30-day window and every plan shows the fetch's own checkedAt.
 */
async function cachedForPlaceId(placeId: string): Promise<FactDraft[] | null> {
  return cachedRowsForPlace(placeId);
}

async function cachedRowsForPlace(placeId: string): Promise<FactDraft[] | null> {
  if (!placeId) return null;
  const hit = { placeRef: placeId };
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
  /** R-u: the item's own stored Google place ID, when it has one — the cache key with no lookup. */
  googlePlaceId?: string | null;
  locationName?: string | null;
}

/** Pure. The named items, grouped by plan day (absent day ⇒ day 1), in plan order within a day. */
function namedByDay(items: readonly EnrichItem[], city: string | null): Map<number, Array<{ item: EnrichItem; tokens: Set<string> }>> {
  const byDay = new Map<number, Array<{ item: EnrichItem; tokens: Set<string> }>>();
  for (const item of items) {
    const tokens = namedPlaceTokens(item, city);
    if (tokens.size === 0) continue;
    // Smoke 7: a title naming an area ("… District", "… Photo Stop", "… Walk") is never looked up.
    if (titleNamesAnArea(item.title)) continue;
    const day = item.dayNumber ?? 1;
    const list = byDay.get(day) ?? [];
    list.push({ item, tokens });
    byDay.set(day, list);
  }
  return byDay;
}

/**
 * Pure. Which items are looked up, in what order, when every lookup attaches hours (ledger
 * `2026-09-30-places-named-gate`): only items that NAME a place, round-robin ACROSS DAYS. The live
 * run uses the same `LookupScheduler`, which may pull a day's next item forward (smoke 5 item 7).
 */
export function lookupOrder(items: readonly EnrichItem[], city: string | null): Array<{ item: EnrichItem; tokens: Set<string> }> {
  const s = new LookupScheduler(namedByDay(items, city));
  const out: Array<{ item: EnrichItem; tokens: Set<string> }> = [];
  for (let n = s.next(); n; n = s.next()) out.push(n.entry);
  return out;
}

/** Pure. The drafts of ONE Places answer, only when its matched name names the item; else none. */
export function attachableDrafts(drafts: FactDraft[], tokens: ReadonlySet<string>, city: string | null): FactDraft[] {
  const loc = drafts.find((d) => d.factType === "location");
  const name = loc && typeof loc.value?.name === "string" ? (loc.value.name as string) : null;
  return matchNamesItem(name, tokens, city) ? drafts : [];
}

/** Pure. The place's display name from an ATTACHED answer (its `location` fact), else null. */
export function attachedDisplayName(kept: readonly FactDraft[]): string | null {
  const loc = kept.find((d) => d.factType === "location");
  // Smoke 7: rename ONLY to a point of interest — an area- or street-typed answer (or one with no
  // types, e.g. a cache row from before types were stored) never renames the item.
  if (!isPointOfInterest(loc?.value?.types as unknown[] | undefined)) return null;
  const name = typeof loc?.value?.name === "string" ? (loc.value.name as string).trim() : "";
  return name || null;
}

/**
 * ONE info line per lookup ATTEMPT (decision-maker, Sep 30, 2026 — the spine logged failures only):
 * the plan and item ids, the item's day, the OUTCOME, the place id, cache hit or miss, and latency.
 * No query text and no title, so the log carries no traveler content — only opaque ids.
 *
 * SMOKE 4 (P1, ledger `2026-10-02-smoke4-draft-fixes`): `attached` (facts recorded), `unmatched` (a
 * place came back but did not name the item) or `none` (no place came back); skips log one
 * `skipped` line each with their reason.
 *
 * SMOKE 5 (ledger `2026-10-03-smoke5-fixes`): every line now carries `plan_id` and `item_id`. Before
 * this a line could not be tied to the item it was about, so Ryoan-ji's three stored facts had no
 * line anyone could find. The two writers that stored facts with NO line at all — the paid-run /
 * expert fresh fetch (`fetchFreshFactsForItem`) and a failed lookup — now log too, with the same ids.
 */
function logLookup(
  ids: { planId: string; itemId: string },
  drafts: readonly FactDraft[],
  cache: "hit" | "miss",
  startedMs: number,
  day: number,
  outcome: "attached" | "unmatched" | "none",
  extra: { facts: number; hours: boolean; renamed: boolean },
): void {
  const placeId = drafts.find((d) => d.placeRefKind === "place_id")?.placeRef ?? "none";
  // Field-mask ruling: the BILLED SKU tier of this call (a cache hit was not billed: "none").
  const sku = cache === "hit" ? "none" : drafts.find((d) => d.sku)?.sku ?? "unknown";
  const costCents = drafts.reduce((n, d) => n + (cache === "hit" ? 0 : d.costCents ?? 0), 0);
  console.info(
    `[place-facts] lookup plan_id=${ids.planId} item_id=${ids.itemId} day=${day} outcome=${outcome} place_id=${placeId} cache=${cache} sku=${sku} cost_cents=${costCents} facts=${extra.facts} hours=${extra.hours ? 1 : 0} renamed=${extra.renamed ? 1 : 0} latency_ms=${Date.now() - startedMs}`,
  );
}

function logSkipped(ids: { planId: string; itemId: string }, day: number, reason: "unnamed" | "cap" | "no_adapter"): void {
  console.info(`[place-facts] skipped plan_id=${ids.planId} item_id=${ids.itemId} day=${day} reason=${reason}`);
}

function outcomeOf(drafts: readonly FactDraft[], kept: readonly FactDraft[]): "attached" | "unmatched" | "none" {
  return kept.length ? "attached" : drafts.length ? "unmatched" : "none";
}

/**
 * SMOKE 5 item 9: an attached Google answer names the place, so the drafted item takes that name
 * ("Bamboo Groove" → "Arashiyama Bamboo Grove"). ONE conditional UPDATE: only the AI's own row
 * (`origin = 'ai'`), only while it still carries the title the draft gave it — a traveler's rename
 * in the meantime is never overwritten. Never called for an unmatched or empty answer. Never throws.
 */
async function renameToDisplayName(tripId: string, item: EnrichItem, name: string): Promise<boolean> {
  if (name === item.title) return false;
  if (titleNamesAnArea(item.title)) return false; // smoke 7: an area-named item is never renamed
  try {
    const r = await db
      .update(itineraryItems)
      .set({ title: name })
      .where(and(eq(itineraryItems.id, item.id), eq(itineraryItems.tripId, tripId), eq(itineraryItems.title, item.title), eq(itineraryItems.origin, "ai")))
      .returning({ id: itineraryItems.id });
    return r.length > 0;
  } catch (err) {
    console.error(`[place-facts] rename failed plan_id=${tripId} item_id=${item.id}:`, (err as Error)?.message ?? err);
    return false;
  }
}

/**
 * SMOKE 9 S9-7 (ledger `2026-10-04-smoke9-addendum`): when a lookup attaches a Google address fact
 * carrying an AREA (from `addressComponents`, stored on the fact as `value.area`), that area replaces
 * the AI's own area text on the item ("541 Nijocho … Shimogyo Ward, Kyoto" → "Nakagyo Ward, Kyoto").
 * ONE conditional UPDATE, on the same guard as the rename: only the AI's own row, and only while it
 * still carries the location the draft wrote — a traveler's edit is never overwritten. The fact keeps
 * the area with its provenance; this only stops every other reader showing the AI's guess. Never throws.
 */
export function attachedArea(kept: readonly FactDraft[]): string | null {
  const address = kept.find((d) => d.factType === "address" && d.origin === "places_api");
  const area = (address?.value as Record<string, unknown> | undefined)?.area;
  // R321 S11-10: at attach, the ward is canonical — a cached fact recorded before the rule (e.g.
  // "Nakagyou Ward, Kyoto") is adopted in the same spelling as a fresh one ("Nakagyo Ward, Kyoto").
  const canonical = typeof area === "string" ? canonicalAreaLine(area) : "";
  return canonical ? canonical : null;
}
async function adoptGoogleArea(tripId: string, item: EnrichItem, area: string): Promise<boolean> {
  const drafted = item.locationName ?? null;
  if ((drafted ?? "").trim() === area) return false;
  try {
    const r = await db
      .update(itineraryItems)
      .set({ locationName: area })
      .where(
        and(
          eq(itineraryItems.id, item.id),
          eq(itineraryItems.tripId, tripId),
          eq(itineraryItems.origin, "ai"),
          drafted == null ? sql`(${itineraryItems.locationName} IS NULL OR ${itineraryItems.locationName} = '')` : eq(itineraryItems.locationName, drafted),
        ),
      )
      .returning({ id: itineraryItems.id });
    return r.length > 0;
  } catch (err) {
    console.error(`[place-facts] area adopt failed plan_id=${tripId} item_id=${item.id}:`, (err as Error)?.message ?? err);
    return false;
  }
}

/**
 * After a free draft commits: look up each drafted stop's facts (hours, dining basics, coordinates)
 * — cache first, then the Places spine. NEVER throws and never blocks the draft (§15b): a failed
 * lookup is logged and that item simply has no facts.
 *
 * THE CAP is `placesLookupsPerDraft()` — a COST cap, so it counts BILLED lookups only (a cache reuse
 * costs nothing and no longer spends it), and it is spent in `LookupScheduler` order (named places
 * only, across all days, a day's next item pulled forward when its first attached place has no
 * hours). A Places answer whose matched name is not in the item is dropped (`attachableDrafts`): the
 * call was spent, and nothing is recorded, because nothing true about THIS item came back (§13).
 *
 * PROGRESS (smoke 5 item 8): with a `draftId`, the run records which items are still being checked
 * on the draft's own row (`ai_generated_itineraries.facts_lookup`), so the slip can say "checking
 * hours…" and re-read until the run says done — on whichever server instance answers the read.
 */
/**
 * R299 (Maps billing audit): the two Places calls a draft makes run behind the Maps billing gate —
 * `places_id_lookup` (the no-charge IDs-only search) and `places_details` (the billed Details call),
 * each with its own daily cap; their cost stays on `place_facts` (the gate's row records the count).
 * A refused call is NOT made: a refused ID lookup leaves the item unlooked, a refused Details call is
 * logged as the cap. Injected adapters (tests) default to an ungated pass-through unless the test
 * passes a gate of its own.
 */
export type PlacesCallGate = <T>(key: "places_id_lookup" | "places_details", call: () => Promise<T>) => Promise<{ value: T } | { refused: string }>;
const ungatedPlacesCall: PlacesCallGate = async (_key, call) => ({ value: await call() });
const mapsGatedPlacesCall: PlacesCallGate = (key, call) => gatedMapsCall(key, async () => ({ value: await call() }));

export async function enrichPlanItems(input: {
  tripId: string;
  market: string | null;
  city: string | null;
  items: EnrichItem[];
  adapters?: SourceAdapter[];
  draftId?: string | null;
  placesGate?: PlacesCallGate;
}): Promise<{ looked: number; cached: number; recorded: number; unnamed: number; unmatched: number; renamed: number; areas: number }> {
  const summary = { looked: 0, cached: 0, recorded: 0, unnamed: 0, unmatched: 0, renamed: 0, areas: 0 };
  const ids = (item: EnrichItem) => ({ planId: input.tripId, itemId: item.id });
  const progress = input.draftId ? new LookupProgress(input.draftId) : null;
  const gate = input.placesGate ?? (input.adapters ? ungatedPlacesCall : mapsGatedPlacesCall);
  try {
    const cap = placesLookupsPerDraft();
    const byDay = namedByDay(input.items, input.city);
    const named = new Set(Array.from(byDay.values()).flat().map((e) => e.item));
    summary.unnamed = input.items.length - named.size;
    for (const it of input.items) if (!named.has(it)) logSkipped(ids(it), it.dayNumber ?? 1, "unnamed");
    await progress?.start(Array.from(named).map((i) => i.id));
    const scheduler = new LookupScheduler(byDay);
    for (let next = scheduler.next(); next; next = scheduler.next()) {
      const { item, tokens } = next.entry;
      const day = next.day;
      try {
        // The cap is checked again below for the BILLED fetch only; a cache hit after the cap is free.
        const capReached = summary.looked >= cap;
        const need = needForItemType(item.type);
        const adapters = sourcesForNeed(need, input.market, input.adapters);
        if (!adapters.length) {
          logSkipped(ids(item), day, "no_adapter");
          continue;
        }
        // P2 (smoke 4): the visited place only — a two-place "A Alternative: B" title searched whole
        // returns A's facts for a visit to B.
        const lookupText = placeLookupText(item.title);
        const query = [lookupText, input.city].filter(Boolean).join(", ").slice(0, 300);
        const started = Date.now();
        let drafts: FactDraft[];
        let cache: "hit" | "miss";
        const req = { need, market: input.market, query: { text: lookupText, city: input.city }, budgetCents: 0 };
        const adapter = adapters[0] as SourceAdapter & Partial<Pick<PlacesAdapter, "resolvePlaceId" | "fetchByPlaceId">>;
        // R-u (surface step 3): THE CACHE KEY IS GOOGLE'S PLACE ID. Resolve it without a billed call —
        // the item's own stored ID, else an ID this exact query already resolved to, else the
        // no-charge IDs-only search — then reuse that place's facts from ANY plan at zero cost. Only a
        // miss is billed (Place Details by ID), and only that spends the cap.
        let placeId: string | null = item.googlePlaceId || (await knownPlaceIdForQuery(query));
        if (!placeId && adapter.resolvePlaceId) {
          const resolve = adapter.resolvePlaceId.bind(adapter);
          const out = await gate("places_id_lookup", () => resolve(req));
          if ("refused" in out) {
            logSkipped(ids(item), day, "cap");
            continue;
          }
          placeId = out.value;
        }
        const cached = placeId ? await cachedForPlaceId(placeId) : null;
        if (cached) {
          summary.cached += 1;
          drafts = cached;
          cache = "hit";
        } else if (capReached) {
          logSkipped(ids(item), day, "cap");
          continue;
        } else if (placeId && adapter.fetchByPlaceId) {
          const fetchById = adapter.fetchByPlaceId.bind(adapter);
          const id = placeId;
          const out = await gate("places_details", () => fetchById(id, req));
          if ("refused" in out) {
            logSkipped(ids(item), day, "cap");
            continue;
          }
          summary.looked += 1;
          drafts = out.value;
          cache = "miss";
        } else if (!adapter.resolvePlaceId) {
          // An adapter with no ID step (a test double, a future source): the text fetch, billed.
          summary.looked += 1;
          drafts = await adapter.fetch(req);
          cache = "miss";
        } else {
          // Google answered no place for this query: nothing to look up, nothing spent.
          drafts = [];
          cache = "miss";
        }
        const kept = attachableDrafts(drafts, tokens, input.city);
        if (drafts.length && !kept.length) summary.unmatched += 1;
        const recorded = await recordFacts(kept, { planId: input.tripId, itemId: item.id });
        summary.recorded += recorded;
        const hasHours = kept.some((d) => d.factType === "hours");
        const display = kept.length ? attachedDisplayName(kept) : null;
        const renamed = display ? await renameToDisplayName(input.tripId, item, display) : false;
        if (renamed) summary.renamed += 1;
        const area = attachedArea(kept);
        if (area && (await adoptGoogleArea(input.tripId, item, area))) summary.areas += 1;
        scheduler.report(day, { attached: kept.length > 0, hasHours });
        logLookup(ids(item), drafts, cache, started, day, outcomeOf(drafts, kept), { facts: recorded, hours: hasHours, renamed });
      } catch (err) {
        console.error(`[place-facts] lookup failed plan_id=${input.tripId} item_id=${item.id} day=${day}:`, (err as Error)?.message ?? err);
      } finally {
        await progress?.done(item.id);
      }
    }
  } catch (err) {
    console.error(`[place-facts] enrichment failed plan_id=${input.tripId}:`, (err as Error)?.message ?? err);
  } finally {
    await progress?.finish();
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
    checkedAt: r.fetchedAt ? new Date(r.fetchedAt as any).toISOString() : null,
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
 * Step 6 R-aq: each plan item's Google place id and point, from its own unexpired, unsuperseded facts
 * — what the photo resolver keys its Wikimedia cache on and searches near. Read here, the one reader
 * of `place_facts` (content-facts C5), never in the photo service.
 */
export type PlaceRefView = {
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  /** R297: the first cached Google photo REFERENCE for the place (never an image), else null. */
  photoRef: { name: string; authors: Array<{ displayName: string; uri: string | null }> } | null;
};
export async function placeRefsForTrip(tripId: string, itemIds: string[], now: Date = new Date()): Promise<Map<string, PlaceRefView>> {
  const rows = (await rowsForTrip(tripId, itemIds)).filter((r) => !isFactStale(r, now));
  const out = new Map<string, PlaceRefView>();
  for (const r of rows) {
    if (!r.itineraryItemId) continue;
    const cur = out.get(r.itineraryItemId) ?? { placeId: null, lat: null, lng: null, photoRef: null };
    if (!cur.photoRef && r.factType === "photo_ref") {
      const first = Array.isArray((r.value as any)?.photos) ? (r.value as any).photos[0] : null;
      if (first && typeof first.name === "string" && first.name) {
        cur.photoRef = { name: first.name, authors: Array.isArray(first.authors) ? first.authors : [] };
      }
    }
    if (!cur.placeId && r.placeRefKind === "place_id") cur.placeId = r.placeRef;
    if (cur.lat == null && r.factType === "location") {
      const lat = Number((r.value as any)?.lat);
      const lng = Number((r.value as any)?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        cur.lat = lat;
        cur.lng = lng;
      }
    }
    out.set(r.itineraryItemId, cur);
  }
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
  // Smoke 5: this writer stored facts with no log line at all; it now logs the same ids the draft's
  // lookups do (no query text, no title).
  console.info(
    `[place-facts] fresh_fetch plan_id=${input.tripId} item_id=${input.item.id} source_id=${source.id} outcome=${adapter.lastOutcome ?? "no_facts"} facts=${recorded}`,
  );
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
    // Smoke 5: the last fact writer with no log line (ids only, no content).
    console.info(`[place-facts] confirmed plan_id=${fact.planId} item_id=${fact.itineraryItemId} fact_id=${fact.id} nugget_fact_id=${nuggetId}`);
    return { nuggetId };
  });
}

/**
 * Smoke 5 item 8: the item ids the plan's LATEST draft is still looking up (migration 340), via the
 * one pure reader. Plan-scoped; the caller has already authorized the viewer. Never throws — a read
 * that fails reports nothing pending, which only means the slip stops saying "checking".
 */
export async function pendingFactLookups(tripId: string, now: Date = new Date()): Promise<string[]> {
  try {
    const r = await db.execute(
      sql`SELECT facts_lookup FROM ai_generated_itineraries WHERE trip_id = ${tripId} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    );
    return pendingLookupItemIds((r.rows[0] as any)?.facts_lookup ?? null, now);
  } catch {
    return [];
  }
}
