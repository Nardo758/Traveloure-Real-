# Landing Page Spec (v2.5) — lane `landing-v2.5`

Visual + behavior of record: **`docs/design/landing-earn-mock-v2.5.html`** (supersedes
`landing-earn-mock.html`, the v2.4 record). Grammar:
`docs/design/marketplace-experts-earn-grammar-mock.html`. This spec = the mock + the
v2.5 dispatch's rulings + the still-binding v2.4 contracts below.

**v2.5 supersedes v2.4** on three structural points (dispatch 2026-09-01;
ledger rows `2026-09-01-landing-moments`, `2026-09-01-plus-in-pricing`):

1. **Moments** is a new section at **position 2**, directly under the hero — it takes
   the Plus section's former coral slot.
2. **Plus** leaves its own section and becomes a **slim band** under the merged
   how-it-works/price ladder — the home-city product, visibly distinct from the travel
   ladder, "coming soon" while `PLUS_SALES_ENABLED=false`. Its coral leaves the page.
3. **"What people are planning"** (the experiences ticker) is **absorbed into Moments**
   (its ticker returns beneath the slide only when `experience_starts` exists — filed,
   not built).

Everything in the v2.4 spec not touched by these three stays binding (data contract,
typed-search titles, the shared rotation utility, the photo rule, the `GET /api/landing/hero`
Phase-1 endpoint). Where the mock's DOM and this spec disagree, **this spec wins**.

## Ruled section order (v2.5; coral count = 4)

1. **Hero** — live mini-bento + typed search
2. **Moments** — "Some trips are really one evening" (NEW; one moment per slide) — **coral**
3. **How it works + price ladder (merged)** — the four travel steps left→right cheap→committed,
   with the **Plus band** beneath (coming-soon; no coral)
4. **Where do you want to begin?** (entry strips: Marketplace + Find help)
5. **Cities with momentum** (the momentum rail)
6. **Numbers** (honest `—` where empty)
7. **Ways to earn** — **coral**
8. **Final CTA** — **coral**

> The v2.4 order's separate "Plus occasions" (slot 3) and "What people are planning"
> (slot 5) sections are **gone** — folded into slots 3 and 2 respectively per the two
> rulings above.

## Coral accounting (v2.5 — holds at 4, no flip pending)

The landing's ruled coral BUTTON count is **4**: **hero · moments · earn · final**.
The Plus band renders the coming-soon state (gold-ink eyebrow, live price, "coming soon"),
never a coral CTA — so the coral count does **not** change when `PLUS_SALES_ENABLED` flips
on. This **supersedes the v2.4 "coral-at-flip" ruling** (recorded 2026-08-29): under v2.5
Plus is no longer a section with its own CTA slot, so there is no fourth coral waiting to
appear at the flip — Moments permanently holds the fourth coral. No lane may add a fifth
coral. Chrome's coral budget (`2026-08-28-chrome-alignment`: Sign In + strip eyebrow +
BETA pill) is a separate budget, unchanged.

## Moments section (ruling `2026-09-01-landing-moments`)

The page's spine is **promise → proof → cost → paths**: the hero states the promise, Moments
shows the proof, the price ladder is the cost. Moments sits at position 2.

- **One moment per slide.** A moment enters rotation **only when it has ≥1 real, attributed
  photo** (never stock, never AI). One photo holds (no animation, dots hidden); two-plus
  animate. A moment with zero photos is **absent from the slide** but shown **faint in the tab
  strip** as "coming as locals join."
- **The slide** = a real-photo slideshow (dots, caption with place + contributor `@handle`,
  the shared `useRotation` at 8s / hover-focus pause / reduced-motion stop) beside **the story
  panel** — eyebrow, demo-tuned headline, three concrete numbered pieces that name the machine
  (expert · service · booking), a `Plan this moment` coral that prefills the chooser's
  `experienceType`, and the builder byline + review count from **real rows** (honest-omit when
  absent, §13).
- **The tab strip** is both navigation and live indicator: live moments as pills, not-yet-live
  faint with the "coming as locals join" tooltip. A tab tap is the strongest intent signal there
  is — it navigates AND writes an attributed event.
- **Copy** is `docs/design/MOMENTS_COPY.md` — seven stories (proposal · golf trip · girls' trip ·
  anniversary · honeymoon · milestone birthday · family occasion). The section renders the
  decision-maker's ratified words, not the drafts.

### Attribution contract (Moments)

Every slide impression (**≥2s visible** = one impression) and every click (tab, dot, CTA) writes
an attributed event to `landing_moment_events` via `POST /api/landing/moments/event`
`{momentKey, kind: impression|tab|dot|cta, position, sessionId}`. **No PII beyond the session
token the upsell events already use.** The funnel continues chooser → trip → purchase per
`experienceType` (mirrors the upsell click-attribution pattern, `POST /api/upsell/click`).

### Photo gate (Moments)

**Real photos only.** A moment's photos come from real rows (gem photos, expert-contributed
photos from the field-knowledge lane's evidence capture, storefront covers) — each carrying its
attribution (contributor `@handle`, place). The gradient shown in the mock is the **pre-photo
state only**: a photo-less moment stays out of the slide and never renders as a permanent
gradient card. `GET /api/landing/moments` returns **only moments with ≥1 real photo**, photos
with their attribution.

## Plus band (ruling `2026-09-01-plus-in-pricing`)

