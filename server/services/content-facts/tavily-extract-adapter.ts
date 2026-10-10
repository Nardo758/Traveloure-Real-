/**
 * TavilyExtractAdapter — a registry row read through Tavily (content sourcing brief §6; A6 (3),
 * ledger `2026-10-01-a6-tavily-extract`).
 *
 * One adapter instance per ACTIVE `content_sources` row whose adapter is `tavily_extract`. For one
 * plan item it:
 *   1. REFUSES with no call at all unless `budgetCents` covers a search + an extract. The free path
 *      passes 0 (`mayFetchFresh` answers null there), so the free draft can never reach Tavily.
 *   2. searches ONLY the row's own host (`includeDomains`), and takes the first result on that host
 *      that is not a resale ticket host (R208) and — unless the row is a partner source — not on a
 *      partner's domain;
 *   3. checks that page's robots.txt for our honest crawler identity before asking for it;
 *   4. extracts the page and asks the model (Anthropic, `claudeService.completeJson` — R226) for
 *      facts of the types this need can hold, each with a VERBATIM quote from the page. A fact whose
 *      quote is not on the page, or is longer than `factQuoteMaxChars()` (300), is REFUSED, never
 *      trimmed or paraphrased into place (§13).
 *
 * Every fact is origin `crawled` under the row's license class, so `isPublishable` is false: these
 * facts render inside a plan with their provenance line, never on a public surface. The Tavily
 * cost goes on the first draft's `cost_cents` (so a sum over rows is the real spend) and on the
 * `api_usage_logs` rows the Tavily client writes, tagged with the plan, item, source and basis; the
 * model call goes to `ai_cost_tracking` under `content_fact_extract`.
 */
import {
  isContentNeed,
  isContentNeedKey,
  parentNeed,
  sourceNeedStanding,
  type ContentNeed,
  type FactType,
  type LicenseClass,
} from "@shared/content-facts";
import { isOnPartnerHost, partnerHostOf } from "@shared/partner-hosts";
import { RESALE_TICKET_HOSTS } from "@shared/city-events";
import type { FactDraft, FetchRequest, SourceAdapter } from "./source-adapter";
import { factQuoteMaxChars, factTtlDays } from "../../config/content-facts.config";
import { TAVILY_PRICE_PER_EXTRACT_USD, TAVILY_PRICE_PER_SEARCH_USD } from "../../config/trailhead.config";
import type { TavilyLoggingClient } from "../tavily-client";
import { CONTENT_FACTS_USAGE_PURPOSE } from "./fresh-fetch";
import { REFRESH_ORIGIN, refreshExpiresAt, refreshPlaceRef, stationPointValue, type StationPoint } from "@shared/official-refresh";
import { admitFeasibilityFact, isFeasibilityFactType, parseLastAdmission, parseLastService } from "@shared/feasibility-facts";
import { parseDayHours } from "@shared/optimizer-lead";

/** What one lookup costs in cents: one search plus one extract, derived from config (§8). */
export function tavilyLookupCostCents(): number {
  return Math.round((TAVILY_PRICE_PER_SEARCH_USD + TAVILY_PRICE_PER_EXTRACT_USD) * 10000) / 100;
}

/**
 * SS-1b: what one market-level refresh read costs — the target URL is known, so it is ONE extract and no
 * search. Derived from the same config price (§8).
 */
export function tavilyExtractCostCents(): number {
  return Math.round(TAVILY_PRICE_PER_EXTRACT_USD * 10000) / 100;
}

/** Which fact types a page may answer for each need. A type outside the list is refused. */
export const FACT_TYPES_FOR_NEED: Readonly<Record<ContentNeed, readonly FactType[]>> = {
  lodging: ["description", "price"],
  "transport.intercity": ["transit", "price"],
  // FD-3 ruling 3: the operator's last departure, as a STRUCTURED `last_service` fact.
  "transport.local": ["transit", "price", "last_service"],
  "transport.cruise": ["transit", "price"],
  // FD-3 ruling 1: the latest entry, as a STRUCTURED `last_admission` fact.
  "stop.hours": ["hours", "closure", "last_admission"],
  "stop.ticketing": ["ticketing_rule", "price", "last_admission"],
  dining: ["hours", "price", "tip"],
  activity: ["description", "price", "tip"],
  event: ["event"],
  practicalities: ["tip", "description"],
  neighbourhood: ["description", "tip"],
};

