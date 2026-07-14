/**
 * Kyoto Knowledge-Bar — scored expertise gate (Phase 1, docs/design + CLAUDE.md §12).
 *
 * Turns the free-text Knowledge-Proof answers (captured at local-expert onboarding) into a SCORED
 * signal that tests for the moat — comparative, current, LOCAL judgment — rather than essay length.
 *
 * Mechanism (ratified): AI-scored rubric + admin-confirm, launched ADVISORY. An LLM scores each
 * answer against the rubric; the score is stored and surfaced to the admin queue as decision
 * support. It does NOT auto-gate approval in v1 (approval still flows through the human admin), so
 * an unproven scorer never auto-rejects a real expert. The gate can be tightened once calibrated.
 *
 * Safety: every failure path (no API key, API error, unparseable output) returns an `unscored`
 * verdict with `overall: null` — scoring is best-effort and MUST NOT block onboarding or approval.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../infrastructure/logger";

// The knowledge-proof questions (mirrors the client onboarding step in travel-experts.tsx) — passed
// to the scorer so grading has the question context. Keep in sync if the onboarding questions change.
export const KNOWLEDGE_PROOF_QUESTIONS = [
  "Name your top pick for a local meal near a popular tourist area in your city. Where do you send the traveler — and where do you steer them away from, and why?",
  "What's one mistake almost every first-time visitor to your city makes? What's the local move instead?",
  "Describe a neighbourhood or experience in your city that guidebooks consistently miss. Who is it best for, and what makes it worth knowing?",
];

// ── Rubric ────────────────────────────────────────────────────────────────────────────────────
// Four dimensions, 0–3 each, straight from the Knowledge-Bar standard (supply map Layer 2):
export const RUBRIC_DIMENSIONS = ["weighted", "current_local", "negative", "personalization"] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

const DIMENSION_GUIDE: Record<RubricDimension, string> = {
  weighted:
    "WEIGHTED/COMPARATIVE (0-3): a specific, prioritized pick WITH REASONS a traveler can act on — not a list, not 'it depends'. 3 = a clear recommendation defended with tradeoffs; 0 = a generic list or non-answer.",
  current_local:
    "CURRENT & LOCAL (0-3): names real, specific places/neighbourhoods/conditions and reads as current on-the-ground knowledge the web hides — not paraphrased guidebook facts. 3 = concrete, insider, plausibly current; 0 = generic/web-copyable.",
  negative:
    "NEGATIVE / STEER-AWAY (0-3): surfaces what to AVOID — the tourist trap, the overrated 'famous' spot, the mistake — the knowledge the listing/web actively hides. 3 = a sharp, specific steer-away with why; 0 = all-positive, no risk signal.",
  personalization:
    "PERSONALIZATION / TRADEOFF (0-3): frames the answer around WHO it's for / the traveler's situation ('best for late arrivals', 'skip if you have kids'). 3 = clearly situational; 0 = one-size-fits-all.",
};

// Per-market "current local" scoring context — what genuine local knowledge looks like in THIS
// market, so the scorer rewards real insider judgment and isn't fooled by confident generic prose.
// First-draft for Kyoto (seed from the marketplace map + city-neighborhoods data) — refine with the
// decision-maker; it is scoring CONTEXT, not published content.
const MARKET_CONTEXT: Record<string, string> = {
  kyoto:
    "KYOTO context for grading (do not require all of it; use it to tell real local judgment from generic prose): " +
    "strong answers show awareness of things like — Gion/Higashiyama crowding and the etiquette/photography friction there; " +
    "the difference between tourist-clogged spots (e.g. Fushimi Inari mid-day, Arashiyama bamboo at peak) and when/where a local actually goes; " +
    "short-term-rental (minpaku) legality and why a cheap Airbnb may be unlicensed or cancellable; " +
    "seasonal reality (cherry-blossom and autumn-foliage crowds and pricing, summer humidity, the specific weeks that matter); " +
    "neighbourhood texture beyond the postcard (e.g. Demachiyanagi/Kamigyo vs the central tourist core), and transit realities (bus vs train, the late-arrival/early-train tradeoff). " +
    "A generic 'visit the temples, they are beautiful' answer is WEAK regardless of how well-written.",
};
const GENERIC_CONTEXT =
  "Grade for genuine, current, LOCAL insider judgment specific to the expert's stated city — reward concrete places, current conditions, and steer-aways; penalize generic, web-copyable, all-positive prose.";

// ── Types ─────────────────────────────────────────────────────────────────────────────────────
export interface AnswerScore {
  dimensions: Record<RubricDimension, number>; // 0-3 each
  score: number; // 0-12 (sum of dimensions)
  feedback: string; // one-line rationale for the admin
}
export type KnowledgeVerdict = "strong" | "adequate" | "weak" | "unscored";
export interface KnowledgeScore {
  overall: number | null; // 0-100 normalized, or null when unscored
  verdict: KnowledgeVerdict;
  perAnswer: AnswerScore[];
  market: string;
  model: string;
  localityProof: string | null;
  scoredAt: string;
  note?: string;
}

// Advisory thresholds (normalized 0-100). Tunable; not a hard gate in v1.
const STRONG_AT = 70;
const ADEQUATE_AT = 45;

function verdictFor(overall: number): KnowledgeVerdict {
  if (overall >= STRONG_AT) return "strong";
  if (overall >= ADEQUATE_AT) return "adequate";
  return "weak";
}

function unscored(market: string, localityProof: string | null, note: string): KnowledgeScore {
  return {
    overall: null,
    verdict: "unscored",
    perAnswer: [],
    market,
    model: "none",
    localityProof,
    scoredAt: new Date().toISOString(),
    note,
  };
}

const MODEL = process.env.EXPERTISE_SCORING_MODEL || "claude-sonnet-5";

/**
 * Score a set of knowledge-proof answers. Best-effort: any failure returns an `unscored` verdict.
 * @param answers        the free-text answers, in question order
 * @param questions      the questions they answered (for grading context)
 * @param localityProof  tenure signal (e.g. "born_raised") — recorded, lightly informs the note
 * @param market         market key (e.g. "kyoto") selecting the scoring context
 */
