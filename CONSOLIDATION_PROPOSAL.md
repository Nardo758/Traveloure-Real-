# Expert Console — Consolidation Proposal
**Follows:** EXPERT_CONSOLE_AUDIT.md  
**Date:** 2026-07-27

---

## 1. Recommended Target Architecture: One Builder, Four Output Contexts

The audit confirms the working hypothesis. The evidence:
- Jobs 1 and 2 already share a single builder (`ExpertWorkspace` / PlanCard). The Store Listings authoring mode is just the workspace with a `sourceTripId` wrapper.
- Jobs 3 and 4 are output actions on top of a built plan, not separate build surfaces.
- The Itinerary Templates path is the only divergent surface — and it is unconnected to the public store, has no clone-delivery service, and uses a JSONB model that the workspace cannot load.

**Target:** one builder (ExpertWorkspace + PlanCard), parameterized by output target:

| Output target | Context parameter | Current tile |
|---|---|---|
| Client delivery (assigned trip) | `mode: "client"`, `tripId` from assignment | Assigned Trips → Workspace |
| Store listing | `mode: "listing"`, `sourceTripId` | Store Listings (authoring) |
| Social content | `mode: "social"`, `tripId` optional (can pull from any built plan) | Content Studio → merge into here |
| Platform editorial (Job 4) | Identical to Job 2; surfaced by admin board curation, not a separate expert action | Remove as separate concept |

The DMO Library is a research input, not a builder — it stays as a picker modal (already implemented in the workspace) plus an optional standalone curation page.

---

## 2. Tile Decisions

### Keep (as-is or with minor changes)

**Assigned Trips** — Keep unchanged. Functional end-to-end. Primary entry to the build surface.

**Store Listings** — Keep, but surface the event_planner role (currently hidden). The hide is a copy decision not a functional one; if event planners can sell plans, the gate should be a business rule, not a silent tile suppression.

**DMO Library** — Keep the standalone tile as a curation surface (expert editorial review of `dmo_raw_content`). The in-workspace `DmoPickerModal` handles the research-during-build use case. Both access the same table — no duplication risk.

### Merge

**Content Studio → into Workspace as "Publish / Promote" panel**  
Content Studio's knowledge nuggets and caption/hashtag generation belong as a post-build output step attached to a finished plan, not a separate destination. The share-card image endpoint (`share-image.service.ts`) should be surfaced inside this panel. After merge, Content Studio as a standalone route becomes a redirect or is removed.

**Itinerary Templates → sunset (see §3)**

### Dead Code / Sunset

**Itinerary Templates tile** — The `expert_templates` table is a parallel model with no public storefront outlet, no clone-delivery service, and a JSONB itinerary format the workspace cannot load. It duplicates Store Listings (which does all the same things, correctly). Recommended action:
1. Provide a one-time migration path for existing approved/published templates into `ready_made_trips` (see §5 risk note).
2. Remove the Itinerary Templates tile from the launcher after migration.
3. Keep the `expert_templates` table read-only for historical purchases until `template_purchases` are all either fulfilled or refunded.

---

## 3. Smart-Landing Behavior for the Workspace Nav

Current: always opens the tile launcher.

**Recommended logic (priority order):**
1. If the expert has exactly one active assignment and no open authoring trip → open that trip's workspace directly (skip the launcher).
2. If the expert has multiple active assignments → open the launcher with Assigned Trips highlighted/first.
3. If the expert has no assignments → open the launcher (current behavior).

This is a single `useQuery` check at launcher render time — no new endpoint needed; `GET /api/expert/assigned-trips` already returns this data.

---

## 4. Single Generation Service: Content Studio × Provider Back-Office Engine

**Rule:** `share-image.service.ts` is the ONE PNG generation service. No provider back-office engine should build a parallel satori/image renderer.

**Convergence plan:**
- Content Studio (post-merge into Workspace "Publish" panel) calls `POST /api/share-images/generate` (already exists via `share-images.routes.ts`)
- Provider back-office engine, when it needs share cards, calls the same endpoint with a `mode` param indicating provider card vs. expert card layout
- Caption/text generation: one AI call wrapper — the existing Content Studio AI call becomes the platform's canonical "generate promo text" function; the provider engine imports it rather than writing its own

**What Content Studio has that provider engine would duplicate:**
- `local_knowledge_nuggets` CRUD (expert-specific concept; provider equivalent would be a "service description library" — a different table, not a duplication)
- Hashtag generation logic (client-side string manipulation — trivially shareable as a utility function)
- Caption AI prompt chain — this IS a duplication risk; should be a shared server-side service function

---

## 5. Migration / Consolidation Risk Notes

### `expert_templates` → `ready_made_trips` migration

**Risk: JSONB format mismatch.** `expert_templates.itinerary_data` uses a bespoke structure (days → activities with time/title/description/location/tips). `itinerary_items` is relational. A migration must transform each JSONB day/activity into an `itinerary_items` row and create a stub `trips` row as the `source_trip_id`.

**Risk: `template_purchases` delivery gap.** No clone service exists for template purchases (§D16). Before sunsetting, existing buyers must either receive their itinerary via a one-time clone or be refunded. Audit `template_purchases` for any `status = 'completed'` rows before migration.

**Risk: `expert_templates.approval_status` divergence.** Both models have approval gates but different column names (`approval_status` vs `status`). Any admin queue UI that surfaces both must be updated.

### Content Studio merge risk

Low. The `local_knowledge_nuggets` table and its CRUD endpoints are self-contained. Moving the UI into a workspace panel changes only the navigation entry point — no data model changes required.

### DMO Library

No migration risk. Dual access (standalone + in-workspace modal) already exists and works. The consolidation here is editorial (remove the "open new tab" friction) not structural.
