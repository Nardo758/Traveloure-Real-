# Expert Field Knowledge v2 — Phase 0 (read-only audit)

`audited@ origin/main 4644af6689760ede78cd8f44ac1971d34c464bfe` · branch `claude/expert-field-knowledge-v2-k1n60j`
(cut from that SHA; HEAD == origin/main at audit time) · **HARD STOP after this doc** — Leon ratifies the schema
proposal below, then Phase 1 builds. No code changed here.

Companion file (`expert-field-knowledge-evidence-test.md`, 107 lines, §0–§8 intact) was present in the session and is
the binding content input; it lands verbatim as `docs/expert-field-knowledge/evidence-test.md` in Phase 1. None of the
eight dispatch rulings is in `docs/DECISIONS.md` yet (grep of all eight slugs: 0 hits) — they append in Phase 1.

---

## Headline findings (the things that change the Phase 1 plan)

1. **`expert_neighborhoods` already exists and already has FOUR live writers.** The ruling says its rows are written
   only by admin ratification of an expert claim. Today: the expert-approval hook auto-inserts rows from the free-text
   onboarding chips (`server/storage.ts:1671-1680` (call `:1676`) → `captureExpertNeighborhoods` `:1732-1780`), an admin lead-swap
   route upserts rows (`PUT /api/admin/neighborhoods/:id/lead`, `server/routes/admin.routes.ts:8025` →
   `swapNeighborhoodLeadTx`, `server/services/admin-query.service.ts:1208-1228`, raw `INSERT … ON CONFLICT DO UPDATE`),
   the landing demo seed inserts directly (`server/seeds/landing-hero-demo.seed.ts:195`), and
   `insertExpertNeighborhoodSchema` is exported (`shared/schema.ts:3664`). The "platform assignment" the ruling forbids
   is the current production path. **Decision D1 below.**
2. **`gem_candidates` is not a table.** The candidate → ratify sibling is a column cluster on
   `local_knowledge_nuggets` (`promotion_status` …, migration 263; `shared/schema.ts:8053-8058`), owned by ONE service
   (`server/services/gem-promotion.service.ts`). "P1 → `gem_candidates` (reuse)" therefore means: P1 places are
   nugget rows plus additive depth columns, so a ratified P1 row enters the existing propose → approve → birth-gem rail
   with zero new consumer code. **Decision D2.**
3. **`acquired_via_provider_id` does not exist** anywhere in `shared/schema.ts` (0 hits). The independence join reads
   five real columns instead — listed in §3.
4. **Migration number is 272, not 271.** `origin/main` tops out at `270_landing_moments.sql`; open PR #696 already adds
   `271_fee_ledger_fee_waiver_type.sql`. Details in §7.
5. **The same-transaction log cannot be reused.** `item_transition_log.trip_id` is `NOT NULL` with an FK to `trips`
   (`shared/schema.ts:6352`), so a claim transition has nowhere to sit there. The sibling admin queue logs via
   `insertAccessAuditLog(...).catch(...)` — fire-and-forget, NOT same-transaction (`admin.routes.ts:7482`, `:7513`).
   Phase 1 mirrors the diary's shape in a claim-scoped append-only table. **Decision D4.**

---

## 1. Prior-art grep (mandatory items)

