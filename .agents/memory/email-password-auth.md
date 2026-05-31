---
name: Email-password auth pattern
description: How to safely extract userId and check roles for both OIDC and email/password sessions.
---

## Rule
Always extract userId with the double-fallback pattern:
```ts
const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
```

For role checks, never use `claims.role` as it is undefined for email/password sessions. Always look up the user from the DB:
```ts
const dbUser = await storage.getUser(userId);
if (!dbUser || dbUser.role !== "expected_role") return res.status(403)...
```

**Why:** Replit OIDC sessions set `req.user.claims.sub` for the user ID. Email/password sessions (Passport local strategy) set `req.user.id` directly. `claims` is undefined for email/password users, so `claims.sub` and `claims.role` both return `undefined` without the fallback.

**How to apply:** Every `isAuthenticated`-protected route that accesses user identity must use this pattern. Batch-fix using perl multiline replacement targeting `const userId = (req.user as any).claims?.sub;` → `const userId = (req.user as any).claims?.sub ?? (req.user as any).id;`.
