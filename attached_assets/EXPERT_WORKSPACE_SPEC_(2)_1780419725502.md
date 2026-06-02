# Traveloure — Expert Workspace Spec

**Piece 4 of 4** (Expert itinerary-building services). **Type:** internal product spec, written from code (no prior doc existed).
**Source of truth:** code @ `main` `68d588e` (2026-06-02). Refs are `file:line`.
**What this is:** the Expert Workspace is the surface where an assigned Local Expert *builds and delivers* a traveler's itinerary. It is the actual service-delivery mechanism behind "expert itinerary-building" — the thing the other three docs describe commercially (offerings), procedurally (workflow), and as an artifact (PlanCard). This one describes the tool itself.

---

## 1. Location & access

- **Route:** `/expert/workspace/:tripId` — `client/src/App.tsx:466`, gated `requiredRole="expert"`.
- **Page:** `client/src/pages/expert/workspace.tsx` (~1,189 lines).
- **Entered from:** assigned-trips, clients, and dashboard cards all link `/expert/workspace/:tripId`.
- **Access control:** every workspace endpoint resolves the caller against the **assignment** record and rejects non-assigned experts (`403`/`404`). The expert only ever sees trips they're assigned to.

---

## 2. The assignment foundation

The workspace is scoped to one **assignment**, not just a trip.

- **Table:** `trip_expert_advisors` — `shared/schema.ts:104`. Key fields: `tripId`, `localExpertId`, `status` (default `pending`), **`workspaceStatus`** (default `draft`), `message`, `expertResponse`, `assignedAt`.
- **Lookup:** `GET /api/trips/:tripId/my-assignment` (`routes.ts:17726`) — matches `tripExpertAdvisors` on `(tripId, localExpertId = current user)`.

