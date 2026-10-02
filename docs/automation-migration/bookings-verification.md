# Bookings automation migration verification

## Scope and source-to-ID evidence

This records the bookings-domain migration against the read-only inventory in
`source-inventory.md` § Bookings (lines 116–147). Stable IDs name the existing
actions; wrappers do not introduce a new timer, policy, notification channel,
financial action, or database guard.

| Inventory source / live entrypoint | Stable ID | Existing action/guard retained |
|---|---|---|
| Unified hourly job: `server/jobs/bookingAutoCompletion.ts:207+`; warm runner `server/index.ts:893-912`; external runner `server/routes/internal.routes.ts:236-245` | `bookings.auto-completion` | Method eligibility, payment-on-record and succeeded-PI checks, unpaid recheck stamp, completeBooking transition/mint transaction, result/error accounting, and the existing outer background-job runner remain unchanged. The old timer-owning `bookingAutoCompleteScheduler.start()` remains inactive; only its reconciliation helper is reused. |
| Declared booking window close: `server/jobs/bookingAutoCompletion.ts:343-407` | `bookings.declared-window-close` | Existing derived deadline, payment gate, disputed-row exclusion, named `completion_declared` from-state guard and shared completeBooking writer. Separate node for the independent pass; no second background-job runner. |
| Coordination window close: `server/jobs/bookingAutoCompletion.ts:409-424`; `server/services/coordination-completion.service.ts:47-94` | `bookings.coordination-window-close` | Existing declaration-time derivation and guarded coordination state transition; no earning mint or fee change. |
| Artifact prompt/escalation: `server/jobs/bookingAutoCompletion.ts:426-458`; `server/services/artifact-acceptance-timer.service.ts:372-411` | `bookings.artifact-acceptance` | Existing delivery-instant and payment gates, unpaid stamp, and atomic prompt/escalation status transitions. This pass changes status/diary only; no email or completion is added. |
| Completed-booking ledger repair: `server/jobs/bookingAutoCompletion.ts:461-480`; retained helper `server/services/booking-auto-complete.service.ts` | `bookings.completion-ledger-reconciliation` | Existing idempotent repair helper only; it does not complete a booking or create a second mint implementation. |
| Shared completion writer: `server/services/booking-completion.service.ts:816-944`, called by the hourly job, traveler acceptance (`booking-acceptance.service.ts:318-345`), and bundle writer (`booking-completion.service.ts:1265-1289`) | `bookings.completion-writer` | One event-dispatch boundary around the original public writer. Eligibility, transaction, from-state guard, mint, provenance, diary, and each caller's authorization/return behavior remain in their existing owners. |
| Shared owner/timer declaration writer: `server/services/booking-completion.service.ts:972-1060`; owner route `server/routes.ts:7828-7859`; hourly job `server/jobs/bookingAutoCompletion.ts:291-308` | `bookings.completion-declaration-writer` | Existing eligibility derivation, guarded declaration, timestamp/provenance/diary; no mint. Public signature and route authorization are unchanged. |
| Legacy pending-payment expiration: `server/services/booking-expiry-scheduler.service.ts:31-53,88-217`; startup `server/index.ts:768`; internal job `server/routes/internal.routes.ts:285-290`; admin manual trigger `server/routes/admin.routes.ts` | `bookings.legacy-payment-expiry` | The same scheduler service method and stats contract run under the existing four-hour timer/internal job/admin manual entrypoint. The status predicate and configured threshold remain authoritative. |
| Earner no-response notice arm: `server/services/booking-expiry-scheduler.service.ts:108-116`; action `server/services/earner-no-response.service.ts:56-155` | `bookings.earner-no-response-notice` | Existing booking/advisor candidate exclusions, dedupe-key insert, preference-gated outbox enqueue, and notice-only behavior remain; it never cancels or reassigns. Advisor rows remain the existing combined cross-domain arm. |
| T−48h Trip Card nudge: `server/services/trip-card-handover-scheduler.service.ts:30-108`; startup `server/index.ts:789-792` | `bookings.trip-card-handover-nudge` | Existing hourly timer, candidate window, finalization exclusion, notification existence query, and best-effort result remain; no trip finalization/email is introduced. |
| Occasion drafts: `server/services/occasion-drafts.service.ts:81-129`; endpoint `server/routes/internal.routes.ts:205-220`; warm scheduler `server/services/occasion-drafts-scheduler.service.ts:29-77` | `bookings.occasion-drafts` | Both existing entrypoints route through the same service wrapper. Existing recurrence/date ledger, generation lease, and `notified_at`-before-enqueue one-attempt behavior remain. External 09:00 UTC runner is authoritative; warm timer remains defense-in-depth. |
| Daily recurring availability horizon: `server/jobs/availabilityMaterializationSweep.ts:16-30`; startup `server/index.ts:855-865`; internal job `server/routes/internal.routes.ts:278-288` | `bookings.availability-horizon-materialization` | Startup and external entrypoints share the same daily node. Existing per-service isolation, `(service_id,date,start_time)` conflict guard, and add-only/no-delete behavior remain. |
| Weekly-pattern authoring follow-on: `server/routes.ts:3602-3648` | `bookings.availability-pattern-authoring` | Runs the existing service materializer after the authenticated owner save; same result and route error handling. |
| Date-range authoring follow-on: `server/routes.ts:3677-3729` | `bookings.availability-date-range-authoring` | The existing date-range materialization and unbooked-only repricing remain one request-scoped action after owner authorization and validation. |
| Blackout authoring follow-on: `server/routes.ts:3752-3799` | `bookings.availability-blackout-authoring` | Re-runs the existing weekly/date-range materializers after the owner save; existing slots are not deleted or cancelled. |
| Provider acceptance notice in the shared status writer: `server/routes.ts:7595-7633`; transaction owner `server/storage.ts:3520-3684` | `bookings.provider-acceptance-follow-on` | Dispatches only when the existing confirmed transition supplies its deduped notice. The writer's conditional transition and same-transaction notification remain authoritative. |
| Cancellation/decline follow-ons and slot release: `server/routes.ts:7595-7650,8204-8365`; shared writer `server/storage.ts:3520-3684`; refund implementation remains in payment service | `bookings.cancellation-follow-ons` | Existing cancelled/refunded transitions route once through the original status writer. Its transition guard, optional transactional notification, first-cancel slot release and counter behavior remain intact. Caller authorization, cancellation tiers, refund policy, and money movement remain manual/request-scoped or in their existing payment actions. |

