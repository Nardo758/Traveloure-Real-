# Landing Routing Audit — Phase 0 Handoff

**Date:** 2026-08-26  
**Scope:** Read-only audit of `client/src/pages/landing.tsx` and its landing-entry
dependencies.  
**Status:** Inventory and route tracing complete; hard stop in force. No mock,
component, layout, handler, test, route, API, asset, or copy changes were made.

## 1. Executive summary

The current `/` surface is a long, vertically ordered marketing page. Its
content is a mix of:

- a shared beta-market ribbon backed by the shared operating-market config;
- a static, asset-backed hero and static experience/category cards;
- a live TravelPulse city rail;
- live platform statistics;
- an admin-curated testimonial rail that is hidden until it has data;
- static “How It Works”, earn, and final CTA copy.

The primary planning entry point is the hero button. It opens
`EnhancedPlanningModal` in place; it does not navigate to `/quick-start`, does
not write query state, and does not preserve a destination from the URL. The
separate Quick Start flow is `/quick-start`, a protected route entered by
TravelPulse city cards, and it has its own generation, cart/context, and expert
handoff contracts.

All destinations emitted directly by the landing page have a registered
current route or a route family with a registered dynamic handler. The routes
that require authentication are not dead ends, but their unauthenticated
outcome is a sign-in prompt and a return to the requested/default role home.
The route map below records those outcomes explicitly.

## 2. Top-to-bottom rendered inventory

Line references are to the current files at audit time and should be
re-verified before implementation begins.

### 2.1 Global page shell and beta ribbon

| Order / source | Rendered content | Source type and states | CTA / handler | Test IDs to preserve | Copy status |
|---|---|---|---|---|---|
| `landing.tsx:315-322`, with `Layout` supplied by `App.tsx:357-359` | Shared global navigation/chrome, then `SEOHead`, then `CityTickerTape` | The landing component is mounted inside the shared `<Layout>`. `SEOHead` is authored metadata (`title="Home"`, description, keywords, `/`). `CityTickerTape` is a shared component, not landing-local JSX. | Ribbon’s `Start planning` link goes to `/experiences/travel`. Navigation handlers belong to `Layout` and are outside this audit’s production-change scope. | `top-ribbon-banner`; `ticker-city-${marketKey}-${index}` (the market list is repeated three times for the animation); `link-apply-now`. Shared nav IDs remain governed by layout/capture coverage. | “Traveloure is in beta in N cities” / “Beta in N cities” is authored, with `N` derived from `OPERATING_MARKETS`; no hardcoded city count. |

`CityTickerTape` uses `OPERATING_MARKETS` from `shared/operating-markets.ts`,
currently eight configured markets (Kyoto, Goa, Mumbai, Jaipur, Edinburgh,
Porto, Bogotá, and Cartagena). The ticker is not queried from
`/api/travelpulse/cities`; it is configuration-backed. The ribbon’s animation
duplicates those markets in the DOM, so a future capture should not interpret
the repeated nodes as additional markets.

### 2.2 Hero and immediate planning choices

**Source:** `landing.tsx:324-524`.

| Rendered area | Source type and states | CTA / handler | Test IDs | Copy status |
|---|---|---|---|---|
| Lake-image hero background, dark overlays, beta badge, headline, supporting paragraph | Static imported asset `@assets/stock_images/turquoise_lake_with__22a4624c.webp`; static JSX copy; no loading/empty branch. | `Plan a Trip with AI` calls `setPlanningOpen(true)` and opens `EnhancedPlanningModal` in place. | `button-plan-trip` | Authored: “Plan Your Perfect Life Experiences”; “From dream vacations to unforgettable celebrations — plan it yourself with AI or get personalized help from experts.” “BETA VERSION” is authored status copy. |
| “Choose Your Experience” card | `experienceTemplates` static array (`landing.tsx:109-129`), 19 entries; scrollable/flex layout. | Each entry is a `Link` to `/experiences/${cat.slug}`. | `button-category-${cat.slug}` for each slug | Authored labels/descriptions; icon/color presentation is static. |
| “Local Experts” card | Static JSX copy and icon. | Link to `/experts?role=local_expert`. No custom click handler beyond the link. | `button-find-expert` | Authored: “Verified local experts and trip planners who know every hidden gem.” This is positioning copy, not a quantified claim. |
| “Plan Your Event” card | Static JSX copy and icon. | Link to `/experts?role=event_planner`. | `button-plan-event` | Authored: “Specialist planners for weddings, proposals, and group celebrations.” |
| Four key-feature cards | `keyFeatures` static array (`landing.tsx:131-136`). | `AI Trip Planner` → `/ai-assistant`; `Expert Matching` → `/experts`; `Live Intel` → `/destinations`; `Discover` → `/destinations`. These are ordinary Wouter links. | `link-feature-ai-trip-planner`, `link-feature-expert-matching`, `link-feature-live-intel`, `link-feature-discover` | Authored labels/descriptions. “Real-time local insights” is existing feature copy; the target is the current Destinations surface. |

