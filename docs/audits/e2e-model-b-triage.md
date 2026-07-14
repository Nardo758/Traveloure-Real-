# E2E "Model B" triage — why the deploy-journey suite is red, and the rehab backlog

**Date:** 2026-07-14 · **Workflow:** `.github/workflows/e2e-tests.yml` ("E2E Tests (Model B — deploy-only, no Actions DB)")

## What Model B is

A Playwright suite that drives the **full** journey specs (`e2e/specs/journey-*.spec.ts`, via
`playwright.e2e.config.ts`) against a **live external deployment** (`E2E_BASE_URL`, the Replit app)
that **self-seeds its own DB on startup**. "Model B" = no database work on the CI side (no
`DATABASE_URL`, no migrations, no seed); CI only waits for `/health` (DB healthy) + `/api/ready`
(seeding done), then runs the browser journeys. Contrast **Model A** (the app-in-Actions gates:
Build Smoke, Selection Controls, Service Offering Types, Upsell Trust Contract), which boot the app
inside the runner with `GIT_COMMIT: ${{ github.sha }}` and therefore test the PR's actual code.

## Why it has been permanently red

Two independent causes, established by reading each spec against current `main`:

1. **It tests a lagging external deploy.** The deploy trails `main` during active development and does
   not inject `GIT_COMMIT` (so `GET /api/version` returns `"dev"` — the run can't even tell it's
   stale). On a PR it reports the *deploy's* state, not the PR's diff, so it can't gate a PR.
2. **The journey specs have drifted from the app.** Most failures reference testids / routes /
   whole flows that current `main` does not ship — a redeploy would **not** turn them green.

A representative run: **13 passed / 13 failed / 3 skipped**.

## Triage — the 13 failures

Legend: **A** = stale-deploy false-red (main is correct; redeploy fixes) · **B** = spec drifted from
the app (redeploy will NOT fix; the test needs a code or expectation change).

