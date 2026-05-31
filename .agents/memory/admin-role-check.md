---
name: Admin role check pattern
description: How admin routes must verify the admin role for both auth methods.
---

## Rule
Admin role checks must use a DB lookup, not `claims.role`:

```ts
const rawUser = req.user as any;
const adminId = rawUser?.claims?.sub ?? rawUser?.id;
const dbAdmin = await storage.getUser(adminId);
if (!dbAdmin || dbAdmin.role !== "admin") {
  return res.status(403).json({ message: "Admin access required" });
}
```

**Why:** `user?.claims?.role` is only populated for OIDC sessions. Email/password admin users have `claims` as undefined, so `claims.role` returns undefined and the check always 403s them.

**How to apply:** All `/api/admin/*` routes in `admin-analytics.ts`, `admin.ts`, `admin-content.ts`. The batch perl fix pattern used was:
```
s/const user = req.user as any;\nif (user?.claims?.role !== "admin") {/...DB lookup pattern.../g
```
