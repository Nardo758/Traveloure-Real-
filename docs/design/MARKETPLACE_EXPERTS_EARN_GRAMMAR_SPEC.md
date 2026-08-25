# Marketplace + Experts & Services — earn grammar (SPEC)

**Status:** ratified 2026-08-25 · **Visual of record:** `docs/design/marketplace-experts-earn-grammar-mock.html` · `audited@f06356f7`

This file is the transcription contract. The HTML mock is what the result must look like; this file is what an agent may and may not change to get there. When they disagree, the HTML wins on appearance and this file wins on scope.

---

## 0. Rulings (append to `docs/DECISIONS.md`, `[advisory]` unless marked)

| Slug | Ruling |
|---|---|
| `2026-08-25-marketplace-earn-grammar` | All public Marketplace and Experts & Services surfaces use the `--earn-*` token palette (`client/src/index.css:71-91`). Fraunces for editorial headings only; Geist Mono for labels and numbers; Inter for body and buttons. Emoji retired from mastheads. |
| `2026-08-25-nav-icons` | One source object (`NAV_LEAF_ICONS`, `client/src/components/layout.tsx`) feeds desktop dropdown, mobile sheet, and page mastheads. Map: Destinations `Palmtree` · Ready-Made `Gem` · Events `Ticket` · Services `ConciergeBell` · Service Providers `ShoppingBag` · Local Experts `Lamp` · Trip Planners `Waypoints` · Event Planners `Wine`. No `Send`/`Plane`/`Navigation`/arrow glyphs; no `Compass`/`Store`/`MapPin`/`Calendar` in a masthead. |
| `2026-08-25-surface-rail` | Every Marketplace band carries a four-link rail (Destinations · Ready-Made · Events · Services); every FIND HELP band carries a four-link rail (Providers · Local Experts · Trip Planners · Event Planners) replacing the role pills. Plain links to routes, current one filled navy — not a tab with state (`2026-08-23-marketplace-ungroup` holds). |
| `2026-08-25-two-field-search` | List surfaces use "What do you need help with?" + "Where are you going?" + Filters. "Where" pre-fills from `TripStrip` destination when a trip is in progress. Browse never writes: search filters the page, never mutates the trip. |
| `2026-08-25-card-family` | One card family across Services, Ready-Made, storefront, expert profile, destinations, city feed: photo (one tag + price/score) · title · meta · facts row (3 cols, mono) · source row · action row. Three action states: platform (`Book now` teal + `Add to trip` navy), affiliate (`Book on {Partner}` gold + `Add to trip`), not-bookable (`Add to trip` + `Ask an expert`). |
| `2026-08-25-card-source-link` | Every card and detail page links back to its source. Resolution: claimed handle → `/s/:handle`; expert without handle → `/experts/:id`; provider without handle → their `/providers` card; destination → lead local expert, else "Ask a trip planner". Affiliate items → partner label only, never a storefront (§13). Never plain text, never a dead link. |
| `2026-08-25-open-card-skeleton` | Every open card uses the ready-made detail skeleton: crumb → title block with byline → split hero → content panels → sticky action panel. Events body exempt. |
| `2026-08-25-events-as-designed` | `/events` body and calendar unchanged. Header adopts the shared masthead + rail only. |
| `2026-08-25-discover-shell-removed` | Legacy tabbed Discover shell (`!surface` mode, `?tab=`, `articles` tab) removed from `discover.tsx`. `/discover` stays redirect-only. |
| `2026-08-25-discover-transcribe-in-place` | `discover.tsx` is not split this cycle. Split filed as FOLLOWUP. |
| `2026-08-25-experts-tabs-three-roles` | Service Providers is a nav item and rail link, never an experts tab. `experts.tsx` stays three roles. |
| `2026-08-25-providers-directory-live` | Supersedes the "parked until ≥10 storefronts" ruling. `/providers` is live with honest per-market count and an empty-market state. Test accounts to populate ≥3 storefronts per launch market. |
| `2026-08-25-citycard-converge` | `CityCard` stays one component, two variants. `pulse` rebuilt on the family skeleton; `season` untouched. Consumers (`CityGrid`, `TrendingCities`, `GlobalCalendar`) unchanged. |
| `2026-08-25-city-feed-bento` | `/discover/location/:city` renders each neighbourhood as a bento grid: one 2×2 anchor (lead expert, else top ready-made), one 2×1 (ready-made), rest 1×1, complete rows. Bento decides shape only; `feed-composition-config` and demand engine decide membership and order. Inline feed cards replaced by family cards. |
| `2026-08-25-landing-after-marketplace` | Landing page restyle is lane 5, after lanes 1–4 land. |

