# Lane B — Company and Support page copy

Draft for review. Sourced from the business plan (v1.3 market rationale, v1.4 pricing model), the ledger rulings R154/R156/R157/R163/R166, and the project's own history. Anything in [BRACKETS] is a fact I could not confirm and you must supply. Numbers marked (fee_bands) must be rendered from the constants, never typed.

Facts used, for your check:
- Traveloure LLC, a Florida limited liability company, founded 2023, headquartered in West Palm Beach, FL. No founder or officer is named on public pages for now.
- Eight beta markets: Kyoto, Edinburgh, Porto, Bogotá, Cartagena, Mumbai, Goa, Jaipur. Kyoto first.
- Five roles: travelers, local experts, trip planners, service providers, executive assistants.
- Pricing per business plan v1.4: Trip Pass sold per trip; Plus sold annually; Pro sold monthly to the supply side, free through 31 Dec 2026. Traveler service fee 7% of the booking, capped per booking. First AI draft on an empty plan is free; later AI tasks are charged. No memberships, credits or wallets.
- Cancellation tiers per Terms §8 and R166: Flexible / Moderate / Strict / Non-refundable; the service fee refunds at the same percentage as the booking; provider- or expert-initiated cancellations refund 100%.
- Contact for everything (support, press, careers): Admin@traveloure.com.
- Do NOT reuse the 2025 FAQ draft's numbers (25% expert commission, 4–12% provider tiers, membership subscriptions, "launching Q1 2025"). Those predate v1.4 and are wrong.

---

## /about

**Eyebrow:** ABOUT TRAVELOURE

**H1:** Any experience. Anywhere. Planned like a local.

**Lead**
Most of what a search engine knows about a city was written by people who visited once. Most of what's worth knowing is held by people who live there and were never asked. Traveloure asks them.

**Why it exists**
You tell us the occasion and where in the world you want it. We build the plan around that place, then hand the parts that matter to someone who lives there: the reservation that sells out by noon, the temple before the coaches arrive, the vendor who has worked that room before. The plan is yours to edit; the judgment is theirs to lend.

**Who's involved**
- **Travelers** plan a five-day trip or a single evening from one place, with the hotel, the venue or the table as the anchor everything else is measured from.
- **Local experts** live where you're going and check the plan against what they know. They set their own offerings and prices.
- **Trip planners** take the whole thing off your hands, from first draft to the last booking.
- **Service providers** are the drivers, photographers, caterers, guides and venues you book through the plan, with the terms shown before you commit.
- **AI** does the legwork: it drafts, compares options by how they fit your plan, and keeps the schedule honest. It never has the last word on what's good; a local does.

**Where we are**
Traveloure is in beta in eight cities, chosen because they're the places where local knowledge changes the trip the most: Kyoto, Edinburgh, Porto, Bogotá, Cartagena, Mumbai, Goa and Jaipur. Kyoto is first. Markets open as local experts join them; we don't show a city as live until real people are behind it.

**Company**
Traveloure LLC is a Florida company, founded in 2023 and based in West Palm Beach.

*Last updated: [DATE]. This page changes as markets open.*

---

## /press

**H1:** Press

**Boilerplate** (approved for quotation)
Traveloure is a planning platform where travelers describe an occasion and a place, and get a plan built around that place and checked by someone who lives there. It connects travelers with local experts, trip planners and service providers in eight cities across Asia, Europe and Latin America. Traveloure LLC was founded in 2023 and is based in West Palm Beach, Florida.

**Facts**
- Founded: 2023
- Headquarters: West Palm Beach, Florida, USA
- Markets (beta): Kyoto, Edinburgh, Porto, Bogotá, Cartagena, Mumbai, Goa, Jaipur
- Roles on the platform: travelers, local experts, trip planners, service providers, executive assistants
- Model: pay-per-use planning (a Trip Pass per trip; Plus for occasions; Pro for professionals), plus a service fee on bookings. No memberships, credits or wallets.
- Site: traveloure.com

**Press contact**
Admin@traveloure.com. We reply within two business days.

**Assets**
- Logo (SVG, PNG) [FILES]
- One product image: the planning slip, Kyoto [FILE — after Track A step 1]

**Coverage** — section hidden until there is any.

---

## /careers

**H1:** Careers

We're a small team and we're not hiring for salaried roles right now.

When we do, the first roles will be market leads in our eight launch cities and traveler support. If that's you, write to Admin@traveloure.com with the city and one paragraph on why you'd be good at it; we keep every message and answer each one.

If you live in one of our cities and want to work with travelers now, that's a different door: **Become a local expert →** /earn?role=local_expert

---

## /help — article system

Slug per article, searchable, and linkable from inside the app. Articles 5, 7 and 8 render their numbers from constants (fee_bands, the cancellation tier table) and carry a test that fails if the article and the constant disagree.

### 1. how-planning-works — How planning works
You start with two things: the occasion (a trip, a wedding, an anniversary dinner, one of 28) and where in the world you want it. From that we create a plan built around one anchor: your hotel for a trip, the venue for an event, the table for an evening. The plan is a list of days and items you can add to, move and remove. Our AI drafts the first version for free on an empty plan. A local expert can check it, add to it or take it over. When you're ready, you finalize the plan and book the items you want, either through us or on your own.

