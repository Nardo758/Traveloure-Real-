/**
 * DIRECT-LANE CHARGE RATE — 1C, docs/DECISIONS.md ruling 69 disposition 6 (fee-ledger lane).
 *
 * ══ WHAT THIS CLOSES ═══════════════════════════════════════════════════════════════════════════
 * Ruling 68 §5 stated the consequence D6 made visible, verbatim: *"A rails booking is the FIRST
 * charge path in the platform to price through the D1 single resolver; direct provider bookings
 * still resolve the legacy `expert_standard` band pending the charge-path repoint (lane item 1C).
 * So a rails booking today is cheaper for TWO reasons at once."* Disposition 6 of ruling 69 closes
 * the second reason: a **direct** provider booking now prices through the SAME
 * `resolveProviderRate` the rails lane uses — category band via
 * `service_categories.commission_band_key`, per-entity override as provenance — so the D1 resolver
 * is the single authority on every provider charge path, not just the attributed one.
 *
 * ══ §18 RULE 1 — DELEGATE, NEVER RE-IMPLEMENT ══════════════════════════════════════════════════
 * There is exactly ONE call into `resolveProviderRate` in here and no arithmetic of any kind. The
 * band precedence, the entity-override provenance, min(band, rails) and the traveler-fee waiver all
 * stay INSIDE that resolver. This file decides only WHICH LINES may ask it and what happens when it
 * cannot answer. Two authors resolving rates two ways is the defect class this shape prevents.
 *
 * ══ SCOPE (negative space, ruling 43) ══════════════════════════════════════════════════════════
 *   · PROVIDER LANE ONLY, exactly like `rails-attribution.service.ts`. `service_categories.
 *     commission_band_key` → the four provider bands is ruling 48's PROVIDER fee model. An
 *     expert-owned listing keeps resolving through the expert model (`expert_standard` + EXP-OVR),
 *     which no ruling gives a category-band variant — refused here as `not_provider_lane` rather
 *     than silently re-banding every expert line in the platform.
 *   · THIS MOVES THE RATE, NOT THE FEE. The D3 traveler service fee is still resolver-only and is
 *     still NOT billed on the direct path (ruling 68 §5, restated as ruling 69's negative space).
 *     Nothing here starts charging a traveler anything new.
 *   · This file writes nothing and reads no request body (§14). Every input is server-derived from
 *     the catalog row and the session.
 *
 * ══ WHY A REFUSAL FALLS BACK INSTEAD OF THROWING ═══════════════════════════════════════════════
 * `resolveProviderRate` is FAIL-LOUD by design (R2): a bandless category throws, and R1+R2 make
 * that state unreachable by construction. On the RAILS lane a throw declines an optional discount
 * (ruling 61: an optional lane must never turn a breached guard into a failed purchase). On the
 * DIRECT lane there is no discount to decline — the throw would be the CHARGE failing, i.e. a
 * breached guard would take the checkout down. So a refusal here degrades to the INCUMBENT legacy
 * resolution — the exact rate this path charged yesterday — is logged at error level, and is
 * recorded on the booking row as provenance. That is a documented safe failure mode (§8's
 * fee-floor posture), never a second rate authority: the fallback computes nothing, it just leaves
 * the pre-1C path standing for the line the resolver could not price.
 */
import { logger } from "../infrastructure/logger";
import { isProviderRole } from "@shared/roles";
import { resolveProviderRate } from "./fee-resolution.service";
import type { FeeRateSource } from "@shared/schema";

/** Enumerated refusals. Each one leaves the incumbent legacy resolution standing for that line. */
export const DIRECT_RATE_REFUSAL_REASONS = [
  /** The service has no owner recorded, so no provider identity to price against (§13). */
  "no_service_owner",
  /** Owner is not on the provider fee lane (expert/other) — see the scope note above. */
  "not_provider_lane",
  /** The service carries no category, so the D1 path to a band does not exist. */
  "no_category",
  /** The fail-loud resolver refused (breached R1/R2 guard). Legacy rate stands, loudly logged. */
  "band_unresolvable",
] as const;
export type DirectRateRefusalReason = (typeof DIRECT_RATE_REFUSAL_REASONS)[number];

export interface DirectRateResolution {
  resolved: boolean;
  reason: DirectRateRefusalReason | null;
  /** Present iff `resolved`. Straight out of `resolveProviderRate` — nothing recomputed here. */
  rate: {
    platformRate: number;
    providerShareRate: number;
    bandId: string | null;
    bandKey: string | null;
    rateSource: FeeRateSource;
  } | null;
}

