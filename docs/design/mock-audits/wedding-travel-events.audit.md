# Audit brief — TravelEvents (Golf trip · step 5, tee times)

> **This brief's headline finding is CLOSED** (ledger `2026-09-04-golf-occasion-and-housekeeping`).
> Golf now has its own `golf-trip` occasion row with `schedule: true` and its own tee-time presets
> (Round 1–4, Whisky bar), and the landing Moment points at it instead of the generic `travel`
> occasion — so the step this artboard draws is REACHABLE for a golf trip. The findings table below
> is left exactly as audited (report, don't repair; it is a dated record). Still open and unchanged:
> the Event / Day / Time / Place TABLE, which needs the HELD time-of-day column, and the "Driver
> between links" chip, which was not among the presets that lane authored.

**Mock:** `docs/design/wedding-flow/TravelEvents.dc.html`. Modal titled "Your golf trip · May 14 to
18 → What's on the schedule?" (step rail, What's happening active). Tickable chips: Round 1–4,
Whisky bar, Driver between links, Something else. Once ticked, each becomes a row in a table:
Event / Day / Time / Place, e.g. "Round 1 · Fri, May 15 · 08:10 · St Andrews Old Course." Copy:
"Days and times default to your plan. Change any of them now or later from the slip." / "No guest
list on this plan — the Guests switch is off." CTA: "Create plan · 4 events".
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding. This artboard
is the one with the sharpest, best-evidenced live contradiction of the six step/travel mocks: the
occasion it depicts is switched OFF for the very feature it depicts.
**Live surfaces:**
- `client/src/lib/occasion-switches.ts:56-66` — `showsSchedule()`
- `client/src/components/trip/edit-trip-panel.tsx:507-536` — the schedule chip step (`data-testid="etp-step5-schedule"`), server-preset-driven
- CLAUDE.md Locked Decision 30 / `WEDDING_FLOW_BUILD_SEQUENCE.md` §0 F4 — no time-of-day column on `user_experiences`

## What the mock ratifies

1. A tickable chip list of the occasion's own preset events, plus a free-text "Something else".
2. Each ticked chip becomes an EVENT with **Day, clock TIME, and Place**, shown in a table.
3. "No guest list on this plan — the Guests switch is off" — an explicit, correct read of
   `default_guests` for this occasion.
4. CTA counts events created ("Create plan · 4 events").

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| The schedule/chip step existing at all, for THIS occasion | `occasion-switches.ts:56-66` (`showsSchedule`) — resolves `false` for the `travel` occasion golf trips map to (`server/seeds/experience-template-tabs.seed.ts:4796-4798`, `schedule: false`) | **DIVERGENCE — the whole step is switched off for this occasion** | This is the sharpest finding in the wedding-flow artboard set. The mock's own entire premise — golf trips get a "What's happening" step with Round 1–4/Whisky-bar chips — cannot occur under the current occasion-switch data, because `showsSchedule()` reads `default_schedule` from whatever real `experience_types` row the plan is bound to, and the row golf trips resolve to (generic `travel`, per `landing-moments.ts:70`) has `schedule: false`. Even where the chip-step MECHANISM is built (see next row), it would never render for a golf trip today. |
| Tickable preset chips + free-text "Something else", server-sourced | `edit-trip-panel.tsx:507-536` — reads `GET /api/logistics/presets/:slug` (`edit-trip-panel.tsx:197-206`), never a client-restated list | MATCH (mechanism), unreachable for this occasion | The mechanism itself is real and correctly server-derived (per §18 rule 1, never restated client-side) — but see above: it is gated behind a switch that is off for golf trips, so it's unreachable in this scenario even though it exists in code. |
| Each event carries a clock TIME (08:10, 09:00, etc.) | CLAUDE.md `WEDDING_FLOW_BUILD_SEQUENCE.md` §0 F4 table; `user_experiences` schema (no time-of-day column) | **NOT BUILT / HELD** | This is independently, explicitly documented as a blocker: "no time-of-day column on `user_experiences`" blocks "clock times on `WhichEvent`; `TravelEvents` tee times" per the build-sequence doc's own F4 table and the wedding-flow README's own note on this exact artboard ("tee times are clock times, and `user_experiences` has no time-of-day column — the same constraint that kept clock times off `WhichEvent`. Rendering them would need a schema decision."). Even `EditTripPanel`'s own event-creation code confirms this: `POST /api/user-experiences` is called with `eventDate: start` and no time field at all (`edit-trip-panel.tsx:401-408`). |
| Each event carries a Place | `edit-trip-panel.tsx:404` (`location: trimmedDestination`) | PARTIAL MATCH | A location IS sent per created event, but it is the PLAN's single destination field, not a per-event place (the mock shows St Andrews Old Course / Kingsbarns / Carnoustie / Royal Dornoch — four DIFFERENT places for four events on one multi-stop trip). Given the ordered-stops gap (TravelWhere brief), there is no live way to assign a different place per event today. |
| "No guest list on this plan — the Guests switch is off" | `occasion-switches.ts:69-78` (`guestListSetting`), `travel` seed row `guests: false` | MATCH (concept) | This ONE claim in the mock is fully consistent with live data: the `travel` occasion's `default_guests` is indeed `false`, so `guestListSetting()` would correctly report no guest list — the mock is right about this even though it's wrong about the schedule step being active. |
| "Create plan · 4 events" CTA, event-counted | `edit-trip-panel.tsx:552-556` (`eventCount > 0 ? "Create plan · N events" : "Save"`) | MATCH (mechanism) | The live save button DOES count events this way — again, correct mechanism, gated behind a switch that's off for this specific occasion. |

## Already ruled

- The missing time-of-day column is **ruled HELD** — CLAUDE.md Locked Decision 30 and the build-sequence doc's F4 both name it as a real blocker requiring a decision-maker schema call, not an oversight.
- The schedule-switch-off consequence for golf trips is NOT independently ruled anywhere — it follows mechanically from the (ruled, deliberate) golf→"travel" occasion mapping, but nobody has stated "and therefore golf trips get no schedule step" as an intended outcome. Worth surfacing to the decision-maker rather than silently building toward the mock's contradicting premise.

## Not built

- Per-event clock time (HELD, schema decision needed).
- Per-event distinct place (blocked on the same ordered-stops gap as TravelWhere).
- The schedule step is mechanically built but unreachable for the occasion this mock depicts.
