# Workstation Flow Audit — request intake, content output, and the messages→workstation transition

**Date:** 2026-07-26 · **Method:** code-traced end to end (creation site → notification → expert
surface → workstation authorization → output), file:line verified. Companion to
`expert-sidebar-audit.md`. **Findings are the assessment; fixes need decision-maker sign-off.**

Model under audit (ratified): the Workstation is the content factory with two lanes —
**(A)** plan custom trips from requests, **(B)** build content for the Ready Made Trips store,
social media, or direct client delivery.

---

## 1. Lane A — a request coming in from a traveler

| # | Request type | Born where | Expert notified? | Reaches the Workstation? | Verdict |
|---|---|---|---|---|---|
| 1 | **Direct expert pick** — traveler assigns an expert on their trip | `POST /api/trips/:id/expert-advisor` (`booking-actions.ts:499`) → `assignExpertAdvisor` writes `expert_requests` **and** `trip_expert_advisors` in one tx | ✅ `createExpertAssignmentNotification` | ✅ Assigned Trips → Accept → workspace (assignment mode) | **INTACT** |
| 2 | **Paid / auto-routed expert request** — PlanCard escalation, variant review, concierge delivery, Partnerize assist (the §14-A1 paid rail) | `submitExpertRequest` → fire-and-forget `leadRoutingService.routeLead` → `assignExpertAdvisorToRequest` (`booking-actions.service.ts:383`) | ✅ notification sent (names the trip) | ❌ **BROKEN — the routed assignment stamps only `expert_requests.assigned_expert_id`; it never creates the `trip_expert_advisors` row.** Assigned Trips reads `trip_expert_advisors`, and workspace auth requires owner‖assigned‖author — so the trip never appears in the expert's queue and the workspace shows "Trip not found". The notification points at work the expert cannot open. A PAYING traveler's request silently dead-ends. | **P1 BREAK** |
| 3 | **Event-coordination engagement** — admin assigns coordinator (Phase 1c) | `POST /api/admin/coordination-states/:id/assign-coordinator` | ➖ no notification insert on assign | ✅ wire A (just built): Assigned Trips "Event coordination" section → workspace Event Coord tab (trip-linked) | **INTACT**, minor: assign should notify |
| 4 | **Service booking** — traveler buys the expert's listed service | checkout → `service_bookings` | ✅ (booking.service notifications) | ➖ Bookings page shows a "Trip Plan" **modal** when the booking carries a `tripId` — read-only; no handoff into the workspace even for itinerary-shaped services | **PARTIAL** (by design for fulfilled services; itinerary-type services deserve a workspace handoff) |
| 5 | **Partner/affiliate booking request** (§16 agent rail) | traveler card → `POST /api/affiliate-booking-requests` | (not traced this pass) | ✅ workspace "Partner Bookings" tab | **INTACT** |
| 6 | **Chat message** | `/chat` → `messages.service` | ✅ "New message" notification | ❌ chat carries **zero trip context** — no path from a conversation to the client's trip or the workstation | **GAP** (see §3) |

**The one hard break is #2.** The fix is small and matches the existing pattern: the routed-lead
success path should create the `trip_expert_advisors` row (status `pending`) exactly as
`assignExpertAdvisor` does for direct picks — then every request type funnels into the same
Assigned Trips inbox → Accept → workspace lifecycle, and the §14-A1 paid rail actually delivers
an expert.

## 2. Lane B — expert building content to push

| Output | Pipeline (traced) | State |
|---|---|---|
| **Ready Made Trips store** | Workstation authoring mode → listing panel (plan type, Unsplash hero, price, fee-band share) → quality-structure submit gate (no empty days) → `submitted` | ✅ Built through the admin queue's front door. **Remaining (task #158):** admin approve/reject UI, `insideCounts` snapshot at approval, and the consumer shelf with the "Trips by Locals" section |
| **Social media** | Workstation build / DMO Library item → "Create social post" → Content Studio arrives prefilled (wire B) → nugget library (repaired — CRUD proven 16/16) → Instagram publish (`/api/instagram` mounted, key-gated) | ✅ Wired. Notes: Instagram is the **only** connected channel; publish requires the key at deploy; content items themselves save via the studio's content store |
| **Customer delivery** | Assignment mode → itinerary items write to the traveler's own trip (live-shared) → suggestions rail has an approve/decline loop → `Send Edits` / `Mark Complete` advances `draft → in_review → delivered` (`booking-actions.ts:840`, transition-validated, owner-gated) | ➖ **Silent delivery:** the status handler updates the row and stops — **no traveler notification on `in_review` or `delivered`**. The expert "delivers" and the client is never told; they discover changes only by re-opening their trip. The suggestions loop, by contrast, notifies properly — delivery should match it |

## 3. The transition question — messages/requests → workstation

**Today:** notifications exist but land generically; chat knows the client but not the trip; the
workspace's Chat button navigates to bare `/chat` (it doesn't pass the `?clientId=` the chat page
already supports — verified: `chat.tsx:74` reads it, `workspace.tsx:1070` doesn't send it).
Assigned Trips → workspace is the only clean handoff.

**Recommended rule — one inbox, symmetric handoffs:**

1. **Assigned Trips IS the request inbox.** Every lane-A request type materializes there (the #2
   fix makes this true for paid requests; coordination engagements already do via wire A). The
   expert never hunts across pages for incoming work.
2. **Notifications deep-link to the inbox**, not to a generic page: assignment →
   `/expert/assigned-trips`, message → `/chat?clientId=<sender>`. (The notifications page already
   has per-type link infrastructure to extend.)
3. **Chat → Workstation:** when the conversation partner has an active assignment with this
   expert, the chat thread header shows **"Open trip workspace"** → `/expert/workspace/:tripId`.
   Client-side join: chat already knows the partner's userId, and `/api/expert/assigned-trips`
   already returns traveler identity per trip — no new endpoint needed.
4. **Workstation → Chat:** the workspace Chat button passes the current traveler
   (`/chat?clientId=<travelerId>`) so the expert lands in the right thread, not the chat lobby.
5. **Delivery closes the loop:** `workspace-status` transitions notify the traveler
   (`in_review` → "your expert sent an itinerary for review", `delivered` → "your itinerary is
   ready", deep-linked to the trip). Symmetry with the request notification that started the job.

**Proposed fix list (for sign-off):**
- **F1 (P1):** routed-lead success path creates the `trip_expert_advisors` row (pending) — the
  §14-A1 paid request finally lands in the inbox. Plus a behavioral gate: paid request → routed →
  appears in assigned-trips → accept → workspace 200.
- **F2:** traveler notifications on `in_review`/`delivered` transitions.
- **F3:** chat⇄workstation symmetric handoffs (items 3+4 above).
- **F4:** notification deep-links per type (item 2).
- **F5 (minor):** notify the expert on coordination-assignment (Phase 1c assign endpoint).
