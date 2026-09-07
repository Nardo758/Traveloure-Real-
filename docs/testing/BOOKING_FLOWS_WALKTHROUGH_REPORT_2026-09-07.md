# Booking Flows Walkthrough — Findings Report

**Environment:** Replit dev preview — `https://796e6056-bc9f-472e-ba38-753fa8c7073d-00-9qqxl5xr9s8v.riker.replit.dev`
**Date:** September 7, 2026
**Method:** Live click-through via Claude in Chrome, one row per persona per the dispatch brief. No purchase, hire, or message was completed — every flow was stopped at the last screen before Pay / Send / Confirm, per the stop rule.

**Note on screenshots:** Screenshots were captured and visually verified for every row during the session, but the browser-automation sandbox this walkthrough ran in does not expose those images to this report's file system, so they could not be embedded or attached as image files. Every finding below instead quotes exact button labels/copy and the exact URL, per the brief's "quote, don't paraphrase" rule, so each claim is independently reproducible.

## Row 1 · Guest · `/services` → a service

**URL:** `/services` → `/services/5ba29608-9184-47e4-a4dd-264184d0cb6b` (Kyoto Dawn Temple Private Tour)

1. **What kind of thing:** listing (provider/expert-sold — "Book on Traveloure" + "Direct Booking: you're booking directly with the provider").
2. **Button labels:**
   - Card: **"Book now"**, **"Add to Plan"**, and a text link **"Ask an expert"**.
   - Detail page: **"Book on Traveloure"** (primary), **"Add to Cart"**, **"Contact Provider"**.
3. **What I was asked:** Nothing about a plan. No time/slot picker — the page states *"No availability published yet for this month. Contact the provider to check dates"* with an optional *"Or request a date & time"* field. No party size asked.
4. **Where it landed:**
   - Card **"Book now"** does not book — it navigates to the service **detail page** (i.e., it behaves like "View details", not "Book").
   - Detail-page **"Book on Traveloure"**, **"Add to Cart"**, and **"Contact Provider"** all open the same **"Sign in to continue"** modal for a guest. None of the three completes any action or mentions a plan.
5. **What was invented or hidden:**
   - **Bug:** the guest's homepage "Your Trip" banner ("Your New York City Date Night") silently pre-fills the `/services` **"Where are you going?"** filter with **"New York City"** on every fresh load of `/services`, which returns **"No services found"** with no indication that a stale filter is the cause — a guest arriving fresh at `/services` sees an apparently-broken/empty marketplace until they manually clear a filter they never set. Reproduced twice (direct nav and after login/logout).
   - Card CTA says **"Add to Plan"**; the detail page's equivalent CTA says **"Add to Cart"** — inconsistent labeling for what looks like the same action.

Screenshots: 6 (captured, not embedded — see note above)

---

## Row 2 · Guest · expert storefront

**URL:** `/experts` (search "Gion" → 1 match) → `/s/kyoto-gion-expert` (Mika Fujita, Local Expert)

1. **What kind of thing:** expert (local expert storefront); 2 offerings listed as direct-bookable services.
2. **Buttons:** header — **"Message @kyoto-gion-expert"**, **"Share"**, **"Start a plan"**; per-offering — **"Request to book →"**; footer callout — **"Start a conversation"**.
3. **What I was asked:** nothing about a plan when I first opened "Start a plan" — it silently reused an existing plan (see below) instead of asking whether to create a new one or which expert to attach it to.
4. **Where it landed / what it did:**
   - **"Message @kyoto-gion-expert"** → gated behind the same **"Sign in to continue"** modal as Row 1.
   - **"Start a plan"** → **not gated**. It opened a "Where is it happening?" step of the guest's pre-existing **"Your New York City Date Night"** plan wizard (title bar: *"YOUR NEW YORK CITY DATE NIGHT"*), pre-filled with **"New York City"** as the destination — despite this being Mika's **Kyoto/Gion** storefront. Nowhere in that wizard is Mika, Gion, or "expert" mentioned.
5. **What was invented or hidden:**
   - **Bug/gap:** "Start a plan" is not scoped to the expert at all — no association is made between the plan and the expert being viewed, and no warning is shown even though the tool itself says *"A vendor outside this city is flagged when you add it to the plan"* (a Kyoto expert against an NYC plan is exactly that case, yet nothing was flagged at this step).
   - No "hire" or "plan with [expert]" button exists in this build; the closest equivalents are the generic "Start a plan" (unscoped) and per-offering "Request to book" (direct booking of a specific service, not an advisor engagement).
   - This confirms the brief's premise partially: an advisor-join flow does exist conceptually ("Start a plan"/"Request to book"), but it does **not** require a plan to already exist first for a guest — it will silently create/reuse one — which **contradicts** the brief's known-fact #2 ("requires a plan to exist first").

Screenshots: 4

---

## Row 3 · Guest · `/ready-made` → a plan, buy up to payment

**URL:** `/ready-made` → the "Kyoto: a slower, better long weekend" plan page (1 of 4 ready-made plans in this dataset, one per theme chip)

1. **What kind of thing:** ready-made — "A complete, thoughtfully built plan for Kyoto — ready to become your own editable trip," built by @kyoto-local, "Local perspective · fixed plan."
2. **Buttons:** **"Get this trip"** ($149.00, one-time purchase), **"Copy trip link"**, **"Start a plan"**.
3. **What I was asked:** nothing — no date, party size, or "which of your plans" question is asked before checkout.
4. **Where it says the plan lands:** explicit and clear, unlike Rows 1–2 — the sales copy states directly: *"Unlocked means fully yours. After checkout, the complete plan is copied to your Trip Slip. Re-date it, edit every item, and book from your own trip"* and lists *"Keep it in your Trip Slip"* as a benefit.
5. **What was invented or hidden / stop condition:** Guest checkout has **no payment screen to reach at all** — clicking "Get this trip" does not advance to any Stripe/payment step; instead a corner panel appears: *"Sign in to buy this trip — You need an account so the trip can be copied into your plans."* This is itself a finding per the brief's rule 2: there is no pre-Pay screen for a guest on this flow, sign-in is the wall. (Note this sign-in prompt renders as a small inline panel, not the full-screen modal used in Rows 1–2 — a second, inconsistent sign-in UI pattern.)

Screenshots: 3

---

## Row 4 · Guest · `/cart`, then sign in

**URL:** `/cart`

