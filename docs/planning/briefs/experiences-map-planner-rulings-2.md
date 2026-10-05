# Experiences map planner — second rulings, 5 Oct 2026

> Decision-maker Leon Dixon, 5 Oct 2026, 17:42 ET, in answer to the Lane 0 report (PR #1306) and its
> "Decisions the next lanes need". **All twelve are final.** They amend
> `docs/planning/briefs/experiences-map-planner.md` where shown. Record them in `docs/DECISIONS.md` (the
> next R-numbers) and amend the brief's quoted lines in the same docs change. No product code rides with
> the record.

## Coral (brief A1; Lane 1)

**1. Three named colours.** Fill `#C8443D` (behind white text). Text `#B8403A` (coral words on a light
ground). Accent and outline `#E85D55` (never behind white text). Each has one token. The 39
`var(--earn-coral-ink)` fills and the roughly 20 coral-text sites move to the right one (audit, Lane 1).
- **A check script is part of the lane.** It fails on any coral hex, or its `rgb`/`hsl` spelling, in client
  code outside the three token definitions, so new code cannot hardcode one. It runs in the guard batch.
  The lane ends with no exceptions listed.
- The contrast test the brief already owes (white text on a fill at 4.5:1 or better) still stands.
- Amends A1's "`--earn-coral-ink: #E85D55` stays, for accents and borders only": it stays as the accent,
  and its fill uses are retokenized. Corrects "26 client files" to 28 and "the second light value at line
  124" to `.console-scope`.

**2. The console's coral moves too.** `.console-scope` fills (`--primary`, `--sidebar-primary`, and
`--console-brand` where it is a background) take the fill colour. Focus rings (`--ring`, `--sidebar-ring`)
stay the accent. Dark-theme coral is still not ruled.

## Events (brief A2; Lane 2)

**3. An event's real city is stored.** One new optional field on the event (empty means not known, never
"same as the market"). Existing rows are filled only from what the seed itself states
(`venueLocality` in `server/seeds/city-events.manual.ts`), through **one narrow seeder exception**.
- The exception covers this one field on the manual seed rows, and nothing else.
- It is written into the ledger row that lands it, with a sunset: it ends once the fill has run in
  production, and it is not a precedent for further seeder rewrites (LD 59 otherwise stands).
- The migration is additive and nullable, reviewed at that lane's hard stop.

## Experiences (brief A3; Lanes 3 and 4, built as step 8)

**4. Proposal sits under "One evening".** Its "hidden" setting hides the plan from sharing, not the
occasion from the picker. Removes "Whether Proposal stays a hidden two-person evening or moves into hosted
events" from section B.

**5. An occasion in no group** appears only under "See all occasions" and in search, in an ungrouped list.
No sixth label.

**6. `/experiences` stops opening its separate intake dialog (`IntakePanel`)** as part of step 8a. The
guard `scripts/check-planning-entry.cjs` is amended in the same PR. The wider D11 collapse is unchanged.

**7. No area marks.** Ledger `2026-10-03-no-ward-pins` stands. Area-only items are listed under "Not on the
map yet". The rings are removed from the boards.

**8. No day-less items.** An add from Browse goes to the day being shown, as the slip does today.

**9. The map opens on an empty plan, showing Browse.** Only the "Your plan" layer waits for located stops.

**10. Signed-out map browsing is a last sub-step, 8d.** 8b ships with sign-in at the finish, as now.
Amends A3.6's order, not its end state.

Rulings 4–10 are carried into `docs/planning/briefs/step-8-brief.md` (revision 2), which is the build
brief for Lanes 3 and 4.

## Pets (brief A4; Lane 5)

**11. Two optional plan fields: pet kind and pet count.** Additive, nullable, no default. Unanswered stays
unanswered. **The migration stays held until that lane's review at its hard stop.**

**12. The accessibility note is offered on trips only when opened from the service-animal line.** A narrow
amendment to LD 38; the note is otherwise still asked only for guest-list occasions.
- **Service animals never trigger a pet surcharge or a pet filter.** They are not counted in the pet
  fields.

Rulings 11 and 12 close the two gaps in section B. The pets lane still comes after step 8b.

## Boards changed with these rulings

`docs/design/experiences-map-planner/`: `ExperienceMap`, `ExperienceMapMobile` (no rings; no "No day yet"
group; adds name the day; "Not on the map yet" wording and count; taller boards), and the six venue-led
boards (vendor rings replaced: a vendor with an address is a pin, one without is listed only). `canvas.json`
and `README.md` updated to match. The venue-led boards are still drawn, not ruled.

## Still not ruled

The "All" day chip on the trip boards (the app shows one day at a time; step 8b leaves it out). Venue-led
planners. What the free AI draft produces for an event. Event comments. Which other doors land on the map.
Whether emptying a drafted plan frees the draft again. Trip Pass on the map. Dark-theme coral. Pet rules
for trains and taxis.
