/**
 * Blog research + AI draft (Lane C.2; ledger `2026-09-27-blog-draft`, Locked Decision 57).
 *
 *   research (Tavily, spend-capped by the wrapper) → AI draft that cites ONLY the gathered sources
 *   (cost-tracked) → an ordinary `draft` post through the ONE `createPost`. The expert still reviews and
 *   signs it (C.1); nothing here publishes.
 *
 * Rules that must not be weakened:
 *  - NO SOURCES, NO DRAFT. A draft is never written from the model's own knowledge.
 *  - A result on a partner's domain is DROPPED at research (ruling 4), and a snippet longer than
 *    `BLOG_QUOTE_MAX_CHARS` keeps its URL and title but NO quote — a quote is never cut mid-sentence.
 *  - The model may cite only `[n]` for the n sources it was given; a draft citing anything else, or
 *    nothing at all, is REFUSED whole (`draft_cites_unknown_source` / `draft_cites_nothing`).
 *  - Only three types are web-drafted: occasion×market guides, TravelPulse weekly and link roundups.
 *    Field knowledge comes from verified, consented nuggets and gems roundups are expert-curated, so
 *    neither is drafted from the web (content-type ruling).
 *  - Every model response with usage writes one `ai_cost_tracking` row (sourceType `ai_blog_draft`,
 *    actor = the admin who asked) through the ONE tracker, before the answer is parsed.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getTavilyClient } from "./tavily-client";
import { trackAnthropicResponse } from "./ai-cost-tracker";
import { BLOG_DRAFT_MAX_TOKENS, BLOG_DRAFT_MODEL, BLOG_QUOTE_MAX_CHARS, BLOG_RESEARCH_MAX_SOURCES } from "../config/blog.config";
import { BlogError, createPost, sourceRefusal, type BlogSourceInput, type BlogDeps } from "./blog-posts.service";
import { loadPartnerHosts } from "./partner-hosts.service";
import { isBlogContentType, type BlogContentType } from "@shared/blog";

export const WEB_DRAFTED_TYPES: readonly BlogContentType[] = ["occasion_market_guide", "travelpulse_weekly", "link_roundup"];

export interface SearchHit { url: string; title?: string; content?: string }
export interface DraftDeps extends BlogDeps {
  search?: ((query: string) => Promise<SearchHit[]>) | null;
  model?: ((input: { system: string; user: string; actorId: string; requestId: string }) => Promise<string>) | null;
}

// ── Pure pieces ─────────────────────────────────────────────────────────────────────────────

/** Keeps admissible hits in order, drops partner domains and invalid URLs, never trims a quote. */
export function selectSources(
  hits: readonly SearchHit[],
  partnerHosts: readonly string[],
  max = BLOG_RESEARCH_MAX_SOURCES,
  quoteMax = BLOG_QUOTE_MAX_CHARS,
): BlogSourceInput[] {
  const out: BlogSourceInput[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (out.length >= max) break;
    if (!h.url || seen.has(h.url)) continue;
    const content = (h.content ?? "").trim();
    const candidate: BlogSourceInput = {
      url: h.url,
      title: h.title ? h.title.slice(0, 300) : null,
      quote: content && content.length <= quoteMax ? content : null,
      retrievedAt: new Date(),
    };
    if (sourceRefusal(candidate, partnerHosts, quoteMax)) continue;
    seen.add(h.url);
    out.push(candidate);
  }
  return out;
}

export const DRAFT_SYSTEM_PROMPT = [
  "You draft a short travel article for Traveloure from the numbered sources you are given, and nothing else.",
  "Every factual sentence cites one or more sources inline as [n], using ONLY the numbers listed.",
  "Do not state prices, opening hours, dates or rankings unless a source states them; if the sources do not cover something, leave it out.",
  "Do not quote more than one short sentence from any source. Plain, practical prose; no superlatives, no emoji.",
  'Return ONLY strict minified JSON: {"title":"…","summary":"one sentence","body":"markdown with [n] citations"}.',
].join("\n");