1. **What kind of thing:** the guest cart itself (Cart → Optimize → Itinerary → Payment stepper), titled "Your Cart / Date Night."
2. **Buttons:** **"Browse Services"** (empty state), **"Sign in to book"** (banner link), stepper tabs Cart/Optimize/Itinerary/Payment.
3. **What I was asked:** nothing — banner reads *"Build your plan first — no account needed. Sign in to book."*
4. **What was in it after rows 1–3:** **nothing — the cart was empty.** None of the guest CTAs pressed in Rows 1–3 (Book on Traveloure, Add to Cart, Contact Provider, Start a plan, Get this trip) actually added anything; each was blocked by a sign-in wall before any write happened. This is a clean, consistent result.
5. **Signed in now (as `test-traveler-edinburgh@traveloure.test`, a brand-new account with zero plans) — what happened to the cart:**
   - Sign-in **did not return me to `/cart`**; it redirected to a completely different authenticated **dashboard shell** (left sidebar: Home / My Plans / AI planner / Discover / Experts / Bookings / My events / Trip Cart / Inbox / Profile) showing *"Welcome back, Edinburgh"* and **"No active plans — Start planning your first experience."**
   - The guest's **"Your New York City Date Night" trip banner disappeared from the dashboard's own plan list** (0 active plans) — but clicking the sidebar's **"Trip Cart"** link lands back on the old marketplace-style `/cart` page, which **still shows the "Your New York City Date Night · 2 travelers" banner** at the top, cart still empty.
   - **Bug/inconsistency:** the guest "Your Trip" banner is tracked independently of the signed-in account's real plans. After login, the top banner and the authenticated dashboard **disagree** about whether a trip exists — one says there's a 2-traveler New York City Date Night trip, the other says zero active plans. Nothing about the guest session was migrated into the new account either way (no prompt to claim/merge it).

Screenshots: 5

---

## Row 5 · Traveler, no plans (`test-traveler-edinburgh@traveloure.test`) · in_person service

**URL:** `/services/5ba29608-9184-47e4-a4dd-264184d0cb6b` (Kyoto Dawn Temple Private Tour, in_person) → `/cart`

1. **What kind of thing:** listing (provider-sold, direct booking).
2. **Button:** **"Add to Cart"** (same label as guest; "Book on Traveloure" and "Contact Provider" not re-tested here, already covered in Row 1).
3. **What I was asked:** **nothing.** No plan picker (this account has zero plans — dashboard shows "No active plans" — yet the add succeeded instantly with no plan-selection step), no time/slot picker, no party size. A toast confirmed *"Added to cart — Service has been added to your cart"* immediately.
4. **Where it landed:** the same **"Your New York City Date Night"** trip banner from the guest session (title: "Date Night") — i.e., this signed-in, zero-plans account's cart is still keyed to the stale localStorage guest trip, not to any of the account's real Plans. On `/cart`, a banner reads *"Add your travel dates"* with an **"Edit trip"** button — this is the only date-related prompt, and it applies to the whole trip, not this specific in-person booking's slot.
5. **What was invented or hidden:**
   - **Pricing discrepancy worth flagging separately:** cart Order Summary shows Subtotal $120.00, **Platform fee $30.00** (25%), Total $150.00. Leon's Traveloure business plan states the traveler-side fee should be **7%, capped at $25** — a $30 fee on a $120 item is neither 7% nor under the $25 cap. Either this is stale/demo fee logic in this build, or the fee engine doesn't match the documented pricing model — worth a direct check against `server/` fee-calculation code rather than assuming test data.
   - Cart page also surfaces a paid upsell not mentioned in the brief: **"Optimize · $5.99"** ("Preview: up to 21% savings (~$0.25 less), Plan score 15/100") and a separate **"Add to Itinerary"** action — meaning cart items do not automatically become itinerary/trip items; that's a distinct, extra step.

Screenshots: 4

---

## Row 6 · Traveler, no plans · pdf service

**URL:** `/services?q=guide` → `/services/earn-demo-edinburgh-local-service-3` ("Edinburgh Local Guide," pdf, $145, "Delivered Within 48 Hours")

1. **What kind of thing:** listing (provider-sold pdf artifact). Note the URL slug itself is `earn-demo-edinburgh-local-service-3` — a "Ways to Earn" demo-seeded listing surfacing in ordinary marketplace search results alongside real inventory, with no "demo" label shown to the traveler.
2. **Button:** **"Add to Cart"**.
3. **What I was asked:** nothing — identical to Row 5. No plan picker, no delivery-timing question beyond the static "Delivered Within 48 Hours" label on the page.
4. **Where it landed:** same cart, toast **"Added to cart — Service has been added to your cart."**
5. **Difference from Row 5 (in_person):** **none observed.** The add-to-cart flow does not branch on delivery method at all — in_person and pdf behave identically at this step (which is arguably correct, since pdf genuinely has no slot to pick — but it means the "which delivery method needs what input" logic the brief hypothesizes doesn't show up anywhere in the guest/traveler-facing add flow; it may only apply at the provider's listing-creation step, tested in Row 16/17).

Screenshots: 3

---

## Row 7 · Traveler, no plans · expert storefront hire/request

**URL:** `/s/kyoto-gion-expert`, then **Message** → app-shell `/inbox`-style "Expert Chat" page; **Start a plan** → same modal as Row 2.

1. **What kind of thing:** advisor engagement — no "hire" button exists; the two candidates are **"Message @kyoto-gion-expert"** and **"Start a plan."**
2. **Button labels:** **"Message @kyoto-gion-expert"**, **"Start a plan"**, **"Share"**.
3. **What I was asked:** nothing, on either path.
4. **Where it landed:**
   - **"Message"** → a dedicated **"Expert Chat"** screen in the dashboard shell, pre-opened to a thread with Mika ("Mika · Offline," *"Start a conversation — Say hello to Mika and get personalized travel advice!"*, a message box). **"No conversations yet"** in the sidebar confirms nothing is created until Send is pressed (not pressed, per the stop rule) — so a message **can** be initiated with **zero plan**, contradicting the brief's known-fact #2 that joining a plan "requires a plan to exist first."
   - **"Start a plan"** → reproduces the **exact same bug as Row 2**, even though this is now a real signed-in traveler account with zero real plans: it reopens the stale **"Your New York City Date Night"** wizard (localStorage-based), not a fresh plan tied to this account or to Mika/Kyoto.
