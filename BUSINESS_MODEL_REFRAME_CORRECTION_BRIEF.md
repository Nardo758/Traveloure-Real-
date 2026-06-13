# Traveloure — Business-Model Reframe Correction Brief

**Status:** Implementation brief, repo-ready. Hand to a Claude Code / Replit Agent lane.
**Supersedes:** the **Monetization**, **Terminology Blitz**, and **Coordination Services** sections of `integrated_execution_plan.md`, plus the `7/10` audit's pricing recommendations. Those are corrected here, not deleted.
**Depends on:** `UNIFIED_PLANNING_FLOW_SPEC_v2.md` (Trip is the canonical object; Cart is the hinge; Generate ≠ Optimize), `fee_bands` + `resolveCommissionRates`, `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` (one ranker, `sourceType` is first-class), `EXPERT_OFFERING_CATALOG.md`.

**Read this entire brief before writing any code. Strict phase order; each phase ends with its verification gate.**

Two non-negotiables carried through the whole brief:
1. **No hard-coded fees.** Every price, commission %, affiliate margin, allowance, and discount is an admin-configurable row with an approved default. Grep-gated every phase.
2. **Display order ≠ recommendation quality.** Revenue may tie-break within a relevance band; it may never promote a worse-fitting item above a better one. Enforced by the relevance-dominance test, which is a contract.

---

## 0. The core correction

The audit made one category error and everything else inherited it: it collapsed **three distinct planning objects into one** ("everything is an event now; kill 'trip'"), then proposed making **"Experience" the umbrella term that replaces "trip."** That can't hold — "Experience" is *one of the three branches*, so it cannot also be the genus. Fix the object model and the terminology, fee, and coordinator decisions all resolve.

There are **three things a user can plan: a Trip, an Experience, or an Event.** They are different objects with different copy, budget controls, coordination defaults, and fee shapes.

---

## PART A — The three planning objects

### A1. Object model

| | **Trip** | **Experience** | **Event** |
|---|---|---|---|
| One line | Multi-day stay in a destination | A single curated occasion | A hosted, vendor-heavy production |
| Time shape | Days, self-directed | One day / one evening | One date, anchored |
| Party | Traveler + their party | Host + small party | Host + guests/attendees |
| Coordination | Light — AI plans, expert optionally polishes | Light–medium — one expert or AI curates a sequence | Heavy — dedicated coordinator + 10+ vendors + RSVP |
| Budget control | Per-day **or** total-trip tiers | One total figure for the occasion | Total event-budget tiers ($5K–$25K · $25K–$75K · $75K+) |
| Itinerary flavor | Day-by-day plan | Single-occasion run-of-show | Anchor-driven vendor timeline |
| Default monetization | Optimize fee + affiliate/booking margin + optional expert commission | Optimize fee + expert commission + booking margin | Coordination fee + vendor commissions + booking/affiliate margin + Optimize |

Separating heuristic: **Trip = days in a place; Experience = one curated occasion; Event = a production with guests and vendors.** Coordination intensity, vendor count, party size, and budget scale all rise left-to-right.

### A2. Naming hierarchy (the collision fix)

- **Umbrella / neutral surface noun: "Plan"** (what you build, any type). Used on cross-cutting surfaces: front door, nav, account.
- **Internal object stays `trip` / `tripId`.** It is canonical (PlanCard lives at `/trip/:id`, the unified flow keys off it). **Do not rename the object or the API.**
- **Branch nouns: Trip · Experience · Event** — chosen at the front door; drive copy, budget control, coordination default, fee shape.
- **Universal sub-noun: Itinerary** — the plan's contents. Same word in all three branches.
- **"Experience" is reserved** for the middle branch. It must **not** be used as the universal catch-all the audit proposed.

### A3. Front door

"What are you planning?" is a **three-way fork** (Trip / Experience / Event), not a find-replace. The chosen branch sets the noun set, budget control, coordination default, and fee shape for everything downstream.

---

