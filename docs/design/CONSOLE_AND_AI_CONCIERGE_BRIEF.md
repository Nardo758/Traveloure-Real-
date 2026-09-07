# The AI Concierge on the Slip, and the console around it

**Type:** design brief — draft for ruling. **Date:** 2026-09-07. **audited@f3933df** (`main` at the merge of #823).
**Canvas of record:** claude.ai artifact `04dfd827` ("AI Concierge on the Slip"), 18 artboards. §11 (booking flows) exists in this file only; the canvas memo predates the walkthrough. The artboards are the
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

### Status as of `1918714` (2026-09-07, evening — six more lanes dispatched, five landed)

| Lane | State | Ledger row |
|---|---|---|
| W0-ledger | **landed** (rulings 1–8 = CLAUDE.md Locked Decision 45; slip canvas recorded unrecoverable). Artboards not yet committed. | `2026-09-07-console-one-grammar` … `-home-owns-time-axis`, `-slip-canvas-unrecoverable` |
| L1-console-grammar | **landed** — one grammar; `/experts`, `/cart`, `/discover/location/:city` inside the shell (`browse-shell.tsx`) | `2026-09-07-console-one-grammar-code` |
| L2-home-honesty | **landed** — one create door (IntakePanel), real advisors, dead controls out | `2026-09-07-home-honesty` |
| L3-my-plans-rows | **landed** — `plan-row-model.ts`, Final section, Show all, no progress bar | `2026-09-07-my-plans-rows` |
| L4-trip-card-honesty | **landed** — no Null Island, hero returns null, `ItineraryCard` deleted, one maps handoff | `2026-09-07-trip-card-honesty` |
| L5-start-with-ai-door | **landed** — draft panel opens the modal; bound conversations open their slip; the panel mints nothing | `2026-09-07-start-with-ai-door` |
| L18-client-pen-scope | **landed** — the pen is keyed by principal, sign-out clears only the client pen, sign-in hands a guest's ANSWERS to the existing server pen only when it is empty; the browse door passes the plan's own destination | `2026-09-07-client-pen-scope` |
| L19-request-is-a-click | **landed** — one shared review sheet on both surfaces; the open is a read, the send is a click; the slip mint moved onto Send | `2026-09-07-request-is-a-click` |
| L24-impact-class | **landed** — `impactClassFor` over both catalogs, derived never stored; `shared/expert-offerings.ts` pins the 55-key tier map to its migrations | `2026-09-07-impact-class` |
| L10-home-time-axis | **landed** — `GET /api/me/upcoming` over a pure builder, six dated kinds each naming its source column, undated rows omitted; the plan card, counts and messages left Home | `2026-09-07-home-time-axis` |
| L9-trip-card-one-page | **in review** (PR #848) — one page, no tab shell; purchases in a drawer and the ledger; countdown only where a zone exists | `2026-09-07-trip-card-one-page` |
| L6-concierge-door | **HELD for a ruling** (PR #849) — see "Two decisions this wave asks for" below | `2026-09-07-concierge-door` |
| L8 · L11 · L15 | **unblocked** — rulings ratified, blockers landed | — |
| L7-trip-cart-retire | **unblocked**, still gated on its own audit of `cart.tsx`; the cart fee line (F3 / L20) is a decision before it | — |
| L12 · L13 · L14 · L21 · L22 | **dispatchable**, no ruling needed | — |
| L16-ask-ai-drawer | blocked on L15 and its own brief | — |
| L17-booking-agent-tab | blocked on LD 44 phase 0 | — |
| L20-cart-fee-line | **awaiting the decision-maker** (money) | — |
| L23 · L25 | awaiting **rulings 9–12** (§11.4, §11.6), not yet in the ledger | — |

### Two decisions this wave asks for

**A · Where the Trip Card's logistics content belongs.** The deleted Logistics tab was not empty: it
rendered eight live reads (participant RSVP, payment and dietary stats, a budget summary with its
category breakdown, the alert summary, the participant roster, the contracts board). The ratified
board draws no home for any of it. L9 mounted the existing component, unedited, in an owner-only
collapsed drawer rather than let real data vanish with the tab — **a deviation from the artboard,
flagged not hidden**. Keep the drawer, or rule where that content lives.

**B · Whether a door may own one branch's downstream (amends Locked Decision 33).** LD 33 rules that
doors differ in exactly two things: what arrives pre-filled and which step opens first. The concierge
door needs a third: its Expert tier must record the tier choice and send the expert request through
L19's review sheet after the modal's finish mints the slip. L6 added ONE optional
`PlanningSource.onFinish` hook (the D15 precedent; `runBranch` stays the default for every other
door) rather than a fifth `PlanningBranch` or a per-door `if` inside the shared finish runner. The
alternative is that the Expert tier becomes the generic `/experts` browse — which removes the hook
**and the review sheet with it**. PR #849 is held unmerged pending this ruling.

### Corrections the lanes sent back (recorded, not silently absorbed)

- **§7 and LD 42 D8 both say "REDIRECTS".** The pre-final case renders an honest notice with one
  action to the slip, and two armed specs assert that notice. The wording, not the code, is what is
  wrong.
- **LD 42 D7's all-advisors reader is not true on `main`.** `GET /api/trips/:id/expert-advisor`
  still returns one row; the Trip Card rail shows the one it returns. D7's own lane owns the change.
- **The `TripCard` artboard's "2 traveling · 24 invited" (D21) cannot render on that surface** — the
  invited half needs the derived guest roster the Trip Card does not read. The party label renders
  alone, which D21's own §13 clause permits.
- **§2 overreaches on "party size".** `PlanningSource` has no party field and should not grow one; a
  single stated total is `TripContext.travelers`, which the modal already preserves.
- **§10's "the quote page and the dead cart handoff go" is half right.** The page goes; the
  `/api/concierge/quote` route has three other consumers (`EscalationCTA` and two specs) and stays.
- **Finding F2 understated its own defect.** The concierge expert request did not merely lack a
  `tripId`: with no `tripId`, no `variantId` and no `planSnapshot` the handler returned **400**, and
  the UI never read `res.ok`, so it announced "Your request is in" for a request the server had
  refused. That is a §13 lie, not only an LD 32 hole.
- **Home's `Coming up` cannot date every unpaid booking.** There is no `service_bookings.booking_date`;
  the date comes from the existing `resolveServiceDate`, so a claim with neither a booked slot nor a
  checkout snapshot date is undated and therefore omitted. Named, not invented.
- **The artboard's occasion row promises a FUTURE draft arrival.** The only "has fired" signal exists
  *after* the draft is built, so the row says a draft is ready, never that one will arrive.
- **Two lanes wrote `shared/plan-timing.ts` in parallel.** Reconciled at landing into one module:
  L10's file verbatim (start instants, the window imported from `shared/trip-primary-surface.ts`,
  never restated) plus L9's appended wall-clock half. `tripCardIsPrimary`'s no-zone answer is
  unchanged; making it zone-aware requires moving that constant and is a later lane.

Note: rulings 9–12 postdate W0 and are not ratified; L23 and L25 wait on them. The three planner-tier "Local
Expert equivalent" rows (G3) and the Executive Assistant door (G4) are recorded, not laned.

**Order inside a wave.** Wave 1: L1 first, because every later screen lane assumes the shell; then L2–L5 in any
order. Wave 2: L6 and L10 first, since the doors and Home are what a traveler meets; L7 only after its audit; L9
before L16 can mount its tab; L12–L14 whenever a builder is free. Wave 3: L15 before L16; L17 waits on LD 44 phase 0
and is listed so the dependency is visible, not so it is started.

---

## 11 · Booking flows: one resolver, and what the walkthrough found

**Evidence:** `docs/testing/BOOKING_FLOWS_WALKTHROUGH_REPORT_2026-09-07.md` (Claude in Chrome, 18 rows, the dispatch in
`docs/testing/BOOKING_FLOWS_CHROME_DISPATCH.md`). Every finding below was re-checked against source before it was
dispositioned; "verified" means the code shows the mechanism, not that the screen was trusted.

### 11.1 The design: three questions, one resolver

A listing never decides its own flow. The button and the landing rule are derived from three facts by ONE resolver,
which extends the existing `resolveBookability` (native / deeplink / info-only) and `resolveContentCTA` with the
buyer's state. The service fundamentals already classify every delivery method (`shared/service-fundamentals.ts`:
place-anchored, scheduled, artifact, provider-declared), and the walkthrough proved that axis is live on the SELL
side — the create-listing wizard regenerates its own step list from the delivery method (rows 16–17). It is NOT live
on the BUY side: an in-person tour and a PDF guide add to the cart identically, with no slot asked (rows 5–6).

**Q1 · What kind of thing.** Four, not endless. The expert-versus-provider difference is who sells, not how it is
bought; what an expert alone offers is the advisor relationship, which has its own rail.

| Kind | Row | Sold by | Flow |
|---|---|---|---|
| A listing | `provider_services` | a provider **or** an expert | Add to plan, or Book |
| An advisor | `trip_expert_advisors` | an expert only | Plan with this person — plan-level, needs a slip (LD 32) |
| A ready-made plan | `ready_made_trips` | an expert | Buy; the clone lands on a new slip |
| A partner item | affiliate rail | a partner | Request booking — the agent rail (§16, LD 44) |

**Q2 · How it is fulfilled** decides where the row lands on the slip. Scheduled + place-anchored (in person, hybrid):
a dated item under a day or event, slot picked at add time, otherwise `in_planning` with a "pick a time" flag and
never a guessed time. Scheduled, remote (call, video): dated, no place. Artifact (pdf): an untimed item on the
implicit event; the deliverable attaches to the booking. Provider-declared (async messaging, voice notes): untimed;
completion is the provider's word. Every one is an `itinerary_items` row (LD 39).

**Q3 · Who is buying.**

| Buyer | Add to plan | Book now | Plan with an expert |
|---|---|---|---|
| Owner, plan chip set | Lands on that plan; a final plan auto-forks | Slot pick → checkout; the row is born in checkout | The one picker; the request carries `tripId` |
| Member with plans, no chip | A **which-plan** step | same, after the step | same, after the step |
| Member, no plan | Opens the planner; the listing returns as `returnTo` (D15) | same | the planner first; no slip, no hire |
| Guest | The guest cart (sanctioned until G2) | Stage, sign in at the paid gate, the cart migrates | not possible — no principal |

**Messaging is not hiring.** LD 40 admits a storefront enquiry (`{ handle }`) with no plan; LD 32 requires a slip for
a HIRE (an advisor row or an expert request). The brief's earlier "known fact" collapsed the two; rows 2 and 7 were
right to object.

### 11.5 The resolver, designed

**Name and home.** `resolveBuyAction(row, buyer) → BuyAction`, one pure function in `shared/buy-action.ts`, beside
the three resolvers it composes and never re-derives: `resolveBookability` (native / deeplink / info-only),
`resolveContentCTA` (the content-type → button map, already declared "the ONLY place"), and the service
fundamentals (`needsScheduling`, `isPlaceAnchored`, `isArtifactDelivery`). It adds exactly two things those three
lack: the listing's **booking mode** (`instant | request | hidden`, the per-listing derivation ruling 74/75 already
ships on the provider catalog) and the **buyer's state**. It imports no `db`, no `storage`, no router: the server
computes it once and ships it on the payload, the client renders it and never re-derives (the
`optimizer-run-authorization` posture, §18 rule 1). A listing carries no CTA of its own (ruling 9).

