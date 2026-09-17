/**
 * HOW LONG A PROPOSAL'S CATALOG PRICES ARE BELIEVED.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-50** = A, clause (c); ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 45 (3), §8, §13, §18 rule 1.)
 *
 * D-50 (c), verbatim in the ruling: *"the staleness window is CONFIG and its expiry behaviour is
 * defined: an expired proposal's apply is REFUSED with the reason and the drawer offers a re-ask —
 * never a silent reprice."*
 *
 * ── WHY A WINDOW EXISTS AT ALL ───────────────────────────────────────────────────────────────
 * D-50 lets a PAID task name a live catalog listing, and the addition then carries that listing's
 * price as the catalog stated it at ASK time (`shared/plan-proposal-changeset.ts` — no number the
 * model produced is ever persisted). A proposal read and applied days later would write that price
 * onto an `itinerary_items` row as if it were current. The three possible answers were: re-price
 * silently at apply (a number the traveler never read), apply the stale one (a price nobody is
 * offering), or REFUSE and offer a re-ask. The ruling took the third, and it is the only one that
 * does not put a figure on screen that no source states (§13).
 *
 * ── THIS IS NOT A FEE (§8) ───────────────────────────────────────────────────────────────────
 * It is a LIVENESS WINDOW — a duration, not a rate, a price, a band or a multiplier — the same
 * classification `2026-09-12-readymade-reconciliation-rail` gave its fulfilment grace. Nothing here
 * multiplies an amount or selects a band, and the AI task's own price stays where it belongs: the
 * `concierge:ai_task` flat band, read by `resolveAiTaskChargeCents`.
 *
 * ── §13 — THE NARROW BITE, AND WHY IT IS NARROW ──────────────────────────────────────────────
 * The window bites ONLY on a proposal that actually carries a catalog reference. A proposal whose
 * additions name no listing carries no price that can go stale, and expiring it would refuse a
 * traveler an apply for a reason that is not true of their proposal. `changeSetProviderServiceIds`
 * (`shared/plan-proposal-changeset.ts`) is the ONE expression of "does this change set name a
 * listing", shared with the apply's re-validation (§18 rule 1).
 */

/**
 * The default window, in hours: three days.
 *
 * Long enough that a traveler can read a proposal, sleep on it, and come back to it over a weekend;
 * short enough that a listing's price is plausibly still the price. It is a judgement, it is
 * configurable, and it is deliberately not derived from anything — a window derived from a fee
 * table would make it look like a rate, which it is not.
 */
export const AI_TASK_PROPOSAL_STALE_AFTER_HOURS_DEFAULT = 72;

/** The env knob's name, stated once so a test and a deployment note read the same string. */
export const AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR = "AI_TASK_PROPOSAL_STALE_AFTER_HOURS";

/**
 * Resolved per call, so a deployment can change it without a code change and tests can drive it.
 *
 * A blank, non-numeric or non-positive value is "not configured" and takes the default: a `0` here
 * would expire every proposal the instant it was written, which is a configuration mistake rather
 * than an operator decision, and honouring it would make the whole rail unusable silently.
 */
export function resolveAiTaskProposalStaleAfterHours(): number {
  const raw = process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR];
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return AI_TASK_PROPOSAL_STALE_AFTER_HOURS_DEFAULT;
}

/**
 * Is a proposal minted at `createdAt` past its window at `now`?
 *
 * PURE and total. **A missing `createdAt` is NOT stale** (§13): "we do not know when this was
 * written" is not "this is old", and refusing an apply on an absence would be a claim nobody made.
 * The column is NOT NULL, so this arm should be unreachable — it is written down because an
 * unreachable arm that guesses is how a §13 failure ships.
 */
export function isProposalCatalogPriceStale(params: {
  createdAt: Date | string | null | undefined;
  now?: Date;
  staleAfterHours?: number;
}): boolean {
  const { createdAt } = params;
  if (createdAt == null) return false;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const createdMs = created.getTime();
  if (!Number.isFinite(createdMs)) return false;
  const hours = params.staleAfterHours ?? resolveAiTaskProposalStaleAfterHours();
  const nowMs = (params.now ?? new Date()).getTime();
  return nowMs - createdMs > hours * 60 * 60 * 1000;
}
