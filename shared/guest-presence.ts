/**
 * PLAN-2 C4 (ledger `2026-11-06-plan2-c4-cleanup`): whether this browser has a guest to claim. The guest cookie
 * (`traveloure_guest`) is httpOnly and scoped to `/api/guest-plans`, so the page cannot see it. The server sets this
 * companion cookie beside it — readable, site-wide, carrying no id, only that a guest exists — and the sign-in claim is
 * sent only when it is there (or, with cookies off, when the page holds the guest id the server then reads). With no
 * guest, nothing is sent, so a sign-in with no guest plan asks nothing and the server answers no 400.
 */
export const GUEST_PRESENT_COOKIE = "traveloure_guest_present";

/** Pure: the page's cookie string has the presence cookie. */
export function hasGuestPresenceCookie(cookieString: string | null | undefined): boolean {
  if (typeof cookieString !== "string" || !cookieString) return false;
  return cookieString.split(";").some((part) => part.trim().split("=")[0] === GUEST_PRESENT_COOKIE);
}

/** Pure: should the sign-in claim be sent? */
export function shouldClaimGuestPlans(input: {
  cookieString: string | null | undefined;
  cookiesEnabled: boolean | undefined;
  localGuestId: string | null | undefined;
}): boolean {
  if (hasGuestPresenceCookie(input.cookieString)) return true;
  // Cookies off: the server reads the id the page sends (A-10), so the page's own id is the guest.
  return input.cookiesEnabled === false && typeof input.localGuestId === "string" && input.localGuestId.length > 0;
}
