# Audit brief — Step2Where (Plan modal · step 2 · Where)

> **Filename note:** this brief was written when the artboard was called `ModalWhere.dc.html` and was
> titled "THIS is step 2, the naming hides it". The artboard has since been renamed to
> `Step2Where.dc.html` (ledger `2026-09-04-golf-occasion-and-housekeeping`), which is what finding 1
> below asked for. This brief FILE keeps its own name — audit filenames are stable references.

**Mock:** `docs/design/wedding-flow/Step2Where.dc.html` (was `ModalWhere.dc.html`). Modal titled "Your plan → Where is it
happening?" with the same 5-item step rail (Where active) and a "Wedding · change" pill up top.
One field: **Destination** (prefilled "Kyoto, Japan"), plus "Add another stop — for road trips and
multi-city plans", and a note: "A vendor outside this city will be flagged before it lands on your
plan." Footer: "Next: When".
**Status:** See `wedding-step1-occasion.audit.md` for the shared finding that no stepped wizard
exists. This brief covers only what is specific to the "Where" content.
**Live surfaces:**
- `client/src/components/EnhancedPlanningModal.tsx:389-493` — destination input/chips (the closest fragment)
- `client/src/components/trip/edit-trip-panel.tsx:340-350` — a single destination text field (no multi-stop UI)
- `client/src/contexts/PlanningContext.tsx:356-366` — the chooser's own bare destination `Input`
- CLAUDE.md README note (`docs/design/wedding-flow/README.md`): ordered stops need `trip_destinations`, which does not exist — **HELD**

## What the mock ratifies

1. This step is titled "Where" and is step 2. When this brief was written the artboard filename was
   `ModalWhere`, not `Step2Where`, and the README called that out as intentional rather than a
   naming bug; the rename has since been ratified and done.
2. One destination field, prefillable, with an "Occasion pill · change" affordance to go back.
3. "Add another stop" for road-trip/multi-city plans — an **ordered** stop list is implied.
4. A vendor-location honesty note ("flagged before it lands on your plan").

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Single destination field, as one step of a rail | `EnhancedPlanningModal.tsx:417-446` (single-mode) | PARTIAL MATCH | A destination input exists and behaves similarly (type-ahead lookup, `EnhancedPlanningModal.tsx:144-167`), but it lives inside one all-in-one form, not a discrete "Where" step reached via a rail. |
| "Wedding · change" pill (occasion context carried into this step) | *(no equivalent)* | NOT BUILT | Neither `EnhancedPlanningModal` nor `EditTripPanel` shows an occasion-context pill while editing destination; `EditTripPanel` puts occasion and destination in the SAME single-screen form (`edit-trip-panel.tsx:340-350` destination, `:478-497` occasion select) rather than sequential steps with a "change" affordance. |
| "Add another stop — for road trips and multi-city plans" (ordered multi-stop) | `EnhancedPlanningModal.tsx:66-70,103-105,189-204` (`mode: 'multi'`, `destinations: Destination[]`, `handleAddDestination`) | PARTIAL MATCH / **HELD** | `EnhancedPlanningModal` DOES support adding multiple destination chips in `mode='multi'` — but (a) `EditTripPanel`, the component that actually reads real occasion switches, has only ONE destination field with no multi-stop UI at all; (b) neither path persists an ORDERED, reorderable stop list — destinations are just joined into one string (`destinations.map(d => \`${d.city}, ${d.country}\`).join('; ')`, `EnhancedPlanningModal.tsx:278`) before being sent to the AI generator, never stored as discrete rows. This matches the README/CLAUDE.md-documented blocker: ordered stops need a `trip_destinations` table that does not exist — **HELD pending ratification**, not a simple gap to close. |
| "A vendor outside this city will be flagged before it lands on your plan." | *(no equivalent found)* | NOT BUILT | No location-mismatch copy appears at destination-entry time. (Note: a *related* but different surface — flagging a mismatch AFTER an item is added — is built: `client/src/lib/location-mismatch.ts`, ledger `2026-09-04-location-mismatch`, the Mismatch.dc.html artboard, out of this audit's scope.) |
| "Next: When" step progression | *(no rail exists)* | NOT BUILT | Same finding as Step1Occasion. |

## Already ruled

- The ordered-stop gap is **ruled HELD**, not merely unbuilt-and-open: CLAUDE.md's wedding-flow README states "Ordered stops have no `trip_destinations` table; HELD" and `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md` §0 F4 lists it as a real blocker needing decision-maker ratification before work starts (Phase E). Do not treat the multi-stop gap as an oversight — treat it as correctly not-yet-started.

## Not built

- The step-rail shell, the occasion-context "change" pill, and the vendor-location-flag copy at entry time are all unbuilt, independent of the HELD ordered-stops question.
