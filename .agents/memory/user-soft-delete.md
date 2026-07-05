---
name: User soft-delete
description: How user account deletion works; why hard deletes are banned; cascade steps and auth gates
---

## The rule
Never hard-delete a `users` row. Bookings, Stripe records, and tax data reference the user ID and MUST be retained for financial/legal compliance.

**Why:** Stripe charge records, serviceBookings, and expertPayouts all FK to `users.id`. A hard delete breaks payout history and tax reporting.

**How to apply:** Any code that appears to delete a user must use soft-delete instead.

## Soft-delete fields (migration 102)
- `users.is_deleted` — BOOLEAN NOT NULL DEFAULT FALSE
- `users.deleted_at` — TIMESTAMP nullable
- Partial index `users_is_deleted_idx` on (is_deleted=TRUE) for fast recovery queries

## On deletion, the cascade is:
1. `users.is_deleted=true`, `deleted_at=NOW()`, `email=deleted_{userId}@deleted.traveloure.com`, `password=NULL`, `instagramAccessToken=NULL`
2. `expert_requests.status='cancelled'` WHERE userId = deleted user
3. `local_expert_forms.status='deactivated'` WHERE userId = deleted user
4. `service_provider_forms.status='deactivated'` WHERE userId = deleted user
5. DELETE all sessions WHERE sess->'passport'->'user'->'claims'->>'sub' = userId OR sess->'passport'->'user'->>'id' = userId
6. req.logout() to kill current session

## Auth gates
- `isAuthenticated` middleware (`server/replit_integrations/auth/replitAuth.ts`): does a DB lookup via `authStorage.getUser(userId)` after Passport validates every session. If `dbUser.isDeleted`, returns 403 + calls req.logout(). Fail-open (console.warn) if DB throws.
- Email login (`server/replit_integrations/auth/emailAuth.ts`): checks `user.isDeleted` before creating a session (defense-in-depth).

## Endpoints
- `DELETE /api/auth/account` — self-service delete (in `server/replit_integrations/auth/routes.ts`)
- `GET /api/admin/users/deleted` — admin recovery list
- `DELETE /api/admin/users/:id` — admin force-delete (self-deletion guard: admin cannot delete own account via this endpoint)
- `GET /api/admin/users` — always excludes `is_deleted=true` users (filter added to conditions array)