The 19 hero category slugs are:

`travel`, `wedding`, `proposal`, `date-night`, `birthday`,
`bachelor-bachelorette`, `anniversary-trip`, `corporate-events`, `reunions`,
`wedding-anniversaries`, `retreats`, `baby-shower`, `graduation-party`,
`engagement-party`, `housewarming-party`, `retirement-party`,
`career-achievement-party`, `farewell-party`, and `holiday-party`.

The category button itself has no test ID on the wrapping `Link`; the ID is on
the nested `Button`. Any replacement must preserve the current dynamic ID
pattern and its slug values.

### 2.3 Trending Cities

**Source:** `TrendingCities.tsx:45-143`, inserted at `landing.tsx:526`.

This is a complete reusable component insertion, not a landing-specific copy
of the city card. It requests:

```text
GET /api/travelpulse/cities
React Query key: ['/api/travelpulse/cities']
```

The component takes the first eight returned rows. While loading it renders
eight `CityCardSkeleton` placeholders. If the response is absent or contains
no rows, the grid has no city cards; the section heading and “Explore All in
TravelPulse” CTA still render. There is no fabricated city fallback.

#### Compact CityCard contract used by landing

`TrendingCities` normalizes each `TravelPulseCity` row into the shared
`CityCard` with:

```text
variant="pulse"
cityName, country, imageUrl
score=pulseScore
isHot=trendingScore > 70
activeTravelers=activeTravelers       (the shared card currently suppresses this badge)
highlight=currentHighlight
vibeTags=vibeTags
avgPrice=avgHotelPrice
priceChangePct=Math.round(parseFloat(priceChange || "0"))
crowdLevel, dealAlert
trendingSpots=totalTrendingSpots
hiddenGems=totalHiddenGems
primaryLabel="Take me Here"
primaryTestId="button-plan-now-${city.id}"
testId="card-city-${city.id}"
```

Both navigation callbacks use the same destination:

```text
/discover/location/${encodeURIComponent(city.cityName)}
  ?country=${encodeURIComponent(city.country || "")}
```

`onPrimary` is used by the `Take me Here` button; `onCardClick` is used by the
whole-card click/keyboard interaction. Both call `navigate` from Wouter.

The shared `CityCard` also renders the compact-card contract that future
landing work must retain without restyling it in this phase:

- `data-testid="card-city-${city.id}"` on the card;
- `data-testid="button-plan-now-${city.id}"` on the primary action;
- a generated `source-experts-${city-slug}` link in the body. Because the
  landing caller does **not** pass `expertsCount`, this currently resolves to
  `/experts?role=travel_expert` and reads “Ask a trip planner”;
- no `activeTravelers` count badge despite the prop being passed;
- pulse score, Trending/Hot badge, optional highlight/tags/price/crowd/deal,
  and pulse/trending/gems footer values are data-dependent.

The section-level CTA is a Wouter link to `/destinations` with
`data-testid="button-explore-all-cities"`.

No restyle or contract change is proposed by this audit.

### 2.4 Popular Experiences

**Source:** `landing.tsx:528-560`, rendered through
`components/ui/experience-card.tsx`.

The section heading and description are static JSX. Six static
`experienceCategories` entries are rendered as cards:

| Label | Slug / destination | Data and state |
|---|---|---|
| Travel | `/experiences/travel` | Static card metadata plus remote Unsplash image URL |
| Weddings | `/experiences/wedding` | Static card metadata plus remote Unsplash image URL |
| Proposals | `/experiences/proposal` | Static card metadata plus remote Unsplash image URL |
| Celebrations | `/experiences/celebrations` | Static card metadata plus remote Unsplash image URL |
| Date Nights | `/experiences/date-night` | Static card metadata plus remote Unsplash image URL |
| Corporate | `/experiences/corporate-events` | Static card metadata plus remote Unsplash image URL |

