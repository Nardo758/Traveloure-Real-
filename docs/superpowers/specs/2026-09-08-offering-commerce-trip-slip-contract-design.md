# Offering Commerce and Trip Slip Contract

**Status:** Proposed operating contract  
**Date:** 2026-09-08  
**Scope:** Expert offerings, native service-provider offerings, adjacent marketplace products, checkout treatment, fulfillment, and Trip Slip projection  
**Evidence baseline:** `origin/main` at `f8eb853fe`, supplemented by existing repository audits and current schema, route, service, and client traces  
**Amended 2026-09-11** against `origin/main` at `59b34c757`. The corrections are marked **Amendment**
in place and change five things: the `booking_mode` finding (§4.3, §11), the retired expert-template
lane (§4.1, §15A, §21), the resolver's relationship to the four classifiers that already exist (§14),
the schema rules any new stored field must follow in this repo (§14), and two open questions that were
ratified on 2026-09-08 (§19). Everything else stands as written and was checked against the code.  

---

## 1. Executive decision

Traveloure must not decide checkout or Trip Slip behavior from an offering's display name, seller role, or catalog category alone.

The durable unit of behavior is a **commerce archetype**: a contract that says:

1. what the traveler is buying;
2. who fulfills it;
3. what information must exist before commitment;
4. whether Traveloure or a partner captures money;
5. whether the purchase is instant, requested, quoted, or externally completed;
6. what proves fulfillment;
7. how cancellation and refunds work; and
8. how the obligation changes the Trip Slip.

Expert and provider catalogs remain separate because they represent different seller roles and product vocabularies. Both catalogs must map into the same commerce-archetype contract before an offering can become purchasable.

The canonical future rule is:

> **Catalog identity explains what is offered. Commerce archetype controls how it is sold, fulfilled, and projected.**

---

## 2. What this document contains

This is one document with three layers:

1. **Current-state audit** — what the repository does today, including parallel rails and incomplete mappings.
2. **Canonical treatment matrix** — the recommended checkout and Trip Slip behavior for every meaningful offering archetype.
3. **Future-state specification and gap register** — the fields, invariants, rollout, and decisions needed to make the matrix enforceable.

Statements labeled **Observed** describe current behavior. Statements labeled **Canonical rule** are recommendations and do not claim to be implemented.

---

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Seller class** | Expert, native service provider, Traveloure, or external partner. |
| **Catalog offering** | A named capability shown in discovery, profiles, or seller setup. |
| **Listing** | A seller-specific, priced or requestable instance of a catalog offering. |
| **Commerce archetype** | The operational contract that controls checkout, custody, fulfillment, cancellation, completion, and Trip Slip projection. |
| **Commitment mode** | Instant purchase, request then accept, quote then approve, paid reservation, or external handoff. |
| **Fulfillment mode** | In-person, live remote, asynchronous deliverable, coordination, stay, bundle, plan clone, or external. |
| **Inventory authority** | The source allowed to promise availability: native slots, property rooms/rates, seller acceptance, component inventory, or external partner. |
| **Trip Slip effect** | How an offering changes the traveler's plan: add an obligation, modify plan content, attach support, clone a plan, or record an external booking. |
| **Completion evidence** | The event that proves the purchased obligation was fulfilled. |

The Trip Slip is the traveler-facing plan and obligation record assembled by the Plan Card service. It must distinguish planned suggestions from requests, purchases, confirmations, delivered work, and externally fulfilled bookings.

---

# Part I — Current-state audit

## 4. Current catalog model

### 4.1 Expert offering taxonomy

**Observed:** `expert_offering_types` is the canonical Expert vocabulary. It is separate from provider offerings and from the legacy `expertServiceOfferings` catalog.

> **Amendment (2026-09-11).** This paragraph originally named "the purchasable `expertTemplates`
> marketplace product" as a third thing the Expert vocabulary is separate from. **That lane is FULLY
> RETIRED** — seller side 2026-07-27, consumer side ledger `2026-09-03-expert-templates-consumer-sunset`
> (gate was production purchase counts; the decision-maker confirmed zero purchases ever). No surface,
> feed, purchase path or admin queue remains; the `expert_templates` / `template_purchases` /
> `template_reviews` tables are kept as historical rows only. **`ready_made_trips` is the single store
> lane**, and it is the one this contract's T1 archetype governs. Treating the retired lane as a live
> product would give T1 two custody stories.

The five Expert tiers and current keys are:

| Tier | Current offering keys |
|---|---|
| **Advisory** | `ask_me_anything`, `reality_check`, `itinerary_2nd_opinion`, `ai_plan_polish`, `neighborhood_picker`, `budget_optimizer`, `restaurant_hitlist`, `hidden_gems_shortlist`, `tourist_trap_audit`, `packing_brief`, `practicalities_brief`, `first_timer_orient` |
| **Planning** | `full_itinerary`, `perfect_day`, `multicity_route`, `family_plan`, `accessibility_plan`, `solo_plan`, `nomad_plan`, `special_occasion_trip`, `corporate_travel_plan`, `sports_event_travel`, `retreat_planning` |
| **Coordination** | `done_for_you_booking`, `group_trip_coord`, `reservation_lifeline`, `vendor_wrangler`, `occasion_coordination`, `booking_concierge`, `wedding_planner`, `wedding_day_of_coordinator`, `proposal_planner`, `party_planner`, `corporate_event_coordinator`, `date_night_designer` |
| **Live support** | `text_a_local`, `same_day_rescue`, `what_now_suggestions`, `realtime_translation`, `reservation_on_fly`, `trip_emergency` |
| **Specialized** | `themed_deep_dive`, `relocation_consult`, `content_scout`, `corporate_consult`, `location_scout`, `culture_crash_course`, `personal_shopper`, `pet_travel_consult`, `local_city_itinerary`, `local_perfect_day`, `local_neighbourhood_plan`, `sustainable_travel_consult`, `lgbtq_travel_consult`, `slow_travel_consult` |

This is the committed key-to-tier vocabulary. It does not assert that every row is active in every environment, that an Expert currently sells it, or that a seller-specific purchasable listing exists.

**Observed risk:** a tier describes the broad value proposition, but it does not reliably determine checkout eligibility, scheduling requirements, fulfillment evidence, or Trip Slip behavior. Specialized offerings are especially heterogeneous: a consultation, physical shopping task, scouting artifact, and itinerary can share the same tier while requiring different operational treatment.