`[guarded]` items ship in their lane: testid-count check per page; `tsc` new-error 0 against baseline; no `.css` under `client/src/pages`.

---

## 1. Tokens, type, icons

**Colours** — `--earn-*` only. No hex literals in JSX; no Replit `--ink/--paper/--coral/--line` vars. Mapping from artifacts CSS: `--paper`→`--earn-ground`, `--fg-card`→`--earn-card`, `--line`→`--earn-border`, `--ink`→`--earn-ink`, `--body`→`#3C4652` via `text-[#3C4652]` is **not** allowed — use `--earn-ink` at 85% or `--earn-muted`; `--coral`→`--earn-coral-ink`, `--teal`→`--earn-teal`, `--gold`→`--earn-gold`.

**Type** — `font-family` via existing Tailwind config or inline `style={{fontFamily}}` as `experts.tsx` does today:
- Fraunces 600: band title (30px), section heading (24px), detail title (40px), hero name (30px), panel h3 (18px).
- Geist Mono: eyebrows (10.5px, tracking .12em, uppercase), photo tags (9.5px), facts row values (13px/600) and labels (10px), prices (13px; 30px/600 in buy panel), counts/badges, rail links (12px/500), crumbs (11.5px), handles, fee lines, `.kv` rows.
- Inter: everything else.

**Icons** — lucide only, per `2026-08-25-nav-icons`. Masthead tile: `w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[var(--earn-teal-ink)]`, glyph 22px. Nav tile: 36px / 18px glyph.

**Coral** is the single primary CTA per panel (`Book on Traveloure`, `Get this trip`, `Plan with {name}`, `Optimize`). Teal is `Book now` / `View profile` on cards. Navy is `Add to trip` / `Add to cart` / `Plan this destination`. Gold wash is affiliate. Green is verified/positive. Never two coral buttons in one panel.

---

## 2. Shared patterns

### Band (every list surface)
```
[tile 42] [Fraunces title 30]                          [eyebrow: MARKETPLACE | FIND HELP]
          [one-line sub, --earn-muted 14px]            [rail: 4 links, current navy]
```
`py-[26px]` top / `pb-[22px]`, `border-b --earn-border`, white on `--earn-ground`. Same left edge on all surfaces (this is the Events header fix).

### Two-field search (list surfaces except Events)
`grid-cols-[1.4fr_1fr_auto]`: "What do you need help with?" · "Where are you going?" (pre-filled from `TripStrip` when present, shown right-aligned bold) · `Filters +` button. Maps to the page's existing query params; no new params.

### Chips
Only categories/themes/neighbourhoods with live stock; count badge mono; active = teal fill. Under the chips, mono caption: "Chips render only for … with live stock. Counts are real, never the full taxonomy."

### Section
Coral mono eyebrow with count (`FOOD & CULINARY · 9`) · Fraunces heading (editorial line, not the category name) · right: mono `31 matches · recommended` and/or `See all N →` coral.

### Card (family)
```
photo 140px  [tag top-left mono] [availability/score/price bottom-right or top-right]
body: [verified line green mono] title 15/600 · meta 12 · facts row (3 cols) · source row · action row
```
Facts row: `border-t --earn-border`, values mono 13/600, labels mono 10. Action row: `border-t dashed --earn-border-dash`, state line mono 9.5 uppercase (`BOOK ON TRAVELOURE` teal-ink / `BOOK ON TIQETS` gold-ink), two buttons equal width, `Ask an expert` link below.

### Open card (detail)
`crumb` (mono) → `dhead` grid `1fr 260px`: eyebrow + Fraunces 40 + lede | byline (source link, mono sub) → split hero `1fr 300px` → `two` grid `1fr 340px`: panels | sticky buy panel.

