# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 0/627**; remaining: **627**.
- Admin: **0/158**; payments: **0/31**; user-data: **0/219**; other: **0/219**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **evidence manifest SHA-256 is stale**; manifest SHA-256: `93ccfaea6f96fe4797840101e1bf8b25ae308f2837b3b56b1620812b4ed72e2c`; run timestamp: 2026-09-25T00:56:06.499Z.
- `admin`: **passed**, 146 exact endpoint keys, context `admin`.
- `highrisk-unauthenticated`: **passed**, 236 exact endpoint keys, context `unauthenticated`.
- `expert-provider-wrong-role`: **passed**, 54 exact endpoint keys, context `wrong-role`.
- `resource-ownership`: **passed**, 34 exact endpoint keys, context `resource-owner`.
- `payments-resource-ownership`: **passed**, 5 exact endpoint keys, context `payments-resource-owner`.
- `payments-other-rails-ownership`: **passed**, 10 exact endpoint keys, context `payments-other-rails-owner`.
- `optimization-confirm`: **passed**, 1 exact endpoint keys, context `optimization-confirm`.
- An endpoint is tested only when a passing, non-skipped suite in the fresh evidence artifact names that exact endpoint in its required context. Route classification alone never promotes coverage.
- Totals are a strict endpoint union, not a sum of evidence dimensions. Endpoints with both unauthenticated and cross-owner evidence are counted once.
- The confirmed optimization-confirm ownership bug is fixed: missing or mismatched Stripe `metadata.userId` is rejected before DB/revenue writes.
- Payments/user-data signature endpoints (2) are counted only for unsigned-request coverage. Session-self payments/user-data endpoints are counted from fresh unauthenticated evidence, except the 26 explicit handler-fixture exclusions below; only those exclusions are **not tested**.

## Remaining risk

Untested endpoints below need endpoint-appropriate coverage. In particular, excluded expert/provider workflows require real handler-owned resources; public/system routes and all other-category routes have no authorization assertion in this strict report.

## Untested endpoints

