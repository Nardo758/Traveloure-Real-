# Traveloure — By-Date "When to Go" Page Spec

**What it is:** the temporal twin of the by-location feed. For a month/timeframe it answers three questions — *where's at its best* (seasons), *what's happening* (all-source events), *what to book around it* (time-relevant content). The time-axis of discovery, and a third entry into the unified planning flow.

**Surface:** Discover → Events tab (`/discover?tab=events`), rendered by `GlobalCalendar` → `GET /api/travelpulse/global-calendar`.

---

## 0. Fix the blocker first (or none of this shows)

The handler joins cities↔seasons on `cityName-country`, but `destinationSeasons` is stored **country-level (`city = NULL`)** by the seed. Keys never match → `if (!season) return null` drops every city → empty page.

- **Match seasons by country** (with a city-level override if a city-specific season exists).
- **Loosen the gate:** include a city if it has **a season OR events** — don't drop a city with real events just because seasonal data is missing.

This single fix unblocks **Layers 1 and 2**. (Fever is not the issue — events insert as `approved`; the join was hiding everything.)

**Status:** ✅ **FIXED** (Commit bf93f45)

---

## Layer 1 — Best time to visit (the "when")

- **Source:** `destinationSeasons` — `rating`, `averageTemp`, `rainfall`, `crowdLevel`, `priceLevel`, `weatherDescription`, per `month`, per country. *(Already populated by the seed + TravelPulse/Grok generation; surfaced once the join is fixed.)*
- **Present it as intelligence, not a list:** per destination, the month rating + why — "Kyoto · April → 9/10 · cherry blossoms · mild · moderate crowds · prices high." A best-months signal.
- **This is the differentiator** — it turns "what's on" into "when should I go." Rank destinations for the selected month by season rating ("at their best right now").

**Status:** ✅ **COMPLETE** (Commit 7ec335d - visual polish with 9/10 suitability score + guidance summary)

---

## Layer 2 — What's happening (all-source events)

- **Source:** `destinationEvents` — **multi-source via `sourceType`**: `system`/seed (Cherry Blossom, Gion Matsuri…), TravelPulse/Grok-generated, **`fever`** (concerts/nightlife/exhibitions), and manual. Filtered by `startMonth = month` AND `status = 'approved'`.
- **Source-agnostic to the user** — festivals, holidays, seasonal, ticketed events all appear together. **Fever is one source, not the only one.**
- Each event: name · type · dates · the matched booking action (Tickets via the source) + **Add to experience (on the date)** + Ask an expert.

**Status:** ✅ **COMPLETE** (Commit 56e2365 - `eventsOnly` group for event-driven destinations)

---

## Layer 3 — What to book (time-relevant content) — reuses the matching engine

- **Source:** the **matching system** (see `MATCHING_SYSTEM_SPEC.md`), filtered by **time instead of place.** Given a month/season/event, surface bookable gems/services/experiences relevant to that timeframe: cherry-blossom photo tours in April, a Gion Matsuri viewing package in July, ski in winter, an onsen in autumn.
- It's the **same match resolver** that powers the by-location feed — just keyed on time. (By-location filters supply by *place*; by-date filters by *when*.)
- Each item carries the full action grammar: **Book / Add to experience / Ask an expert**, with bookability badges.
- **New work:** the matching engine needs a **time/season filter** (match content to a month/season/event). This is the one net-new capability beyond the join fix.

**Status:** ✅ **COMPLETE** (Commits d368a28, d1dcc26 - seasonal opportunities multiplier + time-aware matching)

---

## The Trend Layer — Turning history into best-time + trending (feedback-loop closure)

The best-time and trending signals should be **derived from accumulated data**, not static seed. The collection already exists; the **computation is the missing step.**

### Collected (already accumulating — grounded)

- **`destination_metrics_history`** — **appended** per TravelPulse refresh (`metricType`, `metricValue`, `recordedAt`): pulse, demand, etc. over time. Current state overwrites `travel_pulse_cities`; *history* accrues here. The right pattern is in place.
- **Behavioral analytics** — `search_analytics`, `booking_funnel_analytics`, `trip_analytics_enhanced` (`bookingDate`, `season`, `leadTimeDays`), `activity_booking_analytics`. Every search/booking is a timestamped row → seasonality/demand history captured as a byproduct.
- *Caveat:* history is only as rich as **refresh + traffic coverage** per market — sparse markets accumulate little; `service_demand_signals` expire in 24h and do **not** contribute (transient, not historical).

### Compute (the trend step to build — a scheduled aggregation job)

Read the time-series + analytics; compute, per destination:

