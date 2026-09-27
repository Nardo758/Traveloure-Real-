/**
 * The two checkout-hold windows, stated ONCE so the server's sweeps and the words a traveler reads
 * (help article 8, `payment-didnt-go-through`) cannot disagree (§18 rule 1). Neither is a fee or a
 * rate (§8) — both are staleness windows.
 *
 * Imported by server/services/checkout-claim.service.ts (which re-exports both under the same names
 * for its existing callers) and by shared/help-articles.ts.
 */

/** Ratified TTL (decision-maker, ruling 38): long enough for a traveler to finish the Stripe
 *  PaymentElement, short enough that held inventory comes back the same session. */
export const CHECKOUT_CLAIM_TTL_MINUTES = 30;

/**
 * R164 (G2, decision-maker ruled Sep 27, 2026; ledger `2026-09-27-stale-authorized-sweep`): how long
 * an AUTHORIZED claim may sit unpaid before the sweep gives up on it and cancels its PaymentIntent.
 */
export const STALE_AUTHORIZED_CLAIM_HOURS = 24;
