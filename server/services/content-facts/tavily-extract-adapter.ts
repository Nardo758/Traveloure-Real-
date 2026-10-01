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

/** What one lookup costs in cents: one search plus one extract, derived from config (§8). */
export function tavilyLookupCostCents(): number {
  return Math.round((TAVILY_PRICE_PER_SEARCH_USD + TAVILY_PRICE_PER_EXTRACT_USD) * 10000) / 100;
}

/** Which fact types a page may answer for each need. A type outside the list is refused. */
export const FACT_TYPES_FOR_NEED: Readonly<Record<ContentNeed, readonly FactType[]>> = {
  lodging: ["description", "price"],
  "transport.intercity": ["transit", "price"],
  "transport.local": ["transit", "price"],
  "transport.cruise": ["transit", "price"],
  "stop.hours": ["hours", "closure"],
  "stop.ticketing": ["ticketing_rule", "price"],
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

    try {
      await this.deps.robots(candidate);
    } catch {
      this.lastOutcome = "robots_disallowed";
      return [];
    }

    const extract = await client.extract([candidate], { format: "markdown" } as any);
    const page = String(extract?.results?.[0]?.rawContent ?? "").trim().slice(0, PAGE_CHAR_LIMIT);
    if (!page) {
      this.lastOutcome = "empty_page";
      return [];
    }

    const allowed = FACT_TYPES_FOR_NEED[req.need];
    const quoteMax = factQuoteMaxChars();
    let answer: unknown;
    try {
      ({ result: answer } = await this.deps.complete({
        system:
          "You read one web page and report facts about ONE named place. Report only what the page states. " +
          `Each fact has: factType (one of ${allowed.join(", ")}), text (a plain-English statement, at most ${FACT_TEXT_MAX} characters), ` +
          `and quote (an exact, verbatim excerpt from the page that supports it, at most ${quoteMax} characters). ` +
          'If the page says nothing about the place for these types, return {"facts":[]}. Never guess.',
        user: `Place: ${queryText}\nNeed: ${req.need}\nPage URL: ${candidate}\n\nPAGE:\n${page}\n\nReturn {"facts":[{"factType":"…","text":"…","quote":"…"}]}`,
        maxTokens: 1200,
        sourceType: "content_fact_extract",
        userId: ctx?.actorId ?? null,
        label: `content-facts:tavily_extract:${this.source.id}`,
      }));
    } catch (err) {
      console.error("[tavily-extract] model call failed:", (err as Error)?.message ?? err);
      this.lastOutcome = "model_failed";
      return [];
    }

    const kept = admitExtractedFacts(answer, { allowed, page, quoteMax });
    this.lastRefused = kept.refused;
    if (!kept.facts.length) {
      this.lastOutcome = "no_facts";
      return [];
    }

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
        value: { text: f.text, quote: f.quote, query: queryText },
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
}

/**
 * Pure admission of the model's answer. A fact is kept only when its type is one this need can
 * hold, its text is present and short, and its quote appears VERBATIM on the page within the cap.
 * Every refusal is named.
 */
export function admitExtractedFacts(
  answer: unknown,
  opts: { allowed: readonly FactType[]; page: string; quoteMax: number },
): { facts: { factType: FactType; text: string; quote: string }[]; refused: { factType: string; reason: string }[] } {
  const facts: { factType: FactType; text: string; quote: string }[] = [];
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
    facts.push({ factType: factType as FactType, text, quote });
  }
  return { facts, refused };
}
