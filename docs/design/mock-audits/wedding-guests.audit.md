# Audit brief — Guests (one list, a column per event)

**Mock:** `docs/design/wedding-flow/Guests.dc.html`. Full page: "Guests → Your Kyoto wedding · Oct
2 to 4", "Copy links" / "Invite by email (new)" actions, four stat tiles (**64 Invited / 58
Attending / 4 Countries of origin / 22 Brunch (family only)**), and ONE table with columns **Guest
/ From / RSVP / Dietary**, followed by **one checkmark column PER EVENT** (Rehearsal dinner /
Ceremony / Reception / Brunch) — 8 sample guests, each with a per-event ✓/blank/pending mark.
Footer: "One list. Each column is an event. An invite belongs to an event, so brunch can be family
only without a second list."
**Status:** The task brief and the wedding-flow README both flag this as the expected largest gap.
Confirmed, and the gap is sharper than "surface exists — UNAUDITED" suggests: **the README's cited
live surface is an orphaned, unmounted component with zero consumers** — this section corrects
that pointer before assessing fidelity.

## Correction to the README's cited live surface

The README/task point at `client/src/components/logistics/participant-travel-tracker.tsx`. That
component:
- has **no import site anywhere in the client** except the barrel re-export at
  `client/src/components/logistics/index.ts:23` (`export { ParticipantTravelTracker } from
  "./participant-travel-tracker"`) — `grep -rn "ParticipantTravelTracker"` across `client/src`
  finds no page or dialog that actually renders it;
- this is independently confirmed, in the codebase's own words, by ledger
  `2026-09-04-guest-list-reconciliation`: *"the logistics barrel exporting components nothing
  mounts (`ParticipantTravelTracker` among them, which is why this defect was unreachable in the
  running app)."*

**The actual live, reachable "Guests" surface is `client/src/components/GuestInviteManager.tsx`**,
mounted from `client/src/components/plancard/SlipLogisticsSection.tsx` and
`client/src/pages/trip-details.tsx`. This brief audits against that real surface.

## What the mock ratifies

1. **ONE list, MANY event-columns** — a single guest roster with a per-event checkmark grid.
2. Stat tiles: total invited, attending, countries of origin, and a "family only" event-specific
   count.
3. "Copy links" / "Invite by email" actions.
4. A guest can be marked for SOME events and not others on the same row (e.g., "Brunch (family
   only)" is a filtered subset of the same list, not a second list).

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| ONE list, per-event checkmark COLUMNS (the mock's central claim) | `GuestInviteManager.tsx:516-527` (`TableHeader`: Guest, Origin City, RSVP Status, Guests, Views, Invite Sent, Invite Link, Actions) | **NOT BUILT** | The live table has NO per-event columns at all — it is a flat list of invites for ONE event (`event_invites.experience_id`, per Locked Decision 29 — one event = one `user_experiences` row). There is no mechanism to show the same person's status across multiple events side-by-side. |
| Stat tiles: Invited / Attending / Countries / one event-specific count | `GuestInviteManager.tsx:458-495` (Total Invites, Accepted, Pending, Origin Cities) | PARTIAL MATCH | Three of four tiles match in spirit (Invited↔Total Invites, Attending↔Accepted, Countries of origin↔Origin Cities); "Pending" replaces the mock's event-specific "Brunch (family only)" tile — consistent with the single-event scope: there is no second event to carve a subset count out of. |
| "Copy links" / "Invite by email" | *(not verified in the excerpt read — column and stat evidence sufficient to establish list shape; action buttons not separately confirmed)* | UNVERIFIED | Out of this brief's depth budget; the structural (column) finding is the material one. |
| Guest, RSVP, Dietary-type per-guest facts | `GuestInviteManager.tsx:518-524` (Guest, Origin City, RSVP Status columns) | PARTIAL MATCH | Guest name and RSVP status both exist; "Dietary" has no confirmed live column on this table (dietary/mobility/accessibility facts live on the DIFFERENT `trip_participants` table, not `event_invites` — see below). |
| "An invite belongs to an event, so brunch can be family only without a second list" | Locked Decision 29 (`user_experiences.trip_id`, no uniqueness — many events per trip) + `event_invites.experience_id` (`shared/guest-invites-schema.ts:20`) | ALREADY-RULED (data model), NOT BUILT (UI) | The DATA MODEL genuinely supports this: an invite is keyed to one `experience_id`, and a trip can have many `user_experiences` rows. So "an invite belongs to an event" is true at the schema level. What's missing is the CROSS-EVENT VIEW the mock draws — today `SlipLogisticsSection.tsx:52` binds the guest surface with `.find()` — the FIRST of N events only (`const linkedExperience = allUserExperiences?.find((e) => e.tripId === tripId) ?? null;`) — so even though the schema could support many events, the UI can only ever open ONE event's guest manager at a time, never a combined view. |
| Two lists exist for "who is coming" (arrival/mobility/dietary vs. RSVP) | ledger `2026-09-04-guest-list-reconciliation` (full text) | **DIAGNOSED, NOT BUILT — proposal filed, unratified** | The ledger row this audit independently arrived at documents the SAME finding in far more depth: `event_invites` (RSVP-grade: token, public `/invite/:token` page, origin city) and `trip_participants` (logistics-grade: dietary/mobility/accessibility/arrival-departure/amount-owed) are two real, deliberately-separate lists ("overlapping populations under different predicates, not two implementations of one concept") that **share no key and no copy path** — verified by the ledger's own grep. A proposed link (`trip_participants.event_invite_id → event_invites.id`) is written up but explicitly marked **"PROPOSED (NOT BUILT, REQUIRES RATIFICATION)"** with an open question (a person invited to two events in one plan cannot be linked to both under a single FK) that must be decided FIRST. |

## Already ruled

- `ParticipantTravelTracker` being unreachable is a **known, ledgered fact**, not a new discovery of this audit alone — ledger `2026-09-04-guest-list-reconciliation` names it explicitly as one of several "FILED, NOT FIXED" items from that lane's own audit (`docs/audits/guest-list-reconciliation.md`).
- The "column per event" page is explicitly ruled as **not yet drawable honestly**: the same ledger row states *"THE CANVAS 'COLUMN PER EVENT' PAGE CANNOT YET BE DRAWN HONESTLY, AND THAT IS A SCHEMA QUESTION, NOT A LAYOUT ONE"* — from `event_invites` every column carries RSVP-grade facts only (never "who owes what / arrives when"), and from `trip_participants` there is one row set for the whole plan with no event dimension at all, so repeating it under each column would be a fabricated attribution (§13 violation). This is the single strongest piece of evidence in this entire audit set that a divergence is deliberately unbuilt pending a real product/schema decision, not an oversight.
- No automatic cross-list matching may be built without an explicit ruling (the ledger explicitly refuses fuzzy name/email matching as a "fabricated-authority failure §13 forbids").

## Not built

- The entire "one list, column per event" layout — confirmed both by direct code inspection (no per-event columns anywhere) and by the project's own prior diagnosis (ledger `2026-09-04-guest-list-reconciliation`), which additionally explains WHY it cannot be built without a decision-maker ratification first (the `trip_participants.event_invite_id` linkage proposal).
- `ParticipantTravelTracker.tsx` itself, as a live surface — it exists as source but is mounted nowhere; it should not be relied on as evidence of anything built.
- The `.find()`-based single-event binding in `SlipLogisticsSection.tsx:52` is a related, filed-but-unfixed gap: even a single-event guest manager can only ever address the FIRST event on a multi-event plan today.