## PART B — Terminology blitz (corrected)

Keep the blitz, with carve-outs:

- **Itinerary stays universal.** Do **not** rename to "Timeline" — "Timeline" is event-coded and narrower; "Itinerary" reads correctly across all three branches.
- **Do not globally replace "trip" → "experience."** Replace "trip" only on neutral/cross-cutting surfaces with the umbrella **"Plan."** Keep "Trip" where the Trip branch is active.
- **Do not rename the internal `trip` object or its API** (the audit flagged this too — hold the line).

### What NOT to do (Part B)
- Do not run a blind `trip → experience` find-replace. It collides with the Experience branch and breaks the object model.
- Do not rename `tripId`, `/trip/:id`, `user_experiences.tripId`, or any server route.
- Do not introduce "Timeline" anywhere a user sees "Itinerary."

---

## PART C — Monetization (corrected)

### C1. The Concierge layer has two fulfillment types

**Concierge is a layer, not a single product.** Every Concierge action resolves to one of two fulfillment types:

- **AI Concierge** — per-task fee. The optimizer (C2) and per-task AI actions live here.
- **Expert Concierge** — commission split. **Experts can offer concierge services** (AI-Plan Polish, "Text a Local" Live, Same-Day Rescue, Reservation Lifeline, and the event coordinator role itself). These resolve through the expert commission bands (25% platform / 75% expert floor; 15% beta band; EXP-OVR overrides) via `fee_bands`, exactly like other expert offerings.

The "suggest the human" CTA on Trips/Experiences (C6) is suggesting the **Expert Concierge**. The mandatory Event coordinator (Part D) is an **expert-fulfilled** Concierge/coordination service.

### C2. Optimizer pricing ladder

Pay-per-use, one-time Stripe service charge at the optimize gate. Free re-run within 24h. All prices are `fee_bands` rows, not literals.

| Object | Optimize price | Notes |
|---|---|---|
| Trip | **$5.99** | pay-per-use |
| Experience | **$5.99** | pay-per-use |
| Event | **$19.99** | flat; **100% credited toward the coordination fee** |

Rationale for the Event price:
- **$19.99, not $49.99.** The audit's $49.99 was the wireframe's "AI + Expert Review" *human* tier, not the optimizer. Pricing the software action at $49.99 over-charges it and double-bills against the coordination fee.
- **Flat, not budget-scaled.** Keep the optimizer flat; let the **coordination fee** be the thing that scales with budget. Scaling both double-scales the same value.
- **Credited toward coordination.** Because every Event gets a coordinator (Part D), the optimizer is the coordinator's tool, not a standalone retail SKU. Crediting the $19.99 turns it into a commitment deposit / tire-kicker filter — no double-charge feel — while still capturing revenue from the rare DIY-event user who optimizes but never engages a coordinator.

### C3. Coordination fee (Events)

- Resolved from config: **flat ($499–$4,999) OR 5–10% of event budget** (admin-configurable; pick the resolution rule and seed defaults — see Open Decisions).
- The **coordinator is mandatory on every Event** (Part D). The coordination fee attaches automatically.
- Vendor milestone/deposit flow (already in schema) rides underneath; commission resolves through `fee_bands`.

### C4. Fee + credit rails (both kept)

Keep **both** rails. Direct pay-per-use fees underneath; **credits as an optional stored-value layer** on top. The use case picks the natural default:
- **Trip** — episodic; pay-per-action, credit pack as convenience wrapper.
- **Experience** — repeat-friendly; credits amortize.
- **Event** — one-off, high-value; flat/percentage coordination fee, credits irrelevant.

Both rails read from `fee_bands` / admin config. Never hardcoded.

### C5. The $9/mo tier is a *frequency* tier, not an object tier

Tailored to the **high-frequency demand user**, across objects:
- **Frequent travelers** (high-cadence Trip users).
- **Repeat locals** (Experience users planning recurring occasions in their own city).