### Empty state
Dashed border, tile glyph, Fraunces 18 line, one sentence, one or two buttons that go somewhere. Never a blank grid.

---

## 3. Per-surface contract

### 3.1 `/services` — `discover.tsx` `surface="services"` (lane 1)
Band (ConciergeBell) · rail · two-field search · category chips · sections per category with editorial heading · family cards with 3 action states · source row per `card-source-link`.
**Preserve:** `/api/discover`, `/api/service-categories`, `/api/catalog/activities-gyg`, `/api/cart`; `ServiceCard` cart + comparison mutations; expert handoff params (`showExperts`, `destination`, `country`, `experienceType`, `tripId`, `startDate`, `endDate`, `source=quick-start`); the **load-bearing** testids only. **Testid contract (updated 2026-08-25, services commit):** the 66 pre-shell count fell to **59** when Phase 1 removed the legacy shell (retired `cta-how-it-works`, the 4 `tab-*`, `card-influencer-*`, `button-view-all-creators`). The services family-card rebuild retires **11** card DECORATION testids (`badge-heat-score`, `badge-hot`, `badge-top-expert`, `badge-reviews`, `img-provider-avatar`, `badge-expert-notes`, `badge-revisions`, `stat-reviews`, `stats-footer`, `stat-rating`, `text-provider-rating` — grep-proven asserted by **zero** playwright/`__tests__`/CI-gate specs) and adds the four-link `marketplace-route-*` rail. Net **52 rendered** (49 unique source identities — the rail is one `marketplace-route-${key}` id rendering 4 links). The card keeps its 7 load-bearing ids (`card-service`, `link-service`, `text-service-name`, `text-location`, `text-provider-name`, `link-provider-storefront`, `button-add-to-cart`); decoration ids were never behavior. The marketplace-surfaces gate (`discover-tabs.spec.ts`) is the arbiter of what is load-bearing.
**Needs from server (Phase 0 check):** seller `expertId`/`providerId` on discover rows so source link can resolve without handle. Add in-lane if absent.
**Remove:** `!surface` branches, `selectedTab`/`urlTab`, `TabsList`, `articles` `TabsContent`, dead imports.

### 3.2 `/ready-made` — `surface="packages"` (lane 1)
Band (Gem) · rail · theme chips (live stock only) · theme shelves (ratified `ready-made-by-theme`) · card: photo + market tag + price, coral mono theme eyebrow, title, `Kyoto · 7 days · by @handle` (always linked), role pill + `N stays · M items`, `Get this trip` teal full-width.
**Preserve:** `/api/ready-made` + `planType` filter, `/api/expert-templates`, `insideCounts` display, disabled-with-reason when `price_cents` null. **Server (added 2026-08-25, packages commit):** the `/api/ready-made` feed row now carries `authorId` (already-joined `readyMadeTrips.authorId`) so the card source-link resolves a handle-less author to their `/experts/:id` profile — never plain text (`card-source-link`). `insideCounts` (already returned) now surfaces on the shelf card as `N items`; there is no `stays` field, so the mock's "N stays" is not rendered (§13). **Testid contract unchanged** — the card keeps `rm-shelf-card-*` + `link-rm-author-*`; no id added or dropped this surface.

### 3.3 `/destinations` — `surface="travelpulse"` (lane 1 band; lane 3 cards)
Band (Palmtree) · rail · section "Cities with momentum this month" · `CityGrid` unchanged, `CityCard pulse` rebuilt (lane 3).

### 3.4 `/events` — `surface="events"` (lane 1, header only)
Band (Ticket) · rail. **Nothing else changes.** Empty state must render per §2 when the market has none.

### 3.5 `/services/:id` — `service-detail.tsx` (lane 1)
Open-card skeleton. Split hero: photo left with service-type tag; title panel right with coral eyebrow `PRIVATE EXPERIENCE · KYOTO`, Fraunces title, lede, verified pills, location + rating (mono). Panels: About (with 3-col facts), Good to know (2-col icon list), `More from @handle` (3 mini cards + `Open storefront`). Buy panel: price mono 30 · `per experience` · sub line · `Book on Traveloure` coral · `Add to cart` navy · `Contact provider` outline · Direct-booking box (green checks).
**Preserve:** booking handler, cart mutation (label chain Add → Added), contact navigation, storefront link, fee lines from resolver.