5. **What was invented or hidden:** confirms Row 2's finding is not guest-specific — the "Start a plan" button is disconnected from both the authenticated account's real plan data (dashboard shows 0 plans) and the expert being viewed, for every persona tested so far.

Screenshots: 4

---

## Row 8 · Traveler with plans (`test-traveler-kyoto@traveloure.test`, 19 active plans) · `/services`

**URL:** `/services/5ba29608-9184-47e4-a4dd-264184d0cb6b`

1. **What kind of thing:** listing (same Kyoto Dawn Temple Private Tour used in Rows 1/5).
2. **Button:** **"Add to Cart."**
3. **Is the target plan shown before/after Add? Can I choose between plans?** **No, on both counts.** Despite this account genuinely having 19 active plans (Tallinn, Ljubljana, Salta, Kyoto, a highlighted Nara trip, etc. — confirmed on `/` dashboard: *"19 active plans · 14 actions needed today"*), Add to Cart never asks which plan the item is for, never shows a plan selector, and the item is not visibly attached to any of those 19 plans.
4. **Where it landed:** the same **global "Your New York City Date Night" banner/cart** seen under the guest and Edinburgh personas — confirming this is **not per-account, per-plan state**. On this account it additionally carries a date range (**Nov 1 → Nov 5**) and, most importantly, **pre-existing items worth $15,274** that were already in the cart before I added anything — i.e., this banner/cart is shared **browser-local** state, not scoped to the signed-in user at all; it is whatever was last left in this browser's storage, regardless of which of the six personas is logged in.
5. **What was invented or hidden:**
   - **Confirmed cross-persona bug:** the "Your Trip" cart/banner is the same object across guest → Edinburgh (no plans) → Kyoto (19 plans) logins in this one browser session. A traveler with real plans has no visible link between "Add to Cart" and any specific plan of theirs.
   - **Minor UI bug:** after this add, the cart's dollar total updated ($15,274 → $15,424, +$150 matching the $120 item + $30 platform fee) but the item-count badge stayed at **"4"** instead of incrementing to 5 — the count and the total desynced.

Screenshots: 3

---

## Row 9 · Traveler with plans · plan slip (`/plans/6ccefaab-edaa-4e29-ad94-9cdb83331109`, "Nara's Sacred Deer & Ancient Wonders," empty planning plan)

**IMPORTANT — this row overturns the simple reading of Rows 5/6/8.** The plan/cart system is not uniformly broken; it is **context-dependent**, and the context only threads correctly through one specific path:

