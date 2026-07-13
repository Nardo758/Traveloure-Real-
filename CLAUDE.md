# Traveloure Codebase Architecture

This document captures architectural decisions to maintain consistency across code changes. Updates require approval from the designated decision-maker.

**Architectural Decision-Maker:** User (explicit confirmation required for schema/routing changes).

---

## Locked Decisions & Current Intent (updated Jul 12, 2026)

> This section carries **intent** — how the platform is *supposed* to work — from the decision-maker's sessions, which the
> repo alone can't convey. Where a "⚠️ current code" note appears, the code **diverges from intent**; that is a tracked
> **bug**, not the design. Do not "fix" the doc to match a divergence — fix the code (or leave it flagged).

1. **Approval lifecycle (D1a).** Offerings are born `draft`/`submitted`, **never born-approved**. A minimal admin
   approve/reject queue runs on the real admin gate; recommendations/availability filter on `approved`.
   Lifecycle: `draft → submitted → approved`. ⚠️ **Current code:** `provider_services.approval_status` defaults
   `"approved"` (`shared/schema.ts:578`) and `GET /api/expert/services` has no approval gate (`server/routes.ts:5538`) —
   both tracked by D1a/Phase 2.
2. **Admin auth = default-deny.** `/api/admin/*` is protected by a **blanket `requireAdmin`** guard
   (`app.use("/api/admin", …)` in `server/routes.ts`, DB role lookup on the session; 401/403; no bypass) — **landed via
   #141**; the previously world-writable `POST /api/admin/fee-config` hole is **closed on `main`**. Do **not** reintroduce
   per-endpoint opt-in — that pattern is what leaked.
3. **Delivery-method vocabulary = the 7.** Canonical set is `pdf, video, call, in_person, voice_notes, async_messaging,
   hybrid` — enforced by both `deliveryMethodEnum` (`shared/schema.ts:523`) and the migration-109 DB CHECK on
   `provider_services` + `service_templates`. No `document`/`digital`/hyphenated variants; the `CANONICAL_TEMPLATES` seeder
   must emit canonical values.
4. **Two parallel offering catalogs, never merged.** `expert_offering_types` (`serviceTier` + `deliveryFormats`) and
   `service_offering_types` (`categoryKey` → `service_categories`) are strictly separate. **Experts are NOT a
   `service_category`.** `offering_type_key` is persisted via **two separate FKs** (migration 107), `ON DELETE SET NULL`.