- **Seasonality → real best-time:** which months people actually search, book, and rate highly → derived `bestMonths`, blended with (eventually replacing) the static country-level seed.
- **Demand growth → trending:** week-over-week / month-over-month change in searches/bookings/pulse → `demandGrowth` + `trendDirection`. This is the **owned "Trending now" signal**, vs the external SerpAPI/Grok point-in-time one today.
- **Rating/sentiment trend:** `destination_metrics_history` rating over time → rising/declining.
- **Lead-time pattern:** `trip_analytics_enhanced.leadTimeDays` → "book ~N weeks ahead" guidance per destination/season.
- **Output:** derived signals stored (a `destination_trends` aggregate, or onto the metrics) and read by the page. Append the job to the existing TravelPulse/cache scheduler.

### Powers

- **Layer 1 (best time):** seed/AI on cold-start → **data-derived `bestMonths`** as history accrues (blend: seed-heavy early, data-heavy as confidence grows).
- **Trending badge** (feed + by-date): from `demandGrowth` on your *own* time-series — real and owned, not a scrape.
- **Lead-time guidance** on the by-date page ("book 3 months ahead for cherry-blossom Kyoto").
- Sharpens **matching relevance** (Layer 3) — surface what's actually trending/seasonal.

### This closes the intelligence feedback loop

bookings/searches/behavior → time-series (collected) → **trend computation (this step)** → sharpened best-time/trending intelligence → feeds the by-date page, the trending badge, and matching → drives more bookings. The collection is built; this compute step is the **"learn" half that's been open** since the architecture diagram.

### Cold-start

Seed/AI best-times until a market has enough history; data-derived takes over **per market** as traffic accumulates. Never block on history — degrade to seed.

**Status:** ⏳ **FUTURE** (Requires TravelPulse scheduler integration + analytics aggregation)

---

## Composition (the page)

```
[ month / timeframe selector ]            (default: this month → next)

WHERE TO GO NOW            (Layer 1)
  destinations ranked by season rating · "Kyoto 9/10 · cherry blossoms"

WHAT'S ON                  (Layer 2)
  all-source events for the month · Tickets / + Add to a date

BOOK AROUND IT             (Layer 3)
  time-relevant gems/experiences (matching engine) · Book / + Add / Ask

→ tap a destination → by-location feed for that city
→ Book / Add to experience → Cart → optimize → PlanCard (the unified flow)
```

---

## Connection to the marketplace

- **By-location (Discover feed) + By-date (this page) = the two discovery axes** (the original IA split). Both are entries into the same **Cart → optimize → PlanCard** flow.
- This page is the **primary surface of the location-intelligence backbone** — seasons + events + trends are the "when to go" intelligence; the feedback loop (what gets booked, when) sharpens which times/events trend.
- Adding a time-relevant item or an event routes into the **same Trip/cart** as everything else — so the by-date page isn't a dead-end calendar, it's a planning entry.

---

## Data sources — exists vs build

| Layer | Source | State |
|---|---|---|
| 1 — best time | `destinationSeasons` (rating/weather/crowds/price ×month) | ✅ **exists**, seeded country-level + Grok; join fix applied |
| 2 — events | `destinationEvents` (multi-source: system/grok/fever/manual, `approved`) | ✅ **exists**, multi-source; gate loosened |
| 3 — time-relevant content | matching engine + time/season filter | ✅ **complete**, seasonal opportunities multiplier applied |
| Trend layer | `destination_metrics_history` + analytics aggregation | ⏳ **partial** (collection built, compute job missing) |

---

## Open items & Status

| Item | Status | Notes |
|---|---|---|
| 1. Join fix (blocker) | ✅ DONE | Commit bf93f45 |
| 2. Season + event coverage | ⏳ PARTIAL | 5/13 markets covered (38%); see MARKET_COVERAGE_AUDIT.md |
| 3. Matching engine time filter | ✅ DONE | Commits d368a28, d1dcc26 |
| 4. Gate loosening (events-only) | ✅ DONE | Commit 56e2365 |
| 5. Best-time presentation | ✅ DONE | Commit 7ec335d (9/10 suitability score) |
| 6. Trend-computation job | ⏳ FUTURE | Requires TravelPulse scheduler integration |

---

## Next Steps (Priority Order)

1. **Market coverage (Medium)** — Fill seasonal + event data for remaining 8 countries
   - Option A (Recommended): Grok generation (5-10 min)
   - Option B: Manual entry (4 hours)
   - See MARKET_COVERAGE_AUDIT.md

2. **Trend layer (Future)** — Build scheduled aggregation job over `destination_metrics_history` + analytics
   - Compute `bestMonths` (data-derived, blended with seed)
   - Compute `demandGrowth` (owned trending signal)
   - Feed back into Layer 1 + trending badge

3. **Test & iterate** — Verify all three layers work end-to-end in Replit/staging

---

*The by-date page is the "when to go" surface — best destinations this month + all-source events + time-relevant content to book — built on the location-intelligence backbone, reusing the matching engine on a time axis, and feeding the same unified planning flow as the by-location feed.*
