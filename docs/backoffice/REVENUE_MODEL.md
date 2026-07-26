# Traveloure Revenue Model — model of record

**Date:** Jul 26, 2026 · **Ground truth:** 2-agent file:line enumeration @ `17854ed4` (all rates = code
defaults/seeds; live values are admin-set in `fee_bands`/`platform_settings`/`optimization_fees` and
seeds never overwrite admin edits). This page exists because the model had never been in one place —
which is how placeholder fees, dead bands, and unrecorded streams accumulated.

## 1. The streams — what we charge today

| # | Stream | Rate (default) | Who pays what | Recorded in ledger? |
|---|--------|----------------|----------------|---------------------|
| 1 | Service bookings (cart `/api/checkout`) | Provider pre-cutoff `beta_flat` **10/90**; post-cutoff & expert `expert_standard` **25/75**; per-service `revenueShareRate` (default 0.75) wins last; per-expert override column | ⚠️ **Fee-on-top AND deducted** — see Finding F1 | ✅ `booking_commission` on first `completed` |
| 2 | Booking Concierge facilitation | **+5%** of item (band `expert_concierge_booking`, 064→066; the $9.99 flat is dead) | added to traveler total | ✅ folded into `booking_commission` |
| 3 | Optimization fee | **$5.99** simple/standard, **$19.99** wedding/corporate (`optimization_fees` DB-only, fail-loud — no code default anymore); 24h free re-run is **per-user, any trip** | traveler | ✅ `optimization_fee`, 100% platform |
| 4 | Coordination fee | **max($499, 8% × budget)** − paid Event optimize credit (bands `coordination_floor`/`coordination_percent`, mig 122) | client | ✅ `coordination_fee`, 100% platform |
| 5 | Expert review tiers | **$50** review / **$50 + 5%** review&book / **$100 + 8%** full concierge (code constants, `fee-literal-ok`, pending fee_bands) | traveler | 🔴 **NOT RECORDED — Finding F3** |
| 6 | Ready Made Trips | platform **25%** (band `ready_made_trip`, floor 75% author) | buyer pays list price exactly | 🟡 expert credited; **platform share never recorded** (brief 03) |
| 7 | Itinerary templates | **25/75** via category band (no per-expert override on this lane) | buyer pays list price exactly | 🟡 `template_commission` write is status-gated and **effectively never fires** |
| 8 | Tips | 5/95 (`tip_handling`) | — | ✅ correctly **gated 501** until the payment leg exists (W0.4) |
| 9 | Insurance | **OFF** (`insurance_enabled='false'`, 0%, `[]`) | would add to traveler total + deduct from earner | wired, dormant |
| 10 | Credit packages | $49/$89/$199/$349 via real Stripe Checkout | buyer | 🔴 **NO FULFILLMENT AT ALL — Finding F2** |
| 11 | Affiliate | partner-side 4–8%; internal split 70/30 constants | external | 🔴 **entirely untracked** — `affiliate_earnings` has zero writers; dashboards structurally 0 |
| 12 | Subscriptions ("Power Pass $9/mo") | display-only card on /pricing | — | no checkout, no enforcement of its promises — Finding F6 |

Stripe processing today: **absorbed by the platform** out of its take, and only as a ledger *estimate*
(`PROCESSING_FEE_RATE = 0.03` code constant — not actual Stripe cost, not admin-configurable). No
Connect application fees anywhere; platform collects gross, pays out via the escrow→payout rail.

## 2. Findings — misalignments the review surfaced (severity-ordered)

- **F1 · Double-dip on cart checkout (needs a RULING, not a silent fix).** `payments.routes.ts:372-417`
  charges the traveler `price + platformFee` while also crediting the earner only `price × share`. A
  $100 expert_standard item: traveler pays **$125**, earner gets **$75**, platform keeps **$50** — an
  effective ~40% take that no pricing surface discloses. Either "service fee on top + commission" is
  the intended model (then /pricing must say so) or one leg is a defect. **⛔ decision-maker.**
- **F2 · Credit purchases take money and deliver nothing.** `POST /api/credits/purchase` runs a real
  Stripe Checkout; `credit_purchase` has **no webhook handler, no balance grant, no revenue row**, and
  the displayed balance is a hardcoded mock (150). **Recommend gating 501 immediately** (the W0.4
  pattern) until fulfillment exists.
