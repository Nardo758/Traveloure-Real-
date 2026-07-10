---
name: Stripe secret key misconfiguration symptoms
description: How to diagnose STRIPE_SECRET_KEY holding a publishable key instead of a secret key, and what looked like a platform bug but wasn't.
---

If Stripe endpoints fail (e.g. "secret_key_required" or vague permission errors), check whether
`STRIPE_SECRET_KEY` actually starts with `sk_` — it's easy for a user to paste the wrong key type
(`pk_live_...`) into the secret. Confirmed via a temporary debug endpoint reading
`process.env.STRIPE_SECRET_KEY.slice(0,8)` directly in the running process.

**Why this is easy to misdiagnose as a platform bug:** repeated secret updates (chat-based,
GUI-edit, even full delete) appeared to have zero effect across multiple workflow restarts and a
full browser reload — looking exactly like a secrets-sync propagation bug. It was NOT a platform
bug; the value genuinely was wrong each time (user kept re-pasting a publishable key). Don't
conclude "platform sync bug" purely from restarts not changing the observed value — first triple-
check the actual pasted value/account against what's expected.

**How to apply:** Add a startup guard in the Stripe client init (`stripe.service.ts` or
equivalent) that throws immediately if `STRIPE_SECRET_KEY` doesn't start with `sk_`, so a
wrong-key-type paste fails loudly at boot instead of surfacing as a confusing runtime error deep in
checkout/payout flows. Also cross-check the Stripe account ID segment embedded in the key
(the string right after `sk_live_`/`pk_live_`) matches between `STRIPE_SECRET_KEY` and
`STRIPE_PUBLISHABLE_KEY` — mismatched accounts silently break checkout even with a syntactically
valid secret key.
