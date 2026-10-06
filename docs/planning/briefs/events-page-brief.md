# Events page brief — the calendar as the stage, and an event's own page

**For the Events session. Revision 1, 5 Oct 2026 (ET).** This is the build brief for Lane 2 of
`docs/planning/briefs/experiences-map-planner.md` (rulings A2) and for ruling 3 of
`experiences-map-planner-rulings-2.md` (an event's real city is stored). Boards: `Main`, `Mobile`,
`EventDetail`, `EventDetailMobile` in `docs/design/experiences-map-planner/`. The Lane 0 audit
(`experiences-map-planner-phase0-audit.md`, "Lane 2") is the starting evidence; every `file:line` below
was re-checked at `main` `9b9beab`.

**This lane is not step 8.** Step 8 (the Experiences entry and the map planner) is Track A's, under
`step-8-brief.md`. This session builds nothing from that brief.

**Base:** `main` HEAD at dispatch, after #1306 merges. The dispatcher fills in the SHA; the lane's first
action is `bash scripts/check-lane-base.sh <sha>`.

**Three PRs, in this order: 2L, 2a, 2b.** One ledger row each, authored as `R?` and numbered at merge.
2c (locals' notes and traveler comments) is **not armed**. Every merge leaves `main` deployable.

Where this brief and the code disagree about what exists today, the code is right: report it.

## Rulings that shape this lane

- **A2.1** `/events` is events-first; destinations are secondary.
- **A2.2** The calendar is the stage and keeps Month, Week and Day.
- **A2.3** The "Where to go" vibe filters and the best-time destination section stay.
- **A2.4** Each event links to a detail page on Traveloure's own site, not straight out to the organizer.
- **A2.5** "Outside the city" labels stay honest: an Osaka event listed under Kyoto says so.
- **Ruling 3** An event's real city is stored in one new optional field. Empty means not known, never
  "same as the market". Existing rows are filled only from what the seed states, through one narrow
  seeder exception with a sunset.
- **Coral** Filled buttons use the fill colour through its token. Until the coral lane lands that token,
  a filled button is `bg-primary`. `--earn-coral-ink` is never a background behind white text, and a page
  carries no raw hex (the page-hex guard fails on it; #1304 hit both).

## The model the boards draw

Two tables hold "events" today and are never joined (audit, defect 4). The boards give each one place:

| What | Table | Where it shows |
|---|---|---|
| A dated event: a show, a festival, a race weekend | `city_events` (`shared/schema.ts:10301`) | On its days in the calendar, and in "What's on" |
| A month-level season: foliage, cherry blossom, a festival month | `destination_events` (`:3879`), rows with months and no date | The "All month" band above the grid, and "In season all month" |
| How good a month is for a city | `destination_seasons` | "Where to go" |

A month-level row is never painted on a day. A dated event is never spread across a month.

## 2L — The event's real city (migration; hard stop before it)

1. One additive, nullable column on `city_events` for the venue's own locality (suggested name
   `venue_locality`). No default, no CHECK, no index, declared in `shared/schema.ts` in the same commit.
   The next free migration number at dispatch (354 is the latest at `9b9beab`).
2. The one row builder (`buildCityEventRow`) admits it for any source at insert. Today the seed's
   `venueLocality` is lookup-only and never stored (`city-events.service.ts:59–62`).
3. **The narrow seeder exception (ruling 3).** On an existing `source = 'manual'` row whose stored value is
   NULL, the seeder may fill this one field from the seed entry's `venueLocality`. A stated value is never
   replaced. Nothing else is rewritten. Four seed entries state one today
   (`server/seeds/city-events.manual.ts:140, 155, 315, 329`: Portimão, Suzuka, Osaka twice).
4. **Record the exception and its sunset in this PR's ledger row,** and amend Locked Decision 59
   (`CLAUDE.md:2387`), which today allows two rewrites only. Sunset: the exception ends once the fill has
   run in production; it is not a precedent for further seeder rewrites.
5. The card the client reads (`CityEventCard`, `shared/city-events.ts:263`) carries the value, or null.
6. **Phase 0, then a hard stop:** the migration text, the builder change and the seeder change are shown
   for review before anything is applied.

2a does not wait on 2L. The "outside the city" label renders only where a locality is stored and differs
from the market city, so it simply appears when 2L lands.

## 2a — `/events` to the boards

Boards: `Main`, `Mobile`.

7. **Where it lives.** `/events` renders `DiscoverPage surface="events"` (`client/src/App.tsx:471`); its
   events tab renders `EventsComingUpBlock` then `GlobalCalendar` (`client/src/pages/discover.tsx:2204–2205`).
   `GlobalCalendar` and `CompactYearCalendar` are mounted nowhere else. Phase 0 says whether they are
   reshaped or replaced. Whatever is replaced is deleted in the same PR, including the `year` and
   `month-grid` views nothing can reach.
8. **The year ahead.** A full-size calendar of twelve months starting at the current month, each month
   with its real year ("October 2026 to September 2027"). Weeks start on Monday. This removes defect 2:
   the calendar is locked to the current year (`GlobalCalendar.tsx:224`) and month stepping wraps without
   changing the year (`:377–387`).
9. **One read for the calendar's dated events.** A new public read returns the renderable `city_events`
   that overlap the twelve months, with every display value derived on the server as
   `listUpcomingCityEvents` does. Two rules:
   - An event already under way is included (`ends_at` not yet past). Today `gte(startsAt, now)`
     (`city-events.service.ts:355`) drops it, so "On now" (`shared/city-events.ts:179`) can never show.
   - **`GET /api/city-events/upcoming` is not changed.** The landing strip reads it, and its guards
     (ledger `2026-09-28-city-events`) stay green untouched.
10. **Days.** An event marks each local calendar day it covers, using the server's `firstDate` and
    `lastDate` (the city's own calendar, never the viewer's time zone). One event, two or more, and a
    long run (more than 10 days, drawn as an underline, not a count) are distinct marks, as on the board.
11. **The "All month" band.** Approved `destination_events` rows with months and no date show in the band
    for each month they span, from `startMonth` through `endMonth`. This removes defect 1: such rows are
    painted on days 1, 8, 15 and 22 (`GlobalCalendar.tsx:295–298`) and given day 1 or 15 (`:302`). It
    also fixes a multi-month season showing only in its start month. A non-recurring row with a `year`
    shows only in that year; the server ignores `year` today (`server/routes/content.routes.ts:5917–5924`).
12. **Month, Week, Day** select a period on the full-size calendar. "What's on" lists exactly the events
    whose days fall in that period. The count of marks and the rows in the list come from the same data,
    so they cannot disagree.
13. **"What's on" replaces the "Coming up" block on `/events`.** The landing strip is untouched. Each row:
    title, city, venue, local dates, start time only when the organizer published one, and "Plan around
    it". "Plan around it" is the existing door: `planAroundSource(event, "events_page")`
    (`client/src/components/landing/events-strip.tsx:48–66`). Its landing is unchanged.
    "Event details" is not rendered until 2b adds the page: no dead link.
14. **Filters.** What: the four verticals (`CITY_EVENT_VERTICALS`, `shared/city-events.ts:30`). An event
    with no stated vertical appears under "All" only; it is never guessed into one. Where: the eight
    operating cities.
15. **"Outside the city".** Where a stored locality differs from the market city, the row reads
    "<venue>, <locality> · outside the city, planned from <market city>". Where none is stored, the row
    names the venue and the market city and makes no claim either way.
16. **Phones.** The calendar is on the page at every width. This removes defect 3: it is hidden below
    1024px (`GlobalCalendar.tsx:554`), and week and day filtering with it.
17. **"Where to go" stays** (A2.3): the season ratings for the selected month, best first, and the vibe
    filters. The vibe filters go on filtering destinations only, as they do today
    (`content.routes.ts:6050–6053`); whether they should also filter events is not ruled. A city with no
    rating for the month says "not rated yet"; it is never given one.
18. **The season rows link to destinations, not to the old template page.** The month list's
    "plan" link to `/experiences/travel?destination=…&event=…` (`GlobalCalendar.tsx:824`) goes; the board
    has "Browse destinations".
19. **Photos.** The repo holds a city fallback photo for Kyoto and Bogotá only
    (`CITY_EVENT_FALLBACK_IMAGES`, `shared/city-events.ts:250`). A card with no photo renders without one.
    The city photos on the boards are placeholders and are not copied into the repo. Where a city photo
    shows, the page says it is a city photo, not a photo of the event.
20. **Ledger.** `2026-08-25-events-as-designed` (`docs/DECISIONS.md:419`) says the `/events` body and
    calendar are unchanged. This PR's row supersedes that part; the shared masthead and rail it adopted
    stand. The row also records that "Coming up" on `/events` gives way to "What's on".

## 2b — The event's own page

Boards: `EventDetail`, `EventDetailMobile`.

21. **A route and a public read for one event.** There is no `/events/:id` today. The read is public,
    read-only, and returns nothing for a withdrawn, unknown or non-renderable event (a 404 page, not an
    empty shell). `loadEventGuideFacts` (`server/services/blog-event-facts.service.ts:108`) already reads
    one live event with its facts and is the basis; do not write a second reader.
22. **What the page states, and from where.**
    - Title, vertical (omitted when not stated), length, local dates, venue, market city, and the real
      locality with the "outside the city" line where stored: from the event row.
    - "Dates and venue from <host>" with the link to the organizer's page: from `ticket_url`, only where
      it passes `ticketUrlRefusal`. No "checked" date is shown on this line: the row stores none.
    - "Good to know" (gates and hours, tickets, getting there): only facts that pass
      `isOfficialPublicFact` (`shared/content-facts.ts:213–218`), each with "from <source> · checked
      <date>" from `publicFactAttribution` (`:298–311`). A fact that cannot be attributed is omitted. With
      no such fact the section is absent.
    - "Starts in N days" or "On now": `countdownLabel`.
    - "N verified in <city>": the real count of verified locals, or the line is absent.
23. **"Plan around it"** opens the planning pop-up with the event as its anchor, as the list does.
24. **"More in <city>"**: other live events in the same market, soonest first.
25. **`/events` rows gain "Event details"**, linking here.
26. **Not on this page in 2b:** locals' notes and traveler comments. Their sections are absent, not shown
    empty. They are 2c.
27. A coordinate from OpenStreetMap shown anywhere on the page carries "© OpenStreetMap contributors".

## 2c — Locals' notes and traveler comments. **Not armed.**

No table references an event for notes or comments. Two questions are not ruled: whether comments are
reviewed before they appear, and who may comment. Nothing is built until they are.

## Decisions needed at the Phase 0 hard stop

Each has a recommended answer. None is taken by this brief.

- **E1. Dated rows in `destination_events`.** Partner rows (Fever) are written there with a
  `specific_date`, born pending (`server/services/partner-events-cache.service.ts:251–262`). Recommended:
  calendar days come from `city_events` only. Phase 0 reports how many approved dated rows the seed holds
  (production was not read); any worth keeping move into `city_events` through its row builder as a
  follow-up, and are not painted from the second table.
- **E2. The page's address.** Recommended: `/events/<source_id>`. Manual rows already carry a stable slug
  there ("estereo-picnic-2027"), so no migration. It must resolve to exactly one live row; two matches
  are a 404 and a logged warning.
- **E3. The door for "Plan around it" on the detail page.** Recommended: a new `event_detail` door in the
  closed list (`client/src/lib/plan-steps.ts:152`), so the funnel can tell the page from the list. Step
  8a edits the same list; whichever merges second rebases.
- **E4. A stored "checked" date for an event's dates and venue.** Recommended: not now. 2b shows the
  organizer link without a date.

## Out of scope

Locals' notes and comments (2c); a link from a blog post to the event page (the blog door carries no id
by design); the "Show / Festival · Plan around it" card on the Experiences start page (step 8 decision
D6); which doors land on the map planner; ticket sales; event photos; moving partner events into
`city_events`; dark-theme coral; anything in `step-8-brief.md`.

## Gates

- **Phase 0 first for each PR, read-only, `file:line` for every claim, then a hard stop for a go.** 2L:
  the migration, builder and seeder changes. 2a: reshape or replace the two calendar components; every
  test that pins today's behaviour (the 1/8/15/22 marks, `hidden lg:block`, the "Coming up" block on
  `/events`); the answer to E1. 2b: the read, the address (E2), the door (E3).
