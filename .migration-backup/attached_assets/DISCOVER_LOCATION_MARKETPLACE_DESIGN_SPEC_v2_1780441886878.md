# Traveloure — Discover & Location Marketplace Design Spec (v2)

**Type:** consolidated design + IA spec, **with full build program** (hand to Replit Agent).
**Changes from v1:** Replit's code-grounded corrections applied throughout; new Influencer Contribution Pipeline (§7); Phase 0 audit results baked in; build program rewritten as one sequenced, do-it-all-at-once plan (§10).
**Out of scope:** provider-level integration detail (Replit reconciles live wiring).

---

## 1. Core idea (unchanged)
Two axes: **by location** (the destination marketplace — a sub-ecosystem of neighborhoods/attractions/eat/do with platform supply woven in) and **by date** (events). One rule everywhere: every item is actionable — *Book*, *Add to experience*, or *Find a local expert*. No dead-end information.

## 2. The universal card pattern — responsive
Two halves: **left = information** (large photo, name, type, one-line description, the *why* signal), **right = content/action** (priced *Book* where bookable, *Add to experience* always, *Find a local expert* where nothing's bookable).

**Responsive behavior (corrected):** split-row **≥768px**; **stacked vertical (<768px)** — which is the *existing* `CityCard` pattern, so mobile inherits a proven layout. This is one responsive component, **not a rewrite**. The existing destination-grid `CityCard` stays as-is; only the *gems-by-category* and *events* surfaces adopt the split-row variant. Always inside a **max-width column (~900–1000px, centered)** — never full-bleed. Never duplicate the description; never show empty metrics.

## 3. Location view — the sub-ecosystem marketplace
Composition: **hero** (name, pulse, what's-happening, supply summary) → **explore spine** (Neighborhoods · Attractions · Eat · Do · Stay · Experts) → **neighborhood-as-mini-ecosystem** (content + woven supply: "5 things to do · 3 bookable," "2 stays from €210," "an expert who knows it"; addable as a unit — "Add a Marais day") → **gems by category** → **woven supply** (hotels, experts, marquee) → **handoff to by-date**.

**Data reality (corrected):** the per-location aggregation is a **thin orchestrator over endpoints that already exist**, not a new pipeline:

| Section | Existing endpoint | Note |
|---|---|---|
| Hero + gems + happening-now | `GET /api/travelpulse/cities/:cityName` | fast, cached |
| Hotels + activities | `GET /api/travelpulse/ai-recommendations/:city/:country` | AI, 24h cached |
| Eat · Do · Attractions | `GET /api/travelpulse/enriched/:cityName` | returns `restaurants[]`, `attractions[]`, `nightlife[]`, `hiddenGems[]`, `trendingNow[]` — **wire the explore spine straight to this; no new API needed** |
| Events | `GET /api/travelpulse/events?city=&month=` | Fever-backed, live |

The aggregation endpoint fans out to these and returns one shaped response — a routing layer, not a migration.

## 4. By-date view — Events
Time axis. Universal cards with date/venue/category foregrounded + *Book tickets* / *Add to experience onto a date*. Source is **already live** (`/api/travelpulse/events`, Fever). The missing piece is the **date-matching UI**: `user_experience_items.scheduled_date` exists and `user_experiences` has `start_date`/`end_date`, so the write target is ready — needs a date-picker mapping the event onto the experience's range.

## 5. Data — source map & foundations (corrected)

| Surface | Source type | Status |
|---|---|---|
| Hero/pulse/happening | native + Grok intelligence | live |
| Eat/Do/Attractions | enriched endpoint | **live — just wire** |
| Stay / Do (services) | **blended** native + network backfill | needs blend logic |
| Experts | native | live |
| Marquee/featured | native `is_featured` flag | **schema exists** — needs admin UI + guardrail |
| Recommendations (why-signals) | demand-signal pipeline | **needs scheduler append (not new infra)** |
| Events | Fever feed (live) + curated supplement | live |
| Creator picks | `influencer_curated_content` table | table exists — needs push path (§7) |

**Foundational work — re-scoped against the code:**
1. **Neighborhood tagging (the real blocker).** Add `neighborhood` varchar to `provider_services` and `travel_pulse_hidden_gems`; add a **`city_neighborhoods` lookup** (city, name, centroid lat/lng, radius). Gems already have lat/lng → **auto-populate** from centroids. Services have a `location` string + `service_radius` but **no coordinates** → set by providers in the listing form + admin backfill for existing rows. Use an **explicit field**, not pure proximity (stable, cheaper to query). *Without this, the neighborhood ecosystem in §3 is a facade.*
2. **Aggregation endpoint** — thin orchestrator (§3), not a pipeline.
3. **Demand-signal regeneration** — **append `refreshDemandSignalsForCity` to the existing `TravelPulseScheduler` daily cycle**, after city-intelligence refresh. No new scheduler.
4. **`is_featured`** — schema done; build admin UI + the trust guardrail (never bury a better native result).
5. **Demand→service type synonym map** — small config mapping demand types to satisfying service-type strings (e.g. `fine_dining` ↔ `private_chef`), to prevent silent misses in sparse markets.

**Blended principle:** native first, network backfills gaps, sources not distinguished to the user — this is what makes a sparse launch market (Kyoto) render full.

## 6. Consolidation
Fold into the **location view:** TravelPulse, Browse Services, Influencer Curated (→ "creator picks," once real per §7), Trip Packages. **By-date view:** Travel Events.
Route cleanup: redirect **`/browse`** (still live) → `/discover`; **`/discover-experiences`** → `/discover?tab=packages` or retire; decide **`/spontaneous`** ("Live Intel") — keep as deep-link or absorb as the happening-now section. (`/explore`, `/travel-experts`, `/services-provider`, `/credits-billing`, `/checkout` are **already redirects** — leave them.)

## 7. Influencer Contribution Pipeline (new)
Make the creator feed **real and contributor-driven** instead of the current hardcoded array. The model is largely built:
- **Identity:** `users.isInfluencer`, `verifiedInfluencer`, `influencerTier` (nano→mega), `instagramLink`, `socialFollowers`.
- **Content:** `influencer_curated_content` — `title`, `contentType` (guide/collection/itinerary/tips), `platform`, `externalUrl`, `imageUrl`, **`destinations`**, **`experiences`**, `tags`, `isFeatured`, `isActive`, `publishedAt`.
- **Monetization:** `influencer_referrals` (pending→converted→paid).

**Missing (the three pieces to build):**
1. **Publish endpoint** — `POST /api/influencer/content` writing `influencer_curated_content` (nothing writes it today).
2. **Influencer submit UI** — a dashboard to create/publish curated content (or pull from linked social).
3. **Wire the display** — point the Discover "creator picks" feed at the table, **not** the hardcoded `influencerContent` array (`discover.tsx:187`).

**Gate (decision):** verified-influencer-only + **moderation/approval** modeled on the events submit→approve flow. Open/invite submission later.

**Payoff:** because the table carries `destinations` + `experiences`, creator content is **location-matched** (surfaces as the "creator picks" section in the right city) and **actionable** (each pick links to bookable content), monetized via the existing referral plumbing, and it **fills cold-start markets**. This resolves the "don't fold fake content into the location view" risk — the fold happens only after the content is real.

## 8. Open decisions
1. **Marquee** — recommend **editorial** featuring at launch (admin spotlight); add paid later.
2. **Trip Packages** — recommend **convert** to a "build a trip from here" CTA (the `ExperienceTemplate` data is reusable, just mis-placed); don't kill.
3. **Events source** — Fever is live; lead with it + manual curation. No new integration.
4. **Neighborhood tagging** — explicit field + `city_neighborhoods` lookup (not pure proximity).
5. **CityDetailView reconciliation (most user-visible).** It has 7 tabs today (Overview, Hidden Gems, Recommendations, Happening Now, Live Activity, Media, AI Insights). Does the new location view **replace** it, or become a new entry point with CityDetailView reachable inside? Decide before Phase 2 — this is the most disorienting change for existing users.
6. **Influencer gating** — verified-only + moderation (recommended) vs open vs invite.
7. **`/spontaneous`** — standalone deep-link vs absorb into happening-now.

## 9. Cold-start handling
Network backfill (§5 blend) is the real fix — it fills thin native supply so every market renders full. Priority is making the **launch market (Kyoto)** data-deep, not Paris (seeded but not a launch market). Deliberate sparse states; never empty placeholders. The type-synonym map (§5.5) prevents silent recommendation misses.

---

## 10. Build program — the entire phase, sequenced

Designed to run as one program. **Phase 1a and 1b run in parallel.** Dependency arrows noted.

### Phase 0 — Current state (confirmed by Replit's audit; no work, reference only)
Live & correct-source: Events (Fever), TravelPulse cities (Grok), Browse Services (native), Hidden Gems, enriched Eat/Do/Attractions. Partial: Recommendations (manual trigger). Schema-only: `is_featured`. Not done: `/browse` redirect, neighborhood tagging, influencer push path, aggregation endpoint, blend logic, scheduler append.

### Phase 1a — Quick wins (no migrations; unblocks Phase 2)
- Redirect `/browse` → `/discover`; redirect/retire `/discover-experiences`; resolve `/spontaneous`.
- Convert Trip Packages → "build a trip from here" CTA (uses existing `ExperienceTemplate`).
- **Append `refreshDemandSignalsForCity` to `TravelPulseScheduler`** daily cycle.
- Add the demand→service **type-synonym map**.
- Decide + flip the Influencer content path to the real table (or temporarily hide the tab until §7 lands).

### Phase 1b — Data foundations (the long track; unblocks Phase 3) — *run parallel to Phase 2*
- Add `neighborhood` to `provider_services` + `travel_pulse_hidden_gems`; create `city_neighborhoods` lookup (centroids).
- Backfill: gems auto from lat/lng; services via provider form + admin backfill (start with the seeded markets — Paris, Kyoto).
- Build the **aggregation orchestrator** endpoint (fans out to the §3 endpoints).
- Build `is_featured` **admin UI + trust guardrail**.

### Phase 2 — IA split & consolidation *(needs Phase 1a)*
- Two top-level views (by location / by date); fold the 5 tabs (§6).
- **Resolve decision #5** (CityDetailView 7 tabs ↔ new location view) and implement the chosen transition.
- Route cleanup committed.

### Phase 3 — Universal card + location marketplace *(needs Phase 1b data + Phase 2)*
- Responsive card (split-row ≥768 / stacked <768); reuse existing vertical card on mobile.
- Neighborhood-as-ecosystem unit (renders Phase 1b rollups).
- Wire Eat/Do/Attractions to the **enriched endpoint**; hero/gems/happening to the cities endpoint.
- **Add-to-experience action** — extend the existing "Add to trip" dialog to also target **experience templates** (wedding/proposal/etc.), not just raw trips.
- Max-width column.

### Phase 4 — Source wiring & blend *(needs Phase 2; Phase 0 delta)*
- Point each surface at its §5 source per the Phase 0 delta.
- Native-first **blended fill** for Stay/Do (network backfills sparse markets).

### Phase 5 — Influencer Contribution Pipeline *(§7)*
- Publish endpoint + influencer submit UI + verify/moderate gate.
- Point the creator-picks feed at `influencer_curated_content`; location-match via `destinations`; make picks actionable; tie to referral monetization.

### Phase 6 — By-date Events view *(needs Phase 2)*
- Events on the live Fever feed; **date-matching UI** writing `user_experience_items.scheduled_date` within the experience's range.

**Critical path:** 1b → 3 (neighborhood data gates the ecosystem unit). Everything else can proceed once 1a clears. **Don't start Phase 3's neighborhood UI until 1b has real data in at least one launch market** — building against empty neighborhood data is the beautiful-empty-page failure mode this whole plan exists to avoid.

---

## 11. Out of scope
Provider-level integration detail (Replit's live wiring). The four code specs (Workspace, Workflow, Offerings, PlanCard) and commission consolidation (Brief #2) are separate workstreams; the add-to-experience action connects to the same experience-template model.
