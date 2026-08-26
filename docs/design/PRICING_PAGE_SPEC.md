# /pricing page spec (frame 3)

**For:** `lane/pricing-page` · transcribe this, not a screenshot. Visual grammar = the earn-grammar mock already in the repo (`docs/design/marketplace-experts-earn-grammar-mock.html`): same `--earn-*` tokens, Fraunces headings, Geist Mono numbers/labels/eyebrows, Inter body, coral once per section. Every number is a live-row read via the `/api/pricing` bundle — no literals.

Land this file into `docs/design/` as the lane's first commit so the source is in-repo.

---

## Layout, top to bottom

### Band header
- Palmtree tile (36px teal-wash), coral mono eyebrow `PLAN IT YOUR WAY`, Fraunces 30 "Plan it your way", one-line sub: "Yourself, with AI, with a local, or done for you. Every AI action is pay-per-use — no membership needed."

### Four columns (the ladder)
Grid of 4; column 3 (Trip Pass) is highlighted (teal border + teal-wash glow). Each column: mono eyebrow, Fraunces name, big mono price, a checklist (mono ticks), one button pinned to the bottom.

| Col | Eyebrow | Name | Price (source) | Checklist | Button |
|---|---|---|---|---|---|
| 1 | `YOURSELF` | Plan it yourself | **Free** | slip · browse · `Book now` · `{serviceFeePct}% fee, cap ${serviceFeeCap}` waived on provider links | outline `Start planning` |
| 2 | `WITH AI · PAY PER USE` | Plan with AI | **${optimizerRunDisplay}** / run · sub `${aiTaskCents→$} / task` | 3 versions around an anchor · re-time / fill / stitch · charged at confirm | outline `Optimize a plan` |
| 3 (hl) | `BEST FOR ONE TRIP` | Trip Pass | **${tripPass}** / trip | unlimited runs & tasks on that slip · one local revision · no service fee on its bookings · usually pays for itself | **teal** `Get a Trip Pass` |
| 4 | `WITH A LOCAL` | Plan with a local | **set by each expert** (no number) | a named expert takes your slip · reviews, re-routes, books · events: quote · {doneForYouDepositPct}% deposit | outline `Find a local expert` |

- Column 2 price = `optimizerRunDisplay` (server `getFee(null,"simple")`, currently 599 → "$5.99"); AI task from `aiTaskCents`.
- Column 4 has **no price number** — "set by each expert", links `/experts`. The expert-priced consultation isn't a platform row.
- Mono keyline under the grid: the row keys used (documentation only).

### Plus band (`--earn-ground` panel, 2-col)
- Left: coral eyebrow `PLUS · FOR THE CITY YOU LIVE IN`, Fraunces 28 "A plan arrives before every date that matters.", the occasions paragraph, big mono `${plusAnnual}` / year, four benefit lines (draft slip 14 days before · priority local-expert response (their time, their price) · 48h early access · 4 concierge tasks/mo), coral `Join Plus · ${plusAnnual}/year`.
- Right: three occasion cards (Birthday / Anniversary / Date night) — tinted gradients, mono tags, one line each. Illustrative until the member has a home city.
- Note: "Not a discount club" — no member pricing on this band.

### Pro band (2-col, beta-free)
- Eyebrow `FOR EXPERTS & PROVIDERS`; a gold `FREE DURING BETA · UNTIL {proMonthly.betaFreeUntil}` pill top-right.
- Left: price = `$29` struck through + `$0` + mono "/ month during beta" (from `proMonthly.priceCents` + `betaFreeUntil`); one line; teal `Turn on Pro · free`.
- Right: rate table (mono rows):
  - Your commission on platform-sourced bookings: `{proRateStandard}%` struck → **`{proRateStepped}%`** (green)
  - Own-sourced via your short link (rails): `{railsRate}%`
  - Demand view · wanted slots, trend, lead-time: `included`
  - Priority in the feed anchor slot · early occasion listings: `included`

---

## Data bundle (`GET /api/pricing`, server-resolved, no secrets)
```
serviceFeePct, serviceFeeCapCents,
optimizerRunDisplay,           // getFee(null,"simple") formatted
aiTaskCents,
tripPass, plusAnnual,          // plans rows
proMonthly:{priceCents, betaFreeUntil},
proRateStandard, proRateStepped, railsRate,   // provider bands + step
doneForYouDepositPct
```
Test: change a `plans` row → the endpoint value changes → the page changes.

## Coral count
One coral CTA per band: `Get a Trip Pass` (ladder), `Join Plus`, `Turn on Pro`. Each band is its own section, so one-per-section holds.

## Buttons route or stub only
No Stripe, no purchase, no entitlement this lane. `Get a Trip Pass` / `Join Plus` / `Turn on Pro` route to a stub or the future purchase entry; `Start planning`→planner, `Optimize a plan`→a trip, `Find a local expert`→`/experts`.

## Nav
Plain `Pricing → /pricing` leaf beside `Ways to Earn` in `client/src/lib/nav-config.ts` (where Ways to Earn actually lives — main nav leaf, not the utility cluster). Footer already `/pricing`. Testids auto-assigned (`link-nav-pricing`, `link-mobile-pricing`).

## Delete
The legacy hardcoded `Free`/`Power Pass`/`Enterprise` array, the hardcoded optimize/coordination prices, the comparison table and FAQs that repeat retired claims. No price literal remains in `pricing.tsx` (grep proof in the commit).
