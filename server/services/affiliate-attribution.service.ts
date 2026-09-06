/**
 * Affiliate attribution — the ONE builder for an outbound affiliate link that belongs to an
 * `affiliate_booking_requests` row.
 *
 * Ledger `2026-09-05-affiliate-subid-live`; MONEY_MAP F-5 (was DORMANT, now LIVE).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * Attribution is per REQUEST. When the platform sends a booking agent (or the traveler whose
 * request it is) out to a partner to book ONE `affiliate_booking_requests` row, the partner's own
 * attribution parameter carries that row's id. The partner echoes the value back on its commission
 * report, and `affiliate-reconciliation.service.ts` adopts the REAL commission on an exact token
 * match instead of ever estimating one (§13 — the whole reason the agent-booking confirm writes an
 * honest "0.00" and waits).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A FAKE PARAMETER (§13)
 * ─────────────────────────────────────────────────────────────────────────────
 * This builder NEVER invents a query parameter. It only extends the value of an attribution
 * parameter the partner's own link ALREADY carries, using Travelpayouts' documented
 * `<marker>.<SubID>` convention — the same convention `buildAttributionSubId` /
 * `parseAttributionSubId` encode, and the only one we have ever observed echoed back
 * (`statistics.service.ts` execute_query rows carry `sub_id` / `long_sub_id`).
 *
 * A partner with no attribution parameter on its link — Viator (`mcid`), Impact/Fever (utm
 * campaign), 12Go (`affiliate_id`), Klook (`aff_code`), and every other shape — gets the URL back
 * BYTE-IDENTICAL, and the return shape SAYS SO (`attributed: false` plus a `reason`). Silence would
 * make "this partner has no sub_id concept" indistinguishable from "we forgot to stamp it".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MARKER PREFIX IS THE LINK'S OWN, NOT THE ENV'S
 * ─────────────────────────────────────────────────────────────────────────────
 * The value written is `<existing marker>.<requestId>`, where the marker half is read back off the
 * parameter already on the link. A campaign-specific marker therefore survives; the account marker
 * (`getTravelpayoutsMarker()`) is only the fallback when the parameter is present but empty.
 * Whatever the prefix, `parseAttributionSubId(value).token === requestId` — the round-trip the
 * reconciliation matcher depends on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * §16 — the URL this returns still never reaches a client
 * ─────────────────────────────────────────────────────────────────────────────
 * This module builds a URL; it does not decide who may see one. The callers store it on the row
 * (`affiliate_booking_requests.affiliate_url`, never returned in a response body) or hand it
 * straight to `res.redirect(302, …)`. §14/§15 are untouched: no amount, no rate, no identity and
 * no money movement is decided here — this lane touches ATTRIBUTION only.
 */
import {
  buildAttributionSubId,
  parseAttributionSubId,
} from "./travelpayouts/travelpayouts-client";

/**
 * Attribution parameters we may extend, in priority order. Both are Travelpayouts-native:
 *   • `sub_id` — the explicit sub-ID parameter (WeGoTrip product links build `?sub_id=<marker>`).
 *   • `marker` — the marker parameter, whose documented form IS `<marker>.<SubID>`; everything
 *     after the first dot is reported back as the sub_id.
 * Nothing else is touched, and neither is ever ADDED to a link that lacks it.
 */
export const ATTRIBUTION_PARAMS = ["sub_id", "marker"] as const;
export type AttributionParam = (typeof ATTRIBUTION_PARAMS)[number];

export type AttributionSkipReason =
  /** The URL could not be parsed at all — returned unchanged rather than thrown over. */
  | "unparseable_url"
  /** The partner's link carries neither `sub_id` nor `marker` — it has no sub_id concept. */
  | "partner_carries_no_attribution_parameter"
  /** No booking-request id was supplied — there is nothing honest to attribute the link to. */
  | "no_request_id";

export interface AttributedAffiliateUrl {
  /** The outbound URL. Byte-identical to the input whenever `attributed` is false. */
  url: string;
  /** True only when an attribution parameter was actually written. */
  attributed: boolean;
  /** The parameter written, or null when none was. */
  parameter: AttributionParam | null;
  /** The exact value written (`<marker>.<requestId>`), or null when none was. */
  subId: string | null;
  /** The booking-request id this link is attributed to (the token the matcher keys on). */
  requestId: string | null;
  /**
   * The `affiliate_clicks` row recorded for this open, when the caller has one. It is deliberately
   * NOT written into the URL: the partner report echoes exactly ONE attribution field, and the
   * booking-request id is the token reconciliation matches on. Echoed here so a caller records the
   * same attribution decision it acted on, in one place.
   */
  clickId: string | null;
  /** Why nothing was written. Null when `attributed` is true. §13 — never silent. */
  reason: AttributionSkipReason | null;
}

/**
 * Does this partner link carry an attribution parameter we can extend? Pure; never throws.
 */
export function supportsAttributionSubId(affiliateUrl: string): boolean {
  return resolveAttributionParam(affiliateUrl) !== null;
}

