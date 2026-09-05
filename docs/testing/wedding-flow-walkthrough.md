# Wedding flow — click-path walkthrough

**What this is.** The end-to-end click path a human (or Claude driving Chrome) follows on the
published Replit app to exercise the wedding/occasion flow the `2026-09-0*` ledger rows built. Every
step names the URL or the control, the **real** `data-testid`s (grepped from the source, not
invented), what should happen, and — the part that matters most — **the §13 empty states you should
expect on a fresh account**, so an honest absence is not written up as a bug.

**Ledger rows this exercises:** `2026-09-04-wedding-landing-moment`, `2026-09-04-wedding-entry-doors`,
`2026-09-04-one-modal-many-doors`, `2026-09-04-plan-stops-ui`, `2026-09-04-event-time-ui`,
`2026-09-04-which-event-picker`, `2026-09-04-guests-per-event`, `2026-09-04-earn-planner-roles`,
`2026-09-04-step4-variants-fields`. CLAUDE.md Locked Decisions 28–38.

**As-of:** 2026-09-04, the `2026-09-04-step4-variants-fields` lane. If a testid below does not exist
on the build you are running, that is a finding — say so; do not substitute a similar-looking one.

---

## Before you start — read the empty states

These are **ruled behaviours, not defects**. Reporting them as bugs is the most likely way to waste
a run.

| You will see | Why | Do NOT |
|---|---|---|
| The landing **Moments section renders nothing at all** | The Wedding `MomentConfig` row exists, but a moment renders only once its market has ≥1 **attributed, real** (non-stock) expert-curated photo. No photo was fabricated. | file "the Moments section is broken" |
| **Kyoto is the only stocked market.** Any other destination yields a thin plan, empty vendor lists and no gems | Seed-lane state, deliberately visible (§13). Ruling 26 makes the same point about Plus: a thin draft in an unstocked market is an honest signal. | file per-market emptiness as a rendering bug |
| A plan with **no events** shows "no events" on the Guests page, not a table | The roster is DERIVED from `event_invites` per event; with no event there is no column to draw. | expect a blank table with headers |
| A `default_visibility: hidden` occasion (**proposal**) has **no guest surface at all** | Ruling 28 / `SlipProposal`: the whole point is the other person does not find out. | navigate to `/plans/:id/guests` for a proposal and report a 404-ish page as broken |
| Step 5 **"What's happening" is absent** for travel / anniversary-trip | `default_schedule: false` on those seeded rows. The step is OMITTED, never disabled. | expect a disabled step |
| Step 2's **"Add another stop" is absent** on a wedding | `wedding` is seeded `default_stops: "one"`. Absent, never disabled. | expect a greyed-out button |
| An untouched party, accessibility note or budget approver saves as **nothing at all** | Migration 241 de-masked the party; migration 284's three columns are NULL = never asked. NULL is never rendered as "no needs" / "no approver" / a party of 2. | expect a default of 2 adults, or a "None" label |
| **Dead endpoints return 200 + HTML**, not 404 (the Vite catch-all) | CLAUDE.md Locked Decision 9. | ever use a 404 as evidence that a route is dead |

Sign in with a **fresh account** (register at `/`, any email). A guest can walk steps 1–5 but is
gated at the finish, which is itself one of the things worth seeing.

---

## 1 · Enter — the landing Moment, or the nav Wedding row

**Either door. Both open the SAME modal** (ruling `2026-08-28-single-planning-entry`; what it renders
is `2026-09-04-one-modal-many-doors`).

**Door A — landing Moment.** `/`
- Control: `moment-cta` inside `moment-slide-wedding`; the section's tabs are `moment-tab-<key>`.
- Expected: the plan modal opens **at step 2** with a "Wedding · change" pill — the door carries the
  occasion, so step 1 is already answered.
- **§13 on a fresh install:** the whole Moments section is very likely absent (photo gate above). If
  so, use Door B and record that the moment did not render — that is data, not a code fault.
