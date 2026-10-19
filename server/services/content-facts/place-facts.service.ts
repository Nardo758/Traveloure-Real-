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
import { contentSources, itineraryItems, placeFacts, trips } from "@shared/schema";
import {
  asFactOrigin,
  PAGE_READ_ORIGINS,
  factProvenanceLine,
  isConfirmableFact,
  isFactStale,
  isGoogleHoursFact,
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
import { isPointOfInterest, matchNamesItem, namedPlaceTokens, placeLookupText, titleNamesAnArea, unnamedPlaceReason } from "@shared/place-name-gate";
import { loadMarketAreaNames } from "./market-areas";
import { mayFetchFresh, resolveFreshFetchBudget, type FreshFetchContext } from "./fresh-fetch";
import { placeFactTags, resolveFactPrecedence } from "@shared/content-tiers";
import { admitFeasibilityFact, closedDatesExpiryDay, hoursSeason, isFeasibilityFactType, parseClosedDates } from "@shared/feasibility-facts";
import { zonedMidnight } from "@shared/plan-timing";
import { MARKET_TIMEZONES } from "../trend-engine/operating-markets";
import { REFRESH_ORIGIN, admitRefreshFact } from "@shared/official-refresh";
import { BOT_FACT_ORIGIN, admitBotFact } from "@shared/bot-proposals";
import { lookupErrorCode, type PlaceLookupCapReason, type PlaceLookupOutcomeRow, type PlaceLookupSkipReason, type PlaceLookupTrigger } from "@shared/place-lookup-outcomes";
import { recordLookupOutcomes } from "./lookup-outcomes.service";
import { TavilyExtractAdapter, type TavilyExtractDeps } from "./tavily-extract-adapter";
import { getTavilyClient } from "../tavily-client";
import { claudeService } from "../claude.service";
import { assertRobotsAllowed } from "../../utils/robots-txt";
import { ROBOTS_TXT_USER_AGENT_TOKEN } from "../../config/robots-txt.config";
import { loadPartnerHosts } from "../partner-hosts.service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordFacts(
  input: FactDraft[],
  ctx: { planId: string | null; itemId: string | null },
  // BOT-1: a caller inside a transaction (the bot-proposal approve) writes the row inside it.
  exec: typeof db | Tx = db,
): Promise<number> {
  // FD-3 (ledger `2026-10-10-fd3-feasibility`): a feasibility fact passes the ONE admission rule or is not
  // stored — an unsourced last admission or last train never reaches a finding (rulings 1/3).
  const drafts = input.filter((d) => {
    // GH-1 (ledger `2026-10-17-gh1-no-google-hours`; terms ruling, Oct 16, 2026): Google's hours are never stored.
    if (isGoogleHoursFact(d)) {
      console.info(`[place-facts] refused places_api hours plan_id=${ctx.planId ?? "none"} item_id=${ctx.itemId ?? "none"}`);
      return false;
    }
    // SS-1b ruling 1 (ledger `2026-10-10-ss1b-official-refresh`): a market-level refresh fact is stored only
    // with its source id, its official https URL, an official license and a verbatim quote — never unsourced.
    if (d.origin === REFRESH_ORIGIN) {
      const r = admitRefreshFact(d);
      if (!r.ok) {
        console.info(`[place-facts] refused official_refresh fact_type=${d.factType} reason=${r.reason} source_id=${d.sourceId ?? "none"}`);
        return false;
      }
    }
    // BOT-1 ruling 3 (ledger `2026-10-15-bot1-phase1`): an approved bot fact carries the same provenance the
    // official refresh does, plus the admin who approved it — never stored without them.
    if (d.origin === BOT_FACT_ORIGIN) {
      const r = admitBotFact(d);
      if (!r.ok) {
        console.info(`[place-facts] refused bot_proposal fact_type=${d.factType} reason=${r.reason} source_id=${d.sourceId ?? "none"}`);
        return false;
      }
    }
    // EV-P0 PR 3 (ledger `2026-10-18-fact-tags-exhaustive`): a row whose origin has no ruled tier is refused,
    // never stored untagged.
    if (!placeFactTags(d.origin, d.license, d.factType)) {
      console.info(`[place-facts] refused untagged origin=${d.origin} fact_type=${d.factType} plan_id=${ctx.planId ?? "none"}`);
      return false;
    }
    if (!isFeasibilityFactType(d.factType)) return true;
    const verdict = admitFeasibilityFact(d);
    if (!verdict.ok) console.info(`[place-facts] refused fact_type=${d.factType} reason=${verdict.reason} plan_id=${ctx.planId ?? "none"} item_id=${ctx.itemId ?? "none"}`);
    return verdict.ok;
  });
  // FB-1 step 5b (ledger `2026-10-19-fb1-closed-dates`): a `closed_dates` fact expires at midnight, in the plan's
  // time zone (else its market's), of the day after its last closed date — whatever the writer sent. No zone ⇒ not stored.
  const kept: FactDraft[] = [];
  for (const d of drafts) {
    if (d.factType !== "closed_dates") { kept.push(d); continue; }
    const v = parseClosedDates(d.value);
    const zone = (ctx.planId ? await planTimeZone(ctx.planId) : null) ?? (d.market ? MARKET_TIMEZONES[d.market.toLowerCase()] ?? null : null);
    if (!v || !zone) {
      console.info(`[place-facts] refused fact_type=closed_dates reason=${v ? "no_time_zone" : "bad_value"} plan_id=${ctx.planId ?? "none"} item_id=${ctx.itemId ?? "none"}`);
      continue;
    }
    const day = closedDatesExpiryDay(v);
    kept.push({ ...d, expiresAt: zonedMidnight(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10)), zone) });
  }
  if (!kept.length) return 0;
  await exec.insert(placeFacts).values(
    kept.map((d) => ({
      id: d.id ?? crypto.randomUUID(),
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
      verifiedAt: d.verifiedAt ?? null,
      verifiedBy: d.verifiedBy ?? null,
      costCents: String(d.costCents),
      planId: ctx.planId,
      itineraryItemId: ctx.itemId,
      // FD-2 (ledger `2026-10-09-fd2-content-tier-tags`): the tag pair is born with the row, from its own
      // origin and license through the ONE rule (an untagged row was refused above).
      sourceClass: placeFactTags(d.origin, d.license, d.factType)!.sourceClass,
      reuseClass: placeFactTags(d.origin, d.license, d.factType)!.reuseClass,
    })),
  );
  return kept.length;
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
    // GH-1: a legacy Google hours row is never copied to another plan. EV-P0 PR 3 (ledger
    // `2026-10-18-fact-tags-exhaustive`): a superseded row is never copied, and only a PUBLIC row is — an
    // expert's local nugget belongs to the plan it was written on and never reaches another traveler's.
    .where(and(
      eq(placeFacts.placeRefKind, "place_id"),
      eq(placeFacts.placeRef, hit.placeRef),
      sql`${placeFacts.expiresAt} > now()`,
      isNull(placeFacts.supersededBy),
      eq(placeFacts.sourceClass, "public"),
      notGoogleHoursRow(),
    ));
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
      // The copy keeps the row's OWN origin and license (an official fact is never relabelled as Google's).
      origin: r.origin as FactDraft["origin"],
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      license: r.license as FactDraft["license"],
      fetchedAt: r.fetchedAt,
      expiresAt: r.expiresAt,
      verifiedAt: r.verifiedAt ?? null,
      verifiedBy: r.verifiedBy ?? null,
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
function namedByDay(items: readonly EnrichItem[], city: string | null, areaNames: readonly string[] = []): Map<number, Array<{ item: EnrichItem; tokens: Set<string> }>> {
  const byDay = new Map<number, Array<{ item: EnrichItem; tokens: Set<string> }>>();
  for (const item of items) {
    const tokens = namedPlaceTokens(item, city);
    if (unnamedSkipReason(item, city, tokens, areaNames) !== null) continue;
    const day = item.dayNumber ?? 1;
    const list = byDay.get(day) ?? [];
    list.push({ item, tokens });
    byDay.set(day, list);
  }
  return byDay;
}

