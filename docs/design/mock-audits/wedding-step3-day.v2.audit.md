# `Step3Day.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step3Day.dc.html` (Plan modal · step 3 · a day, not a range — a date night)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 3, `durationShape()` "day" branch
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33 / 28.
**v1 brief:** `wedding-step3-day.audit.md`.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your plan" | `plan-modal.tsx:849`–`860` | MATCH | Same live-composition caveat as `Step3When` #1: the span appears once a date is entered. |
| 2 | Title "When is it?" | `plan-modal.tsx:866` | MATCH (verbatim) | |
| 3 | Pill "Date night · change" | `plan-modal.tsx:936`–`949` | MATCH | Live label is the seeded row's own `name` — "Date Night" (`experience-template-tabs.seed.ts:4802`). Casing only. |
| 4 | Single "**Date**" field, no range | `plan-modal.tsx:1197`–`1215` (`etp-step3-day`, `input-etp-start-date`) | **MATCH** | `durationShape(date-night) === "day"` (`:4803`). The "Last day" field is **absent**, not disabled. |
| 5 | "**Time**" field beside it | `plan-modal.tsx:1216`–`1227` (`input-etp-main-moment`) | MATCH — label paraphrased | Live label is "Time (**optional**)". A clarification, not a meaning change; it is also the honest one, since `mainMomentTime === ""` writes no anchor (§13). |
| 6 | No "The main moment" card on the day shape | `plan-modal.tsx:1261` (`shape !== "day" && wantsSchedule`) | MATCH | On a single-day occasion the date IS the moment's date, so the card would ask the same question twice. |
| 7 | Caption inside the card area: "Your own city, one evening. No stops, no range." | — (no such line) | **DIVERGENCE — not built** | Live renders no in-body caption on this step; only the footer note (#8) is present. |
| 8 | Footnote "Occasions that last a day ask for a date and a time, never a range." | `plan-modal.tsx:886`–`888` (`stepNote.when`, day branch) | MATCH (verbatim) | |
| 9 | "Next: Who" | `plan-modal.tsx:1614`–`1622` | MATCH | |
| 10 | Step 2 for this occasion | `plan-modal.tsx:1063`; `experience-template-tabs.seed.ts:4803` (`stops:"one"`) | MATCH the artboard's "No stops" claim | The stop list is absent for `one`. |

## Classification

- **(A) contained:** #7 — if the caption is wanted, it is one `<p>` in the `etp-step3-day` block (`client/src/components/trip/plan-modal.tsx:1197`–`1227`). Note it must be **derived, not literal**: "Your own city" is only true when the plan's destination is the traveler's home city, and `users.home_city` defaulting is **in flight (lane G)** — so writing it as a constant would be a claim (§13).
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #5 (the "(optional)" clarification), #6.

**Not verifiable without a running server:** none.
