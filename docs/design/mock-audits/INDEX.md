# Mock audit briefs — live code vs ratified mocks

One brief per design mock under `docs/design/`, written 2026-08-29 (repo state: post-#621, `main`
≈ `6ed99a9f`'s merge). Each brief tells an auditing agent exactly what the mock ratifies, where the
live code lives, how to check it, and — critically — which divergences are **already ruled on** and
must be reported as state, never "fixed".

## Rules of engagement for the auditor

1. **Authority ordering varies per mock and is stated at the top of each brief.** For most mocks the
   ledger ruling text wins over both code and pixels. For `chrome-alignment` the merged code wins
   over the mock (post-merge reconstruction). Never assume; read the brief's Status line.
2. **Report, don't repair.** The deliverable is a findings list (mock section → live file:line →
   match / divergence / already-ruled). Do not change code, tests, or mocks during the audit.
3. **§13 honesty is a behavior, not styling**: several mocks ratify that sections are *omitted*
   when data is absent (never zero-filled, never guessed). Absence of a row can be correct.
4. **Stale mock furniture is flagged in the briefs** — several mocks carry "nothing built yet"
   footers or pre-supersession layouts from their sign-off date. The briefs name each one.
5. Dead routes in this app return **200 + HTML (Vite catch-all), not 404** — never use a 404 probe
   as a "route missing" signal.

## The briefs

| Brief | Mock | Family |
|---|---|---|
| `grounded-plan-card-mock.audit.md` | grounded itinerary card (Item 2) | Aug 22–23 merged |
| `grounded-ai-slips-mock.audit.md` | catalog + DMO grounding (Item 2 P1) | Aug 22–23 merged |
| `grounding-affiliates-mock.audit.md` | affiliate rung, §16-safe (Item 2 P2) | Aug 22–23 merged |
| `content-history-timeline-mock.audit.md` | admin content history (provenance Move 3) | Aug 22–23 merged |
| `optimizer-catalog-mock.audit.md` | optimizer approved-only + destination-scoped catalog | Aug 22–23 merged |
| `optimized-slip-review-mock.audit.md` | optimizer results / slip review | Aug 22–23 merged |
| `ready-made-by-theme-mock.audit.md` | Ready-Made centered on theme/experience | Aug 22–23 merged |
| `storefront-discovery-mock.audit.md` | storefront reachability + partner-card rule | Aug 22–23 merged |
| `concierge-revision-mock.audit.md` | Concierge revision flow (P1/P2 surfaces) | Concierge |
| `concierge-revision-p3-mock.audit.md` | admin dispute + no-self-serve-refund + listing promise | Concierge |
| `adopt-optimization-mock.audit.md` | build-around-a-location + adopt flow (**split: shipped vs pending**) | Optimizer |
| `chrome-alignment-mock.audit.md` | chrome earn-grammar reskin, Variant A | Chrome |
| `marketplace-experts-earn-grammar-mock.audit.md` | earn-grammar transcription (+ SPEC/BENTO oracles) | Marketplace |
| `landing-earn-mock.audit.md` | landing page earn grammar (+ LANDING_SPEC) | Landing |
| `pricing-surfaces-mock.audit.md` | pricing surfaces (+ Trip-Pass CTA re-point ratified) | Pricing |
| `provider-console-mockup.audit.md` | provider console: Catalog / Workstation / Distribute / create wizard | Console |
| `service-creation-mock.audit.md` | delivery-method-branched create wizard | Console |
| `service-creation-audit.audit.md` | the Aug 12 audit artifact, recast as re-verify checklist | Console |
| `create-flow-refinements.audit.md` | one-card Basics, ideas rail, post-publish nudge | Console |
| `catalog-preview-mock.audit.md` | Catalog Manage/Preview toggle + map preview | Console |

### Wedding / occasion flow — **v2 (post-build) headline findings** (re-audit 2026-09-04, `main` @ `fcbc1d097`)

