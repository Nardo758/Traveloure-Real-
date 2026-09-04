# Audit brief — TravelWhen (Golf trip · When, range only)

**Mock:** `docs/design/wedding-flow/TravelWhen.dc.html`. Modal titled "Your golf trip · 3 stops →
When are you going?" (step rail, When active). **First day / Last day** pair only (no main-moment
field, unlike Step3When). Copy: "Four rounds are four timed appointments. Step 5 follows." Footer:
"Next: Who".
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding. Simpler than
Step3When/Step3Day — this artboard is a plain range pair with no occasion-specific extra field, so
it maps more cleanly onto the real `durationShape()` "range" branch.
**Live surfaces:**
- `client/src/lib/occasion-switches.ts:39-54` — `durationShape()`
- `client/src/components/trip/edit-trip-panel.tsx:430-453` — the range branch (`data-testid="etp-step3-range"`)
- `server/seed-experience-types.ts:8` / `server/seeds/experience-template-tabs.seed.ts:4796-4798` — the `travel` occasion's `duration: "range"` switch (the occasion golf trips actually map to, per the TravelWhere brief)

## What the mock ratifies

1. A plain first-day/last-day range, no extra fields — appropriate for a multi-stop, multi-day
   trip with its own internal schedule (the rounds) rather than one "main moment".
2. A forward reference to step 5 ("Four rounds are four timed appointments. Step 5 follows.") —
   again asserting the schedule step will apply to this occasion.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Range-shaped date pair, no extra field | `edit-trip-panel.tsx:430-453` (`data-testid="etp-step3-range"`); `durationShape()` returns `"range"` for the `travel` occasion (its seeded `duration: "range"`) | MATCH (logic), wrong host component | Of the three date-step mocks (Step3When/Step3Day/TravelWhen), this is the cleanest match to the live `durationShape()` reader — a plain range pair with no conditional extra field is exactly what the "range" branch renders, and it's exactly what the occasion golf trips resolve to (`travel`) would produce. Still hosted in `EditTripPanel`, not a step-rail modal. |
| "Four rounds are four timed appointments. Step 5 follows." | `occasion-switches.ts:56-66` (`showsSchedule`) resolves `false` for `travel` (seed `schedule: false`) | **DIVERGENCE** | Same finding as the TravelWhere brief: the occasion this trip actually maps to has its schedule switch OFF, so per the live reader the "What's happening" step would not appear — directly contradicting this mock's own promise that "Step 5 follows." |

## Already ruled

- Nothing new to add beyond the TravelWhere brief's citation: the golf→"travel" mapping is a deliberate, documented choice, but its consequence for the schedule step is not itself called out as intentional anywhere.

## Not built

- The step-rail shell (shared finding). No occasion-specific gap beyond what TravelWhere/TravelEvents already describe.
