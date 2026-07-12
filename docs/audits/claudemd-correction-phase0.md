# CLAUDE.md Correction Pass — PHASE 0 (READ-ONLY classification, HARD STOP)

Every factual claim in `CLAUDE.md` (206 lines) classified against live code + the locked-decisions ledger. Labels: **MATCH** (leave) · **DOC-STALE** (code correct, fix doc) · **CODE-IS-THE-BUG** (doc intent correct, code violates → annotate as known divergence, never overwrite intent) · **DECISION** (Leon's call).

**Nothing edited.** Awaiting Leon's review of the CODE-IS-THE-BUG and DECISION rows, plus the ledger items to add.

---

## A. Existing claims — delta table

| # | Claim (CLAUDE.md line) | Doc says | Code says (`file:line`) | Label | Proposed action |
|---|---|---|---|---|---|
| A1 | L14–17 | `service_bookings.serviceId`/`service_reviews.serviceId` FK → `provider_services`; canonical | Holds (FK intact; `service_id` nullable only for transport per A5) | **MATCH** | leave |
| A2 | L20 | "All service creation (expert custom, provider, **templates**) writes to `provider_services`" | Expert custom + provider → `provider_services` ✅. But **expert itinerary templates write to `expert_templates`** (separate table), not provider_services (`server/routes.ts:4361` `POST /api/expert/templates`; schema `expert_templates` at `shared/schema.ts:3829`) | **DOC-STALE** | Clarify: "templates" = the `service_templates` seed catalog; the expert-template *marketplace* is its own `expert_templates` table (ledger 10), not provider_services |
| A3 | L21 | Approval workflow `draft → submitted → approved` stored as `approval_status` on `provider_services` | Column exists (`shared/schema.ts:578`) **but defaults `"approved"` — born-approved** | **CODE-IS-THE-BUG** | Keep the storage-location claim; **add ledger 1**: offerings must be born `draft`/`submitted`, never approved. Annotate: *current code defaults `approved` (schema.ts:578) — divergence, tracked by D1a/Phase 2* |
| A4 | L22–23 | ESO (`expert_service_offerings`) is a **read-only** template catalog; not a transaction source | ESO table present (`schema.ts`, 4 refs); intent is read-only | **MATCH** (intent) | leave; reinforced by FAQ L196–200 |
| A5 | L25–29 | Transport-commerce bookings carry NULL `service_id` (migration 050) | Matches (migration `050`, `service_id` nullable) | **MATCH** | leave |
| A6 | L31–35 | Consolidation "Phase 1–5 (DONE)" (migrations 011–013, ServiceForm, theme) | Historical (011–013 exist). **But "Phase N" here = the 2024–early consolidation, a DIFFERENT numbering from the current structural-fix Phase 2/3** | **DOC-STALE** | Annotate to disambiguate from the *current* structural effort's phases (ledger 5), which are **not** done — reader collides the two |
| A7 | L37–40 | Migration 013 drops `expert_custom_services`, `expert_selected_services`, `expert_service_categories` | 013 exists + drops them (`server/migrations/013_drop_deprecated_service_tables.sql`, registered). **But `expert_service_categories` (4 refs) + `expert_custom_services` (1) still in `shared/schema.ts` AND referenced by live server code** (storage.ts, routes.ts, booking.service.ts, …) | **CODE-IS-THE-BUG** | Doc claim MATCH (013 drops). Flag separately: schema.ts + live code still reference a **dropped** table → latent runtime bug; file it (not a doc fix) |
| A8 | L39 | `runEsoBackfill()` startup migration disabled | Disabled — `server/index.ts:184` (commented "REMOVED — contradicted provider_services canonicality") | **MATCH** | leave |
| A9 | L46 | `POST /api/provider/services` writes `provider_services` | Exists `server/routes.ts:2020` | **MATCH** | leave |
| A10 | L48 | Experts create via the same route/schema as providers | From-template create goes through `storage.createProviderService`; the dead `/api/expert/custom-services` variant is deprecated. Broadly holds; ServiceForm consolidation is ledger 5 (pending) | **DECISION** | Confirm phrasing once Phase 2/3 (one-builder) lands |
| A11 | L49 | "`GET /api/expert/services` filters by userId + **approvalStatus**" | Filters by `userId` + optional **`status` query param** only — `approvalStatus` never consulted (`routes.ts:5538–5542` → `storage.getProviderServicesByStatus`) | **CODE-IS-THE-BUG** | Keep intent (read-gate on approved, ledger 1); annotate: *current handler filters an arbitrary `status` query param, not an enforced approval gate — divergence tracked by D1a* |
| A12 | L54–65 Category Mapping | Migrate `expert_service_categories` → `service_categories` by name-match | Source table **dropped by 013** (A7); this was a one-time 011–012 migration, now complete | **DOC-STALE** | Mark as historical/completed; the live section reads as an ongoing rule but its source table is gone |
| A13 | L69–76 Coordination Prevention triggers | Lists `/api/expert/custom-services`, `expert_custom_services`, `expert_service_offerings` as change-trigger surfaces | `expert_custom_services` + that route are dropped/dead (013) | **DOC-STALE** | Refresh trigger list to live surfaces (`provider_services`, `expert_templates`, `fee_bands`, the two offering catalogs); the "update doc first" rule itself is MATCH |
| A14 | L83–87 Migration Directory | "Register each migration in `run-migrations.ts` in the `MIGRATION_FILES` array" | **Canonical registry is `migration-files.ts`**; `run-migrations.ts` imports it (per L181–184 same doc, verified `migration-files.ts:334`) | **DOC-STALE** | Fix: registry is `server/migrations/migration-files.ts` (self-contradiction with L182–184) |
| A15 | L89–101 Lockfile purity | `.npmrc` + hooks + CI `lockfile-purity` gate; `replit.local` pollution | Guards present and verified this session (PR #134) | **MATCH** | leave |
| A16 | L103–123 Migrations 059/060/061 | Index + fee-band seed + offering-type seed records | Historical records; 060 cites `fee_bands`/`rate_type` (consistent with no-literals rule) | **MATCH** (records) | leave |
| A17 | L125–138 Migration 109 | Remap + CHECK (7-value canonical incl `hybrid`) on both tables | Verified applied this session: CHECK present both tables, rows normalized; `deliveryMethodEnum` = 7 (`schema.ts:523`) | **MATCH** | leave |
| A18 | L149–152 Migration 108 note | "`deliveryMethodEnum` extended with hybrid; column is varchar **with no DB CHECK**; NO row remap has run" | True *as of 108*, but **superseded by 109** (CHECK + remap now live) — reads as current, isn't | **DOC-STALE** | Annotate: superseded by migration 109 (CHECK + remap applied) |
| A19 | L154–187 Migrations 067/050/051/052 records | Historical seed/FK/chain-repair records | Consistent with code (051 registered; 052 superseded-duplicate) | **MATCH** (records) | leave |
| A20 | L191–206 FAQ | ESO read-only; approval enum change needs approval; transport NULL service_id | Consistent with A4/A5 | **MATCH** | leave; A11's read-gate bug is worth an FAQ note |

---

## B. Locked-decision ledger items MISSING from CLAUDE.md (Phase 1 = write in as intent)

| Ledger | Intent to add | Live-code status to annotate |
|---|---|---|
| **1 — Approval lifecycle (D1a)** | born `draft`/`submitted`, never approved; minimal admin approve/reject queue; recs/availability filter `approved` | 🔴 code defaults `approved` (A3); read-gate absent (A11) — divergences, not intent |
| **2 — Admin auth default-deny** | `/api/admin/*` blanket `requireAdmin`; no per-endpoint opt-in | Guard is in **open PR #141**, not yet on `main`; `POST /api/admin/fee-config` still world-writable on `main` (`admin.routes.ts:4092`) — flag as pending-fix |
| **3 — Delivery-method 7** | canonical `pdf,video,call,in_person,voice_notes,async_messaging,hybrid` | ✅ already MATCH (A17) — make it an explicit standing rule, not just a migration note |
| **4 — Two catalogs never merged** | `expert_offering_types` vs `service_offering_types`, two FKs (107), experts ≠ `service_category` | Present in 107 note (L140–152); promote to a standalone standing rule |
| **5 — One builder / selection-only signup** | `ServiceForm` is the single creation surface both roles; expert wizard retired (Phase 3); signup selection-only | 🟡 **not done** — wizard still live; Phase 2/3 pending (parked) |
| **6 — Insurance** | `has_insurance` is the sole provider insurance field; write boolean-vs-`insurance_tier` precedence before FEE-2 coexists | Present in 108 note; promote the precedence-rule requirement |
| **7 — Coordination fee** | budget wired (interim), optimize credit **payment-gated / never unearned**; logic in service; rates via config | 🔴 **live bug**: reads `state.totalEstimatedCost` (unwritten) → $0 budget → percent tier dead; credit applied unconditionally. **Blocker found:** the locked "read `metadata.budget`" is **not viable as written** — `coordination_states` has **no `metadata` column** (`shared/schema.ts`); see the coordination-fee brief. Annotate as known bug + open blocker |
| **8 — No fee/commission/margin literals** outside `fee_bands`/config | grep-gated every phase | Standing rule — add explicitly (only implied today via migration 060) |
| **9 — Routing realities** | `experts.routes.ts` imported-but-unmounted (dark) except ported endpoints; ~24 dead families; **dead routes 200-HTML not 404** | Matches this effort's findings — add as a standing "don't trust 404 as dead-route signal" rule |
| **10 — Expert-template marketplace** | storefront exists; purchase endpoint is a **ledger stub / no real checkout**; filed feature, not live; `packages` tab dead | Matches marketplace scoping verdict; add (ties to A2) |
| **12 — Auth/env** | passport serializers register in **all** environments (#133); lockfile scrub durable (#134) | #133/#134 landed; add the serializer-all-envs fact (A15 covers lockfile) |
| **13 — Known bugs (describe as bugs, NOT intent)** | trust-claims cluster: `verified \|\| true`, fabricated ratings, `90/10` literal, hardcoded cancellation copy, 2-char-neighbourhood trap | Not in doc; add as a **Known Defects** section so they're never read as intended behavior |

*(Ledger 11 — migrations push-canonical, `migration-files.ts` registry, 109 applied — is already covered by A14/A17; just fix the A14 registry contradiction.)*

---

## C. Cross-cutting flags (not CLAUDE.md claims, surfaced during the pass)

- **Code-internal drift (file, don't doc-fix):** `expert_service_categories` dropped by migration 013 yet still defined in `shared/schema.ts` and queried by live server code (A7/A12) — a latent runtime bug on any path that hits it.
- **`deliveryMethodEnum` TS vs DB:** now **consistent** — TS enum = 7 (`schema.ts:523`), DB CHECK = 7 (migration 109). The dispatch's "flag if they disagree" resolves to MATCH.
- **Coordination-fee ledger premise:** ledger 7 says "budget reads from `metadata.budget`" — but there is no `metadata` column; the interim needs an existing column (`total_estimated_cost`) or the first-class field. This is a **DECISION** the coordination-fee fix is currently blocked on (reported separately).

---

## HARD STOP

Phase 0 complete; no edits made. Phase 1 (apply) needs Leon's sign-off on: every **CODE-IS-THE-BUG** row (A3, A7, A11 — preserve intent, annotate divergence), the **DECISION** rows (A10, ledger-7 premise), and which **ledger items** to write in. On approval, Phase 1 makes only three edit types — fix DOC-STALE, write in approved ledger intent, annotate CODE-IS-THE-BUG — each traceable to a row here.