| Item | Where | What it gives this lane |
|---|---|---|
| `gem-promotion.service.ts` | `server/services/gem-promotion.service.ts:1-181` | ONE service owns every status transition; every transition is a §15 atomic conditional (`UPDATE … WHERE status='submitted'`, `:113-127`, `:165-179`); approval CLAIMS the candidate, then births `travel_pulse_hidden_gems` with `curatedByExpertId` **from the row** (`:129-143`), then stamps `promotedGemId` (`:145-148`). This is the ratify-path template. |
| migration 263 | `server/migrations/263_nugget_gem_promotion.sql`; registry `migration-files.ts:1303-1307` | Additive-nullable, no CHECK (app-enforced vocabulary), declared in `schema.ts`, §19 server-authored only. Note the file header still says "262" (renumbered on merge) — harmless, cited as the precedent for renumber-on-collision. |
| `/admin/gem-candidates` | routes `server/routes/admin.routes.ts:7433` (GET), `:7451` (approve), `:7492` (reject); page `client/src/pages/admin/gem-candidates.tsx` (191 lines); mount `client/src/App.tsx:1147`, `client/src/lib/role-routes-config.ts:192`, `client/src/components/admin-sidebar.tsx:101` | The sibling to copy for `/admin/neighborhood-claims`: blanket §2 guard + per-handler `getFullAdminUser` check, hand-named allowlist body (`:7458-7466`), two actions only. Audit logging is `insertAccessAuditLog(...).catch()` — **non-fatal, outside the transaction** (`:7482`). |
| `city_neighborhoods` (picker source) | `shared/schema.ts:3588-3614`; seed `server/migrations/042_phase3_seed_neighborhoods.sql` (8 launch markets — Kyoto 5 incl. `gion`, Porto 5, Edinburgh 5, Bogotá 4, Jaipur 4, Mumbai 4, Cartagena 3, Goa 3; centroids flagged `⚠confirm`); purge of chome rows migration 227 | Public read `GET /api/city-neighborhoods` (`server/routes/content.routes.ts:838`; consumers `client/src/components/ServiceForm.tsx:906`, `build-formats/KyotoCulturalView.tsx:58`). Admin read `GET /api/admin/neighborhoods?city=` (`admin.routes.ts:7864`). Remote branch `data/major-cities-neighborhoods` exists (not on main) — picker coverage beyond 8 markets depends on it. No `default_daypart` column (D8). |
| nugget schema | `shared/schema.ts:8028-8075` (`nuggetType` enum tip/warning/…; `linkedPoi`, `linkedNeighbourhood` **free text, not FK**; `insight`; `seasonality` jsonb; promotion cluster) | The P1 host. `insertLocalKnowledgeNuggetSchema` omits the promotion cluster (`:8064-8075`); storage strip in `createLocalKnowledgeNugget` (proven G8, `server/__tests__/gem-promotion.db.test.ts`). |
| nugget composer mounts | Content Studio dialog `client/src/pages/expert/content-studio.tsx:130-255` → `/api/expert/knowledge-nuggets`; routes `server/routes/expert-console.routes.ts:619` (GET) `:629` (POST) `:644` (PATCH, allowlist `:650`) `:668` (propose-gem) `:692` (DELETE). **Onboarding form has NO nugget composer** — it captures free-text `neighborhoods[]` chips (`client/src/pages/travel-experts.tsx:178,226,916-947`, required to advance `:344`) and three knowledge-proof essays (`:77`) into `local_expert_forms.neighborhoods` / `knowledge_proof_answers` (`shared/schema.ts:444,446`). | The console "Neighborhoods" panel is a new page in `client/src/pages/expert/`; the onboarding "Show us your neighborhood" step replaces the free-text chips with the picker (D5). |
| existing scorer | `server/services/expertise-scoring.service.ts` — `RUBRIC_DIMENSIONS` `:28`, `DIMENSION_GUIDE` `:31-40` (4 dims × 0–3), `MODEL = process.env.EXPERTISE_SCORING_MODEL \|\| "claude-sonnet-5"` `:101`, unscored-on-any-failure `:11-14`, defensive JSON parse `:115-158`; **thresholds are code literals** `STRONG_AT=70 / ADEQUATE_AT=45` `:78-79`; called fire-and-forget (`void scoreKnowledgeProof(...)`) at `server/routes.ts:2071,2093,2130,2151`; persisted `local_expert_forms.knowledge_score` jsonb (`schema.ts:450`, `storage.ts:1785`); rendered **admin-only** at `client/src/pages/admin/experts.tsx:467`. | Adding a dimension = append to `RUBRIC_DIMENSIONS` + `DIMENSION_GUIDE`. This lane does NOT extend it (different unit: per-neighborhood claim, 0–2 scale, web-gap input); it mirrors its client/parse/unscored posture in `evidence-scorer.service.ts` and moves every number into `evidence_thresholds`. Its literal thresholds are the pattern the `2026-09-01-evidence-thresholds-config` ruling forbids here — filed, not fixed (F3). |
| same-transaction log | `shared/schema.ts:6348-6366` (`trip_id NOT NULL` FK, `item_id` nullable no-FK, `event_type varchar(30)`, `actor_type varchar(20)`, index declared); writer `server/services/item-transition-log.service.ts:1-15` (ONE module, append-only, callers pass `tx`) | Mirror, don't reuse (trip-scoped). Shape to copy: `(claim_id, from_status, to_status, actor_type, actor_id, created_at)`, insert-only module, same-`tx` argument. |

## 2. Structures the typed captures reuse or mirror

