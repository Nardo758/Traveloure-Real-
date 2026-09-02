# Pricing & Feature Map

**Status:** RATIFIED 2026-08-27 (Leon) — build authority · supersedes Business Plan v1.3 §3.1, §3.3, §4 (credits, $19.99/$39.99 memberships, "Savings Concierge") · `audited@<main at landing>`

> **Correction 2026-08-27 (verified against `main` @ a219e6fd):** the optimization run fee is **not** a `fee_bands` key. It lives in the canonical `optimization_fees` table, resolved server-side by `getFee(eventType, tier)` (migrations 017/076, admin-editable, determinism-tested). Any earlier reference to an `optimizer:run` `fee_bands` key is superseded — `/pricing` and the Optimize dialog read `optimization_fees`. The `plans` rows and the `concierge:*` / band keys are unaffected. Migration 259's status (the `plans` table + concierge rows) is being confirmed; if not on `main`, that migration is rebuilt — minus the optimizer row.

Rules that govern this document:
- Every number here is a `fee_bands` row (or a `plans` row for subscriptions). **No fee literal exists anywhere else.** The pricing page reads these rows; the resolver reads these rows; the plan document cites these rows.
- "Unset" rows are decisions, not defaults. The code omits the feature until the row exists (§13).
- Prices are launch values; every row carries `as-of` and a review date. Changes are ledger rulings.

---

## 1. Positioning

**Plan the trip a local would take.** Yourself, with AI, with a local, or done for you.

Two calendars, one product:
- **Trips** — episodic. Sold per trip. The Trip Pass.
- **Occasions** — recurring (birthdays, anniversaries, date nights, proposals, celebrations) in the city you live in. Sold annually. Plus.

The supply side (experts, providers) uses the platform weekly. Sold monthly. Pro.

---

## 2. The traveler ladder

| Tier | Includes | Price | `fee_bands` / `plans` key | Sold at |
|---|---|---|---|---|
| **Plan it yourself** | slip, browse, `Book now`, ready-made trips, guest draft · **pay-per-use access to every AI action below — no membership needed** | free | — | default |
| **Plan with AI** (pay per use) | optimization run (3 versions around an anchor) · AI Concierge task · available to free users, guests included after sign-in at the paid gate | run **$5.99** (trip/experience; event $19.99) · task **$2.99**, charged at confirm, nothing runs before | `optimization_fees` via `getFee` (see the 2026-08-27 correction above), `concierge:ai_task` | `Optimize this plan`; feed concierge panel; Finalize → Concierge |
| **Trip Pass** | unlimited runs + AI tasks on one slip · one expert revision · traveler service fee waived on that trip's bookings | **$19 / trip** | `plans:trip_pass` | offered at the second paid AI action on a slip; pricing page |
| **Plan with a local** | a named expert takes the slip: review, re-route, endorse, book what needs a human | expert's price (`from $N`), platform commission by band | expert bands below | `Plan with {name}`; Finalize → Travel expert |
| **Done for you** | event / complex trip coordinated end to end (planner + providers) | quoted; deposit + milestones; full commission | `concierge:done_for_you_deposit_pct` **20%** | Event Planners; Finalize → Booking agent |

---

## 3. Plus — the occasions membership (new)

**What it is:** for people in a launch market planning the dates that recur — a plan arrives before each one.

| Feature | Mechanism | Status |
|---|---|---|
| Home city + occasion calendar | `users.home_city`; new `occasions (user_id, template_key, date, recurrence, label)` | **build** (schema lane) |
| A draft slip 14 days before each occasion | scheduled AI Concierge task → new trip on the slip, `in_planning` items from the home city's gems/services matched to the template (`date_night`, `birthday`, `proposal`, `celebration`) | **build** (job on the existing task rail) |
| Retained local expert | priority response from a chosen expert; expert's time still priced by the expert | **exists** (advisor access) — copy must say "priority," not "included" |
| Priority on sell-out inventory | 48h early access window on occasion-tagged services | **build** (small; a `plus_early_access_until` on listings) |
| AI task allowance | 4 tasks / month beyond the scheduled ones; then per-task | `plans:plus_task_allowance = 4` |
| Resident mode on the feed | same `/discover/location/:City`, `where` = home city, occasion chips replace gem chips | **build** (feed lane, small) |

**Price:** **$25 / year** (`plans:plus_annual`). No monthly option at launch.
**Cost to serve:** ~$3–7 / member / year (Stripe ~$1, AI tasks $1–4 with the allowance cap, notifications, refund allowance). Gross margin ≥ 72%.
**Why this price:** removes the buy decision; the subscription is a booking engine. Success metric = **bookings per member per year**; target ≥ 3 (each ≈ $20 to the platform at a $150 occasion). Review at 12 months; if < 1.5, Plus is a retention tool, not a product.
**Not a discount club.** No member pricing, no "up to 50% off." Ledger `2026-08-27-plus-no-discounts` reaffirms.

