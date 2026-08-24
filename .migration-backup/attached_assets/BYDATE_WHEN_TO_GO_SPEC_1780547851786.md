# Traveloure — By-Date "When to Go" Page Spec

**What it is:** the temporal twin of the by-location feed. For a month/timeframe it answers three questions — *where's at its best* (seasons), *what's happening* (all-source events), *what to book around it* (time-relevant content). The time-axis of discovery, and a third entry into the unified planning flow.
**Surface:** Discover → Events tab (`/discover?tab=events`), rendered by `GlobalCalendar` → `GET /api/travelpulse/global-calendar` (`content.routes.ts:4715`).

---

## 0. Fix the blocker first (or none of this shows)
The handler joins cities↔seasons on `cityName-country`, but `destinationSeasons` is stored **country-level (`city = NULL`)** by the seed. Keys never match → `if (!season) return null` drops every city → empty page.
- **Match seasons by country** (with a city-level override if a city-specific season exists).
- **Loosen the gate:** include a city if it has **a season OR events** — don't drop a city with real events just because seasonal data is missing.
This single fix unblocks **Layers 1 and 2**. (Fever is not the issue — events insert as `approved`; the join was hiding everything.)

---

## Layer 1 — Best time to visit (the "when")
- **Source:** `destinationSeasons` — `rating`, `averageTemp`, `rainfall`, `crowdLevel`, `priceLevel`, `weatherDescription`, per `month`, per country. *(Already populated by the seed + TravelPulse/Grok generation; surfaced once the join is fixed.)*
- **Present it as intelligence, not a list:** per destination, the month rating + why — "Kyoto · April → 9/10 · cherry blossoms · mild · moderate crowds · prices high." A best-months signal.
- **This is the differentiator** — it turns "what's on" into "when should I go." Rank destinations for the selected month by season rating ("at their best right now").

## Layer 2 — What's happening (all-source events)
- **Source:** `destinationEvents` — **multi-source via `sourceType`**: `system`/seed (Cherry Blossom, Gion Matsuri…), TravelPulse/Grok-generated, **`fever`** (concerts/nightlife/exhibitions), and manual. Filtered by `startMonth = month` AND `status = 'approved'`.
- **Source-agnostic to the user** — festivals, holidays, seasonal, ticketed events all appear together. **Fever is one source, not the only one.**
- Each event: name · type · dates · the matched booking action (Tickets via the source) + **Add to experience (on the date)** + Ask an expert.

## Layer 3 — What to book (time-relevant content) — reuses the matching engine
- **Source:** the **matching system** (see `MATCHING_SYSTEM_SPEC.md`), filtered by **time instead of place.** Given a month/season/event, surface bookable gems/services/experiences relevant to that timeframe: cherry-blossom photo tours in April, a Gion Matsuri viewing package in July, ski in winter, an onsen in autumn.
- It's the **same match resolver** that powers the by-location feed — just keyed on time. (By-location filters supply by *place*; by-date filters by *when*.)
- Each item carries the full action grammar: **Book / Add to experience / Ask an expert**, with bookability badges.
- **New work:** the matching engine needs a **time/season filter** (match content to a month/season/event). This is the one net-new capability beyond the join fix.

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

## Connection to the marketplace
- **By-location (Discover feed) + By-date (this page) = the two discovery axes** (the original IA split). Both are entries into the same **Cart → optimize → PlanCard** flow.
- This page is the **primary surface of the location-intelligence backbone** — seasons + events + trends are the "when to go" intelligence; the feedback loop (what gets booked, when) sharpens which times/events trend.
- Adding a time-relevant item or an event routes into the **same Trip/cart** as everything else — so the by-date page isn't a dead-end calendar, it's a planning entry.

---

## Data sources — exists vs build
| Layer | Source | State |
|---|---|---|
| 1 — best time | `destinationSeasons` (rating/weather/crowds/price ×month) | **exists**, seeded country-level + Grok; **needs the join fix** |
| 2 — events | `destinationEvents` (multi-source: system/grok/fever/manual, `approved`) | **exists**, multi-source; **needs the join fix** + broader coverage |
| 3 — time-relevant content | matching engine + **time/season filter** | matching engine specced, **not built**; the time filter is net-new |

## Open items
1. **The join fix** (§0) — prerequisite for Layers 1 & 2.
2. **Season + event coverage per active market** — seeded for Japan/Italy/Thailand/France/Morocco (Kyoto = Japan ✓); Grok generation should fill the rest for all active markets, not just the 5 seeded.
3. **Matching engine time filter** (Layer 3) — add a season/month/event dimension to the match resolver.
4. **Gate loosening** — a city with events but no season must still appear (§0).
5. **Best-time presentation** — design the season-rating signal (a month heat per destination) so Layer 1 reads as guidance, not data.

---

*The by-date page is the "when to go" surface — best destinations this month + all-source events + time-relevant content to book — built on the location-intelligence backbone, reusing the matching engine on a time axis, and feeding the same unified planning flow as the by-location feed.*