### Inventory explicitly retained outside new bookings automation

- Checkout-claim cleanup/payment catch-up and paid checkout promotion are already
  represented in the payments domain (`payments.checkout-claim-sweep` and the
  existing payment-promotion nodes); this migration adds no payment/release path.
- Legacy `bookings` writes still obey the existing `LEGACY_BOOKINGS_NO_NEW_WRITES_FROM`
  request gate. The stored legacy `booking_requests.expires_at` has no discovered
  consumer and is not promoted to a sweeper.
- Traveler/provider cancellation, refund tiers, quote expiry, acceptance, delivery,
  dispute, owner declaration, and explicit/manual completion remain the existing
  authenticated request actions. This migration adds no automatic cancellation or
  refund policy. Shared writers are dispatched at their existing boundaries only.
- Booking request/provider alerts and other API-follow-on communications stay with
  their existing request paths/outbox. No email is added to the artifact pass or
  Trip Card nudge.
- UI-derived Trip Card handover is not a database automation. Availability cleanup
  for stale unbooked slots is not implemented; booked slots are never deleted by
  these materializers.
- External scheduler provisioning/delivery remains unverified by repository code;
  warm timers remain defense-in-depth and do not establish external-job health.

## Verification gate

Payments (199 tests) and moderation/security (87 tests) had passed before the
bookings gate; see their domain verification notes. Bookings commands below are
run serially against the development database only, with `PROD_DATABASE_URL`
unset and `JOURNEY_DB_WRITES_OK=1`. DB fixture suites create and clean up their
own rows. HTTP DB tests use the isolated
`server/__tests__/fixtures/verification-gate-harness.ts` on port 4317, which
registers routes without startup workers and uses the test Stripe stub; no live
Stripe action is part of this gate.

### Commands and results

The isolated HTTP fixture command was:

Before unsetting the production connection variable, the development and
production targets were compared without printing either URL:

```sh
node -e 'const d=process.env.DATABASE_URL&&new URL(process.env.DATABASE_URL);const p=process.env.PROD_DATABASE_URL&&new URL(process.env.PROD_DATABASE_URL);if(!d||!p||(d.host===p.host&&d.pathname===p.pathname)){console.error("Refusing: verify a distinct development target first");process.exit(1)}console.log("Development host/database differs from production")'
```

```sh
env -u PROD_DATABASE_URL -u STRIPE_SECRET_KEY_TEST \
  -u STRIPE_WEBHOOK_SECRET_TEST -u STRIPE_CONNECT_WEBHOOK_SECRET_TEST \
  -u STRIPE_IDENTITY_WEBHOOK_SECRET -u RESEND_API_KEY -u SENDGRID_API_KEY \
  -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  -u GOOGLE_MAPS_API_KEY -u PERSONA_API_KEY -u PERSONA_TEMPLATE_ID \
  -u META_APP_ID -u META_APP_SECRET -u REPL_ID \
  JOURNEY_DB_WRITES_OK=1 NODE_ENV=test \
  STRIPE_SECRET_KEY=sk_test_dummy_key_for_deposit_cancel_suite \
  VERIFICATION_HARNESS_PORT=4317 \
  npx tsx server/__tests__/fixtures/verification-gate-harness.ts
```

With it running, the DB regression command was:

```sh
env -u PROD_DATABASE_URL -u STRIPE_SECRET_KEY_TEST \
  -u STRIPE_WEBHOOK_SECRET_TEST -u STRIPE_CONNECT_WEBHOOK_SECRET_TEST \
  -u STRIPE_IDENTITY_WEBHOOK_SECRET -u RESEND_API_KEY -u SENDGRID_API_KEY \
  -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  -u GOOGLE_MAPS_API_KEY -u PERSONA_API_KEY -u PERSONA_TEMPLATE_ID \
  -u META_APP_ID -u META_APP_SECRET -u REPL_ID \
  JOURNEY_DB_WRITES_OK=1 NODE_ENV=test E2E_AI_STUB=1 \
  STRIPE_SECRET_KEY=sk_test_dummy_key_for_deposit_cancel_suite \
  JOURNEY_BASE_URL=http://127.0.0.1:4317 \
  npx tsx --test --test-force-exit --test-concurrency=1 \
  server/__tests__/booking-auto-complete.db.test.ts \
  server/__tests__/booking-completion-machinery.db.test.ts \
  server/__tests__/acceptance-rails.db.test.ts \
  server/__tests__/declared-completion.db.test.ts \
  server/__tests__/deposit-checkout.db.test.ts \
  server/__tests__/earner-no-response.db.test.ts \
  server/__tests__/occasion-drafts.db.test.ts \
  server/__tests__/availability-model.db.test.ts \
  server/__tests__/service-booking-counters.db.test.ts \
  server/__tests__/qa2-notification-slot-durability.db.test.ts \
  server/__tests__/stay-release-all-nights.db.test.ts \
  server/__tests__/deposit-cancel.db.test.ts
```

| Command | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| `npx tsx --test server/automations/__tests__/bookings-registry.test.ts` | 3 | 3 | 0 | 0 |
| `npx tsx --test --test-force-exit server/automations/__tests__/booking-scheduler-entrypoints.test.ts server/automations/__tests__/bookings-registry.test.ts` | 5 | 5 | 0 | 0 |
| Expanded DB regression batch (command above, including both adjacent writer suites) | 121 | 116 | 0 | 5 |
| `npx tsx --test --test-force-exit --test-concurrency=1 server/__tests/{booking-auto-complete.db.test.ts,booking-completion-machinery.db.test.ts,acceptance-rails.db.test.ts,declared-completion.db.test.ts,deposit-checkout.db.test.ts,earner-no-response.db.test.ts,occasion-drafts.db.test.ts,availability-model.db.test.ts,service-booking-counters.db.test.ts,deposit-cancel.db.test.ts}` | 111 | 106 | 0 | 5 |

