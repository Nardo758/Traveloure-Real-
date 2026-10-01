# Payments registry migration verification

This records focused verification of the payments migration in this checkout. It
does not establish production configuration, deployed scheduled-job identity, or
live Stripe/partner behavior.

## Commands and results

For database-writing tests, `PROD_DATABASE_URL` was explicitly unset and
`JOURNEY_DB_WRITES_OK=1` was supplied; tests used the development
`DATABASE_URL`. No production database or live Stripe/partner API was used.

| Coverage | Command | Result |
|---|---|---|
| Registry engine contract and dispatch | `npx tsx --test server/automations/__tests__/registry-engine.test.ts` | 6 passed, 0 failed |
| Signed checkout-session and Connect-transfer routing regressions | `npx tsx --test server/automations/payments/__tests__/signed-webhook-routing.test.ts` | 4 passed, 0 failed |
| Internal-job skip and heartbeat semantics | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts` | 5 passed, 0 failed; missing-key reconciliation returned a 200 skip without changing its heartbeat |
| Confirmation receipt, checkout sweep, cart and balance promotion | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/canonical-booking-email.db.test.ts server/__tests__/checkout-claim-sweep.db.test.ts server/__tests__/checkout-payment-promotion.db.test.ts server/__tests__/deposit-checkout.db.test.ts` | 53 passed, 0 failed |
| Reconciliation detection | `env -u PROD_DATABASE_URL -u STRIPE_SECRET_KEY -u STRIPE_SECRET_KEY_TEST JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/reconciliation-detection.db.test.ts` | 48 passed, 0 failed |
| Reconciliation run tallies | `env -u PROD_DATABASE_URL -u STRIPE_SECRET_KEY -u STRIPE_SECRET_KEY_TEST JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/reconciliation-run-tallies.db.test.ts` | 7 passed, 0 failed |
| Initial platform payment-failure, signed refund, and non-cart terminal batch | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/platform-payment-failed.db.test.ts server/__tests__/platform-refund-webhook.signed.db.test.ts server/__tests__/stripe-non-cart-terminal-webhooks.db.test.ts` | 32 total: 30 passed, 2 skipped, 0 failed. Both skips were PF5/PF6 in the payment-failure suite; those endpoint cases were rerun successfully with the isolated harness below. The signed refund and non-cart cases passed. |
| Late-success refund, failed-final, and reconciliation-drift follow-up | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/platform-payment-failed.db.test.ts` | 11 total: 9 passed, 2 skipped, 0 failed. PF7 late-success refund/idempotency and PF11 detection-only reconciliation passed; PF5/PF6 need the running-app harness and passed in the isolated rerun below. |
| Dispute and payout guards | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/services/__tests__/stripe-dispute.service.db.test.ts server/__tests__/payout-parity.db.test.ts server/__tests__/payout-dispute-guard.db.test.ts` | 12 passed, 0 failed |
| Affiliate reconciliation/adoption, refund convergence, Connect reminders | `env -u PROD_DATABASE_URL JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/affiliate-reconciliation-matching.test.ts server/__tests__/affiliate-reconciliation-token-adoption.test.ts server/__tests__/affiliate-reconciliation-travelpayouts.test.ts server/__tests__/refund-retry-convergence.test.ts server/__tests__/stripe-connect-reminder.test.ts` | 32 passed, 0 failed |

The earlier focused rollup covered 179 unique tests; the follow-up adds 20 unique
tests (the new action-outcome case, signed routing cases, internal-job semantics,
and deposit/balance cases), bringing the focused total to 199 passed, 0 skipped,
0 failed. The initial two endpoint skips were closed by the rerun below.

The signed routing regressions use synthetic Stripe test keys/signing secrets and
stub the existing endpoint action seam. They mount the actual signature-verifying
handlers on ephemeral loopback listeners; they do not issue Stripe API requests.
The checkout-sweep timer and internal endpoint now share one schedule entry point
and one complete pass (unstamped followed by stale-authorized claims), under one
`checkout-sweep` overlap guard. Cart, balance, ready-made, late-refund, and legacy
success wrappers dispatch to their existing action implementations; their DB
conditionals, receipt transactions, and Stripe idempotency remain action-owned.

## Previously skipped signed endpoint cases

Ran the unchanged `platform-payment-failed.db.test.ts` suite against an ephemeral
Express harness on `127.0.0.1:4317` (not the preview port). The harness mounted
the actual `bookings` and Connect webhook routers and captured the raw JSON body
the same way the production middleware does. It started through inline
`npx tsx --eval` code; no harness file, workflow, or environment setting was
persisted.

The test process received `NODE_ENV=test`, `ENVIRONMENT=development`,
`JOURNEY_BASE_URL=http://127.0.0.1:4317`, `JOURNEY_DB_WRITES_OK=1`, and only
synthetic local values for `STRIPE_SECRET_KEY_TEST`,
`STRIPE_WEBHOOK_SECRET_TEST`, and `STRIPE_CONNECT_WEBHOOK_SECRET_TEST`.
`PROD_DATABASE_URL` and `STRIPE_SECRET_KEY` were unset. Both signed cases
generated their own Stripe test headers locally and delivered them only to the
loopback harness; no Stripe API request was made.

| Command | Result |
|---|---|
| `env -u PROD_DATABASE_URL NODE_ENV=test ENVIRONMENT=development JOURNEY_BASE_URL=http://127.0.0.1:4317 STRIPE_SECRET_KEY_TEST=sk_test_local_harness_not_a_credential STRIPE_WEBHOOK_SECRET_TEST=whsec_local_platform_test_only STRIPE_CONNECT_WEBHOOK_SECRET_TEST=whsec_local_connect_test_only JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/platform-payment-failed.db.test.ts` | 11 passed, 0 failed, 0 skipped. PF5 delivered a signed platform failure event and replayed it; PF6 delivered a signed Connect event. Both returned 200 and the DB assertions confirmed the booking failure state. |

The ephemeral server was terminated after the suite; a follow-up connection check
confirmed port 4317 was closed.

## Incomplete and baseline checks

- An earlier all-in-one DB-test batch reached its 300-second timeout and is not a
  complete result. Its first run of reconciliation tally T2b reported
  `completed` instead of `skipped`: the test removes `STRIPE_SECRET_KEY`, while
  this environment can also select `STRIPE_SECRET_KEY_TEST`. Rerunning the tally
  suite with both key variable names unset produced 7/7 passes, including T2b.
  No secret values were inspected.
- `npx tsc --noEmit --pretty false` reported 120 diagnostics, matching the
  measured branch baseline of 120. This is not a clean typecheck; newly added
  payment automation/test files and the edited dispatch/service paths introduced
  no diagnostics. Two pre-existing diagnostics still point into
  `webhooks.routes.ts` (disabled-reason comparison and Stripe event typing).
- Focused tests cover registry behavior and existing service/DB authority; they
  are not proof of live Stripe event subscriptions, production credentials,
  partner API availability, or the actual scheduled-deployment runner. The
  payment-failure endpoint cases did run with synthetic signing values against
  the isolated loopback harness, not a production deployment.
- Partnerize remains credential-conditional, unvalidated scaffolding, not an
  authoritative external cron. Live partner reconciliation, webhook delivery,
  and scheduled-runner provisioning/logs remain operator verification items.
