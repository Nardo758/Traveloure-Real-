# Marketplace / Expert / Provider surface + intake audit

`audited@c84c5e07b6274d4210d6123141846bcba35f86cf` (origin/main HEAD) · lane: `marketplace-audit` · agent: Claude Code · **read-only** — no edits, no commits, no schema/form changes. This document is the punch list the build lanes work from; it fixes nothing.

Every claim cites `file:line`. Hrefs were verified against the actual `App.tsx` route registrations and the resolving fetch, not assumed. Findings personally spot-verified during assembly are marked **[verified]**.

---

## How to read this

A displayed field can fail in four ways, and the fix differs per class:

| Class | Meaning | Fix lane |
|---|---|---|
| **DISPLAY** | captured at intake AND present in data, but the surface doesn't render it (or reads the wrong field name) | client render change |
| **INTAKE** | the surface renders/expects it, but no intake form captures it (the form never asks) | intake form change |
| **SEED** | column + intake both exist, data is empty | fixture / seed |
| **SCHEMA** | neither column nor intake exists | schema migration + intake |

Route bugs are a separate, higher-priority class: a card whose href points at a route whose page resolves a **different** source table → a live 404.

---

## Part 1 — Route correctness (the bug class)

For every card that builds an internal detail href, its source table vs the route that resolves it. Resolver map first, then the card matrix, then mismatches.

### Resolver map (route → page → resolving fetch → table)

| Route (`App.tsx`) | Page | Resolving fetch | Table |
|---|---|---|---|
| `/ready-made/:id` (`App.tsx:404`) | `ReadyMadeDetailPage` | `GET /api/ready-made/:id` (`ready-made-detail.tsx:195`) → `.from(readyMadeTrips)` (`server/routes/ready-made.routes.ts:1106`) | **ready_made_trips** |
| `/expert-templates/:id` (`App.tsx:407`) | `ExpertTemplateDetail` | `GET /api/expert-templates/:id` (`expert-template-detail.tsx:92`) → `storage.getExpertTemplate` (`routes.ts:4899`) | **expert_templates** |
| `/experts/:id`, `/local-experts/:id` (`App.tsx:396,426`) | `ExpertDetailPage` | `GET /api/experts/:id` (`expert-detail.tsx:172`; handler `routes.ts:4354`) | users + `local_expert_forms` |
| `/services/:id` (`App.tsx:472`) | `ServiceDetailPage` | `GET /api/services/:id` (`service-detail.tsx:361`) | **provider_services** |
| `/s/:handle`, `/p/:handle` (`App.tsx:412,415`) | `StorefrontPage` | `GET /api/storefront/:handle` (`storefront.tsx:295`) | storefront by handle |
| `/experiences/:slug` (`App.tsx:561`) | `ExperienceTemplatePage` | `GET /api/experience-types` by slug (`experience-template.tsx:729`) | experience_types |
| `/providers/:handle` | **no client `<Route>`** → client-side renders `<NotFound>` (`App.tsx:1219`); a hard GET is 301'd server-side to `/s/:handle` (`server/routes/storefront.routes.ts:1007-1016`) | — | — |

### Card matrix (match = href's route resolves the card's source table)