- The callout beneath it (`moments-planning-callout`) links to `/start/events` via
  `link-event-planner-track`, and exists ONLY inside `MomentsSection` — if the section is empty the
  callout is correctly absent too.

**Door B — nav Wedding row.** Any page, nav → Experiences.
- Control: `button-nav-featured-wedding` (the hover/focus "Start a plan →" on the featured leaf).
- Expected: identical to Door A — the modal at step 2, Wedding pill visible.

**What to check at this point**
- `plan-modal` is visible.
- `plan-modal-occasion-pill` reads "Wedding" and is clickable back to step 1.
- The rail (`plan-step-rail`) shows FIVE steps for a wedding: `plan-step-occasion`,
  `plan-step-where`, `plan-step-when`, `plan-step-who`, `plan-step-events`. (A travel occasion shows
  four — `plan-step-events` is absent, not disabled.)

---

## 2 · Step 2 · Where

- Field: `input-etp-destination`. Type **Kyoto, Japan** (the only stocked market).
- Expected on a wedding: **no** `button-plan-add-stop` and **no** `plan-stops-list` — `wedding` is
  seeded `default_stops: "one"`. To see the stop list, switch to `option-occasion-travel` via the
  pill; `button-plan-add-stop`, `plan-stop-row-1`, `input-plan-stop-1`, `button-plan-stop-up-1` /
  `-down-1` / `-remove-1` appear, and an unnamed-but-unplaced stop shows
  `text-plan-stop-unlocated-1`.
