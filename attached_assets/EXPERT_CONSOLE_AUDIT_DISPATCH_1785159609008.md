# Traveloure — Expert Console Workspace Audit (Read-Only)
## Dispatch for Claude Code — Phase 0, HARD STOP before any fix

**Status:** READ-ONLY. No code, schema, or migration changes. Deliver the audit report + a consolidation proposal; await approval.
**Branch:** docs only, `audit/expert-console-workspace`.
**Context:** Clicking "Workspace" in the Expert Console lands on a 5-tile launcher (Assigned Trips / Store Listings / Itinerary Templates / DMO Library / Content Studio) instead of a working surface. The known real workspace is `/expert/workspace/:tripId` (per EXPERT_WORKSPACE_SPEC.md) — assignment-scoped, so it cannot open without a trip. We need to know what each tile actually is before deciding the fix.

**The four jobs this console must serve** (evaluate every tile against these):
1. Build a plan for an assigned client (trip-scoped).
2. Build a plan to sell in the Ready Made Trips store (listing-scoped).
3. Build content to push to social media.
4. Build content for the platform's Ready-Made Trips page.

**Working hypothesis to test (not assume):** one builder, four contexts — a single editing surface parameterized by output target, with DMO Library as a research input and Content Studio as an output action. The audit either confirms or falsifies this.

---

## AUDIT QUESTIONS — file:line citations required for every claim

### A. The launcher itself
1. What component/route renders the 5-tile screen? How does each tile route?
2. What does the "Workspace" nav item link to, and from where (dashboard, sidebar, both)?
3. Is there any "smart landing" logic (e.g., one active assignment → open it directly)? 

### B. Per-tile deep audit — for EACH of the five tiles answer:
4. Route + page component + approximate line count.
5. Backend: which endpoints does it call? Which router file are they in? **Are those routers actually mounted?** (Check against the known unmounted-router problem — `trips.routes.ts` precedent. Absence-compared-to-absence is our dominant bug class.)
6. Which tables does it read/write?
7. Is it functional end-to-end, partially wired, or a shell/dead UI? (This intersects List B dark-feature triage — cross-reference: are any of these tiles built on List A/List B endpoints in `experts.routes.ts`?)
8. Which of the four jobs does it serve, if any?

### C. Duplication analysis (the core deliverable)
9. **Store Listings vs. Itinerary Templates:** what is the data model of each? Same table, overlapping tables, or two parallel models for "a sellable itinerary artifact"? What does the Ready Made Trips store surface actually read from? If two models exist, document every field and where each is written/read.
10. **Itinerary editors:** how many distinct itinerary-building UIs exist across (a) `/expert/workspace/:tripId` (bespoke DayCard/ARow — known Flag #3), (b) Store Listings builder, (c) Itinerary Templates builder, (d) anything in Content Studio? List each renderer and its component tree root. Any shared components at all? Any use of `components/plancard/`?
11. **Content Studio:** what does it generate today (formats, data sources, storage)? Does any asset/caption/share-link generation exist in it? **Explicitly map overlap against the Provider Back-Office Engine dispatch (PROVIDER_BACKOFFICE_ENGINE_DISPATCH.md, section 3 Tier-1 generator)** — these must converge on ONE generation service; document what Content Studio has that the provider engine would duplicate and vice versa.
12. **DMO Library:** what is it (data source, tables, market scope)? Is its content reachable from inside the trip workspace's Browse tab, or is it an isolated silo requiring the expert to leave the build surface?
13. Duplicate DATA check: are there any fields/records entered in two places (e.g., itinerary content in both a template and a listing; expert profile/promo content in both Content Studio and the expert business profile)? Cite.

### D. Workflow gaps
14. From the launcher, can an expert complete each of the four jobs end-to-end today? For each job: trace the click path, note where it breaks, dead-ends, or requires re-entering data.
15. Does "publish to Ready Made Trips store" have an approval gate consistent with draft→submitted→approved? Or can a listing go public unreviewed? (Do not test by writing — read the code path only.)
16. How does a store listing purchase connect back to the workspace/delivery flow, if at all?

---

## DELIVERABLES
1. `EXPERT_CONSOLE_AUDIT.md` — findings per question, file:line cited.
2. `CONSOLIDATION_PROPOSAL.md` — recommended target architecture answering:
   - One builder with output-target contexts vs. justified separate tools (state which and why, from evidence).
   - Which tiles merge, which remain, which are dead code to delete (with List A/B cross-references).
   - Smart-landing behavior for the Workspace nav.
   - The single-generation-service plan for Content Studio × Provider Back-Office Engine convergence.
   - Migration/consolidation risk notes for any duplicate data models found.
3. `FOLLOWUPS.md` — out-of-scope discoveries.

## WHAT NOT TO DO
- No writes of any kind — audit only. Never confirm a write vulnerability with a successful write.
- Do NOT propose building a new itinerary editor; consolidation must move TOWARD shared components (PlanCard reconciliation is the existing direction, Flag #3).
- Do NOT scope the social-content generation build here — that belongs to the Provider Back-Office Engine lane; this audit only maps the overlap.
- Do NOT touch or re-triage List A/B beyond cross-referencing which tiles depend on them.
- Do NOT treat "renders correctly" as functional — trace endpoint mount + table existence for every capability claimed.
- Do NOT absorb discovered issues into fixes — log to FOLLOWUPS.md.
