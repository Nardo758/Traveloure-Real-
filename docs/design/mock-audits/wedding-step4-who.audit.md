# Audit brief — Step4Who (Plan modal · step 4 · Who)

**Mock:** `docs/design/wedding-flow/Step4Who.dc.html`. Modal titled "Your Kyoto wedding · Oct 2 to
4 → Who is traveling with you?" (step rail, Who active). Two numeric fields: **Adults** (2) /
**Kids** (0). Copy: "This is the party on your booking. Your guest list is separate and per event —
next step." / "Left untouched, nothing is assumed: a party you never set is saved as not set."
**Status:** See `wedding-step1-occasion.audit.md` for the shared no-wizard finding. This artboard's
core distinction — the BOOKING party (who travels with you) vs. the per-event GUEST list — is a
real, ratified architectural line (Locked Decisions 28/29), but the live UI shape for the booking
party differs from what's drawn.
**Live surfaces:**
- `client/src/lib/plan-vocabulary.ts:88-149` — `partyNoun`, `travelersForSave`, `partyCountLabel`
- `client/src/components/trip/edit-trip-panel.tsx:456-472` — the single travelers numeric input
- `client/src/components/EnhancedPlanningModal.tsx:567-590` — the AI-modal's separate travelers stepper (unrelated occasion vocabulary)

## What the mock ratifies

1. **Two separate numeric fields**, Adults and Kids, for the booking party.
2. Explicit statement that this is distinct from the per-event guest list ("separate and per
   event — next step").
3. §13 honesty: an untouched field is saved as NOT SET, never defaulted to a guessed number.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Two separate fields: Adults / Kids | `edit-trip-panel.tsx:456-472` (`input-etp-travelers`, one field) | **DIVERGENCE** | The live occasion-aware form has exactly ONE numeric field (`travelers`), labelled dynamically by `partyLabel` (Travelers/Guests/Attendees per `partyNoun()`). There is no Adults/Kids split anywhere in the codebase for the plan-creation party — `EnhancedPlanningModal.tsx:567-590` similarly has one combined `travelers` stepper. |
| Booking party ≠ per-event guest list, stated explicitly | `edit-trip-panel.tsx:82-95` (code comment: "step 4 (party) `vocabulary`… step 5 (schedule)…"), `SlipLogisticsSection.tsx` guest surface, Locked Decision 29 | ALREADY-RULED / MATCH (concept) | The architectural split this mock draws — a booking-party headcount (`trips`/`trip_contexts.travelers`) vs. a per-event guest list (`event_invites`, one list per `user_experiences` row) — is real and ratified (Locked Decisions 28, 29; ledger `2026-09-04-guest-list-reconciliation` formally documents these as "TWO GUEST LISTS, TWO HONEST CONCEPTS"). The mock's framing is directionally correct even though the field shape (Adults/Kids) differs. |
| Untouched field saved as NOT SET, never a fabricated default | `plan-vocabulary.ts:107-116` (`travelersForSave`) | MATCH | Exactly the described behavior: `travelersForSave` returns `undefined` for an empty/zero/unparseable input, and `switchTripContext`'s REPLACE semantics clear the field rather than re-asserting a guessed `2` — the code comment cites this as a deliberate fix for a prior masking bug (migration 241). |
| Occasion-driven label word (would read "Guests" for wedding, per `vocabulary: "guests"` in the seed) | `edit-trip-panel.tsx:459` (`label-etp-party`) + `server/seeds/experience-template-tabs.seed.ts:4799` (wedding `vocabulary: "guests"`) | MATCH (mechanism) but reinforces the field-shape gap | For a wedding, the live single field would be labelled "Guests" (count), not "Adults"/"Kids" — underscoring that the live shape is genuinely a different field design, not a partial version of the mock's two-field design. |

## Already ruled

- The conceptual split (booking party vs. per-event guests) is ruled — Locked Decisions 28/29 and ledger `2026-09-04-guest-list-reconciliation`. Do not read the field-shape divergence below as contradicting this: the *concept* is ratified even though the mock's *field design* (Adults/Kids) has no ratified counterpart in code.

## Not built

- A two-field (Adults/Kids) party-size input does not exist anywhere; the live shape is one number with a dynamic noun.
- The step-rail shell (shared finding).
