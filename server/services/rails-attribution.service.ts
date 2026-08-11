/**
 * RAILS ATTRIBUTION — D6, docs/DECISIONS.md ruling 61 (fee-ledger lane).
 *
 * THE CHAIN THIS FILE CLOSES. Ruling 61, verbatim: *"frame/short-link `acquisitionRef` → resolver →
 * `provider_rails` as min(category band, rails) … + the traveler-fee waiver, ledger rows stamped
 * `rate_source='rails'`"*. The RESOLVER half already existed and is CI-pinned
 * (`fee-resolution.service.ts`, gate `fee-resolution-authority-gate.yml`: rails is min(band, rails),
 * rails waives the traveler fee, a bandless category throws). What did not exist was the link
 * between a shared link and that resolver: nothing at checkout ever told it *"this booking arrived
 * through this provider's own rails link"*. `isRails` had no caller. This file is that link, and
 * NOTHING ELSE — it computes no rate of its own.
 *
 * §14/§18 — WHAT THE REF IS AND IS NOT. The ref is an OPAQUE SELECTOR, never a value:
 *   · It carries no amount, no rate, no identity. A crafted ref cannot express a number, because
 *     the only thing done with it is an equality lookup against `short_links.code`.
 *   · The RATE comes from ONE call into the existing single resolver (`resolveProviderRate`,
 *     ruling 47/48) — §18 rule 1: two authors resolving rates two ways is how this class returns.
 *     min(category band, rails) and the traveler-fee waiver stay INSIDE that resolver; this file
 *     only decides whether to pass `isRails: true`.
 *   · A client-supplied ref that fails validation buys NOTHING: the booking proceeds at the full
 *     rate. That is why relaying the token through the checkout body is §14-safe — the token grants
 *     nothing by itself, it only nominates a row the server then re-reads and re-authorizes.
 *
 * DEFAULT-DENY, and the refusals are ENUMERATED (never a boolean with a shrug). Every refusal
 * degrades to the full rate; none of them 4xx a purchase (ruling 61: *"a fabricated/expired/
 * wrong-provider ref → full rate"* — the traveler still buys, they just do not carry the provider's
 * discount). The reason is recorded ON THE BOOKING ROW (`bookingDetails.railsAttribution`) so a
 * refusal is a DB fact, not only a log line — the ruling-66 precedent for a booking-scoped record
 * that must survive on a tripless booking. Never a silent grant, never a blocked purchase.
 *
 * SCOPE (negative space, ruling 43):
 *   · PROVIDER LANE ONLY. `provider_rails` and min(category band, rails) are ruling 48's PROVIDER
 *     fee model. An expert-owned listing resolves through the expert model (`expert_standard` +
 *     EXP-OVR) which no ruling gives a rails variant, so an expert's link refuses with
 *     `owner_not_provider_lane` rather than inventing an expert rails rate.
 *   · OWNER MATCH, NOT TARGET MATCH. Eligibility asks whether the link's owner IS the owner of the
 *     service being booked (ruling 61's "wrong-provider ref"). A provider's storefront/story link
 *     therefore carries rails onto any of THEIR OWN listings in the same cart — deliberate: their
 *     promotion brought the traveler. It never crosses to another owner's listing.
 *   · This file writes nothing. It reads `short_links` + `users` and returns a decision.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../infrastructure/logger";
import { isProviderRole } from "@shared/roles";
import {
  resolveProviderRate,
  resolveTravelerServiceFee,
  round2,
} from "./fee-resolution.service";
import type { FeeRateSource } from "@shared/schema";

/**
 * The ref shape the platform mints (`short-links.routes.ts`: 8 chars of [a-z0-9]) and the column
 * caps at 12. A token outside it never reaches the DB — cheap, and it keeps a hostile body value
 * from becoming a query parameter at all.
 */
const REF_PATTERN = /^[a-z0-9]{1,12}$/;

/** Enumerated refusals. Each one degrades to the FULL rate and is recorded on the booking row. */
export const RAILS_REFUSAL_REASONS = [
  /** No ref travelled with the checkout — the ordinary organic purchase. Not an anomaly. */
  "no_ref",
  /** The token is not a well-formed short-link code. Never looked up. */
  "malformed_ref",
  /** Well-formed but no such `short_links` row — fabricated, or a link long deleted. */
  "unknown_ref",
  /** `short_links.expires_at` has passed (migration 198). NULL never expires. */
  "expired_ref",
  /** The link belongs to a different earner than the owner of the service being booked. */
  "owner_mismatch",
  /** The traveler IS the link owner — a provider may not discount their own take by self-clicking. */
  "self_referral",
  /** The service has no owner recorded, so "whose link is this" has no answer (§13: never guess). */
  "no_service_owner",
  /** The owner is not on the provider fee lane (ruling 48's model) — see the scope note above. */
  "owner_not_provider_lane",
  /** The service carries no category, so the D1 path to a band does not exist. */
  "no_category",
  /** The fail-loud resolver refused (breached R1/R2 guard). Rails is DECLINED, checkout proceeds. */
  "band_unresolvable",
  /**
   * A per-entity negotiated rate (ruling 47) answered instead of the band. The resolver's own
   * ruling: an override is an all-in negotiated rate and rails' waiver does not silently ride along
   * with it. So the override stands, and this is not a rails booking.
   */
  "entity_override_outranks_rails",
] as const;
export type RailsRefusalReason = (typeof RAILS_REFUSAL_REASONS)[number];

