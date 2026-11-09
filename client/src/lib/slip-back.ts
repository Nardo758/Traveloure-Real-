/**
 * B-7 (ruled 2026-11-09, Leon) — where the slip's top-bar back control goes.
 *
 * The board draws an arrow, not a target, and the two obvious targets fail differently: a fixed
 * `/plans` is wrong for a deep link's history, and bare `history.back()` can leave the app (or do
 * nothing) when there is no in-app entry behind the page. The ruling is a hybrid, and this module
 * is its ONE statement — the control and its pins read the same functions:
 *
 *   1. IN-APP HISTORY WINS. When this document has a same-origin entry behind it, step back:
 *      that is where the traveler actually came from (My Trips, Browse, a Moment, a plan list).
 *   2. NO HISTORY, OWNER ⇒ `/plans`, the plan list's address (`App.tsx` redirects it to
 *      `/my-trips`; `plan-versions.tsx` already links there as its own way back).
 *   3. NO HISTORY, GUEST ⇒ the plan's own city in Browse, `/discover/location/<city>`. A guest
 *      has no plan list, so `/plans` would hand a signed-out traveler to sign-in — and a back
 *      control must never send someone to a wall. A guest plan whose destination is empty goes
 *      to `/discover` itself; no city is invented (§13).
 */

/** What the history question reads. Passed in whole so the decision is testable without a DOM. */
export interface BackEnvironment {
  /** `document.referrer` — empty for a direct visit and for an in-app push. */
  referrer: string;
  /** `window.history.length` — entries in this tab's session history, this page included. */
  historyLength: number;
  /** `window.location.origin` — the app's own origin, the only one "in-app" can mean. */
  origin: string;
}

/**
 * True when stepping back stays inside the app.
 *
 * `historyLength > 1` is the only signal that this tab has an entry behind the page; the referrer
 * decides whether that entry is OURS. A same-tab SPA navigation pushes state and never reloads the
 * document, so the referrer stays empty — that is why an empty referrer PLUS history reads as
 * in-app. A cross-origin referrer is never treated as history: that is exactly the case where
 * "back" would leave the app for Google or a mail client.
 */
export function sameOriginHistory({ referrer, historyLength, origin }: BackEnvironment): boolean {
  if (historyLength <= 1) return false;
  if (!referrer) return true;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

/**
 * The city a guest's back control returns to: the plan's first destination, before any
 * ", Country" tail — the same head `discover-location` serves at `/discover/location/:city`.
 * `null` when the plan names nowhere, so the caller can fall back rather than invent one.
 */
export function slipBackCity(destination: string | null | undefined): string | null {
  const head = (destination ?? "").split(",")[0]?.trim() ?? "";
  return head ? head : null;
}

/**
 * B-7's fallback target for when this tab has no in-app history. Never a sign-in page: an owner
 * gets the plan list, a guest gets the plan's city in Browse.
 */
export function slipBackHref(input: { guest: boolean; destination?: string | null }): string {
  if (!input.guest) return "/plans";
  const city = slipBackCity(input.destination);
  return city ? `/discover/location/${encodeURIComponent(city)}` : "/discover";
}
