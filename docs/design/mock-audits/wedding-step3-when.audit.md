# Audit brief — Step3When (Plan modal · step 3 · When, event class)

**Mock:** `docs/design/wedding-flow/Step3When.dc.html`. Modal titled "Your Kyoto wedding → When is
it?", step rail (When active). Fields: **First day** / **Last day** date pair, plus a **"The main
moment"** sub-field (Ceremony, date + 15:00 time) with copy: "This is the anchor everything else is
timed around. Guests see it in their own time zone." Footer note: "A travel-class plan asks only
for the two days." / "Next: Who".
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding. This brief's
content — a date-RANGE shape plus an optional single "main moment" time — is unusual among the six
step mocks because its real logic (range vs. single-day, occasion-driven) genuinely IS implemented,
just not inside a stepped wizard.
**Live surfaces:**
- `client/src/lib/occasion-switches.ts:39-54` — `durationShape()`, the real day-vs-range reader
- `client/src/components/trip/edit-trip-panel.tsx:404-453` — the date fields (range branch), `:407-427`
- `client/src/components/trip/edit-trip-panel.tsx:558-582` (`writeMainMomentAnchor`) — the main-moment anchor write
- `client/src/components/EnhancedPlanningModal.tsx:495-540` — the AI-modal's own (always-range, no main-moment) date pair

## What the mock ratifies

1. Wedding is a **range** occasion (first day/last day), not a single day.
2. A "main moment" (the ceremony) can carry its own time, separate from the date range, and is
   explicitly framed as the schedule's anchor.
3. "Guests see it in their own time zone" — implies per-viewer timezone conversion of the anchor.
4. Contrast note: a plain "travel-class" plan only asks for the two days (no main-moment field) —
   i.e., this field is occasion-conditional, not universal.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Range-shaped date pair for Wedding (`default_duration: "range"`) | `occasion-switches.ts:52-54` (`durationShape`) + seed `server/seeds/experience-template-tabs.seed.ts:4799` (`switches: { ..., duration: "range", ... }` for `slug: "wedding"`) | MATCH (logic), wrong host component | `durationShape()` correctly resolves "range" for the wedding row, and `EditTripPanel` correctly branches to a first-day/last-day pair (`edit-trip-panel.tsx:430-453`, `data-testid="etp-step3-range"`) — but this lives in a single non-stepped dialog reached from the Trip Strip, not a "step 3 of 5" modal screen. |
| Occasion-conditional "main moment" field, appearing only for day-shaped occasions with a time | `edit-trip-panel.tsx:407-427` (`data-testid="etp-step3-day"`) | **DIVERGENCE (occasion mismatch)** | Live code shows the main-moment TIME field only in the **"day"** branch (`shape === "day"`), never alongside a range. Wedding's own seeded switches are `duration: "range"` (cited above) — so per the live occasion-switches contract, a wedding plan would get the range date pair with **no** main-moment time field at all. The mock shows both a range AND a main-moment time for the SAME wedding occasion; the live single-field-per-shape design cannot produce that combination as built today. |
| "Guests see it in their own time zone" | `client/src/services/trip-timezone.ts` (`resolveTripTimezone`, CLAUDE.md Locked Decision 30) + `edit-trip-panel.tsx:558-582` (anchor write, no explicit per-viewer conversion at render time) | PARTIAL / UNVERIFIED | A plan-level IANA timezone now exists (migration 279, Locked Decision 30) and is server-derived — real infrastructure for this claim exists — but this audit found no explicit per-guest render-time conversion logic for a `temporal_anchors` display; verifying the actual guest-facing render is out of this brief's scope (would need the temporal-anchor display component, not opened here). |
| "A travel-class plan asks only for the two days" (no main-moment for non-schedule occasions) | `occasion-switches.ts:56-66` (`showsSchedule`) | MATCH (concept) | `showsSchedule()` correctly returns `false` for an occasion with `default_schedule` unset/false — the "travel" seed row has `schedule: false` — so a generic travel plan does skip the schedule-driven fields, matching the mock's contrast note in spirit (though again, via `EditTripPanel`, not a stepped wizard). |
| "Next: Who" progression | *(no rail exists)* | NOT BUILT | Same finding as Step1Occasion. |

## Already ruled

- The day-vs-range/schedule-driven logic itself is **ruled and shipped**: CLAUDE.md Locked Decision 28 (migration 276), read by `occasion-switches.ts` per ledger `2026-09-03-switch-readers`. The gap this brief flags is not "the logic doesn't exist" but "the mock combines range-duration AND a main-moment time for one occasion, while the shipped reader treats those as mutually exclusive branches of the SAME switch" — worth flagging to the decision-maker as a possible product question, not a simple bug.

## Not built

- The step-rail shell (shared finding).
- A combined range-date-pair-plus-main-moment-time UI for occasions that want both (current code only offers one or the other, keyed off `default_duration`).