> Read this block **before** the Phase A briefs below it. The Phase A briefs (`wedding-*.audit.md`)
> compared the 22 ratified artboards in `docs/design/wedding-flow/` to the code **before** the build
> (#755–#765, Locked Decisions 33–37). This block records the re-audit of **all 22** against
> `origin/main` as it now is. Per-artboard files are `wedding-*.v2.audit.md`; a v1 brief is a dated
> record and was not edited.

**What closed.** Every Phase A headline is now closed:

- **The five-step modal exists.** `client/src/components/trip/plan-modal.tsx` is the one modal
  (renamed from `edit-trip-panel.tsx`, not copied), with the ratified rail
  Occasion → Where → When → Who → What's happening, and one door table —
  `resolvePlanSteps` (`client/src/lib/plan-steps.ts:119`–`134`). Step 1's tiles are the **real**
  `GET /api/experience-types` catalog; an empty fetch says so (§13) instead of falling back to the
  old hardcoded five.
- **`/start/events` has its third door** — the host, opening the shared `PlanEntryCta` and passing
  **no occasion** (`client/src/pages/start-events.tsx:19`–`22`, `:95`–`97`).
- **The Guests page is real and derived** — `/plans/:tripId/guests`, one row per person, one column
  per event (`client/src/pages/plan-guests.tsx`). The v1 correction stands:
  `participant-travel-tracker.tsx` was never the live surface.
- **Golf has its own occasion row** (`server/seeds/experience-template-tabs.seed.ts:4906`–`4907`,
  `schedule: true`) with its own presets (`GOLF_TRIP_PRESETS`, five anchors), so the tee-times step
  is reachable for the occasion the artboard depicts.
- **Stops and event clock times are built** — `Mismatch`'s "Add \<city\> as a stop", `TravelWhere`'s
  ordered list, `WhichEvent`'s clock line and step 5's Day/Time/Place table.
- **`NavTuned`'s featured Wedding row** ships as a generic `featured` flag with the exact ratified
  typography; **`NavEntry` and `Before` are now the stale halves of their before/after pairs.**

**Door → start-step table (Locked Decision 33), verified against every `usePlanning().open(` caller.**
Every call site was grepped; all agree with `resolvePlanSteps` except the one flagged below:

| Door | Call site | Source passed | Start step | Ruling row |
|---|---|---|---|---|
| Hero / final CTA | `pages/landing.tsx:32,46` | none | 1 | hero → step 1 ✅ |
| Masthead "Start planning" | `components/layout.tsx:220,226` | none | 1 | ✅ |
| City ticker | `components/CityTickerTape.tsx:69` | none | 1 | ✅ (holds many markets, names no one city — §13) |
| Moment card | `components/landing/moments-section.tsx:212` | `branch`, `experienceType`, `experienceSlug`, `momentKey` | **2** + pill | Moment → step 2 ✅ |
| Nav Wedding row | `components/layout.tsx:399` (`nav-config.ts:175`) | `experienceType`, `experienceSlug` | **2** + pill | nav Wedding → step 2 ✅ |
| `/start/events` host | `pages/start-events.tsx:97` → `plan-entry-cta.tsx:66` | none | 1 | `/start/events` → step 1 ✅ |
| Marketplace (4 routes) | `pages/discover.tsx:1328`–`1331` | `city` only | 1, step 2 pre-filled | marketplace → step 1 ✅ |
| Experiences | `pages/experiences.tsx:249` | — | — | **ruled page-local `IntakePanel`**, allowed by `check-planning-entry.cjs:84` |
| Expert detail | `pages/expert-detail.tsx:276` | `city` | 1, step 2 pre-filled | rule 4 ✅ |
| Experience template | `pages/experience-template.tsx:3023,3349` | none — but the page writes `experienceSlug` into trip context (`:1094`, `:1590`, `:1659`) | **2** via the context path | experience CTA → step 2 ✅ (indirectly) |
| Cart header | `pages/cart.tsx:1219,1605` | none | 1 or 2 by context | edit door ✅ |
| Pricing ladder | `pages/pricing.tsx:120,138` | `branch` only | 1, one finish CTA | rule 6 ✅ |
| Trip details / dashboard / how-it-works / about / features / itinerary-view | various | none or `destination` | 1 | ✅ |
| **Trip Strip Edit** | `components/trip/trip-strip.tsx:317` | none | 1 or 2 by context — **but only when no trip is bound** | ⚠️ see (B2) below |

**Classification of every divergence found.** Full evidence is in the per-artboard v2 briefs.

**(A) Contained — fixable in code without a ruling.** This list is the fix lane's input, verbatim.

| # | Artboard | File:line | The one-line fix |
|---|---|---|---|
| A1 | `NavTuned` | `client/src/lib/nav-config.ts` (Experiences group, `:135`–`205`) | Add the "Browse all occasions" footer leaf the artboard draws (target `/experiences/travel`, matching `moments-section.tsx:126`). |
| A2 | `Step2Where` | `client/src/components/trip/plan-modal.tsx:1183`–`1192` | The unratified "Plan name (optional)" field sits on step 2; delete it or add it to the artboard — the pixels and the code disagree about whether step 2 has one field or two. |
| A3 | `Step3Day` | `client/src/components/trip/plan-modal.tsx:1197`–`1227` | Missing caption "Your own city, one evening. No stops, no range." — must be **derived**, not literal ("your own city" depends on `users.home_city`, in flight). |
| A4 | `Step4Variants` | `client/src/components/trip/plan-modal.tsx:1300`–`1303` | Under the `attendees` vocabulary the modal still asks for **Kids**; build the stepper tuple from `noun` so a corporate plan shows one stepper. **Omit, never disable.** |
| A5 | `Step4Variants` | `client/src/components/trip/plan-modal.tsx:889` | `stepNote.who` is one fixed sentence for all four occasions; branch it like `stepNote.when`/`stepNote.where` already branch. Optional. |
| A6 | `Step5Events` | `server/services/logistics-presets.service.ts:34`–`112` | `WEDDING_PRESETS` has five anchors; the artboard (and `Slip.dc.html`, and the landing Moment copy) also name **Welcome drinks** and **Farewell brunch**. Add two anchors, each with its own `anchorType`. **Server-side only** — chips are never restated client-side. |
| A7 | `Step5Events` | `client/src/components/trip/plan-modal.tsx:1411`–`1419`, `:1428`–`1474` | The ratified table is 4 columns (Event · Day · Time · Place); live merges Day and time into one cell. |
| A8 | `Step5Events` | `client/src/components/trip/plan-modal.tsx:1386`–`1400` | "Something else" is drawn as a chip and built as a text input (behaviour is richer; only the shape differs). |
| A9 | `Step5Events` | `client/src/components/trip/plan-modal.tsx:1487` | Missing line "Guests are per event. Brunch can be family only." — gate it on `guestListSetting(...) === true`. |
| A10 | `TravelEvents` + `Step4Who` | `client/src/components/trip/plan-modal.tsx:1356`–`1359` **and** `:1347`–`1350` | Both notes promise a per-event **guest list** unconditionally. `golf-trip` seeds `guests:false`, so a golf plan is told it has one. Derive the clause from `guestListSetting`. **One fix, two lines.** |
| A11 | `TravelEvents` / `Step5Events` | `client/src/components/trip/plan-modal.tsx:874` | `stepTitle.events` — the two artboards say "What's on the schedule?" and "What's happening over the weekend?"; the code says "What's happening?". Pick one, amend the others. |
| A12 | `TravelWhere` | `client/src/components/trip/plan-modal.tsx:1044`–`1061` | Under `many`, row 1 has a "Destination" label and no ordinal, so the list reads *Destination / 02 / 03*. Render "01" when `stopsMany`. |
| A13 | `TravelWhere` / `TravelWhen` | `client/src/components/trip/plan-modal.tsx:865`, `:866` | `stepTitle.where`/`.when` do not vary by occasion ("Where is it happening?" / "When is it?" everywhere); the travel artboards ask "Where are you going?" / "When are you going?". Optional. |
| A14 | `TravelWhen` | `client/src/components/trip/plan-modal.tsx:849`–`860` | Eyebrow carries no stop count ("Your golf trip · 3 stops"); derive from `namedStops(stops).length` under `stopsMany`. |
| A15 | `TravelWhen` | `client/src/components/trip/plan-modal.tsx:1261` | The "main moment" card renders for **golf** (`range` + `schedule:true`), which the artboard does not draw, and it writes a `temporal_anchors` row beside four tee-time anchors. Narrow the gate or amend the artboard — **read (B4) before choosing the first option.** |
| A16 | `Slip` | `client/src/components/plancard/SlipView.tsx:216`–`225` | `slip-meta` omits the event count the artboard shows; use `countPlanEvents` (`slip-events.ts:147`), hidden at zero exactly as the Trip Strip chip is. |
| A17 | `Slip` | `client/src/components/plancard/SlipView.tsx:1356`–`1359` | Day heading is "Day 1 · …"; the artboard names the weekday ("Friday · Oct 2"). |
| A18 | `Slip` + `WhichEvent` | `client/src/lib/slip-events.ts:182`–`194` | `eventMetaLine` prints `EEE, MMM d` + time; both artboards want the short form ("Sat 15:00"), and on the slip the day is already in the heading above. Add a format option — **ONE implementation, two callers; do not fork it** (§18 rule 1). |
| A19 | `Slip` | `client/src/components/plancard/SlipView.tsx:585`–`596` | `PlanEvent.guestCount` is carried on the payload and never rendered; the artboard shows "58 attending" per event. Omit when null, never "0 attending". |
| A20 | `Slip` | `client/src/components/plancard/SlipLogisticsSection.tsx:145`–`160` | The slip's Guests block has the ratified "Open guest list" link but none of the artboard's totals; surface `GET /api/trips/:tripId/guests` totals (`countries` is already omitted-when-absent server-side). |
| A21 | `SlipProposal` | `client/src/components/plancard/SlipView.tsx:185`–`212` | No "Private plan" badge. Share and Guests are correctly **hidden**, but nothing tells the traveler the absence is by design. Gate a marker on the same `isHidden`. |
| A22 | `Guests` | `client/src/pages/plan-guests.tsx:154`–`171` | No page-level "Copy links" / "Invite by email" actions (live invites are per-column). Any "Invite by email" must open the **one** writer, `GuestInviteManager`; "Copy links" has no ratified target and should not be invented. |
| A23 | `Guests` | `client/src/pages/plan-guests.tsx:17`–`18` | **Stale comment**: "`user_experiences` has `event_date` and no time-of-day column" — migration 282 added `start_time`. Documentation only; do not start emitting times. |
| A24 | `OccasionRow` | `server/seeds/experience-template-tabs.seed.ts:4828` | `girls-trip` seeds `vocabulary:"travelers"`; the ratified row says **guests**. Confirm before changing — it moves the step-4 title and the Trip Strip party noun. |
| A25 | `OccasionRow` | `server/seeds/experience-template-tabs.seed.ts:4809` | `corporate-events` seeds `duration:"range"`; the ratified row says **a day**. Confirm before changing — it changes which date fields a corporate plan is asked for. |
| A26 | `Planner` | `client/src/pages/start-events.tsx:37`, `:47` | Door CTAs read "Continue as a Service Provider" / "Apply as an Event Planner" vs the artboard's "Become a provider" / "Become an expert". **Recommendation: amend the artboard** — the live labels are more precise and consistent with Locked Decision 36. |
| A27 | `Step2Where` | `client/src/components/trip/plan-modal.tsx:882`,`884` | `stepNote.where` paraphrases the artboard ("is flagged when you add it" vs "will be flagged before it lands"). **Recommendation: leave as is** — the live wording is more precise about when the check runs. |

**(B) Needs a ruling.**

| # | Question | Where it bites | Which decision |
|---|---|---|---|
| B1 | Does the plan's **main moment carry a traveler-given name** (the artboard's "Ceremony")? It cannot simply be added: `temporal_anchors.description` is currently both the label *and* the idempotency key that makes a second save an UPDATE (`plan-modal.tsx:148`, `:558`, `:570`). | `Step3When` | Amends **Locked Decision 33**'s main-moment clause; touches `temporal_anchors` semantics (Coordination Prevention). |
| B2 | Does the **Trip Strip carry a modal "Edit" once a plan is bound**? Today the one control is a `<Link>` to the planning route (`trip-strip.tsx:305`–`323`) and the modal opens only in the trip-less branch, so Locked Decision 33's *"the Trip Strip's Edit → step 1 or 2 by what the plan already holds"* describes a door the code does not expose. The artboard draws **both** "Edit" and "Continue planning ›". | `StripLead` | Either the code grows the door or **Locked Decision 33**'s door table is corrected. |
| B3 | Do items **inside an event** group into named sections (Timeline / Ceremony & Venues / Vendors & Services / Guest Logistics)? Nothing on `itinerary_items` carries such a bucket. | `Slip` | Schema + taxonomy (Coordination Prevention). |
| B4 | Should the **main-moment card** be suppressed for an occasion whose schedule is a *list of appointments* rather than one anchor (golf)? There is no switch to key on, and inventing a seventh switch is what **Locked Decision 31** warns against. | `TravelWhen`, `OccasionRow` | Escalate before adding a switch. |
| B5 | Does an item carry a **status vocabulary beyond the four routing statuses** ("on schedule", "confirmed"), and does a location mismatch **persist** onto the item as "flagged"? Persisting it contradicts `2026-09-04-location-mismatch`'s advisory posture, so it cannot be a code fix. | `Slip` | Amends `2026-09-04-location-mismatch` and/or the routing-status set. |
| B6 | Is a **per-plan switch override** in scope? `OccasionRow`'s caption says "the user can flip any switch inside the plan"; nothing stores an override today. | `OccasionRow` | Schema (Coordination Prevention). |
| B7 | The slip's **expert rail card** shape ("Aya · Kyoto local · with 3 items / Message") vs today's per-event advisor line + "Hire an expert" affordance. | `Slip`, `SlipProposal` | Product. |