function resolveAttributionParam(affiliateUrl: string): AttributionParam | null {
  let parsed: URL;
  try {
    parsed = new URL(affiliateUrl);
  } catch {
    return null;
  }
  for (const param of ATTRIBUTION_PARAMS) {
    if (parsed.searchParams.has(param)) return param;
  }
  return null;
}

/**
 * Build the outbound link for ONE `affiliate_booking_requests` row.
 *
 * Idempotent: re-running it on an already-attributed URL rewrites the same value, so a legacy row
 * stored before this lane and a row born after it come out identical.
 */
export function buildAttributedAffiliateUrl(input: {
  affiliateUrl: string;
  requestId: string | null | undefined;
  clickId?: string | null;
}): AttributedAffiliateUrl {
  const { affiliateUrl } = input;
  const requestId = input.requestId ?? null;
  const clickId = input.clickId ?? null;
  const unchanged = (reason: AttributionSkipReason): AttributedAffiliateUrl => ({
    url: affiliateUrl,
    attributed: false,
    parameter: null,
    subId: null,
    requestId,
    clickId,
    reason,
  });

  if (!requestId) return unchanged("no_request_id");

  let parsed: URL;
  try {
    parsed = new URL(affiliateUrl);
  } catch {
    // Never throw over an attribution nicety — the booking link matters more than the token.
    return unchanged("unparseable_url");
  }

  const param = ATTRIBUTION_PARAMS.find((p) => parsed.searchParams.has(p));
  if (!param) return unchanged("partner_carries_no_attribution_parameter");

  // Keep the link's OWN marker half; fall back to the account marker only when the parameter is
  // present but empty. Either way the token half is exactly the request id, so
  // parseAttributionSubId(subId).token === requestId.
  const existing = parsed.searchParams.get(param) ?? "";
  const existingMarker = existing ? parseAttributionSubId(existing).marker : "";
  const subId = existingMarker ? `${existingMarker}.${requestId}` : buildAttributionSubId(requestId);

  parsed.searchParams.set(param, subId);
  return { url: parsed.toString(), attributed: true, parameter: param, subId, requestId, clickId, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// The INVERSE half: reading an attribution token back off a partner report.
// ─────────────────────────────────────────────────────────────────────────────
// These live here, beside the builder that writes the token, so the write and the read of the
// same convention cannot drift (§18 rule 1). They are PURE — no DB, no network, no env — which is
// also what lets the reconciliation matcher's decision be proved without a database.

/** The shape of a normalised partner report row this module needs — nothing more. */
export interface PartnerReportAttributionSource {
  subId?: string | null;
  rawData?: Record<string, unknown> | null;
}

/**
 * MONEY_MAP F-5 (LIVE — ledger `2026-09-05-affiliate-subid-live`). Resolve the attribution TOKEN a
 * partner report row echoed back, from whichever field carries it. PURE — no DB, no network, no
 * env — so the matcher's decision is directly testable.
 *
 * The 2026-08-01 live probe showed execute_query rows carry BOTH `sub_id` and `long_sub_id`;
 * `long_sub_id` is presumed to hold the full `<marker>.<token>` value where `sub_id` may be
 * shortened. Check `sub_id` first, fall back to `long_sub_id` — whichever yields a token.
 *
 * §13: a sub_id that does NOT parse to a token (a bare marker, an unrelated partner format, a
 * truncated value) returns `{ rawSubId: <verbatim>, token: null }`. The caller records the raw
 * value and leaves the row UNMATCHED. It is never fuzzily attached to a booking request that
 * happens to sit nearby in date and amount — that is the estimate this whole seam exists to refuse.
 */
export function resolveExternalAttributionToken(
  ext: PartnerReportAttributionSource,
): { rawSubId: string | null; token: string | null } {
  const raw = ext.rawData as Record<string, unknown> | undefined;
  const candidates: unknown[] = [ext.subId, raw?.sub_id, raw?.long_sub_id];
  let rawSubId: string | null = null;
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    if (rawSubId === null) rawSubId = candidate;
    const { token } = parseAttributionSubId(candidate);
    if (token) return { rawSubId: candidate, token };
  }
  return { rawSubId, token: null };
}

/**
 * Find the ONE internal `affiliate_earnings` row an attribution token names. PURE.
 *
 * Linkage (MONEY_MAP F-5 item 3): `affiliate_earnings.external_report_data` carries
 * `{affiliateBookingRequestId: <affiliate_booking_requests.id>}` at write time
 * (content.routes.ts agent-booking confirm) — the same id the outbound link's attribution
 * parameter carries. An EXACT string equality and nothing else: no prefix match, no normalisation,
 * no nearest-neighbour.
 */
export function selectTokenMatchCandidate(
  token: string,
  internalRows: Array<Record<string, any>>,
  consumed: Set<string>,
): Record<string, any> | null {
  return (
    internalRows.find(
      (row) =>
        !consumed.has(row.id) &&
        row.reconciliation_status === "unmatched" &&
        (row.external_report_data as any)?.affiliateBookingRequestId === token,
    ) ?? null
  );
}

