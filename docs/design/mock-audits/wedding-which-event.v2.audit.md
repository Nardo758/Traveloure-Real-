# `WhichEvent.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/WhichEvent.dc.html` (Add to Plan · which event?)
**Live surface:** `client/src/lib/which-event.ts`, `client/src/components/trip/which-event-dialog.tsx`, `client/src/lib/slip-events.ts` (`eventMetaLine`), `client/src/pages/service-detail.tsx`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledgers `2026-09-04-which-event-picker`, `2026-09-04-which-event-hint`, `2026-09-04-event-time-ui`; CLAUDE.md **Locked Decisions 31 / 35**. Pinned by `client/src/lib/__tests__/which-event.test.ts` + `client/src/components/__tests__/which-event-picker.test.tsx`.
**v1 brief:** none (README marked it **built**; both former omissions closed).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Subject card "Hanamizuki Florals" + "Florist · Kyoto · from $420" | `which-event-dialog.tsx:118`–`141` (`which-event-subject`, `which-event-subject-meta`) | MATCH | The meta line renders only when the caller has one — never a placeholder (§13). |
| 2 | Subject sub-label "ceremony & reception" | `which-event-dialog.tsx:118`–`141` | Not represented | The picker takes `{title, meta}` only; a third line has no slot. Cosmetic; the artboard's third line is listing copy, not picker chrome. |
| 3 | Heading "**Which event?**" | `which-event-dialog.tsx:283` | MATCH (verbatim) | Also the `role="radiogroup"` accessible name (`:144`). |
| 4 | Four event rows | `which-event.ts:191`–`216` (`whichEventChoices`) | MATCH | One choice per `user_experiences` row, in the SERVER's order (`2026-09-04-event-order`), duplicates collapsed. |
| 5 | A **fifth** choice for the implicit event | `which-event.ts:113`, `:196`–`201` | **DIVERGENCE — additive** | Live always leads with **"No particular event"**. The artboard draws only the named four. This is Locked Decision 29's implicit unnamed event made selectable, so it is the ruled shape; but it is on screen and the artboard does not show it. |
| 6 | Hint "**suggested for florists**" on the Ceremony row | `which-event.ts:224`, `:244`–`260`; rendered `which-event-dialog.tsx:250`–`258` (`which-event-hint-*`) | **MATCH — exact, down to the typography** | Reads `experience_types.roles_needed` (migration 280) shipped on the row by the server; `wedding` seeds `florist` (`experience-template-tabs.seed.ts:4801`) and `occasionRoleNoun` maps it to "florists" (`shared/occasion-role-nouns.ts:46`). Live style is mono / 10px / `uppercase` / `0.06em` / teal — the artboard's inline style is `font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#226B6B`. Identical. |
| 7 | No "not suggested" counterpart | `which-event.ts:241`–`243`, `:250`–`259` | **MATCH (§13)** | Every "no" is silence. A non-match, an event with no roles, a listing with no category key: all render nothing. The client **restates no list** — it calls one pure function (Phase C's rule). |
| 8 | Clock line "**Sat 15:00 · Nanzen-ji**" | `slip-events.ts:182`–`194`; rendered `which-event-dialog.tsx:260`–`268` (`which-event-meta-*`) | **DIVERGENCE — format only** | Live emits `"EEE, MMM d"` + time → **"Sat, Oct 3 15:00 · Nanzen-ji"**. The artboard's is the short weekday with no date. Substance matches: the time comes from `start_time` and **nowhere else**, and a row with no time shows its day alone, never a midnight. |
| 9 | Rows with time but no place ("Fri 19:00", "Sat 18:00", "Sun 10:30") | `slip-events.ts:192`–`193` | MATCH | `[when, location].filter(Boolean).join(" · ")` — the place segment simply drops. |
| 10 | Nothing pre-selected; CTA "**Add to Ceremony**" | `which-event.ts:279`–`282`; `which-event-dialog.tsx:174`–`184` (`which-event-confirm`) | **MATCH** | `whichEventCtaLabel` → `Add to ${title}`, falling back to `ADD_TO_PLAN_LABEL` for the implicit choice or a titleless row. Confirm is **disabled until a row is chosen** (`:179`) — deliberately, because defaulting to the implicit event would answer for the traveler. |
| 11 | Footnote "A plan with one event skips this question." | `which-event-dialog.tsx:57`, `:162`; `which-event.ts:153` (`shouldAskWhichEvent`) | MATCH (verbatim) | |
| 12 | Cancel | `which-event-dialog.tsx:166`–`173` | MATCH (additive) | Not drawn in the artboard. |

## Classification

- **(A) contained:**
  - **#8** (and `wedding-slip.v2.audit.md` #6, the same line) — if the artboard's short form is wanted, give `eventMetaLine` (`client/src/lib/slip-events.ts:182`–`194`) a format option and pass it from the two call sites. **ONE implementation, two callers — do not fork it** (§18 rule 1); the slip and the picker must say the same thing about the same row.
  - **#5** — cosmetic reconciliation only: either update the artboard to draw the "No particular event" row, or nothing. Do **not** remove the choice; Locked Decision 29 requires the implicit event to be reachable.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #2, #7, #10 (disabled-until-chosen is the ruled shape here), #12.

**Not verifiable without a running server:** that `serviceCategoryKey` actually reaches the picker from `service-detail.tsx` for a real listing (the hint's whole input).
