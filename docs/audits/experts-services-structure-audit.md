# Experts & Services Pages — Structure / Navigation / Construction Audit

**Type:** Read-only evaluation. Code @ `main` HEAD `e931e1bf` ("chore: restore .replit without Stripe test key"). Audited 2026-07-11.
**Scope (confirmed):** all four surfaces — A (demand-side Experts), B (demand-side Services + `/earn` + recruitment), C (supply-side Expert services), D (supply-side Provider services).
**Method:** every claim backed by `file:line` grep evidence, re-verified against HEAD. Routing is wouter (no `react-router-dom` found on any in-scope page). Declared / mounted / reachable / renders / functions kept separate throughout.

---

## Cross-cutting infrastructure facts (verified, referenced throughout)

**F1 — `server/routes/experts.routes.ts` is imported but NEVER mounted.**
```
$ grep -rn "expertsRoutes" server/
server/routes.ts:104:import expertsRoutes from "./routes/experts.routes";
```
That import is the only reference; there is no `app.use(expertsRoutes)` anywhere (the mount block is routes.ts:439–489: instagram, bookings, bookingActions, messages, myItinerary, transportHub, plancard, optimization, concierge, upsell, payments, content:477, expert-workspace:482, identity:485, webhooks:487, admin:489). **Every route registered in experts.routes.ts is dead code.** Most of its registrations happen to have live inline twins in routes.ts, which masks the missing mount — but two endpoints exist *only* there and 404 at runtime (see C1), and its `/api/experts` copy lacks the `role` filter the live handler has (a latent trap if anyone ever mounts it).

**F2 — Duplicate-registration precedence.** `app.use(contentRoutes)` at routes.ts:477 executes before the inline `app.get/app.post` duplicates later in `registerRoutes` (starts routes.ts:230; server/index.ts:361 `await registerRoutes(httpServer, app)`). Express first-registration-wins, so for every duplicated path **the content.routes.ts copy wins**. Duplicate pairs touching these pages: `/api/experience-types` (content.routes.ts:875 wins over routes.ts:2532 — identical), `/api/service-categories` (content.routes.ts:726 over routes.ts:2366 — identical), `/api/service-categories/:id/subcategories` (content.routes.ts:772 over routes.ts:2409 — identical), `/api/city-neighborhoods` (content.routes.ts:686 over routes.ts:2210 — identical), `/api/services` + `/api/services/:id` (content.routes.ts:1888/1878 over routes.ts:5168/5140 — identical), `/api/services/:serviceId/reviews` (content.routes.ts:2299 over routes.ts:6070 — **divergent**: winner moderates/redacts, loser returns unmoderated rows; shadowing currently points the safe way but is fragile), `/api/service-templates` (content.routes.ts:1667 `isDefault=true` over routes.ts:3535 `CANONICAL_NAMES` — different row sets, winner functional), `/api/grok/match-experts` (content.routes.ts:3708 over routes.ts:9345 — **divergent**: loser expects a different payload/shape and would break the match cards; currently the intended one wins).

**F3 — Client query plumbing (`client/src/lib/queryClient.ts`).** The default `queryFn` builds URLs from the queryKey: an object second element serializes to `?params` (lines 57–65), otherwise segments **path-join with `/`** (line 68 — drops `null`/`undefined`, keeps empty strings). Non-OK responses throw; `retry: false`. A failed query with a `= []` default renders the empty state silently forever. This is load-bearing for the `/service-providers` filter breakage (B2).

**F4 — `provider_services.approval_status` defaults to `"approved"`.**
```
shared/schema.ts:563:  approvalStatus: varchar("approval_status", { length: 20 }).default("approved"), // draft, submitted, approved, rejected
```
Any insert that omits `approvalStatus` creates a born-approved service. Load-bearing for the approval-bypass finding (C2).

---

## Phase 0 — Classified inventory

### A. Demand-side Experts

| Route | App.tsx | Page file | Gate | Exists |
|---|---|---|---|---|
| `/experts` | 252 | `pages/experts.tsx` (import :97) | none (public, `Layout`) | ✅ |
| `/experts/:id` | 255 | `pages/expert-detail.tsx` (:152) | none (self-wraps `Layout`) | ✅ |
| `/local-experts` | 258 | same `ExpertsPage` re-mount | none | ✅ |
| `/local-experts/:id` | 261 | same `ExpertDetailPage` re-mount | none | ✅ |

### B. Demand-side Services / recruitment funnel

| Route | App.tsx | Page file | Gate | Exists |
|---|---|---|---|---|
| `/earn` | 234 | `pages/earn.tsx` (:34) — self-wraps `Layout` | none | ✅ |
| `/partner-with-us` | 312 | Redirect → `/earn` | — | — |
| `/service-providers` | 264 | `pages/service-providers.tsx` (:98) | none | ✅ |
| `/services/:id` | 286 | `pages/service-detail.tsx` (:139) | none | ✅ |
| `/become-expert`, `/expert/apply` | 391, 398 | `pages/travel-experts.tsx` (:109) | none | ✅ |
| `/become-provider`, `/provider/new-service` | 394, 401 | `pages/services-provider.tsx` (:110) | none | ✅ |
| `/travel-experts`, `/services-provider` | 749, 752 | Redirects → `/become-expert`, `/become-provider` | — | — |

### C. Supply-side Expert services

| Route | App.tsx | Page file | Gate | Exists |
|---|---|---|---|---|
| `/expert/services` | 475 | `pages/expert/services.tsx` (:44) | `requiredRole="expert"` | ✅ |
| `/expert/services/new` | 478 | `pages/expert/service-wizard.tsx` (:134) | expert | ✅ |
| `/expert/services/:id/edit` | 481 | `pages/expert/service-form.tsx` (:132) | expert | ✅ |
| `/expert/services/templates`, `/expert/custom-services`, `/expert/templates`, `/expert/service-wizard` | 484, 487, 505, 532 | all Redirect → `/expert/services/new` | — | — |

### D. Supply-side Provider services

| Route | App.tsx | Page file | Gate | Exists |
|---|---|---|---|---|
| `/provider/services` | 601 | `pages/provider/services.tsx` (:62) | `requiredRole="provider"` | ✅ |
| `/provider/services/new` | 604 | `pages/provider/service-form.tsx` (:133) | provider | ✅ |
| `/provider/services/:id/edit` | 607 | same `ProviderServiceForm` | provider | ✅ |

Every routed import resolves to a real file; **no route points at a missing file**.

### 🚩 Orphan page files (on disk, imported nowhere in client/src)

| File | Why orphaned |
|---|---|
| `pages/partner-with-us.tsx` | `/partner-with-us` is now a Redirect (App.tsx:312); file carries its own duplicate role-card copy (:53–133) |
| `pages/expert/service-templates.tsx` | `/expert/services/templates` is a Redirect (App.tsx:484) |
| `pages/expert/custom-services.tsx`, `leaderboard.tsx`, `messages.tsx`, `performance.tsx`, `revenue-optimization.tsx`, `templates.tsx`, `content-create.tsx` | routes redirect elsewhere or never existed; files are dead code |
| `pages/provider/payouts.tsx` | **no route at all** — unreachable |
| `pages/provider/availability-management.tsx`, `pages/provider/messages.tsx` | no mount / route is a Redirect |

