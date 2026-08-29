# Audit brief — Marketplace + Experts & Services Earn Grammar

**Mock:** `docs/design/marketplace-experts-earn-grammar-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-25-marketplace-earn-grammar` plus the 14 sibling rulings under it — `2026-08-25-nav-icons`, `2026-08-25-surface-rail`, `2026-08-25-two-field-search`, `2026-08-25-card-family`, `2026-08-25-card-source-link`, `2026-08-25-open-card-skeleton`, `2026-08-25-events-as-designed`, `2026-08-25-discover-shell-removed`, `2026-08-25-discover-transcribe-in-place`, `2026-08-25-experts-tabs-three-roles`, `2026-08-25-providers-directory-live`, `2026-08-25-citycard-converge`, `2026-08-25-city-feed-bento`, `2026-08-25-landing-after-marketplace`; supersession from `2026-08-27-bento-assembly-spec` for city-feed geometry
**Status:** spec-of-record pairing. **Authority ordering for this mock:** the HTML mock wins on VISUAL appearance; `docs/design/MARKETPLACE_EXPERTS_EARN_GRAMMAR_SPEC.md` wins on SCOPE and BEHAVIOR (what a lane may/may not change) when the two disagree. For the city-feed bento specifically, `docs/design/BENTO_ASSEMBLY.md` supersedes any prior bento geometry (including this mock's own), and `docs/design/lane4/BEHAVIOR_MATRIX.md` is the behavior oracle for that surface — treat both as companion oracles rather than re-deriving city-feed rules from this brief.
**Live surfaces:**
- `client/src/pages/discover.tsx` (`/services`, `/ready-made`, `/destinations`, `/events` — `surface=` variants)
- `client/src/pages/service-detail.tsx`, `client/src/pages/experts.tsx`, `client/src/pages/expert-detail.tsx`
- `client/src/pages/storefront.tsx`, `client/src/pages/providers-directory.tsx`, `client/src/pages/discover-location.tsx`
- `client/src/components/travelpulse/CityCard.tsx`
- `client/src/components/layout.tsx` (`NAV_LEAF_ICONS`)
- `playwright/tests/discover-tabs.spec.ts` (the marketplace-surfaces gate; arbiter of what testid is load-bearing)

## Behaviors the mock ratifies

1. All public Marketplace and Experts & Services surfaces use the `--earn-*` token palette only — no hex literals in JSX, no legacy `--ink/--paper/--coral/--line` vars (mapping table in SPEC §1). Emoji retired from mastheads.
2. Type grammar: Fraunces 600 for editorial headings only (band title, section heading, detail title); Geist Mono for eyebrows, facts-row values/labels, prices, counts, rail links, crumbs, handles; Inter for everything else.
3. **One source object** (`NAV_LEAF_ICONS` in `layout.tsx`) feeds the desktop dropdown, mobile sheet, and page mastheads — never three separately-maintained icon maps. Fixed lucide mapping per role (Destinations→Palmtree, Ready-Made→Gem, Events→Ticket, Services→ConciergeBell, Service Providers→ShoppingBag, Local Experts→Lamp, Trip Planners→Waypoints, Event Planners→Wine); fallback `MapPin` for anything unlisted. No `Send`/`Plane`/`Navigation`/arrow glyphs; no `Compass`/`Store`/`MapPin`/`Calendar` in a masthead specifically (MapPin is fallback-only, never a chosen masthead icon).
4. Every Marketplace band carries a **four-link rail** (Destinations · Ready-Made · Events · Services); every FIND HELP band carries a four-link rail (Providers · Local Experts · Trip Planners · Event Planners). Plain links, current one filled navy — this replaces role-pill switchers, and is NOT a tab with client state (`2026-08-23-marketplace-ungroup` still holds).
5. List surfaces use the **two-field search**: "What do you need help with?" + "Where are you going?" (pre-fills from `TripStrip` destination when a trip is in progress) + Filters. Browse **never writes** — search filters the page only, never mutates the trip.
6. **One card family** across Services/Ready-Made/storefront/expert-profile/destinations/city-feed: photo (one tag + price/score) → title → meta → 3-col mono facts row → source row → action row. Exactly **three action states**: platform (`Book now` teal + `Add to trip` navy), affiliate (`Book on {Partner}` gold + `Add to trip`), not-bookable (`Add to trip` + `Ask an expert`).
7. Every card and detail page **links back to its source** — claimed handle → `/s/:handle`; expert without handle → `/experts/:id`; provider without handle → their `/providers` card; destination → lead local expert, else "Ask a trip planner." Affiliate items link to the partner label only, **never** a storefront (§13). Never plain unlinked text.
8. Every "open card" detail page uses one skeleton: crumb → title block with byline → split hero → content panels → sticky action panel (Events body is the one named exception).
9. `/discover` is redirect-only; the legacy tabbed shell (`!surface` mode, `?tab=`, `articles` tab) is removed from `discover.tsx`.
10. `/experts` stays three roles; Service Providers is a nav item and rail link, **never** an experts tab.
11. `/providers` is live (supersedes an earlier "parked until ≥10 storefronts" posture) with an honest per-market count and an explicit empty-market state — never a silently empty grid.
12. `CityCard` stays ONE component with two variants (`pulse` rebuilt on the family skeleton, `season` untouched byte-identical) — not forked into two components.
13. Coral is the single primary CTA per panel — never two coral buttons in one panel. Teal = `Book now`/`View profile`; navy = `Add to trip`/`Add to cart`/`Plan this destination`; gold wash = affiliate; green = verified/positive.
14. §13 honesty specific to this surface: chips render only for categories/themes/neighbourhoods with **live stock** — the caption states counts are real, never the full taxonomy. `CityCard.pulse` drops `trendingSpots`/`hiddenGems`/`vibeTags`/`experiences[]`/`activeTravelers`/the `Plane` icon/the `isHot` badge — a Trend score ≥85 implies "hot" without a separate fabricated badge.
15. Per-surface testid contracts are load-bearing counts, not vibes — e.g. `/services` nets 52 rendered testids (49 unique source identities) after retiring 11 card-decoration ids proven asserted by zero test specs; `/ready-made/:id` keeps `rm-shelf-card-*`/`link-rm-author-*` with no id added or dropped. Use `playwright/tests/discover-tabs.spec.ts` as the arbiter of "load-bearing," not intuition.

## Visual grammar

- Tokens: `--earn-ground`, `--earn-card`, `--earn-border`/`-dash`, `--earn-teal`/`-ink`/`-wash`, `--earn-gold`/`-ink`/`-wash`, `--earn-green`/`-ink`, `--earn-coral-bg`/`-border`/`-ink`, `--earn-navy`, `--earn-ink`, `--earn-muted`, `--earn-faint`, `--earn-chip`.
- Coral budget: one primary CTA per panel/card, never two in the same panel.
- Fraunces for editorial headings only; Geist Mono for eyebrows/facts/prices/counts/handles/crumbs; Inter for body/buttons.
- Card-on-ground: cards are white (`--earn-card`) on the `--earn-ground` page background; hairline borders throughout.

## How to audit

Behavior greps (per-surface contract in SPEC §3) over style greps — confirm the SCOPE items first:

```bash
# No legacy tokens or hex literals leaking into touched pages
grep -rn "var(--ink)\|var(--paper)\|var(--coral)\|var(--line)" client/src/pages/discover.tsx client/src/pages/experts.tsx client/src/pages/storefront.tsx

# One shared icon map feeds all three chrome surfaces
grep -n "NAV_LEAF_ICONS" client/src/components/layout.tsx

# discover.tsx legacy shell removed
grep -n "!surface\|selectedTab\|urlTab\|TabsList" client/src/pages/discover.tsx

# CityCard stays one component, Plane icon dropped from pulse variant
grep -n "Plane" client/src/components/travelpulse/CityCard.tsx   # expect 0 occurrences
grep -n "variant===.season.\|variant === \"season\"" client/src/components/travelpulse/CityCard.tsx

# Card source-link resolution present on discover cards
grep -n "card-source-link\|link-service-storefront\|link-provider-storefront" client/src/pages/discover.tsx

# Testid count discipline — compare against the SPEC's stated counts, e.g. /services
grep -c "data-testid" client/src/pages/discover.tsx

# tsc / testid-count / no page-level CSS proof conditions (SPEC §4)
find client/src/pages -name "*.css"   # expect none
```

Route to open per surface: `/services`, `/ready-made`, `/destinations`, `/events`, `/services/:id`, `/experts?role=local_expert`, `/experts/:id`, `/s/:handle`, `/providers`, `/discover/location/:city`. Observe the band/rail/two-field-search pattern is consistent across all of them, and that cards share one visual family regardless of surface.

## Known divergences / notes

- The Ready-Made expert-templates shelf was **removed** (`d52af1f8`, superseded 2026-08-26) — its absence on `/ready-made` is ratified, not a regression. Expert templates remain reachable from expert profiles and storefront `Templates` tabs only.
- `/services/:id`'s Geist-Mono label/number pass is **DEFERRED** (decision-maker, pixel-guided) as a focused follow-up after a root preview — do not flag missing mono treatment there as a defect; the re-tokening (continuity hex → `--earn-*`) already landed, only the mono-label pass is outstanding.
- For `/discover/location/:city` specifically, resolve any apparent contradiction between this mock and BENTO_ASSEMBLY.md / lane4/BEHAVIOR_MATRIX.md in favor of those two files — this mock's city-feed section is superseded there.
- Route-shadow/testid re-homing (`tab-role-*` ids moved onto rail links) is intentional per SPEC §3.8 — a moved id is not a removed id.
