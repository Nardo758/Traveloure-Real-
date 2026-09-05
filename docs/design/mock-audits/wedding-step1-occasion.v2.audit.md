# `Step1Occasion.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step1Occasion.dc.html` (Plan modal · step 1 · Occasion)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 1; `client/src/lib/plan-steps.ts`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`, CLAUDE.md **Locked Decision 33** > the artboard.
**v1 brief:** `wedding-step1-occasion.audit.md` (written pre-build: "no stepped wizard exists"). **That headline is now closed** — the five-step rail is built.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your plan" | `plan-modal.tsx:849`–`860`, rendered at `:919` | MATCH | `eyebrow` composes only from what the plan holds; with nothing held it is exactly `"Your plan"` (§13). |
| 2 | Title "What are you planning?" | `plan-modal.tsx:864` | MATCH (verbatim) | |
| 3 | Step rail **Occasion · Where · When · Who · What's happening** | `plan-steps.ts:54`–`69`; rendered `plan-modal.tsx:959`–`986` | MATCH (verbatim labels, flow order) | `PLAN_STEP_LABELS` is the one home of these words. Every visible step is clickable (`:967`), which is what makes the same modal serve a new plan and an edit. |
| 4 | Eight occasion tiles with name + description | `plan-modal.tsx:1005`–`1032` | **MATCH in shape; the LIST IS THE REAL CATALOG, not the artboard's eight** | Tiles are `GET /api/experience-types` (`plan-modal.tsx:307`–`310`), the same query key the Trip Strip and IntakePanel use. The artboard's eight are a drawing of a 22-row catalog. Ruled: no hardcoded list. |
| 5 | Nothing pre-selected | `plan-modal.tsx:290` (`occasionSlug` starts `""`), `:1008` | MATCH (§13) | |
| 6 | Empty/failed catalog | `plan-modal.tsx:1000`–`1004` (`plan-occasions-unavailable`) | **MATCH (§13, better than the mock)** | "The occasion catalog is unavailable right now… nothing here is guessed on your behalf." The artboard draws no empty state; the live one refuses to fall back to an invented list. |
| 7 | Footnote "Or start from a Moment on the home page — the occasion arrives already set." | `plan-modal.tsx:1035`–`1037` | MATCH (verbatim) | |
| 8 | CTA-side note "Pick one to continue." | `plan-modal.tsx:877` (`stepNote.occasion`), rendered `:1575`–`1577` | MATCH (verbatim) | |
| 9 | "Next: Where" | `plan-modal.tsx:1614`–`1622` | MATCH | Label is `Next: ${PLAN_STEP_LABELS[next]}` — derived, never restated. |
| 10 | (control state) Next while nothing is picked | `plan-modal.tsx:1620` | **DISABLED, not hidden** | `disabled={step === "occasion" && !occasionSlug}`. This is the one place in the flow where the ruled "hidden, never disabled" posture is *not* applied — correctly, because the capability is present and the answer is merely unfinished, and the note at `:877` says so. Recorded as state, not a defect. |
| 11 | Hidden occasions (`default_visibility: hidden`) still choosable | `plan-modal.tsx:991`–`995` | MATCH (ruled) | Comment states it: `default_visibility` governs Share/guests on the plan, not whether the occasion can be chosen. |
| 12 | Which doors reach step 1 | `plan-steps.ts:119`–`134` | MATCH the Locked Decision 33 table | Hero (`landing.tsx:32,46` → `open()`), `/start/events` (`start-events.tsx:97`, no source), marketplace (`discover.tsx:1328`–`1331`, city only) all resolve to `startStep:"occasion"`. |

## Classification

- **(A) contained:** none.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #4 (real catalog beats the drawn eight), #6 (§13 empty state the artboard does not draw), #10 (disabled Next is the ruled shape here), #11.

**Not verifiable without a running server:** the actual tile set rendered for a live catalog (22 seeded rows) and its two-column wrap at the artboard's width.
