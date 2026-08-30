# Mutation authorization coverage report

Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.

## Coverage summary

- **Tested: 271/546**; remaining: **275**.
- Admin: **138/138**; payments: **14/31**; user-data: **119/181**; other: **0/196**.

## Methodology and live evidence

- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.
- Evidence state: **fresh**; manifest SHA-256: `2ccbf585722d8ebf00aed6f3c74310875ee2ad1b0e42a51c1ee197480d71b5a6`; run timestamp: 2026-08-26T18:45:07.509Z.
- `admin`: **passed**, 138 exact endpoint keys, context `admin`.
- `highrisk-unauthenticated`: **passed**, 210 exact endpoint keys, context `unauthenticated`.
- `expert-provider-wrong-role`: **passed**, 41 exact endpoint keys, context `wrong-role`.
- `resource-ownership`: **passed**, 33 exact endpoint keys, context `resource-owner`.
- `optimization-confirm`: **passed**, 1 exact endpoint keys, context `optimization-confirm`.
- An endpoint is tested only when a passing, non-skipped suite in the fresh evidence artifact names that exact endpoint in its required context. Route classification alone never promotes coverage.
- Totals are a strict endpoint union, not a sum of evidence dimensions. Endpoints with both unauthenticated and cross-owner evidence are counted once.
- The confirmed optimization-confirm ownership bug is fixed: missing or mismatched Stripe `metadata.userId` is rejected before DB/revenue writes.
- Payments/user-data signature endpoints (2) are counted only for unsigned-request coverage. Session-self payments/user-data endpoints are counted from fresh unauthenticated evidence, except the 30 explicit handler-fixture exclusions below; only those exclusions are **not tested**.

## Remaining risk

Untested endpoints below need endpoint-appropriate coverage. In particular, excluded expert/provider workflows require real handler-owned resources; public/system routes and all other-category routes have no authorization assertion in this strict report.

## Untested endpoints