| Capture | Candidate structure | Verdict | Reason |
|---|---|---|---|
| P1 place entry (`name, category, do_this, when, watch_out, price_band, expert_confidence`) | `local_knowledge_nuggets` (`schema.ts:8031`) | **REUSE + additive columns** | `linkedPoi`=name, `insight`=do_this already exist and the promote→gem rail reads them (`gem-promotion.service.ts:108,136`). Missing: `neighborhood_id` FK (today free text), `place_category`, structured `when`, `watch_out`, `price_band`, `expert_confidence`, claim linkage, web-gap result. All additive-nullable (263 posture). |
| P2 mini-slip (`items[3]` with `duration_min`, `transition`, `order_reason`, `hard_constraint[]`) | `itinerary_items` (`schema.ts:4125`; `durationMinutes :4139`, `travelFromPrevious jsonb {mode,duration,distance,instructions} :4150`, `sortOrder`) | **MIRROR (new `mini_slip_templates`)** | `trip_id` is `NOT NULL` — a template has no trip. Mirror the item subset + `travelFromPrevious`'s `{mode, duration}` for the transition so a later "drop this evening onto a slip" copies fields 1:1. `expert_templates.itineraryData.days[].activities[]` (`schema.ts:5068-5085`) is the other precedent but is a paid marketplace product, not a fragment. No "template-fragment store" exists yet (grep `fragment` in schema: 0) — P2 rows ARE the store's first table. |
| P2 transition | `transport_legs` (`schema.ts:6142`) | **MIRROR shape only** | `from_lat/lng`, `to_lat/lng`, `distance_meters` are `NOT NULL` — an expert saying "10-min walk" has none of them (§13: never invent). Carry `{mode, minutes}` inline on the P2 item, as `travelFromPrevious` does. |
| P1 `when` / P2 `hard_constraint` → timing priors | `travel_pulse_crowd_forecasts` (`schema.ts:3379`: `placeName, city, hourOfDay, isOptimalWindow, isAvoidWindow`; **no `source` column**), `travel_pulse_calendar_events` (`:3405`, has `source varchar(50)` `:3428`) | **MIRROR later (Phase 2 consumer)** | The typed `when` `{hours, days, season}` maps onto crowd-forecast windows, but that table can't mark a row first-party. A `source` column on crowd_forecasts is a Phase 2 additive — flagged inert until consent (§5). Not in the Phase 1 migration. |
| P3 contingency (`trigger, replaces_item, alternate, reason`) | `itinerary_items.backupPlanId / isBackupPlan / weatherConditions {requiredConditions, triggers}` (`schema.ts:4195-4197`) | **MIRROR (new `claim_contingencies`)** | The alternates model exists on items as a self-reference; here the alternate is one P2 item-shaped object keyed to the P2 template row. `weatherConditions.triggers` informs the `trigger` enum (`rain \| closed \| child \| late_start` per §1 P3). |
| P4 access (`venue, access_type, relationship_basis`) | nothing comparable (`dmo_extracted_places.ticketing_url` is a link, not a relationship) | **NEW (`access_claims`)** | Held per `2026-09-01-access-claims-held`: stored, never scored, never public, never counted. |
| Claim status diary | `item_transition_log` | **MIRROR (new `neighborhood_claim_transitions`)** | §1 above. |
| Scores | `local_expert_forms.knowledge_score` jsonb (`schema.ts:450`) | **MIRROR** as `expert_neighborhood_claims.scorer_json` jsonb | Same admin-only posture, validated against the §4 contract on write. |

## 3. Attribution / conflict joins for the Phase-4 independence check

`acquired_via_provider_id`: **absent** (0 hits in `shared/schema.ts`). The nearest names are `service_bookings.acquisition_ref`
(`schema.ts:1260`, a short-link code) and `fee_ledger.acquisition_ref` (`:7042`). The join the scout-booking check will read:

| Interest | Table.column | Join to the scouted venue |
|---|---|---|
| Gem attribution | `travel_pulse_hidden_gems.curated_by_expert_id` (`schema.ts:3576`) | `place_name` ≈ venue |
| Listing ownership (provider linkage) | `provider_services.user_id` (`:761`), venue via `service_name` (`:763`) / `meeting_point` (`:797`) / `neighborhood` (`:829`) | expert owns a listing at the venue |
| Short-link / rails commission | `short_links.owner_user_id` (`:8935`) → `service_bookings.acquisition_ref` (`:1260`); resolver `server/services/rails-attribution.service.ts:199 resolveRailsForItem` | expert's link earned on the venue's service |
| Earnings | `expert_earnings.expert_id` (`:5143`) → booking → `provider_services.user_id` | expert earned from the venue's provider |
| Endorsement | `upsell_expert_endorsements.expert_id`, `offering_id`, `neighborhood_id` (`:7811-7818`) | expert endorsed the venue's offering |
| Booking-agent role | `affiliate_booking_requests.expert_id` (`:8138`) | expert brokered a booking at the venue |
| **New in Phase 1** | `local_knowledge_nuggets.expert_user_id` + `claim_id` (P1 row), `access_claims.expert_id` | the expert's own claim names the venue — the most direct conflict |

Keyed into Phase 1 by stamping `expert_id` + `venue_name` (normalized) on every evidence row, so Phase 4's join is
`normalized_name` equality plus the five expert-id columns above. No new column is needed on those five tables.

## 4. Offering-type registration + where a report renders on a slip item