- **F3 · Expert review tiers charge with ZERO ledger.** `$50/$50+5%/$100+8%` is collected
  (`type:'expert_service'` PI) but `handleExpertServicePayment` writes only an `expert_requests` row —
  **no `platform_revenue` AND no `expert_earnings`**: the platform undercounts and the expert is never
  credited for the work. (Corollary: no PI anywhere sets `metadata.sourceType`, so the webhook revenue
  recorder is dead code.)
- **F4 · Two sale lanes never record platform revenue.** Ready Made (no write at all) and templates
  (status-gated write that can't fire). Every sale undercounts platform revenue. Brief 03 already filed.
- **F5 · Checkout 500s for four category slugs.** `transportation|flights|car_rental|insurance` map to
  fee categories with **no seeded band**, and the resolver deliberately throws → `500 Checkout failed`.
  Seed the bands (or remap the slugs).
- **F6 · Honesty gaps (§13 class).** /pricing's Power Pass card promises 2 runs/mo + 25% discount with
  no checkout and no enforcement; checkout response's `commissionRate: 0.30` is a display literal that
  matches no real rate; the 3% processing "cost" is an estimate booked as if real.
- **F7 · Affiliate revenue invisible.** By design it arrives on partner networks, but zero internal
  rows means reconciliation matches against an empty set and the "grand total" dashboard adds 0.

## 3. M0 — link-channel pricing (RECOMMENDATION for ratification)

**Charge on link-attributed service bookings (`source='link'`, ≤ the ceiling):**

> **Platform keeps a flat $4.99 + exact payment-processing cost (2.9% + $0.30). Earner keeps the rest.
> Traveler pays the list price — nothing added on top.**

Config (all admin-editable, §8 — zero literals in code):
- `fee_bands.link_booking_flat` — flat, **4.99** (PLACEHOLDER pending ratification)
- `fee_bands.link_processing_percent` — percent, **0.029** · `fee_bands.link_processing_flat` — flat, **0.30**
- `platform_settings.link_pricing_ceiling` — **"500"** (dollars): link pricing applies to bookings ≤ $500;
  above it the standard channel commission resolves (protects the platform from the $3,000-service ×
  $4.99 arbitrage; S4 attribution data will show whether the ceiling ever binds — revisit then)

Why $4.99: parity-calibrated against the real configured model — at the Kyoto wedge's ~$45 median
ticket it lands between today's beta_flat net (~$2.76 after absorbed Stripe) and expert_standard
(~$9.60), so the platform loses nothing at the median while the earner's pitch is honest and simple
("bring your own customer, keep everything but five bucks and card fees"). Earner-borne processing at
*actual* Stripe cost also fixes the F6 estimate problem for this channel.

Scope guards (ratified Jul 26 + this review): link pricing applies to the `service_bookings` lane
only; Ready Made/template splits unchanged by channel; coordination/optimize fees are service fees —
never bypassed by acquisition channel. **Traveler pays list price on link bookings** — note this
means the F1 ruling determines whether Discover checkout keeps its fee-on-top (a deliberate channel
difference) or aligns.

## 4. Ordered fix list feeding the roadmap

| Fix | Severity | Action | Tier |
|---|---|---|---|
| F2 credits | P0 — live money hole | Gate 501 now (W0.4 pattern); fulfillment later | Sonnet ~15k for the gate |
| F3 review tiers | P0 — charged, unledgered | Record `platform_revenue` + expert earning on payment; migrate constants to fee_bands | Fable 🔴 ~50k |
| F1 double-dip | P0 — needs ruling first | ⛔ decide: fee-on-top + commission (disclose) vs single-sided | then Fable 🔴 |
| F5 missing bands | P1 — checkout 500s | Seed 4 bands (or remap slugs) | Haiku ~10k |
| F4 revenue rows | P1 — undercounting | Brief 03: ready-made + template revenue writes | Sonnet ~35k |
| M0 build | after F1 ruling | Bands + ceiling + checkout branch on `source='link'` | Fable 🔴 ~70k (rides S4) |
| F6 honesty | P2 | Power Pass card gated/labeled; kill 0.30 literal; processing estimate labeled | Haiku ~20k |
| F7 affiliate | P2 | Wire `createAffiliateEarning` at the confirm sites; reconciliation then has a spine | Sonnet ~45k |