The availability-model suite's HTTP requests must use
`JOURNEY_BASE_URL=http://127.0.0.1:4317` while the isolated harness is running.
Before unsetting `PROD_DATABASE_URL`, the DB runs compared the redacted
`DATABASE_URL` host/database identity with the production URL and refused an
identical endpoint. This comparison is an extra guard, not proof that an
arbitrary URL is disposable: use an independently verified development-only
database endpoint and inspect its target under the project's approved dev-DB
procedure before opting in to writes. The run used the development `DATABASE_URL`
and fixture-only rows with `PROD_DATABASE_URL`, `RESEND_API_KEY`,
`SENDGRID_API_KEY`, and `STRIPE_SECRET_KEY_TEST` unset,
`JOURNEY_DB_WRITES_OK=1`, `NODE_ENV=test`, and a dummy `STRIPE_SECRET_KEY`.
Occasion email tests therefore verified outbox enqueue/deduplication without an
outbound email provider call. The five `deposit-cancel.db.test.ts` cases were
visibly skipped by their contract because the available Stripe key was live-mode;
it was not passed to the suite, and no Stripe API action was made.

The fixture suites use run-unique IDs and clean their own created rows in
`after()` hooks. Availability HTTP fixtures were served by the isolated harness;
the direct service/DB suites did not start application workers. `qa2` and
`stay-release-all-nights` use test-local booking, slot, user, service, trip, and
notification rows; `stay-release-all-nights` stubs the refund call. No migrations
or schema changes were run. The scheduled-callback tests use fake timers and
replace only the booking action callback; they exercise the actual startup,
interval, manual/ad-hoc entrypoint, `runBackgroundJob`, and booking schedule
wrapper once each, without DB reads/writes.

The focused scheduler-entrypoint command ran:

```sh
env -u PROD_DATABASE_URL -u RESEND_API_KEY -u SENDGRID_API_KEY \
  NODE_ENV=test \
  STRIPE_SECRET_KEY=sk_test_dummy_key_for_release_all_nights_suite \
  npx tsx --test --test-force-exit \
  server/automations/__tests__/booking-scheduler-entrypoints.test.ts \
  server/automations/__tests__/bookings-registry.test.ts
```

The DB-writing commands use `--test-concurrency=1`; the HTTP harness was
terminated after the full regression batch. Its internal credential scrubber
clears Stripe/email and other external API credentials and supplies a synthetic Stripe
key; the test process itself receives only dummy Stripe configuration and no
email-provider keys.

The original migration gate covered 126 unique cases: 121 passed, 0 failed, and
5 skipped. The expanded DB batch includes the earlier 111-case batch plus the
10 adjacent writer tests; they are not added twice. The combined focused command
also repeats the three registry cases already counted separately. A later
isolated deposit-cancel rerun and its actual result are documented below. The
completed payments gate's `deposit-checkout.db.test.ts` covers DB-only
deposit/balance promotion, not the external refund integration.

The test runner initially remained alive after its worker tests completed, so
the successful regression invocation uses Node's `--test-force-exit`; all 121
test cases completed before the force-exit summary. Two earlier exploratory
attempts predated removal of the inherited Resend credential and reported
successful sends to synthetic `@t.test` recipients from the no-response and
occasion suites. The final recorded run above scrubbed all outbound email
credentials; no real user address was used in those earlier attempts.

### Isolated deposit-cancel Stripe test-mode attempts

All follow-up attempts used only the existing `STRIPE_SECRET_KEY_TEST`; its
validity was checked with a boolean-only shape/nonstub test without printing
or placing its value in a file or command argument. The inherited live
`STRIPE_SECRET_KEY` and `PROD_DATABASE_URL` were excluded from each isolated
harness and test subprocess. On correctly targeted runs the harness retained
`_TEST`, set `NODE_ENV=test`/`ENVIRONMENT=TEST`, and itself replaced the shared
key with its synthetic value; its app resolver prefers `_TEST` in this
environment. The unchanged test file reads the legacy shared name, so a child
Bash assigned `STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY_TEST"` only for the test
process. `DATABASE_URL` was the skill-confirmed development URL and
`JOURNEY_DB_WRITES_OK=1` was explicit.

The development target was independently checked using the database skill's
read-only development and production identity queries. Both inherited endpoint
identities matched their respective skill-selected environments, and the
development/production identities differed; only boolean results were emitted.
Thus the opt-in fixture writes used the skill-confirmed development target, not
an inference from an unset production URL or hostname.