/**
 * Pure. Why an item is never looked up, or null when it is (PF-1 ruling 4 splits the old `unnamed`):
 * `no_named_tokens` — nothing in the title or location names a specific place; `area_title` — smoke 7, a
 * title naming an area ("… District", "… Photo Stop", "… Walk"), or (P0-e item 4) one whose only
 * distinctive words are the market's neighbourhood or ward names, is never looked up. Delegates to the
 * ONE shared decision, `unnamedPlaceReason`, which the Optimize card's gap split also reads.
 */
export function unnamedSkipReason(
  item: EnrichItem,
  city: string | null,
  tokens: ReadonlySet<string> = namedPlaceTokens(item, city),
  areaNames: readonly string[] = [],
): Extract<PlaceLookupSkipReason, "no_named_tokens" | "area_title"> | null {
  return unnamedPlaceReason(item, city, areaNames, tokens);
}

/**
 * Pure. Which items are looked up, in what order, when every lookup attaches hours (ledger
 * `2026-09-30-places-named-gate`): only items that NAME a place, round-robin ACROSS DAYS. The live
 * run uses the same `LookupScheduler`, which may pull a day's next item forward (smoke 5 item 7).
 */
export function lookupOrder(items: readonly EnrichItem[], city: string | null, areaNames: readonly string[] = []): Array<{ item: EnrichItem; tokens: Set<string> }> {
  const s = new LookupScheduler(namedByDay(items, city, areaNames));
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
 * place came back but did not name the item) or `no_place` (no place came back — PF-1 renamed `none`); skips
 * log one `skipped` line and caps one `capped` line, each with its reason (PF-1 ruling 4).
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
  outcome: "attached" | "unmatched" | "no_place",
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

