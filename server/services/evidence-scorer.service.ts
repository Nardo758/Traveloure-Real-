/**
 * EVIDENCE SCORER — expert field knowledge v2, Phase 2 (ruling 2026-09-01-scorer-model).
 *
 * First-pass scorer for a submitted neighborhood claim: Sonnet, the companion §2 rubric as the
 * system prompt, output validated against the §4 contract (zod), then EXACTLY two hooks into the
 * claim machine — markClaimScored (valid) or markClaimScorerFailed (anything else; the claim stays
 * `submitted`, flagged, never silently zeroed). It never touches expert_neighborhoods (the
 * migration-272 trigger would refuse it anyway — proven in the suite).
 *
 * Inputs are the claim's TYPED rows — P1 nuggets, the P2 mini-slip, the P3 contingency. P4
 * access_claims are NEVER read (ruling 2026-09-01-access-claims-held).
 *
 * Web-gap check (ruling 2026-09-01-web-gap-check): one search per P1 entry, `{name} {neighborhood}`,
 * top-three results handed to the model as snippets; the model's `found | partial | absent`
 * verdict + URL is written to local_knowledge_nuggets.web_gap*. `found` caps Localness at the
 * `web_gap_found_localness_cap` threshold row. No search key ⇒ verdict stays NULL, Localness is
 * scored without the cap, and scorer_json.web_gap_available=false so the admin view says so.
 *
 * Numbers: none in this file. Every pass threshold comes from evidence_thresholds
 * (loadEvidenceThresholds — thresholds_missing blocks scoring); operational shape comes from
 * server/config/evidence-scorer.config.ts. §13: no ANTHROPIC_API_KEY ⇒ no call, reason `no_key`.
 *
 * Idempotent on (claim_id, version): a claim that is not `submitted` at that version, or that is
 * already flagged, is skipped — a rescore is an explicit admin action (requestRescore).
 *
 * Dependencies (model call, web search) are injectable so the DB suite proves the machine without
 * network; production wiring is `@anthropic-ai/sdk` + `tavily`, key-gated.
 */
import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "tavily";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimContingencies,
  cityNeighborhoods,
  expertNeighborhoodClaims,
  localKnowledgeNuggets,
  miniSlipTemplates,
} from "@shared/schema";
import {
  EVIDENCE_DIMENSIONS,
  EVIDENCE_UNLOCKS,
  SCORER_FLAG_PREFIXES,
  buildScorerOutputSchema,
  normalizeVenueName,
  type EvidenceDimension,
  type EvidenceUnlock,
  type ScorerJson,
  type ScorerModelOutput,
} from "@shared/neighborhood-claims";
import {
  EVIDENCE_SCORER_BATCH_SIZE,
  EVIDENCE_SCORER_MAX_TOKENS,
  EVIDENCE_SCORER_MODEL,
  WEB_GAP_MAX_SEARCHES_PER_CLAIM,
  WEB_GAP_SEARCH_DEPTH,
  WEB_GAP_SNIPPET_CONTENT_CHARS,
  WEB_GAP_SNIPPET_TITLE_CHARS,
  WEB_GAP_TOP_RESULTS,
  topResults,
} from "../config/evidence-scorer.config";
import { EvidenceThresholdsMissingError, loadEvidenceThresholds, type EvidenceThresholds } from "./evidence-thresholds.service";
import { markClaimScored, markClaimScorerFailed } from "./neighborhood-claims.service";
import { logger } from "../infrastructure/logger";

// ── Injectable dependencies ─────────────────────────────────────────────────────────────────

export interface WebSearchHit { url: string; title?: string; content?: string }
export interface ScorerDeps {
  /** Returns the model's raw text for (system, user). `null` = no model available (no key). */
  model?: ((input: { system: string; user: string }) => Promise<string>) | null;
  /** Returns the top results for a query. `null` = no search client available (no key). */
  search?: ((query: string) => Promise<WebSearchHit[]>) | null;
  /** Model label recorded on scorer_json. */
  modelName?: string;
}

