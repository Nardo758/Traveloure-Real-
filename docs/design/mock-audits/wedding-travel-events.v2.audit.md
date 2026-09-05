# `TravelEvents.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/TravelEvents.dc.html` (Golf trip · step 5 — tee times)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 5; `server/services/logistics-presets.service.ts` (`GOLF_TRIP_PRESETS`); `server/seeds/experience-template-tabs.seed.ts` (`golf-trip`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledgers `2026-09-04-golf-occasion-and-housekeeping` (the occasion row + presets) and `2026-09-04-event-time-ui` (the clock); CLAUDE.md **Locked Decision 35**.
**v1 brief:** `wedding-travel-events.audit.md` — **all three of its findings are now closed.**
**Concurrent lane:** the **sixth golf chip** is being built by `task-step4-variants-fields` (**lane G**) and is **NOT on `main`** — marked IN-FLIGHT below.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | **The step exists for a golf trip at all** | `experience-template-tabs.seed.ts:4906`–`4907`; `plan-steps.ts:124`–`127` | **CLOSED — was the v1 headline finding** | `golf-trip` is now its own seeded row with `schedule: true`; the landing Moment points at it (`server/services/landing-moments.ts:100`, `experienceSlug:"golf-trip"`) instead of the generic `travel` row whose `schedule:false` switched the whole step off. |
| 2 | Eyebrow "Your golf trip · May 14 to 18" | `plan-modal.tsx:849`–`860` | **MATCH — including the "to" separator** | |
| 3 | Title "**What's on the schedule?**" | `plan-modal.tsx:874` | **DIVERGENCE — copy** | Live: "What's happening?" for every occasion (`Step5Events.dc.html` uses "What's happening over the weekend?", so the two artboards disagree with each other and with the code). |
| 4 | Intro "Tick what applies. Each becomes its own event on the plan, with its own **day, time and place**." | `plan-modal.tsx:1356`–`1359` | **DIVERGENCE — copy, and one clause is untrue here** | Live: "…with its own **time, place and guest list**." `golf-trip` seeds `guests: false`, so the live intro promises this plan a per-event guest list it will never have. The artboard's own wording ("day, time and place") is the correct one for a guests-off occasion. |
| 5 | Chips **Round 1 · Round 2 · Round 3 · Round 4 · Whisky bar** | `logistics-presets.service.ts:945`–`997` (`GOLF_TRIP_PRESETS`) | **MATCH — five of six, exact labels** | Each round carries its **own** `anchorType` (`tee_time_round_1..4`) because `generatePresetsForTrip` de-duplicates by type; four rounds on one type would collapse to one anchor. |
| 6 | Chip "**Driver between links**" | — | **IN-FLIGHT (lane G)** | Not in `GOLF_TRIP_PRESETS` on `main`. The concept is real (the golf Moment's own copy names it — `landing-moments.ts:91`). |
| 7 | "Something else" drawn as a chip | `plan-modal.tsx:1386`–`1400` | **DIVERGENCE** | Same as `Step5Events.dc.html` #5: live it is a text input that becomes a full row. |
| 8 | Table Event · Day · Time · Place, populated with tee times | `plan-modal.tsx:1411`–`1490` | **BUILT — was the second v1 finding** | The per-event time is the row's own `startTime` (migration 282) and the per-event place is its own `location`, not the plan's destination — the two divergences the v1 brief recorded as HELD. Column layout is 3 wide (`Day & time` merged) — see `wedding-step5-events.v2.audit.md` #6. |
| 9 | Tee times **pre-filled** at 08:10 / 09:00 / 08:30 / 10:20 with course names | `plan-modal.tsx:1456`–`1474`; `logistics-presets.service.ts:938`–`944` | **ALREADY-RULED (§13)** | The Time cell has **no default at all** and the presets deliberately carry plain morning defaults with **no course names**: "seeding '08:10 at the Old Course' would be the platform stating a booking nobody made". The artboard draws a filled form, not a default. |
| 10 | Footnote "Days and times default to your plan. Change any of them now or later from the slip." | `plan-modal.tsx:1487`–`1490` | **DIVERGENCE — corrected, deliberately** | Live: "Days and **places** default to your plan… **A time is only ever the one you set.**" Correct as is. |
| 11 | "**No guest list on this plan — the Guests switch is off.**" | — | **DIVERGENCE — not built** | Live says nothing about the guests switch anywhere in the modal, and the step-4 note (`plan-modal.tsx:1347`–`1350`) asserts the opposite ("Your guest list is separate and per event"). Same root cause as #4. |
| 12 | CTA "Create plan · 4 events" | `plan-modal.tsx:1499`–`1578` | **ALREADY-RULED** | The three-branch finish; the count survives as the note. See `wedding-step5-events.v2.audit.md` #12. |

## Classification

- **(A) contained:**
  - **#4 + #11 (one fix)** — in `client/src/components/trip/plan-modal.tsx:1356`–`1359`, derive the intro's trailing clause from `guestListSetting(selectedOccasion)`: keep "…its own time, place and guest list" when guests are on, drop the guest-list clause when they are off, and (optionally) emit the artboard's "No guest list on this plan — the Guests switch is off." The same switch should gate the step-4 note at `:1347`–`1350`, which today tells a golf trip it has a per-event guest list.
  - **#3** — `stepTitle.events` (`client/src/components/trip/plan-modal.tsx:874`); the two artboards disagree, so pick one and amend the other rather than branching on occasion.
  - **#7** — cosmetic; see `wedding-step5-events.v2.audit.md`.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #9 (no seeded tee times or course names), #10, #12.
- **IN-FLIGHT (lane G), do not re-file:** #6.

**Not verifiable without a running server:** that `GET /api/logistics/presets/golf-trip` returns the five labels and that a golf plan's step 5 renders at all (both depend on the seeded row being present in the target database).
