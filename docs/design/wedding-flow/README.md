# Wedding / occasion flow — ratified mock artboards

24 files: 22 `.dc.html` artboards, the `canvas.json` that lays them out, and the original
`wedding-on-the-landing-page.html`. Committed 2026-09-04.

## Why these are here

**They existed only in a session scratchpad and had never been committed anywhere.** Several are
cited as ratified authority by CLAUDE.md Locked Decisions 28–31 and by the `2026-09-0*` ledger rows
("the ratified mock draws…"), and the remote session container that held them is reclaimed after
inactivity. Rulings that cite a mock nobody can open are unfalsifiable. This commit is preservation
only — no code changes, no ruling changed, nothing built.

## Status — read this before treating the table as truth

The **live-surface** column below was resolved by grep and by the lanes merged on 2026-09-04. The
**fidelity** column is honest about what has actually been checked:

- **`ruled`** — the divergence is deliberate and a ledger row says so. Do not "fix" it.
- **`built`** — the lane that implements this artboard merged, and its own tests pin the behaviour.
- **`surface exists — UNAUDITED`** — a live surface was found at that path, but **nobody has
  compared it to this artboard**. It may match, may diverge, may be a different design entirely.
  Do not read this as "done".

An `UNAUDITED` row is not a claim of conformance. To turn one into a finding, write a brief under
`docs/design/mock-audits/` following that directory's `INDEX.md` rules of engagement — in
particular *report, don't repair*, and the note that dead routes here return **200 + HTML** from the
Vite catch-all rather than 404.

## Flow order — the canvas does not show it

`canvas.json` lists artboards in **creation order, not flow order**. The step naming is now
consistent: every step of the plan modal is `Step<N><Name>`. Two files were renamed by ledger
`2026-09-04-golf-occasion-and-housekeeping` — `ModalWhere.dc.html` → **`Step2Where.dc.html`** and
`ModalEvents.dc.html` → **`Step5Events.dc.html`** — because the old names read as a missing step 2
and an out-of-band step 5, which is exactly how the first audit of step 2 came to be titled "THIS
is step 2, the naming hides it". The canvas TITLES are unchanged; only the filenames moved.
The real order:

```
Landing        Before → Main → NavEntry → NavTuned
Plan modal     Step1Occasion → Step2Where (2) → Step3When / Step3Day (3)
                 → Step4Who / Step4Variants (4) → Step5Events (5)
Plan surfaces  StripLead → Slip → WhichEvent → Mismatch → Guests
Variants       OccasionRow, SlipProposal, Planner, TravelWhere, TravelWhen, TravelEvents
```

The rename was a **decision, not a tidy-up** — these are ratified artboards — which is why it was
tracked as its own lane in `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md` and ratified before it
was done. The audit briefs under `docs/design/mock-audits/` were updated to the new names in the
same commit; their own FILENAMES are unchanged (an audit filename is a stable reference), and
`docs/DECISIONS.md` was not touched at all — it is append-only, and a recorded row says what was
true on the day it was written.

## The artboards

