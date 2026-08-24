# Traveloure — Unified Planning Flow Spec (v2)

**Supersedes v1.** Adds: the **third entry point** (AI trip planner), the **generate-vs-optimize** distinction, **Trip as the canonical object** (G1 confirmed by gap analysis), and the G1–G8 build map.

---

## 1. The flow

```
Discover feed ───┐
Experience tmpl ─┤►  CART  ─►  AI GENERATE ─► draft ─►  AI OPTIMIZE ─► PLAN ─► push to
AI trip planner ─┘  (hinge)    (free draft)            (PAID)               TRIP CARD = PlanCard

  guest:                build cart · generate draft · see improvement PREVIEW (free)
  account + fee:        run the FULL optimize
  account:              ask/book an expert · book + pay
```

Everything resolves to **one Trip** (the canonical object). Experiences link to it via a `tripId` FK; the cart resolves to a trip; the optimizer only knows trips.

---

## 2. Three entry points → one Cart → one Trip
- **Browse-and-add** (Discover feed) · **guided** (Experience template) · **prompt-and-generate** (AI trip planner). All three write to **one Cart**.
- **Trip is canonical (G1, confirmed):** `user_experiences` and `trips` are separate silos today; the fix is a `tripId` FK on `user_experiences`, populated at cart-creation. Don't merge the tables — link them. The optimizer takes a `tripId`, so every path must reach a trip.
- **"Add to my plan"** targets the trip/experience the user is currently building; the *type* (travel / wedding / proposal) is chosen once at creation — don't force a Trip-vs-template choice on every gem.

## 3. Generate vs Optimize — two different AI jobs (keep distinct)
| | Generate (AI trip planner) | Optimize (the paid product) |
|---|---|---|
| Input | a prompt ("5 days in Kyoto") | the cart |
| Output | a **draft** itinerary that fills the cart | a **sequenced, logistics-optimized** plan + measurable delta |
| Price | **free** (the hook) | **paid** |
| Where | landing page (acquisition) · console (start/regenerate) | the optimize gate |

If generate quietly does the full optimize for free, you've given away the paid product. Generate = the draft; optimize = the measurable improvement.

## 4. The Cart — the hinge (guest)
- **Guest session cart (G2 — real build):** `cart_items.userId` is a required FK today, so there's no anonymous cart. Add a session cart (local UUID / `guest_sessions`) + a **migrate-on-signup** endpoint.
- Both Discover and the planner write to it; **Discover items need an "Add to plan" action (G5)** — extend `cart_items` to accept non-service content (gem/hotel/activity) or resolve them to a service/venue id first.

## 5. AI optimization — the paid product
- **Free preview/estimate (G4):** computed by `smart-sequencing.service` alone (no full LLM) — show the **% + cost delta only** ("save ~¥8,400 · 23% tighter"), not the rearranged itinerary.
- **Paid full optimize (account + fee):** runs the full optimizer, returns the plan + the before→after delta (already computed in `itinerary-optimizer`), pushes to the PlanCard.
- **The fee (G3 — doesn't exist yet):** a **new platform revenue line**, distinct from booking commission; admin-configurable. **DECIDED: pay-per-use, tiered by experience complexity** (`experience_types` profile → 3 price tiers). Each optimize run is a **one-time Stripe service charge** at the optimize gate — not a subscription, not a commission split. Free re-optimization within 24h (don't double-charge a tweak). Save the payment method on first use so repeat optimizes are one-tap.

## 6. Push to the Trip card — the on-trip control center (G7)
On paid optimize: contents (activities, services, transport legs, map layers, change-log, collaborators) **push to the PlanCard**, and the user lands on `/trip/:id` with a "your plan is ready" moment + the delta. The PlanCard is the **itinerary control center on the phone** (map layers, native handoff, on-trip actions). Planning happens in the cart/optimizer; *living the trip* happens on the PlanCard.

## 7. Expert branch (assisted upgrade, off the plan) (G8)
A **"Have an expert polish this"** CTA on the PlanCard pre-fills an `expert_request` with the trip + optimization context → admin-confirm → expert workspace (the pipeline you built). AI optimizes; the expert refines on top — same plan, same PlanCard.

---

## 8. Build order (gap analysis G1–G8)
1. **G1 — Experience→Trip link** (the blocker): `tripId` FK on `user_experiences`, populated at cart-creation.
2. **G2 — Guest cart + migration**.
3. **G5 — Discover feed → Cart** ("Add to plan" on gem/hotel/activity cards).
4. **G4 + G3 — Free preview, then fee + payment gate** (build the heuristic estimate first; layer Stripe in front of the full run).
5. **G6 — Trip auto-creation from cart** at the optimize gate (infer destination/dates/party from cart).
6. **G7 — Post-optimize push to PlanCard** (`/trip/:id` + delta moment).
7. **G8 — Expert CTA off the plan** (pre-filled `expert_request`).

## 9. Open decisions (recommended defaults)
- **Fee model:** **DECIDED — pay-per-use, tiered by complexity.** One-time service charge per optimize; free re-runs within 24h.
- **Free-preview scope:** % + cost delta only; no rearranged itinerary.
- **Hard auth gate:** at optimization *(it's a paid action and you need a userId to create the trip anyway)*.
- **Re-optimization:** free within 24h (store `optimizedAt`).
- **Generate (planner):** free as the hook; gate optimize, not generate.

## 10. Data dependencies
`tripId` FK on `user_experiences` (G1) · guest session cart + migration (G2) · `cart_items` extended for non-service content (G5) · optimization-fee config + Stripe **service charge** — not a commission split (G3) · push-to-PlanCard wiring (G7) · pre-filled `expert_request` (G8).

---

*Three entries (browse / template / prompt) → one Cart → free generate + free preview → **paid optimize** → PlanCard (the on-trip control center) → expert/book. All on the canonical Trip. Guests build, generate, and preview; an account + the optimization fee unlock the full plan.*
