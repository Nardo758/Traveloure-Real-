# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 0/652**; remaining: **652**.
- Admin: **0/168**; payments: **0/31**; user-data: **0/230**; other: **0/223**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **evidence manifest SHA-256 is stale**; manifest SHA-256: `5af868f262cbcadc259c035579abca0e10533e75ac8d7f21360a2a7cb3ffeee1`; run timestamp: 2026-09-25T00:56:06.499Z.
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
| DELETE /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8703 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3780 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8406 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8671 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7872 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/neighborhoods/:id/coverage-targets/:categoryKey | admin | admin-role | server/routes/admin.routes.ts:8843 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/notifications/:id | admin | admin-role | server/routes.ts:13749 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7820 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3487 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/services/:id | admin | admin-role | server/routes/admin.routes.ts:4703 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/slow-queries | admin | admin-role | server/routes.ts:12626 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3836 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/users/:id | admin | admin-role | server/routes/admin.routes.ts:5980 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1753 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/auth/account | user-data | session-self | server/replit_integrations/auth/routes.ts:203 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/blog/posts/:slug/reactions/:kind | other | session-self | server/routes/blog.routes.ts:221 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/cart | user-data | session-self | server/routes.ts:9970 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/cart/:id | user-data | session-self | server/routes.ts:9952 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/contracts/:id | user-data | session-self | server/routes.ts:12929 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:11254 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:11152 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1187 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2335 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:657 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:169 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/communications/:id | admin | admin-role | server/routes/ea.routes.ts:596 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:325 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:505 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:453 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:557 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7289 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:790 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:703 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/ready-made/build/:id | user-data | resource-owner | server/routes/ready-made.routes.ts:324 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/selected-services/:serviceOfferingId | user-data | session-self | server/routes.ts:5854 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:6009 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/specializations/:specialization | user-data | session-self | server/routes.ts:5892 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:424 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2140 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:422 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/ea-links/:id | user-data | session-self | server/routes/ea.routes.ts:815 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/payment-methods/:id | payments | session-self | server/routes/payment-methods.routes.ts:85 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:114 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:286 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:330 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:3234 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:163 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/participants/:id | user-data | session-self | server/routes/content.routes.ts:7190 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/plans/:id/feedback | other | session-self | server/routes/feedback.routes.ts:73 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:10931 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:487 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:445 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:764 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:899 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/services/:id | user-data | session-self | server/routes.ts:4949 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:100 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/saved-items/:id | user-data | session-self | server/routes/saved-items.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/saved-items/shares/:shareId | user-data | session-self | server/routes/saved-items.routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7251 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:615 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/changes/:changeId | user-data | session-self | server/routes/plancard.routes.ts:1015 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3286 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/option-sets/:setId/options/:optionId | user-data | session-self | server/routes/plan-option-sets.routes.ts:199 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:300 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2076 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1992 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8680 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/affiliate/reconciliation/:earningId | admin | admin-role | server/routes/admin.routes.ts:4277 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/blog/posts/:id | admin | admin-role | server/routes/blog.routes.ts:162 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/bookings/auto-cancel/config | admin | admin-role | server/routes/admin.routes.ts:2121 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3667 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/contact-submissions/:id | admin | admin-role | server/routes/admin.routes.ts:2806 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8394 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-sources/:id | admin | admin-role | server/routes/content-sources.routes.ts:58 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8644 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/evidence-thresholds/:key | admin | admin-role | server/routes/neighborhood-claims.routes.ts:310 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3042 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:2895 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7850 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-templates/:id/roles | admin | admin-role | server/routes/admin.routes.ts:3542 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/fee-bands/:bandKey | admin | admin-role | server/routes/admin.routes.ts:7564 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/invoices/:invoiceNumber/status | admin | admin-role | server/routes/admin.routes.ts:4836 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/lead-routing-logs/:id/override | admin | admin-role | server/routes/admin.routes.ts:8002 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/message-reports/:id | admin | admin-role | server/routes/admin.routes.ts:7359 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/neighborhoods/:id/adjacency | admin | admin-role | server/routes/admin.routes.ts:8972 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/:id/read | admin | admin-role | server/routes.ts:13715 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/read-all | admin | admin-role | server/routes.ts:13775 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/payouts/:id | admin | admin-role | server/routes/admin.routes.ts:5670 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/platform-settings/:settingKey | admin | admin-role | server/routes/admin.routes.ts:7903 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3375 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:3254 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/ready-made/:id/badge | admin | admin-role | server/routes/admin.routes.ts:1351 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/reviews/:id/status | admin | admin-role | server/routes/admin.routes.ts:7424 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7797 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-requests/:id | admin | admin-role | server/routes/service-requests.routes.ts:116 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3465 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/affinity-tags | admin | admin-role | server/routes/admin.routes.ts:4677 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/featured | admin | admin-role | server/routes/admin.routes.ts:4661 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/status | admin | admin-role | server/routes/admin.routes.ts:4642 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3814 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/commission-override | admin | admin-role | server/routes/admin.routes.ts:3134 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/suspend | admin | admin-role | server/routes/admin.routes.ts:9095 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/unsuspend | admin | admin-role | server/routes/admin.routes.ts:9261 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/verification | admin | admin-role | server/routes/admin.routes.ts:3078 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:7968 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/cart/:id | user-data | session-self | server/routes.ts:9880 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:316 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/contracts/:id | user-data | session-self | server/routes.ts:12860 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:11212 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:11047 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:11075 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1151 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:636 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:142 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:375 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:312 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:492 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/preferences | admin | admin-role | server/routes/ea.routes.ts:729 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:435 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:544 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7271 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:435 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2900 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:860 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:914 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:931 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:426 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1353 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:7896 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:655 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/neighborhoods | user-data | session-self | server/routes.ts:5658 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/photo | user-data | session-self | server/routes.ts:5817 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile | user-data | session-self | server/routes.ts:5729 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile-notes | user-data | session-self | server/routes.ts:5705 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/:id | user-data | session-self | server/routes/ready-made.routes.ts:655 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/build/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:288 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:74 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:5961 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:6468 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2118 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2730 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:95 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/home-city | user-data | session-self | server/routes/occasions.routes.ts:190 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/itinerary-email-preferences | user-data | session-self | server/routes/itinerary-email-preferences.routes.ts:48 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/notification-email | user-data | session-self | server/routes/storefront.routes.ts:1576 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/preferences | user-data | session-self | server/routes/storefront.routes.ts:270 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/storefront | user-data | session-self | server/routes/storefront.routes.ts:339 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/travel-preferences | user-data | session-self | server/routes/storefront.routes.ts:416 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/traveler-profile | user-data | session-self | server/routes/traveler-profile.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/vacation | user-data | session-self | server/routes/vacation.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/:messageId/read | user-data | session-self | server/routes/messages.ts:250 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/conversation/:conversationId/read-all | user-data | session-self | server/routes/messages.ts:266 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:3212 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:123 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/participants/:id | user-data | resource-owner | server/routes/content.routes.ts:7126 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/participants/:id/rsvp | user-data | session-self | server/routes/content.routes.ts:7152 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/profile | user-data | session-self | server/replit_integrations/auth/routes.ts:87 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:3002 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:10907 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:7900 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:345 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:721 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:852 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:4487 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:125 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:8358 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:8293 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:191 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7233 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2271 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:933 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:573 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:1177 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/trips/:tripId/expert-notes | user-data | session-self | server/routes/booking-actions.ts:1809 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/expert-traveler-note | user-data | session-self | server/routes/trips.routes.ts:3352 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3105 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/occasion | user-data | session-self | server/routes/trips.routes.ts:3466 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:216 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2053 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | resource-owner | server/routes/content.routes.ts:1943 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/admin/affiliate/partners | admin | admin-role | server/routes/content.routes.ts:8617 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/approve | admin | admin-role | server/routes/admin.routes.ts:9305 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/page-extract | admin | admin-role | server/routes/content.routes.ts:8721 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/reject | admin | admin-role | server/routes/admin.routes.ts:9316 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/scrape | admin | admin-role | server/routes/content.routes.ts:8740 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/drafts | admin | admin-role | server/routes/blog.routes.ts:117 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/event-guides | admin | admin-role | server/routes/blog.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts | admin | admin-role | server/routes/blog.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/publish | admin | admin-role | server/routes/blog.routes.ts:172 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/submit | admin | admin-role | server/routes/blog.routes.ts:168 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/withdraw | admin | admin-role | server/routes/blog.routes.ts:176 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/race-weekends | admin | admin-role | server/routes/blog.routes.ts:156 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/series-follows | admin | admin-role | server/routes/blog.routes.ts:144 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/travelpulse-weekly | admin | admin-role | server/routes/blog.routes.ts:126 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/exception-refund | admin | admin-role | server/routes/admin.routes.ts:721 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile | admin | admin-role | server/routes/admin.routes.ts:787 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/out-of-band-refund/clear | admin | admin-role | server/routes/admin.routes.ts:642 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/auto-cancel/run | admin | admin-role | server/routes/admin.routes.ts:2143 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/catalog/ingest | admin | admin-role | server/routes/admin.routes.ts:2570 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories | admin | admin-role | server/routes/admin.routes.ts:3615 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories/:categoryId/subcategories | admin | admin-role | server/routes/admin.routes.ts:3791 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules | admin | admin-role | server/routes/admin.routes.ts:8383 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules/auto-index | admin | admin-role | server/routes/admin.routes.ts:8419 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources | admin | admin-role | server/routes/content-sources.routes.ts:48 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/activate | admin | admin-role | server/routes/content-sources.routes.ts:66 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/deactivate | admin | admin-role | server/routes/content-sources.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/public-ok | admin | admin-role | server/routes/content-sources.routes.ts:82 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/:trackingNumber/moderate | admin | admin-role | server/routes/admin.routes.ts:4455 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/flags/:flagId/resolve | admin | admin-role | server/routes/admin.routes.ts:4508 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/register | admin | admin-role | server/routes/admin.routes.ts:4400 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/assign-coordinator | admin | admin-role | server/routes/admin.routes.ts:1089 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/review-ledger-gap | admin | admin-role | server/routes/admin.routes.ts:1180 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/approve | admin | admin-role | server/routes/demand.routes.ts:855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/generate | admin | admin-role | server/routes/demand.routes.ts:839 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/withdraw | admin | admin-role | server/routes/demand.routes.ts:871 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/approve | admin | admin-role | server/routes/admin.routes.ts:4154 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4180 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/digest/send-now | admin | admin-role | server/routes/admin.routes.ts:9067 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/refund-rejected-artifact | admin | admin-role | server/routes/admin.routes.ts:1832 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/reject | admin | admin-role | server/routes/admin.routes.ts:1645 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/uphold | admin | admin-role | server/routes/admin.routes.ts:1723 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/analyze-gaps | admin | admin-role | server/routes/admin.routes.ts:2216 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-gaps | admin | admin-role | server/routes/admin.routes.ts:2232 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-kyoto | admin | admin-role | server/routes/admin.routes.ts:2175 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-youtube | admin | admin-role | server/routes/admin.routes.ts:2266 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/approve | admin | admin-role | server/routes/admin.routes.ts:2507 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/reject | admin | admin-role | server/routes/admin.routes.ts:2597 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish-batch | admin | admin-role | server/routes/admin.routes.ts:2681 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish/:id | admin | admin-role | server/routes/admin.routes.ts:2636 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/resolve | admin | admin-role | server/routes/admin.routes.ts:2735 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/sync-registry | admin | admin-role | server/routes/admin.routes.ts:2552 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/email-outbox/:id/retry | admin | admin-role | server/routes/admin.routes.ts:9382 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/event-packages | admin | admin-role | server/routes/admin.routes.ts:8622 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-offering-types | admin | admin-role | server/routes/admin.routes.ts:7840 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/approve | admin | admin-role | server/routes/admin.routes.ts:8287 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/reject | admin | admin-role | server/routes/admin.routes.ts:8330 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gems/backfill-photos | admin | admin-role | server/routes/admin.routes.ts:310 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/invoices | admin | admin-role | server/routes/admin.routes.ts:4772 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/assign | admin | admin-role | server/routes/admin.routes.ts:8082 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8185 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets | admin | admin-role | server/routes/admin-markets.routes.ts:186 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets/:slug/refresh-geography | admin | admin-role | server/routes/admin-markets.routes.ts:282 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/ratify | admin | admin-role | server/routes/neighborhood-claims.routes.ts:236 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/rescore | admin | admin-role | server/routes/neighborhood-claims.routes.ts:287 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/return | admin | admin-role | server/routes/neighborhood-claims.routes.ts:262 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/manual-entry | admin | admin-role | server/routes/neighborhood-claims.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/:id/coverage-targets | admin | admin-role | server/routes/admin.routes.ts:8794 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/backfill | admin | admin-role | server/routes/admin.routes.ts:8755 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/optimization-fees | admin | admin-role | server/routes/admin.routes.ts:8559 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/payouts | admin | admin-role | server/routes/admin.routes.ts:5604 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/approve | admin | admin-role | server/routes/admin.routes.ts:3972 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4061 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/providers/:userId/remind-stripe | admin | admin-role | server/routes/admin.routes.ts:3235 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/qa/run-nightly | admin | admin-role | server/routes/admin.routes.ts:9219 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/approve | admin | admin-role | server/routes/admin.routes.ts:1240 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/reject | admin | admin-role | server/routes/admin.routes.ts:1383 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/dismiss | admin | admin-role | server/routes/admin.routes.ts:1588 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/refund | admin | admin-role | server/routes/admin.routes.ts:1483 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/reviews/:id/clear-response | admin | admin-role | server/routes/admin.routes.ts:7445 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8195 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/reassign | admin | admin-role | server/routes/admin.routes.ts:8205 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/seed-categories | admin | admin-role | server/routes/admin.routes.ts:3847 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-offering-types | admin | admin-role | server/routes/admin.routes.ts:7787 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-templates | admin | admin-role | server/routes/admin.routes.ts:3420 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/system/test-email | admin | admin-role | server/routes/admin.routes.ts:6646 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/trigger-digest | admin | admin-role | server/routes/admin.routes.ts:9055 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/affiliate-booking-requests | other | resource-owner | server/routes/content.routes.ts:7531 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/claim | other | session-self | server/routes/content.routes.ts:7910 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:8263 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7670 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | session-self | server/routes/content.routes.ts:9149 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:9189 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:800 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:729 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4582 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:5096 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:5232 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:848 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:7307 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:7325 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:3143 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:3083 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/recruitment-click | other | session-self | server/routes/content.routes.ts:3016 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:3033 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:312 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:190 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:538 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:70 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:377 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:459 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:497 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/blog/posts/:slug/reactions | other | session-self | server/routes/blog.routes.ts:215 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/bookings | user-data | session-self | server/routes.ts:7429 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/accept-deliverable | user-data | session-self | server/routes/bookings.ts:998 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/cancel | user-data | session-self | server/routes.ts:8408 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/components/:componentServiceId/cancel | user-data | session-self | server/routes.ts:8200 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/confirm-completion | payments | resource-owner | server/routes/bookings.ts:779 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/deliver-artifact | user-data | session-self | server/routes/bookings.ts:1067 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/dispute | payments | resource-owner | server/routes/bookings.ts:857 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/pay-balance | payments | resource-owner | server/routes/payments.routes.ts:2471 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/request-revision | user-data | session-self | server/routes/bookings.ts:1024 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/resume-payment | user-data | session-self | server/routes/payments.routes.ts:2406 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:411 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/confirm-payment | payments | resource-owner | server/routes/bookings.ts:263 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/estimate-cost | user-data | session-self | server/routes/bookings.ts:529 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/process-cart | payments | session-self | server/routes/bookings.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/refund | payments | resource-owner | server/routes/bookings.ts:656 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/webhooks/stripe | payments | signature | server/routes/bookings.ts:650 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:7222 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:7208 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:3912 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3719 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3878 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3669 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:9685 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/convert-to-itinerary | user-data | resource-owner | server/routes.ts:10006 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/items | user-data | resource-owner | server/routes.ts:7288 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/migrate | user-data | session-self | server/routes.ts:9982 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:9482 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:547 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:690 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/checkout | payments | session-self | server/routes/payments.routes.ts:1135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:4217 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:4024 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:4265 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:4058 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:534 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:249 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:192 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:437 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:482 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:9256 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:9075 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:9060 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/communication | user-data | session-self | server/routes.ts:12912 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:12895 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:12877 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/conversations | user-data | session-self | server/replit_integrations/chat/routes.ts:53 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/:id/messages | user-data | session-self | server/replit_integrations/chat/routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/start | user-data | session-self | server/routes/conversations.routes.ts:66 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:11238 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:10995 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:11181 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:11308 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:11532 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:11608 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/credits/purchase | payments | session-self | server/routes/payments.routes.ts:283 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | resource-owner | server/routes/content.routes.ts:1125 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:2267 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2310 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/discovery/scan | admin | admin-role | server/routes/content.routes.ts:8431 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/expert-application | other | session-self | server/routes.ts:2722 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:2090 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2816 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:205 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:117 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2763 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:584 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:541 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:764 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:805 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:380 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:978 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:6072 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:12366 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:12429 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:12399 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:12270 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1335 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/blog/posts/:id/sign | user-data | session-self | server/routes/blog.routes.ts:188 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:8067 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8162 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/inbox/questions/:id/answer | user-data | session-self | server/routes/expert-inbox-questions.routes.ts:43 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets | user-data | session-self | server/routes/expert-console.routes.ts:640 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets/:id/propose-gem | user-data | session-self | server/routes/expert-console.routes.ts:679 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims | user-data | session-self | server/routes/neighborhood-claims.routes.ts:84 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims/:id/submit | user-data | session-self | server/routes/neighborhood-claims.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made | user-data | resource-owner | server/routes/ready-made.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/build-review | user-data | session-self | server/routes/ready-made.routes.ts:879 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/submit | user-data | session-self | server/routes/ready-made.routes.ts:784 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/withdraw | user-data | session-self | server/routes/ready-made.routes.ts:845 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/from-trip/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:163 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:8595 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/selected-services | user-data | session-self | server/routes.ts:5846 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings | user-data | session-self | server/routes.ts:5921 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings/:id/submit | user-data | session-self | server/routes.ts:5985 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/:id/duplicate | user-data | session-self | server/routes.ts:6510 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/from-template/:templateId | user-data | session-self | server/routes.ts:6549 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/specializations | user-data | session-self | server/routes.ts:5868 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:336 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:2099 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:7011 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:6994 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:660 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | session-self | server/routes/content.routes.ts:4359 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:4417 | Other-category endpoint is intentionally outside the strict tested set. |
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
| POST /api/itinerary-comparisons | other | signature | server/routes.ts:10126 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stop | other | resource-owner | server/routes/plancard.routes.ts:355 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stops | other | resource-owner | server/routes/plancard.routes.ts:513 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:846 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:69 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | resource-owner | server/routes.ts:10491 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:817 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1502 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2673 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2628 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:1943 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1537 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/landing/moments/event | other | session-self | server/routes/landing.routes.ts:204 | Other-category endpoint is intentionally outside the strict tested set. |
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
| POST /api/memberships/checkout | other | session-self | server/routes/payments.routes.ts:3449 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/messages | user-data | session-self | server/routes/messages.ts:173 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:313 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/message/:messageId | user-data | session-self | server/routes/messages.ts:364 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/user/:targetUserId | user-data | session-self | server/routes/messages.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/typing/:conversationId | user-data | session-self | server/routes/messages.ts:297 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/notifications/mark-all-read | user-data | session-self | server/routes/content.routes.ts:3226 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/occasions | other | session-self | server/routes/occasions.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-payments | payments | resource-owner | server/routes/optimization.routes.ts:372 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-payments/confirm | payments | resource-owner | server/routes/optimization.routes.ts:541 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:67 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:7171 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/payouts/request | payments | session-self | server/routes/payments.routes.ts:3172 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/plans/:id/feedback | other | session-self | server/routes/feedback.routes.ts:53 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-application | other | session-self | server/routes.ts:2963 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:3036 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:10879 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:460 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:8066 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8161 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:250 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:577 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:786 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/quotes/:quoteId/issue | user-data | session-self | server/routes/service-quotes.routes.ts:153 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/quotes/:quoteId/withdraw | user-data | session-self | server/routes/service-quotes.routes.ts:174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/request-verification-review | user-data | session-self | server/routes.ts:4448 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:4093 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/archive | user-data | session-self | server/routes.ts:4979 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/attestations | user-data | session-self | server/routes/service-attestations.routes.ts:135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/cover-photo | user-data | session-self | server/routes.ts:6930 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6842 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/duplicate | user-data | session-self | server/routes.ts:6531 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/gallery-photo | user-data | session-self | server/routes.ts:7056 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/submit | user-data | session-self | server/routes.ts:4926 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/approve | user-data | session-self | server/routes.ts:4027 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/draft | user-data | session-self | server/routes.ts:4046 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:73 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/push/test | other | session-self | server/routes/push.routes.ts:116 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/qa-sessions/:bookingId/start | other | session-self | server/routes/live-help.routes.ts:96 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quick-start-itinerary | other | session-self | server/routes/trips.routes.ts:889 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/accept | other | session-self | server/routes/service-quotes.routes.ts:119 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/decline | other | session-self | server/routes/service-quotes.routes.ts:131 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ready-made/:id/purchase | payments | session-self | server/routes/ready-made.routes.ts:1370 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ready-made/:id/purchase/confirm | payments | resource-owner | server/routes/ready-made.routes.ts:1450 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/concern | payments | resource-owner | server/routes/ready-made.routes.ts:1542 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/request-revision | payments | resource-owner | server/routes/ready-made.routes.ts:1695 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:9074 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:9104 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:9058 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/reviews/:id/flag | user-data | session-self | server/routes/content.routes.ts:3263 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:4284 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:4320 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-items | user-data | session-self | server/routes/saved-items.routes.ts:38 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-items/shares | user-data | session-self | server/routes/saved-items.routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:457 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:489 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6378 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:6350 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:1032 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:1058 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:id/quote-requests | other | session-self | server/routes/service-quotes.routes.ts:82 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:3281 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:526 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7465 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/preferences | user-data | session-self | server/routes/content.routes.ts:7431 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/stripe/connect/onboard | payments | session-self | server/routes/payments.routes.ts:2990 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:9608 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:9491 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:9570 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:9451 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:9425 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:9385 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:9526 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:9361 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:325 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:430 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:620 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:586 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-options/click | other | session-self | server/routes/transport-hub.routes.ts:533 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:4098 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/ai/refresh-all | admin | admin-role | server/routes/content.routes.ts:5722 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/ai/refresh/:cityName/:country | admin | admin-role | server/routes/content.routes.ts:5695 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5749 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5606 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5418 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:381 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:529 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/claim | user-data | session-self | server/routes.ts:1717 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:724 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes.ts:1752 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1466 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:574 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/suggestions | user-data | session-self | server/routes/booking-actions.ts:1075 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/activate-transport | user-data | session-self | server/routes.ts:13468 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisor/narration | user-data | session-self | server/routes/advisor.routes.ts:478 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisors | user-data | resource-owner | server/routes/booking-actions.ts:796 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/alerts | user-data | session-self | server/routes.ts:13695 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/analytics/infer | user-data | resource-owner | server/routes/trips.routes.ts:3061 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor-suggestions | user-data | session-self | server/routes/trips.routes.ts:1887 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor/promote | user-data | session-self | server/routes/plan-option-sets.routes.ts:252 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors | user-data | session-self | server/routes/trips.routes.ts:1637 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors/:anchorId/impacts | user-data | session-self | server/routes/trips.routes.ts:1867 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/budget/calculate-split | user-data | session-self | server/routes.ts:13051 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/calculate-energy | user-data | session-self | server/routes/booking-actions.ts:2088 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/changes | user-data | session-self | server/routes/plancard.routes.ts:897 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts | user-data | session-self | server/routes.ts:12843 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts/:contractId/documents | user-data | session-self | server/routes/trips.routes.ts:1088 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/day-boundaries | user-data | session-self | server/routes/trips.routes.ts:1792 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/days/:day/retime | user-data | session-self | server/routes/versions.routes.ts:77 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency-contacts | user-data | session-self | server/routes.ts:13630 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency/initialize | user-data | session-self | server/routes.ts:13647 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/finalize | user-data | resource-owner | server/routes/routing.routes.ts:472 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/flight-lookup | user-data | session-self | server/routes/trips.routes.ts:1682 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/generate-presets | user-data | session-self | server/routes/booking-actions.ts:2147 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1682 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/route | user-data | resource-owner | server/routes/routing.routes.ts:137 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items | user-data | resource-owner | server/routes.ts:13148 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items/:itemId/fresh-facts | user-data | session-self | server/routes/content-facts.routes.ts:27 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/optimize-order | user-data | resource-owner | server/routes.ts:13414 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/reorder | user-data | resource-owner | server/routes.ts:13379 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets | user-data | session-self | server/routes/plan-option-sets.routes.ts:171 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/choose | user-data | session-self | server/routes/plan-option-sets.routes.ts:208 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/close | user-data | session-self | server/routes/plan-option-sets.routes.ts:222 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/options | user-data | session-self | server/routes/plan-option-sets.routes.ts:182 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/reopen | user-data | session-self | server/routes/plan-option-sets.routes.ts:232 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/suggest | user-data | session-self | server/routes/plan-option-sets.routes.ts:242 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants | user-data | resource-owner | server/routes.ts:12712 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants/bulk-invite | user-data | session-self | server/routes.ts:12748 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/place-facts/:factId/confirm | user-data | session-self | server/routes/content-facts.routes.ts:61 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals | user-data | resource-owner | server/routes/trips.routes.ts:3696 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/apply | user-data | resource-owner | server/routes/trips.routes.ts:4004 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/discard | user-data | session-self | server/routes/trips.routes.ts:3805 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals/:id/pay | user-data | resource-owner | server/routes/trips.routes.ts:3856 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/reopen | user-data | resource-owner | server/routes/routing.routes.ts:599 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/slip-events | user-data | session-self | server/routes/plan-option-sets.routes.ts:263 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions | user-data | session-self | server/routes.ts:13008 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions/split | user-data | session-self | server/routes.ts:13025 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transport-legs/generate | user-data | session-self | server/routes/transport-legs.routes.ts:117 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase | user-data | session-self | server/routes/trip-pass.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase/confirm | user-data | session-self | server/routes/trip-pass.routes.ts:120 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/validate-schedule | user-data | session-self | server/routes/trips.routes.ts:1815 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1146 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/versions/apply-days | user-data | session-self | server/routes/versions.routes.ts:58 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/where-to-stay | user-data | session-self | server/routes/plan-option-sets.routes.ts:327 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1900 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | resource-owner | server/routes/content.routes.ts:2030 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:2663 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3528 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:649 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/wallet/add-credits | payments | session-self | server/routes/payments.routes.ts:277 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:103 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe | payments | signature | server/routes/webhooks.routes.ts:530 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:37 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /email-preferences | other | session-self | server/routes/itinerary-email-preferences.routes.ts:78 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /email-preferences/unsubscribe/:token | other | resource-owner | server/routes/itinerary-email-preferences.routes.ts:110 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /internal/jobs/availability-materialization | other | public-or-system | server/routes/internal.routes.ts:287 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-auto-completion | other | public-or-system | server/routes/internal.routes.ts:244 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-expiry | other | public-or-system | server/routes/internal.routes.ts:300 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/checkout-sweep | other | public-or-system | server/routes/internal.routes.ts:273 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/earnings-release | other | public-or-system | server/routes/internal.routes.ts:230 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/email-outbox | other | public-or-system | server/routes/internal.routes.ts:335 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/facts-recheck | other | public-or-system | server/routes/internal.routes.ts:396 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/itinerary-generation-sweep | other | public-or-system | server/routes/internal.routes.ts:326 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/leg-google-coords | other | public-or-system | server/routes/internal.routes.ts:404 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/score-neighborhood-claims | other | public-or-system | server/routes/internal.routes.ts:353 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/stripe-reconciliation | other | public-or-system | server/routes/internal.routes.ts:255 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travel-matrix-refresh | other | public-or-system | server/routes/internal.routes.ts:373 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpayouts-report-poll | other | public-or-system | server/routes/internal.routes.ts:308 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpulse-weekly | other | public-or-system | server/routes/internal.routes.ts:388 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/run-occasion-drafts | other | public-or-system | server/routes/internal.routes.ts:212 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PUT /api/admin/neighborhoods/:id/lead | admin | admin-role | server/routes/admin.routes.ts:8868 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/testimonials/featured | admin | admin-role | server/routes/admin.routes.ts:7496 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1726 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2285 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/neighborhood-claims/:id/capture | user-data | session-self | server/routes/neighborhood-claims.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:386 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/me/available-now | user-data | session-self | server/routes/live-help.routes.ts:62 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:542 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/availability-patterns | user-data | session-self | server/routes.ts:3707 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/blackouts | user-data | session-self | server/routes.ts:3871 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/date-ranges | user-data | session-self | server/routes.ts:3788 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/pickup-route-points | user-data | session-self | server/routes.ts:3608 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/route-points | user-data | session-self | server/routes.ts:3554 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:3651 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3999 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:267 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/trips/:tripId/destinations | user-data | session-self | server/routes/trips.routes.ts:486 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/trips/:tripId/itinerary-items/:itemId/lock | user-data | session-self | server/routes/trips.routes.ts:3089 | Not run: evidence manifest SHA-256 is stale. |
