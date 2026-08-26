# Traveloure Landing — Phase 1 Specification

**Status:** frame prepared for review; implementation is not authorized
**Visual of record:** `docs/design/landing-earn-mock.html`
**Source audit:** `docs/audits/landing-routing-phase-0.md`
**Scope:** static mock frame and preservation specification only

## 1. Purpose

Replace the pre-earn-grammar landing design with a frame that makes one
decision clear: the primary action is AI trip planning, while browse and expert
discovery remain adjacent entry points. This specification defines what the
frame may show and what a later production implementation must preserve.

This Phase 1 deliverable does **not** change `landing.tsx`, `TrendingCities`,
`CityCard`, `Layout`, `TripStrip`, routes, handlers, APIs, test IDs, photos,
inventory, or tests.

## 2. Frame direction

### Product thesis

Traveloure helps a traveler move from an idea to a usable plan. The hero should
lead with `Plan my trip`, not Quick Start or an expert handoff. Browse is
available beside the hero as a separate, low-commitment action.

### Visual language

Use the established earn-grammar system:

- **Ground:** `#FAFAF8`
- **Card:** `#FFFFFF`
- **Ink / navy:** `#1F2733` / `#1E3A5F`
- **Teal:** `#2E8B8B`, with `#226B6B` for readable action text
- **Coral:** `#E85D55` for the primary planning action
- **Gold:** `#E8B339` for data/status semantics when needed
- **Green:** `#5DCAA5` for positive/verified states
- **Display:** Fraunces
- **Body and controls:** Inter
- **Labels, counts, and route/state annotations:** Geist Mono

The frame uses one deliberate visual risk: a deep blue/teal travel horizon with
coral light behind the hero, rather than a generic cream-only opening. The
rest of the page stays quiet and editorial so the action hierarchy remains
legible.

### Page order

1. Shared navigation and beta ribbon
2. Hero with AI planning CTA, local-expert CTA, and browse-only two-field
   search
3. Eight-icon planning entry strip
4. Popular Experiences
5. Trending Cities using compact pulse cards
6. How It Works with the four existing authored steps
7. Platform Intelligence stats
8. Honest testimonial empty state representation
9. Earn band
10. Final planning CTA

## 3. Hero preservation contract

### Primary CTA

The hero’s primary CTA is presented as **Plan my trip**. In production it must
continue to call:

```tsx
onClick={() => setPlanningOpen(true)}
```

and mount the existing `EnhancedPlanningModal`:

```tsx
<EnhancedPlanningModal
  isOpen={planningOpen}
  onClose={() => setPlanningOpen(false)}
  userId={currentUser?.id || ""}
/>
```

The `userId` line above is shown conceptually; the implementation must retain
the current expression exactly as it exists in `landing.tsx`:

```tsx
userId={currentUser?.id || ""}
```

The hero CTA must not navigate to `/quick-start`, add `source=quick-start`,
write destination state, or mutate `TripContext`.

### Modal behavior that remains unchanged

The existing modal contract remains authoritative:

- guest state shows the modal’s existing sign-in prompt;
- sign-in uses `/api/login`;
- authenticated users can add destinations and dates;
- city lookup remains debounced through `/api/cities/lookup`;
- optional neighborhood and hidden-gem data remains data-dependent;
- generation posts to `/api/ai/generate-itinerary`;
- a returned `comparisonId` navigates to
  `/itinerary-comparison/:id`;
- a returned `tripId` fallback navigates to `/trip/:id`;
- missing IDs remain an in-modal error state;
- all current modal test IDs remain unchanged.

### Browse-only two-field search

The search beside the hero is a browse control, not a second planning wizard.
Its production behavior must:

- use the labels “What do you need help with?” and “Where are you going?”;
- submit/filter the `/services` surface;
- preserve the existing destination/query behavior of the browse surface;
- never write `TripContext`, `externalCart_*`, itinerary IDs, or Quick Start
  handoff state;
- never replace or intercept the hero modal CTA.

The current audit identifies `/services` as a working current surface. Any
search implementation is a later production task, not part of this frame gate.

### Secondary CTA

The outline hero action is **Browse local experts** and resolves to:

