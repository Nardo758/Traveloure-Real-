/**
 * Stripe Payment Service — Cart Bookings, Expert Services & Refunds
 *
 * OWNERSHIP: This service is the canonical owner of Stripe PaymentIntents and Checkout
 * Sessions for cart-based bookings (multi-service checkout) and expert advisory service
 * purchases (review-only, review-and-book, full-concierge). It also owns the central
 * webhook event dispatcher: it routes `payment_intent.succeeded/failed/canceled`,
 * `charge.refunded`, and `checkout.session.completed` events to the appropriate handler,
 * delegating transport-booking confirmation to stripe.service.ts via
 * `handleStripePaymentSuccess`. Refund creation (stripe.refunds.create) is owned here.
 *
 * DOES NOT OWN: Checkout Sessions for transport bookings (owned by stripe.service.ts),
 * Connect account management or payouts to experts/providers (owned by
 * stripe-connect.service.ts).
 *
 * Stripe API calls made here:
 *   - stripe.paymentIntents.create    — cart checkout and expert service embedded checkout
 *   - stripe.paymentIntents.retrieve  — payment intent status lookup
 *   - stripe.checkout.sessions.create — expert service hosted checkout
 *   - stripe.refunds.create           — booking refunds
 */

import Stripe from 'stripe';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { handleStripePaymentSuccess } from './stripe.service';
import { sendBookingConfirmationEmail } from './email.service';
import { trackFunnelEvent } from '../utils/funnelTracker';
import { logger } from '../infrastructure/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

// ── Refund-reason mapping (L14 money-path P0) ──────────────────────────────────────────────
//
// THE BUG THIS CLOSES: `refundServiceBooking` used to forward its caller's reason straight to
// Stripe behind a cast — `reason: (reason as Stripe.RefundCreateParams.Reason)`. The cast
// silenced TypeScript, but Stripe's API accepts ONLY the three values below; anything else is a
// 400 (`invalid_request_error`). Both callers pass values outside that set: the admin
// dispute-uphold terminal passes `reason || "dispute_upheld"` where `reason` originates as the
// traveler's FREE-TEXT dispute reason, and POST /api/bookings/refund passes a body-supplied
// reason. Because both flows are deliberately LEDGER-FIRST (§18 Phase 4 — reverse the escrow
// earnings + write the compensating platform_revenue row, THEN call Stripe, so a Stripe failure
// leaves a fully-reversed ledger a retry re-confirms), the 400 landed after the ledger was
// already reversed: the earner was debited, the traveler never refunded, and the caller got a 500.
//
// THE FIX: keep the rich internal reason for the audit trail (`refunds.reason`, TEXT — migration
// 156), send a VALID enum to Stripe. Unknown/free-text MUST fall back to a valid enum and must
// NEVER be forwarded — fail-safe, because the alternative is money stuck mid-flight.
//
// `fraudulent` is deliberately only reachable when a caller passes it VERBATIM. No internal
// reason maps onto it: labelling a refund fraudulent in Stripe has real consequences for the
// account's dispute/radar record, so it is never inferred (no invented fraud path).
type StripeRefundReason = Stripe.RefundCreateParams.Reason;

const STRIPE_REFUND_REASONS: readonly StripeRefundReason[] = [
  'duplicate',
  'fraudulent',
  'requested_by_customer',
];

/** Internal reason vocabulary → the Stripe enum. Extend HERE, never at a call site. */
const INTERNAL_REFUND_REASON_MAP: Readonly<Record<string, StripeRefundReason>> = {
  // Admin upheld a traveler dispute (admin.routes.ts /api/admin/disputes/:bookingId/uphold).
  // The traveler asked for their money back and an admin agreed — customer-requested.
  dispute_upheld: 'requested_by_customer',
  // Traveller/admin-initiated cancellation refunds (POST /api/bookings/refund).
  cancelled: 'requested_by_customer',
  canceled: 'requested_by_customer',
  cancellation: 'requested_by_customer',
  customer_request: 'requested_by_customer',
  duplicate_booking: 'duplicate',
};

/**
 * Map an internal/free-text refund reason to a reason Stripe will actually accept.
 *
 * - the three Stripe enum values pass through unchanged (case/whitespace-normalised);
 * - a known internal reason maps via INTERNAL_REFUND_REASON_MAP;
 * - anything else (free text, empty, null) → 'requested_by_customer'.
 *
 * The ORIGINAL string is what gets persisted to `refunds.reason` — nothing is lost by this
 * mapping. Exported for the money-path tests.
 */
export function toStripeRefundReason(reason?: string | null): StripeRefundReason {
  const normalized = (reason ?? '').trim().toLowerCase();
  if (!normalized) return 'requested_by_customer';
  if ((STRIPE_REFUND_REASONS as readonly string[]).includes(normalized)) {
    return normalized as StripeRefundReason;
  }
  const mapped = INTERNAL_REFUND_REASON_MAP[normalized];
  if (mapped) return mapped;
  // Unrecognised (typically the traveler's free-text dispute reason). Fail SAFE.
  return 'requested_by_customer';
}

class StripePaymentService {
  /**
   * Return the list of supported currency codes
   */
  getSupportedCurrencies(): string[] {
    return ['usd', 'eur', 'gbp', 'jpy', 'aud', 'sgd'];
  }