Each card links to `/experiences/${slug}`. The shared card caps visible
category chips at three and displays a static “tip” block when supplied; all
six landing entries supply categories and a tip. There is no queried inventory
or empty state in this section.

Preserve dynamic IDs `card-experience-travel`,
`card-experience-wedding`, `card-experience-proposal`,
`card-experience-celebrations`, `card-experience-date-night`, and
`card-experience-corporate-events`.

Copy is authored in the `experienceCategories` array: labels, descriptions,
category tags, and tips. The remote image URLs are presentation inputs, not
claims about platform inventory.

### 2.5 How It Works

**Source:** `landing.tsx:562-624`.

The heading, “From dream to reality in four simple steps” subtitle, connecting
line, and four cards are static. `howItWorksSteps` contains:

1. **Share Your Vision** — destination, dates, budget, and preferences.
2. **Get Matched** — AI matches verified local experts.
3. **Plan Together** — collaborate with AI tools, real-time intel, and insider
   knowledge.
4. **Experience It** — enjoy the planned experience with on-trip support.

There are no queried states or card-level handlers. The section’s final
`Get Started` link points to `/ai-assistant`, with
`data-testid="button-get-started-how"`. Preserve
`card-step-1` through `card-step-4`.

The step copy is authored. “Verified local experts” and “on-trip support” are
existing product-description copy; this audit does not validate or alter those
claims.

### 2.6 Platform Intelligence

**Source:** `landing.tsx:626-661` (section begins immediately after the
How It Works section).

The heading, “Live” badge, and supporting copy are static. The four
`StatCard`s are built from `impactStats`, whose values query:

```text
GET /api/platform/stats
React Query key: ['/api/platform/stats']
```

The expected response fields are `totalTrips`, `totalUsers`, `totalExperts`,
`totalReviews`, `totalCountries`, and `avgRating`; only
`totalTrips`, `totalReviews`, `totalExperts`, and `totalCountries` are
displayed. Before data is available, the displayed value is the derived
fallback `0+`. The current code does not render an error state.

| Displayed stat | Test ID |
|---|---|
| Trips Planned | `card-stat-trips-planned` |
| Reviews | `card-stat-reviews` |
| Local Experts | `card-stat-local-experts` |
| Countries | `card-stat-countries` |

The descriptions are authored and deliberately explain the provenance of each
number. `StatCard` derives the IDs from the labels; preserve that relationship.
The section itself currently has no section-level test ID.

### 2.7 Testimonials (conditional)

**Source:** `landing.tsx:274-280`, `663-695`.

The component requests:

```text
GET /api/platform/featured-testimonials
React Query key: ['/api/platform/featured-testimonials']
```

The expected shape is `{ testimonials: FeaturedTestimonial[] }`. The section
is not rendered at all when the response is missing or its array is empty.
There is no placeholder testimonial, loading rail, invented reviewer, or
invented savings/earnings claim.

When present, each real admin-curated row renders rating stars, optional
`reviewText`, `reviewerName`, and `serviceName`. Preserve:

- `section-testimonials`;
- `card-testimonial-${testimonial.id}`;
- `text-testimonial-body-${testimonial.id}` when review text exists;
- `text-testimonial-name-${testimonial.id}`.

The section heading/subtitle are authored: “What Travelers Are Saying” and
“Real reviews from travelers after a completed booking on Traveloure.” The
review fields themselves are server/admin content and must remain text-only.

### 2.8 Earn / Partner dual-path CTA

**Source:** `landing.tsx:697-770`.

This section is always rendered and has
`data-testid="section-earn-cta"`. Its heading and explanatory paragraph are
static authored copy:

> Know a city well? Get paid for it.  
> Turn what you know about your city into income on Traveloure. Two paths —
> pick the one that fits.

| Card | Destination | Test ID | Copy status |
|---|---|---|---|
| Earn as a local | `/earn?track=provider` | `card-earn-local` | Authored copy describing tours, transport, photography, and on-the-ground services |
| Share your expertise | `/earn?track=expert` | `card-earn-expert` | Authored copy describing advising travellers, reviewing plans, and coordinating logistics |

