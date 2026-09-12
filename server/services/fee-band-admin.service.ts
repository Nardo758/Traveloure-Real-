/**
 * The /admin/fee-bands panel's server-side decisions — PURE, and deliberately DB-free.
 *
 * Ledger `2026-09-12-fee-band-admin-gaps` (punchlist V-4/V-5/V-6). Two things live here:
 *
 *  1. THE DEACTIVATION RULING (V-5). `is_active` was patchable with no guard and no warning,
 *     so an operator could switch off `traveler_service_fee` or `concierge:ai_task` and break a
 *     live charge path with no signal at all. The fix is NOT "refuse every deactivation": §8
 *     records that some readers have a deliberate, SAFE failure mode — `resolveCoordinationFee`
 *     keeps charging its ratified floor when the row is gone, and that may be exactly what an
 *     operator intends. So a band whose reader is FAIL-LOUD may not be deactivated, and a band
 *     with a documented fallback may be, with the operator told IN ADVANCE what takes over and
 *     at what value.
 *
 *     §13 on the warning: it names the ACTUAL consequence for THAT band — which resolver, which
 *     fallback, what number — never a generic "this may affect pricing". A warning that does not
 *     name the outcome is decoration. And where nothing is declared, it says THAT, rather than
 *     inventing a consequence: an undeclared band gets "the panel cannot state what this would
 *     do", which is a finished answer and not a guess.
 *
 *     THE SPLIT IS NOT HAND-WRITTEN HERE. It is read from `RESOLVER_FEE_BAND_REQUIREMENTS`, the
 *     manifest that already existed as the single home of the resolver fee-band contract (§18
 *     rule 1). A second list of "required bands" beside it would go stale the first time a
 *     resolver was added, and staleness here means the guard protects the wrong band. What can
 *     be derived IS derived and pinned at CI (fee-band-admin-guards D5); what cannot — a band
 *     key read out of a database column — is stated as the pin's negative space.
 *
 *  2. THE BODY ALLOWLIST (§19). The PATCH handler destructured `req.body` directly, which is the
 *     denylist shape: adding `max_amount` to it would have made the NEXT privileged column on
 *     `fee_bands` client-settable by default. The schema below names every accepted field and
 *     is `.strict()`, so an unknown key is REFUSED rather than silently stripped.
 *
 * §14/§18 rule 4: this IS the privileged-by-design rate setter — an admin band editor is the
 * one place a rate may be written from a request body — which is why the route stays behind §2's
 * blanket `requireAdmin` guard AND its own admin-role check. It is not, and must not become, an
 * allowlist entry in any guard script.
 */

import { z } from "zod";
import {
  feeBandRequirement,
  type FeeBandFallbackUnit,
  type FeeBandRequirement,
} from "./fee-band-requirements";

// ── 1. Deactivation ──────────────────────────────────────────────────────────────────────

export type FeeBandDeactivationReason =
  /** A fail-loud reader depends on it. Refused. */
  | "required_no_fallback"
  /** A documented fallback takes over. Allowed, and named. */
  | "fallback_declared"
  /** No resolver declares a dependency. Allowed, and nothing is claimed. */
  | "not_declared";

export interface FeeBandDeactivationRuling {
  bandKey: string;
  /** Whether the resolver manifest records any dependency on this band at all. */
  declared: boolean;
  allowed: boolean;
  reason: FeeBandDeactivationReason;
  /** One sentence naming the ACTUAL consequence for this band (§13). */
  consequence: string;
  /** The manifest's owner string, or null when the band is undeclared. */
  owner: string | null;
}

/** Render a documented fallback default in the band's own unit. */
function formatFallbackValue(value: number, unit: FeeBandFallbackUnit): string {
  switch (unit) {
    case "fraction":
      // A fraction is the platform's take; show it the way the band's own description does.
      return `${Number((value * 100).toFixed(4))}%`;
    case "usd":
      return `$${value.toFixed(2)}`;
    case "cents":
      return `${value} cents ($${(value / 100).toFixed(2)})`;
    case "count":
      return String(value);
  }
}