**Inputs.**

```
row:   { kind: 'listing' | 'advisor' | 'ready_made' | 'partner',
         deliveryMethod?: one of the 7,   bookingMode?: 'instant' | 'request' | 'hidden',
         bookability: 'native' | 'deeplink' | 'info_only',   hasPrice: boolean,
         hasPublishedAvailability?: boolean,   isLive: boolean }
buyer: { principal: 'guest' | 'member',
         plans: 'none' | 'one' | 'many',   chipTripId?: string,   chipPlanIsFinal?: boolean }
```

**Output.** A descriptor, never a side effect.

```
BuyAction = {
  primary:   { kind, label }            // exactly one; kind ∈ add_to_plan | book | request_to_book | plan_with |
                                        //   buy_ready_made | agent_rail | tracked_view | message | none
  secondary?: { kind, label }           // at most one (e.g. Add to plan beside Book)
  ask:       Array<'sign_in' | 'which_plan' | 'slot' | 'party'>   // in order; empty = nothing to ask
  landing:   { store: 'plan' | 'guest_cart' | 'checkout' | 'booking_request' | 'advisor_request' | 'clone' | 'partner_request' | 'none',
               timed: boolean,          // the row gets a start time (slot) or is flagged "pick a time"
               placeAnchored: boolean,  // the row carries a place
               forksFinal: boolean }    // true when chipPlanIsFinal and the landing is 'plan'
  refusal?:  { reason }                 // §13: said out loud, never a disabled button with no sentence
}
```

