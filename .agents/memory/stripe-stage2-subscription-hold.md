---
name: Stripe Stage 2 activation
description: Ruling, ownership split, and observation requirement for live Stripe recovery events.
---

Stage 2 was explicitly approved and activated in three verified windows. The later live webhook subscription decision added the five dispute events and `payment_intent.succeeded` to the Platform endpoint while preserving its existing events. The Connect endpoint also subscribes to success, but its "Events from" scope is connected accounts; Platform receives own-account events. Do not infer duplicate delivery solely from overlapping event names.

**Why:** These events provide the server-side recovery layer when a client closes before its fallback completes. The earlier Connect-only guidance treated the two endpoint subscriptions as if they received the same account's events. The user clarified that the endpoints listen to different account scopes, so own-account cart-checkout success requires the Platform subscription. Both handlers still need idempotency as defense in depth.

**How to apply:** Check each endpoint's "Events from" scope before reasoning about overlap. Preserve the now-approved Platform and Connect subscriptions, reconcile live deliveries, and verify own-account checkout success and connected-account success on their respective endpoints. Do not change subscriptions in response to an anomaly without a separate ruling.