- **Fixture tests.**
  - 2L: an insert stores a stated locality; the fill touches only NULL values on manual rows and nothing
    else; a second run changes nothing; an entry with no locality leaves NULL.
  - 2a: a month-level row produces no day mark and appears in the band for every month it spans; December
    to January changes the year and shows the right events; an event under way is listed and reads
    "On now"; the marks for a period and the rows in "What's on" are the same set; an event with no
    vertical appears only under "All"; the "outside the city" line shows only where a locality is stored
    and differs; `/api/city-events/upcoming` returns what it did before.
  - 2b: a withdrawn or unknown event is a 404; an unattributable fact is omitted; with no official fact
    there is no "Good to know"; no notes or comments section renders.
- **e2e.** At a phone width the calendar is visible and a day can be picked. Month, then Week, then Day
  narrows "What's on". From a row, "Event details" opens the page and "Plan around it" opens the pop-up
  with the event's dates and venue filled in.
- The guards of `2026-09-28-city-events` pass without edits, except where they pin the "Coming up" block
  on `/events`; any such edit is named in the report.
- tsc at or below the baseline in `build.yml`; guard batch clean, including the page-hex guard.

Per PR, report: the PR, the tests above, and anything on the boards the data cannot support.

## Honesty notes

- The events on the boards were taken from the manual seed as it stood on 5 Oct; the four season bands and
  the two rated cities are examples. The page shows what the tables hold.
- Bracketed text on the detail board ("[Expert note…]", "[N]", "[DATE]") marks content that does not
  exist yet. None of it is copy to ship.
- "Comments are reviewed before they appear" on the board is a drawn assumption, not a ruling.