**(C) Ruled omission — correct as is; do not "fix".**

- `Before.dc.html` and `NavEntry.dc.html` are **superseded baselines** (the Wedding moment and the
  activity regroup both shipped). Auditing toward them would undo ratified work.
- The **photo gate**: the Wedding Moment (and with it the "Planning your own?" callout) is
  configured and **invisible** until a market has ≥1 attributed real, non-stock, expert-curated
  photo. No photo and no builder handle were fabricated.
- **Add-a-stop is ABSENT, not disabled**, under `default_stops: one` — and the mismatch dialog's
  "Add \<city\> as a stop" is likewise omitted when the gate cannot write.
- **Party steppers start at "—" and have no explicit zero** (migration 241 de-masking): the
  artboards draw filled forms, not defaults.
- **Step 5's Day and Place are placeholders, not values**, and the Time has no default at all —
  a shown default and a chosen value must not be the same fact.
- **Golf tee times are not seeded** at 08:10/Old Course: a preset states a starting point, not a
  booking nobody made.
- `Mismatch`'s footnote **"Plans with more than one stop are not flagged" is ruled against** and
  must stay unimplemented.
- **Guests**: no "family only" tile (no column marks it); declined gets its own glyph rather than
  sharing not-invited's dash; blank cells are never "Unknown"/"None"; `countries` is omitted
  rather than 0.