The section’s “View all earning options” link points to `/earn`. The role-query
values are legacy-compatible aliases interpreted by `EarnPage`:
`track=provider` selects the `service_provider` role and `track=expert` selects
the `trip_planner` role. This is not a server redirect; the `/earn` page
normalizes the query in the client.

The section makes no live earnings percentage or inventory claim. The current
earn page is the source of truth for role/offering data and config-driven
earning indicators.

### 2.9 Final CTA

**Source:** `landing.tsx:772-819`.

The final coral gradient section is always rendered. Heading and subtitle are
static authored copy:

> Ready To Plan Your Experience?  
> Plan your next trip with local experts and AI

| CTA | Handler / destination | Auth outcome | Test ID |
|---|---|---|---|
| Get Started - Free | `openSignInModal()` from `SignInModalContext`; no explicit `returnTo` | Opens shared sign-in modal for a guest. On successful auth, the modal falls back to the role home if no saved return target exists. | `button-cta-get-started` |
| Browse Experts | Wouter link to `/experts` | Public current surface | `button-cta-browse` |
| See Pricing | Wouter link to `/pricing` | Public current surface | `button-cta-pricing` |

## 3. Complete landing test-ID inventory

The following IDs are emitted by the landing page or its landing-owned shared
children. Dynamic IDs are shown as patterns.

### Landing and shared ribbon

- `top-ribbon-banner`
- `ticker-city-${marketKey}-${index}`
- `link-apply-now`
- `button-plan-trip`
- `button-category-${cat.slug}`
- `button-find-expert`
- `button-plan-event`
- `link-feature-ai-trip-planner`
- `link-feature-expert-matching`
- `link-feature-live-intel`
- `link-feature-discover`
- `card-step-1`, `card-step-2`, `card-step-3`, `card-step-4`
- `button-get-started-how`
- `card-stat-trips-planned`
- `card-stat-reviews`
- `card-stat-local-experts`
- `card-stat-countries`
- `section-testimonials` (conditional)
- `card-testimonial-${testimonial.id}` (conditional)
- `text-testimonial-body-${testimonial.id}` (conditional when body exists)
- `text-testimonial-name-${testimonial.id}` (conditional)
- `section-earn-cta`
- `card-earn-local`
- `card-earn-expert`
- `button-cta-get-started`
- `button-cta-browse`
- `button-cta-pricing`

### TrendingCities / shared CityCard IDs

- `card-city-${city.id}`
- `button-plan-now-${city.id}`
- `source-experts-${city-slug}`
- optional shared-card secondary/ask IDs only if those props are introduced;
  the landing caller currently does not pass them.
- `button-explore-all-cities`

### Planning modal IDs

These are not in the DOM until `button-plan-trip` opens the modal, but they are
part of the landing planning preservation contract:

- Auth prompt: `button-cancel-signin-prompt`,
  `button-signin-from-modal`
- Shell and destinations: `button-close-planning-modal`,
  `chip-destination-${index}`, `button-remove-destination-${index}`,
  `input-destination`, `text-city-matched`, `button-add-destination`,
  `select-neighborhood`, `chip-gem-${id}`
- Dates and basics: `input-start-date`, `input-end-date`,
  `button-experience-${type.value}`, `button-travelers-decrease`,
  `text-travelers-count`, `button-travelers-increase`
- Optional preferences: `button-toggle-preferences`,
  `button-pace-${pace.value}`, `input-must-see`,
  `button-toggle-interests`, `button-interest-${interest.value}`,
  `button-toggle-budget`, `button-budget-${tier.value}`,
  `button-toggle-dietary`, `button-dietary-${option.value}`,
  `button-toggle-mobility`, `button-mobility-${option.value}`,
  `textarea-special-requests`
- Footer: `button-cancel-planning`, `button-generate-itinerary`

## 4. Route map and concrete outcomes

Classification:

- **Current surface:** a registered route renders the intended current page.
- **Redirect / legacy alias:** a registered route intentionally forwards to a
  canonical current surface or the destination is a documented compatibility
  query alias.
- **Dead end:** no registered client route or handler, or the route reaches a
  known not-found outcome for the emitted value.

### Direct landing destinations