export interface RailsLinkFacts {
  linkId: string;
  code: string;
  ownerUserId: string;
  frame: string | null;
}

export interface RailsRefValidation {
  valid: boolean;
  reason: RailsRefusalReason | null;
  ref: string | null;
  link: RailsLinkFacts | null;
}

/** The per-item decision the checkout consumes; also the shape snapshotted onto the booking row. */
export interface RailsItemResolution {
  attributed: boolean;
  reason: RailsRefusalReason | null;
  ref: string | null;
  frame: string | null;
  shortLinkId: string | null;
  /** Present iff `attributed`. Straight out of `resolveProviderRate` — nothing recomputed here. */
  rate: {
    platformRate: number;
    providerShareRate: number;
    bandId: string | null;
    bandKey: string | null;
    rateSource: FeeRateSource;
    railsApplied: boolean;
  } | null;
  /**
   * Present iff `attributed`. The waiver, with the counterfactual it gave up.
   *
   * §13 HONESTY, stated once here and carried into the ledger row's metadata: the D3 traveler
   * service fee is resolver-only — `/api/checkout` does not bill it on the direct path today
   * (ruling 45's "spec-ahead-of-code in its entirety"). So `wouldHaveBeenAmount` is what the band
   * says the fee WOULD be, not money the traveler was previously charged and now is not. Nobody
   * may read the waiver record as "we stopped charging them $X".
   */
  travelerFeeWaiver: {
    waived: true;
    bandId: string | null;
    bandKey: string | null;
    rate: number;
    wouldHaveBeenAmount: number;
    wouldHaveBeenCapApplied: boolean;
    billedOnDirectPathToday: false;
  } | null;
}

/** A refusal with no link facts — the common shape. */
function refuse(reason: RailsRefusalReason, ref: string | null, link: RailsLinkFacts | null = null): RailsItemResolution {
  return {
    attributed: false,
    reason,
    ref,
    frame: link?.frame ?? null,
    shortLinkId: link?.linkId ?? null,
    rate: null,
    travelerFeeWaiver: null,
  };
}

/**
 * STEP 1 — is this token a money-grade attribution AT ALL?
 *
 * Deliberately a DIFFERENT question from the S4 analytics attribution that already exists at
 * checkout (`source='link'` when the code merely resolves). A click that really happened is a true
 * analytics fact even off an expired link; it is not automatically a fee input. This validator is
 * the strict one, and it never widens the analytics answer.
 */
export async function validateRailsRef(opts: {
  ref: string | null | undefined;
  travelerUserId: string;
}): Promise<RailsRefValidation> {
  const raw = typeof opts.ref === "string" ? opts.ref.trim().toLowerCase() : "";
  if (!raw) return { valid: false, reason: "no_ref", ref: null, link: null };
  if (!REF_PATTERN.test(raw)) return { valid: false, reason: "malformed_ref", ref: raw.slice(0, 12), link: null };

  const res = await db.execute(sql`
    SELECT id, code, owner_user_id, frame,
           (expires_at IS NOT NULL AND expires_at <= now()) AS is_expired
      FROM short_links
     WHERE code = ${raw}
     LIMIT 1
  `);
  const row = res.rows?.[0] as
    | { id: string; code: string; owner_user_id: string; frame: string | null; is_expired: boolean }
    | undefined;
  if (!row) return { valid: false, reason: "unknown_ref", ref: raw, link: null };

  const link: RailsLinkFacts = {
    linkId: String(row.id),
    code: String(row.code),
    ownerUserId: String(row.owner_user_id),
    frame: row.frame === null || row.frame === undefined ? null : String(row.frame),
  };
  if (row.is_expired) return { valid: false, reason: "expired_ref", ref: raw, link };
  if (link.ownerUserId === opts.travelerUserId) return { valid: false, reason: "self_referral", ref: raw, link };
  return { valid: true, reason: null, ref: raw, link };
}

/**
 * STEP 2 — the per-item decision, and (when it survives) the resolver call.
 *
 * `itemSubtotal` is the SERVER-DERIVED line amount the checkout already computed from the catalog
 * row (§14) — it is used only to state the waiver's counterfactual, never to decide anything.
 */
