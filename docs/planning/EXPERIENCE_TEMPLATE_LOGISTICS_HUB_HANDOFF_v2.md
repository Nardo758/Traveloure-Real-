# Experience Template → Logistics Hub — Implementation Handoff (v2, post-audit)

**Revised after the Phase 0 reconciliation.** Corrects the v1 assumptions the audit disproved. Filters are *removed*, not consolidated. **Supersedes** `EXPERIENCE_TEMPLATE_CONSOLIDATION_BRIEF.md`.

**Companion:** `EXPERIENCE_TEMPLATE_CONTENT_CATEGORY_MAP.md` (per-template categories, sources, profiling signals). **Both this file and the category map must be committed to `docs/planning/`** so the agent can read them — Phase 0 found they weren't in the repo.

**Track:** parallel to the concierge go-live (guided entry point + upsell funnel; not a launch gate). **Run in the deps-installed Replit workspace** — the floor (`npm run check`, re-baseline on entry, no net-new) is not measurable in a bare container. Schema phases single-session. No `server/routes.ts` additions.

---

## The model
Split-screen: **selectable tailored content** + **live map** (`ExperienceMap`, already wired — see Phase 6). **No faceted filters, no price parameters** — the **real-time cart total** is the budget signal. Each template surfaces a **tailored category set** (per the category map) from the content network, Platform Services, and platform-owned content (Local Experts, TravelPulse). **Ground transport** (transfers/cars/local legs) lives in the **PlanCard**, not the template. **Flights and Hotels stay** — they're *anchors* (user-selected, in the cart, constrain the optimizer), not derived legs. Every **selection profiles the user**; that profile feeds the paid **Optimize** upsell.

---

## What the audit corrected (so the build doesn't repeat v1's wrong turns)
- **One tab system (config) + one filter system (DB, 2 slugs only).** The DB endpoint `/api/catalog/templates/:slug` already serves per-template tabs but has **no client consumer** — it's dormant, not missing. Phase 2 *adapts* it, doesn't build from scratch.
- **Profiling capture does not exist** (`itemSelected` never written; no selection writes any signal). Phase 7 is **greenfield**.
- **Selections fan out to 3 sinks** (client-only external cart, `/api/cart`, and curated content that bypasses the cart into a *trip*). They must be **unified** (new Phase 3) before profiling or the budget total are trustworthy.
- **Split-screen already exists** with `ExperienceMap` (not `MapControlCenter`). Phase 6 is "ensure selected content pins," not "build the map."
- **Event templates are content-starved** — the provider network is effectively a `travel`-template feature. Phase 4 is bigger than "surface dormant providers."
- **The "Transportation tab" is dead code**; live transport is the `transfers` + `flights` tabs. Remove ground transport (`transfers` + dead branch); **keep flights**.
- **Dining is fine** — Google Places is wired (`/api/venues/search`). No dining gap.
- **Hero images are all `picsum.photos` placeholders** — real per-template imagery is a separate content task.

---

## HOW TO USE
Phase order; each implementation phase ends with a grep + `tsc` gate (≤ re-baselined floor) and a commit. Schema phases single-session. Ground every change in file:line evidence. If the code contradicts this brief, surface it before building.

---

## PHASE 1 — Remove the wrong paradigm (keep anchors)
- Remove the **faceted filter layer**: generic Region-2 Filters & Sort + the DB `TemplateFiltersPanel`/facets. Selection replaces filtering. Note: price/filter state threads through `filteredServices`, the flight/hotel search components, and the sessionStorage persistence block (`:1420-1451`) — removal is wider than deleting a panel; trace all of it.
- Remove **price parameters** from the template (cart total is the budget signal).
- **Ground transport → out:** delete the dead `transportation` render branch and remove the `transfers` tab from configs (+ its filter state). It lives in the PlanCard.
- **Keep Flights and Hotels** (anchors). Ensure flight selection writes to the cart (counts toward the total) and **exports arrival/departure as temporal anchors** for the optimizer/PlanCard.
- **Loud fallback:** unconfigured slug errors/redirects/hides — never silently serves another template.

**Acceptance:** no faceted filters or price filters on any template; no transfers tab/dead transport branch; flights + hotels remain and flights feed cart + anchors; unconfigured slug fails loud.