| Emitter | Destination | Classification | Concrete outcome |
|---|---|---|---|
| Ribbon `Start planning` | `/experiences/travel` | Current surface | `App.tsx` matches `/experiences/:slug` and renders `ExperienceTemplatePage` for `travel`. |
| Hero category buttons | `/experiences/${cat.slug}` | Current surface / dynamic | `App.tsx` matches `/experiences/:slug`; the page is data/slug driven. The route exists for all 19 emitted slugs. |
| Local Experts card | `/experts?role=local_expert` | Current surface | Public `ExpertsPage`; role query initializes the local-expert view. |
| Plan Your Event card | `/experts?role=event_planner` | Current surface | Public `ExpertsPage`; event-planner role is read from query state. |
| AI Trip Planner feature | `/ai-assistant` | Current surface with auth gate | `App.tsx` mounts `AIAssistant` under `ProtectedRoute`. Guest outcome: store the requested path, open sign-in modal, navigate to `/`; successful auth restores the saved path when available. |
| Expert Matching feature | `/experts` | Current surface | Public `ExpertsPage`, default role/filter behavior applies. |
| Live Intel feature | `/destinations` | Current surface | `DiscoverPage surface="travelpulse"` with the current Destinations/TravelPulse surface. |
| Discover feature | `/destinations` | Current surface | Same current Destinations/TravelPulse surface. |
| Trending city card / primary action | `/discover/location/${city}?country=${country}` | Current surface | `DiscoverLocationPage` renders the city marketplace view. The city and country are URL-encoded. |
| Trending section “Explore All” | `/destinations` | Current surface | Current TravelPulse/Destinations surface. |
| How It Works `Get Started` | `/ai-assistant` | Current surface with auth gate | Same protected AIAssistant outcome as the hero feature. |
| Earn local card | `/earn?track=provider` | Current surface with legacy query alias | `/earn` renders `EarnPage`; `track=provider` selects `service_provider` in the role band. |
| Earn expert card | `/earn?track=expert` | Current surface with legacy query alias | `/earn` renders `EarnPage`; `track=expert` selects `trip_planner` in the role band. |
| Earn “View all” | `/earn` | Current surface | `/earn` defaults to the service-provider role when no recognized role is supplied. |
| Final Browse Experts | `/experts` | Current surface | Public `ExpertsPage`. |
| Final See Pricing | `/pricing` | Current surface | Public `Pricing` page inside `Layout`. |

The route table deliberately does not call the dynamic experience slugs
“dead” merely because their content is data-driven. The client route is
registered for each emitted value; a future runtime/content audit should verify
whether each slug has a corresponding experience record and meaningful page
content.

### Planning and auth destinations

| Destination / request | Classification | Concrete outcome |
|---|---|---|
| Landing hero → `EnhancedPlanningModal` | Current in-place flow | `planningOpen` is set true; no URL change. |
| Guest modal submit state | Current auth gate | Modal independently queries `/api/auth/user`. If `authUser?.id` is absent, it renders its own sign-in prompt. `Sign In` closes the modal and sends the browser to `/api/login`; `Cancel` closes without navigation. |
| Authenticated modal generate | Current flow | Validates destination and future date range, POSTs `/api/ai/generate-itinerary`, then closes and navigates to `/itinerary-comparison/:comparisonId` when returned. |
| Modal generation fallback | Current flow | If the API returns only `tripId`, closes and navigates to `/trip/:tripId`. If neither ID is returned, it shows an error in the modal. |
| `/itinerary-comparison/:id` | Current protected surface | `App.tsx` mounts the comparison page under `DashboardLayout` and `ProtectedRoute`. |
| `/trip/:id` | Current protected surface | `App.tsx` mounts trip details under `DashboardLayout` and `ProtectedRoute`. |
| Modal lookup | Current API dependency | Debounced `GET /api/cities/lookup?q=...`; resolved city IDs enable neighborhood/gem fetches. |
| Modal local context | Current API dependencies | `GET /api/cities/neighborhoods?city=...` and `GET /api/cities/gems?city=...&limit=5`; failures are swallowed and the optional additions remain absent. |

### Quick Start and expert handoff

Quick Start is **not** the same flow as the landing hero modal:

1. `CityGrid` on the current Destinations surface navigates a selected city to
   `/quick-start?destination=${city}&country=${country}`.
2. `/quick-start` is registered in `App.tsx` as a `ProtectedRoute` inside
   `Layout`. A guest is sent through the shared sign-in gate before seeing the
   page.
