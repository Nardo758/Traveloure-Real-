# Audit brief — Step3Day (Plan modal · step 3 · a day, not a range)

**Mock:** `docs/design/wedding-flow/Step3Day.dc.html`. Modal titled "Your plan → When is it?" for
a **Date night** occasion (step rail, When active). Fields: **Date** + **Time** (single pair, no
range). Copy: "Your own city, one evening. No stops, no range." and "Occasions that last a day ask
for a date and a time, never a range." Footer: "Next: Who".
**Status:** Companion to Step3When — same field family (`default_duration`), opposite branch
(`"day"`). See `wedding-step1-occasion.audit.md` for the shared no-wizard finding.
**Live surfaces:**
- `client/src/lib/occasion-switches.ts:39-54` — `durationShape()`
- `client/src/components/trip/edit-trip-panel.tsx:407-427` — the day branch (`data-testid="etp-step3-day"`)
- `server/seeds/experience-template-tabs.seed.ts:4802` — `slug: "date-night"` switches

## What the mock ratifies

1. For a **day-shaped** occasion (Date Night), the date step collapses to ONE date + ONE time —
   no first-day/last-day pair.
2. Explicit rule stated in-mock: "Occasions that last a day ask for a date and a time, never a
   range" — i.e. this is occasion-driven, not a free per-plan toggle.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Single Date + Time pair, no range, for a day-shaped occasion | `edit-trip-panel.tsx:407-427` (`shape === "day"` branch); `durationShape()` at `occasion-switches.ts:52-54` | MATCH (logic), wrong host component | `EditTripPanel` renders exactly a Date input + a "Main moment (optional)" time input when `durationShape(selectedOccasion) === "day"` — this is a real, correct implementation of the mock's rule. It is reached via the Trip-Strip edit dialog, not a step-rail modal. |
| Date Night maps to the "day" duration shape | `server/seeds/experience-template-tabs.seed.ts:4802` (`slug: "date-night"`, `switches: { stops: "one", duration: "day", schedule: true, guests: false, vocabulary: "travelers", visibility: "shown" }`) | MATCH | Confirms Date Night is seeded as a day-shaped occasion in the real catalog, consistent with the mock's premise. |
| "No stops, no range" | Same seed row — `stops: "one"` | MATCH (concept) | Date Night is also seeded as a single-stop occasion, consistent with "no stops" (in the sense of no multi-stop itinerary), though note `default_stops` is explicitly NOT read by `EditTripPanel` (`edit-trip-panel.tsx:87`, "Steps 1–2 are untouched: `default_stops` is deliberately NOT read, because an ordered stop list is unratified") — so the "no stops" behavior is a seed-data fact, not something the UI actively enforces or displays. |
| The time field is labelled "Main moment (optional)" live, vs. a plain "Time" in the mock | `edit-trip-panel.tsx:415-424` | MINOR DIVERGENCE | Cosmetic label difference only; same field, same semantics (an optional clock time for the day). |
| "Next: Who" progression | *(no rail exists)* | NOT BUILT | Shared finding. |

## Already ruled

- The day-shape branching itself is ruled and shipped (Locked Decision 28 / ledger `2026-09-03-switch-readers`), same as Step3When. This artboard's content is, of the six step mocks, the **closest to already matching real logic** — the only structural gap is the missing step-rail shell around it.

## Not built

- The step-rail shell (shared finding). Everything else in this specific artboard's content already has a correct, if differently-hosted, implementation.
