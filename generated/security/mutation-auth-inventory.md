# Mounted mutation authorization inventory

Generated from `server/routes.ts`. **605** raw mounted mutation registrations and **596** unique METHOD+normalizedPath pairs were found.

The unique-pair count is **+50** from the historical 546 comparison clue. The generator does not read that clue: it follows the current source mount graph. Raw registrations retain currently mounted, later-shadowed registrations; duplicate registrations are listed in the JSON manifest. A changed count indicates current route additions/removals or mount-graph changes, not an automatic regression.

Category totals: payments 31; admin 150; user-data 204; other 211.
Boundary totals: admin-role 150; session-self 308; resource-owner 94; signature 6; public-or-system 38; unknown 0.

| Method | Normalized path | Risk | Boundary | Ownership applicable | Expected ownership | Registrations | Fixture | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/affiliate/partners` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8645` | unknown | unknown |
| DELETE | `/api/admin/affiliate/partners/:id` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8725` | unknown | unknown |
| PATCH | `/api/admin/affiliate/partners/:id` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8708` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9094` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9105` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/scrape` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8739` | unknown | unknown |
| PATCH | `/api/admin/affiliate/reconciliation/:earningId` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4072` | unknown | unknown |
| POST | `/api/admin/bookings/:bookingId/lost-chargeback/reconcile` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:690` | unknown | unknown |
| POST | `/api/admin/bookings/:bookingId/out-of-band-refund/clear` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:640` | unknown | unknown |
| PATCH | `/api/admin/bookings/auto-cancel/config` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:1991` | unknown | unknown |
| POST | `/api/admin/bookings/auto-cancel/run` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:2013` | unknown | unknown |
| POST | `/api/admin/catalog/ingest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2442` | unknown | unknown |
| POST | `/api/admin/categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3432` | unknown | unknown |
| POST | `/api/admin/categories/:categoryId/subcategories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3608` | unknown | unknown |
| DELETE | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3597` | unknown | unknown |
| PATCH | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3484` | unknown | unknown |
| PATCH | `/api/admin/contact-submissions/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2678` | unknown | unknown |
| POST | `/api/admin/content-placement-rules` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8173` | unknown | unknown |
| DELETE | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8196` | unknown | unknown |
| PATCH | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8184` | unknown | unknown |
| POST | `/api/admin/content-placement-rules/auto-index` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8209` | unknown | unknown |
| POST | `/api/admin/content/:trackingNumber/moderate` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4250` | unknown | unknown |
| POST | `/api/admin/content/flags/:flagId/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4303` | unknown | unknown |
| POST | `/api/admin/content/register` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4195` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/assign-coordinator` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:992` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/review-ledger-gap` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1065` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/approve` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:855` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/generate` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:839` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/withdraw` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:871` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3955` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3981` | unknown | unknown |
| POST | `/api/admin/digest/send-now` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8857` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/refund-rejected-artifact` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1708` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1538` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/uphold` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1605` | unknown | unknown |
| POST | `/api/admin/dmo/analyze-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2086` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2102` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-kyoto` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2045` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-youtube` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2136` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2379` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2469` | unknown | unknown |
| POST | `/api/admin/dmo/publish-batch` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2553` | unknown | unknown |
| POST | `/api/admin/dmo/publish/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2508` | unknown | unknown |
| POST | `/api/admin/dmo/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2607` | unknown | unknown |
| POST | `/api/admin/dmo/sync-registry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2424` | unknown | unknown |
| POST | `/api/admin/email-outbox/:id/retry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9171` | unknown | unknown |
| POST | `/api/admin/event-packages` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8412` | unknown | unknown |
| DELETE | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8461` | unknown | unknown |
| PATCH | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8434` | unknown | unknown |
| PATCH | `/api/admin/evidence-thresholds/:key` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:310` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2898` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2767` | unknown | unknown |
| POST | `/api/admin/expert-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7633` | unknown | unknown |
| DELETE | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7665` | unknown | unknown |
| PATCH | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7643` | unknown | unknown |
| PATCH | `/api/admin/expert-templates/:id/roles` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3359` | unknown | unknown |
| PATCH | `/api/admin/fee-bands/:bandKey` | admin | admin-role | no | verified | `server/routes/admin.routes.ts:7368` | unknown | unknown |
| POST | `/api/admin/gem-candidates/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8077` | unknown | unknown |
| POST | `/api/admin/gem-candidates/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8120` | unknown | unknown |
| POST | `/api/admin/gems/backfill-photos` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:308` | unknown | unknown |
| POST | `/api/admin/invoices` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4567` | unknown | unknown |
| PATCH | `/api/admin/invoices/:invoiceNumber/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4631` | unknown | unknown |
| PATCH | `/api/admin/lead-routing-logs/:id/override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7792` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/assign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7872` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7975` | unknown | unknown |
| POST | `/api/admin/markets` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:186` | unknown | unknown |
| POST | `/api/admin/markets/:slug/refresh-geography` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:282` | unknown | unknown |
| PATCH | `/api/admin/message-reports/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7163` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/ratify` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:236` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/rescore` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:287` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/:id/return` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:262` | unknown | unknown |
| POST | `/api/admin/neighborhood-claims/manual-entry` | admin | admin-role | no | unknown | `server/routes/neighborhood-claims.routes.ts:160` | unknown | unknown |
| PATCH | `/api/admin/neighborhoods/:id/adjacency` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8762` | unknown | unknown |
| POST | `/api/admin/neighborhoods/:id/coverage-targets` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8584` | unknown | unknown |
| DELETE | `/api/admin/neighborhoods/:id/coverage-targets/:categoryKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8633` | unknown | unknown |
| PUT | `/api/admin/neighborhoods/:id/lead` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8658` | unknown | unknown |
| POST | `/api/admin/neighborhoods/backfill` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8545` | unknown | unknown |
| DELETE | `/api/admin/notifications/:id` | admin | admin-role | no | unknown | `server/routes.ts:13102` | unknown | unknown |
| PATCH | `/api/admin/notifications/:id/read` | admin | admin-role | no | unknown | `server/routes.ts:13068` | unknown | unknown |
| PATCH | `/api/admin/notifications/read-all` | admin | admin-role | no | unknown | `server/routes.ts:13128` | unknown | unknown |
| POST | `/api/admin/optimization-fees` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8349` | unknown | unknown |
| POST | `/api/admin/payouts` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5408` | unknown | unknown |
| PATCH | `/api/admin/payouts/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5474` | unknown | unknown |
| PATCH | `/api/admin/platform-settings/:settingKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7696` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3200` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3095` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/approve` | admin | admin-role | no | verified | `server/routes/admin.routes.ts:3773` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3862` | unknown | unknown |
| POST | `/api/admin/providers/:userId/remind-stripe` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3076` | unknown | unknown |
| POST | `/api/admin/qa/run-nightly` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9008` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1125` | unknown | unknown |
| PATCH | `/api/admin/ready-made/:id/badge` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1244` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1276` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/dismiss` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1481` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/refund` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1376` | unknown | unknown |
| POST | `/api/admin/reviews/:id/clear-response` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:7249` | unknown | unknown |
| PATCH | `/api/admin/reviews/:id/status` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:7228` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7985` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/reassign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7995` | unknown | unknown |
| POST | `/api/admin/seed-categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3664` | unknown | unknown |
| POST | `/api/admin/service-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7580` | unknown | unknown |
| DELETE | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7613` | unknown | unknown |
| PATCH | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7590` | unknown | unknown |
| PATCH | `/api/admin/service-requests/:id` | admin | admin-role | no | unknown | `server/routes/service-requests.routes.ts:116` | unknown | unknown |
| POST | `/api/admin/service-templates` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3237` | unknown | unknown |
| DELETE | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3304` | unknown | unknown |
| PATCH | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3282` | unknown | unknown |
| DELETE | `/api/admin/services/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4498` | unknown | unknown |
| PATCH | `/api/admin/services/:id/affinity-tags` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4472` | unknown | unknown |
| PATCH | `/api/admin/services/:id/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4456` | unknown | unknown |
| PATCH | `/api/admin/services/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4437` | unknown | unknown |
| DELETE | `/api/admin/slow-queries` | admin | admin-role | no | unknown | `server/routes.ts:12002` | unknown | unknown |
| DELETE | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3653` | unknown | unknown |
| PATCH | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3631` | unknown | unknown |
| POST | `/api/admin/system/test-email` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6450` | unknown | unknown |
| PUT | `/api/admin/testimonials/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7300` | unknown | unknown |
| POST | `/api/admin/trigger-digest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8845` | unknown | unknown |
| DELETE | `/api/admin/users/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5784` | unknown | unknown |
| PATCH | `/api/admin/users/:id/commission-override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2975` | unknown | unknown |
| PATCH | `/api/admin/users/:id/suspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8885` | unknown | unknown |
| PATCH | `/api/admin/users/:id/unsuspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:9050` | unknown | unknown |
| PATCH | `/api/admin/users/:id/verification` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2928` | unknown | unknown |
| POST | `/api/affiliate-booking-requests` | other | resource-owner | no | verified | `server/routes/content.routes.ts:7594` | unknown | unknown |
| PATCH | `/api/affiliate-booking-requests/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:8021` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/:id/claim` | other | session-self | no | unknown | `server/routes/content.routes.ts:7963` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/:id/verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:8303` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/from-catalog` | other | session-self | no | unknown | `server/routes/content.routes.ts:7733` | unknown | unknown |
| POST | `/api/affiliate/track-click` | other | session-self | no | unknown | `server/routes/content.routes.ts:9143` | unknown | unknown |
| POST | `/api/affiliates/track` | other | session-self | no | unknown | `server/routes/content.routes.ts:9183` | unknown | unknown |
| POST | `/api/ai/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:738` | unknown | unknown |
| POST | `/api/ai/generate-blueprint` | other | session-self | no | unknown | `server/routes/content.routes.ts:667` | unknown | unknown |
| POST | `/api/ai/generate-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:4718` | unknown | unknown |
| POST | `/api/ai/generate-optimized-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:5140` | unknown | unknown |
| POST | `/api/ai/itineraries/:id/save-as-trip` | other | resource-owner | no | verified | `server/routes/content.routes.ts:5269` | unknown | unknown |
| POST | `/api/ai/optimize-experience` | other | session-self | no | unknown | `server/routes/content.routes.ts:786` | unknown | unknown |
| POST | `/api/alerts/:id/acknowledge` | other | session-self | no | unknown | `server/routes/content.routes.ts:7370` | unknown | unknown |
| POST | `/api/alerts/:id/dismiss` | other | session-self | no | unknown | `server/routes/content.routes.ts:7388` | unknown | unknown |
| POST | `/api/analytics/booking` | other | session-self | no | unknown | `server/routes/content.routes.ts:3052` | unknown | unknown |
| POST | `/api/analytics/itinerary-generated` | other | session-self | no | unknown | `server/routes/content.routes.ts:2992` | unknown | unknown |
| POST | `/api/analytics/recruitment-click` | other | session-self | no | unknown | `server/routes/content.routes.ts:2925` | unknown | unknown |
| POST | `/api/analytics/search-event` | other | session-self | no | unknown | `server/routes/content.routes.ts:2942` | unknown | unknown |
| DELETE | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1707` | unknown | unknown |
| PUT | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1680` | unknown | unknown |
| POST | `/api/auth/accept-terms` | other | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:147` | unknown | unknown |
| DELETE | `/api/auth/account` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:203` | unknown | unknown |
| POST | `/api/auth/forgot-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:310` | unknown | unknown |
| POST | `/api/auth/login` | other | session-self | no | unknown | `server/replit_integrations/auth/emailAuth.ts:188` | unknown | unknown |
| POST | `/api/auth/logout` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:530` | unknown | unknown |
| POST | `/api/auth/register` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:68` | unknown | unknown |
| POST | `/api/auth/reset-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:375` | unknown | unknown |
| POST | `/api/auth/send-verification` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:451` | unknown | unknown |
| POST | `/api/auth/verify-email` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:489` | unknown | unknown |
| POST | `/api/bookings` | user-data | session-self | yes | unknown | `server/routes.ts:6994` | unknown | unknown |
| POST | `/api/bookings/:id/accept-deliverable` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:942` (/:id/accept-deliverable) | unknown | unknown |
| POST | `/api/bookings/:id/cancel` | user-data | session-self | yes | unknown | `server/routes.ts:7931` | unknown | unknown |
| POST | `/api/bookings/:id/components/:componentServiceId/cancel` | user-data | session-self | yes | unknown | `server/routes.ts:7737` | unknown | unknown |
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
| POST | `/api/budget/calculate-tip` | other | session-self | no | unknown | `server/routes/content.routes.ts:7285` | unknown | unknown |
| POST | `/api/budget/convert-currency` | other | session-self | no | unknown | `server/routes/content.routes.ts:7271` | unknown | unknown |
| POST | `/api/cache/checkout-verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:3787` | unknown | unknown |
| POST | `/api/cache/cleanup` | other | session-self | no | unknown | `server/routes/content.routes.ts:3594` | unknown | unknown |
| POST | `/api/cache/refresh` | other | session-self | no | unknown | `server/routes/content.routes.ts:3753` | unknown | unknown |
| POST | `/api/cache/verify-availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3544` | unknown | unknown |
| DELETE | `/api/cart` | user-data | session-self | yes | unknown | `server/routes.ts:9370` | unknown | unknown |
| POST | `/api/cart` | user-data | resource-owner | yes | verified | `server/routes.ts:9094` | unknown | unknown |
| DELETE | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9352` | unknown | unknown |
| PATCH | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9280` | unknown | unknown |
| POST | `/api/cart/convert-to-itinerary` | user-data | resource-owner | yes | verified | `server/routes.ts:9406` | unknown | unknown |
| POST | `/api/cart/items` | user-data | session-self | yes | unknown | `server/routes.ts:6864` | unknown | unknown |
| POST | `/api/cart/migrate` | user-data | session-self | yes | unknown | `server/routes.ts:9382` | unknown | unknown |
| POST | `/api/cart/resolve-trip` | user-data | resource-owner | yes | verified | `server/routes.ts:8891` | unknown | unknown |
| POST | `/api/chat/start` | other | session-self | no | unknown | `server/routes/content.routes.ts:510` | unknown | unknown |
| POST | `/api/chats` | other | session-self | no | unknown | `server/routes.ts:2252`<br>`server/routes/trips.routes.ts:680` | unknown | unknown |
| POST | `/api/checkout` | payments | session-self | no | self | `server/routes/payments.routes.ts:1032` | unknown | unknown |
| POST | `/api/claude/full-itinerary-graph` | other | session-self | no | unknown | `server/routes/content.routes.ts:4090` | unknown | unknown |
| POST | `/api/claude/optimize-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:3897` | unknown | unknown |
| POST | `/api/claude/recommendations` | other | session-self | no | unknown | `server/routes/content.routes.ts:4138` | unknown | unknown |
| POST | `/api/claude/transportation-analysis` | other | session-self | no | unknown | `server/routes/content.routes.ts:3931` | unknown | unknown |
| POST | `/api/concierge/escalations` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:534` | unknown | unknown |
| POST | `/api/concierge/quote` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:249` | unknown | unknown |
| POST | `/api/concierge/requests` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:192` | unknown | unknown |
| PATCH | `/api/concierge/requests/:id` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:316` | unknown | unknown |
| POST | `/api/concierge/requests/:id/claim` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:437` | unknown | unknown |
| POST | `/api/contact` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:445` | unknown | unknown |
| POST | `/api/content/:trackingNumber/flag` | other | session-self | no | unknown | `server/routes/content.routes.ts:9239` | unknown | unknown |
| POST | `/api/content/affiliate-redirect` | other | session-self | no | unknown | `server/routes/content.routes.ts:9069` | unknown | unknown |
| POST | `/api/content/checkout` | other | session-self | no | unknown | `server/routes/content.routes.ts:9054` | unknown | unknown |
| DELETE | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:12300` | unknown | unknown |
| PATCH | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:12231` | unknown | unknown |
| POST | `/api/contracts/:id/communication` | user-data | session-self | yes | unknown | `server/routes.ts:12283` | unknown | unknown |
| POST | `/api/contracts/:id/milestone` | payments | resource-owner | yes | verified | `server/routes.ts:12266` | unknown | unknown |
| POST | `/api/contracts/:id/payment` | payments | resource-owner | yes | verified | `server/routes.ts:12248` | unknown | unknown |
| POST | `/api/conversations` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:53` | unknown | unknown |
| DELETE | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:108` | unknown | unknown |
| PATCH | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:90` | unknown | unknown |
| POST | `/api/conversations/:id/messages` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:121` | unknown | unknown |
| POST | `/api/conversations/start` | user-data | session-self | yes | unknown | `server/routes/conversations.routes.ts:65` | unknown | unknown |
| DELETE | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:10619` | unknown | unknown |
| PATCH | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:10577` | unknown | unknown |
| POST | `/api/coordination-bookings/:id/confirm` | other | session-self | no | unknown | `server/routes.ts:10603` | unknown | unknown |
| POST | `/api/coordination-states` | other | resource-owner | no | verified | `server/routes.ts:10360` | unknown | unknown |
| POST | `/api/coordination-states/:coordinationId/bookings` | other | session-self | yes | unknown | `server/routes.ts:10546` | unknown | unknown |
| DELETE | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:10517` | unknown | unknown |
| PATCH | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:10412` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay` | payments | resource-owner | yes | verified | `server/routes.ts:10673` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay/confirm` | payments | resource-owner | yes | verified | `server/routes.ts:10897` | unknown | unknown |
| POST | `/api/coordination-states/:id/refund` | payments | resource-owner | yes | verified | `server/routes.ts:10973` | unknown | unknown |
| PATCH | `/api/coordination-states/:id/status` | other | session-self | no | unknown | `server/routes.ts:10440` | unknown | unknown |
| POST | `/api/credits/purchase` | payments | session-self | no | self | `server/routes/payments.routes.ts:282` | unknown | unknown |
| POST | `/api/cross-sell-events` | other | session-self | no | unknown | `server/routes/cross-sell.routes.ts:38` | unknown | unknown |
| POST | `/api/custom-venues` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1057` | unknown | unknown |
| DELETE | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1119` | unknown | unknown |
| PATCH | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1083` | unknown | unknown |
| POST | `/api/destination-calendar/events` | other | session-self | no | unknown | `server/routes/content.routes.ts:2199` | unknown | unknown |
| DELETE | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2267` | unknown | unknown |
| PUT | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2217` | unknown | unknown |
| POST | `/api/destination-calendar/events/:id/submit` | other | session-self | no | unknown | `server/routes/content.routes.ts:2242` | unknown | unknown |
| POST | `/api/discovery/scan` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:8460` | unknown | unknown |
| POST | `/api/ea/ai-tasks` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:543` | unknown | unknown |
| DELETE | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:571` | unknown | unknown |
| PATCH | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:555` | unknown | unknown |
| POST | `/api/ea/clients` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:83` | unknown | unknown |
| DELETE | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:168` | unknown | unknown |
| PATCH | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:141` | unknown | unknown |
| POST | `/api/ea/clients/:id/push` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:184` | unknown | unknown |
| POST | `/api/ea/communications` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:503` | unknown | unknown |
| DELETE | `/api/ea/communications/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:515` | unknown | unknown |
| POST | `/api/ea/events` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:286` | unknown | unknown |
| DELETE | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:320` | unknown | unknown |
| PATCH | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:307` | unknown | unknown |
| POST | `/api/ea/executives` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:232` | unknown | unknown |
| DELETE | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:257` | unknown | unknown |
| PATCH | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:244` | unknown | unknown |
| POST | `/api/ea/gifts` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:399` | unknown | unknown |
| DELETE | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:424` | unknown | unknown |
| PATCH | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:411` | unknown | unknown |
| PATCH | `/api/ea/preferences` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:643` | unknown | unknown |
| POST | `/api/ea/travel` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:347` | unknown | unknown |
| DELETE | `/api/ea/travel/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:372` | unknown | unknown |
| PATCH | `/api/ea/travel/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:359` | unknown | unknown |
| POST | `/api/ea/venues` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:451` | unknown | unknown |
| DELETE | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:476` | unknown | unknown |
| PATCH | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:463` | unknown | unknown |
| DELETE | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7352` | unknown | unknown |
| PATCH | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7334` | unknown | unknown |
| POST | `/api/events/:experienceId/invites` | other | session-self | no | unknown | `server/routes/guest-invites.ts:172` | unknown | unknown |
| POST | `/api/events/:experienceId/invites/send` | other | session-self | no | unknown | `server/routes/guest-invites.ts:329` | unknown | unknown |
| POST | `/api/expert-application` | other | session-self | no | unknown | `server/routes.ts:2488` | unknown | unknown |
| POST | `/api/expert-booking-requests` | other | resource-owner | no | verified | `server/routes.ts:1886` | unknown | unknown |
| POST | `/api/expert-forms` | other | session-self | no | unknown | `server/routes.ts:2576` | unknown | unknown |
| POST | `/api/expert-requests` | other | resource-owner | no | verified | `server/routes/booking-actions.ts:203` (/expert-requests) | unknown | unknown |
| PATCH | `/api/expert-requests/:id/complete` | other | session-self | no | unknown | `server/routes/booking-actions.ts:433` (/expert-requests/:id/complete) | unknown | unknown |
| POST | `/api/expert-requests/payment-intent` | payments | resource-owner | yes | verified | `server/routes/booking-actions.ts:115` (/expert-requests/payment-intent) | unknown | unknown |
| PATCH | `/api/expert-review/:shareToken/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2861` | unknown | unknown |
| POST | `/api/expert-review/:shareToken/submit` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2724` | unknown | unknown |
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
| POST | `/api/expert/:expertId/tip` | payments | resource-owner | yes | verified | `server/routes.ts:5660` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/approve` | user-data | session-self | yes | unknown | `server/routes.ts:11738` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/regenerate` | user-data | session-self | yes | unknown | `server/routes.ts:11801` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/reject` | user-data | session-self | yes | unknown | `server/routes.ts:11771` | unknown | unknown |
| POST | `/api/expert/ai-tasks/delegate` | user-data | session-self | yes | unknown | `server/routes.ts:11639` | unknown | unknown |
| POST | `/api/expert/assignments/:assignmentId/accept` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1305` (/expert/assignments/:assignmentId/accept) | unknown | unknown |
| PATCH | `/api/expert/assignments/:assignmentId/workspace-status` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1323` (/expert/assignments/:assignmentId/workspace-status) | unknown | unknown |
| POST | `/api/expert/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:7604` | unknown | unknown |
| POST | `/api/expert/bookings/:id/component-failed` | user-data | session-self | yes | unknown | `server/routes.ts:7699` | unknown | unknown |
| PATCH | `/api/expert/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:7433` | unknown | unknown |
| POST | `/api/expert/knowledge-nuggets` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:640` | unknown | unknown |
| DELETE | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:703` | unknown | unknown |
| PATCH | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:655` | unknown | unknown |
| POST | `/api/expert/knowledge-nuggets/:id/propose-gem` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:679` | unknown | unknown |
| POST | `/api/expert/neighborhood-claims` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:84` | unknown | unknown |
| PUT | `/api/expert/neighborhood-claims/:id/capture` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:102` | unknown | unknown |
| POST | `/api/expert/neighborhood-claims/:id/submit` | user-data | session-self | yes | unknown | `server/routes/neighborhood-claims.routes.ts:115` | unknown | unknown |
| PATCH | `/api/expert/neighborhoods` | user-data | session-self | yes | unknown | `server/routes.ts:5246` | unknown | unknown |
| PATCH | `/api/expert/photo` | user-data | session-self | yes | unknown | `server/routes.ts:5405` | unknown | unknown |
| PATCH | `/api/expert/profile` | user-data | session-self | yes | unknown | `server/routes.ts:5317` | unknown | unknown |
| PATCH | `/api/expert/profile-notes` | user-data | session-self | yes | unknown | `server/routes.ts:5293` | unknown | unknown |
| POST | `/api/expert/ready-made` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:71` | unknown | unknown |
| PATCH | `/api/expert/ready-made/:id` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:575` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/build-review` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:782` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/submit` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:687` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/withdraw` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:748` | unknown | unknown |
| DELETE | `/api/expert/ready-made/build/:id` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:321` | unknown | unknown |
| PATCH | `/api/expert/ready-made/build/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:285` | unknown | unknown |
| POST | `/api/expert/ready-made/from-trip/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:160` | unknown | unknown |
| POST | `/api/expert/reviews/:id/respond` | user-data | session-self | yes | unknown | `server/routes.ts:8068` | unknown | unknown |
| PATCH | `/api/expert/role` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:74` | unknown | unknown |
| POST | `/api/expert/selected-services` | user-data | session-self | yes | unknown | `server/routes.ts:5434` | unknown | unknown |
| DELETE | `/api/expert/selected-services/:serviceOfferingId` | user-data | session-self | yes | unknown | `server/routes.ts:5442` | unknown | unknown |
| POST | `/api/expert/service-listings` | user-data | session-self | yes | unknown | `server/routes.ts:5509` | unknown | unknown |
| DELETE | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:5597` | unknown | unknown |
| PATCH | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:5549` | unknown | unknown |
| POST | `/api/expert/service-listings/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:5573` | unknown | unknown |
| POST | `/api/expert/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:6098` | unknown | unknown |
| PATCH | `/api/expert/services/:id/status` | user-data | resource-owner | yes | verified | `server/routes.ts:6056` | unknown | unknown |
| POST | `/api/expert/services/from-template/:templateId` | user-data | session-self | yes | unknown | `server/routes.ts:6137` | unknown | unknown |
| POST | `/api/expert/specializations` | user-data | session-self | yes | unknown | `server/routes.ts:5456` | unknown | unknown |
| DELETE | `/api/expert/specializations/:specialization` | user-data | session-self | yes | unknown | `server/routes.ts:5480` | unknown | unknown |
| POST | `/api/expert/trips/:tripId/vendors` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:343` | unknown | unknown |
| DELETE | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:420` | unknown | unknown |
| PUT | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:382` | unknown | unknown |
| POST | `/api/faqs` | other | session-self | no | unknown | `server/routes/content.routes.ts:2031` | unknown | unknown |
| DELETE | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2072` | unknown | unknown |
| PATCH | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2050` | unknown | unknown |
| POST | `/api/fever/cache/refresh-all` | other | session-self | no | unknown | `server/routes/content.routes.ts:7074` | unknown | unknown |
| POST | `/api/fever/cache/refresh/:cityCode` | other | session-self | no | unknown | `server/routes/content.routes.ts:7057` | unknown | unknown |
| POST | `/api/generated-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:598` | unknown | unknown |
| POST | `/api/geocode` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:4230` | unknown | unknown |
| POST | `/api/grok/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:4611` | unknown | unknown |
| POST | `/api/grok/content/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4462` | unknown | unknown |
| POST | `/api/grok/intelligence` | other | session-self | no | unknown | `server/routes/content.routes.ts:4489` | unknown | unknown |
| POST | `/api/grok/itinerary/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4549` | unknown | unknown |
| POST | `/api/grok/match-experts` | other | session-self | no | unknown | `server/routes/content.routes.ts:4288` | unknown | unknown |
| POST | `/api/identity/business/create-inquiry` | user-data | public-or-system | no | unknown | `server/routes/identity.routes.ts:64` (/business/create-inquiry) | unknown | unknown |
| POST | `/api/identity/create-session` | user-data | session-self | no | unknown | `server/routes/identity.routes.ts:18` (/create-session) | unknown | unknown |
| POST | `/api/instagram/data-deletion` | other | public-or-system | no | unknown | `server/routes/instagram.ts:613` (/data-deletion) | unknown | unknown |
| POST | `/api/instagram/deauthorize` | other | public-or-system | no | unknown | `server/routes/instagram.ts:575` (/deauthorize) | unknown | unknown |
| POST | `/api/instagram/disconnect` | other | session-self | no | unknown | `server/routes/instagram.ts:510` (/disconnect) | unknown | unknown |
| POST | `/api/instagram/publish` | other | session-self | no | unknown | `server/routes/instagram.ts:255` (/publish) | unknown | unknown |
| POST | `/api/invite-templates` | other | session-self | no | unknown | `server/routes/guest-invites.ts:671` | unknown | unknown |
| DELETE | `/api/invites/:inviteId` | other | session-self | no | unknown | `server/routes/guest-invites.ts:422` | unknown | unknown |
| POST | `/api/invites/:token/origin` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:484` | unknown | unknown |
| POST | `/api/invites/:token/rsvp` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:518` | unknown | unknown |
| POST | `/api/invites/:token/travel-plans` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:616` | unknown | unknown |
| POST | `/api/itinerary-comparisons` | other | signature | no | verified | `server/routes.ts:9526` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/adopt-stop` | other | session-self | no | unknown | `server/routes/plancard.routes.ts:288` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-cart` | other | session-self | no | unknown | `server/routes.ts:10152`<br>`server/routes/trips.routes.ts:836` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-trip` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:50` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/generate` | other | resource-owner | no | verified | `server/routes.ts:9868` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/select` | other | session-self | no | unknown | `server/routes.ts:10122`<br>`server/routes/trips.routes.ts:807` | unknown | unknown |
| POST | `/api/itinerary-items/:id/backup` | other | session-self | no | unknown | `server/routes.ts:12723`<br>`server/routes/trips.routes.ts:1510` | unknown | unknown |
| PATCH | `/api/itinerary-share/:token/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2691` | unknown | unknown |
| POST | `/api/itinerary-share/:token/suggest` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2634` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/calculate-transport` | other | session-self | no | unknown | `server/routes/trips.routes.ts:2589` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/share` | other | session-self | no | unknown | `server/routes/trips.routes.ts:1918` | unknown | unknown |
| POST | `/api/itinerary/estimate-travel` | other | session-self | no | unknown | `server/routes.ts:12817`<br>`server/routes/trips.routes.ts:1545` | unknown | unknown |
| POST | `/api/landing/moments/event` | other | session-self | no | unknown | `server/routes/landing.routes.ts:180` | unknown | unknown |
| POST | `/api/me/business-advisor` | user-data | session-self | no | self | `server/routes/demand.routes.ts:582` | unknown | unknown |
| POST | `/api/me/ea-invitations/:id/accept` | user-data | session-self | no | self | `server/routes/ea.routes.ts:703` | unknown | unknown |
| POST | `/api/me/ea-invitations/:id/decline` | user-data | session-self | no | self | `server/routes/ea.routes.ts:716` | unknown | unknown |
| DELETE | `/api/me/ea-links/:id` | user-data | session-self | no | self | `server/routes/ea.routes.ts:729` | unknown | unknown |
| PATCH | `/api/me/handle` | user-data | resource-owner | no | verified | `server/routes/storefront.routes.ts:94` | unknown | unknown |
| PATCH | `/api/me/home-city` | user-data | session-self | no | self | `server/routes/occasions.routes.ts:190` | unknown | unknown |
| PATCH | `/api/me/notification-email` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:1527` | unknown | unknown |
| POST | `/api/me/offering-requests` | user-data | session-self | no | self | `server/routes/offering-requests.routes.ts:47` | unknown | unknown |
| DELETE | `/api/me/payment-methods/:id` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:85` | unknown | unknown |
| POST | `/api/me/payment-methods/default` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:66` | unknown | unknown |
| POST | `/api/me/payment-methods/setup-intent` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:50` | unknown | unknown |
| PATCH | `/api/me/preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:269` | unknown | unknown |
| POST | `/api/me/research-prefs` | user-data | session-self | no | self | `server/routes/demand.routes.ts:933` | unknown | unknown |
| PATCH | `/api/me/reviews/:id/reply` | user-data | resource-owner | yes | verified | `server/routes/review-replies.routes.ts:116` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:254` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots/range` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:343` | unknown | unknown |
| DELETE | `/api/me/slots/:slotId` | user-data | resource-owner | no | verified | `server/routes/expert-console.routes.ts:286` | unknown | unknown |
| PATCH | `/api/me/storefront` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:338` | unknown | unknown |
| PATCH | `/api/me/travel-preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:415` | unknown | unknown |
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
| DELETE | `/api/notifications/:id` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:3143` | unknown | unknown |
| PATCH | `/api/notifications/:id/read` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:3121` | unknown | unknown |
| POST | `/api/notifications/mark-all-read` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:3135` | unknown | unknown |
| POST | `/api/occasions` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:85` | unknown | unknown |
| DELETE | `/api/occasions/:id` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:163` | unknown | unknown |
| PATCH | `/api/occasions/:id` | other | session-self | no | unknown | `server/routes/occasions.routes.ts:123` | unknown | unknown |
| POST | `/api/optimization-payments` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:356` | unknown | unknown |
| POST | `/api/optimization-payments/confirm` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:538` | unknown | unknown |
| POST | `/api/optimization-preview` | other | session-self | no | unknown | `server/routes/optimization.routes.ts:59` | unknown | unknown |
| DELETE | `/api/participants/:id` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:7253` | unknown | unknown |
| PATCH | `/api/participants/:id` | user-data | resource-owner | yes | verified | `server/routes/content.routes.ts:7189` | unknown | unknown |
| POST | `/api/participants/:id/payment` | payments | resource-owner | yes | verified | `server/routes/content.routes.ts:7234` | unknown | unknown |
| PATCH | `/api/participants/:id/rsvp` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:7215` | unknown | unknown |
| POST | `/api/payouts/request` | payments | session-self | no | self | `server/routes/payments.routes.ts:2895` | unknown | unknown |
| PATCH | `/api/profile` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:87` | unknown | unknown |
| PATCH | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2756` | unknown | unknown |
| POST | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2717` | unknown | unknown |
| POST | `/api/provider-forms` | other | session-self | no | unknown | `server/routes.ts:2790` | unknown | unknown |
| POST | `/api/provider/availability` | user-data | resource-owner | yes | verified | `server/routes.ts:10244` | unknown | unknown |
| DELETE | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:10296` | unknown | unknown |
| PATCH | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:10272` | unknown | unknown |
| POST | `/api/provider/blackout-dates` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:456` | unknown | unknown |
| DELETE | `/api/provider/blackout-dates/:id` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:483` | unknown | unknown |
| PUT | `/api/provider/booking-requests/:requestId/respond` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:538` | unknown | unknown |
| POST | `/api/provider/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:7603` | unknown | unknown |
| POST | `/api/provider/bookings/:id/component-failed` | user-data | session-self | yes | unknown | `server/routes.ts:7698` | unknown | unknown |
| PATCH | `/api/provider/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:7437` | unknown | unknown |
| POST | `/api/provider/bundles` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:249` | unknown | unknown |
| DELETE | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:442` | unknown | unknown |
| PATCH | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:343` | unknown | unknown |
| POST | `/api/provider/properties` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:558` | unknown | unknown |
| DELETE | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:737` | unknown | unknown |
| PATCH | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:694` | unknown | unknown |
| POST | `/api/provider/properties/:id/rooms` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:759` | unknown | unknown |
| POST | `/api/provider/quotes/:quoteId/issue` | user-data | session-self | yes | unknown | `server/routes/service-quotes.routes.ts:116` | unknown | unknown |
| POST | `/api/provider/quotes/:quoteId/withdraw` | user-data | session-self | yes | unknown | `server/routes/service-quotes.routes.ts:137` | unknown | unknown |
| POST | `/api/provider/request-verification-review` | user-data | session-self | yes | unknown | `server/routes.ts:4113` | unknown | unknown |
| DELETE | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:872` | unknown | unknown |
| PATCH | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:825` | unknown | unknown |
| POST | `/api/provider/services` | user-data | resource-owner | yes | verified | `server/routes.ts:3820` | unknown | unknown |
| DELETE | `/api/provider/services/:id` | user-data | session-self | yes | unknown | `server/routes.ts:4555` | unknown | unknown |
| PATCH | `/api/provider/services/:id` | user-data | resource-owner | yes | verified | `server/routes.ts:4152` | unknown | unknown |
| POST | `/api/provider/services/:id/archive` | user-data | session-self | yes | unknown | `server/routes.ts:4585` | unknown | unknown |
| POST | `/api/provider/services/:id/attestations` | user-data | session-self | yes | unknown | `server/routes/service-attestations.routes.ts:135` | unknown | unknown |
| PUT | `/api/provider/services/:id/availability-patterns` | user-data | session-self | yes | unknown | `server/routes.ts:3456` | unknown | unknown |
| PUT | `/api/provider/services/:id/blackouts` | user-data | session-self | yes | unknown | `server/routes.ts:3606` | unknown | unknown |
| POST | `/api/provider/services/:id/cover-photo` | user-data | session-self | yes | unknown | `server/routes.ts:6506` | unknown | unknown |
| PUT | `/api/provider/services/:id/date-ranges` | user-data | session-self | yes | unknown | `server/routes.ts:3531` | unknown | unknown |
| POST | `/api/provider/services/:id/deliverable-file` | user-data | resource-owner | yes | verified | `server/routes.ts:6418` | unknown | unknown |
| POST | `/api/provider/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:6119` | unknown | unknown |
| POST | `/api/provider/services/:id/gallery-photo` | user-data | session-self | yes | unknown | `server/routes.ts:6632` | unknown | unknown |
| PUT | `/api/provider/services/:id/pickup-route-points` | user-data | session-self | yes | unknown | `server/routes.ts:3357` | unknown | unknown |
| PUT | `/api/provider/services/:id/route-points` | user-data | session-self | yes | unknown | `server/routes.ts:3303` | unknown | unknown |
| POST | `/api/provider/services/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:4532` | unknown | unknown |
| PUT | `/api/provider/services/:id/surcharge-tiers` | payments | resource-owner | yes | verified | `server/routes.ts:3400` | unknown | unknown |
| PUT | `/api/provider/services/:id/translations/:locale` | user-data | resource-owner | yes | verified | `server/routes.ts:3726` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/approve` | user-data | session-self | yes | unknown | `server/routes.ts:3754` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/draft` | user-data | session-self | yes | unknown | `server/routes.ts:3773` | unknown | unknown |
| PATCH | `/api/provider/settings` | user-data | resource-owner | yes | verified | `server/routes/provider.routes.ts:124` | unknown | unknown |
| POST | `/api/quick-start-itinerary` | other | session-self | no | unknown | `server/routes.ts:11453`<br>`server/routes/trips.routes.ts:876` | unknown | unknown |
| POST | `/api/quotes/:quoteId/accept` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:82` | unknown | unknown |
| POST | `/api/quotes/:quoteId/decline` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:94` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase` | payments | session-self | no | self | `server/routes/ready-made.routes.ts:1267` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase/confirm` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1347` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/concern` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1439` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/request-revision` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1592` | unknown | unknown |
| POST | `/api/recommendations/:id/convert` | other | session-self | no | unknown | `server/routes.ts:8547` | unknown | unknown |
| POST | `/api/recommendations/:id/dismiss` | other | session-self | no | unknown | `server/routes.ts:8577` | unknown | unknown |
| POST | `/api/recommendations/refresh/:city` | other | session-self | no | unknown | `server/routes.ts:8531` | unknown | unknown |
| POST | `/api/reviews/:id/flag` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:3172` | unknown | unknown |
| POST | `/api/routes/transit` | other | session-self | no | unknown | `server/routes/content.routes.ts:4157` | unknown | unknown |
| POST | `/api/routes/transit-multi` | other | session-self | no | unknown | `server/routes/content.routes.ts:4193` | unknown | unknown |
| POST | `/api/saved-items` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:32` | unknown | unknown |
| DELETE | `/api/saved-items/:id` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:71` | unknown | unknown |
| POST | `/api/saved-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:455` (/saved-trips) | unknown | unknown |
| POST | `/api/saved-trips/:id/convert` | other | session-self | no | unknown | `server/routes/booking-actions.ts:487` (/saved-trips/:id/convert) | unknown | unknown |
| POST | `/api/serp/inquiry` | other | session-self | no | unknown | `server/routes/content.routes.ts:6412` | unknown | unknown |
| POST | `/api/serp/track-click` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:6384` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/document-checklist` | other | session-self | no | unknown | `server/routes.ts:7881` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/visa-status` | other | session-self | no | unknown | `server/routes.ts:7816` | unknown | unknown |
| POST | `/api/service-categories` | other | session-self | no | unknown | `server/routes/content.routes.ts:964` | unknown | unknown |
| POST | `/api/service-requests` | other | session-self | no | unknown | `server/routes/service-requests.routes.ts:38` | unknown | unknown |
| POST | `/api/service-subcategories` | other | session-self | no | unknown | `server/routes/content.routes.ts:990` | unknown | unknown |
| POST | `/api/services/:id/quote-requests` | other | session-self | no | unknown | `server/routes/service-quotes.routes.ts:51` | unknown | unknown |
| POST | `/api/services/:serviceId/reviews` | other | session-self | yes | unknown | `server/routes/content.routes.ts:3190` | unknown | unknown |
| POST | `/api/shared-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:524` (/shared-trips) | unknown | unknown |
| POST | `/api/short-links` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:82` | unknown | unknown |
| PATCH | `/api/short-links/:id` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:188` | unknown | unknown |
| POST | `/api/spontaneous/:id/book` | other | session-self | no | unknown | `server/routes/content.routes.ts:7528` | unknown | unknown |
| POST | `/api/spontaneous/preferences` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:7494` | unknown | unknown |
| POST | `/api/stripe/connect/onboard` | payments | session-self | no | self | `server/routes/payments.routes.ts:2713` | unknown | unknown |
| POST | `/api/track/accommodation-preference` | other | session-self | no | unknown | `server/routes/content.routes.ts:9552` | unknown | unknown |
| POST | `/api/track/activity` | other | session-self | no | unknown | `server/routes/content.routes.ts:9435` | unknown | unknown |
| POST | `/api/track/destination-search` | other | session-self | no | unknown | `server/routes/content.routes.ts:9514` | unknown | unknown |
| POST | `/api/track/funnel` | other | session-self | no | unknown | `server/routes/content.routes.ts:9395` | unknown | unknown |
| POST | `/api/track/pageview` | other | session-self | no | unknown | `server/routes/content.routes.ts:9369` | unknown | unknown |
| POST | `/api/track/search` | other | session-self | no | unknown | `server/routes/content.routes.ts:9329` | unknown | unknown |
| POST | `/api/track/trip-enhanced` | other | session-self | no | unknown | `server/routes/content.routes.ts:9470` | unknown | unknown |
| POST | `/api/tracking/impression` | other | session-self | no | unknown | `server/routes/content.routes.ts:9305` | unknown | unknown |
| DELETE | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7314` | unknown | unknown |
| PATCH | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7296` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/book` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:324` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/click` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:422` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/:variantId` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:565` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/test-variant` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:531` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/mode` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2245` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/status` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:603` | unknown | unknown |
| POST | `/api/transport-packages/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:3971` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh-all` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5758` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh/:cityName/:country` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5731` | unknown | unknown |
| POST | `/api/travelpulse/media/track-download` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5785` | unknown | unknown |
| POST | `/api/travelpulse/seed` | other | session-self | no | unknown | `server/routes/content.routes.ts:5642` | unknown | unknown |
| POST | `/api/travelpulse/truth-check` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5454` | unknown | unknown |
| PUT | `/api/trip-context` | other | session-self | no | unknown | `server/routes/trip-context.routes.ts:247` | unknown | unknown |
| POST | `/api/trip-context/extract` | other | signature | no | verified | `server/routes/trip-context.routes.ts:351` | unknown | unknown |
| POST | `/api/trips` | user-data | public-or-system | no | unknown | `server/routes.ts:1398`<br>`server/routes/trips.routes.ts:519` | unknown | unknown |
| DELETE | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1543`<br>`server/routes/trips.routes.ts:605` | unknown | unknown |
| PATCH | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1515`<br>`server/routes/trips.routes.ts:563` | unknown | unknown |
| POST | `/api/trips/:id/claim` | user-data | session-self | yes | unknown | `server/routes.ts:1556` | unknown | unknown |
| POST | `/api/trips/:id/expert-advisor` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:720` (/trips/:id/expert-advisor) | unknown | unknown |
| POST | `/api/trips/:id/generate-itinerary` | user-data | resource-owner | yes | verified | `server/routes.ts:1591` | unknown | unknown |
| POST | `/api/trips/:id/plan-review` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1436` (/trips/:id/plan-review) | unknown | unknown |
| POST | `/api/trips/:id/share` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:572` (/trips/:id/share) | unknown | unknown |
| POST | `/api/trips/:id/suggestions` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1068` (/trips/:id/suggestions) | unknown | unknown |
| PATCH | `/api/trips/:id/suggestions/:suggestionId` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1151` (/trips/:id/suggestions/:suggestionId) | unknown | unknown |
| POST | `/api/trips/:tripId/activate-transport` | user-data | session-self | yes | unknown | `server/routes.ts:12830` | unknown | unknown |
| POST | `/api/trips/:tripId/advisor/narration` | user-data | session-self | yes | unknown | `server/routes/advisor.routes.ts:478` | unknown | unknown |
| POST | `/api/trips/:tripId/advisors` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:792` (/trips/:tripId/advisors) | unknown | unknown |
| POST | `/api/trips/:tripId/alerts` | user-data | session-self | yes | unknown | `server/routes.ts:13048` | unknown | unknown |
| POST | `/api/trips/:tripId/analytics/infer` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3022` | unknown | unknown |
| POST | `/api/trips/:tripId/anchor-suggestions` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1862` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1645` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors/:anchorId/impacts` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1842` | unknown | unknown |
| POST | `/api/trips/:tripId/budget/calculate-split` | user-data | session-self | yes | unknown | `server/routes.ts:12422` | unknown | unknown |
| POST | `/api/trips/:tripId/calculate-energy` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:2044` (/trips/:tripId/calculate-energy) | unknown | unknown |
| POST | `/api/trips/:tripId/changes` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:567` | unknown | unknown |
| DELETE | `/api/trips/:tripId/changes/:changeId` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:685` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts` | user-data | session-self | yes | unknown | `server/routes.ts:12214` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts/:contractId/documents` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1087` | unknown | unknown |
| POST | `/api/trips/:tripId/day-boundaries` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1746` | unknown | unknown |
| PUT | `/api/trips/:tripId/destinations` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:476` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency-contacts` | user-data | session-self | yes | unknown | `server/routes.ts:12983` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency/initialize` | user-data | session-self | yes | unknown | `server/routes.ts:13000` | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-notes` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1765` (/trips/:tripId/expert-notes) | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-traveler-note` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3280` | unknown | unknown |
| POST | `/api/trips/:tripId/finalize` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:297` | unknown | unknown |
| POST | `/api/trips/:tripId/generate-presets` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:2103` (/trips/:tripId/generate-presets) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/comments` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1639` (/trips/:tripId/items/:itemId/comments) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/route` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:126` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary-items` | user-data | resource-owner | yes | verified | `server/routes.ts:12535` | unknown | unknown |
| DELETE | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3214` | unknown | unknown |
| PATCH | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3043` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/optimize-order` | user-data | resource-owner | yes | verified | `server/routes.ts:12776` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/reorder` | user-data | resource-owner | yes | verified | `server/routes.ts:12741` | unknown | unknown |
| PATCH | `/api/trips/:tripId/occasion` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3389` | unknown | unknown |
| POST | `/api/trips/:tripId/participants` | user-data | resource-owner | yes | verified | `server/routes.ts:12083` | unknown | unknown |
| POST | `/api/trips/:tripId/participants/bulk-invite` | user-data | session-self | yes | unknown | `server/routes.ts:12119` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3596` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/apply` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3904` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/discard` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3705` | unknown | unknown |
| POST | `/api/trips/:tripId/proposals/:id/pay` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3756` | unknown | unknown |
| POST | `/api/trips/:tripId/reopen` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:399` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions` | user-data | session-self | yes | unknown | `server/routes.ts:12379` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions/split` | user-data | session-self | yes | unknown | `server/routes.ts:12396` | unknown | unknown |
| DELETE | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:218` | unknown | unknown |
| PATCH | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:161` | unknown | unknown |
| POST | `/api/trips/:tripId/transport-legs/generate` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:99` | unknown | unknown |
| POST | `/api/trips/:tripId/trip-pass/purchase` | user-data | session-self | yes | unknown | `server/routes/trip-pass.routes.ts:67` | unknown | unknown |
| POST | `/api/trips/:tripId/trip-pass/purchase/confirm` | user-data | session-self | yes | unknown | `server/routes/trip-pass.routes.ts:119` | unknown | unknown |
| POST | `/api/trips/:tripId/validate-schedule` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1769` | unknown | unknown |
| POST | `/api/trips/:tripId/vendors/bulk-email` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:1145` | unknown | unknown |
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
| DELETE | `/api/user-experience-items/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:2008` | unknown | unknown |
| PATCH | `/api/user-experience-items/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1985` | unknown | unknown |
| POST | `/api/user-experiences` | other | session-self | no | unknown | `server/routes/content.routes.ts:1832` | unknown | unknown |
| DELETE | `/api/user-experiences/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1924` | unknown | unknown |
| PATCH | `/api/user-experiences/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1875` | unknown | unknown |
| POST | `/api/user-experiences/:id/items` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1962` | unknown | unknown |
| POST | `/api/vendors` | other | session-self | no | unknown | `server/routes.ts:2437` | unknown | unknown |
| POST | `/api/viator/availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3403` | unknown | unknown |
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