- **Registration path:** `expert_offering_types` (`schema.ts:7719-7733`; `service_tier` ∈ advisory|planning|coordination|
  live_support|specialized, `delivery_formats` ∈ chat|written|video|live_text|done_for_you — both gated by migration 040's
  completeness gate). New types land by idempotent migration INSERT — precedent `065_seed_booking_concierge_offering_type.sql`
  (one row, `ON CONFLICT (offering_type_key) DO NOTHING`). A `provider_services` row references it via `offering_type_key`
  FK (`schema.ts:517`, migration 107, `ON DELETE SET NULL`), created through `POST /api/provider/services` (the one
  creation route, CLAUDE.md "Service Creation Consolidation"), born `submitted` (migration 111). Rates resolve through
  `resolveCommissionRates` (`server/services/commission.ts:530`) / `resolveServiceOwnerShareRate` (`:147`) — no literal.
- **Render on a slip item:** the per-item expert artifact that renders today is `itinerary_items.expert_note` via
  `ExpertNoteBlock` (`client/src/components/plancard/SlipView.tsx:256-270`, mounted `:347`). `itinerary_items.attachments`
  jsonb `[{name,url,type}]` exists (`schema.ts:4232`) but **nothing renders it** (0 hits in `client/src/components/plancard`).
  Phase 4's report block is a sibling of `ExpertNoteBlock` reading a `scout_reports` row keyed `itinerary_item_id`, not the
  attachments blob.
- **Photo rail:** `server/infrastructure/object-storage.ts` (`uploadBuffer :87`, `objectPublicUrl :156`, private bucket
  posture per `server/routes.ts:6277`), first caller the deliverable rail `POST /api/provider/services/:id/deliverable-file`
  (`routes.ts:6204`). `ServiceForm.tsx:272`'s "no upload rail to reuse" comment predates it and is stale (F5). Scout photos
  are a TRUST surface under `2026-09-01-photo-tiers` — attributed real photos only.

## 5. Consent surface + counsel dependency

- Platform ToS acceptance: `users.terms_accepted_at` / `privacy_accepted_at` via `POST /api/auth/accept-terms`
  (`server/replit_integrations/auth/routes.ts:147`), gated client-side at `client/src/App.tsx:242`; page
  `client/src/pages/accept-terms.tsx`; text `client/src/pages/terms.tsx`.
- Expert-specific: `local_expert_forms.terms_and_conditions` boolean (`schema.ts:475`), same on `service_provider_forms`
  (`:556`).
- What the text covers today: §11.2 "User Content License" (`terms.tsx:427-429`) — a worldwide non-exclusive license over
  "profiles, reviews, photos, messages" for operating and promoting the Platform. **It does not name** typed field
  knowledge, bylines, aggregated/derived analytics, resale, or observational scout reports. §5.5 (`:187-226`) covers
  influencers only.
- **Named blocker `COUNSEL-1`:** data-use + byline + aggregated-analytics consent language, and the scout-report framing
  line ("observational report, not warranty"). Gates: flywheel consumers 2 (template-fragment store) and 4 (TravelPulse
  first-party tier) in Phase 2, and all Phase 4 copy. Capture builds regardless; `expert_neighborhood_claims.consent_at`
  stamps whatever text is live at submit, with `consent_version` so a later counsel text is distinguishable.

## 6. Web-search availability for the web-gap check

- **Client:** Tavily SDK `tavily@^2.0.0` (`package.json:161`), `import { tavily } from "tavily"`, key-gated on
  `TAVILY_API_KEY` (`runtime-health.service.ts:183`). Mounted in `server/services/dmo-ingestion.service.ts:21` (search +
  extract) and `server/services/booking-verification.service.ts:27` (extract), the latter with a `tavilyClient` dependency
  injection seam for tests (`:262-269`). The exact call shape the ruling needs already exists:
  `client.search(query, { maxResults: 3, searchDepth: "basic", includeAnswer: false })` (`dmo-ingestion.service.ts:118-122`).
- **Cap and price:** `TAVILY_MONTHLY_CAP_USD = 150` and `TAVILY_PRICE_PER_SEARCH_USD = 0.008` (`server/config/trailhead.config.ts:20,29`,
  R-T1-c). Per capture at ~3 P1 entries: **$0.024**. Twelve backfill captures: **$0.29**. The cap funds ~6,250 searches
  ≈ 2,000 captures/month before it binds.
- **Spend is not logged today:** `api_usage_logs` providers in code are amadeus/grok/google/google_routes/fever/viator/
  opentable/booking_com — no `tavily` (grep). Phase 2 logs each web-gap search through `apiUsageService.logApiCall`
  (`server/services/api-usage.service.ts:62`) with `provider: "tavily"` so the R-T1-c cap is observable, and adds `tavily`
  to `api-costs.service.ts:16 TRACKED_PROVIDERS` (F4).
