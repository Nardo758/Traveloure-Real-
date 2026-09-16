# Lane report — orphan triage: 233 unreachable suites classified

**Branch** `task-orphan-triage` · **base** `origin/main` @ `a6a80c28e` · **date** 2026-09-15
**Lane kind** TRIAGE (verify, classify, propose). **Nothing was wired, deleted, skipped,
allowlisted or repaired**, and no test's assertions were changed. Per ledger
`2026-09-14-test-files-wired-orphans`, a suite leaves the orphan list by being RUN or by being
GONE — never by allowlist; this lane sizes that work, it does not do it.

**Input** the true orphan list published by `2026-09-15-test-guard-prose-echo`
(`docs/lane-reports/2026-09-15-test-guard-prose-echo.md`, PR #937). Re-measured on this branch:

```
$ node scripts/check-test-files-wired.cjs
test-files-wired: 277/510 reachable; 233 orphan(s)
```

(The denominator moved from 507 to 510 because `main` has since added three wired suites. The
**233-row orphan list is identical** to the published one — verified by parsing that report's §10
and set-differencing it against this run: **zero rows on either side**, not assumed from the count
matching.)

---

## 1 · What was stood up

| Thing | Exactly what |
|---|---|
| Postgres | The sandbox's own `postgresql 16/main` on `localhost:5432`, database **`traveloure_triage`** created empty. |
| Migrations | `DATABASE_URL=… npx tsx server/migrations/migrate-entry.ts` → **300 applied from empty, 0 skipped, 300/300 in ledger**. |
| Sessions table | `npx tsx scripts/create-sessions-table.ts` (the `ci-db-setup` step 2 — connect-pg-simple 10 workaround). |
| CI users | `npx tsx scripts/seed-ci-test-users.ts` (`ci-expert`/`ci-provider`/`ci-admin`/`ci-ea@traveloure.test`), i.e. `ci-db-setup` with `seed-ci-users: 'true'`. |
| DB env | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure_triage`, `SESSION_SECRET=ci-test-secret-not-for-production`, `STRIPE_SECRET_KEY=sk_test_ci_stub_no_real_calls`, `NODE_ENV=test`, `JOURNEY_DB_WRITES_OK=1` — the `ready-made-clone-fields` job's env verbatim, with the database name changed. |
| App on :5000 | `npm run build` (exit 0, `dist/index.cjs`, build-info `a6a80c2`) then `node dist/index.cjs` with the `admin-test-email-gate.yml` env block: `NODE_ENV=production`, `PORT=5000`, `ALLOW_TEST_ACCOUNTS=1`, `SESSION_COOKIE_INSECURE=1`, `RATE_LIMIT_LOOPBACK_SKIP=1`, stub `STRIPE_*`/`ANTHROPIC_API_KEY`/`XAI_API_KEY`/`RESEND_API_KEY`, waited on `/api/ready` → `"ready":true`. |
| Flag-gated extra runs | Four suites refuse to execute without a named opt-in and were re-run with it, because a suite that skips itself is not a green suite: `MUTATION_AUTH_AUDIT_OK=1` for the three `mutation-auth/*` HTTP audits, `TIER2_DEV_AUDIT_OK=1` for `tier2-security-audit.http` (which *throws at import* without it). |
| `node_modules` | Symlinked from the primary checkout. `package.json`/`package-lock.json` are byte-identical between `HEAD` and `origin/main`, so this is the same dependency tree `npm ci` would install. |

## 2 · Method

**30 of the 233 are Playwright specs and were NOT run** (`playwright/tests` 25, `playwright/tier4` 4,
`playwright/crossbrowser` 1). Per the lane brief no browser was launched; they are classified
statically as **PLAYWRIGHT** and carry the 2026-09-14 lane's own per-spec blocking reason, which
that lane established by actually running all 41.

The other **203** are node-runner suites and were each run **once per pass**, bounded at 120 s:

| Pass | Environment | What it separates |
|---|---|---|
| 1 | `NODE_ENV=test`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, **no `DATABASE_URL`** | **PURE-GREEN** — a suite that passes here needs neither a database nor an app. |
| 2 | pass 1 **+ `DATABASE_URL`** (the local `traveloure_triage`) **+ `JOURNEY_DB_WRITES_OK=1`** | **DB-GREEN** — passes against a migrated database, no app. |
| 3 | pass 2 **+ the production bundle on `:5000`** | **HTTP-GREEN** — needs the running app. |
| 4 | pass 3, re-run over **every green that references a base URL** | guards against a sibling worktree's dev server having answered `:5000` during passes 1-2, and gives a **second observation** of each HTTP-touching suite. |
| 5 | pass 3, re-run over **every pass-3 failure** | a second observation, because this harness turned out to carry a real race (§6). |
| v | `npx vitest run --root .` over the **12 vitest files** | the first attempt passed `--reporter=basic`, which vitest 4.1.10 rejects, and vitest's configured root is `client/`; both are harness errors and their results were discarded, not counted as RED. |

Runner per file: `npx tsx --test --test-concurrency=1 --test-force-exit <file>`, except the **12
files that import from `vitest`**, which are run with `npx vitest run <file>` — `tsx --test` cannot
execute them at all, and running them the wrong way would have manufactured a RED that is an
artefact of the harness rather than a fact about the suite.

**A note on what a pass PROVES.** Green here means "the assertions executed and held in this
harness". It does not mean the suite is worth wiring, and it does not mean the assertions are
non-vacuous — the reachability inventory's own stated negative space (`a reachable suite can be
green and vacuous`) applies with equal force to an orphan. Where a suite passed only because its
fixture silently found nothing to assert on, that is recorded in the row rather than counted as a
win.

## 3 · Bucket summary

| directory | total | PURE-GREEN | DB-GREEN | HTTP-GREEN | RED-FIXTURE | RED-ASSERTION | DEAD | PLAYWRIGHT |
|---|---|---|---|---|---|---|---|---|
| `server/__tests__/` | 157 | 56 | 60 | 7 | 27 | 6 | 1 | — |
| `playwright/tests/` | 25 | — | — | — | — | — | — | 25 |
| `server/services/__tests__/` | 21 | 12 | 9 | — | — | — | — | — |
| `server/routes/__tests__/` | 11 | 10 | — | — | 1 | — | — | — |
| `server/__tests__/mutation-auth/` | 6 | 2 | — | — | 2 | 1 | 1 | — |
| `playwright/tier4/` | 4 | — | — | — | — | — | — | 4 |
| `server/migrations/__tests__/` | 3 | — | 3 | — | — | — | — | — |
| `server/utils/__tests__/` | 2 | 2 | — | — | — | — | — | — |
| `playwright/crossbrowser/` | 1 | — | — | — | — | — | — | 1 |
| `server/seeds/__tests__/` | 1 | 1 | — | — | — | — | — | — |
| `server/services/travelpayouts/__tests__/` | 1 | 1 | — | — | — | — | — | — |
| `server/services/trend-engine/__tests__/` | 1 | 1 | — | — | — | — | — | — |
| **all** | **233** | **85** | **72** | **7** | **30** | **7** | **2** | **30** |

**Read it as: 164 of the 203 node suites (81 %) pass today with no repair at all** — 85 need
nothing, 72 need a database, 7 need the app as well. **30 fail on a fixture, 7 on a real
assertion, 2 are dead.** The 30 Playwright specs were not re-run.

**What a bucket means here, and what it does not.** GREEN means the assertions executed and held
in this harness. It is not a claim that the suite is worth wiring and it is not a claim that its
assertions are non-vacuous — the inventory's own negative space (*"a reachable suite can be green
and vacuous"*) binds an orphan exactly as hard. Where a suite passed only because it skipped
itself, the row says so and the suite is **not** counted green (`deposit-cancel.db`,
`admin-mutation-auth`, `admin-query-role-changes`).

## 4 · Results by directory

### `server/__tests__/` — 157 orphan(s)

_DB-GREEN 60, PURE-GREEN 56, RED-FIXTURE 27, HTTP-GREEN 7, RED-ASSERTION 6, DEAD 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `admin-query-role-changes.test.ts` | **DB-GREEN** — skips itself without DATABASE_URL (1 test, 1 skipped) — the pass-1 exit 0 was vacuous | 1/0 | — | wire — DB job |
| `affiliate-booking-trip-link.contract.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `affiliate-reconciliation-matching.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `affiliate-reconciliation-token-adoption.test.ts` | **DB-GREEN** | 12/0 | — | wire — DB job |
| `affiliate-reconciliation-travelpayouts.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `ai-error-sanitizer.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `ai-rate-limit-coverage.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `audit-log-atomicity.unit.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `availability-model.db.test.ts` | **HTTP-GREEN** | 13/0 | — | wire — DB + app job |
| `balance-payer-atomicity.db.test.ts` | **DB-GREEN** | 11/0 | — | wire — DB job |
| `balance-payer.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `benchmark-facts-denorm.db.test.ts` | **DB-GREEN** | 2/0 | — | wire — DB job |
| `booking-completion-machinery.db.test.ts` | **RED-FIXTURE** | 0/26 | Failed query: | repair the fixture, then wire |
| `booking-confirm-payment-idempotency.test.ts` | **RED-FIXTURE** | 0/2 | "Cannot read properties of undefined (reading 'providerId')" | repair the fixture, then wire |
| `booking-decline-reason.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `booking-eligibility-gates.db.test.ts` | **RED-FIXTURE** | 0/11 | login(ci-provider@traveloure.test) failed (401): {"message":"Invalid email or password"} | repair the fixture, then wire |
| `booking-fee-bootstrap-and-split-fallback.db.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `bundle-component-linking.db.test.ts` | **RED-FIXTURE** | 0/6 | Failed query: | repair the fixture, then wire |
| `calendar-date-client.test.ts` | **PURE-GREEN** | 2/0 | — | wire — whole-directory `unit-suite-*` job |
| `cart-trip-handoff.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `city-case-match.db.test.ts` | **RED-FIXTURE** — FLAKY against a live app — 4/0 on two of five observations | 3/1 | mis-cased services count must equal canonical: 27 !== 30. NOT a product defect: querying /api/discover/location/Kyoto and /kyoto directly returns 27 == 27; the two feed reads are not atomic and the seeded Kyoto row set moves under them. | repair the fixture, then wire |
| `concierge-admin-signal.test.ts` | **PURE-GREEN** | 18/0 | — | wire — whole-directory `unit-suite-*` job |
| `concierge-suggest-add.test.ts` | **DB-GREEN** — vitest | 8/0 | — | wire — DB job |
| `config-completeness.test.ts` | **DB-GREEN** — vitest | 4/0 | — | wire — DB job |
| `console-sigma-kyoto-bench.http.test.ts` | **DB-GREEN** | 7/0 | — | wire — DB job |
| `console-sigma-lead-confirm-notify.http.test.ts` | **DB-GREEN** | 2/0 | — | wire — DB job |
| `console-sigma-reorder-divergence.db.test.ts` | **DB-GREEN** | 1/0 | — | wire — DB job |
| `console-sigma-workspace-machine.http.test.ts` | **DB-GREEN** | 10/0 | — | wire — DB job |
| `contract-stats.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `coordination-credit.test.ts` | **DB-GREEN** — vitest | 5/0 | — | wire — DB job |
| `coordination-fee-refund-guard.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `coordination-ledger-gap-review.test.ts` | **DB-GREEN** | 1/0 | — | wire — DB job |
| `coordination-refund-credit-release.test.ts` | **DB-GREEN** | 1/0 | — | wire — DB job |
| `cors-allowlist.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `db-role-authorization.test.ts` | **PURE-GREEN** — vitest | 17/0 | — | wire — whole-directory `unit-suite-*` job |
| `deliverable-protected-rail.http.test.ts` | **RED-FIXTURE** | 0/13 | insert or update on table "service_bookings" violates foreign key constraint "service_bookings_traveler_id_users_id_fk" | repair the fixture, then wire |
| `demand-onepager-approval.test.ts` | **PURE-GREEN** | 5/0 | — | wire — whole-directory `unit-suite-*` job |
| `demand-onepager-render.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `demand-onepager.test.ts` | **PURE-GREEN** | 27/0 | — | wire — whole-directory `unit-suite-*` job |
| `demand-rollup.test.ts` | **PURE-GREEN** | 27/0 | — | wire — whole-directory `unit-suite-*` job |
| `demand-test-exclusion.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `deposit-cancel.db.test.ts` | **RED-FIXTURE** — GREEN-BUT-VACUOUS: 5 tests, 5 skipped, 0 executed | 0/0 | every test skips without a REAL Stripe test key (the file sets a placeholder DATABASE_URL on the skip path) | repair the fixture, then wire |
| `deposit-captured-resolution.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `deposit-checkout.db.test.ts` | **DB-GREEN** | 10/0 | — | wire — DB job |
| `egress-guard.test.ts` | **PURE-GREEN** — vitest | 46/0 | — | wire — whole-directory `unit-suite-*` job |
| `email-outbox.test.ts` | **DB-GREEN** | 17/0 | — | wire — DB job |
| `event-coordination.test.ts` | **DB-GREEN** — vitest | 14/0 | — | wire — DB job |
| `expert-application-content-gate.test.ts` | **PURE-GREEN** | 8/0 | — | wire — whole-directory `unit-suite-*` job |
| `expert-application-xss-sanitize.http.test.ts` | **RED-ASSERTION** | 1/9 | local_expert_forms row must exist after submission | decide: repair the pin or record the product change |
| `expert-attribution-and-accept-diary.db.test.ts` | **DB-GREEN** | 9/0 | — | wire — DB job |
| `expert-booking-request-guard.test.ts` | **PURE-GREEN** | 13/0 | — | wire — whole-directory `unit-suite-*` job |
| `expert-booking-request-rate.db.test.ts` | **RED-FIXTURE** | 3/4 | expert-booking-request must succeed: 404 {"message":"Service not found"} | repair the fixture, then wire |
| `expert-form-verification-strip.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `expert-note-separation.db.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `expert-profile-xss-regression.http.test.ts` | **RED-FIXTURE** | 6/10 | PATCH failed: {"message":"Authentication required"} | repair the fixture, then wire |
| `expert-profile-xss.http.test.ts` | **RED-FIXTURE** — vitest | None/None | Error: Failed query: | repair the fixture, then wire |
| `fp1-console-defects.db.test.ts` | **HTTP-GREEN** | 12/0 | — | wire — DB + app job |
| `fp3-property-room-edit.db.test.ts` | **RED-FIXTURE** | 0/8 | login must succeed | repair the fixture, then wire |
| `fp5-console-agreement.db.test.ts` | **RED-FIXTURE** | 0/9 | Failed query: | repair the fixture, then wire |
| `fp5-payout-threshold.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `gem-promotion.db.test.ts` | **PURE-GREEN** | 8/0 | — | wire — whole-directory `unit-suite-*` job |
| `generated-itinerary-atomicity.db.test.ts` | **RED-FIXTURE** | 2/2 | [ai-draft-eligibility] refusing to rebuild trip ai-atomic-trip-3ae608e0: the slip already holds 2 item(s). The free AI draft runs only on an empty slip (CLAUDE.md Locked Decision 41 (b)). | repair the fixture, then wire |
| `generated-itinerary-normalization.test.ts` | **PURE-GREEN** | 11/0 | — | wire — whole-directory `unit-suite-*` job |
| `guest-invite-mailer.test.ts` | **PURE-GREEN** | 25/0 | — | wire — whole-directory `unit-suite-*` job |
| `guest-invite-send.db.test.ts` | **RED-FIXTURE** | 6/1 | Failed query: DELETE FROM event_invites WHERE id = ANY(($1, $2, $3, $4, $5, $6)) | repair the fixture, then wire |
| `hire-advisor-guards.test.ts` | **PURE-GREEN** | 13/0 | — | wire — whole-directory `unit-suite-*` job |
| `ics-calendar.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `image-data-url-validation.test.ts` | **PURE-GREEN** | 16/0 | — | wire — whole-directory `unit-suite-*` job |
| `item-event-link.db.test.ts` | **RED-ASSERTION** | 2/3 | a cross-trip event id must be a visible 400, never a silent drop | decide: repair the pin or record the product change |
| `item-removed-diary.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `itinerary-item-rail-unification.db.test.ts` | **DB-GREEN** | 10/0 | — | wire — DB job |
| `journey-suite-negatives.http.test.ts` | **HTTP-GREEN** — 3 skipped | 13/0 | — | wire — DB + app job |
| `landing-moment-persistence.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `landing-moments-prompt.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `landing-moments.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `market-insights.db.test.ts` | **RED-FIXTURE** | 0/15 | login(ci-provider@traveloure.test) failed (401): {"message":"Invalid email or password"} | repair the fixture, then wire |
| `mid-trip-purchase-versions.db.test.ts` | **DB-GREEN** | 2/0 | — | wire — DB job |
| `neighborhood-claims-copy.test.ts` | **PURE-GREEN** | 3/0 | — | wire — whole-directory `unit-suite-*` job |
| `neighborhood-claims.db.test.ts` | **PURE-GREEN** | 12/0 | — | wire — whole-directory `unit-suite-*` job |
| `occasion-drafts.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `offering-type-clamp.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `optimization-confirm-ownership.test.ts` | **PURE-GREEN** | 3/0 | — | wire — whole-directory `unit-suite-*` job |
| `optimization-fee-determinism.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `optimizer-activity-geocoder.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `optimizer-gap-ledger.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `optimizer-segmentation-bridge.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `optimizer-variant-reconciliation.test.ts` | **PURE-GREEN** | 2/0 | — | wire — whole-directory `unit-suite-*` job |
| `parse-activity-time.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `pay-balance-idempotency.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `pending-events-drain.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `privileged-field-completeness-strip.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `provider-approval-email.test.ts` | **RED-ASSERTION** | 5/2 | Approval email must be sent exactly once for an approved user with an email | decide: repair the pin or record the product change |
| `provider-money-hardening.db.test.ts` | **RED-ASSERTION** | 3/3 | the provider band must be readable from fee_bands | decide: repair the pin or record the product change |
| `provider-office-location.db.test.ts` | **HTTP-GREEN** | 10/0 | — | wire — DB + app job |
| `provider-rejection-email.test.ts` | **DB-GREEN** | 9/0 | — | wire — DB job |
| `qa2-notification-slot-durability.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `ready-made-author-filter.http.test.ts` | **RED-FIXTURE** | 0/4 | insert or update on table "trips" violates foreign key constraint "trips_author_id_fkey" | repair the fixture, then wire |
| `refund-retry-convergence.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `regenerate-booking-guard.db.test.ts` | **RED-FIXTURE** | 1/1 | [ai-draft-eligibility] refusing to rebuild trip 2777aac6-c535-4368-bb21-d08fa97a1e3c: the slip already holds 3 item(s). The free AI draft runs only on an empty slip (CLAUDE.md Locked Decision 41 (b)). | repair the fixture, then wire |
| `registration-flag-gate.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `review-moderation-atomicity.db.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `role-audit-atomicity.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `role-transition.test.ts` | **PURE-GREEN** | 15/0 | — | wire — whole-directory `unit-suite-*` job |
| `runtime-health-secrets.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `s11-stay-booking.db.test.ts` | **RED-FIXTURE** | 1/7 | Failed query: | repair the fixture, then wire |
| `s8-property-builder.db.test.ts` | **RED-FIXTURE** | 0/11 | login must succeed | repair the fixture, then wire |
| `service-attestations.http.test.ts` | **RED-FIXTURE** | 24/1 | replay failed: {"message":"Authentication required"} | repair the fixture, then wire |
| `service-booking-counters.db.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `service-content-translation.http.test.ts` | **RED-FIXTURE** | 0/14 | insert or update on table "provider_services" violates foreign key constraint "provider_services_user_id_users_id_fk" | repair the fixture, then wire |
| `service-delete-archive.db.test.ts` | **DB-GREEN** | 7/0 | — | wire — DB job |
| `service-delete-guard.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `service-detail-traveler-representation.http.test.ts` | **HTTP-GREEN** | 7/0 | — | wire — DB + app job |
| `service-display-options.http.test.ts` | **RED-FIXTURE** | 5/4 | expected 404, got 401: {"message":"Authentication required"} | repair the fixture, then wire |
| `service-duplicate-and-tourism-fix.db.test.ts` | **DB-GREEN** | 2/0 | — | wire — DB job |
| `service-logistics-capture.http.test.ts` | **RED-FIXTURE** | 0/15 | create failed: {"message":"Expert or provider access required"} | repair the fixture, then wire |
| `service-logistics-never-clobber.http.test.ts` | **RED-FIXTURE** | 0/4 | fixture create failed: {"message":"Expert or provider access required"} | repair the fixture, then wire |
| `session-async-fields.http.test.ts` | **HTTP-GREEN** | 13/0 | — | wire — DB + app job |
| `share-link-price-redaction.http.test.ts` | **RED-FIXTURE** | 0/4 | Failed query: | repair the fixture, then wire |
| `share-money-redaction.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `shared-cache-flush-expired.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `slip-add-to-trip-targeting.db.test.ts` | **DB-GREEN** | 1/0 | — | wire — DB job |
| `slip-grounding-matcher.test.ts` | **PURE-GREEN** | 8/0 | — | wire — whole-directory `unit-suite-*` job |
| `slip-stay-projection.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `stay-release-all-nights.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `storefront-gems-shared.db.test.ts` | **PURE-GREEN** | 2/0 | — | wire — whole-directory `unit-suite-*` job |
| `storefront-role-agnostic.http.test.ts` | **RED-ASSERTION** | 4/1 | canonical API serves provider services with empty expert-only lanes: `undefined !== []` (deepStrictEqual) | decide: repair the pin or record the product change |
| `stripe-connect-reminder.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `stripe-key-policy.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `stripe-key-resolver.unit.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `test-seed-endpoint-gate.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `text-sanitization.test.ts` | **DEAD** — import of a removed export | 0/1 | SyntaxError: '../utils/text-sanitizer' does not provide an export named 'EXPERT_LISTING_TEXT_FIELDS' (the only reference left in the tree is this test) | DELETE (or rewrite against what replaced it) |
| `tier2-security-audit.http.test.ts` | **RED-FIXTURE** — needs TIER2_DEV_AUDIT_OK=1 (throws at import without it) | 0/5 | Surface 1 — authentication/session: expected 200, got 401 (fixture login) | repair the fixture, then wire |
| `trailhead-t3-affiliate-matcher.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `trailhead-t3-pass-runner.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `trailhead-t3-provider-matcher.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |
| `trailhead-t4-publish-gate.test.ts` | **PURE-GREEN** | 15/0 | — | wire — whole-directory `unit-suite-*` job |
| `travel-surcharge.db.test.ts` | **RED-ASSERTION** | 11/2 | total includes the surcharge line | decide: repair the pin or record the product change |
| `travelpayouts-statistics.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `travelpulse-calendar-ingest.test.ts` | **PURE-GREEN** | 14/0 | — | wire — whole-directory `unit-suite-*` job |
| `trip-advisor-row.test.ts` | **PURE-GREEN** | 24/0 | — | wire — whole-directory `unit-suite-*` job |
| `trip-card-snapshot-render.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `trip-commission-band-edit.http.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `trip-destinations.service.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |
| `trip-entitlement-source.db.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `trip-entitlement.db.test.ts` | **DB-GREEN** | 6/0 | — | wire — DB job |
| `trip-finalize.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `trip-pass-suppression.db.test.ts` | **RED-FIXTURE** | 0/3 | Failed query: | repair the fixture, then wire |
| `trip-pdf-render.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `trip-segmentation.test.ts` | **PURE-GREEN** | 11/0 | — | wire — whole-directory `unit-suite-*` job |
| `trips-list-final-version.db.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `two-surfaces-lifecycle.db.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `unified-search.db.test.ts` | **DB-GREEN** | 10/0 | — | wire — DB job |
| `upsell-click-payload.db.test.ts` | **HTTP-GREEN** | 3/0 | — | wire — DB + app job |
| `user-suspension.db.test.ts` | **DB-GREEN** | 21/0 | — | wire — DB job |
| `vendor-creator-filter.test.ts` | **PURE-GREEN** | 3/0 | — | wire — whole-directory `unit-suite-*` job |
| `websocket-auth.db.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `wegotrip-catalog.test.ts` | **DB-GREEN** — 2 skipped | 3/0 | — | wire — DB job |

### `playwright/tests/` — 25 orphan(s)

_PLAYWRIGHT 25_

Classified statically; no browser was launched. Every one of these was RUN by the
2026-09-14 lane, which recorded a per-spec blocking reason (fixture/seed data a fresh CI
database does not create · a stale expectation against a surface that still exists ·
broadly rotted legacy suites · unreachable by every shipped config). That classification
is not re-derived here and is not superseded.

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `breakpoint-hamburger.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `content-system.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `deprecated-route-redirects.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `discover-bento-real-data.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `expert-application-mobile.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `experts-flow.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `finalize-booking-modal.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `lane1-phase1d-routing.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `lb-p1-password-reset.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `offering-card.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `optimization-payment-gate.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `optimize-apply-banner.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `optimized-slip-live.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `phase-1-expert-setup.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `phase-2-provider-setup.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `phase-3-traveler-flows.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `phase-4-7-advanced-flows.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `seam-cross-console.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `search-bar.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `security-regression.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `slip-parity-fixture.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `stripe-init-deferral.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `travel-surcharge-step.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `tripstrip-count-accuracy.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `user-menu.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |

### `server/services/__tests__/` — 21 orphan(s)

_PURE-GREEN 12, DB-GREEN 9_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `activity-schedule.test.ts` | **PURE-GREEN** | 5/0 | — | wire — whole-directory `unit-suite-*` job |
| `anchor-candidates.test.ts` | **PURE-GREEN** — vitest | 13/0 | — | wire — whole-directory `unit-suite-*` job |
| `anchor-scoring.test.ts` | **PURE-GREEN** — vitest | 5/0 | — | wire — whole-directory `unit-suite-*` job |
| `background-job-runner.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |
| `booking-verification.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `booking-verification.test.ts` | **PURE-GREEN** | 35/0 | — | wire — whole-directory `unit-suite-*` job |
| `cancellation-policy.test.ts` | **DB-GREEN** | 10/0 | — | wire — DB job |
| `commission-phase1.test.ts` | **DB-GREEN** | 25/0 | — | wire — DB job |
| `content-matching.test.ts` | **DB-GREEN** | 9/0 | — | wire — DB job |
| `experience-cart-band.db.test.ts` | **DB-GREEN** | 4/0 | — | wire — DB job |
| `expert-split-band.db.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `expertise-scoring.test.ts` | **PURE-GREEN** | 8/0 | — | wire — whole-directory `unit-suite-*` job |
| `landing-hero.test.ts` | **PURE-GREEN** | 15/0 | — | wire — whole-directory `unit-suite-*` job |
| `location-view-neighbourhood-match.test.ts` | **DB-GREEN** | 5/0 | — | wire — DB job |
| `occasion-schedule.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `provider-health.test.ts` | **PURE-GREEN** | 13/0 | — | wire — whole-directory `unit-suite-*` job |
| `trailhead-crosswalk.test.ts` | **PURE-GREEN** | 5/0 | — | wire — whole-directory `unit-suite-*` job |
| `trailhead-derived-targets.test.ts` | **PURE-GREEN** | 10/0 | — | wire — whole-directory `unit-suite-*` job |
| `transport-leg-calculator.test.ts` | **DB-GREEN** | 3/0 | — | wire — DB job |
| `traveler-profile.service.test.ts` | **DB-GREEN** | 15/0 | — | wire — DB job |
| `upsell-query-any-array.test.ts` | **PURE-GREEN** | 7/0 | — | wire — whole-directory `unit-suite-*` job |

### `server/routes/__tests__/` — 11 orphan(s)

_PURE-GREEN 10, RED-FIXTURE 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `advisor-commission-read-gate.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `booking-idor-guard.test.ts` | **RED-FIXTURE** | 6/12 | Expected 403 but got 503 | repair the fixture, then wire |
| `instagram-frame-passthrough.http.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `instagram-frame-selection.test.ts` | **PURE-GREEN** | 15/0 | — | wire — whole-directory `unit-suite-*` job |
| `instagram-publish.test.ts` | **PURE-GREEN** | 17/0 | — | wire — whole-directory `unit-suite-*` job |
| `instagram-status.test.ts` | **PURE-GREEN** | 17/0 | — | wire — whole-directory `unit-suite-*` job |
| `itinerary-comparison-create-pin.test.ts` | **PURE-GREEN** | 2/0 | — | wire — whole-directory `unit-suite-*` job |
| `notification-email.test.ts` | **PURE-GREEN** | 3/0 | — | wire — whole-directory `unit-suite-*` job |
| `trip-anchor-candidates.test.ts` | **PURE-GREEN** | 2/0 | — | wire — whole-directory `unit-suite-*` job |
| `vendors-create-auth.test.ts` | **PURE-GREEN** | 11/0 | — | wire — whole-directory `unit-suite-*` job |
| `vendors-export.test.ts` | **PURE-GREEN** | 4/0 | — | wire — whole-directory `unit-suite-*` job |

### `server/__tests__/mutation-auth/` — 6 orphan(s)

_RED-FIXTURE 2, PURE-GREEN 2, RED-ASSERTION 1, DEAD 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `admin-mutation-auth.test.ts` | **RED-ASSERTION** — needs MUTATION_AUTH_AUDIT_OK=1; vacuous without it (1 pass, 124 skipped) | 140/3 | DELETE /api/admin/service-offering-types/:key \| principal=authenticated ordinary user \| expected=403 actual=401 (also /api/admin/slow-queries and /api/ea/executives/:id) | decide: repair the pin or record the product change |
| `expert-provider-mutation-auth.test.ts` | **RED-FIXTURE** — needs MUTATION_AUTH_AUDIT_OK=1 | 0/3 | ordinary-user fixture login failed: status=401 {"message":"Invalid email or password"} | repair the fixture, then wire |
| `mutation-auth.http.test.ts` | **RED-FIXTURE** — needs MUTATION_AUTH_AUDIT_OK=1 | 0/4 | fixture User A must be able to log in: status=401 {"message":"Invalid email or password"} | repair the fixture, then wire |
| `mutation-auth.inventory.test.ts` | **PURE-GREEN** | 1/0 | — | wire — whole-directory `unit-suite-*` job |
| `non-admin-payments-user-data-mutation-auth.http.test.ts` | **DEAD** — MUTATION_AUTH_AUDIT_OK=1; asserts a RETIRED rail is mounted | 1/1 | POST /api/expert/templates is unmounted or concrete path is invalid — the consumer lane was retired by ledger 2026-09-03-expert-templates-consumer-sunset | DELETE (or rewrite against what replaced it) |
| `payment-mutation-auth.manifest.test.ts` | **PURE-GREEN** | 1/0 | — | wire — whole-directory `unit-suite-*` job |

### `playwright/tier4/` — 4 orphan(s)

_PLAYWRIGHT 4_

Classified statically; no browser was launched. Every one of these was RUN by the
2026-09-14 lane, which recorded a per-spec blocking reason (fixture/seed data a fresh CI
database does not create · a stale expectation against a surface that still exists ·
broadly rotted legacy suites · unreachable by every shipped config). That classification
is not re-derived here and is not superseded.

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `a11y.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `booking.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `deep-ui-loop.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |
| `keyboard.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |

### `server/migrations/__tests__/` — 3 orphan(s)

_DB-GREEN 3_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `1577-cart-booking-revenue-dedup.test.ts` | **DB-GREEN** — vitest | 6/0 | — | wire — DB job |
| `244-platform-revenue-payment-intent-dedup.test.ts` | **DB-GREEN** — vitest | 8/0 | — | wire — DB job |
| `ready-made-purchase-revenue-dedup.test.ts` | **DB-GREEN** — vitest | 5/0 | — | wire — DB job |

### `server/utils/__tests__/` — 2 orphan(s)

_PURE-GREEN 2_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `data-sanitizer.test.ts` | **PURE-GREEN** | 6/0 | — | wire — whole-directory `unit-suite-*` job |
| `text-sanitizer.test.ts` | **PURE-GREEN** | 22/0 | — | wire — whole-directory `unit-suite-*` job |

### `playwright/crossbrowser/` — 1 orphan(s)

_PLAYWRIGHT 1_

Classified statically; no browser was launched. Every one of these was RUN by the
2026-09-14 lane, which recorded a per-spec blocking reason (fixture/seed data a fresh CI
database does not create · a stale expectation against a surface that still exists ·
broadly rotted legacy suites · unreachable by every shipped config). That classification
is not re-derived here and is not superseded.

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `smoke.spec.ts` | **PLAYWRIGHT** | — | — | not run here — the 2026-09-14 per-spec classification stands |

### `server/seeds/__tests__/` — 1 orphan(s)

_PURE-GREEN 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `dmo-anchor-registry-sync.test.ts` | **PURE-GREEN** | 9/0 | — | wire — whole-directory `unit-suite-*` job |

### `server/services/travelpayouts/__tests__/` — 1 orphan(s)

_PURE-GREEN 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `travelpayouts-cache-status.test.ts` | **PURE-GREEN** | 8/0 | — | wire — whole-directory `unit-suite-*` job |

### `server/services/trend-engine/__tests__/` — 1 orphan(s)

_PURE-GREEN 1_

| file | bucket | pass/fail | first failure | disposition |
|---|---|---|---|---|
| `market-slug-resolver.test.ts` | **PURE-GREEN** | 5/0 | — | wire — whole-directory `unit-suite-*` job |


## 5 · The seven RED-ASSERTION rows, read one at a time

A failing assertion is either a defect or a stale pin, and the difference is not visible from the
failure line. Each was opened.

| # | file:line | what it says | verdict |
|---|---|---|---|
| 1 | `server/__tests__/item-event-link.db.test.ts:222` | `a cross-trip event id must be a visible 400, never a silent drop` — **403 !== 400** | **EVIDENCE FOR AN ALREADY-OPEN ROW — punchlist V-29, not a new one.** The suite mounts the real router as the trip's OWNER and PATCHes an item; it gets **403 before the handler's Locked-Decision-29 pairing check can answer 400**. The trip is born by a direct `db.insert(trips)` at `:165` with no `trip_collaborators` row — which is exactly V-29's mechanism: `canMutateTrip` resolves the owner *only* through `trip_collaborators`, so an owner without that row is refused on their own plan. **This is the first live reproduction of V-29 I am aware of**; V-29 is open and a parallel lane owns it, so no R-row is filed. |
| 2 | `server/__tests__/mutation-auth/admin-mutation-auth.test.ts` (with `MUTATION_AUTH_AUDIT_OK=1`; **140 pass, 3 fail**) | three rails answer **401 where the suite's contract says 403** for an *authenticated ordinary user*: `DELETE /api/admin/service-offering-types/:key`, `DELETE /api/admin/slow-queries`, `DELETE /api/ea/executives/:id` | **CANDIDATE, NOT FILED.** Every one of the three still REFUSES the mutation, so this is a refusal-vocabulary divergence on three rails out of 143, not an authorization hole — and 140 rails answer the contract exactly, which is what makes the three worth a look rather than a rewrite of the contract. Filing it as a defect would require establishing which code is right, and that is a decision, not a measurement. |
| 3 | `server/__tests__/provider-approval-email.test.ts` | `Approval email must be sent exactly once for an approved user with an email` — **0 !== 1** | **STALE PIN.** `PATCH /api/admin/provider-applications/:id/status` still calls `sendProviderApplicationApprovalEmail` (`server/routes/admin.routes.ts:2832`), but the handler grew an `assertUserRoleTransitionAllowed` pre-check (ledger `2026-09-04-earn-role-safety`) at `:2783` that the suite's chainable `db` mock does not satisfy, so the handler returns before the send. The test's harness, not the product. |
| 4 | `server/__tests__/storefront-role-agnostic.http.test.ts:115` | `canonical API serves provider services with empty expert-only lanes` — **`undefined !== []`** | **STALE PIN (probable).** The payload no longer carries the expert-only lane key the suite deep-equals against `[]`. Which of "absent" and "empty array" is correct is a §13 question about what the storefront claims, and it belongs to whoever repairs the suite. |
| 5 | `server/__tests__/travel-surcharge.db.test.ts:257` | `total includes the surcharge line` — **`'127.00' !== '145.00'`** (11 pass, 2 fail) | **UNRESOLVED — needs the fee/config fixture this harness does not build.** `fee_bands` has 61 rows from the migrations alone, so the band table is not empty; the two failing cases are the fee-preview disclosure cases (`D1`, `D1b`) and the delta is one surcharge line. Not filed: I cannot separate "the preview omits the line" from "this database has no pickup/radius config" without building that fixture, and guessing between them is the §13 failure. |
| 6 | `server/__tests__/provider-money-hardening.db.test.ts` | `the provider band must be readable from fee_bands` (3 pass, 3 fail) | **UNRESOLVED, same class as #5** — a band-shaped fixture this harness does not create. |
| 7 | `server/__tests__/expert-application-xss-sanitize.http.test.ts` | `local_expert_forms row must exist after submission` (1 pass, 9 fail) | **FIXTURE-SHAPED**, kept in this bucket because the assertion is the first thing that fails rather than a login: the submission returns 2xx and no row appears, which is either a stale route or a missing precondition. Worth one lane's attention. |

**Two suites fail on a RULING the product has since taken, which is the most interesting shape in
the whole sweep.** `generated-itinerary-atomicity.db.test.ts` and `regenerate-booking-guard.db.test.ts`
both die on
`[ai-draft-eligibility] refusing to rebuild trip …: the slip already holds N item(s). The free AI
draft runs only on an empty slip (CLAUDE.md Locked Decision 41 (b)).` They are counted RED-FIXTURE
because the message is the harness refusing, not an assertion — but the cause is that **the product
was ruled and the suites were never brought along**. They are the cheapest RED rows to repair and
the ones whose silence cost the most: two proofs of snapshot atomicity that have asserted nothing
since LD 41 (b) landed.

## 6 · R-12 and R-13 — the actual cause, and it is not what it looked like

**R-12** `server/__tests__/availability-model.db.test.ts` (13 proofs) and **R-13**
`server/__tests__/s11-stay-booking.db.test.ts` (8 proofs) fail identically, and the V-26 lane's
guess — *a `user_id` FK / a missing registered actor* — is **CONFIRMED as the proximate error**:

```
insert or update on table "provider_services" violates foreign key constraint
  "provider_services_user_id_users_id_fk"
DETAIL: Key (user_id)=(69a2812d-…) is not present in table "users".
```

It fires in each suite's own fixture helper (`seedService` at `availability-model:102`, `seedRoom`
at `s11-stay-booking:125`), before any assertion, on the FIRST test — which is why every later test
fails too.

**The cause under it is a RACE, and naming it changes the repair.** The actor is created by
`POST /api/auth/register` **in the server process** and the fixture row is inserted **from the test
process**, with no read-back between them. `before()` asserts only the 201; it never confirms the
row is visible to its own connection. Measured, on this harness, with nothing else running:

| observation | R-12 | R-13 |
|---|---|---|
| runs as-is | **0/13** on six runs, **13/13** on two | **1/7** on three runs, **8/8** on one |
| one extra round-trip inserted between register and the fixture insert | **13/13** | — |
| a bare 50 ms `setTimeout` in the same place | **13/13** on one run, 0/13 on another | — |

So it is timing-sensitive and non-deterministic, not a schema gap, not missing seed data and not a
stale expectation: **when the race does not bite, both suites are fully green.** The register
handler awaits the insert and returns the row (`server/replit_integrations/auth/emailAuth.ts:108`),
and an isolated register-then-select probe finds the row at `t=0ms` — so I can state the shape of
the race with evidence and cannot state its mechanism, and I am not going to guess one.

**What this means for the R-12/R-13 lane.** The punchlist's recommendation for both rows is
*"(c) split out the pure half, then (a) wire the HTTP half"*. This finding **narrows (a) to a real
and small repair**: the fixture must **read the actor back** (or retry the insert) before it seeds,
which is one helper in each file and no change to any assertion. It also **raises (c)'s value**,
because a pure half cannot race at all. And it removes the reason to fear them: these are not two
rotted suites, they are two green suites behind one missing read-back. **They remain ONE lane**, as
R-13 already says.

## 7 · Proposed lane plan — ordered, sized

The order is chosen so that the cheapest closures land first and the expensive directory is closed
**as a class** at the end, which is the posture `2026-09-14-test-files-wired-orphans` established
(*"the 47 unit suites are closed as a class, not as instances"*). Every lane appends its own ledger
row.

| # | lane | closes | shape | size |
|---|---|---|---|---|
| ~~**T-1**~~ ✅ **LANDED 2026-09-15** (ledger `2026-09-15-orphans-t1-t3-green-directories`) | **The four single-purpose directories.** `server/utils/__tests__` (2), `server/seeds/__tests__` (1), `server/services/travelpayouts/__tests__` (1), `server/services/trend-engine/__tests__` (1). **Each directory contains ONLY these files**, so one glob closes each exactly. | **5** | one `npm ci` job, `npx tsx --test <dir>/*.test.ts*`, no database | **XS** — one workflow block |
| ~~**T-2**~~ ✅ **LANDED 2026-09-15 — 20 of 21** (ledger `2026-09-15-orphans-t1-t3-green-directories`) | **`server/services/__tests__` — all 21 green** (12 pure, 9 DB). Directory holds 28 test files, so the glob also picks up 7 already-wired ones; re-running a wired suite is the 2026-09-14 precedent and costs a minute. | **21** | ONE **DB-backed** whole-directory job (Postgres service + `ci-db-setup`), because the directory mixes pure and DB suites and a database costs less than a split | **S** |
| ~~**T-3**~~ ✅ **LANDED 2026-09-15** (ledger `2026-09-15-orphans-t1-t3-green-directories`) | **`server/routes/__tests__` (11) + `server/migrations/__tests__` (3)** — 13 green, 1 red (`booking-idor-guard`, `Expected 403 but got 503`, a fixture). Repair that one first; a whole-directory job cannot carry a red. | **14** | one DB-backed job per directory (or one job, two steps) | **S** |
| ~~**T-4**~~ ✅ **LANDED 2026-09-15** (ledger `2026-09-15-orphans-t4-t7-red-suites`) | **`mutation-auth/` (6) — all six wired and green, 154 tests, 0 skipped.** Two are already green. Two need `MUTATION_AUTH_AUDIT_OK=1` **and** a working fixture login. One (`admin-mutation-auth`) then runs 143 real probes and reports the three 401/403 rails in §5 #2. One is **DEAD** (`non-admin-payments-…` asserts `POST /api/expert/templates` is mounted; that consumer lane was retired by ledger `2026-09-03-expert-templates-consumer-sunset`). | **6** | one DB + app job with the audit flag, plus one deletion and one decision | **S/M** — the decision is the cost, not the wiring |
| ~~**T-5**~~ ✅ **LANDED 2026-09-15** (ledger `2026-09-15-orphans-t4-t7-red-suites`) | **R-12 / R-13** — §6. One read-back in each fixture, plus the punchlist's own recommendation to split the pure half out first. | **2** | one DB + app job | **S** |
| ~~**T-6**~~ ✅ **LANDED 2026-09-15** (ledger `2026-09-15-orphans-t4-t7-red-suites`) | **The two suites LD 41 (b) overtook** (`generated-itinerary-atomicity.db`, `regenerate-booking-guard.db`) — seed an empty slip, or drive the paid rail. The ruling is settled; only the fixtures are not. | **2** | repair + wire into an existing DB job | **S** |
| ~~**T-7**~~ ✅ **LANDED 2026-09-15 — DELETED** (ledger `2026-09-15-orphans-t4-t7-red-suites`) | **`text-sanitization.test.ts` — DELETE or rewrite.** It imports `EXPERT_LISTING_TEXT_FIELDS` from `server/utils/text-sanitizer`, which no longer exports it, and **this test is the only reference left in the tree**. A suite that cannot load is not a guard. | **1** | one decision, one file | **XS** |
| **T-8** | **The remaining `server/__tests__` reds** — 26 fixture rows and 6 assertion rows (§5). Mostly three repeated causes: a fixture login against `ci-*`/`kyoto-*@traveloure.test` credentials the suite assumes, a fixture row inserted before its owner exists (the §6 race, several more instances), and a listing/service fixture a fresh database does not carry. | **32** | 3-5 lanes grouped **by cause, not by file** — one shared fixture helper is worth more than thirty local patches (§18 rule 1) | **L** — the real work |
| **T-9** | **`server/__tests__` as a class.** Once T-5/T-6/T-7/T-8 are green, ONE DB + app whole-directory job closes all **157** by glob and makes the directory orphan-proof by construction, the way `unit-suite-shared` did. Do **not** do this before the reds are green: a whole-directory job cannot carry one. | **157** (of which 124 are already green today) | one job | **S once T-8 lands; impossible before** |
| **T-10** | **The 30 Playwright specs.** Out of this lane's scope by the brief and already classified per-spec by the 2026-09-14 lane, which RAN all 41. Its finding stands: *nothing they assert is gone; what has rotted is their EXPECTATIONS, and rewriting an expectation is a product decision.* | **30** | a product decision per spec, then wiring | **L, and gated on decisions rather than effort** |

**STRUCK 2026-09-15 — T-1, T-2 and T-3 have landed** (ledger
`2026-09-15-orphans-t1-t3-green-directories`, PR on `task-orphans-t1-t3-green-directories`).
39 of the 40 suites they name are wired; the inventory moved **279/512 → 318/512 reachable**
and the baseline **233 → 194**. Two corrections this report owes its readers, both found by
running what it proposed:

1. **`server/services/__tests__/content-matching.test.ts` is an HTTP suite, not a DB one.** It
   fetches `http://localhost:5000/api/content-match` on six of its nine tests; §3's bucket row
   credits this directory with 0 HTTP-GREEN, so it was counted in the 9 DB-GREEN. It is the ONE
   suite of T-2's 21 left orphaned, and it stays on the baseline until a job boots the app.
2. **A directory is not one runner, so "one glob closes it" is not always available.** Five
   files under these roots import from `vitest` — `server/services/__tests__/anchor-candidates`
   and `anchor-scoring`, and all three non-`chain-integrity` files in
   `server/migrations/__tests__` — and `tsx --test` dies inside `@vitest/runner` before a single
   assertion runs, while `vitest` cannot run a `node:test` file either. §2 recorded the 12
   vitest files as a HARNESS fact; it is also a WIRING fact, and T-9's whole-directory shape for
   `server/__tests__` must be planned around it.

**Three cross-cutting notes for whoever picks these up.**

1. **A whole-directory job is the right shape wherever a directory is all-green, and the wrong
   shape everywhere else** — one red file blocks the whole glob, which is precisely why T-9 is last
   and T-3 repairs its single red first.
2. **Wire the green 164 before repairing the red 39.** They are independent, the green ones cost
   nothing but a workflow block, and every day they stay unwired is a day their assertions are not
   protecting anything. That is why T-1..T-3 (40 suites) come before T-8.
3. **Three suites are GREEN-BUT-VACUOUS and must not be wired as-is**, because a job that runs them
   would report success while executing nothing: `deposit-cancel.db.test.ts` (5 tests, 5 skipped —
   needs a real Stripe test key), `admin-mutation-auth.test.ts` (1 executed, 124 skipped without
   `MUTATION_AUTH_AUDIT_OK=1`) and `admin-query-role-changes.test.ts` (skips itself without
   `DATABASE_URL`). Wiring a suite into a job that cannot execute it satisfies the inventory and
   protects nothing — the exact failure V-30 was.

## 8 · What this lane did NOT do

- **Nothing was wired, deleted, skipped, allowlisted or repaired**, and no test's assertions were
  changed. `git status` on the branch shows documentation only.
- **No R-row was filed.** Two candidates are named with file:line in §5 and neither met this lane's
  own bar: #1 is a live reproduction of the **already-open V-29** (so it needs evidence, not a new
  row) and #2 is a refusal-vocabulary divergence on three rails that still refuse. Filing either as
  a fresh verified defect would overstate what was measured.
- **One near-miss is recorded because avoiding it was the point.** `city-case-match.db.test.ts`
  failed with `mis-cased services count must equal canonical — 27 !== 30`, which reads exactly like
  a case-sensitivity leak in the city feed. It is not one: querying
  `/api/discover/location/Kyoto?country=Japan` and `/kyoto?country=Japan` directly returns **27 and
  27**. The suite's two feed reads are not atomic and the seeded Kyoto row set moves under them
  (4/4 green on two of five observations). Had it been filed on the failure line alone it would
  have been a fabricated defect.
- **`e2e/` is still outside the inventory** (`TEST_ROOTS` is `server`/`shared`/`client`/`playwright`),
  so the ten `e2e/specs/*.spec.ts` files are neither reachable nor orphans and are not in these 233.
  That limit was stated, not widened, by `2026-09-15-test-guard-prose-echo`, and this lane does not
  widen it either.

## 9 · Harness caveats, stated rather than buried

1. **A sibling worktree was running its own dev server during passes 1-2.** Every green that
   references a base URL was therefore **re-run in pass 4** against this lane's own server and
   database: **71 of 72 confirmed**, and the one that did not (`city-case-match`) is the flaky suite
   in §8. No green in this report rests on a pass-1/2 observation alone where an app was involved.
2. **`node_modules` is a bare symlink to the primary checkout's tree**, which
   `docs/OPERATING_PROCEDURE.md` §2 forbids for worktrees that run **Vite dev servers** (a shared
   `.vite` cache poisons siblings). This lane ran `vite build` and `node dist/index.cjs`, never a dev
   server, and `package.json`/`package-lock.json` are byte-identical between `HEAD` and
   `origin/main`. Recorded so nobody reads it as a licence.
3. **`--test-force-exit` and `--test-concurrency=1`** were used for every node:test run, matching the
   `ready-made-clone-fields` job's own invocation.
4. **The first vitest attempt was wrong and its results were discarded, not counted.** `--reporter=basic`
   is rejected by vitest 4.1.10 and vitest's configured root is `client/`, so all 12 vitest files
   "failed" for a harness reason. They were re-run as `npx vitest run --root . <file>` (the shape
   `package.json`'s own `test:vitest` uses) and 11 of 12 are green.
5. **Timings are not CI timings.** Everything ran on a 4-core sandbox, serially, sharing it with two
   other build lanes and a build. A 120-second bound was never hit — no suite is in the TIMEOUT
   bucket — but a slower runner could change that for the heaviest HTTP suites.

## 10 · Validation

| Check | Result |
|---|---|
| `node scripts/check-decision-guards.cjs` | `decision-guards lint OK (0 deferred warning(s))`, exit 0 |
| `grep -c replit.local package-lock.json` | **0** |
| `node scripts/check-test-files-wired.cjs` | `277/510 reachable; 233 orphan(s)` — unchanged by this lane (docs only) |
| files changed | `docs/lane-reports/2026-09-15-orphan-triage.md`, `docs/DECISIONS.md`, `docs/PUNCHLIST.md` |

**STRUCK 2026-09-15 — T-4, T-5, T-6 and T-7 have landed** (ledger
`2026-09-15-orphans-t4-t7-red-suites`). Ten suites wired, one deleted; the inventory moved
**318/512 → 328/511 reachable** and the baseline **194 → 183**. Five corrections this report owes
its readers, all found by running what it proposed:

3. **§5 #2's three 401/403 rails do not reproduce at this head, and no code was changed.** Both
   guards already implement the ruling the decision-maker gave — `adminApiGuard`
   (`server/routes.ts`, the §2 blanket mount) and `isEA` (`server/middleware/ea-rbac.ts`) each 401
   only on `!req.isAuthenticated()` and 403 off a DB role lookup. All three rails were probed
   directly as an authenticated ordinary user and answered 403; the suite is 143/143 on three
   consecutive runs plus a fourth on a database built from empty; an 8-round tight
   register→login→probe loop produced 0 of 48 401s. The three sit at inventory indices 9, 10 and 17
   of 143, which is consistent with this report's own fixture's session not being live yet for its
   first probes — but that is a shape and not a mechanism, and §13 says so rather than inventing
   one.
4. **§5's "two suites are DEAD" is one, not two.** `text-sanitization.test.ts` is dead and is
   deleted. `mutation-auth/non-admin-payments-…` names no retired rail anywhere in its source: it
   drives every probe off `generated/security/mutation-auth-manifest.json`, **a GENERATED inventory
   that nothing in CI checked and that had drifted** — carrying the four retired
   `/api/expert/templates*` rails and missing 43 live ones. Regenerating it made the suite green
   (220 real probes) and the freshness check is now a CI step. A derived file going stale is not
   the same fact as a suite being dead, and the difference decides whether real coverage is
   deleted.
5. **A hand-copied production list inside a security audit had silently shrunk that audit.**
   `expert-provider-mutation-auth.test.ts` restated `server/routes.ts`'s three
   `*_SELF_SERVICE_PREFIXES` arrays; the copy still carried `/api/expert/templates` and had never
   gained `/api/expert/neighborhood-claims`, so three live high-risk rails were outside the probe
   set while the suite reported green. It now reads the arrays out of the source by name and throws
   if one is renamed. The probe set went from a stale subset to 41 rails, all 403. This is the
   §18 rule 1 class, and it is worth naming here because the same shape will be waiting in T-8.
6. **Two of the RED-FIXTURE suites were also about to pass for the wrong reason.**
   `generated-itinerary-atomicity` and `regenerate-booking-guard` both hold `assert.rejects` proofs
   with no predicate, so once their slips were emptied those proofs would have been satisfied by
   LD 41 (b)'s own refusal rather than by the failure they were written to prove. Emptying the slip
   was only half the repair; identifying every rejection was the other half. Any later lane that
   "fixes" a suite by removing whatever was making it throw should assume this trap is present.
7. **A per-test fixture trip beats a shared one now that slip emptiness is a precondition.** Under
   LD 41 (b) a suite whose tests share one trip is a suite whose tests depend on each other's
   leftovers: a commit in test 3 silently disqualifies test 4. T-8 will meet this repeatedly.
