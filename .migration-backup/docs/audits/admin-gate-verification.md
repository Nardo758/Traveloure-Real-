# Admin Role-Gate Verification (READ-ONLY) — Phase 2 precondition

**Question:** D1a builds an admin approval queue on the `/admin/*` gate. Is that gate **server-enforced** on the API endpoints, from a **trustworthy** role source, with no bypass — or is it client-only / `|| true` / accept-terms doing the work?

**Verdict (short):** The gate **mechanism is REAL** and is **correctly applied to every endpoint D1a hangs off** (approve/reject, fee-bands write, payouts). Role comes from a DB lookup on the authenticated session; non-admins get 403; no `|| true`/env bypass; accept-terms is *not* doing the gating.

**But** the gate is **per-endpoint opt-in with no blanket guard**, and it has **already leaked**: `POST /api/admin/fee-config` (a write that rewrites platform fee splits) and two admin GETs have **no role check at all** — any authenticated non-admin reaches them. That is a live, independent broken-auth hole. Per this brief's STOP clause, **it gets its own fix brief, first.** It does **not** invalidate D1a's own surface, which is verified.

---

## Checks

### 1–3. The gate: functions, enforcement, role source

There is **no single guard** and **no `router.use(requireAdmin)` blanket** on `/api/admin/*` (grep → none). Protection is applied **per endpoint**, in one of four equivalent, trustworthy forms — all read `role` from the **DB** via the authenticated session's `claims.sub`, 403 on non-admin, and contain **no `|| true` / `?? true` / TODO / env-conditional bypass**:

| Guard | `file:line` | Body (trustworthy?) |
|---|---|---|
| `requireAdmin` (middleware) | `server/routes.ts:10637` | `req.isAuthenticated()`→401; `db.select…users…role !== "admin"`→403. ✅ DB-sourced |
| `requireAdminLocal` (middleware) | `server/routes/admin.routes.ts:211` | `getAdminRole(claims.sub)` → `role !== "admin"`→403. ✅ |
| `isAdmin(req)` (helper) | `server/routes/admin.routes.ts:5024` | `getAdminRole(userId)` → `{ok:false}` unless `role==="admin"`. ✅ |
| **Inline** at handler top | e.g. `routes.ts:1602`, `admin.routes.ts:236` | `getFullAdminUser`/`storage.getUser` → `role !== "admin"`→403. ✅ |

**Server-enforced on the endpoints, not the page:** yes, where applied — the checks run inside the Express API handlers (or as route middleware), independent of the client route wrapper. The role source is always a **server-side DB lookup keyed on the session subject**, never a request header/body/query/client cookie.

**D1a's specific endpoints — all guarded (verified by reading each handler):**
| Endpoint (what D1a wires to) | `file:line` | Guard |
|---|---|---|
| `POST /api/admin/custom-services/:id/approve` | `admin.routes.ts:1333` | inline `getFullAdminUser` → 403 ✅ |
| `POST /api/admin/custom-services/:id/reject` | `admin.routes.ts:1363` | inline `getFullAdminUser` → 403 ✅ |
| `GET  /api/admin/custom-services/pending` | `admin.routes.ts:1322` | inline role check ✅ |
| `PATCH /api/admin/fee-bands/:bandKey` (fee editor write) | `admin.routes.ts:4185` | `getAdminRole` → 403 ✅ |
| `POST /api/admin/payouts` (payout trigger) | `admin.routes.ts:2760` | `storage.getUser` → 403 ✅ |
| `PATCH /api/admin/payouts/:id` | `admin.routes.ts:2827` | `storage.getUser` → 403 ✅ |
| `PATCH /api/admin/expert-applications/:id/status` | `routes.ts:1612` | inline role check ✅ |

### 4. Behavioral proof

