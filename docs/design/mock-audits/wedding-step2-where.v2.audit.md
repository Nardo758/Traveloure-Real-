# `Step2Where.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step2Where.dc.html` (Plan modal · step 2 · Where; renamed from `ModalWhere.dc.html` by ledger `2026-09-04-golf-occasion-and-housekeeping`)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 2; `client/src/lib/plan-stops.ts`, `client/src/lib/plan-stops-writer.ts`, `client/src/lib/occasion-switches.ts` (`stopsShape`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors` (the step) + `2026-09-04-plan-stops-ui` (the stop control); CLAUDE.md **Locked Decisions 33 / 34**.
**v1 brief:** `wedding-modal-where.audit.md` (filename unchanged — an audit filename is a stable reference).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your plan" | `plan-modal.tsx:849`–`860` | MATCH | |
| 2 | Title "Where is it happening?" | `plan-modal.tsx:865` | MATCH (verbatim) | |
| 3 | Occasion pill "Wedding · change" | `plan-modal.tsx:936`–`949` (`plan-modal-occasion-pill`) | MATCH | Shown once an occasion is chosen and step 1 is behind us; clicking returns to step 1, which is what makes the skip reversible. |
| 4 | Rail with Where active | `plan-modal.tsx:959`–`986` | MATCH | |
| 5 | Label "Destination", field placeholder "Kyoto, Japan" | `plan-modal.tsx:1044`–`1061` (`input-etp-destination`) | MATCH (verbatim placeholder) | |
| 6 | "**Add another stop** — for road trips and multi-city plans" **shown on the wedding artboard** | `plan-modal.tsx:1063`, `1148`–`1163` | **ALREADY-RULED — hidden, not disabled** | The whole stops block is inside `{stopsMany && …}`; `stopsShape(wedding) === "one"` (`experience-template-tabs.seed.ts:4800`), so for the occasion this artboard depicts the control is **ABSENT**. That is the ruled posture (Locked Decision 33's HELD clause, upheld by `2026-09-04-plan-stops-ui`) and the artboard's own README row says so. The button's copy is otherwise **verbatim**. |
| 7 | Under `many`: an ordered numbered list | `plan-modal.tsx:1063`–`1146` | BUILT (see `wedding-travel-where.v2.audit.md`) | Row 1 IS the destination field (position-0 mirror); rows 2+ are `plan-stop-row-N`. |
| 8 | Note "A vendor outside this city **will be flagged before it lands on** your plan." | `plan-modal.tsx:879`–`885` (`stepNote.where`) | **DIVERGENCE — paraphrase, meaning preserved** | Live: "A vendor outside this city **is flagged when you add it to** the plan." Both describe the same advisory check (`location-mismatch.ts`). Live additionally varies the sentence under `many` ("outside the cities you list"), which the artboard does not draw and which is the more honest of the two. |
| 9 | "Next: When" | `plan-modal.tsx:1614`–`1622` | MATCH | |
| 10 | (not in the artboard) **"Plan name (optional)"** field below the destination | `plan-modal.tsx:1183`–`1192` (`input-etp-title`) | **DIVERGENCE — extra control** | Carried over from the `edit-trip-panel.tsx` the modal was renamed from. The artboard draws no title field on this step. Additive, harmless, but it is on screen and unratified for this step. |
| 11 | Coordinates | `plan-modal.tsx:124`–`128` | ALREADY-RULED | "COORDINATES ARE NOT COLLECTED HERE and are never derived from a name" — an unplaced stop stays UNLOCATED and says so (`:1096`–`1101`). |

## Classification

- **(A) contained:**
  - #8 — if the artboard's wording is preferred, change `stepNote.where` in `client/src/components/trip/plan-modal.tsx:882,884`. (Recommendation: **leave as is** — the live wording is more precise about *when* the check runs.)
  - #10 — either delete the "Plan name (optional)" field from step 2 (`client/src/components/trip/plan-modal.tsx:1183`–`1192`) or add it to the artboard; today the pixels and the code disagree about whether step 2 has two fields or one.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #6 (add-a-stop absent under `one`), #11 (no geocoding).

**Not verifiable without a running server:** none — this step is fully readable from source.