**Decision table.** Read top to bottom; the first matching row wins. `ask` is built from the buyer, `landing` from
the row; the two halves never consult each other, which is what keeps the table small.

| # | Row facts | Buyer | primary | secondary | ask | landing |
|---|---|---|---|---|---|---|
| 1 | any, `isLive` false or `bookingMode` hidden | any | `message` "Contact" (if handle) else `none` | — | — | none |
| 2 | `advisor` | guest | `plan_with` "Plan with {name}" | — | sign_in | — (refusal on press: "Sign in and start a plan to hire") |
| 3 | `advisor` | member, plans none | `plan_with` | — | which_plan → (New plan) | advisor_request via the planner's `returnTo` |
| 4 | `advisor` | member, chip set | `plan_with` | `message` | — | advisor_request (carries `tripId`) |
| 5 | `advisor` | member, plans many, no chip | `plan_with` | `message` | which_plan | advisor_request |
| 6 | `ready_made` | guest | `buy_ready_made` "Get this trip" | — | sign_in | clone |
| 7 | `ready_made` | member | `buy_ready_made` | — | — | clone (a new slip, never merged into an existing one) |
| 8 | `partner`, bookability deeplink, bookable | any | `agent_rail` "Request booking" | — | sign_in if guest | partner_request (§16) |
| 9 | `partner`, info-only | any | `tracked_view` "View details" | — | — | none |
| 10 | `listing`, bookability info-only | any | `add_to_plan` "Add to plan" | `message` | sign_in? · which_plan? | plan · timed = needsScheduling · placeAnchored = isPlaceAnchored |
| 11 | `listing`, `bookingMode` request, or instant with no published availability | any | `request_to_book` "Request to book" | `add_to_plan` | sign_in? · which_plan? · party | booking_request (a `pending` booking, never a charge) |
| 12 | `listing`, instant, scheduled method, availability published | any | `book` "Book" | `add_to_plan` | sign_in? · which_plan? · slot · party | checkout · timed true · placeAnchored = isPlaceAnchored |
| 13 | `listing`, instant, artifact or provider-declared method | any | `book` "Book" | `add_to_plan` | sign_in? · which_plan? | checkout · timed false |

`sign_in?` is present when `principal` is guest; `which_plan?` when `plans` is many and no chip, or `plans` is none
(then the only option is New plan). A guest's `add_to_plan` lands in `guest_cart`, the sanctioned fallback, and the
descriptor says so. `forksFinal` is true whenever the landing is `plan` and the chip's plan is final; the row is
added to the forked version and the button copy says "Add to the next version".

**What the buy-side flow then looks like, per surface.** Every card and detail page calls the resolver and draws
`primary` and `secondary`; pressing `primary` walks `ask` in order as one sheet (sign in → which plan → slot →
party), then performs the landing. The sheet is ONE component with four optional steps, not four dialogs.

- **Untimed landings** (rows 10/13 with `timed` false) put the row on the plan's implicit event in the "Services
  without a time" group (ruling 10). The deliverable, when the booking completes, attaches to the booking, and the
  plan row links to it.
- **Timed landings with no slot chosen** (row 10 with `timed` true, or a `book` abandoned before the slot) put the
  row on the plan flagged "pick a time"; the flag is a real rendered state, never a default hour.
- **`request_to_book`** creates a `pending` booking on the plan's row (`booking-visibility`'s actionable status) and
  notifies the seller; nothing is charged, and the row reads "requested" until the seller answers.
