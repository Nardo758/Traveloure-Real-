# Audit brief — Step1Occasion (Plan modal · step 1 · Occasion)

**Mock:** `docs/design/wedding-flow/Step1Occasion.dc.html`. A modal titled "Your plan → What are
you planning?" with a **5-item step rail** (Occasion | Where | When | Who | What's happening,
Occasion active) and a grid of occasion tiles: Travel Planning, **Wedding**, Proposal, Honeymoon,
Anniversary, Birthday Party, Corporate Retreat, Girls Trip. Footer: "Or start from a Moment on the
home page — the occasion arrives already set." / "Pick one to continue." / "Next: Where →".
**Status:** Read this brief together with Step2Where (formerly ModalWhere) / Step3When / Step3Day / Step4Who /
Step4Variants — all six describe **one stepped wizard** (Occasion→Where→When→Who→What's-happening,
with a persistent step rail and "Next: X" progression) that **does not exist anywhere in the
client** in this shape. Two separate, unconnected live components each implement a *fragment* of
this content; neither is a multi-step modal with a step rail. This finding is stated once here and
referenced (not repeated in full) by the other five step briefs.
**Live surfaces (none is the wizard the mock draws):**
- `client/src/contexts/PlanningContext.tsx` — the real single planning entry (`usePlanning().open()`), a 2-tier chooser (choose → myself/ai/local/occasion), **not** a 5-step wizard
- `client/src/components/EnhancedPlanningModal.tsx` — the "Plan with AI" branch: one non-stepped scrolling form (destinations, dates, a **hardcoded 5-item** experience-type grid, traveler count, optional preferences) — no step rail, no "Next" button, no real occasion catalog
- `client/src/components/trip/edit-trip-panel.tsx` — a **different**, single non-stepped dialog that DOES read the real `experience_types` catalog and DOES implement switch-driven behavior (day-vs-range dates, party-noun vocabulary, schedule chips), but is reached only from the Trip-Strip / cart header / experience-template empty state — not from the primary "Plan this moment"/"Start planning" entry

## What the mock ratifies

1. A step rail persists across all 5 steps, with the active step highlighted.
2. Step 1 is a **grid of occasion tiles** (not a dropdown), each independently selectable, no
   preselection.
3. An escape hatch: starting from a landing Moment skips this step (occasion arrives pre-set).
4. "Next: Where" progression button, disabled until a tile is picked (implied by "Pick one to continue").

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| 5-item persistent step rail (Occasion/Where/When/Who/What's happening) | *(no match anywhere in `client/src`)* | **NOT BUILT** | No component implements a multi-step modal with a step rail. `PlanningContext.tsx`'s chooser dialog (`PlanningContext.tsx:255-405`) has exactly two internal "steps" (`choose` / `myself`), no rail, no numbered progression. `EnhancedPlanningModal.tsx` is a single scrollable form with no steps at all. |
| Occasion tile grid | `EnhancedPlanningModal.tsx:18-24` (`EXPERIENCE_TYPES`), rendered `EnhancedPlanningModal.tsx:543-565` | PARTIAL MATCH / DIVERGENCE | A tile grid does exist, but it is a **hardcoded 5-value list** (`travel`, `wedding`, `corporate`, `event`, `retreat` — emoji + label + one-line description), not the mock's grid of real occasions (Wedding, Proposal, Honeymoon, Anniversary, Birthday Party, Corporate Retreat, Girls Trip). The real, much richer occasion catalog (22 seeded `experience_types` rows including exactly those names — `server/seed-experience-types.ts`) is never read by this modal; it is read by the unrelated `EditTripPanel` (`edit-trip-panel.tsx:481-497`, `GET /api/experience-types`) instead. |
| "Or start from a Moment… occasion arrives already set" | `moments-section.tsx:208-219` (`open({ branch: "ai", experienceType, experienceSlug, momentKey })`) | MATCH (mechanism), but feeds the wrong modal | The Moments CTA does prefill `EnhancedPlanningModal`'s hardcoded `experienceType` and, separately, seeds `trip_context.experienceSlug` (read later by `EditTripPanel`) — so the *escape hatch* mechanism this line describes is real, even though the step-1 tile grid it's an alternative to is not the one built. |
| "Next: Where" progression, disabled until a tile is picked | *(no equivalent — no step rail exists)* | NOT BUILT | See rail finding above. |

## Already ruled

- Nothing here is ruled against. The single-planning-entry architecture (`PlanningContext.tsx`, ruling `2026-08-28-single-planning-entry` cited in its own file header) is itself a ratified, shipped design — but it is a **different, already-decided shape** (chooser → branch) from the mock's step rail, not a partial implementation of it. Whether the step-rail wizard is still the intended target or has been superseded by the chooser architecture is a product question outside this audit's scope (report, don't repair).

## Not built

- The entire step-rail wizard shell (used by all six Step*/Modal* artboards) is not built.
- The real occasion catalog is not surfaced anywhere in the primary planning-entry path (only in the secondary `EditTripPanel`).