Plus is removed as a section and rendered as a slim band under the four price steps:
`--earn-border-dash` frame, **gold-ink eyebrow** ("Plus · your own city"), the live price from
the `plans` bundle (`GET /api/pricing` → `plusAnnual`), and **"coming soon"** while
`plusSalesEnabled` is false. It is the **home-city** product — birthdays, anniversaries, the
recurring occasion a local's plan arrives before — visibly distinct from the travel ladder, not
a fifth step. The Plus section's coral CTA is deleted. `See full pricing →` stays the only
action in that block.

---

## Still-binding v2.4 contracts (unchanged unless amended above)

### Data contract (every number from a live row; §13 honest-collapse)

| Surface | Source | Verified live shape (dev) |
|---|---|---|
| Hero city line | `GET /api/travelpulse/cities?limit=N` (public) | `cities[]`: `cityName`, `country`, `trendingScore` (0 below confidence floor — no "hot" badge, never fake), `crowdLevel`, `pulseScore`, `activeTravelers`, `vibeTags`, `currentHighlight` |
| Hero anchor expert | `neighborhoods[].localExpert` via `GET /api/discover/location/:city` | `{id, firstName, lastName, profileImageUrl, packagesCount}`; `localExpert` is null-prone. Phase 1 adds handle + min-price server-side, nullable. |
| Hero gem | city feed `gems.data[]` | `placeName` (NOT `name`), `gemScore`, `localRating`, coords. |
| Hero bookable service | city feed `services.data[]` | `serviceName`, `price` (decimal-dollars string), `priceType`, `city`, `neighborhood`, `serviceImage`, approved+active only. |
| Hero wanted slot | derived (Phase 1 re-derives server-side inside `/api/landing/hero`) | `expert_offering_types` minus covered, nullable. |
| Typed search titles | Static curated list (ruled: no UGC) | § Typed-search titles below; client constant, rotated by the shared utility; submits to `/services?q=&location=`; never writes trip context. |
| Price strip / Plus price | `GET /api/pricing` (public) | `serviceFeePct:7`, `serviceFeeCapCents:2500`, `optimizerRunDisplay.priceCents:599`, `aiTaskCents:299`, `tripPass.priceCents:1900`, `plusAnnual:{priceCents:2500,interval:"year"}`, **`plusSalesEnabled:false`** — the Plus band gates on this field. |
| Numbers | `GET /api/platform/stats` | `{totalTrips, totalUsers, totalExperts, totalReviews, totalBookings, totalCountries}`; honest `—` where empty. |
| Cities rail | `TrendingCities` → shared `travelpulse/CityCard` | `CityCard` needs `density="compact"` + `chrome="none"` (additive props; defaults preserve current renders). |

### Typed-search titles (ruled: static curated, market-spread, no UGC)

One per operating market (the ratified 8, `@shared/operating-markets`), phrased as searches a
traveler would type. Source of truth — edit here, not inline:

1. "A rainy-day tea itinerary in Kyoto"
2. "Porto wine cellars a local would pick"
3. "Sunset sailing out of Cartagena's old port"
4. "Street food after dark in Mumbai"
5. "Edinburgh closes and hidden courtyards"
6. "A slow morning in Goa's spice villages"
7. "Block-printing with a maker in Jaipur"
8. "Bogotá coffee farms in a day"

Rotation via the shared utility; input stops rotating on focus; submit navigates to
`/services?q=<text>&location=<city>` and never writes trip context.

### Shared rotation utility — ONE hook, all rotating surfaces

The Moments slideshow, the typed search, the cities rail, and (when it exists) the experiences
ticker all consume **one** `useRotation` hook (8s advance · pause on hover/focus · disabled under
`prefers-reduced-motion`). No per-surface reimplementations. If the hook does not yet exist on
main, Phase 2 of the Moments lane creates it before the section consumes it.

### Photos (global)

Real listing photos where rows have them (`serviceImage`, gem media, expert `profileImageUrl`,
storefront covers); tinted gradient fallback for the hero bento tiles only; **no stock, no AI
images**. The Moments photo gate above is stricter: a photo-less moment is omitted from the
slide entirely, never rendered as a gradient card.

### Phase 1 — `GET /api/landing/hero`

Server-composed, public, cacheable; every field nullable; collapses honestly:

```
{ city, trend, crowd,
  anchorExpert: { name, handle, fromPrice } | null,
  gem:          { name, score } | null,
  service:      { name, priceCents } | null,
  wanted:       { title, neighborhood } | null }
```

- `city/trend/crowd` from the trending resolver (top operating market).
- `anchorExpert` deterministic pick + `users.handle` + min approved offering price; null when
  the city has no assignment — never a fabricated expert.
- `gem` maps `placeName`/`gemScore`. `service` converts dollars-string → cents.
- `wanted` re-derives the client rule server-side; null when everything is covered.
- Tests: each leg null when absent; the endpoint never fabricates; trend 0 renders no badge.

## What Not To Do (dispatch, restated)

No handler changes to `Plan my trip` (`setPlanningOpen(true)`); no stock or AI photos; no
gradient-as-permanent (gradient is the pre-photo state only, a photo-less moment stays out of the
slide); no fabricated review counts or bylines (real rows or omit); **no fifth coral**; no
`experienceType` invented outside the chooser's accepted keys; no new rotation implementation
(reuse `useRotation`); no PII in events; no merge without the captures reviewed. If
`experience_starts` must be built, it is FILED, not built here.
