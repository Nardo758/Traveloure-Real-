---
name: Clerk Auth Migration
description: What changed when we migrated from Replit Auth / Passport.js to Clerk (August 2026).
---

## The rule
Auth is now Clerk. Never re-add Passport.js, express-session, openid-client, or any Replit Auth primitives.

## What's active at runtime
- `server/middlewares/clerkProxyMiddleware.ts` — FAPI proxy (mounts at `/clerk-api`)
- `server/middlewares/requireAuth.ts` — drops in place of `isAuthenticated`; JIT-provisions a `users` row on first sign-in; sets `req.user = { id, claims: { sub, role }, role }` and `req.dbUser` for backward compat
- `server/utils/auth.ts` → `getUserId(req)` reads Clerk `getAuth` first, legacy fields second
- `server/middleware/role-rbac.ts`, `ea-rbac.ts` — updated to use `getAuth` not `req.isAuthenticated()`
- `server/routes/clerk-auth.routes.ts` — `/api/auth/user`, `/api/auth/session`, `/api/profile`, `/api/auth/accept-terms`, legacy stubs
- `client/src/hooks/use-auth.ts` — Clerk-backed; keeps old return shape (`user`, `isLoading`, `isAuthenticated`, `logout`)
- `client/src/App.tsx` — `ClerkProvider` wraps the entire tree; `/sign-in/*?` and `/sign-up/*?` routes added
- `client/src/pages/sign-in.tsx` / `sign-up.tsx` — thin wrappers over `<SignIn>` / `<SignUp>` Clerk components

## What's still on disk but NOT wired at runtime
- `server/replit_integrations/auth/` — kept for test compatibility only (`__tests__` import `setupEmailAuth`, `upsertUser`, etc.); `registerAuthRoutes` / `setupAuth` are NO LONGER called from routes.ts

## Key gotchas
- `req.user.role` and `req.user.claims?.role` are populated by `requireAuth` (copied from dbUser) so admin route handlers that read `(req.user as any).role` continue to work
- Local `isAuthenticated` helpers in several route files (payment-methods, promo-text, ready-made, short-links, storefront) were replaced with `getAuth`-based checks rather than importing `requireAuth` (they were inline guard fns, not middleware)
- `adminApiGuard` in routes.ts now calls `getUserId(req)` (Clerk-aware) directly instead of `req.isAuthenticated()`
- The proxy URL in the client is `/clerk-api`; the FAPI proxy middleware must remain mounted before body parsers in server/index.ts

**Why:** Replit Auth was OIDC-based and tied to Replit accounts; migration to Clerk gives standard email/password + social login while keeping the existing `users` table schema intact.