Done **by guard-path inspection** (the brief permits this in lieu of triggering writes; here it's dispositive because the guard's presence/absence is unambiguous in source):
- **Guarded endpoints:** the `role !== "admin"` → 403 branch is literally present and precedes every privileged action → a non-admin authed session **gets 403**. (e.g. `GET /api/admin/expert-applications`, `routes.ts:1603`.)
- **Unguarded endpoints (below):** no role check exists in the handler at all → a non-admin authed session **gets 200**.

A live-server curl with a `@traveloure.test` non-admin session wasn't run this pass (it needs the full server + seeded session stood up); the source is conclusive, and I can run it to put status codes on record if you want the belt-and-suspenders.

### 5. Did accept-terms mask this?

**Accept-terms is not an authorization layer.** `/api/auth/accept-terms` (`server/replit_integrations/auth/routes.ts:146`) merely stamps `termsAcceptedAt`. There is **no global middleware** blocking API calls on missing terms (grep for `app.use(...terms` / `requireTerms` → none). The E2E admin failures redirected to `/accept-terms` in the **browser** (a client route guard), so the run never exercised the admin **API** gate — but that gate enforces (or fails to) on its own, independently of terms. **Terms-acceptance is not doing any gating.** So the E2E bounce masked *reachability*, not a missing gate.

---

## FINDING — live, independent broken-auth hole (not D1a's surface)

The per-endpoint pattern has no backstop, and three endpoints omit the check. Any **authenticated** user (traveler/expert) reaches them:

| Endpoint | `file:line` | Impact | Severity |
|---|---|---|---|
| **`POST /api/admin/fee-config`** | `admin.routes.ts:4092` | **No role check anywhere in the handler.** Writes `booking_fee_configs` — platform fee %, expert share %, AI-keeps-100, min/max fee, insurance. **Any authed user can rewrite the platform's fee/commission splits.** | **Critical** — financial tampering / privilege escalation |
| `GET /api/admin/fee-config` | `admin.routes.ts:4066` | No role check. Reads full fee configuration. | High (info disclosure) |
| `GET /api/admin/lead-routing-logs` | `admin.routes.ts:4479` | No role check (the `req.user.role` at line 4495 is a telemetry **argument** to `withQueryTimer`, not a gate). Reads lead-routing logs joined to `users`/experts → names/PII. | High (PII disclosure) |

**Root cause:** admin protection is opt-in per endpoint with **no `router.use(requireAdmin)` blanket** on `/api/admin/*`. Every new admin route must remember the check; these forgot. This is the same "assume-a-gate-exists" class the brief anticipated — the fee-config write is the financial analogue of the marketplace's missing approval gate.

---

## Verdict — routes Phase 2

**Split, but actionable:**

1. **D1a's own gate: REAL — Phase 2's mechanism is verified.** The approve/reject/fee-bands/payout endpoints D1a builds on are server-enforced, DB-sourced, bypass-free, 403 for non-admins. An approval queue hung off *these* endpoints is not built on sand.

2. **STOP on the fee-config hole first (its own brief).** Per this brief's explicit clause — "a non-admin reaches an admin endpoint → STOP … fixed first, in its own brief, before any approval queue is built" — the confirmed `POST /api/admin/fee-config` privilege-escalation (plus the two unguarded GETs) is a **live security hole independent of the approval feature** and outranks it. It should be closed first. The clean fix is also the systemic one: add a **blanket `router.use(requireAdmin)`** (or `isAdmin`) on the `/admin/*` router so opt-in-per-endpoint can't leak again, then drop the now-redundant inline checks opportunistically. **Do not fix it here** — this pass is read-only; it's a scoped security brief.

**Net:** Phase 2/D1a is *mechanically* unblocked (its endpoints are verified), but the responsible sequence is **fee-config auth fix → then D1a**, because leaving a financial-config write world-writable while building an approval queue on the same admin surface is backwards. Recommend routing the fee-config fix as the next brief; D1a stays parked (task #15) behind it.

---

*Read-only. Nothing fixed — not the fee-config hole, not the missing blanket guard. Guard bodies quoted from source; behavioral status codes available on request.*