### 2. what-a-local-does — What a local expert does (and doesn't)
A local expert lives in the city you're planning for. They can review your plan and tell you what to change, add their own suggestions, recommend one option over another when you're comparing, and offer their own experiences to book. They can't change what you've purchased, and they don't choose for you: when you're comparing hotels or venues, the choice is yours. Experts are verified before they appear on Traveloure and are paid only for what they offer or deliver.

### 3. comparing-options — Comparing hotels, venues and restaurants
Open a comparison on any slot in your plan and add up to three candidates. We show each one's fit to your plan: how far it is from everything else you've planned, by walking or transit, plus price, rating and cancellation terms. Choose one and it becomes the item; the others are kept as candidates. You can't finalize a plan with an open comparison, and an item you've already booked can't be put into one.

### 4. free-vs-paid — What's free and what's paid
Free: creating a plan, the first AI draft on an empty plan, comparing options you've picked yourself, suggestions, and everything a local expert offers to review at no charge. Paid: an AI optimization run, which produces three complete versions of your plan (best value, least travel, best fit) that you can adopt in whole or part; a Trip Pass covers this. Additional AI tasks after the first draft are charged per task. Bookings are priced by the person offering them, and carry the service fee in article 5.

### 5. trip-pass-and-fees — Trip Pass, Plus, and the service fee
**Trip Pass** is bought once per trip and covers the AI optimization run and [WHAT ELSE IT ENTITLES — from fee_bands]. Price: (fee_bands: trip_pass).
**Plus** is an annual plan for people planning occasions through the year. Price: (fee_bands: plus_annual). While Plus isn't on sale, this line reads "coming soon".
**Pro** is for local experts, planners and providers; it's free through 31 December 2026.
**Service fee:** when you book through Traveloure, a service fee of (fee_bands: traveler_service_fee_pct)% is added to the booking, capped at (fee_bands: traveler_service_fee_cap) per booking. You see it on your plan and in the cart before you pay. Trip Pass holders don't pay the service fee on bookings from the plan the pass covers.
**AI task fee:** after the free first draft, each further AI task on a plan is (fee_bands: ai_task_fee), shown before you confirm.

### 6. booking-through-us — Booking through Traveloure vs. on your own
Every item on your plan can be booked through Traveloure or noted as booked elsewhere. Booking through us means one checkout, the service fee in article 5, our cancellation terms in article 7, and a booking a local expert can see and act on. Booking on your own means none of that, and the item still sits in your plan so the schedule stays right. Some items can't be booked through us yet (a listing without a published price, or one that needs the provider to accept first); those show "Back to plan" instead of a checkout.

### 7. cancellations-and-refunds — Cancellations and refunds
Each service shows its cancellation policy before you book. When you cancel, the refund depends on that policy and how long remains before the scheduled start:
- **Flexible:** 100% at least 24 hours before; 0% after.
- **Moderate:** 100% at least 5 days before; 50% from 48 hours to 5 days before; 0% inside 48 hours.
- **Strict:** 50% at least 7 days before; 0% after.
- **Non-refundable:** no automatic refund; contact support about an exception.
The percentage applies to the amount charged, including Traveloure's service fee, refunded at the same rate as the booking. Payment-processing costs are never deducted. Fees your bank charges (foreign transaction, currency conversion) aren't charged by us and aren't refunded by us. If the expert or provider cancels, you're refunded in full. The cancellation screen shows the exact amount before you confirm, and it is the amount you receive. Refunds go to the original payment method and usually appear within 5–10 business days.

### 8. payment-didnt-go-through — Payment didn't go through
If your card is declined, the booking isn't made and the item shows "Payment didn't go through." Tap **Try again** to put it back in your cart and check out with a new payment; the declined attempt is cancelled so it can't charge you later. If you leave checkout without paying, we release the hold after 30 minutes and the item goes back to your plan unbooked. If a payment was started but never completed, we check with your bank and clear it within a day, and we'll email you if the item was released. If a declined payment somehow goes through afterwards, we refund it automatically and tell you. Items that can't be booked through checkout show "Back to plan" instead.

### 9. disputes-and-under-review — "Under review" and disputes
If you dispute a charge with your bank, the booking shows **Under review** while the dispute is open. Money is held; the booking still exists until the dispute closes. If the dispute is decided in your favour, the booking shows **Dispute closed – refunded to you**. If you have a problem with a booking, contacting us first is faster than a bank dispute, and a booking we've already refunded or cancelled can't be disputed again.

### 10. become-a-local-expert — Becoming a local expert
If you live in one of our cities, you can offer what you know: reviewing travelers' plans, suggesting what to change, and selling your own experiences. You set your prices and availability. We verify you before you appear, and you're paid through Stripe when what you offer is delivered. Pro is free through 31 December 2026. Start at /earn?role=local_expert.

---

## In-app links (build note)
- "Payment didn't go through" note → /help/payment-didnt-go-through
- Cancel dialog → /help/cancellations-and-refunds
- Fee line on the slip and cart → /help/trip-pass-and-fees
- "Under review" badge → /help/disputes-and-under-review
- Compare view empty state → /help/comparing-options
