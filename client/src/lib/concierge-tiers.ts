/**
 * THE CONCIERGE TIER ↔ PLANNING FINISH MAP — ledger `2026-09-07-concierge-door`,
 * CLAUDE.md Locked Decision 45 (2).
 *
 * WHY THIS MODULE EXISTS. The three-tier chooser existed THREE times: the plan modal's finish
 * (myself / AI / a local expert), the Finalize modal, and the concierge page's own priced cards
 * — "one question answered in three places is the drift class §18 rule 1 names" (brief §1). The
 * ruling collapses the concierge copy: `/concierge` becomes a DOOR into the one modal, and the
 * TIER CHOICE BECOMES THAT MODAL'S FINISH. This file is the one place the correspondence between
 * the two vocabularies is written down, so the door, the `?tier=` hint and the funnel record
 * cannot answer it three different ways between them.
 *
 * THE MAP, and why each row is the row it is:
 *
 *   ai     → the modal's `ai` finish. Platform Concierge IS the AI draft rail, and the modal's
 *            AI finish is pre-mint by construction, so it is the FREE draft on an empty plan
 *            (CLAUDE.md Locked Decision 41 (b) — never a paid task, and, since this lane, never
 *            a cart hand-off either: the cart is a PROJECTION of a plan's items, not a
 *            destination (Locked Decision 39), and `cart.tsx` never read the `?concierge=` param
 *            the old hand-off appended (brief §6, finding F12)).
 *   expert → the modal's `local` finish. Destination Concierge is delivered by a local expert,
 *            which is the same answer "Get a local expert" gives.
 *   full   → **NOTHING, and that is an answer rather than a gap (§13).** Full / done-for-you is a
 *            coordination ENGAGEMENT — an existing money-adjacent rail (`PATCH
 *            /api/concierge/requests/:id` with `chosenTier: "full"` mints a `coordination_states`
 *            row) — not one of the ways a plan gets BUILT. It has no post-modal rail today, so it
 *            keeps the rail it already has, offered beside the door rather than mapped onto a
 *            finish it does not correspond to. Inventing a fifth `PlanningBranch` for it would
 *            put a money-adjacent engagement inside the shared modal's finish runner, which is a
 *            new money path this lane is explicitly forbidden to create.
 *
 * AND THE REVERSE DIRECTION IS DELIBERATELY PARTIAL. `myself` — "Build it myself" — is NOT a
 * concierge tier: the tier vocabulary has three answers and none of them is "nobody". Recording
 * one anyway would file a tier the traveler never picked (§13), so the reverse lookup returns
 * `null` for it and the funnel row keeps whatever it already held.
 *
 * Pure: no React, no fetch, no DOM. `PlanningBranch` is a TYPE-ONLY import (erased at compile,
 * the `nav-config.ts` precedent) so this module can be exercised under `tsx --test` without
 * pulling the provider's React tree in.
 */
import type { PlanningBranch } from "@/contexts/PlanningContext";

/** The three delivery tiers the concierge surface has always priced. */
export const CONCIERGE_TIERS = ["ai", "expert", "full"] as const;

export type ConciergeTier = (typeof CONCIERGE_TIERS)[number];

/**
 * The modal finish each tier IS. `null` = this tier is not a way to BUILD a plan and therefore
 * has no finish — see the `full` note in the header.
 */
export const CONCIERGE_TIER_FINISH: Record<ConciergeTier, PlanningBranch | null> = {
  ai: "ai",
  expert: "local",
  full: null,
};

/** The finish CTA a tier corresponds to, or `null` when the tier is not a way to build a plan. */
export function finishForConciergeTier(tier: ConciergeTier): PlanningBranch | null {
  return CONCIERGE_TIER_FINISH[tier] ?? null;
}

/**
 * The tier a finish CTA corresponds to, or `null` when the CTA is not a tier at all.
 *
 * Derived by SEARCHING the one map above rather than by a second table written the other way
 * round: two tables are two things to keep in step, and the day they disagree the funnel records
 * a tier the traveler did not choose (§18 rule 1).
 */
export function conciergeTierForFinish(branch: PlanningBranch): ConciergeTier | null {
  for (const tier of CONCIERGE_TIERS) {
    if (CONCIERGE_TIER_FINISH[tier] === branch) return tier;
  }
  return null;
}

/**
 * A `?tier=` URL hint, resolved against the vocabulary — or `null` for anything else.
 *
 * §13: an unrecognised hint resolves to NOTHING and the traveler is asked the question normally.
 * It is never coerced to a nearest-looking tier, which would deep-open the modal onto a finish
 * the door never actually named. Case and surrounding whitespace are forgiven because a hint
 * arrives on a URL a human can type; nothing else is.
 */
export function parseConciergeTierHint(raw: string | null | undefined): ConciergeTier | null {
  const key = (raw ?? "").trim().toLowerCase();
  return (CONCIERGE_TIERS as readonly string[]).includes(key) ? (key as ConciergeTier) : null;
}

/**
 * The branch a `?tier=` hint deep-opens the modal on, or `null` for no deep-open.
 *
 * A door that already knows the "how" narrows the finish to that ONE CTA — the ratified
 * `source.branch` semantic (Locked Decision 33 rule 6: it decides the FINISH, never the steps,
 * so every question a plan needs is still asked). `?tier=full` narrows nothing: its tier has no
 * finish, so the traveler gets the ordinary three ways to build plus the done-for-you offer
 * beside the door.
 */
export function planningBranchForTierHint(raw: string | null | undefined): PlanningBranch | null {
  const tier = parseConciergeTierHint(raw);
  return tier ? finishForConciergeTier(tier) : null;
}
