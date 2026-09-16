# Dispatch — closing the last 33 orphaned test suites (issue "#1771 — Make every committed test suite run in CI")

**as-of `ba9f5e3` (`origin/main`, 2026-09-16).** Volatile claims below (counts, which job boots what, which spec fails on what) are as of that SHA — re-verify at Phase 0.
**Status:** dispatch for the Replit build agent. One lane per branch, Phase 0 read-only with a **HARD STOP** before any write. No direct-to-main. Read `docs/OPERATING_PROCEDURE.md` §3–§4 first; this document does not restate it.

---

## 0. The premise of the issue is stale — read this before doing anything

The issue says 88 orphans. That number is from 2026-09-13 and was computed by a predicate that has since been repaired (ledger `2026-09-15-test-guard-prose-echo`). On `main` today:

```
$ node scripts/check-test-files-wired.cjs
test-files-wired: 489/522 reachable; 33 orphan(s)
test-orphan-ratchet: OK — baseline: 33 recorded orphan(s) (debt, not exempt)
```

Nine lanes (T-1 … T-9, ledger rows dated 2026-09-15) already took the debt from **233 → 33**. **Do not redo any of that work.** The remaining 33 are the hard tail the triage report left as T-10 plus three server suites it could not run. Every one of them is listed in `scripts/test-orphan-baseline.txt`, and that file is a **ratchet, not an allowlist**: the checker exits 1 if an orphan appears that is not in it, AND if a baseline line names a file that is now reachable or deleted. So **every wiring or deletion must remove its baseline line in the same PR**, or the ratchet goes red.

Two rulings bind this lane and are not negotiable:

- **A suite leaves the orphan list by being RUN, or by being GONE — never by being named an exception** (ledger `2026-09-14-test-files-wired-orphans`). The issue's phrase "record any genuinely unsupported invocation shape in the checker contract" applies only to a runner invocation the checker's tokenizer cannot model (`eval`, `$(…)`, a reusable workflow). **None of the 33 is that case.** The checker already understands `playwright test -c <config>`; these files are orphans because no workflow runs them, not because the checker cannot see how they would be run.
- **A rotted EXPECTATION is a product decision, not a wiring chore** (same ledger row, and T-10 in `docs/lane-reports/2026-09-15-orphan-triage.md`). Rewriting an assertion to match whatever the code does today produces a test that pins the current behaviour whether or not it is right. Where a spec's expectation disagrees with the code, the agent produces a decision row (§3) and STOPS on that file.

---

## 1. Hard rules (from CLAUDE.md, `docs/OPERATING_PROCEDURE.md`, and the ledger)

