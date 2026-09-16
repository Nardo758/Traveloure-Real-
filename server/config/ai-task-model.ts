/**
 * ai-task-model.ts — the model tier the PAID AI task runs on.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-47** = A; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 41 (c), Locked Decision 45 (3),
 *  §13, §18 rule 1.)
 *
 * ── WHY THIS IS A SIBLING AND NOT A SECOND READER OF THE DRAFT'S KNOB ────────────────────────
 * `server/services/ai-draft-model.ts` is the FREE draft's cost knob, and its own header says so in
 * as many words: *"It is NOT the optimizer's model … this constant must never be pointed at it or
 * read by it — the thing the traveler pays for is not tuned by the free lane's cost knob."* The
 * Ask-AI task is a thing the traveler pays for (Locked Decision 45 (3): charged on apply), so it
 * gets its own knob rather than borrowing that one. **`resolveAiDraftModel` is NEVER imported by
 * the Ask-AI create rail**, and nothing in this file reads it.
 *
 * ── THE TIER IS A COST RECORD AND NEVER A PRODUCT CLAIM (LD 41 (c), §13) ────────────────────
 * D-47 states the rule in both directions and it is not a preference:
 *   · **No surface may read `plan_proposals.model_tier`** — no model name, no "lite", no tier
 *     badge, and equally **no degraded-quality disclaimer**. A config value is not entitled to make
 *     a claim about output quality in either direction.
 *   · What the traveler is told about a proposal is what it IS — a staged change set they read in
 *     full before applying, which is true whatever model wrote it.
 *
 * An unset or blank `AI_TASK_MODEL` means "not configured" and takes the default below. The value
 * is passed through verbatim with no allowlist, for the same reason the draft's knob does: an
 * operator naming a model this deployment does not have should get that provider's own honest error
 * rather than a silent substitution of a model they did not ask for (§13).
 *
 * NOT A FEE, RATE, COMMISSION OR BAND. This is a vendor model id, so no `fee_bands` question arises
 * (§8) — and the PRICE of an AI task is entirely elsewhere: the `concierge:ai_task` flat band, read
 * by `resolveAiTaskChargeCents` (`server/services/proposal-charge.service.ts`). Nothing here may
 * ever grow a price, a multiplier or a per-tier charge; a cheaper tier is a spend choice the
 * platform makes for itself and is never passed through to what the traveler is quoted.
 */

/**
 * The default paid-task tier: **the OPTIMIZER's**, by ruling.
 *
 * It is deliberately the same id `server/itinerary-optimizer.ts` (`CLAUDE_MODEL`) and
 * `server/services/claude.service.ts` (`DEFAULT_MODEL`) already use — the paid planning rail's
 * tier — rather than the free draft's cheaper one. This constant is a DEFAULT and not a shared
 * reference: pointing it at either of those module-private constants would couple two products'
 * cost decisions so that changing one silently changes the other, which is the drift §18 rule 1
 * names in the direction nobody looks. When they diverge, they diverge on purpose.
 */
export const AI_TASK_MODEL_DEFAULT = "claude-sonnet-4-5";

/** The env knob's name, stated once so a test and a deployment note read the same string. */
export const AI_TASK_MODEL_ENV_VAR = "AI_TASK_MODEL";

/**
 * Resolved per call rather than captured at module load, so a deployment can change the env var
 * without a code change and tests can drive it directly (the `resolveAiDraftModel` posture).
 */
export function resolveAiTaskModel(): string {
  const configured = process.env[AI_TASK_MODEL_ENV_VAR];
  if (typeof configured === "string" && configured.trim() !== "") return configured.trim();
  return AI_TASK_MODEL_DEFAULT;
}