> **Wiring gap (flag #1):** there is no visible code path that turns a routed lead (`expert_requests` + `lead-routing.service`, see the Lead Journey doc) into a `trip_expert_advisors` row. The routing engine assigns into `expert_requests`; the workspace reads from `trip_expert_advisors`. These two assignment concepts are not obviously connected — confirm how a routed expert actually lands in a workspace (manual admin step? unbuilt?). This is the single most important thing to resolve before treating the funnel→delivery handoff as complete.
>
> **DECIDED (2026-06-02):** the bridge is an **admin-confirm** step, not auto-assignment. `routeLead()` proposes the top expert and logs it; an admin reviews the routing result and **manually confirms**, and that confirmation is what writes the `trip_expert_advisors` row and opens the workspace. So the intended flow is `expert_requests` (routed) → **admin review/confirm** → `trip_expert_advisors` (assigned) → workspace. Still needs building, but the shape is settled — build the admin confirm action + the write, not an auto-insert in the routing service.

---

## 3. Status machine — the delivery lifecycle

`workspaceStatus` is a strict, **linear, forward-only** machine. Enforced server-side at `PATCH /api/expert/assignments/:id/workspace-status` (`routes.ts:17626`):

```
draft ──► in_review ──► delivered
  (no backward transitions; delivered is terminal)
```

`validTransitions = { draft: ["in_review"], in_review: ["delivered"], delivered: [] }`. Any other transition is rejected with the allowed-set in the error message.

**UI mapping** (`workspace.tsx:118`): `draft → "Draft"`, `in_review → "Expert Review"`, `delivered → "Confirmed"`. The single **Approval Bar** button advances one step: label is "Submit for Review" in draft, "Mark Delivered" in review, hidden once delivered (`workspace.tsx:144`). The client computes `next` itself (`advanceStatusMutation`, `workspace.tsx:~439`) rather than being told by the server — fine today because the machine is linear, but it'll break if a branch is ever added.

> **Flag #2 — dead mutation:** `saveMutation` PATCHes the same status endpoint with an empty body `{}` (`workspace.tsx:~452`). That request fails validation (no `workspaceStatus`) and is a silent no-op. Either remove it or point it at a real save.

> **Flag #6 — UI built for 5 stages, backend enforces 3.** The status pill renders `Step {["draft","in_review","notes","pending","delivered"].indexOf(workspaceStatus) + 1} of 5` (`workspace.tsx:641`), and the stage list (`workspace.tsx:118–122`) defines `notes` ("Expert Notes") and `pending` ("Awaiting Approval") as visual stages. But the server machine only has `draft → in_review → delivered`. So the two intermediate stages are **unreachable**, and the counter jumps **1 → 2 → 5** for every expert (draft=1/5, in_review=2/5, delivered=5/5). Either implement `notes`/`pending` as real states or collapse the display to "of 3."

---

## 4. Layout

Three zones:

1. **Header** — back-to-dashboard, masked client label + identity toggle (§8), status pills, Approval Bar.
2. **Content (left/center), `cTab`** — defaults to `itinerary`; renders the day-by-day build surface (§5).
3. **Right panel, `rightTab`** — five tabs (`workspace.tsx:847`): **⚡ AI Gaps** (default), **🔍 Browse**, **💰 Earnings**, **👥 Providers**, **🔗 Affiliates**.

> **Flag #3 — no PlanCard reuse:** the workspace renders the itinerary with **bespoke** inline components (`DayCard`, `ARow`, `TConn`), *not* the shared `components/plancard/` system that the traveler side and the PlanCard spec use. So the expert's build view and the traveler's delivered view are two separate renderers that can drift. This is the core reconciliation item between Piece 3 (PlanCard) and Piece 4.

---

## 5. Capabilities (each grounded in an endpoint)

### 5.1 Itinerary editing — the core loop
- **Read:** `GET /api/trips/:tripId/itinerary-items` → `{ days: [{ dayNumber, items: [...] }], total }`.
- **Render:** one `DayCard` per day; each item is an `ARow` (time, category, name, price, "edited" badge, "Find Alternatives" affordance).
- **Add item (manual):** `AddItemModal` → `POST /api/trips/:tripId/itinerary-items` (`workspace.tsx:236`). Per-day "Add" and "Template" buttons on each `DayCard`.
- On every add, both the itinerary and **commission** queries are invalidated so earnings update live.

### 5.2 Browse & map (right panel → Browse)
- **Map center:** `GET /api/geocode?address={destination}` (cached `staleTime: Infinity`); falls back to Tokyo coords `35.6762,139.6503` if geocode fails.
- **Live search:** `GET /api/search/experiences?q&destination&category` (debounced 400ms, `staleTime` 2min), enabled only on the Browse tab.
- **Add from result:** `addFromSearchMutation` maps the result category → item type and `POST`s to `itinerary-items` with a chosen `addToDay`. Carries `mapsUrl` into notes when present.

### 5.3 Gap detection (right panel → "AI Gaps")
- **Implemented rule:** exactly one — *evening dining gap*. `daysWithDinnerGap` flags any day that has items but no `dining`/`food` item at hour ≥ 18 (`workspace.tsx:540`). Shown as "N gaps found / Day X — no evening dining," or "All days have complete coverage."
- Flagged days also get an inline marker in the day card.

> **Flag #4 — "AI Gaps" is a misnomer:** this is a hardcoded client-side heuristic (one rule, dinner only). No model, no anchor/energy/day-boundary integration — even though those primitives now exist server-side (`temporal_anchors`, `day_boundaries`, `energy_tracking`). The label oversells it, and the rich logistics validation from the workflow doc is *not* wired into the workspace yet.

### 5.4 Expert notes (auto-save)
- **Read:** `GET /api/trips/:tripId/expert-notes`. **Write:** `PATCH /api/trips/:tripId/expert-notes` (assigned expert only, `routes.ts:17742/17759`).
- Debounced 1.5s auto-save; status cycles `idle → saving → saved`.
- **Unsaved-work guards** (three layers, all keyed on `saving`): `beforeunload` browser prompt, `popstate` back/forward intercept, and an in-app `safeNavigate` confirm. Solid; worth preserving as the pattern for any future editable field.

### 5.5 Provider booking brief
- `BookingBriefModal` opens per provider and pulls `GET /api/trips/:tripId/traveler-profile` to give the provider context (booking name + profile rows) at the moment of booking. This is the operational expression of the "via Expert" three-party model.
- Active providers for booking come from `GET /api/provider/services?status=active`.

### 5.6 Earnings / commission (right panel → Earnings)
- **Endpoint:** `GET /api/trips/:tripId/commission` (`routes.ts:17655`).
- **Formula:** `expertRate` = mean of the expert's active services' `revenueShareRate`, **fallback `DEFAULT_RATE = 0.30`** (`routes.ts:17673`). Per qualifying item: `earning = estimatedCost × rate`, `platformFee = cost − earning`. Only items with status in `["planned","confirmed","in_progress","booked"]` count. Returns `totalGross`, `expertShare`, `platformFee`, and a per-item `itemBreakdown`.

> **Flag #5 — commission default is platform-favorable, contradicting the model.** With the 0.30 fallback, the **expert receives 30%** and the platform keeps 70% — the *inverse* of the documented "75–85% expert-favorable split." The system does honor per-service `revenueShareRate`, so a correctly configured service can pay 0.75–0.85; but the hardcoded fallback is the opposite of the brand promise, and any expert without a rate set is silently underpaid. This is the same drift the Lead Journey doc flagged at checkout (flat 30%) — resolve it once, globally, before the Offerings doc (Piece 1) quotes a number.
>
> **Flag #5a — NaN hazard in the same formula.** The rate line is `parseFloat(svc.revenueShareRate ?? "0.30")`. The `??` catches only `null`/`undefined` (a null rate → `"0.30"`, fine). But an **empty-string or non-numeric** `revenueShareRate` slips past it: `parseFloat("")` → `NaN`. Critically, the `DEFAULT_RATE` fallback only applies when the expert has **zero** services (`expertServices.length > 0 ? reduce(...) : DEFAULT_RATE`), so a NaN produced *inside* the reduce is used as-is — `cost * NaN = NaN` — and the entire earnings panel renders `NaN` rather than degrading to 0.30. Trigger is narrower than null; outcome is worse (no graceful fallback). Guard with a numeric coalesce, e.g. `Number.isFinite(r) ? r : DEFAULT_RATE` per service.
>
> **DECIDED (2026-06-02):** `DEFAULT_RATE` → **0.75** (expert gets 75%, the floor of the documented 75–85% range). This is now the canonical fallback for any expert without a configured service rate. Apply the same 0.75 to the NaN coalesce in flag #5a so a malformed rate degrades to 75%, not platform-favorable 30%. Note this still needs reconciling with the flat 30% platform fee at checkout (Lead Journey doc) — those are different surfaces and should not silently disagree.

---

## 6. Traveler identity masking

The expert sees the traveler as **`Client #{last-6 of trip_id, uppercased}`** by default (`workspace.tsx:570`). An Eye/EyeOff toggle reveals the real `traveler_name` (`workspace.tsx:594`); the booking-brief modal reveals fuller profile detail on demand. Deliberate privacy-by-default — note it as policy so it isn't "fixed" by someone who reads it as a bug.

---

## 7. Endpoint reference (everything the workspace touches)

| Method | Endpoint | Purpose | Ref |
|---|---|---|---|
| GET | `/api/expert/assigned-trips` | resolve the trip | — |
| GET | `/api/trips/:tripId/my-assignment` | assignment + `workspaceStatus` | `routes.ts:17726` |
| GET | `/api/trips/:tripId/itinerary-items` | the itinerary (days→items) | — |
| POST | `/api/trips/:tripId/itinerary-items` | add item (manual / from search) | `routes.ts:10674` |
| GET | `/api/trips/:tripId/commission` | earnings breakdown | `routes.ts:17655` |
| GET / PATCH | `/api/trips/:tripId/expert-notes` | read / auto-save notes | `routes.ts:17742/17759` |
| GET | `/api/trips/:tripId/traveler-profile` | booking-brief context | — |
| GET | `/api/provider/services?status=active` | bookable providers | — |
| GET | `/api/geocode?address=` | map center (Browse) | — |
| GET | `/api/search/experiences?q&destination&category` | live search (Browse) | — |
| PATCH | `/api/expert/assignments/:id/workspace-status` | advance status | `routes.ts:17626` |

---

## 8. Open issues — prioritized

1. **Lead→workspace wiring** (flag #1): `expert_requests` (routed) vs `trip_expert_advisors` (workspace) are not visibly connected. **Highest priority** — without it the funnel doesn't reach the delivery surface.
2. **Commission fallback** (flag #5): 0.30 default inverts the expert-favorable promise. Resolve globally.
3. **Workspace ↔ PlanCard divergence** (flag #3): two itinerary renderers. Decide whether the workspace adopts `components/plancard/`.
4. **"AI Gaps" is one hardcoded rule** (flag #4): wire the shipped anchor/energy/day-boundary validation in, or rename the tab honestly.
5. **Dead `saveMutation`** (flag #2): no-op empty PATCH; remove or fix.
6. **Step counter "of 5"** (flag #6): UI built for 5 stages, backend has 3; counter jumps 1→2→5. Collapse to 3 or implement the missing states. **Quick fix.**

---

## 9. Out of scope (covered by sibling docs)

Commercial tiers/pricing → **Piece 1 (Offerings)**. End-to-end logistics validation (anchors/energy/day-boundaries) → **Piece 2 (Workflow)**. The delivered itinerary artifact and its 3 map layers → **Piece 3 (PlanCard)**. This doc stops at the build-and-deliver surface and its status lifecycle.

---

*`file:line` refs against `68d588e`. `server/routes.ts` is ~18.5k lines — re-verify line numbers after any large refactor.*
