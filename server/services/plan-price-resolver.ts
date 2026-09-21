/**
 * plan-price-resolver.ts — which Stripe Price a plan is subscribed at, for the ACTIVE Stripe mode.
 *
 * Ledger `2026-09-21-membership-checkout`, memberships increment 2. Migration 317 gave `plans`
 * two price-id columns because a Stripe Price id is MODE-SCOPED: a `price_…` created in test mode
 * does not exist in live mode, and vice versa. This module answers the one question that follows:
 * given the key the process is actually calling Stripe with, which column applies?
 *
 * THE PREDICATE DECIDES; IT NEVER CALLS STRIPE AND NEVER READS THE DATABASE. It imports no `db`,
 * no `storage` and no Stripe client, and reads no `process.env` — its three inputs arrive injected,
 * exactly as `resolveSpendAuthorization` and `resolveOptimizerRunAuthorization` do. That is what
 * lets the whole rule be proven by a pure CI test with no database and no network.
 *
 * MODE COMES FROM THE KEY'S PREFIX, NOT FROM THE ENVIRONMENT, and the distinction is load-bearing.
 * `server/utils/stripe-key-policy.ts` is the ONE home of the POLICY question ("is this key allowed
 * in this environment?") and is deliberately NOT re-implemented here; this module asks a different
 * question ("which Stripe account does this key address?"), whose only honest answer is the key
 * itself. Deriving mode from `isProdStrictEnv()` instead would hand a live key the TEST price id in
 * any environment where the two disagree — and the environment is a proxy for the fact, while the
 * prefix IS the fact.
 *
 * §13 — THE ABSENCES ARE ANSWERS, AND THERE IS NO CROSS-MODE FALLBACK. A NULL (or blank) column
 * for the active mode means NO PRICE IS CONFIGURED FOR THAT MODE. It is reported by name and never
 * satisfied from the other mode's id: doing so would send an id the active key cannot resolve, and
 * Stripe's "No such price" is a worse answer than our own, arriving later and to the traveler.
 */

/** The Stripe account a secret key addresses. */
export type StripeMode = "test" | "live";

export type PlanPriceRefusal =
  /** No Stripe secret key is configured at all — nothing can be charged. */
  | "no_stripe_key"
  /** A key is present but carries neither known prefix; its mode cannot be established. */
  | "unrecognised_key_mode"
  /** The key's mode is known and that mode's column is empty. */
  | "price_not_configured";

export type PlanPriceResolution =
  | { ok: true; priceId: string; mode: StripeMode }
  | { ok: false; reason: PlanPriceRefusal; mode: StripeMode | null };

export interface PlanPriceInput {
  /** The key the process will actually call Stripe with (`getStripeSecretKey()`'s result). */
  secretKey: string | null | undefined;
  /** `plans.stripe_price_id_test` as stored — NULL when never configured. */
  stripePriceIdTest: string | null | undefined;
  /** `plans.stripe_price_id_live` as stored — NULL when never configured. */
  stripePriceIdLive: string | null | undefined;
}

/**
 * The Stripe account a secret key addresses, or `null` when that cannot be established.
 *
 * Deliberately total and conservative: anything that is not one of the two known prefixes returns
 * `null` rather than being guessed into a mode. A stubbed CI key (`sk_test_ci_stub…`) is a TEST
 * key by prefix and resolves accordingly, which is correct — it addresses no real account, but the
 * mode it claims is test.
 */
export function resolveStripeMode(secretKey: string | null | undefined): StripeMode | null {
  const key = (secretKey ?? "").trim();
  if (!key) return null;
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return null;
}

/**
 * The Price id to subscribe this plan at, for the mode the active key addresses.
 *
 * A blank or whitespace-only column is treated as NOT CONFIGURED rather than as a price id: an
 * empty string is how a column gets "filled in" by an editor that saved nothing, and passing it to
 * Stripe would fail at the API with a message about our data rather than about the configuration.
 */
export function resolvePlanPriceId(input: PlanPriceInput): PlanPriceResolution {
  const key = (input.secretKey ?? "").trim();
  if (!key) return { ok: false, reason: "no_stripe_key", mode: null };

  const mode = resolveStripeMode(key);
  if (mode === null) return { ok: false, reason: "unrecognised_key_mode", mode: null };

  // NO CROSS-MODE FALLBACK: only the column for THIS mode is consulted.
  const raw = mode === "live" ? input.stripePriceIdLive : input.stripePriceIdTest;
  const priceId = (raw ?? "").trim();
  if (!priceId) return { ok: false, reason: "price_not_configured", mode };

  return { ok: true, priceId, mode };
}

/**
 * A one-line, operator-facing sentence for a refusal. Names the COLUMN an operator must fill, so
 * the fix does not require reading this file. Never includes any part of the secret key.
 */
export function describePlanPriceRefusal(reason: PlanPriceRefusal, mode: StripeMode | null): string {
  switch (reason) {
    case "no_stripe_key":
      return "No Stripe secret key is configured, so no subscription can be created.";
    case "unrecognised_key_mode":
      return "The configured Stripe secret key starts with neither sk_test_ nor sk_live_, so its mode cannot be established.";
    case "price_not_configured":
      return `No Stripe Price is configured for this plan in ${mode ?? "the active"} mode — set plans.stripe_price_id_${mode ?? "<mode>"}.`;
  }
}