function refuseDirect(reason: DirectRateRefusalReason): DirectRateResolution {
  return { resolved: false, reason, rate: null };
}

/**
 * Resolve ONE direct (non-rails) provider line's commission rate through the D1 resolver.
 *
 * Never throws: a fail-loud resolver refusal becomes `band_unresolvable`, so the caller's incumbent
 * path is what runs and the purchase is never the casualty of a misconfigured band.
 */
export async function resolveDirectProviderRate(opts: {
  serviceOwnerUserId: string | null | undefined;
  ownerRole: string | null | undefined;
  categoryId: string | null | undefined;
  /** Diagnostics only — never an input to the rate. */
  serviceId?: string | null;
}): Promise<DirectRateResolution> {
  if (!opts.serviceOwnerUserId) return refuseDirect("no_service_owner");
  if (!isProviderRole(opts.ownerRole)) return refuseDirect("not_provider_lane");
  if (!opts.categoryId) return refuseDirect("no_category");

  try {
    const resolved = await resolveProviderRate({
      categoryId: opts.categoryId,
      providerId: opts.serviceOwnerUserId,
      isRails: false,
    });
    return {
      resolved: true,
      reason: null,
      rate: {
        platformRate: resolved.platformRate,
        providerShareRate: resolved.providerShareRate,
        bandId: resolved.bandId,
        bandKey: resolved.bandKey,
        rateSource: resolved.rateSource,
      },
    };
  } catch (err: any) {
    logger.error(
      {
        categoryId: opts.categoryId,
        providerId: opts.serviceOwnerUserId,
        serviceId: opts.serviceId ?? null,
        error: err?.message ?? String(err),
      },
      "[direct-charge-rate] D1 band resolution failed — the INCUMBENT legacy rate stands for this line",
    );
    return refuseDirect("band_unresolvable");
  }
}

/**
 * THE ONE PRECEDENCE, shared by every surface that quotes or charges a cart line.
 *
 * `/api/checkout` resolves rates TWICE (quote loop, booking loop) and two more surfaces quote the
 * same cart (`GET /api/cart`, `GET /api/cart/fee-preview`). Four implementations of an ordering is
 * how a quote and a charge come to disagree — §15c's "one promotion, two callers" read one lane
 * over — so the ordering lives here once and every surface reads it:
 *
 *   1. RAILS (ruling 61) — resolver-decided min(category band, rails). Already outranked the
 *      snapshot; unchanged.
 *   2. DIRECT D1 (ruling 69 disposition 6) — the category band from the same single resolver.
 *      It outranks the per-service `revenueShareRate` snapshot for the same reason rails does:
 *      ruling 47 dethroned that snapshot as a first operand, and letting it survive here would
 *      defeat an admin band edit exactly as audit C2/Q9 described.
 *   3. The legacy path, byte-identical to pre-1C: the `revenueShareRate` snapshot when it parses,
 *      else the legacy `resolveCommissionRates` share. This runs ONLY for a line the two resolver
 *      lanes both declined — an expert-owned line (which has no D1 model) or a refusal above.
 */
export function pickOwnerShareRate(input: {
  railsShareRate?: number | null;
  direct?: DirectRateResolution | null;
  /** The per-service snapshot, as stored. Parsed by the caller's existing `safeParseRate`. */
  legacyShareRate: number;
}): { shareRate: number; lane: "rails" | "direct_band" | "legacy" } {
  if (typeof input.railsShareRate === "number" && Number.isFinite(input.railsShareRate)) {
    return { shareRate: input.railsShareRate, lane: "rails" };
  }
  if (input.direct?.resolved && input.direct.rate) {
    return { shareRate: input.direct.rate.providerShareRate, lane: "direct_band" };
  }
  return { shareRate: input.legacyShareRate, lane: "legacy" };
}

/**
 * The JSON snapshot stamped into `service_bookings.booking_details.directRateResolution`.
 *
 * Same reasoning as `railsSnapshot`: the rate that was CHARGED must travel with the row, because a
 * band can be re-priced between the charge and any later read. A refusal is recorded too — a line
 * that fell back to the legacy lane must say so, or a green ledger would imply a D1 charge that
 * never happened (§13).
 */
export function directRateSnapshot(
  resolution: DirectRateResolution,
  lane: "rails" | "direct_band" | "legacy",
): Record<string, unknown> {
  return {
    lane,
    resolved: resolution.resolved,
    reason: resolution.reason,
    ...(resolution.rate ? { rate: resolution.rate } : {}),
  };
}
