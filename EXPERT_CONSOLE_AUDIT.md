# Expert Console Workspace Audit
**Dispatch:** EXPERT_CONSOLE_AUDIT_DISPATCH_1785159609008.md  
**Status:** Read-only findings. No code, schema, or migration changes made.  
**Date:** 2026-07-27

---

## A. The Launcher

### A1. Component / Route / Tile Links

**Component:** `ExpertWorkspace` in `client/src/pages/expert/workspace.tsx`  
**Route:** `/expert/workspace` registered at `client/src/App.tsx:618`

When `tripId` is absent from the URL the component falls into the launcher branch (workspace.tsx ~line 744):

```
{ title: "Assigned Trips",      href: "/expert/assigned-trips" }
{ title: "Store Listings",      href: "/expert/ready-made"      }   ← hidden when isEventPlanner
{ title: "Itinerary Templates", href: "/expert/templates"        }
{ title: "DMO Library",         href: "/expert/dmo-library"      }
{ title: "Content Studio",      href: "/expert/content-studio"   }
```

Each tile is a plain `<button onClick={() => setLocation(href)}>` — no prefetch, no auth check at render time.

### A2. "Workspace" Nav Item

`ExpertSidebar` (`client/src/components/expert/expert-sidebar.tsx:51`) links directly to `/expert/workspace` — same entry from both dashboard and sidebar; no difference between the two surfaces.

### A3. Smart-Landing Logic

**None.** `workspace.tsx` checks only `tripId` from the URL. If absent, the tile launcher renders unconditionally. There is no "if the expert has exactly one active assignment, open it directly" path.

---

## B. Per-Tile Deep Audit

### B1. Assigned Trips

| Property | Value |
|---|---|
| Route | `/expert/assigned-trips` |
| Component | `client/src/pages/expert/assigned-trips.tsx` (~544 lines) |
| Primary endpoint | `GET /api/expert/assigned-trips` |
| Router file | `server/routes/experts.routes.ts:498` |
| Mounted? | ✅ `app.use(expertsRoutes)` → `server/routes.ts:659` |
| Tables | `trip_expert_advisors`, `trips`, `users`, `trip_suggestions` |
| Status | **Functional end-to-end** |

The page lists all assignments, provides a chat surface, and links each assignment into `/expert/workspace/:tripId`. This is the only tile that opens the actual PlanCard build surface.

**Job coverage:** Job 1 (build plan for assigned client). ✅

---

### B2. Store Listings

| Property | Value |
|---|---|
| Route | `/expert/ready-made` |
| Component | `client/src/pages/expert/ready-made.tsx` (~180 lines) |
| Primary endpoint | `GET /api/expert/ready-made/mine` |
| Router file | `server/routes/ready-made.routes.ts` |
| Mounted? | ✅ `app.use(readyMadeRoutes)` → `server/routes.ts:610` |
| Tables | `ready_made_trips`, `ready_made_purchases` |
| Status | **Functional (List B — seller side)** |

The `ready_made_trips` row holds a `sourceTripId` FK into `trips`. Authoring launches `ExpertWorkspace` in authoring mode (`workspace.tsx:355`), which creates a real trip and then wraps it as a listing. Publishing goes through the `draft → submitted → approved` gate at `server/routes/ready-made.routes.ts:313`.

The tile is **hidden for `isEventPlanner`** role (workspace.tsx launcher block).

**Job coverage:** Job 2 (build plan to sell in store). ✅  
**Job 4 ambiguity:** See §D14 — the "platform editorial" angle is not a separate path.

---

### B3. Itinerary Templates

| Property | Value |
|---|---|
| Route | `/expert/templates` |
| Component | `client/src/pages/expert/templates.tsx` (~781 lines) |
| Primary endpoint | `GET /api/expert/templates` |
| Router file | Inline handler in `server/routes.ts:2962` (not a separate router file) |
| Mounted? | ✅ Inline — always mounted |
| Tables | `expert_templates`, `template_purchases`, `template_reviews` |
| Status | **Functional (List A — legacy system)** |

The `expert_templates` table stores itinerary content as self-contained JSONB (`itinerary_data` column — see §C9 for schema comparison). It has its own parallel `approvalStatus` ('draft'|'submitted'|'approved'|'rejected') and its own earnings/purchase ledger (`template_purchases`). It does **not** use `PlanCard` — `templates.tsx` renders a bespoke form.

**Job coverage:** Partial overlap with Job 2 and Job 4 — see §C9 for the duplication problem.

---

### B4. DMO Library

| Property | Value |
|---|---|
| Route | `/expert/dmo-library` |
| Component | `client/src/pages/expert/dmo-library.tsx` (~368 lines) |
| Primary endpoint | `GET /api/expert-workspace/library` |
| Router file | `server/routes/expert-workspace.routes.ts:109` |
| Mounted? | ✅ `app.use("/api/expert-workspace", expertWorkspaceRoutes)` → `server/routes.ts:575` |
| Tables | `dmo_raw_content` (schema.ts:6478), `expert_dmo_collections` (schema.ts:6553) |
| Status | **Functional as a standalone research tool** |