The first, superseded follow-up attempt used a curated unset list for shared
`STRIPE_SECRET_KEY`, `PROD_DATABASE_URL`, Stripe webhook/live-inspection keys,
Resend/SendGrid/SMTP keys, AI/search/maps/travel/partner APIs, Clerk/GitHub/
Replit identity credentials, VAPID keys, and `PG*` overrides. It started the
scrubbed harness on `127.0.0.1:4317` but omitted `JOURNEY_BASE_URL`; the
unchanged test defaults to `http://127.0.0.1:5000`, so its two registration
requests instead reached the separate server already listening there. The
test's registration route fires verification and welcome email sends
asynchronously (`server/replit_integrations/auth/emailAuth.ts:135-145`).
That server had a separate environment outside this run's scrub list, so
each registration could have attempted a verification and a welcome send
(four mail sends total) to the synthetic `@t.test` addresses. Delivery was not
checked, and these are possible attempts, not claimed successes; no real-user
recipient was used. This first attempt did not reach Stripe API calls.

The second, also superseded, attempt used an explicit child-environment
allowlist inside a temporary subshell; it unexported inherited variables, then re-exported only
`PATH`, `HOME`, optional `XDG_CONFIG_HOME`, the present nonsecret Nix wrapper
settings (`NIX_CFLAGS_COMPILE`, `NIX_LDFLAGS`, `NIX_PATH`,
`NIXPKGS_ALLOW_UNFREE`), the verified development `DATABASE_URL`, the existing
`STRIPE_SECRET_KEY_TEST`, and the listed test flags/loopback URLs. `PWD` and
`SHLVL` were normal shell runtime metadata. The environment audit returned
`ALLOWLIST_ENV_OK=true`; the test-key validation emitted only `true`. It
targeted the correct harness port, but used the old colliding slot seeds. The
temporary subshell made no persistent environment/config changes.

The final attempt repeated that allowlist in a temporary subshell, required the
exact loopback target before invoking the suite, and used the now-disjoint
09:00–12:00, 13:00–16:00, and 17:00–20:00 slots for the same future
service/date. The harness and test child both had only the allowlisted
development DB/test-key variables, nonsecret wrapper settings, and synthetic
test flags; neither had mail, AI, maps, or other provider credentials. The
harness had a synthetic session secret and no startup workers. Boolean checks
reported `HARNESS_ALLOWLIST_OK=true`, `TEST_KEY_VALID=true`,
`HARNESS_TARGET_AND_MODE_OK=true`, and
`TEST_CHILD_ALLOWLIST_AND_TARGET_OK=true`. The final test subprocess was
fail-closed unless `JOURNEY_BASE_URL` was exactly
`http://127.0.0.1:4317`, `NODE_ENV=test`, and `ENVIRONMENT=TEST`; it never
requested port 5000.

Before that final Stripe call, read-only development `information_schema`,
constraint, and index queries covered the fixture/auth tables (`users`,
`email_verification_tokens`, `provider_services`, `vendor_availability_slots`,
`service_bookings`, `refunds`, plus the harness's `sessions` and
`funnel_events`). They confirmed the booking tracking-number cap is 20
characters; the updated `id.slice(-20)` values are all 20 characters, retain
the 8-character run nonce, and have three distinct booking suffixes. The
service/slot/booking IDs and Stripe IDs fit their actual development column
types (booking Stripe IDs and refund Stripe IDs are varchar(255); fixture
service/slot/booking IDs are unbounded varchar, and refund primary keys are
UUIDs). The fixture's service name (varchar(255)), slot
times/statuses (varchar(10)/varchar(20)), booking status (varchar(30)),
verification hash (varchar(128)), and user/legal-version fields also fit.
Refund amounts fit numeric(10,2), with currency/status limits of varchar(10)/
varchar(50). The relevant foreign keys, required defaults, and unique indexes
are satisfied by the seeded users/service/slots and disjoint times. No other
setup mismatch was found.

The test-only child command invoked no other test file:

```sh
bash --noprofile --norc <<'CHILD'
set +x
[[ "$JOURNEY_BASE_URL" == "http://127.0.0.1:4317" &&
   "$NODE_ENV" == "test" && "$ENVIRONMENT" == "TEST" ]] || exit 1
node -e 'const v=process.env.STRIPE_SECRET_KEY_TEST||""; const ok=/^sk_test_[A-Za-z0-9]{24,}$/.test(v)&&!/dummy|stub|placeholder|example|fake/i.test(v); console.log("TEST_SECRET_VALID="+ok); if(!ok) process.exit(1)'
STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY_TEST" exec ./node_modules/.bin/tsx \
  --test --test-concurrency=1 server/__tests__/deposit-cancel.db.test.ts
CHILD
```

