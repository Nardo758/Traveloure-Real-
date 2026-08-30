# Brief 01 — Ready-made refund reconciliation (persist Stripe outcome + admin view)

**Tier:** Sonnet. **Migration:** yes (one, additive-nullable). **Money-path:** adjacent (no new
charge/refund logic — only recording the outcome of the existing one). **Est. size:** ~150 LOC.

## Problem

`POST /api/ready-made/purchases/:id/refund` (`server/routes/ready-made.routes.ts`, bottom of
file) is **ledger-first, Stripe-second**: the ledger settles (purchase → `refunded`, earning →
`reversed`, clone revoked), then the Stripe refund runs with deterministic idempotency key
`rm-refund-<purchaseId>`. If the Stripe leg fails, the route returns an honest 502 and relies on
the **buyer retrying**. Nothing records whether the Stripe leg ever succeeded, so
"refunded-in-ledger but money-not-yet-returned" is invisible to admins.

## Scope

### 1. Migration 136 (or next free number — check `server/migrations/migration-files.ts`)

`server/migrations/136_ready_made_refund_outcome.sql`: add to `ready_made_purchases` two
**nullable** columns, no defaults, no CHECK (additive posture — no publish-push trap):
- `stripe_refund_id` varchar — set only when Stripe confirms the refund.
- `refunded_at` timestamp — set when the LEDGER flips to refunded.

Register it in `migration-files.ts`. Mirror both columns (nullable) on `readyMadePurchases` in
`shared/schema.ts`.

### 2. Server writes

- In `refundReadyMadePurchaseLedger` (`server/services/ready-made-purchase.service.ts`): the
  atomic `paid|cloned → refunded` UPDATE also sets `refunded_at = now()`. Do NOT touch the
  atomicity shape — same single conditional UPDATE, one more SET column.
- In the refund route (`ready-made.routes.ts`): on Stripe success, persist
  `stripe_refund_id = refund.id` (a plain UPDATE by purchase id — idempotent because the Stripe
  call itself is idempotent on the deterministic key; a retry returns the same refund id).
  On the 502 path, write nothing (that's the point — NULL means unconfirmed).

### 3. Admin surface

- `GET /api/admin/ready-made/refunds` in `server/routes/admin.routes.ts` (rides the blanket
  `adminApiGuard`, §2): all `status='refunded'` purchases joined to listing title + buyer email,
  returning `stripePaymentIntentId`, `stripeRefundId`, `refundedAt`, `pricePaidCents`. Order:
  unconfirmed first (`stripe_refund_id IS NULL`), then `refunded_at DESC`.
- Client: a "Refunds" card on the existing Store Listings admin section
  (`client/src/pages/admin/template-approvals.tsx`, where the ready-made queue lives). Rows with
  `stripeRefundId === null` get a visible "needs reconciliation — verify in Stripe" badge; rows
  with an id show it. Read-only — no admin action buttons in this brief.

## Traps

- §13: never render a fabricated "refund confirmed" state — NULL `stripeRefundId` is the honest
  display, labelled as unconfirmed.
- Do not add a retry-the-Stripe-leg admin button here (that's a money action → separate brief).
- Grandfather: pre-existing refunded rows (if any) have NULL in both columns — the UI must not
  crash on NULL `refundedAt`.

## Gate

Extend `scripts/verify-ready-made-phase2.ts` section 5e (or add 5h) with:
1. After the in-window ledger refund: `refunded_at` is set, `stripe_refund_id` is NULL.
2. `GET /api/admin/ready-made/refunds` as admin lists the purchase with the unconfirmed flag;
   as non-admin → 401/403.
3. Simulate Stripe success by writing `stripe_refund_id='re_gate_test'` directly, re-fetch: row
   no longer sorted/flagged unconfirmed.
Run the full gate (expect prior count + your new checks, all green) + the four standard gates
from the README.
