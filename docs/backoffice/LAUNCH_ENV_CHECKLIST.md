# Launch Environment Keys Checklist

The following environment variables are required for money and identity verification paths at launch. All keys must be set in production before serving payments or KYB flows.

| Key | What Breaks Without It | Safe-Fallback Behavior |
|-----|----------------------|----------------------|
| `STRIPE_SECRET_KEY` | Stripe payment processing, transfers, payout operations, identity verification | None — payment paths 500; `new Stripe(...)` throws on empty string |
| `STRIPE_WEBHOOK_SECRET` | Stripe event webhook signature verification | 400 on incoming webhooks (`STRIPE_WEBHOOK_SECRET must be set in production`); events are rejected unsigned |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Stripe Identity verification event webhooks | 400 on incoming Stripe Identity webhooks; identity verification status updates are rejected |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Connect payout and account webhooks | 400 on incoming Connect webhooks; payout notifications and account updates are rejected |
| `PERSONA_API_KEY` | Provider KYB (business verification) inquiries via Persona | No key: inquiries are stored as `submitted` for manual admin review; the web flow is offline until a key is set |
| `PERSONA_TEMPLATE_ID` | Persona inquiry form template ID for business verification | No key: Persona API call fails (400 from Persona); provider KYB flow errors; safe fallback is manual review path activated by missing `PERSONA_API_KEY` |
| `PERSONA_WEBHOOK_SECRET` | Persona event webhook signature verification | 400 on incoming Persona webhooks; KYB status updates from Persona are rejected unsigned |

## Verification Steps

1. **Stripe Keys (Payment):** Confirm `STRIPE_SECRET_KEY` is set and resolvable (test with `curl -H "Authorization: Bearer $STRIPE_SECRET_KEY" https://api.stripe.com/v1/account`)
2. **Stripe Webhooks:** Ensure all three webhook secrets are set and registered in the Stripe Dashboard under Webhooks (Settings > Webhooks)
3. **Persona Keys (KYB):** Confirm `PERSONA_API_KEY` and `PERSONA_TEMPLATE_ID` are set; test with the `/api/identity/business/create-inquiry` endpoint
4. **Persona Webhook:** Register `PERSONA_WEBHOOK_SECRET` in Persona Dashboard for business verification events

## Launch Go/No-Go Criteria

- **MUST have:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (payments are non-functional without these)
- **MUST have:** `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID` if KYB is required for launch; else provider verification falls back to manual admin review
- **SHOULD have:** All three `STRIPE_*_WEBHOOK_SECRET` keys to avoid 400s on event webhooks
- **SHOULD have:** `PERSONA_WEBHOOK_SECRET` if using Persona; business verification status updates depend on it

## Recorded Changes

- **Jul 26, 2026:** Baseline checklist created from server-side env references (grep `process.env.PERSONA_*` + `process.env.STRIPE_*` under `server/`). Stripe webhook secrets mapped per webhook.routes.ts registrations. Persona fallback behavior documented per identity.routes.ts.
