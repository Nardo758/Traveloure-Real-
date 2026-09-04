# Audit brief — TravelWhere (Golf trip · Where, stops)

**Mock:** `docs/design/wedding-flow/TravelWhere.dc.html`. Same step-rail modal shape as
ModalWhere, occasion "Golf trip", but the field is now an **ordered stop list**: 01 Edinburgh,
Scotland / 02 St Andrews / 03 Dornoch, plus "Add another stop". Copy: "Same modal as the wedding.
Plans with several stops still see the events step — tee times are timed appointments." Footer:
"Next: When".
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding, and
`wedding-modal-where.audit.md` for the shared ordered-stops finding (HELD). This brief adds the
golf-specific angle: which real `experience_types` row a "golf trip" actually resolves to, and
whether that row's switches even support this artboard's later steps.
**Live surfaces:**
- `server/services/landing-moments.ts:59-71` — the "golf" landing moment's occasion mapping
- `client/src/components/EnhancedPlanningModal.tsx:66-70,189-204` — multi-destination chips (unordered, unstored as rows)
- `docs/design/wedding-flow/README.md` / `WEDDING_FLOW_BUILD_SEQUENCE.md` §0 F4 — the `trip_destinations` HELD blocker

## What the mock ratifies

1. A golf trip needs an **ordered, numbered, multi-stop** list — same UI shell as ModalWhere, but
   populated with 3 stops.
2. "Same modal as the wedding" — i.e., this is the SAME step-2 UI, just fed multiple stops instead
   of one.
3. A forward reference: "Plans with several stops still see the events step" — implying stops and
   the schedule step (step 5) are independent, consistent with Locked Decision 28's design.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Ordered numbered stop list (01/02/03) with "Add another stop" | Same as `wedding-modal-where.audit.md`'s ordered-stops finding | **NOT BUILT / HELD** | No `trip_destinations` table or ordered-stop UI exists anywhere. `EnhancedPlanningModal`'s multi-destination chips (`EnhancedPlanningModal.tsx:396-414`) are unordered and, on submit, flattened into one joined string (`:278`) — never persisted as discrete, reorderable rows. Ruled HELD, not a simple gap — see the README/build-sequence citations in the ModalWhere brief. |
| "Golf trip" as a real occasion with real switches | `server/services/landing-moments.ts:59-71` (code comment: `"Golf has no seeded row of its own; a golf trip IS the generic travel occasion."`, `experienceSlug: "travel"`) | **DIVERGENCE (occasion identity)** | There is no seeded `experience_types` row for golf specifically — a golf trip resolves to the generic `"travel"` occasion (`server/seed-experience-types.ts:8`, switches `stops: "many", duration: "range", schedule: false, guests: false, vocabulary: "travelers"` — see `server/seeds/experience-template-tabs.seed.ts:4796-4798`). This is directionally consistent with "many stops" but is worth flagging: any occasion-switch-driven UI built for this mock would today receive the GENERIC travel occasion's switches, not a golf-specific row — which matters for the TravelEvents brief below. |
| "Same modal as the wedding" | *(no shared modal exists at all — see step1/where briefs)* | NOT BUILT | Consistent with the overarching finding: there is no shared step-rail modal for either occasion to reuse. |
| "Plans with several stops still see the events step" | `occasion-switches.ts:56-66` (`showsSchedule`), seed `travel` row `schedule: false` | **DIVERGENCE** | The occasion this mock's golf trip actually maps to (`travel`) has `default_schedule: false` — per the live reader, `showsSchedule()` would return `false` and the "What's happening" step would NOT appear for a golf trip today, contradicting this mock's own forward-looking claim. See the TravelEvents brief for the full consequence. |
| "Next: When" progression | *(no rail exists)* | NOT BUILT | Shared finding. |

## Already ruled

- The ordered-stops gap is ruled HELD (same citation as ModalWhere brief).
- The golf→"travel" occasion mapping is a deliberate, documented choice (`landing-moments.ts:70`, "Golf has no seeded row of its own; a golf trip IS the generic travel occasion") — not itself a bug, though its DOWNSTREAM consequence (schedule step being switched off) is not called out anywhere as intentional and is worth flagging.

## Not built

- Ordered multi-stop storage/UI (HELD).
- Any golf-specific occasion row or switches.