  // ── FP-1: Stripe Customer + saved payment methods (frictionless payments) ──────────────
  //
  // The durable customer layer. Cards are vaulted by Stripe only — this codebase stores just
  // users.stripe_customer_id (migration 146) and reads payment_method ids live from Stripe.
  // Replaces the fragile per-request customers.list({email}) lookup optimization.routes.ts had.

  isReady(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Get (or lazily create) the user's Stripe Customer, persisting the id. Resolution order:
   * persisted id → email search (adopts a customer an older flow created) → create. Returns
   * null when Stripe is unconfigured or the user has no email (never fabricates).
   *
   * NOTE: this does NOT validate that a persisted id still exists in Stripe — that would cost
   * an extra API call on every hot-path invocation. A stored id can go stale (a row carrying a
   * live-mode id while the server runs test-mode keys, or the customer deleted from the Stripe
   * dashboard) and Stripe will 500 the FIRST call that actually uses it with `resource_missing`.
   * Recovery from that lives in `retryOnMissingCustomer`/`withResolvedCustomer` below, at the
   * call sites that make the Stripe request — not here.
   */
  async getOrCreateCustomer(userId: string): Promise<string | null> {
    if (!this.isReady()) return null;
    const existing = await db.execute(sql`
      SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = ${userId} LIMIT 1
    `);
    const row = existing.rows?.[0] as any;
    if (!row) return null;
    if (row.stripe_customer_id) return String(row.stripe_customer_id);

    let customerId: string | null = null;
    if (row.email) {
      const found = await stripe.customers.list({ email: row.email, limit: 1 });
      if (found.data.length > 0) customerId = found.data[0].id;
    }
    if (!customerId) {
      if (!row.email) return null;
      const created = await stripe.customers.create({
        email: row.email,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || undefined,
        metadata: { userId },
      });
      customerId = created.id;
    }
    await db.execute(sql`
      UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${userId} AND stripe_customer_id IS NULL
    `);
    return customerId;
  }

  /**
   * True when `err` is Stripe reporting `resource_missing` for EXACTLY `customerId` (Stripe's
   * error message always names the missing resource's id, e.g. "No such customer: 'cus_xxx'") —
   * never a broader match. This keeps recovery scoped to "the STORED customer id is gone", not
   * any other `resource_missing` (e.g. a missing payment_method), which must propagate as-is.
   */
  private isMissingCustomerError(err: unknown, customerId: string): boolean {
    const stripeErr = err as { code?: string; message?: string } | null | undefined;
    return (
      !!stripeErr &&
      stripeErr.code === 'resource_missing' &&
      typeof stripeErr.message === 'string' &&
      stripeErr.message.includes(customerId)
    );
  }

  /**
   * Recovery step for a confirmed-stale customer id: clear it (guarded so a concurrent
   * recovery that already fixed the row isn't clobbered) and mint+persist a fresh customer via
   * getOrCreateCustomer's own search-by-email/create flow. Returns null if no fresh customer
   * could be created (e.g. the user has no email) so the caller can surface the ORIGINAL error.
   */
  private async recreateCustomer(userId: string, staleCustomerId: string): Promise<string | null> {
    await db.execute(sql`
      UPDATE users SET stripe_customer_id = NULL WHERE id = ${userId} AND stripe_customer_id = ${staleCustomerId}
    `);
    return this.getOrCreateCustomer(userId);
  }

  /**
   * Run a Stripe `operation` that references `customerId`. If Stripe reports THAT exact
   * customer id as `resource_missing` (#973 — stale/deleted customer), recover once: clear the
   * stored id, mint+persist a fresh customer, and retry `operation` with the fresh id. Any
   * OTHER error (including resource_missing for something else) propagates unchanged — fail
   * loudly, never swallow. Retries exactly once: a second failure (even resource_missing again)
   * is not caught here and propagates, so this can never loop.
   *
   * `operation` receives the attempt number (1 | 2) alongside the customer id. This matters for
   * any caller passing a Stripe idempotencyKey: Stripe rejects reusing the SAME key with
   * DIFFERENT request parameters ("Keys for idempotent requests can only be used with the same
   * parameters..."), and the retry's `customer` differs from the original by construction — a
   * caller with an idempotencyKey must vary it by `attempt` (e.g. append `-recover` on attempt
   * 2) or the recovery attempt itself would fail. Callers with no idempotencyKey can ignore it.
   */
  private async retryOnMissingCustomer<T>(
    userId: string,
    customerId: string,
    operation: (customerId: string, attempt: 1 | 2) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(customerId, 1);
    } catch (err) {
      if (!this.isMissingCustomerError(err, customerId)) throw err;
      logger.warn(
        { userId, staleCustomerId: customerId },
        '[stripe] stored customer id missing in Stripe (resource_missing) — recreating and retrying once',
      );
      const freshId = await this.recreateCustomer(userId, customerId);
      if (!freshId) throw err; // could not recover — surface the ORIGINAL error
      return operation(freshId, 2);
    }
  }

  /**
   * Resolve the user's Stripe customer (getOrCreateCustomer) and run `operation` against it,
   * with the same #973 stale-id recovery as retryOnMissingCustomer. The single call site to use
   * for any Stripe request that REQUIRES a customer (returns null, like getOrCreateCustomer,
   * when none can be resolved at all — Stripe unconfigured / no email). For a call site that
   * tolerates proceeding WITHOUT a customer, resolve the id yourself and use
   * retryOnMissingCustomer directly (see createPaymentIntent).
   */
  private async withResolvedCustomer<T>(
    userId: string,
    operation: (customerId: string, attempt: 1 | 2) => Promise<T>,
  ): Promise<T | null> {
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return null;
    return this.retryOnMissingCustomer(userId, customerId, operation);
  }