- **`plan_with`** is the existing `HireExpertDialog` rail; the resolver only decides whether it may open and with
  which `tripId`.

**What the resolver refuses to know.** Prices and fees (the checkout derives them, §14), the seller's console
(§4 decides that, the buyer never sees it), the market or the city (the mismatch guard runs after the landing, on
the plan), and anything about the AI (the AI proposes onto the plan through its own rail and never through a card).

**Proof.** One pure test file over the table: thirteen rows × the buyer states that can reach them, plus three
negatives — a listing with a custom CTA field is ignored, a hidden listing never yields a booking verb, and an
advisor never yields a landing for a guest. The server's payload test asserts the descriptor is present on every
listing, expert and ready-made read, so a surface that draws its own button has nothing to draw from.

**Migration path.** Rows 12–13 replace `add_to_cart` / `book_service` in `resolveContentCTA`'s output for platform
listings; the affiliate and curated branches (rows 8–9) pass through unchanged. `resolveContentCTA` stays as the
content-type half; `resolveBuyAction` wraps it. Nothing is deleted until every card reads the wrapper.

### 11.6 Impact classes: what the offering catalogs already say about the trip

The delivery method says HOW a thing is fulfilled. The offering catalogs say WHAT the seller does, and that is what
decides whether a plan is touched, created, or never involved. Both catalogs were inventoried (55
`expert_offering_types` rows across five tiers; 21 provider disciplines plus `venue`; the four `aff_*` partner keys),
together with every payment model the platform runs. Two facts fall out.

**Fact 1 — the expert catalog has no price, no duration and no delivery method per offering.** The eighteen "Service
Tier" presets the walkthrough saw are simply the twelve `advisory` and six `live_support` rows; price, duration and
method are entered per listing. So the LISTING (`provider_services`) stays the unit of sale for experts and providers
alike, and the offering key is a classifier on it, never a product.

**Fact 2 — an expert never mints a trip for a client.** There are exactly two expert modes: *assignment*, working
inside the traveler's own trip through `trip_expert_advisors`, and *authoring*, an ownerless build that becomes a
store listing. "The expert creates the slip" is therefore not a flow the code has or should have: the traveler mints
the slip (LD 32, the precondition), and the expert's paid work is delivered INSIDE it (`workspace-status → delivered`,
then the traveler approves). That is the model the resolver adopts for every planning purchase.

#### The seven impact classes

`impact` is a fourth row fact, derived from the offering key's tier (expert) or category (provider) by one shared
lookup, never stored (the bookability posture). The resolver reads it beside `kind`, `deliveryMethod` and
`bookingMode`.

| Class | Who | Charged when | Row(s) | The seller delivers | Trip impact | Plan required? |
|---|---|---|---|---|---|---|
| **consult** | expert `advisory` (12) and `specialized` (14, incl. `location_scout`, `content_scout`) | full at booking; payout on the completion rule (session end / artifact / provider-declared) | `service_bookings` | a session, a written brief (PDF on the listing), or a chat | **none** — the deliverable attaches to the booking; the expert may later *suggest* onto a plan only as its advisor | **optional** — "Attach to a plan?" so the expert reads it live; never required |
| **plan_work** | expert `planning` (11) and the six plan-shaped `coordination` rows (`done_for_you_booking`, `group_trip_coord`, `reservation_lifeline`, `booking_concierge`, `vendor_wrangler`, `occasion_coordination` — the complement of the six planner keys, so `coordination` partitions cleanly) | upfront, or deposit + balance where the listing opts in; payout HELD until `delivered`, released by the traveler's approval | `service_bookings` + `trip_expert_advisors` (one author, `upsertTripAdvisorRow`) | plan work inside the traveler's slip: items, notes, route; then "delivered" → approve / request changes | **edits and adds items on the existing slip**; items the expert touches are protected (D3) | **yes** — minted by the traveler through the planner before purchase (LD 32) |
| **event_coordination** | the six planner keys (`wedding_planner` … `date_night_designer`) | one upfront fee = max(floor, percent × stated budget), from `fee_bands`; vendor milestones tracked off-platform (`vendor_contracts.payment_schedule`) | `coordination_states` + advisor row | timeline, vendor matrix and gaps, bookings, confirmations, run on the day | attaches to an owned plan and its events; the coordinator edits inside | **yes**, and an event on it |
| **live_trip** | expert `live_support` (6) | full at booking for a window (the trip's dates); payout on the provider-declared rule | `service_bookings` + advisor row for the window | text / call / video during the trip; `reservation_on_fly` and `booking_concierge` may add items | **may add items to the live plan**, only through the advisor write rail | **yes** — there is nothing to support without one |
| **on_ground** | every provider discipline except lodging; any expert listing with `in_person` / `hybrid` | full, or deposit + balance by `balance_due_at` | `service_bookings` | the service, at a time and a place | **a dated, placed item** on a day or under an event (roles_needed for event vendors) | optional at Add (guest cart), required at Book |
| **stay** | `accommodation` — property and room shapes, per-night | deposit + balance | `service_bookings` with stay dates (migration 275) | the stay | **a stay item spanning nights** | optional at Add, required at Book |
| **store_clone** | `ready_made_trips` | flat, upfront | `ready_made_purchases` → **new `trips`** | the plan itself, plus one consult and one revision | **creates a new plan owned by the buyer** | no — it makes one |
| **partner** | `aff_*` categories | never a platform charge | the agent rail (§16, LD 44) | a partner booking, human- or API-completed | an item marked for the agent | optional |

**Correction after L24 landed the lookup (`2026-09-07-impact-class`):** `store_clone` is a KIND (a `ready_made_trips` row, 11.5 Q1), not something an offering key or a category key can yield, so `impactClassFor` does not return it; its seven values are the six above plus `partner`. `reservation_lifeline` was missing from the plan-work list and is restored. The taxonomy registry assigns **25** provider keys (21 disciplines + 4 `aff_*`), plus `custom_other` outside the registry union; the test covers all of them.

**What this changes in the resolver (11.5).** Two rows gain a condition and one ask becomes conditional.

- `which_plan` is asked only when `impact ∈ {plan_work, event_coordination, live_trip}` or the buyer pressed **Book**
  on an `on_ground` / `stay` listing. For a **consult** it becomes an optional "Attach to a plan?" and never blocks.
  A traveler with no plan can buy a Hidden-Gems Shortlist; they cannot buy a Full Custom Itinerary until the planner
  has minted the slip it will be built in.
- `plan_work` and `live_trip` landings create the advisor row on authorization through the ONE author
  (`upsertTripAdvisorRow`), so buying the work and hiring the person are one act. This retires the second "expert
  does plan work" rail: today the paid expert-review PaymentIntent (`POST /api/expert-requests/payment-intent`,
  `base + pct × cost`) and a planning-tier listing sold through checkout are two ways to buy the same thing. Ruling 11
  below picks one.