function defaultModel(): ScorerDeps["model"] {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return async ({ system, user }) => {
    const resp = await client.messages.create({
      model: EVIDENCE_SCORER_MODEL,
      max_tokens: EVIDENCE_SCORER_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    return resp.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").trim();
  };
}

function defaultSearch(): ScorerDeps["search"] {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const client = tavily({ apiKey });
  return async (query) => {
    const r = await client.search(query, { maxResults: WEB_GAP_TOP_RESULTS, searchDepth: WEB_GAP_SEARCH_DEPTH, includeAnswer: false } as any);
    const hits: WebSearchHit[] = (r?.results ?? []).map((x: any) => ({ url: String(x?.url ?? ""), title: x?.title ? String(x.title) : undefined, content: x?.content ? String(x.content) : undefined }));
    return topResults(hits);
  };
}

// ── Prompt (companion §2 rubric + §4 contract, verbatim dimensions) ──────────────────────────

const RUBRIC_SYSTEM_PROMPT = [
  "You are the first-pass reviewer for a local expert's neighborhood evidence capture. Grade STRICTLY on four dimensions, each an integer from 0 up to the stated maximum; do not reward fluent generic prose.",
  "",
  "SPECIFICITY — 0: a category or area (\"a good izakaya near Shijō\"); 1: a named place; max: named + operational detail (which entrance, counter vs. table, the hour that matters).",
  "VERIFIABILITY — 0: opinion with no checkable claim; 1: checkable in principle; max: contains a date, hour, price, or condition a scout could confirm or refute on a visit.",
  "LOCALNESS (web gap) — 0: matches the top-of-Google / guidebook consensus; 1: known, but needs context the web doesn't give to be usable; max: not findable, or contradicts the web consensus with a stated reason.",
  "PRACTICALITY — 0: unusable as written; 1: usable; max: usable, with the failure mode named.",
  "",
  "Score every P1 place entry, P2 (the composed outing) as a whole, and P3 (the contingency) as a whole.",
  "",
  "WEB GAP: when search snippets are supplied for a P1 entry, decide whether the expert's do_this + watch_out are substantively present in them — 'found' (the web already says this), 'partial' (part of it), 'absent' (not there, or contradicted with a reason). Return the most relevant snippet URL. When no snippets are supplied, return web_gap null.",
  "P2 hard_constraint_valid is true only when at least one hard constraint is a real operational fact (a last entry, reservation window, closure day or last train), not a vague note.",
  "",
  "FLAGS (raise when warranted, as strings): 'guidebook_phrasing_<row_id>' when a P1 entry is near-verbatim to a supplied snippet; 'contradiction' when the P3 alternate contradicts a P2 hard constraint or the P2 order; anything else is ignored.",
  "",
  "Return ONLY strict minified JSON, no prose, no code fences, of the form:",
  '{"p1":[{"row_id":"…","specificity":<int>,"verifiability":<int>,"localness":<int>,"practicality":<int>,"web_gap":"found|partial|absent|null","web_gap_url":"…|null","note":"one line for admin"}],"p2":{"specificity":<int>,"verifiability":<int>,"localness":<int>,"practicality":<int>,"hard_constraint_valid":true|false,"note":"…"},"p3":{"specificity":<int>,"verifiability":<int>,"localness":<int>,"practicality":<int>,"note":"…"},"flags":["…"]}',
  "Use exactly the row_id values supplied for P1, one object per P1 entry, in order.",
].join("\n");

/** Leading `n` characters (no literal at the call site). */
const head = (text: string, n: number): string => text.substring(text.length - text.length, n);

interface P1Row { id: string; name: string; category: string | null; doThis: string; when: unknown; watchOut: string | null; normalizedName: string | null; snippets: WebSearchHit[] | null }

function buildUserPrompt(input: {
  neighborhoodName: string;
  city: string;
  daypart: string;
  dimensionMax: number;
  p1: P1Row[];
  p2: { items: unknown; orderReason: string; hardConstraints: unknown } | null;
  p3: Array<{ trigger: string; replacesPosition: number | null; alternate: unknown; reason: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`Neighborhood: ${input.neighborhoodName}, ${input.city}. Composed daypart: ${input.daypart}. Each dimension is an integer from 0 to ${input.dimensionMax}.`);
  lines.push("", "P1 — PLACES:");
  for (const r of input.p1) {
    lines.push(`- row_id: ${r.id}`);
    lines.push(`  name: ${r.name}${r.category ? ` (${r.category})` : ""}`);
    lines.push(`  do_this: ${r.doThis}`);
    lines.push(`  when: ${JSON.stringify(r.when ?? {})}`);
    lines.push(`  watch_out: ${r.watchOut ?? ""}`);
    if (r.snippets === null) lines.push("  web snippets: (no search client configured — return web_gap null)");
    else if (!r.snippets.length) lines.push("  web snippets: (search returned nothing — treat as absent)");
    else for (const s of r.snippets) lines.push(`  snippet: [${s.url}] ${head(s.title ?? "", WEB_GAP_SNIPPET_TITLE_CHARS)} — ${head(s.content ?? "", WEB_GAP_SNIPPET_CONTENT_CHARS)}`);
  }
  lines.push("", "P2 — COMPOSED OUTING:");
  if (input.p2) {
    lines.push(`  items: ${JSON.stringify(input.p2.items)}`);
    lines.push(`  order_reason: ${input.p2.orderReason}`);
    lines.push(`  hard_constraints: ${JSON.stringify(input.p2.hardConstraints)}`);
  } else lines.push("  (missing)");
  lines.push("", "P3 — CONTINGENCY:");
  if (!input.p3.length) lines.push("  (missing)");
  for (const c of input.p3) {
    lines.push(`  trigger: ${c.trigger}; replaces_position: ${c.replacesPosition ?? "whole outing"}`);
    lines.push(`  alternate: ${JSON.stringify(c.alternate)}`);
    lines.push(`  reason: ${c.reason}`);
  }
  return lines.join("\n");
}

function parseModelJson(raw: string, dimensionMax: number): ScorerModelOutput | null {
  try {
    const cleaned = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    if (!~start || !cleaned.includes("}")) return null;
    // from the first "{" through the last "}" — strip any trailing prose after the object
    const parsed = JSON.parse(cleaned.slice(start).replace(/[^}]*$/, ""));
    const r = buildScorerOutputSchema(dimensionMax).safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ── Mechanical pieces: totals, unlocks, weakest dimension, flags ─────────────────────────────

type Dims = Record<EvidenceDimension, number>;
const total = (d: Dims): number => EVIDENCE_DIMENSIONS.map((k) => d[k]).reduce((a, b) => a + b);

function recommendedUnlocks(t: EvidenceThresholds, p1: Array<Dims & { total: number }>, p2: Dims & { total: number; hard_constraint_valid: boolean }, p3: Dims & { total: number }): EvidenceUnlock[] {
  const qualifyingPlaces = p1.filter(
    (e) => e.total >= t.p1_entry_min_total && e.localness >= t.p1_entry_min_localness && e.verifiability >= t.p1_entry_min_verifiability,
  ).length;
  const places = qualifyingPlaces >= t.p1_min_entries;
  const sequencing = places && p2.total >= t.p2_min_total && p2.practicality >= t.p2_min_practicality && p2.hard_constraint_valid;
  const contingency = sequencing && p3.total >= t.p3_min_total && p3.specificity >= t.p3_alternate_min_specificity;
  return EVIDENCE_UNLOCKS.filter((u) => (u === "places" ? places : u === "sequencing" ? sequencing : contingency));
}

function weakestDimension(rows: Dims[]): EvidenceDimension {
  const avg = (k: EvidenceDimension) => rows.map((r) => r[k]).reduce((a, b) => a + b) / rows.length;
  return [...EVIDENCE_DIMENSIONS].reduce((worst, k) => (avg(k) < avg(worst) ? k : worst));
}

function whenIsUnparseable(when: unknown): boolean {
  if (!when || typeof when !== "object") return true;
  const w = when as Record<string, unknown>;
  return !["hours", "days", "season"].some((k) => typeof w[k] === "string" && (w[k] as string).trim() !== "");
}

/** D7 duplicate check: same venue + same watch_out already VERIFIED by another expert (informational). */
async function duplicateFlags(claimExpertId: string, p1: P1Row[]): Promise<string[]> {
  const names = p1.map((r) => r.normalizedName).filter((n): n is string => !!n);
  if (!names.length) return [];
  const rows = await db
    .select({ expertId: localKnowledgeNuggets.expertUserId, normalizedName: localKnowledgeNuggets.normalizedName, watchOut: localKnowledgeNuggets.watchOut })
    .from(localKnowledgeNuggets)
    .innerJoin(expertNeighborhoodClaims, eq(expertNeighborhoodClaims.id, localKnowledgeNuggets.claimId))
    .where(and(inArray(localKnowledgeNuggets.normalizedName, names), ne(localKnowledgeNuggets.expertUserId, claimExpertId), eq(expertNeighborhoodClaims.status, "verified")));
  const flags = new Set<string>();
  for (const mine of p1) {
    for (const other of rows) {
      if (other.normalizedName === mine.normalizedName && normalizeVenueName(other.watchOut ?? "") === normalizeVenueName(mine.watchOut ?? "")) {
        flags.add(`duplicate_of_expert_${other.expertId}`);
      }
    }
  }
  return Array.from(flags);
}

function keepRulingFlags(flags: string[]): string[] {
  return Array.from(new Set(flags.filter((f) => SCORER_FLAG_PREFIXES.some((p) => f.startsWith(p)))));
}

// ── The scorer ──────────────────────────────────────────────────────────────────────────────

export type ScoreClaimResult =
  | { outcome: "scored"; claimId: string; version: number; recommendedUnlocks: EvidenceUnlock[] }
  | { outcome: "failed"; claimId: string; version: number; reason: string }
  | { outcome: "skipped"; claimId: string; reason: string };

export async function scoreClaim(opts: { claimId: string; version?: number }, deps: ScorerDeps = {}): Promise<ScoreClaimResult> {
  const [claim] = await db
    .select({ claim: expertNeighborhoodClaims, neighborhoodName: cityNeighborhoods.name, city: cityNeighborhoods.city })
    .from(expertNeighborhoodClaims)
    .innerJoin(cityNeighborhoods, eq(cityNeighborhoods.id, expertNeighborhoodClaims.neighborhoodId))
    .where(eq(expertNeighborhoodClaims.id, opts.claimId));
  if (!claim) return { outcome: "skipped", claimId: opts.claimId, reason: "not_found" };
  const row = claim.claim;
  const version = opts.version ?? row.version;
  if (row.status !== "submitted" || row.version !== version) {
    return { outcome: "skipped", claimId: row.id, reason: `not_submitted_at_version:${row.status}@${row.version}` };
  }
  if (row.scorerFailed) return { outcome: "skipped", claimId: row.id, reason: `already_flagged:${row.scorerFailedReason ?? ""}` };

  const fail = async (reason: string): Promise<ScoreClaimResult> => {
    await markClaimScorerFailed({ claimId: row.id, version, reason });
    return { outcome: "failed", claimId: row.id, version, reason };
  };

  // D3: thresholds first — no numbers exist without them.
  let thresholds: EvidenceThresholds;
  try {
    thresholds = await loadEvidenceThresholds();
  } catch (err) {
    if (err instanceof EvidenceThresholdsMissingError) return fail("thresholds_missing");
    throw err;
  }

  const model = deps.model === undefined ? defaultModel() : deps.model;
  if (!model) return fail("no_key");
  const search = deps.search === undefined ? defaultSearch() : deps.search;
  const modelName = deps.modelName ?? EVIDENCE_SCORER_MODEL;

  // Typed rows for this version. P4 is deliberately NOT selected (held).
  const nuggets = await db
    .select()
    .from(localKnowledgeNuggets)
    .where(and(eq(localKnowledgeNuggets.claimId, row.id), eq(localKnowledgeNuggets.claimVersion, version)))
    .orderBy(localKnowledgeNuggets.createdAt, localKnowledgeNuggets.id);
  const [template] = await db
    .select()
    .from(miniSlipTemplates)
    .where(and(eq(miniSlipTemplates.claimId, row.id), eq(miniSlipTemplates.claimVersion, version)));
  const contingencies = await db
    .select()
    .from(claimContingencies)
    .where(and(eq(claimContingencies.claimId, row.id), eq(claimContingencies.claimVersion, version)));
  if (!nuggets.length || !template || !contingencies.length) return fail("evidence_rows_missing");

  // Web-gap search: one query per P1 entry, capped per claim; null when no client.
  const webGapAvailable = !!search;
  const p1: P1Row[] = [];
  // Search budget per claim (ruling: ~3 per capture) — one token popped per search, no counters.
  const searchBudget: true[] = Array.from({ length: WEB_GAP_MAX_SEARCHES_PER_CLAIM }, () => true);
  for (const n of nuggets) {
    let snippets: WebSearchHit[] | null = null;
    if (search && searchBudget.pop()) {
      try {
        snippets = await search(`${n.linkedPoi ?? ""} ${claim.neighborhoodName}`.trim());
      } catch (err: any) {
        logger.error(`[evidence-scorer] web-gap search failed for nugget ${n.id}: ${err?.message ?? err}`);
        snippets = [];
      }
    }
    p1.push({ id: n.id, name: n.linkedPoi ?? "", category: n.placeCategory, doThis: n.insight, when: n.whenJson, watchOut: n.watchOut, normalizedName: n.normalizedName, snippets });
  }

  const user = buildUserPrompt({
    neighborhoodName: claim.neighborhoodName,
    city: claim.city,
    daypart: row.daypart,
    dimensionMax: thresholds.dimension_max,
    p1,
    p2: { items: template.items, orderReason: template.orderReason, hardConstraints: template.hardConstraints },
    p3: contingencies.map((c) => ({ trigger: c.trigger, replacesPosition: c.replacesPosition, alternate: c.alternate, reason: c.reason })),
  });

  let raw: string;
  try {
    raw = await model({ system: RUBRIC_SYSTEM_PROMPT, user });
  } catch (err: any) {
    logger.error(`[evidence-scorer] model call failed for claim ${row.id}: ${err?.message ?? err}`);
    return fail("model_error");
  }
  const parsed = parseModelJson(raw, thresholds.dimension_max);
  if (!parsed) return fail("malformed_output");
  const byRowId = new Map(parsed.p1.map((e) => [e.row_id, e]));
  if (p1.some((r) => !byRowId.has(r.id))) return fail("malformed_output");

  // Assemble: cap Localness on `found`, totals, unlocks, weakest, flags.
  const p1Scored = p1.map((r) => {
    const e = byRowId.get(r.id)!;
    const webGap = webGapAvailable ? e.web_gap : null;
    const localness = webGap === "found" ? Math.min(e.localness, thresholds.web_gap_found_localness_cap) : e.localness;
    const dims: Dims = { specificity: e.specificity, verifiability: e.verifiability, localness, practicality: e.practicality };
    return { row_id: r.id, ...dims, total: total(dims), web_gap: webGap, web_gap_url: webGapAvailable ? e.web_gap_url : null, note: e.note, localness_uncapped: e.localness };
  });
  const p2Dims: Dims = { specificity: parsed.p2.specificity, verifiability: parsed.p2.verifiability, localness: parsed.p2.localness, practicality: parsed.p2.practicality };
  const p3Dims: Dims = { specificity: parsed.p3.specificity, verifiability: parsed.p3.verifiability, localness: parsed.p3.localness, practicality: parsed.p3.practicality };
  const p2 = { ...p2Dims, total: total(p2Dims), hard_constraint_valid: parsed.p2.hard_constraint_valid, note: parsed.p2.note };
  const p3 = { ...p3Dims, total: total(p3Dims), note: parsed.p3.note };

  const flags = keepRulingFlags([
    ...parsed.flags,
    ...p1.filter((r) => whenIsUnparseable(r.when)).map((r) => `unparseable_when_${r.id}`),
    ...(await duplicateFlags(row.expertId, p1)),
  ]);

  const scorerJson: ScorerJson = {
    claim_id: row.id,
    version,
    model: modelName,
    scored_at: new Date().toISOString(),
    web_gap_available: webGapAvailable,
    p1: p1Scored,
    p2,
    p3,
    recommended_unlocks: recommendedUnlocks(thresholds, p1Scored, p2, p3),
    weakest_dimension: weakestDimension([...p1Scored, p2, p3]),
    flags,
  };

  // Web-gap verdicts onto the P1 rows (only when a search actually ran).
  if (webGapAvailable) {
    const checkedAt = new Date();
    for (const e of p1Scored) {
      await db
        .update(localKnowledgeNuggets)
        .set({ webGap: e.web_gap, webGapUrl: e.web_gap_url, webGapCheckedAt: checkedAt })
        .where(and(eq(localKnowledgeNuggets.id, e.row_id), eq(localKnowledgeNuggets.claimId, row.id)));
    }
  }

  const marked = await markClaimScored({ claimId: row.id, version, scorerJson: scorerJson as unknown as Record<string, unknown> });
  if (!marked.ok) return { outcome: "skipped", claimId: row.id, reason: marked.code };
  return { outcome: "scored", claimId: row.id, version, recommendedUnlocks: scorerJson.recommended_unlocks };
}

// ── Runner: every submitted, unflagged claim (endpoint = authoritative; timer = defense) ─────

export interface ScorePendingResult { scanned: number; scored: number; failed: number; skipped: number; results: ScoreClaimResult[] }

export async function scorePendingClaims(opts: { limit?: number } = {}, deps: ScorerDeps = {}): Promise<ScorePendingResult> {
  const limit = opts.limit ?? EVIDENCE_SCORER_BATCH_SIZE;
  const pending = await db
    .select({ id: expertNeighborhoodClaims.id, version: expertNeighborhoodClaims.version })
    .from(expertNeighborhoodClaims)
    .where(and(eq(expertNeighborhoodClaims.status, "submitted"), eq(expertNeighborhoodClaims.scorerFailed, false), sql`${expertNeighborhoodClaims.scorerJson} IS NULL`))
    .orderBy(expertNeighborhoodClaims.submittedAt)
    .limit(limit);
  const results: ScoreClaimResult[] = [];
  for (const p of pending) {
    try {
      results.push(await scoreClaim({ claimId: p.id, version: p.version }, deps));
    } catch (err: any) {
      logger.error(`[evidence-scorer] unexpected failure on claim ${p.id}: ${err?.message ?? err}`);
      results.push({ outcome: "skipped", claimId: p.id, reason: "unexpected_error" });
    }
  }
  return {
    scanned: pending.length,
    scored: results.filter((r) => r.outcome === "scored").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  };
}
