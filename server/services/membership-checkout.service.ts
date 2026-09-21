/**
 * membership-checkout.service.ts — the ONE rail that starts a recurring-plan subscription.
 *
 * Ledger `2026-09-21-membership-checkout`, memberships increment 2. Increment 1 landed the
 * RECORDING half (`plan-membership-writer.service.ts`, driven only by signature-verified Stripe
 * webhooks) deliberately first, because a checkout that can charge for a subscription the platform
 * cannot record is strictly worse than no checkout. This is the COLLECTING half.
 *
 * NOTHING HERE GRANTS AN ENTITLEMENT. A completed session creates a Stripe subscription; the
 * membership row is written later, by the webhook, through increment 1's single atomic
 * `INSERT … ON CONFLICT (stripe_subscription_id)`. This module never touches `plan_memberships`.
 *
 * §14 — THE ACTOR IS THE SESSION AND THE AMOUNT IS NOT OURS TO STATE. `userId` arrives from
 * `getUserId(req)` and never from a body; the caller supplies a plan KEY, which this module
 * resolves to the row itself (the Locked Decision 42 D1 posture — a client hands a slug, never a
 * row id, and never a price). No amount, price, price id, currency or interval is accepted from
 * anywhere: the Stripe PRICE is the authority on what is charged, and `plans.price_cents` stays
 * the DISPLAYED figure that `/pricing` renders. This module reads neither.
 *
 * §15 — WHY THERE IS NO STRIPE IDEMPOTENCY KEY HERE, STATED RATHER THAN OMITTED. Creating a
 * Checkout Session moves no money; the money event is the subscription, and that is idempotent by
 * construction one layer down (increment 1's ON CONFLICT against migration 316's partial unique
 * index). Both existing `checkout.sessions.create` sites in this codebase likewise carry no
 * idempotency key, while every PaymentIntent site does — that split is the house convention and it
 * is the correct one: a reused key would hand a returning member their ORIGINAL session, which may
 * since have EXPIRED, stranding them on a dead URL.
 *
 * WHAT A SESSION KEY WOULD NOT HAVE PREVENTED, AND WHAT IS THEREFORE NOT BUILT. The real hazard is
 * a member paying TWICE — two live subscriptions for one plan. A per-session idempotency key does
 * nothing about that (two sessions are only two charges if a human completes both). The guard here
 * is the `already_member` refusal below. It is a READ-then-refuse, so two sufficiently concurrent
 * checkouts could still both pass it; closing that needs a partial unique index on
 * (user_id, plan_key) WHERE status='active', which would have to reckon with `manual`/`beta` grants
 * that legitimately coexist — an unratified schema decision. It is NAMED here rather than papered
 * over, and it is reachable only while PLUS_SALES_ENABLED is on, which it is not.
 */
import Stripe from "stripe";
import { getStripeSecretKey } from "../utils/stripe-key";
import { getBaseUrl } from "./stripe.service";
import { readPlan, PLAN_KEYS } from "./plans.service";
import { getActiveMembership } from "./plan-membership.service";
import { isPlusSalesEnabled } from "../config/plus-sales";
import {
  resolvePlanPriceId,
  describePlanPriceRefusal,
  type StripeMode,
} from "./plan-price-resolver";
import { stripePaymentService } from "./stripe-payment.service";
import { logger } from "../infrastructure/logger";

/**
 * The plans this rail can subscribe. `trip_pass` is deliberately ABSENT and refused BY NAME:
 * Locked Decision 26 keeps Trip Pass per-trip in `trip_entitlements`, charged by PaymentIntent,
 * and never in `plan_memberships`. Increment 1's writer refuses it on the recording side for the
 * same reason; this is the same rule on the collecting side.
 */
export const SUBSCRIBABLE_PLAN_KEYS: readonly string[] = [
  PLAN_KEYS.PLUS_ANNUAL,
  PLAN_KEYS.PRO_MONTHLY,
];

export type MembershipCheckoutRefusal =
  /** PLUS_SALES_ENABLED is off — the LD 26 gate. The default, and the state today. */
  | "sales_disabled"
  /** A plan key outside the recurring set (notably `trip_pass`). */
  | "plan_not_subscribable"
  /** No such plan row, or the row is inactive. */
  | "plan_unavailable"
  /** The active key's mode has no Price configured, or no/unrecognised key. */
  | "price_not_configured"
  /** This user already holds a live membership for this plan. */
  | "already_member"
  /** Stripe accepted nothing — the API call failed. */
  | "stripe_error";

export type MembershipCheckoutResult =
  | { ok: true; url: string; sessionId: string; mode: StripeMode }
  | { ok: false; reason: MembershipCheckoutRefusal; detail: string };

export interface MembershipCheckoutInput {
  /** From the session (§14). Never from a request body. */
  userId: string;
  /** A plan KEY the caller named; resolved to its row here. */
  planKey: string;
}

/**
 * Start a subscription Checkout Session for this member and plan.
 *
 * Refusals are ordered cheapest-first and each names itself, so an operator reading a log knows
 * which of six distinct things was wrong without reproducing it (§13).
 */