```text
/experts?role=local_expert
```

It remains a public current surface and retains the existing role query.

## 4. Entry strips and experience destinations

The frame uses the eight established navigation icons as a compact entry strip:

| Icon contract | Label | Destination |
|---|---|---|
| `Palmtree` | Destinations | `/destinations` |
| `Gem` | Ready-Made | `/ready-made` |
| `Ticket` | Events | `/events` |
| `ConciergeBell` | Services | `/services` |
| `ShoppingBag` | Providers | `/providers` |
| `Lamp` | Local Experts | `/experts?role=local_expert` |
| `Waypoints` | Trip Planners | `/experts?role=travel_expert` |
| `Wine` | Event Planners | `/experts?role=event_planner` |

These are the existing `NAV_LEAF_ICONS` vocabulary and are represented by
static glyph approximations in the HTML review artifact; a production
implementation must use the shared icon source.

The production implementation must not discard
the existing 19 category destinations:

```text
/experiences/travel
/experiences/wedding
/experiences/proposal
/experiences/date-night
/experiences/birthday
/experiences/bachelor-bachelorette
/experiences/anniversary-trip
/experiences/corporate-events
/experiences/reunions
/experiences/wedding-anniversaries
/experiences/retreats
/experiences/baby-shower
/experiences/graduation-party
/experiences/engagement-party
/experiences/housewarming-party
/experiences/retirement-party
/experiences/career-achievement-party
/experiences/farewell-party
/experiences/holiday-party
```

The six Popular Experiences cards remain:

```text
/experiences/travel
/experiences/wedding
/experiences/proposal
/experiences/celebrations
/experiences/date-night
/experiences/corporate-events
```

All of these match the registered `/experiences/:slug` route. The existing
dynamic test IDs must remain if the production card family is changed:

```text
card-experience-${slug}
button-category-${slug}
```

The eight-icon strip is a compact entry surface, not a replacement for the
experience category destinations. It does not authorize adding a new
navigation vocabulary or deleting the existing category slugs.

## 5. TrendingCities contract

### Existing data source

The production component continues to query:

```text
GET /api/travelpulse/cities
React Query key: ['/api/travelpulse/cities']
```

The response is capped to eight city rows. Loading renders eight skeletons;
no-row state does not fabricate a city.

### Desired Phase 1 presentation

The frame represents the compact density requested for the landing lane:

```tsx
<CityCard
  variant="pulse"
  density="compact"
  primaryLabel="Plan this destination"
  expertsCount={city.expertsCount}
  ...
/>
```

The exact production prop list must be reconciled with the currently shipped
`CityCardProps` before implementation. At audit time:

- `CityCard` has no `density` prop;
- `TrendingCities` still passes `primaryLabel="Take me Here"`;
- `TrendingCities` passes `vibeTags`, `trendingSpots`, `hiddenGems`, and
  `activeTravelers`;
- the current caller does not pass `expertsCount`;
- Lane 3’s convergence added the explicit primary test-ID and source-link
  behavior, but did not complete this compact-density caller contract.

This is a known implementation prerequisite, not a reason to alter the static
frame or silently change the shared component in Phase 1.

### Navigation and IDs

The later implementation must retain encoded city navigation for both the card
and its primary action:

```text
/discover/location/${encodeURIComponent(city.cityName)}
  ?country=${encodeURIComponent(city.country || "")}
```

It must preserve:

```text
card-city-${city.id}
button-plan-now-${city.id}
button-explore-all-cities
source-experts-${city-slug}
```

The compact card should display a real `expertsCount` only when the API
provides it. It must not invent a count. When the count is absent, the shared
card’s honest “Ask a trip planner” fallback remains valid until a separately
authorized contract changes it.

## 6. How It Works

Keep the four current authored steps and their order:

1. **Share Your Vision** — destination, dates, budget, and preferences.
2. **Get Matched** — verified local experts matched to the experience.
3. **Plan Together** — AI tools, local intelligence, and insider knowledge.
4. **Experience It** — the finished experience with on-trip support.

The section CTA continues to target `/ai-assistant`, which is a current
protected surface. The frame does not turn these steps into a new wizard and
does not replace their authored copy with claims about unmeasured outcomes.