**Not** for the once-a-year Trip user or the one-off Event host. Mechanics: capped AI-plan allowance + pay-per-use overage + no commission discounts + **never gates the Concierge** (pure opt-in upside above break-even). Market it on behavior (a *frequent-use / power pass*), not "for travelers" (collides with the Trip branch) or "for planners."

> **Allowance count and discount rate are UNSET.** They were never defined. Now that the optimizer prices are locked ($5.99 / $19.99), they can be solved backward from a target break-even — see Open Decisions. Do not invent them.

### C6. Suggest vs. add

| | Optimizer | AI Concierge | Human (Expert) layer |
|---|---|---|---|
| **Trip / Experience** | $5.99 pay-per-use | optimizer + per-task actions | **Suggest** — "have a local expert polish this" CTA, optional upsell |
| **Event** | $19.99, credited to coordination | the coordinator's tool (not a consumer SKU) | **Add** — coordinator mandatory, baked in, not a suggestion |

Principle: for Trips/Experiences the AI is the product and the human is the upsell you *suggest*; for Events the human coordinator is the product and the AI is the tool, so you *add* it.

### What NOT to do (Part C)
- Do **not** adopt the audit's $49–99/mo subscription recommendation. It reintroduces the deprecated discount-club tiers and violates "Concierge is never gated."
- Do **not** price the Event optimizer at $49.99 or scale it by budget tier.
- Do **not** charge the Event optimizer *and* a full coordination fee without crediting — that double-bills the same value.
- Do **not** hardcode any price, allowance, or discount. If you typed a number into a `.tsx` or service file, you did it wrong.
- Do **not** put experts into `service_categories`. Expert Concierge stays in the expert offering model; the upsell engine *surfaces* it, it does not categorize it.

---

## PART D — Event coordination service (generalize, don't multiply)

The audit proposed building `proposal-coordination.service.ts`, `birthday-…`, and `corporate-…` as parallel services. That violates extend-don't-replace / config-driven / complete-by-construction and the `booking_concierge` "one generic offering scoped by config" precedent.

**Do this instead:** one **`event-coordination.service.ts`** — the existing `wedding-coordination.service.ts` generalized to read an **event-type profile**:
- immovable **anchor type** (ceremony_time, keynote_time, proposal_moment, …),
- required/recommended **vendor matrix** (reuse the template surface matrix from the taxonomy spec),
- **sequencing ruleset** (e.g., ceremony → cocktail → reception → dancing; scout → setup → proposal → photos → dinner).

Proposal / birthday / corporate become **data rows**, not code paths. `event_coordinator` already exists as a category. The **coordinator role and the coordination fee auto-attach to every Event template.**

### What NOT to do (Part D)
- Do **not** build per-event-type coordination services.
- Do **not** duplicate sequencing logic per type — it's config the one service reads.
- Do **not** make the coordinator optional on Events, or mandatory on Experiences.

---

## PART E — Fee inventory + violations (the rescan)

The audit caught the optimizer tiers, the $45 service fee, and the credit subscription. It **missed the affiliate rail entirely, the provider commission bands, transport per-leg revenue, and the productized expert-review fee**, and it **mischaracterized the subscription**. Complete revenue map:

| # | Revenue line | Rate / shape | Source of truth |
|---|---|---|---|
| 1 | Expert service commission | 25% platform / 75% expert floor; 15% beta band; EXP-OVR overrides | `fee_bands` → `resolveCommissionRates` |
| 2 | Provider booking commission | 4–12% by risk band; **beta-flat 10%** active | `fee_bands` |
| 3 | **Affiliate margin** | per-partner, `affiliate:<partnerKey>`, 4–12% range | `fee_bands` |
| 4 | AI Optimize fee | $5.99 Trip/Exp · $19.99 Event (credited); free re-run ≤24h | optimize-fee config rows |
| 5 | Cart/booking fee | needs config rate (was 3% on cart, waived if Optimize bought) | **config — currently a literal, fix** |
| 6 | Expert review/polish | `ai_plan_polish` offering ("AI + Expert Review"); Full Expert path | `expert_offering_types` |
| 7 | **Transport per-leg** | platform commission OR affiliate margin, per leg | `fee_bands`, transport resolver |
| 8 | **Event coordination fee** (new) | flat ($499–$4,999) OR 5–10% of budget | new config rows |
| 9 | Vendor milestone/deposit flow | escrow + milestones; commission rides on it | vendor contracts schema |
| 10 | Subscription | optional **$9/mo** (discounts, never gates) | config |
| 11 | Credits | stored-value rail; both rails kept | credit ledger |

