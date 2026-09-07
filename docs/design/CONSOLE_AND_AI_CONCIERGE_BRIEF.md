# The AI Concierge on the Slip, and the console around it

**Type:** design brief — draft for ruling. **Date:** 2026-09-07. **audited@f3933df** (`main` at the merge of #823).
**Canvas of record:** claude.ai artifact `04dfd827` ("AI Concierge on the Slip"), 18 artboards. The artboards are the
mock this brief cites; per the wedding-flow preservation precedent they should be committed beside this file
(`docs/design/console-brief/`) in Wave 0 below, so the rulings cite a mock anyone can open.
**Standing rules that govern every lane:** CLAUDE.md §13 (honest-or-absent), §14/§15 (money), §18 rule 1 (one
derivation, never two), §19 (allowlists), the publish-trap posture (additive, no CHECK, declared in
`shared/schema.ts`), and `docs/OPERATING_PROCEDURE.md` §3 (lane brief, one ledger row per lane, serial landing).

---

## The answer

The AI Concierge should not be a place. It is an actor on the plan, and the slip is the plan, so every AI surface
becomes a control on the slip that reads the plan live and writes only through proposals. The AI Planner splits at
the mint: before a plan exists it is a door into the one planning modal, after the mint it is a drawer on that plan's
slip. The console stops being ten peer destinations and becomes one spine, My plans, with every other tab a view
that reads plans and lands its actions on one plan's slip. Home owns the one axis no other tab has: time.

## Rulings this brief asks for

1. **A nullable trip id on the AI conversation row**, so a conversation can belong to a plan. Additive, no CHECK,
   declared in `shared/models/chat.ts` (which `shared/schema.ts` re-exports).
2. **The concierge page becomes a door** into the one modal, on the `/quick-start` retirement pattern (LD 42 D14).
   Its guest claim token survives.
3. **The "Ask AI about this plan" drawer on the slip is the home of the paid AI task.** Every answer is a proposal;
   apply is the traveler's click.
4. **Trip Cart leaves the sidebar.** Checkout is reached from the slip's Finish card and the Finalize chooser. The
   route stays as the guest fallback until G2.
5. **My events folds into My plans.** A done-for-you engagement is a card on its plan's slip. The money rail is
   untouched.
6. **The Trip Card loses its tab shell.** One page: frozen plan, live status, the booking-agent drawer, and a
   typographic hero when no market photo is known.
7. **The traveler console adopts the one site grammar**: coral primary, earn tokens, Fraunces headings, Geist Mono
   eyebrows. Discover, Experts and checkout render inside the shell.
8. **Home owns the time axis, amending R-A.** The page is what is coming up across every plan, dated rows nearest
   first, plus what changed since the last visit. No plan card, no counts, no messages: those live on My plans, the
   slip and Inbox.

---

## 1 · What exists today, and why it pulls against the slip

- **"AI Concierge" is three different things.** On the pricing map it is a paid AI task at $2.99
  (`concierge:ai_task`). In the code, `/concierge` is a one-shot quote funnel pricing three tiers (AI / Expert /
  Done-for-you) that hands off elsewhere. In Locked Decision 44 it is the booking copilot. Nothing on the slip is
  called concierge except the ready-made revision card, which is human.
- **The three-tier chooser exists three times.** The modal's finish asks myself / AI / local / occasion. The
  Finalize modal asks myself / agent / expert / concierge. The concierge page asks AI / expert / full. One question
  answered in three places is the drift class §18 rule 1 names.
- **The AI Planner is a dead end after the mint.** `/ai-assistant` extracts basics, mints through the one create
  rail, navigates to the slip, and then has no relationship to that plan. Its conversations carry no trip id. The
  modal's AI finish opens a different component again (`EnhancedPlanningModal`).
- **The two AI escalation cards sit on the wrong surface.** `ConciergeModule` mounts on the dashboard summary card;
  `EscalationCTA` mounts only on the full Trip Card. Since D8 redirects every pre-final plan to the slip, polish is
  reachable only on a plan that is already final.
- **The cart is still a second store.** The authenticated `/api/cart` reads `cart_items`, and the slip's Finish card
  sends "Go to checkout" there. LD 39 says the cart is a projection of the plan's items with no second store. Two
  stores feed one checkout page today.

## 2 · The AI Concierge: one actor, three appearances

Keyed to plan state, never a sidebar destination.

| Appearance | Where | What it does |
|---|---|---|
| **The one AI action** (exists) | Build card on the slip | Draft on an empty plan, Optimize on a non-empty one. Review-first, paid gate, free preview beside it. Keep exactly as LD 41 ratified. |
| **Ask AI about this plan** (rulings 1, 3) | A drawer on the slip | Where the $2.99 task lives, charged only on apply. The AI reads the same plancard payload the expert reads live and answers with a proposal that lands like an expert suggestion. The pre-mint conversation continues here, one AI thread per plan. Trip Pass coverage of tasks is on the pricing map but has no charge site (LD 41 f), so the drawer does not claim it. |
| **The booking agent** (LD 44) | The same drawer, mounted on the Trip Card after Finalize | Flips to the copilot vocabulary: researching, ready to buy, flagged, unavailable. "Booked" only with a confirmation in hand. Polish becomes a task; escalate-to-human opens the one expert picker. |

**The concierge page becomes a door.** Its intent form already holds destination, occasion and party size, so under
D13 it passes those into the one modal and the tier choice becomes the modal's finish. The guest claim token
survives because the door still captures the lead before sign-in.

### Drawer anatomy (artboard `SlipDrawer`)

- 340 px column to the right of the 320 px rail; header "Ask AI about this plan · reads the plan live · one thread
  per plan"; tabs **Plan** and **Booking agent** (the second only on the Trip Card after Finalize).
- Thread: the traveler's request; the AI's one-line answer; a **proposal card** — "Proposal · replaces 1 item", the
  proposed item row with an `AI draft` chip and an "in place of …" chip, a line naming what is protected (expert
  items, booked rows — LD 42 D3), the fee line "$2.99 task · charged only when you apply", and **Apply to plan /
  Discard**.
- Composer at the foot with the standing note: "Nothing changes until you apply. Prices and availability are never
  invented; a missing one is said out loud."
- The Build card gains one row, "Ask AI about this plan", beside Draft/Optimize; the Trip Pass chip reads "runs ·
  fee waived" and never "tasks".

## 3 · The AI Planner splits at the mint

- **Before the mint it is a door.** The chat plus draft panel is the conversational way to fill the modal's five
  questions. "Continue in the planner" opens the modal pre-filled through the door table (`resolvePlanSteps`), so the
  traveler confirms stops, dates, party and events on the same steps every other door uses. Today
  `AiPlannerDraftPanel` mints directly and skips the modal (D11, D13).
- **The mint is the boundary.** After it, the same conversation attaches to the trip and renders as the slip drawer
  (ruling 1).
- **The sidebar tab stays, renamed "Start with AI".** A conversation that already has a trip opens that trip's slip.
  The tab never edits an existing plan.
- **Every AI write is a proposal.** Free draft on empty, Optimize or a paid task on non-empty, apply on confirm,
  expert work protected per D3. No fourth AI write path. This is the posture R-J ratified for connected agents:
  agents build and stage, humans pay.

## 4 · The console: one spine, every other tab a view

| Tab | What it is | Where its actions land |
|---|---|---|
| Home | The time axis (§ Home below) | Every row deep-links to where it is acted on |
| **My plans · the spine** | One row per plan: slip pre-final, Trip Card post-final. "New plan" opens the one modal | The slip |
| Start with AI | The conversational door | The modal, then the slip drawer |
| Discover | Browse inside the shell, plan-aware | Add to plan on the one item rail; Plan now opens the modal |
| Experts | Browse inside the shell, with a hiring-for chip | Hire needs a slip (LD 32); the chip makes the precondition visible |
| Bookings | Cross-plan money ledger: escrow, disputes, reviews, refunds (R-G kept this deliberately) | Each row links to its plan; per-plan balance pay renders on the slip (D9) |
| Inbox | Human threads and updates only. AI threads never appear here | Advisor threads are plan-scoped (D22) |
| Profile | Home city, payment methods (Stripe vault, LD 43), preferences | Unchanged |
| ~~Trip Cart~~ | Absorbed: checkout from the Finish card and the Finalize chooser | Ruling 4 |
| ~~My events~~ | Absorbed: a done-for-you engagement is a card on its plan's slip | Ruling 5 |

**Gate on ruling 4:** the checkout page must read the plan's `ready_for_checkout` items for a signed-in traveler,
not `cart_items`. How far the cart-is-slip work got on `cart.tsx` was not verified for this brief; L7 audits it first.

**Shell fix:** Discover, Experts and Trip Cart render outside `DashboardLayout` today, so the sidebar vanishes on
three of ten tabs.

## 5 · What follows from rulings already on record

- The two escalation cards move from the dashboard card and the Trip Card into the drawer: on the slip pre-final, on
  the Trip Card post-final (D8, D16).
- The AI Planner's "Create this plan" opens the modal instead of minting (D11, D13).
- The sidebar tab renames to "Start with AI" (R-G, absorb-first).
- Discover, Experts and the checkout page render inside the console shell (R-G).

## 6 · Defects found in passing, reported not fixed

- The concierge AI tier navigates to `/cart?step=cart&concierge=<id>`; `cart.tsx` never reads the `concierge` param.
- The concierge Expert tier posts an expert request with no trip id — the lead-with-no-plan shape LD 32 closed for
  template inquiries.
- LD 42 D9, the bookings section on the slip, has no client half. `canPayBalance` exists server-side only.
- Three docs are stale: `trip-slip-spec.md` still describes the old flat action row; `PRICING_AND_FEATURE_MAP.md` §7
  lists the Finalize popup and Trip Pass as unbuilt; the slip canvas (`slip-canvas/gen.py`) cited as ratified
  authority is not committed anywhere in the repo.

## 7 · The Trip Card: what the June spec got, and what is still open

The June mockup's core idea holds and is built: the summary card grows into the full card with the same header and
metric strip (`PlanCardHeader` + `MetricStrip` are one component across stages). Four of its six findings are closed.

| June finding | Today | What the boards draw |
|---|---|---|
| C1 · map layers | Fixed. Expert-notes layer beside activities and transport (`MapControlCenter.tsx`). | Kept. Map view says the located count, never a default centre. |
| C2 · accept and reject | Fixed. Decline with a reason on expert suggestions; dismiss on transport legs. | Kept. Accept on a final plan advances the version (`reFinalizeIfCurrentlyFinal`). |
| C3 · booking source | Fixed. "Book on Traveloure" vs "via partner" on legs. `ItineraryCard.tsx` is dead code kept alive by two type imports. | Kept on legs. Delete the dead renderer. |
| C4 · four renderers | Fixed. One `PlanCard` family; the Workstation embeds it. | Summary and full share one header and one metric strip. |
| C5 · maps handoff | Partly. One canonical helper (`lib/navigate.ts`), but two inline handlers and `maps-platform.ts` survive. `MapControlCenter.tsx` still passes `defaultCenter={{lat:0,lng:0}}`. | No default centre. Located stops only, or no map. |
| C6 · hero photo | Changed. A fixed table of stock photo ids; an unmatched destination silently gets the generic `travel` photo. | A typographic hero unless the market has a photo of its own. Never a photo of nowhere. |
| New · tab shell | `trip-details.tsx` carries a Bookings tab that is a permanent empty state. | One page. Purchases in the drawer and in the Bookings ledger. |
| New · timezone | Up next uses the device clock and an assumed 90 minutes per item. | Countdown only when the plan carries a timezone (LD 30); otherwise the time and no countdown. |
| New · push | No web-push and no SMS exist. The June consent card was never built. | Drawn as absent, with a coral chip. A channel is its own lane. |

### Trip Card anatomy (artboards `TripCard`, `TripCardMobile`)

- **Hero:** typographic navy block (Fraunces title, dates · market · timezone · party · advisor), status pill,
  `Final · vN` chip, Share / Calendar / PDF, the 4-up metric strip. Identical component to the summary card's header.
- **View bar:** day chips + Plan | Map toggle; the Map label carries "X of Y located".
- **Itinerary:** event group header (name, time, place, attending), item rows with time, name, sub-line, routing pill
  and origin chip, Expert Notes inset (teal), transport legs with source badge.
- **Collapsed drawers:** Note from your expert · Budget · Purchases · Change history.
- **Right rail (320):** Booking agent (ruling 6 / LD 44 vocabulary; prepared and booked never collapsed) · Your
  expert · Suggestion from your expert (Accept / Decline) · "Need to change the plan?" → Back to planning
  (suppressed inside the 48-hour window and once underway).
- **Phone (390 × 844):** compact hero with the plan's zone; **Up next** card whose countdown renders only because the
  plan carries a timezone; Today's rows; the booking-agent strip; the "no push channel exists" note; fixed bottom bar
  Map · Message expert · Share.

## 8 · Console styling: one grammar, not two

The public chrome, landing, expert cards and the slip use Fraunces for headings, Geist Mono for eyebrows and counts,
Inter for body, and the earn tokens (`--earn-*`, `client/src/index.css:72-91`). The console sidebar hardcodes a
parallel warm set, and the traveler page bodies are not `.console-scope`d, so every shadcn primary inside them
resolves to the traveler pink (`#FF385C`) rather than coral (`#E85D55`). Two reds on one screen.

The boards draw one grammar: a masthead per tab in the pattern the Experts page already uses (Fraunces h1, eyebrow,
one-line sub, right-side rail), cards on `--earn-border` with 12–14 px radius, coral for the one primary action, navy
for secondary emphasis, teal for the AI and expert washes, gold for in-checkout, green for booked. The dark
TravelPulse card becomes a white card with a teal eyebrow. The June mockup's navy-dark aesthetic is retired.

## 9 · Per-tab enhancements, each traced to a defect or a ruling

- **Home.** Owns the time axis (below). The plan card, the routing counts and messages are not repeated here. Both
  create tiles open the one planner. `ActiveExpertsPanel` lists real advisors, not AI conversations; the inert
  `Add to cart` on `RecommendedServices` goes; the unreachable `urgent` dot goes.
- **My plans.** Rows carry the slip strip the dashboard already fetches (counts, advisor, next action). Sections:
  Traveling now · Final · In planning · Past, with a fifth, Drafts arriving, rendered only once a Plus occasion draft
  has fired end to end (LD 26). Show all works and the past list is not capped at three. Message only with an
  advisor. No elapsed-time progress bar.
- **Start with AI.** "Continue in the planner" replaces "Create this plan". A conversation bound to a plan opens that
  plan's slip.
- **Discover.** Inside the shell, with an "Adding to: <plan> · change" chip. Sections: **For your <plan>** (services
  ranked by the occasion's `roles_needed` — LD 31 — the market and the dates; NULL roles draw no chips), **Ready-made
  plans in <city>**, **From people who live there** (the city feed's gem cards, verified experts only), **Cities**.
  Saved places live here. No price or rating filter over cities. With no plan: Cities and trending first, the chip
  reads "No plan yet · start one", Add to plan opens the planner.
- **Experts.** Inside the shell, with a "Hiring for: <plan>" chip; "Choose for this plan" opens the one expert picker
  (D6, D7). No plan: the button reads "Start a plan to hire" and opens the planner (LD 32).
- **Bookings.** Grouped by plan; every row names the service and the provider through an allowlist projection
  (§14, third instance). A balance is paid on the slip (D9) and only noted here.
- **Inbox.** Each thread carries its context kind from the server (plan · booking · listing · storefront; LD 40,
  D22). Older threads show none. AI threads never appear.
- **Profile.** Payment methods in Stripe's vault (LD 43); the Occasions card stays unrendered until Plus sales are on.

### Home anatomy (artboard `Home`, ruling 8)

- **Greeting** with one derived sentence ("Kyoto in 3 days. Two things are due before you go.").
- **Coming up** — dated rows across every plan, nearest first, window stated in the count line. Each row: date
  column (Fraunces date, mono relative day), one sentence, plan chip, a small mono source note, one action. Sample
  rows and their sources: an unpaid booking (`service_bookings.status`), a balance due (`balance_due_at`), the
  48-hour handover (derived: `start − 48h`), a trip beginning (`trips.start_date`), an event with its invite count
  (`user_experiences.event_date`; invites carry `rsvp_status` but **no deadline column**, so none is shown), an
  occasion with its draft date (`occasions.occasion_date`; hidden until a Plus draft has fired). **A row with no date
  is omitted, never guessed.**
- **Since you were here** — diary rows and suggestions since the last visit (`/api/me/plan-activity`), each
  actionable inline (Accept / Decline a suggestion, View, Reply). Messages stay in Inbox.
- **<City> · your city** — trends from the real endpoint plus registered occasions; renders only when a home city is
  set.
- **Start strip** — New plan · Start with AI, both opening the one planner.

Server side, L10 adds one reader (`GET /api/me/upcoming`) that derives dated rows for the session user's own plans
(§14: owner from the session, never the query string).

---

## 10 · Build sequence: eighteen lanes in four waves

A wave is a sequence, not a batch: each lane lands serially, one PR at a time, and appends its own
`docs/DECISIONS.md` row keyed `YYYY-MM-DD-<slug>`. **Wave 0** ratifies and preserves. **Wave 1** needs no ruling
beyond the record and no schema, so it can start now. **Wave 2** waits on its ruling and on the lane it is blocked by.
**Wave 3** is the one migration and the one lane large enough to need its own brief.

Two things are deliberately not lanes: the push channel for the phone, which is a product decision nobody has taken,
and the checkout page's move onto the plan projection, which is a gate inside L7 until its audit says how far it got.

| Lane | Needs | Schema | Blocked by | Scope | Files | Guard |
|---|---|---|---|---|---|---|
| **W0-ledger** · Ratify and preserve | rulings 1–8 | no | — | Append the eight rulings as date-slug rows. Commit these artboards to `docs/design/console-brief/`. Record that `slip-canvas/gen.py` is unrecoverable. | `docs/DECISIONS.md` · `docs/design/console-brief/` · CLAUDE.md delta | check-decision-guards |
| **L1-console-grammar** · One grammar | ruling 7 | no | W0 | Scope the traveler shell with the console tokens so shadcn primary resolves to coral; sidebar reads tokens; Discover, Experts and checkout render inside `DashboardLayout`. | `dashboard-layout.tsx` · `dashboard-sidebar.tsx` · `App.tsx` wrappers · `index.css` | Playwright screenshot of `/dashboard`, `/experts` inside the shell |
| **L2-home-honesty** · Home defects | none | no | — | One create door; Active experts reads real advisors; inert Add to cart removed; unreachable urgent dot removed. | `dashboard.tsx` · `ActiveExpertsPanel.tsx` · `RecommendedServices.tsx` · `ActionItemsPanel.tsx` | check-planning-entry required-field list gains the Home doors |
| **L3-my-plans-rows** · Rows carry state | none | no | — | Rows read the plancard summary; Final section; Show all works; past list uncapped; progress bar removed; Message only with an advisor. | `my-trips.tsx` · `PlanSlipStrip.tsx` | pure test: row model from a plancard DTO |
| **L4-trip-card-honesty** · Honesty items | none | no | — | No default map centre; hero returns null for an unmatched destination and the header draws the typographic hero; delete `ItineraryCard`; one maps handoff. | `MapControlCenter.tsx` · `plancard-types.tsx` · `PlanCardHeader.tsx` · `itinerary/ItineraryCard.tsx` · `trip-details.tsx` · `itinerary-comparison.tsx` · `lib/maps-platform.ts` | grep gate: no `lat: 0, lng: 0`; no import of ItineraryCard |
| **L5-start-with-ai-door** · The AI Planner becomes a door | none | no | — | Continue in the planner opens the modal pre-filled through the door table; sidebar label; the door joins the required-field list. | `ai-planner-draft-panel.tsx` · `lib/plan-steps.ts` · `dashboard-sidebar.tsx` · `scripts/check-planning-entry.cjs` | check-planning-entry --self-test |
| **L6-concierge-door** | ruling 2 | no | L5 | Intent form passes destination, occasion, party into the modal; the tiers become the modal's finish; the quote page and the dead cart handoff go; the Expert tier requires a tripId (LD 32); guest claim token survives. | `pages/concierge/index.tsx` · `concierge/DeliveryOptions.tsx` · `server/routes/concierge.routes.ts` · `App.tsx` redirect | check-planning-entry · check-money-endpoints |
| **L7-trip-cart-retire** | ruling 4 | no | L1 | Gate first: audit `cart.tsx` against the plan's `ready_for_checkout` projection. Then sidebar entry retired with a redirect; checkout from the Finish card and the Finalize chooser; route kept as guest fallback until G2. | `dashboard-sidebar.tsx` · `cart.tsx` · `SlipRail.tsx` | absorb-first inventory in the ledger row; sweep 9/9 and promotion 11/11 untouched |
| **L8-my-events-fold** | ruling 5 | no | L1 | Coordination engagement renders as a card on its plan's slip; sidebar entry retired with a redirect; fee-pay rail untouched. | `my-events.tsx` · `SlipRail.tsx` · `dashboard-sidebar.tsx` | check-money-endpoints; no change under `server/routes/payments` |
| **L9-trip-card-one-page** | ruling 6 | no | L4 | Remove the Itinerary/Bookings/Logistics shell; purchases in the drawer and the ledger; booking-agent tab placeholder until L16. | `trip-details.tsx` · `PlanCard.tsx` | Playwright: `/trip/:id` final renders one page; pre-final still redirects |
| **L10-home-time-axis** | ruling 8 | no | L2 | One server reader of dated rows across the session user's plans; NULL date ⇒ omitted. The page: Coming up, Since you were here, the home-city block, the start strip. | new `server/services/upcoming.service.ts` + `GET /api/me/upcoming` · `dashboard.tsx` | pure test: builder omits undated rows; check-query-userid-reads |
| **L11-discover-in-shell** | ruling 7 | no | L1 | Discover under `DashboardLayout` with the plan chip; For your plan reads `roles_needed` into the existing provider browse; ready-made and the gem feed on the page; saved places move here. | `discover.tsx` · `discover-location.tsx` · `WishlistSection.tsx` · `lib/earner-address.ts` | no new browse; role chips draw nothing on NULL |
| **L12-bookings-by-plan** | none | no | — | Rows name service and provider through an allowlist projection (§14 third instance); grouped by trip; balance due noted with a link to the slip. | `my-bookings.tsx` · `server/routes/booking-actions.ts` | check-public-user-id; projection test |
| **L13-inbox-context** | none | no | — | Thread list exposes `conversation_contexts` kind per thread; chip on the row; older threads show none. | `use-conversation-threads.ts` · `inbox.tsx` · `server/routes/messages.ts` | check-public-user-id |
| **L14-slip-balance-pay** · D9 client half | none | no | — | A read returning `canPayBalance`'s answer; the section on the slip; the pay rail unchanged. | `SlipRail.tsx` · `balance-payer.service.ts` (one more caller) | check-money-endpoints; the predicate is read, never re-typed |
| **L15-conversation-trip-link** | ruling 1 | **migration** | W0 | Additive nullable `conversations.trip_id`, FK ON DELETE SET NULL, index, declared in `shared/models/chat.ts`; pick-based admission; pairing server-verified against the owner (the item-event-link precedent); no backfill. | `server/migrations/<next>` · `shared/models/chat.ts` · `server/replit_integrations/chat/routes.ts` | chain-integrity; no preflight entry (no CHECK) |
| **L16-ask-ai-drawer** | ruling 3 | no | L15 · own brief | The drawer, pre-final on the slip and post-final on the Trip Card. A task answers as a proposal on the EXISTING suggestions rail (origin `ai`), applied through the existing approve path; charged at apply through the existing payment-intent pattern with an idempotency key; expert items protected (D3). Needs its own design brief before build. | `SlipRail.tsx` · `ExpertSuggestionsPanel.tsx` · suggestions + payments routes · `fee_bands concierge:ai_task` | check-money-endpoints · §15 claim before charge · check-ai-draft-eligibility |
| **L17-booking-agent-tab** | LD 44 phase 0 | no | L9 · L16 · LD 44 phase 0 | Reads `affiliate_booking_requests` in the ruled vocabulary. Blocked until LD 44 phase 0 lands the status vocabulary. | Trip Card drawer · affiliate-booking-requests reader | blocked |

**Order inside a wave.** Wave 1: L1 first, because every later screen lane assumes the shell; then L2–L5 in any
order. Wave 2: L6 and L10 first, since the doors and Home are what a traveler meets; L7 only after its audit; L9
before L16 can mount its tab; L12–L14 whenever a builder is free. Wave 3: L15 before L16; L17 waits on LD 44 phase 0
and is listed so the dependency is visible, not so it is started.

---

## Artboard index (canvas `04dfd827`)

| Row | Artboard | Shows |
|---|---|---|
| Brief | `Main` | This document, as a flowing memo |
| 1 | `Console` | The proposed sidebar (8 tabs), the spine strip, the six view cards, the two retirements |
| 1 | `SlipDrawer` | The slip with the Ask AI drawer open on a live proposal |
| 1 | `AILifecycle` | The AI actor across a plan's life: doors → modal → mint → slip → Finalize → Trip Card |
| 1 | `BuildSequence` | The eighteen lanes as cards under four wave columns |
| 2 | `HomeBefore` / `Home` | Today's Home recreated from source with its issue strip / Home as the time axis |
| 2 | `MyPlansBefore` / `MyPlans` | Today's My Plans / the lifecycle list with state-bearing rows |
| 2 | `DiscoverBefore` / `Discover` | Today's public destinations page / plan-aware Discover inside the shell |
| 2 | `StartWithAI` · `Experts` · `Bookings` · `Inbox` · `Profile` | The remaining tabs in the one grammar |
| 3 | `TripCard` / `TripCardMobile` | The post-final card as one page / the phone's live day |

**Sample data:** the Kyoto wedding (Oct 2–4, 2026, Final v2, 3 days away on Sep 29), Mika Tanaka as advisor, the
Lisbon long weekend (Nov 14, in planning, no expert), the kimono fitting as the unpaid item, the reception balance
due Sep 30. Every board agrees on these; they are illustrative, not seeded.

**Sources read:** the June `plancardmockupv3.html` and `PLANCARD_SPEC.md` (uploads) · CLAUDE.md Locked Decisions 26,
30, 32, 39–44 · `docs/briefs/CONSOLE_REALIGN_BRIEF.md` (R-A … R-J) · `docs/design/PRICING_AND_FEATURE_MAP.md` ·
`docs/design/trip-slip-spec.md` · ledger rows `2026-09-05-slip-rail-regroup`, `-draft-only-on-empty`,
`-optimize-preview-on-slip`, `-slip-decisions-d18-d22`, `2026-09-06-slip-small-additions`.
**Code walked:** `dashboard-sidebar.tsx` · `dashboard-layout.tsx` · `plancard/SlipRail.tsx` · `plancard/SlipView.tsx`
· `plancard/PlanCard.tsx` · `plancard/MapControlCenter.tsx` · `pages/dashboard.tsx` · `pages/my-trips.tsx` ·
`pages/ai-assistant.tsx` · `ai-planner-draft-panel.tsx` · `intake-panel.tsx` · `contexts/PlanningContext.tsx` ·
`pages/concierge/index.tsx` · `concierge/DeliveryOptions.tsx` · `server/routes/concierge.routes.ts` ·
`pages/discover.tsx` · `pages/my-bookings.tsx` · `pages/inbox.tsx` · `pages/profile.tsx` · `pages/trip-details.tsx` ·
`shared/models/chat.ts` · `shared/schema.ts` (occasions, service_bookings, temporal_anchors) · `client/src/index.css`.
