# Events page, Experiences map planner, pets — rulings and build brief

> Source: design session of 5 Oct 2026 (ET), decision-maker Leon Dixon. Rulings in section A are final.
> Section B is **not ruled**: nothing in it is built until it is. Boards: `docs/design/experiences-map-planner/`.
> Dispatch-time `main` HEAD: `71e675270fc6502e7b290ca12e5c4c896ebba781`. A lane's first action is
> `bash scripts/check-lane-base.sh 71e675270fc6502e7b290ca12e5c4c896ebba781`; a mismatch is a hard stop.

This brief is the intent. `docs/DECISIONS.md` records what landed. Where code and this brief disagree
about what exists today, the code is right and the brief is wrong: report it, do not build around it.

---

## A. Rulings (final)

### A1. Brand — coral on filled buttons
- Any filled surface carrying white text uses **`#C8443D`** (white on it is 4.83:1).
- **`#E85D55`** is for accents and outlines only. It is never a background behind white text (3.43:1).
- Coral as text on a light ground stays `#B8403A`.
- App, not yet changed: `client/src/index.css` `--primary` (line 12, and the second light value at line 124)
  becomes `3 55.8% 51.2%`. `--earn-coral-ink: #E85D55` stays, for accents and borders only. 26 client files
  reference `E85D55` directly and need checking. The dark theme is not ruled.
- **Amended 2026-10-05, 17:42 ET (rulings-2 rulings 1–2; ledger `2026-10-05-coral-three-tokens`).**
  Three named colours, one token each: fill `#C8443D`, text `#B8403A`, accent/outline `#E85D55`.
  "`--earn-coral-ink: #E85D55` stays, for accents and borders only" now reads: it stays as the accent, and
  its fill uses are retokenized. "26 client files" is corrected to **28**; "the second light value at line
  124" is corrected to **`.console-scope`**, whose fills (`--primary`, `--sidebar-primary`, `--console-brand`
  as a background) take the fill colour while `--ring`/`--sidebar-ring` stay the accent. A check script that
  fails on any coral literal outside the three token definitions is part of Lane 1.

### A2. Events page
- `/events` is events-first; destinations are secondary.
- The calendar is the stage and keeps Month, Week and Day.
- The "Where to go" vibe filters and the best-time destination section stay.
- Each event links to a detail page on Traveloure's own site carrying locals' notes and traveler
  comments, not straight out to the organizer.
- "Outside the city" labels stay honest (an Osaka event listed under Kyoto says so).

### A3. Experiences
1. **Three planners:** feed, calendar, map. Experiences is the map planner, a planner in its own right.
   This amends "the slip is the only planning surface" (surface spec R-b).
2. **One plan underneath.** The map planner reads and writes the same plan record as the Trip Slip.
   No second store (Locked Decision 39 stands).
3. **A new plan lands on the map.** Scope assumed, not ruled: plans started from Experiences and from
   Plan with AI. Other doors are unchanged.
4. **Groups first.** Experiences and the planning pop-up show five groups, then the occasions inside the
   chosen one, with "See all occasions" and search. One picker, used in both places.
   Traveler wording: "A trip", "One evening", "A celebration", "A hosted event", "A group getaway".
   This extends the rule that group names are internal (R127); its guard test must be amended, not deleted.
5. **The Experiences entry is the map's starting state:** What on the left, Where on the map and city cards.
6. **Plan with AI.** Signed in: the plan is created, opens on the map, and the free draft is written into
   it. Signed out: browse freely; sign-in comes at the first write and the pending action runs after it.
   Guest plans stay held.
   **Amended 2026-10-05, 17:42 ET (rulings-2 ruling 10; `2026-10-05-step8-rulings`):** the end state stands, the order changes —
   signed-out map browsing is step 8d, last; 8b ships with sign-in at the finish, as now.
7. **The AI delivers into the plan,** never a chat or a separate page: the free draft directly, Ask AI as a
   proposal applied on confirm, Optimize through the review board. (Locked Decisions 41 and 45 stand.)