- Alternatives present but wrong-shaped: `serp.service.ts` / `venue-search.service.ts` (SerpAPI Google Maps local results —
  place cards, not organic text; can't answer "is `do_this` on the web").
- Sandbox note: outbound to Tavily is proxy-blocked here and in CI (`dmo-ingestion.service.ts:18`), so Phase 2 tests inject
  a fake client; the live run is a deploy-time check.

## 7. Migration number (verified against origin, not sandbox)

- `origin/main` registry ends at `"270_landing_moments.sql"` (`server/migrations/migration-files.ts`, last entry); directory
  agrees (`ls server/migrations | tail`).
- Open PRs at audit time: #696 (`claude/traveler-fee-collection`) **adds `server/migrations/271_fee_ledger_fee_waiver_type.sql`**;
  #695 and #694 touch no migration. Remote branch heads sampled (80 of 1,162) carry no `27[1-9]_` file.
- **This lane takes 272.** If #696 renumbers or a third lane lands first, the guard fails CI rather than a human noticing:
  `scripts/check-duplicate-migration-prefixes.cjs` (self-test + run, `.github/workflows/build.yml:387-389`), landed via
  PR #624 (merge `b9e7444f`, "docs-pass-ledger-guards"). Its stated negative space: prefix uniqueness only — not
  registration, not order.
- PR #695 records the prod ledger at 272/270 recorded-vs-active names (stale historical rows); none is named 271 or 272.

---

## Schema proposal (migration 272, all declared in `shared/schema.ts`, no DB CHECK, additive only)

Vocabulary is app-enforced (migration-181/263 posture). Every insert schema is **pick-based** (allowlist) — the first
`.pick()` schemas in the file, which is what `#PS18` asks for; privileged columns (`status`, `scorer_json`,
`scorer_failed`, `ratified_*`, `verified_at`, `web_gap*`) are unreachable by construction.

```sql
-- 1. the claim
CREATE TABLE IF NOT EXISTS expert_neighborhood_claims (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  expert_id       varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id varchar      NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  status          varchar(20)  NOT NULL DEFAULT 'draft',   -- draft|submitted|scored|verified|declined (app-enforced)
  daypart         varchar(20)  NOT NULL DEFAULT 'evening', -- §1: per-neighborhood parameter
  version         integer      NOT NULL DEFAULT 1,         -- resubmission bumps; rows are versioned, never deleted
  consent_at      timestamp,                               -- stamped at submit
  consent_version varchar(40),                             -- which ToS text was live (COUNSEL-1)
  scorer_json     jsonb,                                   -- §4 contract, admin-only
  scorer_failed   boolean      NOT NULL DEFAULT false,     -- 2026-09-01-scorer-model: malformed ⇒ stays submitted + flag
  scorer_failed_reason varchar(60),
  submitted_at    timestamp, scored_at timestamp, ratified_at timestamp,
  ratified_by     varchar(255) REFERENCES users(id) ON DELETE SET NULL,
  declined_dimension varchar(20),                          -- admin-picked weakest dimension (§5) — never a number
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  UNIQUE (expert_id, neighborhood_id, version)
);
-- one live claim per (expert, neighborhood): partial unique, declared in schema.ts (deploy-push rule)
CREATE UNIQUE INDEX IF NOT EXISTS expert_neighborhood_claims_live_uniq
  ON expert_neighborhood_claims (expert_id, neighborhood_id) WHERE status <> 'declined';

-- 2. same-transaction diary (mirrors item_transition_log; insert-only module)
CREATE TABLE IF NOT EXISTS neighborhood_claim_transitions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claim_id varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version integer NOT NULL,
  from_status varchar(20), to_status varchar(20) NOT NULL,
  actor_type varchar(20) NOT NULL,   -- expert | ops | scorer | admin
  actor_id varchar(255),
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS nct_claim_created_idx ON neighborhood_claim_transitions (claim_id, created_at);

-- 3. P1 — additive depth columns on the existing gem-candidate host
ALTER TABLE local_knowledge_nuggets
  ADD COLUMN IF NOT EXISTS claim_id varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_version integer,
  ADD COLUMN IF NOT EXISTS neighborhood_id varchar REFERENCES city_neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_category varchar(50),
  ADD COLUMN IF NOT EXISTS when_json jsonb,            -- {hours, days, season} (structured; unparseable ⇒ scorer flag)
  ADD COLUMN IF NOT EXISTS watch_out text,
  ADD COLUMN IF NOT EXISTS price_band varchar(10),
  ADD COLUMN IF NOT EXISTS expert_confidence varchar(20),
  ADD COLUMN IF NOT EXISTS normalized_name varchar(255), -- Phase-4 join key
  ADD COLUMN IF NOT EXISTS web_gap varchar(10),          -- found|partial|absent (scorer-written)
  ADD COLUMN IF NOT EXISTS web_gap_url text,
  ADD COLUMN IF NOT EXISTS web_gap_checked_at timestamp;
-- (`insight` = do_this, `linked_poi` = name, `expert_user_id` = curated-by — all reused)

-- 4. P2
CREATE TABLE IF NOT EXISTS mini_slip_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claim_id varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version integer NOT NULL,
  expert_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- curated_by-style attribution
  neighborhood_id varchar NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  daypart varchar(20) NOT NULL,
  items jsonb NOT NULL,            -- [{position, name, normalized_name, duration_min, transition:{mode,minutes}, order_reason}] ×3
  hard_constraints jsonb NOT NULL, -- [{kind: last_entry|reservation_window|closure_day|last_train, detail}]
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  UNIQUE (claim_id, claim_version)
);

-- 5. P3
CREATE TABLE IF NOT EXISTS claim_contingencies (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mini_slip_template_id varchar NOT NULL REFERENCES mini_slip_templates(id) ON DELETE CASCADE,
  claim_id varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version integer NOT NULL,
  expert_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger varchar(20) NOT NULL,      -- rain|closed|child|late_start (app-enforced)
  replaces_position integer,         -- which P2 item (NULL = whole evening, e.g. late_start)
  alternate jsonb NOT NULL,          -- one P2-item-shaped object
  reason text NOT NULL,
  created_at timestamp DEFAULT now()
);

-- 6. P4 (held)
CREATE TABLE IF NOT EXISTS access_claims (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claim_id varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version integer NOT NULL,
  expert_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue varchar(255) NOT NULL, normalized_name varchar(255),
  access_type varchar(20) NOT NULL,  -- reservation|timing|introduction|entry
  relationship_basis text,
  verification_status varchar(20) NOT NULL DEFAULT 'held',  -- held only, until Phase 4 / ops lane
  created_at timestamp DEFAULT now()
);

-- 7. thresholds — rows keyed like fee_bands; the ONLY place a number lives
CREATE TABLE IF NOT EXISTS evidence_thresholds (
  threshold_key varchar(60) PRIMARY KEY,
  value integer NOT NULL,
  description text,
  updated_by varchar(255), updated_at timestamp DEFAULT now()
);
INSERT INTO evidence_thresholds (threshold_key, value, description) VALUES
  ('p1_min_entries', 2, '§3 places-verified: entries meeting the per-entry bar'),
  ('p1_entry_min_total', 5, '§3 per-entry total (of 8)'),
  ('p1_entry_min_localness', 1, '§3'), ('p1_entry_min_verifiability', 1, '§3'),
  ('p2_min_total', 5, '§3 sequencing'), ('p2_min_practicality', 2, '§3'),
  ('p3_min_total', 4, '§3 contingency'), ('p3_alternate_min_specificity', 1, '§3'),
  ('web_gap_found_localness_cap', 1, '2026-09-01-web-gap-check'),
  ('dimension_max', 2, '§2 scale ceiling'),
  ('resubmit_cooldown_days', 14, '§5 resubmission')
ON CONFLICT (threshold_key) DO NOTHING;

-- 8. the ratified join — additive on the EXISTING table (D1)
ALTER TABLE expert_neighborhoods
  ADD COLUMN IF NOT EXISTS claim_id varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS ratified_by varchar(255) REFERENCES users(id) ON DELETE SET NULL;
```

Publish-trap check: no CHECK, no NOT NULL without default on an existing table, every table/index above declared in
`schema.ts`. `evidence_thresholds` seed is `ON CONFLICT DO NOTHING` (fee_bands/122 posture). Absent threshold row ⇒ the
scorer/ratify path sets `scorer_failed_reason='thresholds_missing'` — never a code default (the ruling's "only place a
number lives" is stricter than `fee_bands`' documented fallback).

### Capture-shape table (what each prompt writes)

| Prompt | Typed fields (companion §1) | Row(s) written | Attribution / linkage carried |
|---|---|---|---|
| P1 | `name, category, do_this, when{hours,days,season}, watch_out, price_band, expert_confidence` | `local_knowledge_nuggets` (1 per entry; `linked_poi`, `place_category`, `insight`, `when_json`, `watch_out`, `price_band`, `expert_confidence`) | `expert_user_id`, `neighborhood_id`, `claim_id`, `claim_version`, `normalized_name`; scorer stamps `web_gap*` |
| P2 | `items[3]{duration_min, transition{mode,minutes}, order_reason}`, `hard_constraint[]≥1` | `mini_slip_templates` (1) | `expert_id`, `neighborhood_id`, `daypart`, `claim_id`, `claim_version` |
| P3 | `trigger, replaces_item, alternate, reason` | `claim_contingencies` (1) → P2 row | `expert_id`, `claim_id`, `claim_version` |
| P4 | `venue, access_type, relationship_basis` | `access_claims` (0..n), `verification_status='held'` | `expert_id`, `claim_id`, `claim_version` |
| every status write | — | `neighborhood_claim_transitions` in the same `tx` | `actor_type ∈ expert\|ops\|scorer\|admin` |
| ratify | — | `expert_neighborhoods` (`claim_id`, `verified_at`, `ratified_by`) | the ONE writer: the ratify service |

---

## Decisions for Leon (the hard stop) — `superseded@2584b6d5`: ruled Sep 2 (two amendments); see the RULING section at the end

**D1 — `expert_neighborhoods` writers.** Ruling: written only by admin ratification. Reality: four writers (headline 1).
Proposal: (a) `captureExpertNeighborhoods` stops being called from the approval hook (`storage.ts:1676`) — the free-text
chips keep landing in `local_expert_forms.neighborhoods` for the admin experts page but no longer mint rows; (b) the lead
route keeps ONLY its UPDATE leg (`is_lead` toggles on an existing verified row) and loses the raw INSERT (`admin-query.service.ts:1223`);
(c) `insertExpertNeighborhoodSchema` is deleted and the demo seed calls the ratify service (persona precedent
`2026-08-29-persona-coverage-complete`: seeds are callers of product functions, never second writers); (d) the Phase-1 test
asserts writes from the scorer path and from the seed's old direct insert both fail. **Open sub-question:** the existing
rows (legacy, `claim_id IS NULL`) currently power the feed's `localExpert` (`location-view.service.ts:411-430`), upsell
(`upsell-query.service.ts:384,575`), the storefront neighborhoods list (`storefront.routes.ts:161-173`) and the landing
anchor. Ruling text ("unclaimed stays dark") says they should not count as verified. Recommendation: **keep them, do not
delete, but readers that the rulings make verification-gated (Phase 3: hero/anchor/storefront `verified` chip) gate on
`verified_at IS NOT NULL`; everything else is untouched in Phase 1.** The twelve backfill ratifications are the relight.
Alternative: grandfather legacy rows as verified — cheaper, but contradicts the ruling's honesty line.

**D2 — P1 host.** Additive columns on `local_knowledge_nuggets` (proposal above) vs a new `claim_places` table. Recommend
the additive columns: the propose → approve → birth-gem rail, its admin queue, and its provenance proof (G1–G8) all keep
working on ratified P1 rows with zero new consumer code, which is exactly the "ratified P1 → gem-candidate rail (existing)"
line in Phase 2.

**D3 — `evidence_thresholds` shape.** Rows keyed by `threshold_key` (fee_bands shape, proposal §7) vs one JSON value in
`platform_settings` (`schema.ts:7661`, key/value text, reader `server/services/platform-flags.ts:40`). Recommend the
dedicated table: typed integers, a pick-based PATCH schema the completeness guard can see, and no JSON-in-text parsing on
the ratify path.

**D4 — Diary.** New append-only `neighborhood_claim_transitions` mirroring `item_transition_log` (same-`tx`, insert-only
module) — vs the sibling's `insertAccessAuditLog(...).catch()`. Recommend the mirror; the sibling's posture is weaker
than the dispatch asks ("same-transaction log pattern for status writes").

**D5 — Onboarding step.** Replace the free-text chips (`travel-experts.tsx:916-947`) with the `city_neighborhoods` picker
(`GET /api/city-neighborhoods`) and mount P1–P3 inline, P4 optional. The step must NOT gate application submission
(save-and-finish-later ⇒ `claimed`), so the `neighborhoods.length > 0` requirement at `:344` becomes "≥1 claim in any
status". Markets outside the 8 seeded (`042`) have no picker rows — an expert there can't claim (honest; the
`data/major-cities-neighborhoods` branch is the fix, not this lane).

**D6 — Vocabulary collision, existing copy.** `travel-experts.tsx:1018` already tells experts vague answers "won't pass
review" — `pass` is on the companion §0 forbidden list. Phase 2's assertion ("no route/component/string reachable by role
`expert` contains … the word test") is scoped to this lane's surfaces; extend it to `pass/fail/score/exam` and reword
that one line, or leave the knowledge-proof step out of scope? Recommend: extend + reword the one line (one-word copy fix).

**D7 — Independence join key.** With `acquired_via_provider_id` absent, Phase 4 joins on `normalized_name` + the five
expert-id columns in §3. Confirm that set, or name a column I missed.

**D8 — `daypart` default source.** The companion says the parameter is set per neighborhood (Porto Bolhão → morning,
Johari Bazaar → late afternoon). Proposal stores it on the claim (`daypart NOT NULL DEFAULT 'evening'`); the
per-neighborhood default would be an additive `city_neighborhoods.default_daypart` (nullable → 'evening'). Include it in 272,
or set daypart by hand in the two non-evening markets for now?

---

## Filed (out of scope; land in `FOLLOWUPS.md` with the Phase 1 PR, not fixed here)

- **F1** `swapNeighborhoodLeadTx`/`clearNeighborhoodLeadTx` are imported at `admin.routes.ts:169` and the lead route at
  `:8025` raw-INSERTs into `expert_neighborhoods` — the platform-assignment path D1 retires.
- **F2** `captureExpertNeighborhoods` (`storage.ts:1732`) silently skips names with no `city_neighborhoods` match — a
  claim that vanishes on approval with only a console log. Superseded by the picker (D5).
- **F3** `expertise-scoring.service.ts:78-79` thresholds are code literals (`STRONG_AT`, `ADEQUATE_AT`) — the class the
  thresholds ruling names; consider moving them into `evidence_thresholds` or a sibling once this lane's loader exists.
- **F4** Tavily spend is not logged to `api_usage_logs` anywhere (DMO ingestion, booking verification) — the R-T1-c $150
  cap is unobservable in the admin cost view (`api-costs.service.ts:16`).
- **F5** `ServiceForm.tsx:272` comment ("no upload/object-storage rail in this codebase to reuse") is stale —
  `server/infrastructure/object-storage.ts` exists (deliverable rail).
- **F6** `travel_pulse_crowd_forecasts` has no `source` column, so first-party timing priors can't be marked as such
  (Phase 2 additive, consent-gated).
- **F7** Migration 263's file header still reads "262" (renumbered on merge) — cosmetic.
- **F8** `local_knowledge_nuggets.linked_neighbourhood` is free text with no FK; existing nuggets can't be joined to
  `city_neighborhoods` without a name match (Phase 1 adds the FK column; a backfill is a separate decision).

## Beside the lane (human)

- Backfill email — Phase 1 drafts `docs/expert-field-knowledge/backfill-email.md` from §1 prose; Leon sends; twelve
  replies fuel Phase 2's proof gate.
- **COUNSEL-1** — data-use/byline/aggregated-analytics consent + the scout-report framing line; gates flywheel consumers
  2/4 and all Phase 4 copy. Send this week.

---

## RULING on Phase 0 D1–D8 (`expert-field-knowledge` v2) — decision-maker, 2026-09-02, verbatim

* D1 — ratified. Legacy rows stay `claim_id IS NULL`, readers untouched in Phase 1, Phase 3 cuts the four surfaces to `verified_at IS NOT NULL` one commit each. Raw INSERT and exported insert schema deleted in Phase 1, not deferred. Demo seed calls the ratify service.
* D2 — ratified, with a rider: the new nullable columns on `local_knowledge_nuggets` must be declared through the pick-based projection and the completeness guard pinned in CI. A column the guard can't see is the mass-assignment class reopening. `neighborhood_id` backfill onto pre-existing nuggets is a separate decision — file it.
* D3 — ratified. No code-constant fallback. Seed migration inserts the §3 values so no environment boots with an empty table. `thresholds_missing` must block Ratify as well as the scorer — an admin cannot verify a claim against numbers that don't exist.
* D4 — ratified. Copy `item-transition-log.service.ts`'s shape. The gem-candidates `.catch` on its audit write is a finding — file it against that lane, don't fix it here.
* D5 — amended. Picker replaces chips, approval hook severed, `local_expert_forms.neighborhoods` still written — all ratified. The step-validity rule is wrong as stated: "at least one claim in any status" blocks onboarding submission for any expert whose city has no seeded neighborhoods. Not being able to claim is honest; not being able to apply is a funnel hole. Rule: require ≥1 claim only when the picker has options for the expert's city; when it has none, the step is skippable with a stored `no_neighborhoods_available_at` timestamp so ops can backfill the claim when that market's rows land.
* D6 — ratified. Assertion scope is every string reachable by role `expert`, word list `test | exam | score | pass | fail`. Reword line 1018 as proposed.
* D7 — ratified, including `affiliate_booking_requests.expert_id` and the lane's own P1/P4 rows. `normalized_name` equality is acceptable at launch; file a followup to move the join onto POI id once nuggets carry `linkedPoi` consistently, because name-matching is the same weak link that made the chips dishonest.
* D8 — ratified.

Migration 272: confirm the number against `origin/main`, not the sandbox, before the PR opens. Proceed to Phase 1 build; next stop is the PR with `information_schema` verification.

> The one I'd watch when the PR lands is D5. The agent's instinct — "can't claim, can't proceed" — is the correct instinct for the claim and the wrong one for the application, and it's a one-line rule change that would otherwise quietly turn away every expert outside the eight cities.

Ledger row: `2026-09-02-field-knowledge-phase0-ratified`.