### 4.2 Provider offering taxonomy

**Observed:** provider listings live in `provider_services`, while `service_categories`, `service_subcategories`, and `service_offering_types` supply discovery and catalog vocabulary.

Provider listings currently carry several partially overlapping behavioral dimensions:

- service type: `consultation`, `planning`, `action`, `concierge`, `experience`, `specialty`;
- delivery method: `pdf`, `video`, `call`, `in_person`, `voice_notes`, `async_messaging`, `hybrid`;
- booking mode: `instant`, `request`, `hidden`;
- price type: `fixed`, `variable`, `custom_quote`, `hourly`, `package_tiers`, `per_event`, `range`, `per_person`;
- lifecycle: active/paused/draft plus a separate approval lifecycle;
- category-level discovery, qualification, and risk metadata.

Affiliate source and custody are adjacent commerce dimensions represented by partner-specific records and routes; they are not universal `provider_services` listing fields.

Representative provider categories include:

- photography and videography;
- transportation and logistics;
- food and culinary;
- childcare and family;
- tours and experiences;
- personal assistance;
- health and wellness;
- beauty and styling;
- pets and animals;
- events and celebrations;
- technology and connectivity;
- language and translation;
- specialty services; and
- custom/other.

**Observed risk:** category, service type, delivery method, and booking mode are not one coherent contract. A category can contain several commerce archetypes, while the same delivery method can support different inventory and completion rules.

### 4.3 Development-data classification snapshot

**Observed on 2026-09-08; development database only:**

- All 55 committed Expert offering types are active: advisory 12, planning 11, coordination 12, live support 6, specialized 14.
- There are 215 active, approved provider listings.
- 214 of 215 active, approved provider listings have no `booking_mode`.
- All 215 have a populated service type, delivery method, and price type.
- 64 listings use service-type values outside the six declared schema archetype values. Examples include `activities`, `dining`, `venue`, `flights`, `hotels`, `photography`, `transportation`, `transport`, and `tour`.
- Delivery distribution is 93 in-person, 90 asynchronous-like (`pdf`, `voice_notes`, or `async_messaging`), and 32 live remote (`video` or `call`).
- The largest combinations are:
  - 56 `experience` + `in_person` + fixed price;
  - 26 `planning` + `video` + fixed price;
  - 21 `planning` + `pdf` + fixed price; and
  - 19 `planning` + `in_person` + fixed price.

This snapshot confirms the design problem is present in live development data, not only in type definitions:

1. **Amended (2026-09-11) — `booking_mode` is ALREADY resolver-authoritative, and the null column is
   its designed default, not a gap.** `provider_services.booking_mode` is nullable by ruling (`shared/schema.ts`,
   the `showPrice`/`bookingMode` block: "NULL = unset ⇒ resolved at read time from the account
   `service_provider_forms.instantBooking` by `resolveBookingMode`"), and `resolveBookingMode`
   (`shared/schema.ts`) is that resolver. So "214 of 215 rows carry no value" is a true COLUMN fact and
   the wrong conclusion: the commitment authority is the resolver, which is exactly the shape this
   document asks for everywhere else. **The finding that survives is narrower and still worth acting
   on:** any consumer that reads the column directly instead of calling `resolveBookingMode` sees
   nothing, so the canonical contract must name the RESOLVER as the authority and forbid a direct column
   read. Phase 0's dry run must resolve before it classifies, or it will report ~214 healthy listings as
   ambiguous and the migration risk in point 4 will be overstated.
2. `service_type` is functioning partly as free vocabulary/category data rather than a closed behavioral discriminator.
3. “Planning” spans live remote, asynchronous artifact, and in-person fulfillment.
4. A resolver must begin in audit mode and preserve legacy read compatibility; immediately enforcing the proposed contract would deactivate or misclassify most current listings.

### 4.4 Products considered by this contract

The platform also contains products that should not be forced into ordinary provider-service checkout. The distinctions below are observed where the cited services implement them; the unified treatment is proposed in Part II.

| Product | Current distinction |
|---|---|
| Ready-made plan | Purchase creates a buyer-owned editable clone rather than one booking item. |
| Optimization | Traveloure charges a plan-level fee; output modifies plan alternatives rather than booking a provider. |
| Affiliate inventory | External partner captures payment; Traveloure records attribution/commission and may later project a confirmed booking. |
| Property rooms/stays | Date-range inventory, nightly rates, check-in/out, and stay completion differ from one-time services. |
| Transport options | May be native, expert-coordinated, agent-assisted, or affiliate; only real confirmed bookings should appear as booked. |
| Bundles | Component inventory and completion cannot be inferred from the bundle label alone. |
| Information-only content | May influence planning without creating a charge or fulfillment obligation. |

---

## 5. Current checkout and custody behavior

### 5.1 Native service checkout

**Observed:**

- The canonical service checkout writes `service_bookings`.
- Checkout recomputes prices and fee bands server-side.
- For post-A3 cart rows, the traveler-facing total does not add the seller commission a second time: checkout separately records the server-derived `platformFee` and seller earnings, while the traveler total composes base price, applicable traveler service fee, concierge fee, and surcharge.
- A traveler service fee is composed separately.
- In the cart/service-booking payment path, provisional rows begin as `payment_pending` and are promoted after Stripe authorization. Request-mode, deposit, cancellation, and legacy rails have additional states and must not be treated as one universal lifecycle.
- Deposit-paid is a distinct partial-payment state.
- The one-time traveler service fee is charged with the initial/deposit payment and must not be charged again with the balance.
- Native availability can be claimed during checkout and released by expiry machinery.
- A purchased itinerary transition is reserved for checkout/refund machinery rather than arbitrary plan editing.

### 5.2 Expert requests and coordination

**Observed:**

- Expert requests can carry a Trip ID and can create a Stripe PaymentIntent for some advisory/concierge paths.
- The Expert-service payment helper supports `review`, `review_and_book`, and `full_concierge` service types, but this does not establish one universal payment contract for all Expert catalog tiers.
- Expert assignment, acceptance, payment, coordination, and plan modification are not represented by one uniform commerce state machine.
- Coordination contains at least one quote-only path where the fee is calculated but not captured.
- Expert tier alone does not determine whether the offering is a message request, paid advisory session, planning deliverable, booking concierge engagement, or live support obligation.

Booking Concierge also has an existing native service-listing treatment: checkout detects `booking_concierge` and charges its configured facilitation fee on the service line. That is distinct from a future quoted Expert coordination engagement and must remain a separate charge object.

### 5.3 Affiliate and external fulfillment

**Observed:**

- External partners charge the traveler directly.
- Traveloure must not issue a Stripe refund for money it did not capture.
- Affiliate links and requests represent attribution and projected commission, not native booking custody.
- Transport is one area where native and external options can coexist, but the rows retain source/booking-type discrimination.

### 5.4 Parallel and legacy rails

**Observed:**

- `service_bookings` is the canonical native service rail.
- The legacy `bookings` rail remains live through `/api/bookings/process-cart`, its payment/refund handling, availability reads, and administrative/reconciliation readers.
- Template purchases, Expert requests, optimization, ready-made purchases, and affiliate conversions have separate custody and fulfillment paths.
- These rails do not share one cancellation/refund and earnings-reversal contract.
- Legacy and generated-plan paths can lack Trip item, vendor, or confirmation linkage.

This means “checkout behavior” cannot safely be derived from the existence of a price or Stripe ID alone. Table/rail identity currently carries important meaning that should become explicit commerce metadata.

---

## 6. Current Trip Slip behavior

**Observed:**

- The canonical Plan Card assembler overlays live booking facts onto plan items.
- Real trip bookings can be included even when no itinerary-item link exists.
- The assembler intentionally does not invent missing dates, locations, vendor details, confirmation numbers, meeting points, or transport.
- Only real booked/confirmed transport is projected as booked; suggested or unconfirmed options remain suggestions.
- A purchased ready-made plan creates a new traveler-owned trip and copies its items as planning content.
- The final-plan experience and generated-itinerary fallback do not have equal fidelity. Generated fallback items can lack vendor and booking linkage.
- Trip creation requires destination and date boundaries; requests should not mint a trip from guessed dates.

Two current exceptions must remain visible:

1. Ready-made purchase currently creates a clone using “now” plus listing duration when it needs trip dates. Those dates are synthetic placeholders, not traveler-confirmed travel dates, and must not make date-dependent obligations look confirmed.
2. Plan Card assembly retains an internal `new Date()` fallback for some calculations when `trip.startDate` is absent, even though emitted metadata can remain nullable. Date-derived labels from that fallback are a current non-fabrication risk.

### 6.1 Existing Trip Slip states are not enough by themselves

The Slip currently combines several concepts:

- planning/routing status of an item;
- booking/payment status;
- provider or Expert fulfillment status;
- suggested versus confirmed transport;
- frozen final-plan content versus live booking overlays.

These concepts should remain separate. Collapsing them into one “status” would make a paid-but-not-confirmed request indistinguishable from a confirmed obligation, or make a delivered planning artifact look like an attended in-person service.

---

## 7. Current-state findings

### Critical

1. **No single offering-to-commerce contract exists.** Catalog tiers and listing fields do not deterministically select checkout, fulfillment, and Trip Slip behavior.
2. **Expert offerings are under-discriminated.** The same tier can contain session, artifact, coordination, and physical-action products.
3. **Parallel money rails have different refund and earnings behavior.** A generic “refund booking” assumption is unsafe.
4. **Paid-to-Slip integrity is not universal.** A paid booking may be trip-level or legacy-linked, while a purchased plan item may lack a canonical booking relationship.

### High

5. **Request semantics are distributed.** “Request,” seller acceptance, payment authorization, confirmation, and fulfillment do not form one documented state machine.
6. **Bundles require two classifications.** Their checkout fundamentals may derive from delivery mode, while completion depends on components.
7. **Asynchronous work is easy to misclassify.** Voice notes, PDFs, and messaging do not have ordinary slot or attendance semantics.
8. **Affiliate projection is incomplete as a traveler contract.** The Slip needs honest external-request, externally-confirmed, changed, and cancelled states without pretending Traveloure owns custody.
9. **Generated plans have lower booking fidelity.** They can influence the Slip without carrying actionable vendor or confirmation facts.

### Medium

10. **Display vocabulary can cross seller boundaries.** Similar names in Expert and provider catalogs do not guarantee equivalent custody or fulfillment.
11. **Unclassifiable listings fail conservatively but opaquely.** Historical fallback behavior can suppress completion rather than explain why an offering cannot progress.
12. **Discovery fields can imply behavior they do not guarantee.** Delivery format and category are useful filters but are insufficient checkout authorities.

---

# Part II — Canonical treatment matrix

## 8. Canonical classification axes

Every purchasable listing or product should resolve the following server-owned contract before the traveler sees a commitment action:

| Axis | Canonical values |
|---|---|
| `sellerClass` | `expert`, `provider`, `traveloure`, `external_partner` |
| `commerceArchetype` | One of the archetypes in section 9 |
| `commitmentMode` | `instant`, `request_accept`, `quote_approve`, `reserve_then_pay`, `external_handoff`, `not_purchasable` |
| `fulfillmentMode` | `in_person`, `live_remote`, `async_artifact`, `async_messaging`, `coordination`, `stay`, `bundle`, `plan_clone`, `plan_modification`, `external` |
| `inventoryAuthority` | `native_slot`, `seller_acceptance`, `property_inventory`, `component_inventory`, `external_partner`, `none` |
| `priceAuthority` | `listing`, `selected_tier`, `server_quote`, `property_rate`, `external_partner`, `no_charge` |
| `chargeMode` | `full`, `deposit_balance`, `after_acceptance`, `after_quote`, `traveloure_fee_only`, `external`, `none` |
| `completionRule` | `service_date`, `session_end`, `artifact_accepted`, `seller_declared`, `all_components`, `checkout_date`, `plan_delivered`, `support_window_end`, `external_reported`, `none` |
| `slipEffect` | `add_obligation`, `modify_plan`, `attach_support`, `clone_plan`, `record_external`, `planning_reference_only` |

**Canonical rule:** no client-supplied field may choose a more permissive commerce archetype, inventory source, price authority, or charge mode than the server-resolved listing contract.

---

## 9. Master treatment matrix

The matrix is the **proposed canonical contract**. Expert work cards, support coverage, component-level bundle projection, and full external lifecycle projection are not all implemented by the current Plan Card assembler.

### 9.1 Expert-led archetypes

| Archetype | Typical Expert offerings | Checkout treatment | Fulfillment and completion | Trip Slip effect |
|---|---|---|---|---|
| **E1. Advisory session** | AMA, reality check, second opinion, budget review | Request/accept or instant slot; charge only against a defined session/deliverable; require topic and Trip ID when trip-specific | Live call/video or explicit written response; complete at session end or artifact acceptance | Attach a trip-level advisory engagement; show appointment/delivery status and resulting recommendations separately from purchased bookings |
| **E2. Planning artifact** | Full itinerary, perfect day, family/accessibility/solo plan | Request/accept; collect brief, dates, destination, party, constraints; initial versions may use full payment; milestone payment requires a future engagement rail | Proposed: Expert submits structured plan revision; traveler accepts or requests revision; complete on accepted delivery | Proposed: modify plan content with provenance and keep engagement status in a separate work card; never mark unbooked recommendations as purchased |
| **E3. Coordination engagement** | Booking concierge, vendor wrangling, group coordination, event planning | Request/accept or quote/approve; disclose Expert/coordination fee separately from third-party purchases; do not conflate this with the existing per-service Booking Concierge facilitation fee | Ongoing work window with milestones; completion when scope closes, not when first vendor is booked | Proposed: attach a coordination workstream; each resulting vendor booking becomes its own Slip obligation with its own custody and status. Current linkage varies by request/coordination rail |
| **E4. Live support window** | Text a local, same-day rescue, live translation, trip emergency | Require active/support dates and response terms; pay for time window or incident; do not model as ordinary inventory unless scheduled | Complete when support window ends or incident is resolved | Attach support coverage to applicable trip dates; expose contact/action only while active; record outcomes without inventing bookings |
| **E5. Specialized consult/artifact** | Themed deep dive, relocation/culture/sustainability/LGBTQ+/slow-travel consults, local itinerary/plan keys | Map explicitly to E1, E2, E6, or a live/async contract based on declared deliverable; `specialized` is not itself a checkout archetype | Session, artifact, support, or action rule chosen by listing contract | Advisory attachment, plan modification, support coverage, or task projection—never a generic specialized booking |
| **E6. Expert physical action** | Personal shopping, location scouting, content scouting where the listing promises a physical task | Request/accept or quote/approve; collect location, constraints, reimbursable-expense policy, and proof expectations | Seller-declared completion plus artifact/receipt evidence where applicable | Proposed: add a task/work obligation; project resulting recommendations or procured items separately |

### 9.2 Native provider archetypes

| Archetype | Typical offerings | Checkout treatment | Fulfillment and completion | Trip Slip effect |
|---|---|---|---|---|
| **P1. Scheduled place service** | Tour, photography session, transfer, wellness appointment, dining experience | Require native slot/date, party size, and location/meeting facts; instant or request/accept; full or deposit payment | Complete on service date or provider/traveler confirmation according to policy | Add dated booking obligation with vendor, meeting point, confirmation, balance, cancellation, and contact actions |
| **P2. Live remote service** | Video consultation, live translation call | Require slot and timezone; no physical meeting point; instant or request/accept | Complete at session end | Add dated remote appointment with join/contact action; do not show map logistics |
| **P3. Asynchronous artifact** | PDF guide, research brief, edited media, voice-note package | No inventory slot unless seller promises a delivery window; collect brief and due date; current native checkout supports full/deposit charging. Milestone or after-acceptance charging requires a future engagement rail | Complete when artifact is delivered and accepted, or after explicit acceptance timeout | Proposed: add deliverable/work card; resulting recommendations may modify plan but do not become purchased bookings |
| **P4. Asynchronous messaging service** | Ongoing chat advice, asynchronous translation | Define start/end window, response SLA, message scope, and escalation; avoid fake appointment slots | Complete at support-window end or scope closure | Attach active support thread to trip; show coverage window and status |
| **P5. Custom-quote service** | Complex event vendor, bespoke transport, variable production work | Future quote rail required: request first; provider returns server-recorded quote; traveler approves quote before charge; quote expiry required. Do not send this through generic checkout until that rail exists | Fulfillment rule derives from the accepted quote's declared archetype | Before approval show request/quote, not booking; after payment project the archetype-specific obligation |
| **P6. Stay/property booking** | Hotel, villa, room | Require check-in/out, guests, room/rate plan, cancellation terms, and property inventory confirmation; reserve then pay or instant | Complete at checkout date; modifications follow property inventory | Add multi-day stay block with nightly/total pricing, check-in/out, room/rate, confirmation, cancellation, and balance |
| **P7. Bundle/package** | Multi-service experience or package | Validate component availability and price snapshot atomically; disclose components; support one payment with component custody map | Complete only when required components complete; cancellation/refund ownership must be defined per component | Current checkout can snapshot components, but Plan Card projection is effectively parent-level. Future contract: add parent package plus component obligations and aggregate status explicitly |
| **P8. Native transport** | Chauffeur, transfer, driver service | Require route endpoints, date/time, party/luggage, and provider/native inventory; instant, request, or quote | Complete at destination/service end | Add transport leg with confirmed provider and pickup facts; never draw an invented route |

### 9.3 Traveloure and external archetypes

| Archetype | Typical products | Checkout treatment | Fulfillment and completion | Trip Slip effect |
|---|---|---|---|---|
| **T1. Ready-made plan** | Paid itinerary/template | One plan-level purchase; do not add as a normal service line | Complete when buyer-owned clone is created; later Expert support is a separate engagement | Create a new editable trip and copy plan items as planning content |
| **T2. Plan optimization** | AI or assisted optimization | Charge Traveloure fee before generation according to entitlement/rerun rules | Complete when alternatives are generated; adoption is a separate traveler action | Add alternatives and optimization metadata; only adopted changes modify the plan |
| **X1. Affiliate/external booking** | OTA hotel/activity/transport inventory | External handoff; Traveloure does not charge the underlying purchase; record attribution and optional request | External partner confirms, changes, cancels, and refunds | Record external request first; show booked only with confirmation evidence; identify external custody and partner support path |
| **N1. Information-only/planning reference** | Gem, neighborhood, unpriced recommendation | No charge; “save/add to plan,” not “buy” | No fulfillment obligation | Add planning reference or suggestion; never show as confirmed/purchased |

---

## 10. Expert tier default mapping

Expert tier remains useful as a default, but must not be the final authority.

| Expert tier | Default archetype | Required explicit exceptions |
|---|---|---|
| Advisory | Non-binding hint: E1 session or P3-style artifact | `ai_plan_polish` and other review outputs may be artifact-like; listing contract is required |
| Planning | Non-binding hint: E2 artifact or E1-style live co-planning | Listing contract must declare delivery and plan-modification rights |
| Coordination | E3 Coordination engagement | A single bookable vendor service belongs provider-side unless the Expert is selling coordination around it |
| Live support | E4 Live support window | A pre-booked translation call may use the live-remote session contract while retaining `sellerClass=expert` |
| Specialized | No default purchase behavior | Must explicitly select E1, E2, E6, P2, P3, or P4 semantics |

**Canonical rule:** a new Expert listing cannot become active if its tier maps to more than one possible archetype and no explicit archetype is stored.

---

## 11. Provider field interpretation

Existing provider fields should be treated as inputs to validation, not independent authorities:

| Existing field | Correct role |
|---|---|
| Category/offering type | Discovery, qualification, risk, and default suggestions |
| Service type | Value proposition; may suggest but must not determine checkout |
| Delivery method | Strong fulfillment constraint |
| Booking mode | Commitment mode within the allowed archetype — **read through `resolveBookingMode`, never off the column** (amended 2026-09-11; a null column is "unset", and the resolver answers from the account's instant-booking flag) |
| Price type | Price-authority and quote behavior constraint |
| Availability/slot data | Evidence for native inventory authority |
| Property/room data | Evidence for stay archetype |
| Bundle components | Evidence for bundle inventory/completion |
| Source type/partner | Custody and external-handoff constraint |

Proposed activation-time invalid combinations under the future contract:

- `instant` + `custom_quote`;
- `in_person` + no date/location or seller acceptance path;
- `pdf` + mandatory physical meeting point;
- `affiliate` + Traveloure charge for the underlying item;
- `stay` + one-time service completion;
- `bundle` + completion when only the first component finishes;
- `specialized` Expert listing + no declared deliverable.

---

## 12. Trip Slip projection contract

### 12.1 Proposed normalized status dimensions

These are future normalized dimensions, not current shared enums or one existing API contract.

Every projected obligation should expose separate dimensions:

1. **Plan state:** suggested, in planning, ready for checkout, purchased, removed.
2. **Commerce state:** not applicable, request draft, requested, quoted, `payment_pending`, authorized/paid, `deposit_paid`, balance due, refunded, cancelled.
3. **Confirmation state:** awaiting seller, provider accepted, native inventory confirmed, externally confirmed, declined, expired.
4. **Fulfillment state:** not started, active, delivered, completed, disputed, cancelled.
5. **Custody:** Traveloure, external partner, no charge.

The UI may summarize these into traveler-friendly language, but the underlying dimensions must remain distinct.

Payment authorization is neither provider acceptance nor fulfillment. For instant native inventory, a valid slot claim plus authorized payment may satisfy confirmation. Request-mode offerings still require seller acceptance.

### 12.2 Projection types

| Projection | Used by | Required traveler-facing facts |
|---|---|---|
| **Booking obligation** | P1, P2, P6, P8 | Date/time or date range, seller, confirmation state, amount/balance, cancellation, location or join action |
| **Deliverable/work card** | E2, E3, E6, P3, P5 before fulfillment | Scope, owner, due/window, milestones, payment/quote state, latest deliverable/action |
| **Support coverage** | E4, P4 | Coverage window, owner, response terms, contact action, active/resolved status |
| **Plan modification provenance** | E1/E2 outputs, T2 | Who/what proposed the change, when, acceptance state, affected items |
| **Package with components** | P7 | Parent commercial summary plus component-level confirmation and fulfillment |
| **External booking record** | X1 | Partner, external custody, confirmation evidence, external support/cancellation path |
| **Planning reference** | N1 | Source and planning relevance; never payment or confirmation language |
| **Cloned trip** | T1 | Purchase provenance on the new trip; copied items begin as planning content |

### 12.3 Non-fabrication rules

The Trip Slip must never:

- mark an external click or request as booked;
- infer a confirmation number;
- invent service dates, meeting points, routes, or vendor contacts;
- convert Expert plan recommendations into purchased services;
- mark a request as confirmed before seller acceptance and required payment;
- hide component failures behind a completed bundle;
- show Traveloure refund controls for partner-custody purchases;
- treat payment as proof of fulfillment; or
- treat plan finalization as proof that every plan item was purchased.

Ready-made clone placeholder dates must be labeled as requiring traveler confirmation and must not drive confirmed bookings, countdowns, or date-dependent obligations. Future behavior should require traveler dates or suppress date-derived actions until the clone is re-dated.

### 12.4 External record contract

An external projection requires persisted fields for partner, custody, external reference, request timestamp, confirmation evidence/source, partner booking status, last synchronization time, and support/cancellation destination.

- Click, redirect, request, and `agent-rail` are not booked states.
- Only partner confirmation evidence may set `externally_confirmed`.
- Partner changes and cancellation must read back into the Slip without creating a Traveloure refund action.

---

## 13. Checkout decision sequence

The server should resolve a buy action in this order:

1. **Is the item purchasable?** Reject hidden, information-only, inactive, unapproved, or incomplete contracts.
2. **Who owns custody?** Traveloure, external partner, or no charge.
3. **Which archetype applies?** Resolve from stored contract; do not infer from display text.
4. **Is required context present?** Trip, dates, destination, party, slot, route, room, brief, support window, or components.
5. **Who owns inventory?** Verify native slot/property/components, request seller acceptance, or hand off externally.
6. **Who owns price?** Recompute listing/tier/rate, load accepted quote, or defer to partner.
7. **When may money move?** Before fulfillment, after seller acceptance, after quote approval, as deposit/balance, or externally.
8. **What row is created?** Booking, request, quote, engagement, purchase, clone, external record, or planning reference.
9. **What Slip projection is created?** Use the projection contract in section 12.
10. **What proves completion and enables settlement?** Store the completion rule snapshot with the transaction.

Failure at any step must return a machine-readable reason and must not silently downgrade to a generic cart line.

---

# Part III — Future-state specification and gap register

## 14. Canonical offering contract

Each active purchasable listing should resolve to a versioned server-owned contract:

```text
OfferingCommerceContract
  contractVersion
  sellerClass
  commerceArchetype
  commitmentMode
  fulfillmentMode
  inventoryAuthority
  priceAuthority
  chargeMode
  completionRule
  slipEffect
  requiredContext[]
  cancellationPolicyId
  reschedulePolicyId
  disputePolicyId
  allowsTripLevelProjection
  requiresItemLink
  requiresFulfillmentEvidence
```

This may initially be a resolver over existing columns rather than a new table. The important requirement is that one function returns one validated contract and every commerce surface consumes it.

> **Amendment (2026-09-11) — THIS IS THE FIFTH CLASSIFIER, AND ITS RELATIONSHIP TO THE OTHER FOUR MUST
> BE STATED BEFORE PHASE 1.** Four server-side resolvers already decide behaviour over these same rows:
> **`resolveBuyAction`** (`shared/buy-action.ts`) — ratified 2026-09-08 as **ruling 9, the SOLE AUTHOR
> of the buy button and the landing rule**, so a listing carries no CTA of its own; **`impactClassFor`**
> (`shared/impact-class.ts`) — what a listing does to a plan, derived and never stored; **`resolveContentCTA`**
> (`shared/content-cta.ts`); and the delivery **service fundamentals** (`shared/service-fundamentals.ts`).
> A fifth resolver that re-derives from columns instead of composing these is precisely the
> derivation-drift CLAUDE.md §18 rule 1 forbids, and it is how one surface starts refusing a purchase
> another surface offers.
>
> **The composition this document adopts:**
> 1. `resolveOfferingCommerceContract` is the **input**, not the button. It composes the four above and
>    re-derives none of them.
> 2. **`resolveBuyAction` remains the sole author of the buy button and the landing rule** (ruling 9,
>    unweakened). It consumes the contract; the contract never draws a CTA.
> 3. `impactClassFor` stays the answer to "what does this do to the plan", and `slipEffect` is DERIVED
>    from it rather than being a second opinion about the same row.
> 4. `fulfillmentMode` must reconcile with the service fundamentals' existing delivery shapes rather
>    than restating them. Where the two disagree, the fundamentals win and the disagreement is a finding.
>
> **AND THE SCHEMA RULES BIND ANY STORED FIELD THIS CONTRACT ADDS** — the contract snapshot, the
> `trip_level_obligation` marker (§15), the external-record fields (§12.4) and quote records (P5). In
> this repository that means: **additive and nullable; NO DB CHECK** (the value sets are app-enforced —
> a CHECK over a new enum is the publish-time drizzle-push failure the Coordination Prevention rules
> warn about, and it has bitten repeatedly); **declared in `shared/schema.ts`**, or the deploy push
> drops the object and the stamped migration never recreates it; registered in
> `server/migrations/migration-files.ts`; and **no backfill that invents an answer** — an unclassified
> legacy row is "never classified", which is a fact, not a gap to fill with a nearest-looking archetype
> (§13). The instinct above to start as a resolver over existing columns is therefore the rule, not
> merely an option: **Phase 1 adds no column at all.**

### 14.1 Contract snapshots

At commitment time, the booking/request/purchase must snapshot behavior-changing terms:

- commerce archetype and contract version;
- custody and charge mode;
- price and fee inputs;
- accepted quote or selected tier;
- cancellation/reschedule policy;
- completion rule;
- expected delivery/service window;
- component breakdown for bundles; and
- Trip Slip projection target.

The charge snapshot must separately preserve:

- base price;
- traveler service fee and whether it has already been charged;
- concierge/facilitation fee;
- travel surcharge;
- seller commission/platform fee accounting;
- deposit amount;
- remaining balance and due date;
- waiver/entitlement basis; and
- processing/insurance treatment where applicable.

Balance checkout must not charge a one-time traveler service fee again.

Historical purchases must continue using their snapshots even if the listing later changes.

---

## 15. Future-state integrity invariants

These requirements are not satisfied universally by current or legacy rails.

1. Every active purchasable listing resolves exactly one valid commerce contract.
2. Every Traveloure-custody charge points to the exact charged object and idempotency scope.
3. Every paid native service booking either links to a Trip item or carries an explicit `trip_level_obligation`/legacy-exception marker, reason, and projection target.
4. Every purchased Trip item has a booking/purchase link or a documented no-booking exception.
5. An external-custody record cannot carry a Traveloure PaymentIntent for the underlying purchase.
6. A confirmed state requires confirmation evidence appropriate to the archetype.
7. A completed state requires the snapshotted completion rule.
8. Seller earnings cannot become releasable from payment alone when fulfillment is still outstanding.
9. Refund/reversal logic branches on custody and the original charge snapshot.
10. The Trip Slip reads projections; it does not reverse-engineer commerce semantics from labels.
11. Expert plan edits and provider fulfillment remain attribution-distinct.
12. No listing can use an unknown delivery method or fallback behavior once it is newly activated.

Unknown delivery behavior remains readable for historical rows, but activation of a new unclassifiable listing must fail with a machine-readable reason.

`bookingStatus=confirmed` must never imply `fulfillmentState=completed` or earnings release. The commitment snapshot stores both the completion rule and its evidence source.

---

## 15A. Legacy compatibility boundary

| Rail/product | Current custody/status authority | Refund owner | Trip Slip treatment | New writes under future contract |
|---|---|---|---|---|
| `service_bookings` | Canonical native service payment/booking state | Future custody-aware service-booking refund path | Live booking overlay; link or explicit trip-level marker | Allowed through contract resolver |
| Legacy `bookings` | Legacy cart/payment/refund state | Existing legacy refund path, using the booking's own payment reference | Compatibility projection with legacy provenance | No new archetypes; set a retirement decision before disabling writes |
| `expert_requests` | Expert request/assignment/payment fields vary by route | Future Expert engagement refund policy | Current trip-bound request/advisor facts; future work/support projection | Allowed only after explicit Expert archetype mapping |
| Ready-made purchase (`ready_made_trips`) | Purchase and clone state | Product-specific future refund policy | New buyer-owned trip with planning-content provenance | Allowed through plan-clone contract |
| ~~Template purchase (`expert_templates`)~~ | **RETIRED** (amended 2026-09-11) — ledger `2026-09-03-expert-templates-consumer-sunset`; historical rows only, no live surface or purchase path | Not applicable — zero purchases ever | None | **None: no new writes, and it is not a rail to migrate** |
| Optimization | Comparison/payment/generation state | Traveloure product policy | Alternatives plus adoption state | Allowed through plan-modification contract |
| Affiliate/external | Partner records and reconciliation | External partner for traveler funds; Traveloure for commission correction | External record only with evidence | Allowed only as external custody |

This table must gain an approved “new writes stop” date before any legacy rail becomes read-only. Historical reads and refunds survive retirement.

---

## 16. Gap register

| ID | Gap | Risk | Recommended disposition |
|---|---|---|---|
| G1 | Expert tier does not resolve one commerce archetype | Wrong checkout and Slip treatment | Add explicit archetype to Expert listing/selection contract |
| G2 | Provider classification is split across fields | Invalid combinations reach generic flows | Central resolver plus activation-time validation |
| G3 | Request/quote/accept/payment states are distributed | Premature confirmation or unclear traveler status | Ratify one cross-archetype commitment state model |
| G4 | Parallel rails differ in refund/earnings behavior | Wrong refund target or stale ledgers | Build custody-aware refund/reversal at the purchase-reference layer |
| G5 | Paid booking ↔ Trip item linkage is not universal | Paid obligations can disappear from Slip | Enforce link-or-trip-level invariant and audit exceptions |
| G6 | Generated/frozen plan paths have lower fidelity | Non-actionable plan content looks equivalent to live bookings | Label provenance and require real booking evidence for confirmed projection |
| G7 | Affiliate lifecycle is thin | Click/request can look like booking, cancellation invisible | Add persisted external request/confirmation/change/cancel fields and projection contract |
| G8 | Async artifact acceptance is not uniform | Work may never complete or settle honestly | Add delivery, acceptance, revision, and timeout events |
| G9 | Bundle completion and refund are component-sensitive | Parent status hides failures | Snapshot components and aggregate explicitly |
| G10 | Specialized Expert offerings are heterogeneous | Tier-based default is unsafe | Require explicit deliverable/archetype before activation |
| G11 | At least one coordination path calculates a fee without demonstrating one uniform captured-fee lifecycle, while service-listing Booking Concierge has its own configured fee in native checkout | Traveler sees several “coordination fee” concepts with different custody | Separate service-line facilitation fee from Expert engagement price; verify the quote route and wire one engagement payment contract |
| G12 | Legacy booking rail remains live | New rules can cover only half the real money path | Inventory legacy entry points; migrate deliberately or adapt through the same contract |

---

## 17. Recommended implementation order

### Phase 0a — Merge the two decision registers, and re-run the counts against production

**Added 2026-09-11.** Two things must happen before Phase 0's ratification, and neither is code.

1. **One decision register, not two.** §19's twelve questions overlap the open register in
   `docs/ROADMAP.md` §A and the punchlist in `docs/PUNCHLIST.md` — ready-made delivered as a finished
   plan or an editable template, what the included consultation actually is, and whether one checkout may
   mix a ready-made plan with services are the same questions asked twice. Two registers guarantee one
   gets answered and the other quietly does not.
2. **Re-run §4.3's counts against production.** That snapshot is DEVELOPMENT data by its own framing,
   and it could not be reproduced in a later session (no database in that environment). The judgement
   that "immediately enforcing the proposed contract would deactivate or misclassify most current
   listings" rests on those numbers, and it should rest on the real distribution — resolved through
   `resolveBookingMode` per the §4.3 amendment, not read off the column.

### Phase 0 — Ratify vocabulary and inventory

1. Approve the archetype list and status dimensions.
2. Export every active Expert/provider listing with its current fields.
3. Dry-run the resolver and classify rows as valid, ambiguous, contradictory, or not purchasable.
4. Decide unresolved specialized, custom-quote, bundle, coordination, and legacy cases.

### Phase 1 — One read-only resolver

1. Implement one server-side `resolveOfferingCommerceContract`.
2. Use it first for diagnostics, admin visibility, and activation validation.
3. Do not change checkout behavior until classification coverage is measured.

### Phase 2 — Checkout authority

1. Route buy-action, required-context, inventory, quote, and charge decisions through the resolver.
2. Snapshot the resolved contract on new commitments.
3. Keep legacy purchases on historical behavior.

### Phase 3 — Trip Slip projection

1. Introduce projection types and separate status dimensions.
2. Require link-or-trip-level treatment for paid native obligations.
3. Add work cards, support coverage, package components, and external booking records.

### Phase 4 — Completion, settlement, and reversals

1. Enforce completion evidence by snapshot.
2. Align earnings release with fulfillment.
3. Add custody-aware cancellation/refund/reversal.
4. Reconcile legacy rails before retiring any path.

---

## 18. Test and audit matrix

Every archetype requires end-to-end coverage for:

1. discovery action label;
2. required context;
3. price/fee calculation;
4. inventory or acceptance;
5. provisional claim and idempotency;
6. payment authorization or external handoff;
7. booking/request confirmation;
8. Trip Slip projection;
9. reschedule/change;
10. cancellation/refund;
11. fulfillment/completion;
12. earnings release or affiliate reconciliation; and
13. legacy readback when applicable.

Priority scenarios:

- a `$200` native provider service where traveler total excludes withheld commission;
- request-mode service declined before payment;
- custom quote approved after expiry;
- deposit plus balance;
- multi-night property stay;
- partial bundle failure;
- Expert plan delivery with traveler revisions;
- Booking Concierge producing several provider bookings;
- live support spanning trip dates;
- voice-note/PDF delivery and acceptance;
- affiliate click without confirmation;
- externally confirmed booking later cancelled;
- ready-made plan purchase and clone;
- paid booking with no itinerary-item link;
- legacy booking read and refund; and
- unclassifiable listing activation rejection.

Required-context tests must distinguish Trip dates from service fulfillment facts:

- P1/P2 require a slot/timezone or an explicit request-acceptance path;
- P6 requires check-in/check-out and guests;
- E4/P4 require a support window;
- P3 requires a delivery window rather than a fake appointment; and
- P8 requires route endpoints and pickup time.

---

## 19. Product and policy decisions still required

> **Amendment (2026-09-11) — SUPERSEDED AS A REGISTER; the one register is `docs/PUNCHLIST.md` §1.**
> Every question below has been carried there as rows **D-5 … D-12**, each naming this section as its
> source and carrying a recommendation. The text below is kept as this document's own reasoning, but
> **an answer is recorded in the punchlist, not here**, and a NEW question goes there too. Two
> registers asking the same thing guarantee one gets answered and the other quietly does not —
> D-1 and D-2 there had each already been asked twice, in different words.

The document recommends a structure but does not invent these business decisions:

1. When should Expert advisory and planning fees be charged: before assignment, after acceptance, or by
   milestone? **Partly ANSWERED 2026-09-08 (amended 2026-09-11), and this contract must not re-open it:**
   ruling 11 (ledger `2026-09-08-rulings-11-12`) rules that **plan work sold as a listing is charged AT
   CHECKOUT, and the purchase itself grants the Expert access** — the `trip_expert_advisors` row is
   written ON AUTHORIZATION, inside the booking's own transaction, through the existing single author
   `upsertTripAdvisorRow` (one more caller, never a new insert site). Ruling 12 rules that **a consult
   never requires a plan** and, in its ratified clarification, that **a consult writes NO advisor row** —
   which is what keeps it from colliding with the rule that no expert touchpoint exists without a slip.
   What remains open is only the MILESTONE case for large planning engagements (E2/E3), which still has
   no rail.
2. Which Expert outputs require traveler acceptance before completion and earnings release?
3. What revision allowance belongs to planning artifacts?
4. Who may declare completion for physical-action and coordination work?
5. How should reimbursable expenses be quoted, approved, evidenced, and refunded?
6. Can custom quotes require deposits, and how long do quotes remain valid?
7. What happens when one bundle component fails after others are delivered?
8. Which external partners can provide reliable confirmation/change/cancellation callbacks?
9. What minimum evidence allows an external booking to appear as confirmed?
10. Should trip-level obligations without item links be a supported product pattern or a temporary migration exception?
11. Which legacy rail becomes canonical during consolidation, and how are historical refunds preserved?
12. What are the cancellation, dispute, and earnings-clawback policies for each custody class?

These decisions should be recorded before implementation changes money movement or settlement.

---

## 20. Recommended ownership model

| Concern | Owner |
|---|---|
| Catalog naming, descriptions, discovery grouping | Marketplace/catalog domain |
| Commerce-archetype assignment and validation | Commerce domain |
| Fee and price authority | Money domain |
| Inventory and seller acceptance | Booking/availability domain |
| Fulfillment evidence and completion | Fulfillment domain |
| Trip Slip projection | Trip plan domain |
| Cancellation/refund/reversal | Money + booking domains |
| Expert plan-change provenance | Expert work domain |
| Affiliate confirmation and reconciliation | Partner commerce domain |

No UI page should privately implement these policies. UI surfaces render the server-resolved contract and available actions.

---

## 21. Source evidence

Primary current-code anchors:

- `shared/schema.ts` — provider listings, categories, offering catalogs, bookings, listing lifecycle, delivery/price/booking fields.
- `shared/expert-offerings.ts` — Expert tier vocabulary and key-to-tier map.
- `server/migrations/039_phase2_seed_expert_offering_types.sql`
- `server/migrations/062_fill_offering_gaps.sql`
- `server/migrations/065_seed_booking_concierge_offering_type.sql`
- migration `283*` — event-planner Expert offering rows.
- `shared/__tests__/impact-class.test.ts` — committed taxonomy/migration consistency.
- `shared/buy-action.ts` — current buy-action resolution and intentionally deferred plan-work semantics.
- `shared/service-fundamentals.ts` — delivery fundamentals and completion classification.
- `server/services/commission.ts` — server-side commission resolution.
- `server/routes/payments.routes.ts` — cart fee preview, checkout claims, payment authorization, fee composition, deposits.
- `server/services/checkout-claim.service.ts` — provisional booking claims and promotion.
- `server/services/trip-plan.service.ts` — canonical Trip Slip/Plan Card assembly and live booking overlays.
- `server/routes/plancard.routes.ts` — Plan Card API.
- `server/routes/routing.routes.ts` — routing transition authority, including checkout-owned purchase transitions.
- `client/src/lib/trip-slip.ts` — trip mint preconditions and client Trip Slip entry behavior.
- `server/services/ready-made-purchase.service.ts` — paid plan cloning.
- `server/routes/booking-actions.ts` — booking acceptance/action lifecycle.
- `server/services/ready-made-purchase.service.ts` — ready-made custody and the buyer-owned clone (the
  single store lane). **Amended 2026-09-11:** this line previously cited the `expert_templates` /
  `template_purchases` sections as "ready-made marketplace custody"; that lane is retired and holds
  historical rows only.
- `shared/impact-class.ts` — what a listing does to a plan (`impactClassFor`), derived and never stored.
- `shared/content-cta.ts` — the content-type → button map.
- `shared/schema.ts` `resolveBookingMode` — the booking-mode authority the null column defers to.

Existing audit and policy evidence:

- `docs/audits/booking-custody-map.md`
- `docs/audits/experts-services-structure-audit.md`
- `docs/planning/PROVIDER_SIGMA_BRIEF.md`
- `docs/DECISIONS.md`
- `CLAUDE.md`

---

## 22. Definition of done for the future contract

The offering model is coherent when:

1. every active seller-specific purchasable listing resolves to exactly one matrix row; catalog vocabulary rows alone are not purchasable listings;
2. the same resolver controls discovery actions, checkout, completion, and Slip projection;
3. no display label or seller role privately selects money behavior;
4. every charge and external handoff has explicit custody;
5. every traveler obligation has an honest projection and status;
6. planning recommendations remain distinct from purchases;
7. historical purchases retain their original terms;
8. refund and settlement behavior follows custody and fulfillment evidence; and
9. the full archetype test matrix passes without legacy fallbacks for newly activated listings.
