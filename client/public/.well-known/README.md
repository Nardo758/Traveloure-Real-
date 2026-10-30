# `/.well-known` — served verbatim, ahead of the SPA catch-all

Everything in this directory is copied by the client build into `dist/public/.well-known/`
and served by `mountWellKnown()` (`server/well-known.ts`) at `https://<domain>/.well-known/<file>`,
**before** either SPA catch-all runs. Unknown paths under `/.well-known/` get a plain-text 404,
never the SPA's "404 – Lost at Sea?" page.

This README is itself public (it is served at `/.well-known/README.md`). Put nothing secret here.

## The Apple Pay domain-association file

CLAUDE.md Locked Decision 43(e): Apple Pay needs a one-time Stripe-dashboard domain
registration, and Stripe verifies the domain by fetching

    https://<domain>/.well-known/apple-developer-merchantid-domain-association

That file is **committed in this directory**, with no file extension:

    client/public/.well-known/apple-developer-merchantid-domain-association

It is Stripe's one fixed public file, identical for every Stripe account, stored verbatim (no
re-encoding, no added newline), from
<https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association>. Canonical source (Stripe docs):
<https://docs.stripe.com/payments/payment-methods/pmd-registration>. Do not edit it: a wrong body
fails verification in a way that looks like a routing bug.

**Registering the domain is an operator step (LD 43(e)):**

1. Confirm the live path answers the file and not HTML:

       curl -si https://www.traveloure.com/.well-known/apple-developer-merchantid-domain-association | head -5

2. Stripe dashboard → **Settings → Payment method domains → Add a new domain** →
   `www.traveloure.com` → Verify. (Same for any other domain the checkout is served from.)

No test can assert step 2 was done. With `STRIPE_PAYMENT_DOMAIN_CHECK=1` set, the server lists the
account's payment method domains once at boot and logs a warning if the site's domain is missing,
disabled, or does not have Apple Pay active (`server/utils/stripe-payment-domain-check.ts`). It
only reads; it never registers a domain and never stops the server from starting.
