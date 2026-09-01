# Slip → Finalize Plan → Trip Card live audit

**Run:** September 1, 2026, against the local development workflow at `http://localhost:5000`  
**Build:** `0f10aa695` (`origin/main`, merged Finalize/Trip Card implementation)  
**Command:** `npx playwright test playwright/tests/finalize-booking-modal.spec.ts --project=chromium --workers=1 --reporter=line`  
**Result:** 2 passed

This audit uses a fresh registered traveler and future-dated trip per test. Trip and itinerary
mutations go through the application API. Lifecycle facts below are read with SELECT-only queries;
the audit never writes `trips`, `trip_finals`, or `item_transition_log` directly.

## Observed lifecycle

| Boundary | UI evidence | Persisted state observed |
|---|---|---|
| Fresh trip with one item staged to checkout | Slip renders the item and `Finalize Plan`; chooser absent; retired `confirm-finalize-unbooked` gate absent | `trips.finalized_at IS NULL`; `trip_finals` count `0` |
| One `Finalize Plan` click | Exactly one `POST /api/trips/:tripId/finalize`; exactly one chooser opens after the response | `finalized_at IS NOT NULL`; one `trip_finals` row at version `1` with a 64-character SHA-256 content hash; `plan_finalized` diary row |
| Chooser after commit | Title is “You're set — how do you want to book it?”; Book it myself is selected by default; staged-but-unbooked note is inline; Booking agent is visible but disabled with “No partner-bookable stops in this plan”; Travel expert and Concierge are available | The finalize commit is already durable before chooser interaction |
| Chooser Back | Back dismisses the chooser and does not undo finalization; ready banner and `v1` chip remain visible | `finalized_at` remains set; one final row |
| Reopen | `Back to planning` is visible for the future trip and calls the supported reopen endpoint | `finalized_at IS NULL`; version `1` remains |
| Unchanged re-finalization | Finalize request succeeds, no chooser reopens, and “No changes since v1” is shown | `finalized_at IS NOT NULL`; still one final row at version `1` with the same content hash |
| Reopen, edit, and re-finalize | The supported item PATCH is followed by Finalize Plan; chooser opens again and the revised item is rendered | `finalized_at IS NOT NULL`; two final rows; latest version `2` with a different content hash |
| Book it myself continuation | Continue routes to `/cart`; no booking or charge is attempted by this audit | Final v2 remains intact |
| Trip Card navigation | The ready banner’s View Trip Card link lands on `/trip/:tripId`; the not-final notice is absent | Card reads the finalized plan at version `2` |
| Travel expert continuation | Separate fresh trip: selecting Travel expert and Continue produces one successful `POST /api/expert-requests` and closes the chooser | The finalize state is committed before the handoff request |

## Chooser presentation

The live chooser exposes all four lanes:

1. **Book it myself** — default, selected initially, continues to `/cart`.
2. **Booking agent** — honestly disabled when no activity has a server-derived partner booking token.
3. **Travel expert** — available and posts the existing `ai_plan_polish` request rail.
4. **Concierge** — available and hands off to `/concierge` without inventing a quote client-side.

The ownership wording is **“Choosing a person gives them access to your finalized plan to book on
your behalf — you keep ownership…”**. The obsolete “hands them a copy” wording is absent. The
former separate “Finalize without booking?” pre-gate is absent; the staged note is inline in the
chooser.

## Captures

The passing test writes the following full-page PNGs to
`playwright-report/slip-finalize-audit/`:

- `01-pre-final.png`
- `02-pre-final-ui.png`
- `03-chooser-after-commit.png`
- `04-back-ready-banner.png`
- `05-reopened.png`
- `06-unchanged-refinal.png`
- `07-chooser-v2.png`
- `08-book-it-myself-cart.png`
- `09-trip-card-v2.png`

The directory is intentionally under the existing Playwright report ignore rule; rerunning the
focused command regenerates the captures from the current dev build.

## Findings and stale assumptions

### Finding 1 — stale browser selector, repaired

The pre-repair spec waited for `slip-action-adopt-optimization`, which no longer exists on the
current build. The live control is `slip-action-finalize-plan` and its visible label is **Finalize
Plan**. The unchanged spec failed all three original tests at that selector before reaching the
chooser. The durable coverage now targets the stable Finalize Plan hook and explicitly verifies
that the old pre-gate is absent.

### Finding 2 — stale test helper sequence, repaired

The original expert test prepared the old control but did not click the current Finalize Plan
button before waiting for the expert request. That was a test assumption, not a product failure.
The repaired test clicks the current control, waits for the chooser, then asserts the one request
and close behavior.

### Finding 3 — snapshot behavior is intentional, not a defect

After reopening, editing a live item does not change the existing frozen final immediately. The
edit becomes visible in the next finalized snapshot; the audit therefore verifies the revised item
after v2 is committed rather than asserting it against v1. This matches the snapshot contract in
`server/services/trip-plan.service.ts`: plan-defining fields are frozen until the next final,
while live booking status is overlaid separately.

## Verdict

The Finalize → chooser → Trip Card seam is working on the current dev build. Finalize commits the
lock, diary entry, and first immutable snapshot before the chooser opens; chooser dismissal does
not roll back that commit; unchanged re-finalization is idempotent by content hash; editing and
re-finalizing produces v2; and the primary self-booking path reaches the cart without charging.
The observed failures were stale test assumptions and have been replaced with durable assertions,
not weakened.