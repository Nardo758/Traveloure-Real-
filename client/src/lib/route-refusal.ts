/**
 * ONE reading of the routing rail's refusals (`POST /api/trips/:tripId/items/:itemId/route`,
 * server/routes/routing.routes.ts) — ledger `2026-09-26-finalized-checkout-messages`.
 *
 * The rail answers a finalized plan with three named 409s (ruling `2026-09-26-card-routing-read-only`,
 * decision-maker Sep 26, 2026) and a plan with no expert with a fourth:
 *   · `not_in_final`      — the item is not in the plan's CURRENT final version. The traveler is told
 *                           the plan is finalized and offered Reopen.
 *   · `plan_finalized`    — a planning change on a finalized plan. Also offered Reopen.
 *   · `already_purchased` — nothing to stage; no Reopen (reopening would not change that).
 *   · `no_expert_assigned`— "Send to expert" with nobody to send to.
 * Every surface that calls the rail reads the refusal HERE (§18 rule 1) — before this, three of the
 * five showed a generic "couldn't be moved to checkout" and one showed the raw `409: {json}` text.
 *
 * The description is the server's own `message` wherever it sent one; only the TITLE and the Reopen
 * offer are decided client-side, keyed on the server's `code` (never on message text).
 */
import { parseApiRefusal } from "./api-refusal";

export type RouteRefusalCode = "not_in_final" | "plan_finalized" | "already_purchased" | "no_expert_assigned";

export interface RouteRefusal {
  /** The server's `code`, when it sent one. */
  code: string | null;
  /** The server's `message`, else the raw body, else null. */
  message: string | null;
}

/**
 * The rail's `code` and `message`, through the ONE parse of a thrown `apiRequest` error
 * (`parseApiRefusal`, client/src/lib/api-refusal.ts — §18 rule 1; this adds no second parser).
 */
export function readRouteRefusal(err: unknown): RouteRefusal {
  const body = parseApiRefusal(err);
  return {
    code: typeof body.code === "string" && body.code ? body.code : null,
    message: typeof body.message === "string" && body.message ? body.message : null,
  };
}

/** The codes after which "Reopen plan" is the way forward. */
export const REOPEN_OFFERED_CODES: ReadonlySet<string> = new Set(["not_in_final", "plan_finalized"]);

export interface RouteRefusalNotice {
  title: string;
  description: string;
  /** Offer "Reopen plan" beside the message (owner surfaces only; the reopen rail is owner-gated). */
  offerReopen: boolean;
}

/**
 * The toast for ONE refused item. `fallbackTitle` is the surface's own wording for an unnamed
 * failure (a network error, a 500) — those keep today's behaviour.
 */
export function routeRefusalNotice(err: unknown, fallbackTitle: string, fallbackDescription = "Please try again."): RouteRefusalNotice {
  const { code, message } = readRouteRefusal(err);
  switch (code) {
    case "not_in_final":
      return {
        title: "This plan is finalized",
        description:
          message ??
          "This item is not part of the finalized plan. Reopen the plan and finalize it again to book it.",
        offerReopen: true,
      };
    case "plan_finalized":
      return {
        title: "This plan is finalized",
        description: message ?? "Reopen it to change how its items are routed.",
        offerReopen: true,
      };
    case "already_purchased":
      return {
        title: "Already purchased",
        description: message ?? "This item is already purchased.",
        offerReopen: false,
      };
    case "no_expert_assigned":
      return {
        title: "No expert on this plan yet",
        description: message ?? "Hand the plan off to a local expert first.",
        offerReopen: false,
      };
    default:
      return { title: fallbackTitle, description: message ?? fallbackDescription, offerReopen: false };
  }
}

/** Bulk: does any failure call for Reopen? (Codes collected by `runBulkRouteToCheckout`.) */
export function bulkOffersReopen(failures: ReadonlyArray<{ code?: string | null }>): boolean {
  return failures.some((f) => !!f.code && REOPEN_OFFERED_CODES.has(f.code));
}