Preserve:

```text
card-step-1
card-step-2
card-step-3
card-step-4
button-get-started-how
```

## 7. Stats and testimonials

### Platform stats

Stats remain sourced from:

```text
GET /api/platform/stats
```

The frame uses honest empty placeholders (`—`) to make the data boundary
visible. Production continues to use the existing derived `0+` fallback until
the query resolves:

```text
Trips Planned       → card-stat-trips-planned
Reviews             → card-stat-reviews
Local Experts       → card-stat-local-experts
Countries           → card-stat-countries
```

No new totals, growth percentages, active-user claims, or live-count language
may be introduced by the frame.

### Testimonials

Testimonials remain sourced from:

```text
GET /api/platform/featured-testimonials
```

When the featured array is empty, production omits the section entirely. The
frame’s empty-state annotation is a review aid and does not authorize replacing
that behavior with invented review cards.

When data exists, preserve:

```text
section-testimonials
card-testimonial-${testimonial.id}
text-testimonial-body-${testimonial.id}
text-testimonial-name-${testimonial.id}
```

## 8. Earn band

The earn band keeps the existing route aliases unchanged:

```text
Service provider role → /earn?track=provider
Trip planner role     → /earn?track=expert
All earning options   → /earn
```

The frame labels the cards by the role each alias resolves to rather than
repeating ambiguous “local” and “expert” language:

- **Service provider:** offer local, in-person services.
- **Trip planner:** advise travelers and coordinate plans remotely or in person.

The later implementation must not convert these aliases to new query keys.
`EarnPage` remains the source of truth for role selection, offering catalogs,
and config-driven earning indicators.

## 9. Copy and content rules

### Authored copy retained

- Hero planning intent and supporting explanation
- Browse field labels
- Experience labels, descriptions, category chips, and tips
- Four How It Works step titles/descriptions
- Stat labels/descriptions
- Earn role descriptions
- Final CTA copy

### Data-backed copy retained

- City names, countries, highlights, tags, counts, scores, deals, and images
- Platform statistic values
- Admin-curated testimonial fields
- Expert counts in compact city cards

### No placeholders presented as facts

- No invented testimonials
- No invented city inventory
- No invented expert counts
- No invented earnings percentages
- No fake “live” quantity
- No “real-time” promise where the source only updates daily

## 10. Route and interaction preservation matrix

| Frame interaction | Destination / handler | Status |
|---|---|---|
| Plan my trip | `setPlanningOpen(true)` → `EnhancedPlanningModal` | Preserve exactly |
| Browse fields | `/services` browse/filter surface | Browse-only; never write trip state |
| Browse local experts | `/experts?role=local_expert` | Preserve |
| Planning entry card | `/experiences/:slug` | Preserve all emitted slugs |
| Trending city card | `/discover/location/:city?country=...` | Preserve encoded navigation |
| Explore all cities | `/destinations` | Preserve |
| How It Works CTA | `/ai-assistant` | Preserve protected-route behavior |
| Service provider earn card | `/earn?track=provider` | Preserve alias |
| Trip planner earn card | `/earn?track=expert` | Preserve alias |
| Final Browse local experts | `/experts?role=local_expert` | Preserve |
| Final pricing | `/pricing` | Preserve |

## 11. Later implementation gates

Before production work begins, the next lane must explicitly resolve:

- whether `density="compact"` belongs on the shared `CityCard` API or should
  be represented by an existing variant/layout contract;
- which API field supplies `expertsCount`, and what the honest absent-count
  state is;
- how the browse form maps its two fields into `/services` without mutating
  shared trip state;
- whether the eight-icon strip is a visual grouping over the existing 19
  destinations or a separate entry surface;
- the browser proof for modal opening, auth gating, route navigation, city
  handoff, empty stats, and hidden testimonials;
- the production test-ID diff, if any, before changing implementation.

## Hard stop

The mock frame and this specification are the complete Phase 1 deliverable.
Stop here until the frame and `LANDING_SPEC.md` are reviewed and the next gate
is explicitly authorized. No production component, route, API, asset, handler,
test, or shared-layout change is included in this phase.