export function buildDraftPrompt(input: { contentType: BlogContentType; topic: string; marketSlug: string | null; sources: readonly BlogSourceInput[] }): string {
  const lines = [
    `Type: ${input.contentType}. Market: ${input.marketSlug ?? "none"}. Topic: ${input.topic}`,
    "Sources:",
    ...input.sources.map((s, i) => `[${i + 1}] ${s.title ?? s.url} — ${s.url}${s.quote ? `\n    excerpt: ${s.quote}` : ""}`),
  ];
  return lines.join("\n");
}

/** Pure. Null unless the JSON is well-formed AND every citation names a supplied source. */
export function parseDraft(raw: string, sourceCount: number): { title: string; summary: string; body: string } | { error: string } {
  let obj: any;
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    obj = JSON.parse(trimmed);
  } catch {
    return { error: "draft_malformed" };
  }
  if (typeof obj?.title !== "string" || typeof obj?.body !== "string" || !obj.title.trim() || !obj.body.trim()) {
    return { error: "draft_malformed" };
  }
  const cited = Array.from(obj.body.matchAll(/\[(\d+)\]/g), (m: RegExpMatchArray) => Number(m[1]));
  if (cited.length === 0) return { error: "draft_cites_nothing" };
  if (cited.some((n) => n < 1 || n > sourceCount)) return { error: "draft_cites_unknown_source" };
  return { title: obj.title.trim().slice(0, 200), summary: typeof obj.summary === "string" ? obj.summary.trim() : "", body: obj.body.trim() };
}

// ── Production dependencies ─────────────────────────────────────────────────────────────────

function defaultSearch(): DraftDeps["search"] {
  const client = getTavilyClient();
  if (!client) return null;
  return async (query) => {
    const r = await client.search(query, { maxResults: BLOG_RESEARCH_MAX_SOURCES, searchDepth: "basic", includeAnswer: false } as any);
    return (r?.results ?? []).map((x: any) => ({ url: String(x?.url ?? ""), title: x?.title ? String(x.title) : undefined, content: x?.content ? String(x.content) : undefined }));
  };
}

function defaultModel(): DraftDeps["model"] {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return async ({ system, user, actorId, requestId }) => {
    const resp = await client.messages.create({
      model: BLOG_DRAFT_MODEL,
      max_tokens: BLOG_DRAFT_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    await trackAnthropicResponse(resp as any, { sourceType: "ai_blog_draft", userId: actorId, requestId });
    return resp.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").trim();
  };
}

// ── The pipeline ────────────────────────────────────────────────────────────────────────────

export interface DraftRequest {
  contentType: string;
  slug: string;
  topic: string;
  marketSlug?: string | null;
  occasionSlug?: string | null;
  bylineExpertId?: string | null;
}

export async function draftPostFromResearch(req: DraftRequest, actorId: string, deps: DraftDeps = {}) {
  if (!isBlogContentType(req.contentType)) throw new BlogError("unknown_content_type", 400);
  const contentType = req.contentType as BlogContentType;
  if (!WEB_DRAFTED_TYPES.includes(contentType)) throw new BlogError("type_is_not_web_drafted", 400);
  const search = deps.search === undefined ? defaultSearch() : deps.search;
  if (!search) throw new BlogError("research_unavailable", 503);
  const model = deps.model === undefined ? defaultModel() : deps.model;
  if (!model) throw new BlogError("drafting_unavailable", 503);

  const query = [req.topic, req.marketSlug ?? ""].filter(Boolean).join(" ");
  const hits = await search(query);
  const hosts = await (deps.refusedHosts ?? loadPartnerHosts)();
  const sources = selectSources(hits, hosts);
  if (sources.length === 0) throw new BlogError("no_sources", 422);

  const raw = await model({
    system: DRAFT_SYSTEM_PROMPT,
    user: buildDraftPrompt({ contentType, topic: req.topic, marketSlug: req.marketSlug ?? null, sources }),
    actorId,
    requestId: req.slug,
  });
  const parsed = parseDraft(raw, sources.length);
  if ("error" in parsed) throw new BlogError(parsed.error, 422);

  return createPost({
    contentType,
    slug: req.slug,
    title: parsed.title,
    summary: parsed.summary || null,
    body: parsed.body,
    marketSlug: req.marketSlug ?? null,
    occasionSlug: req.occasionSlug ?? null,
    bylineExpertId: req.bylineExpertId ?? null,
    sources,
  }, actorId, deps);
}
