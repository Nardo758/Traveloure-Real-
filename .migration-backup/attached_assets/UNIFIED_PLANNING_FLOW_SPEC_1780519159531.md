# Traveloure — Unified Planning Flow Spec

**One flow, two entry points, the Cart as hinge, paid AI optimization as the DIY product, the PlanCard as the on-trip control center.**
Ties together the experience hub, the optimizer, the cart, the expert pipeline, and the PlanCard. Build brief for Replit.

---

## 1. The flow (with gates)

```
Discover feed ─┐
               ├─► CART (your selections, the hinge) ──► AI OPTIMIZE ──► PLAN
Experience ────┘                                          (paid)         pushed to
template                                                                 the TRIP CARD
                                                                          (PlanCard)
   ── guest can: build cart · see a FREE preview of the improvement ──
   ── account + optimization fee: run the full optimization ──
   ── account: ask/book an expert · book + pay ──
```

- **Build (guest):** both entry points add items to one Cart. No account.
- **Preview (guest, free):** the optimizer returns an *estimate* — "we can make this ~23% tighter, save ~¥8,400." The hook. No account.
- **Optimize (account + fee):** running the *full* optimization is a **paid action**. Requires account + payment. Produces the measurably-better plan and pushes it to the PlanCard.
- **Act (account):** ask/book an expert, book + pay for the items.

The guest cart migrates into the account at the first gate (optimize/save).

---

## 2. The Cart — the hinge (build)
- One session-scoped cart for guests (anonymous id / session token), persisted client-side or as a guest record; **migrates to the account on signup.**
- Both Discover and the experience template write to the same cart.
- *Current state:* cart/trips are `ProtectedRoute` (account-gated today). **Guest cart + migration is a real build**, not a config flip — but it's what unlocks the build-value-first funnel.

## 3. AI optimization — the paid product
This is the DIY user's expert-substitute, and it's where the DIY path earns revenue.
- **Free preview / estimate** (guest): a cheap heuristic estimate of the achievable improvement — enough to create desire, not the full plan. Preserves the wow hook before the paywall.
- **Paid full optimization** (account + fee): runs `itinerary-optimizer` (sequencing, anchors, the 4 scores), returns the optimized plan + the **measurable before→after delta** (the optimizer already computes cost-savings %, rating lift, comparison — surface it).
- **The fee:**
  - A **new platform revenue line**, distinct from booking commission. Admin-configurable (treat like `booking_fee_configs` but for the optimization service).
  - **Pricing model (decision):** flat per optimization · **tiered by experience complexity** (the `experience_types` complexity profile is a natural driver — a wedding optimization > a date-night) · or **bundled into a subscription tier** (Explorer free preview → Insider includes optimizations). Recommend tiered-by-complexity or subscription, not a flat nuisance fee.
  - **Re-optimization:** decide if re-runs are free within a window or charged each time.

## 4. Push to the Trip card — the on-trip control center
On successful (paid) optimization, the plan's **contents are pushed to the PlanCard** — which is the itinerary control center on the phone (per the PlanCard spec):
- Activities, services, transport legs, map layers (activity pins, transport routes, expert notes), change-log/attribution, collaborator permissions.
- Native-maps handoff for turn-by-turn; book/add/ask actions live on the card.
- The PlanCard is the **destination of the whole flow** — planning happens in the cart/optimizer; *living the trip* happens on the PlanCard.
- "Push to Trip card" = the optimized plan populates the canonical PlanCard the traveler carries on-trip (and the same card the expert edits if handed off).

## 5. The expert branch (assisted path)
From the optimized plan, **Ask / Book an expert** creates an `expert_request` → routes through admin-confirm → the expert workspace, where the expert refines the *same* plan/PlanCard. AI optimizes; the expert polishes on top (the canonical cart → optimize → expert-review sequence). Not a separate path — the funnel→workspace pipeline you already built.

---

## 6. Build order
1. **Confirm the data link first** (the blocker from the experience audit): is `user_experiences` the same object as a `trip`, and does the optimizer reach it? Determines whether this is surfacing or unification.
2. **Guest cart + migration** — session cart, both entries write to it, migrate on signup.
3. **Optimization fee** — fee config (admin), payment at the optimize gate, the free preview/estimate.
4. **Wire the optimizer into the DIY flow** + surface the measurable delta.
5. **Push optimized contents to the PlanCard** (the canonical control center).
6. **Expert branch** — reuse the existing `expert_request` → admin-confirm → workspace pipeline off the plan.

## 7. Open decisions
- **Fee placement:** paywall at full optimization, free preview before it (recommended) — confirm.
- **Fee model:** flat / tiered-by-complexity / subscription-bundled.
- **Free-preview scope:** how much improvement to reveal for free without giving away the paid result.
- **Hard auth gate:** at optimization (recommended — it's now a paid action) vs at booking only.
- **Re-optimization:** free within a window vs charged per run.

## 8. Data dependencies (confirm/build)
- `user_experiences` ↔ `trips` ↔ optimizer link (the experience-audit §7 question).
- Guest session cart + account migration.
- Optimization-fee config + payment integration (Stripe) — a *service* charge, not a booking commission split.
- The push-to-PlanCard wiring (optimized plan → canonical PlanCard contents).
- The gem/service fields the feed + matching also need (`type`, `neighborhood`, `bookability`, `matchedService`).

---

*The Cart is the hinge; AI optimization is the paid DIY product; the PlanCard is the on-trip control center it all flows into; the expert branch is the assisted upgrade off the same plan. Guests build and preview; an account + the optimization fee unlock the full plan.*
