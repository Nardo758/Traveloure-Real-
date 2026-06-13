# $9/mo Tier — Breakeven Analysis & Seed Defaults

**Status:** Ratified brief. Appendix to `BUSINESS_MODEL_REFRAME_CORRECTION_BRIEF.md`.  
**Ratified:** 2026-06-13  
**Blocks:** Phase 5 pricing-page rewrite (subscription tier section).  

---

## 1. Purpose

Solve the allowance count and discount rate for the `$9/mo` frequency tier backward from a target break-even, now that optimizer prices are locked (`$5.99` Trip/Experience, `$19.99` Event).

---

## 2. Locked inputs (from correction brief)

| Input | Value | Source |
|---|---|---|
| Trip/Experience optimizer | `$5.99` | `fee_bands` config row |
| Event optimizer | `$19.99` (credited toward coordination) | `fee_bands` config row |
| Target break-even | ~2 Optimize runs/month | "Pays for itself at ~2 runs/month" |
| Tier price | `$9.00/mo` | config row |

---

## 3. Allowance count

**Allowance: 2 optimize runs/month (Trip/Experience class).**

Denominated in `$5.99` Trip/Experience runs. Events are one-off and excluded from the frequency tier.

| Member usage | Member cost | Non-member cost | Member saves |
|---|---|---|---|
| 1 run | `$9.00` | `$5.99` | `−$3.01` (loses, as intended) |
| 2 runs | `$9.00` | `$11.98` | `+$2.98` |
| 3 runs | `$9.00` | `$17.97` | `+$8.97` |
| 4 runs | `$17.98` ($9 + 2×$4.49) | `$23.96` | `+$5.98` |
| 6 runs | `$26.96` ($9 + 4×$4.49) | `$35.94` | `+$8.98` |
| 8 runs | `$35.94` ($9 + 6×$4.49) | `$47.92` | `+$11.98` |

**Break-even lands at ~1.5 runs/month.** Anyone doing **≥2 runs/month comes out ahead** — exactly the frequency threshold that defines the segment. The 1-run user correctly loses (they should stay pay-per-use, which is the whole "never gates the Concierge" point).

---

## 4. Overage discount rate

**Discount: 25% off the $5.99 optimizer = $4.49/run.**

| Parameter | Value | Tunable range |
|---|---|---|
| Base optimizer (Trip/Exp) | `$5.99` | locked |
| Discount rate | `25%` | `20–30%` (launch default: 25%) |
| Overage price | `$4.49` | `$4.79` (20%) to `$4.19` (30%) |

**Why 25%:**
- **20%** feels too stingy for a membership benefit; doesn't reward frequency enough.
- **30%** trains users to wait for the discount; may suppress full-price purchases.
- **25%** is the midpoint. It rewards heavy users without becoming the expected price.

**What the discount touches:**
- ✅ Trip/Experience optimizer overage only
- ❌ Event optimizer ($19.99 is already credited; no overage concept)
- ❌ Expert commissions (never discounted — expert keeps their rate)
- ❌ Coordination fees (never discounted — coordinator keeps their rate)
- ❌ Provider booking commissions (never discounted)
- ❌ Affiliate margins (never discounted)
- ❌ Cart/booking fees (never discounted)

**Config row shape:**
```
name: "member_optimizer_overage_discount"
type: "percentage"
value: 0.25
appliesTo: ["trip_optimizer", "experience_optimizer"]
excludes: ["event_optimizer", "expert_commission", "coordination_fee", "provider_commission", "affiliate_margin", "booking_fee"]
```

---

## 5. Marginal economics

### At break-even (2 runs/month)

| | Member | Non-member |
|---|---|---|
| Revenue | `$9.00` | `$11.98` |
| Member saves | `+$2.98` | — |
| Platform collects | `$9.00` | `$11.98` |

**The platform earns less on a member at break-even.** That's intentional — the $9 tier is a **frequency bet**, not a revenue-maximization move. The platform trades `$2.98` of short-term revenue for:
- **Retention:** Members plan more often (sunk-cost fallacy + unlocked allowance).
- **Upsell surface:** Members see more expert suggestions, more concierge CTAs, more vendor recommendations.
- **Data:** More planning behavior = better recommendation engine = better conversion for non-members.

### At 4 runs/month (heavy user)

| | Member | Non-member |
|---|---|---|
| Revenue | `$17.98` ($9 + 2×$4.49) | `$23.96` |
| Member saves | `+$5.98` | — |
| Platform collects | `$17.98` | `$23.96` |

Still negative for the platform vs. pay-per-use, but the **gap narrows** as usage increases. The heavy user is a **loss leader** for:
- **Expert conversion:** Heavy planners are the most likely to hire an expert (commission revenue).
- **Provider booking:** Heavy planners book more services (commission + affiliate margin).
- **Event graduation:** Heavy Experience planners may upgrade to Event (coordination fee).