3. `QuickStartItinerary` reads `destination` and `country` from the URL. With
   a destination it auto-generates through `POST /api/quick-start-itinerary`;
   without one it shows its customization form.
4. The generated itinerary offers two distinct actions:
   - **Send to expert:** creates a trip through `POST /api/trips` when possible,
     then navigates to `/services` with
     `destination`, optional `country`, `tripId`, `itineraryId`,
     `experienceType`, `startDate`, `endDate`, `source=quick-start`, and
     `showExperts=true`. If trip creation fails, it still navigates with the
     itinerary context but without `tripId`.
   - **Customize:** stores generated items in `externalCart_${experienceSlug}`,
     updates shared trip context, then navigates to
     `/experiences/${experienceSlug}` with `destination`, `itineraryId`, and
     `fromQuickStart=true`.
5. On `/services`, `DiscoverPage` reads the handoff query state. The
   `source=quick-start` + `showExperts=true` combination shows the matched
   experts section and its dismissible banner. It preserves destination,
   country, experience type, dates, itinerary ID, and trip ID for the handoff.
6. A matched expert’s Connect action navigates to
   `/experts/${expert.id}?tripId=${tripId}&source=quick-start` when a trip ID
   exists. `ExpertDetailPage` uses `tripId` to enable the request-help-with-plan
   path; the request posts the trip ID and service ID to
   `/api/expert-booking-requests`. Contact and booking actions retain their
   own auth gates.

Preservation contract for any later landing frame:

- do not silently change the hero’s modal into `/quick-start`, or vice versa;
- retain the `source=quick-start`, `showExperts`, destination, dates,
  experience type, itinerary, and trip query keys when touching adjacent entry
  points;
- retain the expert detail `tripId` handoff so a request can be tied to the
  traveler’s plan;
- retain the auth gate and return-to behavior for protected planning surfaces;
- preserve the current CityCard destination encoding and primary/card-click
  parity.

## 5. Auth and session preservation notes

There are three observed sign-in shapes relevant to a future landing frame:

1. **Shared modal CTA:** `openSignInModal()` opens `SignInModal` without a
   caller-supplied `returnTo` for the final “Get Started - Free” button.
   `SignInModal` uses any saved return target, otherwise
   `getRoleHomePath(role)`.
2. **Protected route:** `ProtectedRoute` saves the current path in
   `sessionStorage` under `traveloure_return_to`, opens the modal with that
   return target, and navigates to `/`. `AuthReturnToRestorer` also restores
   OAuth-returned paths after authenticated bootstrap.
3. **Landing planning modal:** `EnhancedPlanningModal` performs its own
   `/api/auth/user` query and checks `authUser?.id`. It renders a separate
   sign-in prompt rather than the shared `SignInModal` when that value is
   absent. Its `userId` prop is supplied from the landing query but the modal’s
   own auth query controls the visible gate.

This is an existing behavior contract, not a proposed fix. In particular,
future work must not “simplify” the two prompts or remove saved-return
handling without a separate authorization.

## 6. Authored versus placeholder findings

### Authored/static

- Hero headline, supporting paragraph, beta badge, and all hero card copy.
- Experience template labels, descriptions, category chips, tips, and visual
  metadata.
- How It Works heading, four step titles/descriptions, and CTA label.
- Platform stat labels/descriptions and the “Live” label.
- Testimonial section heading/subtitle; testimonial body/name/service values
  are server/admin content.
- Earn section and final CTA copy.
- `OPERATING_MARKETS` market names used by the ribbon.

### Queried or data-dependent

- Platform statistic values from `/api/platform/stats`.
- Featured testimonials from `/api/platform/featured-testimonials`.
- Trending city cards from `/api/travelpulse/cities`.
- City images/highlights/tags/prices/crowd/deals/counts from each city row.
- Optional city-card local-expert link text/count behavior from card props;
  landing currently supplies no expert count.

### Honest placeholders / empty states

- Platform cards use a derived `0+` value before `platformStats` arrives; this
  is a loading fallback, not authored social proof.
- TrendingCities uses eight skeleton cards while loading and an empty grid
  when there are no rows; it does not invent markets.
- Testimonials are omitted entirely until at least one featured review exists.
- Shared CityCard uses its map-pin placeholder when a city has no image.
- EnhancedPlanningModal’s optional neighborhoods and hidden gems simply remain
  absent when lookup data is unavailable.