- **`Step3When`'s "Guests see it in their own time zone."** is correctly dropped: `trips.timezone`
  is nullable (Locked Decision 30) and `start_time` is stored wall-clock verbatim
  (Locked Decision 35), so the promise is unsupportable.
- **The step-5 finish is three CTAs, not "Create plan · N events"** — Locked Decision 33.
- **`experiences.tsx`'s page-local `IntakePanel`** is a ruled second entry shape, explicitly
  allowed by `scripts/check-planning-entry.cjs:84`.

**In flight — marked, not filed.** Two lanes are building against these artboards and are **not on
`main`**; nothing below was counted as a divergence:
`task-step4-variants-fields` (**lane G**: the Step4Variants budget-approver field and accessibility
note, the home-city default, the expert-authoring relabel, and the sixth golf chip "Driver between
links") and **#766** (the slip's traveling-party section).

**Not verifiable without a running server** (recorded in each brief): whether any market's photo
gate passes today; the live occasion tile set and preset payloads
(`GET /api/experience-types`, `GET /api/logistics/presets/:slug`); the owner-tier gate and real
dedupe behaviour of `GET /api/trips/:tripId/guests`; end-to-end persistence of stops, party NULLs
and event rows. **No Playwright spec references any wedding-flow testid** — `e2e/specs` covers
`button-plan-trip` and `slip-view-${tripId}` only; the flow's testids are pinned by vitest
(`plan-steps`, `plan-stops`, `plan-events`, `slip-events`, `which-event`, `location-mismatch`,
`occasion-switch-readers`, `trip-strip-lead`, `which-event-picker`).

| v2 brief | Artboard | v1 brief |
|---|---|---|
| `wedding-before.v2.audit.md` | `Before.dc.html` | `wedding-before.audit.md` |
| `wedding-main.v2.audit.md` | `Main.dc.html` | `wedding-main.audit.md` |
| `wedding-nav-entry.v2.audit.md` | `NavEntry.dc.html` | `wedding-nav-entry.audit.md` |
| `wedding-nav-tuned.v2.audit.md` | `NavTuned.dc.html` | `wedding-nav-tuned.audit.md` |
| `wedding-step1-occasion.v2.audit.md` | `Step1Occasion.dc.html` | `wedding-step1-occasion.audit.md` |
| `wedding-step2-where.v2.audit.md` | `Step2Where.dc.html` | `wedding-modal-where.audit.md` |
| `wedding-step3-when.v2.audit.md` | `Step3When.dc.html` | `wedding-step3-when.audit.md` |
| `wedding-step3-day.v2.audit.md` | `Step3Day.dc.html` | `wedding-step3-day.audit.md` |
| `wedding-step4-who.v2.audit.md` | `Step4Who.dc.html` | `wedding-step4-who.audit.md` |
| `wedding-step4-variants.v2.audit.md` | `Step4Variants.dc.html` | `wedding-step4-variants.audit.md` |
| `wedding-step5-events.v2.audit.md` | `Step5Events.dc.html` | — |
| `wedding-strip-lead.v2.audit.md` | `StripLead.dc.html` | — |
| `wedding-slip.v2.audit.md` | `Slip.dc.html` | — |
| `wedding-which-event.v2.audit.md` | `WhichEvent.dc.html` | — |
| `wedding-mismatch.v2.audit.md` | `Mismatch.dc.html` | — |
| `wedding-guests.v2.audit.md` | `Guests.dc.html` | `wedding-guests.audit.md` |
| `wedding-slip-proposal.v2.audit.md` | `SlipProposal.dc.html` | — |
| `wedding-occasion-row.v2.audit.md` | `OccasionRow.dc.html` | — |
| `wedding-planner.v2.audit.md` | `Planner.dc.html` | `wedding-planner.audit.md` |
| `wedding-travel-where.v2.audit.md` | `TravelWhere.dc.html` | `wedding-travel-where.audit.md` |
| `wedding-travel-when.v2.audit.md` | `TravelWhen.dc.html` | `wedding-travel-when.audit.md` |
| `wedding-travel-events.v2.audit.md` | `TravelEvents.dc.html` | `wedding-travel-events.audit.md` |

---

### Wedding / occasion flow (Phase A of `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md`, 2026-09-04)

The 13 `surface exists — UNAUDITED` rows in `docs/design/wedding-flow/README.md`'s Fidelity
column, audited in the README's own flow order. Unlike the briefs above, each of these merges
the "what to check" brief and its findings into ONE file (the task that produced them asked for
that shape) — there is no companion `.report.md`.

| Brief | Mock | Family |
|---|---|---|
| `wedding-before.audit.md` | Moments section today (7 keys, no wedding) | Wedding / Landing |
| `wedding-main.audit.md` | Landing page with Wedding added as an 8th moment | Wedding / Landing |
| `wedding-nav-entry.audit.md` | Nav · Experiences dropdown "today" (stale baseline) | Wedding / Landing |
| `wedding-nav-tuned.audit.md` | Nav · tuned-by-activity regroup (**already shipped**) | Wedding / Landing |
| `wedding-step1-occasion.audit.md` | Plan modal step 1 · Occasion | Wedding / Plan modal |
| `wedding-modal-where.audit.md` | Plan modal step 2 · Where (artboard `Step2Where.dc.html`, renamed from `ModalWhere.dc.html` by ledger `2026-09-04-golf-occasion-and-housekeeping`; the BRIEF filename is unchanged) | Wedding / Plan modal |
| `wedding-step3-when.audit.md` | Plan modal step 3 · When (event class) | Wedding / Plan modal |
| `wedding-step3-day.audit.md` | Plan modal step 3 · a day, not a range | Wedding / Plan modal |
| `wedding-step4-who.audit.md` | Plan modal step 4 · Who | Wedding / Plan modal |
| `wedding-step4-variants.audit.md` | Four occasions, one control (the `vocabulary` switch) | Wedding / Plan modal |
| `wedding-planner.audit.md` | `/start/events` · three doors | Wedding / Other |
| `wedding-travel-where.audit.md` | Golf trip · Where (ordered stops) | Wedding / Other |
| `wedding-travel-when.audit.md` | Golf trip · When (range only) | Wedding / Other |
| `wedding-travel-events.audit.md` | Golf trip · step 5 (tee times) | Wedding / Other |
| `wedding-guests.audit.md` | Guests · one list, a column per event | Wedding / Other |

**Headline findings from this family** (see each brief for evidence):
- **No stepped wizard exists.** All six `Step*` plan-modal artboards describe one
  multi-step modal (a persistent Occasion/Where/When/Who/What's-happening rail with "Next: X"
  progression) that is not built in any shape. The real live planning entry
  (`client/src/contexts/PlanningContext.tsx`) is a 2-tier chooser, and its "Plan with AI" branch
  (`EnhancedPlanningModal.tsx`) is one unstepped scrolling form with a hardcoded 5-value occasion
  list — unrelated to the real 22-row `experience_types` catalog. A SEPARATE, unstepped dialog
  (`client/src/components/trip/edit-trip-panel.tsx`, reached only from the Trip Strip/cart
  header/experience-template empty state — never the primary "Plan this moment" entry) DOES
  correctly implement the real occasion-switch logic (day-vs-range dates, the `vocabulary` noun
  switch, server-preset schedule chips) that several of these mocks draw — just not inside a
  step rail.
- **`Guests.dc.html`'s cited live surface was wrong.** `participant-travel-tracker.tsx` (the
  README's pointer) has zero consumers anywhere in the client — confirmed unmounted, matching the
  project's own prior diagnosis in `docs/DECISIONS.md` row `2026-09-04-guest-list-reconciliation`.
  The real, reachable guest surface is `client/src/components/GuestInviteManager.tsx`, a
  single-event invite list with no per-event columns at all. The same ledger row independently
  states the mock's "column per event" layout "cannot yet be drawn honestly" pending an
  unratified schema proposal — this is the family's biggest, and best-documented, gap.
- **`/start/events` still has only its old two supply-side doors.** `Planner.dc.html`'s own
  footer names the bug it exists to fix ("only (b) and (c) existed, so a couple… was sent to
  sell"); `start-events.tsx` still has exactly those two doors and no traveler/host option.
- **`NavTuned.dc.html`'s "proposal" already shipped.** The activity-grouped nav (Trips /
  Celebrations / Nights out & getaways / Work) is live on `main`, landed by ledger
  `2026-09-03-occasion-hygiene` — one day before this mock family was committed. `NavEntry.dc.html`
  ("today") is therefore the stale one of the pair.
- **Golf trips resolve to the generic `travel` occasion**, whose `default_schedule` switch is
  `false` — so `TravelEvents.dc.html`'s entire tee-times step is switched OFF for the occasion it
  depicts, even though the schedule-chip mechanism itself is built and correct.

## Cross-cutting cautions (surfaced while writing the briefs)

- **Stale "not built yet" footers**: `concierge-revision-p3-mock` and `grounded-ai-slips-mock` both
  say nothing is built — both lanes are fully merged. The footers date from sign-off.
- **`catalog-preview-mock`'s map view is superseded**: its on-Catalog authoring toolkit (pin/route/
  radius editing) was moved into the create flow's spatial step by a later ruling; Catalog's map is
  read-only preview. Do not audit toward the mock's toolkit.
