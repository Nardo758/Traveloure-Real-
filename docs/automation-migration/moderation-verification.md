# Moderation/security registry migration verification

This records the moderation/security registry migration in this checkout. It adds
registry routing around existing actions only: the services, webhook guards,
database transactions, local map ownership, and manual moderation decisions remain
authoritative. No production schema, external API, or payment implementation was
changed.

## Stable-ID source map

| Stable ID | Existing source/trigger | Scope retained by action |
|---|---|---|
| `moderation.claim-submit-score` | `server/services/neighborhood-claims.service.ts` — post-commit `enqueueScoring`, including explicit admin rescore | Best-effort dynamic import remains; claim/version conditional writes and scorer-failed handling stay in the scorer. No automatic retry of scorer-failed claims. |
| `moderation.claim-score-hourly` | `server/routes/internal.routes.ts` — authenticated `/internal/jobs/score-neighborhood-claims`, hourly external due bucket | Existing `runJob`/background runner, optional request `limit`, batch selection and per-claim guards stay in place. |
| `moderation.claim-score-warm` | `server/services/evidence-scorer-scheduler.service.ts` — existing jittered first pass and 15-minute warm timer | Same `scorePendingClaims` action under the existing `runBackgroundJob` overlap guard; warm timer remains defense-in-depth. |
| `moderation.verification-held-listing-activation` | `server/routes/webhooks.routes.ts` — verified Stripe Identity webhook and business-verification transition | Shared `activateVerificationHeldListings` re-evaluates `resolvePublishVerification`; only this owner’s approved+draft rows can activate; paused rows remain untouched. |
| `moderation.pending-report-admin-notification` | `server/services/messages.service.ts` — `reportMessage` and `reportUser` after report insertion | Only pending reports notify; existing notification insertion is best-effort. No report-to-suspension/block/enforcement. |
| `moderation.content-flag-created` | `server/storage.ts` `createContentFlag` (called from `server/routes/content.routes.ts`) | Existing flag insert and flagged content-registry follow-on stay together in the storage action. Admin review/resolve decisions remain manual. |
| `moderation.suspension-session-cleanup` | `server/routes/admin.routes.ts` — post-persist callback of the manual suspend endpoint | Wraps only the existing session purge and WebSocket disconnect. It does not make manual suspension recurring or automated. |
| `moderation.password-reset-session-purge` | `server/replit_integrations/auth/emailAuth.ts` — password-reset transaction after the single-use token is claimed and password is written | Existing session purge remains in the same transaction; SQL failure rolls back the reset. |
| `moderation.rate-limiter-cleanup` | `server/infrastructure/rate-limiter.ts` — existing one-minute interval | Existing generic process-local expired-entry eviction; no shared/global counter is introduced. |
| `moderation.internal-jobs-limiter-cleanup` | `server/middleware/internal-jobs-limiter.ts` — existing one-minute interval | Existing process-local expired idle state eviction; rate-cap/auth-lockout request behavior is unchanged. |
| `moderation.message-rate-limiter-cleanup` | `server/infrastructure/message-rate-limiter.ts` — existing one-minute interval | Existing process-local sender/recipient map eviction; no multi-instance guarantee is implied. |

All three limiter nodes retain their original intervals, timer startup, `.unref()`,
and local map ownership. They invoke the scheduled wrapper with
`useBackgroundJobRunner: false`; the existing timer callback remains the scheduler.

## Retained gates and manual decisions

- Login suspension checks, `isAuthenticated` suspension/deletion checks, and
  synchronous request-path publish/attestation/verification gates remain direct
  request safety gates. They were not changed to asynchronous registry calls.
- Admin suspension itself remains manual and post-persist session/socket cleanup
  remains best-effort.
- Message/user report review, generic content-flag review, review moderation,
  listing approval, and enforcement decisions remain human/admin actions.
- Neighborhood scoring remains advisory: it does not ratify claims or create
  neighborhood evidence. A scorer failure remains submitted/flagged and needs
  explicit admin rescore; no automatic retry was added.
- No user/report event is wired to automatic suspension, blocking, listing
  rejection, or takedown.

## Commands and results

Database-writing commands explicitly unset `PROD_DATABASE_URL` and enabled
`JOURNEY_DB_WRITES_OK=1`; they used the configured development `DATABASE_URL`.
The verification webhook test used an ephemeral loopback Express harness mounting
the actual webhook router with a locally generated Stripe test signature and
synthetic local test signing values. It did not start the full app, workers, or call
Stripe.

