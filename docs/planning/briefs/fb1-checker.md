# FB-1 — the plan checker: issue shape, why codes, sources and fixes

Decision-maker Leon Dixon, Oct 17–18, 2026 (FB-1 rulings, step 2; this shape was sanctioned on Oct 18, 2026 and is recorded here as the step 2 PR's content of record). Ledger rows `2026-10-17-fb1-checker-open-coords` (step 1) and `2026-10-18-fb1-pure-checker` (step 2).

## What the checker is

`checkPlan` (`shared/plan-check.ts`) is pure: it takes a plan's stops, stored facts, anchors, legs and energy rows and has no database and no network. `loadPlanCheckInput` (`server/services/optimizer-lead.service.ts`) is the one read of a trip's input. The free preview, the day line and a stop's hours all read the same `feasibilityView` through it. The paid versions (step 3) will call `checkPlan` directly on a version's stops.

Every finding rule is the existing one in `shared/optimizer-lead.ts` and `shared/leg-reachability.ts`, unchanged. The card's three findings (`findings`) are what the free preview returned before the split; `server/__tests__/fb1-plan-check-parity.db.test.ts` P1 pins that against a golden captured from the pre-split code.

## Points

A stop's `point` is its open coordinate only, through LG-1's rule (`routingPointFor` + `isOpenCoordOrigin`): an admin row, else an OSM match for its Google place id, else a ride's seeded OSM node. A Google point (the row's own coordinate or a Places fact) is never read. This holds for:

- the two path findings, `city_crossing` and `walking_saved_km` (step 1). A day is checked only when every stop on it has an open point; any other day goes in `notChecked` with the reason `no_open_coordinates`;
- the rides that `last_service_missed` reads (step 2). A ride is derived only between two consecutive stops that both have an open point.

## Result

```ts
interface PlanCheckResult {
  findings: Finding[];      // the card's list, at most three (leadFindings), unchanged
  allFindings: Finding[];   // every finding, in the card's order, uncapped
  issues: PlanIssue[];      // one per thing found
  notChecked: NotChecked[]; // { kind, reason: "no_open_coordinates", days }
}
```

## Issue shape

```ts
interface PlanIssue {
  type: FindingKind;                                  // the finding it belongs to
  day: number;
  stop: { itemId: string; title: string } | null;     // null for a day-level issue (path findings, pace)
  why: PlanIssueWhy;
  source: { kind: PlanIssueSourceKind; url: string | null; provenance: string | null };
  checkedAt: string | null;                           // when the fact behind it was checked; null when the source has no date
  fix: PlanFix;                                       // exactly one
}
```

## Why codes

| `why` | Raised by | Meaning |
|---|---|---|
| `before_opening` | `closed_on_arrival` | the stop starts before the place opens that day |
| `after_closing` | `closed_on_arrival` | the stop starts at or after the place closes |
| `closed_day` | `closed_on_arrival` | the place is closed all day (official source only, R-p) |
| `closes_early` | `closes_before_visit_end` | the place closes before the visit ends |
| `after_last_entry` | `after_last_admission` | the stop starts after the last entry |
| `leg_too_long` | `leg_unreachable` | the plan's own leg does not fit the gap before the stop |
| `after_last_service` | `last_service_missed` | the ride leaving the stop departs after every last departure nearby |
| `overlaps_anchor` | `timed_entry_conflict` | the stop overlaps an anchor's window (for example, the time to leave for a flight) |
| `crosses_city` | `city_crossing` | the day reverses direction across the city more than once |
| `walking_saved` | `walking_saved_km` | re-sequencing the day would save walking |
| `recovery_needed` | `pace_over` | the day's energy row says it needs recovery |

## Source kinds

| `source.kind` | Used for |
|---|---|
| `official_fact` | an official-licence fact: hours, last entry, last service |
| `person_checked_fact` | a fact a person checked (an expert or a verifier) |
| `fact` | a tagged fact of neither kind |
| `plan_leg` | the plan's own leg |
| `anchor` | a temporal anchor |
| `energy` | the plan's energy row |
| `open_coordinates` | the stops' open coordinates (the path findings) |

