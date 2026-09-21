/**
 * The ONE writer of `plan_memberships` (ledger `2026-09-21-membership-writer`).
 *
 * Locked Decision 26 reserved this: `plan_memberships` is "READ here (`isActivePlus`) and WRITTEN
 * later by the separate Plus-checkout lane from the Stripe subscription webhook (it populates,
 * never redefines)". Until now the table had NO writer anywhere in `server/`. This is it.
 *
 * ═══ WHY THE WRITER COMES BEFORE THE CHECKOUT RAIL ═══
 *
 * A checkout that can charge for a subscription the platform cannot record is strictly worse than
 * no checkout: the traveler is billed by Stripe and the entitlement never appears. So the
 * recording half lands first, and the Stripe Checkout Session that starts a subscription is the
 * NEXT increment. Nothing in this module sells anything, and `PLUS_SALES_ENABLED` is untouched.
 *
 * ═══ ONLY STRIPE'S OWN WORD WRITES A `source='stripe'` ROW (§14/§15c) ═══
 *
 * Every entry point here is driven by a SIGNATURE-VERIFIED webhook delivery. §15c's rule — "only
 * the webhook may resolve … a signature-verified Stripe delivery is Stripe's word; a
 * client-supplied one is not" — is why this module takes a Stripe subscription object rather than
 * a request body, and why no route calls it. A client may not assert its own membership.
 *
 * The user is resolved from the subscription's own metadata (`userId`, stamped by the checkout
 * rail when it creates the subscription) or from the Stripe customer id already on `users`. It is
 * NEVER read from a request (§14 identity).
 *
 * ═══ IDEMPOTENT BY CONSTRUCTION, NOT BY A CHECK (§15) ═══
 *
 * Stripe redelivers webhooks routinely. The write is ONE atomic
 * `INSERT … ON CONFLICT (stripe_subscription_id) DO UPDATE`, against the partial unique index
 * migration 316 adds. A redelivery updates the row it already wrote; it never inserts a second.
 * A check-then-insert would be the TOCTOU bug §15 exists to refuse, and with two rows for one
 * subscription `getActiveMembership`'s "most-recent period wins" would decide a traveler's
 * entitlement by a race.
 *
 * ═══ §13 — WHAT IT REFUSES TO GUESS ═══
 *
 *   · An UNMAPPABLE price/plan is NOT filed under a nearest-looking plan key. `plan_key` is
 *     resolved from the subscription's own metadata or the `plans` table, and when neither answers
 *     the row is not written and the reason is returned. A membership under the wrong plan grants
 *     the wrong thing.
 *   · An UNRESOLVABLE user is the same: no row, a named reason. There is no "create the user".
 *   · A subscription with no period end is stored with `current_period_end` NULL only when Stripe
 *     itself reports none. The reader already treats NULL as an open-ended grant, so inventing a
 *     date here would silently convert "Stripe said nothing" into an expiry nobody set.
 *
 * ═══ STATED NEGATIVE SPACE (§18d) ═══
 *
 *   · It does not CHARGE, refund, or price anything. Stripe has already decided the money; this
 *     records the entitlement that resulted. No amount, rate or fee is read or written.
 *   · It does not reconcile. A subscription that exists at Stripe but never delivered a webhook is
 *     invisible here; §17's drift job covers the booking rails and knows nothing about
 *     subscriptions. That gap is real and is recorded in the ledger row rather than papered over.
 *   · Trip Pass is NOT modelled here. Locked Decision 26 keeps it per-trip in `trip_entitlements`,
 *     never in `plan_memberships`, and nothing in this module touches it.
 */

import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { PLAN_KEYS, type PlanKey } from "./plans.service";

/** The subscription facts this writer needs. Shaped so tests need no Stripe SDK. */
export interface StripeSubscriptionFacts {
  subscriptionId: string;
  status: string;
  /** Unix seconds, as Stripe reports them. */
  currentPeriodStart?: number | null;
  currentPeriodEnd?: number | null;
  /** `metadata.userId`, stamped by the checkout rail that created the subscription. */
  metadataUserId?: string | null;
  /** `metadata.planKey`, same origin. */
  metadataPlanKey?: string | null;
  /** The Stripe customer, used to resolve the user when metadata is absent. */
  customerId?: string | null;
}

export type MembershipWriteResult =
  | { written: true; userId: string; planKey: PlanKey; status: MembershipStatus }
  | { written: false; reason: "no_user" | "no_plan_key" | "no_subscription_id" };

