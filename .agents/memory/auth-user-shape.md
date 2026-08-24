---
name: Auth user shape mismatch
description: Replit Auth and email auth store the user ID at different paths in req.user — any handler extracting userId must handle both.
---

## Rule

Extract userId as:
```typescript
const userId = (req as any).user?.id ?? (req as any).user?.claims?.sub;
```

Never use `req.user?.id` alone — it is undefined for email-auth sessions.

**Why:** Replit Auth (OIDC) deserializes the user with `id` at the top level. Email auth (`emailAuth.ts`) stores user identity under `claims.sub`. Passport's `deserializeUser` just passes through the stored object with no normalization, so both shapes appear in `req.user` depending on how the user logged in. Using `.id` alone causes a silent `undefined` → 401 for all email-auth users even when `isAuthenticated()` passes (because `isAuthenticated` only checks `expires_at`, not `id`).

**How to apply:** Any route handler that extracts `userId` from `req.user` must use the dual-path form above. Both `server/routes/transport-hub.routes.ts` `/book` handler (line ~273) and the affiliate-click handler (line ~365) were fixed in the laughing-bardeen PR merge (2026-06-08).