export async function resolveRailsForItem(opts: {
  ref: string | null | undefined;
  travelerUserId: string;
  serviceOwnerUserId: string | null | undefined;
  ownerRole: string | null | undefined;
  categoryId: string | null | undefined;
  itemSubtotal: number;
  /** Pre-validated token, so a multi-item cart does not re-query the link per item. */
  preValidated?: RailsRefValidation;
}): Promise<RailsItemResolution> {
  const validation = opts.preValidated ?? (await validateRailsRef({ ref: opts.ref, travelerUserId: opts.travelerUserId }));
  if (!validation.valid) return refuse(validation.reason ?? "unknown_ref", validation.ref, validation.link);
  const link = validation.link!;

  if (!opts.serviceOwnerUserId) return refuse("no_service_owner", validation.ref, link);
  if (link.ownerUserId !== opts.serviceOwnerUserId) return refuse("owner_mismatch", validation.ref, link);
  if (!isProviderRole(opts.ownerRole)) return refuse("owner_not_provider_lane", validation.ref, link);
  if (!opts.categoryId) return refuse("no_category", validation.ref, link);

  // ── The ONE call into the single resolver. min(category band, rails) and the waiver decision
  // both live in there (ruling 48, CI-pinned by A3/A4) — this file re-implements neither. ────────
  let resolved;
  try {
    resolved = await resolveProviderRate({
      categoryId: opts.categoryId,
      providerId: opts.serviceOwnerUserId,
      isRails: true,
    });
  } catch (err: any) {
    // FAIL-LOUD resolver (R2) meeting an OPTIONAL lane. Rails is a discount the provider earns, not
    // the charge itself: declining it leaves the incumbent full-rate path untouched, so a breached
    // band guard must never turn into a failed purchase. Loud in the log, refused in the money.
    logger.error(
      {
        ref: validation.ref,
        categoryId: opts.categoryId,
        providerId: opts.serviceOwnerUserId,
        error: err?.message ?? String(err),
      },
      "[rails-attribution] band resolution failed — rails DECLINED, full rate stands",
    );
    return refuse("band_unresolvable", validation.ref, link);
  }

  // An entity override outranks the band (ruling 47's provenance path) and deliberately does NOT
  // ride the waiver along with it — the resolver says so and is the authority. If it answered with
  // rails not applied, this is not a rails booking: no waiver, no rails ledger row, full provenance.
  // (The premium case is NOT this case: there `railsApplied` is true with `rateSource='band'`,
  // because ruling 48's min() kept the cheaper category band — rails never RAISES a rate.)
  if (!resolved.railsApplied) {
    return refuse("entity_override_outranks_rails", validation.ref, link);
  }

  const waiver = await resolveTravelerServiceFee(opts.itemSubtotal, { waived: true });
  const counterfactual = await resolveTravelerServiceFee(opts.itemSubtotal);

  return {
    attributed: true,
    reason: null,
    ref: validation.ref,
    frame: link.frame,
    shortLinkId: link.linkId,
    rate: {
      platformRate: resolved.platformRate,
      providerShareRate: resolved.providerShareRate,
      bandId: resolved.bandId,
      bandKey: resolved.bandKey,
      rateSource: resolved.rateSource,
      railsApplied: resolved.railsApplied,
    },
    travelerFeeWaiver: {
      waived: true,
      bandId: waiver.bandId,
      bandKey: waiver.bandKey,
      rate: waiver.rate,
      wouldHaveBeenAmount: round2(counterfactual.amount),
      wouldHaveBeenCapApplied: counterfactual.capApplied,
      billedOnDirectPathToday: false,
    },
  };
}

/**
 * The JSON snapshot stamped into `service_bookings.booking_details.railsAttribution` at claim time.
 *
 * WHY A SNAPSHOT AND NOT A RE-RESOLUTION LATER: the ledger row is written at the authorization
 * stamp (migration 179's stated strategy (b)), by which time an admin could have re-priced a band.
 * The ledger must record the rate that was CHARGED, so the resolution travels with the row rather
 * than being asked again. It is server-derived in full — no client value reaches it.
 */
export function railsSnapshot(resolution: RailsItemResolution): Record<string, unknown> {
  return {
    attributed: resolution.attributed,
    reason: resolution.reason,
    ref: resolution.ref,
    frame: resolution.frame,
    shortLinkId: resolution.shortLinkId,
    ...(resolution.rate ? { rate: resolution.rate } : {}),
    ...(resolution.travelerFeeWaiver ? { travelerFeeWaiver: resolution.travelerFeeWaiver } : {}),
  };
}

/** Ops visibility for a ref that was OFFERED and refused — the "never a silent grant" half. */
export function logRailsRefusal(ctx: { reason: RailsRefusalReason; ref: string | null; serviceId?: string | null; travelerUserId: string }): void {
  // `no_ref` is the ordinary organic purchase — logging it would be noise, and its absence is
  // already recorded on the booking row.
  if (ctx.reason === "no_ref") return;
  logger.warn(
    {
      reason: ctx.reason,
      ref: ctx.ref,
      serviceId: ctx.serviceId ?? null,
      travelerUserId: ctx.travelerUserId,
    },
    "[rails-attribution] ref refused — booking proceeds at the full rate",
  );
}