1. **Branch** `task-orphans-last-33` (or one branch per §2 bucket if split) off `origin/main`. Never `main`. Merge `origin/main` in with a merge commit; take `TSC_BASELINE` from main's `build.yml`, never restate it.
2. **Zero skipped is part of green.** A job whose suite reports `skipped N` is a vacuous green (triage note 3). Never wire a suite that skips itself under CI's environment. Never add `test.skip`, `--test-name-pattern`, `test.fixme`, or any flag that narrows a run to get green.
3. **Never delete a test case to get green.** A file or case is deleted ONLY when the behaviour it asserts no longer exists on `main` (the T-7 precedent: `text-sanitization` imported a symbol nothing exported). The ledger row must cite the evidence (the ruling that retired the behaviour, or the `grep` proving the symbol is gone).
4. **A pin that broke because code MOVED is repaired to assert the invariant** (§18d posture; the `tripstrip-count-accuracy` A/B repair is the model). A pin that broke because the PRODUCT changed is a §3 decision row.
5. **Run every suite locally first**, against a Postgres built from empty by `ci-db-setup`'s three steps (`migrate-entry.ts`, `create-sessions-table`, `seed-ci-test-users`), with the same env the target job gives it. Record the run output in the lane report. Playwright: `--workers=1 --timeout=120000` (the 120s is the Vite module waterfall, not a flake allowance).
6. **A newly wired Playwright spec needs a `spec-green:` line in the PR body** pointing at a genuinely green run of the final spec code (`spec-arming-gate.yml` enforces it). Prefer adding to `unwired-spec-gate.yml` (sibling of `spec-coverage-gate.yml`, serial, with the spec-exists anti-vacuity assertion) over inventing a new gate.
7. **No new CI tier.** New jobs mirror an existing shape (`unwired-spec-gate.yml` for specs; `suite-server-tests.yml` / `suite-mutation-auth.yml` for app-booting server suites; the `ci-db-setup` composite action for DB — `ci-db-setup-lint` forbids inline migration steps). Nothing is added to `.github/branch-protection.json` or CI_GATES tables unless an existing per-suite job already is.
8. **Do not touch production source** to make a test pass. A real defect a suite surfaces is FILED (lane report + punchlist), not fixed here. The one exception is a test FIXTURE (the `booking-idor-guard` precedent).
9. **`e2e/` stays out of `TEST_ROOTS`** (ruled, `2026-09-15-orphan-ratchet` clause 1). Do not widen the roots, and do not bend any `playwright*.config.ts` `testDir` to reach `tier4/` or `crossbrowser/`.
10. **Never run `playwright install`.** Chromium is pre-installed at `/opt/pw-browsers`.
11. **Guards before push:** `node scripts/check-test-files-wired.cjs --self-test` then the scan (must print `test-orphan-ratchet: OK`); `node scripts/check-decision-guards.cjs`; `npx tsc --noEmit` ≤ `TSC_BASELINE`; `npm run build`; `grep -c replit.local package-lock.json` = 0.
12. **One ledger row** in `docs/DECISIONS.md`, keyed `2026-MM-DD-<kebab-slug>`, plus a lane report under `docs/lane-reports/`. CLAUDE.md is NOT edited (no ruling is executed or amended by this lane). Commit trailers and PR footer exactly as `OPERATING_PROCEDURE.md` §3 states; no model identifier in any repo artifact.

---

## 2. The 33, bucketed, with the disposition each one gets

Buckets and blockers come from the `2026-09-14-test-files-wired-orphans` ledger row (which RAN all 41 specs) and the T-8/T-9 lane report. Re-verify each blocker at Phase 0 — a sibling lane may have moved a surface since.

### A. Three server suites (3)

