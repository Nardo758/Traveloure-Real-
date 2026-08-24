# Build Brief — Lead → Workspace Admin-Confirm Wiring
**Target executor:** Replit Agent · **Priority:** #1 (funnel blocker) · **Against:** `main` `68d588e`
**Read this entire brief before writing any code. Proceed in strict phase order. Do not skip verification gates.**

---

## The problem (why this is the blocker)
The lead-routing engine scores experts and writes the decision to `expert_requests` + `lead_routing_logs`, but **never writes to `trip_expert_advisors`**. The Expert Workspace reads assignments **only** from `trip_expert_advisors` (`GET /api/trips/:tripId/my-assignment`). Result: a routed expert never reaches a workspace. The funnel has a hard break.

## The decision this implements
The bridge is an **admin-confirm step** (decided 2026-06-02), NOT auto-assignment. Routing *proposes*; an admin *confirms*; confirmation is what writes `trip_expert_advisors` and opens the workspace.

Target flow: `expert_requests` (routed) → **admin confirm** → `trip_expert_advisors` (assigned, `workspaceStatus='draft'`) → workspace opens.

---

## ⛔ WHAT NOT TO DO
- **Do NOT** add an auto-insert into `leadRoutingService.routeLead()`. The write must be gated behind the admin action. Auto-assignment is explicitly rejected.
- **Do NOT** touch any commission / `0.30` / `revenueShareRate` code in this task. That's a separate brief.
- **Do NOT** alter the `trip_expert_advisors` or `expert_requests` schema — both tables already have every field needed. No migration in this task. If you think you need a column, STOP and flag it instead of adding it.
- **Do NOT** change the workspace status machine (`draft → in_review → delivered`).
- **Do NOT** bulk-edit or reformat unrelated files.

---

## Phase 0 — Confirm understanding (no code)
Reply with: (a) the file/line where `expert_requests` is written by routing, (b) the file/line of `GET /api/trips/:tripId/my-assignment`, (c) the existing admin override endpoint for routing logs. Wait for confirmation before Phase 1.
*Reference anchors:* routing service `server/services/lead-routing.service.ts`; routing endpoints `server/routes.ts:17327` (`/api/leads/route`), `:17366` (admin logs), `:17386` (admin override); assignment read `server/routes.ts:17726`; tables `shared/schema.ts:104` (`trip_expert_advisors`), `:5045` (`expert_requests`).

## Phase 1 — Backend: admin confirm endpoint
Add `POST /api/admin/leads/:expertRequestId/confirm` (admin-only; mirror the auth/role guard used by the existing `/api/admin/lead-routing-logs` routes).

Behavior, in a single transaction:
1. Load the `expert_requests` row by id; 404 if missing. Read `assignedExpertId`, `tripId`. If `assignedExpertId` is null, return 400 ("no routed expert to confirm").
2. Idempotency: if a `trip_expert_advisors` row already exists for `(tripId, localExpertId=assignedExpertId)`, return it — do not insert a duplicate.
3. Insert `trip_expert_advisors`: `tripId`, `localExpertId = assignedExpertId`, `status = 'assigned'`, `workspaceStatus = 'draft'`, `assignedAt = now()`.
4. Update the `expert_requests` row `status = 'assigned'`, `assignedAt = now()`.
5. Return `{ assignment }`.

**Verification gate (run before Phase 2):**
- `npm run check` → 0 new TS errors.
- `grep -n "admin/leads/.*confirm" server/routes.ts` → 1 match.
- Confirm no insert into `trip_expert_advisors` exists anywhere inside `lead-routing.service.ts` (`grep -n "trip_expert_advisors\|tripExpertAdvisors" server/services/lead-routing.service.ts` → 0 matches).

## Phase 2 — Admin UI: Confirm action
Locate the admin view that renders `lead_routing_logs` (the override action at `server/routes.ts:17386` is wired to a button there — find that component). Add a **"Confirm assignment"** button per routed lead that calls the Phase 1 endpoint, shows success/error toast, and disables once the assignment exists.

**Verification gate:**
- `npm run check` → clean.
- `npm run dev`, open the admin routing view, confirm the button renders and fires.

## Phase 3 — End-to-end smoke
Using a seeded test expert (`{market}-{specialty}@traveloure.test` / `TestPass123!`) and a test trip with a routed `expert_requests` row:
1. As admin, click Confirm.
2. As that expert, open `/expert/workspace/:tripId`.
3. Expected: `GET /api/trips/:tripId/my-assignment` returns the new row; workspace loads with `workspaceStatus='draft'`; Approval Bar shows "Submit for Review".

Report: the confirm response payload, and a screenshot of the workspace opening for the confirmed expert.

---

## Done = all true
- [ ] `POST /api/admin/leads/:expertRequestId/confirm` exists, admin-gated, transactional, idempotent.
- [ ] Confirming writes `trip_expert_advisors` (`status='assigned'`, `workspaceStatus='draft'`) and flips `expert_requests.status='assigned'`.
- [ ] No auto-insert added to the routing service.
- [ ] No schema change, no commission change.
- [ ] `npm run check` clean; confirmed expert reaches the workspace in the Phase 3 smoke.