- **Home-city default (`2026-09-04-step4-variants-fields`).** Not visible on a wedding: it fires only
  for a **day-shaped** occasion. To see it, sign in as a user with `users.home_city` set, pick
  `option-occasion-date-night`, and go to step 2 with the field empty: it arrives **pre-filled** with
  the home city and carries `text-etp-destination-suggested` ("from your home city — change it, or
  continue to keep it"). Type anything and the note disappears — it is now your answer.
  **§13 to verify:** press **Save** (`button-etp-save`) from step 2 WITHOUT advancing, reopen the
  modal, and the suggested city must **not** have been stored. Advancing with
  `button-planning-next` first is what makes it yours.
- **Where a home city is SET (`2026-09-05-slip-events-first-render`).** `/profile` → Personal
  Information → **Home city** (`select-home-city`), saved by the page's own **Save Changes**. The
  options are the SERVER's operating-market list (`GET /api/me/home-city` → `markets`), so the
  picker offers only values the writer accepts; `text-home-city-note` says out loud that the list is
  the markets we operate in, and **"Not set" is a real answer** — nothing guesses one. The Plus
  occasions surface writes the same column through the same route
  (`PATCH /api/me/home-city`, which stays the ONE writer); before this it was the only door, so a
  non-Plus traveler had no way to make the pre-fill above fire at all.
- Then: `button-planning-next` → "Next: When".

---

## 3 · Step 3 · When (range + the main moment)

- Fields: the first-day / last-day pair (a wedding is `default_duration: "range"`).
- Because a wedding also HAS a schedule, the **main moment** card is on this step: a date and an
  "HH:MM". Give **both** — with only one, nothing is written, deliberately (§13: a moment with a
  time and no day is not a moment).
- Expected on save: a `temporal_anchors` row of type `custom` described "The main moment",
  `isImmovable: true`. A second save UPDATES it rather than stacking a duplicate.
- Next → "Next: Who".

---

## 4 · Step 4 · Who (guests, adults/kids, accessibility note)

- Body: `plan-step-who-body`.
- Heading for a wedding: **"Who is coming?"** (`vocabulary: "guests"`). For corporate events it is
  "How many attendees?"; for travel, "Who is traveling with you?".
- Steppers: `button-etp-adults-plus` / `-minus` and `button-etp-kids-plus` / `-minus`; the values are
  `value-etp-adults` / `value-etp-kids`. **Both start at "—", never at 2.** Labels are
  `label-etp-adults` (which reads "Guests" here, from the occasion's vocabulary) and `label-etp-kids`.
- **The accessibility note** (`2026-09-04-step4-variants-fields`, migration 284): block
  `plan-step-who-accessibility`, field `input-etp-accessibility-note`, asked because
  `wedding.default_guests` is **true**. Type e.g. "Grandparents — step-free, short walks".
- **The budget approver is correctly ABSENT here.** It appears only when the party noun resolves to
  **attendees**: switch to `option-occasion-corporate-events` via the pill and step 4 then shows
  `plan-step-who-approver` with `input-etp-budget-approver-name` and
  `input-etp-budget-approver-email`. A corporate occasion shows **both** questions — the switches are
  independent.
- **§13 to verify:** walk past step 4 without touching anything on a plan that already has a party,
  save, and the stored party must be unchanged — a walked-past step writes nothing. Likewise an
  untouched note stays NULL and appears **nowhere** as "no accessibility needs".
- **Not built in this lane, and expected:** nothing yet READS the note or the approver. They are
  captured and unrendered; the Workstation/slip read-out is a separate lane. Do not report the
  absence of a read-out as data loss — reopen the modal and the values come back.
- Next → "Next: What's happening".

---

## 5 · Step 5 · What's happening (chips with day / time / place)

- Body: `etp-step5-schedule`.
- Chips are the **server's** presets for this occasion (`GET /api/logistics/presets/<slug>`), testid
  `chip-etp-event-<slugified-label>`. Tick two or three.
- Free text: `input-etp-custom-event` ("Something else…"); Enter or blur turns it into a row. Text
  left unconfirmed in the box is still saved.
- Each ticked chip becomes a ROW with Day / Time / Place cells; the Place field is
  `input-etp-event-place-<slugified-title>`. **Day and place render the plan's own values as
  PLACEHOLDERS and stay unwritten until you choose them** — that is the ratified divergence from the
  artboard, and it is the point. **The time has no fallback at all**: leave it and the event has no
  time, never midnight.
- **Golf check (`2026-09-04-step4-variants-fields`):** the golf board's six chips — Round 1–4,
  Whisky bar, **Driver between links** — all exist as presets now. Note the standing caveat: the
  occasion "golf" resolves to generic `travel`, whose `default_schedule` is **false**, so this step
  is switched off there until a golf occasion row is seeded. Seeing no step-5 for golf is the ruled
  state, not a missing chip.

---

## 6 · Finish — "Build it myself" → the slip

- Finish rows appear only on the LAST visible step: `planning-option-myself`, `planning-option-ai`,
  `planning-option-local` (and `planning-option-continue` when a plan is already bound).
- **As a guest:** `planning-option-myself` opens `modal-sign-in` — the slip route's existing identity
  gate. That is correct behaviour, not a failure.
- **Signed in:** the plan row is minted and you land on `/plans/:tripId`.
- What is written in that one click: the trip row, the party and the step-4 variant answers through
  `PATCH /api/trips/:tripId/occasion`, the main-moment anchor, one `user_experiences` row per ticked
  chip, and (under a many-stop occasion) the ordered `trip_destinations` rows.

---

## 7 · The slip — `/plans/:tripId`

- Header: `slip-header`, `slip-title`, `slip-meta`, `slip-tracking-ref`, `slip-phase-chip`.
- Status strip: `slip-status-strip` with `slip-count-<status>` per routing state.
- **Events**: one card per `user_experiences` row — `slip-event-<id>`, `slip-event-title-<id>`,
  `slip-event-meta-<id>` (the "Fri, Oct 2 15:00 · Nanzen-ji" line, ONE derivation shared with the
  picker), and the owner-only time edit `slip-event-time-<id>`.
- **Items** under them: `slip-item-<id>`, with `slip-routing-actions-<id>` and `slip-anchor-<id>` on
  an anchored item.
- **§13:** an event you gave no time shows the day and **no clock** — not 00:00 and not "all day".
  An event with no place shows no place line.

### 7a · The FIRST render — events, no items (`2026-09-05-slip-events-first-render`)

This is what you see the instant you land, before adding anything. It is the state the walkthrough
found broken, so check it deliberately.

- **Expected:** one `slip-event-<id>` card **per event you ticked at step 5**, grouped under day
  headings (`slip-day-heading-<n>` for one of the plan's own days; `slip-day-heading-date-YYYY-MM-DD`
  for a day only the events name). Each card carries its title, `slip-event-meta-<id>`, the
  owner-only `slip-event-time-<id>` / `slip-event-budget-<id>` / `slip-event-hire-<id>` affordances,
  and a body reading **`slip-event-empty-<id>` → "Nothing added under this event yet"**.
- **`slip-meta` and the body must AGREE.** "4 events" in the header ⇒ four cards below it. The old
  behaviour — "4 events" over "No items on this plan yet." and no cards at all — is the defect.
- **"No items on this plan yet." is correct ONLY when the plan has neither items nor events.**
- **§13:** an event you gave no day sits under a trailing **`slip-day-heading-undated`** ("Undated"),
  **never** under day 1. It is our knowledge of the event, not a day we picked for it.
- **No Organize offer when events exist.** `SlipOrganizeEvents` must be ABSENT here — the count it
  reads is the plancard's own `events` array, the same one `slip-meta` counts. Seeing "Organize into
  events" beside "4 events" means the two sources have drifted apart again.
- **`slip-meta-party` must match step 4 and the Trip Strip chip** — both the number ("2", derived
  from `adults`+`kids` by the ONE shared `partyTotal`) and the noun ("guests" on a wedding, from the
  occasion's `vocabulary`). "1 traveler" after answering step 4 is the defect.
- Add one item to an event and re-check: the card renders its rows and the empty line disappears —
  nothing else about the day list changes.

**7b · The first FEW SECONDS, before the occasion row lands (QA check 3).** Watch the landing, do
not just read the settled screen — both defects below were invisible once the page had loaded.

- **`slip-empty-items` ("No items on this plan yet.") must never flash.** While
  `GET /api/trips/:id` and `GET /api/experience-types` are in flight there is no occasion row, so
  the day list cannot yet be grouped by event; a neutral `slip-day-list-loading` stand-in holds the
  space. Seeing the sentence and then three event cards is the defect.
- **`slip-meta-party` and `trip-strip-party` must never flash the wrong NOUN.** Until the occasion
  row resolves both render the COUNT ALONE ("3"), then settle to "3 guests". "3 travelers" first is
  the defect — that word is ruling 28's fallback for a row that ANSWERED and said nothing, not for
  one that has not arrived.
- A slow connection makes both easy to see; throttle to Slow 3G for one reload.

---

## 8 · Add something to the plan → the WhichEvent picker

- Go to a service: `/services/:id` (browse from `/services`, or a slip suggestion).
- Add control: `button-add-to-cart` on the detail page (the label reads "Add to Plan" when a plan is
  bound — the label is derived, the testid is not).
- **Expected when the plan has 2+ events:** the picker opens — `which-event-picker`, with
  `which-event-subject` / `which-event-subject-meta`, one `which-event-option-<key>` per choice,
  `which-event-hint-<key>` (the role hint) and `which-event-meta-<key>` (the day + clock line),
  then `which-event-confirm` / `which-event-cancel`.
- **Expected when the plan has 0 or 1 event:** the picker does **not** open. That is
  `shouldAskWhichEvent` — asking a question with one possible answer is noise.
- **§13:** an event with no `start_time` shows **no clock** in `which-event-meta-<key>`, and the role
  hint is omitted rather than guessed when the occasion names no roles.

---

## 9 · Guests — `/plans/:tripId/guests`

- Page: `page-plan-guests`, heading `heading-plan-guests`, subline `text-plan-subline`, back link
  `link-back-to-plan`.
- **`button-invite-by-email`** sits beside the page heading (ledger `2026-09-04-reaudit-fixes`).
  It opens the SAME single invite writer the per-column `button-invite-<eventId>` opens — with a
  "Which event?" step first (`button-pick-invite-event-<eventId>`) when the plan holds more than
  one event, straight through when it holds one, and **absent** when it holds none, because an
  invite belongs to an event and there is nothing for the row to hang off. There is deliberately
  **no "Copy links"** button: the artboard drew one, nothing exists for it to copy, and it was
  amended out rather than invented.
- The table `table-plan-guests` is **one row per person, one column per event**:
  `column-event-<eventId>` headers, `button-invite-<eventId>` per column, `row-guest-<key>` rows,
  and `rsvp-<attending|declined|pending|not_invited>` cells.
- **§13 empty states, all expected on a fresh plan:** `empty-no-events` when the plan has no events at
  all; `empty-no-guests` when it has events but nobody invited; a blank "from"/"dietary" rather than
  "Unknown"/"None"; and `totals.countries` **omitted** rather than shown as 0.
- **A hidden occasion** (proposal) renders `plan-guests-hidden` instead of the table — by ruling.
- **THE TRAVELING PARTY IS NOT ON THIS PAGE, deliberately — but it now HAS a page of its own.**
  `trip_participants` (who owes what, who arrives when) is a different list under a different
  predicate and is **never merged** into the roster (`2026-09-04-guest-list-reconciliation`). The
  party you entered on step 4 is `trips.adults` / `trips.kids` — a count, not a list.
  **CORRECTED 2026-09-04 (ledger `2026-09-04-plan-islands`, PR #766):** this note used to send you
  to the trip logistics dashboard for the participant list. That tracker still exists, but the
  slip's own logistics section now carries a **`SlipTravelingParty`** block beside "Guests &
  invites" — add / edit / remove a participant (name, role, arrival, departure, accessibility
  needs, mobility level; never a money column, §14), hidden under a `default_visibility: hidden`
  occasion exactly as Guests is, and it says on screen that it answers "who is traveling" while
  the roster answers "who is invited".
  So: **looking for a "Traveling party" section on THIS page and not finding one is still the
  correct outcome** — report it as confirmed, not as missing — and the section you should find is
  one level up, on the plan's own slip.

---

## 10 · The supply side — `/start/events` and the planner door

- `/start/events` (`text-start-events-title`) forks THREE ways:
  - **Host** (`option-host`) → `button-start-events-plan` → opens **the same plan modal**, at step 1,
    because the page holds no occasion and passes none (§13).
  - **Vendor** (`option-vendor`) → `/become-provider`.
  - **Planner** (`option-planner`) → `/become-expert`, carrying `?offeringTypeKey=…&offeringName=…`.
- Reach it from **`/earn`**: the role band `earn-role-band` → `earn-role-event_planner`, whose rows
  come from BOTH catalogs (`earn-catalog`; provider categories for event VENDORS, expert keys for
  event PLANNERS — the two are never merged, §4). Empty/error states are `earn-catalog-empty` /
  `earn-catalog-error` with `earn-catalog-retry`.
- **Planner role picker** on the application (`/become-expert`): `planner-role-picker`, one
  `planner-role-<offering_type_key>` per row (the six migration-283 rows: `wedding_planner`,
  `wedding_day_of_coordinator`, `proposal_planner`, `party_planner`,
  `corporate_event_coordinator`, `date_night_designer`), plus `banner-preselected-offering` when a
  key arrived from `/earn`.
- **§13:** if the picker cannot resolve rows it renders `planner-role-unavailable` — an honest "we
  cannot show the list", never a fabricated one. And a key the door carried that the table does not
  hold is now **reported** (`offeringTypeKeyUnrecorded`) rather than silently clamped to NULL.

---

## Reporting

One line per step: **step → what you did → what you saw → matches / diverges / blocked**. For a
divergence, name the testid and the ledger row you believe it contradicts. If a behaviour is in the
empty-states table above, write "confirmed ruled empty state" — that is a successful step, not a
finding.