/** PF-1 ruling 4: a skipped item names its gate reason; a capped one names which cap — the same enum the table stores. */
function logSkipped(ids: { planId: string; itemId: string }, day: number, reason: PlaceLookupSkipReason): void {
  console.info(`[place-facts] skipped plan_id=${ids.planId} item_id=${ids.itemId} day=${day} reason=${reason}`);
}
function logCapped(ids: { planId: string; itemId: string }, day: number, reason: PlaceLookupCapReason): void {
  console.info(`[place-facts] capped plan_id=${ids.planId} item_id=${ids.itemId} day=${day} reason=${reason}`);
}

function outcomeOf(drafts: readonly FactDraft[], kept: readonly FactDraft[]): "attached" | "unmatched" | "no_place" {
  return kept.length ? "attached" : drafts.length ? "unmatched" : "no_place";
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
  /** PF-1: which caller started this run, stored on each outcome row (absent ⇒ NULL, "not stated"). */
  trigger?: PlaceLookupTrigger | null;
  /**
   * AP-1: the billed lookups this run may make, and the reason a billed lookup past it is capped with. Absent ⇒
   * `placesLookupsPerDraft()` / `draft_cap` (every existing caller). The hand-add run passes what is left of the
   * plan's daily budget and `plan_day_cap`.
   */
  billedBudget?: number;
  billedCapReason?: PlaceLookupCapReason;
  /**
   * AP-1: before a BILLED Details call, does a stored official hours fact already cover this place? True ⇒ no call;
   * the item keeps the place id (so the checks read the official fact) and the row says `official_fact`.
   */
  officialCovers?: (placeId: string) => Promise<boolean>;
}): Promise<{ looked: number; cached: number; recorded: number; unnamed: number; unmatched: number; renamed: number; areas: number; runId: string }> {
  const run = { runId: crypto.randomUUID(), runStartedAt: new Date(), trigger: input.trigger ?? null };
  const summary = { looked: 0, cached: 0, recorded: 0, unnamed: 0, unmatched: 0, renamed: 0, areas: 0, runId: run.runId };
  const ids = (item: EnrichItem) => ({ planId: input.tripId, itemId: item.id });
  // PF-1: one outcome row per item this run touched, written in ONE batch at the end (never throws).
  const outcomes: PlaceLookupOutcomeRow[] = [];
  const note = (item: EnrichItem, day: number, outcome: PlaceLookupOutcomeRow["outcome"], reason: string | null, extra: Partial<PlaceLookupOutcomeRow> = {}) =>
    outcomes.push({ tripId: input.tripId, itemId: item.id, day, outcome, reason, placeId: null, cache: null, costCents: null, latencyMs: null, ...extra });
  const skip = (item: EnrichItem, day: number, reason: PlaceLookupSkipReason) => {
    logSkipped(ids(item), day, reason);
    note(item, day, "skipped", reason);
  };
  const capped = (item: EnrichItem, day: number, reason: PlaceLookupCapReason) => {
    logCapped(ids(item), day, reason);
    note(item, day, "capped", reason);
  };
  const progress = input.draftId ? new LookupProgress(input.draftId) : null;
  const gate = input.placesGate ?? (input.adapters ? ungatedPlacesCall : mapsGatedPlacesCall);
  try {
    const cap = input.billedBudget ?? placesLookupsPerDraft();
    const capReason: PlaceLookupCapReason = input.billedCapReason ?? "draft_cap";
    const areaNames = await loadMarketAreaNames(input.market, input.city);
    const byDay = namedByDay(input.items, input.city, areaNames);
    const named = new Set(Array.from(byDay.values()).flat().map((e) => e.item));
    summary.unnamed = input.items.length - named.size;
    for (const it of input.items) {
      if (named.has(it)) continue;
      skip(it, it.dayNumber ?? 1, unnamedSkipReason(it, input.city, undefined, areaNames) ?? "no_named_tokens");
    }
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
          skip(item, day, "no_adapter");
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
            capped(item, day, "maps_id_lookup");
            continue;
          }
          placeId = out.value;
        }
        const cached = placeId ? await cachedForPlaceId(placeId) : null;
        if (cached) {
          summary.cached += 1;
          drafts = cached;
          cache = "hit";
        } else if (placeId && input.officialCovers && (await input.officialCovers(placeId))) {
          await keepPlaceIdOnItem(input.tripId, item.id, placeId);
          logSkipped(ids(item), day, "official_fact");
          note(item, day, "skipped", "official_fact", { placeId });
          continue;
        } else if (capReached) {
          capped(item, day, capReason);
          continue;
        } else if (placeId && adapter.fetchByPlaceId) {
          const fetchById = adapter.fetchByPlaceId.bind(adapter);
          const id = placeId;
          const out = await gate("places_details", () => fetchById(id, req));
          if ("refused" in out) {
            capped(item, day, "maps_details");
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
        scheduler.report(day, { attached: kept.length > 0 });
        const outcome = outcomeOf(drafts, kept);
        logLookup(ids(item), drafts, cache, started, day, outcome, { facts: recorded, hours: hasHours, renamed });
        note(item, day, outcome, null, {
          placeId: placeId ?? drafts.find((d) => d.placeRefKind === "place_id")?.placeRef ?? null,
          cache,
          costCents: drafts.reduce((n, d) => n + (cache === "hit" ? 0 : d.costCents ?? 0), 0),
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        console.error(`[place-facts] lookup failed plan_id=${input.tripId} item_id=${item.id} day=${day}:`, (err as Error)?.message ?? err);
        note(item, day, "error", lookupErrorCode(err));
      } finally {
        await progress?.done(item.id);
      }
    }
  } catch (err) {
    console.error(`[place-facts] enrichment failed plan_id=${input.tripId}:`, (err as Error)?.message ?? err);
  } finally {
    await progress?.finish();
    await recordLookupOutcomes(run, outcomes);
  }
  return summary;
}

