---
name: ADR Security Fixes Applied
description: Security + analytics fixes applied to the codebase from the Technical Architecture Document
---

## ADR-002: Role Vulnerability — FIXED
`server/replit_integrations/auth/emailAuth.ts` line ~97:
- `role: 'user' as const` — hardcoded, never reads from request body
- `userType` still accepted in Zod schema but explicitly ignored
**Why:** Self-declared `userType=admin` in POST /api/auth/register body would have been written directly to DB role column.
**How to apply:** Any new auth registration endpoint must hardcode role='user'. Upgrades go through application forms only.

## getUserId() Helper — CREATED
`server/utils/auth.ts` exports `getUserId(req)`, `requireUserId(req)`, `getSessionRole(req)`.
- Email-auth: `req.user.claims.sub`
- Replit/Facebook OAuth: `req.user.id` fallback
**Why:** 236 routes had inconsistent extraction; email-auth sessions crash on `.id` access, OAuth sessions crash on `.claims.sub` access.
**How to apply:** Import from `server/utils/auth.ts` in all new routes. Existing routes in admin.routes.ts (89 instances) were bulk-patched with sed.

## funnel_events Table — ADDED
- Migration: `server/migrations/089_funnel_events.sql`
- Schema: `shared/schema.ts` — `funnelEvents` pgTable
- Append-only, fire-and-forget. userId nullable for T0 pre-auth events.
- Stages: T0–T7 (varchar 4)

## Lead Routing Null-Assign — FIXED
`server/services/lead-routing.service.ts`: `logRoutingDecision` now always fires (including null-assign) with reason string and replaces silent catch with console.warn.