| Card | Surface | Source table | Href (file:line) | Resolver | Match? |
|---|---|---|---|---|---|
| **FeedReadyMadeCard** | `/discover/location/:city` | **expert_templates** (`GET /api/expert-templates?destination=`, `discover-location.tsx:1717`, item `kind:"package"` `:1946`) | `/ready-made/${template.id}` (`feed/ready-made-card.tsx:58`) | `/ready-made/:id` → ready_made_trips | **NO — 404** |
| ReadyMadeThemeCard | `/ready-made`, `/discover` | ready_made_trips (`discover.tsx:910`) | `/ready-made/${l.id}` (`discover.tsx:179,209,250`) | `/ready-made/:id` | YES |
| ServiceMarketplaceCard | `/services`, `/discover` | provider_services (`/api/discover`) | `/services/${id}` (`discover.tsx:393,504`); author `/s/:handle`\|`/experts/:id` (`:379-381`) | `/services/:id` | YES |
| CityFeedCardGem | bento | gem→provider_services | `/services/${gem.providerServiceId}` (`city-feed-card.tsx:811`) | `/services/:id` | YES |
| CityFeedCardVendorService | bento | provider_services | `/services/${service.id}` (`city-feed-card.tsx:1551…`) | `/services/:id` | YES |
| CityFeedCardExpert | bento | expert | `/s/:handle` else `/experts/:id` (`city-feed-card-expert.tsx:61`) | resp. | YES |
| ExpertCard | bento, `/experts` | expert | `/experts/${id}` (`expert-card.tsx:197…`); `/s/${handle}` (`:498`) | resp. | YES |
| CityFeedCardExternalStub | bento | provider ref | provider→`/services/${resolutionRef}` (`city-feed-card-external-stub.tsx:67`) | `/services/:id` | YES |
| Storefront service / template / ready-made lanes | `/s/:handle` | provider_services / expert_templates / ready_made_trips | `/services/:id` (`storefront.tsx:673`) · `/expert-templates/:id` (`:705`) · `/ready-made/:id` (`:734`) | resp. | YES (the correct source-keyed pattern) |
| expert-detail template / ready-made offerings | `/experts/:id` | expert_templates / ready_made_trips | `/expert-templates/${p.id}` (`expert-detail.tsx:413`) · `/ready-made/${r.id}` (`:428`) | resp. | YES |
| ExpertCard cross-sell trips | `/experts` | ready_made_trips (`experts.tsx:268`) | `/ready-made/${trip.id}` (`experts.tsx:839`) | `/ready-made/:id` | YES |
| Provider directory card | `/providers` | storefronts (`/api/provider-storefronts`) | `/s/${handle}` (`providers-directory.tsx:55`) | `/s/:handle` | YES |
| service-browser / template-recommendations | search/rec widgets | expert_templates | `/expert-templates/${pkg.id}` (`service-browser.tsx:291`, `user/template-recommendations.tsx:220`) | `/expert-templates/:id` | YES |
| Events / Supply / Recommendation cards | bento, `/events` | event / supply / rec | external `event.url` or `onBook`/`onAdd` only — no internal detail href | — | N/A |

### Mismatches

**R1 — FeedReadyMadeCard 404 (live on main). [verified]** The bento's ready-made tile is fed **expert_templates** rows (`/api/expert-templates`, `discover-location.tsx:1717`; it reads `template.price/expertName/salesCount/duration` — expert_templates columns, none of which exist on ready_made_trips) but links to `/ready-made/${template.id}` (`feed/ready-made-card.tsx:58`), whose page resolves `ready_made_trips` only and returns `404 "Trip not found"` (`ready-made.routes.ts:1106-1111`). Disjoint id spaces ⇒ every "Get this trip" click 404s. The file's own header still says the target is `/expert-templates/:id` (`ready-made-card.tsx:7`) — copy-paste drift. **Status: already being fixed in open PR #602 (`feature/bento-feed-rules`)** by keying the href off the card's source (`ready_made_trips → /ready-made/:id`, `expert_templates → /expert-templates/:id`), mirroring the storefront lanes; not yet merged to main.

**R2 — `/providers/:handle` client 404. [verified]** No client `<Route>` exists (`App.tsx`), so an in-app SPA navigation to `/providers/:handle` renders `<NotFound>`. Only a hard/full-page GET is caught server-side and 301'd to `/s/:handle` (`storefront.routes.ts:1007-1016`). Any client-side link built as `/providers/:handle` is a dead link; the canonical is `/s/:handle`.

The "resolver-mismatch repeats everywhere" hypothesis did **not** hold: exactly one true 404-class card bug (R1). Every other card links to the route that resolves its own source. The storefront's three source-keyed lanes are the correct reference pattern.

---

## Part 2 — Field → source → intake map