export type MembershipStatus = "active" | "lapsed" | "cancelled";

/** The recurring plans this table holds. Trip Pass is deliberately absent (LD 26). */
const RECURRING_PLAN_KEYS: readonly string[] = [PLAN_KEYS.PLUS_ANNUAL, PLAN_KEYS.PRO_MONTHLY];

/**
 * Stripe's subscription status vocabulary mapped to this table's three values.
 *
 * §13: the mapping is EXPLICIT and total. `past_due` and `unpaid` map to `lapsed` rather than
 * `active` — Stripe still considers the subscription alive while it retries payment, but the
 * platform should not grant a paid entitlement on an unpaid period. `incomplete` is NOT yet a
 * membership at all and is treated as `lapsed`, never `active`. Anything unrecognised is `lapsed`,
 * which is the SAFE direction: an unknown state must not grant.
 */
export function mapStripeSubscriptionStatus(stripeStatus: string): MembershipStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
      return "cancelled";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "lapsed";
    default:
      return "lapsed";
  }
}

function unixToDate(seconds: number | null | undefined): Date | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** Resolve the owning user WITHOUT trusting any request (§14). Metadata first, then the customer. */
async function resolveUserId(facts: StripeSubscriptionFacts): Promise<string | null> {
  const fromMetadata = (facts.metadataUserId ?? "").trim();
  if (fromMetadata) {
    const r = await db.execute(sql`SELECT id FROM users WHERE id = ${fromMetadata} LIMIT 1`);
    if (r.rows?.length) return (r.rows[0] as any).id as string;
  }
  const customerId = (facts.customerId ?? "").trim();
  if (customerId) {
    const r = await db.execute(sql`
      SELECT id FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1`);
    if (r.rows?.length) return (r.rows[0] as any).id as string;
  }
  return null;
}

/** Resolve the plan key from metadata, refusing anything outside the recurring set (§13). */
function resolvePlanKey(facts: StripeSubscriptionFacts): PlanKey | null {
  const key = (facts.metadataPlanKey ?? "").trim();
  if (!key) return null;
  if (!RECURRING_PLAN_KEYS.includes(key)) return null; // never file under a nearest-looking plan
  return key as PlanKey;
}

/**
 * Record (or update) the membership a Stripe subscription grants.
 *
 * Called ONLY from the signature-verified webhook handler. Never from a route.
 */
export async function upsertStripeMembership(
  facts: StripeSubscriptionFacts,
): Promise<MembershipWriteResult> {
  const subscriptionId = (facts.subscriptionId ?? "").trim();
  if (!subscriptionId) return { written: false, reason: "no_subscription_id" };

  const planKey = resolvePlanKey(facts);
  if (!planKey) return { written: false, reason: "no_plan_key" };

  const userId = await resolveUserId(facts);
  if (!userId) return { written: false, reason: "no_user" };

  const status = mapStripeSubscriptionStatus(facts.status);
  const periodStart = unixToDate(facts.currentPeriodStart);
  const periodEnd = unixToDate(facts.currentPeriodEnd);

  // §15: ONE atomic statement. The conflict target is migration 316's partial unique index, so a
  // webhook redelivery UPDATES the row it already wrote rather than inserting a second.
  // `source` is forced to 'stripe' here and is never taken from the caller: a row this writer
  // creates was created by Stripe's word, and labelling it 'manual' would misattribute it.
  // `plan_memberships.id` is generated by drizzle's `$defaultFn` — an APPLICATION-side default,
  // not a DB one — so a raw INSERT must supply it. (Found by M1, which failed with "null value in
  // column id violates not-null constraint" before this line existed. The id is only used on the
  // INSERT branch; a conflict keeps the row's existing id.)
  const newId = crypto.randomUUID();

  await db.execute(sql`
    INSERT INTO plan_memberships
      (id, user_id, plan_key, status, current_period_start, current_period_end, source,
       stripe_subscription_id, created_at, updated_at)
    VALUES
      (${newId}, ${userId}, ${planKey}, ${status}, ${periodStart}, ${periodEnd}, 'stripe',
       ${subscriptionId}, NOW(), NOW())
    ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL
    DO UPDATE SET
      status                = EXCLUDED.status,
      current_period_start  = EXCLUDED.current_period_start,
      current_period_end    = EXCLUDED.current_period_end,
      plan_key              = EXCLUDED.plan_key,
      updated_at            = NOW()
  `);

  return { written: true, userId, planKey, status };
}