### 3.6 `/ready-made/:id` — shipped 2026-08-24 (reference; no lane)
Reference skeleton. Only change: byline `Built by {name} →` becomes a link per `card-source-link`.

### 3.7 Nav — `layout.tsx`, `nav-config.ts` (lane 2, phase 1)
`NAV_LEAF_ICONS` gets the eight entries; fallback stays `MapPin` for anything not listed. Desktop dropdown renders the tile + name + description; mobile sheet renders tile + name. Labels/hrefs untouched.

### 3.8 `/experts?role=…` — `experts.tsx` (lane 2)
Band (Lamp for local_expert; Waypoints for travel_expert; Wine for event_planner — tile follows `?role=`) · FIND HELP rail with live counts as mono badges (`/api/experts/counts`) **replacing** the role pill switcher · two-field search ("what" → specialty/experience-type, "where" → destination) · specialty + neighbourhood chips · section · shipped expert card + 3-col facts (`from $N plan it for me` · rating/reviews · offerings) · cross-sell shelf "Or start with a trip they already built" = `/api/ready-made` filtered by author ids on the page.
**Preserve:** `?role=` routing, `/api/experts` + counts, all filter state, load-more, `tab-role-*` testids re-homed onto the rail links (same ids), empty state for 0 results with "Find a trip planner instead".
**Exclude:** artifacts' 4th `service_provider` tab, `providerStorefronts` query.

### 3.9 `/experts/:id` — `expert-detail.tsx` (lane 2)
Open-card skeleton with hero: cover, avatar overlap, eyebrow `LOCAL EXPERT · KYOTO`, Fraunces name, handle line (mono) + `Identity verified`, bio, neighbourhood + language pills, facts row (offerings · rating · responds · since, mono). Body: `Choose your starting point` tabs All/Services/Templates/Ready-made · family cards. Sidebar: `PLAN IT FOR ME` panel (coral `Plan with {name}`, `Ask a quick question`, response time, consultation).
**Preserve:** expert + review queries, offering category switch, booking navigation, request-help-with-trip mutation, contact, consultation scheduling, claimed-storefront redirect. 11 literal testids + dynamic offering ids.

### 3.10 `/s/:handle` — `storefront.tsx` (lane 2) — **money page**
Same hero as 3.9 with eyebrow `SERVICE PROVIDER STOREFRONT` / `LOCAL EXPERT STOREFRONT`, `Verified business`. Body: `Book directly` (services) · `Guided itineraries` (templates) · `Buy the whole plan` (ready-made), search-this-storefront field. Sidebar: `Came from a provider link?` panel reading resolved attribution — `Traveler service fee: Waived`, `Repeat with this seller: Rails rate`.
**Preserve:** storefront query, provider/expert route distinction, redirects, message CTA, share clipboard, offering links, book handler (proof stops at confirm), server OG injection on `/s/:handle`. 30 literal testids + dynamic.
**Sidebar reads resolved values only; never computes fees.**

### 3.11 `/providers` — `providers-directory.tsx` (lane 2)
Band (ShoppingBag) · FIND HELP rail · two-field search · section `Providers · Kyoto · N` "Book the business directly" · experts-card grammar (initials avatar, name, location, honest rating "New" until reviews, category + neighbourhood pills, `Message` / `View storefront` teal) · `?market=` filter · empty-market state ("No providers in {market} yet" → `Browse {other} providers`, `Find a local expert`).
**Preserve:** `/api/provider-storefronts` only; link `/s/:handle`; 12 testids.

