/**
 * ai-draft-model.ts — the model tier the FREE AI draft runs on.
 *
 * CLAUDE.md Locked Decision 41 (c) / ledger `2026-09-05-draft-cost-tracking-and-tier`.
 *
 * THE TIER IS A COST DECISION AND NEVER A PRODUCT CLAIM (§13).
 * ───────────────────────────────────────────────────────────
 * The free draft is a SKETCH — one version, no anchor, no metrics, no live catalog pricing — and
 * it is given away, so which model produces it is an operating-cost choice the platform makes for
 * itself. It is therefore env-configurable (`AI_DRAFT_MODEL`) and defaults to the cheaper current
 * tier.
 *
 * TWO THINGS THAT FOLLOW, AND NEITHER IS OPTIONAL:
 *   1. It NEVER surfaces to the traveler. No "lite", no "basic", no model name, no tier badge, and
 *      equally no degraded-quality disclaimer — a claim about output quality is not something a
 *      config value is entitled to make, in either direction. What the traveler is told about the
 *      draft is what it IS (a starting sketch, one version, no live prices), which is true
 *      whatever model wrote it.
 *   2. It is NOT the optimizer's model. The paid Optimize rail keeps its own Sonnet-class id
 *      (`CLAUDE_MODEL` in `server/itinerary-optimizer.ts`, `DEFAULT_MODEL` in
 *      `server/services/claude.service.ts`) and this constant must never be pointed at it or
 *      read by it — the thing the traveler pays for is not tuned by the free lane's cost knob.
 *
 * An unset or blank `AI_DRAFT_MODEL` means "not configured" and takes the default below; the value
 * is passed through verbatim with no allowlist, because an operator naming a model this deployment
 * does not have should get that provider's own honest error rather than a silent substitution of a
 * model they did not ask for.
 */

/**
 * The default free-draft tier. Deliberately the cheaper current tier, not the optimizer's.
 * (Not a fee, rate or commission — no `fee_bands` question arises; this is a vendor model id.)
 */
export const AI_DRAFT_MODEL_DEFAULT = "claude-haiku-4-5-20251001";

/**
 * Resolved per call rather than captured at module load, so a deployment can change the env var
 * without a code change and tests can drive it directly.
 */
export function resolveAiDraftModel(): string {
  const configured = process.env.AI_DRAFT_MODEL;
  if (typeof configured === "string" && configured.trim() !== "") return configured.trim();
  return AI_DRAFT_MODEL_DEFAULT;
}
