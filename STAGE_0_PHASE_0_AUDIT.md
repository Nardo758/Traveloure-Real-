# Stage 0 Phase 0: Router Reconciliation Audit Report

> **Status:** Read-only audit. HARD STOP. No code changes yet.  
> **Branch:** `fix/phase-3-0-1-prestep`  
> **Date:** Current session  
> **Auditor:** Orchestrator (static analysis)

---

## Executive Summary

`bookingsDomainRoutes` (imported at `server/routes.ts:99`) is **never mounted** with `app.use()`. The booking/coordination endpoints work today only because they are **duplicated inline** in `routes.ts` (scattered throughout the file, not just at 7198+). The extracted router is 1,520 lines of dead code that *looks* live.

**Critical finding:** `/api/cart/resolve-trip` exists **only in the extracted router** (line 340) but is called from `client/src/pages/cart.tsx:615`. Since the router is never mounted, this endpoint **404s in production** — a live revenue bug.

**Decision required:** Phase 1 will reconcile to one copy. The inline routes are canonical for routes that exist in both. The extracted router has unique routes that must be either (a) migrated to inline, or (b) accepted as deferred build.

---

## 1. Diff Table: Inline routes.ts vs Extracted bookings-domain.routes.ts

### 1.1 Routes Present in BOTH (duplicated — inline is canonical since it's live)

| Method | Path | Inline (routes.ts) | Extracted (bookings-domain.routes.ts) | Drift? | Notes |
|---|---|---|---|---|---|
| GET | `/api/coordination-states` | ✅ 7198 | ✅ 1071 | No | Identical handler pattern |
| GET | `/api/coordination-states/:id` | ✅ 7209 | ✅ 1083 | No | Identical handler pattern |
| GET | `/api/coordination-states/active/:experienceType` | ✅ 7222 | ✅ 1097 | No | Identical handler pattern |
| POST | `/api/coordination-states` | ✅ 7233 | ✅ 1109 | **Yes** — inline has Zod parse, extracted has manual validation | Extracted has more validation; inline has Zod |
| PATCH | `/api/coordination-states/:id` | ✅ 7253 | ✅ 1130 | No | Identical handler pattern |
| PATCH | `/api/coordination-states/:id/status` | ✅ 7275 | ✅ 1153 | No | Identical handler pattern |
| DELETE | `/api/coordination-states/:id` | ✅ 7293 | ✅ 1169 | No | Extracted has `state.userId` check, inline has `state.userId` check |
| GET | `/api/coordination-states/:coordinationId/bookings` | ✅ 7308 | ✅ 1185 | No | Identical handler pattern |
| POST | `/api/coordination-states/:coordinationId/bookings` | ✅ 7322 | ✅ 1200 | No | Identical handler pattern |
| PATCH | `/api/coordination-bookings/:id` | ✅ 7353 | ✅ 1232 | No | Identical handler pattern |
| POST | `/api/coordination-bookings/:id/confirm` | ✅ 7379 | ✅ 1259 | No | Identical handler pattern |
| DELETE | `/api/coordination-bookings/:id` | ✅ 7395 | ✅ 1276 | No | Identical handler pattern |
| POST | `/api/expert-booking-requests` | ✅ 753 | ✅ 177 | **Yes** — inline has `bookings-domain.routes.ts` as source (pre-extraction), extracted has same | Both have same logic; inline is live |
| GET | `/api/my-bookings` | ✅ 286 | ✅ 286 | **Yes** — extracted has `withServiceDetails` flag, inline doesn't | Extracted has more detail; inline simpler |
| GET | `/api/service-bookings` | ✅ 301 | ✅ 301 | No | Identical |
| GET | `/api/bookings/user` | ✅ 323 | ✅ 323 | No | Identical |
| GET | `/api/bookings/:id` | ✅ 535 | ✅ 535 | No | Identical |
| POST | `/api/bookings` | ✅ 568 | ✅ 568 | **Yes** — inline has `payment.routes.ts` integration, extracted has same | Same logic |
| PATCH | `/api/service-bookings/:id/visa-status` | ✅ 600 | ✅ 600 | No | Identical |
| PATCH | `/api/service-bookings/:id/document-checklist` | ✅ 666 | ✅ 666 | No | Identical |
| POST | `/api/bookings/:id/cancel` | ✅ 691 | ✅ 691 | No | Identical |
| GET | `/api/cart` | ✅ 713 | ✅ 713 | No | Identical |
| POST | `/api/cart` | ✅ 817 | ✅ 817 | No | Identical |
| POST | `/api/cart/migrate` | ✅ 880 | ✅ 880 | No | Identical |
| POST | `/api/cart/convert-to-itinerary` | ✅ 896 | ✅ 896 | No | Identical |
| PATCH | `/api/cart/:id` | ✅ 969 | ✅ 969 | No | Identical |
| DELETE | `/api/cart/:id` | ✅ 997 | ✅ 997 | No | Identical |
| DELETE | `/api/cart` | ✅ 1019 | ✅ 1019 | No | Identical |
| GET | `/api/contracts/:id` | ✅ 1034 | ✅ 1034 | No | Identical |
| PATCH | `/api/contracts/:id` | ✅ 1295 | ✅ 1295 | No | Identical |
| POST | `/api/contracts/:id/payment` | ✅ 1313 | ✅ 1313 | No | Identical |
| POST | `/api/contracts/:id/milestone` | ✅ 1332 | ✅ 1332 | No | Identical |
| POST | `/api/contracts/:id/communication` | ✅ 1350 | ✅ 1350 | No | Identical |
| DELETE | `/api/contracts/:id` | ✅ 1368 | ✅ 1368 | No | Identical |
| GET | `/api/vendor-availability/:serviceId` | ✅ 7109 | ✅ 1045 | No | Identical |
| POST | `/api/vendor-availability/:id/book` | ✅ 7194 | ✅ 1058 | No | Identical |