8. **Fee disclosure stays at checkout.**

### A4. Pets
1. **Trips first, not events.** Events reuse the same "Pets welcome" mark later as a venue filter.
2. **One optional question in the Who step:** "Bringing a pet?" with kind and count. Unanswered stays
   unanswered and is never read as "no pet".
3. **"Pets welcome" shows only where there is a source.** Order: the host confirms it on their listing,
   then a local verifies it, then Google's dogs-allowed fact.
4. **Unknown stays unknown:** "Pet policy not known" with Ask a local. A missing record is never shown or
   filtered as a no. A no appears only when a source states it.
5. **Google's dogs-allowed field stays behind the pricier lookup tier until needed.**
   `server/services/content-facts/places-adapter.ts` names `allowsDogs` and does not request it.
6. **Service animals are not pets.** They are recorded under accessibility and are never filtered out or
   surcharged.
7. **Border rules** appear only as a dated link to the official page. Traveloure never states the rule.

---

## B. Not ruled — do not build

- Venue-led planners (Wedding, Proposal, Birthday boards): the layout, and whether "Get expert help" is
  the primary action with Optimize not offered.
- What the free AI draft produces for an event.
- Whether Proposal stays a hidden two-person evening or moves into hosted events (a catalog change).
  **Ruled 2026-10-05, 17:42 ET (rulings-2 ruling 4; `2026-10-05-step8-rulings`) — removed from this list:** Proposal sits under
  "One evening"; "hidden" hides the plan from sharing, not the occasion from the picker. No catalog change.
- Event detail: whether traveler comments are reviewed before they appear, and who may comment.
- Whether the vibe filters on Events filter destinations only.
- Which other doors land on the map (Events "Plan around it", Discover, Ready-Made Trips).
- Whether emptying a drafted plan makes the free draft available again without limit.
- Trip Pass on the map planner.
- Dark-theme coral.
- The Ask AI drawer and the Optimize comparison on the map planner (not drawn).
- Pet rules for trains and taxis (no source yet).

Two gaps found while drawing, for a ruling before the pets lane builds:
- The plan has no pet field (`trips.adults`, `trips.kids` only).
- The accessibility note is asked only for occasions with a guest list, so a trip cannot record a service
  animal. Ruling A4.6 needs that field offered on trips.