---

## 4. Pro — supply-side membership

| Tier | Includes | Price | Key |
|---|---|---|---|
| **Free** | claimed storefront `/s/:handle`, attributed short-links (rails rate on own-sourced bookings), Publish/Promote, Money station | — | — |
| **Pro** — *free during beta until 2026-12-31, price shown struck through* | one-band commission step-down · neighbourhood demand view (wanted slots, trend, lead-time) · priority in the feed anchor slot when eligible · early listing of occasion inventory · storefront analytics | **$29 / month** | `plans:pro_monthly` · `provider:pro_band_step = 1` |

Pays for itself on one booking a month at the step-down. Demand view is the pitch — "12 travelers asked for a kaiseki host in Gion this month."

---

## 5. Fees (per event)

| Revenue event | Payer | Rule | Key | Value | Status |
|---|---|---|---|---|---|
| Traveler service fee | traveler | 7% of booking, cap $25; waived on provider-attributed short-link bookings and under Trip Pass | `traveler:service_fee_pct`, `traveler:service_fee_cap_cents` | 0.07 / 2500 | **set** |
| Provider commission (platform-sourced) | provider | by risk/insurance band | `provider:band_limited/moderate/commercial/premium` | 0.12 / 0.08 / 0.06 / 0.04 | **set** |
| Provider commission (rails) | provider | own-sourced via short link; repeat pairs automatically rails | `provider:rails_rate` | ~0.08, admin-configurable | **set** |
| Expert commission | expert | by category risk band | `expert:band_limited/moderate/commercial/premium` | 0.12 / 0.08 / 0.06 / 0.04 | **set — verify keys match the resolver** |
| Affiliate margin | partner | per partner | `affiliate:<partnerKey>` | 4–12% | **verify rows exist per registered partner** |
| Optimization run | traveler | per run | `optimization_fees` table · `getFee(eventType,tier)` | admin-set tiers | **exists — canonical, NOT `fee_bands`** |
| AI Concierge task | traveler | per task | `concierge:ai_task` | **$2.99** | **new** |
| Booking Concierge facilitation (Model B) | traveler | % of facilitated amount, capped | `concierge:booking_pct`, `concierge:booking_cap_cents` | **5% / $40** | **new** |
| Done-for-you deposit | traveler | % of quote at acceptance | `concierge:done_for_you_deposit_pct` | **20%** | **new** |
| Ready-made trip purchase | traveler | listing price; platform cut by the author's expert band | `ready_made:platform_band = expert band` | inherits | **new (rule, not a number)** |
| Trip Pass | traveler | per trip | `plans:trip_pass` | **$19** | **new** |
| Plus | resident | annual | `plans:plus_annual` | **$25** | **new** |
| Pro | expert/provider | monthly | `plans:pro_monthly` | **$29** | **new** |
| Data resale | B2B | contract | — | — | contingent on counsel (ToS/provider agreements) |

---

## 6. Bundles (combinations of existing purchases)

| Bundle | Contents | Price rule | Sold at |
|---|---|---|---|
| **AI + one local revision** | optimization run + one revision by the ready-made author or chosen expert | run price + expert's revision price, one checkout | ready-made detail ("Ask {name} for one revision"), review page |
| **Ready-made + the builder** | the trip + a 30-min call with its author | listing + author's call price | ready-made detail byline |
| **Occasion kits** | experience template pre-loaded with REQ categories + a coordinator | deposit model | `/experiences/:slug`, Finalize → Done for you |
| **Trip Pass upsell** | offered at the second paid AI action on a slip | $19 | inline at the paid gate |
| **Plus upsell** | offered when a resident (home city set, or 2+ occasion-template trips in one city) completes a booking | $25 | post-booking, frequency-capped |

---

## 7. Surfaces that sell (and what's missing)

| Surface | State | Needs |
|---|---|---|
| `/pricing` | exists in footer; contents unaudited | rebuild as the four-column ladder + Plus + Pro, reading `plans` and `fee_bands` rows; earn grammar · **add nav link (right-side cluster, plain text, next to Ways to Earn), same route as footer** |
| Finalize popup (slip) | not built (R-C) | the four choices with the current slip's numbers; ships with the cart-is-slip lane |
| Optimize dialog fee line | built | reads `optimizer:run` |
| Concierge panel (feed) | built (`Optimize`) | reads `concierge:ai_task` |
| Trip Pass offer | none | inline at second paid action |
| Plus | none | landing "occasions" section; profile home city; `/plus` |
| Pro | none | `/earn` per-market demand teaser; expert/provider console Money station upsell |
| Expert `from $N` | built | expert-priced "Plan it for me" offering; band applies |
| Provider rails | built | Money station shows both rates |

