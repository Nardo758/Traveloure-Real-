---
name: Affiliate network integration checklist
description: Non-obvious pieces reviewers check for when wiring a new affiliate/commission network (e.g. Partnerize) into the platform
---

When integrating a new affiliate network end-to-end, code review checks for three things beyond the obvious client + link-gen + booking flow:

1. **Two separate scheduled jobs, not one.** Campaign/catalog sync (infrequent, e.g. every 12h) and commission/conversion report polling (more frequent, e.g. every 6h) are distinct concerns. Implementing only the catalog sync timer and leaving report fetching reachable "on-demand only" via an admin endpoint is flagged as incomplete — reconciliation must run automatically on an interval, mirroring the existing scheduler pattern in `cache-scheduler.service.ts`.

2. **Admin reconciliation UI partner filters must be updated in lockstep with backend `partner=` support.** Backend `fetchExternalReports`/`getReconciliationView` supporting a new partner string is not sufficient — the admin dropdown (`client/src/pages/admin/affiliate-partners.tsx` reconciliation tab) must also list the new partner value or admins can't select it.

3. **Any CTA/component with conditionally-required backend fields must gate on those fields client-side, not just pass what it has.** E.g. `POST /api/expert-requests` requires either `tripId` OR both `variantId`+`comparisonId`; a CTA component reused outside a trip context must disable itself (with an explanatory tooltip) rather than firing a request that will always 400.

**Why:** These three gaps were the exact reasons a Partnerize integration task was rejected on first code review despite the "happy path" (client, sync, link-gen, booking, reconciliation fetcher) all working and e2e-tested.

**How to apply:** When building or reviewing a new affiliate/partner integration, explicitly check for (1) a recurring poll timer for commission data, (2) admin UI parity for any new backend partner enum value, and (3) client-side precondition gating for any reused CTA component with context-dependent required fields.