/**
 * AP-1: a hand-added stop whose place is covered by a stored official fact keeps the Google place id on its own
 * row (LD 57 — a place id is the one Places value kept), so the feasibility reader maps the official fact to it.
 * Never overwrites an id the row already has.
 */
async function keepPlaceIdOnItem(tripId: string, itemId: string, placeId: string): Promise<void> {
  await db
    .update(itineraryItems)
    .set({ googlePlaceId: placeId } as any)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId), isNull(itineraryItems.googlePlaceId)));
}

/** AP-1: is an official, tagged hours fact stored for this place? (The same rows the feasibility reader attaches.) */
export async function officialHoursStoredFor(placeId: string): Promise<boolean> {
  return (await storedOfficialFacts([placeId], ["hours"])).length > 0;
}

/**
 * GH-1 (ledger `2026-10-17-gh1-no-google-hours`): the WHERE form of `isGoogleHoursFact` — a `places_api` hours
 * row stored before GH-1 is never read (it expires within 30 days; nothing deletes it).
 */
export function notGoogleHoursRow() {
  return sql`NOT (${placeFacts.origin} = 'places_api' AND ${placeFacts.factType} = 'hours')`;
}

async function rowsForTrip(tripId: string, itemIds?: string[]): Promise<FactRow[]> {
  return db
    .select()
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.planId, tripId),
        isNull(placeFacts.supersededBy),
        notGoogleHoursRow(),
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

/** LG-1 item 5: the plan's zone, for the "checked" day on every provenance line. Never throws (null ⇒ UTC day). */
async function planTimeZone(tripId: string): Promise<string | null> {
  try {
    const [t] = await db.select({ timezone: trips.timezone }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return t?.timezone ?? null;
  } catch {
    return null;
  }
}

function toView(r: FactRow, now: Date, sources: Map<string, SourceFacts> = new Map(), timeZone: string | null = null): FactView | null {
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
    provenance: factProvenanceLine(f, now, timeZone),
    checkedAt: r.fetchedAt ? new Date(r.fetchedAt as any).toISOString() : null,
    stale: isFactStale(f, now),
    publishable: isPublishable(f),
  };
}

/**
 * The plan's facts per item: the FIRST fact of each type in the engine's order. Plan-scoped — the
 * caller has already authorized the viewer for this plan. Every view carries its provenance line.
 */
/**
 * The official rows stored for these place ids by ANY plan (the registry's stored facts, FD-3 ruling 2) —
 * the ONE read both the feasibility checks and a row's shown hours use (P0-e addition 7).
 */