- Slip buttons: **"Browse services for this trip"** (`/services`), **"Optimize this plan,"** **"Hand off to a local expert,"** **"Get the Trip Pass"** ($19), plus **"Send to expert"** and **"Add to checkout"** per line item. There is no button literally labeled "Message" on the slip; the nearest equivalents are "Send to expert" (per item) and "Hand off to a local expert" (whole plan).
- Clicking **"Browse services for this trip"** navigates to `/services?tripId=6ccefaab-edaa-4e29-ad94-9cdb83331109&location=New+York+City` — **the plan ID is correctly threaded as a `tripId` query param**, but the `location` param is wrongly hardcoded to the stale global "New York City" instead of the plan's real destination ("Nara"), which again produces **"No services found."** The top banner also still visually shows "Your New York City Date Night," not "Nara's Sacred Deer" — so nothing about the UI *tells* the traveler they're still plan-scoped.
- Clearing the bad location filter and opening a Kyoto service **while `tripId` is still in the URL** changes the whole detail page: a banner now reads *"Booking for your trip. This goes into your cart scoped to the trip you came from, and the booking is logged onto that trip when you check out. [Back to your plan]"* and the CTA relabels from **"Add to Cart" to "Add to Plan."** This resolves Row 1's "inconsistent CTA label" note — it's not inconsistent, it's two distinct, correctly-differentiated states (generic cart vs. trip-scoped cart) that the UI doesn't otherwise explain.
- Pressing **"Add to Plan"** here correctly triggered the city-mismatch guard promised in the brief: a modal — *"This is in Kyoto. Every event on your plan is in Nara."* — with **"Add anyway," "Add Kyoto as a stop,"** and **"Cancel."** Choosing "Add anyway" **correctly attached the item to the Nara plan**: back on `/plans/...`, "Kyoto Dawn Temple Private Tour" now appears under "Thursday · Oct 1," tagged **PLANNING / YOU ADDED**, with per-item **"Send to expert"** and **"Add to checkout"** actions.
- **Conclusion:** the city-mismatch guard and plan-scoping genuinely work — but only when the traveler reaches `/services` via a link that stamps `?tripId=...` (i.e., "Browse services for this trip" from inside a specific plan). Every other entry point tested (direct `/services` nav, a service permalink, an expert storefront's "Start a plan") drops that context and falls back to the ownerless global cart from Rows 4/5/6/8. The bug isn't "plans are broken" — it's that **most paths into the marketplace never pick up plan context in the first place**, and the ones that don't give zero indication (no plan picker, no "which trip?" prompt) that they've fallen back to an unscoped cart.
- **"Hand off to a local expert"** (whole-plan hire) opens a **"Hire an expert"** modal: *"An expert you choose joins this whole plan — there's no per-event assignment. The event you picked is named in the note they receive. This part of the plan isn't an event, so no roles are suggested for it."* Candidates shown (Yuki Nakamura, Takeshi Yamamoto — both destination-matched to Nara, correctly excluding the Kyoto/Gion experts used elsewhere in this walkthrough) plus an optional note field and **"Send request."** Not sent, per the stop rule. This directly confirms the brief's known-fact #2: an expert genuinely does join at the whole-plan level and a plan must already exist — this modal only exists on a plan's own page.

Screenshots: 7

---

## Row 10 · Traveler, finalized plan (`persona-kyoto-plus@traveloure.test`) · add a service to a final trip

**URL:** `/trip/285682d2-3670-4b47-914a-7eaff8a13486` ("Persona Lane B fixture," badge **FINAL · V2**, 1 day, 3 activities, all itinerary rows marked "Confirmed," one already "IN CHECKOUT")

1. **What kind of thing:** the account's one plan, oddly listed under the **"In planning (1)"** section header on `/my-plans` despite carrying a **"Final · v2"** badge on the card itself — a status-label mismatch between the list-view grouping and the plan's own badge.
2. **Door used:** the trip page's **"COMPLETE YOUR PLAN"** upsell rail (**"Guided City Tour" / "Cultural Class or Workshop" / "Day Trip or Excursion,"** each marked "recommended for this trip type") — clicked **"Guided City Tour."**
3. **What was I asked:** nothing.
4. **Fork a new version, block, or silently edit?** **None of the three.** It did not fork v3, did not block with a message about the plan being final, and did not silently edit the final trip. Instead it navigated to `/services?categoryKey=aff_activities&upsellSource=plancard_pretrip&location=New+York+City&categoryId=...` — **no `tripId` parameter at all** — landing on the same disconnected, ownerless marketplace search seen in every non-`tripId` path, complete with the same stale "New York City" filter and **"No services found."** The `upsellSource=plancard_pretrip` value is itself telling: this upsell rail appears to be coded for a *pre-trip* upsell moment and was reused verbatim on a finalized, 4-days-away trip without adapting the behavior.
5. **What was invented or hidden:** the brief's premise — "Adding to a final plan is supposed to auto-fork the next version rather than block" — could not be confirmed **or** contradicted directly, because the tested door never reaches an add/fork decision point at all; it drops the final trip's identity before any fork-vs-block logic would run. This is arguably a worse gap than either forking or blocking: the traveler gets no signal that their finalized trip was left behind.

Screenshots: 4

---

## Row 11 · Traveler with plans · `/experiences/travel` inquire/request

**URL:** `/experiences/travel` (one of the 8 "curated experience templates" listed at `/experiences`; reached via the homepage's "All occasions →" link, which itself resolves to `/experiences/travel`)

1. **What kind of thing:** an experience-planning wizard (Activities/Hotels/Services/Dining/Flights/Transportation tabs), pre-loaded with **real, live third-party inventory** (New York CityPASS® $149, Statue of Liberty cruise $78.57, etc. — looks like Viator/affiliate content) — again auto-scoped to **"New York City"** from the same stale global trip state seen throughout this walkthrough, not to the signed-in traveler's own Kyoto final trip.
2. **Button:** **"Get Expert Help"** (top bar) — this is the wizard's inquire/request control.
3. **Does it mint a plan first, or send a request with none?** **Neither, cleanly — it's worse than that.** Opening the panel shows **"AI-Matched Experts — Powered by Grok," "5 experts matched for your Travel to New York City,"** each with **Message**/**View Profile** buttons — so far so good, nothing sent yet.
4. **🚩 Major finding:** merely **opening** this panel — no click on Message, no click on any expert, no explicit "share" or "send" action — produced an immediate toast: **"Shared with an expert — Your current plan was sent so an expert can jump right in."** This fired automatically as a side effect of opening "Get Expert Help." I did not message or confirm anything with any expert, per the brief's stop rule, and stopped immediately when I saw it. **This needs engineering verification against server/request logs** — if that toast reflects a real backend call, opening a help panel silently shares the traveler's plan with a matched (real or seed) expert account with no confirmation step at all, which is a different and more serious problem than anything else found in this walkthrough: every other flow at least requires a deliberate click before anything is sent.
5. **What was invented or hidden:** the AI-match ranked a **Kyoto-based expert (Hana Fujimoto, 90% match)** and a **Mumbai-based expert (Rhea Desai, 85% match)** as top matches "for your Travel to New York City" — i.e., the matching itself is scoped to the same wrong NYC context as everything else, yet still surfaces geographically unrelated experts as "Excellent"/"Great" matches.

Screenshots: 3 — **flagged to Leon directly during the session**, not held for this report.

---

## Row 12 · Traveler with plans · `/concierge` and `/concierge?tier=ai`

**URL:** `/concierge` and `/concierge?tier=ai`

1. **What kind of thing:** a three-tier pricing chooser: **Platform Concierge** ($5.99, "AI-assisted, human-backed... free re-runs within 24h"), **Destination Concierge** ("from $115.00, platform fee 25% · expert keeps 75%"), **Full / Done-for-You** ("Quote on request" — honestly disabled here: **"No packages configured for this event type and market yet," "Not available"** button, not faked).
2. **`?tier=ai` behavior:** does **not** pre-select the Platform Concierge tier, does **not** skip the intake form, and does **not** preserve any prior request text/destination. It only adds a static banner: *"Looking for Platform Concierge — powered by our platform? ... Tell us what you want to plan below and pick Platform Concierge."* The query param is decorative copy, not a functional deep link.
3. **Platform Concierge ("Get plan," $5.99) — where AI lands:** the same generic **Cart → Optimize → Itinerary → Payment** stepper used everywhere else in this walkthrough, now showing the plan's real destination ("Kyoto") for once. The cart item ("Fushimi Inari Torii Tunnel at Dawn," from the earlier `/experiences/travel` wizard) is listed at **$0.00** with the note *"Routed from your trip plan — shown for reference only, not included in this checkout total,"* and **Order Summary shows Subtotal $0.00 / Platform fee $0.00 / Total $0.00** — the advertised **$5.99 fee never appears anywhere in the checkout.** Stopped here (still on the Cart step, no Pay screen reached).
4. **🚩 Destination Concierge ("Request expert," from $115) — where Expert lands:** **clicking it immediately produced "Request received — Your request is in. An expert will reach out shortly," with no confirmation, review, or payment screen in between.** I did not intend to submit a live request — I expected a review/payment step first, since this is a priced, expert-facing action, and only saw it had gone through after the click. **This is a stop-rule violation in the brief's own terms** ("Stop and report immediately if a flow would ... notify a real expert ... without a stop screen. Those are findings on their own.") — flagged to Leon directly during the session.
5. **Full/Done-for-You:** correctly inert — "Not available" is a real disabled state, not a fake button, so nothing to report there beyond confirming it's honest about having no inventory.

Screenshots: 5 — **Row 12.4 flagged to Leon directly during the session.**

---

## Row 13 · Traveler with plans (`persona-kyoto-plus@traveloure.test`) · `/ai-assistant` — say a destination/dates, Create this plan, can you get back to the conversation

**URL:** `/ai-assistant` → typed message → **"Create this plan"** → `/plans/839409ae-c8c3-419e-9a83-747a54e964ed` → back to `/ai-assistant`

1. **What kind of thing:** the AI Travel Assistant chat ("AI-assisted, human-backed — our team steps in whenever you need a person"), with a live "Plan draft" sidebar and a header button **"Get help from our team"** (not tested this row — see stop-adjacent note below).
2. **Buttons:** left rail **"+ New"** (new conversation); message input **"Ask me about your travel plans..."** with a send icon; right sidebar **"Create this plan"**; conversation list items reveal a pencil (rename) and trash (delete) icon on hover.
3. **What I typed / was asked:** typed **"Plan a 4-day trip to Lisbon from March 10-14 for 2 people"**. The assistant replied *"Nice! Quick questions to nail this down: What's your vibe?"* with option lists (Chill explorer / Active / Foodie focus / Mix of everything, then a budget-feel list) and a follow-up question about must-dos — i.e. it asks clarifying questions rather than creating the plan from one message, but nothing forces you to answer them: the sidebar and "Create this plan" button are live the whole time.
4. **Where it landed:**
   - Before I answered any of the assistant's clarifying questions, the **"Plan draft"** sidebar had already updated live to **Destination: Lisbon, Dates: Mar 10 – Mar 14, Travelers: 2, Occasion: "Not discussed yet"** — confirming the "fills in as you chat — nothing here is guessed" claim really does update per-conversation (this contradicts my working assumption from earlier rows that it might still show stale prior data; here it correctly reflected the new destination/dates instead of any earlier session's values).
   - Clicking **"Create this plan"** showed a toast **"Trip Created — Your new adventure awaits!"**, then landed on a new plan page titled **"Lisbon Trip,"** tagged **PAST**, dated **"Mar 10 – Mar 14, 2025"** — a full calendar year in the past relative to today (Sept 7, 2026) and also earlier than the March that would next occur. The plan was created with **no items** ("No items on this plan yet").
   - **Bug:** the user never stated a year. The assistant/plan-creation silently defaulted the unstated year to **2025** (already past) rather than the next upcoming March (2027) or asking for clarification — every new AI-created plan from this conversation would land pre-tagged **PAST** on arrival, before the traveler has done anything with it.
   - Getting back to the conversation: the plan page itself has **no link back** to the originating AI chat (scrolled the full right-rail Build/Plan/Share/Finished sections — no "back to conversation" control anywhere). Navigating to **"AI planner"** from the sidebar lands on a **fresh empty "How can I help you today?" composer**, not the prior thread — but the conversation **"Plan a 4-day..." (9/7/2026) is still listed** in the left conversation rail and, once clicked directly (clicking too close to the row's edge instead hit the hover-revealed rename control and opened an inline rename/icon-picker state), it **did reload the full prior exchange** with "Create this plan" still present. So the conversation is reachable, but only by manually reopening it from the list — the app does not carry you there automatically after plan creation, and a slightly mis-placed click opens rename mode instead of the thread.
5. **What was invented or hidden:** the "Get help from our team" header button was visible throughout but not pressed (out of scope for this row's literal instruction); no explicit confirmation step exists between "Create this plan" and the plan actually being created — it fires immediately with only a toast, no review screen, matching the same instant-creation pattern already flagged in Rows 11–12.

Screenshots: 5

---

## Row 14 · Traveler with plans (`persona-kyoto-plus@traveloure.test`) · `/cart` — what's in it, does it match the slip's "in checkout" count, items not on any plan

**URL:** `/cart` → **"Proceed to Payment"** → Payment step (stop screen, not submitted)

1. **What kind of thing:** the same Cart → Optimize → Itinerary → Payment stepper seen in Row 4, now signed in with an active trip banner: **"YOUR TRIP — Lisbon · Mar 10 → Mar 14 · 2 travelers · 🛒 1 · $0."**
2. **Buttons:** **"Edit trip,"** **"Optimize · $5.99 →,"** per-item **"Remove,"** **"Add to Itinerary,"** **"Continue — Optimize,"** **"Proceed to Payment."** On the Payment step: two upsell cards (**"Guided City Tour," "Cultural Class or Workshop"**), a **"Credit / Debit Card — Secure payment via Stripe"** method selector, and **"Complete Booking."**
3. **What was in it — direct contradiction of Row 13's own plan page:** the cart lists **1 item — "Fushimi Inari Torii Tunnel at Dawn"** (a **Kyoto** listing, tag **"From your trip"**), with the line **"Routed from your trip plan — shown for reference only, not included in this checkout total."** But the Lisbon plan created two minutes earlier in Row 13 (`/plans/839409ae-c8c3-419e-9a83-747a54e964ed`) explicitly read **"No items on this plan yet" / "Nothing added yet."** So: the cart's "1 items" badge and the top pill's "🛒 1 · $0" do **not** reflect the Lisbon trip named directly above them in the same banner — they're showing a leftover Kyoto item from a different plan entirely (almost certainly the same global "Your Trip" state bug seen in Rows 1, 4, and 9), mislabeled as belonging to "your trip" (singular, implying the current one).
4. **Does the cart total match what's "in checkout":** yes, trivially — because the one line item present is explicitly excluded from the total, **Subtotal / Platform fee / Total are all $0.00** all the way through to the final "Complete Booking" screen, for a stepper that is otherwise fully populated with a selected payment method and an "Order Review — Qty: 1 — $0.00" line. A traveler could click **"Complete Booking"** on a $0.00 order that both (a) isn't for the trip named in the banner and (b) was already flagged as "reference only, not included."
5. **What was invented or hidden / stop condition:** reached the last screen before submission — **"Complete Booking"** — and stopped there per the brief's rule, screenshotting the state: no Stripe card-entry form (number/expiry/CVC) is rendered anywhere on this screen, only a **"Credit / Debit Card · Selected"** chip with the disclaimer *"Your payment information is processed securely. We do not store your card details."* Whatever real card collection happens is deferred to after this click — this build never shows it. Not pressed.

Screenshots: 6

---

## Row 15 · Traveler with plans · `/bookings` — pick a booking, can you tell which plan/service it belongs to

**URL:** `/bookings` (persona-kyoto-plus: empty; switched to `test-traveler-kyoto@traveloure.test`, which has real booking history)

1. **What kind of thing:** "My Bookings" list with tabs **All (4) / Pending (1) / Active (0) / Completed (3) / Trips (1)**.
2. **Buttons:** per-booking **"Confirm completion,"** **"Dispute,"** **"Review,"** **"Message"** (completed bookings); **"Contract,"** **"Message"** (the pending one); a **"Contact support"** text link; on the Trips tab, **"Something wrong?"** and a **"1 revision available"** chip.
3. **What I was asked / found on `persona-kyoto-plus@traveloure.test` first:** that account (the brief's "finalized version 2" fixture) shows **"No bookings yet — Browse our services and make your first booking"** — zero bookings despite being described as a finalized plan owner. **Absence finding:** a "finalized" plan does not necessarily produce any row in Bookings for that account.
4. **On `test-traveler-kyoto` (19 active plans):** the **All** tab lists 3 **"Completed · Booked on Sep 4, 2026 · $100.00"** cards and 1 **"Payment pending · Booked on Jul 28, 2026 · $99.00 · Notes: bundle qa"** card. **None of the 4 cards names a service, provider, expert, or plan anywhere on the card** — no title, no thumbnail, no "part of [plan name]" link, nothing but status/date/price and action buttons. Clicking the card body (outside a button) does **nothing** — it is not a link, so there is no detail view to open to find out what was actually booked.
5. **What was invented or hidden:** the separate **Trips (1)** tab (a different data source — ready-made-plan purchases, not the service bookings on the All tab) does name what was bought: **"Journey: Store Lifecycle Sold — Kyoto · $99.00 · Purchased,"** which by amount appears to be the same purchase as the "Payment pending · $99.00 · Notes: bundle qa" card on the All tab — but the two views never cross-reference each other (no link either direction), so confirming that match required inference by matching dollar amounts, not anything the UI states. The 3 **$100.00 Completed** bookings remain fully unidentified — there is no way, from this screen, to tell which plan or which of the traveler's 19 active plans (if any) they belong to.

Screenshots: 4

---

## Row 16 · Expert (`persona-gion-expert@traveloure.test`, Mika Fujita) · create-listing form — delivery methods, pricing, booking-mode fields

**URL:** `/provider/services` (direct nav) → **"Access Denied"** → account-menu **"Expert Console"** → `Catalog` → **"+ New Service"** (5-step wizard)

1. **What kind of thing:** a completely separate admin surface ("Expert Console" — Today / Calendar / Inbox / Workstation / Catalog / My Storefront / Local Guides / Neighborhoods / Customers / Performance / Money / AI Assistant / Settings), reachable **only** through the account-menu dropdown (**"My Dashboard"** vs **"Expert Console"**) — not linked from the ordinary traveler sidebar at all.
2. **Buttons/fields on the create-service form:** **"Name it *"** text field; **"I'm writing this in"** language dropdown; **"Category *"** dropdown; **"How do you deliver this? *"** — 7 tiles: **In person** (Place-anchored), **Video call** (Live, remote), **Phone call** (Live, remote), **PDF guide** (Artifact), **Voice notes** (Async lane), **Async messaging** (Async lane), **Hybrid** (In person + video); **"Delivered in (languages)"** checkboxes (English, 日本語, 中文, 한국어, Français, Deutsch, Español, Italiano, Português); **"Price ($) *"** amount + a **"flat price"** type dropdown; **"One line about it"** textarea; a **"Service Tier *"** grid of 16 preset tiers (Ask-Me-Anything Session, Destination Reality Check, Itinerary Second Opinion, AI-Plan Polish, Neighborhood Picker, Budget Optimizer, Restaurant & Reservation Hit-List, Hidden-Gems Shortlist, Tourist-Trap Audit, Packing & Prep Brief, Practicalities Brief, First-Timer Orientation, "Text a Local" Live, Same-Day Rescue/Re-Plan, Spontaneous "What Now?", Real-Time Translation by Text, Reservation-on-the-Fly, Trip Emergency Support); footer buttons **"Cancel," "Save as Draft," "Next: Scheduling."**
3. **What I was asked / directly confirms the brief's core premise:** the form states outright, twice, in its own copy: under the delivery-method tiles, *"The rest of the form is built from this answer — the step list updates the moment you change it,"* and in the left STEPS rail, *"The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard."* **Verified live, not just read:** with **In person** selected, the rail showed **5 steps** (Basics / Scheduling / Capacity / Logistics / Review & submit), captioned *"5 steps for 'In-Person'. Scheduling, Capacity and Logistics are here because this one happens somewhere."* Clicking **PDF guide** instead — without saving or navigating — the rail live-updated to **3 steps** (Basics / What they get / Review & submit), captioned *"3 steps for 'PDF Guide'. No location, transport or travel-surcharge questions in this flow — the Logistics step never appears."* This is the single clearest, most direct piece of evidence in the whole walkthrough for the design brief's "how it's fulfilled" axis actually driving the UI, not just the data model.
4. **Where it landed:** did not submit — left on Step 1 of 3 (PDF guide) after observing the live step-count change; no draft was saved, no listing was created.
5. **What was invented or hidden:** the Expert Console is entirely undiscoverable from the main app chrome — there is no sidebar link, no "Manage my listings" CTA anywhere in the traveler-style shell; a brand-new expert would have to know to open the account-name dropdown and notice "Expert Console" distinct from "My Dashboard." The direct URL guess `/provider/services` correctly 403s with a real **"Access Denied"** page for an expert-role account (not a dead-route app-shell) — that route is provider-only, confirmed properly in Row 17.

Screenshots: 7

---

## Row 17 · Provider (`persona-kyoto-provider@traveloure.test`, Takeshi Ito) · same create-listing form — field differences vs. the expert

**URL:** direct nav `/provider/services` → **"Access Denied"** (stale route from the prior session) → sign-in redirected cleanly to Home → account-menu **"Provider Console"** → `Workstation` → **"Single service" → "Start a service →"** → 5-step wizard

1. **What kind of thing:** a third distinct admin surface, the **Provider Console** (Dashboard / Calendar / Inbox / Workstation / Catalog / **Distribute** / My Storefront / Customers / Performance / **Market Research** / Money / Settings / **Playbook**) — visibly richer than the Expert Console (Row 16), with extra sections (**Distribute**, **Market Research**, **Playbook**) the expert account never had, and missing the expert's **Local Guides**/**Neighborhoods**/**AI Assistant** sections. Same account-menu pattern as Row 16: **"My Dashboard"** vs **"Provider Console."**
2. **Buttons/fields — same wizard shell, four concrete differences from Row 16's expert form:**
   - **Entry point differs:** the provider's "Add New Service" lands on a **Workstation** hub — *"What are you building? Pick a shape to start"* — with **4 choices: Single service, Bundle** ("Two or more of your approved services sold together at one price"), **Property** ("A room, apartment or house with per-night pricing and room availability"), and **Market research** ("See what travelers are asking for — and where you have no bookable slot") — plus quick-start category tiles (Tours & Experiences, Food & Culinary, Photography & Videography, Transportation & Logistics). **The expert's "+ New Service" has none of this — it jumps straight into the wizard**, and the expert account never has access to Bundle or Property listing types at all.
   - **An extra hard gate:** a red banner reading **"Identity & business verification required before publishing — Both identity verification (Stripe Identity) and business verification (Stripe Connect) must be completed first. Complete these steps in your Provider Status page"** sits directly on the Basics step. The expert's equivalent form had no such blocking banner (only a soft "Connect payouts" action item on its dashboard, not on the creation form itself).
   - **An extra required field:** **"What are you offering? *"** — *"Choose an offering — driver, guide, chef..."*, helper text *"Sets your category and links this listing to the /earn catalog. Required before publishing; you can save a draft without one and finish later."* The expert's Basics step has no equivalent field.
   - **A field removed and a whole section removed:** the provider form has **no "Category \*" dropdown** (the expert form had one, separate from delivery method) and **no "Start from a template" gallery** and **no 16-card "Service Tier \*" grid** at the end — the provider's Basics step ends immediately after **Price ($)** / **"One line about it,"** with the identical **"This screen is enough"** footer copy.
   - **Identical between roles:** the **"How do you deliver this? \*"** 7-tile selector (In person / Video call / Phone call / PDF guide / Voice notes / Async messaging / Hybrid) and its live step-count-changes-with-delivery-method behavior (still "5 steps for 'In-Person'" here), the **"Delivered in (languages)"** checkboxes, and the **Price ($) / flat price** fields are byte-for-byte the same UI as the expert's.
3. **What I was asked:** nothing beyond the fields above; did not submit — left on Step 1 with In person selected, no draft saved.
4. **Where it landed:** stayed on the Basics step throughout; not advanced to Scheduling.
5. **What was invented or hidden:** the Provider Catalog list view (`Catalog` in the sidebar) is also a different, richer UI than the expert's plain table — provider listings show a **Live/toggle, "Show on my storefront," per-card "CARD SHOWS: Show price / Booking: Instant | Request | Hidden"** control, an inline **"Availability"** slot editor with real time slots, and a **"Claim your handle"** banner (*"Until you claim one, your page is only reachable by its internal link"*) not present anywhere in the expert flow.

Screenshots: 6

---

## Row 18 · Expert (`persona-kyoto-planner@traveloure.test`, Noah Reed) · `/expert/inbox` and `/expert/workspace` — what arrives from Rows 5–12, is there a per-item "route to expert"

**URL:** `/expert/inbox` → resolves to the Expert Console **Inbox** (Queue / Assigned Trips / History / Messages tabs); `/expert/workspace` → resolves to **Workstation**. Also cross-checked `persona-gion-expert@traveloure.test` (Mika, the expert targeted in Rows 2/11) on the same surfaces, plus her traveler-style **Inbox** and notification bell, since Noah was never the expert those flows were aimed at.

1. **What kind of thing:** a THIRD distinct back-office variant — Noah Reed's badge reads **"Trip Planner,"** not "Local Expert" like Mika's, even though the brief's own credentials table labels both `persona-gion-expert` and `persona-kyoto-planner` simply "Expert." Noah's sidebar (Today/Calendar/Inbox/Workstation/Catalog/My Storefront/**Content Studio**/Customers/Performance/Money/AI Assistant/Settings) differs again from both Mika's Expert Console (Row 16: Local Guides/Neighborhoods, no Content Studio) and Takeshi's Provider Console (Row 17: Distribute/Market Research/Playbook) — **three accounts, three different sidebars**, despite the brief presenting "expert" and "provider" as two roles.
2. **Buttons:** Inbox tabs **Queue / Assigned Trips / History / Messages**; Workstation shows **"Where is this build for? (default: Kyoto)"**, a **"+ New build"** tile, and **"YOUR BUILDS"** listing Noah's one existing approved plan **"Quiet Gion: A Dawn-to-Dusk Kyoto Day — Kyoto · 3-day trip · Store — approved"** with an **"Open →"** link and a **"Store Listings"** link below.
3. **What arrived from Rows 5–12, checked exhaustively:** **nothing, on every surface checked.** Noah's Queue: *"No bookings waiting"* / *"No pending invites."* Noah's Assigned Trips: *"No assigned trips."* Noah's History: **0 Total / 0 Pending / 0 Confirmed / 0 Completed**, *"No booking history yet."* Noah's Messages: *"No conversations yet."* Switching to **Mika Fujita** — the actual expert Rows 2 and 11 interacted with — her Console Queue additionally has two sections Noah's lacks (**"Coordination Engagements"** and **"Agent-Booking Requests"**), both also empty (*"No coordination engagements,"* *"No booking requests"*); her Console Messages: *"No conversations yet."* Her Console notification bell (red-dot badge) does not open any dropdown when clicked — no visible content, not even a "nothing here" state.
4. **Where the Inbox badge that DID show a number actually came from:** Mika's separate **traveler-style "My Dashboard" → Inbox** shows a red **"3"** badge (also mirrored on the top-bar bell). Opening it: **Messages** tab is empty (*"No conversations yet"*), but **Updates (3)** lists three items, all dated **9 days ago** and all mundane system notices unrelated to any traveler flow — *"Your listing was approved"* (×2, for the two Higashiyama/Gion offerings from Row 16) and *"Application Approved! 🎉 — Complete your Stripe Connect setup."* **None of the three is a routed traveler request.**
5. **Direct answer to the brief's question — no per-item "route to expert" mechanism was ever observed reaching any expert inbox:** Row 7's expert-storefront request, Row 11's auto-fired *"Shared with an expert — Your current plan was sent"* toast, and Row 12's $115 Destination-Concierge *"Request received"* booking never surfaced on any of the three checked expert/provider accounts' Queues, Assigned Trips, History, Messages, Coordination Engagements, Agent-Booking Requests, or Updates — across three separate back-office consoles. Either those flows write to a destination this walkthrough could not reach as a client (a specific named expert account not among the four given, an internal ops queue, or nothing at all), or the "share/request" actions in Rows 7/11/12 are cosmetic client-side toasts with no real routing behind them. **This is the single most consequential absence finding in the whole walkthrough** — it directly bears on whether the two stop-condition incidents flagged mid-session (Rows 11 and 12) created any real-world notification, and I could not resolve that question from the client alone; it needs a server/database check on Leon's side.

Screenshots: 8

---

## What the brief missed

### (a) What the walk contradicted

- **The "three questions" premise is one axis short.** What kind of thing / how it's fulfilled / who is buying explains most of the marketplace-facing variation, but Rows 16–18 show a fourth, independent axis: **which back-office role the seller has.** An expert (Mika), a provider (Takeshi), and a second "expert" account that turned out to be labeled "Trip Planner" (Noah) each land in a structurally different console — different sidebars (Local Guides/Neighborhoods vs. Distribute/Market Research/Playbook vs. Content Studio), different create-listing forms (an extra "What are you offering?" field and a hard identity/business-verification gate for providers; a 16-card Service Tier grid and template gallery for experts that providers don't get at all; Bundle and Property listing types that exist only for providers). The brief's credentials table calls both Mika's and Noah's accounts simply "Expert," but the product treats them as different roles.
- **Known-fact #2 ("an expert joins a plan, and that requires a plan to exist first") is only true for one specific door.** It holds exactly as stated for the whole-plan **"Hand off to a local expert"** flow reached from inside a real plan (Row 9). It does **not** hold for **"Start a plan"** from an expert storefront (Rows 2, 7) or for **"Message [expert]"** (Row 7) — both are reachable and actionable with zero plans and no plan-creation step in between; "Start a plan" silently reuses stale browser-local state instead.
- **Delivery method does not branch the buy-side add-to-cart flow at all** (Row 6: in_person and pdf items add to cart identically) — it only branches the **sell-side listing-creation wizard's step count** (Rows 16–17: "How do you deliver this?" regenerates Scheduling/Capacity/Logistics vs. a 3-step flow live, in the UI's own words). A premise that delivery method drives "what input is needed" turns out to be true only on the provider/expert side of the marketplace, not the traveler side.
- **"Adding to a final plan should auto-fork the next version rather than block"** could not be confirmed as the actual behavior — the tested entry point (the finalized trip's own "Guided City Tour" upsell rail) drops the trip's identity entirely before reaching any fork-or-block decision (Row 10), so the premise is neither proven nor disproven, just short-circuited.
- **Cart/checkout totals do not reliably reflect what's actually being bought.** A real, priced listing can sit in the cart at **$0.00** with an explicit "not included in this checkout total" disclaimer while the stepper still offers "Complete Booking" (Row 14); a signed-in account with 19 real plans can have **$15,274 in pre-existing phantom cart items** belonging to no identifiable plan (Row 8); the advertised $5.99 Platform Concierge fee never appears in its own checkout (Row 12.3).

### (b) Controls that exist and the brief doesn't mention

- Three separate back-office consoles (**Expert Console**, **Provider Console**, and a "Trip Planner" variant of the expert console), each reachable only through the small account-name dropdown — never linked from the ordinary traveler sidebar (Rows 16–18).
- The provider-only **Workstation** hub with four listing shapes — **Single service, Bundle, Property, Market research** — none of which the brief's service/plan/expert/provider vocabulary anticipates (Property implies short-term-rental-style inventory; Bundle implies multi-service package pricing) (Row 17).
- The **`tripId` query parameter** as the actual mechanism that scopes a marketplace browse session to one plan, and its interaction with a **city-mismatch guard** ("This is in Kyoto. Every event on your plan is in Nara" → Add anyway / Add Kyoto as a stop / Cancel) that only fires when that parameter is present (Row 9).
- **Trip Pass** ($19: unlimited optimizer runs, AI tasks, 1 expert revision, service fee waived) and the **"Optimize · $5.99"** plan-scoring upsell ("Plan score 15/100," "up to 21% savings") as distinct, separately-priced upsell mechanisms layered on top of the base cart (Rows 9, 14).
- The three-tier **Concierge** system with an explicit revenue split stated in the UI itself — "platform fee 25% · expert keeps 75%" — plus a fourth, honestly-disabled "Full/Done-for-You" tier (Row 12).
- Per-listing storefront controls on the Provider Catalog: a **Live toggle**, **"Show on my storefront,"** and a **Booking: Instant / Request / Hidden** selector per card, plus a **"Claim your handle"** banner gating the storefront's public URL (Row 17) — none of this exists on the Expert Catalog's plainer table view (Row 16).
- A separate **"Ready-made" trip-purchase record** (Bookings → **Trips** tab: "Journey: Store Lifecycle Sold," with a "1 revision available" entitlement) that lives entirely apart from the same account's regular service bookings (Bookings → **All** tab) and never cross-links to them (Row 15).
- The AI Assistant's live **"Plan draft"** sidebar that updates per-conversation before any message is sent to a booking-committing step, and an unexplored **"Get help from our team"** escalation button on every AI Assistant conversation (Row 13).

### (c) Untestable, and why

- **Whether Row 11's auto-fired "Shared with an expert" toast and Row 12's $115 "Request received" ever created a real backend record or notified an actual person.** Exhaustively checked across three expert/provider accounts and every inbox-shaped surface each one has (Queue, Assigned Trips, History, Messages, Coordination Engagements, Agent-Booking Requests, and traveler-style Updates) — all empty or unrelated (Row 18). This can only be resolved with server/database access, which this walkthrough did not have.
- **Whether adding to a finalized (v2) plan forks a new version or blocks.** The only entry point tested (the trip page's own upsell rail) never reaches an add-attempt at all — it drops to the generic, tripId-less marketplace before any fork/block logic could run (Row 10). A different entry point (if one exists) might behave differently, but none was found from the finalized trip's own page.
- **The Full/Done-for-You Concierge tier's actual behavior**, since it is genuinely disabled in this dataset ("No packages configured for this event type and market yet") rather than reachable-but-broken (Row 12.5).
- **Whether `persona-kyoto-plus@traveloure.test`'s "finalized version 2" status ever produces a real booking record.** That account's Bookings page shows "No bookings yet," in direct tension with its fixture description (Row 15) — untestable further without knowing what server-side action was supposed to have created one.
- **Real Stripe card collection.** No checkout screen reached in this walkthrough (guest or signed-in, Rows 3, 4, 14) ever rendered an actual card-number/expiry/CVC field — only a "Credit / Debit Card · Selected" chip — so whatever real payment-collection UI exists, it lives past the "Complete Booking" / "Complete Payment" click this walkthrough deliberately never made.
- **Whether the "Payment pending · $99.00 · Notes: bundle qa" booking and the "Journey: Store Lifecycle Sold · $99.00" Trips-tab entry are the same purchase.** They match only by dollar amount; no shared ID, link, or label connects them in the UI (Row 15), so this is an inference, not a confirmed fact.