`dmo_raw_content` holds rich attraction/venue records with three JSONB layers: `rawData` (source payload), `extractedData` (AI-extracted fields), `normalizedData` (Traveloure schema).

**Dual access — NOT a silo:** DMO content is also reachable from inside the workspace via `DmoPickerModal` at `workspace.tsx:815`. The standalone `/expert/dmo-library` tile and the in-workspace picker query the same table. An expert does not have to leave the build surface to access DMO content.

**Job coverage:** Research input for all four jobs — not a job-completing surface itself.

---

### B5. Content Studio

| Property | Value |
|---|---|
| Route | `/expert/content-studio` |
| Component | `client/src/pages/expert/content-studio.tsx` (~1,170 lines) |
| Primary endpoints | `GET/POST/PATCH/DELETE /api/expert/knowledge-nuggets` |
| Router file | `server/routes/expert-console.routes.ts:369` |
| Mounted? | ✅ `app.use(expertConsoleRoutes)` → `server/routes.ts:613` |
| Tables | `local_knowledge_nuggets` |
| Status | **Partially wired** |

**What it generates today:**
- Hashtag sets (client-side, content-studio.tsx:1126)
- Captions (text, saved as knowledge nuggets)
- "Knowledge Nuggets" — reusable local expert content snippets, CRUD to `local_knowledge_nuggets`

**What it does NOT do today:**
- No direct social media posting
- Share-image PNG generation (`share-image.service.ts` via satori) exists server-side, served via `server/routes/share-images.routes.ts` (mounted at routes.ts:637), but Content Studio UI does not have a direct "Generate share card" flow — the image endpoint is surfaced elsewhere (share links)

**Job coverage:** Job 3 (social media content) — partial. Can create captions/hashtags; cannot post to social channels; share card image generation is disconnected from this UI.

---

## C. Duplication Analysis

### C9. Store Listings vs. Itinerary Templates — Two Parallel Models

These are **two completely separate models** for "a sellable itinerary artifact":

| Dimension | `expert_templates` | `ready_made_trips` |
|---|---|---|
| Schema location | schema.ts:3954 | schema.ts:6834 |
| Itinerary storage | JSONB column `itinerary_data` (self-contained, bespoke structure) | FK `source_trip_id` → `trips` table; itinerary lives in `itinerary_items` (relational) |
| Builder UI | Bespoke form in `templates.tsx` | `ExpertWorkspace` (PlanCard) in authoring mode |
| Approval workflow | `approval_status`: draft→submitted→approved→rejected | `status`: draft→submitted→approved→rejected |
| Purchase table | `template_purchases` (born `pending_payment`) | `ready_made_purchases` (born `paid`, Stripe idempotency key) |
| Post-purchase delivery | Unclear — no clone service found (see §D16) | `fulfillReadyMadePurchase` clones `itinerary_items` into new traveler trip |
| Store page reads from | Not surfaced on the public Ready Made Trips page | `ready_made_trips` — `ready-made-detail.tsx`, `ReadyMadeListingPanel` |
| Editorial curation | None | `boards` / `board_items` tables |

**What the Ready Made Trips store page reads from:** `ready_made_trips` exclusively. `expert_templates` records are **not surfaced on the public store page** — making the Itinerary Templates tile a parallel system with no current public storefront outlet.

---

### C10. Itinerary Editors — Full Map

| Surface | Component root | Data model | Uses PlanCard? |
|---|---|---|---|
| `/expert/workspace/:tripId` (client trip) | `ExpertWorkspace` — `workspace.tsx` | `itinerary_items` table (relational) | ✅ Yes — `client/src/components/plancard/PlanCard.tsx` |
| `/expert/ready-made` authoring mode | `ExpertWorkspace` — `workspace.tsx:355` (authoring flag) | `itinerary_items` via the same workspace endpoints | ✅ Yes — same PlanCard tree |
| `/expert/templates` | Bespoke form in `templates.tsx` | `expert_templates.itinerary_data` JSONB | ❌ No — separate form/renderer |
| `/expert/content-studio` | `content-studio.tsx` | None — no itinerary editing | ❌ N/A |

**PlanCard component tree** (`client/src/components/plancard/`):  
`PlanCard.tsx`, `ActivitiesSection.tsx`, `HeroSection.tsx`, `DaySelector.tsx`, `MetricStrip.tsx`, `PlanCardHeader.tsx`, `SectionTabs.tsx`, `ChangeLogPanel.tsx`, `ConciergeModule.tsx`, `MapControlCenter.tsx`, `EscalationCTA.tsx`, `PlanCardUpsellSlot.tsx`, `StatsRow.tsx`, `TransportSection.tsx`, `plancard-types.tsx`