async function storedOfficialFacts(placeIds: string[], factTypes: string[]): Promise<FactRow[]> {
  if (!placeIds.length) return [];
  return db
    .select()
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.placeRefKind, "place_id"),
        inArray(placeFacts.placeRef, placeIds),
        inArray(placeFacts.factType, factTypes),
        // SS-1b: the market-level official refresh is an official page read like the crawl (PAGE_READ_ORIGINS).
        inArray(placeFacts.origin, [...PAGE_READ_ORIGINS, "expert_nugget"]),
        eq(placeFacts.license, "official"),
        isNull(placeFacts.supersededBy),
        eq(placeFacts.sourceClass, "public"),
      ),
    );
}

/** Each item's own rows plus the stored official rows for its place id, never twice. */
function withStoredOfficial(own: FactRow[], placeOf: Map<string, string>, stored: FactRow[]): Map<string, FactRow[]> {
  const byItem = new Map<string, FactRow[]>();
  for (const r of own) {
    if (!r.itineraryItemId) continue;
    byItem.set(r.itineraryItemId, [...(byItem.get(r.itineraryItemId) ?? []), r]);
  }
  placeOf.forEach((placeId, itemId) => {
    const extra = stored.filter((r) => r.placeRef === placeId && !(byItem.get(itemId) ?? []).some((x) => x.id === r.id));
    if (extra.length) byItem.set(itemId, [...(byItem.get(itemId) ?? []), ...extra]);
  });
  return byItem;
}

/** The item → place id map, from the plan's own Places rows. */
function placeIdsOf(own: FactRow[]): Map<string, string> {
  const placeOf = new Map<string, string>();
  for (const r of own) {
    if (r.itineraryItemId && r.placeRefKind === "place_id" && r.placeRef && !placeOf.has(r.itineraryItemId)) placeOf.set(r.itineraryItemId, r.placeRef);
  }
  return placeOf;
}

/**
 * AP-1: the map above, plus an item's own `google_place_id` where the plan holds no Places row for it — a stop
 * kept off the billed call because an official fact covers its place (`keepPlaceIdOnItem`) is mapped to that fact.
 */
async function itemPlaceIdsForTrip(tripId: string, own: FactRow[]): Promise<Map<string, string>> {
  const placeOf = placeIdsOf(own);
  const rows = await db
    .select({ id: itineraryItems.id, placeId: itineraryItems.googlePlaceId })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), sql`${itineraryItems.googlePlaceId} IS NOT NULL`));
  for (const r of rows) if (r.placeId && !placeOf.has(r.id)) placeOf.set(r.id, r.placeId);
  return placeOf;
}

/**
 * P0-e addition 7: the engine's order (`rankFactsByOrigin`), with every official page-read hours fact moved
 * ahead of Google's — "when the official hours fact exists it replaces the Google line". Platform-native
 * and verified facts keep their place in front.
 */
function officialHoursBeforePlaces(ranked: FactRow[]): FactRow[] {
  const isOfficial = (r: FactRow) => r.license === "official" && r.origin !== "places_api" && r.sourceClass === "public";
  const firstPlaces = ranked.findIndex((r) => r.origin === "places_api");
  if (firstPlaces < 0) return ranked;
  const officials = ranked.slice(firstPlaces).filter(isOfficial);
  if (!officials.length) return ranked;
  return [...ranked.slice(0, firstPlaces), ...officials, ...ranked.slice(firstPlaces).filter((r) => !isOfficial(r))];
}

/** P0-e addition 7: an official-licence hours fact's valid season, else null (the loader's own rule). */
function officialSeason(r: FactRow): { from: string; to: string } | null {
  if (r.origin === "places_api" || r.license !== "official") return null;
  const season = hoursSeason(r.value);
  return season && season !== "invalid" ? season : null;
}

