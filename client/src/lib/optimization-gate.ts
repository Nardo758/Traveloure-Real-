/**
 * optimization-gate — the ONE client implementation of the optimizer fee/pay-gate sequence
 * (`POST /api/optimization-payments` → [Stripe sheet | one-click | free re-run] →
 * `POST /api/optimization-payments/confirm`), extracted verbatim from cart.tsx's
 * `requestOptimizationPayment` / `payWithSavedCard` / `handleOptimizationPaymentSuccess`
 * so the cart and the slip ("Optimize this plan", SlipView) consume a single implementation
 * instead of duplicating payment logic (console-fixes lane A, work item A1).
 *
 * Scope discipline: this module talks ONLY to the two optimization-payment endpoints above.
 * It never posts to /api/checkout or any /api/cart write path, and it makes no money
 * decision of its own — amount/tier/free-re-run eligibility are all server-derived
 * (`canRunOptimizer`, optimization-fee.service.ts), exactly as before the extraction (§14).
 *
 * Callers keep their own UI: what to do on each outcome (mount the Stripe sheet, open the
 * planning dialog on the `trip_empty_convert_cart` refusal, navigate after the comparison
 * is created) stays caller-side — see cart.tsx and SlipView.tsx.
 */

/** The state the Stripe payment sheet (StripeCheckout) needs — cart.tsx's OptimizationPaymentState. */
export interface OptimizationPaymentSheet {
  clientSecret: string;
  paymentIntentId: string;
  feeCents: number;
  currency: string;
}

export type OptimizationGateOutcome =
  /** Server says the 24h free re-run window is active — run the comparison, nothing to charge. */
  | { kind: "free_rerun" }
  /** FP-2 one-click: the saved default card was charged off-session and succeeded. */
  | { kind: "paid"; paymentIntentId: string }
  /** A PaymentIntent needing the interactive sheet (fresh card, or 3DS `requiresAction` fallback). */
  | { kind: "payment_sheet"; payment: OptimizationPaymentSheet }
  /**
   * Saved-card charge was requested but no usable method existed after all — the caller
   * should fall back to the sheet path (re-request without `useSavedCard`), matching
   * cart.tsx's payWithSavedCard fallback.
   */
  | { kind: "no_saved_card" }
  /**
   * The server refused before any Stripe call (fix #971's pre-flight): currently
   * 409 `trip_empty_convert_cart`. Surfaced as data, never swallowed — each caller
   * owns its own honest UI for it.
   */
  | { kind: "refused"; status: number; body: Record<string, unknown> };

export interface OptimizationGateRequest {
  tripId?: string;
  userExperienceId?: string;
  /** Rides along as comparisonContext.destination (display context only — never a money input).
   *  `null` is accepted and forwarded as-is — cart.tsx's experienceTitle is `string | null`,
   *  and the pre-extraction requests sent it verbatim. */
  destination?: string | null;
  /** FP-2: charge the saved default card off-session instead of mounting the sheet. */
  useSavedCard?: boolean;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** True when this response body is the fix-#971 pre-flight refusal. */
export function isTripEmptyRefusal(status: number, body: unknown): boolean {
  return (
    status === 409 &&
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).error === "trip_empty_convert_cart"
  );
}

/**
 * Create (or short-circuit) the optimization-fee payment. One POST to
 * `/api/optimization-payments`, branched into a discriminated outcome exactly mirroring
 * the branches cart.tsx handled inline. Throws on any non-refusal error response (same
 * message fallbacks as the cart originals).
 */
export async function requestOptimizationGate(
  opts: OptimizationGateRequest,
): Promise<OptimizationGateOutcome> {
  const { tripId, userExperienceId, destination, useSavedCard, fetchImpl } = opts;
  const doFetch = fetchImpl ?? fetch;

  const res = await doFetch("/api/optimization-payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      tripId,
      userExperienceId,
      comparisonContext: { destination },
      ...(useSavedCard ? { useSavedCard: true } : {}),
    }),
  });

  // Read the body regardless of status — the refusal is a JSON error payload, not a network failure.
  const data: Record<string, unknown> = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (isTripEmptyRefusal(res.status, data)) {
      return { kind: "refused", status: res.status, body: data };
    }
    throw new Error(
      (typeof data?.message === "string" && data.message) ||
        (useSavedCard ? "Could not start payment" : "Could not create payment"),
    );
  }

  if (data.freeRerun) return { kind: "free_rerun" };

  if (useSavedCard) {
    if (data.oneClick && data.status === "succeeded") {
      return { kind: "paid", paymentIntentId: String(data.paymentIntentId) };
    }
    if (data.requiresAction) {
      // Bank demands 3DS — fall back to the interactive sheet for this one charge.
      return { kind: "payment_sheet", payment: toSheetState(data) };
    }
    // No saved method after all (shouldn't happen if hasDefault was true) — caller falls
    // back to the sheet path.
    return { kind: "no_saved_card" };
  }

  return { kind: "payment_sheet", payment: toSheetState(data) };
}

function toSheetState(data: Record<string, unknown>): OptimizationPaymentSheet {
  return {
    clientSecret: String(data.clientSecret),
    paymentIntentId: String(data.paymentIntentId),
    feeCents: Number(data.feeCents),
    currency: (typeof data.currency === "string" && data.currency) || "USD",
  };
}

/**
 * Post-payment confirm (`/api/optimization-payments/confirm`). Best-effort by design —
 * cart.tsx treated a confirm failure as non-critical (the server reconciles from Stripe's
 * side), and that behavior is preserved verbatim: errors are swallowed, the caller
 * proceeds to create the comparison either way.
 */
export async function confirmOptimizationPayment(
  paymentIntentId: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const doFetch = fetchImpl ?? fetch;
  try {
    await doFetch("/api/optimization-payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentIntentId }),
    });
  } catch {
    /* non-critical */
  }
}
