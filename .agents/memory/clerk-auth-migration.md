---
name: Clerk auth migration
description: Durable identity-mapping constraints and security rules from the Replit Auth → Clerk migration
---

## Identity bridge rule
`sessionClaims.userId` = local `users.id` for ALL users (legacy Replit Auth sub preserved as Clerk `externalId` for migrated users; Clerk native ID for new users). Never use `auth.userId` (Clerk's own ID) for local DB lookups — it differs for migrated users.

**Why:** Replit-managed Clerk preserves old Replit Auth sub IDs as `externalId`, then injects them into `sessionClaims.userId`. Using `auth.userId` directly would create duplicate or mismatched rows for pre-migration users.

**How to apply:** Any code that resolves a user from the session must read `(auth?.sessionClaims as any)?.userId || auth?.userId`. The shared `getUserId(req)` from `server/utils/auth.ts` does this correctly.

## JIT provisioning must run at the bootstrap endpoint
`jitProvisionUser()` (exported from `server/middlewares/requireAuth.ts`) must be called from both `requireAuth` AND the unauthenticated-safe `/api/auth/user` + `/api/auth/session` endpoints. New Clerk sign-ups have no local row until one of these paths runs — if only `requireAuth` does it, the first page load returns `null` and the user appears logged out.

**Why:** `useAuth` calls `/api/auth/user` on page load before any protected endpoint fires. If that endpoint only does a DB lookup (no JIT), a brand-new Clerk user gets `null` and can't use the app until they hit a protected route by chance.

## Clerk publishable key must never be host-derived
`clerkMiddleware` and WebSocket Clerk setup must use `process.env.CLERK_PUBLISHABLE_KEY` directly, never `publishableKeyFromHost(getClerkProxyHost(req), ...)`. Host-derived key selection allows a client to spoof `X-Forwarded-Host` to select an unrelated Clerk instance.

**Why:** `publishableKeyFromHost` manufactures a `pk_live_clerk.<host>` key for any host it receives in production — not just falling back to the configured key. A spoofed header would route authentication to an unrelated Clerk tenant.

## isEA and similar role-check middlewares must use getUserId()
Any middleware that runs before `requireAuth` (like `isEA` in `server/middleware/ea-rbac.ts`) must call `getUserId(req)` — not `getAuth(req)` directly. `getAuth()` throws on anonymous requests when `clerkMiddleware` has not set auth state; `getUserId()` wraps it in a try/catch and safely returns null.

## req.user backward-compat shape
`requireAuth` sets `(req as any).user = { id, claims: { sub, role }, role }` for all 34+ route files that read `req.user.claims.role` or `req.user.id`. Do not remove this shape — it is the backward-compat bridge for code that predates the Clerk migration.