### 3.12 `CityCard` pulse — `components/travelpulse/CityCard.tsx` (lane 3)
Photo 130px: tag (priority: `dealAlert` coral > `alertCount` coral-bg > season/trend label), `Trend NN` score bottom-left mono, `✓ In your trip` green bottom-right when `inTrip`. Body: city Fraunces-free (15/600), meta `country · highlight` (coral text when alerts), facts row crowd · best time · experts (+ 4th `avgPrice ↓` green when `priceChangePct<0`), source row lead expert or "Ask a trip planner", action `Plan this destination` navy (opens existing trip-attach dialog) + `Ask an expert`.
**Drop from card:** `trendingSpots`, `hiddenGems`, `vibeTags`, `experiences[]`, `activeTravelers`, `Plane` icon (`CityCard.tsx:219,235`), `isHot` badge (Trend ≥ 85 implies it).
**Preserve:** `variant="season"` byte-identical; `onPrimary` dialog flow, `button-plan-now-*`, `button-add-to-queue-*`, `button-select-trip-*`, `button-sign-in-prompt`; `playwright/tests/discover-tabs.spec.ts` green. Add `density="compact"` prop for `TrendingCities` (photo 80, tag, score, title, one-line facts, no action row).

### 3.13 `/discover/location/:city` — `discover-location.tsx` (lane 4)
Band: Palmtree tile, coral mono eyebrow `DESTINATION · JAPAN · TREND 92 · CROWD HIGH`, city Fraunces 30, one-line sub, Marketplace rail. Two-field search (what pre-labelled "in {city}", where = city + dates from strip). Neighbourhood chips with counts. Per neighbourhood: section (coral eyebrow `GION · 6`, editorial heading, `See all in Gion →`) + bento.
**Bento:** `grid-cols-4 auto-rows-[172px] gap-[14px]`; anchor `col-span-2 row-span-2` = lead expert (dark gradient, eyebrow, Fraunces 28, lede, coral `Plan with {name} · from $N` + outline `View profile`), else top ready-made; one `col-span-2` ready-made (photo 40% + body); rest 1×1 tiles: service (family mini), partner ticket (gold), not-bookable viewpoint (dusk, green tag), wanted slot (dashed, gold eyebrow, `Offer this` / `Ask an expert`), concierge panel (`--earn-ground`, coral `Optimize`), earn/add-on panels. Fill complete rows; compute spans from item count.
**Replace:** inline `RecommendationCard`, `PackageCard`, `LeadExpertCard`, `FillerCard` with family cards; restyle `WantedSlotCard`, `EarnCard`, `AddOnAgentCard` to panel grammar.
**Preserve, untouched:** `feed-composition-config`, demand engine, floors (5/10/25 server-side), R16 predicate, R3 count suppression, all queries (`/api/discover/location`, `/api/experts`, `/api/expert-templates`, `/api/services/demand`, `/api/travelpulse/media`), neighbourhood grouping (`sections.push({type:"neighborhood"})`), hero section testids.

### 3.14 Landing — `landing.tsx` (lane 5, after 1–4)
Fraunces hero on `--earn-ground`; `TrendingCities` inherits lane 3; entry strip for the two dropdowns using the eight icons; any featured strip uses family cards. Spec'd in its own dispatch after lane 4.

---

## 4. Proof conditions (every lane)

- Root preview (port 5000) on real dev data, screenshot to `docs/design/<lane>/<surface>-ROOTPREVIEW.png`, nothing else committed under `docs/design/`.
- Behavioral: each preserved handler fires (cart chip in `TripStrip` updates; dialog opens; navigation lands; filters narrow results).
- `grep -c data-testid` per file equals the contract count; `tab-role-*` ids present on rail links.
- `tsc` new-error count 0 vs baseline; `.css` files under `client/src/pages` = 0; `grep -rn "Plane" client/src/components/travelpulse/CityCard.tsx` = 0.
- Money pages: proof stops at checkout confirm. Never complete a purchase.
- `TripStrip` and header untouched: `git diff --stat` shows no change to `layout.tsx` outside `NAV_LEAF_ICONS` (lane 2) and none to `trip-strip.tsx`.

## 5. FOLLOWUPS (file, never absorb)
- Split `discover.tsx` per surface.
- Custom-drawn icon marks (replace lucide set) — design task.
- Audit `TrendingCities` / `TravelPulsePanel` after lane 3.
- Test accounts: ≥3 provider storefronts per launch market.
- `artifacts/traveloure/` removal after lanes 1–4.
