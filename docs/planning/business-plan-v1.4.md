# TRAVELOURE BUSINESS PLAN
## Version 1.4 — Pre-Launch Rebuild on the Ratified Model

**Document Version:** 1.4
**Date:** September 17, 2026
**Status:** Draft for decision-maker review. Supersedes v1.3 (January 2025) §2.3, §3.3, §4, §6.4 and §7; retains v1.3 §5.2–5.4 (insurance tiers, verification, code of conduct) and §6.7–6.13 (market prioritization and the launch blueprint) as forward-looking plans.
**Classification:** Confidential Business Plan
**Launch status:** **No market is live.** Every market, provider count and revenue figure in this document is a plan, not a result.

### How to read this document

Every capability carries one of four tags:

| Tag | Meaning |
|---|---|
| **Live** | On `main` today, behind no flag, with a file path named. |
| **Built, gated** | On `main`, behind a flag or a date; the gate is named. |
| **Planned** | Not built; named as a build lane with its ratification needs. |
| **Contingent** | Depends on a partner, counsel or a ruling that has not happened. |

Every price and rate is a configuration row, never a literal in code. The row key is named beside each figure; the authoritative list is `docs/design/PRICING_AND_FEATURE_MAP.md` (ratified August 27, 2026) and the migrations under `server/migrations/`.

### What changed since v1.3, in one table

| v1.3 said | v1.4 says | Why |
|---|---|---|
| "Airbnb for travel expertise"; a tours marketplace | "Plan the trip a local would take" — yourself, with AI, with a local, or done for you | Ratified positioning, `PRICING_AND_FEATURE_MAP.md` §1 |
| $19.99 / $39.99 discount-club memberships = 75% of Year-1 revenue | Dropped. Trip Pass $19 per trip, Plus $25 per year, Pro $29 per month | Ledger `2026-08-27-plus-no-discounts`, `2026-08-27-two-calendars` |
| Credit packages, 45-day cash-flow advantage, credit accounting | Dropped. Credits and wallets are retired (HTTP 410) | Locked Decision 43(b) |
| $9/month Power Pass (June 2026 brief) | Not in the ratified ladder; not sold | `PRICING_AND_FEATURE_MAP.md` §2 |
| Stripe Treasury, QuickBooks chart, three named banks, money-transmitter licences | Stripe holds the vault; the platform holds no customer funds; no MTL claim | Locked Decision 43(b); §10 below |
| Amadeus as a live integration | Dropped (ledger row 34, August 2026) | `CLAUDE.md` LD 44(b) |
| Year-1 revenue $955K, break-even month 11 | Rebuilt: three scenarios, base case an operating loss before engineering | §9 below |
| "Lower commission than competitors (20–25% vs 30%+)" | Stated fully: earner commission by band **plus** a traveler service fee of 7% capped at $25 | Ruling `2026-09-02-traveler-fee-applies-everywhere` |
| Recruitment via Typeform, Slack, Zapier, Airtable | In-product application wizards, handle claims, neighbourhood claims with an evidence test | Locked Decisions 27, 36, 40 |

---

# PART I — FOUNDATION

## 1. Executive Summary

Traveloure is a planning platform for trips and occasions in eight launch cities. A traveler builds a plan on one surface — the slip — and chooses how it gets built: alone, with AI, with a named local expert, or done for them by a planner and providers. The platform earns when something is booked or when AI does paid work; it does not sell discounts, credits or access.

**Two calendars, one product.** Trips are episodic and sold per trip (the Trip Pass). Occasions — birthdays, anniversaries, date nights, proposals, celebrations in the city you live in — recur and are sold annually (Plus). The supply side — local experts and service providers — uses the platform weekly and is sold monthly (Pro).

**Three parties.** Travelers plan and book. Local and travel experts advise, re-route and take over plans, paid by commission on their own services. Service providers (drivers, photographers, hosts, guides, venues) list and are booked, paid by commission by risk band.

**Where we are.** The platform is built and pre-launch. The eight operating markets are declared in code (`shared/operating-markets.ts`): Mumbai, Bogotá, Goa, Kyoto, Edinburgh, Cartagena, Jaipur, Porto. No market has recruited its provider network or taken a paying booking. The next two phases are provider recruitment and demand generation, exactly as v1.3 §1.5 described them; v1.4 corrects what the platform will charge and what it will earn while doing so.

**The five ideas this version adds** (researched September 2026; each is a section below):

1. **One catalog, many sources** — partner inventory that offers no booking API is brought into Traveloure's own catalog through the partner's sanctioned feed where one exists, with a link back to the product, so a traveler never has to search several websites to build one plan. §4.
2. **Logistics on every item** — location, duration, meeting point and hours travel with the item onto the plan and the map, so the AI and the expert can sequence it. §4.
3. **Trending content with a source link** — the measured trend engine says why a place is trending and where that came from. §5.
4. **The booking agent and its fee** — a traveler hands the plan's partner items to a booking agent by buying a Booking Concierge service; the platform earns the Booking Concierge fee on top and the commission on the service. §6.
5. **Share → duplicate → book** — a shared plan or ready-made trip becomes the recipient's own plan in one action, drawn on a journey map. §7.

**Financial headline (§9).** On the ratified fee ladder and v1.3's own market sequence, the base case for Year 1 is roughly $216K of platform-rail GMV plus $71K of affiliate GMV, $55K of platform revenue, and an operating loss of about $95K before engineering. v1.3's $1.2M GMV target implied 5 to 27 bookings per provider per month from the launch month; the base case assumes 1.5. Reaching the old target is a demand problem, not a pricing problem, and this document does not claim it.

## 2. What Traveloure Is

### 2.1 The slip: one planning surface — Live

Every plan lives on the slip (`/plans/:tripId`). It is minted by one planning modal with five steps — Occasion, Where, When, Who, What's happening — reachable from every door on the site (Locked Decisions 33 and 42). Every add surface — Discover, a service page, a ready-made trip, the AI draft — writes into the same store of plan items; the cart is a status on those items, not a second store (Locked Decision 39).