**Summary:** Two editors exist. The workspace/store-listing path uses PlanCard (the direction of travel per Flag #3). The templates path uses a completely separate bespoke form with no shared components.

---

### C11. Content Studio × Provider Back-Office Engine Overlap

**Content Studio today:**
- Text generation: captions, hashtags (client-side or via AI call)
- Storage: `local_knowledge_nuggets` table
- Image generation: `share-image.service.ts` (PNG via satori) — server-side, NOT directly surfaced in Content Studio UI; surfaced via share-links flow

**`share-image.service.ts` (server/services/share-image.service.ts):**  
Pure data-in → PNG-buffer-out renderer. Receives plain objects from `share-images.routes.ts` (mounted routes.ts:637). No React runtime — satori element tree → SVG → Resvg → Buffer.

**Overlap zone with a Provider Back-Office generation tier:**
- Caption/description generation logic — any provider back-office tier that generates promotional text would duplicate what Content Studio's AI call does
- Share-card image generation — `share-image.service.ts` is the single server-side renderer; a provider engine should call this service rather than build a parallel one
- Knowledge nuggets as a reusable content atom — providers may need an equivalent "content library" concept

**Convergence requirement:** The share-image render pipeline (`share-image.service.ts`) must remain the ONE generation service. Any provider back-office engine that needs PNG cards should pass objects to it, not build a new satori/image renderer.

---

### C12. DMO Library

**Tables:** `dmo_raw_content` (schema.ts:6478) + `expert_dmo_collections` (schema.ts:6553)  
**Scope:** Attraction/venue data per city (launched Kyoto-only). Rich: `rawData`, `extractedData`, `normalizedData`, `embeddingVector`, `aiSummary`, `aiSuggestedTags`.

**Dual access — NOT a silo:**
- Standalone tile → `/expert/dmo-library` (full browse/edit UI)
- In-workspace → `DmoPickerModal` at `workspace.tsx:815` (search-and-insert into itinerary)

An expert can use DMO content without leaving the build surface. The standalone tile adds edit/curation capabilities (`expert_dmo_collections`, editorial review states).

---

### C13. Duplicate Data Check

**Confirmed duplicate:** Itinerary content is stored in two incompatible models depending on creation path:
- Via `expert_templates` → `itinerary_data` JSONB (bespoke schema: days→activities with time/title/description/location/tips)
- Via `ready_made_trips` → `itinerary_items` table rows (relational, the canonical workspace model)

An expert who creates a listing via Itinerary Templates produces JSONB that cannot be loaded into the PlanCard workspace without a migration/transform. An expert who creates via Store Listings produces relational `itinerary_items`.

No other confirmed field-level duplication found across the remaining tiles.

---

## D. Workflow Gaps

### D14. Four-Job Completion Traces

**Job 1 — Build a plan for an assigned client**  
Launcher → Assigned Trips → select assignment → `/expert/workspace/:tripId` → PlanCard builder  
**Result: Complete end-to-end. ✅**

**Job 2 — Build a plan to sell in the Ready Made Trips store**  
Launcher → Store Listings → create listing → ExpertWorkspace (authoring mode) → PlanCard build → submit for approval  
**Result: Complete end-to-end. ✅** (Hidden for event_planner role.)

**Job 3 — Build content to push to social media**  
Launcher → Content Studio → generate captions/hashtags → save to knowledge nuggets  
**Dead-end:** No social posting action. Share-card image generation (`share-image.service.ts`) is not surfaced within Content Studio — the expert cannot generate a PNG card here. No connection to any social platform API.  
**Result: Partial — text authoring only. ⚠️**

**Job 4 — Build content for the platform's Ready-Made Trips page**  
**No distinct path exists.** The platform's editorial Ready-Made Trips page is curated via `boards`/`board_items` (admin-side). From the expert perspective, Job 4 is indistinguishable from Job 2 — an expert submits a listing, and if approved it may appear on the editorial board. There is no separate "contribute to platform page" tile or flow.  
**Result: No dedicated path; conflated with Job 2. ⚠️**

---

### D15. Ready Made Trips Publish Gate

`ready_made_trips.status` CHECK: `draft | submitted | approved | rejected`  
Submit route: `server/routes/ready-made.routes.ts:313`

A listing cannot go public unreviewed. `purchasable` state requires `status = 'approved' AND active = true`. Admin reviews via the admin queue.

For `expert_templates`: identical gate — `approval_status` CHECK: `draft | submitted | approved | rejected` (schema.ts:3954). A template is purchasable only when `approved AND isPublished = true`.

**Both models have an approval gate before going public. ✅**

---

### D16. Store Listing Purchase → Workspace/Delivery

**`ready_made_trips` path:**  
Purchase → `ready_made_purchases` row (born `paid`) → `fulfillReadyMadePurchase` (`server/services/ready-made-purchase.service.ts:40`) clones `sourceTripId` + `itinerary_items` into a new traveler `trips` row. Buyer lands in a real trip with the full itinerary. **Fully connected. ✅**

**`expert_templates` path:**  
Purchase → `template_purchases` row (born `pending_payment` → `completed`). No clone service was found. The `itinerary_data` JSONB is not materialized into a traveler trip. **Delivery mechanism missing or not found. ❌**