## PHASE 2 — Single-source per-template definition (adapt the dormant DB system, single-session)
- Repurpose the existing `experience_template_tabs` schema + `/api/catalog/templates/:slug` endpoint to hold the **content-category model** (category list + order + hero fields + heroImage + locationLabel) and **wire the UI to consume it for tabs** — not just the 2-slug filter panel.
- Reseed the definition to the category-map model (replacing the filter-paradigm seed content).
- **Category→component registry** in code (`categoryType → component`), keyed by a `type` on the DB category def — the single code-side mapping.
- Retire `experienceConfigs` from the render path (full deletion in cleanup).

**Acceptance:** categories, hero fields, image, location all resolve from the DB definition via the registry; the dormant endpoint is now the live source.

## PHASE 3 — Unify the selection flow (the keystone — prereq for budget + profiling)
- Converge the three sinks onto **one selection path** that writes to the cart: external items, platform services, **and curated content** (currently bypassing the cart into a trip).
- The **cart total includes everything selected** (fix the curated-content exclusion), so the budget signal is complete.
- Selection events emit a single, consistent payload (the hook Phase 7's profiling reads).

**Acceptance:** every selection lands in one cart path; cart total reflects all selections incl. curated content; one selection-event shape.

## PHASE 4 — Content-network wiring (bring the network to the starved templates)
- Wire each category to its sources per the category map, through the content hub — and **extend the rich provider tabs to the event templates** (today they fall through to Google Places + the content hub only).
- **Surface the dormant providers:** Fever events on *all* relevant templates (not just `travel`), **SafetyWing + Stasher** (Travel Essentials, currently fully dormant), **TravelPulse** as a "Happening Now" category. (Airalo eSIM is already surfaced; Dining via Google Places is fine.)
- Content renders as **selectable cards**; selecting adds to cart (via Phase 3's path) and moves the total.

**Acceptance:** event templates pull real content per the map; dormant providers surfaced; selection flows through the unified path.

## PHASE 5 — Platform Services by type + Local Experts as content
- Pass the per-template service category (e.g. `services-wedding`) to `ServiceBrowser` — it exists in config but is never passed, so services render generically today.
- **Surface Local Experts as a selectable content category** (currently only AI-matched help/escalation, not pickable) — proprietary, strong profiling signal, direct concierge funnel.

**Acceptance:** services render broken out by template type; Local Experts appear as pickable content where the map specifies.

## PHASE 6 — Map (keep `ExperienceMap`)
- The split-screen + `ExperienceMap` already exist. Ensure **selected content pins to the map** so the user sees logistics forming as they pick. Do **not** swap to `MapControlCenter` (lateral move, adapter cost, no benefit).

**Acceptance:** selecting content reflects on the existing map.

## PHASE 7 — Profiling capture → optimizer → upsell (GREENFIELD)
- **Build the profiling capture:** the unified selection event (Phase 3) writes a preference/profile signal (per the category map's profiling-signal column) to a store the optimizer reads. None of this exists today — design the capture + store, don't assume a field to set.
- **Feed the optimizer** with the profile (the spec's implicit-profiling input).
- **Upsell CTA:** from the built plan, surface the paid AI Optimize ("your vision optimized — $X") routing through the **existing concierge gated paid path** — do not build a new charge.
- **Cleanup (separate commit):** delete the dead `experienceConfigs` layer; keep the loud fallback.

**Acceptance:** selections write a real profile signal; optimizer reads it; upsell appears and routes to the paid path; `experienceConfigs` deleted.

---

## ROLLOUT ORDER
Build the engine (P2–P3, P6) once, then seed/flip template definitions: **local-event templates first** (content-starved + simplest), **trip templates next**, **Wedding last** (service-heavy, dual-mode).

## GLOBAL "WHAT NOT TO DO"
- Don't preserve or align filters — removed. Don't surface price filters. Don't put ground transport or transfers in templates. Don't remove flights/hotels (anchors).
- Don't swap `ExperienceMap` for `MapControlCenter`. Don't build a new optimize charge — reuse the concierge gated path. Don't leave any region reading `experienceConfigs` after P2.
- Don't assume a profiling field exists (P7 is greenfield). No `server/routes.ts` additions. No regressions past the re-baselined floor.

## REFERENCES
`EXPERIENCE_TEMPLATE_CONTENT_CATEGORY_MAP.md` · `UNIFIED_PLANNING_FLOW_SPEC_v2.md` · the service taxonomy.