### 2.2 Four ways to build — Live / Built, gated

| Way | What happens | Who pays what |
|---|---|---|
| **Plan it yourself** | Browse, add, book now. Free AI sketch on an empty slip (Locked Decision 41). | Traveler service fee on bookings |
| **Plan with AI** | Optimize (three versions around an anchor) and paid AI tasks; every AI write is a proposal the traveler applies (Locked Decision 45). | $5.99 per run (trip/experience), $19.99 (event); $2.99 per task; or the Trip Pass |
| **Plan with a local** | A named expert takes the slip: reviews, re-routes, endorses, books what needs a human. | Expert's own price; platform commission by band |
| **Done for you** | Event or complex trip coordinated end to end. | Quoted; 20% deposit; coordination fee max($499, 8% of budget) |

### 2.3 The consoles — Live

Travelers get one spine (My plans) with Home owning the time axis (Locked Decision 45). Experts get a Workstation for assigned plans, a storefront at `/s/:handle`, and a catalog of their own services. Providers get a catalog with a map view, availability, a money station and link analytics. Admins get the review queues, fee-band editor, reconciliation views and market-launch tooling.

### 2.4 Occasions and Plus — Built, gated

Plus members register the dates that recur; fourteen days before each one, a draft plan arrives from their home city on the existing AI rail (Locked Decision 26). The scheduler, the idempotent draft ledger and the email exist. **Plus is not on sale** until a draft fires end to end in a stocked home market (`PLUS_SALES_ENABLED`, default off).

### 2.5 Ready-made trips — Live

An expert publishes a plan they have built as a purchasable listing. A buyer pays the list price and receives their own editable copy of the plan, on placeholder dates, with nothing booked. The author is paid by the ready-made band. §7 extends this into the share loop.

## 3. Business Model and Pricing

All figures are ratified rows (`docs/design/PRICING_AND_FEATURE_MAP.md`, August 27, 2026, amended September 2). The pricing page reads them; the fee resolver reads them; this document cites them.

### 3.1 The traveler ladder

| Tier | Includes | Price | Row | Status |
|---|---|---|---|---|
| Plan it yourself | slip, browse, book now, ready-made trips, guest draft | free | — | Live |
| Plan with AI (pay per use) | optimization run; AI Concierge task | run $5.99 trip/experience, $19.99 event; task $2.99 | `optimization_fees` via `getFee`; `concierge:ai_task` | Live |
| Trip Pass | unlimited runs and AI tasks on one plan; one expert revision; traveler service fee waived on that plan's bookings | $19 per trip | `plans.trip_pass` | Built; checkout lane starts 2026-10-01 |
| Plan with a local | a named expert takes the plan | expert's price, commission by band | expert bands | Live |
| Done for you | planner plus providers, end to end | quoted; deposit | `concierge:done_for_you_deposit_pct` 20% | Live (coordination rail) |

**Pricing logic, ratified:** per-use is the anchor and the pass is the value. Per-use stays low so the first paid action is a curiosity purchase; the pass is offered at the second paid action on a plan with three numbers shown (this action per use, the pass, the fee waiver on the current cart). Per-use prices are never raised to push the pass.

### 3.2 Plus — the occasions membership