const PAGE_CHAR_LIMIT = 20_000;
const FACT_TEXT_MAX = 500;

export interface TavilyExtractSourceRow {
  id: string;
  name: string;
  homepage: string | null;
  market: string | null;
  adapter: string;
  covers: readonly unknown[] | null;
  doesNotCover: readonly unknown[] | null;
  licenseClass: string;
  active: boolean;
}

type CompleteJson = (opts: {
  system: string;
  user: string;
  maxTokens: number;
  sourceType: string;
  userId?: string | null;
  label: string;
}) => Promise<{ result: unknown }>;

export interface TavilyExtractDeps {
  /** Builds a Tavily client carrying this call's usage tags; null = no key configured. */
  client: (usage: { userId: string | null; metadata: Record<string, unknown> }) => TavilyLoggingClient | null;
  complete: CompleteJson;
  /** Throws when robots.txt disallows the url for our crawler. */
  robots: (url: string) => Promise<void>;
  partnerHosts: () => Promise<string[]>;
}

/** Extra request context the content-facts caller supplies for attribution. */
export interface TavilyFetchContext {
  tripId: string;
  itemId: string | null;
  basis: string;
  actorId: string | null;
  runId?: string | null;
}

/** Why a lookup produced nothing — logged, never invented into a fact. */
export type TavilyLookupOutcome =
  | "refused_budget"
  | "no_client"
  | "no_host"
  | "no_result_on_host"
  | "robots_disallowed"
  | "empty_page"
  | "model_failed"
  | "no_facts"
  | "facts";

export class TavilyExtractAdapter implements SourceAdapter {
  readonly id: string;
  lastOutcome: TavilyLookupOutcome | null = null;
  lastRefused: { factType: string; reason: string }[] = [];

  constructor(
    private readonly source: TavilyExtractSourceRow,
    private readonly deps: TavilyExtractDeps,
    private readonly context: TavilyFetchContext | null = null,
  ) {
    this.id = source.id;
  }

  covers(need: ContentNeed, market: string | null): boolean {
    const s = this.source;
    if (!s.active || s.adapter !== "tavily_extract") return false;
    if (s.market != null && (market ?? "").trim().toLowerCase() !== s.market.trim().toLowerCase()) return false;
    const standing = sourceNeedStanding(s, need);
    return standing === "covers" || standing === "partial";
  }

  attribution(fact: FactDraft): { sourceName: string; sourceUrl: string | null; license: LicenseClass | null } {
    return { sourceName: this.source.name, sourceUrl: fact.sourceUrl, license: fact.license };
  }

