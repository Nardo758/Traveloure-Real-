# Traveloure — Frontend Surface-Wiring Phase

**Status:** HARD-GATED. Do **not** start until the integration branch lands — chain-integrity fix, one deliberate rebase resolving the collisions, branch protection on, prod-neutrality verified. Build off **merged main** on a fresh branch. Wiring eight surfaces onto the current broken, unmerged stack only makes the merge worse.

**Why this phase exists:** the surface audit found **2 of 11** user surfaces actually wired (PlanCard pre/on-trip), **1 built-but-unlinked** (`/earn`), and **8 endpoint-only**. The engine and endpoints are built and tested; the screens that consume them aren't. This phase builds the screens.

**The pattern that de-risks all of it:** `PlanCardUpsellSlot.tsx` is the proven LIVE-WIRED component — it POSTs to an upsell endpoint and renders candidate cards, with a `surface` prop switching the endpoint (it already serves both `plancard_pretrip` and `plancard_ontrip`). Every surface below **replicates this**. Extract it into a reusable `<UpsellSlot surface={...} />` and reuse it. Do **not** invent a new slot component per surface — this is replication, not invention.

**Relevance-signal dependency (read before wiring discover/cart):** the engine currently ranks on stubbed inputs (`profileMatch=0.5`, a proximity heuristic, endorsement only from explicit caller keys). A surface shipped on pure stubs ranks on template-strength alone. So each data-driven surface must be paired with lighting up the live signal it depends on:
- **discover-location** needs the neighborhood-lead endorsement resolution (built in 5.6) + real proximity → this is the spine payoff.
- **cart** needs `profileMatch` from the signed-in user's profile.
Wire the surface and its live signal together; don't ship either ranking blind to real users.

---

## Priority + steps (one commit each, gated)

### Step 1 — `/earn` reachability, prominence, and application-flow entry
- Link `/earn` from the **"Become a Partner" nav dropdown** and the **footer** (today it's reachable only by typing the URL).
- Add a prominent **supply CTA on the landing page** — a distinct "Earn as a local / Share your expertise" section or secondary hero CTA. **Do NOT replace the AI Trip Planner hero** (see IA note). Dual-path.
- Wire the **"I do this →"** CTAs on `/earn` to drop into provider/expert signup **with the chosen offering pre-selected** — this is the application flow the page exists to feed.
- Gate: `/earn` reachable from nav + footer + landing CTA; clicking an offering starts the application with it pre-filled. Commit.

### Step 2 — Discover-location spine (the marquee differentiator)
- On the discover-location page, render the three things the spine was built for and the old TravelPulse feed doesn't show: the neighborhood's **featured lead expert** (the area's face), the **"{offering} wanted in {neighborhood}"** recruitment slots for uncovered categories, and the **recommendation slots** (`<UpsellSlot surface="discover_location">` → `/api/upsell/discover-location`). Render offering **display names**, never category keys.
- Light up the live signals this needs: neighborhood-lead endorsement resolution + proximity.
- Gate: lead expert + wanted CTAs + recommendation slots render on a seeded neighborhood; impressions logged. Commit.

### Step 3 — Cart cross-sell
- `<UpsellSlot surface="cart">` on the cart page — "frequently booked together." Light up `profileMatch` from the user profile.
- Gate: renders on a cart with items; `revenueCap` stays at default (do not raise on the highest-intent surface); impressions logged. Commit.

### Step 4 — Expert offerings on traveler surfaces
- The expert profile, the "ask/book an expert" picker, and the PlanCard **"have an expert polish this"** CTA render the expanded `expert_offering_types` menu (all five tiers — not just itinerary planning). The polish CTA maps to `ai_plan_polish` (the $49.99 AI+Expert tier).
- Gate: a traveler sees expert offerings beyond itineraries; polish CTA resolves to the right offering. Commit.

### Step 5 — Optimize-gate teaser
- `optimize.tsx` renders the **delta-only** teaser from `/api/upsell/optimize-gate` — category hints + count, no offering identities, no specifics. Preserve the secrecy contract on the client.
- Gate: teaser renders; mirror the server secrecy test on the client render (no `offeringId`/`displayName` in the rendered DOM). Commit.

### Step 6 — Checkout add-ons
- `<UpsellSlot surface="checkout">`, ≤2 items. **Never blocks checkout** — a slot fetch/render failure shows no slot and the purchase proceeds.
- Gate: renders on checkout; a forced slot error does not break the purchase flow. Commit.

### Step 7 — Remainder (lower priority, scope when reached)
- **discover-date** — build the route + date-browse UX first (no route exists today), then `<UpsellSlot surface="discover_date">`.
- **post-booking** nudge — re-engagement, frequency-capped.
- **ai-concierge** — surface the engine's proposals inside the concierge flow.

---

## IA note — the landing-page decision

Answering "replace AI Trip Planner with Ways to Earn?": **no — dual-path, not replacement.**
- **Keep AI Trip Planner as the primary traveler hero.** It's the demand hook; a homepage that leads with "earn money" reads like a gig platform and costs you the traveler pipeline.
- **Give supply real prominence anyway** — it's the current bottleneck. A distinct, prominent "Earn as a local / Share your expertise" CTA leading to `/earn`, not a buried partner sub-link. This is the Airbnb "Become a Host" pattern: a real second door, not a replaced front door.
- **To test supply-forward** without risking the homepage: use a campaign variant on the existing `/beta-[city]` pattern for recruitment traffic, A/B if you want data. Don't permanently swap the main hero on instinct.

---

## What NOT to do
- Don't start before the branch lands. This whole phase is off merged main.
- Don't replace the traveler hero. Dual-path.
- Don't build a new slot component per surface — reuse `<UpsellSlot>` (the proven `PlanCardUpsellSlot` pattern).
- Don't ship discover/cart to real users on pure stubbed signals — pair each with the live signal it needs.
- Don't leak optimize specifics on the client; the secrecy contract is a client concern too, not just server.
- Don't render category/tier keys to users — offering display names only.