export async function startMembershipCheckout(
  input: MembershipCheckoutInput,
): Promise<MembershipCheckoutResult> {
  const { userId } = input;
  const planKey = (input.planKey ?? "").trim();

  // 1. The LD 26 sales gate. Checked FIRST so that while Plus is not on sale this rail cannot be
  //    reached at all — not by a crafted request, and not by a client that ignores the public flag.
  if (!isPlusSalesEnabled()) {
    return {
      ok: false,
      reason: "sales_disabled",
      detail: "Plan sales are not enabled.",
    };
  }

  // 2. The recurring set. `trip_pass` is refused by name, never filed under a nearest-looking plan.
  if (!SUBSCRIBABLE_PLAN_KEYS.includes(planKey)) {
    return {
      ok: false,
      reason: "plan_not_subscribable",
      detail: `"${planKey}" is not a subscription plan.`,
    };
  }

  // 3. The row. `readPlan` returns null rather than inventing a default when configuration is
  //    absent; an inactive plan is a deliberate operator state and is refused, not sold.
  const plan = await readPlan(planKey);
  if (!plan) {
    return { ok: false, reason: "plan_unavailable", detail: `No plan row for "${planKey}".` };
  }
  if (!plan.active) {
    return { ok: false, reason: "plan_unavailable", detail: `Plan "${planKey}" is not active.` };
  }

  // 4. Already a member. See the header: a read-then-refuse, with its residual race named there.
  const existing = await getActiveMembership(userId, planKey);
  if (existing) {
    return {
      ok: false,
      reason: "already_member",
      detail: `Already an active member of "${planKey}".`,
    };
  }

  // 5. The Price for the mode the active key addresses. The resolver is pure; the key is read here
  //    and injected, so the rule itself stays provable without an environment.
  const secretKey = getStripeSecretKey();
  const price = resolvePlanPriceId({
    secretKey,
    stripePriceIdTest: plan.stripePriceIdTest,
    stripePriceIdLive: plan.stripePriceIdLive,
  });
  if (!price.ok) {
    const detail = describePlanPriceRefusal(price.reason, price.mode);
    // An operator-visible misconfiguration, not a traveler's mistake — logged at error level so it
    // is not discovered only by the person who could not buy.
    logger.error(
      `[membership-checkout] refused: ${price.reason} plan=${planKey} mode=${price.mode ?? "unknown"}`,
    );
    return { ok: false, reason: "price_not_configured", detail };
  }

  // 6. The customer. ONE author (`getOrCreateCustomer`, whose stamp onto `users.stripe_customer_id`
  //    is an atomic conditional) — never a second create path. This also gives the webhook its
  //    FALLBACK route to the user when metadata is somehow absent.
  const customerId = (await stripePaymentService.getOrCreateCustomer(userId)) ?? undefined;

  const stripe = new Stripe(secretKey as string, { apiVersion: "2024-12-18.acacia" as any });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // LD 43 audit note — a hosted Checkout Session, NOT a PaymentIntent site, and pinned for the
      // same reason the transport and expert-service sessions are: a hosted session's method set is
      // DASHBOARD-configured rather than set by `automatic_payment_methods`, and dropping the pin
      // also admits delayed-notification methods whose `checkout.session.completed` can arrive
      // UNPAID — a webhook-behaviour change LD 43 explicitly did not authorize. Widening it is an
      // operator + webhook lane, not a find-replace. Recorded, not silently inherited.
      payment_method_types: ["card"],
      // NO amount, currency or interval is stated here. The Price is the authority (§14).
      line_items: [{ price: price.priceId, quantity: 1 }],
      customer: customerId,
      // THE METADATA THAT MAKES INCREMENT 1 WORK, AND IT GOES ON `subscription_data`, NOT ON THE
      // SESSION. `upsertStripeMembership` reads `metadata.userId` / `metadata.planKey` off the
      // SUBSCRIPTION object the webhook delivers, and Stripe does NOT copy session metadata onto
      // the subscription it creates. Session-level metadata alone would leave the writer with an
      // empty `metadataUserId`, falling back to the customer lookup and — for any member whose
      // `users.stripe_customer_id` was not yet stamped — writing NOTHING, silently. Both keys are
      // stamped here because both are required: the writer refuses an unresolvable plan key rather
      // than guessing one.
      subscription_data: {
        metadata: { userId, planKey },
      },
      // Session metadata as well, for the session-level webhook and for operator legibility in the
      // Stripe dashboard. It is NOT what increment 1 reads.
      metadata: { type: "membership_subscription", userId, planKey },
      success_url: `${getBaseUrl()}/pricing?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getBaseUrl()}/pricing?membership=cancelled`,
    });

    if (!session.url) {
      // Stripe returned a session with no hosted URL. Nothing to send the member to; say so rather
      // than return ok with an empty string (§13).
      logger.error(`[membership-checkout] session ${session.id} has no url plan=${planKey}`);
      return {
        ok: false,
        reason: "stripe_error",
        detail: "Stripe did not return a checkout URL.",
      };
    }

    return { ok: true, url: session.url, sessionId: session.id, mode: price.mode };
  } catch (err: any) {
    logger.error(
      `[membership-checkout] stripe error plan=${planKey} mode=${price.mode}: ${err?.message}`,
    );
    return {
      ok: false,
      reason: "stripe_error",
      detail: "Could not start checkout with Stripe.",
    };
  }
}
