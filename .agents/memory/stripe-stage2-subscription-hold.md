---
name: Stripe Stage 2 subscription hold
description: Decision boundary and activation order for the remaining live Stripe webhook events.
---

Do not change live Stripe webhook subscriptions without an explicit human ruling. The remaining events activate production handlers that have not yet run at live cart volume, including checkout promotion, revenue tracking, and earnings minting.

**Why:** Stage 1 covered zero-history hosted Checkout and subscription events. Stage 2 includes events emitted by every cart payment, so enabling them is a real money-path change even though the handlers are designed to be idempotent.

**How to apply:** If approved, activate and verify in stages: low-volume Connect dispute and transfer events first; platform refunds and platform-only canceled/requires-action events next; payment-intent success and failure events last under active monitoring. Do not subscribe both rails to succeeded when Connect is the strict superset.