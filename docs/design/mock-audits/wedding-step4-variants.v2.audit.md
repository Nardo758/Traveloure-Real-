# `Step4Variants.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step4Variants.dc.html` ("Step 4 · the vocabulary switch. Same control, four occasions.")
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 4; `client/src/lib/plan-vocabulary.ts` (`partyNoun`); `client/src/lib/occasion-switches.ts` (`guestListSetting`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33 (HELD clause) and §24.
**v1 brief:** `wedding-step4-variants.audit.md`.
**Concurrent lane:** `task-step4-variants-fields` (**lane G**) is building the budget-approver field, the accessibility note, the home-city default, the authoring relabel and the sixth golf chip. Those are **NOT on `main`** and are marked **IN-FLIGHT** below, not divergent.

## Findings

| # | Mock panel / section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | **Wedding** — title "Who is traveling with you?" | `plan-modal.tsx:867`–`873` | MATCH | `partyNoun` returns `travelers` for the wedding row's combination, so the travelers title is used. |
| 2 | **Wedding** — Adults / Kids steppers, note "Guests are per event — next step." | `plan-modal.tsx:1298`–`1350` | MATCH in substance | Live note is the longer "This is the party on your booking. Your guest list is separate and per event — next step." The artboard's is a condensed caption of the same sentence. Paraphrase; meaning preserved. |
| 3 | **Corporate event** — title "How many attendees?" | `plan-modal.tsx:867`–`870` | **MATCH** | `noun === "attendees"` branch. `corporate-events` seeds `vocabulary:"attendees"` (`experience-template-tabs.seed.ts:4809`). |
| 4 | **Corporate event** — a SINGLE "Attendees" stepper, **no Kids** | `plan-modal.tsx:1300`–`1303` | **DIVERGENCE** | The two fields are a fixed tuple: `[{key:"adults", label: partyLabelNoun}, {key:"kids", label:"Kids"}]`, rendered unconditionally. So a corporate plan is asked "Attendees" **and** "Kids", which the artboard deliberately does not draw — nobody brings kids to an attendee count. |
| 5 | **Corporate event** — "Who approves the budget?" + `[name or role]` | — | **IN-FLIGHT (lane G)** | Not on `main`. Locked Decision 33 records it as HELD ("no column holds either"). `plan-modal.tsx:137`–`139` states the same. |
| 6 | **Family occasion** — title "Who is coming?" | `plan-modal.tsx:867`–`872` | **MATCH** | `noun === "guests"` branch; `family-occasion` seeds `vocabulary:"guests"`, `guests:true` (`:4875`). |
| 7 | **Family occasion** — Adults 9 / Kids 4 | `plan-modal.tsx:1298`–`1345` | MATCH in shape | Same §13 caveat as `Step4Who` #4: live starts at "—". |
| 8 | **Family occasion** — "Anyone need a slower pace or step-free access?" + free-text | — | **IN-FLIGHT (lane G)** | Not on `main`. CLAUDE.md §24 is explicit that this must **not** be `trip_participants.accessibility_needs` (a different person's answer). |
| 9 | **Expert · authoring for a client** — heading "The client's party" | — | **IN-FLIGHT (lane G)** | Not on `main`; the modal has no authoring-actor relabel. |
| 10 | The one control, four occasions — i.e. the noun is the ONLY thing that varies | `plan-vocabulary.ts` (`partyNoun`), `plan-modal.tsx:846`, `:867`–`873` | MATCH — **this is the artboard's thesis and it holds** | One stepper pair, one title function, one noun source; `partyNoun` also honours `default_guests: false` by refusing guest wording outright. |
| 11 | Footnote per panel ("Nobody travels on this plan; attendees RSVP." / "Saved on the plan, shown to your expert." / "You are building this for someone else; the question changes actor, not shape.") | `plan-modal.tsx:889` (one fixed `stepNote.who`) | **DIVERGENCE — per-occasion footnotes not built** | Live shows one note for every occasion: "Left untouched, nothing is assumed…". |

## Classification

- **(A) contained:**
  - **#4** — in `client/src/components/trip/plan-modal.tsx:1300`–`1303`, omit the `kids` entry when the occasion's vocabulary is `attendees` (build the tuple from `noun`), so a corporate plan shows one stepper. **Omit, never disable.**
  - **#11** — if per-occasion notes are wanted, `stepNote.who` (`client/src/components/trip/plan-modal.tsx:889`) becomes a function of `noun`/`hasGuestList`, the same way `stepNote.when`/`stepNote.where` already branch. Low value; optional.
- **(B) needs a ruling:** none *new* — #5 and #8 already have one (HELD by Locked Decision 33; a column is a Coordination-Prevention decision), and lane G is executing it.
- **(C) ruled omission / correct as is:** #2 (condensed caption), #7.
- **IN-FLIGHT (lane G), do not re-file:** #5, #8, #9.

**Not verifiable without a running server:** the rendered noun for each of the 22 seeded occasions (this audit checked the four the artboard draws against the seeder rows).
