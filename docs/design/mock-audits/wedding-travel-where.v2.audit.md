# `TravelWhere.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/TravelWhere.dc.html` (Golf trip · Where — three ordered stops)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 2 under `default_stops: many`; `client/src/lib/plan-stops.ts`; `client/src/lib/plan-stops-writer.ts`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-plan-stops-ui`; CLAUDE.md **Locked Decision 34** (migration 281) and **22c** (no invented routes).
**v1 brief:** `wedding-travel-where.audit.md` — its two standing findings are now **closed** (golf has its own row; the step rail exists).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your plan" | `plan-modal.tsx:849`–`860` | MATCH | |
| 2 | Title "**Where are you going?**" | `plan-modal.tsx:865` | **DIVERGENCE — copy** | Live title is "Where is it happening?" for **every** occasion. The artboard uses a travel-flavoured question for a travel-shaped one. `stepTitle` does not branch on the occasion for this step (it does for step 4). |
| 3 | Pill "Golf trip · change" | `plan-modal.tsx:936`–`949`; `experience-template-tabs.seed.ts:4906` | MATCH | The row's `name` is exactly "Golf trip". |
| 4 | Three ordered rows, numbered **01 / 02 / 03** | `plan-modal.tsx:1044`–`1146` | **DIVERGENCE — row 1 carries no number** | Row 1 IS the "Destination" field with its own `Label` (`:1044`–`1061`); only rows 2+ get the mono ordinal, computed as `String(index + 1).padStart(2,"0")` → "02", "03" (`:1077`–`1082`). So the live list reads *Destination / 02 / 03* where the artboard reads *01 / 02 / 03*. The underlying model is right (row 1 is the position-0 mirror of `trip_destinations`, Locked Decision 34) — only the label is missing. |
| 5 | Rows are reorderable | `plan-modal.tsx:1103`–`1130` (`button-plan-stop-up-*`, `button-plan-stop-down-*`) | MATCH | Buttons, no drag library; position IS array order and the server numbers them. |
| 6 | Rows are removable | `plan-modal.tsx:1131`–`1143` (`button-plan-stop-remove-*`) | MATCH (additive) | Not drawn in the artboard. |
| 7 | "**Add another stop** — for road trips and multi-city plans" | `plan-modal.tsx:1148`–`1163` (`button-plan-add-stop`) | **MATCH (verbatim, both lines)** | Present because `stopsShape(golf-trip) === "many"` (`experience-template-tabs.seed.ts:4907`). `disabled` only at `MAX_PLAN_STOPS` — capability exhausted, not absent. |
| 8 | An unlocated stop is flagged | `plan-modal.tsx:1093`–`1101` (`text-plan-stop-unlocated-*`) | **MATCH (§13) — additive** | "not located — no pin has been placed for this stop". No coordinates are collected here and none are derived from a name (`plan-modal.tsx:124`–`128`). |
| 9 | The sequence summary | `plan-modal.tsx:1165`–`1180` (`text-plan-stop-sequence`) | **MATCH (§13) — additive** | "A → B → C" plus "the order you'll visit them — no route, distance or travel time is calculated" (Locked Decision 22c). Shown only once >1 stop is named: a sequence of one is not a sequence. |
| 10 | Footnote "Same modal as the wedding. Plans with several stops still see the events step — tee times are timed appointments." | `plan-modal.tsx:879`–`885` (`stepNote.where`, `many` branch) | Annotation vs functional note | Live note is "A vendor outside the cities you list is flagged when you add it to the plan." The artboard's line is a design annotation, not UI copy. The **claim** it makes is true: step 5 is gated on `showsSchedule`, not on stop count (`plan-steps.ts:124`–`127`), and `golf-trip` seeds `schedule:true`. |
| 11 | "Next: When" | `plan-modal.tsx:1614`–`1622` | MATCH | |
| 12 | A replace-list save can never delete a list it did not read | `plan-modal.tsx:266`–`275`, `:442`–`452` | MATCH (ruled) | `stopsReadOk` gates the write; a 401/403/offline read leaves the stop write skipped. "Losing an edit is recoverable; deleting a list we could not see is not." |

## Classification

- **(A) contained:**
  - **#4** — render the ordinal on row 1 in `client/src/components/trip/plan-modal.tsx:1044`–`1061` when `stopsMany` is true (the `aria-label="Stop 1"` already exists there), so the list reads 01/02/03. Keep the `Destination` label under `one`.
  - **#2** — if the artboard's per-occasion question is wanted, `stepTitle.where` (`client/src/components/trip/plan-modal.tsx:865`) branches on `stopsShape`/vocabulary the way `stepTitle.who` already branches on `noun`. Low value; the current wording is true of both shapes.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #6, #8, #9, #12.

**Not verifiable without a running server:** that `PUT /api/trips/:tripId/destinations` round-trips the three stops and re-mirrors `trips.destination` (server-side, Locked Decision 34).