  async fetch(req: FetchRequest): Promise<FactDraft[]> {
    this.lastRefused = [];
    const cost = tavilyLookupCostCents();
    // THE FREE-PATH REFUSAL. Before anything else — before a client is even constructed.
    if (!(req.budgetCents > 0) || req.budgetCents < cost) {
      this.lastOutcome = "refused_budget";
      return [];
    }
    if (!isContentNeed(req.need) || !this.covers(req.need, req.market)) {
      this.lastOutcome = "no_facts";
      return [];
    }
    const host = this.source.homepage ? partnerHostOf(this.source.homepage) : null;
    if (!host) {
      this.lastOutcome = "no_host";
      return [];
    }
    const ctx = this.context;
    const client = this.deps.client({
      userId: ctx?.actorId ?? null,
      metadata: {
        purpose: CONTENT_FACTS_USAGE_PURPOSE,
        sourceId: this.source.id,
        tripId: ctx?.tripId ?? null,
        itemId: ctx?.itemId ?? null,
        basis: ctx?.basis ?? null,
        ...(ctx?.runId ? { runId: ctx.runId } : {}),
      },
    });
    if (!client) {
      this.lastOutcome = "no_client";
      return [];
    }

    const queryText = [req.query.text, req.query.city].filter(Boolean).join(" ").slice(0, 300);
    const search = await client.search(queryText, { includeDomains: [host], maxResults: 5, searchDepth: "basic" } as any);
    const partnerHosts = this.source.licenseClass === "partner" ? [] : await this.deps.partnerHosts();
    const candidate = (search?.results ?? [])
      .map((r: any) => String(r?.url ?? ""))
      .find((url: string) => {
        const h = partnerHostOf(url);
        if (!h || !/^https?:\/\//i.test(url)) return false;
        if (!isOnPartnerHost(h, [host])) return false;
        if (isOnPartnerHost(h, RESALE_TICKET_HOSTS)) return false;
        if (partnerHosts.length && isOnPartnerHost(h, partnerHosts)) return false;
        return true;
      });
    if (!candidate) {
      this.lastOutcome = "no_result_on_host";
      return [];
    }

    const kept = await this.readFacts(client, candidate, { need: req.need, subject: queryText, actorId: ctx?.actorId ?? null });
    if (!kept) return [];

    const fetchedAt = new Date();
    const out: FactDraft[] = kept.facts.map((f, i) => {
      const ttl = factTtlDays(f.factType);
      return {
        placeRefKind: req.placeRef?.kind ?? "free_text",
        placeRef: req.placeRef?.ref ?? queryText,
        placeLat: req.placeRef?.lat ?? null,
        placeLng: req.placeRef?.lng ?? null,
        market: req.market,
        need: req.need,
        factType: f.factType,
        value: { text: f.text, quote: f.quote, query: queryText, ...(f.fields ?? {}) },
        origin: "crawled",
        sourceId: this.source.id,
        sourceUrl: candidate,
        license: (this.source.licenseClass as LicenseClass) ?? null,
        fetchedAt,
        expiresAt: ttl == null ? null : new Date(fetchedAt.getTime() + ttl * 86_400_000),
        costCents: i === 0 ? cost : 0,
      };
    });
    this.lastOutcome = "facts";
    return out;
  }

  /**
   * The ONE page read both fetch paths share (§18 rule 1): robots, extract, the model call and the pure
   * admission. Sets `lastOutcome`/`lastRefused`; null when nothing was kept.
   */
  private async readFacts(
    client: TavilyLoggingClient,
    url: string,
    q: { need: ContentNeed; subject: string; actorId: string | null; factTypes?: readonly FactType[] },
  ): Promise<{ facts: ExtractedFact[] } | null> {
    try {
      await this.deps.robots(url);
    } catch {
      this.lastOutcome = "robots_disallowed";
      return null;
    }

    const extract = await client.extract([url], { format: "markdown" } as any);
    const page = String(extract?.results?.[0]?.rawContent ?? "").trim().slice(0, PAGE_CHAR_LIMIT);
    if (!page) {
      this.lastOutcome = "empty_page";
      return null;
    }

    const allowed = q.factTypes ?? FACT_TYPES_FOR_NEED[q.need];
    const quoteMax = factQuoteMaxChars();
    let answer: unknown;
    try {
      ({ result: answer } = await this.deps.complete({
        system:
          "You read one web page and report facts about ONE named place. Report only what the page states. " +
          `Each fact has: factType (one of ${allowed.join(", ")}), text (a plain-English statement, at most ${FACT_TEXT_MAX} characters), ` +
          `and quote (an exact, verbatim excerpt from the page that supports it, at most ${quoteMax} characters). ` +
          'If the page says nothing about the place for these types, return {"facts":[]}. Never guess. ' +
          STRUCTURED_FIELDS_INSTRUCTION,
        user: `Place: ${q.subject}\nNeed: ${q.need}\nPage URL: ${url}\n\nPAGE:\n${page}\n\nReturn {"facts":[{"factType":"…","text":"…","quote":"…","fields":{…}}]}`,
        maxTokens: 1200,
        sourceType: "content_fact_extract",
        userId: q.actorId,
        label: `content-facts:tavily_extract:${this.source.id}`,
      }));
    } catch (err) {
      console.error("[tavily-extract] model call failed:", (err as Error)?.message ?? err);
      this.lastOutcome = "model_failed";
      return null;
    }

    const kept = admitExtractedFacts(answer, { allowed, page, quoteMax });
    this.lastRefused = kept.refused;
    if (!kept.facts.length) {
      this.lastOutcome = "no_facts";
      return null;
    }
    return { facts: kept.facts };
  }

  /**
   * SS-1b ruling 1 (ledger `2026-10-10-ss1b-official-refresh`): read ONE configured target page for the
   * market-level refresh — MARKET-SCOPED, no plan, so no `tripId`. The target URL is known, so there is no
   * search: robots, one extract, the same model call and admission as `fetch`. It refuses with no call at all
   * unless the budget covers one extract, and unless the URL is on the row's own host and the row covers the
   * target's need. Facts are born `official_refresh`, `verified_at` = the read, `expires_at` = that plus the
   * row's interval (`refreshExpiresAt`). A station target's facts carry the OSM point the job resolved, with
   * its attribution in `value.point`. The plan-scoped `fetch` above is unchanged.
   */
  async fetchTarget(req: {
    target: { label: string; url: string; need: string; anchor: { kind: "station"; stationSlug: string; osmNodeId: number } | { kind: "place"; placeId: string } };
    market: string | null;
    /** A station target's point, resolved by the job from its OSM node; null/absent ⇒ stored unplaced. */
    point?: StationPoint | null;
    intervalDays: number;
    budgetCents: number;
  }): Promise<FactDraft[]> {
    this.lastRefused = [];
    const cost = tavilyExtractCostCents();
    if (!(req.budgetCents > 0) || req.budgetCents < cost) {
      this.lastOutcome = "refused_budget";
      return [];
    }
    const need = parentNeed(req.target.need);
    if (!need || !isContentNeedKey(req.target.need)) {
      this.lastOutcome = "no_facts";
      return [];
    }
    const standing = sourceNeedStanding(this.source, req.target.need);
    if (!this.source.active || this.source.adapter !== "tavily_extract" || (standing !== "covers" && standing !== "partial")) {
      this.lastOutcome = "no_facts";
      return [];
    }
    const host = this.source.homepage ? partnerHostOf(this.source.homepage) : null;
    const urlHost = partnerHostOf(req.target.url);
    if (!host || !urlHost || !/^https:\/\//i.test(req.target.url) || !isOnPartnerHost(urlHost, [host])) {
      this.lastOutcome = "no_host";
      return [];
    }
    const client = this.deps.client({
      userId: null,
      metadata: { purpose: CONTENT_FACTS_USAGE_PURPOSE, sourceId: this.source.id, tripId: null, basis: REFRESH_ORIGIN, targetUrl: req.target.url },
    });
    if (!client) {
      this.lastOutcome = "no_client";
      return [];
    }
    // A sub-need narrows the types: a last-train page answers `last_service` and nothing else.
    const factTypes: readonly FactType[] | undefined = req.target.need === "transport.local.last_service" ? ["last_service"] : undefined;
    const kept = await this.readFacts(client, req.target.url, { need, subject: req.target.label, actorId: null, factTypes });
    if (!kept) return [];

    const verifiedAt = new Date();
    const at = refreshPlaceRef(req.target.anchor, req.point ?? null);
    const placed = at.placeLat != null && req.point ? stationPointValue(req.point) : {};
    const out: FactDraft[] = kept.facts.map((f, i) => ({
      ...at,
      market: req.market,
      need: req.target.need as ContentNeed,
      factType: f.factType,
      value: { text: f.text, quote: f.quote, query: req.target.label, ...(f.fields ?? {}), ...placed },
      origin: REFRESH_ORIGIN,
      sourceId: this.source.id,
      sourceUrl: req.target.url,
      license: (this.source.licenseClass as LicenseClass) ?? null,
      fetchedAt: verifiedAt,
      verifiedAt,
      expiresAt: refreshExpiresAt(verifiedAt, req.intervalDays),
      costCents: i === 0 ? cost : 0,
    }));
    this.lastOutcome = "facts";
    return out;
  }
}

/**
 * Pure admission of the model's answer. A fact is kept only when its type is one this need can
 * hold, its text is present and short, and its quote appears VERBATIM on the page within the cap.
 * Every refusal is named.
 */
export function admitExtractedFacts(
  answer: unknown,
  opts: { allowed: readonly FactType[]; page: string; quoteMax: number },
): { facts: ExtractedFact[]; refused: { factType: string; reason: string }[] } {
  const facts: ExtractedFact[] = [];
  const refused: { factType: string; reason: string }[] = [];
  const list = (answer as any)?.facts;
  if (!Array.isArray(list)) return { facts, refused };
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const pageNorm = norm(opts.page);
  for (const f of list.slice(0, 10)) {
    const factType = String(f?.factType ?? "");
    const text = typeof f?.text === "string" ? f.text.trim() : "";
    const quote = typeof f?.quote === "string" ? f.quote.trim() : "";
    if (!(opts.allowed as readonly string[]).includes(factType)) { refused.push({ factType, reason: "type_not_for_need" }); continue; }
    if (!text || text.length > FACT_TEXT_MAX) { refused.push({ factType, reason: "bad_text" }); continue; }
    if (!quote) { refused.push({ factType, reason: "no_quote" }); continue; }
    if (quote.length > opts.quoteMax) { refused.push({ factType, reason: "quote_too_long" }); continue; }
    if (!pageNorm.includes(norm(quote))) { refused.push({ factType, reason: "quote_not_on_page" }); continue; }
    // FD-3: structured fields. The two feasibility types REQUIRE them, and every time they state must be
    // printed in the quote (`admitFeasibilityFact`); hours MAY carry Google-shaped lines, kept only when
    // every line parses. Free text alone is never turned into a time (ruling 1).
    const fields = structuredFields(factType, f?.fields, quote);
    if (fields === "refused") { refused.push({ factType, reason: "bad_fields" }); continue; }
    facts.push({ factType: factType as FactType, text, quote, ...(fields ? { fields } : {}) });
  }
  return { facts, refused };
}

export interface ExtractedFact {
  factType: FactType;
  text: string;
  quote: string;
  /** FD-3: the structured value, merged into the stored `value` beside text and quote. */
  fields?: Record<string, unknown>;
}

const STRUCTURED_FIELDS_INSTRUCTION =
  "For factType last_admission, add fields {byWeekday:{\"0\"..\"6\": \"HH:MM\" 24-hour, 0 = Sunday}, season?:{from:\"MM-DD\",to:\"MM-DD\"}} — the LATEST ENTRY time the page states, with the quote containing that time. " +
  "For factType last_service, add fields {operator, line, station, direction?, lastDeparture:\"HH:MM\", weekdays:[0-6], validFrom:\"YYYY-MM-DD\", validTo:\"YYYY-MM-DD\"} — the LAST DEPARTURE the page states, with the quote containing that time. " +
  "For factType hours you may add fields {weekdayDescriptions:[\"Monday: 9:00 AM – 5:00 PM\", …]} using exactly that line form. Omit fields you cannot read from the page.";

/** Pure. The fact's structured fields: an object to store, null for none, or "refused". */
export function structuredFields(factType: string, raw: unknown, quote: string): Record<string, unknown> | null | "refused" {
  if (isFeasibilityFactType(factType)) {
    if (!raw || typeof raw !== "object") return "refused";
    const value = factType === "last_admission" ? parseLastAdmission(raw) : parseLastService(raw);
    if (!value) return "refused";
    const verdict = admitFeasibilityFact({ factType, value: { ...value, quote }, origin: "crawled", license: "official", sourceUrl: "https://page.invalid/" });
    return verdict.ok ? (value as unknown as Record<string, unknown>) : "refused";
  }
  if (factType === "hours" && raw && typeof raw === "object") {
    const lines = (raw as any).weekdayDescriptions;
    if (!Array.isArray(lines) || !lines.length) return null;
    const strings = lines.map(String);
    for (let wd = 0; wd < 7; wd++) {
      const has = strings.some((l) => l.normalize("NFKC").trim().startsWith(`${HOURS_WEEKDAYS[wd]}:`));
      if (has && parseDayHours(strings, wd) === null) return null;
    }
    return { weekdayDescriptions: strings };
  }
  return null;
}
const HOURS_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
