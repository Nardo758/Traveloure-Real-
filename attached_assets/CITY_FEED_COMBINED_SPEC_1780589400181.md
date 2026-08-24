# Traveloure — City Feed Spec (Combined, Date-Aware)

**Supersedes the "two modes" framing.** There is **one city feed**, reached by place (by-location browse) or time (by-date calendar → city click). The date is an **optional enhancement**, not a second layout. Route: `/discover/location/{city}` (`discover-location.tsx`). Visual target: the combined mockup.
**Two requirements this spec foregrounds:** (1) neighborhoods **blend** seamlessly with the rest of the content; (2) every content card carries a **crisp, real photo.**

---

## 1. One date-aware feed (no modes)
The feed is always the same component. A date (when present) toggles exactly three things:
1. **Hero chip** — a dismissible "Planning {date}" pill in the hero; the × clears the date → plain feed.
2. **Highlights row** — an "On {date}" strip near the top (pinned event + a seasonal booking or two), woven into the feed, not a separate section.
3. **Date-aware actions** — "Add to {date}" replaces generic "Add"; added items carry `scheduled_date`.
No date → none of the three appear; the feed is the plain city marketplace. Same layout either way.

---

## 2. The blend — neighborhoods ↔ everything else (REQUIREMENT)
The feed is **one continuous stream**, not stacked labeled sections. Neighborhood containers and loose content must read as a single feed.

- **Same card language everywhere.** A gem inside "In Arashiyama" and a loose city-level gem use the **identical card design** (same bento tiles, image treatment, badges, action grammar). The *only* difference is that a container adds a light header + grouping wrapper. Crossing from in-container → loose gem → next container feels seamless, not like switching modules.
- **Interleave, never stack.** Two neighborhood containers are **never adjacent.** Between any two, weave loose content — city-level gems, an expert card, a complement, the date highlights. The feed alternates heavy (container) / light (loose) for rhythm.
- **Continuous bento.** The container's nested bento and the loose-content bento share one tile system (full-width marquee, half tiles, alternating rows). Spacing and rhythm are uniform across the whole feed so there are no hard "section walls."
- **Light container headers, not heavy dividers.** A neighborhood header is a slim band (name · "X to do" · Explore / Add-a-day), not a full-bleed divider that breaks the flow.
- **De-dup.** A gem appears in its container **or** loose, never both. Neighborhoods are always top-level containers, never nested in each other.
- **Type filter dissolves the blend** into a flat typed bento (Eat/Stay/Photo spots) — grouping melts, the card language stays.
- **Sparse markets:** when few neighborhoods are tagged, the stream is mostly loose gems — which is fine *because* the card language is shared; the feed still looks whole, not empty.

The test: scrolling the feed, you should never feel a jarring jump between "neighborhood module" and "other stuff." It's one marketplace, grouped where useful.

---

## 3. Crisp pictures (REQUIREMENT)
The feed is **photo-led** — the image is the hook, not decoration. Every content card leads with a real, crisp photo. No permanent icon blocks or empty placeholders.

- **Sourcing pipeline** (via `media-aggregator.service`): `google-places-photos` for POIs/gems → provider-uploaded images for services → event-source images for events → `unsplash`/`pexels` as fallback. A card never ships icon-only; if all sources fail, hide the card rather than show a hollow one.
- **Quality bar:** pull the **highest-resolution source available**; never upscale a small image (causes blur/pixelation). Crop with `object-fit: cover` to the card's fixed aspect ratio — never stretch or letterbox. Serve **retina (2x) via `srcset`/`sizes`** so images are crisp on high-DPI screens.
- **Consistent aspect ratios** per card type (keeps the bento clean): neighborhood hero ~16:9; standard gem card ~4:3; full-width marquee ~21:9 or 3:1 banner; complement card small square thumb. Fixed ratios prevent layout shift.
- **Loading:** transient **blur-up (LQIP) or skeleton** only while loading; lazy-load below the fold; cap delivered dimensions to the rendered size. The placeholder is *never* the final state.
- **Accessibility & performance:** descriptive `alt` per image; `loading="lazy"`; width/height set to reserve space (no CLS); modern formats (WebP/AVIF) where available.

The mockup's icon tiles are stand-ins — production cards are real photographs at these ratios, sharp on retina.

---

## 4. Feed structure (top → bottom)
1. **Hero** — city, pulse, best-time/season signal, and (if dated) the "Planning {date}" chip.
2. **On {date} highlights** (only if dated) — pinned event + seasonal bookings, slim, woven in.
3. **Spine filters** — All gems · Eat · Do · Stay · Experts · Events · Photo spots (+ vibe).
4. **The blended stream** — neighborhood containers interleaved with loose gems, expert cards, complements (per §2), in shared bento with crisp photos (per §3).

---

## 5. Card model
Typed anchors (neighborhood · attraction · eat · stay · photo-spot · event · wellness · experience · hidden-gem). Each card: **crisp photo** + type tag + name + **matched service** (via the matching engine: photo→photographer, stay→car "Book both", attraction→guide, restaurant→reserve, neighborhood→expert) + **action grammar** (Book / Book-on-{partner} / Tickets / none + Add[/to {date}] + Ask) with **bookability badges** (green platform / blue affiliate / grey not-bookable) + **trending badge** (data-driven). Bento: varied spans, alternating, never uniform.

---

## 6. Data, behavior, connections (carried from prior specs)
- **Data:** `travel_pulse_cities`, `destination_seasons`/`destination-trends` (hero + best-time), neighborhood + gem records, `provider_services` via the matching engine, experts via `lead-routing`, `destination_events` (date/Events), media via `media-aggregator`.
- **Matching:** the feed **consumes** matches (content→supply); the matching engine computes them (`MATCHING_SYSTEM_SPEC.md`).
- **Flow:** every Add/Book → Cart → optimize → PlanCard; dated Add sets `scheduled_date`; Ask-an-expert → `expert_request` → lead pipeline.
- **Trust:** platform-bookable surfaces first but never over a genuinely better match; relevance + quality rank, featured is a tiebreaker.

---

## 7. Build dependencies (the recurring prerequisite)
Renders the shell against the mockup regardless, but **populates correctly only if** the records carry: gems → `type`, nullable `neighborhood`, lat/lng, `bookability`, `matchedService`, `trending`, `vibe`, **`imageUrl`(s)**; services → `category` (→ `service_categories`), geo, `is_featured`, rating, **images**; experts → `destinations`, `specialties`. The blend needs `neighborhood` + `type`; the crisp pictures need real `imageUrl`s (or the media-aggregator wired to fetch them). Confirm these before build.

---

*One date-aware city feed: a continuous, photo-led marketplace where neighborhoods blend with loose gems, events, experts, and complements under one card language — date-enhanced when entered by time, and feeding the unified planning flow. The blend and the crisp imagery are requirements, not polish.*