Role storage reality (`shared/schema.ts`, `shared/models/auth.ts`): there is **no per-role profile table**. The expert family (`local_expert` / `travel_expert` (= the "trip planner") / `event_planner`) shares `local_expert_forms` keyed by `expertType`; `service_provider` uses `service_provider_forms`. Public profile fields (`bio`, `specialties`, `profileImageUrl`, `handle`, `createdAt`, `preferences.storefront.coverImageUrl`) live on `users`.

### 2.1 Expert profile `/experts/:id` (`expert-detail.tsx`) — renders only for handle-LESS experts (a claimed handle redirects to `/s/:handle`, `expert-detail.tsx:350`)

| Field | Rendered (file:line) | Source table.column | Intake (file:line) | Class |
|---|---|---|---|---|
| bio | `expert-detail.tsx:501` (`expert.expertForm.bio`) | `local_expert_forms.bio` (`schema.ts:447`) | onboarding `travel-experts.tsx:217` → `local_expert_forms.bio`; editor `expert/profile.tsx:317` | OK |
| response time | `:519-524` | `local_expert_forms.responseTime` (`schema.ts:452`) | onboarding only (`travel-experts.tsx:221`) | OK |
| member-since | **omitted** (comment `:503-505`) | would be `users.createdAt` (`auth.ts:87`) | n/a | **DISPLAY** |
| neighbourhoods | `:549-568` | `local_expert_forms.neighborhoods` (`schema.ts:435`) | onboarding + editor | OK |
| specialties | `:630-637` renders `specializations` | `local_expert_forms.specializations` | onboarding + `/api/expert/specializations` | OK |
| languages | `:540-545` | `local_expert_forms.languages` (`schema.ts:431`) | onboarding + editor | OK |
| verified | `:488` (`identityVerificationStatus==='verified'`) | `local_expert_forms.identityVerificationStatus` (`schema.ts:502`) | Stripe Identity | OK (derived) |
| rating | `:511-517` | derived `avg(service_reviews.rating)` (`routes.ts:4363`) | n/a | OK |
| price / lowest | `:738` (`services[0].price`) | `provider_services.price` | service-form | OK |
| **avatar** | `:477` (`expert.profileImage`) | `users.profileImageUrl` (`auth.ts:45`) — API returns `profileImageUrl`, **never `profileImage`** (`getExpertsWithProfiles` spreads the users row, `storage.ts:4446`) | editor `expert/profile.tsx:481` → `/api/expert/photo` | **DISPLAY — live bug [verified]** (reads a field name that doesn't exist ⇒ avatar always falls back to initials) |
| cover image | **not rendered** (gradient only, `:474`) | `users.preferences.storefront.coverImageUrl` | `handle-claim-card.tsx:168` (unused here) | DISPLAY |
| consultation config | derived from `services[0]` (`:735-742`) | none | none | **SCHEMA** |

### 2.2 Storefront `/s/:handle` (`storefront.tsx`) — expert AND provider; `earner` built at `storefront.routes.ts:763-782`

| Field | Rendered | Source | Intake | Class |
|---|---|---|---|---|
| bio | `:512-513` (`earner.bio`) | `users.bio` (`storefront.routes.ts:563`) **[verified]** | editor only (expert `expert/profile.tsx:317`; provider `provider/profile.tsx:64`) — **not onboarding** | **INTAKE** (see Part 3) |
| member-since | `:521-525` | `users.createdAt` (`storefront.routes.ts:752`) | automatic | OK |
| location | `:486-492` (`earner.location`) | derived (`storefront.routes.ts:165`); **null for providers** (`:162-164`) | expert `local_expert_forms.city`; provider: none | **INTAKE (providers)** |
| verified | `:471-481` | derived `isOwnerIdentityVerified` (`:143-157`) | Stripe/Persona | OK |
| rating | `:518-519` | derived aggregate over `provider_services` (`:816-854`) | n/a | OK |
| price | per-card `:665,681` | `provider_services.price` | service-form | OK |
| cover image | `:446-450` | `users.preferences.storefront.coverImageUrl` (`:751`) | `handle-claim-card.tsx:168` → `PATCH /api/me/storefront` | OK |
| **avatar** | `:453-457` (`earner.profileImageUrl`) | `users.profileImageUrl` (`:564`) | expert `/api/expert/photo`; **provider: NONE** (`provider/profile.tsx:268`) | **INTAKE (providers)** |
| handle | `:485,534` | `users.handle` (`:566`) | `handle-claim-card.tsx` → `PATCH /api/me/handle` | OK |
| response time | **not rendered** (`:778`) | expert has it; provider none | — | DISPLAY |
| neighbourhood chips | not rendered (feeds only `location`) | `expert_neighborhoods`→`city_neighborhoods` | admin/onboarding | DISPLAY |
| **Sidebar fee-attribution panel** (`Came from a provider link?` — waived service fee, rails rate) | **entirely absent** — `storefront.tsx` is single-column | resolved `acquired_via_provider_id` values | n/a (read-only display) | **DISPLAY (largest storefront gap)** — see Part 4 |

### 2.3 Expert browse card (`expert-card.tsx`, consumer `experts.tsx`)

| Field | Rendered | Source | Class |
|---|---|---|---|
| avatar | `:274` (`expert.profileImageUrl`) | `users.profileImageUrl` | OK (correct field, unlike 2.1) |
| **specialties** | `:250` `expert.specialties \|\| expert.specializations?.slice(0,2)` | `users.specialties` (`auth.ts:48`, **default `[]`**) — no server writer exists | **DISPLAY — live bug [verified]**: `users.specialties` is always `[]`, and `[] \|\| x` returns `[]` in JS (empty array is truthy), so the `specializations` fallback is **dead code** ⇒ the card never shows specialties |
| languages / neighbourhoods / response time | `:238-251,346-400` | `local_expert_forms.*` | OK |
| rating / price / verified | `:242-247,332,460` | derived / `provider_services` / form | OK |

### 2.4 Provider directory card (`providers-directory.tsx`, `/api/provider-storefronts`)

| Field | Rendered | Source | Class |
|---|---|---|---|
| avatar | `:60-63` (`profileImageUrl`) | `users.profileImageUrl` (`storefront.routes.ts:814`) | **INTAKE** (no provider photo intake) |
| name / handle | `:76,78` | `users` | OK |
| bio | `:82-83` | `users.bio` (`:813`) | **INTAKE** (onboarding writes `service_provider_forms.description`, not `users.bio`) |
| rating / service count | `:87-94` | derived | OK |
| location | fetched (`:891`) but **not rendered**; null for providers | derived | DISPLAY / INTAKE |
| category / neighbourhood pills, Message/View-storefront buttons | absent (whole card is one `<Link href="/s/:handle">`, `:54`) | endpoint has no facet | SCHEMA/endpoint |

### 2.5 Traveler service card (storefront service lane `StorefrontOfferingCard`, `storefront.tsx:187`)
All fields (name, price+unit, delivery method, image, rating, city chip, showPrice/bookingMode) resolve correctly to `provider_services.*` (`storefront.routes.ts:594-644`). **No gaps.** (`components/shared/service-card.tsx` is the owner-console management row, not a traveler card.)

---

## Part 3 — Bio, per role (the "match bio to the proper intake input" ask, generalized)

The four earner roles collapse onto **two** bio storage patterns. **Cross-cutting finding [verified]:** every role's *public* bio field (`users.bio`) is written **only by the post-signup profile editor, never by the onboarding application** — onboarding writes a *different* column than the storefront/directory read. A freshly-approved earner who never opens the editor renders with an **empty storefront/directory bio**.

| Role | Bio column | Intake writes (file:line) | Profile reads (file:line) | Class |
|---|---|---|---|---|
| **local_expert** | `local_expert_forms.bio` **and** `users.bio` | onboarding `travel-experts.tsx:217` → `local_expert_forms.bio` **only** (`routes.ts:1998`); editor `expert/profile.tsx:317` → **both** (`routes.ts:4593` users.bio, `:4604` form.bio) | `/experts/:id` reads `local_expert_forms.bio` (`expert-detail.tsx:501`); `/s/:handle` reads `users.bio` (`storefront.tsx:513`) | **INTAKE** on the `users.bio` side (onboarding never fills the storefront bio) |
| **trip_planner** (`expertType=travel_expert`) | same as local_expert | same form (`/become-expert?type=travel_expert`, `earn-roles.ts:103`) → `local_expert_forms.bio` only | same as local_expert | **INTAKE** (identical) |
| **event_planner** | same as local_expert | same form (event chooser) → `local_expert_forms.bio` only | same expert surfaces | **INTAKE** (identical) |
| **service_provider** | `users.bio` only (`service_provider_forms` has **no bio**, only `description`, `schema.ts:538`) | onboarding `services-provider.tsx:134` writes `service_provider_forms.description` (**no public surface reads it**); `users.bio` written only by editor `provider/profile.tsx:64` | `/s/:handle` + directory read `users.bio` | **INTAKE + DISPLAY** — onboarding captures a `description` nothing renders (collected-never-read), and the rendered `users.bio` has no onboarding intake |

**The fix shape (for the lanes, not done here):** either point the storefront/directory read at the column onboarding fills, or have onboarding write `users.bio` too (the editor already does — mirror it). For providers, decide whether `service_provider_forms.description` IS the public bio (then read it) or add a `users.bio` capture to provider onboarding.

---

## Part 4 — Per-role profile completeness vs the earn-grammar mock

Mock spec: `docs/design/MARKETPLACE_EXPERTS_EARN_GRAMMAR_SPEC.md` §3.9–3.11; visual of record `docs/design/marketplace-experts-earn-grammar-mock.html` Frame 5 (expert profile `:733-771`), Frame 6 (storefront `:773-814`), Frame 7 (providers `:816-847`).

**The mock draws only two profile frames and does not differentiate the three expert roles** — Frame 5 is one `local_expert` example (only the eyebrow reflects role); Frame 6 is one `service_provider` storefront. So per-role completeness is really: profile-frame (handle-less experts → `expert-detail.tsx`) vs storefront-frame (claimed handle + all providers → `storefront.tsx`).

### 4.1 Expert-profile frame (Frame 5) vs `expert-detail.tsx` — gaps
- **member-since fact absent** (`:503-505`) — only 3 of the mock's 4 facts render.
- **hero Message + Share actions absent** (mock `:741`) — no hero buttons, no Share anywhere.
- **`Consultation · Video · 45 min` sidebar line absent** (mock `:765`).
- **avatar bug** (Part 2.1) — always initials.
- **handle line absent** — handle-bearers redirect away, so `@handle` never renders here.
- **card-family grammar not implemented** — renders local `OfferingTile` (`:78-149`), missing the ratified 3-col facts row · source row · three-state action row (`2026-08-25-card-family`).

### 4.2 Storefront frame (Frame 6) vs `storefront.tsx` — gaps
- **Sidebar `Came from a provider link?` fee-attribution panel entirely absent** (§3.10) — `storefront.tsx` is single-column; the money-page resolved-fee panel (waived service fee / rails rate, reading `acquired_via_provider_id`) is missing. **Largest storefront delta.** In its place: a "Not sure what you're looking for?" band (`:754-776`) + trust strip (`:779-810`), neither in the mock.
- **card-family grammar not implemented** — `StorefrontOfferingCard` (`:187-275`) missing facts/source/action-state rows.
- provider avatar/bio intake gaps (Parts 2.2/2.4).

### 4.3 Providers directory (Frame 7) vs `providers-directory.tsx` — gaps
- one search field only ("What…"); **no "Where" field, no `Filters +`, no `?market=` filter, no market-specific empty state** — several documented as honest endpoint limitations (§13), not oversights.
- xcard missing: location line, category + neighbourhood pills, Message/View-storefront buttons.

### 4.4 Role-shape today
The only page rendering visibly different chrome per role is `storefront.tsx` (`isProviderRole`, `:380-387` — eyebrow + verified label + SEO) and `experts.tsx` (band glyph/copy + neighbourhood filter shown **only** for `local_expert`, `:549`). `expert-detail.tsx` conditions only the eyebrow label (`ROLE_LABELS`, `:55-59`). `trip_planner`/`event_planner` profiles are the `local_expert` skeleton with a different eyebrow — matching the mock, which itself does not differentiate them. **Note:** the task's `trip_planner` maps to stored role `travel_expert`; a literal `trip_planner` would fall through `ROLE_LABELS` to "Expert".

---

## Part 5 — Ranked findings

### A. Route bugs (highest priority — live 404s)
| # | Finding | File:line | Fix | Lane |
|---|---|---|---|---|
| R1 | FeedReadyMadeCard links expert_templates data to `/ready-made/:id` (ready_made_trips resolver) → every "Get this trip" 404s | `feed/ready-made-card.tsx:58` | route the href off the card's source (mirror `storefront.tsx:705/734`) | **already in flight — PR #602** (`feature/bento-feed-rules`); not on main |
| R2 | `/providers/:handle` has no client route → SPA nav renders NotFound | `App.tsx` (missing), server 301 `storefront.routes.ts:1007` | never build client links as `/providers/:handle`; canonical is `/s/:handle` | display fix (grep components for the pattern) |

### B. Field gaps by class
| Finding | Class | File:line | Fix | Lane |
|---|---|---|---|---|
| `/experts/:id` avatar reads `expert.profileImage`; data is `profileImageUrl` → always initials | DISPLAY (live bug) | `expert-detail.tsx:477` | rename the read to `profileImageUrl` | display fix |
| Browse card `expert.specialties \|\| specializations` — `users.specialties` default `[]` (truthy), no writer → fallback dead, chips always empty | DISPLAY (live bug) | `expert-card.tsx:250`; `auth.ts:48` | read the form's `specializations`, or treat empty `[]` as falsy in the `\|\|` | display fix |
| Public bio (`users.bio`) filled only by the editor, never onboarding — fresh earners render empty storefront/directory bio (all 4 roles) | INTAKE | Part 3 table | onboarding writes `users.bio` too (mirror editor), or read the onboarding-filled column | intake form change |
| Provider avatar rendered but no provider photo intake | INTAKE | `provider/profile.tsx:268`; `storefront.tsx:453`, `providers-directory.tsx:60` | add a provider photo rail writing `users.profileImageUrl` | intake form change |
| Provider storefront/directory location rendered but null (no provider city intake) | INTAKE | `storefront.routes.ts:162-164` | add provider city capture, or stop rendering the null location | intake form change |
| Expert-profile member-since omitted (data on `users.createdAt`) | DISPLAY | `expert-detail.tsx:503` | render `users.createdAt` as the 4th fact | display fix |
| Expert-profile cover image never rendered (column + intake exist) | DISPLAY | `expert-detail.tsx:474` | render `preferences.storefront.coverImageUrl` | display fix |
| Storefront fee-attribution sidebar absent (money page) | DISPLAY | `storefront.tsx` (single-column) | build the two-grid + resolved-fee panel (§3.10) | display fix (larger) |
| Card-family grammar (3-col facts · source · action-state) not implemented on profile/storefront cards | DISPLAY | `expert-detail.tsx:78`, `storefront.tsx:187` | bring both to `2026-08-25-card-family` | display fix (larger) |
| Provider onboarding captures `service_provider_forms.description` that no public surface reads | DISPLAY (collected-never-read) | `services-provider.tsx:134`; `schema.ts:538` | decide: read it as the provider bio, or drop the field | intake/display decision |
| Expert-profile consultation config derived from `services[0]`; no dedicated column/intake | SCHEMA | `expert-detail.tsx:735` | add a consultation-config column + intake if the "Plan it for me" panel is to be real | schema migration |
| Providers directory: no `?market=`/Where filter, no category/neighbourhood facet | SCHEMA/endpoint | `providers-directory.tsx:220`; `/api/provider-storefronts` | add facets to the endpoint + the Where field | schema/endpoint + intake |

### Verification note
R1, R2, the avatar bug, the specialties bug, and the bio-intake mismatch were each spot-verified against source during assembly (`[verified]` above). The remaining rows are agent-reported with the cited file:line; a lane picking one up should re-open the citation before building.