| # | Test (file:line) | Class | Reason (backing route/file on `main`) |
|---|---|---|---|
| 1 | journey-1.spec.ts:72 (1A authed checkout) | B | Drives `text=Prepare Trip` + `[data-testid=booking-reference]`; neither exists (`cart.tsx`, `BookingConfirmation.tsx`). |
| 2 | journey-1.spec.ts:129 (1B guest migrate) | B | Same missing `Prepare Trip` / `booking-reference`; guest "Sign in to book" prompt does exist (`cart.tsx:1150`). |
| 3 | journey-4-5.spec.ts:5 (Journey 4 Expert) | B | `/become-expert` renders marketing `TravelExpertsPage`; no `expert-onboarding-wizard` / `service-creation-form` / `earnings-dashboard`. Expert wizard is **retired** (CLAUDE.md §5). |
| 4 | journey-4-5.spec.ts:102 (Journey 5 Provider) | B | `/become-provider` renders `ServicesProviderPage`; no `provider-onboarding-wizard` / `discover-feed` / `earnings-dashboard`. |
| 5 | journey-5-admin.spec.ts:5 (fee-bands → checkout) | B | `admin/fee-bands.tsx` has no `button-edit-fee`/`input-fee-amount`/`button-save-fee`; concierge uses `textarea-concierge-intent`/`button-concierge-submit`, not `intent-form`/`input-intent`. |
| 6 | journey-5-admin.spec.ts:40 (admin payout) | B | Test drives a **create-payout modal** (`button-trigger-new-payout`, `payout-trigger-modal`, `select-requester-type`); `admin/payouts.tsx` only has an *approve* flow (`row-payout-*`, `button-approve-{id}`). Feature not built. |
| 7 | journey-5-admin.spec.ts:81 (upsell click) | B | Backend `POST /api/upsell/click` exists (`upsell.routes.ts:923`), but `[data-testid=discover-feed]` absent and `UpsellSlot.tsx` renders `upsell-slot-${surface}`, not bare `upsell-slot`. |
| 8 | journey-6.spec.ts:5 (PlanCard transport leg) | B | Test uses `trip-card`, `transport-section`, `button-book-leg`; main ships `trip-card-${id}` (`my-trips.tsx`), `transport-section-${tripId}` (`plancard/TransportSection.tsx`), and no `button-book-leg`. |
| 9 | journey-6.spec.ts:46 (standalone /transportation) | B | `/transportation` uses `input-from`/`input-to`/`button-search`; test's `transportation-booking-page`, `input-date`, `transport-results`, `transport-result-card`, `button-book-transport` are absent (results UI not built). |
| 10 | journey-6.spec.ts:75 (affiliate click endpoint) | **A** | Pure API: `POST /api/transport-booking-options/seed/test-variant` → 201 `{id}` and `POST /:id/click` → 200 `{redirectUrl}` both exist and match (`transport-hub.routes.ts:411,311`). **Stale-deploy.** |
| 11 | journey-7-cleanup.spec.ts:47 (redirects) | B | Redirect map stale vs `App.tsx`: `/services`,`/trips`,`/travel`,`/vacation` have no route; `/local-experts`,`/vendors`,`/experiences` render pages (not → `/discover`); `/travel-experts` → `/become-expert`; `/expert/services` renders `ExpertServices`. |
| 12 | journey-7.spec.ts:10 (Concierge → Event Coord) | B | Fails at `[data-testid=intent-form]` (main uses `textarea-concierge-intent`/`button-concierge-submit`); `expert-workspace` wrapper testid absent (`workspace.tsx` has `tab-right-event-coord`). |
| 13 | journey-7.spec.ts:95 (coordination fee) | **A** | Proven: `resolveCoordinationFee('wedding', 2_500_000)` → `{feeCents:200000, rule:"percent", floorCents:49900, percentOfBudget:200000}`, exactly the assertion. §7 budget wiring (#144) is on `main`. **Stale-deploy.** |

**Totals: A = 2 (both pure-API), B = 11 (all UI-DOM journeys).**

## Rehab backlog (per test)

Selector-only fixes are mechanical; feature-existence items need a product call first.

- **#1, #2** — retarget to main's auto-resolve checkout flow, or add `data-testid="booking-reference"` in `BookingConfirmation.tsx`.
- **#3, #4** — expert/provider onboarding wizard is retired/absent (§5). Rewrite against the current ServiceForm flow **or** mark `test.fixme` with the retirement reason. Also update earnings assertions to the escrow **held** model (earnings born `held`/pending, not an immediately-available "$375.00").
- **#5** — point at `fee-bands.tsx` real inline-edit controls + `IntentForm.tsx` testids (`textarea-concierge-intent`/`button-concierge-submit`), or add aliases in code.
- **#6** — create-payout-modal UI not built; either build the trigger flow or rewrite to the `row-payout-*` / `button-approve-{id}` approve flow.
- **#7** — use `upsell-slot-${surface}` / `upsell-candidate-*` and a real discover-feed selector; backend is fine.
- **#8** — selectors → `trip-card-${id}` / `transport-section-${tripId}`; add a per-leg book-CTA testid in `TransportSection.tsx` if that action is intended.
- **#9** — selectors → `/transportation`'s real `input-from`/`input-to`/`button-search`; add date/results/result-card/book testids if that search-results UI is intended.
- **#10** — stale-deploy only; redeploy.
- **#11** — rewrite the redirect map to match current `App.tsx`.
- **#12** — concierge/workspace selectors → main (`textarea-concierge-intent`, `button-concierge-submit`, `tab-right-event-coord`); add an `expert-workspace` wrapper testid if desired.
- **#13** — stale-deploy only; redeploy.

## Action taken

- **`e2e-tests.yml` made non-blocking** (schedule + manual dispatch only; removed push/PR triggers),
  matching `e2e-deploy-smoke.yml`'s documented non-blocking intent — so it stops posting a permanent
  misleading red on every commit while still running daily against the deploy.
- **Added a deploy-freshness annotation** (warn-only) that reports the deploy's `/api/version` sha vs
  the commit under test, so a future red is self-explanatory (stale deploy vs real regression).

## Not done (needs a decision / a current deploy)

- Rehabbing the 11 drifted specs — several assert **retired** (expert wizard) or **unbuilt**
  (create-payout modal, transport search-results) features, so the fix is per-test: rewrite to the
  real flow, `test.fixme` with a reason, or build the affordance. Best done with the deploy current
  so each rewrite can be verified green rather than edited blind.
- Injecting `GIT_COMMIT` into the Replit deploy so `/api/version` reports the real running commit and
  the freshness guard can become a hard gate.
