---
name: Prod verification constraints
description: What can and cannot be verified directly against the production Traveloure deploy
---
- Prod `executeSql` is strictly read-only — UPDATE/DELETE fail. QA accounts created on prod via signup cannot be role-granted or deleted from the DB; there is no self-delete API route either. Cleanup = logout only; record residue in the report.
  **Why:** dispatch playbooks assume "grant role directly in the DB", which is impossible on prod.
  **How to apply:** run expert-session UI checks on the dev workspace pinned to the same commit as prod, and mark prod-side session checks NOT VERIFIED (env-blocked).
- The traveler bookings page is mounted at `/bookings` (ProtectedRoute → MyBookingsPage); `/my-bookings` is NOT a route and client-404s. Dispatches referencing /my-bookings are using a stale path.
- OG injection (`/services/:id`, storefront.routes.ts) and `/r/:code` 302s now work on prod — the earlier static-catch-all ordering bug is fixed live.
- `/api/service-offering-types` exists only as an admin route (`/api/admin/service-offering-types`); the public path 404s by design of the current tree.
- Prod residue accounts: 60 `@traveloure.test` users still exist (all role `user`, logins 401) — never re-seed; purge must come from the GitHub side.