export async function scoreKnowledgeProof(
  answers: string[],
  questions: string[],
  localityProof: string | null,
  market: string,
): Promise<KnowledgeScore> {
  const marketKey = (market || "").trim().toLowerCase();
  const cleaned = (answers || []).map((a) => (typeof a === "string" ? a.trim() : "")).filter(Boolean);
  if (cleaned.length === 0) return unscored(marketKey || "unknown", localityProof, "no answers to score");
  if (!process.env.ANTHROPIC_API_KEY) {
    return unscored(marketKey || "unknown", localityProof, "scoring skipped — ANTHROPIC_API_KEY not configured");
  }

  const context = MARKET_CONTEXT[marketKey] || GENERIC_CONTEXT;
  const qa = cleaned
    .map((a, i) => `Q${i + 1}: ${questions[i] ?? "(question)"}\nA${i + 1}: ${a}`)
    .join("\n\n");

  const prompt =
    `You are grading a prospective LOCAL travel expert's "knowledge proof" answers to decide whether they show genuine local expertise a traveler cannot get from web search. ` +
    `Grade STRICTLY on the four rubric dimensions — do not reward fluent but generic writing.\n\n` +
    `RUBRIC (score each answer 0-3 per dimension):\n` +
    RUBRIC_DIMENSIONS.map((d) => `- ${DIMENSION_GUIDE[d]}`).join("\n") +
    `\n\nMARKET CONTEXT: ${context}\n\n` +
    `ANSWERS:\n${qa}\n\n` +
    `Return ONLY strict minified JSON, no prose, of the form: ` +
    `{"perAnswer":[{"weighted":0,"current_local":0,"negative":0,"personalization":0,"feedback":"one short sentence"}]} ` +
    `with exactly ${cleaned.length} entries in order.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return parseScore(text, MODEL, marketKey || "unknown", localityProof, cleaned.length);
  } catch (err: any) {
    logger.error(`[expertise-scoring] scoring failed: ${err?.message ?? "unknown"}`);
    return unscored(marketKey || "unknown", localityProof, `scoring error: ${err?.message ?? "unknown"}`);
  }
}

/** Parse + normalize the model's JSON. Robust to code fences / stray prose; falls back to unscored. */
export function parseScore(
  raw: string,
  model: string,
  market: string,
  localityProof: string | null,
  expectedCount: number,
): KnowledgeScore {
  try {
    const jsonStr = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON object found");
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    const rows: any[] = Array.isArray(parsed?.perAnswer) ? parsed.perAnswer : [];
    if (rows.length === 0) throw new Error("no perAnswer rows");

    const clamp = (n: any) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));
    const perAnswer: AnswerScore[] = rows.slice(0, expectedCount).map((r) => {
      const dimensions = {
        weighted: clamp(r.weighted),
        current_local: clamp(r.current_local),
        negative: clamp(r.negative),
        personalization: clamp(r.personalization),
      } as Record<RubricDimension, number>;
      const score = RUBRIC_DIMENSIONS.reduce((s, d) => s + dimensions[d], 0); // 0-12
      return { dimensions, score, feedback: String(r.feedback ?? "").slice(0, 280) };
    });

    const maxPossible = perAnswer.length * 12;
    const rawSum = perAnswer.reduce((s, a) => s + a.score, 0);
    const overall = maxPossible > 0 ? Math.round((rawSum / maxPossible) * 100) : 0;

    return {
      overall,
      verdict: verdictFor(overall),
      perAnswer,
      market,
      model,
      localityProof,
      scoredAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return unscored(market, localityProof, `unparseable model output: ${err?.message ?? "unknown"}`);
  }
}