  /**
   * PUBLIC #973 entry point for callers OUTSIDE this service that already resolved a
   * (possibly-stale) customer id via getOrCreateCustomer and build their own Stripe request
   * around it — e.g. a route handler attaching the customer to a PaymentIntent it constructs
   * itself. Same one-retry stale-customer recovery as the private helpers above (see the
   * `attempt` note on retryOnMissingCustomer if your request carries an idempotencyKey).
   */
  async runWithCustomerRecovery<T>(
    userId: string,
    customerId: string,
    operation: (customerId: string, attempt: 1 | 2) => Promise<T>,
  ): Promise<T> {
    return this.retryOnMissingCustomer(userId, customerId, operation);
  }

  /**
   * H7: start the add-card flow. A SetupIntent authorizes Stripe to vault a card against the
   * user's Customer for future off-session use — it moves no money (no amount anywhere on this
   * path, §14-clean by construction). Returns null when Stripe is unconfigured or the user has
   * no resolvable Customer (never fabricates a client secret).
   */
  async createSetupIntent(userId: string): Promise<{ clientSecret: string } | null> {
    if (!this.isReady()) return null;
    const result = await this.withResolvedCustomer(userId, async (customerId) => {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
      });
      return setupIntent.client_secret ? { clientSecret: setupIntent.client_secret } : null;
    });
    return result ?? null;
  }

  /** Saved cards for the session user — read live from Stripe, safe display fields only. */
  async listSavedPaymentMethods(userId: string): Promise<{
    defaultPaymentMethodId: string | null;
    methods: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>;
  }> {
    const result = await this.withResolvedCustomer(userId, async (customerId) => {
      const [customer, methods] = await Promise.all([
        stripe.customers.retrieve(customerId),
        stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      ]);
      const defaultPm =
        !('deleted' in customer) && customer.invoice_settings?.default_payment_method
          ? String(customer.invoice_settings.default_payment_method)
          : null;
      return {
        defaultPaymentMethodId: defaultPm,
        methods: methods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand ?? 'card',
          last4: pm.card?.last4 ?? '',
          expMonth: pm.card?.exp_month ?? 0,
          expYear: pm.card?.exp_year ?? 0,
        })),
      };
    });
    return result ?? { defaultPaymentMethodId: null, methods: [] };
  }

  /** Detach a saved card — ONLY if it belongs to the session user's own customer (§14). */
  async detachSavedPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    // No Stripe call here takes the customer id as a request parameter (only the local
    // `pm.customer` ownership comparison below) — a stale id just fails that comparison
    // safely (returns false), so #973 recovery doesn't apply to this call site.
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return false;
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) return false;
    await stripe.paymentMethods.detach(paymentMethodId);
    return true;
  }

  /** Set the default saved card — same ownership check as detach (§14). */
  async setDefaultSavedPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return false;
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    // Ownership check happens BEFORE any customer-id Stripe call — a stale/mismatched id fails
    // this safely (false) without ever reaching customers.update, so the common case never hits
    // #973 recovery here. Still wrapped for the case where the id was genuinely valid at
    // ownership-check time but the customer was deleted between then and this call.
    if (pm.customer !== customerId) return false;
    await this.retryOnMissingCustomer(userId, customerId, (cid) =>
      stripe.customers.update(cid, { invoice_settings: { default_payment_method: paymentMethodId } }),
    );
    return true;
  }

  /**
   * FP-1 one-click: charge the user's saved default card OFF-SESSION (create+confirm in one
   * server-side call). The AMOUNT always comes from the caller's server-side fee derivation
   * (§14) and the caller supplies a deterministic idempotencyKey (§15).
   *
   * Outcomes (never throws for the expected cases):
   *   'succeeded'        — charged; caller proceeds exactly as if the Elements flow confirmed.
   *   'requires_action'  — the bank demands 3DS; clientSecret returned so the client falls back
   *                        to the payment sheet for this one charge.
   *   'no_saved_method'  — nothing vaulted (or Stripe unconfigured); caller uses the normal sheet.
   */
  async chargeSavedMethod(
    userId: string,
    params: {
      amountCents: number;
      currency?: string;
      metadata: Record<string, string>;
      description: string;
      idempotencyKey: string;
    },
  ): Promise<
    | { status: 'succeeded'; paymentIntentId: string }
    | { status: 'requires_action'; paymentIntentId: string; clientSecret: string }
    | { status: 'no_saved_method' }
  > {
    if (!this.isReady()) return { status: 'no_saved_method' };
    const { defaultPaymentMethodId, methods } = await this.listSavedPaymentMethods(userId);
    const paymentMethodId = defaultPaymentMethodId ?? methods[0]?.id;
    if (!paymentMethodId) return { status: 'no_saved_method' };
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return { status: 'no_saved_method' };

    try {
      // #973: retryOnMissingCustomer recovers once if `customerId` has gone stale between the
      // listSavedPaymentMethods() read above and this charge (low-probability race — the common
      // stale-id case already short-circuits to 'no_saved_method' above, since a recreated
      // customer starts with zero saved payment methods).
      const pi = await this.retryOnMissingCustomer(userId, customerId, (cid, attempt) =>
        stripe.paymentIntents.create(
          {
            amount: params.amountCents,
            currency: (params.currency ?? 'usd').toLowerCase(),
            customer: cid,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            metadata: params.metadata,
            description: params.description,
          },
          // Stripe rejects reusing an idempotencyKey with different params (`customer` differs
          // on the recovery retry) — vary the key on attempt 2 so the retry can actually land.
          { idempotencyKey: attempt === 1 ? params.idempotencyKey : `${params.idempotencyKey}-recover` },
        ),
      );
      if (pi.status === 'succeeded') return { status: 'succeeded', paymentIntentId: pi.id };
      if (pi.status === 'requires_action' && pi.client_secret) {
        return { status: 'requires_action', paymentIntentId: pi.id, clientSecret: pi.client_secret };
      }
      // Any other terminal state — treat as needing the interactive sheet.
      return pi.client_secret
        ? { status: 'requires_action', paymentIntentId: pi.id, clientSecret: pi.client_secret }
        : { status: 'no_saved_method' };
    } catch (err: any) {
      // Card declined off-session or bank demands authentication: Stripe attaches the PI to the
      // error — hand its clientSecret back so the user completes it interactively (honest
      // fallback, never a silent retry loop).
      const errPi = err?.raw?.payment_intent ?? err?.payment_intent;
      if (errPi?.client_secret) {
        return { status: 'requires_action', paymentIntentId: errPi.id, clientSecret: errPi.client_secret };
      }
      logger.warn({ err: err?.message, userId }, '[FP-1] off-session charge failed without recoverable PI');
      return { status: 'no_saved_method' };
    }
  }

  /**
   * Create payment intent for bookings
   * @param currency - Three-letter ISO currency code (defaults to 'usd'). Supported: usd, eur, gbp, jpy, aud, sgd.
   */
  /**
   * B2 (one-click booking checkout): `options.offSession` asks for the PaymentIntent to be
   * CONFIRMED here, server-side, against the user's saved card — instead of returning a
   * clientSecret for the browser to confirm interactively.
   *
   * WHY THIS IS AN OPTION ON THIS METHOD, NOT A NEW METHOD. Two things other code depends on are
   * written here and nowhere else: `metadata.bookingIds` (§15c ordering-1 lets ONLY a
   * server-verified PaymentIntent resolve bookings from it, and §19b clears a row's payment
   * provenance from it) and the `payment_intents` row. A parallel off-session helper would have
   * to reproduce both, and the moment it drifted, the webhook and the drift job would stop being
   * able to identify what a one-click checkout paid for. One writer, parameterised.
   *
   * Falls back to the interactive path whenever there is no usable saved method — never a hard
   * failure, so a user without a vaulted card still checks out exactly as before.
   */
  async createPaymentIntent(
    userId: string,
    bookings: any[],
    amount: number,
    isDeposit: boolean = false,
    currency: string = 'usd',
    idempotencyKey?: string,
    options?: { offSession?: boolean }
  ) {
    try {
      // Get user details
      const user = await db.execute(sql`
        SELECT email, first_name, last_name FROM users WHERE id = ${userId}
      `);

      if (!user.rows || user.rows.length === 0) {
        throw new Error('User not found');
      }

      const userRow = user.rows[0] as { email?: string; first_name?: string; last_name?: string };
      const userEmail = userRow.email || `user${userId}@traveloure.com`;

      // Validate currency and compute Stripe amount
      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      // Create payment intent
      // Stripe metadata values have 500 char limit, so truncate booking IDs if needed
      const allBookingIds = bookings.map(b => b.id).join(',');
      const truncatedBookingIds = allBookingIds.length > 490 
        ? allBookingIds.substring(0, 490) + '...' 
        : allBookingIds;
      
      const stripeRequestOptions = idempotencyKey
        ? { idempotencyKey: `pi-${idempotencyKey}` }
        : undefined;

      // FP-1: attach the durable Stripe Customer so the PaymentElement sheet offers the user's
      // saved cards (near-one-click) and newly entered cards can be vaulted for next time.
      // Attaching is OPTIONAL here (falls back to a customer-less PI, not a hard failure), so
      // this doesn't use withResolvedCustomer (which bails to null when no customer resolves at
      // all) — it resolves the id itself and, if attaching it 500s with #973's resource_missing,
      // recovers via retryOnMissingCustomer and rebuilds the SAME params with the fresh id.
      const fpCustomerId = await this.getOrCreateCustomer(userId).catch(() => null);

      // B2: resolve a saved card ONLY when off-session confirmation was asked for. A customer with
      // no vaulted method leaves `offSessionMethodId` null and the interactive path is used
      // unchanged — the absence of a saved card must never fail a checkout.
      let offSessionMethodId: string | null = null;
      if (options?.offSession) {
        try {
          const { defaultPaymentMethodId, methods } = await this.listSavedPaymentMethods(userId);
          offSessionMethodId = defaultPaymentMethodId ?? methods[0]?.id ?? null;
        } catch {
          offSessionMethodId = null; // treat a lookup failure as "no saved card", never as an error
        }
      }

      const buildPaymentIntentParams = (customerId: string | null) => ({
        amount: stripeAmount,
        currency: effectiveCurrency,
        // setup_future_usage (FP-1 vaulting) belongs to the INTERACTIVE branch only. Stripe
        // rejects `off_session: true, confirm: true` combined with setup_future_usage — proven
        // live by CI run #34's OC1/OC3 — and logically so: the one-click charge happens BECAUSE
        // the card is already vaulted, so there is nothing to set up.
        ...(customerId
          ? {
              customer: customerId,
              ...(offSessionMethodId ? {} : { setup_future_usage: 'off_session' as const }),
            }
          : {}),
        metadata: {
          userId,
          bookingIds: truncatedBookingIds,
          isDeposit: isDeposit.toString(),
          bookingCount: bookings.length.toString(),
        },
        description: `Traveloure ${isDeposit ? 'Deposit' : 'Booking'} - ${bookings.length} item(s)`,
        receipt_email: userEmail,
        // One-click needs a NAMED payment method plus confirm+off_session. `automatic_payment_methods`
        // is mutually exclusive with that here: it exists to let Stripe pick a method interactively,
        // which is exactly what we are bypassing. Off-session confirmation also requires a customer,
        // so this branch can only be taken when `customerId` resolved.
        ...(offSessionMethodId && customerId
          ? { payment_method: offSessionMethodId, off_session: true, confirm: true }
          : { automatic_payment_methods: { enabled: true } }),
      });

      // Stripe rejects reusing an idempotencyKey with different params (`customer` differs on
      // the recovery retry) — vary the key on attempt 2 so the retry can actually land.
      const requestOptionsForAttempt = (attempt: 1 | 2) =>
        attempt === 1 || !stripeRequestOptions
          ? stripeRequestOptions
          : { idempotencyKey: `${stripeRequestOptions.idempotencyKey}-recover` };

      const paymentIntent = fpCustomerId
        ? await this.retryOnMissingCustomer(userId, fpCustomerId, (cid, attempt) =>
            stripe.paymentIntents.create(buildPaymentIntentParams(cid), requestOptionsForAttempt(attempt)),
          )
        : await stripe.paymentIntents.create(buildPaymentIntentParams(null), stripeRequestOptions);

      // Store payment intent in database
      const metadataJson = JSON.stringify(paymentIntent.metadata);
      await db.execute(sql`
        INSERT INTO payment_intents (
          stripe_payment_intent_id, user_id, amount, currency,
          status, is_deposit, metadata, created_at
        ) VALUES (${paymentIntent.id}, ${userId}, ${amount}, ${effectiveCurrency}, ${paymentIntent.status}, ${isDeposit}, ${metadataJson}, NOW())
      `);

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        // B2: 'succeeded' only ever comes back on the off-session branch. The interactive branch
        // creates without confirming, so it reports 'requires_payment_method' as it always has.
        // Callers that ignore this field behave exactly as before.
        status: paymentIntent.status,
      };
    } catch (error: any) {
      // B2 — a DECLINED or SCA-required off-session confirm. Stripe attaches the PaymentIntent to
      // the error, and that PI is REAL: it exists, it is stamped-able, and the traveler can still
      // complete it interactively. Returning it (rather than throwing) is what keeps a soft
      // decline from being reported to the traveler as "we couldn't reach our payment provider",
      // and keeps the authorized claim rather than sending it to the TTL sweep.
      //
      // Safe either way: markStripeAttempt already ran, so per §15b the sweep must reconcile such
      // a row against Stripe instead of blind-voiding it. This branch just avoids needing that.
      const errPi = error?.raw?.payment_intent ?? error?.payment_intent;
      if (options?.offSession && errPi?.client_secret) {
        console.warn(
          `[checkout] off-session confirm failed (${error?.code ?? 'unknown'}) — falling back to ` +
          `interactive confirmation for PaymentIntent ${errPi.id}`,
        );
        return {
          clientSecret: errPi.client_secret,
          paymentIntentId: errPi.id,
          // Read off the PaymentIntent Stripe attached to the error — the only authoritative
          // amount available here (the locally-computed one is scoped inside the try above).
          amount: errPi.amount ?? 0,
          status: errPi.status,
        };
      }
      console.error('Stripe payment intent error:', error);
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.requires_action':
          await this.handleRequiresAction(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.refunded':
          await this.handleRefund(event.data.object as Stripe.Charge);
          break;

        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.metadata?.type === 'expert_service') {
            await this.handleExpertServicePayment(session);
          } else if (session.metadata?.type === 'transport_booking') {
            await handleStripePaymentSuccess(session.id);
          }
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error: any) {
      console.error('Webhook handling error:', error);
      throw error;
    }
  }

  /**
   * Generate a unique booking confirmation code
   */
  private generateConfirmationCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'TRV';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Handle successful payment — authoritative confirmation path via Stripe webhook.
   * Idempotent: already-confirmed bookings are skipped.
   *
   * TWO RAILS, BOTH SERVED (task #212, legacy-reconciliation lane)
   * ─────────────────────────────────────────────────────────────
   * This handler used to query ONLY the legacy `bookings` table. That table is still live — the
   * `/booking-demo` and `/itinerary-comparison/:id` flows write it through
   * `POST /api/bookings/process-cart` — so its loop below is KEPT verbatim. But the CART CHECKOUT
   * rail (`POST /api/checkout`) writes `service_bookings`, and its PaymentIntent metadata carries
   * `service_bookings` ids. Passing those ids to `SELECT … FROM bookings` matched zero rows, so
   * the documented "authoritative confirmation path" did nothing at all for a cart checkout
   * (ruling 38 filed this as #212; the TTL sweep was left as the only recovery mechanism).
   *
   * Both rails now run: the cart rail through the ONE shared promotion (`promotePaidCheckout`,
   * the same implementation `POST /api/bookings/confirm-payment` drives — #213), then the legacy
   * rail unchanged. The two id spaces do not overlap, and each path no-ops on ids it does not own.
   */
  async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const { userId, bookingIds, isDeposit } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'succeeded' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // ── CART-CHECKOUT RAIL (service_bookings) — the shared payment promotion ──────────────
    // Resolved by the row's server-stamped `stripe_payment_intent_id`, and additionally by the
    // PI's own `bookingIds` metadata so the webhook can still recover a booking whose PI was
    // created but never stamped (server died mid-authorization) — the case where the webhook is
    // the FIRST signal of success. Idempotent by atomic conditional: a booking the client
    // already confirmed matches 0 rows and is a no-op, never a double flip.
    try {
      const { promotePaidCheckout } = await import('./checkout-claim.service');
      await promotePaidCheckout({
        paymentIntentId: paymentIntent.id,
        actor: 'webhook',
        metadataBookingIds: (bookingIds ?? '').split(',').map((id: string) => id.trim()).filter(Boolean),
      });
    } catch (promoteErr: any) {
      // Never let the cart rail take the legacy rail (or the webhook) down.
      console.error('[webhook] cart-checkout payment promotion failed:', promoteErr?.message ?? promoteErr);
    }

    if (!bookingIds) {
      console.log(`[webhook] payment_intent.succeeded: no bookingIds in metadata for ${paymentIntent.id}`);
      return;
    }

    // ── LEGACY RAIL (`bookings`) — process-cart / booking-demo flow. Unchanged. ────────────
    const bookingIdList = bookingIds.split(',').map((id: string) => id.trim()).filter(Boolean);
    for (const bookingId of bookingIdList) {
      // `bookings.id` is a UUID column; `service_bookings.id` is a varchar. A cart-checkout PI
      // carries service_bookings ids, so a non-UUID id would make the comparison below THROW
      // (22P02) and abandon every remaining id in the list. The cart rail already ran above, so
      // this only protects the legacy rail from ids it does not own — skip them silently.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
        continue;
      }
      // Idempotency: skip bookings that are already confirmed
      const existing = await db.execute(sql`
        SELECT status FROM bookings WHERE id = ${bookingId} LIMIT 1
      `);
      const currentStatus = (existing.rows?.[0] as any)?.status;
      if (currentStatus === 'confirmed') {
        console.log(`[webhook] booking ${bookingId} already confirmed — skipping`);
        continue;
      }

      const confirmationCode = this.generateConfirmationCode();

      if (isDeposit === 'true') {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'confirmed',
            payment_status = 'succeeded',
            confirmed_at = NOW(),
            confirmation_code = ${confirmationCode},
            deposit_paid = true
          WHERE id = ${bookingId}
        `);
      } else {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'confirmed',
            payment_status = 'succeeded',
            confirmed_at = NOW(),
            confirmation_code = ${confirmationCode},
            deposit_paid = true,
            balance_paid = true
          WHERE id = ${bookingId}
        `);
      }

      console.log(`[webhook] confirmed booking ${bookingId} via payment_intent.succeeded (pi=${paymentIntent.id})`);

      // Fire-and-forget confirmation email — must not block the webhook response
      const bookingDetails = await db.execute(sql`
        SELECT b.title, b.booking_date, u.email, u.first_name, u.last_name
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        WHERE b.id = ${bookingId}
        LIMIT 1
      `).catch(() => null);

      const row = bookingDetails?.rows?.[0] as any;
      if (row?.email) {
        sendBookingConfirmationEmail({
          toEmail: row.email,
          userName: [row.first_name, row.last_name].filter(Boolean).join(' ') || '',
          bookingId,
          bookingTitle: row.title || 'Your booking',
          bookingDate: row.booking_date ?? null,
          confirmationCode,
        }).catch(err =>
          console.error(`[email] booking confirmation failed for booking ${bookingId}:`, err)
        );
      }
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'failed' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(sql`
        UPDATE bookings SET
          status = 'payment_failed',
          payment_status = 'failed'
        WHERE id = ${bookingId}
      `);
    }

    // TODO: Notify user of payment failure
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'canceled' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(sql`
        UPDATE bookings SET
          status = 'canceled',
          payment_status = 'canceled'
        WHERE id = ${bookingId}
      `);
    }
  }

  /**
   * Handle 3DS / bank-authentication pending
   * Fires when Stripe cannot auto-confirm a PaymentIntent and needs
   * the customer to complete a challenge (3D Secure, bank redirect, etc.).
   * We stamp the DB row so the admin stuck-payment report picks it up,
   * and log it for observability.
   */
  private async handleRequiresAction(paymentIntent: Stripe.PaymentIntent) {
    const { userId, bookingIds } = paymentIntent.metadata;

    logger.warn(
      {
        paymentIntentId: paymentIntent.id,
        userId,
        bookingIds,
        nextAction: paymentIntent.next_action?.type,
      },
      '[WEBHOOK] payment_intent.requires_action — 3DS / bank challenge pending'
    );

    await db.execute(sql`
      UPDATE payment_intents
      SET status = 'requires_action'
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);
  }

  /**
   * Handle refund
   */
  private async handleRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string;
    const refundAmount = charge.amount_refunded / 100;

    // Create refund record
    await db.execute(sql`
      INSERT INTO refunds (
        stripe_charge_id, stripe_payment_intent_id,
        amount, currency, status, created_at
      ) VALUES (${charge.id}, ${paymentIntentId}, ${refundAmount}, ${charge.currency}, 'completed', NOW())
    `);

    // TODO: Update booking status
    // TODO: Return inventory
  }

  // NOTE: the legacy `createRefund(bookingId, amount, reason)` was DELETED here (L5 money
  // hardening). It read the legacy `bookings` table — real bookings live in `service_bookings`
  // (CLAUDE.md "Service Model") — accepted a CLIENT-SUPPLIED `amount` (§14), and resolved the
  // payment intent with `JOIN payment_intents pi ON pi.user_id = b.user_id`, which matches ANY
  // payment intent belonging to that user rather than the booking's own (the "wrong-PI bug"
  // recorded in docs/audits/booking-custody-map.md). Its only caller,
  // POST /api/bookings/refund, was re-pointed onto refundServiceBooking below, leaving it dead.
  // Use refundServiceBooking — it is service-booking-native, server-derives the amount, and is
  // idempotent on both layers (§15).

  /**
   * Refund a SERVICE booking (escrow Phase 4 / docs/design/escrow-spine.md).
   *
   * Unlike the deleted legacy createRefund (which read the legacy `bookings` table), this refunds against
   * service_bookings' OWN stripe_payment_intent_id + total_amount — the real booking rail where
   * disputes live. Amount is server-derived from the row (never client-supplied — §14).
   *
   * Idempotent (§15) on BOTH layers: (a) an atomic status claim (WHERE status <> 'refunded') so two
   * concurrent callers can't both proceed — reverted if the Stripe call then fails; (b) a
   * deterministic Stripe idempotencyKey so even a cross-process retry returns the same refund rather
   * than issuing a second one.
   */
  async refundServiceBooking(bookingId: string, reason?: string) {
    const rows = await db.execute(sql`
      SELECT id, total_amount, stripe_payment_intent_id, status, slot_id
      FROM service_bookings WHERE id = ${bookingId} LIMIT 1
    `);
    const row = rows.rows?.[0] as any;
    if (!row) throw new Error('Service booking not found');

    const amount = parseFloat(row.total_amount || '0');
    if (row.status === 'refunded') {
      return { alreadyRefunded: true, amount, status: 'refunded' as const };
    }
    const paymentIntentId = row.stripe_payment_intent_id;
    if (!paymentIntentId) throw new Error('Booking has no payment intent to refund');

    // Atomic claim: flip to 'refunded' only if it isn't already. A concurrent caller claims 0 rows.
    const claim = await db.execute(sql`
      UPDATE service_bookings SET status = 'refunded', updated_at = NOW()
      WHERE id = ${bookingId} AND status <> 'refunded'
      RETURNING id
    `);
    if (!claim.rows || claim.rows.length === 0) {
      return { alreadyRefunded: true, amount, status: 'refunded' as const };
    }

    const priorStatus = row.status;

    // The internal reason is kept VERBATIM for the audit row below (`refunds.reason`, TEXT);
    // Stripe gets a value from its 3-value enum. See toStripeRefundReason above for why:
    // forwarding 'dispute_upheld' or the traveler's free text 400s at Stripe, and because this
    // flow is ledger-first that 400 left the earner debited and the traveler un-refunded.
    const internalReason = (reason ?? '').trim() || 'requested_by_customer';
    const stripeReason = toStripeRefundReason(internalReason);

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: Math.round(amount * 100),
          reason: stripeReason,
          metadata: { bookingId, source: 'service_booking' },
        },
        { idempotencyKey: `refund-sb-${bookingId}` },
      );
    } catch (err: any) {
      // Stripe failed — revert the optimistic status claim so a later retry can proceed cleanly.
      await db.execute(sql`UPDATE service_bookings SET status = ${priorStatus}, updated_at = NOW() WHERE id = ${bookingId}`);
      console.error('Service-booking refund error:', err);
      throw new Error(`Refund failed: ${err.message}`);
    }

    await db.execute(sql`
      INSERT INTO refunds (
        booking_id, stripe_refund_id, stripe_payment_intent_id,
        amount, currency, status, reason, created_at
      ) VALUES (${bookingId}, ${refund.id}, ${paymentIntentId}, ${amount}, 'usd', ${refund.status}, ${internalReason}, NOW())
    `);

    // C3 filed follow-up: a refunded slot-bound booking gives its capacity back so another
    // traveler can book the time. Runs only under this refund's atomic status claim (the flip
    // above matched exactly one caller — §15), so a repeat refund cannot double-release; the
    // release itself floors at 0 and never un-blocks a provider-blocked slot. Best-effort:
    // the refund already succeeded, a release failure must not undo it.
    if (row.slot_id) {
      try {
        const { storage } = await import('../storage');
        await storage.releaseSlot(String(row.slot_id));
      } catch (releaseErr) {
        console.error(`[refund] slot release failed for booking ${bookingId} (non-critical):`, releaseErr);
      }
    }

    return { refundId: refund.id, amount, status: refund.status };
  }

  /**
   * Re-fetch an EXISTING PaymentIntent's client secret (ruling 38).
   *
   * Used by `POST /api/checkout` when the idempotency key resolves to a claim that was already
   * authorized: the retry must be handed back the SAME PaymentIntent (§15 — "a retry produces
   * the same single effect"), never a second one and never a bare `{duplicate:true}` the client
   * would mis-render as success. Returns null for a terminal intent so the caller does not offer
   * a payment sheet that cannot be completed.
   */
  async getPaymentIntentClientSecret(
    paymentIntentId: string,
  ): Promise<{ clientSecret: string; paymentIntentId: string; amount: number } | null> {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi.client_secret) return null;
    if (pi.status === 'succeeded' || pi.status === 'canceled') return null;
    return { clientSecret: pi.client_secret, paymentIntentId: pi.id, amount: pi.amount };
  }

  /**
   * Get payment intent status
   */
  async getPaymentIntentStatus(paymentIntentId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (error: any) {
      console.error('Error retrieving payment intent:', error);
      throw new Error(`Payment intent retrieval failed: ${error.message}`);
    }
  }
  /**
   * Create Payment Intent for Expert Review Service (for embedded checkout)
   */
  async createExpertServicePaymentIntent(
    userId: string,
    userEmail: string,
    variantId: number,
    comparisonId: number,
    destination: string,
    serviceType: 'review' | 'review_and_book' | 'full_concierge',
    amount: number,
    notes: string,
    currency: string = 'usd'
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: stripeAmount,
          currency: effectiveCurrency,
          metadata: {
            type: 'expert_service',
            userId,
            variantId: variantId.toString(),
            comparisonId: comparisonId.toString(),
            destination,
            serviceType,
            notes: notes.substring(0, 450),
          },
          description: `Expert ${serviceTitles[serviceType]} - ${destination}`,
          receipt_email: userEmail,
          automatic_payment_methods: {
            enabled: true,
          },
        },
        // §15 (MONEY_MAP F-3): deterministic key — variantId+comparisonId+serviceType+userId is
        // the stable identity of this logical charge (a retry can't mint a second uncaptured PI;
        // a different serviceType/variant for the same user is a genuinely different charge).
        { idempotencyKey: `expert-svc-${variantId}-${comparisonId}-${serviceType}-${userId}` },
      );

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
      };
    } catch (error: any) {
      console.error('Expert payment intent error:', error);
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  }

  /**
   * Create Stripe Checkout Session for Expert Review Service
   */
  async createExpertServiceCheckout(
    userId: string,
    userEmail: string,
    variantId: number,
    comparisonId: number,
    destination: string,
    serviceType: 'review' | 'review_and_book' | 'full_concierge',
    amount: number,
    notes: string,
    successUrl: string,
    cancelUrl: string,
    currency: string = 'usd'
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const unitAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: effectiveCurrency,
              product_data: {
                name: `Expert ${serviceTitles[serviceType]} - ${destination}`,
                description: `Travel expert service for your ${destination} trip`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'expert_service',
          userId,
          variantId: variantId.toString(),
          comparisonId: comparisonId.toString(),
          destination,
          serviceType,
          notes: notes.substring(0, 450), // Stripe metadata limit
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error: any) {
      console.error('Stripe checkout session error:', error);
      throw new Error(`Checkout session creation failed: ${error.message}`);
    }
  }

  /**
   * Handle successful expert service payment (called from webhook)
   */
  /** Retrieve a PaymentIntent for server-side verification; null on any error (treated as
   *  unverified by callers — the safe failure direction for a payment check). */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return null;
    }
  }

  async handleExpertServicePayment(session: Stripe.Checkout.Session) {
    try {
      const { userId, variantId, comparisonId, destination, serviceType, notes } = session.metadata || {};
      
      if (!userId || !variantId || !comparisonId) {
        console.error('Missing metadata in expert service session');
        return;
      }

      // Create the expert request now that payment is complete
      await db.execute(sql`
        INSERT INTO expert_requests (
          user_id, variant_id, comparison_id, destination,
          request_type, expert_fee, notes, status, payment_status,
          stripe_session_id, created_at
        ) VALUES (
          ${userId}, ${parseInt(variantId)}, ${parseInt(comparisonId)}, ${destination},
          ${serviceType}, ${(session.amount_total || 0) / 100}, ${notes || ''}, 'pending', 'paid',
          ${session.id}, NOW()
        )
      `);

      console.log(`Expert service payment completed for user ${userId}`);

      // F3 (revenue-model review): this fee was collected but never ledgered. Record it as 100%
      // platform revenue at capture (coordination-fee precedent — the reviewing expert is paid via
      // the earnings ledger when the work completes, split = filed decision). Idempotent on the
      // Stripe session id (§15 — checkout.session webhooks redeliver).
      try {
        const { revenueTrackingService } = await import("./revenue-tracking.service");
        await revenueTrackingService.recordRevenueEventOnce({
          sourceType: "expert_review_fee",
          sourceId: session.id,
          grossAmount: (session.amount_total || 0) / 100,
          description: `Expert ${serviceType} fee — ${destination}`,
          metadata: { userId, serviceType, destination },
        });
      } catch (revErr) {
        console.error("[expert-service] revenue record failed (non-fatal):", revErr);
      }

      // Fire-and-forget: T5 funnel event (expert requested after payment)
      try {
        await trackFunnelEvent({
          userId,
          eventType: "expert_requested",
          funnelStage: "T5",
          eventData: {
            variantId,
            comparisonId,
            destination,
            serviceType,
            stripeSessionId: session.id,
          },
        });
      } catch (_) {}
    } catch (error: any) {
      console.error('Error handling expert service payment:', error);
      throw error;
    }
  }
}

export const stripePaymentService = new StripePaymentService();