### E1. Fee-literal violations to fix
- Hardcoded `$45` service fee in `payment.tsx`.
- Any literal cart-fee percentage.

Both break the grep-gated no-hardcoded-fees rule. Route through `fee_bands`.

### E2. Code-vs-doctrine drift — DECISION REQUIRED
The audit found `$14.99/mo + 25 credits + $45 flat` **live in the code**, contradicting the canonical Concierge model on three counts. Per "code is ground truth over spec when they diverge," this is a decision, not an oversight: **is the deployed pricing the stale artifact (rewrite toward $9/mo + pay-per-use), or did the model shift?** Assumed stale; confirm before the pricing-page rewrite (Phase 5), because the audit was about to "correct" the page toward the wrong model.

---

## Phase plan (audit-first, gated)

Standing gate per phase before commit: **`tsc --noEmit` ≤ baseline (`typecheck-baseline.txt`)** + **`grep` confirms zero new fee literals** + **phase-specific tests pass.**

**Phase 0 — Ground truth (read-only, HARD STOP before any writes).**
Report with file:line evidence: (a) every user-facing "trip" / "traveler" / "itinerary" string and whether its surface is branch-specific or cross-cutting; (b) the current optimize-fee config path and whether prices are config or literals; (c) the `$45` and cart-fee literals; (d) `wedding-coordination.service.ts` signature and what it would take to read an event-type profile; (e) where Expert Concierge offerings currently resolve commission. **No writes. Paste report back for greenlight.**

**Phase 1 — Front door + "Plan" umbrella.**
Three-way fork (Trip/Experience/Event); neutral "Plan" noun on cross-cutting surfaces; keep "Trip" in the Trip branch; keep "Itinerary" everywhere. No object/API rename.
- Gate: object model routes correctly; no `tripId`/route renames; grep finds no "Timeline" replacing "Itinerary".

**Phase 2 — Optimizer prices into config.**
Seed `fee_bands` (or optimize-fee config): Trip $5.99, Experience $5.99, Event $19.99. Wire Event credit-toward-coordination.
- Gate: prices resolve from config; grep finds no optimize-fee literal; Event optimize credits the coordination fee in a test.

**Phase 3 — Concierge layer (AI + Expert) + suggest/add wiring.**
AI Concierge (optimizer + per-task) and Expert Concierge (commission split) both resolve through config. Trip/Experience → "expert polish" suggest CTA; Event → coordinator add.
- Gate: expert-concierge commission resolves via `resolveCommissionRates`; suggest-vs-add renders per object; no double-count of any concierge fee.

**Phase 4 — Generalize event coordination.**
`event-coordination.service.ts` reads an event-type profile (anchor + vendor matrix + sequencing); coordinator + coordination fee auto-attach to every Event template.
- Gate: proposal/birthday/corporate run through the one service from data rows; no per-type service files; coordinator mandatory on Event, absent on Experience (test).

**Phase 5 — Kill fee literals + reconcile pricing page.**
Route `$45` and cart-fee through `fee_bands`. Rewrite the pricing page to the corrected model **after** the E2 decision.
- Gate: grep finds zero fee literals repo-wide; pricing page reflects $9/mo + pay-per-use + both rails; relevance-dominance test still green.

---

The three numbers are close enough for launch — all are config rows, so "tune on signal" is valid. **Ratified:** 25% overage / 8% coordination / 2-run allowance.

---