| Coverage | Command | Result |
|---|---|---|
| Pure registry engine and moderation runtime/conditions | `npx tsx --test server/automations/__tests__/registry-engine.test.ts server/automations/__tests__/moderation-registry.test.ts` | 10 passed, 0 failed, 0 skipped |
| Suspension, active WebSocket auth, review moderation atomicity, isolated signed verification webhook, report notification, neighborhood claims, internal limiter HTTP harness, and shared AI rate-limit coverage | `env -u PROD_DATABASE_URL NODE_ENV=test JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/user-suspension.db.test.ts server/__tests__/websocket-auth.db.test.ts server/__tests__/review-moderation-atomicity.db.test.ts server/__tests__/verification-automation-webhook.db.test.ts server/__tests__/moderation-report-notification.db.test.ts server/__tests__/neighborhood-claims.db.test.ts server/routes/__tests__/internal-jobs-limiter.http.test.ts server/__tests__/ai-rate-limit-coverage.test.ts` | 57 passed, 0 failed, 0 skipped |
| Existing F2 publish-verification HTTP gate and publish-verification hold suites | Isolated route harness procedure below; test files unchanged | 20 passed, 0 failed, 0 skipped (11 F2 gate, 9 publish-hold) |
| TypeScript baseline comparison | `npx tsc --noEmit --pretty false` | 120 diagnostics, matching the measured pre-migration baseline of 120; no diagnostics in added moderation automation/runtime/test files. Existing repository diagnostics remain. |

The suspension suite now includes an isolated admin-router regression proving that
a successful manual suspension persists and removes the target’s live session row.
The same suite proves password-reset session deletion remains atomic. The signed
webhook harness proves the actual identity webhook reaches the registered
activation action, activates an approved+draft expert listing, leaves an
approved+paused listing alone, and is idempotent on replay. The report DB regression
proves a new user report remains pending, writes one admin notification, and does
not suspend the reported user.

## Isolated F2 / publish-hold harness procedure

Both existing suites read `JOURNEY_BASE_URL` (otherwise they default to port 5000),
so they were run against port 4317—not the preview or a stale already-running
server. `server/__tests__/fixtures/verification-gate-harness.ts` builds the
production `registerRoutes(app)` surface without importing `server/index.ts` or
starting its background worker list. It mirrors the source JSON/raw-body, URL
encoded, health/metrics, rate-limit, and auth/session setup; the suites themselves
remain unchanged. `registerRoutes` starts one legacy five-minute TravelPulse timer,
which the harness immediately stops before listening. `NODE_ENV=test` also
activates existing scorer/draft scheduler test gates. Only unref’d local limiter
housekeeping timers remain.

The harness forces `ENVIRONMENT=TEST`, uses a synthetic session secret and Stripe
test key, clears OIDC, Meta, AI, maps, Persona, mail, and webhook credentials, and
does not invoke any live API. `env -i` carries only the development
`DATABASE_URL`, runtime `PATH`/`HOME`/`XDG_CONFIG_HOME`, and those synthetic test
values; it leaves `PROD_DATABASE_URL` unset. Run the existing fixture suites
serially with the dev-DB write opt-in:

```sh
COMMON=(env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}" \
  DATABASE_URL="$DATABASE_URL" NODE_ENV=test ENVIRONMENT=TEST JOURNEY_DB_WRITES_OK=1 \
  SESSION_SECRET='synthetic-verification-gate-harness-session-secret' \
  SESSION_COOKIE_INSECURE=1 STRIPE_SECRET_KEY='sk_test_verification_gate_harness_only')
"${COMMON[@]}" VERIFICATION_HARNESS_PORT=4317 \
  npx tsx server/__tests__/fixtures/verification-gate-harness.ts &
HARNESS_PID=$!
trap 'kill -TERM "$HARNESS_PID" 2>/dev/null || true; wait "$HARNESS_PID" 2>/dev/null || true' EXIT
READY=0
for _ in $(seq 1 120); do
  if ! kill -0 "$HARNESS_PID" 2>/dev/null; then
    wait "$HARNESS_PID"
    exit 1
  fi
  if curl --silent --fail http://127.0.0.1:4317/api/health >/dev/null; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1
"${COMMON[@]}" JOURNEY_BASE_URL=http://127.0.0.1:4317 \
  npx tsx --test --test-concurrency=1 \
  server/__tests__/f2-verification-gate.http.test.ts \
  server/__tests__/publish-verification-hold.http.test.ts
```

The F2 suite proved verified experts publish; unverified experts and under-verified
providers are blocked with role-correct responses; providers require both checks;
admin bypass and plain-user backstops remain; draft saves are ungated; and both
POST/PATCH publish paths apply the gate. The hold suite proved admin approval leaves
unverified listings approved+draft; verified listings activate; owner activation
still gates; verification flip activates only approved+draft (not same-owner
approved+paused) rows; and the sweep no-ops when verification still fails.

## Remaining coverage limits

- `neighborhood-claims.db.test.ts` ran its enabled Phase 1 tests (including the
  scorer-failure/no-auto-retry assertion); this checked-in command did not run
  separate successful-model-output Phase 2 scorer cases.
- No dedicated database test exists for generic `createContentFlag`; its registry
  condition/action binding is covered by the DB-free moderation runtime regression,
  while manual review behavior remains unchanged.
- The internal limiter HTTP suite ran against its own ephemeral Express harness
  with synthetic credentials. The generic and messaging cleanup sweeps were checked
  through the DB-free registry schedule tests; there is no existing test that waits
  for the one-minute timers to fire.
- No actual external scheduled deployment, production webhook, production key,
  or live API behavior was tested.

The payments gate remains the previously recorded
`docs/automation-migration/payments-verification.md` result of 199 unique passed,
0 skipped, 0 failed; it was not rerun or modified for this domain task.