$25 per year (`plans.plus_annual`). Home city plus an occasion calendar; a draft plan before each occasion; priority response from a retained expert (the expert's time still priced by the expert); 48-hour early access to occasion inventory; four AI tasks a month beyond the scheduled drafts. Cost to serve is estimated at $3–7 per member per year. Success metric: bookings per member per year, target three or more; reviewed at twelve months. **Not a discount club: no member pricing.**

### 3.3 Pro — the supply-side membership

$29 per month (`plans.pro_monthly`), **free during beta until December 31, 2026**, price shown struck through. One-band commission step-down, a neighbourhood demand view, priority in the feed anchor slot, early listing of occasion inventory, storefront analytics. One row changes at the date; nothing is built then.

### 3.4 Fees per event

| Revenue event | Payer | Rule | Row | Value |
|---|---|---|---|---|
| Traveler service fee | traveler | on every platform booking; waived under Trip Pass and on provider-attributed short-link bookings | `traveler:service_fee_pct`, `traveler:service_fee_cap_cents` | 7%, cap $25 |
| Provider commission, tiered | provider | by insurance / risk band | `limited` / `moderate` / `commercial` / `premium` | 12% / 8% / 6% / 4% |
| Provider commission, beta | provider | active policy during beta | `beta_flat` | 10% |
| Provider commission, rails | provider | own-sourced via short link; repeat pairs | `provider:rails_rate` | ~8%, admin-set |
| Expert commission | expert | standard split | `expert_standard` | 25% (expert keeps 75%) |
| Expert commission, beta cohort | expert | admin-flagged beta experts | `expert_new` | 15% (expert keeps 85%) |
| Affiliate commission | partner | per partner, received from the partner's report | `affiliate:<partner>` | seeded 4–12%, **confirm per contract** |
| Optimization run | traveler | per run | `optimization_fees` | $5.99 / $19.99 |
| AI Concierge task | traveler | per task, charged on apply | `concierge:ai_task` | $2.99 |
| Booking Concierge fee | traveler | on top of an expert's Booking Concierge service price; live band uncapped, ratified cap $40 awaits its reader | `expert_concierge_booking`; `concierge:booking_pct`, `concierge:booking_cap_cents` | 5%, cap $40 |
| Done-for-you deposit | traveler | % of quote at acceptance | `concierge:done_for_you_deposit_pct` | 20% |
| Event coordination fee | client | greater of a floor or a share of the event budget; the $19.99 event run is credited against it | `coordination_floor`, `coordination_percent` | $499 / 8% |
| Ready-made trip | buyer | list price; platform share by the author's band | `ready_made_trip` | inherits |
| Trip Pass / Plus / Pro | as above | | `plans.*` | $19 / $25 / $29 |

**How the traveler fee and the commission combine.** On a $100 provider booking under the beta band, the traveler pays $107, the provider receives $90 and the platform keeps $17. On a $100 expert service at the standard band, the traveler pays $107, the expert receives $75 and the platform keeps $32. v1.3's "lower commission than competitors" claim is restated on this full basis in every external document.

### 3.5 Revenue lines that were dropped, and why

- **Discount-club memberships** ($19.99 / $39.99). Discounts are a commodity; the proprietary asset is the expert relationship and accumulated local knowledge. Dropped in v1.3's own annotation and confirmed by the August 27 ruling.
- **Credits.** The credit system charged money and delivered nothing (`docs/backoffice/REVENUE_MODEL.md` F2). Retired; the tables return 410.
- **The $9 Power Pass.** Priced in June 2026, never sold, not in the August ladder.
- **International transfer fees, API partnership fees, data resale.** Not claimed. Data licensing is $0 until counsel clears the terms (`docs/ops/counsel-draft-data-resale.md`).

---

# PART II — DISTRIBUTION, CONTENT AND THE AGENT

## 4. Distribution

Traveloure has four demand channels. Two exist today, two are the new bets. None is paid acquisition; the paid-acquisition budget is a decision for the first market's launch review, not a line in this plan.

### 4a. One catalog, many sources — Live, extended — Planned

**The idea.** Partners such as GetYourGuide do not give Traveloure a booking API. Their inventory should still appear in Traveloure's own catalog, with a link back to the product on the partner's site, so the traveler builds one plan in one place and the booking agent (§6) can complete the purchase. The value to the traveler is not having to search several websites; the value to Traveloure is that every such item is on a plan we hold.

**What the research found.** Two of the partners without an open API have terms that decide the method. GetYourGuide's partner terms prohibit automated extraction of its content and prohibit redistributing platform content, and its API is granted by traffic and booking volume. Klook's API is likewise tiered by volume. Scraping either would forfeit the affiliate relationship the link-back depends on (§6.2 sets out why partners enforce this). The rest of the market is more open than "no API" suggests:

| Partner | Sanctioned data route | Coordinates | Booking route today |
|---|---|---|---|
| Viator | affiliate API, Basic access at signup, no approval; product content carries a `logistics` object with meeting point and coordinates | yes | affiliate link; Full + Booking on certification (§6.5) |
| Tiqets | self-service API token for affiliates; content and availability APIs at signup; booking API by performance (~200 orders a month) | yes | affiliate link |
| Fever | full product catalogs through Impact (already read by the platform) | partial | affiliate link |
| WeGoTrip, Stasher | product feeds with coordinates (already ingested) | yes | affiliate link with attribution token |
| Travelpayouts network | Viator deals feed, Tiqets offers file, JSON data files | partial | affiliate links |
| GetYourGuide | partner portal links and widgets; API by volume | — | affiliate deep link |
| Klook | affiliate links and widgets; API by volume | — | affiliate deep link |

**Where Traveloure stands — Live.** One catalog table (`affiliate_products`) already holds partner items with price, city, coordinates, duration, images and the product link, registered with a Traveloure tracking number. Feed ingestion already fills it from Tiqets, Viator, WeGoTrip, Stasher and the two hotel deep-link builders. A scraper exists for partners without a feed, driven from the admin console, egress-guarded, extracting fields with an AI model and deduplicating on the product URL. Two rulings already govern scraped content: a scraped item resolves its booking path in strict order — a live Traveloure provider first, then the partner's own channel, then a recognised marketplace, then reference-only — so scraped content never competes with a provider on the platform; and a scraped booking link becomes a call to action only when it is the operator's own verified domain or a recognised catalog match.

**Where it falls short.** The scraper checks no robots.txt (the flag exists but nothing reads it) and asks for no coordinates. The catalog has no meeting-point or opening-hours columns. Coordinates reach a plan item only through the AI grounding step, not when a traveler adds an item from Discover, which drops the catalog reference entirely. The optimizer sequences only Traveloure's own provider listings, so partner items are placed but never re-ordered.

**The plan.**

| Build | What | Ratification |
|---|---|---|
| Feeds first | Viator product content and Tiqets content API replace search-page deep links for those partners; Fever and Travelpayouts feeds kept; every item carries its source and link back | none |
| GetYourGuide and Klook | deep links until the platform's volume qualifies for their APIs; applications re-opened at that threshold | ruling — amends the August 2 directive that pursued Musement only |
| Scraping, narrowed | reserved for operators' own sites (with their consent or open terms) and for sources whose terms allow it; robots.txt enforced by code, not a flag; the scraped operator list doubles as the recruitment lead list for that market | none |
| Logistics columns | meeting point, opening hours and a last-verified timestamp on the catalog row | ruling — schema |
| Lossless add-to-plan | adding a partner item from any surface carries its catalog reference and coordinates onto the plan item, through the one item-write path | none |
| Sequenceable partner items | partner items join the optimizer's catalog beside provider listings, labelled by source | ruling — the optimizer reads provider listings only today |

**Discoverability hygiene** (a small, separate item): the public sitemap lists only static pages, services, ready-made trips and storefronts; widening it to city pages and published content, and adding structured data to the public routes, is low-cost search work with no schema change.

### 4b. An agent surface — Planned (Wave 3)

Agents such as Grok Bot, Claude and ChatGPT speak the MCP protocol. A read surface that lets an agent search Traveloure's catalog and stage items onto a signed-in traveler's plan, with the traveler applying and paying, fits the ruling that agents build and stage while humans pay (Locked Decision 45). Letting an agent mint the plan itself needs a ruling, since only doors on the site mint today. This is sequenced after the catalog work in 4a, which it depends on; Tavily is the platform's own reading tool and plays no part in it.

### 4c. Share → duplicate → book — Planned (§7)

A traveler who receives a shared plan or a ready-made trip makes it their own in one action and books through Traveloure. §7.

### 4d. Supply recruitment — retained from v1.3 §6.9

The four-week market launch system — market intelligence, localization, outreach, orientation, launch — is retained as the operating playbook. What changed: applications are in-product wizards, not Typeform; storefront handles are claimed by the earner, never generated; a local expert's neighbourhood knowledge is a claim ratified by admin against typed evidence (Locked Decision 27); and Pro is free to every approved earner until December 31, 2026. Per-market investment ($2,500–$5,500) and the 20–30 providers per market target are retained in §8.

## 5. Content and Trend Intelligence

### 5.1 What exists — Live

A measured trend engine (`server/services/trend-engine/`) computes a trend score per operating market from four free, open-licence sources — Wikimedia pageviews, GDELT news, Nager.Date holidays, Open-Meteo weather — plus the platform's own trip volume, against a 90-day baseline and a seasonal calendar. Each score records why it moved and which sources contributed. Three licensed sources (BestTime, PredictHQ, X counts) are wired but disabled and marked `licensed_no_resale`. Spend per source is capped and the source halts at its ceiling.

The TravelPulse city pages travelers see today carry Grok-generated city intelligence, not measured data; the audit of August 16, 2026 says so and the render surfaces that showed an "active travelers" number were suppressed for that reason.

### 5.2 Trending content with a link to the source — Planned

**The idea.** Match what is trending against the content index so a traveler sees *trending content* — the place, the event, the gem — with a link to where the signal and the content came from.

**Where it stands.** The join exists only at city grain and only at render time: a Discover stub can read "Kyoto is trending · Gion Matsuri approaching". No gem, DMO place or service is matched to a trend entity. Every DMO place already carries its source URL, but a click on it is not tracked; only affiliate clicks are.

**The plan.**

| Build | What | Ratification |
|---|---|---|
| Surface the why | `whyText` and `contributingSources` from `trend_scores` reach the city page and the Discover stub with the source named | none |
| Item-grain resolution | gems, DMO places and services resolve to trend entities (the resolver already seeds Kyoto neighbourhoods and gems); scores at item grain | brief (trend engine Phase 4) |
| Source-click tracking | one click endpoint for non-affiliate source links, on the `affiliate_clicks` pattern, so a source that drives plans is measurable | none |
| Signal capture | site search and gem views are not captured today; both are prerequisites for an internal-demand signal | brief (trend engine Phase 3.1) |

**What may be claimed.** Measured trend signals from open sources at market grain, today. Item-level "trending" and any use of licensed sources in a resold product may not be claimed until the builds above land and counsel has cleared resale terms.

## 6. The AI Booking Agent

### 6.1 The ruling — Locked Decision 44, September 5, 2026

The platform's booking agent is the AI copilot first; a human or a partner API makes the purchase; browser control is read-only. The copilot researches (Tavily and partner availability APIs), verifies price and availability, resolves ambiguities with the traveler, prepares an exact purchase packet and drafts the confirmation. Humans see only requests that are ready to buy or flagged. "Booked" is said only with a confirmation in hand.

### 6.2 Why the bot does not press "buy" on a partner's site

This is not only a house rule. Four external facts bind it:

1. **The commission is forfeited.** Travelpayouts' network terms prohibit unauthorized software interacting with advertiser sites; Viator's affiliate terms exclude affiliates from managing the booking process, with commissions withheld and accounts removed for breaches. A bot-completed affiliate purchase is the traffic these programs void.
2. **Partners litigate and block.** Ryanair sued Booking.com for automated bookings on its site; a Delaware jury found a Computer Fraud and Abuse Act violation in 2024, reversed in 2025 only because provable loss fell under the $5,000 statutory floor, after four and a half years of litigation. Booking sites also run bot detection, so headless purchases fail unpredictably and a retry can double-book with no confirmation to prove it.
3. **Someone's card gets typed.** If the traveler's, Traveloure stores card data and moves from Stripe's short PCI questionnaire (SAQ A) to the ~400-question SAQ D. If Traveloure's own, the platform fronts the money, becomes reseller of record with chargeback and refund liability, and likely triggers seller-of-travel registration in several US states (counsel to confirm).
4. **The industry has built the other road.** Mastercard Agent Pay, Visa Intelligent Commerce, Stripe's Shared Payment Tokens and Google's AP2 (donated to the FIDO Alliance in April 2026, over 60 partners aligned) let an agent purchase with credentials the merchant accepts. That is the sanctioned bot purchase.

### 6.3 What is built — Live

- The request rail: a traveler asks the booking agent to handle a partner item; the request is born unclaimed; an agent claims it (atomic, first claim wins); a verification step reads the partner page and reports price, availability, cancellation terms and a verdict; the agent opens the partner page through a gated, attributed redirect that never exposes the affiliate URL; the agent records the purchase as `purchased_by_human`; `confirmed` is written only when the partner's own report is matched by attribution token.
- Attribution: a per-request token rides the outbound link and is read back from the partner's commission report, so a confirmed booking links to its request and its plan.

### 6.4 The booking fee — Live, and how the hand-off earns it

The established fee is the **Booking Concierge fee**. An expert offers a "Booking Concierge" service — "I'll book this off-site item and add it to your trip" — as an approved listing at their own price. When a traveler buys it at checkout, the platform adds a 5% fee on top of that price (`expert_concierge_booking`, ratified display name "Destination Concierge booking fee — powered by local experts") and takes its normal commission on the expert's price. The partner item itself is still paid on the partner's site by the human who presses buy; the platform never takes that payment, so no affiliate purchase creates a platform charge (Locked Decision 43(c)).

That is the revenue design for the hand-off: **handing the plan's partner items to a booking agent is the purchase of a Booking Concierge service.**

| Path | Who completes the purchase | Where the item's money runs | Platform revenue | Status |
|---|---|---|---|---|
| Platform inventory (provider services) | the traveler at checkout, from a plan the agent staged | Traveloure checkout | commission by band + traveler service fee | Live |
| Partner item, human-facilitated | the booking agent, on the partner's page, through the attributed redirect | partner | Booking Concierge fee 5% on the service price + commission on the service; partner commission on report | Live fee; hand-off wiring Planned |
| API partner | the agent, end to end, through the partner's booking API with a real confirmation id | partner as merchant of record, or Traveloure as merchant at a net rate | facilitation fee on the facilitated amount; partner commission where applicable | Contingent — 6.5 |
| Agentic payment rails | the agent, with a network-issued agent credential the merchant accepts | network token; Stripe SPT | as API partner | Contingent — 2027 |
| Browser automation | the agent drives the partner's checkout | — | — | **only with that partner's written consent recorded in the ledger** (LD 44(d)) |

**What must be built.**

| Build | What | Ratification |
|---|---|---|
| Hand-off creates the requests | buying a Booking Concierge service for a plan creates one booking-agent request per partner item on that plan and lands them in the pooled queue; today the purchase rail and the request rail do not meet | none |
| The cap | the August ruling caps the fee at $40 (`concierge:booking_cap_cents`); the live band is uncapped and the ratified rows have no reader; give them their reader and retire the duplicate key | none (punch-list item) |
| Platform-run concierge | a platform-owned Booking Concierge listing for a market where no expert offers one, so the pooled queue can be sold before an expert network exists | ruling — the offering is expert-owned by design |
| Queue completeness | the pooled queue gains the verify control the ruling calls for, and the copilot's research and packet (Phase 1) | brief |

### 6.5 The first API partner — Contingent

Viator's affiliate program has a "Full + Booking" access level: a real booking endpoint (`/booking/book`), Viator as merchant of record and customer-service owner, a hold endpoint to lock price and availability, and a certification pass in sandbox before production. The affiliate is responsible for passing the traveler's payment information to Viator in a PCI-compliant way — which is the PCI exposure in 6.2(3) unless a hosted or tokenized handoff is used. Viator's Merchant API is the alternative shape, with Traveloure as merchant and Viator paid a net rate.

This is the first concrete candidate for Locked Decision 44's Phase 2, whose open question Q7 ("which partner is first?") had no answer. The steps: apply for Full + Booking; design the payment handoff with counsel and Stripe; certify; then build the client. No speculative partner client is built before that.

### 6.6 Agents as customers — Contingent

xAI's Grok Bot (beta, August 2026) and its peers run a browser and speak MCP. Pointed at Traveloure's agent surface (§4b), an agent is a customer of the same rails as any traveler: it searches, stages, and hands the human the pay step. Using one to drive a partner's checkout is browser automation and stays under the last row of 6.4 until a partner consents in writing or the agentic payment rails cover that partner.

## 7. Ready-Made Trips and the Journey Map

### 7.1 What exists — Live

- **Purchase and clone.** A buyer's payment claims the purchase atomically and clones the listing's items into a new plan owned by the buyer: title, day, times, place, coordinates, costs, notes and expert notes travel; booking state, absolute dates, private notes and unit counts do not. Placeholder dates are flagged as placeholders.
- **Sharing.** A plan has a public share link (money redacted for non-owners), a shareable itinerary variant with KML and GPX export, share images in feed, story and route formats, and earner short links with click analytics and earnings by source.
- **Maps.** A server-rendered teaser map on every ready-made listing with stops jittered until purchase and a per-day distance legend drawn only from real transport legs; Leaflet maps on service, catalog and workstation surfaces; a Google map on the plan card with day tabs and a dashed sequence connector.

### 7.2 Make it mine, and book it — Planned

**The gap.** A viewer of a shared plan has no "make this my plan" action.

**The plan.** On the shared-plan and shared-variant pages, a signed-in viewer mints their own plan through the one mint door, copying items with the same allowlist the ready-made clone uses; dates stay placeholders; items whose provider services are approved are offered for booking on the new plan. No schema change. **The person who shared the plan is not paid** — sharing is a courtesy of the product, not an earning channel, and the purchase table's unused attribution column stays unused.

### 7.3 The journey map — Live, extended — Planned

The journey map is the existing route frame and teaser map: located stops in sequence, straight dashed connectors labelled as sequence rather than routing, distances only from real legs, no map at all when nothing is located, OpenStreetMap attribution wherever it renders.

**"An outline around the places the plan explores."** The chosen reading is the areas the plan's stops fall in. The honest geometry available today is a neighbourhood's centre and radius (`city_neighborhoods` holds no polygons); the only polygons in the system are parks and water from the market extract. The plan:

| Build | What | Ratification |
|---|---|---|
| Neighbourhood rings | for each neighbourhood a located stop resolves to, draw its ring on the journey map with its name — a ring, labelled as such, never presented as a boundary | none |
| Boundary extract | extend the market extract to pull OSM administrative or place boundaries per neighbourhood and store them beside the ring; outlines replace rings where a boundary exists | decision-maker (schema column on `city_neighborhoods` or `market_geography`) |
| Explored later | a "visited" fact exists only in browser storage today; outlining what a traveler actually explored needs a server-side fact and is not in this plan | separate ruling |

The vector-tile interactive map remains parked (Locked Decision 20); the journey map is server-rendered SVG and Leaflet.

---

# PART III — EXECUTION

## 8. Market Entry

### 8.1 Why these eight, and why in this order — retained from v1.3 §6.7

The competitive-gap thesis stands: the local-expert model has the strongest fit where language, safety and cultural barriers are high and where the incumbents' pre-booked-activity model is thin. The June 2026 reframe added a second reason: each of the eight is an established destination-wedding or event location, so the occasion calendar has demand in every one.

### 8.2 The sequence — forward-dated

Month 1 is the month of the first launch, not a calendar month. Provider targets and investment are v1.3's, retained.

| # | Market | Launch month | Providers (experts / providers) | Investment | Regional manager |
|---|---|---|---|---|---|
| 1 | Mumbai | 1 | 30 (17 / 13) | $5,000 | India |
| 2 | Bogotá | 2 | 25 (15 / 10) | $4,000 | Colombia |
| 3 | Goa | 4 | 20 (13 / 7) | $3,500 | India |
| 4 | Kyoto | 5 | 25 (19 / 6) | $5,500 | Japan |
| 5 | Edinburgh | 7 | 20 (14 / 6) | $3,000 | UK |
| 6 | Cartagena | 8 | 25 (15 / 10) | $4,500 | Colombia |
| 7 | Jaipur | 10 | 20 (13 / 7) | $3,500 | India |
| 8 | Porto | 11 | 20 (13 / 7) | $3,500 | Portugal |

Total: 185 providers, $32,500 in launch investment, five regional managers hired at each region's first launch.

**Launch readiness is measured, not asserted.** The admin market checklist reports per market whether geography is extracted, neighbourhoods seeded, lodging with coordinates approved, DMO content visible and a content source kit registered (`docs/MARKET_LAUNCH_CHECKLIST.md`). Kyoto is the most complete market on every one of those checks and is where the content and trend systems were proven; the first paying launch is a decision-maker call between Kyoto's readiness and Mumbai's gap thesis.

### 8.3 The four-week launch system — retained from v1.3 §6.9

Week 1 setup, week 2 outreach, week 3 orientation, week 4 launch. The playbook text stands in `docs/planning/business-plan-v1.3.md` §6.9 with the corrections in §4d above.

## 9. Financial Model — Year 1, Rebuilt

v1.3's Year-1 projection ($955K revenue, break-even in month 11) rested on a membership that no longer exists and on GMV targets that were never derived from a booking rate. This section rebuilds Year 1 from the ratified fee rows and v1.3's own market sequence. The model is a short script, `docs/planning/business-plan-v1.4-model.py`, committed beside this document; running it regenerates every table in this section from the assumption table.

**Definitions.** Year 1 is the twelve months from the first market launch. Platform-rail GMV is provider and expert bookings paid through Traveloure. Affiliate GMV is paid to the partner and appears here only through the commission the partner reports.

### Scenario results (Year 1, 12 months from first launch)

| Line | Low | Base | High | Source of the rate |
|---|---|---|---|---|
| Platform-rail GMV (provider + expert bookings) | $99,788 | $216,169 | $465,525 | AOV × bookings (assumption) |
| Bookings (platform rail) | 881 | 1,901 | 4,080 | assumption |
| Plans created | 588 | 951 | 1,632 | bookings ÷ bookings-per-plan (assumption) |
| Provider commission | $6,985 | $15,132 | $30,259 | `beta_flat` 10% (mig 033) |
| Expert commission | $4,490 | $9,728 | $24,440 | `expert_new` 15% (mig 033) |
| Traveler service fee | $5,937 | $12,105 | $24,440 | `traveler:service_fee_pct` 7% cap $25 |
| Optimization runs | $704 | $1,993 | $4,888 | `optimization_fees` $5.99 |
| AI Concierge tasks | $176 | $568 | $1,464 | `concierge:ai_task` $2.99 |
| Trip Pass | $558 | $1,806 | $4,651 | `plans.trip_pass` $19 |
| Booking Concierge fee (5% on the expert's facilitation price) | $29 | $119 | $367 | `expert_concierge_booking` 5% (mig 066) |
| Commission on Booking Concierge services | $88 | $356 | $1,102 | `expert_new` 15% (mig 033) |
| Affiliate GMV (partner-collected) | $24,675 | $71,297 | $182,784 | assumption |
| Affiliate commission received | $1,974 | $5,704 | $14,623 | `affiliate:<partner>` 8% — unverified per contract |
| Pro subscriptions | $3,296 | $7,018 | $11,092 | `plans.pro_monthly` $29 from month 3 |
| **Platform revenue** | **$24,238** | **$54,530** | **$117,326** | sum of fee lines |
| Regional managers (5, by region, hired at first launch in region) | ($102,000) | ($102,000) | ($102,000) | assumption |
| Market launch investment (v1.3 §6.8) | ($32,500) | ($32,500) | ($32,500) | assumption |
| AI model spend | ($206) | ($333) | ($571) | assumption |
| Stripe processing (absorbed) | ($3,158) | ($6,839) | ($14,724) | assumption |
| Tavily cap | ($1,800) | ($1,800) | ($1,800) | assumption |
| Hosting | ($6,000) | ($6,000) | ($6,000) | assumption |
| **Operating result before engineering** | **$-121,425** | **$-94,942** | **$-40,269** | revenue − costs |
| Blended take on all GMV | 19.5% | 19.0% | 18.1% | derived |

### Per-market platform-rail GMV (Base)

| Market | Launch month | Providers at target | AOV (assumed) | Year-1 bookings | Year-1 GMV | v1.3 target | v1.3 target implies bookings / provider / month |
|---|---|---|---|---|---|---|---|
| Mumbai | 1 | 30 | $90 | 518 | $46,575 | $150,000 | 4.6 |
| Bogotá | 2 | 25 | $85 | 394 | $33,469 | $120,000 | 5.1 |
| Goa | 4 | 20 | $95 | 255 | $24,225 | $130,000 | 7.6 |
| Kyoto | 5 | 25 | $180 | 281 | $50,625 | $200,000 | 5.6 |
| Edinburgh | 7 | 20 | $150 | 165 | $24,750 | $180,000 | 10.0 |
| Cartagena | 8 | 25 | $140 | 169 | $23,625 | $150,000 | 8.6 |
| Jaipur | 10 | 20 | $100 | 75 | $7,500 | $140,000 | 23.3 |
| Porto | 11 | 20 | $120 | 45 | $5,400 | $130,000 | 27.1 |

### Assumptions (every one is tunable; none is a fee row)

| Assumption | Low | Base | High |
|---|---|---|---|
| Share of plans that buy a Booking Concierge service | 0.05 | 0.1 | 0.15 |
| Expert's Booking Concierge price (USD) | 20 | 25 | 30 |
| Bookings per active provider per month | 0.75 | 1.5 | 3.0 |
| Months for a market to reach its provider target | 3 | 2 | 1 |
| Bookings per plan | 1.5 | 2.0 | 2.5 |
| Paid optimization runs per plan | 0.2 | 0.35 | 0.5 |
| Paid AI tasks per plan | 0.1 | 0.2 | 0.3 |
| Trip Pass attach rate per plan | 0.05 | 0.1 | 0.15 |
| Affiliate bookings per plan | 0.3 | 0.5 | 0.7 |
| Affiliate booking value | 140 | 150 | 160 |
| Share of platform bookings that are expert services | 0.3 | 0.3 | 0.35 |
| Share of bookings with the traveler fee waived (Trip Pass / rails) | 0.15 | 0.2 | 0.25 |
| Share of active providers on Pro once billing starts | 0.1 | 0.2 | 0.3 |
| AI model cost per plan | $0.35 | same | same |
| Tavily spend | $150/mo cap (`TAVILY_MONTHLY_CAP_USD`) | same | same |
| Hosting | $500/mo | same | same |
| Pro billing starts | month 3 (assumes first launch ≈ Nov 2026; `beta_free_until` 2026-12-31) | same | same |
| Regional manager cost per month | India $1,500 · Colombia $2,000 · Portugal $3,000 · UK / Japan $4,000 | same | same |
| Plus revenue | $0 — `PLUS_SALES_ENABLED` is off until a draft fires end-to-end in a stocked market (LD 26) | same | same |
| Engineering, product and founder cost | not modelled — outside the operating model | same | same |

### Reading the numbers

- **v1.3's targets implied a booking rate nobody had stated.** At the AOVs above, $150K of Mumbai GMV from 30 providers over twelve months is 4.6 bookings per provider per month from the first month; Porto's $130K over two months is 27. The base case assumes 1.5, which v1.3's own orientation script ("first booking usually within 2–3 weeks") supports better than 5.
- **Year 1 is an investment year on every scenario.** The base case loses about $95K before engineering; the high case about $40K. The largest cost is people, not technology: five regional managers are $102K, AI spend is under $1K.
- **The blended take is 18–19% of all GMV**, in line with v1.3's 20% assumption, because the traveler fee sits on top of the earner commission.
- **What moves the result is volume per provider and the event lane, not price.** Each coordinated event adds max($499, 8% of budget) — $800 on a $10,000 event, $2,000 on $25,000 — and none is in the model because no coordinator network exists yet. Ten Kyoto or Cartagena weddings at $25,000 add $20,000 of coordination fees plus the vendor commissions underneath. The June 2026 reframe's thesis — that the event lane carries the platform — is a hypothesis this model does not yet support with a row; it is the first thing to measure in the first market.
- **Plus is $0** until it delivers (Locked Decision 26). **Pro** contributes from month 3 at the assumed take-up because beta pricing ends December 31, 2026.
- **Affiliate commission is the least certain line.** The 8% band is seeded with "confirm per contract" on every row and no partner report has yet been reconciled.
- **The Booking Concierge fee is small at 5% of a $20–30 service; the commission on the service is the larger half.** The line exists to show the shape, not to carry the year: it grows with the number of partner items per plan, which is what §4a's catalog work drives.

### What the decision-maker is asked to set

1. The first launch month and market (§8.2).
2. Whether the committed model script becomes the versioned source for future projections, and who owns its assumptions.
3. The paid-acquisition budget for the first market, absent from this model.
4. Whether engineering cost enters the operating model.

## 10. Compliance and Risk

Replaces v1.3 §4.5 (international banking) and §5.1 (money transmission). Retains §5.2 insurance tiers, §5.3 verification and §5.4 the code of conduct.

- **Money.** Stripe holds the vault. The platform stores a Stripe customer id and nothing else; no card data, no customer funds, no wallet. Every charge derives its amount from the server-side record and its actor from the session; every money movement is idempotent by an atomic claim and a Stripe idempotency key; a daily reconciliation job detects drift and repairs nothing on its own. No money-transmitter licence is claimed or needed on this posture; counsel to confirm per jurisdiction before any wallet-like product returns.
- **PCI.** SAQ A by construction. The API-partner path in §6.5 is designed with counsel and Stripe so that posture holds.
- **Seller of travel and package travel.** The done-for-you and API-partner paths may bring Traveloure within US seller-of-travel registration (California, Florida, Washington, Hawaii) and the EU Package Travel Directive. Flagged for counsel before the first API-partner booking.
- **Affiliate compliance.** No automated conversions; attributed, gated redirects only; a bot never completes a partner purchase (§6.2).
- **Content licensing.** DMO and open-data attribution obligations travel with every row; OpenStreetMap attribution renders wherever its geometry does; content with unknown licence is never exposed to agents; data licensing is $0 until counsel clears terms.
- **Privacy.** Public payloads never carry a user's internal id; earners are addressed by handle; conversations are opened by context, never by a counterpart id (Locked Decision 40). Guest data (emails, dietary notes) is owner-tier only.
- **AI honesty.** No surface states a number the platform did not measure; AI-generated content is labelled; the AI never invents availability, price or policy — null with a reason.
- **Insurance and verification.** v1.3 §5.2's four tiers map to the provider commission bands; verification and background checks follow §5.3 and remain an operating cost per market, not a platform feature.

## 11. Roadmap

Lanes are sequenced in the wave grammar the architecture rules use; each lane appends its own ledger row. Lanes marked *ruling* need a decision-maker decision before build.

| Wave | Lane | From | Schema / ruling |
|---|---|---|---|
| 0 | Memberships checkout: Stripe products for Trip Pass, Plus, Pro; subscription webhook writes `plan_memberships` | ratified, starts 2026-10-01 | none |
| 1 | Viator product-content and Tiqets content-API ingestion replace search deep links; robots.txt enforced in the scraper | §4a | none |
| 1 | Lossless add-to-plan for partner items | §4a | none |
| 1 | Hand-off creates booking-agent requests from a Booking Concierge purchase; the $40 cap reader | §6.4 | none |
| 1 | Surface `whyText` and sources on the city page; source-click tracking | §5.2 | none |
| 1 | "Make this my plan" on shared pages | §7.2 | none |
| 1 | Neighbourhood rings on the journey map | §7.3 | none |
| 1 | Sitemap widening and structured data | §4a | none |
| 2 | Logistics columns on the catalog row (meeting point, hours, last verified) | §4a | *ruling* (schema) |
| 2 | Partner items in the optimizer catalog | §4a | *ruling* |
| 2 | Platform-owned Booking Concierge listing | §6.4 | *ruling* |
| 2 | Re-open GetYourGuide and Klook API applications at the volume threshold | §4a | *ruling* (amends the Aug 2 directive) |
| 2 | Booking agent Phase 1: copilot research/prepare on the pooled queue; inbox verify control; purchase packet carrier | §6, LD 44 | *ruling* (packet carrier) |
| 2 | Item-grain trend resolution; search and gem-view capture | §5.2 | brief |
| 3 | Agent surface (MCP): search + stage; mint by agent | §4b | *ruling* (mint) |
| 3 | Viator Full + Booking: application, payment handoff design with counsel, certification, then the client | §6.5 | *contingent* |
| 3 | Neighbourhood boundary extract | §7.3 | *ruling* (column) |
| 3 | Agentic payment rails (Stripe SPT / Agent Pay / AP2) | §6.4 | *contingent* |
| held | Browser-driven purchase on a partner site | §6.4 | partner written consent + ruling |
| held | Vector-tile interactive map | LD 20 | parked |
| held | Plus on sale | LD 26 | draft fires end-to-end in a stocked market |

## 12. Appendices

### Appendix A — Fee rows cited in this document

| Key | Type | Value | Where seeded |
|---|---|---|---|
| `expert_standard` | percent (platform take) | 0.25 | migration 033 |
| `expert_new` | percent | 0.15 | migration 033 |
| `beta_flat` | percent | 0.10 | migration 033 |
| `limited` / `moderate` / `commercial` / `premium` | percent | 0.12 / 0.08 / 0.06 / 0.04 | migrations 033, 259 |
| `affiliate:<partner>` | percent | 0.08 (0.06 air/hotel) | migration 033 |
| `traveler_service_fee` (`traveler:service_fee_pct`, `_cap_cents`) | percent, cap | 0.07, 2500 | migration 258 |
| `optimization_fees` | flat | 5.99 / 19.99 | migration 076 |
| `concierge:ai_task` | flat_cents | 299 | migration 258 |
| `expert_concierge_booking` (Booking Concierge fee, live) | percent | 0.05, uncapped | migrations 064, 066 |
| `concierge:booking_pct` / `concierge:booking_cap_cents` (ratified cap, no reader yet) | percent / flat_cents | 0.05 / 4000 | migration 258 |
| `concierge:done_for_you_deposit_pct` | percent | 0.20 | migration 258 |
| `coordination_floor` / `coordination_percent` | flat / percent | 499.00 / 0.08 | migration 122 |
| `ready_made_trip` | percent | inherits author band | migration 133 |
| `plans.trip_pass` | per trip | 1900 cents | migration 258 |
| `plans.plus_annual` | per year | 2500 cents | migration 258 |
| `plans.pro_monthly` | per month | 2900 cents, `beta_free_until` 2026-12-31 | migration 258 |

### Appendix B — Sources consulted for this version

Repository: `docs/design/PRICING_AND_FEATURE_MAP.md`; `docs/briefs/MUSEMENT_INTEGRATION_BRIEF.md`; `docs/PUNCHLIST.md`; `docs/backoffice/REVENUE_MODEL.md`; `docs/planning/business-plan-delivery-map.md`; `docs/design/AI_BOOKING_AGENT_BRIEF.md`; `docs/MONEY_MAP.md`; `docs/MARKET_LAUNCH_CHECKLIST.md`; `TREND_ENGINE_PHASE0_FINDINGS.md`; `BUSINESS_MODEL_REFRAME_CORRECTION_BRIEF.md`; `research/traveloure_bp_reframed_analysis.md`; `CLAUDE.md` Locked Decisions 20, 22, 26, 27, 33, 39, 40, 41, 42, 43, 44, 45.

External (September 2026): Tavily documentation and product notes (search, extract, crawl; no publisher program); xAI Grok Bot announcement and third-party breakdowns (August 2026 beta; browser and MCP); Viator Partner Resource Center — affiliate API levels of access, basic-access product content with logistics, and certification; GetYourGuide partner terms and API access requirements; Tiqets affiliate API token and API programme pages; Klook partner programme; Impact partner catalog documentation; Travelpayouts day-tours data and network terms; Bloomberg Law and the Technology & Marketing Law Blog on *Ryanair v. Booking.com*; Forbes and Payments Dive on Mastercard Agent Pay, Visa Intelligent Commerce, Stripe agentic commerce and AP2; PCI SAQ scoping guidance for travel businesses.

### Appendix C — v1.3 sections and their disposition

| v1.3 section | Disposition in v1.4 |
|---|---|
| 1 Executive Summary | rewritten (§1) |
| 2.1–2.2 Core concept, three-party structure | rewritten (§2) |
| 2.3 Revenue streams | superseded (§3) |
| 3.1 Expert service tiers ($25–$300/hr) | retained as guidance for expert pricing; not platform-set |
| 3.2 Provider categories | retained; the taxonomy of record is the `service_categories` registry |
| 3.3 Service tiers and pricing | superseded (§3.4) |
| 4.1–4.3 Hybrid payments, Stripe, credits | superseded (§3.5, §10) |
| 4.4–4.6 QuickBooks, banking, revenue recognition | dropped |
| 4.7 Financial model impact | superseded (§9) |
| 4.8 Fee architecture and admin controls | fulfilled; the fee-band editor and grep gate exist |
| 5.1 Regulatory compliance | superseded (§10) |
| 5.2–5.4 Insurance, verification, conduct | retained |
| 6.1–6.6 Operations, recruitment, KPIs, timeline | retained with §4d corrections; timeline re-dated (§8) |
| 6.7–6.13 Market prioritization and blueprint | retained (§8) |
| 7 Appendices | superseded (§12) |