- `event_coordination` keeps its own fee rail (`coordination_states`); the resolver's landing is
  `coordination_request`, and the event on the plan is chosen the way the WhichEvent picker already does.

#### What the study found that the design must carry

| # | Finding | Disposition |
|---|---|---|
| G1 | Two rails sell expert plan work: the expert-review PaymentIntent and a planning-tier listing at checkout | **Ruling 11** — one rail. Recommendation: the LISTING at checkout (price and deposit are the listing's, §14 amount server-derived), with the review-fee rail kept only for the AI-plan-polish escalation until it is folded. |
| G2 | The six planner rows carry provider-side delivery vocabulary (`in_person`, `hybrid`) in the expert catalog | Already acknowledged in migration 283; harmless under the impact class, since class is by KEY. Record, do not repair. |
| G3 | Three `specialized` rows are "the Local Expert equivalent" (`local_city_itinerary`, `local_perfect_day`, `local_neighbourhood_plan`) but render on the Trip Planner card | They are **plan_work**, not consult, and belong on whichever card their tier maps to; the class is what matters to the buyer. Note for the /earn lane. |
| G4 | Executive Assistant has a signup door on /earn with no catalog rows behind it | Not a buy-side concern; flagged to the earn lane (a door to nothing is a funnel hole). |
| G5 | The provider catalog carries no delivery hint at all; lodging is only known by the Workstation shape | `impact` for providers derives from `category_key` (`accommodation` → stay; everything else → on_ground) and the listing's `deliveryMethod`; nothing new is stored. |
| G6 | Trip Pass's `expert_revision` and `ai_task` coverage are unenforced (LD 41 f) | Unchanged here; the resolver never reads entitlements — the checkout does. |
| G7 | "Scout" exists only as catalog rows (`location_scout`, `content_scout`) and is sold as an ordinary listing | Correct under **consult**: a written or video deliverable, full payment at booking, no trip impact. A deposit is the listing's opt-in, not a class rule. |
| G8 | `vendor_contracts` milestones are off-platform bookkeeping (no Stripe, no revenue) | Stays that way; the coordinator's tool, not a buyer flow. The balance rail on `service_bookings` is the on-platform deposit model. |

#### Two more rulings

11. **Expert plan work is sold as a listing at checkout, and buying it hires the expert.** One rail: the planning-tier
    listing's own price and deposit through `/api/checkout`; on authorization the advisor row is written by the one
    author, the work is delivered inside the traveler's slip, and the payout is held until the traveler approves.
    The expert-review PaymentIntent survives only for the AI-plan-polish escalation until that is folded in.
12. **A consult never requires a plan.** Advisory and specialized offerings are bought with or without one; attaching
    is offered, not asked. Plan work, live support and coordination require the slip the work happens in.

#### Lanes added to §10

| Lane | Needs | Schema | Blocked by | Scope | Guard |
|---|---|---|---|---|---|
| **L24-impact-class** | none | no | — | One shared lookup `impactClassFor(offeringKey \| categoryKey, deliveryMethod)` in `shared/`, derived from the registries (`earn-roles.ts` tiers, the taxonomy registry); read by the resolver and by the listing wizard's own step list, so buy side and sell side agree. | pure test over all 55 + 22 keys; the registry guards refuse an unclassified key |
| **L25-plan-work-one-rail** | ruling 11 | no | L23 · L24 | Planning-tier listings bought at checkout write the advisor row on authorization (one more caller of `upsertTripAdvisorRow`, inside the promotion); payout held until approval; the review-fee rail scoped to AI-plan polish. | check-advisor-row-author; check-money-endpoints; promotion suite untouched |

### 11.7 The storefront: user flows from `/s/:handle`

**What the page holds today** (`client/src/pages/storefront.tsx`): one hero card (cover, eyebrow "Local expert
storefront" / "Service provider storefront", name, verified and away badges, location, a facts strip of offerings ·
reviews · member since · gems shared), **Message @handle** and **Share**, an about block, a trust strip, then two
lanes: **Services** (cards whose label is already derived from `bookingMode`: Book / "Request to book →" /
"Enquire →") and **Ready-made trips**, plus a message band at the foot. The header's **"Start a plan"** opens the
planner with no expert attached and no return address (walkthrough rows 2, 7). There is no "plan with this person"
control anywhere; the one advisor rail exists only on the slip.

**The storefront answers three questions, in this order, and each has exactly one control.**

1. *Can I talk to you?* — **Message**. A storefront enquiry (LD 40 `{ handle }`); no plan needed (ruling 12).
2. *Will you build my trip with me?* — **Plan with {name}** (experts whose catalog includes a `plan_work` or
   `live_trip` offering; never drawn for a provider). This is the ONE advisor rail from a new door; the slip must
   exist first (LD 32), and the door passes `returnTo: { kind: 'expert', handle }` so the planner comes back here.
3. *What can I buy from you?* — the **Services** lane, every card's button from `resolveBuyAction` (11.5) with the
   card's `impact` class (11.6) shown as its eyebrow (Consult · Plan work · Live support · On the ground · Stay),
   and the **Ready-made** lane.

"Start a plan" is retired: it was question 2 without the person. Nothing else on the page is a door.

#### Buttons versus cards: a person is a button, a product is a card

| Element | Kind | Where | Behaviour |
|---|---|---|---|
| **Message @handle** | action button | hero | storefront enquiry; no plan needed |
| **Plan with {name}** | action button | hero, experts with `plan_work` / `live_trip` only | with priced plan-work listings: a chooser of those cards; with none: the free advisor invitation ("Mika will reply with what she offers") |
| Share | utility | hero | not a buy action |
| Consult · Plan work · Live support · Coordination · On the ground · Stay | offering cards | Services lane | each card's button from `resolveBuyAction`; impact class as the card's eyebrow; hidden booking mode renders "Enquire", which is Message with the listing named |
| A plan they built | offering card | Ready-made lane | Get this trip |

There is no third buy button; "Start a plan" is removed. The hero button is only a shortcut into the plan-work cards.

#### The header: what the plan chip does here

Signed in with a plan chip set, the hero carries the same chip every browse surface carries — "Planning: Your Kyoto
wedding · change" — and every card resolves against it. A plan in another city is not hidden; the city-mismatch
guard runs after the landing, as it does from Discover. With no chip and several plans, the first press asks which
plan once and remembers it for the visit. A guest sees the page in full; the buttons say what they will ask for.

#### Flow A · Consult (advisory / specialized, e.g. Hidden-Gems Shortlist, a location scout)

1. Card → **Book** (instant) or **Request to book** (request mode). Detail shows delivery method, duration, price,
   and "No plan needed".
2. The ask-sheet: sign in if guest → **"Attach to a plan?" (optional, skippable)** → slot if scheduled (call /
   video) → party only if the listing asks.
3. Pay in full. A `service_bookings` row; payout on the completion rule. No item is placed on any plan.
4. Delivery by method: a session at the slot, a PDF on the booking's deliverable rail, or an async thread. If
   attached, the expert reads that plan live and may **suggest** onto it only as its advisor (they are not one yet;
   attaching is read access to the plancard payload, not a write grant).
5. Bookings shows the row named "Hidden-Gems Shortlist · Mika Tanaka"; the slip shows nothing unless attached, in
   which case a one-line "Consult with Mika · delivered" sits on the plan's Expert card.

#### Flow B · Plan work (planning tier, e.g. Full Custom Itinerary; and Plan with {name})

1. **Plan with {name}** in the hero, or a plan-work listing's **Book**. Detail says out loud: "Built inside your
   plan. You keep the slip; Mika works in it; you approve what she delivers."
2. The ask-sheet: sign in → **which plan** (required; "New plan" opens the planner pre-filled with the expert's
   city and returns here with the minted slip, D15) → the listing's deposit or full price shown from the row (§14).
3. Pay. On authorization the promotion writes the advisor row through the ONE author (`upsertTripAdvisorRow`,
   status `accepted`) inside the same transaction as the booking (ruling 11). The slip's Expert card now names Mika
   and the Build card's hire row disappears.
4. Mika works in the Workstation on the traveler's slip. Items she adds carry `origin: 'expert'` and are protected
   (D3). The traveler watches live and can message from the slip (D22).
5. Mika presses **Delivered**. The slip shows the approval banner; the traveler **approves** or **requests changes**.
   Approval releases the held payout and flips Mika to suggest-only. A balance, if the listing took a deposit, is
   paid from the slip's balance section (D9) by `balance_due_at`.
6. Plan with {name} with no listing behind it (an expert who has published none) is the free advisor invitation
   `HireExpertDialog` already sends, and says so: "Mika will reply with what she offers."

#### Flow C · Live support during the trip (live_support, e.g. "Text a Local")

1. Card → **Book**. Detail: "Covers your trip's dates. Mika can add reservations to your plan while you travel."
2. The ask-sheet: sign in → **which plan** (required, and it must carry dates; a plan with none sends the traveler to
   set them first) → pay in full for the window.
3. Advisor row for the plan (the same author), scoped by the plan's dates in copy, not in a new column: the row is
   an ordinary advisor row; the WINDOW is the listing's promise and the plan's dates, both already on record.
4. During the trip: the thread lives in the plan's advisor context (D22); `reservation_on_fly` and
   `booking_concierge` add items through the advisor write rail, visibly "from your expert".

#### Flow D · Event coordination (the six planner keys)

1. Card → **Request** (these are never instant). Detail: the fee rule in words, from the bands: "a coordination fee
   of the floor or the percent of your stated budget, whichever is higher".
2. The ask-sheet: sign in → **which plan** → **which event** (the WhichEvent picker; "Set up an event" if the plan
   has none) → the stated budget, read from the event (`user_experiences.budget`), never typed here.
3. The landing is a `coordination_states` row on that plan and event, unpaid, with the quote; the coordinator is
   assigned by the existing admin rail; the traveler pays the fee from the slip's Plan card. Vendor milestones are
   the coordinator's tool (off-platform bookkeeping), never a buyer step.

#### Flow E · On the ground and Stay (a provider's storefront, or an expert's in-person listing)

1. Card → **Add to plan** or **Book**. Add is a plan write with no charge; Book births the row in checkout.
2. The ask-sheet: sign in → which plan (Add: optional for a guest, who lands in the guest cart) → **slot** for a
   scheduled method (or nights for a stay) → party.
3. A dated, placed item on the chosen day or event; a stay spans its nights. Deposit or full per the listing; the
   balance from the slip.

#### Flow F · Ready-made (the second lane)

Unchanged and already honest: **Get this trip** → sign in → pay → a new plan owned by the buyer, with the
included consult and revision on its concierge card. The only addition is the return address: after the clone, a
"Back to Mika's storefront" link, because the buyer came from here.

#### Guest and member, on this page

| Buyer | Message | Plan with {name} | Consult | Plan work / Live | On the ground | Ready-made |
|---|---|---|---|---|---|---|
| Guest | sign in first | sign in, then the planner | sign in at pay | sign in, then the planner | Add → guest cart; Book → sign in | sign in at pay |
| Member, no plan | opens | the planner, returns here | buys; attach skipped | the planner, returns here | Add asks which plan → New plan | buys |
| Member, chip set | opens | one press, carries `tripId` | buys; "Attach to Your Kyoto wedding?" | one press, carries `tripId` | lands on the chip's plan | buys |

#### What changes in code (folded into existing lanes)

- **L22** — the storefront becomes a named door: "Plan with {name}" passes `returnTo` and the expert's city; "Start
  a plan" is removed; the required-field list in `check-planning-entry.cjs` gains it.
- **L23** — the services lane's card label reads `resolveBuyAction` (the `bookingMode` switch it already has is the
  seed of that); the impact eyebrow comes from **L24**.