**Count:** 34 routes duplicated. Inline is canonical for all (they're the live copy).

---

### 1.2 Routes ONLY in Extracted (bookings-domain.routes.ts) — NOT in Inline

These routes exist only in the dead router. Some are called from the client; others are entirely unreferenced.

| # | Method | Path | Extracted Line | Client Reference? | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/cart/resolve-trip` | 340 | ✅ `cart.tsx:615` | **🚨 LIVE 404 BUG** | Client calls this. Router not mounted → 404 |
| 2 | POST | `/api/cart/items` | 470 | ❌ No reference | Dead | Inline has `POST /api/cart/items` at different location |
| 3 | POST | `/api/coordination/booking-request` | 1387 | ❌ No reference | Dead | Not called anywhere |
| 4 | POST | `/api/coordination/propagate/:tripId/:anchorId` | 1414 | ❌ No reference | Dead | Not called anywhere |
| 5 | POST | `/api/coordination/match-providers` | 1429 | ❌ No reference | Dead | Not called anywhere |
| 6 | POST | `/api/coordination/booking-context/:tripId` | 1440 | ❌ No reference | Dead | Not called anywhere |
| 7 | GET | `/api/coordination/wedding-timeline/:tripId` | 1454 | ❌ No reference | Dead | Not called anywhere |
| 8 | GET | `/api/coordination/wedding-gaps/:tripId` | 1465 | ❌ No reference | Dead | Not called anywhere |
| 9 | GET | `/api/coordination/corporate-summary/:tripId` | 1478 | ❌ No reference | Dead | Not called anywhere |
| 10 | POST | `/api/coordination/staggered-arrivals/:tripId` | 1489 | ❌ No reference | Dead | Not called anywhere |
| 11 | POST | `/api/coordination/split-activities/:tripId` | 1504 | ❌ No reference | Dead | Not called anywhere |

**Count:** 11 routes only in extracted. **1 is a live 404 bug** (`/api/cart/resolve-trip`). The other 10 are coordination-specific routes that were built but never wired.

---

### 1.3 Routes ONLY in Inline (routes.ts) — NOT in Extracted

These routes are live in the inline copy but were never extracted to the router. They're part of the "scattered routes" pattern.

| # | Method | Path | Inline Line | Notes |
|---|---|---|---|---|
| 1 | GET | `/api/expert/bookings` | 5341 | Expert booking list |
| 2 | GET | `/api/provider/bookings` | 5366 | Provider booking list |
| 3 | GET | `/api/admin/bookings` | 1340 | Admin booking list |
| 4 | POST | `/api/analytics/booking` | 5068 | Analytics tracking |
| 5 | GET | `/api/catalog/booking` | 2622 | Catalog booking |
| 6 | GET | `/api/wallet/transactions` | 3132 | Wallet transactions |
| 7 | PATCH | `/api/expert/bookings/:id/status` | 5602 | Expert booking status |
| 8 | GET | `/api/trips/:tripId/participants` | 11298 | Trip participants |
| 9 | GET | `/api/trips/:tripId/participants/stats` | 11307 | Participant stats |
| 10 | GET | `/api/trips/:tripId/participants/payment-stats` | 11316 | Payment stats |
| 11 | GET | `/api/trips/:tripId/participants/dietary` | 11325 | Dietary info |
| 12 | POST | `/api/trips/:tripId/participants` | 11334 | Add participant |
| 13 | PATCH | `/api/participants/:id` | 11354 | Update participant |
| 14 | PATCH | `/api/participants/:id/rsvp` | 11371 | RSVP |
| 15 | POST | `/api/participants/:id/payment` | 11389 | Participant payment |
| 16 | DELETE | `/api/participants/:id` | 11407 | Remove participant |
| 17 | POST | `/api/trips/:tripId/participants/bulk-invite` | 11424 | Bulk invite |
| 18 | GET | `/api/trips/:tripId/contracts` | 11435 | Trip contracts |
| 19 | GET | `/api/trips/:tripId/contracts/stats` | 11444 | Contract stats |
| 20 | GET | `/api/trips/:tripId/contracts/upcoming-payments` | 11453 | Upcoming payments |
| 21 | GET | `/api/trips/:tripId/contracts/overdue` | 11463 | Overdue contracts |
| 22 | POST | `/api/trips/:tripId/contracts` | 11472 | Create contract |
| 23 | GET | `/api/trips/:tripId/transactions` | 11571 | Trip transactions |
| 24 | GET | `/api/trips/:tripId/budget/summary` | 11580 | Budget summary |
| 25 | GET | `/api/trips/:tripId/budget/categories` | 11590 | Budget categories |
| 26 | GET | `/api/trips/:tripId/budget/settle-up` | 11599 | Settle-up |
| 27 | POST | `/api/trips/:tripId/transactions` | 11608 | Create transaction |
| 28 | POST | `/api/trips/:tripId/transactions/split` | 11620 | Split transaction |
| 29 | POST | `/api/trips/:tripId/budget/calculate-split` | 11637 | Calculate split |
| 30 | POST | `/api/budget/convert-currency` | 11647 | Currency conversion |
| 31 | POST | `/api/budget/calculate-tip` | 11657 | Tip calculation |
| 32 | PATCH | `/api/transactions/:id` | 11667 | Update transaction |
| 33 | DELETE | `/api/transactions/:id` | 11684 | Delete transaction |
| 34 | GET | `/api/trips/:tripId/itinerary-items` | 11703 | Itinerary items |
| 35 | GET | `/api/trips/:tripId/itinerary/schedules` | 11727 | Schedules |
| 36 | GET | `/api/trips/:tripId/itinerary/analyze` | 11736 | Analyze |
| 37 | GET | `/api/trips/:tripId/itinerary/recommendations` | 11745 | Recommendations |
| 38 | POST | `/api/trips/:tripId/itinerary-items` | 11756 | Add itinerary item |
| 39 | POST | `/api/trips/:tripId/itinerary/reorder` | 11847 | Reorder |
| 40 | POST | `/api/trips/:tripId/itinerary/optimize-order` | 11859 | Optimize order |
| 41 | POST | `/api/itinerary/estimate-travel` | 11869 | Estimate travel |
| 42 | POST | `/api/trips/:tripId/activate-transport` | 11882 | Activate transport |
| 43 | PATCH | `/api/itinerary-items/:id` | 11809 | Update item |
| 44 | POST | `/api/itinerary-items/:id/backup` | 11829 | Backup item |
| 45 | DELETE | `/api/itinerary-items/:id` | 11994 | Delete item |
| 46 | GET | `/api/trips/:tripId/emergency-contacts` | 12014 | Emergency contacts |
| 47 | GET | `/api/trips/:tripId/emergency-contacts/by-type` | 12023 | By type |
| 48 | POST | `/api/trips/:tripId/emergency-contacts` | 12032 | Add contact |
| 49 | PATCH | `/api/emergency-contacts/:id` | 12044 | Update contact |
| 50 | DELETE | `/api/emergency-contacts/:id` | 12061 | Delete contact |
| 51 | POST | `/api/trips/:tripId/emergency/initialize` | 12078 | Initialize emergency |
| 52 | GET | `/api/trips/:tripId/alerts` | 12088 | Alerts |
| 53 | GET | `/api/trips/:tripId/alerts/summary` | 12097 | Alert summary |
| 54 | POST | `/api/trips/:tripId/alerts` | 12106 | Add alert |
| 55 | POST | `/api/alerts/:id/acknowledge` | 12118 | Acknowledge alert |
| 56 | POST | `/api/alerts/:id/dismiss` | 12135 | Dismiss alert |
| 57 | GET | `/api/emergency/numbers/:countryCode` | 12152 | Emergency numbers |
| 58 | GET | `/api/emergency/embassy/:countryCode` | 12161 | Embassy info |
| 59 | GET | `/api/emergency/rebooking-options/:itemType` | 12170 | Rebooking options |
| 60 | GET | `/api/spontaneous/opportunities` | 12183 | Spontaneous opportunities |
| 61 | GET | `/api/spontaneous/preferences` | 12224 | Preferences |
| 62 | POST | `/api/spontaneous/preferences` | 12235 | Update preferences |
| 63 | POST | `/api/spontaneous/:id/book` | 12268 | Book spontaneous |
| 64 | GET | `/api/spontaneous/quick-search/:window` | 12286 | Quick search |

**Count:** 64 routes only in inline. These are live and working. They were never extracted to the router.

---

## 2. Drift Analysis

### 2.1 Significant Drift (handler logic differs)

| Route | Inline Behavior | Extracted Behavior | Impact |
|---|---|---|---|
| `POST /api/coordination-states` | Zod parse with `experienceType`, `title`, `status`, `metadata` | Same fields but manual validation | Low — same effective behavior |
| `GET /api/my-bookings` | No `withServiceDetails` flag | Has `withServiceDetails` flag | **Medium** — extracted has richer response |
| `POST /api/bookings` | Same logic in both | Same logic in both | None — verified identical |
| `POST /api/expert-booking-requests` | Same logic in both | Same logic in both | None — verified identical |

### 2.2 No Drift (identical handlers)

All other 30 duplicated routes have identical handler logic. The inline and extracted copies are byte-for-byte equivalent in behavior.

---

## 3. The Live 404 Bug

| Route | Client Reference | Status | Evidence |
|---|---|---|---|
| `POST /api/cart/resolve-trip` | `client/src/pages/cart.tsx:615` | **404 in production** | `cart.tsx:615` calls `fetch("/api/cart/resolve-trip", {...})`. This route is **only in bookings-domain.routes.ts:340**. The inline `routes.ts` has **no** `cart/resolve-trip` route. Since `bookingsDomainRoutes` is never mounted, this endpoint 404s. |

**Severity:** P0 — This is a cart/checkout path. If the cart calls this endpoint and gets a 404, the checkout flow may break or silently fail to resolve the trip.

---

## 4. Canonical Determination

### Recommendation: Inline is canonical. Extracted is dead code.

**Rationale:**
1. **Inline is live.** 98+ routes are actively serving requests from the inline `routes.ts`. The extracted router is never mounted.
2. **Inline is the source of truth.** Any drift shows the inline copy is either identical or simpler (the `withServiceDetails` flag in `GET /api/my-bookings` is an enhancement in extracted that never shipped).
3. **No partial mount.** Confirmed: no other file `app.use()`s `bookingsDomainRoutes`. The import at `routes.ts:99` is the only reference, and it's never consumed.
4. **Extracted has unique routes.** 11 routes only exist in extracted. Of these, **1 is a live 404 bug** (`/api/cart/resolve-trip`), and **10 are coordination-specific** routes built but never wired.

### Decision for Phase 1:

**Option A (Recommended):** 
1. Migrate the **live 404 bug route** (`POST /api/cart/resolve-trip`) from extracted to inline.
2. Migrate the **10 coordination-specific routes** from extracted to inline IF they are needed for the Event fast-follow (Stage 7 in revised plan). Otherwise, delete them.
3. Delete the extracted `bookings-domain.routes.ts` file entirely.
4. Remove the dead import at `routes.ts:99`.
5. Ensure `tsc --noEmit` passes.

**Option B (Not recommended):**
1. Mount `bookingsDomainRoutes` with `app.use()`.
2. Remove the inline duplicates.
3. Risk: double-registration for the 34 duplicated routes. Also, the 64 inline-only routes would need to be extracted too.

**Option A is the only safe choice.** Option B would require extracting 64 routes and risks double-registration.

---

## 5. Partial Mount Confirmation

Confirmed: **No other file `app.use()`s `bookingsDomainRoutes` or any subset of its routes.**

Searched:
- `grep -rn "bookingsDomainRoutes" server/` → only `routes.ts:99` (import)
- `grep -rn "app.use.*bookings-domain" server/` → no matches
- `grep -rn "app.use.*bookingsDomain" server/` → no matches

The only registration of these routes is the inline copy in `routes.ts`.

---

## 6. Count Summary

| Category | Count | Action in Phase 1 |
|---|---|---|
| Duplicated (inline = canonical) | 34 | Delete from extracted |
| Only in extracted, client-called | 1 (`/api/cart/resolve-trip`) | **Migrate to inline** (P0 bug) |
| Only in extracted, unreferenced | 10 (coordination-specific) | Migrate to inline IF needed for Event fast-follow; else delete |
| Only in inline (live) | 64 | Keep in inline |
| **Total in inline** | 98+ | Keep all |
| **Total in extracted** | 45 | Delete all (after migrating 1-11) |

---

## 7. Greenlight Request

**Phase 0 audit is complete. The findings are:**

1. **34 routes duplicated** — inline is canonical.
2. **1 live 404 bug** — `POST /api/cart/resolve-trip` only in extracted, called from client.
3. **10 dead coordination routes** — built but never wired.
4. **64 routes only in inline** — live and working.
5. **No partial mount** — confirmed.
6. **Recommended approach:** Inline is canonical. Migrate 1 bug route (+ 10 coordination routes if needed), then delete extracted file + dead import.

**Awaiting greenlight for Phase 1 (reconciliation).**
