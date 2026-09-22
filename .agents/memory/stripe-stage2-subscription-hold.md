---
name: Stripe Stage 2 activation
description: Ruling, ownership split, and observation requirement for live Stripe recovery events.
---

Stage 2 was explicitly approved and activated in three verified windows. Dispute and transfer events belong on the Connect arm; refunds, canceled, and requires-action events belong on the Platform arm; payment failure is subscribed on both because the handlers are complementary; payment success is Connect-only because that handler is the strict superset.

**Why:** These events provide the server-side recovery layer when a client closes before its fallback completes. Success must not be subscribed on both rails because that would run the shared handler twice. The money-path handlers had not previously run at live cart volume.

**How to apply:** Preserve the ownership split and reconcile every delivery during the first full day after activation. Verify the first live success promotes checkout state, records revenue, and mints earnings exactly once. Do not change subscriptions in response to an anomaly without a separate ruling.