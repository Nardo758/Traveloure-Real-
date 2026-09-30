# Mounted mutation authorization inventory

Generated from `server/routes.ts`. **615** raw mounted mutation registrations and **606** unique METHOD+normalizedPath pairs were found.

The unique-pair count is **+60** from the historical 546 comparison clue. The generator does not read that clue: it follows the current source mount graph. Raw registrations retain currently mounted, later-shadowed registrations; duplicate registrations are listed in the JSON manifest. A changed count indicates current route additions/removals or mount-graph changes, not an automatic regression.

Category totals: payments 31; admin 151; user-data 209; other 215.
Boundary totals: admin-role 151; session-self 317; resource-owner 94; signature 6; public-or-system 38; unknown 0.

| Method | Normalized path | Risk | Boundary | Ownership applicable | Expected ownership | Registrations | Fixture | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/affiliate/partners` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8734` | unknown | unknown |
| DELETE | `/api/admin/affiliate/partners/:id` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8814` | unknown | unknown |
| PATCH | `/api/admin/affiliate/partners/:id` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8797` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9112` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9123` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/scrape` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8828` | unknown | unknown |
| PATCH | `/api/admin/affiliate/reconciliation/:earningId` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4090` | unknown | unknown |
| POST | `/api/admin/bookings/:bookingId/lost-chargeback/reconcile` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:690` | unknown | unknown |
| POST | `/api/admin/bookings/:bookingId/out-of-band-refund/clear` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:640` | unknown | unknown |
| PATCH | `/api/admin/bookings/auto-cancel/config` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:2009` | unknown | unknown |
| POST | `/api/admin/bookings/auto-cancel/run` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:2031` | unknown | unknown |
| POST | `/api/admin/catalog/ingest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2460` | unknown | unknown |
| POST | `/api/admin/categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3450` | unknown | unknown |
| POST | `/api/admin/categories/:categoryId/subcategories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3626` | unknown | unknown |
| DELETE | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3615` | unknown | unknown |
| PATCH | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3502` | unknown | unknown |
| PATCH | `/api/admin/contact-submissions/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2696` | unknown | unknown |
| POST | `/api/admin/content-placement-rules` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8191` | unknown | unknown |
| DELETE | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8214` | unknown | unknown |
| PATCH | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8202` | unknown | unknown |
| POST | `/api/admin/content-placement-rules/auto-index` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8227` | unknown | unknown |
| POST | `/api/admin/content/:trackingNumber/moderate` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4268` | unknown | unknown |
| POST | `/api/admin/content/flags/:flagId/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4321` | unknown | unknown |
| POST | `/api/admin/content/register` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4213` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/assign-coordinator` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:992` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/review-ledger-gap` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1083` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/approve` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:855` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/generate` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:839` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/withdraw` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:871` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3973` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3999` | unknown | unknown |
| POST | `/api/admin/digest/send-now` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8875` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/refund-rejected-artifact` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1726` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1556` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/uphold` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1623` | unknown | unknown |
| POST | `/api/admin/dmo/analyze-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2104` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2120` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-kyoto` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2063` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-youtube` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2154` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2397` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2487` | unknown | unknown |
| POST | `/api/admin/dmo/publish-batch` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2571` | unknown | unknown |
| POST | `/api/admin/dmo/publish/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2526` | unknown | unknown |
| POST | `/api/admin/dmo/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2625` | unknown | unknown |
| POST | `/api/admin/dmo/sync-registry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2442` | unknown | unknown |
| POST | `/api/admin/email-outbox/:id/retry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9189` | unknown | unknown |
| POST | `/api/admin/event-packages` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8430` | unknown | unknown |
| DELETE | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8479` | unknown | unknown |
| PATCH | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8452` | unknown | unknown |
| PATCH | `/api/admin/evidence-thresholds/:key` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:310` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2916` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2785` | unknown | unknown |
| POST | `/api/admin/expert-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7651` | unknown | unknown |
| DELETE | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7683` | unknown | unknown |
| PATCH | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7661` | unknown | unknown |
| PATCH | `/api/admin/expert-templates/:id/roles` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3377` | unknown | unknown |
| PATCH | `/api/admin/fee-bands/:bandKey` | admin | admin-role | no | verified | `server/routes/admin.routes.ts:7386` | unknown | unknown |
| POST | `/api/admin/gem-candidates/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8095` | unknown | unknown |
| POST | `/api/admin/gem-candidates/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8138` | unknown | unknown |
| POST | `/api/admin/gems/backfill-photos` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:308` | unknown | unknown |
| POST | `/api/admin/invoices` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4585` | unknown | unknown |
| PATCH | `/api/admin/invoices/:invoiceNumber/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4649` | unknown | unknown |
| PATCH | `/api/admin/lead-routing-logs/:id/override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7810` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/assign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7890` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7993` | unknown | unknown |
| POST | `/api/admin/markets` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:186` | unknown | unknown |
| POST | `/api/admin/markets/:slug/refresh-geography` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:282` | unknown | unknown |
| PATCH | `/api/admin/message-reports/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7181` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/ratify` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:236` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/rescore` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:287` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/return` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:262` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/manual-entry` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:160` | unknown | unknown |
| PATCH | `/api/admin/neighborhoods/:id/adjacency` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8780` | unknown | unknown |
| POST | `/api/admin/neighborhoods/:id/coverage-targets` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8602` | unknown | unknown |
| DELETE | `/api/admin/neighborhoods/:id/coverage-targets/:categoryKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8651` | unknown | unknown |
| PUT | `/api/admin/neighborhoods/:id/lead` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8676` | unknown | unknown |
| POST | `/api/admin/neighborhoods/backfill` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8563` | unknown | unknown |
| DELETE | `/api/admin/notifications/:id` | admin | admin-role | no | unknown | `server/routes.ts:13223` | unknown | unknown |
| PATCH | `/api/admin/notifications/:id/read` | admin | admin-role | no | unknown | `server/routes.ts:13189` | unknown | unknown |
| PATCH | `/api/admin/notifications/read-all` | admin | admin-role | no | unknown | `server/routes.ts:13249` | unknown | unknown |
| POST | `/api/admin/optimization-fees` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8367` | unknown | unknown |
| POST | `/api/admin/payouts` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5426` | unknown | unknown |
| PATCH | `/api/admin/payouts/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5492` | unknown | unknown |
| PATCH | `/api/admin/platform-settings/:settingKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7714` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3218` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3113` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/approve` | admin | admin-role | no | verified | `server/routes/admin.routes.ts:3791` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3880` | unknown | unknown |
| POST | `/api/admin/providers/:userId/remind-stripe` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3094` | unknown | unknown |
| POST | `/api/admin/qa/run-nightly` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9026` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1143` | unknown | unknown |
| PATCH | `/api/admin/ready-made/:id/badge` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1262` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1294` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/dismiss` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1499` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/refund` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1394` | unknown | unknown |
| POST | `/api/admin/reviews/:id/clear-response` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:7267` | unknown | unknown |
| PATCH | `/api/admin/reviews/:id/status` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:7246` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8003` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/reassign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8013` | unknown | unknown |
| POST | `/api/admin/seed-categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3682` | unknown | unknown |
| POST | `/api/admin/service-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7598` | unknown | unknown |
| DELETE | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7631` | unknown | unknown |
| PATCH | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7608` | unknown | unknown |
| PATCH | `/api/admin/service-requests/:id` | admin | admin-role | no | unknown | `server/routes/service-requests.routes.ts:116` | unknown | unknown |
| POST | `/api/admin/service-templates` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3255` | unknown | unknown |
| DELETE | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3322` | unknown | unknown |
| PATCH | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3300` | unknown | unknown |
| DELETE | `/api/admin/services/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4516` | unknown | unknown |
| PATCH | `/api/admin/services/:id/affinity-tags` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4490` | unknown | unknown |
| PATCH | `/api/admin/services/:id/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4474` | unknown | unknown |
| PATCH | `/api/admin/services/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4455` | unknown | unknown |
| DELETE | `/api/admin/slow-queries` | admin | admin-role | no | unknown | `server/routes.ts:12116` | unknown | unknown |
| DELETE | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3671` | unknown | unknown |
| PATCH | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3649` | unknown | unknown |
| POST | `/api/admin/system/test-email` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6468` | unknown | unknown |
| PUT | `/api/admin/testimonials/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7318` | unknown | unknown |
| POST | `/api/admin/trigger-digest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8863` | unknown | unknown |
| DELETE | `/api/admin/users/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5802` | unknown | unknown |
| PATCH | `/api/admin/users/:id/commission-override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2993` | unknown | unknown |
| PATCH | `/api/admin/users/:id/suspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8903` | unknown | unknown |
| PATCH | `/api/admin/users/:id/unsuspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9068` | unknown | unknown |
| PATCH | `/api/admin/users/:id/verification` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2946` | unknown | unknown |
| POST | `/api/affiliate-booking-requests` | other | resource-owner | no | verified | `server/routes/content.routes.ts:7657` | unknown | unknown |
| PATCH | `/api/affiliate-booking-requests/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:8094` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/:id/claim` | other | session-self | no | unknown | `server/routes/content.routes.ts:8036` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/:id/verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:8381` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/from-catalog` | other | session-self | no | unknown | `server/routes/content.routes.ts:7796` | unknown | unknown |
| POST | `/api/affiliate/track-click` | other | session-self | no | unknown | `server/routes/content.routes.ts:9232` | unknown | unknown |
| POST | `/api/affiliates/track` | other | session-self | no | unknown | `server/routes/content.routes.ts:9272` | unknown | unknown |
| POST | `/api/ai/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:754` | unknown | unknown |
| POST | `/api/ai/generate-blueprint` | other | session-self | no | unknown | `server/routes/content.routes.ts:683` | unknown | unknown |
| POST | `/api/ai/generate-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:4768` | unknown | unknown |
| POST | `/api/ai/generate-optimized-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:5202` | unknown | unknown |
| POST | `/api/ai/itineraries/:id/save-as-trip` | other | resource-owner | no | verified | `server/routes/content.routes.ts:5331` | unknown | unknown |
| POST | `/api/ai/optimize-experience` | other | session-self | no | unknown | `server/routes/content.routes.ts:802` | unknown | unknown |
| POST | `/api/alerts/:id/acknowledge` | other | session-self | no | unknown | `server/routes/content.routes.ts:7433` | unknown | unknown |
| POST | `/api/alerts/:id/dismiss` | other | session-self | no | unknown | `server/routes/content.routes.ts:7451` | unknown | unknown |
| POST | `/api/analytics/booking` | other | session-self | no | unknown | `server/routes/content.routes.ts:3068` | unknown | unknown |
| POST | `/api/analytics/itinerary-generated` | other | session-self | no | unknown | `server/routes/content.routes.ts:3008` | unknown | unknown |
| POST | `/api/analytics/recruitment-click` | other | session-self | no | unknown | `server/routes/content.routes.ts:2941` | unknown | unknown |
| POST | `/api/analytics/search-event` | other | session-self | no | unknown | `server/routes/content.routes.ts:2958` | unknown | unknown |
| DELETE | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1709` | unknown | unknown |
| PUT | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1682` | unknown | unknown |
| POST | `/api/auth/accept-terms` | other | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:147` | unknown | unknown |
| DELETE | `/api/auth/account` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:203` | unknown | unknown |
| POST | `/api/auth/forgot-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:310` | unknown | unknown |
| POST | `/api/auth/login` | other | session-self | no | unknown | `server/replit_integrations/auth/emailAuth.ts:188` | unknown | unknown |
| POST | `/api/auth/logout` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:530` | unknown | unknown |
| POST | `/api/auth/register` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:68` | unknown | unknown |
| POST | `/api/auth/reset-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:375` | unknown | unknown |
| POST | `/api/auth/send-verification` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:451` | unknown | unknown |
| POST | `/api/auth/verify-email` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:489` | unknown | unknown |
| POST | `/api/bookings` | user-data | session-self | yes | unknown | `server/routes.ts:7055` | unknown | unknown |
| POST | `/api/bookings/:id/accept-deliverable` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:942` (/:id/accept-deliverable) | unknown | unknown |
| POST | `/api/bookings/:id/cancel` | user-data | session-self | yes | unknown | `server/routes.ts:8009` | unknown | unknown |
| POST | `/api/bookings/:id/components/:componentServiceId/cancel` | user-data | session-self | yes | unknown | `server/routes.ts:7815` | unknown | unknown |
| POST | `/api/bookings/:id/confirm-completion` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:746` (/:id/confirm-completion) | unknown | unknown |
| POST | `/api/bookings/:id/deliver-artifact` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:1011` (/:id/deliver-artifact) | unknown | unknown |
| POST | `/api/bookings/:id/dispute` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:824` (/:id/dispute) | unknown | unknown |
| POST | `/api/bookings/:id/pay-balance` | payments | resource-owner | yes | verified | `server/routes/payments.routes.ts:2214` | unknown | unknown |
| POST | `/api/bookings/:id/request-revision` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:968` (/:id/request-revision) | unknown | unknown |
| POST | `/api/bookings/bulk-status` | user-data | resource-owner | yes | verified | `server/routes/bookings.ts:380` (/bulk-status) | unknown | unknown |
| POST | `/api/bookings/confirm-payment` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:255` (/confirm-payment) | unknown | unknown |
| POST | `/api/bookings/estimate-cost` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:491` (/estimate-cost) | unknown | unknown |
| POST | `/api/bookings/process-cart` | payments | session-self | no | self | `server/routes/bookings.ts:152` (/process-cart) | unknown | unknown |
| POST | `/api/bookings/refund` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:593` (/refund) | unknown | unknown |
| POST | `/api/bookings/webhooks/stripe` | payments | signature | no | unknown | `server/routes/bookings.ts:536` (/webhooks/stripe) | unknown | unknown |
| POST | `/api/budget/calculate-tip` | other | session-self | no | unknown | `server/routes/content.routes.ts:7348` | unknown | unknown |
| POST | `/api/budget/convert-currency` | other | session-self | no | unknown | `server/routes/content.routes.ts:7334` | unknown | unknown |
| POST | `/api/cache/checkout-verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:3837` | unknown | unknown |
| POST | `/api/cache/cleanup` | other | session-self | no | unknown | `server/routes/content.routes.ts:3644` | unknown | unknown |
| POST | `/api/cache/refresh` | other | session-self | no | unknown | `server/routes/content.routes.ts:3803` | unknown | unknown |
| POST | `/api/cache/verify-availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3594` | unknown | unknown |
| DELETE | `/api/cart` | user-data | session-self | yes | unknown | `server/routes.ts:9484` | unknown | unknown |
| POST | `/api/cart` | user-data | resource-owner | yes | verified | `server/routes.ts:9208` | unknown | unknown |
| DELETE | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9466` | unknown | unknown |
| PATCH | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9394` | unknown | unknown |
| POST | `/api/cart/convert-to-itinerary` | user-data | resource-owner | yes | verified | `server/routes.ts:9520` | unknown | unknown |
| POST | `/api/cart/items` | user-data | session-self | yes | unknown | `server/routes.ts:6925` | unknown | unknown |
| POST | `/api/cart/migrate` | user-data | session-self | yes | unknown | `server/routes.ts:9496` | unknown | unknown |
| POST | `/api/cart/resolve-trip` | user-data | resource-owner | yes | verified | `server/routes.ts:9005` | unknown | unknown |
| POST | `/api/chat/start` | other | session-self | no | unknown | `server/routes/content.routes.ts:516` | unknown | unknown |
| POST | `/api/chats` | other | session-self | no | unknown | `server/routes.ts:2267`<br>`server/routes/trips.routes.ts:682` | unknown | unknown |
| POST | `/api/checkout` | payments | session-self | no | self | `server/routes/payments.routes.ts:1032` | unknown | unknown |
| POST | `/api/claude/full-itinerary-graph` | other | session-self | no | unknown | `server/routes/content.routes.ts:4140` | unknown | unknown |
| POST | `/api/claude/optimize-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:3947` | unknown | unknown |
| POST | `/api/claude/recommendations` | other | session-self | no | unknown | `server/routes/content.routes.ts:4188` | unknown | unknown |
| POST | `/api/claude/transportation-analysis` | other | session-self | no | unknown | `server/routes/content.routes.ts:3981` | unknown | unknown |
| POST | `/api/concierge/escalations` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:534` | unknown | unknown |
| POST | `/api/concierge/quote` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:249` | unknown | unknown |
| POST | `/api/concierge/requests` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:192` | unknown | unknown |
| PATCH | `/api/concierge/requests/:id` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:316` | unknown | unknown |
| POST | `/api/concierge/requests/:id/claim` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:437` | unknown | unknown |
| POST | `/api/contact` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:451` | unknown | unknown |
| POST | `/api/content/:trackingNumber/flag` | other | session-self | no | unknown | `server/routes/content.routes.ts:9339` | unknown | unknown |
| POST | `/api/content/affiliate-redirect` | other | session-self | no | unknown | `server/routes/content.routes.ts:9158` | unknown | unknown |
| POST | `/api/content/checkout` | other | session-self | no | unknown | `server/routes/content.routes.ts:9143` | unknown | unknown |
| DELETE | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:12414` | unknown | unknown |
| PATCH | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:12345` | unknown | unknown |
| POST | `/api/contracts/:id/communication` | user-data | session-self | yes | unknown | `server/routes.ts:12397` | unknown | unknown |
| POST | `/api/contracts/:id/milestone` | payments | resource-owner | yes | verified | `server/routes.ts:12380` | unknown | unknown |
| POST | `/api/contracts/:id/payment` | payments | resource-owner | yes | verified | `server/routes.ts:12362` | unknown | unknown |
| POST | `/api/conversations` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:53` | unknown | unknown |
| DELETE | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:108` | unknown | unknown |
| PATCH | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:90` | unknown | unknown |
| POST | `/api/conversations/:id/messages` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:121` | unknown | unknown |
| POST | `/api/conversations/start` | user-data | session-self | yes | unknown | `server/routes/conversations.routes.ts:65` | unknown | unknown |
| DELETE | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:10733` | unknown | unknown |
| PATCH | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:10691` | unknown | unknown |
| POST | `/api/coordination-bookings/:id/confirm` | other | session-self | no | unknown | `server/routes.ts:10717` | unknown | unknown |
| POST | `/api/coordination-states` | other | resource-owner | no | verified | `server/routes.ts:10474` | unknown | unknown |
| POST | `/api/coordination-states/:coordinationId/bookings` | other | session-self | yes | unknown | `server/routes.ts:10660` | unknown | unknown |
| DELETE | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:10631` | unknown | unknown |
| PATCH | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:10526` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay` | payments | resource-owner | yes | verified | `server/routes.ts:10787` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay/confirm` | payments | resource-owner | yes | verified | `server/routes.ts:11011` | unknown | unknown |
| POST | `/api/coordination-states/:id/refund` | payments | resource-owner | yes | verified | `server/routes.ts:11087` | unknown | unknown |
| PATCH | `/api/coordination-states/:id/status` | other | session-self | no | unknown | `server/routes.ts:10554` | unknown | unknown |
| POST | `/api/credits/purchase` | payments | session-self | no | self | `server/routes/payments.routes.ts:282` | unknown | unknown |
| POST | `/api/cross-sell-events` | other | session-self | no | unknown | `server/routes/cross-sell.routes.ts:38` | unknown | unknown |
| POST | `/api/custom-venues` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1073` | unknown | unknown |
| DELETE | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1135` | unknown | unknown |
| PATCH | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1099` | unknown | unknown |
| POST | `/api/destination-calendar/events` | other | session-self | no | unknown | `server/routes/content.routes.ts:2215` | unknown | unknown |
| DELETE | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2283` | unknown | unknown |
| PUT | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2233` | unknown | unknown |
| POST | `/api/destination-calendar/events/:id/submit` | other | session-self | no | unknown | `server/routes/content.routes.ts:2258` | unknown | unknown |
| POST | `/api/discovery/scan` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8549` | unknown | unknown |
| POST | `/api/ea/ai-tasks` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:624` | unknown | unknown |
| DELETE | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:657` | unknown | unknown |
| PATCH | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:636` | unknown | unknown |
| POST | `/api/ea/clients` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:84` | unknown | unknown |
| DELETE | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:169` | unknown | unknown |
| PATCH | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:142` | unknown | unknown |
| POST | `/api/ea/clients/:id/push` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:185` | unknown | unknown |
| POST | `/api/ea/clients/:id/trips` | admin | admin-role | yes | unknown | `server/routes/ea.routes.ts:235` | unknown | unknown |
| POST | `/api/ea/communications` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:584` | unknown | unknown |
| DELETE | `/api/ea/communications/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:596` | unknown | unknown |
| POST | `/api/ea/events` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:354` | unknown | unknown |
| DELETE | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:388` | unknown | unknown |
| PATCH | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:375` | unknown | unknown |
| POST | `/api/ea/executives` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:300` | unknown | unknown |
| DELETE | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:325` | unknown | unknown |
| PATCH | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:312` | unknown | unknown |
| POST | `/api/ea/gifts` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:480` | unknown | unknown |
| DELETE | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:505` | unknown | unknown |
| PATCH | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:492` | unknown | unknown |
| PATCH | `/api/ea/preferences` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:729` | unknown | unknown |
| POST | `/api/ea/travel` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:423` | unknown | unknown |
| DELETE | `/api/ea/travel/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:453` | unknown | unknown |
| PATCH | `/api/ea/travel/:id` | admin | admin-role | no | verified | `server/routes/ea.routes.ts:435` | unknown | unknown |
| POST | `/api/ea/venues` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:532` | unknown | unknown |
| DELETE | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:557` | unknown | unknown |
| PATCH | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:544` | unknown | unknown |
| DELETE | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7415` | unknown | unknown |
| PATCH | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7397` | unknown | unknown |
| POST | `/api/events/:experienceId/invites` | other | session-self | no | unknown | `server/routes/guest-invites.ts:172` | unknown | unknown |
| POST | `/api/events/:experienceId/invites/send` | other | session-self | no | unknown | `server/routes/guest-invites.ts:329` | unknown | unknown |
| POST | `/api/expert-application` | other | session-self | no | unknown | `server/routes.ts:2503` | unknown | unknown |
| POST | `/api/expert-booking-requests` | other | resource-owner | no | verified | `server/routes.ts:1901` | unknown | unknown |
| POST | `/api/expert-forms` | other | session-self | no | unknown | `server/routes.ts:2591` | unknown | unknown |
| POST | `/api/expert-requests` | other | resource-owner | no | verified | `server/routes/booking-actions.ts:204` (/expert-requests) | unknown | unknown |
| PATCH | `/api/expert-requests/:id/complete` | other | session-self | no | unknown | `server/routes/booking-actions.ts:434` (/expert-requests/:id/complete) | unknown | unknown |
| POST | `/api/expert-requests/payment-intent` | payments | resource-owner | yes | verified | `server/routes/booking-actions.ts:116` (/expert-requests/payment-intent) | unknown | unknown |
| PATCH | `/api/expert-review/:shareToken/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2863` | unknown | unknown |
| POST | `/api/expert-review/:shareToken/submit` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2726` | unknown | unknown |
| POST | `/api/expert-workspace/build-itinerary` | other | resource-owner | no | verified | `server/routes/expert-workspace.routes.ts:583` (/build-itinerary) | unknown | unknown |
| POST | `/api/expert-workspace/collections` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:540` (/collections) | unknown | unknown |
| POST | `/api/expert-workspace/collections/:id/items` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:763` (/collections/:id/items) | unknown | unknown |
| DELETE | `/api/expert-workspace/collections/:id/items/:itemId` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:789` (/collections/:id/items/:itemId) | unknown | unknown |
| POST | `/api/expert-workspace/content/:id/edit` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:804` (/content/:id/edit) | unknown | unknown |
| PATCH | `/api/expert-workspace/edits/:editId/submit` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:859` (/edits/:editId/submit) | unknown | unknown |
| PATCH | `/api/expert-workspace/gaps/:id/assign` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:913` (/gaps/:id/assign) | unknown | unknown |
| PATCH | `/api/expert-workspace/gaps/:id/resolve` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:930` (/gaps/:id/resolve) | unknown | unknown |
| POST | `/api/expert-workspace/library/:id/extract-places` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:379` (/library/:id/extract-places) | unknown | unknown |
| PATCH | `/api/expert-workspace/library/:id/extracted-places/:index` | other | resource-owner | no | verified | `server/routes/expert-workspace.routes.ts:425` (/library/:id/extracted-places/:index) | unknown | unknown |
| POST | `/api/expert-workspace/scrape-jobs` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:958` (/scrape-jobs) | unknown | unknown |
| POST | `/api/expert/:expertId/tip` | payments | resource-owner | yes | verified | `server/routes.ts:5721` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/approve` | user-data | session-self | yes | unknown | `server/routes.ts:11852` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/regenerate` | user-data | session-self | yes | unknown | `server/routes.ts:11915` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/reject` | user-data | session-self | yes | unknown | `server/routes.ts:11885` | unknown | unknown |
| POST | `/api/expert/ai-tasks/delegate` | user-data | session-self | yes | unknown | `server/routes.ts:11753` | unknown | unknown |
| POST | `/api/expert/assignments/:assignmentId/accept` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1329` (/expert/assignments/:assignmentId/accept) | unknown | unknown |
| PATCH | `/api/expert/assignments/:assignmentId/workspace-status` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1347` (/expert/assignments/:assignmentId/workspace-status) | unknown | unknown |
| POST | `/api/expert/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:7682` | unknown | unknown |
| POST | `/api/expert/bookings/:id/component-failed` | user-data | session-self | yes | unknown | `server/routes.ts:7777` | unknown | unknown |
| PATCH | `/api/expert/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:7511` | unknown | unknown |
| POST | `/api/expert/knowledge-nuggets` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:640` | unknown | unknown |
| DELETE | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:703` | unknown | unknown |
| PATCH | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:655` | unknown | unknown |
| POST | `/api/expert/knowledge-nuggets/:id/propose-gem` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:679` | unknown | unknown |
| POST | `/api/expert/neighborhood-claims` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:84` | unknown | unknown |
| PUT | `/api/expert/neighborhood-claims/:id/capture` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:102` | unknown | unknown |
| POST | `/api/expert/neighborhood-claims/:id/submit` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:115` | unknown | unknown |
| PATCH | `/api/expert/neighborhoods` | user-data | session-self | yes | unknown | `server/routes.ts:5307` | unknown | unknown |
| PATCH | `/api/expert/photo` | user-data | session-self | yes | unknown | `server/routes.ts:5466` | unknown | unknown |
| PATCH | `/api/expert/profile` | user-data | session-self | yes | unknown | `server/routes.ts:5378` | unknown | unknown |
| PATCH | `/api/expert/profile-notes` | user-data | session-self | yes | unknown | `server/routes.ts:5354` | unknown | unknown |
| POST | `/api/expert/ready-made` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:71` | unknown | unknown |
| PATCH | `/api/expert/ready-made/:id` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:575` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/build-review` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:782` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/submit` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:687` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/withdraw` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:748` | unknown | unknown |
| DELETE | `/api/expert/ready-made/build/:id` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:321` | unknown | unknown |
| PATCH | `/api/expert/ready-made/build/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:285` | unknown | unknown |
| POST | `/api/expert/ready-made/from-trip/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:160` | unknown | unknown |
| POST | `/api/expert/reviews/:id/respond` | user-data | session-self | yes | unknown | `server/routes.ts:8182` | unknown | unknown |
| PATCH | `/api/expert/role` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:74` | unknown | unknown |
| POST | `/api/expert/selected-services` | user-data | session-self | yes | unknown | `server/routes.ts:5495` | unknown | unknown |
| DELETE | `/api/expert/selected-services/:serviceOfferingId` | user-data | session-self | yes | unknown | `server/routes.ts:5503` | unknown | unknown |
| POST | `/api/expert/service-listings` | user-data | session-self | yes | unknown | `server/routes.ts:5570` | unknown | unknown |
| DELETE | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:5658` | unknown | unknown |
| PATCH | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:5610` | unknown | unknown |
| POST | `/api/expert/service-listings/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:5634` | unknown | unknown |
| POST | `/api/expert/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:6159` | unknown | unknown |
| PATCH | `/api/expert/services/:id/status` | user-data | resource-owner | yes | verified | `server/routes.ts:6117` | unknown | unknown |
| POST | `/api/expert/services/from-template/:templateId` | user-data | session-self | yes | unknown | `server/routes.ts:6198` | unknown | unknown |
| POST | `/api/expert/specializations` | user-data | session-self | yes | unknown | `server/routes.ts:5517` | unknown | unknown |
| DELETE | `/api/expert/specializations/:specialization` | user-data | session-self | yes | unknown | `server/routes.ts:5541` | unknown | unknown |
| POST | `/api/expert/trips/:tripId/vendors` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:343` | unknown | unknown |
| DELETE | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:420` | unknown | unknown |
| PUT | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:382` | unknown | unknown |
| POST | `/api/faqs` | other | session-self | no | unknown | `server/routes/content.routes.ts:2047` | unknown | unknown |
| DELETE | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2088` | unknown | unknown |
| PATCH | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2066` | unknown | unknown |
| POST | `/api/fever/cache/refresh-all` | other | session-self | no | unknown | `server/routes/content.routes.ts:7137` | unknown | unknown |
| POST | `/api/fever/cache/refresh/:cityCode` | other | session-self | no | unknown | `server/routes/content.routes.ts:7120` | unknown | unknown |
| POST | `/api/generated-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:614` | unknown | unknown |
| POST | `/api/geocode` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:4280` | unknown | unknown |
| POST | `/api/grok/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:4661` | unknown | unknown |
| POST | `/api/grok/content/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4512` | unknown | unknown |
| POST | `/api/grok/intelligence` | other | session-self | no | unknown | `server/routes/content.routes.ts:4539` | unknown | unknown |
| POST | `/api/grok/itinerary/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4599` | unknown | unknown |
| POST | `/api/grok/match-experts` | other | session-self | no | unknown | `server/routes/content.routes.ts:4338` | unknown | unknown |
| POST | `/api/identity/business/create-inquiry` | user-data | public-or-system | no | unknown | `server/routes/identity.routes.ts:64` (/business/create-inquiry) | unknown | unknown |
| POST | `/api/identity/create-session` | user-data | session-self | no | unknown | `server/routes/identity.routes.ts:18` (/create-session) | unknown | unknown |
| POST | `/api/instagram/data-deletion` | other | public-or-system | no | unknown | `server/routes/instagram.ts:636` (/data-deletion) | unknown | unknown |
| POST | `/api/instagram/deauthorize` | other | public-or-system | no | unknown | `server/routes/instagram.ts:598` (/deauthorize) | unknown | unknown |
| POST | `/api/instagram/disconnect` | other | session-self | no | unknown | `server/routes/instagram.ts:533` (/disconnect) | unknown | unknown |
| POST | `/api/instagram/publish` | other | session-self | no | unknown | `server/routes/instagram.ts:274` (/publish) | unknown | unknown |
| POST | `/api/invite-templates` | other | session-self | no | unknown | `server/routes/guest-invites.ts:671` | unknown | unknown |
| DELETE | `/api/invites/:inviteId` | other | session-self | no | unknown | `server/routes/guest-invites.ts:422` | unknown | unknown |
| POST | `/api/invites/:token/origin` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:484` | unknown | unknown |
| POST | `/api/invites/:token/rsvp` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:518` | unknown | unknown |
| POST | `/api/invites/:token/travel-plans` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:616` | unknown | unknown |
| POST | `/api/itinerary-comparisons` | other | signature | no | verified | `server/routes.ts:9640` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/adopt-stop` | other | session-self | no | unknown | `server/routes/plancard.routes.ts:289` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-cart` | other | session-self | no | unknown | `server/routes.ts:10266`<br>`server/routes/trips.routes.ts:838` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-trip` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:51` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/generate` | other | resource-owner | no | verified | `server/routes.ts:9982` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/select` | other | session-self | no | unknown | `server/routes.ts:10236`<br>`server/routes/trips.routes.ts:809` | unknown | unknown |
| POST | `/api/itinerary-items/:id/backup` | other | session-self | no | unknown | `server/routes.ts:12844`<br>`server/routes/trips.routes.ts:1512` | unknown | unknown |
| PATCH | `/api/itinerary-share/:token/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2693` | unknown | unknown |
| POST | `/api/itinerary-share/:token/suggest` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2636` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/calculate-transport` | other | session-self | no | unknown | `server/routes/trips.routes.ts:2591` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/share` | other | session-self | no | unknown | `server/routes/trips.routes.ts:1920` | unknown | unknown |
| POST | `/api/itinerary/estimate-travel` | other | session-self | no | unknown | `server/routes.ts:12938`<br>`server/routes/trips.routes.ts:1547` | unknown | unknown |
| POST | `/api/landing/moments/event` | other | session-self | no | unknown | `server/routes/landing.routes.ts:180` | unknown | unknown |
| PUT | `/api/me/available-now` | user-data | session-self | no | self | `server/routes/live-help.routes.ts:62` | unknown | unknown |
| POST | `/api/me/business-advisor` | user-data | session-self | no | self | `server/routes/demand.routes.ts:582` | unknown | unknown |
| POST | `/api/me/ea-invitations/:id/accept` | user-data | session-self | no | self | `server/routes/ea.routes.ts:789` | unknown | unknown |
| POST | `/api/me/ea-invitations/:id/decline` | user-data | session-self | no | self | `server/routes/ea.routes.ts:802` | unknown | unknown |
| DELETE | `/api/me/ea-links/:id` | user-data | session-self | no | self | `server/routes/ea.routes.ts:815` | unknown | unknown |
| PATCH | `/api/me/handle` | user-data | resource-owner | no | verified | `server/routes/storefront.routes.ts:95` | unknown | unknown |
| PATCH | `/api/me/home-city` | user-data | session-self | no | self | `server/routes/occasions.routes.ts:190` | unknown | unknown |
| PATCH | `/api/me/notification-email` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:1535` | unknown | unknown |
| POST | `/api/me/offering-requests` | user-data | session-self | no | self | `server/routes/offering-requests.routes.ts:47` | unknown | unknown |
| DELETE | `/api/me/payment-methods/:id` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:85` | unknown | unknown |
| POST | `/api/me/payment-methods/default` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:66` | unknown | unknown |
| POST | `/api/me/payment-methods/setup-intent` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:50` | unknown | unknown |
| PATCH | `/api/me/preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:270` | unknown | unknown |
| DELETE | `/api/me/profile-photo` | user-data | session-self | no | self | `server/routes/profile-photo.routes.ts:114` | unknown | unknown |
| POST | `/api/me/profile-photo` | user-data | session-self | no | self | `server/routes/profile-photo.routes.ts:51` | unknown | unknown |
| POST | `/api/me/research-prefs` | user-data | session-self | no | self | `server/routes/demand.routes.ts:933` | unknown | unknown |
| PATCH | `/api/me/reviews/:id/reply` | user-data | resource-owner | yes | verified | `server/routes/review-replies.routes.ts:116` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:254` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots/range` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:343` | unknown | unknown |
| DELETE | `/api/me/slots/:slotId` | user-data | resource-owner | no | verified | `server/routes/expert-console.routes.ts:286` | unknown | unknown |
| PATCH | `/api/me/storefront` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:339` | unknown | unknown |
| PATCH | `/api/me/travel-preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:416` | unknown | unknown |
| PATCH | `/api/me/traveler-profile` | user-data | session-self | no | self | `server/routes/traveler-profile.routes.ts:68` | unknown | unknown |
| PATCH | `/api/me/vacation` | user-data | session-self | no | self | `server/routes/vacation.routes.ts:74` | unknown | unknown |
| POST | `/api/memberships/checkout` | other | session-self | no | unknown | `server/routes/payments.routes.ts:3172` | unknown | unknown |
| POST | `/api/messages` | user-data | session-self | yes | unknown | `server/routes/messages.ts:172` (/) | unknown | unknown |
| PATCH | `/api/messages/:messageId/read` | user-data | session-self | yes | unknown | `server/routes/messages.ts:242` (/:messageId/read) | unknown | unknown |
| DELETE | `/api/messages/block/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:322` (/block/:targetUserId) | unknown | unknown |
| POST | `/api/messages/block/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:305` (/block/:targetUserId) | unknown | unknown |
| PATCH | `/api/messages/conversation/:conversationId/read-all` | user-data | session-self | yes | unknown | `server/routes/messages.ts:258` (/conversation/:conversationId/read-all) | unknown | unknown |
| POST | `/api/messages/report/message/:messageId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:356` (/report/message/:messageId) | unknown | unknown |
| POST | `/api/messages/report/user/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:380` (/report/user/:targetUserId) | unknown | unknown |
| POST | `/api/messages/typing/:conversationId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:289` (/typing/:conversationId) | unknown | unknown |
| DELETE | `/api/notifications/:id` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:3159` | unknown | unknown |
| PATCH | `/api/notifications/:id/read` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:3137` | unknown | unknown |
| POST | `/api/notifications/mark-all-read` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:3151` | unknown | unknown |
| POST | `/api/occasions` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:85` | unknown | unknown |
| DELETE | `/api/occasions/:id` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:163` | unknown | unknown |
| PATCH | `/api/occasions/:id` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:123` | unknown | unknown |
| POST | `/api/optimization-payments` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:356` | unknown | unknown |
| POST | `/api/optimization-payments/confirm` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:538` | unknown | unknown |
| POST | `/api/optimization-preview` | other | session-self | no | unknown | `server/routes/optimization.routes.ts:59` | unknown | unknown |
| DELETE | `/api/participants/:id` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:7316` | unknown | unknown |
| PATCH | `/api/participants/:id` | user-data | resource-owner | yes | verified | `server/routes/content.routes.ts:7252` | unknown | unknown |
| POST | `/api/participants/:id/payment` | payments | resource-owner | yes | verified | `server/routes/content.routes.ts:7297` | unknown | unknown |
| PATCH | `/api/participants/:id/rsvp` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:7278` | unknown | unknown |
| POST | `/api/payouts/request` | payments | session-self | no | self | `server/routes/payments.routes.ts:2895` | unknown | unknown |
| PATCH | `/api/profile` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:87` | unknown | unknown |
| PATCH | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2771` | unknown | unknown |
| POST | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2732` | unknown | unknown |
| POST | `/api/provider-forms` | other | session-self | no | unknown | `server/routes.ts:2805` | unknown | unknown |
| POST | `/api/provider/availability` | user-data | resource-owner | yes | verified | `server/routes.ts:10358` | unknown | unknown |
| DELETE | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:10410` | unknown | unknown |
| PATCH | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:10386` | unknown | unknown |
| POST | `/api/provider/blackout-dates` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:456` | unknown | unknown |
| DELETE | `/api/provider/blackout-dates/:id` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:483` | unknown | unknown |
| PUT | `/api/provider/booking-requests/:requestId/respond` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:538` | unknown | unknown |
| POST | `/api/provider/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:7681` | unknown | unknown |
| POST | `/api/provider/bookings/:id/component-failed` | user-data | session-self | yes | unknown | `server/routes.ts:7776` | unknown | unknown |
| PATCH | `/api/provider/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:7515` | unknown | unknown |
| POST | `/api/provider/bundles` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:250` | unknown | unknown |
| DELETE | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:445` | unknown | unknown |
| PATCH | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:345` | unknown | unknown |
| POST | `/api/provider/properties` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:561` | unknown | unknown |
| DELETE | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:740` | unknown | unknown |
| PATCH | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:697` | unknown | unknown |
| POST | `/api/provider/properties/:id/rooms` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:762` | unknown | unknown |
| POST | `/api/provider/quotes/:quoteId/issue` | user-data | session-self | yes | unknown | `server/routes/service-quotes.routes.ts:153` | unknown | unknown |
| POST | `/api/provider/quotes/:quoteId/withdraw` | user-data | session-self | yes | unknown | `server/routes/service-quotes.routes.ts:174` | unknown | unknown |
| POST | `/api/provider/request-verification-review` | user-data | session-self | yes | unknown | `server/routes.ts:4140` | unknown | unknown |
| DELETE | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:875` | unknown | unknown |
| PATCH | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:828` | unknown | unknown |
| POST | `/api/provider/services` | user-data | resource-owner | yes | verified | `server/routes.ts:3835` | unknown | unknown |
| DELETE | `/api/provider/services/:id` | user-data | session-self | yes | unknown | `server/routes.ts:4596` | unknown | unknown |
| PATCH | `/api/provider/services/:id` | user-data | resource-owner | yes | verified | `server/routes.ts:4179` | unknown | unknown |
| POST | `/api/provider/services/:id/archive` | user-data | session-self | yes | unknown | `server/routes.ts:4626` | unknown | unknown |
| POST | `/api/provider/services/:id/attestations` | user-data | session-self | yes | unknown | `server/routes/service-attestations.routes.ts:135` | unknown | unknown |
| PUT | `/api/provider/services/:id/availability-patterns` | user-data | session-self | yes | unknown | `server/routes.ts:3471` | unknown | unknown |
| PUT | `/api/provider/services/:id/blackouts` | user-data | session-self | yes | unknown | `server/routes.ts:3621` | unknown | unknown |
| POST | `/api/provider/services/:id/cover-photo` | user-data | session-self | yes | unknown | `server/routes.ts:6567` | unknown | unknown |
| PUT | `/api/provider/services/:id/date-ranges` | user-data | session-self | yes | unknown | `server/routes.ts:3546` | unknown | unknown |
| POST | `/api/provider/services/:id/deliverable-file` | user-data | resource-owner | yes | verified | `server/routes.ts:6479` | unknown | unknown |
| POST | `/api/provider/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:6180` | unknown | unknown |
| POST | `/api/provider/services/:id/gallery-photo` | user-data | session-self | yes | unknown | `server/routes.ts:6693` | unknown | unknown |
| PUT | `/api/provider/services/:id/pickup-route-points` | user-data | session-self | yes | unknown | `server/routes.ts:3372` | unknown | unknown |
| PUT | `/api/provider/services/:id/route-points` | user-data | session-self | yes | unknown | `server/routes.ts:3318` | unknown | unknown |
| POST | `/api/provider/services/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:4573` | unknown | unknown |
| PUT | `/api/provider/services/:id/surcharge-tiers` | payments | resource-owner | yes | verified | `server/routes.ts:3415` | unknown | unknown |
| PUT | `/api/provider/services/:id/translations/:locale` | user-data | resource-owner | yes | verified | `server/routes.ts:3741` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/approve` | user-data | session-self | yes | unknown | `server/routes.ts:3769` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/draft` | user-data | session-self | yes | unknown | `server/routes.ts:3788` | unknown | unknown |
| PATCH | `/api/provider/settings` | user-data | resource-owner | yes | verified | `server/routes/provider.routes.ts:125` | unknown | unknown |
| DELETE | `/api/push/subscriptions` | other | session-self | no | unknown | `server/routes/push.routes.ts:100` | unknown | unknown |
| POST | `/api/push/subscriptions` | other | session-self | no | unknown | `server/routes/push.routes.ts:73` | unknown | unknown |
| POST | `/api/push/test` | other | session-self | no | unknown | `server/routes/push.routes.ts:116` | unknown | unknown |
| POST | `/api/qa-sessions/:bookingId/start` | other | session-self | no | unknown | `server/routes/live-help.routes.ts:96` | unknown | unknown |
| POST | `/api/quick-start-itinerary` | other | session-self | no | unknown | `server/routes.ts:11567`<br>`server/routes/trips.routes.ts:878` | unknown | unknown |
| POST | `/api/quotes/:quoteId/accept` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:119` | unknown | unknown |
| POST | `/api/quotes/:quoteId/decline` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:131` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase` | payments | session-self | no | self | `server/routes/ready-made.routes.ts:1267` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase/confirm` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1347` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/concern` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1439` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/request-revision` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1592` | unknown | unknown |
| POST | `/api/recommendations/:id/convert` | other | session-self | no | unknown | `server/routes.ts:8661` | unknown | unknown |
| POST | `/api/recommendations/:id/dismiss` | other | session-self | no | unknown | `server/routes.ts:8691` | unknown | unknown |
| POST | `/api/recommendations/refresh/:city` | other | session-self | no | unknown | `server/routes.ts:8645` | unknown | unknown |
| POST | `/api/reviews/:id/flag` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:3188` | unknown | unknown |
| POST | `/api/routes/transit` | other | session-self | no | unknown | `server/routes/content.routes.ts:4207` | unknown | unknown |
| POST | `/api/routes/transit-multi` | other | session-self | no | unknown | `server/routes/content.routes.ts:4243` | unknown | unknown |
| POST | `/api/saved-items` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:38` | unknown | unknown |
| DELETE | `/api/saved-items/:id` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:134` | unknown | unknown |
| POST | `/api/saved-items/shares` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:90` | unknown | unknown |
| DELETE | `/api/saved-items/shares/:shareId` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:108` | unknown | unknown |
| POST | `/api/saved-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:456` (/saved-trips) | unknown | unknown |
| POST | `/api/saved-trips/:id/convert` | other | session-self | no | unknown | `server/routes/booking-actions.ts:488` (/saved-trips/:id/convert) | unknown | unknown |
| POST | `/api/serp/inquiry` | other | session-self | no | unknown | `server/routes/content.routes.ts:6475` | unknown | unknown |
| POST | `/api/serp/track-click` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:6447` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/document-checklist` | other | session-self | no | unknown | `server/routes.ts:7959` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/visa-status` | other | session-self | no | unknown | `server/routes.ts:7894` | unknown | unknown |
| POST | `/api/service-categories` | other | session-self | no | unknown | `server/routes/content.routes.ts:980` | unknown | unknown |
| POST | `/api/service-requests` | other | session-self | no | unknown | `server/routes/service-requests.routes.ts:38` | unknown | unknown |
| POST | `/api/service-subcategories` | other | session-self | no | unknown | `server/routes/content.routes.ts:1006` | unknown | unknown |
| POST | `/api/services/:id/quote-requests` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:82` | unknown | unknown |
| POST | `/api/services/:serviceId/reviews` | other | session-self | yes | unknown | `server/routes/content.routes.ts:3206` | unknown | unknown |
| POST | `/api/shared-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:525` (/shared-trips) | unknown | unknown |
| POST | `/api/short-links` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:82` | unknown | unknown |
| PATCH | `/api/short-links/:id` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:188` | unknown | unknown |
| POST | `/api/spontaneous/:id/book` | other | session-self | no | unknown | `server/routes/content.routes.ts:7591` | unknown | unknown |
| POST | `/api/spontaneous/preferences` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:7557` | unknown | unknown |
| POST | `/api/stripe/connect/onboard` | payments | session-self | no | self | `server/routes/payments.routes.ts:2713` | unknown | unknown |
| POST | `/api/track/accommodation-preference` | other | session-self | no | unknown | `server/routes/content.routes.ts:9691` | unknown | unknown |
| POST | `/api/track/activity` | other | session-self | no | unknown | `server/routes/content.routes.ts:9574` | unknown | unknown |
| POST | `/api/track/destination-search` | other | session-self | no | unknown | `server/routes/content.routes.ts:9653` | unknown | unknown |
| POST | `/api/track/funnel` | other | session-self | no | unknown | `server/routes/content.routes.ts:9534` | unknown | unknown |
| POST | `/api/track/pageview` | other | session-self | no | unknown | `server/routes/content.routes.ts:9508` | unknown | unknown |
| POST | `/api/track/search` | other | session-self | no | unknown | `server/routes/content.routes.ts:9468` | unknown | unknown |
| POST | `/api/track/trip-enhanced` | other | session-self | no | unknown | `server/routes/content.routes.ts:9609` | unknown | unknown |
| POST | `/api/tracking/impression` | other | session-self | no | unknown | `server/routes/content.routes.ts:9444` | unknown | unknown |
| DELETE | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7377` | unknown | unknown |
| PATCH | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7359` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/book` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:324` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/click` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:422` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/:variantId` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:565` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/test-variant` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:531` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/mode` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2247` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/status` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:609` | unknown | unknown |
| POST | `/api/transport-packages/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4021` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh-all` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5821` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh/:cityName/:country` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5794` | unknown | unknown |
| POST | `/api/travelpulse/media/track-download` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5848` | unknown | unknown |
| POST | `/api/travelpulse/seed` | other | session-self | no | unknown | `server/routes/content.routes.ts:5705` | unknown | unknown |
| POST | `/api/travelpulse/truth-check` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5517` | unknown | unknown |
| PUT | `/api/trip-context` | other | session-self | no | unknown | `server/routes/trip-context.routes.ts:247` | unknown | unknown |
| POST | `/api/trip-context/extract` | other | signature | no | verified | `server/routes/trip-context.routes.ts:351` | unknown | unknown |
| POST | `/api/trips` | user-data | public-or-system | no | unknown | `server/routes.ts:1409`<br>`server/routes/trips.routes.ts:521` | unknown | unknown |
| DELETE | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1556`<br>`server/routes/trips.routes.ts:607` | unknown | unknown |
| PATCH | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1526`<br>`server/routes/trips.routes.ts:565` | unknown | unknown |
| POST | `/api/trips/:id/claim` | user-data | session-self | yes | unknown | `server/routes.ts:1569` | unknown | unknown |
| POST | `/api/trips/:id/expert-advisor` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:721` (/trips/:id/expert-advisor) | unknown | unknown |
| POST | `/api/trips/:id/generate-itinerary` | user-data | resource-owner | yes | verified | `server/routes.ts:1604` | unknown | unknown |
| POST | `/api/trips/:id/plan-review` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1460` (/trips/:id/plan-review) | unknown | unknown |
| POST | `/api/trips/:id/share` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:573` (/trips/:id/share) | unknown | unknown |
| POST | `/api/trips/:id/suggestions` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1069` (/trips/:id/suggestions) | unknown | unknown |
| PATCH | `/api/trips/:id/suggestions/:suggestionId` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1171` (/trips/:id/suggestions/:suggestionId) | unknown | unknown |
| POST | `/api/trips/:tripId/activate-transport` | user-data | session-self | yes | unknown | `server/routes.ts:12951` | unknown | unknown |
| POST | `/api/trips/:tripId/advisor/narration` | user-data | session-self | yes | unknown | `server/routes/advisor.routes.ts:478` | unknown | unknown |
| POST | `/api/trips/:tripId/advisors` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:793` (/trips/:tripId/advisors) | unknown | unknown |
| POST | `/api/trips/:tripId/alerts` | user-data | session-self | yes | unknown | `server/routes.ts:13169` | unknown | unknown |
| POST | `/api/trips/:tripId/analytics/infer` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3024` | unknown | unknown |
| POST | `/api/trips/:tripId/anchor-suggestions` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1864` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1647` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors/:anchorId/impacts` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1844` | unknown | unknown |
| POST | `/api/trips/:tripId/budget/calculate-split` | user-data | session-self | yes | unknown | `server/routes.ts:12536` | unknown | unknown |
| POST | `/api/trips/:tripId/calculate-energy` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:2068` (/trips/:tripId/calculate-energy) | unknown | unknown |
| POST | `/api/trips/:tripId/changes` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:573` | unknown | unknown |
| DELETE | `/api/trips/:tripId/changes/:changeId` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:691` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts` | user-data | session-self | yes | unknown | `server/routes.ts:12328` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts/:contractId/documents` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1089` | unknown | unknown |
| POST | `/api/trips/:tripId/day-boundaries` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1748` | unknown | unknown |
| PUT | `/api/trips/:tripId/destinations` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:478` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency-contacts` | user-data | session-self | yes | unknown | `server/routes.ts:13104` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency/initialize` | user-data | session-self | yes | unknown | `server/routes.ts:13121` | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-notes` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1789` (/trips/:tripId/expert-notes) | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-traveler-note` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3282` | unknown | unknown |
| POST | `/api/trips/:tripId/finalize` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:301` | unknown | unknown |
| POST | `/api/trips/:tripId/generate-presets` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:2127` (/trips/:tripId/generate-presets) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/comments` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1663` (/trips/:tripId/items/:itemId/comments) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/route` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:127` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary-items` | user-data | resource-owner | yes | verified | `server/routes.ts:12651` | unknown | unknown |
| DELETE | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3216` | unknown | unknown |
| PATCH | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3045` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/optimize-order` | user-data | resource-owner | yes | verified | `server/routes.ts:12897` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/reorder` | user-data | resource-owner | yes | verified | `server/routes.ts:12862` | unknown | unknown |
| PATCH | `/api/trips/:tripId/occasion` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3391` | unknown | unknown |
| POST | `/api/trips/:tripId/participants` | user-data | resource-owner | yes | verified | `server/routes.ts:12197` | unknown | unknown |
| POST | `/api/trips/:tripId/participants/bulk-invite` | user-data | session-self | yes | unknown | `server/routes.ts:12233` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3598` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/apply` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3906` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/discard` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3707` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/pay` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3758` | unknown | unknown |
| POST | `/api/trips/:tripId/reopen` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:403` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions` | user-data | session-self | yes | unknown | `server/routes.ts:12493` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions/split` | user-data | session-self | yes | unknown | `server/routes.ts:12510` | unknown | unknown |
| DELETE | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:218` | unknown | unknown |
| PATCH | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:161` | unknown | unknown |
| POST | `/api/trips/:tripId/transport-legs/generate` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:99` | unknown | unknown |
| POST | `/api/trips/:tripId/trip-pass/purchase` | user-data | session-self | yes | unknown | `server/routes/trip-pass.routes.ts:67` | unknown | unknown |
| POST | `/api/trips/:tripId/trip-pass/purchase/confirm` | user-data | session-self | yes | unknown | `server/routes/trip-pass.routes.ts:119` | unknown | unknown |
| POST | `/api/trips/:tripId/validate-schedule` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1771` | unknown | unknown |
| POST | `/api/trips/:tripId/vendors/bulk-email` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:1147` | unknown | unknown |
| POST | `/api/upsell/ai-concierge` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:887` | unknown | unknown |
| POST | `/api/upsell/cart` | other | session-self | yes | unknown | `server/routes/upsell.routes.ts:161` | unknown | unknown |
| POST | `/api/upsell/checkout` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:781` | unknown | unknown |
| POST | `/api/upsell/click` | other | public-or-system | no | unknown | `server/routes/upsell.routes.ts:972` | unknown | unknown |
| POST | `/api/upsell/discover-date` | other | public-or-system | no | unknown | `server/routes/upsell.routes.ts:276` | unknown | unknown |
| POST | `/api/upsell/discover-location` | other | public-or-system | no | unknown | `server/routes/upsell.routes.ts:231` | unknown | unknown |
| POST | `/api/upsell/expert-review` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:641` | unknown | unknown |
| DELETE | `/api/upsell/expert-review/endorse` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:735` | unknown | unknown |
| POST | `/api/upsell/expert-review/endorse` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:699` | unknown | unknown |
| POST | `/api/upsell/impression` | other | public-or-system | no | unknown | `server/routes/upsell.routes.ts:936` | unknown | unknown |
| POST | `/api/upsell/optimize-gate` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:379` | unknown | unknown |
| POST | `/api/upsell/plancard-ontrip` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:507` | unknown | unknown |
| POST | `/api/upsell/plancard-pretrip` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:441` | unknown | unknown |
| POST | `/api/upsell/post-booking` | other | session-self | no | unknown | `server/routes/upsell.routes.ts:833` | unknown | unknown |
| DELETE | `/api/user-experience-items/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:2024` | unknown | unknown |
| PATCH | `/api/user-experience-items/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:2001` | unknown | unknown |
| POST | `/api/user-experiences` | other | session-self | no | unknown | `server/routes/content.routes.ts:1848` | unknown | unknown |
| DELETE | `/api/user-experiences/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1940` | unknown | unknown |
| PATCH | `/api/user-experiences/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1891` | unknown | unknown |
| POST | `/api/user-experiences/:id/items` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1978` | unknown | unknown |
| POST | `/api/vendors` | other | session-self | no | unknown | `server/routes.ts:2452` | unknown | unknown |
| POST | `/api/viator/availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3453` | unknown | unknown |
| POST | `/api/visa/requirements` | other | public-or-system | no | unknown | `server/routes/experts.routes.ts:645` | unknown | unknown |
| POST | `/api/wallet/add-credits` | payments | session-self | no | self | `server/routes/payments.routes.ts:276` | unknown | unknown |
| POST | `/api/webhooks/persona` | other | signature | no | unknown | `server/routes/webhooks.routes.ts:90` (/persona) | unknown | unknown |
| POST | `/api/webhooks/stripe` | payments | signature | no | unknown | `server/routes/webhooks.routes.ts:505` (/stripe) | unknown | unknown |
| POST | `/api/webhooks/stripe-identity` | other | signature | no | unknown | `server/routes/webhooks.routes.ts:30` (/stripe-identity) | unknown | unknown |
| POST | `/internal/jobs/availability-materialization` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:240` | unknown | unknown |
| POST | `/internal/jobs/booking-auto-completion` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:209` | unknown | unknown |
| POST | `/internal/jobs/booking-expiry` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:247` | unknown | unknown |
| POST | `/internal/jobs/checkout-sweep` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:232` | unknown | unknown |
| POST | `/internal/jobs/earnings-release` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:202` | unknown | unknown |
| POST | `/internal/jobs/email-outbox` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:277` | unknown | unknown |
| POST | `/internal/jobs/itinerary-generation-sweep` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:268` | unknown | unknown |
| POST | `/internal/jobs/score-neighborhood-claims` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:295` | unknown | unknown |
| POST | `/internal/jobs/stripe-reconciliation` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:220` | unknown | unknown |
| POST | `/internal/jobs/travelpayouts-report-poll` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:255` | unknown | unknown |
| POST | `/internal/run-occasion-drafts` | other | public-or-system | no | unknown | `server/routes/internal.routes.ts:184` | unknown | unknown |
