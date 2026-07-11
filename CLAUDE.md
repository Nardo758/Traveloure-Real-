# Traveloure Codebase Architecture

This document captures architectural decisions to maintain consistency across code changes. Updates require approval from the designated decision-maker.

**Architectural Decision-Maker:** User (explicit confirmation required for schema/routing changes).

---

## Service Model: Canonical Table

### Decision: `provider_services` is the canonical service source (NOT `expert_service_offerings`)

**Why:**
- `service_bookings.serviceId` and `service_reviews.serviceId` both FK to `provider_services.id`
- This creates an immutable structural dependency: transactions *must* reference provider_services
- Making a different table canonical (e.g., ESO) would fragment the booking/review/payment path
- The data itself has already converged: wizard writes to provider_services, bookings FK there

**What This Means:**
- All service creation (expert custom, provider, templates) writes to `provider_services`
- The approval workflow (draft → submitted → approved) is stored as `approval_status` on `provider_services`, not elsewhere
- `expert_service_offerings` (ESO) remains a read-only template/offerings catalog for the signup flow
- ESO is NOT a transaction source; it's a convenience catalog for onboarding

**Transport-commerce exception (`service_bookings.service_id` is nullable):**
- The `serviceId → provider_services` FK and the dependency above **still hold for provider-service bookings/reviews.**
- The one documented exception: **transport-commerce bookings** (`bookingDetails.bookingType = "transport"`) reference a `transport_booking_options` row, not a `provider_services` row, so they carry a NULL `service_id`.
- `service_id` was made nullable by migration `050_service_bookings_service_id_nullable.sql` (the strand fix in PR #46 inserts these rows; the change previously lived only in `shared/schema.ts` + a hand-run dev ALTER with no migration, so prod still rejected the insert).
- Recorded here per the Coordination Prevention rule; ratified by the decision-maker by merging the PR that carries this note + migration 050. Any **further** loosening of this FK requires explicit decision-maker approval.

**Consolidation Timeline:**
- **Phase 1+2 (DONE):** Migrations 011-012 add schema columns and consolidate `expert_custom_services` → `provider_services` with category mapping
- **Phase 3 (DONE):** Build shared ServiceForm component targeting provider_services (role-aware, both expert and provider)
- **Phase 4 (DONE):** Apply User Console theme to expert pages (#1A1A18, #7A7A72, #E8E8E2, #FAFAF8)
- **Phase 5 (DONE):** Migration 013 drops deprecated tables/columns: expert_custom_services, expert_selected_services, expert_service_categories, ESO workflow columns

**What Was Deprecated:**
- Commit `bfc3db2` made ESO canonical by adding workflow columns. This contradicted the booking-FK fact and is superseded by this document.
- The `runEsoBackfill()` startup migration is disabled; migrations 011-012 handle schema + data consolidation to provider_services.
- Deprecated tables (expert_custom_services, expert_selected_services, expert_service_categories) and ESO workflow columns are dropped by migration 013.

---

## Service Creation Consolidation

All service creation routes converge on one destination: `POST /api/provider/services` writes to `provider_services`.

- Experts creating custom services use the same route/schema as providers
- Role-based filtering happens at read time (GET /api/expert/services filters by userId + approvalStatus)
- No separate tables; no separate approval workflows

---

## Category Mapping (Non-Negotiable)

When migrating services from expert taxonomy (`expert_service_categories`) to canonical (`service_categories`):

1. Attempt deterministic name-match: `LOWER(TRIM(expert_cat.name)) = LOWER(TRIM(service_cat.name))`
2. If no match found, leave `categoryId` NULL (fallback acceptable, but ideally avoid)
3. This is critical: without category mapping, migrated services become invisible to:
   - Category-filtered browse (feed filters by categoryId)
   - Gem feed matching
   - Marketplace recommendations

If you see `categoryId IS NULL` rows on provider_services, it's likely a category mapping miss — investigate the source expert_service_categories row.

---

## Coordination Prevention

**If you are making changes that affect:**
- Service creation routes (`POST /api/provider/services`, `/api/expert/custom-services`)
- Service schema (provider_services, expert_custom_services, expert_service_offerings)
- Approval workflows (status enums, submission logic)
- Service category taxonomy
- **Database migrations** (schema or data)

**Then:**
1. Update this document FIRST with the decision and rationale
2. Reference this document in your commit message
3. If you find this document conflicts with your plan, escalate to the decision-maker (user) rather than overriding

**CRITICAL: Migration Directory**
- All SQL migrations must go in `server/migrations/` (NOT `migrations/`)
- Register each migration in `server/migrations/run-migrations.ts` in the `MIGRATION_FILES` array
- Migrations are applied at server startup via `runMigrations()` (server/index.ts)
- `/migrations/` is for Drizzle-only migrations; `server/migrations/` is the active set

**CRITICAL: Lockfile purity (do not remove these guards)**
- `npm install` inside the Replit workspace resolves through Replit's package-firewall proxy and bakes
  unreachable `package-firewall.replit.local` URLs into `package-lock.json` — that breaks `npm ci` on every
  GitHub runner (this kept main red ~Jul 7–11). The main recurrence engine is `.replit [postMerge]` →
  `scripts/post-merge.sh` → `npm install` after every merge.
- Guards, in order: `scripts/post-merge.sh` scrubs right after its install; the pre-commit hook
  (`.githooks/pre-commit`, installed by the `prepare` script) scrubs staged lockfiles from manual installs;
  the CI `lockfile-purity` gate is the backstop. All use `scripts/scrub-lockfile.cjs` (URL-only rewrite).
- The project `.npmrc` (`registry=https://registry.npmjs.org/`) may prevent pollution from forming, but its
  precedence against Replit's proxy is UNVERIFIED (env-level `NPM_CONFIG_*` would override it). To verify
  from inside a Replit workspace: `npm install && grep -c "replit.local" package-lock.json` — 0 = it works.
- Do not remove the `.npmrc`, the hooks, or the CI gate; do not run bare `npm install` and commit without
  the scrub.

**Migration 059 (Jun 10, 2026; registered in the canonical `migration-files.ts` list):** index-only — `idx_pnc_neighborhood_category` on
`provider_neighborhood_coverage(neighborhood_id, category_key)`. The upsell engine's
candidate gather (Engine Inventory-Sourcing brief) reads coverage by
`(neighborhood_id, category_key)`; the existing unique constraint leads with
`provider_id` and cannot serve that path. No schema/data semantics change.

**Migration 060 (Jun 10, 2026; registered in `migration-files.ts`) — Paid Booking Concierge, Phase 3.1:**
seeds ONE flat fee-AMOUNT band `expert_concierge_booking` in `fee_bands` (`rate_type='flat'`,
`default_rate=9.99` PLACEHOLDER, admin-configurable), idempotent `ON CONFLICT (band_key) DO NOTHING`.
The resolver routes the `booking_concierge` concern to this band via `decideBandKey` (named mapping,
no fallthrough), and `resolveCommissionRates` now guards on `rate_type` so a FLAT band is never built
into a split. The band is the fee AMOUNT only; the 75/25 split rides `expert_standard` (Phase 3.4).
Rate-neutral for every existing category (nothing routes to it yet). Ratified by the Phase 3.1 GO.

**Migration 061 (Jun 11, 2026; registered in `migration-files.ts`) — Paid Booking Concierge, Phase 3.2:**
seeds ONE coordination-tier `expert_offering_types` row `booking_concierge` ("I'll book this off-site
item and add it to your trip"), idempotent `ON CONFLICT (offering_type_key) DO NOTHING`, mirroring the
039 seed. Distinct from `done_for_you_booking` (broader "book everything"): this is per-item off-site
facilitation. Experts opt in by creating an APPROVED `provider_services` row referencing it via
`expert_offering_type_id` (migration 057); market scoping rides `expert_neighborhoods` (no new column).
Catalog vocabulary only — no eligibility/fee wiring yet (3.3/3.4). Ratified by the Phase 3.2 GO (CREATE).

**Migrations 107–108 (Jul 11, 2026; registered in `migration-files.ts`) — Structural Consolidation, Phase 1 (decisions D3a/D4/D5a):**
107 adds nullable `offering_type_key` to `local_expert_forms` (FK → `expert_offering_types.offering_type_key`)
and `service_provider_forms` (FK → `service_offering_types.offering_type_key`), both `ON DELETE SET NULL` —
the canonical /earn selection the signup forms previously dropped (only the display name survived). Two
parallel catalogs, two FKs; experts remain NOT `service_categories` rows. 107 also repairs the missing
unique constraint on `service_offering_types.offering_type_key` (declared in schema.ts, absent from shipped
DDL), guarded to REFUSE on pre-existing duplicate keys rather than half-apply. 108 adds nullable
`has_insurance` boolean to `service_provider_forms` (applicant self-attestation, previously collected and
dropped; NULL = pre-108 "never asked"); table chosen because signup writes it and the FEE-2 brief homes the
admin-validated `insurance_tier` evidence there. D3a: `deliveryMethodEnum` (shared/schema.ts) is extended
with `hybrid` — canonical set is now `pdf, video, call, in_person, voice_notes, async_messaging, hybrid`;
the column is varchar with no DB CHECK, so this is TS-level; NO row remap has run — that requires the
Phase-1d approved remap table. Ratified by the Phase 1+ execution dispatch (D1a·D2a·D3a·D4·D5a locked).

**Migration 067 (Jun 11, 2026; registered in `migration-files.ts`) — Discover Feed Composition admin rows:**
data-seed only, no schema change. Inserts the five `feed_*` `platform_settings` rows read by the public
`GET /api/feed-composition-config` (Discover Feed Composition Brief): `feed_rec_cadence` ('4'),
`feed_wanted_slot_max` ('2'), `feed_wanted_slot_spacing` ('6'), `feed_rec_label` ('Recommended'),
`feed_rec_affiliate_label` ('Paid partner'). The endpoint already falls back to these same code defaults
when rows are absent; seeding them makes the knobs DISCOVERABLE/editable in the admin platform-settings
list (which shows only existing rows). Idempotent `ON CONFLICT (setting_key) DO NOTHING` — never
overwrites an admin-tuned value, mirroring the 033 seed pattern.

**Previous Coordination Failure (Jun 3, 2026):**
- Commit bfc3db2 made ESO canonical without accounting for booking-FK fact
- This was uncoordinated and left the transaction path orphaned
- Fixed by this architecture document + provider_services canonicality

**Recorded migration — Expert-Assisted Booking, Phase 2 (Jun 10, 2026):**
- Migration `051_affiliate_booking_trip_link.sql` adds a **nullable** `trip_id` FK
  (→ `trips`, `ON DELETE SET NULL`) to `affiliate_booking_requests`. This closes the
  Trip-logging gap on the **existing** affiliate-booking rail — no new rail, no
  provider_services / ESO / approval / category change. Set at expert-confirmation
  (the create trigger is a no-trip discover surface); on confirm the facilitated
  booking is logged onto `itinerary_items` (the canonical Trip/PlanCard item model).
- Registered in `run-migrations.ts` (runtime) and `migration-files.ts` (chain test).
  Ratified by the decision-maker via the Phase 2 GO.
- Keeps its shipped filename `051_…` per the migration-chain repair below; it is
  registered after 057 in the canonical list (registry order is authoritative,
  numeric order is not).

**Recorded migration-chain repair (Jun 10, 2026):**
- `server/migrations/migration-files.ts` is the canonical migration registration
  list for both runtime and chain-integrity checks. `run-migrations.ts` must
  import that list rather than carrying its own inline copy.
- `052_phase5_expert_endorsements.sql` is a superseded duplicate schema attempt
  for `upsell_expert_endorsements`; do **not** register or execute it. The live
  endorsement schema remains `050_phase5_expert_endorsements.sql`.

---

## FAQ

**Q: Can I add a new service table?**
A: No. Consolidate into provider_services or escalate to decision-maker.

**Q: Can I make expert_service_offerings accept writes again?**
A: No. It's a read-only template source. Writes must target provider_services.

**Q: What about the ESO columns (status, submittedAt, etc.) that are still in the schema?**
A: They're deprecated — kept for backward-compat in Phase 5. Don't write to them. Don't read from them. Use provider_services columns instead.

**Q: Can I change the approval status enum?**
A: No without explicit user approval. Document the change in this file.

**Q: Why is `service_bookings.service_id` nullable if transactions must reference provider_services?**
A: Provider-service transactions still must — the FK and dependency hold for them. Transport-commerce bookings are the single documented exception: they reference `transport_booking_options`, not `provider_services`, so `service_id` is NULL for them (see "Transport-commerce exception" above; migration `050`). Any further loosening of this FK requires decision-maker approval.