---

## Phase 1 — Per-page construction records

### A1. `pages/experts.tsx` (883 lines) — `/experts`, `/local-experts`

**Composition:** shared `Layout` applied by App.tsx. Render order: hero + hand-rolled role-switcher tablist (:306–391) → "AI Expert Matching" shadcn `Collapsible` with `ExpertMatchCard` grid (:394–608) → filter bar (:614–701) → filter chips (:704–750) → `ExpertCard` grid (:759–776, `components/expert-card.tsx`) → empty state (:779–804) → role-conditional recruitment CTA (:825–880). Heavy shadcn + framer-motion; role switcher and CTA hand-rolled.

**Data sources (all live):**
- `GET /api/experience-types` (:229–231) → content.routes.ts:875 wins (F2, identical twin at routes.ts:2532).
- `GET /api/experts/counts?experienceTypeId&neighbourhood&location` (:235–247) → single registration routes.ts:3868 (registered before `/:id` at :3963, so not swallowed). All three params read (:3869–3871).
- `GET /api/experts?…&role` (:250–263) → live routes.ts:3908 (supports `role` at :3913, :3919–3921). Dead unmounted copy experts.routes.ts:588 **lacks `role` handling** (F1 latent trap).
- `POST /api/grok/match-experts` (:207) → content.routes.ts:3708 wins and is the intended one; shadowed routes.ts:9345 expects a different payload and would break the cards. Both `isAuthenticated`; the page has **no sign-in gate** on the match button — logged-out users get the generic error card (:547–564).

**Canonical source:** live DB, not mock — `storage.getExpertsWithProfiles` (server/storage.ts:2304–2362) reads `users` filtered to expert roles, joins `expert_experience_types`/`experience_types`, **`provider_services`** (via `getExpertSelectedServices`, storage.ts:2245–2247), `expert_specializations`, `local_expert_forms`, with a local-expert approval gate (:2347–2352). **Deviation:** neither page nor endpoint reads `expert_offering_types`; the filter taxonomies are hardcoded arrays (`destinations` :58–68, `specialties` :70–82, `languages` :84–95).

**Silent-drop (live):** page sends `neighbourhood` at ≥2 chars (:240, :255) but the server excludes **every** expert when the param is <3 chars (routes.ts:3942 and :3893 `if (nbh.length < 3) return false;`) — a 2-character query returns an empty list/zero counts instead of ignoring the filter.

**Derived-logic defects:** price sort is a dead no-op — `:288–301` sorts on `selectedServices?.[0]?.offering?.price || 0`, but rows are raw `provider_services` (no `.offering`; `price` is top-level, shared/schema.ts:511–523) so every comparand is 0. Default sort compares `b.superExpert` — no such column on `users`; also inert.

**Empty/loading/error:** list skeleton (:753–757), but the empty state at :779 is **not gated on `!isLoadingExperts`** (spinner and "No experts found" render simultaneously on first load), and there is **no error state** — a network failure renders as "No experts found".

**Band literals:** mandated grep → only benign CSS/animation values. (Server-side related: `storage.ts:2264` hardcodes `revenueShareRate: '0.75'` on the expert-service insert path — a rate not resolved through `fee_bands`.)

**Verdict: renders + fetches live data** (with the inert sorts, the 2-char empty-result trap, and no error surfacing).

### A2. `pages/expert-detail.tsx` (547 lines) — `/experts/:id`, `/local-experts/:id`

**Composition:** App.tsx doesn't wrap it, but the page self-wraps shared `Layout` (import :30; loading :100, not-found :121, main :161) — same shell one level down (inconsistency, not a missing shell). Back bar → hero (Avatar, badges, stats) → shadcn `Tabs` About/Services/Reviews (:301–490) → sticky booking card (:495–539). All shadcn; no bespoke forks.

**Data sources:**
- `GET /api/experts/:id` (:43–51) → routes.ts:3963, live (loads *all* experts then `.find()` — O(all-experts) per view).
- `GET /api/experts/:id/services` (:54–62) → routes.ts:3973 → `getExpertSelectedServices` (storage.ts:2245–2247) — **no `approvalStatus`/`status` filter**: the public page renders and offers "Book Now" (:415–426 → `/cart`) on draft/paused/unapproved `provider_services` rows, contradicting the documented approval gate.
- `GET /api/experts/:id/reviews` (:88–96) → routes.ts:3985 is a **stub**: `res.json([])` unconditionally (`// TODO: Implement storage.getExpertReviews`, :3988–3990). The Reviews tab can never populate.
- Unmounted experts.routes.ts twins (:642/:653/:666) inert per F1.