---

## 8. Build lanes this map creates

1. **`fee_bands` + `plans` rows** (Claude Code, money path): the nine new keys with values above, `as-of`, review date; resolver reads; fee-literal guard extended to the new keys; pricing page reads rows. Ledger `2026-08-27-pricing-map`.
2. **`/pricing` rebuild** (Replit, client): four-column ladder, Plus, Pro; earn grammar; every number from rows.
3. **Occasions schema + scheduled draft slip** (Claude Code): `home_city`, `occasions`, the 14-day job on the AI-task rail, resident mode on the feed.
4. **Trip Pass + Plus + Pro checkout** (Claude Code, money path): Stripe products, entitlement flags, allowance counters, early-access window.
5. **Finalize popup** — folds into `cart-is-slip` as its last commit.

Order: 1 → 2 → 5 → 3 → 4.

---

## 9. Ledger rows (append on ratification)

- `2026-08-27-optimizer-pay-per-use` — the optimizer and AI Concierge are pay-per-use for every account, including free; no tier gates them. Trip Pass and Plus only change the price (bundled / allowance), never the access.

- `2026-08-27-pricing-map` — this document supersedes plan §3–4; all prices are rows.
- `2026-08-27-two-calendars` — trips are sold per trip (Trip Pass); occasions are sold annually (Plus); supply is monthly (Pro).
- `2026-08-27-plus-occasions` — Plus is the occasions membership at $25/yr; success metric bookings/member/year ≥ 3; not a discount club.
- `2026-08-27-pro-supply` — Pro at $29/mo with one-band step-down and the demand view.
- `2026-08-27-concierge-fees` — run $4.99, task $2.99, facilitation 5% cap $40, done-for-you deposit 20%. **Run price amended to $5.99 by `2026-09-02-optimizer-run-price`** (decision-maker ruled; `optimization_fees` migration 076 already priced it there and `/pricing` displayed it — the $4.99 was never applied). Task, facilitation and deposit unchanged.
- `2026-09-02-memberships-checkout-start` — the memberships checkout lane (Stripe products for Trip Pass, Plus and Pro; subscription webhook writes `plan_memberships`) **starts 2026-10-01**. Plus sales still gate on `PLUS_SALES_ENABLED`; Pro bills from `beta_free_until` (2026-12-31).
- `2026-08-27-anchor-and-pass` — per-use is the anchor, the pass is the value; the pass is offered at the second paid action with the fee-waiver saving shown; per-use prices are never raised to push the pass.
- `2026-08-27-trip-pass-19` — Trip Pass $19; Plus excludes a Trip Pass; Pro step-down is one band.
- `2026-08-27-pro-beta-free` — Pro ships visible at $29/mo with `plans.pro_monthly.beta_free_until = 2026-12-31`; price struck through, "free during beta" on every Pro surface; entitlement granted to all approved experts/providers until the date, then to subscribers. One row changes at the date; nothing is built then.
- `2026-08-27-pricing-nav` — **Corrected 2026-08-26 (build lane ruling):** the right-side utility cluster does not hold `Ways to Earn`, so a `Ways to Earn · Pricing · Sign In` right-cluster placement is not possible as written. Pricing ships as a plain, no-icon **main-nav leaf beside `Ways to Earn`** in `client/src/lib/nav-config.ts`'s `navGroupsConfig`, not a dropdown; same `/pricing` route as the footer link; the nav leaf and the page ship together in the `/pricing` build lane.
- `2026-08-27-pricing-surfaces` — prices render only on: the pass-offer sheet, the Finalize popup, `/pricing`, the landing Occasions section, the Money station / `/earn` Pro band, and the two existing paid-gate fee lines. Visual of record: `docs/design/pricing-surfaces-mock.html`.

## 10. Pricing logic (ratified)
- **Per-use is the anchor, the pass is the value.** Per-use stays low ($5.99 / $2.99) so the first paid action is a curiosity purchase. The push to the pass happens at the **second** paid action on a slip, with three numbers shown: what this action costs per use, what the Trip Pass costs, and what the service-fee waiver saves on the current cart. Never raise per-use to force the pass.
- **The free tier's price is the 7% service fee.** The Trip Pass waives it on that trip's bookings; that line leads the offer.
- Plus is pushed by the first delivered occasion draft, not by pricing pressure.

## 11. Decisions closed at ratification
- Trip Pass **$19** (revisit at 90 days against second-action conversion).
- Plus does **not** include a Trip Pass at launch (keep the two calendars separate; revisit with bookings/member data).
- Pro step-down: **one band** (e.g. 0.12 → 0.08); flat-points variant rejected as unreadable on the Money station.
