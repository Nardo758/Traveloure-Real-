# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 0/725**; remaining: **725**.
- Admin: **0/196**; payments: **0/31**; user-data: **0/251**; other: **0/247**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **evidence manifest SHA-256 is stale**; manifest SHA-256: `58965e198286f2d4390a74db62ba78e2a1d3be3d9512e6f84f502ff14eccc5be`; run timestamp: 2026-09-25T00:56:06.499Z.
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
- Payments/user-data signature endpoints (2) are counted only for unsigned-request coverage. Session-self payments/user-data endpoints are counted from fresh unauthenticated evidence, except the 29 explicit handler-fixture exclusions below; only those exclusions are **not tested**.

## Remaining risk

Untested endpoints below need endpoint-appropriate coverage. In particular, excluded expert/provider workflows require real handler-owned resources; public/system routes and all other-category routes have no authorization assertion in this strict report.

## Untested endpoints

| Endpoint | Risk | Boundary | Source | Exact reason |
| --- | --- | --- | --- | --- |
| DELETE /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8873 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:4152 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:9318 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:9583 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:8670 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/neighborhoods/:id/coverage-targets/:categoryKey | admin | admin-role | server/routes/admin.routes.ts:9755 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/notifications/:id | admin | admin-role | server/routes.ts:13940 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:8618 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3859 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/services/:id | admin | admin-role | server/routes/admin.routes.ts:5138 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/slow-queries | admin | admin-role | server/routes.ts:12857 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:4208 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/users/:id | admin | admin-role | server/routes/admin.routes.ts:6624 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/admin/waitlist/:id | admin | admin-role | server/routes/launch-waitlist.routes.ts:189 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1725 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/auth/account | user-data | session-self | server/replit_integrations/auth/routes.ts:220 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/blog/posts/:slug/reactions/:kind | other | session-self | server/routes/blog.routes.ts:237 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/cart | user-data | session-self | server/routes.ts:10143 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/cart/:id | user-data | session-self | server/routes.ts:10125 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/contracts/:id | user-data | session-self | server/routes.ts:13160 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:11479 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:11377 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1220 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2400 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:657 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:169 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/communications/:id | admin | admin-role | server/routes/ea.routes.ts:596 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:388 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:325 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:505 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:453 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:557 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7441 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:793 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:709 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/ready-made/build/:id | user-data | resource-owner | server/routes/ready-made.routes.ts:328 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/selected-services/:serviceOfferingId | user-data | session-self | server/routes.ts:5965 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:6154 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/specializations/:specialization | user-data | session-self | server/routes.ts:6003 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:445 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2205 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:414 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/ea-links/:id | user-data | session-self | server/routes/ea.routes.ts:815 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/payment-methods/:id | payments | session-self | server/routes/payment-methods.routes.ts:85 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:114 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:289 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:334 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:3348 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:163 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/participants/:id | user-data | session-self | server/routes/content.routes.ts:7342 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/plans/:id/feedback | other | session-self | server/routes/feedback.routes.ts:73 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:11156 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:508 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:447 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:796 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:931 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/services/:id | user-data | session-self | server/routes.ts:5004 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:106 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/saved-items/:id | user-data | session-self | server/routes/saved-items.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/saved-items/shares/:shareId | user-data | session-self | server/routes/saved-items.routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7403 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:664 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/changes/:changeId | user-data | session-self | server/routes/plancard.routes.ts:1232 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3404 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/option-sets/:setId/options/:optionId | user-data | session-self | server/routes/plan-option-sets.routes.ts:213 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/phone-delivery/calendar | user-data | session-self | server/routes/phone-delivery.routes.ts:59 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:394 | Not run: evidence manifest SHA-256 is stale. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2141 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:2057 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/admin/affiliate/partners/:id | admin | admin-role | server/routes/content.routes.ts:8849 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/affiliate/reconciliation/:earningId | admin | admin-role | server/routes/admin.routes.ts:4667 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/blog/posts/:id | admin | admin-role | server/routes/blog.routes.ts:169 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/bookings/auto-cancel/config | admin | admin-role | server/routes/admin.routes.ts:2265 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/categories/:id | admin | admin-role | server/routes/admin.routes.ts:4039 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/contact-submissions/:id | admin | admin-role | server/routes/admin.routes.ts:2986 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-placement-rules/:id | admin | admin-role | server/routes/admin.routes.ts:9306 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/content-sources/:id | admin | admin-role | server/routes/content-sources.routes.ts:88 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/event-packages/:id | admin | admin-role | server/routes/admin.routes.ts:9556 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/evidence-thresholds/:key | admin | admin-role | server/routes/neighborhood-claims.routes.ts:310 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/experience-themes/:id | admin | admin-role | server/routes/experience-themes.routes.ts:69 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3346 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:3135 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:8648 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/expert-templates/:id/roles | admin | admin-role | server/routes/admin.routes.ts:3914 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/fee-bands/:bandKey | admin | admin-role | server/routes/admin.routes.ts:8302 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/invoices/:invoiceNumber/status | admin | admin-role | server/routes/admin.routes.ts:5283 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/lead-routing-logs/:id/override | admin | admin-role | server/routes/admin.routes.ts:8893 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/message-reports/:id | admin | admin-role | server/routes/admin.routes.ts:8080 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/neighborhoods/:id/adjacency | admin | admin-role | server/routes/admin.routes.ts:9884 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/:id/read | admin | admin-role | server/routes.ts:13906 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/notifications/read-all | admin | admin-role | server/routes.ts:13966 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/payouts/:id | admin | admin-role | server/routes/admin.routes.ts:6173 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/platform-settings/:settingKey | admin | admin-role | server/routes/admin.routes.ts:8701 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/rejection-reason | admin | admin-role | server/routes/admin.routes.ts:3746 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/provider-applications/:id/status | admin | admin-role | server/routes/admin.routes.ts:3621 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/ready-made/:id/badge | admin | admin-role | server/routes/admin.routes.ts:1495 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/reviews/:id/status | admin | admin-role | server/routes/admin.routes.ts:8162 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-offering-types/:key | admin | admin-role | server/routes/admin.routes.ts:8595 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-requests/:id | admin | admin-role | server/routes/service-requests.routes.ts:116 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/service-templates/:id | admin | admin-role | server/routes/admin.routes.ts:3837 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/affinity-tags | admin | admin-role | server/routes/admin.routes.ts:5101 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/featured | admin | admin-role | server/routes/admin.routes.ts:5074 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/services/:id/status | admin | admin-role | server/routes/admin.routes.ts:5048 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/subcategories/:id | admin | admin-role | server/routes/admin.routes.ts:4186 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/ticker/:id | admin | admin-role | server/routes/ticker.routes.ts:146 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/commission-override | admin | admin-role | server/routes/admin.routes.ts:3445 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/suspend | admin | admin-role | server/routes/admin.routes.ts:10007 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/test-flag | admin | admin-role | server/routes/admin.routes.ts:3490 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/unsuspend | admin | admin-role | server/routes/admin.routes.ts:10173 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/admin/users/:id/verification | admin | admin-role | server/routes/admin.routes.ts:3382 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:8120 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/cart/:id | user-data | session-self | server/routes.ts:10053 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:318 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/contracts/:id | user-data | session-self | server/routes.ts:13091 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/conversations/:id | user-data | session-self | server/replit_integrations/chat/routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:11437 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:11272 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:11300 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1184 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/ea/ai-tasks/:id | admin | admin-role | server/routes/ea.routes.ts:636 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/clients/:id | admin | admin-role | server/routes/ea.routes.ts:142 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/events/:id | admin | admin-role | server/routes/ea.routes.ts:375 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/executives/:id | admin | admin-role | server/routes/ea.routes.ts:312 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/gifts/:id | admin | admin-role | server/routes/ea.routes.ts:492 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/preferences | admin | admin-role | server/routes/ea.routes.ts:729 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/travel/:id | admin | admin-role | server/routes/ea.routes.ts:435 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/ea/venues/:id | admin | admin-role | server/routes/ea.routes.ts:544 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7423 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:437 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2873 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:863 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:917 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:934 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:426 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1375 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:8065 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/knowledge-nuggets/:id | user-data | session-self | server/routes/expert-console.routes.ts:661 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/neighborhoods | user-data | session-self | server/routes.ts:5736 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/photo | user-data | session-self | server/routes.ts:5928 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile | user-data | session-self | server/routes.ts:5840 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/profile-notes | user-data | session-self | server/routes.ts:5783 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/:id | user-data | session-self | server/routes/ready-made.routes.ts:665 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/ready-made/build/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:292 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:75 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/service-listings/:id | user-data | session-self | server/routes.ts:6078 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:6613 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2183 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2716 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:101 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/home-city | user-data | session-self | server/routes/occasions.routes.ts:190 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/itinerary-email-preferences | user-data | session-self | server/routes/itinerary-email-preferences.routes.ts:48 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/notification-email | user-data | session-self | server/routes/storefront.routes.ts:1679 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/preferences | user-data | session-self | server/routes/storefront.routes.ts:276 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/storefront | user-data | session-self | server/routes/storefront.routes.ts:345 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/travel-preferences | user-data | session-self | server/routes/storefront.routes.ts:422 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/traveler-profile | user-data | session-self | server/routes/traveler-profile.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/me/vacation | user-data | session-self | server/routes/vacation.routes.ts:74 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/:messageId/read | user-data | session-self | server/routes/messages.ts:254 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/messages/conversation/:conversationId/read-all | user-data | session-self | server/routes/messages.ts:270 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:3326 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:123 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/participants/:id | user-data | resource-owner | server/routes/content.routes.ts:7278 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/participants/:id/rsvp | user-data | session-self | server/routes/content.routes.ts:7304 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/profile | user-data | session-self | server/replit_integrations/auth/routes.ts:104 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:2977 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:11132 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:8069 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:347 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:731 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:884 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:4487 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:127 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:8527 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:8462 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:191 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7385 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2253 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:1150 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id | user-data | session-self | server/routes/trips.routes.ts:622 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:1186 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PATCH /api/trips/:tripId/expert-notes | user-data | session-self | server/routes/booking-actions.ts:1861 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/expert-traveler-note | user-data | session-self | server/routes/trips.routes.ts:3480 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/itinerary-items/:itemId | user-data | resource-owner | server/routes/trips.routes.ts:3190 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/occasion | user-data | session-self | server/routes/trips.routes.ts:3601 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/trips/:tripId/transport-legs/:legId | user-data | session-self | server/routes/transport-legs.routes.ts:259 | Not run: evidence manifest SHA-256 is stale. |
| PATCH /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2118 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | resource-owner | server/routes/content.routes.ts:2008 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/admin/affiliate/partners | admin | admin-role | server/routes/content.routes.ts:8785 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/approve | admin | admin-role | server/routes/admin.routes.ts:10217 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/page-extract | admin | admin-role | server/routes/content.routes.ts:8891 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/reject | admin | admin-role | server/routes/admin.routes.ts:10228 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/affiliate/partners/:id/scrape | admin | admin-role | server/routes/content.routes.ts:8910 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/drafts | admin | admin-role | server/routes/blog.routes.ts:124 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/event-guides | admin | admin-role | server/routes/blog.routes.ts:141 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts | admin | admin-role | server/routes/blog.routes.ts:109 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/publish | admin | admin-role | server/routes/blog.routes.ts:179 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/submit | admin | admin-role | server/routes/blog.routes.ts:175 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/posts/:id/withdraw | admin | admin-role | server/routes/blog.routes.ts:187 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/race-weekends | admin | admin-role | server/routes/blog.routes.ts:163 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/series-follows | admin | admin-role | server/routes/blog.routes.ts:151 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/blog/travelpulse-weekly | admin | admin-role | server/routes/blog.routes.ts:133 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/exception-refund | admin | admin-role | server/routes/admin.routes.ts:784 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile | admin | admin-role | server/routes/admin.routes.ts:850 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:bookingId/out-of-band-refund/clear | admin | admin-role | server/routes/admin.routes.ts:702 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/:kind(service|legacy|liteapi)/:id/resolve | admin | admin-role | server/routes/admin.routes.ts:946 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bookings/auto-cancel/run | admin | admin-role | server/routes/admin.routes.ts:2301 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bot-accounts | admin | admin-role | server/routes/bot-admin.routes.ts:47 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bot-accounts/:id/revoke | admin | admin-role | server/routes/bot-admin.routes.ts:62 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bot-proposals/:id/approve | admin | admin-role | server/routes/bot-admin.routes.ts:89 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bot-proposals/:id/reject | admin | admin-role | server/routes/bot-admin.routes.ts:108 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/bot-proposals/refresh-facts/:id/approve | admin | admin-role | server/routes/bot-admin.routes.ts:132 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/catalog/ingest | admin | admin-role | server/routes/admin.routes.ts:2753 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories | admin | admin-role | server/routes/admin.routes.ts:3987 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/categories/:categoryId/subcategories | admin | admin-role | server/routes/admin.routes.ts:4163 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/city-knowledge/:cityKey/sign-off | admin | admin-role | server/routes/city-knowledge.routes.ts:98 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules | admin | admin-role | server/routes/admin.routes.ts:9295 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-placement-rules/auto-index | admin | admin-role | server/routes/admin.routes.ts:9331 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources | admin | admin-role | server/routes/content-sources.routes.ts:78 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/activate | admin | admin-role | server/routes/content-sources.routes.ts:96 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/deactivate | admin | admin-role | server/routes/content-sources.routes.ts:104 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/public-ok | admin | admin-role | server/routes/content-sources.routes.ts:112 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content-sources/:id/signoff | admin | admin-role | server/routes/content-sources.routes.ts:120 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/:trackingNumber/moderate | admin | admin-role | server/routes/admin.routes.ts:4845 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/flags/:flagId/resolve | admin | admin-role | server/routes/admin.routes.ts:4898 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/content/register | admin | admin-role | server/routes/admin.routes.ts:4790 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/assign-coordinator | admin | admin-role | server/routes/admin.routes.ts:1228 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/coordination-states/:id/review-ledger-gap | admin | admin-role | server/routes/admin.routes.ts:1319 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/approve | admin | admin-role | server/routes/demand.routes.ts:855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/generate | admin | admin-role | server/routes/demand.routes.ts:839 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/demand/onepager/:market/withdraw | admin | admin-role | server/routes/demand.routes.ts:871 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/approve | admin | admin-role | server/routes/admin.routes.ts:4544 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/destination-events/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4570 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/digest/send-now | admin | admin-role | server/routes/admin.routes.ts:9979 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/refund-rejected-artifact | admin | admin-role | server/routes/admin.routes.ts:1976 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/reject | admin | admin-role | server/routes/admin.routes.ts:1789 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/disputes/:bookingId/uphold | admin | admin-role | server/routes/admin.routes.ts:1867 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/analyze-gaps | admin | admin-role | server/routes/admin.routes.ts:2399 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-gaps | admin | admin-role | server/routes/admin.routes.ts:2415 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-kyoto | admin | admin-role | server/routes/admin.routes.ts:2358 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/ingest-youtube | admin | admin-role | server/routes/admin.routes.ts:2449 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/approve | admin | admin-role | server/routes/admin.routes.ts:2690 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/intake/:id/reject | admin | admin-role | server/routes/admin.routes.ts:2780 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish-batch | admin | admin-role | server/routes/admin.routes.ts:2864 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/publish/:id | admin | admin-role | server/routes/admin.routes.ts:2819 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/resolve | admin | admin-role | server/routes/admin.routes.ts:2918 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/dmo/sync-registry | admin | admin-role | server/routes/admin.routes.ts:2735 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/email-outbox/:id/retry | admin | admin-role | server/routes/admin.routes.ts:10294 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/event-packages | admin | admin-role | server/routes/admin.routes.ts:9534 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/experience-theme-suggestions/:id/accept | admin | admin-role | server/routes/experience-themes.routes.ts:79 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/experience-theme-suggestions/:id/dismiss | admin | admin-role | server/routes/experience-themes.routes.ts:87 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/experience-themes | admin | admin-role | server/routes/experience-themes.routes.ts:56 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-applications/:id/city-knowledge/retake | admin | admin-role | server/routes/city-knowledge.routes.ts:134 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-applications/:id/rescore | admin | admin-role | server/routes/admin.routes.ts:3304 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/expert-offering-types | admin | admin-role | server/routes/admin.routes.ts:8638 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/experts/:userId/remind-stripe | admin | admin-role | server/routes/admin.routes.ts:3611 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/approve | admin | admin-role | server/routes/admin.routes.ts:9199 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gem-candidates/:id/reject | admin | admin-role | server/routes/admin.routes.ts:9242 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gems/:id/verify | admin | admin-role | server/routes/admin.routes.ts:9179 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/gems/backfill-photos | admin | admin-role | server/routes/admin.routes.ts:360 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/handoffs/:id/assign | admin | admin-role | server/routes/handoff.routes.ts:427 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/invoices | admin | admin-role | server/routes/admin.routes.ts:5219 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/assign | admin | admin-role | server/routes/admin.routes.ts:8973 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/leads/:expertRequestId/confirm | admin | admin-role | server/routes/admin.routes.ts:9076 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets | admin | admin-role | server/routes/admin-markets.routes.ts:187 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/markets/:slug/refresh-geography | admin | admin-role | server/routes/admin-markets.routes.ts:284 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/ratify | admin | admin-role | server/routes/neighborhood-claims.routes.ts:236 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/rescore | admin | admin-role | server/routes/neighborhood-claims.routes.ts:287 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/:id/return | admin | admin-role | server/routes/neighborhood-claims.routes.ts:262 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhood-claims/manual-entry | admin | admin-role | server/routes/neighborhood-claims.routes.ts:160 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/:id/coverage-targets | admin | admin-role | server/routes/admin.routes.ts:9706 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/neighborhoods/backfill | admin | admin-role | server/routes/admin.routes.ts:9667 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/optimization-fees | admin | admin-role | server/routes/admin.routes.ts:9471 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/payouts | admin | admin-role | server/routes/admin.routes.ts:6067 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/payouts/:id/mark-paid | admin | admin-role | server/routes/admin.routes.ts:6412 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/place-photo-blocks | admin | admin-role | server/routes/place-photo-blocks.routes.ts:25 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/approve | admin | admin-role | server/routes/admin.routes.ts:4362 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/provider-services/:id/reject | admin | admin-role | server/routes/admin.routes.ts:4451 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/providers/:userId/remind-stripe | admin | admin-role | server/routes/admin.routes.ts:3615 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/qa/run-nightly | admin | admin-role | server/routes/admin.routes.ts:10131 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/approve | admin | admin-role | server/routes/admin.routes.ts:1379 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/:id/reject | admin | admin-role | server/routes/admin.routes.ts:1527 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/dismiss | admin | admin-role | server/routes/admin.routes.ts:1732 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ready-made/disputes/:purchaseId/refund | admin | admin-role | server/routes/admin.routes.ts:1627 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/reviews/:id/clear-response | admin | admin-role | server/routes/admin.routes.ts:8183 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/confirm | admin | admin-role | server/routes/admin.routes.ts:9088 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/routing-queue/:requestId/reassign | admin | admin-role | server/routes/admin.routes.ts:9100 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/seed-categories | admin | admin-role | server/routes/admin.routes.ts:4219 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-offering-types | admin | admin-role | server/routes/admin.routes.ts:8585 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/service-templates | admin | admin-role | server/routes/admin.routes.ts:3792 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/system/test-email | admin | admin-role | server/routes/admin.routes.ts:7325 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/ticker | admin | admin-role | server/routes/ticker.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/trigger-digest | admin | admin-role | server/routes/admin.routes.ts:9967 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/trip-pass/issue | admin | admin-role | server/routes/admin.routes.ts:10421 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/admin/waitlist/market-opened | admin | admin-role | server/routes/launch-waitlist.routes.ts:210 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/affiliate-booking-requests | other | resource-owner | server/routes/content.routes.ts:7683 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/claim | other | session-self | server/routes/content.routes.ts:8062 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:8415 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7822 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | session-self | server/routes/content.routes.ts:9343 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:9383 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:833 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:761 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4709 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:5241 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:5380 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:881 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:7459 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:7477 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:3257 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:3197 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/recruitment-click | other | session-self | server/routes/content.routes.ts:3130 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:3147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:164 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/change-unverified-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:511 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:354 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:241 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:561 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:113 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/resend-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:484 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:428 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:494 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:537 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/blog/posts/:slug/reactions | other | session-self | server/routes/blog.routes.ts:231 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/bookings | user-data | session-self | server/routes.ts:7596 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/accept-deliverable | user-data | session-self | server/routes/bookings.ts:1000 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/cancel | user-data | session-self | server/routes.ts:8577 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/components/:componentServiceId/cancel | user-data | session-self | server/routes.ts:8369 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/confirm-completion | payments | resource-owner | server/routes/bookings.ts:781 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/deliver-artifact | user-data | session-self | server/routes/bookings.ts:1069 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/dispute | payments | resource-owner | server/routes/bookings.ts:859 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/pay-balance | payments | resource-owner | server/routes/payments.routes.ts:2478 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/request-revision | user-data | session-self | server/routes/bookings.ts:1026 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/:id/resume-payment | user-data | session-self | server/routes/payments.routes.ts:2413 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:413 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/confirm-payment | payments | resource-owner | server/routes/bookings.ts:265 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/estimate-cost | user-data | session-self | server/routes/bookings.ts:531 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/process-cart | payments | session-self | server/routes/bookings.ts:162 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bookings/refund | payments | resource-owner | server/routes/bookings.ts:658 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/webhooks/stripe | payments | signature | server/routes/bookings.ts:652 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/bot/proposals | other | public-or-system | server/routes/bot.routes.ts:96 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:7374 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:7360 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:4026 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3833 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3992 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3783 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:9858 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/convert-to-itinerary | user-data | resource-owner | server/routes.ts:10179 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/items | user-data | resource-owner | server/routes.ts:7455 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/cart/migrate | user-data | session-self | server/routes.ts:10155 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:9655 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:575 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:739 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/checkout | payments | session-self | server/routes/payments.routes.ts:1142 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:4331 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:4138 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:4379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:4172 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:536 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:251 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:194 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:439 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:510 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:9424 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:9260 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:9245 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/communication | user-data | session-self | server/routes.ts:13143 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:13126 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:13108 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/conversations | user-data | session-self | server/replit_integrations/chat/routes.ts:53 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/:id/messages | user-data | session-self | server/replit_integrations/chat/routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/conversations/start | user-data | session-self | server/routes/conversations.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:11463 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:11220 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:11406 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:11533 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:11757 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:11833 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/credits/purchase | payments | session-self | server/routes/payments.routes.ts:286 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | resource-owner | server/routes/content.routes.ts:1158 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:2332 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2375 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/discovery/scan | admin | admin-role | server/routes/content.routes.ts:8583 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/events/:experienceId/invites | other | session-self | server/routes/guest-invites.ts:160 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/events/:experienceId/invites/send | other | session-self | server/routes/guest-invites.ts:319 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-application | other | session-self | server/routes.ts:2697 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:2047 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2791 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:206 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:118 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2749 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:584 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:541 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:767 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:808 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:380 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:981 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:6217 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:12597 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:12660 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:12630 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:12501 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1344 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/blog/posts/:id/sign | user-data | session-self | server/routes/blog.routes.ts:199 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:8236 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8331 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/city-knowledge/answer | user-data | session-self | server/routes/city-knowledge.routes.ts:72 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/city-knowledge/part-b | user-data | session-self | server/routes/city-knowledge.routes.ts:82 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/city-knowledge/start | user-data | session-self | server/routes/city-knowledge.routes.ts:56 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/inbox/questions/:id/answer | user-data | session-self | server/routes/expert-inbox-questions.routes.ts:43 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets | user-data | session-self | server/routes/expert-console.routes.ts:646 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/knowledge-nuggets/:id/propose-gem | user-data | session-self | server/routes/expert-console.routes.ts:685 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims | user-data | session-self | server/routes/neighborhood-claims.routes.ts:84 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/neighborhood-claims/:id/submit | user-data | session-self | server/routes/neighborhood-claims.routes.ts:115 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made | user-data | resource-owner | server/routes/ready-made.routes.ts:78 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/build-review | user-data | session-self | server/routes/ready-made.routes.ts:889 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/submit | user-data | session-self | server/routes/ready-made.routes.ts:794 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/:id/withdraw | user-data | session-self | server/routes/ready-made.routes.ts:855 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/ready-made/from-trip/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:167 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:8764 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/selected-services | user-data | session-self | server/routes.ts:5957 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings | user-data | session-self | server/routes.ts:6032 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/service-listings/:id/submit | user-data | session-self | server/routes.ts:6112 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/:id/duplicate | user-data | session-self | server/routes.ts:6655 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/services/from-template/:templateId | user-data | session-self | server/routes.ts:6694 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/specializations | user-data | session-self | server/routes.ts:5979 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:357 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:2164 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:7163 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:7146 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:692 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | session-self | server/routes/content.routes.ts:4473 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:4531 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/accept | other | session-self | server/routes/handoff.routes.ts:376 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/approve | other | session-self | server/routes/handoff.routes.ts:231 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/authorized | other | session-self | server/routes/handoff.routes.ts:218 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/cannot-book | other | session-self | server/routes/handoff.routes.ts:409 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/changes | other | session-self | server/routes/handoff.routes.ts:240 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/decline | other | session-self | server/routes/handoff.routes.ts:390 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/deliver | other | session-self | server/routes/handoff.routes.ts:399 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/on-trip-support | other | session-self | server/routes/handoff.routes.ts:264 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/on-trip-support/confirm | other | session-self | server/routes/handoff.routes.ts:278 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/handoffs/:id/withdraw | other | session-self | server/routes/handoff.routes.ts:250 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/identity/business/create-inquiry | user-data | public-or-system | server/routes/identity.routes.ts:64 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/identity/create-session | user-data | session-self | server/routes/identity.routes.ts:18 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/instagram/data-deletion | other | public-or-system | server/routes/instagram.ts:636 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/deauthorize | other | public-or-system | server/routes/instagram.ts:598 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/disconnect | other | session-self | server/routes/instagram.ts:533 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/instagram/publish | other | session-self | server/routes/instagram.ts:274 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invite-templates | other | session-self | server/routes/guest-invites.ts:596 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invites/:token/origin | other | public-or-system | server/routes/guest-invites.ts:513 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/rsvp | other | public-or-system | server/routes/guest-invites.ts:547 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/view | other | public-or-system | server/routes/guest-invites.ts:495 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/itinerary-comparisons | other | signature | server/routes.ts:10299 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stop | other | resource-owner | server/routes/plancard.routes.ts:411 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stops | other | resource-owner | server/routes/plancard.routes.ts:570 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:900 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:120 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | resource-owner | server/routes.ts:10696 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:871 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1456 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2659 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2620 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:1915 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1491 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/landing/moments/event | other | session-self | server/routes/landing.routes.ts:207 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/me/business-advisor | user-data | session-self | server/routes/demand.routes.ts:582 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/ea-invitations/:id/accept | user-data | session-self | server/routes/ea.routes.ts:789 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/ea-invitations/:id/decline | user-data | session-self | server/routes/ea.routes.ts:802 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/listings/booking-mode/decide | user-data | session-self | server/routes/booking-mode-prompt.routes.ts:42 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/offering-requests | user-data | session-self | server/routes/offering-requests.routes.ts:47 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/payment-methods/default | payments | session-self | server/routes/payment-methods.routes.ts:66 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/payment-methods/setup-intent | payments | session-self | server/routes/payment-methods.routes.ts:50 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/profile-photo | user-data | session-self | server/routes/profile-photo.routes.ts:51 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/research-prefs | user-data | session-self | server/routes/demand.routes.ts:933 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/services/:serviceId/slots | user-data | session-self | server/routes/expert-console.routes.ts:255 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/me/services/:serviceId/slots/range | user-data | session-self | server/routes/expert-console.routes.ts:346 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/memberships/checkout | other | session-self | server/routes/payments.routes.ts:3549 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/messages | user-data | session-self | server/routes/messages.ts:174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/block/:targetUserId | user-data | session-self | server/routes/messages.ts:317 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/message/:messageId | user-data | session-self | server/routes/messages.ts:368 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/report/user/:targetUserId | user-data | session-self | server/routes/messages.ts:392 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/messages/typing/:conversationId | user-data | session-self | server/routes/messages.ts:301 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/notifications/mark-all-read | user-data | session-self | server/routes/content.routes.ts:3340 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/occasions | other | session-self | server/routes/occasions.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-payments | payments | resource-owner | server/routes/optimization.routes.ts:402 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-payments/cancel | other | session-self | server/routes/optimization.routes.ts:620 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-payments/confirm | payments | resource-owner | server/routes/optimization.routes.ts:641 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:76 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:7323 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/payouts/request | payments | session-self | server/routes/payments.routes.ts:3225 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/plans/:id/feedback | other | session-self | server/routes/feedback.routes.ts:53 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-application | other | session-self | server/routes.ts:2938 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:3011 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:11104 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:481 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:8235 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/component-failed | user-data | session-self | server/routes.ts:8330 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:252 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:580 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:818 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/quotes/:quoteId/issue | user-data | session-self | server/routes/service-quotes.routes.ts:155 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/quotes/:quoteId/withdraw | user-data | session-self | server/routes/service-quotes.routes.ts:176 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/request-verification-review | user-data | session-self | server/routes.ts:4448 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:4051 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/archive | user-data | session-self | server/routes.ts:5034 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/attestations | user-data | session-self | server/routes/service-attestations.routes.ts:135 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/cover-photo | user-data | session-self | server/routes.ts:7075 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6987 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/duplicate | user-data | session-self | server/routes.ts:6676 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/gallery-photo | user-data | session-self | server/routes.ts:7212 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/submit | user-data | session-self | server/routes.ts:4963 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/approve | user-data | session-self | server/routes.ts:3985 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/provider/services/:id/translations/:locale/draft | user-data | session-self | server/routes.ts:4004 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/push/subscriptions | other | session-self | server/routes/push.routes.ts:79 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/push/test | other | session-self | server/routes/push.routes.ts:122 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/qa-sessions/:bookingId/start | other | session-self | server/routes/live-help.routes.ts:96 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quick-start-itinerary | other | session-self | server/routes.ts:12313 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/accept | other | session-self | server/routes/service-quotes.routes.ts:121 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/decline | other | session-self | server/routes/service-quotes.routes.ts:133 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ready-made/:id/purchase | payments | session-self | server/routes/ready-made.routes.ts:1386 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/ready-made/:id/purchase/confirm | payments | resource-owner | server/routes/ready-made.routes.ts:1481 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/concern | payments | resource-owner | server/routes/ready-made.routes.ts:1576 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/request-revision | payments | resource-owner | server/routes/ready-made.routes.ts:1729 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:9247 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:9277 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:9231 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/reviews/:id/flag | user-data | session-self | server/routes/content.routes.ts:3377 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:4398 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:4434 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-items | user-data | session-self | server/routes/saved-items.routes.ts:38 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-items/shares | user-data | session-self | server/routes/saved-items.routes.ts:90 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:459 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:491 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6533 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:6505 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:1065 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:1091 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:id/quote-requests | other | session-self | server/routes/service-quotes.routes.ts:83 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:3395 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:528 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7617 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/preferences | user-data | session-self | server/routes/content.routes.ts:7583 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/stripe/connect/onboard | payments | session-self | server/routes/payments.routes.ts:2997 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:9776 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:9659 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:9738 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:9619 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:9593 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:9553 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:9694 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:9529 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:333 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:438 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:631 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:597 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-options/click | other | session-self | server/routes/transport-hub.routes.ts:544 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:4212 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/ai/refresh-all | admin | admin-role | server/routes/content.routes.ts:5875 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/ai/refresh/:cityName/:country | admin | admin-role | server/routes/content.routes.ts:5848 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5902 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5759 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5566 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:381 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:571 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/claim | user-data | session-self | server/routes.ts:1651 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:730 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes.ts:1686 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1503 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:576 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/suggestions | user-data | session-self | server/routes/booking-actions.ts:1083 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/activate-transport | user-data | session-self | server/routes.ts:13744 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisor/narration | user-data | session-self | server/routes/advisor.routes.ts:478 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/advisors | user-data | resource-owner | server/routes/booking-actions.ts:803 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/alerts | user-data | session-self | server/routes.ts:13886 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/analytics/infer | user-data | resource-owner | server/routes/trips.routes.ts:3034 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor-suggestions | user-data | session-self | server/routes/trips.routes.ts:1859 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchor/promote | user-data | session-self | server/routes/plan-option-sets.routes.ts:266 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors | user-data | session-self | server/routes/trips.routes.ts:1609 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/anchors/:anchorId/impacts | user-data | session-self | server/routes/trips.routes.ts:1839 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/budget/calculate-split | user-data | session-self | server/routes.ts:13282 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/calculate-energy | user-data | session-self | server/routes/booking-actions.ts:2140 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/changes | user-data | session-self | server/routes/plancard.routes.ts:1114 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts | user-data | session-self | server/routes.ts:13074 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/contracts/:contractId/documents | user-data | session-self | server/routes/trips.routes.ts:1042 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/day-boundaries | user-data | session-self | server/routes/trips.routes.ts:1764 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/days/:day/retime | user-data | session-self | server/routes/versions.routes.ts:174 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency-contacts | user-data | session-self | server/routes.ts:13821 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/emergency/initialize | user-data | session-self | server/routes.ts:13838 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/expert-suggestions/accept-all | user-data | session-self | server/routes/handoff.routes.ts:313 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/finalize | user-data | resource-owner | server/routes/routing.routes.ts:473 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/flight-lookup | user-data | session-self | server/routes/trips.routes.ts:1654 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/generate-presets | user-data | session-self | server/routes/booking-actions.ts:2199 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/handoff | user-data | session-self | server/routes/handoff.routes.ts:183 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/handoff/quote | user-data | session-self | server/routes/handoff.routes.ts:167 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1734 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/route | user-data | resource-owner | server/routes/routing.routes.ts:138 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/stay-booking/book | user-data | session-self | server/routes/plan-option-sets.routes.ts:432 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/stay-booking/cancel | user-data | session-self | server/routes/plan-option-sets.routes.ts:442 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/items/:itemId/stay-booking/prebook | user-data | session-self | server/routes/plan-option-sets.routes.ts:422 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items | user-data | resource-owner | server/routes.ts:13379 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary-items/:itemId/fresh-facts | user-data | session-self | server/routes/content-facts.routes.ts:27 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/optimize-order | user-data | resource-owner | server/routes.ts:13693 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/itinerary/reorder | user-data | resource-owner | server/routes.ts:13647 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/legs/:legId/options | user-data | session-self | server/routes/transport-legs.routes.ts:390 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets | user-data | session-self | server/routes/plan-option-sets.routes.ts:185 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/choose | user-data | session-self | server/routes/plan-option-sets.routes.ts:222 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/close | user-data | session-self | server/routes/plan-option-sets.routes.ts:236 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/options | user-data | session-self | server/routes/plan-option-sets.routes.ts:196 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/:setId/reopen | user-data | session-self | server/routes/plan-option-sets.routes.ts:246 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/option-sets/suggest | user-data | session-self | server/routes/plan-option-sets.routes.ts:256 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants | user-data | resource-owner | server/routes.ts:12943 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/participants/bulk-invite | user-data | session-self | server/routes.ts:12979 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/phone-delivery/calendar | user-data | session-self | server/routes/phone-delivery.routes.ts:49 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/phone-delivery/home-screen | user-data | session-self | server/routes/phone-delivery.routes.ts:68 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/place-facts/:factId/confirm | user-data | session-self | server/routes/content-facts.routes.ts:61 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals | user-data | resource-owner | server/routes/trips.routes.ts:3831 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/apply | user-data | resource-owner | server/routes/trips.routes.ts:4139 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/discard | user-data | session-self | server/routes/trips.routes.ts:3940 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/proposals/:id/pay | user-data | resource-owner | server/routes/trips.routes.ts:3991 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/reopen | user-data | resource-owner | server/routes/routing.routes.ts:600 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/retime-fixes/:itemId/apply | user-data | session-self | server/routes/versions.routes.ts:155 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/ride-suggestions/dismiss | user-data | resource-owner | server/routes/trips.routes.ts:3137 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/rides | user-data | resource-owner | server/routes/trips.routes.ts:3093 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/slip-events | user-data | session-self | server/routes/plan-option-sets.routes.ts:277 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/stay-pick/seen | user-data | session-self | server/routes/plan-option-sets.routes.ts:456 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions | user-data | session-self | server/routes.ts:13239 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transactions/split | user-data | session-self | server/routes.ts:13256 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transport-legs/:legId/options | user-data | session-self | server/routes/transport-legs.routes.ts:384 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/transport-legs/generate | user-data | resource-owner | server/routes/transport-legs.routes.ts:121 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase | user-data | session-self | server/routes/trip-pass.routes.ts:75 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/trip-pass/purchase/confirm | user-data | session-self | server/routes/trip-pass.routes.ts:133 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/validate-schedule | user-data | session-self | server/routes/trips.routes.ts:1787 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1100 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/versions/apply-days | user-data | session-self | server/routes/versions.routes.ts:79 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/versions/days/:day/restore | user-data | session-self | server/routes/versions.routes.ts:109 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/trips/:tripId/where-to-stay | user-data | session-self | server/routes/plan-option-sets.routes.ts:343 | Not run: evidence manifest SHA-256 is stale. |
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
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1965 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | resource-owner | server/routes/content.routes.ts:2095 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:2638 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3642 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/live/click | other | session-self | server/routes/content.routes.ts:1619 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:670 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/waitlist | other | public-or-system | server/routes/launch-waitlist.routes.ts:53 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/waitlist/unsubscribe | other | public-or-system | server/routes/launch-waitlist.routes.ts:104 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/wallet/add-credits | payments | session-self | server/routes/payments.routes.ts:280 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:104 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe | payments | signature | server/routes/webhooks.routes.ts:535 | Not run: evidence manifest SHA-256 is stale. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /email-preferences | other | session-self | server/routes/itinerary-email-preferences.routes.ts:78 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /email-preferences/unsubscribe/:token | other | resource-owner | server/routes/itinerary-email-preferences.routes.ts:110 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /internal/jobs/availability-materialization | other | public-or-system | server/routes/internal.routes.ts:326 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-auto-completion | other | public-or-system | server/routes/internal.routes.ts:283 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-expiry | other | public-or-system | server/routes/internal.routes.ts:339 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/checkout-sweep | other | public-or-system | server/routes/internal.routes.ts:312 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/content-expiry-census | other | public-or-system | server/routes/internal.routes.ts:459 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/earnings-release | other | public-or-system | server/routes/internal.routes.ts:269 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/email-outbox | other | public-or-system | server/routes/internal.routes.ts:374 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/facts-recheck | other | public-or-system | server/routes/internal.routes.ts:438 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/handoff-timers | other | public-or-system | server/routes/internal.routes.ts:423 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/itinerary-generation-sweep | other | public-or-system | server/routes/internal.routes.ts:365 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/leg-google-coords | other | public-or-system | server/routes/internal.routes.ts:508 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/liteapi-booking-sync | other | public-or-system | server/routes/internal.routes.ts:491 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/liteapi-sync | other | public-or-system | server/routes/internal.routes.ts:477 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/official-refresh | other | public-or-system | server/routes/internal.routes.ts:484 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/routing-recheck | other | public-or-system | server/routes/internal.routes.ts:500 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/score-neighborhood-claims | other | public-or-system | server/routes/internal.routes.ts:392 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/stripe-reconciliation | other | public-or-system | server/routes/internal.routes.ts:294 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travel-matrix-refresh | other | public-or-system | server/routes/internal.routes.ts:408 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpayouts-report-poll | other | public-or-system | server/routes/internal.routes.ts:347 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpulse-weekly | other | public-or-system | server/routes/internal.routes.ts:415 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/waitlist-retention | other | public-or-system | server/routes/internal.routes.ts:471 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/run-occasion-drafts | other | public-or-system | server/routes/internal.routes.ts:251 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PUT /api/admin/city-knowledge/:cityKey | admin | admin-role | server/routes/city-knowledge.routes.ts:116 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/neighborhoods/:id/lead | admin | admin-role | server/routes/admin.routes.ts:9780 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/place-coords/:placeId | admin | admin-role | server/routes/admin-place-coords.routes.ts:30 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/testimonials/featured | admin | admin-role | server/routes/admin.routes.ts:8234 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/admin/ticker/order | admin | admin-role | server/routes/ticker.routes.ts:131 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1698 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2350 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/neighborhood-claims/:id/capture | user-data | session-self | server/routes/neighborhood-claims.routes.ts:102 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:407 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/me/available-now | user-data | session-self | server/routes/live-help.routes.ts:62 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/me/payout-setup | user-data | session-self | server/routes/payments.routes.ts:3198 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:563 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/availability-patterns | user-data | session-self | server/routes.ts:3665 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/blackouts | user-data | session-self | server/routes.ts:3829 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/date-ranges | user-data | session-self | server/routes.ts:3746 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/pickup-route-points | user-data | session-self | server/routes.ts:3566 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/route-points | user-data | session-self | server/routes.ts:3512 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:3609 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3957 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:267 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/trips/:tripId/destinations | user-data | session-self | server/routes/trips.routes.ts:528 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/trips/:tripId/itinerary-items/:itemId/lock | user-data | session-self | server/routes/trips.routes.ts:3062 | Not run: evidence manifest SHA-256 is stale. |
| PUT /api/trips/:tripId/profile-overlay | user-data | resource-owner | server/routes/trips.routes.ts:3173 | Resource-owner endpoint is not one of the 33 trip or two optimization real-fixture endpoints. |
