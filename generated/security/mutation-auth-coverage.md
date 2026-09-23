# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 304/589**; remaining: **285**.
- Admin: **143/148**; payments: **19/31**; user-data: **142/200**; other: **0/210**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **fresh**; manifest SHA-256: `1e817f102bb76e96e3aea888e2f7b51fa1c6e86023cba366353fad569147f0f2`; run timestamp: 2026-09-23T01:16:00.637Z.
- `admin`: **passed**, 143 exact endpoint keys, context `admin`.
- `highrisk-unauthenticated`: **passed**, 229 exact endpoint keys, context `unauthenticated`.
- `expert-provider-wrong-role`: **passed**, 53 exact endpoint keys, context `wrong-role`.
- `resource-ownership`: **passed**, 33 exact endpoint keys, context `resource-owner`.
- `payments-resource-ownership`: **passed**, 5 exact endpoint keys, context `payments-resource-owner`.
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
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1713 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:10516 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:10414 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1124 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2272 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7308 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:789 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:428 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2077 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:422 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:286 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:3119 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:163 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:10193 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:491 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:442 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:737 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:872 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7270 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:2013 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1929 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/admin/evidence-thresholds/:key | admin | admin-role | server/routes/neighborhood-claims.routes.ts:309 | Not run: fresh admin live-matrix evidence for this endpoint is absent. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:7977 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:316 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:10474 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:10309 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:10337 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1088 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:7290 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:431 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2867 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:859 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:913 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:930 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:425 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1311 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:7342 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:74 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:6046 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:2055 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2697 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:85 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:3097 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/occasions/:id | other | session-self | server/routes/occasions.routes.ts:123 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/participants/:id | user-data | resource-owner | server/routes/content.routes.ts:7145 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:2729 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:10169 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:7346 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:343 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:694 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:825 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:4103 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:124 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:7790 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:7725 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:188 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:7252 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2251 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:603 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:1139 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/user-experience-items/:id | other | resource-owner | server/routes/content.routes.ts:1990 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | resource-owner | server/routes/content.routes.ts:1880 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/admin/neighborhood-claims/:id/ratify | admin | admin-role | server/routes/neighborhood-claims.routes.ts:235 | Not run: fresh admin live-matrix evidence for this endpoint is absent. |
| POST /api/admin/neighborhood-claims/:id/rescore | admin | admin-role | server/routes/neighborhood-claims.routes.ts:286 | Not run: fresh admin live-matrix evidence for this endpoint is absent. |
| POST /api/admin/neighborhood-claims/:id/return | admin | admin-role | server/routes/neighborhood-claims.routes.ts:261 | Not run: fresh admin live-matrix evidence for this endpoint is absent. |
| POST /api/admin/neighborhood-claims/manual-entry | admin | admin-role | server/routes/neighborhood-claims.routes.ts:159 | Not run: fresh admin live-matrix evidence for this endpoint is absent. |
| POST /api/affiliate-booking-requests | other | resource-owner | server/routes/content.routes.ts:7550 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/claim | other | session-self | server/routes/content.routes.ts:7919 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:8236 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7689 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | session-self | server/routes/content.routes.ts:9076 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:9116 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:743 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:672 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4692 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:5114 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:5243 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:791 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:7326 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:7344 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:3028 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:2968 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:2918 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:310 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:188 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:530 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:68 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:375 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:451 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:489 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:379 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:7241 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:7227 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:3761 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3570 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3726 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3520 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:8991 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/cart/convert-to-itinerary | user-data | resource-owner | server/routes.ts:9303 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:8788 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:515 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:686 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:4064 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:3871 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:4112 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:3905 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:534 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:249 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:192 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:437 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:450 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:9172 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:9002 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:8987 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:12147 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:12129 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:10500 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:10257 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:10443 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:10570 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:10778 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:10854 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | resource-owner | server/routes/content.routes.ts:1062 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:2204 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2247 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/events/:experienceId/invites | other | session-self | server/routes/guest-invites.ts:172 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/events/:experienceId/invites/send | other | session-self | server/routes/guest-invites.ts:329 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-application | other | session-self | server/routes.ts:2468 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:1867 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2552 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:201 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:113 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2730 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:583 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:540 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:763 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:804 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:958 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:5650 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:11619 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:11682 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:11652 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:11520 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1293 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:7513 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:7965 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:351 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:2036 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:7030 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:7013 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:603 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | public-or-system | server/routes/content.routes.ts:4204 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/grok/chat | other | session-self | server/routes/content.routes.ts:4585 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/content/generate | other | session-self | server/routes/content.routes.ts:4436 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/intelligence | other | session-self | server/routes/content.routes.ts:4463 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/itinerary/generate | other | session-self | server/routes/content.routes.ts:4523 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:4262 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/identity/business/create-inquiry | user-data | public-or-system | server/routes/identity.routes.ts:64 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/data-deletion | other | public-or-system | server/routes/instagram.ts:567 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/deauthorize | other | public-or-system | server/routes/instagram.ts:529 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/disconnect | other | session-self | server/routes/instagram.ts:469 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/instagram/publish | other | session-self | server/routes/instagram.ts:214 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invite-templates | other | session-self | server/routes/guest-invites.ts:671 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invites/:token/origin | other | public-or-system | server/routes/guest-invites.ts:484 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/rsvp | other | public-or-system | server/routes/guest-invites.ts:518 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/travel-plans | other | public-or-system | server/routes/guest-invites.ts:616 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/itinerary-comparisons | other | signature | server/routes.ts:9423 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/adopt-stop | other | session-self | server/routes/plancard.routes.ts:288 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:842 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:50 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | resource-owner | server/routes.ts:9765 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:813 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1516 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2640 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2595 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:1924 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1551 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/landing/moments/event | other | session-self | server/routes/landing.routes.ts:180 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/memberships/checkout | other | session-self | server/routes/payments.routes.ts:3179 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/occasions | other | session-self | server/routes/occasions.routes.ts:85 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:59 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:7190 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider-application | other | session-self | server/routes.ts:2690 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:2763 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:10141 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:464 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:7512 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:249 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:558 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:759 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:3771 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6403 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/quick-start-itinerary | other | session-self | server/routes/trips.routes.ts:882 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/accept | other | session-self | server/routes/service-quotes.routes.ts:82 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/quotes/:quoteId/decline | other | session-self | server/routes/service-quotes.routes.ts:94 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ready-made/:id/purchase/confirm | payments | resource-owner | server/routes/ready-made.routes.ts:1347 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/concern | payments | resource-owner | server/routes/ready-made.routes.ts:1439 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/request-revision | payments | resource-owner | server/routes/ready-made.routes.ts:1592 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:8444 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:8474 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:8428 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:4131 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:4167 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:453 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:485 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6368 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:6340 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:969 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:37 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:995 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:id/quote-requests | other | session-self | server/routes/service-quotes.routes.ts:51 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:3166 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:522 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:82 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7484 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:9485 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:9368 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:9447 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:9328 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:9302 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:9262 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:9403 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:9238 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:324 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:422 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:565 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:531 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:3945 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5741 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5616 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5428 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:351 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:525 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:718 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes.ts:1572 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1424 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:570 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1627 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals | user-data | resource-owner | server/routes/trips.routes.ts:3621 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/apply | user-data | resource-owner | server/routes/trips.routes.ts:3929 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/proposals/:id/pay | user-data | resource-owner | server/routes/trips.routes.ts:3781 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1151 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
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
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1837 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | resource-owner | server/routes/content.routes.ts:1967 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:2417 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3379 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:653 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:89 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:29 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /internal/jobs/availability-materialization | other | public-or-system | server/routes/internal.routes.ts:240 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-auto-completion | other | public-or-system | server/routes/internal.routes.ts:209 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/booking-expiry | other | public-or-system | server/routes/internal.routes.ts:247 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/checkout-sweep | other | public-or-system | server/routes/internal.routes.ts:232 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/earnings-release | other | public-or-system | server/routes/internal.routes.ts:202 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/email-outbox | other | public-or-system | server/routes/internal.routes.ts:277 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/itinerary-generation-sweep | other | public-or-system | server/routes/internal.routes.ts:268 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/score-neighborhood-claims | other | public-or-system | server/routes/internal.routes.ts:295 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/stripe-reconciliation | other | public-or-system | server/routes/internal.routes.ts:220 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/jobs/travelpayouts-report-poll | other | public-or-system | server/routes/internal.routes.ts:255 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /internal/run-occasion-drafts | other | public-or-system | server/routes/internal.routes.ts:184 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1686 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2222 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:390 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:546 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:3351 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3677 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:247 | Other-category endpoint is intentionally outside the strict tested set. |
