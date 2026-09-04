# Audit brief — Step4Variants (Step 4 · the vocabulary switch — same control, four occasions)

**Mock:** `docs/design/wedding-flow/Step4Variants.dc.html`. Four side-by-side variants of the SAME
step-4 control, each showing the noun/fields changing per occasion: **Wedding** ("Who is traveling
with you?" Adults/Kids, "Guests are per event — next step."); **Corporate event** ("How many
attendees?" Attendees count + "Who approves the budget?" name/role field, "Nobody travels on this
plan; attendees RSVP."); **Family occasion** ("Who is coming?" Adults/Kids + "Anyone need a slower
pace or step-free access?" free-text, e.g. "Grandparents — step-free, short walks", "Saved on the
plan, shown to your expert."); **Expert · authoring for a client** ("The client's party" Adults/
Kids, "You are building this for someone else; the question changes actor, not shape.").
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding. This artboard is
the clearest illustration of `experience_types.vocabulary` (Locked Decision 28) — the mechanism it
draws is real and shipped; the four concrete field variants it draws (attendee/budget-approver pair,
accessibility free-text, expert-authoring framing) are largely not.
**Live surfaces:**
- `client/src/lib/plan-vocabulary.ts:135-149` — `partyNoun()` (the one vocabulary switch)
- `client/src/components/trip/edit-trip-panel.tsx:456-472` — the single rendered field this switch drives
- `server/seeds/experience-template-tabs.seed.ts:4792,4803` — `corporate-events`/`family-occasion` vocabulary values (`attendees`, `guests`)

## What the mock ratifies

1. ONE control whose noun and, in some variants, its FIELD SET changes per occasion —
   "same control, four occasions."
2. Corporate: the noun is "Attendees" and a second field ("Who approves the budget?") appears,
   with a note that nobody travels ("attendees RSVP").
3. Family occasion: an accessibility/pace free-text field appears alongside Adults/Kids, explicitly
   "shown to your expert."
4. Expert-authoring: the SAME control renders for an expert building on a client's behalf — "the
   question changes actor, not shape."

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| ONE control, noun changes per occasion (Travelers/Guests/Attendees) | `plan-vocabulary.ts:135-149` (`partyNoun`), consumed at `edit-trip-panel.tsx:459-472` | **MATCH (mechanism)** | This is exactly Locked Decision 28's `vocabulary` switch, correctly implemented as a single reader with a stated §13 fallback. The "same control, N occasions" framing is precisely how the code is built — one input, dynamic label. |
| Wedding variant: Adults/Kids fields, "Guests are per event" | Same as `wedding-step4-who.audit.md` | DIVERGENCE (see that brief) | The live control is one number, not Adults/Kids. |
| Corporate variant: "Attendees" noun | `server/seeds/experience-template-tabs.seed.ts:4792` (`slug: "corporate-events"`, `vocabulary: "attendees"`) | MATCH | Confirmed in the real seed data — a corporate-events plan's `partyNoun` resolves to "attendees". |
| Corporate variant: second field "Who approves the budget?" | *(no equivalent found in `edit-trip-panel.tsx` or elsewhere)* | **NOT BUILT** | No budget-approver field exists anywhere in the client. The live control is exactly one numeric input regardless of occasion — it never grows a second field. |
| Corporate variant: "Nobody travels on this plan; attendees RSVP" | *(no equivalent)* | NOT BUILT | No such distinguishing copy or behavior (e.g. suppressing a "travelers" framing in favor of an RSVP-only model) exists. |
| Family-occasion variant: accessibility/pace free-text ("Grandparents — step-free…"), "shown to your expert" | *(no equivalent in the create/edit party-size flow)* | **NOT BUILT** | `EditTripPanel` has no accessibility/mobility free-text field. Note a DIFFERENT, unrelated field exists elsewhere: `trip_participants.accessibilityNeeds`/`mobilityLevel` on `ParticipantTravelTracker` (see the Guests brief) — but per CLAUDE.md Locked Decision 24, that is a TRAVELER's own stated need on an individual `trip_participants` row, explicitly NOT the same concept as this mock's plan-level "anyone need…" note. The mock's field has no live counterpart. |
| Expert-authoring variant: same control renders for "the client's party" | *(not verified — no expert-authoring build surface for this specific step was opened)* | **NOT BUILT (unverified further)** | No occasion-switch-aware party-size control exists in the expert-authoring surfaces (`ready-made.routes.ts`, `expert-workspace.routes.ts` per CLAUDE.md Locked Decision 30's own text — those builds don't drain the pending-events pen "because there is no traveler principal", implying they don't run this same client-side form at all). Given `EditTripPanel` itself isn't reachable from an authoring flow, this variant has no known live counterpart. |
| Vocabulary fallback: NULL/unrecognised ⇒ "travelers" | `plan-vocabulary.ts:141-148` | MATCH | Exactly the §13 fallback stated in the mock's implicit design (an occasion with no vocabulary set reads as the plain-plan noun). |

## Already ruled

- The vocabulary-switch mechanism itself (Locked Decision 28, ledger `2026-09-03-switch-readers`) is ruled and shipped — the ONE part of this mock that is genuinely built.

## Not built

- The corporate budget-approver field, the family-occasion accessibility free-text field, and any occasion-switch-aware expert-authoring party control are all absent. Only the underlying noun-switching mechanism (not the four concrete field variants) is built.
