# Prompt — Wire the consoles to the right routes (console-route map build-out)

**Read this entire brief before writing code. Work in strict phase order (A → B → C). Verification gate after each phase. Build against the attached `CONSOLE_ROUTE_MAP.md`.**

## Context
The codebase has 145 routes across 5 gated consoles (Public/Traveler, Expert, Provider, Admin, Executive Assistant). The map audited them; this brief makes the routing clean and the cross-console handoffs verified. **This is routing + tests only** — no schema changes, no business-logic changes.

---

## ⛔ WHAT NOT TO DO
- **Never delete a page to "consolidate" — redirect the retired path** so old links don't 404. Retire the *destination*, keep the file until parity is confirmed.
- **Do NOT bulk find-replace routes.** Each change is listed; make them individually.
- **Do NOT touch the shared-object logic** — lead routing/admin-confirm, the commission resolver, the discover orchestrator, the intelligence pipeline. This brief only rewires routes and adds tests.
- **No DB schema changes.** Run everything on dev.
- **Don't fold a route whose page still renders unique content** until that content has a home (check before redirecting — the `/spontaneous` "Live Intel" case especially).

---

## Phase A — Route hygiene (no decisions, safe)
1. `/browse` (BrowsePage) → **redirect to `/discover`** (finish the consolidation `/explore` already had).
2. `/expert/messages` and `/provider/messages` → **redirect to `/chat`** (role-scoped). Keep `:clientId` deep-links resolving.
3. Discovery cluster — `/discover-experiences`, `/deals`, `/hidden-gems`, `/spontaneous`: redirect to `/discover` with the matching tab/filter param **only if** that content already renders inside `/discover`. For any that still has unique content (verify `/spontaneous` first), leave it and report — do not silently drop it.
4. AI assistants — collapse `/ai-assistant` → `/chat` (one general surface). Keep `/expert/ai-assistant` and `/ea/ai-assistant` only if they render role-specific tools; if they're the same component, redirect them to `/chat` too. Report which you kept.

**Gate:** `npm run check` clean; every retired path issues a redirect (no 404); `grep` shows no orphaned imports for removed routes; manual click of one old deep-link per change resolves.

## Phase B — Console consolidation (propose, then execute)
These need a "keep which" call — **propose before you delete/redirect, wait for confirmation:**
1. **Expert service creation (5 → 1):** `/expert/services/new` + `/expert/service-wizard` (both `ServiceWizard`), `/expert/services/templates`, `/expert/custom-services`, `/expert/templates`. Propose the single canonical flow (likely `ServiceWizard` + the ESO catalog), then redirect the rest.
2. **Expert analytics (4 → 1):** `/expert/performance`, `/expert/revenue-optimization`, `/expert/analytics`, `/expert/leaderboard` → one analytics surface with sections/tabs; redirect the others.

**Gate:** proposal posted and approved; redirects in place; retired pages reachable via redirect; `npm run check` clean.

## Phase C — Cross-console seam verification (the "connect the consoles" proof)
Write end-to-end tests (Playwright, matching the existing suite + test accounts) for each seam in the map's cross-console table. Each test exercises the **route-to-route handoff**, not a single page:
1. **Lead pipeline:** traveler "Ask/Plan" on `/discover` or `/trip/:id` → row appears in `/admin/routing-queue` → admin confirms → `/expert/workspace/:tripId` opens for that expert.
2. **Experience build:** add item on `/trip/:id` → it appears in `/expert/workspace/:tripId` → delivered state renders on the shared PlanCard (`/trips/shared/:token`).
3. **Money:** a booking → correct split in `/admin/revenue` → reflected in `/expert/earnings` and `/provider/earnings` (and attribution links the parties).
4. **Provider supply → feed:** an approved `/provider/services` listing surfaces in `/discover` for its city.
5. **Intelligence:** a refreshed city shows in `/admin/tourism-analytics` and ranks the `/discover` feed.

**Gate:** each seam test passes against Kyoto (real data). Any red seam is a genuine broken handoff — report it, don't paper over it.

---

## Done = all true
- [ ] `/browse`, role `/messages`, redundant AI-assistant routes redirect (no 404).
- [ ] Discovery-cluster routes folded or explicitly reported as still-unique.
- [ ] Expert service-creation consolidated to one flow (approved); analytics consolidated to one surface; retired paths redirect, pages retained.
- [ ] Phase C seam tests written and green against Kyoto.
- [ ] `npm run check` clean; no orphaned imports; no schema or business-logic changes.
