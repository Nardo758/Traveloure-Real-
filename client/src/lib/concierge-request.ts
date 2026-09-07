/**
 * THE CONCIERGE REQUEST'S ONE CLIENT WRITER — ledger `2026-09-07-concierge-door`.
 *
 * `PATCH /api/concierge/requests/:id` is POSSESSION-gated server-side (the P0 fix in
 * `server/routes/concierge.routes.ts`): the browser session that created the request is normally
 * the proof, which is why `credentials: "include"` is load-bearing for GUESTS as well as for
 * signed-in travelers, and why a stored HMAC claim token is sent alongside when this browser
 * holds one for THIS request. Those two rules were written out once inside `DeliveryOptions.tsx`
 * and are now needed by two callers — the tier the modal's finish records, and the done-for-you
 * card — so they live here instead of being copied (§18 rule 1). A second copy is how one caller
 * quietly stops sending the token and starts 403ing for guests only.
 *
 * NO MONEY, NO IDENTITY (§14/§19). The body carries a tier and, when this browser holds one, a
 * possession token. It carries no amount, no rate and no user id: the server derives the actor
 * from the session and the tier's own price from config.
 */

/** Where a guest's request id and its HMAC possession token are held between page loads. */
export const GUEST_CONCIERGE_REQUEST_ID_KEY = "guestConciergeRequestId";
export const GUEST_CONCIERGE_CLAIM_TOKEN_KEY = "guestConciergeClaimToken";

/**
 * The claim token this browser holds for `requestId`, or `undefined`.
 *
 * Only ever returns a token stored against THAT SAME id — a token for a different request proves
 * nothing about this one, and sending it would be a possession claim nobody made. Every read is
 * wrapped: a private window or a storage-blocked browser throws on access, and "no token" is the
 * honest answer there rather than a crash on a page that works fine without one.
 */
export function storedConciergeClaimToken(requestId: string): string | undefined {
  try {
    const storedId = sessionStorage.getItem(GUEST_CONCIERGE_REQUEST_ID_KEY);
    const storedToken = sessionStorage.getItem(GUEST_CONCIERGE_CLAIM_TOKEN_KEY);
    return storedId === requestId && storedToken ? storedToken : undefined;
  } catch {
    return undefined;
  }
}

/** Remember a guest's request + token so the post-sign-in claim hook can find them. */
export function rememberGuestConciergeRequest(requestId: string, claimToken?: string): void {
  try {
    sessionStorage.setItem(GUEST_CONCIERGE_REQUEST_ID_KEY, requestId);
    if (claimToken) sessionStorage.setItem(GUEST_CONCIERGE_CLAIM_TOKEN_KEY, claimToken);
  } catch {
    // A browser that refuses storage still gets the rest of the flow; only the post-auth claim
    // is lost, and losing it silently is better than failing the write the traveler asked for.
  }
}

/** Record which delivery tier the traveler chose. Returns the raw response for callers that read it. */
export function patchConciergeTier(
  requestId: string,
  tier: "ai" | "expert" | "full",
): Promise<Response> {
  const claimToken = storedConciergeClaimToken(requestId);
  return fetch(`/api/concierge/requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ chosenTier: tier, ...(claimToken ? { claimToken } : {}) }),
  });
}