- **L25** — a plan-work purchase writes the advisor row on authorization; "Plan with {name}" with no listing keeps
  the free invitation.
- **Storefront visibility** — "Plan with {name}" is drawn only when the earner's catalog contains a `plan_work` or
  `live_trip` key (the impact lookup), which is what keeps a provider's storefront from offering an advisor it
  cannot be (§4: experts are not a service category, and providers are not advisors).

The storefront is the one public page an earner owns (LD 40), so this is also where every earner-side copy line
about payment lives: "paid in full", "deposit now, balance by {date}", "held until you approve". Each is derived
from the listing's own deposit plan and the class, never typed by the earner.

### 11.2 Findings, verified, dispositioned

| # | Finding (row) | Verified in source | Disposition |
|---|---|---|---|
| F1 | Opening **Get Expert Help** on `/experiences/:slug` fires "Shared with an expert" with no send step (row 11) | **Real.** `experience-template.tsx:1602` POSTs `/api/expert-requests` when the dialog opens, after minting a slip through `mintTripSlip` (the `2026-09-04-template-inquiry-slip` landing). The lead is routed by lead-routing to whichever expert it picks — which is why none of the three walked accounts saw it (row 18). | **Lane L19** — the open is a read; the send is a click. Same fix for F2. **DB check for Leon:** `expert_requests` rows created 2026-09-07 for the persona accounts, their `assigned_expert_id`, and whether a "New York City Date Night" trip was minted on `persona-kyoto-plus`. |
| F2 | **Destination Concierge → "Request expert"** submits immediately, no review or payment screen (row 12) | **Real.** `DeliveryOptions.tsx:113` POSTs `/api/expert-requests` on click; the free-lead path needs no PaymentIntent (`booking-actions.ts:47`), and `tripId` is optional — the LD 32(b) hole §6 already names. | **Lane L6** (the page becomes a door) closes it; until then **L19** adds the stop screen. |
| F3 | Cart "Platform fee" is **25% on top of price** ($30 on $120), not the ruled 7% capped at $25 (row 5) | **Real, and a money finding.** `/api/cart` (`server/routes.ts` ≈7893–7930) adds `price × (1 − expertShare)` — the PROVIDER commission band, `PLATFORM_FEE_RATE = 0.25` last-resort default — to the traveler's total as a fee line. The pricing map's traveler service fee (`traveler:service_fee_pct` 0.07 / cap 2500) has no reader in the cart. | **Money lane, before L7.** The cart rail is the legacy store ruling 4 retires; do not ship a checkout that charges commission to the traveler. Needs the decision-maker: is the cart's line a defect (§8/§14) or a documented legacy? |
| F4 | The "Your Trip" banner, cart contents and `/services` location filter follow the **browser tab, not the account** (rows 1, 4, 8, 14) | **Real.** `client/src/lib/trip-context.ts:156` keeps the pen in `sessionStorage` under one key, never namespaced by user and not cleared on sign-in/out; the server pen (`PUT /api/trip-context`) is per user. | **Lane L18 (landed as PR #846, ledger `2026-09-07-client-pen-scope`).** The pen is keyed by principal (`experienceContext` stays the GUEST pen; a signed-in traveler reads `experienceContext:u:<id>`), bound once at the layout mount by `bindPenPrincipal`. **Correction to this row's first draft:** "clear on auth change" alone would destroy a real guest→signup flow, so the lane ruled the handoff explicitly — sign-in hands the guest's ANSWERS (identity stripped, never a plan id) to the existing `PUT /api/trip-context` once, only into an EMPTY server pen; sign-out clears every client pen key and issues no PUT, so the server pen survives. |
| F5 | AI Planner defaulted "March 10–14" to **2025** and minted a plan tagged PAST (row 13) | **Real.** The extraction prompt in `trip-context.routes.ts` carries no date anchor; the model guesses the year. | **Lane L21** — pass today's date; a past date is asked about, never minted (§13). Fold into L5. |
| F6 | The finalized trip's upsell rail sends to `/services` with **no `tripId`** (row 10) | **Real.** `UpsellSlot.tsx:212` navigates with `categoryKey` and `upsellSource` only. | **Lane L22** — the door passes what it holds (D13): `tripId` and the plan's destination. Fork-vs-block on a final plan then becomes testable. |
| F7 | `tripId` scoping and the **city-mismatch guard work**, but only from "Browse services for this trip"; its `location` param is the stale banner city (row 9) | **Confirmed built** (`2026-09-04-location-mismatch`). The `location` value comes from the client pen (F4). | Fixed by **L18** — **correction:** there was no `location` param to fix. `SlipRail` passed only `tripId`; the stale city came from `discover.tsx`'s own client-pen fallback. The fix is on both ends: `slipBrowseServicesHref` puts the plan's destination on the href (the door passes what it holds, D13) and the receiver stops falling back to the pen when a `tripId` is on the URL. The plan chip (L11) makes the scoping visible on every entry. |
| F8 | No **which-plan** step anywhere; a 19-plan account is never asked (row 8) | Confirmed: no picker exists. | **Lane L23** — the buy-side resolver, the which-plan step, the slot pick at add. |
| F9 | Storefront **"Start a plan"** opens the planner with stale context and no link to the expert (rows 2, 7) | Confirmed: the storefront door passes no `returnTo` and the pen is F4's. | **L18 + D15** (`returnTo: { kind: 'expert', handle }`); check-planning-entry's required-field list gains the storefront door. |
| F10 | Bookings rows name **no service, provider or plan**; Trips tab never cross-links (row 15) | Confirmed (§9 Bookings). | **L12**, already scheduled; add the ready-made purchase cross-link. |
| F11 | Three back-office consoles for what the brief called two roles (rows 16–18) | Expected: the two offering catalogs (§4) and LD 36's planner keys decide the console. Not a fourth BUY-side axis. | No lane. Record in §4's FAQ that the console is a function of the earner's catalog, and that the buyer never sees it. |
| F12 | Concierge AI tier lands in a **$0 cart** with no $5.99 (row 12.3); "Complete Booking" is offered on a $0 order with a reference-only item (row 14) | Confirmed: the tier hands to `/cart?step=cart`, which does not run the optimizer; the pay gate lives on the slip. | **L6** retires the page; **L7**'s audit must include the $0-order path. |
| F13 | "Final · v2" plan listed under **In planning** (row 10.1) | Confirmed (§9 My plans). | **L3**. |

### 11.3 New lanes (appended to §10)

| Lane | Needs | Schema | Blocked by | Scope | Guard |
|---|---|---|---|---|---|
| **L18-client-pen-scope** | none | no | — | Key the `sessionStorage` pen by user; clear it on sign-in/out; the server pen is the authority; `/services` `location` reads the plan, never the pen. | pure test on the pen module; Playwright: two logins in one tab never share a banner |
| **L19-request-is-a-click** | none | no | — | `Get Expert Help` and `Request expert` open a review sheet (what is sent, to whom, at what price) and send only on its button; no POST on open. | check-money-endpoints; Playwright: opening the panel creates no `expert_requests` row |
| **L20-cart-fee-line** | **decision-maker** | no | — | Money lane: reconcile the cart's fee line with §8 / the pricing map before any checkout ships; either the traveler fee (7 % cap $25) or a documented legacy with a sunset. | phase2-fee-gate; check-money-endpoints; the sweep and promotion suites untouched |
| **L21-extraction-date-anchor** | none | no | — | The extraction prompt carries today's date; a date in the past is asked about, never minted. Folds into L5. | pure test on the extractor's date handling |
| **L22-door-passes-tripid** | none | no | — | `UpsellSlot`, the storefront "Start a plan", and every other door pass `tripId` / `returnTo` when they hold one (D13, D15). | check-planning-entry required-field list + `--self-test` |
| **L23-buy-side-resolver** | rulings 9, 10 | no | L18 · L22 | `resolveBuyAction` as designed in 11.5 (`shared/buy-action.ts`), shipped on every listing / expert / ready-made payload; the one ask-sheet (sign in → which plan → slot → party); untimed items grouped on the implicit event; `request_to_book` as a pending booking. | pure test over the 11.5 table + three negatives; payload test: descriptor present on every read |

### 11.4 Two more rulings this section asks for

9. **One resolver is the sole author of the buy button and the landing rule.** A listing cannot carry a custom CTA;
   the resolver reads the row (kind, delivery method, bookability, instant/request) and the buyer (guest, member,
   plan chip) and nothing else. This is what makes the variation finite.
10. **Untimed items render as a distinct group on the implicit event**, never hidden and never given a time. An
    artifact or an async service is on the plan without being on the clock.

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