### Page 1 — Landing

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Before.dc.html` | Moments section today | `client/src/components/landing/moments-section.tsx` | audited — 1 divergence ([brief](../mock-audits/wedding-before.audit.md)) — structure matches; live render is empty today (ruled §13 photo-gate empty state) |
| `Main.dc.html` | Landing page with Wedding | `client/src/pages/landing.tsx`, `landing/moments-slot.tsx` | **built** ([brief](../mock-audits/wedding-main.audit.md); ledger `2026-09-04-wedding-landing-moment`) — the Wedding `MomentConfig` row and the "Planning your own?" callout both exist. CAVEAT: no photo was fabricated, so the moment renders only once Kyoto has ≥1 attributed real (non-stock) expert-curated photo — with today's production data the whole Moments section is still the ruled §13 empty state |
| `NavEntry.dc.html` | Nav · Experiences dropdown today | `client/src/lib/nav-config.ts` (`navGroupsConfig`) | audited — 1 divergence ([brief](../mock-audits/wedding-nav-entry.audit.md)) — this "today" baseline is itself stale; already superseded by the `2026-09-03-occasion-hygiene` reorg on `main` |
| `NavTuned.dc.html` | Nav · tuned by class (proposal) | `client/src/lib/nav-config.ts`, `client/src/components/layout.tsx` | **built** — ledger `2026-09-04-wedding-entry-doors`. The regrouping was already built and matching (`2026-09-03-occasion-hygiene`); the last piece, the Wedding row's "Start a plan →" hover/focus CTA, landed as a GENERIC `featured` flag on the nav item config — no leaf is named in the renderer, so a second featured row is a one-line data change ([brief](../mock-audits/wedding-nav-tuned.audit.md)). **AMENDED 2026-09-04 (ledger `2026-09-04-reaudit-fixes`)** — the dropdown's **"Browse all occasions" footer link is now built** (A1), targeting `/experiences/travel` — the SAME href the landing Moments section's "All occasions →" already uses, so the two doors to "everything" cannot drift apart. It is a generic group-level `footer` slot on `NavGroupConfig`, rendered from the config key alone (no group is named in the JSX) and counted by `getAllNavHrefs`, so both link gates smoke-test it like every other nav link. |

### Page 2 — Full flow

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Step1Occasion.dc.html` | Step 1 · Occasion | `client/src/components/trip/plan-modal.tsx`, step 1 | **built** — ledger `2026-09-04-one-modal-many-doors`, CLAUDE.md Locked Decision 33; the tile grid is the real `GET /api/experience-types` catalog (no hardcoded list; an empty fetch says so, §13) |
| `Step2Where.dc.html` (formerly `ModalWhere.dc.html`) | Step 2 · Where | `plan-modal.tsx`, step 2 | **built** — ledger `2026-09-04-one-modal-many-doors` for the step, `2026-09-04-plan-stops-ui` for the stop control. The "add another stop" affordance is now rendered under an occasion whose `default_stops` is `many` and is still ABSENT (never disabled) under `one`, which is what a wedding is — so this artboard's own occasion shows exactly the single destination field it draws. **AMENDED 2026-09-04 (ledger `2026-09-04-reaudit-fixes`)** — the re-audit found a **"Plan name (optional)"** field on this step that the artboard does not draw (carried over from the `edit-trip-panel.tsx` the modal was renamed from). Rather than delete a real field, it **MOVED to the finish**, where the Sep 3 design put it — "the name stays optional and last". The artboard is correct as drawn for step 2; the field now lives beside the three ways to build, and this note is the record of where it went. Under `many`, row 1 also now carries the ordinal "01" and the label "First stop" (A12), and this step's TITLE reads "Where, in order?" (A13) — both derived from `default_stops`, never from the occasion. |
| `Step3When.dc.html` | Step 3 · When (event class) | `plan-modal.tsx`, step 3 | **built** — ledger `2026-09-04-one-modal-many-doors`; the artboard's own answer to the brief's "mutually exclusive branches": a RANGE-shaped occasion that HAS a schedule also gets the main-moment card, whose date is its own question (nothing is written until date AND time are given, §13) |
| `Step3Day.dc.html` | Step 3 · a day, not a range | `plan-modal.tsx`, step 3 (`default_duration`) | **built** — ledger `2026-09-04-one-modal-many-doors`; the `durationShape()` "day" branch inside the step rail it was always drawn in |
| `Step4Who.dc.html` | Step 4 · Who | `plan-modal.tsx`, step 4 (`vocabulary`) | **built** — ledger `2026-09-04-one-modal-many-doors`; two steppers writing the existing `trips.adults`/`trips.kids`, both starting at NOT SET ("—") with `travelers` derived from the pair by `partyTotal` |
| `Step4Variants.dc.html` | Four occasions, one control | `plan-modal.tsx`, step 4; `client/src/lib/plan-steps.ts` (`asksBudgetApprover` / `asksAccessibilityNote`) | **built** — ledger `2026-09-04-one-modal-many-doors` (vocabulary) + `2026-09-04-step4-variants-fields` (migration 284, CLAUDE.md Locked Decision 38). All four variants now render: the budget approver appears when the party noun is **attendees**, the accessibility note when `default_guests` is **explicitly true**, and the authoring variant is the `authoring` prop the door passes (never inferred from role). **Two deliberate divergences from the drawing:** the corporate card hides Kids only in the artboard's rendering — live, the occasion's own switches decide the second question and the steppers are unchanged; and the accessibility answer is stored as `trips.accessibility_note`, deliberately NOT `trip_participants.accessibility_needs` (a participant's own answer about themself — CLAUDE.md §24 draws the same line). An untouched field is NULL and is never rendered anywhere as "no needs" / "no approver" (§13). |
| `Step5Events.dc.html` | Step 5 · What's happening | `plan-modal.tsx`, step 5; `client/src/lib/plan-events.ts`; pen drained at mint by `pending-events.service.ts` | **built** — ledger `2026-09-03-switch-readers`, `2026-09-04-plan-mint`, `2026-09-04-one-modal-many-doors`, `2026-09-04-event-time-ui`. The artboard's **Day · Time · Place table is now built** on migration 282's `user_experiences.start_time`. **One deliberate divergence from the drawing:** the artboard shows the Day and Place cells pre-FILLED from the plan; live they are PLACEHOLDERS and stay unwritten until the traveler chooses (§13 — a shown default and a chosen value must not be the same fact), and the plan's day/place are inherited at create instead. The Day cell is a `<select>` of the plan's own days, not a free calendar. |
| `StripLead.dc.html` | Trip Strip · one new chip | `client/src/components/trip/trip-strip.tsx` | **built** — `trip-strip-lead.test.tsx` 17/17 |
| `Slip.dc.html` | The slip · day → event → items | `client/src/lib/slip-events.ts` + plancard | **built** — ledger `2026-09-04-slip-events`, 17/17 |
| `WhichEvent.dc.html` | Add to Plan · which event? | `client/src/lib/which-event.ts`, `client/src/lib/slip-events.ts` (`eventMetaLine`), `service-detail.tsx` | **built** — ledger `2026-09-04-which-event-picker`, `2026-09-04-which-event-hint`, `2026-09-04-event-time-ui`. **Both former omissions are closed:** the "suggested for florists" hint reads `experience_types.roles_needed` (migration 280), and the clock line ("Sat 15:00 · Nanzen-ji") reads `user_experiences.start_time` (migration 282). The clock comes from that column and NOWHERE else — never out of `event_date`, and an event with no time shows its day alone, never a midnight (§13). |
| `Mismatch.dc.html` | Location mismatch | `client/src/lib/location-mismatch.ts` | **built** — ledger `2026-09-04-location-mismatch` (the alert, 54/54) + `2026-09-04-plan-stops-ui` (the third action, 66/66). All three actions render; "Add \<city\> as a stop" writes through the one stop writer and is omitted, never disabled, when the gate cannot write. **One RULED divergence from the artboard:** its footnote "Plans with more than one stop are not flagged" is NOT implemented — `2026-09-04-location-mismatch` ruled in advance that the check reads the event first and then EVERY stop and is never suppressed by stop count, and `2026-09-04-plan-stops-ui` upheld that. |
| `Guests.dc.html` | One list, a column per event | `client/src/pages/plan-guests.tsx` (`/plans/:tripId/guests`) + `server/services/plan-guest-roster.service.ts` — the audit's correction stands: `participant-travel-tracker.tsx` is unmounted and was never the live surface; per-event invites remain `client/src/components/GuestInviteManager.tsx`, the ONE invite writer | **built** (ledger `2026-09-04-guests-per-event`) — the roster is DERIVED (one row per person, deduplicated by normalised email; one column per event), so the blocking question "which event owns the guest list" is dissolved, not answered, and the unratified `trip_participants.event_invite_id` link is not built. Two stated departures from the mock: no "family only" tile (no column marks it) and declined gets its own glyph rather than sharing not-invited's dash. **AMENDED 2026-09-04 (ledger `2026-09-04-reaudit-fixes`)** — the artboard's two header actions are answered separately (A22). **"Invite by email" is BUILT** as a page-level action that opens the ONE invite writer (`GuestInviteManager`) — behind an event picker when the plan holds more than one event, straight through when it holds one, and omitted entirely when it holds none, since an invite belongs to an event and there would be nothing for the row to hang off. **"Copy links" is AMENDED OUT of the artboard:** there is no ratified target for it — no per-guest or per-event link exists to copy — and a button that copies something invented is worse than an absent one. Also corrected in the same ledger row: this page's comment gave "no time-of-day column" as the reason it draws no event times; the column exists (migration 282). The board is still the reason, and it still draws none. |
| `SlipProposal.dc.html` | The slip · a private proposal | plancard under `default_visibility: hidden` | **ruled** — hidden occasions have no guest surface (`SlipLogisticsSection`, Locked Decision 28) |
| `OccasionRow.dc.html` | An occasion is a row, not a class | `experience_types` switch columns | **built** — migration 276, Locked Decision 28 |

### Page 3 — Other experiences

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Planner.dc.html` | `/start/events` · three doors | `client/src/pages/start-events.tsx` | **built** — ledger `2026-09-04-wedding-entry-doors`. Both divergences the brief found are closed: the host door exists and opens THE single planning entry (`PlanEntryCta`, no invented occasion — §13), and the masthead now asks which SIDE of the event you are on. `/start/events` joined `ENTRY_SURFACES` in `check-planning-entry.cjs` ([brief](../mock-audits/wedding-planner.audit.md)). **AMENDED 2026-09-04 (ledger `2026-09-04-reaudit-fixes`)** — **the artboard's two supply-door CTAs, "Become a provider" and "Become an expert", are AMENDED to the live "Continue as a Service Provider" and "Apply as an Event Planner"** (A26). The live labels are the more precise ones and the more honest: the first door continues an existing provider path rather than starting a new identity, and the second is specifically the EVENT PLANNER track — one of several expert tracks, partitioned by an explicit key list (Locked Decision 36), not "expert" in general. Code unchanged. |
| `TravelWhere.dc.html` | Golf trip · Where (stops) | plan modal, step 2 under `default_stops: many` | **built** — ledger `2026-09-04-plan-stops-ui`; NOT a separate component, it is step 2 under `many`: an ordered numbered list whose row 1 is the destination field (the position-0 mirror), reorderable by buttons, with an unlocated stop visibly flagged and the summary rendered as a sequence that claims no route or distance. Two audit findings stand and are unrelated to stops: golf has no seeded occasion row (it resolves to generic `travel`, whose `schedule` switch is off — see TravelEvents), and the step-rail shell they were written against now exists ([brief](../mock-audits/wedding-travel-where.audit.md)) |
| `TravelWhen.dc.html` | Golf trip · When (range only) | plan modal, step 3 under `default_duration: range`; `client/src/lib/plan-steps.ts` (`showsMainMoment`) | **built** — ledger `2026-09-04-reaudit-fixes`. The step-rail shell the v1 brief was written against exists (`2026-09-04-one-modal-many-doors`), and the v2 re-audit's two findings are closed: the eyebrow now carries the **stop count** ("Your golf trip · 3 stops", derived from `namedStops` and shown only under `many` with more than one named stop — A14), and the **main-moment card no longer renders for this occasion** (A15, the re-audit's B4). That second one was a data bug, not a pixel one: golf is `range` + `schedule: true`, so the old gate offered it a "The main moment" anchor beside its four tee times, and the anchor is read by the optimizer and the schedule validator. The narrowing predicate needed **no seventh switch** (Locked Decision 31) — it reads `default_duration` and the party noun the step-4 label already resolves. **This artboard's title, "When are you going?", is AMENDED to the live "When is it?"**: a travel-flavoured question needs a per-occasion literal, which Locked Decision 28 refuses. Its footnote is a design annotation, not UI copy. |
| `TravelEvents.dc.html` | Golf trip · step 5 (tee times) | the chips + Day/Time/Place table under `default_schedule` | **built** — ledger `2026-09-04-event-time-ui`. The per-event tee time is the row's `startTime` (migration 282), and the per-event place is its own `location` rather than the plan's destination — the two divergences the [brief](../mock-audits/wedding-travel-events.audit.md) recorded as HELD. **The third one still stands and is NOT a clock question:** the occasion this mock depicts (golf → generic `travel`) has `default_schedule: false`, so the step it draws is switched off until a golf occasion row is seeded with the switch on. **All SIX chips it draws now exist as presets** — ledger `2026-09-04-step4-variants-fields` added the sixth, "Driver between links", with its own `anchorType` and `isImmovable: false` (only a booked tee time is a fixed point); pinned by `server/services/__tests__/golf-presets.test.ts`. **AMENDED 2026-09-04 (ledger `2026-09-04-reaudit-fixes`)** — **this artboard's title, "What's on the schedule?", is AMENDED to the live "What's happening?"** (A11). It and `Step5Events.dc.html` ("What's happening over the weekend?") disagreed with each other as well as with the code, and a step title that varies per occasion needs a per-occasion literal — which is exactly what Locked Decision 28 refuses (an occasion is a row carrying defaults, not a class). One title, for every occasion. Same amendment: this artboard's step-4/step-5 notes promised a per-event **guest list**, which is false for `golf-trip` (`default_guests: false`); live, that clause is derived and simply omitted (A9/A10), and the artboard's own "No guest list on this plan — the Guests switch is off." is NOT built because that sentence is true of an explicit `false` and false of a NULL, and one sentence cannot carry both (§13). The **main-moment card does not render for this occasion** at all (A15 / the re-audit's B4), so no stray anchor is written beside the four tee times — which is what this artboard already drew. |

## Known blockers, carried from the ledger

| Blocker | Blocks |
|---|---|
| `trip_destinations` (ordered stops) — **RESOLVED** (migration 281, `2026-09-04-stops-and-event-time`); both surfaces **built** by `2026-09-04-plan-stops-ui` | `Mismatch` "add as a stop"; `TravelWhere` stop list |
| no time-of-day column on `user_experiences` — **RESOLVED** (migration 282) and BUILT (ledger `2026-09-04-event-time-ui`) | clock times on `WhichEvent`; `TravelEvents` tee times; step 5's Day/Time/Place table |
| `experience_types.roles_needed` — **RESOLVED** (migration 280) | `WhichEvent` role hint is now buildable |