### Claims requiring care in a later frame

The page contains qualitative product copy such as “verified local experts,”
“real-time local insights,” “on-trip support,” and “hidden gem.” This audit
does not promote those phrases to measured claims. It does confirm that the
current implementation does not fabricate testimonial rows, city rows,
platform stat values, or earnings percentages.

## 7. Existing visual-capture and earn-grammar contracts

### Current capture coverage

`playwright/tests/earn-captures.spec.ts` captures the current earn-grammar
surfaces at 1280px and the shared navigation at desktop/mobile sizes. It
currently covers:

- `/experts?role=local_expert`;
- `/experts?role=travel_expert`;
- `/experts?role=event_planner`;
- the first `/experts/:id` when seed data exists;
- `/s/test-provider-qa`;
- `/providers`;
- desktop FIND HELP dropdown;
- mobile navigation sheet at 375px.

It does **not** capture `/` or any landing section. The absence is coverage
information only; this Phase 0 task does not add a landing capture.

`playwright/tests/discover-tabs.spec.ts` is the current behavioral contract for
the ungrouped marketplace surfaces and the Quick Start expert-handoff banner.
Its relevant preservation assertions include:

- `/destinations`, `/ready-made`, `/events`, and `/services` are separate
  surfaces with no retired tab bar;
- `/discover` maps legacy `?tab=` values to those surfaces and forwards other
  params;
- `/services?source=quick-start&showExperts=true` shows and can dismiss the
  handoff banner;
- city search inputs can prefill from shared trip context.

No landing capture or test modification is authorized by this audit.

### Existing earn-grammar mock convention

`docs/design/marketplace-experts-earn-grammar-mock.html` is a static sign-off
document, not a production component. Its convention is:

- document chrome outside the product frame;
- a browser-like frame with URL bar and review notes;
- Ways-to-Earn palette tokens (`--earn-*`);
- Fraunces for display headings, Inter for body copy, and Geist Mono for
  labels/metadata;
- restrained navy/teal/gold/coral semantics;
- explicit notes for source, state, and rules;
- cards with bounded metadata, honest states, and explicit action grammar.

The related spec at
`docs/superpowers/specs/2026-08-24-expert-cards-and-landing-pages-design.md`
requires shared navigation, safe public text, honest empty states, and
preservation of expert/storefront/handoff/auth behavior. These are reference
constraints for a later mock only; this audit does not apply them to the
current landing page or propose a visual restyle.

## 8. Proposed next-gate mock-frame checklist

This checklist is intentionally a proposal, not implementation authorization.
Before producing a mock frame, reviewers should confirm:

- [ ] The top-to-bottom inventory and route map in this document are accepted.
- [ ] The mock keeps the shared global navigation and the beta-ribbon decision
      explicit rather than silently replacing them.
- [ ] Every landing CTA has a named destination or in-place handler, including
      all 19 hero category slugs.
- [ ] `/ai-assistant` remains visibly distinct from the in-place planning modal
      and retains its protected-route outcome.
- [ ] The modal’s auth prompt, required fields, optional preference disclosure,
      validation, generation endpoint, and comparison/trip redirects remain
      part of the preservation contract.
- [ ] Quick Start remains a separate protected flow with its full query-state
      and expert-handoff contract.
- [ ] TrendingCities continues to use `GET /api/travelpulse/cities`, the first
      eight-row cap, the shared pulse CityCard, encoded city navigation, and
      existing card/CTA IDs.
- [ ] Live stats and admin-curated testimonials are represented as queried
      data, not mock claims; empty/loading states remain honest.
- [ ] Earn destinations continue to use `/earn?track=provider`,
      `/earn?track=expert`, and `/earn` compatibility behavior.
- [ ] All IDs in section 3 remain present or a separately authorized test
      contract is approved.
- [ ] The frame follows the existing earn-grammar mock’s source/state notes
      and typography/token conventions without claiming that the current
      landing already uses that visual system.
- [ ] The owner explicitly authorizes the next gate before any
      `landing-earn-mock.html`, `LANDING_SPEC.md`, component, layout, route,
      copy, or test change is made.

## Hard stop

Phase 0 is complete. Do not create a mock, build or reshape landing
components, change layout or handlers, add routes/APIs/photos/inventory, or
modify tests until this inventory is reviewed and the next gate is explicitly
authorized.