**Both gaps ruled 2026-10-05, 17:42 ET (rulings-2 rulings 11–12; ledger `2026-10-05-pets-fields-and-service-animal`,
`2026-10-05-pets-fields-and-service-animal`):** two optional plan fields, pet kind and pet count (additive, nullable, no default; the migration held
until the pets lane's hard stop); the accessibility note is offered on trips only when opened from the
service-animal line (a narrow LD 38 amendment); service animals never trigger a pet surcharge or filter and
are not counted in the pet fields. Rulings-2 also rules: an event's real city is stored (ruling 3, `2026-10-05-event-real-city`);
step 8 (Lanes 3–4) carries rulings 4–10 in `step-8-brief.md`. See
`docs/planning/briefs/experiences-map-planner-rulings-2.md`.

---

## C. Lanes

One lane per branch, draft PR, the decision-maker merges. Each lane starts read-only (Phase 0: what
exists, with `file:line`), then a **hard stop** for a go. A lane fixes nothing outside its scope; findings
go to `FOLLOWUPS.md`.

### Lane 0 — Record. No product code. (the first session)
1. Commit this brief and `docs/design/experiences-map-planner/` as they are.
2. Append ledger rows to `docs/DECISIONS.md` for A1–A4, one row per ruling set, stamped in ET.
3. Amend, quoting the line being amended: the surface spec (`docs/planning/briefs/slip-and-card-surface-spec.md`,
   R-b and §2.1), `CLAUDE.md` where a Locked Decision is extended (the slip as the only planning surface;
   group names internal), and `docs/planning/briefs/README.md`.
4. Phase 0 audit for Lanes 1–5 below: for each, what exists today, what the boards require that does not
   exist, what conflicts with a Locked Decision, and the migrations it would need. `file:line` for every
   claim. A "not proven" section is required.
5. **Stop and report.** Build nothing. No migration. No client change.

### Lane 1 — Coral fill. Small, safe, first to build.
`--primary` to `#C8443D`; audit the 26 files; a test that fails if a filled surface with white text is
below 4.5:1. No behaviour change.

### Lane 2 — Events page.
- 2a: `/events` to the boards (`Main`, `Mobile`). Starting points: `client/src/pages/discover.tsx`
  (`surface="events"`), `client/src/components/travelpulse/GlobalCalendar.tsx`, `CompactYearCalendar.tsx`,
  `client/src/components/landing/events-strip.tsx`, `shared/city-events.ts`. Known defects to remove:
  month-level events painted on days 1, 8, 15 and 22; the calendar locked to the current year; the calendar
  hidden on phones; two event lists that do not agree. Reconcile with ledger `2026-08-25-events-as-designed`.
- 2b: the event detail page (`EventDetail` boards) with organizer facts and the plan panel. No comments.
- 2c: locals' notes and traveler comments. **Not armed** until section B's comment questions are ruled.

### Lane 3 — Groups-first picker.
**Amended 2026-10-05, 17:42 ET (`2026-10-05-step8-rulings`):** Lanes 3 and 4 are built as step 8 in five PRs (8a entry; 8b-1 extraction; 8b-2 map layout; 8c retirements; 8d signed-out browsing) under `docs/planning/briefs/step-8-brief.md` revision 3.1, which carries rulings-2 rulings 4–10 and Phase 0 decisions D1–D6 (ledger `2026-10-05-step8-phase0-decisions`).
One picker component used by the pop-up's first step (`client/src/components/trip/plan-modal.tsx`, the
`step === "occasion"` body, a flat grid today) and by the Experiences starting state. The group of an
occasion is `experienceGroupFor` in `shared/experience-group.ts`; do not restate the rule. The five
traveler labels need one home and the R127 guard amended to allow exactly those five.

### Lane 4 — Trip map planner.
This re-scopes surface-spec step 8 (Browse as a map layer on the slip) into the map planner.
Starting points: `client/src/pages/experience-template.tsx`, the slip map (`MapControlCenter`),
`mintTripSlip`. Everything writes through the slip's existing writers to `itinerary_items`.
Order inside the lane: Browse and add; Your plan with days and straight lines ("X of Y located");
landing on the map after the plan is created; the signed-out browse and the gate at the first write.
The AI button follows Locked Decision 41: free only while the plan is empty.

### Lane 5 — Pets on trips. **Not armed** until the two gaps in section B are ruled.
The Who question; the pet line and filter on stays and places; the three sources in order; the border
link; the accessibility note on trips. Needs a migration: hard stop before it.
**Amended 2026-10-05, 17:42 ET (`2026-10-05-pets-fields-and-service-animal`):** the two gaps are ruled (see §B); the lane comes after step 8b, and its migration stays held until its hard stop.

### Not a lane yet
Venue-led planners; the When and Who boards (the existing modal already shapes these steps by occasion,
so Phase 0 should say what differs before anything is built).

---

## D. Honesty notes

- Kyoto wedding and corporate vendors in `server/seeds/phase-d-kyoto-vendors.seed.ts` are fictional demo
  fixtures by that file's own header. The boards use bracketed placeholders for venue, vendor and stay names.
- On the planners, tabs, roles and filter labels come from `server/seeds/experience-template-tabs.seed.ts`;
  schedule rows from `server/services/logistics-presets.service.ts`; tool names from `shared/group-manifest.ts`.
- Every real Kyoto place on the trip planner reads "Pet policy not known", because the app holds no pet facts.
- Prices on the boards ($2.99, $5.99) are the beta values. Amounts resolve from `fee_bands`; no literals.
- The boards were checked by rendering them outside the canvas, and 15 of the 19 were seen rendering on
  the live canvas. The pets changes were published after that check.
