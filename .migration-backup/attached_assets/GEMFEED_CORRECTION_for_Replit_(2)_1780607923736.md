# Gem Feed Correction — Discover-by-Location must match Discover-by-Date

**Attach `gem_feed_reference__2_.html` and `kyoto_city_feed_combined.html` to this task. Read the entire brief before writing any code, then work in phase order. Use the HTML files as the visual target.**

---

## The principle (read this first — it explains every change below)

There is **one card system** and **one complement-matching engine**. The location feed and the date feed are the **same marketplace surface** rendered through it. They differ only in the sort/filter applied on top — **not** in how a card looks or what it cross-sells.

- **Discover by date** already does this correctly. In `kyoto_city_feed_combined.html`, the Suiran stay card shows an inline match: `🚗 matched: private car from Kyoto Station · ¥9,000` with a **Book both** button. A photo spot shows a matched photographer; an attraction shows a matched guide.
- **Discover by location** does **not**. Today it renders a uniform grid of bare content cards — a marquee hotel appears with **no** private-car recommendation, no bento layout, no complements.

The fix is **not** to bolt complements onto a separate location-feed card. The fix is to make the location feed **consume the exact same components and matching logic** the date feed already uses. Every card is a cross-sell surface; the discovery lens on top is the only thing that changes.

### Two defects to correct
1. **Layout.** Location feed uses a uniform equal-card grid. It must use the **BENTO grid**: varied spans, with span-2 marquee/row tiles alternating with half tiles. Not equal rectangles.
2. **Complements.** Location cards render content only. **Every primary card must carry a `.match` strip** pairing it with a bookable complementary service, plus a trip-level "Complete your trip" complements strip below the feed.

---

## Phase 0 — Audit (do this before changing anything)

Do not assume filenames. Locate and report:

1. The component that renders the **location / city feed** and the grid container it uses. Grep for the feed route and grid classes:
   - `grep -rn "grid-cols" client/src` (find uniform grids in feed components)
   - `grep -rn "CityFeed\|LocationFeed\|DiscoverFeed\|cityFeed\|gemFeed" client/src`
2. The **card component(s)** the feeds render. Determine whether a shared `GemCard` (or equivalent) already exists, or whether the location feed has its own divergent card.
3. The **date feed** components — these already render the `.match` strip correctly and are your **reference implementation**. Reuse them; do not fork a parallel card.
4. Where complement/match data comes from today (a `matchedService`, `complement`, or similar field on the gem, or a service that resolves it). Grep:
   - `grep -rn "match\|complement\|crossSell\|matchedService" client/src server/src`

**Report back before Phase 1:** which component renders the location feed, what grid classes it uses, whether a shared card exists, and where match data lives. If a shared card and match logic already exist (used by the date feed), the rest of this brief is mostly *deleting the location feed's divergent code and pointing it at the shared pieces.*

---

## Phase 1 — Unify the card

- Both feeds **must render the same card component**. If the location feed has its own card, **replace it** with the shared one used by the date feed. Delete the divergent card.
- The shared card supports, per the reference:
  - a compact fixed-height image placeholder (`.ph`, ~104px tall in column layout, 96px wide in row layout) — **never** a giant tile that stretches the card,
  - a type tag (Stay / Eat / Do / Attraction / Photo spot / Landmark / Marquee),
  - a booking badge reflecting source: **green** `Book on Traveloure` (platform provider), **blue** `via {Partner}` (affiliate), grey `Not bookable`, orange `🔥 Trending now`,
  - an optional `.match` strip (Phase 3),
  - actions: **every** card has `+ Add` and `💬 Ask`; bookable cards add `Book` / `Reserve` / `Book entry` with the matching badge colour.

## Phase 2 — Bento layout

- Replace the uniform grid with the bento grid from the reference:
  - container: `display:grid; grid-template-columns:1fr 1fr; gap:12px`,
  - marquee / featured / day-trip items get `grid-column:span 2` and render in **row** layout (`.card.row`),
  - half tiles fill the two columns.
- **Distribution rule:** never two neighborhood containers back-to-back. Break them up with loose gems, an expert card, an event, or a complement. The flat city-level pool is distributed as breakers, not dumped in one trailing block.
- Neighborhood containers (`.nb`) are **siblings**, never nested. (e.g., Kibune is its own container, not inside Arashiyama.)

## Phase 3 — Complement matching (the core fix)

For each gem, resolve a complementary bookable service by type and render it inline as a `.match` strip. Prefer a **platform provider** (green badge); fall back to an **affiliate** (blue badge). **Do not** let display order override a genuinely better recommendation.

| Gem type | Matched complement | Action label | Badge |
|---|---|---|---|
| Stay / hotel / ryokan | Private car / airport transfer | **Book both** | platform if available, else affiliate |
| Photo spot / scenic landmark | Photographer | **Book shoot** | platform |
| Attraction / temple / palace | Guide (temple / day) | **Book guide** | platform |
| Day trip | Day guide | **Book guide** | platform |
| Eat / restaurant | Reservation | **Reserve** | affiliate (`via OpenTable`) |
| Event | Tickets | **Tickets** | affiliate (`via Fever` etc.) |
| Neighborhood (container head) | Add a day | **+ Add a {area} day** | — |
| Not-bookable landmark | "a photographer covers this spot" | **Book shoot** | platform |

- The `.match` strip is a dashed-top row: `{icon} matched: {service} · {price}` + the action button. Two strips are allowed (e.g., price/badge line, then matched-service line) as on the day-trip and attraction cards in the reference.
- If no complement exists for a gem, render no strip — but the gem still shows its own booking badge and `Add` / `Ask`.

## Phase 4 — Trip-level complements strip

Below the feed, render the **"Complete your Kyoto trip · complements any itinerary"** strip: compact add-on cards for trip-level logistics that are wired but otherwise invisible (airport transfer, eSIM, travel insurance, luggage storage), plus **content-driven** complements pulled by the hero trend (e.g., kimono rental `↑ for blossom season` when cherry-blossom is the active season). Compact cards signal add-ons, not content gems.

---

## Verification (run after each phase)

- `npx tsc --noEmit` — zero new type errors.
- `grep -rn "grid-cols" client/src` against the feed component — the uniform grid should be **gone** from the location feed.
- Visual: load the location feed. Confirm (a) bento layout with at least one span-2 marquee row, (b) the marquee stay shows a matched private-car `Book both` strip, (c) a photo spot shows `Book shoot`, (d) an attraction shows `Book guide`, (e) the trip-level complements strip renders below.
- Confirm the **date feed still works** and renders identically to before — you reused its components, so it must not regress.

## What NOT to do

- ❌ Do **not** create a second card component for the location feed. One shared card, both feeds.
- ❌ Do **not** keep the uniform `grid-cols-N` layout. Bento spans are mandatory.
- ❌ Do **not** hardcode complements into the location feed only — the matching logic is shared and type-driven.
- ❌ Do **not** nest neighborhood containers, or stack two containers back-to-back.
- ❌ Do **not** use giant image tiles that stretch cards. Compact fixed-height placeholders only.
- ❌ Do **not** reorder so platform providers always win — match to the genuinely better complement; the badge reflects the source, the ranking reflects quality.
