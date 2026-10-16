// LW-1d (ledger `2026-10-16-lw1d-source-and-referral`; hand-off answer 5 and Part B "Ready-Made Trip pages while
// the waitlist is on"): who, if anyone, is credited for a waitlist sign-up that arrived through an expert's link.
//
// Credit comes ONLY from the `short_links` row the visitor arrived through, resolved here from its code — never a
// handle, user id or referrer typed into a URL or a body (§14 posture). The read is `validateRailsRef`'s own (one
// reader of a short link, §18 rule 1), so an unknown, malformed or expired code, and a visitor's own link, are refused
// with that reader's reasons. On top of it, credit counts only when the link points at a Ready-Made Trip AND its owner
// is that trip's author. Every refusal but "no ref" is logged with its reason and the code, never an email. A refusal
// is not an error: the sign-up proceeds with no credit.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { validateRailsRef, type RailsRefusalReason } from "./rails-attribution.service";

export const WAITLIST_REFERRAL_REFUSALS = ["not_ready_made_link", "trip_not_found", "owner_not_author"] as const;
export type WaitlistReferralRefusal = RailsRefusalReason | (typeof WAITLIST_REFERRAL_REFUSALS)[number];

export type WaitlistReferral =
  | { credited: true; referrerUserId: string; shortLinkCode: string; readyMadeTripId: string }
  | { credited: false; reason: WaitlistReferralRefusal; ref: string | null };

/** Pure: the author rule over facts already read. */
export function decideWaitlistReferral(input: {
  link: { code: string; ownerUserId: string; targetType: string; targetId: string | null };
  tripAuthorId: string | null | undefined;
}): WaitlistReferral {
  const { link } = input;
  if (link.targetType !== "ready_made" || !link.targetId) {
    return { credited: false, reason: "not_ready_made_link", ref: link.code };
  }
  if (input.tripAuthorId === undefined || input.tripAuthorId === null) {
    return { credited: false, reason: "trip_not_found", ref: link.code };
  }
  if (input.tripAuthorId !== link.ownerUserId) {
    return { credited: false, reason: "owner_not_author", ref: link.code };
  }
  return { credited: true, referrerUserId: link.ownerUserId, shortLinkCode: link.code, readyMadeTripId: link.targetId };
}

/**
 * Resolve the code a visitor arrived with. `viewerUserId` is the signed-in visitor (null when signed out), used only
 * for the self-referral refusal.
 */
export async function resolveWaitlistReferral(opts: {
  ref: string | null | undefined;
  viewerUserId: string | null;
}): Promise<WaitlistReferral> {
  const check = await validateRailsRef({ ref: opts.ref, travelerUserId: opts.viewerUserId ?? "" });
  let result: WaitlistReferral;
  if (!check.valid || !check.link) {
    result = { credited: false, reason: check.reason ?? "unknown_ref", ref: check.ref };
  } else {
    let tripAuthorId: string | null | undefined;
    if (check.link.targetType === "ready_made" && check.link.targetId) {
      const r = await db.execute(sql`SELECT author_id FROM ready_made_trips WHERE id = ${check.link.targetId} LIMIT 1`);
      const row = r.rows?.[0] as { author_id: string | null } | undefined;
      tripAuthorId = row ? (row.author_id === null ? null : String(row.author_id)) : undefined;
    }
    result = decideWaitlistReferral({ link: check.link, tripAuthorId });
  }
  if (!result.credited && result.reason !== "no_ref") {
    logger.warn({ reason: result.reason, ref: result.ref }, "[waitlist-referral] ref refused — no credit");
  }
  return result;
}
