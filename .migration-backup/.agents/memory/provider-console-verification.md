---
name: Provider console verification quirks
description: Gotchas when verifying the provider console maps/pills/edit-split in dev
---
- Zone-ring fee amounts are CLICK-triggered Leaflet popups bound to each dashed Circle (service-location-map.tsx) — a tester that only looks at the map will false-fail "no fee labels"; instruct it to click inside a ring.
- Catalog status pill reads `status` (draft/active/paused), not `approval_status`; flipping approval_status='approved' via SQL still shows "Paused"/draft pill. The ruling-112 "Edit in review" pill is a SEPARATE pill keyed on edit_review_status='pending'.
- provider_services has no `name`/`provider_id`/`is_active` columns — use service_name / user_id / status.
- Edit-split injection guard verified: PATCH with pendingChanges/pending_changes in body is stripped server-side; safe fields in the same body still apply.
- Admin fixture: clone the kyoto-temples password hash onto test-admin@traveloure.test for admin UI runs (TestPass123!).
