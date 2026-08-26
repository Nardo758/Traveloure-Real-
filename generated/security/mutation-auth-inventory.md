# Mounted mutation authorization inventory

Generated from `server/routes.ts`. **570** raw mounted mutation registrations and **546** unique METHOD+normalizedPath pairs were found.

The unique-pair count is **+0** from the historical 546 comparison clue. The generator does not read that clue: it follows the current source mount graph. Raw registrations retain currently mounted, later-shadowed registrations; duplicate registrations are listed in the JSON manifest. A changed count indicates current route additions/removals or mount-graph changes, not an automatic regression.

Category totals: payments 31; admin 138; user-data 181; other 196.
Boundary totals: admin-role 138; session-self 293; resource-owner 82; signature 5; public-or-system 28; unknown 0.

| Method | Normalized path | Risk | Boundary | Ownership applicable | Expected ownership | Registrations | Fixture | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/affiliate/partners/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8343` | unknown | unknown |
| POST | `/api/admin/affiliate/partners/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8354` | unknown | unknown |
| PATCH | `/api/admin/affiliate/reconciliation/:earningId` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3592` | unknown | unknown |
| PATCH | `/api/admin/bookings/auto-cancel/config` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:1572` | unknown | unknown |
| POST | `/api/admin/bookings/auto-cancel/run` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:1594` | unknown | unknown |
| POST | `/api/admin/catalog/ingest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2023` | unknown | unknown |
| POST | `/api/admin/categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2952` | unknown | unknown |
| POST | `/api/admin/categories/:categoryId/subcategories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3128` | unknown | unknown |
| DELETE | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3117` | unknown | unknown |
| PATCH | `/api/admin/categories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3004` | unknown | unknown |
| PATCH | `/api/admin/contact-submissions/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2259` | unknown | unknown |
| POST | `/api/admin/content-placement-rules` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7438` | unknown | unknown |
| DELETE | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7461` | unknown | unknown |
| PATCH | `/api/admin/content-placement-rules/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7449` | unknown | unknown |
| POST | `/api/admin/content-placement-rules/auto-index` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7474` | unknown | unknown |
| POST | `/api/admin/content/:trackingNumber/moderate` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3770` | unknown | unknown |
| POST | `/api/admin/content/flags/:flagId/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3823` | unknown | unknown |
| POST | `/api/admin/content/register` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3715` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/assign-coordinator` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:797` | unknown | unknown |
| POST | `/api/admin/coordination-states/:id/review-ledger-gap` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:866` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/approve` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:855` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/generate` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:839` | unknown | unknown |
| POST | `/api/admin/demand/onepager/:market/withdraw` | admin | admin-role | no | unknown | `server/routes/demand.routes.ts:871` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3475` | unknown | unknown |
| POST | `/api/admin/destination-events/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3501` | unknown | unknown |
| POST | `/api/admin/digest/send-now` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8128` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1316` | unknown | unknown |
| POST | `/api/admin/disputes/:bookingId/uphold` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1359` | unknown | unknown |
| POST | `/api/admin/dmo/analyze-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1667` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-gaps` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1683` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-kyoto` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1626` | unknown | unknown |
| POST | `/api/admin/dmo/ingest-youtube` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1717` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1960` | unknown | unknown |
| POST | `/api/admin/dmo/intake/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2050` | unknown | unknown |
| POST | `/api/admin/dmo/publish-batch` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2134` | unknown | unknown |
| POST | `/api/admin/dmo/publish/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2089` | unknown | unknown |
| POST | `/api/admin/dmo/resolve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2188` | unknown | unknown |
| POST | `/api/admin/dmo/sync-registry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2005` | unknown | unknown |
| POST | `/api/admin/email-outbox/:id/retry` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8420` | unknown | unknown |
| POST | `/api/admin/event-packages` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7677` | unknown | unknown |
| DELETE | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7726` | unknown | unknown |
| PATCH | `/api/admin/event-packages/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7699` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2443` | unknown | unknown |
| PATCH | `/api/admin/expert-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2348` | unknown | unknown |
| POST | `/api/admin/expert-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6989` | unknown | unknown |
| DELETE | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7021` | unknown | unknown |
| PATCH | `/api/admin/expert-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6999` | unknown | unknown |
| POST | `/api/admin/expert-templates/:id/approve` | admin | admin-role | no | unknown | `server/routes.ts:5046` | unknown | unknown |
| POST | `/api/admin/expert-templates/:id/reject` | admin | admin-role | no | unknown | `server/routes.ts:5078` | unknown | unknown |
| PATCH | `/api/admin/expert-templates/:id/roles` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2879` | unknown | unknown |
| PATCH | `/api/admin/fee-bands/:bandKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6804` | unknown | unknown |
| POST | `/api/admin/gems/backfill-photos` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:275` | unknown | unknown |
| POST | `/api/admin/invoices` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4087` | unknown | unknown |
| PATCH | `/api/admin/invoices/:invoiceNumber/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4151` | unknown | unknown |
| PATCH | `/api/admin/lead-routing-logs/:id/override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7148` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/assign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7228` | unknown | unknown |
| POST | `/api/admin/leads/:expertRequestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7347` | unknown | unknown |
| POST | `/api/admin/markets` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:186` | unknown | unknown |
| POST | `/api/admin/markets/:slug/refresh-geography` | admin | admin-role | no | unknown | `server/routes/admin-markets.routes.ts:282` | unknown | unknown |
| PATCH | `/api/admin/message-reports/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6613` | unknown | unknown |
| PATCH | `/api/admin/neighborhoods/:id/adjacency` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8033` | unknown | unknown |
| POST | `/api/admin/neighborhoods/:id/coverage-targets` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7849` | unknown | unknown |
| DELETE | `/api/admin/neighborhoods/:id/coverage-targets/:categoryKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7898` | unknown | unknown |
| PUT | `/api/admin/neighborhoods/:id/lead` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7923` | unknown | unknown |
| POST | `/api/admin/neighborhoods/backfill` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7810` | unknown | unknown |
| DELETE | `/api/admin/notifications/:id` | admin | admin-role | no | unknown | `server/routes.ts:11796` | unknown | unknown |
| PATCH | `/api/admin/notifications/:id/read` | admin | admin-role | no | unknown | `server/routes.ts:11762` | unknown | unknown |
| PATCH | `/api/admin/notifications/read-all` | admin | admin-role | no | unknown | `server/routes.ts:11822` | unknown | unknown |
| POST | `/api/admin/optimization-fees` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7614` | unknown | unknown |
| POST | `/api/admin/payouts` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4905` | unknown | unknown |
| PATCH | `/api/admin/payouts/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4971` | unknown | unknown |
| PATCH | `/api/admin/platform-settings/:settingKey` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7052` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/rejection-reason` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2720` | unknown | unknown |
| PATCH | `/api/admin/provider-applications/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2640` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/approve` | admin | admin-role | no | verified | `server/routes/admin.routes.ts:3293` | unknown | unknown |
| POST | `/api/admin/provider-services/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3382` | unknown | unknown |
| POST | `/api/admin/providers/:userId/remind-stripe` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2621` | unknown | unknown |
| POST | `/api/admin/qa/run-nightly` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8257` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/approve` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:926` | unknown | unknown |
| PATCH | `/api/admin/ready-made/:id/badge` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1022` | unknown | unknown |
| POST | `/api/admin/ready-made/:id/reject` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1054` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/dismiss` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1259` | unknown | unknown |
| POST | `/api/admin/ready-made/disputes/:purchaseId/refund` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:1154` | unknown | unknown |
| POST | `/api/admin/reviews/:id/clear-response` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:6699` | unknown | unknown |
| PATCH | `/api/admin/reviews/:id/status` | admin | admin-role | yes | unknown | `server/routes/admin.routes.ts:6678` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/confirm` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7357` | unknown | unknown |
| POST | `/api/admin/routing-queue/:requestId/reassign` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:7367` | unknown | unknown |
| POST | `/api/admin/seed-categories` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3184` | unknown | unknown |
| POST | `/api/admin/service-offering-types` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6936` | unknown | unknown |
| DELETE | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6969` | unknown | unknown |
| PATCH | `/api/admin/service-offering-types/:key` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6946` | unknown | unknown |
| PATCH | `/api/admin/service-requests/:id` | admin | admin-role | no | unknown | `server/routes/service-requests.routes.ts:115` | unknown | unknown |
| POST | `/api/admin/service-templates` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2757` | unknown | unknown |
| DELETE | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2824` | unknown | unknown |
| PATCH | `/api/admin/service-templates/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2802` | unknown | unknown |
| DELETE | `/api/admin/services/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:4018` | unknown | unknown |
| PATCH | `/api/admin/services/:id/affinity-tags` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3992` | unknown | unknown |
| PATCH | `/api/admin/services/:id/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3976` | unknown | unknown |
| PATCH | `/api/admin/services/:id/status` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3957` | unknown | unknown |
| DELETE | `/api/admin/slow-queries` | admin | admin-role | no | unknown | `server/routes.ts:10815` | unknown | unknown |
| DELETE | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3173` | unknown | unknown |
| PATCH | `/api/admin/subcategories/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:3151` | unknown | unknown |
| POST | `/api/admin/system/test-email` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5928` | unknown | unknown |
| PUT | `/api/admin/testimonials/featured` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:6750` | unknown | unknown |
| POST | `/api/admin/trigger-digest` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8116` | unknown | unknown |
| DELETE | `/api/admin/users/:id` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:5262` | unknown | unknown |
| PATCH | `/api/admin/users/:id/commission-override` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2520` | unknown | unknown |
| PATCH | `/api/admin/users/:id/suspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8156` | unknown | unknown |
| PATCH | `/api/admin/users/:id/unsuspend` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:8299` | unknown | unknown |
| PATCH | `/api/admin/users/:id/verification` | admin | admin-role | no | unknown | `server/routes/admin.routes.ts:2473` | unknown | unknown |
| POST | `/api/affiliate-booking-requests` | other | session-self | no | unknown | `server/routes/content.routes.ts:7086` | unknown | unknown |
| PATCH | `/api/affiliate-booking-requests/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:7315` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/:id/verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:7484` | unknown | unknown |
| POST | `/api/affiliate-booking-requests/from-catalog` | other | session-self | no | unknown | `server/routes/content.routes.ts:7185` | unknown | unknown |
| POST | `/api/affiliate/partners` | other | session-self | no | unknown | `server/routes/content.routes.ts:7788` | unknown | unknown |
| DELETE | `/api/affiliate/partners/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7868` | unknown | unknown |
| PATCH | `/api/affiliate/partners/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:7851` | unknown | unknown |
| POST | `/api/affiliate/partners/:id/scrape` | other | session-self | no | unknown | `server/routes/content.routes.ts:7882` | unknown | unknown |
| POST | `/api/affiliate/track-click` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:8263` | unknown | unknown |
| POST | `/api/affiliates/track` | other | session-self | no | unknown | `server/routes/content.routes.ts:8296` | unknown | unknown |
| POST | `/api/ai/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:702` | unknown | unknown |
| POST | `/api/ai/generate-blueprint` | other | session-self | no | unknown | `server/routes/content.routes.ts:631` | unknown | unknown |
| POST | `/api/ai/generate-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:4394` | unknown | unknown |
| POST | `/api/ai/generate-optimized-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:4737` | unknown | unknown |
| POST | `/api/ai/itineraries/:id/save-as-trip` | other | resource-owner | no | verified | `server/routes/content.routes.ts:4866` | unknown | unknown |
| POST | `/api/ai/optimize-experience` | other | session-self | no | unknown | `server/routes/content.routes.ts:750` | unknown | unknown |
| POST | `/api/alerts/:id/acknowledge` | other | session-self | no | unknown | `server/routes/content.routes.ts:6862` | unknown | unknown |
| POST | `/api/alerts/:id/dismiss` | other | session-self | no | unknown | `server/routes/content.routes.ts:6880` | unknown | unknown |
| POST | `/api/analytics/booking` | other | session-self | no | unknown | `server/routes/content.routes.ts:2742` | unknown | unknown |
| POST | `/api/analytics/itinerary-generated` | other | session-self | no | unknown | `server/routes/content.routes.ts:2682` | unknown | unknown |
| POST | `/api/analytics/search-event` | other | session-self | no | unknown | `server/routes/content.routes.ts:2632` | unknown | unknown |
| DELETE | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1831` | unknown | unknown |
| PUT | `/api/anchors/:id` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:1804` | unknown | unknown |
| POST | `/api/auth/accept-terms` | other | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:147` | unknown | unknown |
| DELETE | `/api/auth/account` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:203` | unknown | unknown |
| POST | `/api/auth/forgot-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:310` | unknown | unknown |
| POST | `/api/auth/login` | other | session-self | no | unknown | `server/replit_integrations/auth/emailAuth.ts:188` | unknown | unknown |
| POST | `/api/auth/logout` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:530` | unknown | unknown |
| POST | `/api/auth/register` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:68` | unknown | unknown |
| POST | `/api/auth/reset-password` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:375` | unknown | unknown |
| POST | `/api/auth/send-verification` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:451` | unknown | unknown |
| POST | `/api/auth/verify-email` | other | public-or-system | no | unknown | `server/replit_integrations/auth/emailAuth.ts:489` | unknown | unknown |
| POST | `/api/bookings` | user-data | session-self | yes | unknown | `server/routes.ts:6503` | unknown | unknown |
| POST | `/api/bookings/:id/cancel` | user-data | session-self | yes | unknown | `server/routes.ts:7068` | unknown | unknown |
| POST | `/api/bookings/:id/confirm-completion` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:637` (/:id/confirm-completion) | unknown | unknown |
| POST | `/api/bookings/:id/dispute` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:709` (/:id/dispute) | unknown | unknown |
| POST | `/api/bookings/:id/pay-balance` | payments | resource-owner | yes | verified | `server/routes/payments.routes.ts:1666` | unknown | unknown |
| POST | `/api/bookings/bulk-status` | user-data | resource-owner | yes | verified | `server/routes/bookings.ts:305` (/bulk-status) | unknown | unknown |
| POST | `/api/bookings/confirm-payment` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:182` (/confirm-payment) | unknown | unknown |
| POST | `/api/bookings/estimate-cost` | user-data | session-self | yes | unknown | `server/routes/bookings.ts:416` (/estimate-cost) | unknown | unknown |
| POST | `/api/bookings/process-cart` | payments | session-self | no | self | `server/routes/bookings.ts:91` (/process-cart) | unknown | unknown |
| POST | `/api/bookings/refund` | payments | resource-owner | yes | verified | `server/routes/bookings.ts:509` (/refund) | unknown | unknown |
| POST | `/api/bookings/webhooks/stripe` | payments | signature | no | unknown | `server/routes/bookings.ts:461` (/webhooks/stripe) | unknown | unknown |
| POST | `/api/budget/calculate-tip` | other | session-self | no | unknown | `server/routes/content.routes.ts:6777` | unknown | unknown |
| POST | `/api/budget/convert-currency` | other | session-self | no | unknown | `server/routes/content.routes.ts:6763` | unknown | unknown |
| POST | `/api/cache/checkout-verify` | other | session-self | no | unknown | `server/routes/content.routes.ts:3475` | unknown | unknown |
| POST | `/api/cache/cleanup` | other | session-self | no | unknown | `server/routes/content.routes.ts:3284` | unknown | unknown |
| POST | `/api/cache/refresh` | other | session-self | no | unknown | `server/routes/content.routes.ts:3440` | unknown | unknown |
| POST | `/api/cache/verify-availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3234` | unknown | unknown |
| DELETE | `/api/cart` | user-data | session-self | yes | unknown | `server/routes.ts:8321` | unknown | unknown |
| POST | `/api/cart` | user-data | resource-owner | yes | verified | `server/routes.ts:8103` | unknown | unknown |
| DELETE | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:8303` | unknown | unknown |
| PATCH | `/api/cart/:id` | user-data | session-self | yes | unknown | `server/routes.ts:8239` | unknown | unknown |
| POST | `/api/cart/convert-to-itinerary` | user-data | session-self | yes | unknown | `server/routes.ts:8349` | unknown | unknown |
| POST | `/api/cart/items` | user-data | session-self | yes | unknown | `server/routes.ts:6405` | unknown | unknown |
| POST | `/api/cart/migrate` | user-data | session-self | yes | unknown | `server/routes.ts:8333` | unknown | unknown |
| POST | `/api/cart/resolve-trip` | user-data | resource-owner | yes | verified | `server/routes.ts:7937` | unknown | unknown |
| POST | `/api/chat/start` | other | session-self | no | unknown | `server/routes/content.routes.ts:474` | unknown | unknown |
| POST | `/api/chats` | other | session-self | no | unknown | `server/routes.ts:1870`<br>`server/routes/trips.routes.ts:650` | unknown | unknown |
| POST | `/api/checkout` | payments | session-self | no | self | `server/routes/payments.routes.ts:751` | unknown | unknown |
| POST | `/api/claude/full-itinerary-graph` | other | session-self | no | unknown | `server/routes/content.routes.ts:3766` | unknown | unknown |
| POST | `/api/claude/optimize-itinerary` | other | session-self | no | unknown | `server/routes/content.routes.ts:3573` | unknown | unknown |
| POST | `/api/claude/recommendations` | other | session-self | no | unknown | `server/routes/content.routes.ts:3814` | unknown | unknown |
| POST | `/api/claude/transportation-analysis` | other | session-self | no | unknown | `server/routes/content.routes.ts:3607` | unknown | unknown |
| POST | `/api/concierge/escalations` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:474` | unknown | unknown |
| POST | `/api/concierge/quote` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:194` | unknown | unknown |
| POST | `/api/concierge/requests` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:142` | unknown | unknown |
| PATCH | `/api/concierge/requests/:id` | other | resource-owner | no | verified | `server/routes/concierge.routes.ts:256` | unknown | unknown |
| POST | `/api/concierge/requests/:id/claim` | other | session-self | no | unknown | `server/routes/concierge.routes.ts:377` | unknown | unknown |
| POST | `/api/contact` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:409` | unknown | unknown |
| POST | `/api/content/:trackingNumber/flag` | other | session-self | no | unknown | `server/routes/content.routes.ts:8352` | unknown | unknown |
| POST | `/api/content/affiliate-redirect` | other | session-self | no | unknown | `server/routes/content.routes.ts:8189` | unknown | unknown |
| POST | `/api/content/checkout` | other | session-self | no | unknown | `server/routes/content.routes.ts:8174` | unknown | unknown |
| DELETE | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:11104` | unknown | unknown |
| PATCH | `/api/contracts/:id` | user-data | session-self | yes | unknown | `server/routes.ts:11035` | unknown | unknown |
| POST | `/api/contracts/:id/communication` | user-data | session-self | yes | unknown | `server/routes.ts:11087` | unknown | unknown |
| POST | `/api/contracts/:id/milestone` | payments | resource-owner | yes | verified | `server/routes.ts:11070` | unknown | unknown |
| POST | `/api/contracts/:id/payment` | payments | resource-owner | yes | verified | `server/routes.ts:11052` | unknown | unknown |
| POST | `/api/conversations` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:51` | unknown | unknown |
| DELETE | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:81` | unknown | unknown |
| PATCH | `/api/conversations/:id` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:63` | unknown | unknown |
| POST | `/api/conversations/:id/messages` | user-data | session-self | yes | unknown | `server/replit_integrations/chat/routes.ts:94` | unknown | unknown |
| DELETE | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:9484` | unknown | unknown |
| PATCH | `/api/coordination-bookings/:id` | other | session-self | no | unknown | `server/routes.ts:9442` | unknown | unknown |
| POST | `/api/coordination-bookings/:id/confirm` | other | session-self | no | unknown | `server/routes.ts:9468` | unknown | unknown |
| POST | `/api/coordination-states` | other | resource-owner | no | verified | `server/routes.ts:9266` | unknown | unknown |
| POST | `/api/coordination-states/:coordinationId/bookings` | other | session-self | yes | unknown | `server/routes.ts:9411` | unknown | unknown |
| DELETE | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:9382` | unknown | unknown |
| PATCH | `/api/coordination-states/:id` | other | session-self | no | unknown | `server/routes.ts:9318` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay` | payments | resource-owner | yes | verified | `server/routes.ts:9538` | unknown | unknown |
| POST | `/api/coordination-states/:id/pay/confirm` | payments | resource-owner | yes | verified | `server/routes.ts:9741` | unknown | unknown |
| POST | `/api/coordination-states/:id/refund` | payments | resource-owner | yes | verified | `server/routes.ts:9817` | unknown | unknown |
| PATCH | `/api/coordination-states/:id/status` | other | session-self | no | unknown | `server/routes.ts:9346` | unknown | unknown |
| POST | `/api/credits/purchase` | payments | session-self | no | self | `server/routes/payments.routes.ts:231` | unknown | unknown |
| POST | `/api/cross-sell-events` | other | session-self | no | unknown | `server/routes/cross-sell.routes.ts:38` | unknown | unknown |
| POST | `/api/custom-venues` | other | session-self | no | unknown | `server/routes/content.routes.ts:1000` | unknown | unknown |
| DELETE | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1044` | unknown | unknown |
| PATCH | `/api/custom-venues/:id` | other | resource-owner | no | verified | `server/routes/content.routes.ts:1016` | unknown | unknown |
| POST | `/api/destination-calendar/events` | other | session-self | no | unknown | `server/routes/content.routes.ts:1982` | unknown | unknown |
| DELETE | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2050` | unknown | unknown |
| PUT | `/api/destination-calendar/events/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:2000` | unknown | unknown |
| POST | `/api/destination-calendar/events/:id/submit` | other | session-self | no | unknown | `server/routes/content.routes.ts:2025` | unknown | unknown |
| POST | `/api/discovery/scan` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:7617` | unknown | unknown |
| POST | `/api/ea/ai-tasks` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:517` | unknown | unknown |
| DELETE | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:545` | unknown | unknown |
| PATCH | `/api/ea/ai-tasks/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:529` | unknown | unknown |
| POST | `/api/ea/clients` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:80` | unknown | unknown |
| DELETE | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:142` | unknown | unknown |
| PATCH | `/api/ea/clients/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:115` | unknown | unknown |
| POST | `/api/ea/clients/:id/push` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:158` | unknown | unknown |
| POST | `/api/ea/communications` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:477` | unknown | unknown |
| DELETE | `/api/ea/communications/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:489` | unknown | unknown |
| POST | `/api/ea/events` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:260` | unknown | unknown |
| DELETE | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:294` | unknown | unknown |
| PATCH | `/api/ea/events/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:281` | unknown | unknown |
| POST | `/api/ea/executives` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:206` | unknown | unknown |
| DELETE | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:231` | unknown | unknown |
| PATCH | `/api/ea/executives/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:218` | unknown | unknown |
| POST | `/api/ea/gifts` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:373` | unknown | unknown |
| DELETE | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:398` | unknown | unknown |
| PATCH | `/api/ea/gifts/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:385` | unknown | unknown |
| PATCH | `/api/ea/preferences` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:617` | unknown | unknown |
| POST | `/api/ea/travel` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:321` | unknown | unknown |
| DELETE | `/api/ea/travel/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:346` | unknown | unknown |
| PATCH | `/api/ea/travel/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:333` | unknown | unknown |
| POST | `/api/ea/venues` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:425` | unknown | unknown |
| DELETE | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:450` | unknown | unknown |
| PATCH | `/api/ea/venues/:id` | admin | admin-role | no | unknown | `server/routes/ea.routes.ts:437` | unknown | unknown |
| DELETE | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:6844` | unknown | unknown |
| PATCH | `/api/emergency-contacts/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:6826` | unknown | unknown |
| POST | `/api/events/:experienceId/invites` | other | session-self | no | unknown | `server/routes/guest-invites.ts:149` | unknown | unknown |
| POST | `/api/expert-application` | other | session-self | no | unknown | `server/routes.ts:1962` | unknown | unknown |
| POST | `/api/expert-booking-requests` | other | resource-owner | no | verified | `server/routes.ts:1564` | unknown | unknown |
| POST | `/api/expert-forms` | other | session-self | no | unknown | `server/routes.ts:2020` | unknown | unknown |
| POST | `/api/expert-requests` | other | resource-owner | no | verified | `server/routes/booking-actions.ts:170` (/expert-requests) | unknown | unknown |
| PATCH | `/api/expert-requests/:id/complete` | other | session-self | no | unknown | `server/routes/booking-actions.ts:377` (/expert-requests/:id/complete) | unknown | unknown |
| POST | `/api/expert-requests/payment-intent` | payments | resource-owner | yes | verified | `server/routes/booking-actions.ts:107` (/expert-requests/payment-intent) | unknown | unknown |
| PATCH | `/api/expert-review/:shareToken/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2967` | unknown | unknown |
| POST | `/api/expert-review/:shareToken/submit` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2830` | unknown | unknown |
| POST | `/api/expert-templates/:id/purchase` | other | session-self | no | unknown | `server/routes.ts:5118` | unknown | unknown |
| POST | `/api/expert-templates/:id/purchase/confirm` | other | resource-owner | no | verified | `server/routes.ts:5211` | unknown | unknown |
| POST | `/api/expert-templates/:id/reviews` | other | session-self | yes | unknown | `server/routes.ts:5362` | unknown | unknown |
| POST | `/api/expert-workspace/build-itinerary` | other | resource-owner | no | verified | `server/routes/expert-workspace.routes.ts:579` (/build-itinerary) | unknown | unknown |
| POST | `/api/expert-workspace/collections` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:536` (/collections) | unknown | unknown |
| POST | `/api/expert-workspace/collections/:id/items` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:739` (/collections/:id/items) | unknown | unknown |
| DELETE | `/api/expert-workspace/collections/:id/items/:itemId` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:765` (/collections/:id/items/:itemId) | unknown | unknown |
| POST | `/api/expert-workspace/content/:id/edit` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:780` (/content/:id/edit) | unknown | unknown |
| PATCH | `/api/expert-workspace/edits/:editId/submit` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:835` (/edits/:editId/submit) | unknown | unknown |
| PATCH | `/api/expert-workspace/gaps/:id/assign` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:889` (/gaps/:id/assign) | unknown | unknown |
| PATCH | `/api/expert-workspace/gaps/:id/resolve` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:906` (/gaps/:id/resolve) | unknown | unknown |
| POST | `/api/expert-workspace/library/:id/extract-places` | other | session-self | no | unknown | `server/routes/expert-workspace.routes.ts:375` (/library/:id/extract-places) | unknown | unknown |
| PATCH | `/api/expert-workspace/library/:id/extracted-places/:index` | other | resource-owner | no | verified | `server/routes/expert-workspace.routes.ts:421` (/library/:id/extracted-places/:index) | unknown | unknown |
| POST | `/api/expert-workspace/scrape-jobs` | other | public-or-system | no | unknown | `server/routes/expert-workspace.routes.ts:934` (/scrape-jobs) | unknown | unknown |
| POST | `/api/expert/:expertId/tip` | payments | resource-owner | yes | verified | `server/routes.ts:5427` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/approve` | user-data | session-self | yes | unknown | `server/routes.ts:10551` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/regenerate` | user-data | session-self | yes | unknown | `server/routes.ts:10614` | unknown | unknown |
| POST | `/api/expert/ai-tasks/:taskId/reject` | user-data | session-self | yes | unknown | `server/routes.ts:10584` | unknown | unknown |
| POST | `/api/expert/ai-tasks/delegate` | user-data | session-self | yes | unknown | `server/routes.ts:10452` | unknown | unknown |
| POST | `/api/expert/assignments/:assignmentId/accept` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1101` (/expert/assignments/:assignmentId/accept) | unknown | unknown |
| PATCH | `/api/expert/assignments/:assignmentId/workspace-status` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1119` (/expert/assignments/:assignmentId/workspace-status) | unknown | unknown |
| POST | `/api/expert/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:6952` | unknown | unknown |
| PATCH | `/api/expert/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:6814` | unknown | unknown |
| POST | `/api/expert/knowledge-nuggets` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:628` | unknown | unknown |
| DELETE | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:662` | unknown | unknown |
| PATCH | `/api/expert/knowledge-nuggets/:id` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:643` | unknown | unknown |
| PATCH | `/api/expert/neighborhoods` | user-data | session-self | yes | unknown | `server/routes.ts:4462` | unknown | unknown |
| PATCH | `/api/expert/photo` | user-data | session-self | yes | unknown | `server/routes.ts:4617` | unknown | unknown |
| PATCH | `/api/expert/profile` | user-data | session-self | yes | unknown | `server/routes.ts:4533` | unknown | unknown |
| PATCH | `/api/expert/profile-notes` | user-data | session-self | yes | unknown | `server/routes.ts:4509` | unknown | unknown |
| POST | `/api/expert/ready-made` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:64` | unknown | unknown |
| PATCH | `/api/expert/ready-made/:id` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:547` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/build-review` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:754` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/submit` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:659` | unknown | unknown |
| POST | `/api/expert/ready-made/:id/withdraw` | user-data | session-self | yes | unknown | `server/routes/ready-made.routes.ts:720` | unknown | unknown |
| DELETE | `/api/expert/ready-made/build/:id` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:293` | unknown | unknown |
| PATCH | `/api/expert/ready-made/build/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:257` | unknown | unknown |
| POST | `/api/expert/ready-made/from-trip/:tripId` | user-data | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:132` | unknown | unknown |
| POST | `/api/expert/reviews/:id/respond` | user-data | session-self | yes | unknown | `server/routes.ts:7173` | unknown | unknown |
| PATCH | `/api/expert/role` | user-data | session-self | yes | unknown | `server/routes/expert-console.routes.ts:72` | unknown | unknown |
| POST | `/api/expert/selected-services` | user-data | session-self | yes | unknown | `server/routes.ts:4646` | unknown | unknown |
| DELETE | `/api/expert/selected-services/:serviceOfferingId` | user-data | session-self | yes | unknown | `server/routes.ts:4654` | unknown | unknown |
| POST | `/api/expert/service-listings` | user-data | session-self | yes | unknown | `server/routes.ts:4721` | unknown | unknown |
| DELETE | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:4809` | unknown | unknown |
| PATCH | `/api/expert/service-listings/:id` | user-data | session-self | yes | unknown | `server/routes.ts:4761` | unknown | unknown |
| POST | `/api/expert/service-listings/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:4785` | unknown | unknown |
| POST | `/api/expert/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:5830` | unknown | unknown |
| PATCH | `/api/expert/services/:id/status` | user-data | resource-owner | yes | verified | `server/routes.ts:5788` | unknown | unknown |
| POST | `/api/expert/services/from-template/:templateId` | user-data | session-self | yes | unknown | `server/routes.ts:5869` | unknown | unknown |
| POST | `/api/expert/specializations` | user-data | session-self | yes | unknown | `server/routes.ts:4668` | unknown | unknown |
| DELETE | `/api/expert/specializations/:specialization` | user-data | session-self | yes | unknown | `server/routes.ts:4692` | unknown | unknown |
| POST | `/api/expert/templates` | user-data | session-self | yes | unknown | `server/routes.ts:4945` | unknown | unknown |
| DELETE | `/api/expert/templates/:id` | user-data | session-self | yes | unknown | `server/routes.ts:4990` | unknown | unknown |
| PATCH | `/api/expert/templates/:id` | user-data | resource-owner | yes | verified | `server/routes.ts:4950` | unknown | unknown |
| POST | `/api/expert/templates/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:5012` | unknown | unknown |
| POST | `/api/expert/trips/:tripId/vendors` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:351` | unknown | unknown |
| DELETE | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:428` | unknown | unknown |
| PUT | `/api/expert/vendors/:vendorId` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:390` | unknown | unknown |
| POST | `/api/faqs` | other | session-self | no | unknown | `server/routes/content.routes.ts:1814` | unknown | unknown |
| DELETE | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1855` | unknown | unknown |
| PATCH | `/api/faqs/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1833` | unknown | unknown |
| POST | `/api/fever/cache/refresh-all` | other | session-self | no | unknown | `server/routes/content.routes.ts:6663` | unknown | unknown |
| POST | `/api/fever/cache/refresh/:cityCode` | other | session-self | no | unknown | `server/routes/content.routes.ts:6641` | unknown | unknown |
| POST | `/api/generated-itineraries` | other | session-self | no | unknown | `server/routes/content.routes.ts:562` | unknown | unknown |
| POST | `/api/geocode` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:3906` | unknown | unknown |
| POST | `/api/grok/chat` | other | session-self | no | unknown | `server/routes/content.routes.ts:4287` | unknown | unknown |
| POST | `/api/grok/content/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4138` | unknown | unknown |
| POST | `/api/grok/intelligence` | other | session-self | no | unknown | `server/routes/content.routes.ts:4165` | unknown | unknown |
| POST | `/api/grok/itinerary/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:4225` | unknown | unknown |
| POST | `/api/grok/match-experts` | other | session-self | no | unknown | `server/routes/content.routes.ts:3964` | unknown | unknown |
| POST | `/api/identity/business/create-inquiry` | user-data | public-or-system | no | unknown | `server/routes/identity.routes.ts:64` (/business/create-inquiry) | unknown | unknown |
| POST | `/api/identity/create-session` | user-data | session-self | no | unknown | `server/routes/identity.routes.ts:18` (/create-session) | unknown | unknown |
| POST | `/api/instagram/data-deletion` | other | public-or-system | no | unknown | `server/routes/instagram.ts:567` (/data-deletion) | unknown | unknown |
| POST | `/api/instagram/deauthorize` | other | public-or-system | no | unknown | `server/routes/instagram.ts:529` (/deauthorize) | unknown | unknown |
| POST | `/api/instagram/disconnect` | other | session-self | no | unknown | `server/routes/instagram.ts:469` (/disconnect) | unknown | unknown |
| POST | `/api/instagram/publish` | other | session-self | no | unknown | `server/routes/instagram.ts:214` (/publish) | unknown | unknown |
| POST | `/api/invite-templates` | other | session-self | no | unknown | `server/routes/guest-invites.ts:521` | unknown | unknown |
| DELETE | `/api/invites/:inviteId` | other | session-self | no | unknown | `server/routes/guest-invites.ts:272` | unknown | unknown |
| POST | `/api/invites/:token/origin` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:334` | unknown | unknown |
| POST | `/api/invites/:token/rsvp` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:368` | unknown | unknown |
| POST | `/api/invites/:token/travel-plans` | other | public-or-system | no | unknown | `server/routes/guest-invites.ts:466` | unknown | unknown |
| POST | `/api/itinerary-comparisons` | other | resource-owner | no | verified | `server/routes.ts:8488` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-cart` | other | session-self | no | unknown | `server/routes.ts:9058`<br>`server/routes/trips.routes.ts:806` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/apply-to-trip` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:45` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/generate` | other | session-self | no | unknown | `server/routes.ts:8785` | unknown | unknown |
| POST | `/api/itinerary-comparisons/:id/select` | other | session-self | no | unknown | `server/routes.ts:9028`<br>`server/routes/trips.routes.ts:777` | unknown | unknown |
| POST | `/api/itinerary-items/:id/backup` | other | session-self | no | unknown | `server/routes.ts:11431`<br>`server/routes/trips.routes.ts:1457` | unknown | unknown |
| PATCH | `/api/itinerary-share/:token/acknowledge` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2797` | unknown | unknown |
| POST | `/api/itinerary-share/:token/suggest` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2740` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/calculate-transport` | other | session-self | no | unknown | `server/routes/trips.routes.ts:2695` | unknown | unknown |
| POST | `/api/itinerary-variants/:variantId/share` | other | session-self | no | unknown | `server/routes/trips.routes.ts:2042` | unknown | unknown |
| POST | `/api/itinerary/estimate-travel` | other | session-self | no | unknown | `server/routes.ts:11511`<br>`server/routes/trips.routes.ts:1523` | unknown | unknown |
| POST | `/api/me/business-advisor` | user-data | session-self | no | self | `server/routes/demand.routes.ts:582` | unknown | unknown |
| PATCH | `/api/me/handle` | user-data | resource-owner | no | verified | `server/routes/storefront.routes.ts:74` | unknown | unknown |
| PATCH | `/api/me/notification-email` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:1239` | unknown | unknown |
| POST | `/api/me/offering-requests` | user-data | session-self | no | self | `server/routes/offering-requests.routes.ts:47` | unknown | unknown |
| DELETE | `/api/me/payment-methods/:id` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:85` | unknown | unknown |
| POST | `/api/me/payment-methods/default` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:66` | unknown | unknown |
| POST | `/api/me/payment-methods/setup-intent` | payments | session-self | no | self | `server/routes/payment-methods.routes.ts:50` | unknown | unknown |
| PATCH | `/api/me/preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:252` | unknown | unknown |
| POST | `/api/me/research-prefs` | user-data | session-self | no | self | `server/routes/demand.routes.ts:933` | unknown | unknown |
| PATCH | `/api/me/reviews/:id/reply` | user-data | resource-owner | yes | verified | `server/routes/review-replies.routes.ts:116` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:242` | unknown | unknown |
| POST | `/api/me/services/:serviceId/slots/range` | user-data | session-self | no | self | `server/routes/expert-console.routes.ts:331` | unknown | unknown |
| DELETE | `/api/me/slots/:slotId` | user-data | resource-owner | no | verified | `server/routes/expert-console.routes.ts:274` | unknown | unknown |
| PATCH | `/api/me/storefront` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:325` | unknown | unknown |
| PATCH | `/api/me/travel-preferences` | user-data | session-self | no | self | `server/routes/storefront.routes.ts:409` | unknown | unknown |
| PATCH | `/api/me/traveler-profile` | user-data | session-self | no | self | `server/routes/traveler-profile.routes.ts:68` | unknown | unknown |
| PATCH | `/api/me/vacation` | user-data | session-self | no | self | `server/routes/vacation.routes.ts:74` | unknown | unknown |
| POST | `/api/messages` | user-data | session-self | yes | unknown | `server/routes/messages.ts:139` (/) | unknown | unknown |
| PATCH | `/api/messages/:messageId/read` | user-data | session-self | yes | unknown | `server/routes/messages.ts:199` (/:messageId/read) | unknown | unknown |
| DELETE | `/api/messages/block/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:279` (/block/:targetUserId) | unknown | unknown |
| POST | `/api/messages/block/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:262` (/block/:targetUserId) | unknown | unknown |
| PATCH | `/api/messages/conversation/:conversationId/read-all` | user-data | session-self | yes | unknown | `server/routes/messages.ts:215` (/conversation/:conversationId/read-all) | unknown | unknown |
| POST | `/api/messages/report/message/:messageId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:313` (/report/message/:messageId) | unknown | unknown |
| POST | `/api/messages/report/user/:targetUserId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:337` (/report/user/:targetUserId) | unknown | unknown |
| POST | `/api/messages/typing/:conversationId` | user-data | session-self | yes | unknown | `server/routes/messages.ts:246` (/typing/:conversationId) | unknown | unknown |
| DELETE | `/api/notifications/:id` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:2833` | unknown | unknown |
| PATCH | `/api/notifications/:id/read` | user-data | resource-owner | no | verified | `server/routes/content.routes.ts:2811` | unknown | unknown |
| POST | `/api/notifications/mark-all-read` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:2825` | unknown | unknown |
| POST | `/api/optimization-payments` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:226` | unknown | unknown |
| POST | `/api/optimization-payments/confirm` | payments | resource-owner | yes | verified | `server/routes/optimization.routes.ts:390` | unknown | unknown |
| POST | `/api/optimization-preview` | other | session-self | no | unknown | `server/routes/optimization.routes.ts:55` | unknown | unknown |
| DELETE | `/api/participants/:id` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:6745` | unknown | unknown |
| PATCH | `/api/participants/:id` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:6689` | unknown | unknown |
| POST | `/api/participants/:id/payment` | payments | resource-owner | yes | verified | `server/routes/content.routes.ts:6726` | unknown | unknown |
| PATCH | `/api/participants/:id/rsvp` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:6707` | unknown | unknown |
| POST | `/api/payouts/request` | payments | session-self | no | self | `server/routes/payments.routes.ts:2142` | unknown | unknown |
| PATCH | `/api/profile` | user-data | session-self | no | unknown | `server/replit_integrations/auth/routes.ts:87` | unknown | unknown |
| PATCH | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2153` | unknown | unknown |
| POST | `/api/provider-application` | other | session-self | no | unknown | `server/routes.ts:2121` | unknown | unknown |
| POST | `/api/provider-forms` | other | session-self | no | unknown | `server/routes.ts:2187` | unknown | unknown |
| POST | `/api/provider/availability` | user-data | resource-owner | yes | verified | `server/routes.ts:9150` | unknown | unknown |
| DELETE | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9202` | unknown | unknown |
| PATCH | `/api/provider/availability/:id` | user-data | session-self | yes | unknown | `server/routes.ts:9178` | unknown | unknown |
| POST | `/api/provider/blackout-dates` | user-data | session-self | yes | unknown | `server/routes/experts.routes.ts:464` | unknown | unknown |
| DELETE | `/api/provider/blackout-dates/:id` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:491` | unknown | unknown |
| PUT | `/api/provider/booking-requests/:requestId/respond` | user-data | resource-owner | yes | verified | `server/routes/experts.routes.ts:546` | unknown | unknown |
| POST | `/api/provider/bookings/:id/complete` | user-data | session-self | yes | unknown | `server/routes.ts:6951` | unknown | unknown |
| PATCH | `/api/provider/bookings/:id/status` | user-data | session-self | yes | unknown | `server/routes.ts:6818` | unknown | unknown |
| POST | `/api/provider/bundles` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:249` | unknown | unknown |
| DELETE | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:442` | unknown | unknown |
| PATCH | `/api/provider/bundles/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:343` | unknown | unknown |
| POST | `/api/provider/properties` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:558` | unknown | unknown |
| DELETE | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:737` | unknown | unknown |
| PATCH | `/api/provider/properties/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:694` | unknown | unknown |
| POST | `/api/provider/properties/:id/rooms` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:759` | unknown | unknown |
| POST | `/api/provider/request-verification-review` | user-data | session-self | yes | unknown | `server/routes.ts:3362` | unknown | unknown |
| DELETE | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:872` | unknown | unknown |
| PATCH | `/api/provider/rooms/:id` | user-data | session-self | yes | unknown | `server/routes/provider.routes.ts:825` | unknown | unknown |
| POST | `/api/provider/services` | user-data | resource-owner | yes | verified | `server/routes.ts:3144` | unknown | unknown |
| DELETE | `/api/provider/services/:id` | user-data | session-self | yes | unknown | `server/routes.ts:3731` | unknown | unknown |
| PATCH | `/api/provider/services/:id` | user-data | resource-owner | yes | verified | `server/routes.ts:3401` | unknown | unknown |
| POST | `/api/provider/services/:id/archive` | user-data | session-self | yes | unknown | `server/routes.ts:3761` | unknown | unknown |
| POST | `/api/provider/services/:id/attestations` | user-data | session-self | yes | unknown | `server/routes/service-attestations.routes.ts:135` | unknown | unknown |
| PUT | `/api/provider/services/:id/availability-patterns` | user-data | session-self | yes | unknown | `server/routes.ts:2780` | unknown | unknown |
| PUT | `/api/provider/services/:id/blackouts` | user-data | session-self | yes | unknown | `server/routes.ts:2930` | unknown | unknown |
| POST | `/api/provider/services/:id/cover-photo` | user-data | session-self | yes | unknown | `server/routes.ts:6152` | unknown | unknown |
| PUT | `/api/provider/services/:id/date-ranges` | user-data | session-self | yes | unknown | `server/routes.ts:2855` | unknown | unknown |
| POST | `/api/provider/services/:id/deliverable-file` | user-data | resource-owner | yes | verified | `server/routes.ts:6064` | unknown | unknown |
| POST | `/api/provider/services/:id/duplicate` | user-data | session-self | yes | unknown | `server/routes.ts:5851` | unknown | unknown |
| PUT | `/api/provider/services/:id/pickup-route-points` | user-data | session-self | yes | unknown | `server/routes.ts:2681` | unknown | unknown |
| PUT | `/api/provider/services/:id/route-points` | user-data | session-self | yes | unknown | `server/routes.ts:2627` | unknown | unknown |
| POST | `/api/provider/services/:id/submit` | user-data | session-self | yes | unknown | `server/routes.ts:3708` | unknown | unknown |
| PUT | `/api/provider/services/:id/surcharge-tiers` | payments | resource-owner | yes | verified | `server/routes.ts:2724` | unknown | unknown |
| PUT | `/api/provider/services/:id/translations/:locale` | user-data | resource-owner | yes | verified | `server/routes.ts:3050` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/approve` | user-data | session-self | yes | unknown | `server/routes.ts:3078` | unknown | unknown |
| POST | `/api/provider/services/:id/translations/:locale/draft` | user-data | session-self | yes | unknown | `server/routes.ts:3097` | unknown | unknown |
| PATCH | `/api/provider/settings` | user-data | resource-owner | yes | verified | `server/routes/provider.routes.ts:124` | unknown | unknown |
| POST | `/api/quick-start-itinerary` | other | session-self | no | unknown | `server/routes.ts:10271`<br>`server/routes/trips.routes.ts:846` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase` | payments | session-self | no | self | `server/routes/ready-made.routes.ts:1232` | unknown | unknown |
| POST | `/api/ready-made/:id/purchase/confirm` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1309` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/concern` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1393` | unknown | unknown |
| POST | `/api/ready-made/purchases/:id/request-revision` | payments | resource-owner | yes | verified | `server/routes/ready-made.routes.ts:1544` | unknown | unknown |
| POST | `/api/recommendations/:id/convert` | other | session-self | no | unknown | `server/routes.ts:7631` | unknown | unknown |
| POST | `/api/recommendations/:id/dismiss` | other | session-self | no | unknown | `server/routes.ts:7661` | unknown | unknown |
| POST | `/api/recommendations/refresh/:city` | other | session-self | no | unknown | `server/routes.ts:7615` | unknown | unknown |
| POST | `/api/reviews/:id/flag` | user-data | session-self | yes | unknown | `server/routes/content.routes.ts:2862` | unknown | unknown |
| POST | `/api/routes/transit` | other | session-self | no | unknown | `server/routes/content.routes.ts:3833` | unknown | unknown |
| POST | `/api/routes/transit-multi` | other | session-self | no | unknown | `server/routes/content.routes.ts:3869` | unknown | unknown |
| POST | `/api/saved-items` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:31` | unknown | unknown |
| DELETE | `/api/saved-items/:id` | user-data | session-self | yes | unknown | `server/routes/saved-items.routes.ts:68` | unknown | unknown |
| POST | `/api/saved-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:399` (/saved-trips) | unknown | unknown |
| POST | `/api/saved-trips/:id/convert` | other | session-self | no | unknown | `server/routes/booking-actions.ts:431` (/saved-trips/:id/convert) | unknown | unknown |
| POST | `/api/serp/inquiry` | other | session-self | no | unknown | `server/routes/content.routes.ts:6001` | unknown | unknown |
| POST | `/api/serp/track-click` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5973` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/document-checklist` | other | session-self | no | unknown | `server/routes.ts:7020` | unknown | unknown |
| PATCH | `/api/service-bookings/:id/visa-status` | other | session-self | no | unknown | `server/routes.ts:6955` | unknown | unknown |
| POST | `/api/service-categories` | other | session-self | no | unknown | `server/routes/content.routes.ts:928` | unknown | unknown |
| POST | `/api/service-requests` | other | session-self | no | unknown | `server/routes/service-requests.routes.ts:37` | unknown | unknown |
| POST | `/api/service-subcategories` | other | session-self | no | unknown | `server/routes/content.routes.ts:954` | unknown | unknown |
| POST | `/api/services/:serviceId/reviews` | other | session-self | yes | unknown | `server/routes/content.routes.ts:2880` | unknown | unknown |
| POST | `/api/shared-trips` | other | session-self | no | unknown | `server/routes/booking-actions.ts:468` (/shared-trips) | unknown | unknown |
| POST | `/api/short-links` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:78` | unknown | unknown |
| PATCH | `/api/short-links/:id` | other | resource-owner | no | verified | `server/routes/short-links.routes.ts:192` | unknown | unknown |
| POST | `/api/spontaneous/:id/book` | other | session-self | no | unknown | `server/routes/content.routes.ts:7020` | unknown | unknown |
| POST | `/api/spontaneous/preferences` | user-data | session-self | no | unknown | `server/routes/content.routes.ts:6986` | unknown | unknown |
| POST | `/api/stripe/connect/onboard` | payments | session-self | no | self | `server/routes/payments.routes.ts:1960` | unknown | unknown |
| POST | `/api/track/accommodation-preference` | other | session-self | no | unknown | `server/routes/content.routes.ts:8665` | unknown | unknown |
| POST | `/api/track/activity` | other | session-self | no | unknown | `server/routes/content.routes.ts:8548` | unknown | unknown |
| POST | `/api/track/destination-search` | other | session-self | no | unknown | `server/routes/content.routes.ts:8627` | unknown | unknown |
| POST | `/api/track/funnel` | other | session-self | no | unknown | `server/routes/content.routes.ts:8508` | unknown | unknown |
| POST | `/api/track/pageview` | other | session-self | no | unknown | `server/routes/content.routes.ts:8482` | unknown | unknown |
| POST | `/api/track/search` | other | session-self | no | unknown | `server/routes/content.routes.ts:8442` | unknown | unknown |
| POST | `/api/track/trip-enhanced` | other | session-self | no | unknown | `server/routes/content.routes.ts:8583` | unknown | unknown |
| POST | `/api/tracking/impression` | other | session-self | no | unknown | `server/routes/content.routes.ts:8418` | unknown | unknown |
| DELETE | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:6806` | unknown | unknown |
| PATCH | `/api/transactions/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:6788` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/book` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:293` | unknown | unknown |
| POST | `/api/transport-booking-options/:optionId/click` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:375` | unknown | unknown |
| PATCH | `/api/transport-booking-options/:optionId/status` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:439` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/:variantId` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:538` | unknown | unknown |
| POST | `/api/transport-booking-options/seed/test-variant` | other | session-self | no | unknown | `server/routes/transport-hub.routes.ts:504` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/mode` | other | resource-owner | no | verified | `server/routes/trips.routes.ts:2351` | unknown | unknown |
| PATCH | `/api/transport-legs/:legId/status` | other | resource-owner | no | verified | `server/routes/plancard.routes.ts:389` | unknown | unknown |
| POST | `/api/transport-packages/generate` | other | session-self | no | unknown | `server/routes/content.routes.ts:3647` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh-all` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5309` | unknown | unknown |
| POST | `/api/travelpulse/ai/refresh/:cityName/:country` | admin | admin-role | no | unknown | `server/routes/content.routes.ts:5282` | unknown | unknown |
| POST | `/api/travelpulse/media/track-download` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5336` | unknown | unknown |
| POST | `/api/travelpulse/seed` | other | session-self | no | unknown | `server/routes/content.routes.ts:5211` | unknown | unknown |
| POST | `/api/travelpulse/truth-check` | other | public-or-system | no | unknown | `server/routes/content.routes.ts:5023` | unknown | unknown |
| PUT | `/api/trip-context` | other | session-self | no | unknown | `server/routes/trip-context.routes.ts:131` | unknown | unknown |
| POST | `/api/trip-context/extract` | other | signature | no | verified | `server/routes/trip-context.routes.ts:247` | unknown | unknown |
| POST | `/api/trips` | user-data | public-or-system | no | unknown | `server/routes.ts:1176`<br>`server/routes/trips.routes.ts:348` | unknown | unknown |
| DELETE | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1262`<br>`server/routes/trips.routes.ts:440` | unknown | unknown |
| PATCH | `/api/trips/:id` | user-data | session-self | yes | unknown | `server/routes.ts:1234`<br>`server/routes/trips.routes.ts:385` | unknown | unknown |
| POST | `/api/trips/:id/claim` | user-data | session-self | yes | unknown | `server/routes.ts:1275`<br>`server/routes/trips.routes.ts:415` | unknown | unknown |
| POST | `/api/trips/:id/expert-advisor` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:645` (/trips/:id/expert-advisor) | unknown | unknown |
| POST | `/api/trips/:id/generate-itinerary` | user-data | resource-owner | yes | verified | `server/routes.ts:1310`<br>`server/routes/trips.routes.ts:472` | unknown | unknown |
| POST | `/api/trips/:id/plan-review` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1232` (/trips/:id/plan-review) | unknown | unknown |
| POST | `/api/trips/:id/share` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:516` (/trips/:id/share) | unknown | unknown |
| POST | `/api/trips/:id/suggestions` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:876` (/trips/:id/suggestions) | unknown | unknown |
| PATCH | `/api/trips/:id/suggestions/:suggestionId` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:959` (/trips/:id/suggestions/:suggestionId) | unknown | unknown |
| POST | `/api/trips/:tripId/activate-transport` | user-data | session-self | yes | unknown | `server/routes.ts:11524`<br>`server/routes/trips.routes.ts:1537` | unknown | unknown |
| POST | `/api/trips/:tripId/advisor/narration` | user-data | session-self | yes | unknown | `server/routes/advisor.routes.ts:478` | unknown | unknown |
| POST | `/api/trips/:tripId/alerts` | user-data | session-self | yes | unknown | `server/routes.ts:11742`<br>`server/routes/trips.routes.ts:1716` | unknown | unknown |
| POST | `/api/trips/:tripId/analytics/infer` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3147` | unknown | unknown |
| POST | `/api/trips/:tripId/anchor-suggestions` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1986` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1769` | unknown | unknown |
| POST | `/api/trips/:tripId/anchors/:anchorId/impacts` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1966` | unknown | unknown |
| POST | `/api/trips/:tripId/budget/calculate-split` | user-data | session-self | yes | unknown | `server/routes.ts:11226`<br>`server/routes/trips.routes.ts:1356` | unknown | unknown |
| POST | `/api/trips/:tripId/calculate-energy` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1820` (/trips/:tripId/calculate-energy) | unknown | unknown |
| POST | `/api/trips/:tripId/changes` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:353` | unknown | unknown |
| DELETE | `/api/trips/:tripId/changes/:changeId` | user-data | session-self | yes | unknown | `server/routes/plancard.routes.ts:455` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts` | user-data | session-self | yes | unknown | `server/routes.ts:11018`<br>`server/routes/trips.routes.ts:1086` | unknown | unknown |
| POST | `/api/trips/:tripId/contracts/:contractId/documents` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1117` | unknown | unknown |
| POST | `/api/trips/:tripId/day-boundaries` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1870` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency-contacts` | user-data | session-self | yes | unknown | `server/routes.ts:11677`<br>`server/routes/trips.routes.ts:1664` | unknown | unknown |
| POST | `/api/trips/:tripId/emergency/initialize` | user-data | session-self | yes | unknown | `server/routes.ts:11694`<br>`server/routes/trips.routes.ts:1677` | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-notes` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1554` (/trips/:tripId/expert-notes) | unknown | unknown |
| PATCH | `/api/trips/:tripId/expert-traveler-note` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:3257` | unknown | unknown |
| POST | `/api/trips/:tripId/finalize` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:296` | unknown | unknown |
| POST | `/api/trips/:tripId/generate-presets` | user-data | session-self | yes | unknown | `server/routes/booking-actions.ts:1879` (/trips/:tripId/generate-presets) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/comments` | user-data | resource-owner | yes | verified | `server/routes/booking-actions.ts:1435` (/trips/:tripId/items/:itemId/comments) | unknown | unknown |
| POST | `/api/trips/:tripId/items/:itemId/route` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:125` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary-items` | user-data | resource-owner | yes | verified | `server/routes.ts:11332`<br>`server/routes/trips.routes.ts:1424` | unknown | unknown |
| DELETE | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3210` | unknown | unknown |
| PATCH | `/api/trips/:tripId/itinerary-items/:itemId` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:3168` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/optimize-order` | user-data | session-self | yes | unknown | `server/routes.ts:11484`<br>`server/routes/trips.routes.ts:1504` | unknown | unknown |
| POST | `/api/trips/:tripId/itinerary/reorder` | user-data | resource-owner | yes | verified | `server/routes.ts:11449`<br>`server/routes/trips.routes.ts:1477` | unknown | unknown |
| POST | `/api/trips/:tripId/participants` | user-data | session-self | yes | unknown | `server/routes.ts:10896`<br>`server/routes/trips.routes.ts:989` | unknown | unknown |
| POST | `/api/trips/:tripId/participants/bulk-invite` | user-data | session-self | yes | unknown | `server/routes.ts:10923`<br>`server/routes/trips.routes.ts:1022` | unknown | unknown |
| POST | `/api/trips/:tripId/reopen` | user-data | resource-owner | yes | verified | `server/routes/routing.routes.ts:395` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions` | user-data | session-self | yes | unknown | `server/routes.ts:11183`<br>`server/routes/trips.routes.ts:1325` | unknown | unknown |
| POST | `/api/trips/:tripId/transactions/split` | user-data | session-self | yes | unknown | `server/routes.ts:11200`<br>`server/routes/trips.routes.ts:1338` | unknown | unknown |
| DELETE | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:218` | unknown | unknown |
| PATCH | `/api/trips/:tripId/transport-legs/:legId` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:161` | unknown | unknown |
| POST | `/api/trips/:tripId/transport-legs/generate` | user-data | session-self | yes | unknown | `server/routes/transport-legs.routes.ts:99` | unknown | unknown |
| POST | `/api/trips/:tripId/validate-schedule` | user-data | session-self | yes | unknown | `server/routes/trips.routes.ts:1893` | unknown | unknown |
| POST | `/api/trips/:tripId/vendors/bulk-email` | user-data | resource-owner | yes | verified | `server/routes/trips.routes.ts:1175` | unknown | unknown |
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
| DELETE | `/api/user-experience-items/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1797` | unknown | unknown |
| PATCH | `/api/user-experience-items/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1787` | unknown | unknown |
| POST | `/api/user-experiences` | other | session-self | no | unknown | `server/routes/content.routes.ts:1688` | unknown | unknown |
| DELETE | `/api/user-experiences/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1763` | unknown | unknown |
| PATCH | `/api/user-experiences/:id` | other | session-self | no | unknown | `server/routes/content.routes.ts:1723` | unknown | unknown |
| POST | `/api/user-experiences/:id/items` | other | session-self | no | unknown | `server/routes/content.routes.ts:1775` | unknown | unknown |
| POST | `/api/vendors` | other | session-self | no | unknown | `server/routes.ts:1935` | unknown | unknown |
| POST | `/api/viator/availability` | other | session-self | no | unknown | `server/routes/content.routes.ts:3093` | unknown | unknown |
| POST | `/api/visa/requirements` | other | public-or-system | no | unknown | `server/routes/experts.routes.ts:689` | unknown | unknown |
| POST | `/api/wallet/add-credits` | payments | session-self | no | self | `server/routes/payments.routes.ts:225` | unknown | unknown |
| POST | `/api/webhooks/persona` | other | signature | no | unknown | `server/routes/webhooks.routes.ts:89` (/persona) | unknown | unknown |
| POST | `/api/webhooks/stripe` | payments | signature | no | unknown | `server/routes/webhooks.routes.ts:562` (/stripe) | unknown | unknown |
| POST | `/api/webhooks/stripe-identity` | other | signature | no | unknown | `server/routes/webhooks.routes.ts:29` (/stripe-identity) | unknown | unknown |
