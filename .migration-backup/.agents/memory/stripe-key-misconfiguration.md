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

**client_secret mismatch variant (July 2026):** Stripe Elements error "The client_secret provided does not match any associated PaymentIntent/SetupIntent on this account" means the publishable key belongs to a DIFFERENT Stripe account (or mode) than the secret key that created the intent. The sk's account is identifiable from intent ids (e.g. `pi_3...JZ5fFY5Q8L...` ↔ acct_1OL2SOJZ5fFY5Q8L). Fix: re-copy the pk from the same account+mode as the sk. Remember VITE_ vars need a dev-server restart to be inlined.

**Dev/test-mode setup (July 2026, current):** dev is guarded by server/validate-env.ts (sk_test required unless ENVIRONMENT=PROD). The Stripe connector (connection conn_stripe_…) holds a matching test pair; sandbox redacts `settings.secret` at the durable boundary, so it cannot be copied into env vars via setEnvVars (you get the literal string "[redacted]"). Working setup: dev workflow command `STRIPE_SECRET_KEY="$(node scripts/dev-stripe-key.cjs)" npm run dev` (script fetches sk_test from the connector API at launch); VITE_STRIPE_PUBLISHABLE_KEY is a dev-scoped env var (publishable isn't redacted). Users carry live-mode cus_ ids → payment routes 500 "No such customer" until nulled (task filed).