export async function factsForTrip(tripId: string, now: Date = new Date()): Promise<Record<string, FactView[]>> {
  const [rows, timeZone] = await Promise.all([rowsForTrip(tripId), planTimeZone(tripId)]);
  // P0-e addition 7 (decision-maker, Oct 12, 2026): a row's hours are the SAME facts the feasibility checks
  // read — the plan's own rows plus the official rows stored for the item's place id, official first
  // (`resolveFactPrecedence`) — so an official hours fact replaces the Google line, and the row's closing
  // warning and the findings read one fact. Only Google-shaped hours (`weekdayDescriptions`) are drawn
  // (`shownHoursFact`); a text-only crawled row is still a view, for the expert's confirm control.
  const tagged = rows.filter((r) => r.sourceClass != null);
  const placeOf = await itemPlaceIdsForTrip(tripId, tagged);
  const stored = await storedOfficialFacts(Array.from(new Set(placeOf.values())), ["hours", "last_admission"]);
  const sources = await sourcesFor([...rows, ...stored]);
  const byItem = new Map<string, FactRow[]>();
  for (const r of rows) {
    if (!r.itineraryItemId) continue;
    const list = byItem.get(r.itineraryItemId) ?? [];
    list.push(r);
    byItem.set(r.itineraryItemId, list);
  }
  const officialByItem = withStoredOfficial([], placeOf, stored);
  // `withStoredOfficial` attaches the stored rows of every requested type; hours below reads only hours.
  const out: Record<string, FactView[]> = {};
  const itemIds = new Set<string>([...Array.from(byItem.keys()), ...Array.from(officialByItem.keys())]);
  itemIds.forEach((itemId) => {
    const list = byItem.get(itemId) ?? [];
    const seen = new Set<string>(["hours"]);
    const views: FactView[] = [];
    // Hours: official first; a seasonal official fact covers part of the year, so the next hours fact
    // (another season, or Google's weekly list) is kept behind it and the row shows the one covering its
    // date (`shownHoursFact`). A fact with no season closes the list, as before.
    const hourRows = [...list.filter((r) => r.factType === "hours"), ...(officialByItem.get(itemId) ?? []).filter((x) => x.factType === "hours" && !list.some((r) => r.id === x.id))];
    const rankedHours = officialHoursBeforePlaces(rankFactsByOrigin(hourRows, now));
    const shown = new Set<string>();
    for (const r of rankedHours) {
      // The same official fact stored by two plans is shown once.
      const key = JSON.stringify([r.origin, r.sourceId, (r.value as any)?.weekdayDescriptions ?? (r.value as any)?.text ?? r.id, (r.value as any)?.season ?? null]);
      if (shown.has(key)) continue;
      const v = toView(r, now, sources, timeZone);
      if (!v) continue;
      shown.add(key);
      views.push(v);
      // A text-only row (an expert may confirm it; the row never draws it as hours) or a seasonal one
      // does not close the list — the first all-year weekly list does.
      if (Array.isArray((r.value as any)?.weekdayDescriptions) && officialSeason(r) === null) break;
    }
    // Last entry (P0-e item 2): every admitted, unexpired official row — the plan's own and those stored for
    // the place — the same set the findings read, each season-aware, so the row's warning picks the one
    // covering its date (`lastAdmissionForDate`). Old rows without a season count as before.
    const entryRows = [...list.filter((r) => r.factType === "last_admission"), ...(officialByItem.get(itemId) ?? []).filter((x) => x.factType === "last_admission" && !list.some((r) => r.id === x.id))];
    const entryRanked = resolveFactPrecedence(entryRows.map((r) => ({ ...r, sourceClass: r.sourceClass, license: r.license })), "last_admission") as FactRow[];
    const entryShown = new Set<string>();
    for (const r of entryRanked) {
      if (isFactStale(r, now) || !admitFeasibilityFact(r).ok) continue;
      const key = JSON.stringify([r.sourceId, (r.value as any)?.byWeekday ?? null, (r.value as any)?.season ?? null]);
      if (entryShown.has(key)) continue;
      const v = toView(r, now, sources, timeZone);
      if (!v) continue;
      entryShown.add(key);
      views.push(v);
    }
    seen.add("last_admission");
    for (const r of rankFactsByOrigin(list.filter((x) => x.factType !== "hours"), now)) {
      if (seen.has(r.factType)) continue;
      const v = toView(r, now, sources, timeZone);
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

export function defaultTavilyExtractDeps(): TavilyExtractDeps {
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
      .where(and(eq(placeFacts.id, input.factId), eq(placeFacts.planId, input.tripId)))
      .for("update");
    if (!fact) throw new FactConfirmError("not_found", 404);
    if (fact.supersededBy) throw new FactConfirmError("already_superseded", 409);
    // EV-P0 PR 3 (ledger `2026-10-18-fact-tags-exhaustive`): an OFFICIAL fact stays in the feasibility checks
    // when an expert confirms it — it is linked from the nugget (`official_source_fact_id`), never superseded.
    // The row lock above serialises confirms, so a second one is refused by the linked nugget it finds.
    const official = fact.license === "official";
    if (official) {
      const [linked] = await tx
        .select({ id: placeFacts.id })
        .from(placeFacts)
        .where(eq(placeFacts.officialSourceFactId, fact.id))
        .limit(1);
      if (linked) throw new FactConfirmError("already_superseded", 409);
    }
    if (!isConfirmableFact({ origin: fact.origin, license: fact.license, verifiedAt: fact.verifiedAt })) {
      throw new FactConfirmError("not_confirmable", 409);
    }
    const text = typeof (fact.value as any)?.text === "string" ? String((fact.value as any).text).trim() : "";
    if (!text) throw new FactConfirmError("no_statement", 409);
    const now = new Date();
    const ttl = factTtlDays(fact.factType as FactType);
    const nuggetId = crypto.randomUUID();
    // A writer never stores an untagged row (ledger `2026-10-18-fact-tags-exhaustive`).
    const nuggetTags = placeFactTags("expert_nugget", null, fact.factType);
    if (!nuggetTags) throw new FactConfirmError("not_confirmable", 409);
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
      // FD-2: the expert's confirmation is local and ours — tagged through the ONE rule, never by hand; when it
      // confirms an OFFICIAL fact it quotes that fact, and expires with it (ruling 8, `isLiveLocal`).
      sourceClass: nuggetTags.sourceClass,
      reuseClass: nuggetTags.reuseClass,
      officialSourceFactId: official ? fact.id : null,
    });
    if (!official) {
      const claimed = await tx
        .update(placeFacts)
        .set({ supersededBy: nuggetId })
        .where(and(eq(placeFacts.id, fact.id), isNull(placeFacts.supersededBy)))
        .returning({ id: placeFacts.id });
      if (!claimed.length) throw new FactConfirmError("already_superseded", 409);
    }
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

/**
 * FD-3 (ledger `2026-10-10-fd3-feasibility`; rulings 1–3, 6): the facts the feasibility checks read, for
 * ONE plan, behind the caller's own plan gate (the findings reader and the plancard). Read here, the one
 * reader of `place_facts` (content-facts C5).
 *
 *   · hours — per item, the plan's own hours rows PLUS official rows stored for the item's place id by
 *     any plan (the registry's stored facts, ruling 2), in the ONE precedence (`resolveFactPrecedence`:
 *     official first for a hard fact). Only rows carrying Google-shaped `weekdayDescriptions` are read; a
 *     text-only crawled row is never parsed (ruling 1). Stale rows still count (R-v caveat).
 *   · lastAdmission — per item, every official `last_admission` row, unexpired (the caller picks per date).
 *   · lastServices — every official `last_service` row in the plan's market with a station point,
 *     unexpired; the caller matches them to a ride by distance.
 * Every row must be TAGGED (`source_class` set): an untagged fact never reaches a finding (FD-2 ruling 3).
 */
export interface FeasibilityHours {
  weekdayDescriptions: string[];
  checkedAt: string | null;
  /** A hard closure counts only from an official source the registry may publish (R-p) — unchanged. */
  official: boolean;
  /** P0-e item 2: the official fact's own season, when it states one; absent ⇒ every date. */
  season?: { from: string; to: string } | null;
  /** FB-1 step 2: where the fact came from, for the issue it supports. */
  sourceUrl?: string | null;
  provenance?: string | null;
  /** FB-1 step 2: an official-licence source, or a person's check (an expert or a verifier). */
  sourceKind?: "official_fact" | "person_checked_fact";
}
/** FB-1 step 2: one admitted last-admission fact with where it came from (same order as `lastAdmission`). */
export interface FeasibilityLastAdmission {
  value: unknown;
  checkedAt: string | null;
  sourceUrl: string | null;
  provenance: string | null;
}
export interface FeasibilityFacts {
  /**
   * P0-e item 2 (ledger `2026-10-12-p0e-findings-and-gaps`): EVERY usable hours fact per item, in
   * precedence order (official first, the Places weekly list last) — the caller picks the one for the
   * plan date with `hoursFactForDate`. It used to be one fact per item, whatever the date.
   */
  hours: Map<string, FeasibilityHours[]>;
  /** Likewise every unexpired, admitted `last_admission` value per item, in precedence order (`lastAdmissionForDate`). */
  lastAdmission: Map<string, unknown[]>;
  /** FB-1 step 2: the same facts as `lastAdmission`, each with its checked date and source. */
  lastAdmissionFacts: Map<string, FeasibilityLastAdmission[]>;
  /** FB-1 step 5b: every unexpired, admitted `closed_dates` fact per item, with its checked date and source. */
  closedDates: Map<string, FeasibilityLastAdmission[]>;
  lastServices: Array<{ lat: number; lng: number; value: unknown; checkedAt?: string | null; sourceUrl?: string | null; provenance?: string | null }>;
}

/**
 * Every official, unexpired, admitted `last_service` row in a market that has a station point — the ONE read of
 * them (FD-3; TC-4 ledger `2026-10-11-tc4-live-directions`). Callers match rows to a stop by distance: the
 * optimizer lead's inferred ride and the Trip Card's last-departure line, both from the stop a leg LEAVES.
 */
export async function lastServicesForMarket(
  market: string,
  now: Date = new Date(),
): Promise<Array<{ lat: number; lng: number; value: unknown; checkedAt: string | null; sourceUrl: string | null; provenance: string | null }>> {
  const services = await db
    .select()
    .from(placeFacts)
    .where(
      and(
        eq(placeFacts.factType, "last_service"),
        eq(placeFacts.market, market),
        eq(placeFacts.license, "official"),
        isNull(placeFacts.supersededBy),
        eq(placeFacts.sourceClass, "public"),
        sql`${placeFacts.placeLat} IS NOT NULL AND ${placeFacts.placeLng} IS NOT NULL`,
      ),
    );
  return services
    .filter((r) => !isFactStale(r, now) && admitFeasibilityFact(r).ok)
    .map((r) => {
      const v = toView(r as FactRow, now);
      return {
        lat: Number(r.placeLat),
        lng: Number(r.placeLng),
        value: r.value,
        checkedAt: r.fetchedAt ? new Date(r.fetchedAt as any).toISOString() : null,
        sourceUrl: r.sourceUrl ?? null,
        provenance: v?.provenance ?? null,
      };
    })
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

export async function feasibilityFactsForTrip(tripId: string, market: string | null, now: Date = new Date()): Promise<FeasibilityFacts> {
  const own = (await rowsForTrip(tripId)).filter((r) => r.sourceClass === "public");
  const timeZone = await planTimeZone(tripId);
  const placeOf = await itemPlaceIdsForTrip(tripId, own);
  const stored = await storedOfficialFacts(Array.from(new Set(placeOf.values())), ["hours", "last_admission", "closed_dates"]);
  const sources = await sourcesFor([...own, ...stored]);
  const byItem = withStoredOfficial(own, placeOf, stored);

  const hours = new Map<string, FeasibilityHours[]>();
  const lastAdmission = new Map<string, unknown[]>();
  const lastAdmissionFacts = new Map<string, FeasibilityLastAdmission[]>();
  const closedDates = new Map<string, FeasibilityLastAdmission[]>();
  byItem.forEach((rows, itemId) => {
    const ranked = resolveFactPrecedence(
      rows.map((r) => ({ ...r, sourceClass: r.sourceClass, license: r.license })),
      "hours",
    );
    const hs: FeasibilityHours[] = [];
    for (const h of ranked) {
      if (h.factType !== "hours" || !Array.isArray((h.value as any)?.weekdayDescriptions)) continue;
      const v = toView(h, now, sources, timeZone);
      const official = h.origin !== "places_api" && v?.publishable === true;
      // P0-e item 2: only an OFFICIAL-licence fact may state a season (a Places list never does); a malformed
      // season makes the fact unusable rather than all-year.
      const season = h.origin !== "places_api" && h.license === "official" ? hoursSeason(h.value) : null;
      if (season === "invalid") continue;
      hs.push({
        weekdayDescriptions: ((h.value as any).weekdayDescriptions as unknown[]).map(String),
        checkedAt: h.fetchedAt ? new Date(h.fetchedAt as any).toISOString() : null,
        official,
        ...(season ? { season } : {}),
        sourceUrl: (h as any).sourceUrl ?? null,
        provenance: v?.provenance ?? null,
        ...(h.license === "official" ? { sourceKind: "official_fact" as const } : h.verifiedAt ? { sourceKind: "person_checked_fact" as const } : {}),
      });
    }
    if (hs.length) hours.set(itemId, hs);
    const laRows = ranked.filter((r) => r.factType === "last_admission" && !isFactStale(r, now) && admitFeasibilityFact(r).ok);
    if (laRows.length) {
      lastAdmission.set(itemId, laRows.map((r) => r.value));
      lastAdmissionFacts.set(
        itemId,
        laRows.map((r) => ({
          value: r.value,
          checkedAt: r.fetchedAt ? new Date(r.fetchedAt as any).toISOString() : null,
          sourceUrl: (r as any).sourceUrl ?? null,
          provenance: toView(r as any, now, sources)?.provenance ?? null,
        })),
      );
    }
    // FB-1 step 5b: every unexpired, admitted `closed_dates` fact for the item, official first.
    const cdRows = ranked.filter((r) => r.factType === "closed_dates" && !isFactStale(r, now) && admitFeasibilityFact(r).ok);
    if (cdRows.length) {
      closedDates.set(
        itemId,
        cdRows.map((r) => ({
          value: r.value,
          checkedAt: r.fetchedAt ? new Date(r.fetchedAt as any).toISOString() : null,
          sourceUrl: (r as any).sourceUrl ?? null,
          provenance: toView(r as any, now, sources)?.provenance ?? null,
        })),
      );
    }
  });

  const lastServices = market ? await lastServicesForMarket(market, now) : [];
  return { hours, lastAdmission, lastAdmissionFacts, closedDates, lastServices };
}