`url` and `provenance` are the fact's source URL and provenance line when the loader has them, else null.

## Fixes

One fix per issue. A fix is an instruction a version can carry out (step 3) and a tap can apply (step 4, through `/versions/apply-days`); it is never a write by itself. Minutes are the plan's own wall-clock minutes on the stop's day (a time after midnight is past 24:00).

| Fix | Fields | Used for |
|---|---|---|
| `retime` | `itemId`, `day`, `notBeforeMin?`, `notAfterMin?` | hours, last entry, last service, a leg that is too long |
| `move_day` | `itemId`, `day` | a closed day |
| `move_clear_of_anchor` | `itemId`, `day`, `anchorId` | an anchor overlap |
| `reorder_day` | `day` | the two path findings |
| `lighten_day` | `day` | pace |

How each `retime` is set:

- `before_opening` — `notBeforeMin` = the opening minute;
- `after_closing`, `closes_early` — `notAfterMin` = the closing minute minus the visit's length (the closing minute when no length is stated);
- `after_last_entry` — `notAfterMin` = the last-entry minute;
- `after_last_service` — `notAfterMin` = the latest last departure minus the visit's length;
- `leg_too_long` — `notBeforeMin` = the stop's start plus the minutes the leg is short by.

## Step 3 — the paid versions are gated

Decision-maker Leon Dixon, Oct 18, 2026 (step 3 rulings 1–5). Ledger row `2026-10-18-fb1-version-gate`. Pure rules: `shared/version-check.ts`; run wiring: `server/services/version-check.service.ts`.

**When it runs.** Once per paid run, the draft is checked (`loadPlanCheckInput` + `checkPlan`). Then each version is checked twice:

- after sequencing, in memory — recorded as `check_unresolved_after_sequencing` and `check_added_after_sequencing`;
- after its legs are written (the legs step re-times the stops) — this check decides.

Both run inside the run, so the existing five-minute deadline covers them.

**A version's input.** A version stop that keeps a draft item (`sourceItemId`) inherits that item's open point and stored facts. A stop the version added has neither, so its checks do not run. The plan's anchors and the market's last departures apply unchanged. A version has no energy rows, so pace is not checkable on it.

**The verdict (ruling 2).**

- A stop issue is matched by the place it is about (the draft item the stop keeps), whatever day it moved to. A day issue is matched by its day.
- **Unresolved:** a draft issue the version still has. **Added:** a version issue the draft did not have. Either fails the version.
- **Not checked never fails.** A version on which fewer checks ran than on the draft (`checkCoverage`), or on which a draft finding kind could not run at all, still passes — and says so ("Fewer checks could run on this version than on your plan.").

**Held (ruling 1).** A failing version is stored with status `held` (text column; no migration). It is never shown, named or adopted: the board, apply-days, swap-in, the comparison read, the top-version fallback of apply-to-trip and the read-by-id all leave it out. The latest run is found counting held versions, so a run whose every version failed never shows the previous run's versions in its place. Regeneration is step 3b, after a week of data.

**Metric rows (ruling 3)** in `itinerary_variant_metrics`, every key starting `check_`:

| Key | Value | Description |
|---|---|---|
| `check_<kind>` | the finding's count on the version | the why codes |
| `check_unresolved` | draft issues still present | the why codes |
| `check_added` | issues the draft did not have | the why codes |
| `check_coverage_reduced` | 1 when fewer checks ran than on the draft, else 0 | "checks N of the draft's M" and any kind not checkable |
| `check_unresolved_after_sequencing`, `check_added_after_sequencing` | the same, after sequencing | the why codes |

**No version passes (ruling 4).** The board shows no version, the lead line "We couldn’t make a version of this plan that clears every problem. Here’s what’s still in the way:", and the draft's open issues, each with its one fix. No retry, no apology, and no held version shown as if it passed.

