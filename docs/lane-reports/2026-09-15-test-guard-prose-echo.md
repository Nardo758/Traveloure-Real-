# Lane report — V-30 / V-31: the test-reachability guard reads only real invocations

**Branch** `task-test-guard-prose-echo` · **base** `origin/main` @ `edbf97742` · **date** 2026-09-15
**Rows** PUNCHLIST §2 **V-30** (closed), **V-31** (closed as a *classification* row); §3 **R-12**,
**R-13** left OPEN and confirmed as members of the true orphan list.
**Ledger** `2026-09-15-test-guard-prose-echo` (new row) plus dated CORRECTION sentences appended
to `2026-09-14-test-files-wired-orphans` and `2026-09-13-test-files-wired`.
**Files touched** `scripts/check-test-files-wired.cjs`, `docs/DECISIONS.md`, `docs/PUNCHLIST.md`,
this report. **No workflow file changed** — the guard's own job already runs `--self-test` before
the scan, which is exactly the §18d order this lane needed, so nothing in `.github/workflows/` was
edited. **No TypeScript touched.**

---

## 1 · The defect (V-30), mechanism first

`.github/workflows/publish-gate-and-fundamentals-gate.yml:272` is a failure-summary line:

```
echo "❌ **One or more suites failed.** Download this run's logs (the per-suite steps above) for the
failing assertion; each suite's own header comment documents \`Run solo: npx tsx --test
server/__tests__/<file>\` against a local dev server for reproduction." >> "$GITHUB_STEP_SUMMARY"
```

It is PROSE. It runs no test. The guard read it as an invocation through four steps, each
individually reasonable:

1. `extractRunCommands` collects the whole `run:` block scalar as one string.
2. `commandSegments` split that string on `\n`, `&&` and `;` **without respecting quotes** — so the
   `;` inside the sentence (`…for the failing assertion; each suite's own header…`) cut the echo in
   half and produced a segment that no longer began with `echo`.
3. `shellWords` whitespace-split that fragment, giving the tokens
   `… documents \`Run solo: npx tsx --test server/__tests__/<file>\` against a local dev server for
   reproduction."`.
4. `parseRunner` searched the token list for the word `tsx` **anywhere**, found it, confirmed
   `--test` was present, and handed every subsequent non-flag word to `runnerSelectors` as a
   selector. Among those words is the bare noun **`server`** (from "a local dev **server**"), and
   `selectorMatches` treats a non-glob selector as a directory prefix
   (`file.startsWith(clean + "/")`).

So one English sentence made **every test file under `server/`** report as reachable. The guard
exits 0 by design (advisory), so nothing ever went red — which is why it stood from 2026-09-07
(`2457c7404`) through two ledger rows that quoted its numbers as fact.

**V-31** is the same finding read from the other end: the four Playwright suites R-10 named
(`seam-cross-console`, `phase-3-traveler-flows`, `phase-4-7-advanced-flows`, `stripe-init-deferral`)
were described as "also ORPHANS … which is why nobody saw them pass wrongly". Those four live under
`playwright/`, not `server/`, so they were *already* on the 30-orphan list — the echo never hid
them. This lane therefore closes V-31's **reachability** clause by publishing the true list that
contains them, and leaves V-31's substantive defect — `loginAs` asserting nothing — **untouched and
still open as a separate fix** (see §7).

## 2 · The repair

Four rules, all in `scripts/check-test-files-wired.cjs`, no behaviour added beyond honesty:

1. **A `run:` block is read line by line.** `scriptLines()` joins shell continuations (`\` +
   newline), then drops **heredoc bodies** (`<<EOF` … `EOF`, quoted or not — `ci-db-setup-lint.yml`
   writes two synthetic workflows this way) and **`#` comment lines**.
2. **Each line is split at top-level operators with quotes respected.** `splitSegments()` walks the
   line tracking `'` / `"` state and splits at `&&`, `||`, `;`, `|`, `<`, `>`, `>>`, `(`, `)`. The
   `;` inside a quoted sentence no longer cuts anything, and a redirect target
   (`> /tmp/out.log 2>&1`) can no longer be read as a selector.
3. **A selector is read only from a segment whose LEADING command is a runner.** `commandHead()`
   skips leading `NAME=value` assignments (`TZ="$tz" npx tsx …` is real and must keep working) and
   wrapper commands (`npx`, `pnpm`, `yarn`, `bun`, `bunx`, `exec`, `env`, `time`, `sudo`,
   `xvfb-run`, `cross-env`, `dotenv`, `command`, `--`), and returns the first real command name.
   `parseRunner` now requires **that** name to be the runner instead of searching the token list.
   The same rule is applied to the `npm run <script>` recursion, so `echo "run npm test"` no longer
   pulls a package script in. A runner named inside an `echo`, a `printf`, a `::error::`
   annotation, a comment or a heredoc yields **no selectors at all**.
4. **A bare directory-prefix selector must name a directory that exists.** `selectorMatches` takes
   an injected `dirExists`; an exact file match and a glob are unaffected, but `against`, `local`,
   `dev` and `reproduction."` can no longer act as prefixes. This is stated in the script as a
   **second** filter and explicitly *not* the fix: `server` **is** a real directory, so rule 3 is
   what removes it.

Two incidental correctness fixes, both measured net-zero on the count and both recorded rather than
slipped in silently:

- `--root`, `--loader`, `--import`, `--require`, `-r` joined the value-taking option list.
  `package.json`'s `test:vitest` is `vitest run --root . server/__tests__/…`; had any workflow ever
  called it, the bare `.` would have matched **every** file in the tree (`selectorMatches` returns
  `true` for `.`) — the identical failure shape as V-30, latent. No workflow calls it, so the count
  is unchanged; the trap is now closed.
- `node --test <file>` joined the recognised runners (the header already listed `node --test` in
  prose in three workflow comments; nothing invokes it, so the count is unchanged).

**The exit posture is UNCHANGED and was not this lane's to change.** The normal scan still prints
every orphan and exits 0; `--self-test` is still the only gate that can fail. Making the inventory
blocking would fail `main` on 233 rows the moment it landed, which is a decision about what the
repository promises, not a parser repair.

## 3 · Before / after

```
before (origin/main @ edbf97742):  test-files-wired: 477/507 reachable; 30 orphan(s)
after  (this branch):              test-files-wired: 274/507 reachable; 233 orphan(s)
```

Exactly the figures the 2026-09-15 section-3 re-sweep predicted by deleting the single echo line
(`docs/lane-reports/2026-09-15-section3-resweep.md`, lines 74-76). **203 suites** were reachable
through nothing but that sentence.

**After merging `origin/main` (PR #935, head `cc855f9f`)** the tree carries one more test file —
`client/src/lib/__tests__/reconciliation-kind-labels.test.ts`, which the `unit-suite-client-lib`
directory glob reaches by construction — so the guard reads **275/508 reachable; 233 orphan(s)**.
The **orphan count is unchanged at 233**; the denominator and numerator each moved by one because
main added a wired suite. The 233-row list below is unchanged by that merge.

Two directional checks were run rather than assumed:

- **Nothing was lost.** Every one of the 30 previously-reported orphans is still an orphan
  (`comm -23 before after` is empty), so the repair did not "resolve" anything by accident.
- **Nothing genuinely wired became an orphan.** Of the 203 newly-revealed files, only eight are
  named anywhere in `.github/workflows/` or `package.json` at all, and every one of the eight is
  correctly an orphan: `booking-completion-machinery.db.test.ts` is named only in a
  `scheduler-jobs-gate.yml` **comment** explaining why it is excluded (it needs a running server),
  and the other seven are named only by `package.json` scripts (`test:vitest`,
  `test:xss-regression`, `test:user-suspension`, `test:instagram-frame`) that **no workflow calls**.
  A script nobody runs is not reachability. Spot checks in the other direction confirm the
  per-file jobs still resolve (`well-known-static`, `booking-birth-provenance.db`, `roles-needed`,
  `earner-address`, `reconciliation-detection.db`, `chain-integrity`), as do the three
  directory-glob `unit-suite-*` jobs and the eleven specs in `unwired-spec-gate.yml`.

## 4 · Fixtures (§18d — a predicate change ships with fixtures)

`node scripts/check-test-files-wired.cjs --self-test` now runs **seven** committed fixtures against
a synthetic four-file tree (up from one). They run in CI immediately before the scan, exactly as
today (`build.yml:35` then `:37`; the workflow is unchanged).

| # | Fixture | Asserts |
|---|---|---|
| 1 | direct file + directory reachability, unreferenced orphan | the two original cases, unchanged |
| 2 | **prose echo naming a runner yields no selectors** | the V-30 line itself, `;` and all: zero reachable, all four orphans |
| 3 | **real invocation + trailing `&& echo "…tsx --test server…"`** | only the real selector survives |
| 4 | annotation and comment lines yield no selectors | `::error::` and a `#` line in a block scalar |
| 5 | heredoc body yields no selectors | `cat > x <<'YAML'` … `run: npx tsx --test …` … `YAML` |
| 6 | non-existent directory prefix matches nothing | rule 4 |
| 7 | redirect target is not a selector | `> /tmp/out.log 2>&1 \| tail -5` |

## 5 · Negative space (§18d), as now written in the script header

The `CANNOT DETECT` block gained three entries, two of them the ones V-30/R-11 named:

- **Prose that names a runner was a blind spot until 2026-09-15**, with the mechanism, the false
  numbers and the true ones, and — the part that matters going forward — **what the parser now
  ASSUMES**: a selector appears only in a real invocation, at the head of its own command segment,
  on a line that is not an echo/printf/annotation/comment/heredoc body. A runner reached through a
  construct this tokenizer does not model (an `eval`, a `$(…)` substitution, a one-line `for … do`
  body) is now **missed** rather than invented — the failure mode moved from false-positive to
  false-negative, which is the safe direction for an inventory whose job is to find gaps.
- **The directory-existence filter does not remove a real root name** such as `server`; it is a
  second filter, not the fix.
- **`TEST_ROOTS` excludes `e2e/`.** Stated, not widened — see §6.

## 6 · `e2e/` — the limit is STATED, the roots are NOT widened

`TEST_ROOTS` is `server`, `shared`, `client`, `playwright`. The ten `e2e/specs/*.spec.ts` files are
counted neither as reachable nor as orphans; they are invisible to the inventory, which is how
ledger `2026-09-14-test-files-wired-orphans` could report "neither name appears in any workflow"
for `journey-1` while the file has a real (schedule-only, staging-secret-gated) reach through
`playwright.e2e.config.ts`'s `testDir` via `npm run test:e2e:staging`.

Adding the root would move **both** the numerator and the denominator, and would change what the
inventory *measures* — whether a schedule-only, secret-gated staging run counts as "reached by CI"
is a question about the repository's promise, not a parser question. The lane brief's instruction
and §18d agree: state the limit. It is now the third bullet of the script's own `CANNOT DETECT`
block, with the reason and the consequence written down.

## 7 · What this lane deliberately did NOT do

- **No suite was wired, deleted, allowlisted, skipped or repaired.** Ledger
  `2026-09-14-test-files-wired-orphans` rules that a suite leaves the orphan list by being run or by
  being gone, never by being named an exception; re-classifying 203 suites is the follow-up lane
  this list exists to size.
- **V-31's substantive half is untouched.** `playwright/utils/auth.ts`'s `loginAs` still asserts
  nothing about the session, and the second helper of the same name with a different contract still
  exists at `playwright/tests/personas/journey-traveler.spec.ts:47`. This lane closes only the
  reachability clause V-31 inherited from V-30.
- **No gate was silenced and none turns red.** The inventory is consumed by exactly one job —
  `test-file-reachability (advisory inventory)` in `build.yml`, which exits 0 — and is referenced
  only in comments by `unwired-spec-gate.yml` and two `build.yml` comments. The `unit-suite-*` jobs
  RUN tests; they do not read the inventory's count. Nothing in CI asserts a reachable/orphan
  number, so the corrected figure turns nothing red.

## 7b · ONE DEVIATION FROM THE LANE BRIEF, stated rather than quietly taken

The brief said "Strike V-30 and V-31 CLOSED in `docs/PUNCHLIST.md`". **V-30 is struck CLOSED. V-31 is
NOT, and stays open with a dated amendment.**

V-31's row is the `loginAs` silent-pass defect: the helper fills `/login`, clicks submit, waits for the
URL to stop containing `/login`, and never checks a cookie or `GET /api/auth/user`, so 29 `loginAs`
calls across four suites exercise the anonymous site while reading as authorization coverage. **This
lane did not touch `playwright/utils/auth.ts`.** Its reachability clause is the only part the repair
reaches — and the repair CONFIRMED that clause rather than changing it: all four suites live under
`playwright/`, not `server/`, so the poisoned `server` selector never hid them. They were already on
the 30-orphan list and they are on the true 233-row list unchanged (verified by diffing the two lists).

Striking the row closed would record a fix nobody made, which is the §13 falsehood this repository's
whole posture exists to refuse — and it would do it on a row whose entire subject is a check that
cannot fail. The row is amended in place instead, naming exactly what was settled and what was not.

## 8 · Proposed CLAUDE.md sentence (NOT applied by this lane)

For §18d, after the `phase2-fee-gate.sh` sentence:

> **A GUARD THAT PARSES COMMANDS MUST READ ONLY COMMANDS.** `check-test-files-wired.cjs` searched a
> workflow's `run:` text for a runner NAME rather than for a runner INVOCATION, so a failure-summary
> `echo` whose prose contained "npx tsx --test server/__tests__/<file>" donated the bare noun
> `server` as a directory selector and reported 203 unrun suites as reachable for eight days,
> greenly, across two ledger rows that quoted its numbers. The predicate now takes selectors only
> from a segment whose LEADING command is the runner, with quotes, heredocs, comments and
> annotations excluded, and both the old blind spot and the new assumption are written into the
> script's own `CANNOT DETECT` block. **A predicate that can be satisfied by documentation ABOUT the
> thing it measures is not measuring the thing** — and an advisory guard is exactly where such a
> defect survives longest, because nothing ever goes red.

## 9 · Validation

```
$ node scripts/check-test-files-wired.cjs --self-test
self-test OK — direct file + directory reachability, unreferenced orphan
self-test OK — prose echo naming a runner yields no selectors
self-test OK — real invocation plus trailing prose echo yields only the real selector
self-test OK — annotation and comment lines yield no selectors
self-test OK — heredoc body yields no selectors
self-test OK — non-existent directory prefix matches nothing
self-test OK — redirect target is not a selector
self-test OK (7/7 fixtures)
```

```
$ node scripts/check-test-files-wired.cjs   # first line only; the 233 ORPHAN lines follow
test-files-wired: 274/507 reachable; 233 orphan(s)
```


| Check | Result |
|---|---|
| `node scripts/check-test-files-wired.cjs --self-test` | **7/7 fixtures OK** (output above) |
| `node scripts/check-test-files-wired.cjs` | `274/507 reachable; 233 orphan(s)`, exit 0 |
| `node scripts/check-decision-guards.cjs` | `decision-guards lint OK (0 deferred warning(s))` |
| `bash scripts/phase2-fee-gate.sh` | `✅ Phase 2 fee-literal gate PASSED`, exit 0 |
| `npx tsc --noEmit -p tsconfig.json \| grep -c "error TS"` | **129** = `TSC_BASELINE` (unchanged — no TypeScript touched) |
| `npm run build` | exit 0 (`dist/index.cjs`, build-info written) |
| `grep -c replit.local package-lock.json` | **0** |

## 10 · The true orphan list — 233 suites, grouped by directory

Confirmed present, as the brief required: **R-12** `server/__tests__/availability-model.db.test.ts` and **R-13** `server/__tests__/s11-stay-booking.db.test.ts`. Both stay OPEN in §3.

#### `server/__tests__/` — 157 orphan(s) (157 newly revealed by this repair)

- `admin-query-role-changes.test.ts` ★
- `affiliate-booking-trip-link.contract.test.ts` ★
- `affiliate-reconciliation-matching.test.ts` ★
- `affiliate-reconciliation-token-adoption.test.ts` ★
- `affiliate-reconciliation-travelpayouts.test.ts` ★
- `ai-error-sanitizer.test.ts` ★
- `ai-rate-limit-coverage.test.ts` ★
- `audit-log-atomicity.unit.test.ts` ★
- `availability-model.db.test.ts` ★
- `balance-payer-atomicity.db.test.ts` ★
- `balance-payer.test.ts` ★
- `benchmark-facts-denorm.db.test.ts` ★
- `booking-completion-machinery.db.test.ts` ★
- `booking-confirm-payment-idempotency.test.ts` ★
- `booking-decline-reason.test.ts` ★
- `booking-eligibility-gates.db.test.ts` ★
- `booking-fee-bootstrap-and-split-fallback.db.test.ts` ★
- `bundle-component-linking.db.test.ts` ★
- `calendar-date-client.test.ts` ★
- `cart-trip-handoff.db.test.ts` ★
- `city-case-match.db.test.ts` ★
- `concierge-admin-signal.test.ts` ★
- `concierge-suggest-add.test.ts` ★
- `config-completeness.test.ts` ★
- `console-sigma-kyoto-bench.http.test.ts` ★
- `console-sigma-lead-confirm-notify.http.test.ts` ★
- `console-sigma-reorder-divergence.db.test.ts` ★
- `console-sigma-workspace-machine.http.test.ts` ★
- `contract-stats.test.ts` ★
- `coordination-credit.test.ts` ★
- `coordination-fee-refund-guard.test.ts` ★
- `coordination-ledger-gap-review.test.ts` ★
- `coordination-refund-credit-release.test.ts` ★
- `cors-allowlist.test.ts` ★
- `db-role-authorization.test.ts` ★
- `deliverable-protected-rail.http.test.ts` ★
- `demand-onepager-approval.test.ts` ★
- `demand-onepager-render.test.ts` ★
- `demand-onepager.test.ts` ★
- `demand-rollup.test.ts` ★
- `demand-test-exclusion.test.ts` ★
- `deposit-cancel.db.test.ts` ★
- `deposit-captured-resolution.test.ts` ★
- `deposit-checkout.db.test.ts` ★
- `egress-guard.test.ts` ★
- `email-outbox.test.ts` ★
- `event-coordination.test.ts` ★
- `expert-application-content-gate.test.ts` ★
- `expert-application-xss-sanitize.http.test.ts` ★
- `expert-attribution-and-accept-diary.db.test.ts` ★
- `expert-booking-request-guard.test.ts` ★
- `expert-booking-request-rate.db.test.ts` ★
- `expert-form-verification-strip.test.ts` ★
- `expert-note-separation.db.test.ts` ★
- `expert-profile-xss-regression.http.test.ts` ★
- `expert-profile-xss.http.test.ts` ★
- `fp1-console-defects.db.test.ts` ★
- `fp3-property-room-edit.db.test.ts` ★
- `fp5-console-agreement.db.test.ts` ★
- `fp5-payout-threshold.test.ts` ★
- `gem-promotion.db.test.ts` ★
- `generated-itinerary-atomicity.db.test.ts` ★
- `generated-itinerary-normalization.test.ts` ★
- `guest-invite-mailer.test.ts` ★
- `guest-invite-send.db.test.ts` ★
- `hire-advisor-guards.test.ts` ★
- `ics-calendar.test.ts` ★
- `image-data-url-validation.test.ts` ★
- `item-event-link.db.test.ts` ★
- `item-removed-diary.db.test.ts` ★
- `itinerary-item-rail-unification.db.test.ts` ★
- `journey-suite-negatives.http.test.ts` ★
- `landing-moment-persistence.db.test.ts` ★
- `landing-moments-prompt.test.ts` ★
- `landing-moments.db.test.ts` ★
- `market-insights.db.test.ts` ★
- `mid-trip-purchase-versions.db.test.ts` ★
- `neighborhood-claims-copy.test.ts` ★
- `neighborhood-claims.db.test.ts` ★
- `occasion-drafts.db.test.ts` ★
- `offering-type-clamp.test.ts` ★
- `optimization-confirm-ownership.test.ts` ★
- `optimization-fee-determinism.db.test.ts` ★
- `optimizer-activity-geocoder.test.ts` ★
- `optimizer-gap-ledger.db.test.ts` ★
- `optimizer-segmentation-bridge.test.ts` ★
- `optimizer-variant-reconciliation.test.ts` ★
- `parse-activity-time.test.ts` ★
- `pay-balance-idempotency.test.ts` ★
- `pending-events-drain.db.test.ts` ★
- `privileged-field-completeness-strip.test.ts` ★
- `provider-approval-email.test.ts` ★
- `provider-money-hardening.db.test.ts` ★
- `provider-office-location.db.test.ts` ★
- `provider-rejection-email.test.ts` ★
- `qa2-notification-slot-durability.db.test.ts` ★
- `ready-made-author-filter.http.test.ts` ★
- `refund-retry-convergence.test.ts` ★
- `regenerate-booking-guard.db.test.ts` ★
- `registration-flag-gate.test.ts` ★
- `review-moderation-atomicity.db.test.ts` ★
- `role-audit-atomicity.db.test.ts` ★
- `role-transition.test.ts` ★
- `runtime-health-secrets.test.ts` ★
- `s11-stay-booking.db.test.ts` ★
- `s8-property-builder.db.test.ts` ★
- `service-attestations.http.test.ts` ★
- `service-booking-counters.db.test.ts` ★
- `service-content-translation.http.test.ts` ★
- `service-delete-archive.db.test.ts` ★
- `service-delete-guard.db.test.ts` ★
- `service-detail-traveler-representation.http.test.ts` ★
- `service-display-options.http.test.ts` ★
- `service-duplicate-and-tourism-fix.db.test.ts` ★
- `service-logistics-capture.http.test.ts` ★
- `service-logistics-never-clobber.http.test.ts` ★
- `session-async-fields.http.test.ts` ★
- `share-link-price-redaction.http.test.ts` ★
- `share-money-redaction.test.ts` ★
- `shared-cache-flush-expired.db.test.ts` ★
- `slip-add-to-trip-targeting.db.test.ts` ★
- `slip-grounding-matcher.test.ts` ★
- `slip-stay-projection.db.test.ts` ★
- `stay-release-all-nights.db.test.ts` ★
- `storefront-gems-shared.db.test.ts` ★
- `storefront-role-agnostic.http.test.ts` ★
- `stripe-connect-reminder.test.ts` ★
- `stripe-key-policy.test.ts` ★
- `stripe-key-resolver.unit.test.ts` ★
- `test-seed-endpoint-gate.test.ts` ★
- `text-sanitization.test.ts` ★
- `tier2-security-audit.http.test.ts` ★
- `trailhead-t3-affiliate-matcher.test.ts` ★
- `trailhead-t3-pass-runner.test.ts` ★
- `trailhead-t3-provider-matcher.test.ts` ★
- `trailhead-t4-publish-gate.test.ts` ★
- `travel-surcharge.db.test.ts` ★
- `travelpayouts-statistics.test.ts` ★
- `travelpulse-calendar-ingest.test.ts` ★
- `trip-advisor-row.test.ts` ★
- `trip-card-snapshot-render.db.test.ts` ★
- `trip-commission-band-edit.http.test.ts` ★
- `trip-destinations.service.test.ts` ★
- `trip-entitlement-source.db.test.ts` ★
- `trip-entitlement.db.test.ts` ★
- `trip-finalize.db.test.ts` ★
- `trip-pass-suppression.db.test.ts` ★
- `trip-pdf-render.test.ts` ★
- `trip-segmentation.test.ts` ★
- `trips-list-final-version.db.test.ts` ★
- `two-surfaces-lifecycle.db.test.ts` ★
- `unified-search.db.test.ts` ★
- `upsell-click-payload.db.test.ts` ★
- `user-suspension.db.test.ts` ★
- `vendor-creator-filter.test.ts` ★
- `websocket-auth.db.test.ts` ★
- `wegotrip-catalog.test.ts` ★

#### `playwright/tests/` — 25 orphan(s) (0 newly revealed by this repair)

- `breakpoint-hamburger.spec.ts`
- `content-system.spec.ts`
- `deprecated-route-redirects.spec.ts`
- `discover-bento-real-data.spec.ts`
- `expert-application-mobile.spec.ts`
- `experts-flow.spec.ts`
- `finalize-booking-modal.spec.ts`
- `lane1-phase1d-routing.spec.ts`
- `lb-p1-password-reset.spec.ts`
- `offering-card.spec.ts`
- `optimization-payment-gate.spec.ts`
- `optimize-apply-banner.spec.ts`
- `optimized-slip-live.spec.ts`
- `phase-1-expert-setup.spec.ts`
- `phase-2-provider-setup.spec.ts`
- `phase-3-traveler-flows.spec.ts`
- `phase-4-7-advanced-flows.spec.ts`
- `seam-cross-console.spec.ts`
- `search-bar.spec.ts`
- `security-regression.spec.ts`
- `slip-parity-fixture.spec.ts`
- `stripe-init-deferral.spec.ts`
- `travel-surcharge-step.spec.ts`
- `tripstrip-count-accuracy.spec.ts`
- `user-menu.spec.ts`

#### `server/services/__tests__/` — 21 orphan(s) (21 newly revealed by this repair)

- `activity-schedule.test.ts` ★
- `anchor-candidates.test.ts` ★
- `anchor-scoring.test.ts` ★
- `background-job-runner.test.ts` ★
- `booking-verification.db.test.ts` ★
- `booking-verification.test.ts` ★
- `cancellation-policy.test.ts` ★
- `commission-phase1.test.ts` ★
- `content-matching.test.ts` ★
- `experience-cart-band.db.test.ts` ★
- `expert-split-band.db.test.ts` ★
- `expertise-scoring.test.ts` ★
- `landing-hero.test.ts` ★
- `location-view-neighbourhood-match.test.ts` ★
- `occasion-schedule.test.ts` ★
- `provider-health.test.ts` ★
- `trailhead-crosswalk.test.ts` ★
- `trailhead-derived-targets.test.ts` ★
- `transport-leg-calculator.test.ts` ★
- `traveler-profile.service.test.ts` ★
- `upsell-query-any-array.test.ts` ★

#### `server/routes/__tests__/` — 11 orphan(s) (11 newly revealed by this repair)

- `advisor-commission-read-gate.test.ts` ★
- `booking-idor-guard.test.ts` ★
- `instagram-frame-passthrough.http.test.ts` ★
- `instagram-frame-selection.test.ts` ★
- `instagram-publish.test.ts` ★
- `instagram-status.test.ts` ★
- `itinerary-comparison-create-pin.test.ts` ★
- `notification-email.test.ts` ★
- `trip-anchor-candidates.test.ts` ★
- `vendors-create-auth.test.ts` ★
- `vendors-export.test.ts` ★

#### `server/__tests__/mutation-auth/` — 6 orphan(s) (6 newly revealed by this repair)

- `admin-mutation-auth.test.ts` ★
- `expert-provider-mutation-auth.test.ts` ★
- `mutation-auth.http.test.ts` ★
- `mutation-auth.inventory.test.ts` ★
- `non-admin-payments-user-data-mutation-auth.http.test.ts` ★
- `payment-mutation-auth.manifest.test.ts` ★

#### `playwright/tier4/` — 4 orphan(s) (0 newly revealed by this repair)

- `a11y.spec.ts`
- `booking.spec.ts`
- `deep-ui-loop.spec.ts`
- `keyboard.spec.ts`

#### `server/migrations/__tests__/` — 3 orphan(s) (3 newly revealed by this repair)

- `1577-cart-booking-revenue-dedup.test.ts` ★
- `244-platform-revenue-payment-intent-dedup.test.ts` ★
- `ready-made-purchase-revenue-dedup.test.ts` ★

#### `server/utils/__tests__/` — 2 orphan(s) (2 newly revealed by this repair)

- `data-sanitizer.test.ts` ★
- `text-sanitizer.test.ts` ★

#### `playwright/crossbrowser/` — 1 orphan(s) (0 newly revealed by this repair)

- `smoke.spec.ts`

#### `server/seeds/__tests__/` — 1 orphan(s) (1 newly revealed by this repair)

- `dmo-anchor-registry-sync.test.ts` ★

#### `server/services/travelpayouts/__tests__/` — 1 orphan(s) (1 newly revealed by this repair)

- `travelpayouts-cache-status.test.ts` ★

#### `server/services/trend-engine/__tests__/` — 1 orphan(s) (1 newly revealed by this repair)

- `market-slug-resolver.test.ts` ★

★ = hidden by the poisoned predicate until today; unmarked rows were already on the 2026-09-14 list of 30.
