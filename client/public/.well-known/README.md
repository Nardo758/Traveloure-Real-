# `/.well-known` — served verbatim, ahead of the SPA catch-all

Everything in this directory is copied by the client build into `dist/public/.well-known/`
and served by `mountWellKnown()` (`server/well-known.ts`) at `https://<domain>/.well-known/<file>`,
**before** either SPA catch-all runs. Unknown paths under `/.well-known/` get a plain-text 404,
never the SPA's "404 – Lost at Sea?" page.

This README is itself public (it is served at `/.well-known/README.md`). Put nothing secret here.

## MISSING: the Apple Pay domain-association file (operator drop-in)

CLAUDE.md Locked Decision 43(e): Apple Pay needs a one-time Stripe-dashboard domain
registration, and Stripe verifies the domain by fetching

    https://<domain>/.well-known/apple-developer-merchantid-domain-association

The file itself is **one fixed public file, identical for every Stripe account**. It could not
be downloaded in the environment this lane was built in (the egress proxy refused
`stripe.com:443`), so it is **NOT committed** — the route is ready and the file is not. Nothing
in the codebase can fabricate it: a wrong body fails verification in a way that looks like a
routing bug, which is exactly the confusion this lane exists to remove.

**To finish the job (operator, ~2 minutes):**

1. Download the file, verbatim, no re-encoding and no added newline:

       curl -fsSL -o apple-developer-merchantid-domain-association \
         https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association

   Canonical source (Stripe docs): <https://docs.stripe.com/payments/payment-methods/pmd-registration>

2. Commit it into **this directory**, with **no file extension**:

       client/public/.well-known/apple-developer-merchantid-domain-association

   No code change is needed — the mount serves any file dropped here.

3. Publish, then confirm the live path answers the file and not HTML:

       curl -si https://traveloure.com/.well-known/apple-developer-merchantid-domain-association | head -5

4. Stripe dashboard → **Settings → Payment method domains → Add a new domain** →
   `traveloure.com` → Verify. (Same for any other domain the checkout is served from.)

Step 4 is an operator step by ruling — no test can assert it was done (LD 43(e)).