### At 1 run/month (light user)

| | Member | Non-member |
|---|---|---|
| Revenue | `$9.00` | `$5.99` |
| Member saves | `−$3.01` (loses) | — |
| Platform collects | `$9.00` | `$5.99` |

**The platform earns more on the light user.** The light user subsidizes the heavy user. That's the gym-membership model — and it's correct, because the light user is paying for the *option value* of planning more, not the actual usage.

---

## 6. Sensitivity analysis

| Discount rate | Overage price | Break-even (runs/month) | Heavy-user (4 runs) revenue | Light-user (1 run) revenue |
|---|---|---|---|---|
| 20% | `$4.79` | ~1.7 | `$18.58` | `$9.00` |
| **25%** | **`$4.49`** | **~1.5** | **`$17.98`** | **`$9.00`** |
| 30% | `$4.19` | ~1.4 | `$17.38` | `$9.00` |

**25% is robust across the band.** Break-even stays in the 1.4–1.7 range. Heavy-user revenue stays within `$1.20` of the midpoint. Light-user revenue is constant ($9.00).

---

## 7. Config rows to seed

```sql
-- $9/mo tier base price
INSERT INTO fee_bands (band_key, name, type, value, currency, applies_to, is_active) 
VALUES ('subscription_monthly', 'Monthly Power Pass', 'flat', 900, 'USD', 'subscription', true);

-- Allowance: 2 Trip/Experience optimize runs per month
INSERT INTO fee_bands (band_key, name, type, value, unit, applies_to, is_active) 
VALUES ('subscription_optimizer_allowance', 'Monthly Optimize Allowance', 'count', 2, 'runs', 'trip_optimizer,experience_optimizer', true);

-- Overage discount: 25% off optimizer
INSERT INTO fee_bands (band_key, name, type, value, applies_to, is_active) 
VALUES ('subscription_optimizer_overage_discount', 'Member Overage Discount', 'percentage', 0.25, 'trip_optimizer,experience_optimizer', true);

-- Exclusions: Events, commissions, coordination fees, affiliate margins, booking fees
INSERT INTO fee_bands (band_key, name, type, value, applies_to, is_active) 
VALUES ('subscription_optimizer_overage_exclusions', 'Member Overage Exclusions', 'list', NULL, 'event_optimizer,expert_commission,coordination_fee,provider_commission,affiliate_margin,booking_fee', true);
```

---

## 8. Pricing page copy

### Tier name
**"Power Pass"** — not "Pro," not "Travel Pro," not "Event Planner." Behavior-based, object-agnostic.

### Tagline
> "For people who plan often. Unlock 2 AI plans/month + 25% off every extra plan."

### Mechanics line
> "$9/month. Breaks even at 2 plans. No commitment. Never gates the Concierge."

### What it includes
- 2 AI Optimize runs/month (Trip or Experience)
- 25% off every additional Optimize run
- Priority AI processing queue
- No commission discounts (experts keep their full rate)
- No coordination fee discounts (coordinators keep their full rate)

### What it does NOT include
- Event optimizer (separate $19.99, credited toward coordination)
- Expert commission discounts
- Coordination fee discounts
- Affiliate margin discounts
- Booking fee discounts

### Who it's for
- Frequent Trip planners (2+ trips/month)
- Repeat Experience planners (date nights, local occasions)
- NOT for one-off Trip users
- NOT for one-off Event hosts (Event has its own fee structure)

---

## 9. Verification gate

Before Phase 5 pricing-page rewrite commits:

- [ ] `grep -r "14.99\|25 credits\|45" client/src/pages/pricing.tsx` → zero matches (old model removed)
- [ ] `grep -r "9.00\|Power Pass\|2 plans/month" client/src/pages/pricing.tsx` → matches present (new model in)
- [ ] `fee_bands` rows seeded for subscription, allowance, overage discount
- [ ] Pricing page renders all three branches (Trip/Experience/Event) with correct tier logic
- [ ] `tsc --noEmit` passes
- [ ] Relevance-dominance test still green

---

## 10. Follow-up triggers

| Signal | Action |
|---|---|
| Member <1.5 runs/month average | Raise allowance to 3, or lower price to $7.99 |
| Member >4 runs/month average | Lower discount to 20%, or add 3rd tier at $15/mo |
| Non-member conversion to member <5% | Rewrite marketing copy; test "free first month" |
| Member churn >15%/month | Add commission discount as retention lever (expert absorbs 50%) |
| Event users subscribing >5% | Add Event optimizer to allowance (1 Event = 3 Trip/Exp runs) |

---

**End of brief.** Hand to pricing-page rewrite lane (Phase 5).
