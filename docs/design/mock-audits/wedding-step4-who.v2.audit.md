# `Step4Who.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step4Who.dc.html` (Plan modal · step 4 · Who)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 4; `client/src/lib/plan-vocabulary.ts` (`partyNoun`, `partyTotal`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33 ("NO SCHEMA CHANGE", migration 241 de-masking).
**v1 brief:** `wedding-step4-who.audit.md`.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your Kyoto wedding · Oct 2 to 4" | `plan-modal.tsx:849`–`860` | **MATCH — including the "to" separator** | `${lead} · ${fmt(start)} to ${fmt(end)}`. |
| 2 | Title "Who is traveling with you?" | `plan-modal.tsx:867`–`873` | MATCH (verbatim) | `noun === "travelers"` branch; wedding's `vocabulary` is `guests` but `partyNoun` is fed `guestListSetting` too — see `Step4Variants` #3 for the per-occasion titles. |
| 3 | Two steppers: **Adults** and **Kids** | `plan-modal.tsx:1298`–`1345` (`label-etp-adults`, `label-etp-kids`, `value-etp-*`, `button-etp-*-minus/plus`) | MATCH | Adults' label is the vocabulary noun capitalised (`partyLabelNoun`, `:846`); Kids is literal. |
| 4 | Adults shows **2**, Kids shows **0** | `plan-modal.tsx:206`–`218`, `:1326`–`1332` | **ALREADY-RULED (§13) — the live empty state is "—", and there is NO explicit zero** | `stepDown` returns `""` below 1, so Kids can be *unset* but never *stated as 0*. Migration 241 de-masked party size precisely so an unanswered question stays NULL; a stored 0 would claim the traveler answered "none". The artboard draws a filled form, not a default. **A shown default and a chosen value must not be the same fact.** |
| 5 | Note "This is the party on your booking. Your guest list is separate and per event — next step." | `plan-modal.tsx:1347`–`1350` | **MATCH — verbatim, with a §13 refinement** | The trailing " — next step." is emitted only when step 5 is actually the next visible step (`next === "events"`); otherwise it ends with a period. The artboard cannot express that conditional. |
| 6 | Footnote "Left untouched, nothing is assumed: a party you never set is saved as not set." | `plan-modal.tsx:889` (`stepNote.who`) | MATCH (verbatim) | |
| 7 | "Next: What's happening" | `plan-modal.tsx:1614`–`1622` | MATCH | Present only when step 5 is visible; for a no-schedule occasion step 4 is last and the finish CTAs render instead (`:1499`). |
| 8 | Minus disabled at "not set" | `plan-modal.tsx:1315` | Recorded as state | `disabled={f.value === ""}` — a disabled affordance, but the capability is present and exhausted, not absent. Consistent with step 1's Next. |
| 9 | `travelers` derived, never a second author | `plan-vocabulary.ts` (`partyTotal`), used at save | MATCH (ruled) | The Trip Strip chip and the `adults`/`kids` columns cannot disagree. |

## Classification

- **(A) contained:** none.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #4 (steppers start at "—"; no explicit zero — migration 241 / §13), #5 (conditional tail), #8.

**Not verifiable without a running server:** that an untouched step 4 leaves `trips.adults`/`kids` NULL end-to-end (`PATCH /api/trips/:tripId/occasion` allowlist).
