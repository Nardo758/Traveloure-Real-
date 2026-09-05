# `Mismatch.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Mismatch.dc.html` (Location mismatch confirm)
**Live surface:** `client/src/lib/location-mismatch.ts`, `client/src/components/location-mismatch-dialog.tsx`, `client/src/lib/plan-stops-writer.ts`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledgers `2026-09-04-location-mismatch` (the alert, 54/54) + `2026-09-04-plan-stops-ui` (the third action, 66/66); CLAUDE.md **Locked Decision 34**.
**v1 brief:** none (README marked it **built**, with one RULED divergence).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Headline "**This is in Osaka.**" | `location-mismatch.ts:259`–`261`; rendered `location-mismatch-dialog.tsx:70`–`76` (`text-mismatch-headline`) | **MATCH (verbatim)** | `This is in ${alert.listingCity}.` |
| 2 | Subline "**Every event on your plan is in Kyoto.**" | `location-mismatch.ts:270`–`277`; rendered `:77`–`82` (`text-mismatch-subline`) | **MATCH (verbatim)** | Live additionally has an event-scoped sentence and a **multi-stop** sentence ("Your plan stops in A, B and C.") the artboard does not draw — the single-city sentence is not true of a three-stop plan, and inventing one would be the failure §13 names. |
| 3 | Listing row "Osaka Sweets Studio / Wedding cake · from $310" | `location-mismatch-dialog.tsx:85`–`96` (`row-mismatch-listing`) | MATCH | Meta rendered only when present. |
| 4 | Honesty line "**Nothing is measured or guessed here. It is simply not in a city your plan names.**" | `location-mismatch.ts:290`–`293` (`MISMATCH_HONESTY_LINE`); rendered `:98`–`100` | **MATCH (verbatim, exported as a constant)** | This is the line that authorises the surface to exist at all. |
| 5 | Action "**Add anyway**" | `location-mismatch-dialog.tsx:103`–`110` (`button-mismatch-add-anyway`) | MATCH (verbatim) | |
| 6 | Action "**Add Osaka as a stop**" | `location-mismatch.ts:284`–`286` (`addAsStopLabel`); rendered `:111`–`121` (`button-mismatch-add-as-stop`) | **MATCH — and hidden, never disabled** | `{onAddAsStop ? … : null}` — when the caller cannot write stops (guest, non-owner, unread list) the button is **omitted**, which is the ruled posture. Label is derived from the decision, never restated at a call site. Writes through the ONE client writer `plan-stops-writer.ts`, shared with the plan modal. |
| 7 | Action "**Cancel**" | `location-mismatch-dialog.tsx:122`–`129` | MATCH (verbatim) | |
| 8 | Action order: Add anyway · Add as a stop · Cancel | `location-mismatch-dialog.tsx:102`–`129` | MATCH | |
| 9 | Footnote "Shown only when the listing has a location." | `location-mismatch.ts:201`–`256` | MATCH | A listing with no resolvable location produces no alert (and the sentinel "Unknown" is treated as no location — the bug class `plan-entry-cta.tsx:26`–`29` names). |
| 10 | Footnote "**Plans with more than one stop are not flagged.**" | `location-mismatch.ts:217`–`256` (`comparisonTargets`, `evaluateLocationMismatch`) | **ALREADY-RULED — deliberately NOT implemented** | `2026-09-04-location-mismatch` ruled *in advance* that the check reads the event first and then EVERY stop, and is never suppressed by stop count; `2026-09-04-plan-stops-ui` upheld it. The multi-stop subline (#2) exists precisely because multi-stop plans **are** checked. Do not "fix" this. |
| 11 | The dialog never blocks or writes | `location-mismatch-dialog.tsx:18` | MATCH (ruled) | "It is ADVISORY: it never blocks the add, it writes nothing, and Cancel persists nothing." (See `wedding-slip.v2.audit.md` #11 — this is why no item can carry a persistent "flagged" badge.) |

## Classification

- **(A) contained:** none.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** **#10** (the artboard's footnote is ruled against and must stay unimplemented), #6's omit-when-unwritable posture, #11.

**Not verifiable without a running server:** that `onAddAsStop` is actually supplied by every real caller that owns the plan (the gate's positive case).