function consequenceFor(requirement: FeeBandRequirement): { allowed: boolean; reason: FeeBandDeactivationReason; consequence: string } {
  const { bandKey, fallback } = requirement;
  if (fallback.kind === "none") {
    return {
      allowed: false,
      reason: "required_no_fallback",
      consequence:
        `${bandKey} has NO fallback: ${fallback.reader} reads it through a fail-loud accessor, so ` +
        `deactivating it makes that path raise instead of pricing. Deactivation is refused — ` +
        `change the rate instead, or retire the reader first.`,
    };
  }
  if (fallback.kind === "other_band") {
    return {
      allowed: true,
      reason: "fallback_declared",
      consequence:
        `${bandKey} may be deactivated. ${fallback.resolver} then resolves through the ` +
        `${fallback.bandKey} band instead — whatever rate that band currently carries takes over, ` +
        `and this band's own rate stops applying.`,
    };
  }
  return {
    allowed: true,
    reason: "fallback_declared",
    consequence:
      `${bandKey} may be deactivated. ${fallback.resolver} then falls back to its documented ` +
      `default of ${formatFallbackValue(fallback.value, fallback.unit)}, and keeps charging that ` +
      `until the band is reactivated.`,
  };
}

/**
 * May this band be switched off, and what happens if it is?
 *
 * Answered for ANY band key, including one the manifest does not carry — the panel lists
 * whatever `fee_bands` holds, and a row nothing declares is a real state (four seeded bands
 * have no reader in code today).
 */
export function feeBandDeactivationRuling(bandKey: string): FeeBandDeactivationRuling {
  const requirement = feeBandRequirement(bandKey);
  if (!requirement) {
    return {
      bandKey,
      declared: false,
      allowed: true,
      reason: "not_declared",
      consequence:
        `${bandKey} is not declared in the resolver fee-band manifest ` +
        `(server/services/fee-band-requirements.ts), so no resolver records a dependency on it. ` +
        `Deactivation is allowed and NOTHING is claimed about the consequence — the panel does ` +
        `not know what, if anything, reads this band.`,
      owner: null,
    };
  }
  const { allowed, reason, consequence } = consequenceFor(requirement);
  return { bandKey, declared: true, allowed, reason, consequence, owner: requirement.owner };
}

// ── 2. The dollar cap (V-4) ──────────────────────────────────────────────────────────────

export interface FeeBandMaxAmountClearRuling {
  allowed: boolean;
  /** Null when clearing is allowed — there is nothing to say. */
  refusal: string | null;
}

/**
 * May this band's `max_amount` cap be cleared (set to NULL = uncapped)?
 *
 * The manifest's `requiresMaxAmount` is the authority, not a second list: `traveler_service_fee`
 * carries it because `GET /api/pricing` throws without the cap, and the deployment gate already
 * fails a missing one. Refusing the clear here is the same fact enforced one step earlier, at the
 * only surface that can produce it.
 */
export function feeBandMaxAmountClearRuling(bandKey: string): FeeBandMaxAmountClearRuling {
  const requirement = feeBandRequirement(bandKey);
  if (!requirement?.requiresMaxAmount) return { allowed: true, refusal: null };
  return {
    allowed: false,
    refusal:
      `${bandKey} requires its max_amount cap: ${requirement.owner} reads the cap and refuses to ` +
      `serve without it, and the deployment gate fails a band that is missing it. Clearing the cap ` +
      `is refused — set a different cap instead.`,
  };
}

// ── 3. The §19 allowlist body ────────────────────────────────────────────────────────────

/**
 * The ONLY fields `PATCH /api/admin/fee-bands/:bandKey` accepts.
 *
 * Hand-written rather than `createInsertSchema(feeBands).pick(...)` for one reason, stated so it
 * is not "tidied up" later: the four numeric columns are `decimal`, whose generated zod type is a
 * STRING, while this route's contract has always been numbers. The allowlist property is what
 * matters and is unchanged by that — every accepted key is named here, `.strict()` refuses
 * anything else, and `band_key` / `rate_type` (the band's identity) are absent by construction,
 * as are `updated_by` / `updated_at`, which the handler derives from the session and the clock.
 *
 * Present-but-invalid is REFUSED, never silently ignored: the previous handler let a non-numeric
 * `defaultRate` fall through to the stored value and answered 200 — a false "saved" that dropped
 * the admin's intended change. Omitting a field still means "leave unchanged".
 */
export const feeBandPatchBodySchema = z
  .object({
    defaultRate: z.number().finite(),
    minRate: z.number().finite().nullable(),
    maxRate: z.number().finite().nullable(),
    // V-4: the DOLLAR cap the resolver applies (the $25 on the 7% traveler service fee) — NOT
    // `maxRate`, which bounds the RATE. Negative is refused: a negative ceiling would clamp every
    // resolved fee below zero, which is not a cap an operator can mean.
    maxAmount: z.number().finite().nonnegative().nullable(),
    displayName: z.string(),
    description: z.string(),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export type FeeBandPatchBody = z.infer<typeof feeBandPatchBodySchema>;