**Data-shape breakages (fields that don't exist on returned rows):**
- `expert.profileImage` :182 (column is `profileImageUrl`, shared/models/auth.ts:45) — avatar image never renders.
- `expert.averageRating` :139, `reviewCount` :140, `completedTrips` :230, `superExpert` :156 — none exist on `users`; page always shows "0.0", "(0 reviews)", "0 trips".
- `service.name` :391 and `services[0]?.name` :509 — column is `serviceName` (schema.ts:515); **Services-tab titles render blank**.
- **`const verified = expert.verified || true;` (:157) — always `true`.** Every expert shows the Verified checkmark (:193–195) regardless of status. (Contrast expert-card.tsx:82–93, which correctly keys off `identityVerificationStatus`.)

**Hardcoded policy copy:** "Free cancellation up to 24h" :527, "Instant confirmation" :531, "24/7 support" :535 — fabricated claims ignoring the per-service `cancellation_policy` column. "Starting from" price uses `services[0]` (insertion order), not the minimum (:503–504).

**Empty/loading/error:** full skeleton page, not-found state, per-tab empty states, defaults `[]` — no crash-class access found. Fetch errors conflate with "Expert Not Found".

**Band literals:** mandated grep → zero hits. Fabricated ratings feeding sibling surfaces: `const rating = 4.9;` (expert-card.tsx:86, expert-match-card.tsx:133) and server `averageRating: 4.5` (content.routes.ts ~:3789).

**Verdict: renders + fetches live data** — with one live-registered but dead-data endpoint (reviews stub) and multiple shape mismatches nullifying features.

### B1. `pages/earn.tsx` — `/earn`

**Composition:** self-wraps shared `Layout` (import :26, used :287). Hero (:290–313) → role band, 4 × `RoleCard` (:107–145 def, :327–337) + EA link (:340–349) → per-role `OfferingRow` catalog (:147–174 def, :393–403) → "You probably didn't know…" `is_surprising` strip (:409–433). Hand-rolled local components over one shadcn `Button`.

**Data sources — all live, all canonical, zero literals:**
- `GET /api/offering-types/services` (:193–196) → content.routes.ts:222 (single, mounted) → `content-query.service.ts:35–49`: `SELECT … FROM service_offering_types WHERE is_active = true …`. ✅ canonical.
- `GET /api/offering-types/experts` (:197–200) → content.routes.ts:236 → `content-query.service.ts:51–62`: `SELECT … FROM expert_offering_types …`. ✅ canonical.
- `GET /api/service-categories` (:201–204) → content.routes.ts:726 wins (F2, identical twin) → `service_categories` incl. `commissionBandKey`.
- `GET /api/fee-bands/:bandKey` (:216–221, `useQueries` over category band keys + `expert_standard` floor) → payments.routes.ts:793 (single, mounted) → `fee_bands`. **The 75% floor is never a literal** — `formatKeep(rate)` (:77–80) computes keep-% from the live band, filtered to `rate_type === "percent"` (:222–226). Mandated band grep → **zero hits**.

**Structure vs. spec (two tracks × three bands):**
- **Two tracks:** present, re-projected as 4 roles over the 2 tracks via `EARN_ROLES` (`client/src/lib/earn-roles.ts:81–110`; partition fns :132–136, :139–141). Source catalogs are live; **the role→offering mapping is a hardcoded client constant** (documented as deliberate v1 at earn-roles.ts:19–22, covered by `__tests__/earn-roles.test.ts`) — not admin-editable.
- **(a) Featured `isSurprising`: PRESENT** (:264–279 filter from both catalogs, rendered :409–433).
- **(b) Full grouped catalog: PARTIAL** — full catalog exists but grouped by role only; `offeringsForRole` (:243–253) returns a flat list, no per-`category_key`/`service_tier` subgrouping; only one role visible at a time; `delivery_formats` fetched (:56) but never rendered.
- **(c) "In your city" marketScoped: MISSING.** `market_scoped` appears only as the interface field (:47) and is never read; no market detection; the client never sends `?market=` although the server fully supports it (content.routes.ts:219–224 + market SQL in content-query.service.ts:41–45). Client-side gap, not a backend gap.

**Empty/loading/error:** best of all audited pages — loading text (:362–363), error card with Retry (:364–383), empty state (:384–391), `?? []` throughout.

**Minor flag:** `formatKeep` recomputes keep-% as `1 − default_rate` client-side, duplicating the fee resolver's semantic interpretation (safe today; inverts silently if band semantics ever flip).

**Verdict: renders + fetches live data.** Spec deltas: missing marketScoped band, role-not-tier grouping, hardcoded role partition.

### B2. `pages/service-providers.tsx` — `/service-providers`

**Composition:** self-wraps shared `Layout` (:3, :293). Header → category-filter sidebar (`CategoryCard` :197–236) → search/location/sort controls (:364–396) → `ServiceCard` grid (:130–195 def) / skeletons / empty state with "Become a Provider" CTA (:444–461).

**Data sources:**
- `GET /api/service-categories` (:244–246) → content.routes.ts:726 wins (identical twin). Live.
- **Services list — BROKEN by query-key path-join (F3).** `:248–250`:
```ts
queryKey: ["/api/services", selectedCategory, locationFilter],
```
The winning list handler (content.routes.ts:1888) reads `?categoryId=`/`?location=` → `storage.getAllActiveServices` (storage.ts:1242–1254: `provider_services` where `status='active'` — ✅ canonical). But the default queryFn path-joins the key:
  - Default state → `"/api/services/"` (trailing slash; Express non-strict routing matches the list) — **works by accident**.
  - Category selected → `/api/services/<categoryUuid>/` → matches **`/api/services/:id`** (content.routes.ts:1878) → `getProviderServiceById(categoryUuid)` → 404 → query throws → silent "No services found". **Every category filter yields an empty marketplace.**
  - Location typed → `/api/services/<text>` → same 404, on every keystroke.
  - Both → `/api/services/<uuid>/<text>` → no route → 404.
  The redundant client-side filters at :263–271 suggest the key segments were meant as cache discriminators; the shared queryFn makes keys = URL. **No error state exists** (no `error` destructured) so the failure is indistinguishable from an empty marketplace.

**Band literals:** zero hits (price interpolations are data values).

**Verdict: renders + fetches live data in its default state only; every filter interaction fetches the wrong (detail) endpoint** and fails silently. Category and location filtering are functionally dead.

### B3. `pages/service-detail.tsx` — `/services/:id`

**Composition:** self-wraps `Layout` (:4; :125, :137, :180). Title + verification badges → About / Pricing Tiers / What's Included / Reviews (`ReviewCard` :394–504 incl. flag Dialog) → sticky booking card (:320–387). All shadcn.

**Data sources (all live, all canonical):**
- `GET /api/services/:id` (:95–98) → content.routes.ts:1878 wins (identical twin routes.ts:5140) → `provider_services`, 404 unless `status === "active"`. Page fields all exist on schema.
- `GET /api/services/:id/reviews` (:100–103) → content.routes.ts:2299 wins — **load-bearing shadowing**: winner filters to approved/redacts removed; the shadowed routes.ts:6070 twin returns **all** reviews unmoderated. Current precedence is the safe direction; reordering mounts would leak unmoderated reviews.
- `GET /api/providers/:userId/public-verification` (:105–108) → routes.ts:5149 (live; fails-open to `false`s). Dead twin experts.routes.ts:1601 (F1).
- `POST /api/cart` (:110–121) → routes.ts:6893 (`isAuthenticated`; page correctly gates via `openSignInModal`, :343–348). Validates serviceId against `provider_services`.
- `POST /api/reviews/:id/flag` (:401) → content.routes.ts:2313, live.

**PRIMARY FINDING — hardcoded commission literal:**
```
service-detail.tsx:382:  Provider earns 90% of booking. Platform fee: 10%.
```
Rendered in the booking card (:379–384). Not fetched from `/api/fee-bands`, not resolved per the service's category `commissionBandKey` (grep `fee-band` in the file: zero hits). Bands are per-category; a flat 90/10 cannot be right across categories and can contradict the actual band. Direct violation of the fee_bands rule.

**Verdict: renders + fetches live data**, with the rate-literal violation and the fragile reviews-shadowing pair.

### B4. `pages/travel-experts.tsx` (1,445 lines) — `/become-expert`, `/expert/apply`

**Composition:** monolith; four hardcoded expert-type flows switched by `?type=` (:173–178). NO shared Layout — hand-rolled sticky header (:440–451, Back → `/earn`). shadcn primitives + framer-motion; every section inline (stepper :453–495; steps 1–6/7 spanning :517–1405; nav :1409–1441). No marketing hero — the page is application-form-only.

**Data sources:**
- `GET /api/auth/user`, `/api/auth/instagram-data` (gated on `?auth=facebook`; :219–230) → replit_integrations auth routes, live.
- `GET /api/experience-types` (:268–270) → content.routes.ts:875 wins (identical twin). Live.
- **`GET /api/expert-service-categories` (:272–274) → routes.ts:3852 — a ZOMBIE endpoint:**
```
server/storage.ts:2213-2216
  // expert_service_categories was dropped by migration 013 — return empty array so callers don't break.
  async getExpertServiceCategories(): Promise<any[]> {
    return [];
  }
```
  Always `[]`. The required Services step (:1108–1143) renders zero rows with **no message**, and `canProceed()` requires `formData.selectedServices.length > 0` (:304 local-expert case 5; :319 default case 3) — **the Next button can never enable. No expert application of any type can be completed through this page.** The offering pre-selected from `/earn` doesn't help: it merges into `specializations` (:384–386), not `selectedServices`.
- `POST /api/auth/accept-terms` (:356–359) → live; failure silently swallowed (:360–362).
- `POST /api/expert-application` (:410) → routes.ts:1418, live, `isAuthenticated`, zod `insertLocalExpertFormSchema` → `local_expert_forms`. Dead twin experts.routes.ts:227 (F1). **Auth trap:** the route is public with no login gate — an anonymous applicant completing the form gets a raw 401 toast.

**Canonical-source: FAIL.** Never queries `expert_offering_types` (`/api/offering-types/experts`, which powers `/earn`). Pickers are inline constants (:72–141) that map to none of the 5 canonical tiers. **Silently-dropped param:** `offeringTypeKey` from `/earn` is read (:166) but only stamped into a `data-` attribute (:502); only the display name survives submit (:384–386) — the canonical key never reaches the server.

**Role-boundary bleed:** hardcoded expert "specialties" include in-person items — "Cultural Tours" (:114), "Photography Tours" (:124), "Historical Tours" (:125), `photography_tours` (:93); bio placeholder says "…great **guide**" (:1175). (`tour_guide` itself correctly lives provider-side in the DB catalog.)

**Band literals (findings):** `"Earn $3,000-$10,000+/month"` (:144), `"Average expert rates: $50-150/hour"` (:1265), hourly-rate `placeholder="75"` (:1259), and `${offering.price}` from ESO not fee_bands (:1135, currently dead code).

**Empty/loading/error:** all four queries have **no isLoading/error/empty handling**; `= []` defaults hide everything — which is exactly why the dead Services step ships a blank card with a disabled Next and no message. Mutation errors surface raw.

**Verdict: renders + fetches live data — but the application flow is functionally dead at the Services step** (zombie endpoint + hard gate), and even completion requires a login the page never asks for.

### B5. `pages/services-provider.tsx` (675 lines) — `/become-provider`, `/provider/new-service`

**Composition:** structural copy-paste twin of B4 (identical header :224–235 ≡ B4 :440–451, stepper, banner, nav; duplicated not shared — any fix must be applied twice). 4 steps.

**Data sources:** zero `useQuery`. Single mutation `POST /api/provider-application` (:194) → routes.ts:1675, live, `isAuthenticated`, zod → `service_provider_forms`. Dead twin experts.routes.ts:278 (F1). **Same auth trap** as B4 (public route, authenticated endpoint, raw 401 after 4 steps).

**Canonical-source: FAIL — fully hardcoded picker.** The category picker maps a hardcoded 26-item constant (`serviceCategories`, :45–72: "Lodging & Accommodation", "Tours & Experiences", …) instead of `service_offering_types` (the live endpoint exists at content.routes.ts:222 and powers `/earn`). Free-text display strings are stored in `serviceOffers` jsonb with no `categoryKey` linkage.

**Silently-dropped fields:** the form collects `taxId` (:352–357), `capacity` (:496–503), `priceRange` (:506–521), `amenities` (:525–533), `hasInsurance` (:538–546) — **none appear in the submit payload** (:175–194). `city` survives only concatenated into `address` (:183); `hasLicense` is repurposed as `infoConfirmation` (:192); `registrationNumber` is sent as `gst` (:186). The `offeringTypeKey` from `/earn` is dropped exactly as in B4 (:187–189, :286).

**Role boundary:** correct side (in-person list; "Tours & Experiences" provider-side as it should be); soft bleed only ("Language & Translation" :57, "Cultural & Educational" :62).

**Band literals:** clean (mandated grep zero hits; `$…$$$$` tier symbols and "48-72 hours" SLA benign).

**Verdict: renders + fetches live data (submit-only), with caveats** — completable UI-wise but only logged-in; hardcoded picker; five fields + the canonical key silently dropped.

### C1. `pages/expert/services.tsx` — `/expert/services`

**Composition:** shared `ExpertLayout` (:1, :278). Header + Create CTA (:280–290) → role-callout banner (:292–340) → analytics stat cards (:342–415) → shadcn `Tabs` all/active/draft/paused (:417–519) with `renderServiceCard` (:177–275). All shadcn.

**Data sources:**
- `GET /api/expert/analytics` (:89–91) → routes.ts:6133, live (`provider_services` + bookings, computed server-side). Dead twin experts.routes.ts:1972.
- `GET /api/expert/services` (:93–95) → routes.ts:5536, live → `storage.getProviderServicesByStatus(userId, status)` (storage.ts:1231–1240). Page sends no params; **the winning handler filters by `status` only, never by `approvalStatus`** — CLAUDE.md's "GET /api/expert/services filters by userId + approvalStatus" does **not** match the code; unapproved/rejected services list identically. Dead twin experts.routes.ts:1616.
- **`GET /api/expert/service-templates` (:97–99) → DEAD 404.** Only handler is experts.routes.ts:1664 in the never-mounted router (F1). `templateCount` always 0.
- **`GET /api/expert/role` (:101–103) → DEAD 404.** Only handler is experts.routes.ts:1733 (PATCH twin :738 also dead). `expertRoleLabel` always null → **the entire role-callout banner (:292–340) never renders.** No error UI on either query — silent feature death.
- `PATCH /api/expert/services/:id/status` (:111–123) → routes.ts:5544, live (ownership check, status whitelist).
- `POST /api/expert/services/:id/duplicate` (:125–136) → routes.ts:5563, live (re-insert as `status:"draft"`; the copy **inherits** the original's `approvalStatus` — not reset).

**Canonical-table:** all traffic `provider_services`. ✅ **Band literals:** zero hits.

**Vocabulary mismatch:** `getDeliveryIcon` (:147–158) switches on `"video" | "in-person" | "document"`, but ServiceForm stores `"video-call"` (ServiceForm.tsx:942–944) — those fall through to the generic icon.

**Verdict: renders + fetches live data — with two of four queries hitting dead endpoints** (silently dead role/templates block).

### C2. `pages/expert/service-wizard.tsx` (952 lines) — `/expert/services/new`

**Composition:** `ExpertLayout`. **NOT the shared ServiceForm — an independent fork** with its own `ServiceFormData` (:67–81), its own tier→delivery mapping (`tierFormatsToAllowedWizardMethods` :100–115, diverging from ServiceForm.tsx:242–257 — e.g. `"written"` → `document` here vs `in-person` there), own payload. Mode chooser (:710–761) → template gallery (:763–852) → 5-step wizard (:319–708, nav :908–948).

**Data sources (all live):**
- `GET /api/service-categories` (:150–152) → content.routes.ts:726 wins (identical twin).
- `GET /api/expert/offering-types` (:154–157) → routes.ts:5525 (single) → `storage.getActiveExpertOfferingTypes` (storage.ts:2218–2232) = **`expert_offering_types`** ✅ (catalog DB-driven; only UI chrome hardcoded).
- `GET /api/service-templates` (:159–162) → content.routes.ts:1667 wins → `getDefaultServiceTemplates` (content-query.service.ts:186–201): **read-only SELECT from `expert_service_offerings`** — allowed per CLAUDE.md (ESO = read-only template catalog). Shadowed routes.ts:3535 twin selects a different row set (`CANONICAL_NAMES`); winner functional.
- `POST /api/expert/services/from-template/:templateId` (:164–176) → routes.ts:5578, live: reads ESO row, **writes `provider_services`** ✅. **But** `serviceData` (:5617–5629) sets `status:"draft"` and **omits `approvalStatus`** → born `approved` (F4). (The dead experts.routes.ts:1764 variant set `approvalStatus:"draft"` — the fixed version is the unmounted one.)
- `POST /api/provider/services` (:200–217) → routes.ts:2018, live, intended (zod, verification publish-gate :2026–2049, tier-min price, coverage writes). ✅ canonical.

**HEADLINE — approval-workflow bypass:** `handleSubmit` (:267–284) sends `status: asDraft ? "draft" : "active"` and **never sends `approvalStatus`**. With the schema default (F4), "Publish Service" creates an immediately live, born-approved service — the draft→submitted→approved workflow is skipped entirely on this creation surface. Only ServiceForm (C3/D2) sets `approvalStatus: "draft"|"submitted"` (ServiceForm.tsx:490–496).

**Likely-500 payload bug:** payload is `{...formData}` (:274) so a skipped optional category sends `categoryId: ""` — an FK column (schema.ts:519); insert should fail → 500. ServiceForm guards with `|| undefined` (ServiceForm.tsx:455).

**Band literal (annotated):** :693 renders "…default $9.99 … 75/25 expert/platform split…" in the booking_concierge notice, marked `// fee-literal-ok`. Amounts actually resolve from `fee_bands`; if an admin retunes the band this copy silently lies. Low-severity drift risk.

**Verdict: renders + fetches live data** — canonical writes, but approval bypass, FK-500 risk, and it's a fork of the Phase-3 shared component with a divergent delivery-method vocabulary.

### C3 + D2. `pages/expert/service-form.tsx` / `pages/provider/service-form.tsx` — edit (+provider create)

**Composition:** both are 13-line wrappers around the **genuinely shared** `components/ServiceForm.tsx` (export :259; `role: "expert" | "provider"` :111–115); the only two consumers (grep-confirmed). CLAUDE.md Phase 3 is real for edit — the un-shared surface is the wizard (C2), so expert create vs expert edit present different field sets (wizard lacks logistics/photos/booking-terms; ServiceForm lacks the wizard's `requirements` textarea → `requirements` jsonb is never editable after wizard creation).

**Data sources (ServiceForm.tsx; all live, all canonical):** `/api/service-categories` (:268–270, F2 winner), `/api/expert/offering-types` (:273–277, expert-only, routes.ts:5525), `/api/service-categories/{id}/subcategories` (:281–284, F2 winner), `/api/city-neighborhoods` (:286–288, F2 winner), `/api/service-categories/{key}/fields` (:293–296 → routes.ts:2415, single — the content router's param route requires the literal `/subcategories` tail so no shadow), `GET /api/provider/services/{id}` (:298–301 → routes.ts:1985, ownership-checked + coverage-slug enrichment the form's pre-population depends on; dead twin experts.routes.ts:481 lacks the enrichment), `GET /api/provider/verification-status` (:532–535, provider-only, routes.ts:2084), mutations `PATCH`/`POST /api/provider/services*` (:502/:504 → routes.ts:2101/2018, winners; dead twins :522/:496). Expert path sets `approvalStatus: "draft"|"submitted"` (:490–496) — **the only creation/edit surface honoring the documented workflow**. Provider path sets `status` only, consistent with provider semantics.

**Vestige:** `invalidateQueries({ queryKey: ["/api/expert/custom-services"] })` at ServiceForm.tsx:509 — cache key of the deprecated route; nothing queries it (dead code, no network traffic). The deprecated server routes are still registered (routes.ts:4117–4239) but their storage path now inserts into `provider_services` anyway (storage.ts:2420–2432).

**Error handling gap:** edit-mode load has a spinner but **no error state** — a 404/500 silently renders a blank "New Service" form still in edit mode; a save would PATCH the id and surface only a mutation toast. Latent: `onSuccess(data.id)` at :520 receives a raw `Response` (no `.id`) — dormant, no consumer passes `onSuccess`.

**Band literals:** wrappers zero; ServiceForm's single hit is a benign cancellation-policy placeholder (:1284).

**Verdict (both): renders + fetches live data.**

### D1. `pages/provider/services.tsx` — `/provider/services`

**Composition:** shared `ProviderLayout` (:1, :190) — structural twin of ExpertLayout (same `#FAFAF8/#E8E8E2/#1A1A18/#7A7A72` inline styles; shell parity good). Header + Add CTA → derived category filter buttons (:212–226) → skeletons / first-time empty state with 30 hardcoded `inspirationCards` (:90–121, navigating to `/provider/services/new?category=…`, consumed by ServiceForm's `?category=` prefill :367–386) / filter-empty / card grid (:289–414).

**Data sources (all live, all canonical):** `GET /api/service-categories` (:128–130, F2 winner); `GET /api/provider/services` (:132–134) → routes.ts:1973 → `storage.getProviderServices` (storage.ts:947–961, scoped by `user_id`) — handler supports `destination`/`category`/`activeOnly` params the page never sends (no silent drop from this page; note `category` ilike-matches `serviceType`, not `categoryId`); `PATCH /api/provider/services/{id}` toggle (:136–148) → routes.ts:2101 (publish-gate can 422 a reactivation; toast surfaces it); `DELETE /api/provider/services/{id}` (:150–162) → routes.ts:2196 (ownership check, hard delete). Dead experts.routes.ts twins :468/:522/:555 inert.

**UX hazard:** **delete has no confirmation dialog** (:399–408) — one mis-click hard-deletes a service.

**Empty/loading/error:** strongest of the five supply pages (distinct first-time vs filter-empty states; guarded everywhere; mutation toasts).

**Band literals:** zero hits.

**Verdict: renders + fetches live data.**

---

## Phase 2 — Navigation graph

### Inbound edges (proven; classification in brackets)

- **/experts** ← header "FIND HELP" dropdown (layout.tsx:83–84, with `?role=` presets) · dashboard tiles (dashboard.tsx:56; TopExpertsPanel.tsx:34) · discover CTAs (discover.tsx:1182, 2058; ai-matched-experts-section.tsx:314) · trip/cart/itinerary CTAs (itinerary.tsx:647,827,841; cart.tsx:1873; trip-details.tsx:841) · ~10 marketing pages (landing.tsx:93,582,615,961; how-it-works.tsx:225; about.tsx:125; features.tsx:148; faq.tsx:267; experiences.tsx:206; help-me-decide.tsx:817) · back-links from expert-detail (:128, :166).
- **/experts/:id** ← expert-card.tsx:259 · expert-match-card.tsx:361 · TopExpertsPanel.tsx:44 · discover-location.tsx:457 (lead-expert feed card).
- **/local-experts** ← discover feed "💬 Ask" CTAs only (city-feed-card.tsx:697,880,1061,1254; city-feed-card-recommendation.tsx:205; discover-location.tsx:654,956; feed-stream.ts:97).
- **/local-experts/:id** ← city-feed-card-expert.tsx:77.
- **/earn** ← header top-level "Ways to earn" (layout.tsx:151) · footer (layout.tsx:579) · landing CTAs (landing.tsx:885 `?track=provider`, :909 `?track=expert`, :930) · contact.tsx:334 · experts.tsx:866 ("Learn More") · back-links from both signup pages (travel-experts.tsx:443; services-provider.tsx:227). `?track=`/`?role=` both parsed (earn.tsx:184).
- **/become-expert** ← header "Join as Partner" dropdown ×4 types (layout.tsx:342–346 desktop, :477–481 mobile) · `/earn` role cards/offering rows via `earn-roles.ts:101,108,116` signupPaths + earn.tsx:255–259/343 · experts.tsx recruitment band (:831–857) · discover wanted-slot Apply (discover-location.tsx:492, :1591) · orphan partner-with-us.tsx (inert).
- **/become-provider** ← header dropdown (layout.tsx:345, :480) · `/earn` (earn-roles.ts:87, :94) · service-providers.tsx:454 (on an unreachable page) · orphan partner-with-us.tsx.
- **/services/:id** ← service-browser.tsx:113 · city-feed-card.tsx:1035 · service-providers.tsx:146 · discover.tsx:286.
- **/expert/services\*** ← ExpertLayout sidebar (expert-sidebar.tsx:53) · expert/profile.tsx:137 (`?offeringTypeKey=` deep filter) · in-family links (services.tsx:212, 285, 294, 317, 437, 462) · post-save navigations (ServiceForm.tsx:517; service-wizard.tsx:171, 208, 715) · discover.tsx:1596 → `/expert/templates` ⇒ redirect.
- **/provider/services\*** ← ProviderLayout sidebar (provider-sidebar.tsx:42) · provider dashboard tile (dashboard.tsx:217) · in-family (services.tsx:204, 251, 265, 394) · post-save (ServiceForm.tsx:513, 568, 590, 1510).

### Dead links / zero-inbound / redirect aliases

- **DEAD LINK:** `about.tsx:370` `<Link href="/partner">` ("Become an Expert") — **no `/partner` route exists** (only `/partner-with-us`, App.tsx:312). Falls through to NotFound.
- **ZERO-INBOUND mounted routes** (URL-typing only):
  - **`/service-providers`** — not one link targets it; the header "Service Providers" item deliberately goes to `/discover?tab=services` instead (layout.tsx:85). The page's own content is unreachable.
  - **`/expert/apply`** and **`/provider/new-service`** — App.tsx comments call them "supply recruitment entry points from location feed CTAs", but the feed CTAs link `/become-expert` directly (discover-location.tsx:492, :1591). Zero inbound anywhere.
- Redirect aliases (`/partner-with-us`, `/travel-experts`, `/services-provider`) have zero client links — legacy-bookmark-only, all resolve.
- All 21 expert/provider sidebar targets resolve to mounted routes (verified route-by-route); `/provider/payouts` has no mount and nothing links it (orphan file).

### One-list-two-jobs (cross-surface consistency)

| Surface | Source | Same rows? |
|---|---|---|
| `/earn` recruitment catalog | `expert_offering_types` + `service_offering_types` + `service_categories` + `fee_bands` via mounted content/payments routers | ✅ canonical baseline |
| Discover "wanted slots" | `/api/offering-types/experts` (discover-location.tsx:1246–1249, labels :1389–1400) | ✅ same table |
| Expert profile book picker | `/api/experts/:id/services` → `provider_services` (storage.ts:2245–2247) | ✅ canonical (but unfiltered by approval — A2) |
| PlanCard "expert polish" CTA | free-text dialog → `POST /api/expert-requests` (PlanCard.tsx:159–218) | — bypasses the catalog entirely (matching queue, not a menu; no fork but no reuse) |
| **Expert signup picker** | `/api/expert-service-categories` → stub `[]` (storage.ts:2214) | ❌ **dead endpoint for a dropped table; blocks the funnel** |
| **Provider signup picker** | hardcoded 26-string constant (services-provider.tsx:45–72) | ❌ **parallel forked menu** |
| Header "Join as Partner" dropdown | hardcoded role blurbs (layout.tsx:335–346) duplicating `earn-roles.ts:81–118` copy; bypasses `/earn`, carries no `offeringTypeKey` | ⚠️ duplicate copy source, drift risk |
| Supply-side wizard/edit catalogs | `/api/expert/offering-types` + `/api/service-categories` (service-wizard.tsx:154–157; ServiceForm.tsx:268–277) | ✅ same tables as `/earn` |

**Param-drop chain:** `/earn` → signup carries `?offeringTypeKey=&offeringName=` (earn-roles.ts:87–116; earn.tsx:256–258), but both signup pages persist only the display name (travel-experts.tsx:384–386; services-provider.tsx:187–189) — the canonical key dies at submit. Discover wanted-slot Apply sends `?offering=&neighborhood=` which travel-experts.tsx (:160–167) doesn't even read — recruitment context silently lost twice.

### Role boundary

Clean. Expert sidebar links only `/expert/*`; provider sidebar only `/provider/*`. Wizard/edit read `expert_offering_types` tiers for experts and `service_categories` fields for providers with role-gated queries (ServiceForm.tsx:269–294) — no merged menu. `tour_guide`: single client hit is the partition test (`earn-roles.test.ts:60` asserting provider-side); server-side it is a `service_offering_types.category_key` (migration 038:18–19). Correctly provider-side everywhere. The only bleed is B4's hardcoded "…Tours" expert specialties (see findings).

### Nav-graph (proven edges)

```
HEADER (layout.tsx)
├─ FIND HELP ▾ ── Local Experts → /experts?role=local_expert (:83)
│                 Travel Advisors → /experts?role=travel_expert (:84)
│                 Service Providers → /discover?tab=services (:85)   [NOT /service-providers]
├─ Ways to earn → /earn (:151)   [also footer :579]
└─ Join as Partner ▾ → /become-expert?type=… ×4 / /become-provider (:342–346)  [bypasses /earn]

/earn ──(role card / "I do this →", ?offeringTypeKey&offeringName)──► /become-expert?type=… | /become-provider
/experts ──ExpertCard/MatchCard──► /experts/:id ──► /chat?expertId= | /cart?expertId=&serviceId= | back /experts
        └─recruitment band──► /become-expert?type=…   └─"Learn More"──► /earn
DISCOVER FEED ──lead expert──► /experts/:id   ──expert card──► /local-experts/:id
              ──"💬 Ask"──► /local-experts    ──vendor card──► /services/:id
              ──wanted-slot Apply──► /become-expert?city&neighborhood&offering  [offering/neighborhood dropped by target]
/services/:id ──► POST /api/cart | /chat?provider= | /discover
/become-expert ─back─► /earn   ─submit─► /dashboard   [BLOCKED at Services step]
/become-provider ─back─► /earn ─submit─► /dashboard
EXPERT CONSOLE sidebar ► /expert/services ⇄ /expert/services/new ⇄ /expert/services/:id/edit
PROVIDER CONSOLE sidebar + dashboard tile ► /provider/services ⇄ new ⇄ :id/edit
ISLANDS (0 inbound): /service-providers · /expert/apply · /provider/new-service
DEAD LINK: about.tsx:370 → /partner
```

---

## Phase 3 — Design-system conformance

Canonical brand set for this check: `#1E3A5F` `#2E8B8B` `#E8B339` `#0D2137` `#5DCAA5` `#E85D55`. CLAUDE.md Phase 4 separately documents a "User Console theme" for expert pages: `#1A1A18` `#7A7A72` `#E8E8E2` `#FAFAF8`. **Three competing color systems are in production across these surfaces** (brand set, console palette, and an undocumented `#FF385C` Airbnb-red accent), plus token-only pages:

| Page | Palette observed | Brand-set hexes | Off-palette hexes |
|---|---|---|---|
| experts.tsx (+expert-card, expert-match-card) | **100% off-brand**: `#FF385C`/`#E23350` accent + hardcoded Tailwind-gray hexes | none | #FF385C, #E23350, #6366F1/#4F46E5 (indigo), full gray scale as literals |
| expert-detail.tsx | semantic tokens only (zero hex) + ad-hoc `bg-blue-600`/`bg-purple-600`/amber badges | n/a | diverges visually from the pink list page it links back to |
| earn.tsx | mixed: 5 of 6 brand hexes present, plus 13+ off-palette hexes (#0F6E56, #1F2733, #E7E4DD, #F6F5F1, #C0392B…) | #1E3A5F #2E8B8B #E8B339 #5DCAA5 #E85D55 | 13 distinct |
| service-providers.tsx / service-detail.tsx | shadcn tokens, zero hex (ad-hoc `amber/blue/purple/slate` utilities; the hardcoded commission box uses `bg-slate-50`) | none | none (token-based) |
| travel-experts.tsx | 17 unique hexes / 178 occurrences — `#FF385C` system + FB/IG brand colors | #2E8B8B (×3, the /earn banner) | #FF385C ×31, #E23350 ×10, grays as hex |
| services-provider.tsx | 12 unique hexes / 86 occurrences — same system | #2E8B8B (×3) | #FF385C ×12 etc. |
| expert/services.tsx, provider/services.tsx | `console-*` Tailwind tokens (= CLAUDE.md console palette, tailwind.config.ts:134–141) + `#FF385C` action color | shells only: #E85D55 dot in both layouts | #FF385C throughout |
| expert/service-wizard.tsx, ServiceForm.tsx | generic grays + `#FF385C` — **no console tokens** (Phase-4 claim holds for the list pages, not the wizard/form) | none | #FF385C |

Other Phase-3 notes: no `style={{}}` on any page file (the ExpertLayout/ProviderLayout **shells** use inline styles with console hexes: expert-layout.tsx:54–93, provider-layout.tsx:21–64); arbitrary-value Tailwind (`bg-[#FF385C]`, `text-[13px]`) is the delivery mechanism for all hex literals; no in-scope page renders an itinerary/map, so no PlanCard forks on these surfaces (the PlanCard "expert polish" dialog is the shared component); shell parity is good within consoles (Expert/Provider layouts are twins) and broken on the recruitment pages (hand-rolled headers, no shared shell) while `/experts` gets `Layout` from App.tsx but `/experts/:id` self-wraps — inconsistent application, same net shell.

---

## Prioritized findings

Severity: **P1** = user-facing flow broken or policy/money violation · **P2** = silent feature death / integrity risk · **P3** = drift, debt, dead code.

| # | Sev | Location | Evidence | Mechanism |
|---|---|---|---|---|
| 1 | **P1** | travel-experts.tsx:304,319 + server/storage.ts:2214–2216 + routes.ts:3852 | `getExpertServiceCategories(): return [];` (table dropped by migration 013); `canProceed()` requires `selectedServices.length > 0` | **Expert application is unfinishable for all four expert types** — the required Services step reads a zombie endpoint that always returns `[]`, renders blank with no message, and permanently disables Next. Recruitment funnel dead at the last mile. |
| 2 | **P1** | service-providers.tsx:248–250 + queryClient.ts:68 + content.routes.ts:1878/1888 | array queryKey path-joins → `/api/services/<uuid>/` matches the `:id` detail route → 404 → silent "No services found" | **/service-providers category & location filters are functionally dead**; every filter interaction empties the marketplace with no error (page has no error state). Object-param key form (queryClient.ts:57–65) + the winning handler's `?categoryId=&location=` support already exist. |
| 3 | **P1** | service-detail.tsx:382 | `Provider earns 90% of booking. Platform fee: 10.` — no fee-band fetch anywhere in the file | **Hardcoded commission literal on a public transactional surface**, violating the fee_bands rule; per-category bands make a flat 90/10 wrong by construction. |
| 4 | **P1** | expert/service-wizard.tsx:267–284 + routes.ts:5617–5629 + shared/schema.ts:563 | wizard and from-template handler never send `approvalStatus`; column defaults `"approved"` | **Approval workflow bypassed on 2 of 3 expert creation paths** — "Publish Service" creates born-approved, immediately-active services. Only ServiceForm (:490–496) honors draft→submitted. Also: duplicate action inherits `approvalStatus`; the winning `GET /api/expert/services` (routes.ts:5536→storage.ts:1231) filters by `status` only, contradicting CLAUDE.md's stated approvalStatus filter. |
| 5 | **P1** | routes.ts:3973 + storage.ts:2245–2247; expert-detail.tsx:415–426 | `getExpertSelectedServices` has no `approvalStatus`/`status` filter | **Unapproved/draft services are publicly listed and bookable** ("Book Now" → /cart) on the expert profile page. |
| 6 | **P1** | expert-detail.tsx:157 | `const verified = expert.verified || true;` | **Every expert shows a Verified badge unconditionally** (no `verified` column exists). Trust-signal fabrication on a public surface. |
| 7 | **P2** | routes.ts:104; experts.routes.ts (whole file) | only reference is the import; no `app.use` | **Unmounted router**: all its registrations are dead. Kills `GET /api/expert/service-templates` (:1664) and `GET /api/expert/role` (:1733) outright — C1's role/template banner (expert/services.tsx:292–340) can never render; and its `/api/experts` copy (:588) lacks the `role` filter, so mounting it later would silently break the role tabs. Delete or mount-and-reconcile. |
| 8 | **P2** | travel-experts.tsx (App.tsx:391) + routes.ts:1418; services-provider.tsx (App.tsx:394) + routes.ts:1675 | public routes, `isAuthenticated` endpoints, no client login gate | **Auth trap on both application submits** — anonymous applicants complete a multi-step form and lose it to a raw 401 toast. |
| 9 | **P2** | services-provider.tsx:45–72, :175–194; travel-experts.tsx:72–141, :384–386 | hardcoded pickers; `offeringTypeKey` read but only the display name submitted | **One-list-two-jobs violation**: neither signup picker reads the canonical catalogs that power /earn (`/api/offering-types/experts|services`); the canonical key from /earn dies at submit on both pages; provider signup additionally drops `taxId`, `capacity`, `priceRange`, `amenities`, `hasInsurance` from its payload. |
| 10 | **P2** | routes.ts:3985–3995 | `res.json([])` + TODO | **Expert reviews endpoint is a permanent stub** — the Reviews tab on every expert profile can never populate. |
| 11 | **P2** | expert-detail.tsx:182, :391, :509, :139–140, :230; experts.tsx:288–301; expert-card.tsx:74–76, :86; expert-match-card.tsx:120–122, :133 | `profileImage` vs `profileImageUrl`; `service.name` vs `serviceName`; `.offering?.price`; `superExpert`; `rating = 4.9` | **Shape mismatches nullify features**: avatars never render, service titles render blank, price sort inert, stats show zeros — while fabricated `4.9`/`4.5` ratings are rendered to travelers. |
| 12 | **P2** | content.routes.ts:2299 vs routes.ts:6070 | winner moderates/redacts; shadowed twin returns unmoderated reviews | **Load-bearing shadowing** on `/api/services/:serviceId/reviews`: current precedence is safe; any mount reorder leaks unmoderated reviews. Same fragility class (divergent twins) on `/api/grok/match-experts` (content.routes.ts:3708 vs routes.ts:9345) and `/api/service-templates` (content.routes.ts:1667 vs routes.ts:3535). |
| 13 | **P2** | layout.tsx:85; App.tsx:264, :398, :401; about.tsx:370 | header routes "Service Providers" to `/discover?tab=services`; no inbound links elsewhere | **Three zero-inbound mounted routes** (`/service-providers`, `/expert/apply`, `/provider/new-service`) and **one dead link** (`/partner`, unmounted). |
| 14 | **P2** | experts.tsx:240, :255 vs routes.ts:3893, :3942 | client sends `neighbourhood` at ≥2 chars; server excludes all experts when <3 chars | 2-character neighbourhood queries return empty lists/zero counts instead of ignoring the filter. |
| 15 | **P2** | service-wizard.tsx:274 vs ServiceForm.tsx:455 | `categoryId: ""` sent when optional category skipped (FK column, schema.ts:519) | Likely 500 on wizard submit without category; ServiceForm guards with `|| undefined`. |
| 16 | **P2** | provider/services.tsx:399–408 | delete mutation wired directly to the menu item | Hard delete with **no confirmation dialog**. |
| 17 | **P3** | travel-experts.tsx:144, :1259, :1265, :1135; storage.ts:2264; service-wizard.tsx:693 | `$3,000-$10,000+/month`, `$50-150/hour`, placeholder `75`, `${offering.price}`; `revenueShareRate: '0.75'` on a write path; `$9.99`/`75/25` (annotated `fee-literal-ok`) | Rate literals outside fee_bands: marketing earnings claims, a hardcoded revenue share on the insert path, and drift-risk fee copy in the wizard. |
| 18 | **P3** | earn.tsx:47 (unused `market_scoped`), :243–253; earn-roles.ts:81–118; layout.tsx:335–346 | no `?market=` sent; flat per-role list; duplicated role copy | /earn spec deltas: "in your city" marketScoped band missing (server ready), catalog grouped by role not category/tier, `delivery_formats` fetched-not-rendered, role partition is a hardcoded (tested) client constant, and the Join-as-Partner dropdown duplicates its copy and bypasses /earn. |
| 19 | **P3** | service-wizard.tsx:100–115 vs ServiceForm.tsx:242–257 vs schema.ts:530; expert/services.tsx:147–158 | three delivery-method vocabularies (`video/document/in-person` vs `video-call/in-person/hybrid` vs schema's `pdf/video/call/in_person`) | Wizard is a fork of the Phase-3 shared ServiceForm; the two expert surfaces write different `delivery_method` values into the same column and the list page's icons understand only one set. `requirements` jsonb is editable only at wizard-create, never at edit. |
| 20 | **P3** | Phase 0 orphan table; ServiceForm.tsx:509; routes.ts:2532, :5140, :5168, :4117–4239; travel-experts.tsx:570 | — | Dead code inventory: 12+ orphan page files (incl. unreachable `provider/payouts.tsx` and `partner-with-us.tsx` with duplicate role copy), shadowed identical inline route twins, deprecated `/api/expert/custom-services` routes still registered, a stale cache-invalidation key, and an Instagram button that points at the Facebook OAuth path. |
| 21 | **P3** | Phase 3 table above | 17 unique hexes ×178 on travel-experts.tsx alone; `#FF385C` on every supply page; only #2E8B8B/#E85D55 from the brand set appear anywhere except earn.tsx | **Three competing color systems**: brand set (partially, /earn only), console palette (list pages + shells), and the undocumented `#FF385C` accent everywhere else; recruitment pages hand-roll their headers outside the shared shell. |
| 22 | **P3** | travel-experts.tsx:268–274 (4 queries), experts.tsx:779, service-providers.tsx (no error state), ServiceForm.tsx edit load, expert/services.tsx role/template queries | `= []` defaults + thrown queryFn errors | Systemic empty≠error≠loading conflation: fetch failures render as empty states across most of these surfaces (this is what masks findings 1, 2, and 7 in production). |

*Line numbers verified against `main` HEAD `e931e1bf` at audit time; `server/routes.ts` is ~18.5k lines — re-verify before acting on any citation.*
