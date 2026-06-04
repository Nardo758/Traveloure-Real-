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

**Consolidation Timeline:**
- **Phase 1+2 (DONE):** Migration 0007 copies `expert_custom_services` → `provider_services` with category mapping, preserving approval workflow as `approval_status` enum
- **Phase 3:** Build shared ServiceForm component targeting provider_services (role-aware, covers both expert and provider creation/edit)
- **Phase 4:** Apply console theme to expert pages
- **Phase 5:** Drop deprecated columns from ESO (status, submittedAt, deliverables, etc.) — they're redundant and misleading

**What Was Deprecated:**
- Commit `bfc3db2` ("Make expert_service_offerings the canonical service catalog") made ESO canonical by adding workflow columns. This contradicted the booking-FK fact. That decision is superseded by this document.
- The `runEsoBackfill()` startup migration (server/index.ts) that wrote to ESO is disabled; migration 0007 handles all backfilling to provider_services.

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

**Previous Coordination Failure (Jun 3, 2026):**
- Commit bfc3db2 made ESO canonical without accounting for booking-FK fact
- This was uncoordinated and left the transaction path orphaned
- Fixed by this architecture document + provider_services canonicality

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
