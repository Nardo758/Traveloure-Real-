/**
 * Evidence scorer configuration — expert field knowledge v2, Phase 2.
 *
 * Rulings: 2026-09-01-scorer-model (first pass is Sonnet with the companion §2 rubric as system
 * prompt), 2026-09-01-web-gap-check (one search per P1 entry, TOP THREE results),
 * 2026-09-01-evidence-thresholds-config (every PASS threshold lives in evidence_thresholds — none
 * here). What lives here is operational shape only: which model, how much output to allow, how many
 * search results the ruling names, and the defense-in-depth timer cadence. The scorer file itself
 * carries no numeric literal; it reads these and evidence_thresholds.
 */

/** Ruling 2026-09-01-scorer-model: Sonnet. Env override for a controlled A/B, never a silent default swap. */
export const EVIDENCE_SCORER_MODEL = process.env.EVIDENCE_SCORER_MODEL || "claude-sonnet-5";

/** Output ceiling for one claim's §4 JSON (three P1 rows + P2 + P3 + notes fit comfortably). */
export const EVIDENCE_SCORER_MAX_TOKENS = 4096;

/** Ruling 2026-09-01-web-gap-check: "top three results" per P1 entry. */
export const WEB_GAP_TOP_RESULTS = 3;

/** Tavily search depth for the web-gap check — same as dmo-ingestion.service.ts's discover step. */
export const WEB_GAP_SEARCH_DEPTH = "basic" as const;

/** Ruling: ~3 searches per capture; a capture with more P1 rows than this never searches more. */
export const WEB_GAP_MAX_SEARCHES_PER_CLAIM = 3;

/** Pending-claim batch size for one runner pass (endpoint or timer). */
export const EVIDENCE_SCORER_BATCH_SIZE = 20;

/** Defense-in-depth timer (the internal endpoint is the authoritative runner — §26 posture). */
export const EVIDENCE_SCORER_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const EVIDENCE_SCORER_FIRST_RUN_DELAY_MS = 7 * 60 * 1000;

/** Snippet truncation handed to the model (prompt-size hygiene, not a threshold). */
export const WEB_GAP_SNIPPET_TITLE_CHARS = 120;
export const WEB_GAP_SNIPPET_CONTENT_CHARS = 600;

/** First N of a list — kept here so the scorer file stays literal-free. */
export function topResults<T>(list: readonly T[], n: number = WEB_GAP_TOP_RESULTS): T[] {
  return list.slice(0, n);
}