**Names (ruling 5).** Version A is "Your plan, fixed": the model is told to keep the plan and apply the draft's fixes (by [S#] tag and minute), and the name is the server's. B and C keep their strategy names. The same gate applies to all three. "In season" and "With local picks" are absent.

**Sequencing (step 3b).** The run's sequencing step used to re-time every day from 08:00, so a model's start time never survived. Step 3b changes that (below).

## Step 3b — sequencing honours the model's times and the draft's windows

Decision-maker Leon Dixon, Oct 18, 2026 (step 3b sanctioned as proposed). Ledger row `2026-10-18-fb1-sequencing-windows`.

`reorderDayActivities` (`server/services/smart-sequencing.service.ts`), called only by the paid run's `reorderItinerary`, now spaces each day with `spaceDayTimesHonouring`, beside `spaceDayTimes`. In the day's order, with the same durations and the same 30-minute gap, each stop starts at the latest of:

- the cursor: 08:00 for the first stop, else the previous stop's end + 30. A stop is never moved earlier than this, so stops never overlap;
- the model's own start time, captured before step 1 fills its slot defaults (a default is never honoured as if the model had said it);
- the window's `notBeforeMin`.

A stop that lands past its `notAfterMin` is left late, never squeezed; the step 3 gate holds the version.

The windows (`retimeWindowsByItem`, `shared/version-check.ts`) come once per run from the draft's own `retime` fixes, keyed by the draft item a stop keeps (`sourceItemId`). Several fixes on one stop combine into the latest `notBefore` and the earliest `notAfter`. A stop the model added has no window. They apply to all three versions.

