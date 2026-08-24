---
name: Expert Workspace surfacing
description: Root causes and fixes for Expert Workspace not appearing in expert accounts
---

The Expert Workspace page (`/expert/workspace/:tripId`) requires a trip assignment to navigate to.

**Why it was invisible:**
1. `GET /api/expert/assigned-trips` was completely absent from `server/routes.ts`. Both the Dashboard and the Assigned Trips page called this endpoint — since it was missing, `assignedTrips` was always empty and no workspace links ever rendered.
2. The expert sidebar had no "Assigned Trips" nav link, so the Assigned Trips page (which also surfaces workspace links) was unreachable.

**Fix applied:**
- Added `GET /api/expert/assigned-trips` near the other expert assignment routes (~line 17723 in routes.ts). Queries `tripExpertAdvisors` joined with `trips` and `users`, filtered by `localExpertId = userId`, returns: `trip_id`, `trip_title`, `destination`, `start_date`, `end_date`, `traveler_name`, `status`, `assigned_at`, `suggestion_count`.
- Added "Assigned Trips" nav item (MapPin icon) to the Work group in `expert-sidebar.tsx`, between Clients and Messages.

**How to apply:**
Any future expert-facing feature that depends on assigned trips should use `GET /api/expert/assigned-trips`. The data table is `trip_expert_advisors` with `local_expert_id` as the expert FK.
