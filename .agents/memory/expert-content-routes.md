---
name: Expert content routes
description: Missing expert API routes that were added — content CRUD and assigned-trips.
---

## What was added
- `GET /api/expert/content` — lists expert's content (backed by `influencerCuratedContent` table, filtered by `influencerId = userId`)
- `GET /api/expert/content/:id` — single content item with ownership check
- `POST /api/expert/content` — creates content in `influencerCuratedContent`
- `PATCH /api/expert/content/:id` — updates content with ownership check
- `GET /api/expert/assigned-trips` — trips where `trips.expert_id = userId` (trips table has `expert_id` column)

**Why:** `content-create.tsx` page calls these endpoints but no server routes existed; they fell through to the SPA (HTML 200). The `clients.tsx` page queries `/api/expert/assigned-trips`.

**How to apply:** Routes are at the end of `server/routes/expert.ts`. `influencerCuratedContent` is imported from `@shared/schema`. Trips with expert assignment use `trips.expert_id` column (FK to `local_expert_forms.user_id`).