Unchanged: `spaceDayTimes` and `retimeDayInOrder` (the traveler's own re-time, R-ac), the anchor step, energy balancing, the legs step and the gate. With no model times and no windows, the result is exactly today's (golden parity).

## Step 4 — "Your plan, fixed" by tap

Decision-maker Leon Dixon, Oct 19, 2026 (step 4 rulings (a)–(d), and follow-up rulings (1)–(3) the same day). Ledger row `2026-10-19-fb1-fixed-by-tap`. Service: `server/services/fixed-plan.service.ts`; words: `client/src/lib/fixed-plan.ts`.

**Flag-only.** The checker and the run never adopt anything. A day of version A ("Your plan, fixed") reaches the plan only through a traveler's tap on the slip, which posts `POST /api/trips/:tripId/versions/apply-days` with `unchangedSinceRun: true`. The days go through the one adopt writer, `applyDays`. A pin test (`fb1-apply-days-callers`) fails if anything else calls it.

**Confirm before apply.** A tap first sends `preview: true`: `applyDays` runs the same diff inside its transaction and rolls it back. The slip shows each day's counts ("Day 2 updated: 2 stops moved, 1 added, 1 removed") with Confirm and Cancel. Nothing is written before Confirm.

**Which days (read).** `GET /api/trips/:tripId/versions/fixed` names version A and the plan's flagged days — days with an issue in the current check — each `fixable` or `changed`. No shown "Your plan, fixed" ⇒ `null`.

**Changed (ruling (a)(i)).** A day the traveler changed after the run STARTED is refused, never overwritten. The start is the run's baseline ("Your Plan") version, written before the model call; its items record each plan item's day then. A day is changed when:
- an item on it now was created or written after the start (an add, an edit, a re-time, a move in);
- an item the baseline had on it is gone or now on another day (a delete, a move out).

Every day is changed when an item the baseline does not know (a fixed commitment) was removed after the start — its day is unknowable. No baseline to read ⇒ every day is changed.

**Machine writes are not edits.** A writer that re-times items on its own does not bump `updated_at`. The one that did — the legacy leg schedule writer in `trip-transport-legs.service.ts` (run by "generate legs"; it never runs on a routed plan, the only kind with versions) — no longer does. The other machine writers (place facts, coordinates, sort order, the Moment lock) already left it alone.

**The two taps (rulings (b), (c)).** Slip only; the Trip Card is the finalized read-out.
- One day: "Use the fixed day", under the day's feasibility line. A changed day shows "You’ve changed this day since these versions were made, so we didn’t replace it." and the slip's existing "Compare versions" link to the board instead; its tap would be a 409 `day_changed`.
- Whole plan: "Use all fixed days", above the days, while at least one flagged day is fixable. It sends every flagged day; the server applies the unchanged ones and names the rest: "Updated 3 days. Skipped Day 2 because you’ve changed it."

**Unchanged:** the board's own adopt (it never sends the flag), the gate.
## Step 4b — a free plan's retime fix by tap

Decision-maker Leon Dixon, Oct 19, 2026. On a free plan (no routed legs; a paid plan has "Your plan, fixed"), a
finding whose fix is `retime` is a tap on the slip. The other fix kinds stay flags with the fix in words, and
`lighten_day` is never a tap. The issue shape does not change before Oct 21.

- **The move.** `planRetimeFix` (`shared/free-retime.ts`, pure) moves the stop to its window's bound and keeps its
  length. A later stop on the same day moves later only where it would overlap. No tap is offered when the move
  would collide with the stop before, run past midnight, miss the window, or move a booked, in-checkout, locked or
  expert stop.
- **Offered only when it works.** The server re-runs the one checker on the moved day. A fix is offered only when
  that stop's issue is gone and the day carries nothing it did not already have.
- **Who and what.** Owner or delegate (`planRole(…, "choose")`); anyone else gets one 404. Public facts only, no
  model call, no version.
- **Confirm before apply.** `POST /api/trips/:tripId/retime-fixes/:itemId/apply` with `preview: true` writes nothing
  and returns the moves; Confirm sends it without. The moves are recomputed on the server, never taken from a body.
  The write is one transaction, each update conditional on the stop still starting where the plan said (else 409
  `plan_changed`); a stop with no fix is 409 `no_fix`; a paid plan is 409 `paid_plan`. Times are stored as
  "h:mm AM/PM". The plan's legs are queued for recompute.
- **Read.** `GET /api/trips/:tripId/retime-fixes` lists the fixes; a paid plan gets none.
- **Words** (founder wording review on the PR): "Move <stop> to <time>", "Confirm" / "Cancel", and the step 4
  counts line ("Day 2 updated: 2 stops moved").

## Step 5a — prompt cleanup

Decision-maker Leon Dixon, Oct 19, 2026 (prompt cleanup rulings (a)–(c)). Ledger row `2026-10-19-fb1-prompt-cleanup`.

- **The free draft** (`generateAutonomousItinerary`, `server/services/ai-generation.service.ts`) no longer feeds TravelPulse's hidden-gem names or its crowd level, and its intelligence block drops "Prioritize trending experiences", "Factor in crowd levels when scheduling" (crowd timing is an expert's judgment; the model has no data for it) and "Include hidden gems…". "Prioritize must-see attractions" stays.
- **The paid run** (`server/itinerary-optimizer.ts`) no longer tells the model to fill empty days. An empty day stays empty, and the checker does not flag it.
- **Example times are placeholders** in every drafting prompt's JSON example (`<HH:MM>`, `<HH:MM AM/PM>`).
- **The never-say line.** Every drafting prompt — the free draft, the trip generate route, the paid run, the blueprint — carries one line naming the banned words, built at runtime from `shared/banned-copy.ts`'s one list (`bannedCopyPromptLine`). The storage-time rewording (LG-2 Ask 9) stays the backstop.
- **No canned fallback.** When the model fails, `POST /api/trips/:id/generate-itinerary` stores no draft: it answers through `aiFailureResponse` (503 with retry-after; 502 for a non-retryable failure), releases the free draft, and leaves the plan as it was. It used to replace the plan's AI items with four generic stops per day.

## Not in step 3

- Regenerating a held version: step 3b.
- "Your plan, fixed" by tap: step 4.
- The count lines and "Not checked yet" wording on the free card: the FB-1 copy lane.