- **CLAUDE.md §22 wording vs later ruling**: "Catalog is the map's authoring home" was amended —
  the briefs carry the current state; where §22 and the console brief disagree, the brief's cited
  ledger row governs. Likewise §24's "Logistics" step was renamed (Bring/Access now sits on the
  step currently labeled Scheduling); behavior unchanged.
- **`optimized-slip-review`**: the ledger's "V3 flagged outstanding" note may be stale — client
  scaffolding for 3 variants exists; verify end-to-end rather than trusting either source. Mock
  testids are illustrative; the real pattern is dynamic (`proposal-preview-${variantId}`).
- **`storefront-discovery`**: the mock's "More from @seller" row was ratified AGAINST at the time;
  a later ruling (`2026-08-25-card-source-link`) introduced the below-card source row that exists
  today — it arrived by a different lane. Also surface (don't resolve) the `/p/:handle` vs
  `/s/:handle` naming drift.
- **Duplicate mock copy**: `docs/testing/mock/service-creation-mock.html` differs from the
  `docs/design/` copy; the `docs/design/` one is the audited artifact.
- **`pricing-surfaces`**: the Trip-Pass CTA now routes authed users to `/dashboard` with a
  pick-a-trip toast (PR #621) — ratified divergence from the mock's stub, not a bug.
- **`adopt-optimization`**: audit only the "Shipped — audit now" list; the dispatched/pending items
  (V3 client completion, server R-A/B/C, `anchor-format.ts`) are known-absent by design today.
- **Ledger lag**: rows `2026-08-29-trip-pass` and `2026-08-28-single-planning-entry` are not yet in
  `docs/DECISIONS.md` (queued for the docs pass); their PR bodies (#621, #619) carry the text.
