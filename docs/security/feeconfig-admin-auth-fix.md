# Admin auth hole — fee-config world-writable → default-deny on `/api/admin/*`

**Severity: 🔴 live-money.** `POST /api/admin/fee-config` had **no role check** — any authenticated user (a traveler who signed up seconds ago) could rewrite the platform's fee/commission splits, the single admin-configurable source of truth the whole monetization model rests on. Root cause: admin protection on `/api/admin/*` was **per-endpoint opt-in with no backstop**, so routes leaked whenever a guard was forgotten.

**Fix:** a single app-level **default-deny** middleware — `app.use("/api/admin", adminApiGuard)` — registered before any admin route, so the class is closed, not just the known instances.

---

## Step 1 — Enumeration (READ-ONLY, before any guard)

**183** route registrations match `/api/admin/*` across `server/routes.ts`, `server/routes/admin.routes.ts`, `server/routes/cross-sell.routes.ts`.

- **Fully public (no `isAuthenticated`): 0.** Every admin route required at least authentication.
- **Legitimately non-admin routes under the prefix: 0.** Every client caller of `/api/admin/*` is an admin surface (`pages/admin/*`, `components/admin/*`, `admin-sidebar`) — verified by grepping all client `/api/admin/` references. **No exemption needed → safe to blanket-guard.**
- **`cross-sell.routes.ts` is imported but never mounted** (`crossSellRoutes` has no `app.use`), so its `/api/admin/analytics/cross-sell` route is dark (not live). Noted as a separate dark-family finding; not this fix.

**Unguarded routes found — 5 (not the 3 originally named):** the deeper scan (16-line body window, all guard forms) caught two more than the audit's known three, which is exactly why patching only the named endpoints would have left the class open.

| # | Method + path | `file:line` | Impact |
|---|---|---|---|
| 1 | **POST** `/api/admin/fee-config` | admin.routes.ts:4092 | **Critical** — write platform fee/commission splits |
| 2 | GET `/api/admin/fee-config` | admin.routes.ts:4066 | High — read full fee config |
| 3 | GET `/api/admin/lead-routing-logs` | admin.routes.ts:4479 | High — read lead logs w/ user+expert PII (the `req.user.role` at :4495 is a `withQueryTimer` **argument**, not a gate) |
| 4 | **PATCH** `/api/admin/lead-routing-logs/:id/override` | admin.routes.ts:4505 | **High — second unguarded write**; reassigns lead routing + stamps caller as `overridden_by` |
| 5 | GET `/api/admin/local-experts/nugget-counts` | admin.routes.ts:4688 | Low — aggregate nugget counts per expert |

*(Ruled out: `POST /api/admin/leads/:id/confirm` (4631) looked unguarded but delegates to `confirmLeadAssignmentHandler`, which does check `role !== "admin"` → 403. Genuinely guarded.)*

The other **177** routes carry a trustworthy check already — one of `requireAdmin` (routes.ts:10637), `requireAdminLocal` (admin.routes.ts:211), `isAdmin(req)` (admin.routes.ts:5024), or an inline `getFullAdminUser`/`getAdminRole`/`storage.getUser` → `role !== "admin"` → 403. All read role from a **DB lookup on the authenticated session**, no `|| true`/env bypass.

## Step 2 — The fix, proven to cover

Added at `server/routes.ts` immediately after auth setup (after the `setupAuth`/`registerAuthRoutes` block, ~line 245), **before every admin route registration** (inline routes here + the `app.use(adminRoutes)` mount at :491):

```js
const adminApiGuard = async (req, res, next) => {
  try {
    if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated())
      return res.status(401).json({ message: "Authentication required" });
    const uid = req.user?.claims?.sub ?? req.user?.id;
    const user = uid ? await db.select().from(users).where(eq(users.id, uid)).then(r => r[0]) : undefined;
    if (!user || user.role !== "admin")
      return res.status(403).json({ message: "Admin access required" });
    return next();
  } catch (err) {
    console.error("adminApiGuard error:", err);   // fail closed, not open
    return res.status(500).json({ message: "Authorization check failed" });
  }
};
app.use("/api/admin", adminApiGuard);
```

**Placement proof (middleware order):**
- Registered at ~line 245; the earliest admin route registration is the router-mount block at line 441+ and `app.use(adminRoutes)` at 491, and the inline admin routes start at 1461 — all **after** the guard. Express runs `use` middleware in registration order, so the guard runs first for every `/api/admin/*` request.
- Auth setup (`setupAuth`, 236) runs **before** the guard, so `req.isAuthenticated()` and the session are available. The auth integration modules register **no** `/api/admin/*` routes (verified), so nothing admin slips in ahead of the guard.
- **Coverage is behaviorally proven, not assumed:** `fee-config` lives in the *mounted* `adminRoutes` router, and a non-admin now gets 403 on it (Step 3) — demonstrating the app-level `app.use("/api/admin", …)` sits above the mounted router, the 200-HTML/unmounted-router trap avoided.
- Role source is a **DB lookup on the session subject** — never a request header/body/query. Fails closed on lookup error (500). Existing per-endpoint checks left in place as harmless belt-and-suspenders (not stripped this pass).

## Step 3 — Behavioral proof ("I watched the door stay shut")

Local server (dev, real passport sessions), seeded `@traveloure.test` accounts. Non-admin = `test-traveler-kyoto@traveloure.test` (role `user`), admin = `test-admin@traveloure.test` (role `admin`).

| Request | Session | **Before** | **After** |
|---|---|---|---|
| GET `/api/admin/fee-config` | non-admin | **200** 🔴 | **403** ✅ |
| GET `/api/admin/lead-routing-logs` | non-admin | **200** 🔴 | **403** ✅ |
| GET `/api/admin/local-experts/nugget-counts` | non-admin | **200** 🔴 | **403** ✅ |
| PATCH `/api/admin/lead-routing-logs/:id/override` | non-admin | (write open) | **403** ✅ |
| POST `/api/admin/fee-config` (no-op payload, rejected pre-write) | non-admin | world-writable | **403** ✅ |
| GET `/api/auth/user` (control) | non-admin | 200 | **200** ✅ (not over-blocked) |
| GET `/api/admin/fee-config` | admin | 200 | **200** ✅ (not over-blocked) |
| GET `/api/admin/stats` | admin | 200 | **200** ✅ |
| GET `/api/admin/fee-config` | unauth | — | **401** ✅ |

The POST proof used a no-op payload and was rejected by the guard **before** the handler ran, so **no fee mutation was left behind**.

---

## Verdict

**Hole closed. Class closed. D1a/Phase 4 unblocked.** The default-deny backstop means a forgotten per-endpoint guard can no longer expose an admin route; new `/api/admin/*` routes are admin-only by default.

**Systemic follow-up (filed, not done here):** the same opt-in-with-no-backstop pattern likely exists on other privileged prefixes (expert-only, provider-only, EA-only, owner-only routes). Worth a "which privileged route groups lack a blanket guard" sweep — pairs with the dark-families triage. Recorded in the roadmap; out of scope for this lane.

*Own security branch (`claude/feeconfig-admin-auth-fix`), not folded into the structural branch. Inline checks left intact.*