| Endpoint | Risk | Boundary | Source | Exact reason |
| --- | --- | --- | --- | --- |
| DELETE /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8862 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3712 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8311 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8576 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7780 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/neighborhoods/:id/coverage-targets/:categoryKey | admin | admin-role | server/routes/admin.routes.ts:8748 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/notifications/:id | admin | admin-role | server/routes.ts:13471 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7728 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3419 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/services/:id | admin | admin-role | server/routes/admin.routes.ts:4613 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/slow-queries | admin | admin-role | server/routes.ts:12359 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3768 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/users/:id | admin | admin-role | server/routes/admin.routes.ts:5899 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1713 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/auth/account | user-data | session-self | server/replit_integrations/auth/routes.ts:203 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/blog/posts/:slug/reactions/:kind | other | session-self | server/routes/blog.routes.ts:174 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/cart | user-data | session-self | server/routes.ts:9709 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/cart/:id | user-data | session-self | server/routes.ts:9691 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/contracts/:id | user-data | session-self | server/routes.ts:12662 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:10976 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:10874 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1132 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2280 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:657 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:169 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/communications/:id | admin | admin-role | server/routes/ea.routes.ts:596 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:325 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:505 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:453 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:557 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7463 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:789 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:703 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/ready-made/build/:id | user-data | resource-owner | server/routes/ready-made.routes.ts:321 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/selected-services/:serviceOfferingId | user-data | session-self | server/routes.ts:5606 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:5761 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/specializations/:specialization | user-data | session-self | server/routes.ts:5644 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:422 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2085 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:422 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/ea-links/:id | user-data | session-self | server/routes/ea.routes.ts:815 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/payment-methods/:id | payments | session-self | server/routes/payment-methods.routes.ts:85 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:114 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:286 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:322 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:3179 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:163 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/participants/:id | user-data | session-self | server/routes/content.routes.ts:7364 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:10653 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:485 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:445 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:764 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:899 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/services/:id | user-data | session-self | server/routes.ts:4699 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:100 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/saved-items/:id | user-data | session-self | server/routes/saved-items.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/saved-items/shares/:shareId | user-data | session-self | server/routes/saved-items.routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7425 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:608 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/changes/:changeId | user-data | session-self | server/routes/plancard.routes.ts:722 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3220 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/option-sets/:setId/options/:optionId | user-data | session-self | server/routes/plan-option-sets.routes.ts:151 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:218 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2021 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1937 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8845 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/affiliate/reconciliation/:earningId | admin | admin-role | server/routes/admin.routes.ts:4187 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/blog/posts/:id | admin | admin-role | server/routes/blog.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/bookings/auto-cancel/config | admin | admin-role | server/routes/admin.routes.ts:2106 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3599 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/contact-submissions/:id | admin | admin-role | server/routes/admin.routes.ts:2793 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8299 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8549 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/evidence-thresholds/:key | admin | admin-role | server/routes/neighborhood-claims.routes.ts:310 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3013 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:2882 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7758 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-templates/:id/roles | admin | admin-role | server/routes/admin.routes.ts:3474 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/fee-bands/:bandKey | admin | admin-role | server/routes/admin.routes.ts:7483 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/invoices/:invoiceNumber/status | admin | admin-role | server/routes/admin.routes.ts:4746 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/lead-routing-logs/:id/override | admin | admin-role | server/routes/admin.routes.ts:7907 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/message-reports/:id | admin | admin-role | server/routes/admin.routes.ts:7278 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/neighborhoods/:id/adjacency | admin | admin-role | server/routes/admin.routes.ts:8877 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/:id/read | admin | admin-role | server/routes.ts:13437 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/read-all | admin | admin-role | server/routes.ts:13497 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/payouts/:id | admin | admin-role | server/routes/admin.routes.ts:5589 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/platform-settings/:settingKey | admin | admin-role | server/routes/admin.routes.ts:7811 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3315 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:3210 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/ready-made/:id/badge | admin | admin-role | server/routes/admin.routes.ts:1342 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/reviews/:id/status | admin | admin-role | server/routes/admin.routes.ts:7343 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7705 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-requests/:id | admin | admin-role | server/routes/service-requests.routes.ts:116 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3397 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/affinity-tags | admin | admin-role | server/routes/admin.routes.ts:4587 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/featured | admin | admin-role | server/routes/admin.routes.ts:4571 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/status | admin | admin-role | server/routes/admin.routes.ts:4552 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3746 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/commission-override | admin | admin-role | server/routes/admin.routes.ts:3090 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/suspend | admin | admin-role | server/routes/admin.routes.ts:9000 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/unsuspend | admin | admin-role | server/routes/admin.routes.ts:9165 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/verification | admin | admin-role | server/routes/admin.routes.ts:3043 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:8142 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/cart/:id | user-data | session-self | server/routes.ts:9619 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:316 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/contracts/:id | user-data | session-self | server/routes.ts:12593 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:10934 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:10769 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:10797 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1096 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:636 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:142 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:375 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:312 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:492 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/preferences | admin | admin-role | server/routes/ea.routes.ts:729 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:435 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:544 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7445 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:434 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2867 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:859 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:913 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:930 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:425 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1349 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:7646 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:655 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/neighborhoods | user-data | session-self | server/routes.ts:5410 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/photo | user-data | session-self | server/routes.ts:5569 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile | user-data | session-self | server/routes.ts:5481 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile-notes | user-data | session-self | server/routes.ts:5457 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/:id | user-data | session-self | server/routes/ready-made.routes.ts:575 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/build/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:285 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:74 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:5713 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:6220 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2063 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2697 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:95 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/home-city | user-data | session-self | server/routes/occasions.routes.ts:190 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/notification-email | user-data | session-self | server/routes/storefront.routes.ts:1576 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/preferences | user-data | session-self | server/routes/storefront.routes.ts:270 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/storefront | user-data | session-self | server/routes/storefront.routes.ts:339 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/travel-preferences | user-data | session-self | server/routes/storefront.routes.ts:416 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/traveler-profile | user-data | session-self | server/routes/traveler-profile.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/vacation | user-data | session-self | server/routes/vacation.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/:messageId/read | user-data | session-self | server/routes/messages.ts:242 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/conversation/:conversationId/read-all | user-data | session-self | server/routes/messages.ts:258 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:3157 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:123 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/participants/:id | user-data | resource-owner | server/routes/content.routes.ts:7300 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/participants/:id/rsvp | user-data | session-self | server/routes/content.routes.ts:7326 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/profile | user-data | session-self | server/replit_integrations/auth/routes.ts:87 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:2847 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:10629 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:7650 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:345 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:721 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:852 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:4271 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:125 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:8108 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:8043 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:189 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7407 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2251 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:640 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:566 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:1173 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/trips/:tripId/expert-notes | user-data | session-self | server/routes/booking-actions.ts:1805 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/expert-traveler-note | user-data | session-self | server/routes/trips.routes.ts:3286 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3049 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/occasion | user-data | session-self | server/routes/trips.routes.ts:3400 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:161 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:1998 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | resource-owner | server/routes/content.routes.ts:1888 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/admin/affiliate/partners | admin | admin-role | server/routes/content.routes.ts:8782 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/approve | admin | admin-role | server/routes/admin.routes.ts:9209 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/reject | admin | admin-role | server/routes/admin.routes.ts:9220 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/scrape | admin | admin-role | server/routes/content.routes.ts:8876 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/drafts | admin | admin-role | server/routes/blog.routes.ts:109 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts | admin | admin-role | server/routes/blog.routes.ts:94 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/publish | admin | admin-role | server/routes/blog.routes.ts:125 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/submit | admin | admin-role | server/routes/blog.routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/withdraw | admin | admin-role | server/routes/blog.routes.ts:129 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/exception-refund | admin | admin-role | server/routes/admin.routes.ts:712 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile | admin | admin-role | server/routes/admin.routes.ts:778 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/out-of-band-refund/clear | admin | admin-role | server/routes/admin.routes.ts:633 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/auto-cancel/run | admin | admin-role | server/routes/admin.routes.ts:2128 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/catalog/ingest | admin | admin-role | server/routes/admin.routes.ts:2557 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories | admin | admin-role | server/routes/admin.routes.ts:3547 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories/:categoryId/subcategories | admin | admin-role | server/routes/admin.routes.ts:3723 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules | admin | admin-role | server/routes/admin.routes.ts:8288 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules/auto-index | admin | admin-role | server/routes/admin.routes.ts:8324 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/:trackingNumber/moderate | admin | admin-role | server/routes/admin.routes.ts:4365 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/flags/:flagId/resolve | admin | admin-role | server/routes/admin.routes.ts:4418 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/register | admin | admin-role | server/routes/admin.routes.ts:4310 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/assign-coordinator | admin | admin-role | server/routes/admin.routes.ts:1080 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/review-ledger-gap | admin | admin-role | server/routes/admin.routes.ts:1171 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/approve | admin | admin-role | server/routes/demand.routes.ts:855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/generate | admin | admin-role | server/routes/demand.routes.ts:839 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/withdraw | admin | admin-role | server/routes/demand.routes.ts:871 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/approve | admin | admin-role | server/routes/admin.routes.ts:4070 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4096 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/digest/send-now | admin | admin-role | server/routes/admin.routes.ts:8972 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/refund-rejected-artifact | admin | admin-role | server/routes/admin.routes.ts:1823 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/reject | admin | admin-role | server/routes/admin.routes.ts:1636 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/uphold | admin | admin-role | server/routes/admin.routes.ts:1714 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/analyze-gaps | admin | admin-role | server/routes/admin.routes.ts:2201 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-gaps | admin | admin-role | server/routes/admin.routes.ts:2217 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-kyoto | admin | admin-role | server/routes/admin.routes.ts:2160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-youtube | admin | admin-role | server/routes/admin.routes.ts:2251 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/approve | admin | admin-role | server/routes/admin.routes.ts:2494 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/reject | admin | admin-role | server/routes/admin.routes.ts:2584 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish-batch | admin | admin-role | server/routes/admin.routes.ts:2668 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish/:id | admin | admin-role | server/routes/admin.routes.ts:2623 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/resolve | admin | admin-role | server/routes/admin.routes.ts:2722 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/sync-registry | admin | admin-role | server/routes/admin.routes.ts:2539 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/email-outbox/:id/retry | admin | admin-role | server/routes/admin.routes.ts:9286 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/event-packages | admin | admin-role | server/routes/admin.routes.ts:8527 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-offering-types | admin | admin-role | server/routes/admin.routes.ts:7748 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/approve | admin | admin-role | server/routes/admin.routes.ts:8192 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/reject | admin | admin-role | server/routes/admin.routes.ts:8235 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gems/backfill-photos | admin | admin-role | server/routes/admin.routes.ts:301 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/invoices | admin | admin-role | server/routes/admin.routes.ts:4682 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/assign | admin | admin-role | server/routes/admin.routes.ts:7987 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8090 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets | admin | admin-role | server/routes/admin-markets.routes.ts:186 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets/:slug/refresh-geography | admin | admin-role | server/routes/admin-markets.routes.ts:282 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/ratify | admin | admin-role | server/routes/neighborhood-claims.routes.ts:236 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/rescore | admin | admin-role | server/routes/neighborhood-claims.routes.ts:287 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/return | admin | admin-role | server/routes/neighborhood-claims.routes.ts:262 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/manual-entry | admin | admin-role | server/routes/neighborhood-claims.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/:id/coverage-targets | admin | admin-role | server/routes/admin.routes.ts:8699 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/backfill | admin | admin-role | server/routes/admin.routes.ts:8660 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/optimization-fees | admin | admin-role | server/routes/admin.routes.ts:8464 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/payouts | admin | admin-role | server/routes/admin.routes.ts:5523 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/approve | admin | admin-role | server/routes/admin.routes.ts:3888 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/reject | admin | admin-role | server/routes/admin.routes.ts:3977 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/providers/:userId/remind-stripe | admin | admin-role | server/routes/admin.routes.ts:3191 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/qa/run-nightly | admin | admin-role | server/routes/admin.routes.ts:9123 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/approve | admin | admin-role | server/routes/admin.routes.ts:1231 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/reject | admin | admin-role | server/routes/admin.routes.ts:1374 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/dismiss | admin | admin-role | server/routes/admin.routes.ts:1579 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/refund | admin | admin-role | server/routes/admin.routes.ts:1474 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/reviews/:id/clear-response | admin | admin-role | server/routes/admin.routes.ts:7364 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8100 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/reassign | admin | admin-role | server/routes/admin.routes.ts:8110 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/seed-categories | admin | admin-role | server/routes/admin.routes.ts:3779 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-offering-types | admin | admin-role | server/routes/admin.routes.ts:7695 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-templates | admin | admin-role | server/routes/admin.routes.ts:3352 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/system/test-email | admin | admin-role | server/routes/admin.routes.ts:6565 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/trigger-digest | admin | admin-role | server/routes/admin.routes.ts:8960 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/affiliate-booking-requests | other | resource-owner | server/routes/content.routes.ts:7705 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/claim | other | session-self | server/routes/content.routes.ts:8084 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:8429 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7844 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | session-self | server/routes/content.routes.ts:9280 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:9320 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:751 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:680 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4788 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:5250 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:5379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:799 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:7481 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:7499 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:3088 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:3028 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/recruitment-click | other | session-self | server/routes/content.routes.ts:2961 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:2978 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:311 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:189 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:531 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:69 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:376 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:452 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:490 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/blog/posts/:slug/reactions | other | session-self | server/routes/blog.routes.ts:168 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/bookings | user-data | session-self | server/routes.ts:7179 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/accept-deliverable | user-data | session-self | server/routes/bookings.ts:951 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/cancel | user-data | session-self | server/routes.ts:8158 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/components/:componentServiceId/cancel | user-data | session-self | server/routes.ts:7950 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/confirm-completion | payments | resource-owner | server/routes/bookings.ts:732 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/deliver-artifact | user-data | session-self | server/routes/bookings.ts:1020 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/dispute | payments | resource-owner | server/routes/bookings.ts:810 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/pay-balance | payments | resource-owner | server/routes/payments.routes.ts:2344 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/request-revision | user-data | session-self | server/routes/bookings.ts:977 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:396 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/confirm-payment | payments | resource-owner | server/routes/bookings.ts:256 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/estimate-cost | user-data | session-self | server/routes/bookings.ts:507 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/process-cart | payments | session-self | server/routes/bookings.ts:153 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/refund | payments | resource-owner | server/routes/bookings.ts:609 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/webhooks/stripe | payments | signature | server/routes/bookings.ts:552 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:7396 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:7382 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:3857 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3664 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3823 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3614 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:9424 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/convert-to-itinerary | user-data | resource-owner | server/routes.ts:9745 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/items | user-data | resource-owner | server/routes.ts:7038 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/migrate | user-data | session-self | server/routes.ts:9721 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:9221 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:513 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:683 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/checkout | payments | session-self | server/routes/payments.routes.ts:1085 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:4160 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:3967 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:4208 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:4001 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:534 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:249 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:192 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:437 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:448 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:9387 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:9206 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:9191 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/communication | user-data | session-self | server/routes.ts:12645 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:12628 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:12610 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/conversations | user-data | session-self | server/replit_integrations/chat/routes.ts:53 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/:id/messages | user-data | session-self | server/replit_integrations/chat/routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/start | user-data | session-self | server/routes/conversations.routes.ts:65 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:10960 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:10717 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:10903 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:11030 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:11254 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:11330 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/credits/purchase | payments | session-self | server/routes/payments.routes.ts:286 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | resource-owner | server/routes/content.routes.ts:1070 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:2212 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2255 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/discovery/scan | admin | admin-role | server/routes/content.routes.ts:8597 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/ai-tasks | admin | admin-role | server/routes/ea.routes.ts:624 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/clients | admin | admin-role | server/routes/ea.routes.ts:84 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/clients/:id/push | admin | admin-role | server/routes/ea.routes.ts:185 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/clients/:id/trips | admin | admin-role | server/routes/ea.routes.ts:235 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/communications | admin | admin-role | server/routes/ea.routes.ts:584 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/events | admin | admin-role | server/routes/ea.routes.ts:354 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/executives | admin | admin-role | server/routes/ea.routes.ts:300 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/gifts | admin | admin-role | server/routes/ea.routes.ts:480 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/travel | admin | admin-role | server/routes/ea.routes.ts:423 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ea/venues | admin | admin-role | server/routes/ea.routes.ts:532 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/events/:experienceId/invites | other | session-self | server/routes/guest-invites.ts:172 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/events/:experienceId/invites/send | other | session-self | server/routes/guest-invites.ts:329 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-application | other | session-self | server/routes.ts:2579 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:1983 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2667 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:204 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2730 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:583 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:540 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:763 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:804 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:958 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:5824 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:12095 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:12158 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:12128 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:11996 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1331 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/blog/posts/:id/sign | user-data | session-self | server/routes/blog.routes.ts:141 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:7817 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/component-failed | user-data | session-self | server/routes.ts:7912 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets | user-data | session-self | server/routes/expert-console.routes.ts:640 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets/:id/propose-gem | user-data | session-self | server/routes/expert-console.routes.ts:679 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims | user-data | session-self | server/routes/neighborhood-claims.routes.ts:84 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims/:id/submit | user-data | session-self | server/routes/neighborhood-claims.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made | user-data | resource-owner | server/routes/ready-made.routes.ts:71 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/build-review | user-data | session-self | server/routes/ready-made.routes.ts:782 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/submit | user-data | session-self | server/routes/ready-made.routes.ts:687 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/withdraw | user-data | session-self | server/routes/ready-made.routes.ts:748 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/from-trip/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:8345 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/selected-services | user-data | session-self | server/routes.ts:5598 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings | user-data | session-self | server/routes.ts:5673 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings/:id/submit | user-data | session-self | server/routes.ts:5737 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/:id/duplicate | user-data | session-self | server/routes.ts:6262 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/from-template/:templateId | user-data | session-self | server/routes.ts:6301 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/specializations | user-data | session-self | server/routes.ts:5620 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:334 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:2044 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:7185 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:7168 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:611 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | public-or-system | server/routes/content.routes.ts:4300 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/grok/chat | other | session-self | server/routes/content.routes.ts:4681 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/content/generate | other | session-self | server/routes/content.routes.ts:4532 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/intelligence | other | session-self | server/routes/content.routes.ts:4559 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/itinerary/generate | other | session-self | server/routes/content.routes.ts:4619 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:4358 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/identity/business/create-inquiry | user-data | public-or-system | server/routes/identity.routes.ts:64 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/identity/create-session | user-data | session-self | server/routes/identity.routes.ts:18 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/instagram/data-deletion | other | public-or-system | server/routes/instagram.ts:636 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/deauthorize | other | public-or-system | server/routes/instagram.ts:598 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/disconnect | other | session-self | server/routes/instagram.ts:533 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/instagram/publish | other | session-self | server/routes/instagram.ts:274 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invite-templates | other | session-self | server/routes/guest-invites.ts:671 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invites/:token/origin | other | public-or-system | server/routes/guest-invites.ts:484 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/rsvp | other | public-or-system | server/routes/guest-invites.ts:518 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/travel-plans | other | public-or-system | server/routes/guest-invites.ts:616 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/itinerary-comparisons | other | signature | server/routes.ts:9865 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stop | other | resource-owner | server/routes/plancard.routes.ts:291 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:839 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:53 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | resource-owner | server/routes.ts:10215 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:810 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1516 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2640 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2595 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:1924 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1551 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/landing/moments/event | other | session-self | server/routes/landing.routes.ts:180 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/me/business-advisor | user-data | session-self | server/routes/demand.routes.ts:582 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/ea-invitations/:id/accept | user-data | session-self | server/routes/ea.routes.ts:789 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/ea-invitations/:id/decline | user-data | session-self | server/routes/ea.routes.ts:802 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/listings/booking-mode/decide | user-data | session-self | server/routes/booking-mode-prompt.routes.ts:42 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/offering-requests | user-data | session-self | server/routes/offering-requests.routes.ts:47 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/payment-methods/default | payments | session-self | server/routes/payment-methods.routes.ts:66 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/payment-methods/setup-intent | payments | session-self | server/routes/payment-methods.routes.ts:50 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:51 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/research-prefs | user-data | session-self | server/routes/demand.routes.ts:933 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/services/:serviceId/slots | user-data | session-self | server/routes/expert-console.routes.ts:254 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/services/:serviceId/slots/range | user-data | session-self | server/routes/expert-console.routes.ts:343 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/memberships/checkout | other | session-self | server/routes/payments.routes.ts:3314 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/messages | user-data | session-self | server/routes/messages.ts:172 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:305 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/message/:messageId | user-data | session-self | server/routes/messages.ts:356 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/user/:targetUserId | user-data | session-self | server/routes/messages.ts:380 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/typing/:conversationId | user-data | session-self | server/routes/messages.ts:289 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/notifications/mark-all-read | user-data | session-self | server/routes/content.routes.ts:3171 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/occasions | other | session-self | server/routes/occasions.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-payments | payments | resource-owner | server/routes/optimization.routes.ts:356 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-payments/confirm | payments | resource-owner | server/routes/optimization.routes.ts:539 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:59 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:7345 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/payouts/request | payments | session-self | server/routes/payments.routes.ts:3037 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider-application | other | session-self | server/routes.ts:2808 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:2881 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:10601 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:458 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:7816 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/component-failed | user-data | session-self | server/routes.ts:7911 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:250 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:577 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:786 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/quotes/:quoteId/issue | user-data | session-self | server/routes/service-quotes.routes.ts:153 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/quotes/:quoteId/withdraw | user-data | session-self | server/routes/service-quotes.routes.ts:174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/request-verification-review | user-data | session-self | server/routes.ts:4232 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:3916 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/archive | user-data | session-self | server/routes.ts:4729 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/attestations | user-data | session-self | server/routes/service-attestations.routes.ts:135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/cover-photo | user-data | session-self | server/routes.ts:6680 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6592 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/duplicate | user-data | session-self | server/routes.ts:6283 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/gallery-photo | user-data | session-self | server/routes.ts:6806 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/submit | user-data | session-self | server/routes.ts:4676 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/approve | user-data | session-self | server/routes.ts:3850 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/draft | user-data | session-self | server/routes.ts:3869 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:73 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/push/test | other | session-self | server/routes/push.routes.ts:116 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/qa-sessions/:bookingId/start | other | session-self | server/routes/live-help.routes.ts:96 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quick-start-itinerary | other | session-self | server/routes/trips.routes.ts:882 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/accept | other | session-self | server/routes/service-quotes.routes.ts:119 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/decline | other | session-self | server/routes/service-quotes.routes.ts:131 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ready-made/:id/purchase | payments | session-self | server/routes/ready-made.routes.ts:1267 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ready-made/:id/purchase/confirm | payments | resource-owner | server/routes/ready-made.routes.ts:1347 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/concern | payments | resource-owner | server/routes/ready-made.routes.ts:1439 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/request-revision | payments | resource-owner | server/routes/ready-made.routes.ts:1592 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:8824 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:8854 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:8808 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/reviews/:id/flag | user-data | session-self | server/routes/content.routes.ts:3208 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:4227 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:4263 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-items | user-data | session-self | server/routes/saved-items.routes.ts:38 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-items/shares | user-data | session-self | server/routes/saved-items.routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:456 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:488 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6523 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:6495 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:977 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:1003 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:id/quote-requests | other | session-self | server/routes/service-quotes.routes.ts:82 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:3226 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:525 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:83 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7639 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/preferences | user-data | session-self | server/routes/content.routes.ts:7605 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/stripe/connect/onboard | payments | session-self | server/routes/payments.routes.ts:2855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:9739 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:9622 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:9701 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:9582 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:9556 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:9516 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:9657 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:9492 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:325 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:423 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:613 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:579 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-options/click | other | session-self | server/routes/transport-hub.routes.ts:526 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:4041 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/ai/refresh-all | admin | admin-role | server/routes/content.routes.ts:5869 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/ai/refresh/:cityName/:country | admin | admin-role | server/routes/content.routes.ts:5842 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5896 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5753 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5565 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:381 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:522 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/claim | user-data | session-self | server/routes.ts:1651 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:723 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes.ts:1686 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1462 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:573 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/suggestions | user-data | session-self | server/routes/booking-actions.ts:1071 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/activate-transport | user-data | session-self | server/routes.ts:13199 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisor/narration | user-data | session-self | server/routes/advisor.routes.ts:478 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisors | user-data | resource-owner | server/routes/booking-actions.ts:795 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/alerts | user-data | session-self | server/routes.ts:13417 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/analytics/infer | user-data | resource-owner | server/routes/trips.routes.ts:3028 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor-suggestions | user-data | session-self | server/routes/trips.routes.ts:1868 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor/promote | user-data | session-self | server/routes/plan-option-sets.routes.ts:201 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors | user-data | session-self | server/routes/trips.routes.ts:1651 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors/:anchorId/impacts | user-data | session-self | server/routes/trips.routes.ts:1848 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/budget/calculate-split | user-data | session-self | server/routes.ts:12784 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/calculate-energy | user-data | session-self | server/routes/booking-actions.ts:2084 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/changes | user-data | session-self | server/routes/plancard.routes.ts:604 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts | user-data | session-self | server/routes.ts:12576 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts/:contractId/documents | user-data | session-self | server/routes/trips.routes.ts:1093 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/day-boundaries | user-data | session-self | server/routes/trips.routes.ts:1752 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency-contacts | user-data | session-self | server/routes.ts:13352 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency/initialize | user-data | session-self | server/routes.ts:13369 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/finalize | user-data | resource-owner | server/routes/routing.routes.ts:470 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/generate-presets | user-data | session-self | server/routes/booking-actions.ts:2143 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1678 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/route | user-data | resource-owner | server/routes/routing.routes.ts:135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items | user-data | resource-owner | server/routes.ts:12899 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/optimize-order | user-data | resource-owner | server/routes.ts:13145 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/reorder | user-data | resource-owner | server/routes.ts:13110 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets | user-data | session-self | server/routes/plan-option-sets.routes.ts:123 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/choose | user-data | session-self | server/routes/plan-option-sets.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/close | user-data | session-self | server/routes/plan-option-sets.routes.ts:171 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/options | user-data | session-self | server/routes/plan-option-sets.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/reopen | user-data | session-self | server/routes/plan-option-sets.routes.ts:181 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/suggest | user-data | session-self | server/routes/plan-option-sets.routes.ts:191 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants | user-data | resource-owner | server/routes.ts:12445 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants/bulk-invite | user-data | session-self | server/routes.ts:12481 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals | user-data | resource-owner | server/routes/trips.routes.ts:3630 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/apply | user-data | resource-owner | server/routes/trips.routes.ts:3938 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/discard | user-data | session-self | server/routes/trips.routes.ts:3739 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals/:id/pay | user-data | resource-owner | server/routes/trips.routes.ts:3790 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/reopen | user-data | resource-owner | server/routes/routing.routes.ts:584 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions | user-data | session-self | server/routes.ts:12741 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions/split | user-data | session-self | server/routes.ts:12758 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transport-legs/generate | user-data | session-self | server/routes/transport-legs.routes.ts:99 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase | user-data | session-self | server/routes/trip-pass.routes.ts:67 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase/confirm | user-data | session-self | server/routes/trip-pass.routes.ts:119 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/validate-schedule | user-data | session-self | server/routes/trips.routes.ts:1775 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1151 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/upsell/ai-concierge | other | session-self | server/routes/upsell.routes.ts:887 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/cart | other | session-self | server/routes/upsell.routes.ts:161 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/checkout | other | session-self | server/routes/upsell.routes.ts:781 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/click | other | public-or-system | server/routes/upsell.routes.ts:972 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/upsell/discover-date | other | public-or-system | server/routes/upsell.routes.ts:276 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/upsell/discover-location | other | public-or-system | server/routes/upsell.routes.ts:231 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/upsell/expert-review | other | session-self | server/routes/upsell.routes.ts:641 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:699 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/impression | other | public-or-system | server/routes/upsell.routes.ts:936 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/upsell/optimize-gate | other | session-self | server/routes/upsell.routes.ts:379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/plancard-ontrip | other | session-self | server/routes/upsell.routes.ts:507 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/plancard-pretrip | other | session-self | server/routes/upsell.routes.ts:441 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/upsell/post-booking | other | session-self | server/routes/upsell.routes.ts:833 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1845 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | resource-owner | server/routes/content.routes.ts:1975 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:2528 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3473 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:647 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/wallet/add-credits | payments | session-self | server/routes/payments.routes.ts:280 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:91 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe | payments | signature | server/routes/webhooks.routes.ts:460 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:31 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /internal/jobs/availability-materialization | other | public-or-system | server/routes/internal.routes.ts:246 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-auto-completion | other | public-or-system | server/routes/internal.routes.ts:211 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-expiry | other | public-or-system | server/routes/internal.routes.ts:253 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/checkout-sweep | other | public-or-system | server/routes/internal.routes.ts:234 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/earnings-release | other | public-or-system | server/routes/internal.routes.ts:204 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/email-outbox | other | public-or-system | server/routes/internal.routes.ts:283 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/itinerary-generation-sweep | other | public-or-system | server/routes/internal.routes.ts:274 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/score-neighborhood-claims | other | public-or-system | server/routes/internal.routes.ts:301 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/stripe-reconciliation | other | public-or-system | server/routes/internal.routes.ts:222 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travel-matrix-refresh | other | public-or-system | server/routes/internal.routes.ts:314 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpayouts-report-poll | other | public-or-system | server/routes/internal.routes.ts:261 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/run-occasion-drafts | other | public-or-system | server/routes/internal.routes.ts:186 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PUT /api/admin/neighborhoods/:id/lead | admin | admin-role | server/routes/admin.routes.ts:8773 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/testimonials/featured | admin | admin-role | server/routes/admin.routes.ts:7415 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1686 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2230 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/neighborhood-claims/:id/capture | user-data | session-self | server/routes/neighborhood-claims.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:384 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/me/available-now | user-data | session-self | server/routes/live-help.routes.ts:62 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:540 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/availability-patterns | user-data | session-self | server/routes.ts:3552 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/blackouts | user-data | session-self | server/routes.ts:3702 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/date-ranges | user-data | session-self | server/routes.ts:3627 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/pickup-route-points | user-data | session-self | server/routes.ts:3453 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/route-points | user-data | session-self | server/routes.ts:3399 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:3496 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3822 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:267 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/trips/:tripId/destinations | user-data | session-self | server/routes/trips.routes.ts:479 | Not run: evidence manifest SHA-256 is stale. |
