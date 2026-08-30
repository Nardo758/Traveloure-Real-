# Production Stripe Connect webhook verification

**Verified:** 2026-08-29  
**Purpose:** Keep provider payout-readiness and business-verification state current after Stripe Connect account changes.

## Configuration

- **Endpoint:** `https://traveloure.com/api/webhooks/stripe`
- **Stripe endpoint ID:** `we_1U9q32JZ5fFY5Q8LaydRHeja`
- **Mode:** live (`livemode: true`)
- **Endpoint type:** Stripe Connect / connected accounts (`connect=true` at creation)
- **Enabled event:** `account.updated` only
- **Endpoint status:** enabled
- **Signing secret:** `STRIPE_CONNECT_WEBHOOK_SECRET` is present in the production Replit Secrets environment; its value is intentionally not recorded here.

The existing production Identity endpoint was not modified:

- **Endpoint:** `https://www.traveloure.com/api/webhooks/stripe-identity`
- **Stripe endpoint ID:** `we_1U9pXxJZ5fFY5Q8LjxjQmxRe`
- **Enabled events:** `identity.verification_session.verified`, `identity.verification_session.requires_input`

## Verification evidence

1. An unsigned `POST` probe to `/api/webhooks/stripe` was rejected with HTTP `400` and `Missing Stripe-Signature header`.
2. A Stripe-format `account.updated` test payload signed with the stored Connect signing secret was accepted by the published endpoint with HTTP `200` and `{ "received": true }`.
3. The production deployment logged the handler result for the signed probe:
   `account.updated ... newStripeStatus=not_started restricted=false`.
4. The signed probe was recorded in the production `webhook_events` ledger as `processed=true` with no error.

No unrelated Stripe endpoints were created, updated, or deleted.