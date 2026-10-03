# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 0/638**; remaining: **638**.
- Admin: **0/167**; payments: **0/31**; user-data: **0/223**; other: **0/217**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **evidence manifest SHA-256 is stale**; manifest SHA-256: `b5751ccdf5d2399b9056500949cbe93794f4ead68c53bfeab38c4c650cbba571`; run timestamp: 2026-09-25T00:56:06.499Z.
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
| DELETE /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8663 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3773 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8385 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8650 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7854 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/neighborhoods/:id/coverage-targets/:categoryKey | admin | admin-role | server/routes/admin.routes.ts:8822 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/notifications/:id | admin | admin-role | server/routes.ts:13638 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7802 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3480 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/services/:id | admin | admin-role | server/routes/admin.routes.ts:4696 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/slow-queries | admin | admin-role | server/routes.ts:12515 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3829 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/users/:id | admin | admin-role | server/routes/admin.routes.ts:5973 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1692 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/auth/account | user-data | session-self | server/replit_integrations/auth/routes.ts:203 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/blog/posts/:slug/reactions/:kind | other | session-self | server/routes/blog.routes.ts:221 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/cart | user-data | session-self | server/routes.ts:9859 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/cart/:id | user-data | session-self | server/routes.ts:9841 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/contracts/:id | user-data | session-self | server/routes.ts:12818 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:11143 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:11041 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1177 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2325 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:657 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:169 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/communications/:id | admin | admin-role | server/routes/ea.routes.ts:596 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:325 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:505 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:453 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:557 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7249 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:789 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:703 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/ready-made/build/:id | user-data | resource-owner | server/routes/ready-made.routes.ts:321 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/selected-services/:serviceOfferingId | user-data | session-self | server/routes.ts:5743 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:5898 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/specializations/:specialization | user-data | session-self | server/routes.ts:5781 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:424 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2130 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:422 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/ea-links/:id | user-data | session-self | server/routes/ea.routes.ts:815 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/payment-methods/:id | payments | session-self | server/routes/payment-methods.routes.ts:85 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:114 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:286 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:330 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:3224 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:163 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/participants/:id | user-data | session-self | server/routes/content.routes.ts:7150 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:10820 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:487 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:445 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:764 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:899 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/services/:id | user-data | session-self | server/routes.ts:4836 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:100 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/saved-items/:id | user-data | session-self | server/routes/saved-items.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/saved-items/shares/:shareId | user-data | session-self | server/routes/saved-items.routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7211 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:608 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/changes/:changeId | user-data | session-self | server/routes/plancard.routes.ts:909 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3209 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/option-sets/:setId/options/:optionId | user-data | session-self | server/routes/plan-option-sets.routes.ts:185 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:218 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2066 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1982 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8640 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/affiliate/reconciliation/:earningId | admin | admin-role | server/routes/admin.routes.ts:4270 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/blog/posts/:id | admin | admin-role | server/routes/blog.routes.ts:162 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/bookings/auto-cancel/config | admin | admin-role | server/routes/admin.routes.ts:2114 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:3660 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/contact-submissions/:id | admin | admin-role | server/routes/admin.routes.ts:2799 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:8373 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-sources/:id | admin | admin-role | server/routes/content-sources.routes.ts:55 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:8623 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/evidence-thresholds/:key | admin | admin-role | server/routes/neighborhood-claims.routes.ts:310 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3035 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:2888 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7832 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-templates/:id/roles | admin | admin-role | server/routes/admin.routes.ts:3535 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/fee-bands/:bandKey | admin | admin-role | server/routes/admin.routes.ts:7557 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/invoices/:invoiceNumber/status | admin | admin-role | server/routes/admin.routes.ts:4829 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/lead-routing-logs/:id/override | admin | admin-role | server/routes/admin.routes.ts:7981 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/message-reports/:id | admin | admin-role | server/routes/admin.routes.ts:7352 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/neighborhoods/:id/adjacency | admin | admin-role | server/routes/admin.routes.ts:8951 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/:id/read | admin | admin-role | server/routes.ts:13604 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/read-all | admin | admin-role | server/routes.ts:13664 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/payouts/:id | admin | admin-role | server/routes/admin.routes.ts:5663 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/platform-settings/:settingKey | admin | admin-role | server/routes/admin.routes.ts:7885 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3368 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:3247 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/ready-made/:id/badge | admin | admin-role | server/routes/admin.routes.ts:1344 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/reviews/:id/status | admin | admin-role | server/routes/admin.routes.ts:7417 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:7779 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-requests/:id | admin | admin-role | server/routes/service-requests.routes.ts:116 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3458 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/affinity-tags | admin | admin-role | server/routes/admin.routes.ts:4670 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/featured | admin | admin-role | server/routes/admin.routes.ts:4654 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/status | admin | admin-role | server/routes/admin.routes.ts:4635 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:3807 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/commission-override | admin | admin-role | server/routes/admin.routes.ts:3127 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/suspend | admin | admin-role | server/routes/admin.routes.ts:9074 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/unsuspend | admin | admin-role | server/routes/admin.routes.ts:9240 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/verification | admin | admin-role | server/routes/admin.routes.ts:3071 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:7928 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/cart/:id | user-data | session-self | server/routes.ts:9769 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:316 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/contracts/:id | user-data | session-self | server/routes.ts:12749 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:11101 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:10936 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:10964 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1141 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:636 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:142 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:375 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:312 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:492 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/preferences | admin | admin-role | server/routes/ea.routes.ts:729 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:435 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:544 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7231 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:434 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2856 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:859 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:913 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:930 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:425 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1349 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:7785 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:655 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/neighborhoods | user-data | session-self | server/routes.ts:5547 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/photo | user-data | session-self | server/routes.ts:5706 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile | user-data | session-self | server/routes.ts:5618 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile-notes | user-data | session-self | server/routes.ts:5594 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/:id | user-data | session-self | server/routes/ready-made.routes.ts:575 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/build/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:285 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:74 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:5850 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:6357 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2108 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2686 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:95 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/home-city | user-data | session-self | server/routes/occasions.routes.ts:190 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/notification-email | user-data | session-self | server/routes/storefront.routes.ts:1576 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/preferences | user-data | session-self | server/routes/storefront.routes.ts:270 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/storefront | user-data | session-self | server/routes/storefront.routes.ts:339 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/travel-preferences | user-data | session-self | server/routes/storefront.routes.ts:416 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/traveler-profile | user-data | session-self | server/routes/traveler-profile.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/vacation | user-data | session-self | server/routes/vacation.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/:messageId/read | user-data | session-self | server/routes/messages.ts:250 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/conversation/:conversationId/read-all | user-data | session-self | server/routes/messages.ts:266 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:3202 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:123 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/participants/:id | user-data | resource-owner | server/routes/content.routes.ts:7086 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/participants/:id/rsvp | user-data | session-self | server/routes/content.routes.ts:7112 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/profile | user-data | session-self | server/replit_integrations/auth/routes.ts:87 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:2962 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:10796 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:7789 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:345 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:721 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:852 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:4408 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:125 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:8247 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:8182 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:191 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7193 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2230 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:827 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:566 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:1173 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/trips/:tripId/expert-notes | user-data | session-self | server/routes/booking-actions.ts:1805 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/expert-traveler-note | user-data | session-self | server/routes/trips.routes.ts:3275 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3038 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/occasion | user-data | session-self | server/routes/trips.routes.ts:3389 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:161 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2043 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | resource-owner | server/routes/content.routes.ts:1933 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/admin/affiliate/partners | admin | admin-role | server/routes/content.routes.ts:8577 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/approve | admin | admin-role | server/routes/admin.routes.ts:9284 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/page-extract | admin | admin-role | server/routes/content.routes.ts:8681 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/reject | admin | admin-role | server/routes/admin.routes.ts:9295 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/scrape | admin | admin-role | server/routes/content.routes.ts:8700 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/drafts | admin | admin-role | server/routes/blog.routes.ts:117 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/event-guides | admin | admin-role | server/routes/blog.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts | admin | admin-role | server/routes/blog.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/publish | admin | admin-role | server/routes/blog.routes.ts:172 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/submit | admin | admin-role | server/routes/blog.routes.ts:168 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/withdraw | admin | admin-role | server/routes/blog.routes.ts:176 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/race-weekends | admin | admin-role | server/routes/blog.routes.ts:156 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/series-follows | admin | admin-role | server/routes/blog.routes.ts:144 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/travelpulse-weekly | admin | admin-role | server/routes/blog.routes.ts:126 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/exception-refund | admin | admin-role | server/routes/admin.routes.ts:714 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile | admin | admin-role | server/routes/admin.routes.ts:780 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/out-of-band-refund/clear | admin | admin-role | server/routes/admin.routes.ts:635 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/auto-cancel/run | admin | admin-role | server/routes/admin.routes.ts:2136 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/catalog/ingest | admin | admin-role | server/routes/admin.routes.ts:2563 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories | admin | admin-role | server/routes/admin.routes.ts:3608 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories/:categoryId/subcategories | admin | admin-role | server/routes/admin.routes.ts:3784 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules | admin | admin-role | server/routes/admin.routes.ts:8362 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules/auto-index | admin | admin-role | server/routes/admin.routes.ts:8398 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources | admin | admin-role | server/routes/content-sources.routes.ts:45 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/activate | admin | admin-role | server/routes/content-sources.routes.ts:63 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/deactivate | admin | admin-role | server/routes/content-sources.routes.ts:71 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/:trackingNumber/moderate | admin | admin-role | server/routes/admin.routes.ts:4448 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/flags/:flagId/resolve | admin | admin-role | server/routes/admin.routes.ts:4501 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/register | admin | admin-role | server/routes/admin.routes.ts:4393 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/assign-coordinator | admin | admin-role | server/routes/admin.routes.ts:1082 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/review-ledger-gap | admin | admin-role | server/routes/admin.routes.ts:1173 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/approve | admin | admin-role | server/routes/demand.routes.ts:855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/generate | admin | admin-role | server/routes/demand.routes.ts:839 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/withdraw | admin | admin-role | server/routes/demand.routes.ts:871 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/approve | admin | admin-role | server/routes/admin.routes.ts:4147 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4173 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/digest/send-now | admin | admin-role | server/routes/admin.routes.ts:9046 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/refund-rejected-artifact | admin | admin-role | server/routes/admin.routes.ts:1825 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/reject | admin | admin-role | server/routes/admin.routes.ts:1638 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/uphold | admin | admin-role | server/routes/admin.routes.ts:1716 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/analyze-gaps | admin | admin-role | server/routes/admin.routes.ts:2209 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-gaps | admin | admin-role | server/routes/admin.routes.ts:2225 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-kyoto | admin | admin-role | server/routes/admin.routes.ts:2168 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-youtube | admin | admin-role | server/routes/admin.routes.ts:2259 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/approve | admin | admin-role | server/routes/admin.routes.ts:2500 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/reject | admin | admin-role | server/routes/admin.routes.ts:2590 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish-batch | admin | admin-role | server/routes/admin.routes.ts:2674 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish/:id | admin | admin-role | server/routes/admin.routes.ts:2629 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/resolve | admin | admin-role | server/routes/admin.routes.ts:2728 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/sync-registry | admin | admin-role | server/routes/admin.routes.ts:2545 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/email-outbox/:id/retry | admin | admin-role | server/routes/admin.routes.ts:9361 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/event-packages | admin | admin-role | server/routes/admin.routes.ts:8601 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-offering-types | admin | admin-role | server/routes/admin.routes.ts:7822 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/approve | admin | admin-role | server/routes/admin.routes.ts:8266 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/reject | admin | admin-role | server/routes/admin.routes.ts:8309 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gems/backfill-photos | admin | admin-role | server/routes/admin.routes.ts:303 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/invoices | admin | admin-role | server/routes/admin.routes.ts:4765 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/assign | admin | admin-role | server/routes/admin.routes.ts:8061 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8164 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets | admin | admin-role | server/routes/admin-markets.routes.ts:186 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets/:slug/refresh-geography | admin | admin-role | server/routes/admin-markets.routes.ts:282 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/ratify | admin | admin-role | server/routes/neighborhood-claims.routes.ts:236 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/rescore | admin | admin-role | server/routes/neighborhood-claims.routes.ts:287 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/return | admin | admin-role | server/routes/neighborhood-claims.routes.ts:262 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/manual-entry | admin | admin-role | server/routes/neighborhood-claims.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/:id/coverage-targets | admin | admin-role | server/routes/admin.routes.ts:8773 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/backfill | admin | admin-role | server/routes/admin.routes.ts:8734 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/optimization-fees | admin | admin-role | server/routes/admin.routes.ts:8538 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/payouts | admin | admin-role | server/routes/admin.routes.ts:5597 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/approve | admin | admin-role | server/routes/admin.routes.ts:3965 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4054 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/providers/:userId/remind-stripe | admin | admin-role | server/routes/admin.routes.ts:3228 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/qa/run-nightly | admin | admin-role | server/routes/admin.routes.ts:9198 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/approve | admin | admin-role | server/routes/admin.routes.ts:1233 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/reject | admin | admin-role | server/routes/admin.routes.ts:1376 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/dismiss | admin | admin-role | server/routes/admin.routes.ts:1581 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/refund | admin | admin-role | server/routes/admin.routes.ts:1476 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/reviews/:id/clear-response | admin | admin-role | server/routes/admin.routes.ts:7438 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/confirm | admin | admin-role | server/routes/admin.routes.ts:8174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/reassign | admin | admin-role | server/routes/admin.routes.ts:8184 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/seed-categories | admin | admin-role | server/routes/admin.routes.ts:3840 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-offering-types | admin | admin-role | server/routes/admin.routes.ts:7769 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-templates | admin | admin-role | server/routes/admin.routes.ts:3413 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/system/test-email | admin | admin-role | server/routes/admin.routes.ts:6639 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/trigger-digest | admin | admin-role | server/routes/admin.routes.ts:9034 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/affiliate-booking-requests | other | resource-owner | server/routes/content.routes.ts:7491 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/claim | other | session-self | server/routes/content.routes.ts:7870 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:8223 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7630 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | session-self | server/routes/content.routes.ts:9109 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:9149 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:796 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:725 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4570 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:5027 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:5163 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:844 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:7267 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:7285 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:3133 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:3073 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/recruitment-click | other | session-self | server/routes/content.routes.ts:3006 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:3023 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:312 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:190 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:538 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:70 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:377 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:459 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:497 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/blog/posts/:slug/reactions | other | session-self | server/routes/blog.routes.ts:215 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/bookings | user-data | session-self | server/routes.ts:7318 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/accept-deliverable | user-data | session-self | server/routes/bookings.ts:998 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/cancel | user-data | session-self | server/routes.ts:8297 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/components/:componentServiceId/cancel | user-data | session-self | server/routes.ts:8089 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/confirm-completion | payments | resource-owner | server/routes/bookings.ts:779 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/deliver-artifact | user-data | session-self | server/routes/bookings.ts:1067 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/dispute | payments | resource-owner | server/routes/bookings.ts:857 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/pay-balance | payments | resource-owner | server/routes/payments.routes.ts:2461 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/request-revision | user-data | session-self | server/routes/bookings.ts:1024 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/resume-payment | user-data | session-self | server/routes/payments.routes.ts:2396 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:411 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/confirm-payment | payments | resource-owner | server/routes/bookings.ts:263 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/estimate-cost | user-data | session-self | server/routes/bookings.ts:529 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/process-cart | payments | session-self | server/routes/bookings.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/refund | payments | resource-owner | server/routes/bookings.ts:656 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/webhooks/stripe | payments | signature | server/routes/bookings.ts:650 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:7182 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:7168 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:3902 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3709 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3868 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3659 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:9574 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/convert-to-itinerary | user-data | resource-owner | server/routes.ts:9895 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/items | user-data | resource-owner | server/routes.ts:7177 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/migrate | user-data | session-self | server/routes.ts:9871 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:9371 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:543 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:683 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/checkout | payments | session-self | server/routes/payments.routes.ts:1129 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:4207 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:4014 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:4255 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:4048 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:534 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:249 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:192 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:437 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:478 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:9216 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:9035 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:9020 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/communication | user-data | session-self | server/routes.ts:12801 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:12784 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:12766 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/conversations | user-data | session-self | server/replit_integrations/chat/routes.ts:53 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/:id/messages | user-data | session-self | server/replit_integrations/chat/routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/start | user-data | session-self | server/routes/conversations.routes.ts:66 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:11127 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:10884 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:11070 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:11197 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:11421 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:11497 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/credits/purchase | payments | session-self | server/routes/payments.routes.ts:283 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | resource-owner | server/routes/content.routes.ts:1115 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:2257 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2300 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/discovery/scan | admin | admin-role | server/routes/content.routes.ts:8391 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/expert-application | other | session-self | server/routes.ts:2682 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:2050 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2776 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:204 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2719 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:583 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:540 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:763 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:804 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:958 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:5961 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:12255 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:12318 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:12288 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:12159 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1331 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/blog/posts/:id/sign | user-data | session-self | server/routes/blog.routes.ts:188 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:7956 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8051 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets | user-data | session-self | server/routes/expert-console.routes.ts:640 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets/:id/propose-gem | user-data | session-self | server/routes/expert-console.routes.ts:679 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims | user-data | session-self | server/routes/neighborhood-claims.routes.ts:84 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims/:id/submit | user-data | session-self | server/routes/neighborhood-claims.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made | user-data | resource-owner | server/routes/ready-made.routes.ts:71 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/build-review | user-data | session-self | server/routes/ready-made.routes.ts:782 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/submit | user-data | session-self | server/routes/ready-made.routes.ts:687 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/withdraw | user-data | session-self | server/routes/ready-made.routes.ts:748 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/from-trip/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:8484 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/selected-services | user-data | session-self | server/routes.ts:5735 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings | user-data | session-self | server/routes.ts:5810 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings/:id/submit | user-data | session-self | server/routes.ts:5874 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/:id/duplicate | user-data | session-self | server/routes.ts:6399 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/from-template/:templateId | user-data | session-self | server/routes.ts:6438 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/specializations | user-data | session-self | server/routes.ts:5757 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:336 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:2089 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:6971 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:6954 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:656 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | public-or-system | server/routes/content.routes.ts:4347 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:4405 | Other-category endpoint is intentionally outside the strict tested set. |
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
| POST /api/itinerary-comparisons | other | signature | server/routes.ts:10015 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stop | other | resource-owner | server/routes/plancard.routes.ts:348 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stops | other | resource-owner | server/routes/plancard.routes.ts:506 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:839 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:62 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | resource-owner | server/routes.ts:10380 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:810 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1495 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2629 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2584 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:1903 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1530 | Other-category endpoint is intentionally outside the strict tested set. |
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
| POST /api/memberships/checkout | other | session-self | server/routes/payments.routes.ts:3439 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/messages | user-data | session-self | server/routes/messages.ts:173 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:313 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/message/:messageId | user-data | session-self | server/routes/messages.ts:364 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/user/:targetUserId | user-data | session-self | server/routes/messages.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/typing/:conversationId | user-data | session-self | server/routes/messages.ts:297 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/notifications/mark-all-read | user-data | session-self | server/routes/content.routes.ts:3216 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/occasions | other | session-self | server/routes/occasions.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-payments | payments | resource-owner | server/routes/optimization.routes.ts:363 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-payments/confirm | payments | resource-owner | server/routes/optimization.routes.ts:546 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:61 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:7131 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/payouts/request | payments | session-self | server/routes/payments.routes.ts:3162 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider-application | other | session-self | server/routes.ts:2923 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:2996 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:10768 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:460 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:7955 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8050 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:250 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:577 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:786 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/quotes/:quoteId/issue | user-data | session-self | server/routes/service-quotes.routes.ts:153 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/quotes/:quoteId/withdraw | user-data | session-self | server/routes/service-quotes.routes.ts:174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/request-verification-review | user-data | session-self | server/routes.ts:4369 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:4053 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/archive | user-data | session-self | server/routes.ts:4866 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/attestations | user-data | session-self | server/routes/service-attestations.routes.ts:135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/cover-photo | user-data | session-self | server/routes.ts:6819 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6731 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/duplicate | user-data | session-self | server/routes.ts:6420 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/gallery-photo | user-data | session-self | server/routes.ts:6945 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/submit | user-data | session-self | server/routes.ts:4813 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/approve | user-data | session-self | server/routes.ts:3987 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/draft | user-data | session-self | server/routes.ts:4006 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:8963 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:8993 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:8947 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/reviews/:id/flag | user-data | session-self | server/routes/content.routes.ts:3253 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:4274 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:4310 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-items | user-data | session-self | server/routes/saved-items.routes.ts:38 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-items/shares | user-data | session-self | server/routes/saved-items.routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:456 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:488 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6309 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:6281 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:1022 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:1048 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:id/quote-requests | other | session-self | server/routes/service-quotes.routes.ts:82 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:3271 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:525 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7425 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/preferences | user-data | session-self | server/routes/content.routes.ts:7391 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/stripe/connect/onboard | payments | session-self | server/routes/payments.routes.ts:2980 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:9568 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:9451 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:9530 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:9411 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:9385 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:9345 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:9486 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:9321 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:325 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:423 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:613 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:579 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-options/click | other | session-self | server/routes/transport-hub.routes.ts:526 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:4088 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/ai/refresh-all | admin | admin-role | server/routes/content.routes.ts:5653 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/ai/refresh/:cityName/:country | admin | admin-role | server/routes/content.routes.ts:5626 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5680 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5537 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5349 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:381 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:522 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/claim | user-data | session-self | server/routes.ts:1700 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:723 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes.ts:1735 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1462 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:573 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/suggestions | user-data | session-self | server/routes/booking-actions.ts:1071 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/activate-transport | user-data | session-self | server/routes.ts:13357 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisor/narration | user-data | session-self | server/routes/advisor.routes.ts:478 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisors | user-data | resource-owner | server/routes/booking-actions.ts:795 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/alerts | user-data | session-self | server/routes.ts:13584 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/analytics/infer | user-data | resource-owner | server/routes/trips.routes.ts:3017 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor-suggestions | user-data | session-self | server/routes/trips.routes.ts:1847 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor/promote | user-data | session-self | server/routes/plan-option-sets.routes.ts:235 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors | user-data | session-self | server/routes/trips.routes.ts:1630 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors/:anchorId/impacts | user-data | session-self | server/routes/trips.routes.ts:1827 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/budget/calculate-split | user-data | session-self | server/routes.ts:12940 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/calculate-energy | user-data | session-self | server/routes/booking-actions.ts:2084 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/changes | user-data | session-self | server/routes/plancard.routes.ts:791 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts | user-data | session-self | server/routes.ts:12732 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts/:contractId/documents | user-data | session-self | server/routes/trips.routes.ts:1081 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/day-boundaries | user-data | session-self | server/routes/trips.routes.ts:1731 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency-contacts | user-data | session-self | server/routes.ts:13519 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency/initialize | user-data | session-self | server/routes.ts:13536 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/finalize | user-data | resource-owner | server/routes/routing.routes.ts:472 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/generate-presets | user-data | session-self | server/routes/booking-actions.ts:2143 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1678 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/route | user-data | resource-owner | server/routes/routing.routes.ts:137 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items | user-data | resource-owner | server/routes.ts:13037 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items/:itemId/fresh-facts | user-data | session-self | server/routes/content-facts.routes.ts:27 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/optimize-order | user-data | resource-owner | server/routes.ts:13303 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/reorder | user-data | resource-owner | server/routes.ts:13268 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets | user-data | session-self | server/routes/plan-option-sets.routes.ts:157 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/choose | user-data | session-self | server/routes/plan-option-sets.routes.ts:194 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/close | user-data | session-self | server/routes/plan-option-sets.routes.ts:205 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/options | user-data | session-self | server/routes/plan-option-sets.routes.ts:168 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/reopen | user-data | session-self | server/routes/plan-option-sets.routes.ts:215 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/suggest | user-data | session-self | server/routes/plan-option-sets.routes.ts:225 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants | user-data | resource-owner | server/routes.ts:12601 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants/bulk-invite | user-data | session-self | server/routes.ts:12637 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/place-facts/:factId/confirm | user-data | session-self | server/routes/content-facts.routes.ts:61 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals | user-data | resource-owner | server/routes/trips.routes.ts:3619 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/apply | user-data | resource-owner | server/routes/trips.routes.ts:3927 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/discard | user-data | session-self | server/routes/trips.routes.ts:3728 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals/:id/pay | user-data | resource-owner | server/routes/trips.routes.ts:3779 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/reopen | user-data | resource-owner | server/routes/routing.routes.ts:599 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/slip-events | user-data | session-self | server/routes/plan-option-sets.routes.ts:246 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions | user-data | session-self | server/routes.ts:12897 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions/split | user-data | session-self | server/routes.ts:12914 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transport-legs/generate | user-data | session-self | server/routes/transport-legs.routes.ts:99 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase | user-data | session-self | server/routes/trip-pass.routes.ts:67 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase/confirm | user-data | session-self | server/routes/trip-pass.routes.ts:119 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/validate-schedule | user-data | session-self | server/routes/trips.routes.ts:1754 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1139 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
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
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1890 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | resource-owner | server/routes/content.routes.ts:2020 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:2623 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3518 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:649 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/wallet/add-credits | payments | session-self | server/routes/payments.routes.ts:277 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:103 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe | payments | signature | server/routes/webhooks.routes.ts:530 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:37 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /internal/jobs/availability-materialization | other | public-or-system | server/routes/internal.routes.ts:282 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-auto-completion | other | public-or-system | server/routes/internal.routes.ts:239 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-expiry | other | public-or-system | server/routes/internal.routes.ts:295 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/checkout-sweep | other | public-or-system | server/routes/internal.routes.ts:268 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/earnings-release | other | public-or-system | server/routes/internal.routes.ts:225 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/email-outbox | other | public-or-system | server/routes/internal.routes.ts:330 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/itinerary-generation-sweep | other | public-or-system | server/routes/internal.routes.ts:321 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/score-neighborhood-claims | other | public-or-system | server/routes/internal.routes.ts:348 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/stripe-reconciliation | other | public-or-system | server/routes/internal.routes.ts:250 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travel-matrix-refresh | other | public-or-system | server/routes/internal.routes.ts:368 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpayouts-report-poll | other | public-or-system | server/routes/internal.routes.ts:303 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpulse-weekly | other | public-or-system | server/routes/internal.routes.ts:383 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/run-occasion-drafts | other | public-or-system | server/routes/internal.routes.ts:207 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PUT /api/admin/neighborhoods/:id/lead | admin | admin-role | server/routes/admin.routes.ts:8847 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/testimonials/featured | admin | admin-role | server/routes/admin.routes.ts:7489 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1665 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2275 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/neighborhood-claims/:id/capture | user-data | session-self | server/routes/neighborhood-claims.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:386 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/me/available-now | user-data | session-self | server/routes/live-help.routes.ts:62 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:542 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/availability-patterns | user-data | session-self | server/routes.ts:3667 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/blackouts | user-data | session-self | server/routes.ts:3831 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/date-ranges | user-data | session-self | server/routes.ts:3748 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/pickup-route-points | user-data | session-self | server/routes.ts:3568 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/route-points | user-data | session-self | server/routes.ts:3514 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:3611 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3959 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:267 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/trips/:tripId/destinations | user-data | session-self | server/routes/trips.routes.ts:479 | Not run: evidence manifest SHA-256 is stale. |