| file | blocker (as recorded) | disposition |
|---|---|---|
| `server/services/__tests__/content-matching.test.ts` | six of nine tests `fetch` `http://localhost:5000/api/content-match`; no DB-only job boots the app | **Wire** into an app-booting job. `suite-server-tests.yml` already builds and runs `node dist/index.cjs` on `PORT: 5000` with `NODE_ENV=production`. Run it there locally first; if it needs content rows a fresh DB lacks, that is a fixture (see B1's shared seed), not a skip. |
| `server/__tests__/deposit-cancel.db.test.ts` | 5 tests, **all 5 skip** without a real `sk_test_` Stripe key; CI carries only `sk_test_ci_stub_no_real_calls` | **Decision required (§4 Q1).** If a Stripe test-mode key is added to repo secrets, wire it in a job that exposes it and run it with `JOURNEY_DB_WRITES_OK=1`. If not, it stays orphaned and named — never wired to skip. Not deletable: deposit cancel is live behaviour. |
| `server/__tests__/deliverable-protected-rail.http.test.ts` | needs the app started with `OBJECT_STORAGE_DRIVER=memory`; `server/infrastructure/object-storage.ts` refuses that driver under `NODE_ENV=production`, which is what `suite-server-tests.yml` runs | **Wire** into a job that boots the app in **development** mode — `unwired-spec-gate.yml` already does exactly that (`NODE_ENV: development`, `PORT: 5000`). Add a step there (or a sibling job with the same boot block) that sets `OBJECT_STORAGE_DRIVER=memory` and runs this suite. **Never loosen the production refusal** in object-storage. |

### B. Twenty-five `playwright/tests` specs (25)

**B1 — blocked on fixture/seed data a fresh CI database does not create (9).**
`discover-bento-real-data`, `optimization-payment-gate`, `finalize-booking-modal`, `travel-surcharge-step`, `optimized-slip-live`, `slip-parity-fixture`, `optimize-apply-banner`, `stripe-init-deferral`, `lane1-phase1d-routing`.

Disposition: **one shared seed, then wire the ones that go green.** Extend the CI seed (the `seed-ci-test-users` step or a sibling `seed-ci-test-listings` in the `ci-db-setup` composite action) with the named rows these specs need — an active, `approval_status='approved'` `provider_services` row owned by the CI provider; an affiliate-bookable supplier; whatever `travel-surcharge-step`/`optimized-slip-live`/`slip-parity-fixture` seed themselves from. ONE seed helper, not nine local `beforeAll` inserts (§18 rule 1). Rules: seeded rows use canonical delivery methods (LD 3) and carry no fee/rate literal (§8/§18); no seed writes `stripe_payment_intent_id` (§19a). `discover-bento-real-data` asserts REAL Mumbai content rows — if its assertions are about production data rather than shape, it cannot be honest on a fresh DB and becomes a §3 decision row (delete as a one-time data check, or rewrite to seed-shaped rows).

**B2 — stale expectation against a surface that still exists (11).**
`content-system`, `deprecated-route-redirects`, `offering-card`, `lb-p1-password-reset`, `security-regression` (3 of 43), `experts-flow`, `user-menu` (2 of 16), `search-bar`, `breakpoint-hamburger` (3 of 22), `expert-application-mobile`, `tripstrip-count-accuracy` (C/D precondition).

Disposition: **Phase 0 produces one decision row per failing assertion (§3) and STOPS.** Some rows can be pre-answered from rulings and need no decision-maker time, and the agent should say so with the citation:

- `experts-flow` (card links `/s/:handle`) and `offering-card` (`/p/:handle` is a client route, not a server 301) — LD 40 lane 3 ruled the handle route; the expectation is stale by ruling → update, cite LD 40.
- `deprecated-route-redirects` / `content-system` assert retirement redirects for `/discover-experiences`, `/itinerary/:id`, `/my-itinerary/:id`, `/credits-billing`, all still live — **decision (§4 Q3)**: are those routes meant to be retired? If yes, the tests found a defect (file it, leave the tests); if no, delete those cases with the citation.
- `tripstrip-count-accuracy` C/D — `/cart` renders inside `BrowseShell` (LD 45 (7)), so the TripStrip chip is not mounted there. **Decision (§4 Q4)**: should it be? Until answered, A/B stay repaired and the file stays orphaned and named.
- `security-regression` (`X-RateLimit-Limit` header) — check whether the limiter deliberately stopped emitting the header. Deliberate ⇒ update the 3 cases; not deliberate ⇒ defect, file it. 40 of 43 cases are green and are worth wiring the moment the 3 are resolved.
- The remaining six (`lb-p1-password-reset` wording, `user-menu` tab order + logout, `search-bar`, `breakpoint-hamburger`, `expert-application-mobile`) — one row each: what the spec expects, what the surface does, which is right and why.

**B3 — broadly rotted legacy suites (5).**
`phase-1-expert-setup`, `phase-2-provider-setup` (both exceeded a 20-minute wall), `phase-3-traveler-flows`, `phase-4-7-advanced-flows`, `seam-cross-console`.

Disposition: **coverage map first, then delete-or-extract.** For each `test(...)` in these five, name the armed spec (in `spec-coverage-gate.yml`, `unwired-spec-gate.yml`, `provider-console-gate.yml`, `slip-rail-actions-gate.yml`, …) that already asserts the same behaviour. Covered ⇒ the case is deletable with that citation. Uncovered and still-real ⇒ extract into a NEW small spec (never repair a 20-minute suite in place). `seam-cross-console` surfaced `POST /api/trips` answering `400 Expected string, received number` — determine at Phase 0 whether the spec's body is wrong (a number where the schema wants a string) or the rail is; record either way.

### C. Five specs outside `playwright/tests` (5)

`playwright/crossbrowser/smoke.spec.ts` (WebKit-only, own config, needs `scripts/webkit-ldpath.txt` + glib-networking from `/nix/store` — neither exists on `ubuntu-latest`) and `playwright/tier4/{a11y,booking,deep-ui-loop,keyboard}.spec.ts` (a local-only audit harness: `assertNotProduction()` accepts loopback only, runs three browsers from its own config, writes evidence JSON rather than asserting a gate).

Disposition: **decision required (§4 Q2); the agent decides nothing here.** The honest options are: (i) run the tier4 chromium project against the CI app on loopback in its own job (its loopback rule permits that; whether "evidence JSON" is a CI test is the question); (ii) delete them as a local tool that is not a CI test; (iii) leave them orphaned and named. Renaming them to dodge the `*.spec.ts` pattern is forbidden — that is an allowlist with extra steps. WebKit smoke cannot run on `ubuntu-latest` without `playwright install`, which is refused; it is (ii) or (iii).

---

## 3. Phase 0 deliverable — before ANY write

A table with **33 rows**, one per baseline path, columns:

`path · bucket (A/B1/B2/B3/C) · blocker VERIFIED at <sha> (re-run, not copied) · proposed disposition (wire / repair fixture / decision row / delete with citation) · decision needed? (which §4 question)`

Plus, for B2/B3, one sub-row per failing `test(...)`: what it expects, what the surface does, which is right, the ruling that says so if one exists.

Post the table on the PR (or the lane report on the branch) and **STOP on every row marked "decision needed"**. Proceed immediately on rows that need none.

---

## 4. Decisions the decision-maker should give up front (so the agent is not blocked)

1. **Stripe test key in CI?** Adding a `sk_test_` key to repo secrets unlocks `deposit-cancel.db.test.ts` (and any other `*.stripe.db.test.ts` that skips on the stub). If no: that file stays a named orphan; say so and it costs nothing more.
2. **Fate of `playwright/tier4/*` and `crossbrowser/smoke`:** run in CI (tier4 chromium only), delete as local tooling, or keep as named orphans.
3. **Are `/discover-experiences`, `/itinerary/:id`, `/my-itinerary/:id`, `/credits-billing` meant to be retired?** Two specs assert they redirect; all four are live pages.
4. **Should the TripStrip chip be reachable on `/cart` now that `/cart` renders inside `BrowseShell`?** (`tripstrip-count-accuracy` C/D.)
5. **Branch protection (human step, not code):** the ratchet job `test-file-reachability (ratchet - new orphans fail)` cannot be made a required context by `enforce-branch-protection.yml` (needs admin rights; no PAT configured). Until someone applies it by hand in repo settings, a new orphan turns the job red without blocking the merge button.

---

## 5. Wiring shape, PR by PR

Prefer **three PRs** so a decision on one bucket does not hold the others: (1) bucket A + B1 (seed + wire; no decisions beyond Q1); (2) B2 + B3 once §4 Q3/Q4 are answered; (3) C once Q2 is answered. Each PR:

- removes exactly the baseline lines it wired or deleted (`scripts/test-orphan-baseline.txt` may only shrink; a line for a still-orphaned file cannot be removed — the checker fails it as NEW ORPHAN);
- carries `spec-green:` lines for every newly wired Playwright spec;
- carries the local run output (`tests N · pass N · fail 0 · skipped 0`) for every wired suite in the lane report;
- appends its own ledger row and lane report; states the inventory before/after (`X/522 reachable; Y orphans`).

Expected end state after all three: `test-files-wired: 522/522 reachable; 0 orphan(s)` or a baseline holding ONLY the files a §4 answer chose to keep orphaned, each with its reason recorded in the ledger row.

---

## 6. What NOT to do (each of these has already been tried or refused in this repo)

- Do not add an allowlist, exemption comment, or "known orphan" marker to the checker. The baseline is the only debt record and it only shrinks.
- Do not wire a suite into a job that cannot execute it (V-30 shape) — a DB-only job for an HTTP suite, a production-bundle job for a memory-driver suite.
- Do not rewrite an expectation to match the code without a ruling or a §3 decision row.
- Do not widen `TEST_ROOTS`, bend a Playwright `testDir`, or rename a spec out of the scan.
- Do not run `playwright install`, and do not build a WebKit toolchain on the runner.
- Do not touch `server/` or `client/` production code; file defects.
- Do not add jobs to `.github/branch-protection.json` or the CI_GATES tables on your own initiative.
