# Transport Commerce Layer — Build Spec

**Purpose:** Close the strand gate so the old transport booking widgets can be removed. Implements the per-leg transport commerce layer with **two sources** — platform providers (primary) and affiliate (fill) — on top of the now-shipped display layer.

**Context:** The display/mode layer is live (legs render, persist `userSelectedMode`, restyle on change; mode taxonomy single-sourced in `transport-modes.ts`). What's missing is the commerce half: both `findTransportProviders` (platform) and `findAffiliateTransportOptions` (affiliate) are stubbed. Removing `TravelpayoutsTransport` / `DiscoverCars` / Nomad / transfers tab before this lands strands transport revenue.

**Read this entire brief before writing any code.** Strict phase order; each phase ends with its verification gate.

---

## Model

For each transport leg (from the post-optimization, expert-reviewed `transport_legs` — do **not** recompute client-side), resolve bookable options from two sources and return them ordered:

1. **Platform transport (primary)** — Tier 1 Private Transportation service providers matching the leg. Booked on-platform; provider commission (admin-configurable, 4–12% default). Shown first **when it genuinely fits the leg**.
2. **Affiliate transport (fill)** — third-party options when platform coverage is absent or insufficient: transfers/car (Kiwi/Nomad/GetTransfer/DiscoverCars/Omio), intercity/transit (12Go, Rome2Rio, Omio, Distribusion). Affiliate margin (admin-configurable, per partner). Deep-link out, or in-app where supported.

**Ordering policy (baked-in default — flip if desired):** platform leads only when it fits the leg's mode/time/party-size/coverage. If no platform provider fits, affiliate is primary — not a grudging fallback. Revenue rank never buries a better-fitting option. This honors both the display-order rule (platform first) and the recommendation-quality rule (fit over revenue).

---

## Phase 0 — Ground truth (read-only)
1. Confirm `findTransportProviders` and `findAffiliateTransportOptions` in `transport-booking-options.service.ts` are stubs; report current signatures/returns.
2. Confirm `transport_legs` carries what the resolver needs per leg: origin, destination, time window, mode, and a path to **party size** (from the trip record — pull it, don't assume 1).
3. Grep the old widgets (`TravelpayoutsTransport`, `DiscoverCars`, Nomad, transfers tab) for the affiliate provider/deep-link logic to be preserved — that logic moves into the affiliate resolver, it is not lost.
4. Confirm `transport-modes.ts` is the mode taxonomy to reuse (do not introduce a new one).

## Phase 1 — Platform resolver (primary source)
Implement `findTransportProviders(leg, partySize)`: query Tier 1 Private Transportation service providers matching the leg (route, time, party size → vehicle class). Return options with provider id, mode, price, and **commission rate read from admin config** (not a literal). Group matching uses `transport-modes.ts` ids.
- **Gate:** returns real platform options for a leg with a matching provider; empty array (clean) when none. No hard-coded commission literal. `tsc --noEmit` clean.

## Phase 2 — Affiliate resolver (fill source)
Implement `findAffiliateTransportOptions(leg)`: surface affiliate options from the providers preserved in Phase 0.3 (transfers/car + intercity). Return options with partner id, mode, price, deep-link, and **margin read from per-partner admin config**.
- **Gate:** returns affiliate options for a representative leg; per-partner margin is config-driven; deep-links resolve. `tsc` clean.

## Phase 3 — Unify + wire to the display layer
Single resolver entry in `transport-booking-options.service.ts` that returns, per leg, an ordered list: platform-when-fit, then affiliate fill, per the ordering policy above. Wire a "book this leg" affordance in the PlanCard transport layer → per-leg options panel, rendering modes via `transport-modes.ts`.
- **Gate:** a leg with a fitting platform provider ranks it first; a leg with no fitting platform provider returns affiliate as primary; panel renders on the shipped display layer without a new mode taxonomy.

## Phase 4 — Fee/booking integration
Each option carries its revenue type (commission vs affiliate margin) and rate so the booking/fee resolver bills correctly. All rates resolve through admin config with approved defaults — **no fee literals anywhere**.
- **Gate:** grep finds no hard-coded transport fee/commission/margin literals; booking a platform leg books on-platform at the configured commission; booking an affiliate leg routes the configured margin.

## Phase 5 — Remove the old widgets (the gated removal)
Only after Phases 1–4 verify both sources surface per leg: surgically remove `TravelpayoutsTransport`, `DiscoverCars`, Nomad, and the transfers tab. Their function is now covered by the per-leg commerce layer.
- **Gate:** widgets gone; no dangling imports; transport revenue (platform + affiliate) is reachable through the per-leg panel for every leg type the widgets previously covered.

---

## What NOT to do
- Do **not** implement only the affiliate source — platform (Tier 1 Private Transportation) is the primary, higher-margin source and shows first.
- Do **not** hard-code commission or affiliate margin — admin-configurable with approved defaults, per the standing fee-architecture rule.
- Do **not** let revenue rank override genuine fit — platform leads only when it fits the leg.
- Do **not** introduce a new mode taxonomy — reuse `transport-modes.ts`.
- Do **not** recompute transport legs client-side — they are server-side, post-optimization, post-expert-review.
- Do **not** remove the old widgets until Phase 5's gate confirms both sources surface per leg — premature removal re-opens the strand gap.
- Do **not** assume party size = 1 — pull it from the trip; group templates (corporate/wedding) need the right vehicle class.

## Report on completion
- Phase 0 stub signatures + confirmation party size is reachable.
- Per-leg resolver output for: a leg with a fitting platform provider, and a leg with none (affiliate-primary).
- Grep result confirming zero hard-coded transport fee literals.