| Attempt | Target/environment | Tests | Pass | Fail | Skip | Result |
|---|---|---:|---:|---:|---:|---|
| Initial curated-scrub attempt; `JOURNEY_BASE_URL` omitted, so defaulted to `:5000` | Separate pre-existing server | 5 | 0 | 5 | 0 | Superseded: duplicate slot start-time (23505) |
| Explicit allowlist at `:4317`, old slot seeds | Isolated harness + development DB | 5 | 0 | 5 | 0 | Superseded: duplicate slot start-time (23505) |
| Disjoint slots, before tracking-number fix | Isolated harness + development DB | 5 | 0 | 5 | 0 | Superseded: booking insert varchar(20) error (22001); one succeeded $150 TEST PI |
| Final run, disjoint slots and 20-character tracking numbers | Isolated harness + development DB | 5 | 5 | 0 | 0 | All D1–D5 passed |

The two superseded attempts failed all five D1–D5 cases in the shared fixture
`before` hook because their slots shared a service/date/start time, violating
`vendor_availability_slots_service_date_start_unique` (23505). They failed
before any Stripe API call; these historical setup failures are not the final
unique-case status.

The third attempt's old tracking-number value caused the documented 22001
failure after one succeeded $150 TEST-mode PaymentIntent was created. That
orphan test object remains in Stripe's sandbox and cannot be deleted. The
final run passed all five cases using two new succeeded TEST-mode
PaymentIntents ($150 deposit and $162.50 deposit-plus-fee); D1 and D5 created
the expected two TEST-mode refunds ($150 and $162.50), and D2 verified that
retry created no second refund. These three PaymentIntents (the prior $150
object plus the two final-run objects) and two refunds remain in the Stripe
test sandbox; no live Stripe key or live action was used.

The test's `after` hook and read-only development checks left zero fixture
services, slots, bookings, refunds, or users. Cleanup also removed the 12
synthetic DPC sessions left by all four runs and the final run's two
`account_created` funnel events. The allowlisted harness was stopped and
verified closed (port 4317 closed; no harness/test subprocess remained). The
final run caused no mail-provider calls because the harness had no mail
credentials; all HTTP calls used `:4317`.

Across all recorded executions, counting repeats, there were 146 executions:
126 passed, 15 failed, and 5 skipped. The 15 failures are three superseded
setup attempts; the final run passed all five deposit-cancel cases. For
unique-case status, all 126 cases are now passing (121 migration-gate cases
plus D1–D5). The five original skips are superseded by the final execution.

## Parent integration checks

- The CI-equivalent discovery command (`find server/automations -type f -name
  '*.test.ts' | sort`) ran all 19 registry/adapter cases serially: 19 passed,
  0 failed, 0 skipped. Its allowlisted environment supplied synthetic Stripe
  configuration and a deliberately unreachable dummy database URL.
- `npx tsx scripts/check-automation-registry.ts` validated the combined 58 nodes,
  including all 17 booking nodes, without executing an action.
- `npx tsc --noEmit --pretty false --tsBuildInfoFile
  /tmp/automation-bookings.tsbuildinfo` completed with 120 diagnostics, matching
  the recorded branch baseline. No registry-file diagnostics were introduced.
  Fingerprints match after normalizing expanded object types and the existing
  `transfer.paid` error's truncated Stripe-union rendering. This is not a clean
  typecheck. The test-only fixture edits are excluded by the existing tsconfig.
- The server bundled successfully with esbuild; independent integrated bookings
  review found no blocking regression. Remaining domains and external scheduled
  runner delivery are not verified by this bookings gate.
- The configured development workflow was restarted once and the public landing
  page rendered successfully. Startup automatically applied the two already
  present, pending development migrations `335_city_events_vertical_series.sql`
  and `336_optimizer_run_records.sql`; this work did not author those migrations
  or execute production DDL. Existing development seed hooks also ran. This
  startup is separate from the isolated fixture runs described above.