/**
 * Row 280b (ledger `2026-10-29-guest-plan-my-day-button`): the guest's "Plan my day around this"
 * button, over row 280a's POST /api/invites/:token/plan. The server decides everything that
 * matters: it takes the guest from the session, refuses a guest who has not accepted (403) and a
 * second account (409), and answers 201 or 200 with the plan's id.
 *
 * The button shows only to a signed-in guest who has accepted; otherwise it is absent.
 * After a 200 or 201 carrying a tripId the page opens /trip/:tripId (the Trip Slip). Anything else,
 * a network failure included, opens nothing and the button can be pressed again.
 */
export function showPlanMyDayButton(signedIn: boolean, rsvpStatus: string | null | undefined): boolean {
  return signedIn && rsvpStatus === "accepted";
}

/** The plan's path for a tripId, or null when there is none to open. */
export function guestPlanPath(tripId: unknown): string | null {
  return typeof tripId === "string" && tripId.length > 0 ? `/trip/${encodeURIComponent(tripId)}` : null;
}

/**
 * One POST, no body, with the session cookie. Resolves to the path to open, or null for every
 * refusal (403, 404, 409, 5xx) and for a network error. Never throws.
 */
export async function requestGuestPlan(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`/api/invites/${token}/plan`, { method: "POST", credentials: "include" });
    if (response.status !== 200 && response.status !== 201) return null;
    const data = await response.json().catch(() => null);
    return guestPlanPath(data?.tripId);
  } catch {
    return null;
  }
}