| Endpoint | Risk | Boundary | Source | Exact reason |
| --- | --- | --- | --- | --- |
| DELETE /api/affiliate/partners/:id | other | session-self | server/routes/content.routes.ts:7868 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1831 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-bookings/:id | other | session-self | server/routes.ts:9484 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/coordination-states/:id | other | session-self | server/routes.ts:9382 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1044 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2050 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:6844 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/expert-workspace/collections/:id/items/:itemId | other | public-or-system | server/routes/expert-workspace.routes.ts:765 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| DELETE /api/expert/ready-made/build/:id | user-data | resource-owner | server/routes/ready-made.routes.ts:293 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:428 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/faqs/:id | other | session-self | server/routes/content.routes.ts:1855 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/invites/:inviteId | other | session-self | server/routes/guest-invites.ts:272 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/me/slots/:slotId | user-data | resource-owner | server/routes/expert-console.routes.ts:274 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/notifications/:id | user-data | resource-owner | server/routes/content.routes.ts:2833 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/availability/:id | user-data | session-self | server/routes.ts:9202 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/blackout-dates/:id | user-data | resource-owner | server/routes/experts.routes.ts:491 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| DELETE /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:442 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:737 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:872 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| DELETE /api/transactions/:id | other | session-self | server/routes/content.routes.ts:6806 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/upsell/expert-review/endorse | other | session-self | server/routes/upsell.routes.ts:735 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experience-items/:id | other | session-self | server/routes/content.routes.ts:1797 | Other-category endpoint is intentionally outside the strict tested set. |
| DELETE /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1763 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/affiliate-booking-requests/:id | other | resource-owner | server/routes/content.routes.ts:7315 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/affiliate/partners/:id | other | session-self | server/routes/content.routes.ts:7851 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/concierge/requests/:id | other | resource-owner | server/routes/concierge.routes.ts:256 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-bookings/:id | other | session-self | server/routes.ts:9442 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id | other | session-self | server/routes.ts:9318 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/coordination-states/:id/status | other | session-self | server/routes.ts:9346 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/custom-venues/:id | other | resource-owner | server/routes/content.routes.ts:1016 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/emergency-contacts/:id | other | session-self | server/routes/content.routes.ts:6826 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-requests/:id/complete | other | session-self | server/routes/booking-actions.ts:377 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-review/:shareToken/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2967 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/edits/:editId/submit | other | session-self | server/routes/expert-workspace.routes.ts:835 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/assign | other | session-self | server/routes/expert-workspace.routes.ts:889 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert-workspace/gaps/:id/resolve | other | public-or-system | server/routes/expert-workspace.routes.ts:906 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| PATCH /api/expert-workspace/library/:id/extracted-places/:index | other | resource-owner | server/routes/expert-workspace.routes.ts:421 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/expert/assignments/:assignmentId/workspace-status | user-data | resource-owner | server/routes/booking-actions.ts:1119 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/bookings/:id/status | user-data | session-self | server/routes.ts:6814 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/ready-made/:id | user-data | session-self | server/routes/ready-made.routes.ts:547 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/ready-made/build/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:257 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/role | user-data | session-self | server/routes/expert-console.routes.ts:72 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/expert/services/:id/status | user-data | resource-owner | server/routes.ts:5788 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/expert/templates/:id | user-data | resource-owner | server/routes.ts:4950 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/faqs/:id | other | session-self | server/routes/content.routes.ts:1833 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/itinerary-share/:token/acknowledge | other | resource-owner | server/routes/trips.routes.ts:2797 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/me/handle | user-data | resource-owner | server/routes/storefront.routes.ts:74 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/me/reviews/:id/reply | user-data | resource-owner | server/routes/review-replies.routes.ts:116 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/notifications/:id/read | user-data | resource-owner | server/routes/content.routes.ts:2811 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider-application | other | session-self | server/routes.ts:2153 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/provider/availability/:id | user-data | session-self | server/routes.ts:9178 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bookings/:id/status | user-data | session-self | server/routes.ts:6818 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/bundles/:id | user-data | session-self | server/routes/provider.routes.ts:343 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/properties/:id | user-data | session-self | server/routes/provider.routes.ts:694 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/rooms/:id | user-data | session-self | server/routes/provider.routes.ts:825 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PATCH /api/provider/services/:id | user-data | resource-owner | server/routes.ts:3401 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/provider/settings | user-data | resource-owner | server/routes/provider.routes.ts:124 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/service-bookings/:id/document-checklist | other | session-self | server/routes.ts:7020 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/service-bookings/:id/visa-status | other | session-self | server/routes.ts:6955 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/short-links/:id | other | resource-owner | server/routes/short-links.routes.ts:192 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transactions/:id | other | session-self | server/routes/content.routes.ts:6788 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-booking-options/:optionId/status | other | session-self | server/routes/transport-hub.routes.ts:439 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/mode | other | resource-owner | server/routes/trips.routes.ts:2351 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/transport-legs/:legId/status | other | resource-owner | server/routes/plancard.routes.ts:389 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/trips/:id/suggestions/:suggestionId | user-data | resource-owner | server/routes/booking-actions.ts:959 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PATCH /api/user-experience-items/:id | other | session-self | server/routes/content.routes.ts:1787 | Other-category endpoint is intentionally outside the strict tested set. |
| PATCH /api/user-experiences/:id | other | session-self | server/routes/content.routes.ts:1723 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests | other | session-self | server/routes/content.routes.ts:7086 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/:id/verify | other | session-self | server/routes/content.routes.ts:7484 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate-booking-requests/from-catalog | other | session-self | server/routes/content.routes.ts:7185 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/partners | other | session-self | server/routes/content.routes.ts:7788 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/partners/:id/scrape | other | session-self | server/routes/content.routes.ts:7882 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/affiliate/track-click | other | public-or-system | server/routes/content.routes.ts:8263 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/affiliates/track | other | session-self | server/routes/content.routes.ts:8296 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/chat | other | session-self | server/routes/content.routes.ts:702 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-blueprint | other | session-self | server/routes/content.routes.ts:631 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-itinerary | other | session-self | server/routes/content.routes.ts:4394 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/generate-optimized-itineraries | other | session-self | server/routes/content.routes.ts:4737 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/itineraries/:id/save-as-trip | other | resource-owner | server/routes/content.routes.ts:4866 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ai/optimize-experience | other | session-self | server/routes/content.routes.ts:750 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/acknowledge | other | session-self | server/routes/content.routes.ts:6862 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/alerts/:id/dismiss | other | session-self | server/routes/content.routes.ts:6880 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/booking | other | session-self | server/routes/content.routes.ts:2742 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/itinerary-generated | other | session-self | server/routes/content.routes.ts:2682 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/analytics/search-event | other | session-self | server/routes/content.routes.ts:2632 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/accept-terms | other | session-self | server/replit_integrations/auth/routes.ts:147 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/forgot-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:310 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/login | other | session-self | server/replit_integrations/auth/emailAuth.ts:188 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/auth/logout | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:530 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/register | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:68 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/reset-password | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:375 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/send-verification | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:451 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/auth/verify-email | other | public-or-system | server/replit_integrations/auth/emailAuth.ts:489 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/bookings/:id/confirm-completion | payments | resource-owner | server/routes/bookings.ts:637 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/dispute | payments | resource-owner | server/routes/bookings.ts:709 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/:id/pay-balance | payments | resource-owner | server/routes/payments.routes.ts:1666 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/bulk-status | user-data | resource-owner | server/routes/bookings.ts:305 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/confirm-payment | payments | resource-owner | server/routes/bookings.ts:182 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/bookings/refund | payments | resource-owner | server/routes/bookings.ts:509 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/budget/calculate-tip | other | session-self | server/routes/content.routes.ts:6777 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/budget/convert-currency | other | session-self | server/routes/content.routes.ts:6763 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/checkout-verify | other | session-self | server/routes/content.routes.ts:3475 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/cleanup | other | session-self | server/routes/content.routes.ts:3284 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/refresh | other | session-self | server/routes/content.routes.ts:3440 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cache/verify-availability | other | session-self | server/routes/content.routes.ts:3234 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/cart | user-data | resource-owner | server/routes.ts:8103 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/cart/resolve-trip | user-data | resource-owner | server/routes.ts:7937 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/chat/start | other | session-self | server/routes/content.routes.ts:474 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/chats | other | session-self | server/routes/trips.routes.ts:650 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/full-itinerary-graph | other | session-self | server/routes/content.routes.ts:3766 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/optimize-itinerary | other | session-self | server/routes/content.routes.ts:3573 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/recommendations | other | session-self | server/routes/content.routes.ts:3814 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/claude/transportation-analysis | other | session-self | server/routes/content.routes.ts:3607 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/escalations | other | resource-owner | server/routes/concierge.routes.ts:474 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/quote | other | session-self | server/routes/concierge.routes.ts:194 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests | other | resource-owner | server/routes/concierge.routes.ts:142 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/concierge/requests/:id/claim | other | session-self | server/routes/concierge.routes.ts:377 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contact | other | public-or-system | server/routes/content.routes.ts:409 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/content/:trackingNumber/flag | other | session-self | server/routes/content.routes.ts:8352 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/affiliate-redirect | other | session-self | server/routes/content.routes.ts:8189 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/content/checkout | other | session-self | server/routes/content.routes.ts:8174 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/contracts/:id/milestone | payments | resource-owner | server/routes.ts:11070 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/contracts/:id/payment | payments | resource-owner | server/routes.ts:11052 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-bookings/:id/confirm | other | session-self | server/routes.ts:9468 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states | other | resource-owner | server/routes.ts:9266 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:coordinationId/bookings | other | session-self | server/routes.ts:9411 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/coordination-states/:id/pay | payments | resource-owner | server/routes.ts:9538 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/pay/confirm | payments | resource-owner | server/routes.ts:9741 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/coordination-states/:id/refund | payments | resource-owner | server/routes.ts:9817 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/cross-sell-events | other | session-self | server/routes/cross-sell.routes.ts:38 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/custom-venues | other | session-self | server/routes/content.routes.ts:1000 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events | other | session-self | server/routes/content.routes.ts:1982 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/destination-calendar/events/:id/submit | other | session-self | server/routes/content.routes.ts:2025 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/events/:experienceId/invites | other | session-self | server/routes/guest-invites.ts:149 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-application | other | session-self | server/routes.ts:1962 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-booking-requests | other | resource-owner | server/routes.ts:1564 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-forms | other | session-self | server/routes.ts:2020 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests | other | resource-owner | server/routes/booking-actions.ts:170 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-requests/payment-intent | payments | resource-owner | server/routes/booking-actions.ts:107 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert-review/:shareToken/submit | other | resource-owner | server/routes/trips.routes.ts:2830 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-templates/:id/purchase | other | session-self | server/routes.ts:5118 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-templates/:id/purchase/confirm | other | resource-owner | server/routes.ts:5211 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-templates/:id/reviews | other | session-self | server/routes.ts:5362 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/build-itinerary | other | resource-owner | server/routes/expert-workspace.routes.ts:579 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections | other | session-self | server/routes/expert-workspace.routes.ts:536 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/collections/:id/items | other | public-or-system | server/routes/expert-workspace.routes.ts:739 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert-workspace/content/:id/edit | other | session-self | server/routes/expert-workspace.routes.ts:780 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/library/:id/extract-places | other | session-self | server/routes/expert-workspace.routes.ts:375 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/expert-workspace/scrape-jobs | other | public-or-system | server/routes/expert-workspace.routes.ts:934 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/expert/:expertId/tip | payments | resource-owner | server/routes.ts:5427 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ai-tasks/:taskId/approve | user-data | session-self | server/routes.ts:10551 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/regenerate | user-data | session-self | server/routes.ts:10614 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/:taskId/reject | user-data | session-self | server/routes.ts:10584 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ai-tasks/delegate | user-data | session-self | server/routes.ts:10452 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/assignments/:assignmentId/accept | user-data | session-self | server/routes/booking-actions.ts:1101 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/bookings/:id/complete | user-data | session-self | server/routes.ts:6952 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ready-made | user-data | resource-owner | server/routes/ready-made.routes.ts:64 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert/ready-made/:id/build-review | user-data | session-self | server/routes/ready-made.routes.ts:754 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ready-made/:id/submit | user-data | session-self | server/routes/ready-made.routes.ts:659 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ready-made/:id/withdraw | user-data | session-self | server/routes/ready-made.routes.ts:720 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/ready-made/from-trip/:tripId | user-data | resource-owner | server/routes/ready-made.routes.ts:132 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/expert/reviews/:id/respond | user-data | session-self | server/routes.ts:7173 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/expert/trips/:tripId/vendors | user-data | session-self | server/routes/experts.routes.ts:351 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/faqs | other | session-self | server/routes/content.routes.ts:1814 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh-all | other | session-self | server/routes/content.routes.ts:6663 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/fever/cache/refresh/:cityCode | other | session-self | server/routes/content.routes.ts:6641 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/generated-itineraries | other | session-self | server/routes/content.routes.ts:562 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/geocode | other | public-or-system | server/routes/content.routes.ts:3906 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/grok/chat | other | session-self | server/routes/content.routes.ts:4287 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/content/generate | other | session-self | server/routes/content.routes.ts:4138 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/intelligence | other | session-self | server/routes/content.routes.ts:4165 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/itinerary/generate | other | session-self | server/routes/content.routes.ts:4225 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/grok/match-experts | other | session-self | server/routes/content.routes.ts:3964 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/identity/business/create-inquiry | user-data | public-or-system | server/routes/identity.routes.ts:64 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/data-deletion | other | public-or-system | server/routes/instagram.ts:567 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/deauthorize | other | public-or-system | server/routes/instagram.ts:529 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/instagram/disconnect | other | session-self | server/routes/instagram.ts:469 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/instagram/publish | other | session-self | server/routes/instagram.ts:214 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invite-templates | other | session-self | server/routes/guest-invites.ts:521 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/invites/:token/origin | other | public-or-system | server/routes/guest-invites.ts:334 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/rsvp | other | public-or-system | server/routes/guest-invites.ts:368 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/invites/:token/travel-plans | other | public-or-system | server/routes/guest-invites.ts:466 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/itinerary-comparisons | other | resource-owner | server/routes.ts:8488 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-cart | other | session-self | server/routes/trips.routes.ts:806 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/apply-to-trip | other | resource-owner | server/routes/plancard.routes.ts:45 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/generate | other | session-self | server/routes.ts:8785 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-comparisons/:id/select | other | session-self | server/routes/trips.routes.ts:777 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-items/:id/backup | other | resource-owner | server/routes/trips.routes.ts:1457 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-share/:token/suggest | other | resource-owner | server/routes/trips.routes.ts:2740 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/calculate-transport | other | session-self | server/routes/trips.routes.ts:2695 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary-variants/:variantId/share | other | session-self | server/routes/trips.routes.ts:2042 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/itinerary/estimate-travel | other | session-self | server/routes/trips.routes.ts:1523 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/optimization-preview | other | session-self | server/routes/optimization.routes.ts:55 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/participants/:id/payment | payments | resource-owner | server/routes/content.routes.ts:6726 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider-application | other | session-self | server/routes.ts:2121 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider-forms | other | session-self | server/routes.ts:2187 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/provider/availability | user-data | resource-owner | server/routes.ts:9150 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider/blackout-dates | user-data | session-self | server/routes/experts.routes.ts:464 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bookings/:id/complete | user-data | session-self | server/routes.ts:6951 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/bundles | user-data | session-self | server/routes/provider.routes.ts:249 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties | user-data | session-self | server/routes/provider.routes.ts:558 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/properties/:id/rooms | user-data | session-self | server/routes/provider.routes.ts:759 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| POST /api/provider/services | user-data | resource-owner | server/routes.ts:3144 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/provider/services/:id/deliverable-file | user-data | resource-owner | server/routes.ts:6064 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/quick-start-itinerary | other | session-self | server/routes/trips.routes.ts:846 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/ready-made/:id/purchase/confirm | payments | resource-owner | server/routes/ready-made.routes.ts:1309 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/concern | payments | resource-owner | server/routes/ready-made.routes.ts:1393 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/ready-made/purchases/:id/request-revision | payments | resource-owner | server/routes/ready-made.routes.ts:1544 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/recommendations/:id/convert | other | session-self | server/routes.ts:7631 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/:id/dismiss | other | session-self | server/routes.ts:7661 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/recommendations/refresh/:city | other | session-self | server/routes.ts:7615 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit | other | session-self | server/routes/content.routes.ts:3833 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/routes/transit-multi | other | session-self | server/routes/content.routes.ts:3869 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips | other | session-self | server/routes/booking-actions.ts:399 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/saved-trips/:id/convert | other | session-self | server/routes/booking-actions.ts:431 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/inquiry | other | session-self | server/routes/content.routes.ts:6001 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/serp/track-click | other | public-or-system | server/routes/content.routes.ts:5973 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/service-categories | other | session-self | server/routes/content.routes.ts:928 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-requests | other | session-self | server/routes/service-requests.routes.ts:37 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/service-subcategories | other | session-self | server/routes/content.routes.ts:954 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/services/:serviceId/reviews | other | session-self | server/routes/content.routes.ts:2880 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/shared-trips | other | session-self | server/routes/booking-actions.ts:468 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/short-links | other | resource-owner | server/routes/short-links.routes.ts:78 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/spontaneous/:id/book | other | session-self | server/routes/content.routes.ts:7020 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/accommodation-preference | other | session-self | server/routes/content.routes.ts:8665 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/activity | other | session-self | server/routes/content.routes.ts:8548 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/destination-search | other | session-self | server/routes/content.routes.ts:8627 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/funnel | other | session-self | server/routes/content.routes.ts:8508 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/pageview | other | session-self | server/routes/content.routes.ts:8482 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/search | other | session-self | server/routes/content.routes.ts:8442 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/track/trip-enhanced | other | session-self | server/routes/content.routes.ts:8583 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/tracking/impression | other | session-self | server/routes/content.routes.ts:8418 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/book | other | session-self | server/routes/transport-hub.routes.ts:293 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/:optionId/click | other | session-self | server/routes/transport-hub.routes.ts:375 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/:variantId | other | session-self | server/routes/transport-hub.routes.ts:538 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-booking-options/seed/test-variant | other | session-self | server/routes/transport-hub.routes.ts:504 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/transport-packages/generate | other | session-self | server/routes/content.routes.ts:3647 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/media/track-download | other | public-or-system | server/routes/content.routes.ts:5336 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/travelpulse/seed | other | session-self | server/routes/content.routes.ts:5211 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/travelpulse/truth-check | other | public-or-system | server/routes/content.routes.ts:5023 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trip-context/extract | other | signature | server/routes/trip-context.routes.ts:247 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/trips | user-data | public-or-system | server/routes/trips.routes.ts:348 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/trips/:id/expert-advisor | user-data | resource-owner | server/routes/booking-actions.ts:645 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/generate-itinerary | user-data | resource-owner | server/routes/trips.routes.ts:472 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/plan-review | user-data | resource-owner | server/routes/booking-actions.ts:1232 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:id/share | user-data | resource-owner | server/routes/booking-actions.ts:516 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/items/:itemId/comments | user-data | resource-owner | server/routes/booking-actions.ts:1435 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| POST /api/trips/:tripId/vendors/bulk-email | user-data | resource-owner | server/routes/trips.routes.ts:1175 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
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
| POST /api/user-experiences | other | session-self | server/routes/content.routes.ts:1688 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/user-experiences/:id/items | other | session-self | server/routes/content.routes.ts:1775 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/vendors | other | session-self | server/routes.ts:1935 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/viator/availability | other | session-self | server/routes/content.routes.ts:3093 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/visa/requirements | other | public-or-system | server/routes/experts.routes.ts:689 | Public-or-system boundary is intentionally outside the strict protected-endpoint test set. |
| POST /api/webhooks/persona | other | signature | server/routes/webhooks.routes.ts:89 | Other-category endpoint is intentionally outside the strict tested set. |
| POST /api/webhooks/stripe-identity | other | signature | server/routes/webhooks.routes.ts:29 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/anchors/:id | other | resource-owner | server/routes/trips.routes.ts:1804 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/destination-calendar/events/:id | other | session-self | server/routes/content.routes.ts:2000 | Other-category endpoint is intentionally outside the strict tested set. |
| PUT /api/expert/vendors/:vendorId | user-data | session-self | server/routes/experts.routes.ts:390 | Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed. |
| PUT /api/provider/booking-requests/:requestId/respond | user-data | resource-owner | server/routes/experts.routes.ts:546 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/surcharge-tiers | payments | resource-owner | server/routes.ts:2724 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/provider/services/:id/translations/:locale | user-data | resource-owner | server/routes.ts:3050 | Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints. |
| PUT /api/trip-context | other | session-self | server/routes/trip-context.routes.ts:131 | Other-category endpoint is intentionally outside the strict tested set. |