5. **One builder; selection-only signup.** `ServiceForm` is the single offering-creation surface for **both** roles; the
   expert create wizard is retired (Phase 3). Signup is **selection-only** — listing creation is deferred to the
   post-approval console. 🔄 **Phase 2 IN PROGRESS** (`claude/phase2-serviceform-absorption`): `ServiceForm` absorbs the
   wizard's two unique capabilities — the from-template **gallery entry** (writing via the canonical
   `POST /api/provider/services` with `approvalStatus` `draft`/`submitted`, **never** the born-approved
   `POST /api/expert/services/from-template/:id`) and the **`requirements`** field. Also lands a pre-existing P1 fix
   (Step 0.5): ServiceForm's delivery vocab is canonicalized at the write boundary (`in-person`→`in_person`,
   `video-call`→`video`, keep `hybrid`) so writes satisfy the migration-109 CHECK — before this, ServiceForm creates with
   those two values failed on insert. Every create path stays `draft`/`submitted`, never born-approved (D1a). The wizard is
   **not deleted** in Phase 2 — its retirement is Phase 3. Filed for Phase 3: retire/redirect the born-approved
   `from-template/:id` route; and **evaluate** (do not add mechanically) exposing the not-yet-in-picker canonical
   delivery methods (`call`, `voice_notes`, `async_messaging`, `pdf`) — confirm **each** is a delivery type a
   provider/expert should be able to *choose* in ServiceForm before adding it. In particular `pdf` (the written-deliverable
   method the wizard's `document` mapped to) may be a template-/offering-only concept, not a picker option; adding a picker
   option the rest of the create/booking flow doesn't support would be a new "surface-without-a-backend" trap.
6. **Insurance.** `has_insurance` (provider self-attestation, `service_provider_forms`, migration 108) is the **sole**
   provider insurance field; the "023 insurance evidence" was a never-shipped plan. When FEE-2 Phase 1 ships the
   admin-validated `insurance_tier`, a **boolean-vs-tier precedence rule must be written here before both coexist.**
7. **Coordination fee.** Fee logic lives in the service (`optimization-fee.service.ts`); rates resolve via config, no
   literals; the optimize credit is **payment-gated — never credit an unpaid optimize fee**. **Resolved (interim, #144):**
   the fee reads the event budget from the existing `coordination_states.budget` jsonb column
   (`{ amount: <dollars>, currency }`, written at create/patch from the request's `metadata.budget`, read ×100), **not**
   `total_estimated_cost` (that means *cost*, not budget); absent/`{}` budget → intentional floor-only. The optimize
   credit is **not applied** pending the Phase-4 paid-signal linkage (no unearned discount). Filed follow-ups: first-class
   validated `budget` field (D-BUDGET(b)); the paid-signal ledger. Full contract in the "Recorded change — Coordination-fee"
   note below.
8. **No fee/commission/margin literals** anywhere outside `fee_bands`/config — grep-gated every phase. A hardcoded rate in
   touched code is a defect (see §13). The `499`/`8%` coordination constants are a pre-existing exception pending
   migration to config (Phase 4.1 TODO in the service).
9. **Routing realities.** `server/routes/experts.routes.ts` is **imported-but-unmounted (dark)** except the two ported
   endpoints; ~24 endpoint families are dead in production pending the dark-families triage. **Dead endpoints return
   200-HTML (the Vite catch-all), NOT 404** — never use a 404 as a "route is dead" signal.
10. **Expert-template marketplace — ACTIVATION IN PROGRESS** (`claude/marketplace-phaseA-gate` and follow-ons).
    Replit commit `3ceeffc3` replaced the old ledger stub with a **real two-step Stripe checkout**: `POST
    /api/expert-templates/:id/purchase` creates a `pending_payment` purchase + Stripe PaymentIntent (no earning yet),
    and `POST /api/expert-templates/:id/purchase/confirm` server-verifies the intent (`status === 'succeeded'`, IDOR +
    ownership + idempotency guards) before marking complete and recording the earning. The payment **guards are sound**
    and there is no dual-path/cart leak. **But the checkout is unsafe to surface until three gaps close, and is currently
    kept unreachable only by an orphaned purchase UI** (the `/expert-templates/:id` route is unregistered in `App.tsx`;
    the `/discover` `packages` tab is hidden). **Governing rule: safety before surfacing — the purchase path must not
    become reachable until Gap 1 (approval) and Gap 2 (field whitelist) hold.**
    - **Gap 1 — approval gate: BUILT (migration 110 + shared queue).** `expert_templates` now carries the same approval
      column set as `provider_services` (`approval_status` draft→submitted→approved/rejected, `submitted_at`/`reviewed_at`/
      `reviewed_by`/`rejection_reason`), with a DB CHECK on the status set. The purchase gate (`routes.ts`) is now
      **`approval_status === 'approved' AND isPublished === true`** — approval is the gate the expert cannot self-satisfy;
      `isPublished` stays the expert's own visibility toggle (approved-but-unpublished respects the hide; published-but-
      unapproved is not purchasable). Admin approve/reject endpoints (`/api/admin/expert-templates/:id/approve|reject`,
      reject-reason required) ride the blanket `adminApiGuard` (§2). Experts submit via `POST /api/expert/templates/:id/submit`.
      **A3 material-change re-review:** changing `price`/`currency` on an approved template drops it back to `submitted`.
      **This is the shared queue = Phase 4's queue** — built once, **do not fork** a template-only path (§4/§10).
      **Backfill effect (recorded, not silent):** existing `is_published=true` templates were backfilled to `submitted`,
      so they need admin approval before they can sell — zero live impact today (purchase UI still orphaned, Gap 3).
      **Phase 4's scope is now REDUCED** to: wire the `provider_services` read-gate to this existing queue + decide the
      grandfather/backfill + born-`approved` default flip (`provider_services` was intentionally left untouched here —
      it already has the columns, grandfathered `approved`). Phase 4 **wires, does not rebuild.**
    - **Gap 2 — mass-assignment.** BOTH the create (`routes.ts:4396`) and PATCH (`routes.ts:4420`) endpoints spread raw
      `req.body`, so `isPublished`/`approvalStatus`/`expertId`/earnings columns are self-settable. Fix (A1, landed on
      this branch, **decision-independent**): write only an explicit expert-editable allow-set on both paths; never raw
      `req.body`; force `isPublished` false at create.
    - **Gap 3 — surfacing (Phase B, LAST).** Register `/expert-templates/:id`, un-dead the `packages` tab, integrate
      approved packages into Discover — **only admin-approved packages surface**, at the approved/locked price. Gated
      behind Phase A holding.
    - **Currency (decision 2 = A):** validate against the single platform currency (USD) now + keep per-listing
      `price`/`currency`; whitelist the currency field to a known set. Conversion infra exists (`budgetService`) but is
      budget-scoped; **Stage-2 multi-currency layers on later** — do not build it here.
    - **State machine at the DB (decision 3 = A):** add a CHECK on `template_purchases.status` (and the new template
      approval-status) to the valid set — the migration-109 lesson — and **flip the `status` default off `'completed'`**
      to a pre-payment state. Enforce the money state machine at the DB, not just app code.
    - **Price is locked at create** (`routes.ts` create reads `template.price` into the PaymentIntent + stores
      `expertEarnings` on the purchase row; `/confirm` records from the stored row, never re-reads `template.price`) —
      A3 adds "material `price`/`currency` change to an approved template re-enters review."
    - **Filed follow-up — refund path (not built).** `'refunded'` is **already in the migration-110
      `template_purchases_status_check`** as forward-compat (a status CHECK's failure mode is asymmetric: allowing an
      unwritten value never 500s, omitting a written one does). When the refund path is built: **do not** re-add
      `'refunded'` to the CHECK (it's already allowed — a second ADD would hit "constraint already allows this"); wire the
      actual `status = 'refunded'` write **plus the earning reversal** (undo the `template_sale` `expert_earning`). No
      `failed`/`cancelled`/`processing` were added — don't add a status nothing writes (a state with no transition in/out
      is a trap); add one only with its write path.
11. **Auth/env.** Passport serializers register in **all** environments, not just Replit (fix #133) — email/password login
    works off-Replit. The `package-lock.json` `replit.local` pollution is scrubbed durably (#134; see Lockfile purity).

### §13 — Known Defects (these are BUGS, not intended behavior — do not describe them as how the platform works)

- **Trust-claims cluster** (on `/experts`, `/experts/:id`, `/services/:id`), awaiting the dedicated brief. **One arm
  FIXED:** the `verified || true` bug (every expert rendered "Verified") is closed by Replit commit `139d3f71` —
  `expert-detail.tsx` now uses `verified === true`. **Still open:** fabricated `4.9`/`4.5` ratings, a `90/10` commission
  **literal**, hardcoded "free cancellation / instant confirmation / 24-7 support" copy, and a 2-character-neighbourhood
  empty-result trap. Do not mark §13 resolved — only the `verified` arm is done.
- **Approval divergences** (§1) — tracked (D1a/Phase 2). *(The coordination-fee $0-budget bug was fixed by #144 — see §7.)*
- **`expert_service_categories`** dropped by migration 013 but still in `shared/schema.ts` + live code — latent runtime bug.

---

## Service Model: Canonical Table

### Decision: `provider_services` is the canonical service source (NOT `expert_service_offerings`)

**Why:**
- `service_bookings.serviceId` and `service_reviews.serviceId` both FK to `provider_services.id`
- This creates an immutable structural dependency: transactions *must* reference provider_services
- Making a different table canonical (e.g., ESO) would fragment the booking/review/payment path
- The data itself has already converged: wizard writes to provider_services, bookings FK there

**What This Means:**
- All **service** creation (expert custom, provider, and the `service_templates` seed catalog) writes to `provider_services`.
  **Do not conflate with expert *itinerary* templates:** those are a separate product living in the `expert_templates` table (marketplace), **not** `provider_services` — see Known Decisions & Divergences §10.
- The approval workflow (draft → submitted → approved) is stored as `approval_status` on `provider_services`, not elsewhere.
  ⚠️ **Intent vs. current code:** the intent (D1a) is that offerings are born `draft`/`submitted` and **never born-approved**. The live column
  `provider_services.approval_status` **defaults `"approved"`** (`shared/schema.ts:578`) — a divergence tracked by D1a/Phase 2, not the intended behavior.
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
- Role-based filtering happens at read time. ⚠️ **Intent vs. current code:** the intent is that `GET /api/expert/services`
  gates on `approvalStatus`. The live handler (`server/routes.ts:5538` → `storage.getProviderServicesByStatus`) filters by
  `userId` + an **arbitrary `status` query param** and **never consults `approvalStatus`** — the read-side approval gate does
  not exist yet. Divergence tracked by D1a/Phase 2; do not treat the gate as implemented.
- No separate tables; no separate approval workflows

---

## Category Mapping (historical — one-time consolidation, completed)

> **Status note (Jul 2026):** this describes the one-time migration 011–012 consolidation. Its source table
> `expert_service_categories` was **dropped by migration 013**, so this is a record of a completed migration, not an
> ongoing rule. ⚠️ Code-internal drift: `expert_service_categories` is still defined in `shared/schema.ts` and referenced
> by live server code despite being dropped — a latent bug, filed separately (not a doc issue).

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
- Service creation routes (`POST /api/provider/services`) — note `/api/expert/custom-services` and the `expert_custom_services`
  table are **dropped/dead** (migration 013); do not re-add them
- Service schema (`provider_services`; `expert_service_offerings` = read-only catalog; `expert_templates` = marketplace)
- The two offering catalogs (`expert_offering_types` / `service_offering_types`) — never merge them (see §4)
- Approval workflows (status enums, submission logic)
- Fee/commission config (`fee_bands`) — no rate literals in code (see §8)
- Service category taxonomy
- **Database migrations** (schema or data)

**Then:**
1. Update this document FIRST with the decision and rationale
2. Reference this document in your commit message
3. If you find this document conflicts with your plan, escalate to the decision-maker (user) rather than overriding

**CRITICAL: Migration Directory**
- All SQL migrations must go in `server/migrations/` (NOT `migrations/`)
- Register each migration in `server/migrations/migration-files.ts` — the **canonical registry** for both runtime and the
  chain-integrity test. `run-migrations.ts` imports this list rather than carrying its own copy (see the migration-chain
  repair note below). Registry order is authoritative; numeric filename order is not.
- Migrations are applied at server startup via `runMigrations()` (server/index.ts)
- `/migrations/` is for Drizzle-only migrations; `server/migrations/` is the active set

**CRITICAL: Drizzle push has TWO schema entry points — do not collapse to one**
- `drizzle.config.ts` `schema` is an **array**: `["./shared/schema.ts", "./shared/guest-invites-schema.ts"]`.
  Both are required. `shared/schema.ts` does **not** re-export `guest-invites-schema.ts` (that file imports *from*
  `schema.ts`, so a re-export would be circular), so its 4 tables — `event_invites`, `guest_travel_plans`,
  `invite_templates`, `invite_send_log` — are only reachable by push through the explicit second array entry.
- **Do not "simplify" this back to a single `schema: "./shared/schema.ts"`.** Those 4 tables would silently vanish from
  `drizzle-kit push`; because migration `001_guest_invite_system.sql` is bootstrap-stamped (001–050) it never re-creates
  them, so a fresh push-canonical deploy would be missing them and `server/storage.ts` guest-invite code would throw
  `relation "event_invites" does not exist`. If you add a **new** schema file with its own `pgTable`s that `schema.ts`
  doesn't re-export, add it to this array too.

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

**Migration 109 (Jul 11, 2026; registered in `migration-files.ts`) — Structural Consolidation, Phase 1d (D3a row remap + CHECK):**
remaps `delivery_method` on BOTH `provider_services` and `service_templates`: `video-call→video` (NOT
`call` — video session vs voice call is a real distinction), `in-person→in_person`, `document→pdf`
(flatten — zero prod provider_services rows; the only real rows were the two CANONICAL_TEMPLATES seed
rows; `document` is NOT in the enum), and `digital→pdf` (flatten — zero prod rows; surfaced by the
refusal guard firing on one dev row in the Replit workspace DB, exactly the guard's purpose; also NOT
in the enum). Adds the DB CHECK atomically with the remap on both tables: valid
set = the D3a canonical `deliveryMethodEnum` (`pdf, video, call, in_person, voice_notes, async_messaging,
hybrid`; NULL allowed). `hybrid` stays valid because ServiceForm offers it as a live delivery option —
a CHECK without it would break every hybrid create. Guarded: REFUSES listing any unmapped value rather than
half-applying. Companion change in the same commit: `CANONICAL_TEMPLATES` seeder literals (server/routes.ts)
`document`→`pdf` so fresh environments seed CHECK-clean. Prod distribution at approval: pdf 67 /
in_person 35 / call 2 / async_messaging 1, no NULLs. Ratified by the decision-maker's remap-table approval
+ amended-CHECK confirm (Jul 11).

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
**[SUPERSEDED by migration 109 (above):** the DB CHECK and the row remap are now applied on **both**
`provider_services` and `service_templates`; `deliveryMethodEnum` (`shared/schema.ts:523`) and the DB CHECK
both carry the same 7 canonical values. The "no DB CHECK / no remap" state described here was true only as of 108.**]**

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

**Recorded change — Coordination-fee budget wiring + interim credit (Jul 12, 2026):**
- **Bug (was live on `main`):** `GET /api/coordination-states/:id/fee` read the budget from
  `state.total_estimated_cost`, a column **no code path writes**, so every coordination fee priced against a
  **$0 budget** — the `max(floor, 8%×budget)` percent tier could never fire; every fee collapsed to the `$499`
  floor minus an optimize credit. Reconstructed exactly: `47901 = 49900 floor − 1999 wedding optimize credit`.
- **D-BUDGET (interim, ratified):** budget now persists to the **existing `budget` jsonb column** (no migration).
  Contract: `budget = { amount: <number, USD dollars>, currency: "USD" }`, written at create/patch from the
  request's `metadata.budget`; the fee reads `budget.amount × 100 → cents`; absent/`{}`/non-positive → `0` →
  **intentional** floor-only. The fee reads `budget`, **NOT** `total_estimated_cost` (that column means *cost*,
  not *budget* — no overloading). The first-class validated `budget` field is the **filed follow-up** (D-BUDGET(b)).
- **D-CREDIT (interim, ratified):** the optimize-fee credit is **no longer subtracted** in `resolveCoordinationFee`
  (`server/services/optimization-fee.service.ts`). It was applied unconditionally for all event types with **no
  paid-signal** — the payment `confirm` (`optimization.routes.ts`) records payment on
  `itinerary_comparisons`/`platform_revenue`, never linked to a coordination state (TODO there defers linkage to
  Phase 4). Crediting an unpaid fee is an unearned discount; the honest interim charges floor-or-percent with **no
  credit**. **Follow-up (filed):** record/lookup the paid optimize fee per coordination state, then credit only when paid.
- The `499_00` floor / `0.08` percent constants are **unchanged** (they were correct; only the budget input + credit gate were).
- **Known-issue (filed, NOT fixed here):** the coordination-state create/patch zod schemas accept `title` +
  `metadata` that map to **no columns** (Drizzle silently drops them) — the same "looks-stored-but-isn't" class that
  caused the $0-budget bug. And `server/__tests__/event-coordination.test.ts` is **dead** (imports uninstalled
  `vitest`; calls unimported `getFee`) — journey-7:91 is the only live test for this fee engine.
- Ratified by Leon's D-BUDGET(existing-`budget`-column) + D-CREDIT(interim) lock. Own money-fix lane.

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