## Resolved Seed Defaults (ratified 2026-06-13)

All values are config rows with these approved defaults. Admin-editable; no deploy required to change.

### 1. E2 — Pricing page reconciliation

**Decision:** Treat as **stale artifact**. Rewrite toward `$9/mo + pay-per-use + both rails`.

The deployed `$14.99/mo + 25 credits + $45 flat` contradicts doctrine on three independent counts (credit model, literal fee, deprecated discount-club tier). The tell is the hardcoded `$45` in `payment.tsx` — it predates the no-fee-literals grep-gate. A real model shift would have arrived with `fee_bands` plumbing, not a literal. **No grandfathering needed** — stop selling the old SKU; existing subscription records stay untouched until they lapse or the user re-subscribes.

### 2. $9/mo allowance + discount rate

| Parameter | Default | Notes |
|---|---|---|
| **Allowance** | 2 optimize runs/month (Trip/Experience class) | Denominated in $5.99 runs. Events are one-off and excluded from the frequency tier. |
| **Overage discount** | 25% off ($5.99 → $4.49) | 20–30% is the tunable band. 25% is the launch default. Never touches commissions or coordination fees. |
| **Break-even** | ~1.5 runs/month | Anyone doing ≥2 runs/month comes out ahead. The 1-run user correctly loses (they should stay pay-per-use). |

Break-even math:

| Member usage | Member cost | Non-member cost | Member saves |
|---|---|---|---|
| 1 run | $9.00 | $5.99 | −$3.01 (loses, as intended) |
| 2 runs | $9.00 | $11.98 | +$2.98 |
| 4 runs | $17.98 | $23.96 | +$5.98 |

### 3. Coordination-fee resolution rule

| Parameter | Default | Notes |
|---|---|---|
| **Resolution rule** | Greater-of: `max($499 floor, 8% of event budget)` | Protects small events (floor binds below ~$6,240) and captures upside on large events. |
| **Floor** | $499 | Ensures coordinator hours are covered even on intimate events. |
| **Rate** | 8% | Mid-band in the 5–10% range; undercuts traditional planner fees (10–20%), which is the right marketplace posture. |
| **Cap** | None initially | A cap would undercharge the $75K+ tier. Add later as a config row if mega-events show price resistance. |

Crossover table:

| Event budget | Floor | 8% | Charged |
|---|---|---|---|
| $5K | $499 | $400 | **$499** (floor binds) |
| $25K | $499 | $2,000 | **$2,000** |
| $75K | $499 | $6,000 | **$6,000** |

The $19.99 Event optimizer **credits against the coordination fee**, so first-event effective cost = fee − $19.99.

### 4. Event free preview

**Confirmed — keep.** But the Event preview's payload is **feasibility/coverage**, not cost-savings.

- **Trip/Experience hook:** "Save ¥8,400 · 23% tighter."
- **Event hook:** "12 vendors to sequence around your 4:00 PM anchor · 3 timing conflicts found" or "timeline 85% covered — 2 gaps a coordinator closes."

The Event preview reveals the **shape** of the problem (complexity proof), never the arranged solution. CTA → coordinator engagement. The $19.99 optimizer is credited toward coordination.

### 5. Per-object budget-control tiers

All three shapes resolve into the existing `budgetTier` profile field. Do not fork it.

| Object | Budget control | Bands (config) |
|---|---|---|
| **Trip** | Per-day primary, total optional | Budget $50–100/day · Moderate $100–250/day · Luxury $250+/day |
| **Experience** | Single total | Modest <$250 · Standard $250–$1,000 · Elevated $1,000–$2,500 · Premium $2,500+ |
| **Event** | Tiered bands | Intimate <$5K · $5K–$25K · $25K–$75K · $75K+ |

**Boundary rule:** A $1,500 proposal — Experience or Event? Resolve on **vendors + guests, not budget**. Proposal with just a photographer = Experience. Proposal that's a catered party with guests = Event. Budget alone can't route it; the front-door fork does.

---
