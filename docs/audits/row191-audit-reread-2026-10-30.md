# Row 191 audit re-read — 2026-10-30

Read-only check of audited claims against main `7de47f72bed67fb991805ef4b710d9faad34fa67` (`7de47f72`). No application code, tests, or audited source docs were edited.

Sources: `docs/testing/CONSOLE_SIGMA_AUDIT.md`, every row under `docs/decisions/`, and the audited boundary map in `scripts/mutation-auth/extractor.ts` (`paymentBoundaryOverrides` and `publicSystemOverrides`), plus the count and endpoint pins in `scripts/mutation-auth/extractor.test.ts`.

A claim **holds** when the cited route is still mounted (or is a prefix of a mounted route), the cited guard or test file is still that file, the cited line still contains the code symbol named next to it, or the boundary map still matches the handler. **Drifted** means the thing still exists but not where or how the record says (moved line, different guard, a test id whose assertion changed). **Gone** means the file, route, or test is not on main. A ruling whose point was to remove a route shows up here as gone.

Route mounts were taken from a static walk of `server/routes.ts` (the same walker as `scripts/mutation-auth/extractor.ts`, with GET included). Page paths were matched to `<Route>` / `<Redirect>` path, from, and to values. Boundary verdicts were read off the handlers; they were not copied out of the override map. `node scripts/check-decision-guards.cjs` on this SHA reports the ledger lint OK (831 rows, 0 deferred warnings).

## Counts

| status | count |
| --- | ---: |
| holds | 3735 |
| drifted | 82 |
| gone | 61 |
| total | 3878 |

| source | holds | drifted | gone |
| --- | ---: | ---: | ---: |
| `docs/decisions/` | 3549 | 40 | 61 |
| `docs/testing/CONSOLE_SIGMA_AUDIT.md` | 102 | 39 | 0 |
| `scripts/mutation-auth/extractor.test.ts` | 13 | 0 | 0 |
| `scripts/mutation-auth/extractor.ts` | 71 | 3 | 0 |

## Top drifted

These are the claims whose meaning changed, not only their line numbers.

| claim | source doc | status | evidence |
| --- | --- | --- | --- |
| guard none (public) on GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6611 requires a session. |
| guard none (public) on GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6633 requires a session. |
| test pin K3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | server/__tests__/console-sigma-kyoto-bench.http.test.ts:239 is "K3: a Kyoto local expert cannot be approved without a city-knowledge pass". The inventory says K3 approves the form and flips users.role to local_expert. The test now expects 409 city-knowledge and leaves the role traveler. |
| guard resource-owner on POST /api/coordination-states/:id/refund | scripts/mutation-auth/extractor.ts | drifted | routes.ts:11868 is admin-only (role !== admin returns 403). The map still says resource-owner. |
| guard resource-owner on POST /api/expert/:expertId/tip | scripts/mutation-auth/extractor.ts | drifted | routes.ts:6222 is isAuthenticated and then an unconditional 501. It does not check that the caller owns a tippable relationship. |
| guard public-or-system on POST /api/trips | scripts/mutation-auth/extractor.ts | drifted | The override comment says guest creation is public and mints a share token. The live handler at server/routes.ts:1456 returns 401 Sign in to create a plan when getUserId is empty. The shadowed twin at server/routes/trips.routes.ts:571 still contains the old guest branch and does not serve. |

The console-sigma inventory's handler line numbers have moved (the routes are still mounted). Gone routes cluster on surfaces the ledger already retired: `expert-templates`, the `grok` rails, `POST /api/invites/:token/travel-plans`, `GET /api/invites/:token/recommendations`, and `/internal/jobs/legs-dayof-recheck`. Five file citations name files that are not on main: `itinerary.tsx`, `BookingFlowModal.tsx`, `unwired-spec-gate.yml`, `DayTransportPanel.tsx`, `my-itinerary.tsx`.

## Drifted and gone

| claim | source doc | status | evidence |
| --- | --- | --- | --- |
| guard public-or-system on POST /api/trips | scripts/mutation-auth/extractor.ts | drifted | The override comment says guest creation is public and mints a share token. The live handler at server/routes.ts:1456 returns 401 Sign in to create a plan when getUserId is empty. The shadowed twin at server/routes/trips.routes.ts:571 still contains the old guest branch and does not serve. |
| guard resource-owner on POST /api/coordination-states/:id/refund | scripts/mutation-auth/extractor.ts | drifted | routes.ts:11868 is admin-only (role !== admin returns 403). The map still says resource-owner. |
| guard resource-owner on POST /api/expert/:expertId/tip | scripts/mutation-auth/extractor.ts | drifted | routes.ts:6222 is isAuthenticated and then an unconditional 501. It does not check that the caller owns a tippable relationship. |
| guard none (public) on GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6611 requires a session. |
| guard none (public) on GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6633 requires a session. |
| test pin K3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | server/__tests__/console-sigma-kyoto-bench.http.test.ts:239 is "K3: a Kyoto local expert cannot be approved without a city-knowledge pass". The inventory says K3 approves the form and flips users.role to local_expert. The test now expects 409 city-knowledge and leaves the role traveler. |
| file:line booking-actions.ts:1119-1123 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | fee_bands is not in server/routes/booking-actions.ts. Cited line now reads: dayNumber: dayNumber ?? null, title, |
| file:line booking-actions.ts:1129 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | localExpertId is not on the cited lines. It is at server/routes/booking-actions.ts:844. |
| file:line booking-actions.ts:1651 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | detectAnchorImpacts is not on the cited lines. It is at server/routes/booking-actions.ts:2031. |
| file:line booking-actions.ts:1662 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | boundaryViolations is not on the cited lines. It is at server/routes/booking-actions.ts:2056. |
| file:line client/src/pages/expert/workspace.tsx:222-226 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | findIndex is not on the cited lines. It is at client/src/pages/expert/workspace.tsx:1214. |
| file:line expert-workspace.routes.ts:40 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | requireExpert is not on the cited lines. It is at server/routes/expert-workspace.routes.ts:46. |
| file:line handler server/routes.ts:2033 for GET /api/provider/services | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:3256. |
| file:line handler server/routes.ts:8706 for GET /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:13338. |
| file:line handler server/routes.ts:8784 for POST /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:13414. |
| file:line handler server/routes/booking-actions.ts:1050 for GET /api/trips/:tripId/traveler-profile | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1298. |
| file:line handler server/routes/booking-actions.ts:1114 for PATCH /api/expert/assignments/:id/workspace-status | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1375. |
| file:line handler server/routes/booking-actions.ts:1488 for GET /api/trips/:tripId/my-assignment | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1817. |
| file:line handler server/routes/booking-actions.ts:1502 for GET /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1836. |
| file:line handler server/routes/booking-actions.ts:1523 for PATCH /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1861. |
| file:line handler server/routes/booking-actions.ts:1541 for GET /api/trips/:tripId/commission | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1882. |
| file:line handler server/routes/content.routes.ts:5711 for GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/content.routes.ts:6611. |
| file:line handler server/routes/content.routes.ts:5730 for GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/content.routes.ts:6633. |
| file:line itinerary-intelligence.service.ts:343-362 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | optimizeOrder is not on the cited lines. It is at server/services/itinerary-intelligence.service.ts:330. |
| file:line server/routes.ts:4637 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | createTripExpertAdvisor is not on the cited lines. It is at server/routes.ts:8079. |
| file:line server/routes.ts:719 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | fee_bands is not on the cited lines. It is at server/routes.ts:7880. |
| file:line server/routes.ts:8784 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | isExpertAssignedToTrip is not on the cited lines. It is at server/routes.ts:12082. |
| file:line server/routes/admin.routes.ts:5655-5712 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | confirmLeadAssignmentHandler is not on the cited lines. It is at server/routes/admin.routes.ts:9027. |
| file:line server/routes/booking-actions.ts:1114-1138 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | updateExpertAssignmentWorkspaceStatus is not on the cited lines. It is at server/routes/booking-actions.ts:1416. |
| file:line server/routes/booking-actions.ts:1119-1123 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | in_review is not on the cited lines. It is at server/routes/booking-actions.ts:1381. |
| file:line server/routes/booking-actions.ts:1488 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getExpertAssignedTrips is not on the cited lines. It is at server/routes/booking-actions.ts:904. |
| file:line server/routes/booking-actions.ts:1502 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getTripExpertAdvisoryAssignment is not on the cited lines. It is at server/routes/booking-actions.ts:1821. |
| file:line server/routes/booking-actions.ts:1541 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | canMutateTrip is not in server/routes/booking-actions.ts. Cited line now reads: // pays the expert and returns the pen; request changes spends one of the two included rounds and |
| file:line server/routes/payments.routes.ts:835 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | serviceExpertPct is not in server/routes/payments.routes.ts. Cited line now reads: // and the client must NOT call stripe.confirmPayment with the clientSecret. `requiresAction` |
| file:line server/services/commission.ts:379 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | resolveCommissionRates is not on the cited lines. It is at server/services/commission.ts:615. |
| file:line server/services/commission.ts:48-49 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | EXPERT_SHARE_RATE is not on the cited lines. It is at server/services/commission.ts:98. |
| file:line server/services/transport-gap.service.ts:107 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | analyzeTransportGaps is not on the cited lines. It is at server/services/transport-gap.service.ts:110. |
| file:line server/storage.ts:4815 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | trip_expert_advisors is not in server/storage.ts. Cited line now reads: // guard, never a check-then-insert). `inserted` is what a caller gates a non-idempotent |
| file:line shared/schema.ts:6239 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | expertShareRate is not in shared/schema.ts. Cited line now reads: // FD-2 (migration 361; ledger `2026-10-09-fd2-content-tier-tags`): content-tier tags. Nullable, no |
| file:line smart-sequencing.service.ts:1824 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | applyEnergyBalancing is not on the cited lines. It is at server/services/smart-sequencing.service.ts:1916. |
| file:line storage.ts:4795 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getExpertAssignedTrips is not in server/storage.ts. Cited line now reads: const [newNotification] = await db.insert(notifications).values(notification).returning(); |
| file:line workspace.tsx:2715 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | autoSaveNotesMutation is not on the cited lines. It is at client/src/pages/expert/workspace.tsx:2601. |
| file:line bookings.ts:125 | docs/decisions/00048-39.md | drifted | handlePaymentSucceeded is not in server/routes/bookings.ts. Cited line now reads: // Admin sees everything |
| file:line stripe-payment.service.ts:564 | docs/decisions/00048-39.md | drifted | handlePaymentSucceeded is not on the cited lines. It is at server/services/stripe-payment.service.ts:902. |
| file:line server/__tests__/checkout-payment-promotion.db.test.ts:280 | docs/decisions/00050-41.md | drifted | PaymentIntent is not on the cited lines. It is at server/__tests__/checkout-payment-promotion.db.test.ts:392. |
| file:line e2e-test-accounts.seed.ts:34 | docs/decisions/00053-44.md | drifted | service_provider is not on the cited lines. It is at server/seeds/e2e-test-accounts.seed.ts:35. |
| file:line payments.routes.ts:826 | docs/decisions/00056-47.md | drifted | revenue_share_rate is not in server/routes/payments.routes.ts. Cited line now reads: bookingType: args.quoteBorn ? BookingType.PROVIDER_BOOKING : BookingType.EXPERIENCE_CART, |
| file:line affiliate-reconciliation.service.ts:425-427 | docs/decisions/00061-52.md | drifted | platform_revenue is not in server/services/affiliate-reconciliation.service.ts. Cited line now reads: booking_request_id = ${linkedRequestId}, |
| file:line server/routes/webhooks.routes.ts:66 | docs/decisions/00065-56.md | drifted | updateFormIdentityVerification is not on the cited lines. It is at server/routes/webhooks.routes.ts:77. |
| file:line storage.ts:1649 | docs/decisions/00065-56.md | drifted | approval_status is not in server/storage.ts. Cited line now reads: // A final EXISTS ⇔ MAX(version) is present; a reopened trip still has its versions, so it |
| file:line storefront.routes.ts:557 | docs/decisions/00065-56.md | drifted | approval_status is not in server/routes/storefront.routes.ts. Cited line now reads: * somebody the caller never saw (§13). Only the JSON read the SPA calls resolves a buyer. |
| file:line deposit.service.ts:94 | docs/decisions/00082-74.md | drifted | changeCutoffHours is not on the cited lines. It is at server/services/deposit.service.ts:96. |
| file:line services.tsx:1224 | docs/decisions/00082-74.md | drifted | PostingOpportunitiesCard is not in client/src/pages/provider/services.tsx. Cited line now reads: // Gap #18: archived is terminal — the server refuses every PATCH on an archived row, so the |
| file:line shared/schema.ts:963-969 | docs/decisions/00119-100.md | drifted | bundle_components is not on the cited lines. It is at shared/schema.ts:1682. |
| file:line routing.routes.ts:223 | docs/decisions/00148-2026-08-17-partner-demand-r15-transition-log.md | drifted | logItemTransition is not on the cited lines. It is at server/routes/routing.routes.ts:383. |
| file:line schema.ts:6817 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | feeLedger is not on the cited lines. It is at shared/schema.ts:9245. |
| file:line schema.ts:7093 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | provider_availability is not in shared/schema.ts. Cited line now reads: metadata: jsonb("metadata"), |
| file:line storage.ts:3025 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | providerServices is not on the cited lines. It is at server/storage.ts:2449. |
| file:line market-insights.service.ts:187 | docs/decisions/00171-2026-08-20-partner-demand-onepager-gap-pairing.md | drifted | resolveCoverageGaps is not on the cited lines. It is at server/services/market-insights.service.ts:123. |
| file:line shared/schema.ts:7903 | docs/decisions/00183-2026-08-21-trailhead-t4-storefront.md | drifted | inventory_class is not on the cited lines. It is at shared/schema.ts:10784. |
| file:line content.routes.ts:2636 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | drifted | destination_search_patterns is not in server/routes/content.routes.ts. Cited line now reads: .innerJoin(cityNeighborhoods, eq(providerNeighborhoodCoverage.neighborhoodId, cityNeighborhoods.id)) |
| file:line shared/schema.ts:6222 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | drifted | search_analytics is not on the cited lines. It is at shared/schema.ts:8606. |
| file:line itinerary-optimizer.ts:967-1058 | docs/decisions/00199-2026-08-22-slip-optimize-review-first.md | drifted | travel_time is not on the cited lines. It is at server/itinerary-optimizer.ts:1829. |
| file:line booking-actions.ts:698 | docs/decisions/00213-2026-08-22-concierge-revision-p2.md | drifted | getExpertAssignedTrips is not on the cited lines. It is at server/routes/booking-actions.ts:904. |
| file:line experts.routes.ts:619 | docs/decisions/00213-2026-08-22-concierge-revision-p2.md | drifted | getExpertAssignedTrips is not in server/routes/experts.routes.ts. Cited line now reads: |
| file:line trip-finalize.service.ts:33-36 | docs/decisions/00302-2026-08-31-landing-v2.5-close-out.md | drifted | special_requests is not in server/services/trip-finalize.service.ts. Cited line now reads: import { platformCarFits as readPlatformCarFits } from "./airport-leg.service"; |
| file:line content.routes.ts:164 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | insertTripParticipantSchema is not on the cited lines. It is at server/routes/content.routes.ts:7213. |
| file:line server/routes.ts:10590 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | trip_participants is not in server/routes.ts. Cited line now reads: fixedCommitments, |
| file:line trip-strip.tsx:182 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | user_experiences is not in client/src/components/trip/trip-strip.tsx. Cited line now reads: ? "" |
| file:line booking-actions.service.ts:602 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | drifted | ensureTripAdvisorRow is not on the cited lines. It is at server/services/booking-actions.service.ts:917. |
| file:line itinerary.tsx:424 | docs/decisions/00384-2026-09-05-slip-switch-reads-events-first.md | gone | No file matches itinerary.tsx. |
| file:line client/src/components/trip/plan-modal.tsx:985 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | commitPlan is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:813. |
| file:line plan-modal.tsx:1117-1132 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | readPendingEvents is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:483. |
| file:line plan-modal.tsx:475 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | readPendingEvents is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:483. |
| file:line BookingFlowModal.tsx:257 | docs/decisions/00456-2026-09-08-punchlist.md | gone | No file matches BookingFlowModal.tsx. |
| file:line buy-action-payload.ts:188-203 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | resolveBuyAction is not on the cited lines. It is at server/services/buy-action-payload.ts:292. |
| file:line plan-modal.tsx:880-891 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | trip_contexts is not in client/src/components/trip/plan-modal.tsx. Cited line now reads: |
| file:line ready-made-purchase.service.ts:219-221 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | durationDays is not on the cited lines. It is at server/services/ready-made-purchase.service.ts:226. |
| file:line trips.routes.ts:3163-3179 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | trip_contexts is not in server/routes/trips.routes.ts. Cited line now reads: } catch (err) { |
| file:line unwired-spec-gate.yml:5 | docs/decisions/00535-2026-09-15-orphan-ratchet.md | gone | No file matches unwired-spec-gate.yml. |
| file:line server/routes.ts:18777 | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | drifted | server/routes.ts has 14062 lines; cited line 18777 is past EOF. |
| file:line server/routes.ts:11085 | docs/decisions/00589-2026-09-20-dummy-seeder-gated-preview-widened.md | drifted | seedDatabase is not on the cited lines. It is at server/routes.ts:12099. |
| file:line server/services/commission.ts:521 | docs/decisions/00605-2026-09-22-early-adopter-gate-exit.md | drifted | isEarlyAdopterProvider is not in server/services/commission.ts. Cited line now reads: * Ruling 25 (migration 174): EXPERIENCE_CART platform-take rate from fee_bands. |
| file:line plan-steps.ts:222 | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | drifted | resolvePlanSteps is not on the cited lines. It is at client/src/lib/plan-steps.ts:226. |
| file:line location-view.service.ts:311 | docs/decisions/00949-2026-10-08-location-view-recs-rejection.md | drifted | unhandledRejection is not in server/services/location-view.service.ts. Cited line now reads: const hero = await heroPromise; |
| file:line DayTransportPanel.tsx:207-215 | docs/decisions/01247-2026-10-25-b8-transport-section.md | gone | No file matches DayTransportPanel.tsx. |
| file:line my-itinerary.tsx:636-641 | docs/decisions/01247-2026-10-25-b8-transport-section.md | gone | No file matches my-itinerary.tsx. |
| route /booking-demo | docs/decisions/00048-39.md | gone | No client Route or Redirect matches /booking-demo. |
| route POST /api/vendor-availability/:id/book | docs/decisions/00051-42.md | gone | No mounted POST /api/vendor-availability/:p/book. |
| route /r/:code | docs/decisions/00077-68.md | gone | No client Route or Redirect matches /r/:p. |
| route POST /api/admin/demand-one-pager | docs/decisions/00174-2026-08-20-partner-demand-onepager-admin-control.md | gone | No mounted POST /api/admin/demand-one-pager. |
| route /generate | docs/decisions/00203-2026-08-22-slip-review-copy.md | gone | No client Route or Redirect matches /generate. |
| route POST /api/ready-made/purchases/:id/refund | docs/decisions/00216-2026-08-22-concierge-p3.md | gone | No mounted POST /api/ready-made/purchases/:p/refund. |
| route /generate | docs/decisions/00232-2026-08-23-optimizer-pin-liveroute.md | gone | No client Route or Redirect matches /generate. |
| route /generate | docs/decisions/00264-2026-08-25-optimizer-pin-on-create.md | gone | No client Route or Redirect matches /generate. |
| route /providers/:handle | docs/decisions/00266-2026-08-26-storefront-role-agnostic.md | gone | No client Route or Redirect matches /providers/:p. |
| route /api/expert-templates | docs/decisions/00268-2026-08-26-ready-made-no-templates.md | gone | No mounted handler matches /api/expert-templates. |
| route /expert-templates/:id | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No client Route or Redirect matches /expert-templates/:p. |
| route /expert/templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No client Route or Redirect matches /expert/templates. |
| route DELETE /api/expert/templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted DELETE /api/expert/templates. |
| route GET /api/admin/expert-templates/pending | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/admin/expert-templates/pending. |
| route GET /api/expert-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert-templates. |
| route GET /api/expert-templates/:id | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert-templates/:p. |
| route GET /api/expert/template-sales | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert/template-sales. |
| route GET /api/my-purchased-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/my-purchased-templates. |
| route POST /api/expert-templates/:id/purchase | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert-templates/:p/purchase. |
| route POST /api/expert-templates/:id/reviews | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert-templates/:p/reviews. |
| route POST /api/expert/templates/:id/submit | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert/templates/:p/submit. |
| route POST /api/grok/chat | docs/decisions/00331-2026-09-03-security-9-11-13.md | gone | No mounted POST /api/grok/chat. |
| route /api/trips/:tripId/participants/:participantId | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | gone | No mounted handler matches /api/trips/:p/participants/:p. |
| route GET /api/vendors/:id | docs/decisions/00375-2026-09-05-vendors-read-scope.md | gone | No mounted GET /api/vendors/:p. |
| route POST /api/vendor-availability/:id/book | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | gone | No mounted POST /api/vendor-availability/:p/book. |
| route POST /api/grok/itinerary/generate | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | gone | No mounted POST /api/grok/itinerary/generate. |
| route /api/amadeus/flights | docs/decisions/00402-2026-09-05-ai-booking-agent.md | gone | No mounted handler matches /api/amadeus/flights. |
| route PATCH /api/transport-booking-options/:optionId/status | docs/decisions/00470-2026-09-12-transport-status-self-report-gate.md | gone | No mounted PATCH /api/transport-booking-options/:p/status. |
| route PATCH /api/transport-booking-options/:optionId/status | docs/decisions/00472-2026-09-12-delete-dead-transport-status.md | gone | No mounted PATCH /api/transport-booking-options/:p/status. |
| route /booking-demo | docs/decisions/00516-2026-09-15-d12-service-bookings-canonical.md | gone | No client Route or Redirect matches /booking-demo. |
| route POST /api/expert/templates | docs/decisions/00532-2026-09-15-orphan-triage.md | gone | No mounted POST /api/expert/templates. |
| route POST /api/leads/route | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | gone | No mounted POST /api/leads/route. |
| route /api/expert/templates | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | gone | No mounted handler matches /api/expert/templates. |
| route POST /api/expert/templates | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | gone | No mounted POST /api/expert/templates. |
| route POST /api/leads/route | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | gone | No mounted POST /api/leads/route. |
| route /booking-demo | docs/decisions/00546-2026-09-15-d12-legacy-cutoff-date.md | gone | No client Route or Redirect matches /booking-demo. |
| route /api/destination-intelligence | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/destination-intelligence. |
| route /api/grok/chat | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/chat. |
| route /api/grok/content/generate | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/content/generate. |
| route /api/grok/health | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/health. |
| route /api/grok/intelligence | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/intelligence. |
| route /api/grok/itinerary/generate | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/itinerary/generate. |
| route GET /api/trips/:tripId/itinerary/recommendations | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted GET /api/trips/:p/itinerary/recommendations. |
| route /api/destination-intelligence | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | gone | No mounted handler matches /api/destination-intelligence. |
| route /provider-verification | docs/decisions/00926-2026-10-07-public-service-ids.md | gone | No client Route or Redirect matches /provider-verification. |
| route /trip | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | gone | No client Route or Redirect matches /trip. |
| route /admin/bookings/service/no-such-booking | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | gone | No client Route or Redirect matches /admin/bookings/service/no-such-booking. |
| route /internal/jobs/legs-dayof-recheck | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | gone | No mounted handler matches /internal/jobs/legs-dayof-recheck. |
| route /trip | docs/decisions/01081-2026-10-17-9a-ii-osrm-vm.md | gone | No client Route or Redirect matches /trip. |
| route /expert | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | gone | No client Route or Redirect matches /expert. |
| route /provider | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | gone | No client Route or Redirect matches /provider. |
| route /admin/bookings/service/:id | docs/decisions/01201-2026-10-22-admin-ops-screens.md | gone | No client Route or Redirect matches /admin/bookings/service/:p. |
| route /generate | docs/decisions/01238-2026-10-25-custom-pin-client.md | gone | No client Route or Redirect matches /generate. |
| route /trip-pass/purchase | docs/decisions/01239-2026-10-25-dates-gate-gaps.md | gone | No client Route or Redirect matches /trip-pass/purchase. |
| route GET /api/invites/:token/recommendations | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | gone | No mounted GET /api/invites/:p/recommendations. |
| route POST /api/invites/:token/travel-plans | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | gone | No mounted POST /api/invites/:p/travel-plans. |

## All claims

| claim | source doc | status | evidence |
| --- | --- | --- | --- |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-01-nominatim-boot-health) | docs/decisions/00001-2026-10-01-nominatim-boot-health.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/migration-state.test.ts (2026-10-01-nominatim-boot-health) | docs/decisions/00001-2026-10-01-nominatim-boot-health.md | holds | File is server/services/__tests__/migration-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-01-nominatim-boot-health) | docs/decisions/00001-2026-10-01-nominatim-boot-health.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/landing-hero-representative.test.tsx (2026-09-28-billboard-slot-types) | docs/decisions/00002-2026-09-28-billboard-slot-types.md | holds | File is client/src/components/__tests__/landing-hero-representative.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/billboard-gem-planning.test.ts (2026-09-28-billboard-slot-types) | docs/decisions/00002-2026-09-28-billboard-slot-types.md | holds | File is client/src/lib/__tests__/billboard-gem-planning.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/pending-billboard-gem-idempotency.db.test.ts (2026-09-28-billboard-slot-types) | docs/decisions/00002-2026-09-28-billboard-slot-types.md | holds | File is server/__tests__/pending-billboard-gem-idempotency.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/landing-billboard-override.test.ts (2026-09-28-billboard-slot-types) | docs/decisions/00002-2026-09-28-billboard-slot-types.md | holds | File is server/services/__tests__/landing-billboard-override.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/landing-hero.test.ts (2026-09-28-billboard-slot-types) | docs/decisions/00002-2026-09-28-billboard-slot-types.md | holds | File is server/services/__tests__/landing-hero.test.ts. Ledger lint reports the guard wired. |
| guard expert-provider-mutation-auth (2026-09-22-ready-made-mutation-auth-family-a) | docs/decisions/00003-2026-09-22-ready-made-mutation-auth-family-a.md | holds | File is server/__tests__/mutation-auth/expert-provider-mutation-auth.test.ts. Ledger lint reports the guard wired. |
| route /quick-start | docs/decisions/00004-2026-09-21-retire-quick-start.md | holds | Client Route or Redirect matches /quick-start. |
| guard none (2026-09-22-replit-env-vars-restored) | docs/decisions/00005-2026-09-22-replit-env-vars-restored.md | holds | Row states it has no CI guard: none — and that is the finding. |
| test pin client/src/lib/__tests__/trip-pass-copy.test.ts (2026-09-21-expert-revision-retired) | docs/decisions/00006-2026-09-21-expert-revision-retired.md | holds | File is client/src/lib/__tests__/trip-pass-copy.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/trip-entitlement.db.test.ts (2026-09-21-expert-revision-retired) | docs/decisions/00006-2026-09-21-expert-revision-retired.md | holds | File is server/__tests__/trip-entitlement.db.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/navbar-responsive.spec.ts (2026-09-21-navbar-outside-click-spec) | docs/decisions/00007-2026-09-21-navbar-outside-click-spec.md | holds | File is playwright/tests/navbar-responsive.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-pass-copy.test.ts (2026-09-21-trip-pass-revision-claim) | docs/decisions/00008-2026-09-21-trip-pass-revision-claim.md | holds | File is client/src/lib/__tests__/trip-pass-copy.test.ts. Ledger lint reports the guard wired. |
| route /api/plus/config | docs/decisions/00009-2026-09-21-membership-purchase-surface.md | holds | Mounted (GET). |
| test pin client/src/lib/__tests__/membership-checkout-copy.test.ts (2026-09-21-membership-purchase-surface) | docs/decisions/00009-2026-09-21-membership-purchase-surface.md | holds | File is client/src/lib/__tests__/membership-checkout-copy.test.ts. Ledger lint reports the guard wired. |
| guard advisory (1) | docs/decisions/00010-1.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2) | docs/decisions/00011-2.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (3) | docs/decisions/00012-3.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (4) | docs/decisions/00013-4.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (5) | docs/decisions/00014-5.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (6) | docs/decisions/00015-6.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (7) | docs/decisions/00016-7.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (8) | docs/decisions/00017-8.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (9) | docs/decisions/00018-9.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-trip-mint-owner-access (10) | docs/decisions/00019-10.md | holds | File is scripts/check-trip-mint-owner-access.cjs. Ledger lint reports the guard wired. |
| guard advisory (11) | docs/decisions/00020-11.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (12) | docs/decisions/00021-12.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (13) | docs/decisions/00022-13.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (14) | docs/decisions/00023-14.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (15) | docs/decisions/00024-15.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (16) | docs/decisions/00025-16.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-trip-mint-owner-access (17) | docs/decisions/00026-17.md | holds | File is scripts/check-trip-mint-owner-access.cjs. Ledger lint reports the guard wired. |
| guard advisory (18) | docs/decisions/00027-18.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (19) | docs/decisions/00028-19.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (20) | docs/decisions/00029-20.md | holds | Row is marked advisory; it names no CI guard. |
| guard matrix-lint (21) | docs/decisions/00030-21.md | holds | No file is named matrix-lint. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| guard advisory (22) | docs/decisions/00031-22.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (23) | docs/decisions/00032-23.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (24) | docs/decisions/00033-24.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (25) | docs/decisions/00034-25.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-decision-guards (26) | docs/decisions/00035-26.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| guard chain-integrity (27) | docs/decisions/00036-27.md | holds | File is server/migrations/__tests__/chain-integrity.test.ts. Ledger lint reports the guard wired. |
| guard phase2-fee-gate (27) | docs/decisions/00036-27.md | holds | File is scripts/phase2-fee-gate.sh. Ledger lint reports the guard wired. |
| guard advisory (28) | docs/decisions/00037-28.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (29) | docs/decisions/00038-29.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (30) | docs/decisions/00039-30.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (31) | docs/decisions/00040-31.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (32) | docs/decisions/00041-32.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (33) | docs/decisions/00042-33.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (34) | docs/decisions/00043-34.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (35) | docs/decisions/00044-35.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (36) | docs/decisions/00045-36.md | holds | Row is marked advisory; it names no CI guard. |
| guard matrix-lint (37) | docs/decisions/00046-37.md | holds | No file is named matrix-lint. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| guard advisory (38) | docs/decisions/00047-38.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/bookings/confirm-payment | docs/decisions/00047-38.md | holds | Mounted at server/routes/bookings.ts:265. |
| route POST /api/checkout | docs/decisions/00047-38.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| file:line booking.service.ts:592 | docs/decisions/00048-39.md | holds | No code symbol was named beside the citation. Line server/services/booking.service.ts:592 reads: try { |
| file:line bookings.ts:125 | docs/decisions/00048-39.md | drifted | handlePaymentSucceeded is not in server/routes/bookings.ts. Cited line now reads: // Admin sees everything |
| file:line stripe-payment.service.ts:564 | docs/decisions/00048-39.md | drifted | handlePaymentSucceeded is not on the cited lines. It is at server/services/stripe-payment.service.ts:902. |
| guard advisory (39) | docs/decisions/00048-39.md | holds | Row is marked advisory; it names no CI guard. |
| route /booking-demo | docs/decisions/00048-39.md | gone | No client Route or Redirect matches /booking-demo. |
| route /itinerary-comparison/:id | docs/decisions/00048-39.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| route GET /api/admin/bookings/reconciliation-exceptions | docs/decisions/00048-39.md | holds | Mounted at server/routes/admin.routes.ts:638. |
| route POST /api/bookings/confirm-payment | docs/decisions/00048-39.md | holds | Mounted at server/routes/bookings.ts:265. |
| route POST /api/bookings/process-cart | docs/decisions/00048-39.md | holds | Mounted at server/routes/bookings.ts:162. |
| guard advisory (40) | docs/decisions/00049-40.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/reconciliation | docs/decisions/00049-40.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| route GET /api/admin/bookings/reconciliation-exceptions | docs/decisions/00049-40.md | holds | Mounted at server/routes/admin.routes.ts:638. |
| route GET /api/admin/reconciliation/exceptions | docs/decisions/00049-40.md | holds | Mounted at server/routes/admin.routes.ts:2161. |
| file:line server/__tests__/checkout-payment-promotion.db.test.ts:280 | docs/decisions/00050-41.md | drifted | PaymentIntent is not on the cited lines. It is at server/__tests__/checkout-payment-promotion.db.test.ts:392. |
| guard advisory (41) | docs/decisions/00050-41.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-money-endpoints (42) | docs/decisions/00051-42.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| guard phase2-fee-gate (42) | docs/decisions/00051-42.md | holds | File is scripts/phase2-fee-gate.sh. Ledger lint reports the guard wired. |
| route PATCH /api/provider/bookings/:id/status | docs/decisions/00051-42.md | holds | Mounted at server/routes.ts:8104. |
| route PATCH /api/provider/services | docs/decisions/00051-42.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route POST /api/expert-application | docs/decisions/00051-42.md | holds | Mounted at server/routes.ts:2702. |
| route POST /api/vendor-availability/:id/book | docs/decisions/00051-42.md | gone | No mounted POST /api/vendor-availability/:p/book. |
| guard check-decision-guards (43) | docs/decisions/00052-43.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| guard check-money-endpoints (43) | docs/decisions/00052-43.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| guard phase2-fee-gate (43) | docs/decisions/00052-43.md | holds | File is scripts/phase2-fee-gate.sh. Ledger lint reports the guard wired. |
| file:line e2e-test-accounts.seed.ts:34 | docs/decisions/00053-44.md | drifted | service_provider is not on the cited lines. It is at server/seeds/e2e-test-accounts.seed.ts:35. |
| file:line short-links.routes.ts:213-228 | docs/decisions/00053-44.md | holds | No code symbol was named beside the citation. Line server/routes/short-links.routes.ts:213-228 reads: // Admin is the ONLY other authority the disposition names. Role from the DB, not the session. |
| guard advisory (44) | docs/decisions/00053-44.md | holds | Row is marked advisory; it names no CI guard. |
| file:line payments.routes.ts:575-577 | docs/decisions/00054-45.md | holds | No code symbol was named beside the citation. Line server/routes/payments.routes.ts:575-577 reads: * take something the operation did not authorize, §15b's own reasoning one step out). |
| guard advisory (45) | docs/decisions/00054-45.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-money-endpoints (46) | docs/decisions/00055-46.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| route /admin/reconciliation | docs/decisions/00055-46.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| route GET /api/admin/reconciliation/exceptions | docs/decisions/00055-46.md | holds | Mounted at server/routes/admin.routes.ts:2161. |
| route POST /api/bookings | docs/decisions/00055-46.md | holds | Mounted at server/routes.ts:7605. |
| file:line payments.routes.ts:826 | docs/decisions/00056-47.md | drifted | revenue_share_rate is not in server/routes/payments.routes.ts. Cited line now reads: bookingType: args.quoteBorn ? BookingType.PROVIDER_BOOKING : BookingType.EXPERIENCE_CART, |
| file:line shared/schema.ts:715 | docs/decisions/00056-47.md | holds | No code symbol was named beside the citation. Line shared/schema.ts:715 reads: tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }), |
| guard fee-resolution-authority (47) | docs/decisions/00056-47.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| guard fee-resolution-authority (48) | docs/decisions/00057-48.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (49) | docs/decisions/00058-49.md | holds | Row is marked advisory; it names no CI guard. |
| file:line payments.routes.ts:307 | docs/decisions/00059-50.md | holds | No code symbol was named beside the citation. Line server/routes/payments.routes.ts:307 reads: res.json(splits); |
| guard advisory (50) | docs/decisions/00059-50.md | holds | Row is marked advisory; it names no CI guard. |
| route /earn | docs/decisions/00059-50.md | holds | Client Route or Redirect matches /earn. |
| guard fee-resolution-authority (51) | docs/decisions/00060-51.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| file:line affiliate-reconciliation.service.ts:425-427 | docs/decisions/00061-52.md | drifted | platform_revenue is not in server/services/affiliate-reconciliation.service.ts. Cited line now reads: booking_request_id = ${linkedRequestId}, |
| file:line booking-actions.service.ts:91-101 | docs/decisions/00061-52.md | holds | No code symbol was named beside the citation. Line server/services/booking-actions.service.ts:91-101 reads: } |
| guard advisory (52) | docs/decisions/00061-52.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (53) | docs/decisions/00062-53.md | holds | Row is marked advisory; it names no CI guard. |
| route /expert-status | docs/decisions/00062-53.md | holds | Client Route or Redirect matches /expert-status. |
| route /provider-status | docs/decisions/00062-53.md | holds | Client Route or Redirect matches /provider-status. |
| route PATCH /api/provider/services | docs/decisions/00062-53.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| guard advisory (54) | docs/decisions/00063-54.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (55) | docs/decisions/00064-55.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/identity/business/create-inquiry | docs/decisions/00064-55.md | holds | Mounted at server/routes/identity.routes.ts:64. |
| route POST /api/webhooks/persona | docs/decisions/00064-55.md | holds | Mounted at server/routes/webhooks.routes.ts:104. |
| file:line client/src/components/backoffice/my-offerings-table.tsx:302 | docs/decisions/00065-56.md | holds | No code symbol was named beside the citation. Line client/src/components/backoffice/my-offerings-table.tsx:302 reads: data-testid={`button-toggle-status-${row.lane}-${row.id}`} |
| file:line server/routes/webhooks.routes.ts:66 | docs/decisions/00065-56.md | drifted | updateFormIdentityVerification is not on the cited lines. It is at server/routes/webhooks.routes.ts:77. |
| file:line storage.ts:1649 | docs/decisions/00065-56.md | drifted | approval_status is not in server/storage.ts. Cited line now reads: // A final EXISTS ⇔ MAX(version) is present; a reopened trip still has its versions, so it |
| file:line storefront.routes.ts:557 | docs/decisions/00065-56.md | drifted | approval_status is not in server/routes/storefront.routes.ts. Cited line now reads: * somebody the caller never saw (§13). Only the JSON read the SPA calls resolves a buyer. |
| guard advisory (56) | docs/decisions/00065-56.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/expert/services/:id/status | docs/decisions/00065-56.md | holds | Mounted at server/routes.ts:6618. |
| route PATCH /api/provider/services | docs/decisions/00065-56.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route POST /api/admin/provider-services/:id/approve | docs/decisions/00065-56.md | holds | Mounted at server/routes/admin.routes.ts:4366. |
| guard publish-gate-and-fundamentals (57) | docs/decisions/00066-57.md | holds | No file is named publish-gate-and-fundamentals. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| route POST /api/auth/register | docs/decisions/00066-57.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| guard advisory (59) | docs/decisions/00067-59.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (60) | docs/decisions/00068-60.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (61) | docs/decisions/00069-61.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (62) | docs/decisions/00070-62.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (63) | docs/decisions/00071-63.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (64) | docs/decisions/00072-64.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00072-64.md | holds | Client Route or Redirect matches /services/:p. |
| route POST /api/geocode | docs/decisions/00072-64.md | holds | Mounted at server/routes/content.routes.ts:4473. |
| guard advisory (65) | docs/decisions/00073-65.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/me/preferences | docs/decisions/00073-65.md | holds | Mounted at server/routes/storefront.routes.ts:276. |
| guard advisory (58) | docs/decisions/00074-58.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/service-bookings/:id/deliverable | docs/decisions/00074-58.md | holds | Mounted at server/routes.ts:7314. |
| route POST /api/provider/services/:id/deliverable-file | docs/decisions/00074-58.md | holds | Mounted at server/routes.ts:6996. |
| guard advisory (66) | docs/decisions/00075-66.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/bookings/:id/confirm-completion | docs/decisions/00075-66.md | holds | Mounted at server/routes/bookings.ts:781. |
| route POST /api/bookings/:id/dispute | docs/decisions/00075-66.md | holds | Mounted at server/routes/bookings.ts:859. |
| route POST /api/provider | docs/decisions/00075-66.md | holds | Routes are still mounted under this prefix (for example POST /api/provider/availability). |
| guard advisory (67) | docs/decisions/00076-67.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00076-67.md | holds | Client Route or Redirect matches /services/:p. |
| route POST /api/provider/services/:id/attestations | docs/decisions/00076-67.md | holds | Mounted at server/routes/service-attestations.routes.ts:135. |
| guard fee-resolution-authority (68) | docs/decisions/00077-68.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| route /api/checkout | docs/decisions/00077-68.md | holds | Mounted (POST). |
| route /r/:code | docs/decisions/00077-68.md | gone | No client Route or Redirect matches /r/:p. |
| guard advisory (69) | docs/decisions/00078-69.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/bookings/:id/confirm-completion | docs/decisions/00078-69.md | holds | Mounted at server/routes/bookings.ts:781. |
| guard fee-resolution-authority (70) | docs/decisions/00079-70.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| route /api/checkout | docs/decisions/00079-70.md | holds | Mounted (POST). |
| route GET /api/cart | docs/decisions/00079-70.md | holds | Mounted at server/routes.ts:9468. |
| route GET /api/cart/fee-preview | docs/decisions/00079-70.md | holds | Mounted at server/routes/payments.routes.ts:2707. |
| route PATCH /api/short-links/:id | docs/decisions/00079-70.md | holds | Mounted at server/routes/short-links.routes.ts:191. |
| route POST /api/bookings/:id/dispute | docs/decisions/00079-70.md | holds | Mounted at server/routes/bookings.ts:859. |
| guard fee-resolution-authority (71) | docs/decisions/00080-71.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| route /api/cart | docs/decisions/00080-71.md | holds | Mounted (DELETE/GET/POST). |
| route GET /api/trips/:tripId/commission | docs/decisions/00080-71.md | holds | Mounted at server/routes/booking-actions.ts:1882. |
| route POST /api/expert-booking-requests | docs/decisions/00080-71.md | holds | Mounted at server/routes.ts:2052. |
| guard check-money-endpoints (72) | docs/decisions/00081-72.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| guard omit-schema-ratchet (72) | docs/decisions/00081-72.md | holds | File is scripts/check-omit-schema-ratchet.cjs. Ledger lint reports the guard wired. |
| guard phase2-fee-gate (72) | docs/decisions/00081-72.md | holds | File is scripts/phase2-fee-gate.sh. Ledger lint reports the guard wired. |
| route GET /api/admin/bookings/balance-overdue | docs/decisions/00081-72.md | holds | Mounted at server/routes/admin.routes.ts:540. |
| route POST /api/bookings/:id/pay-balance | docs/decisions/00081-72.md | holds | Mounted at server/routes/payments.routes.ts:2478. |
| file:line deposit.service.ts:94 | docs/decisions/00082-74.md | drifted | changeCutoffHours is not on the cited lines. It is at server/services/deposit.service.ts:96. |
| file:line services.tsx:1224 | docs/decisions/00082-74.md | drifted | PostingOpportunitiesCard is not in client/src/pages/provider/services.tsx. Cited line now reads: // Gap #18: archived is terminal — the server refuses every PATCH on an archived row, so the |
| file:line storefront.tsx:141 | docs/decisions/00082-74.md | holds | No code symbol was named beside the citation. Line client/src/pages/storefront.tsx:141 reads: gemsSharedCount?: number; |
| guard advisory (75) | docs/decisions/00083-75.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/provider/services | docs/decisions/00083-75.md | holds | Mounted at server/routes.ts:3256. |
| guard advisory (76) | docs/decisions/00084-76.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider-status | docs/decisions/00084-76.md | holds | Client Route or Redirect matches /provider-status. |
| route /provider/distribute | docs/decisions/00084-76.md | holds | Client Route or Redirect matches /provider/distribute. |
| route GET /api/provider/services | docs/decisions/00084-76.md | holds | Mounted at server/routes.ts:3256. |
| route GET /api/provider/services/:id/publish-readiness | docs/decisions/00084-76.md | holds | Mounted at server/routes.ts:3398. |
| guard advisory (77) | docs/decisions/00085-77.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me/link-analytics | docs/decisions/00085-77.md | holds | Mounted (GET). |
| route /api/promo-text | docs/decisions/00085-77.md | holds | Mounted (GET). |
| route /api/share-image/service/:id.png | docs/decisions/00085-77.md | holds | Mounted (GET). |
| route /provider/distribute | docs/decisions/00085-77.md | holds | Client Route or Redirect matches /provider/distribute. |
| route POST /api/short-links | docs/decisions/00085-77.md | holds | Mounted at server/routes/short-links.routes.ts:85. |
| guard advisory (78) | docs/decisions/00086-78.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/provider/services | docs/decisions/00086-78.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route PATCH /api/provider/services/:id | docs/decisions/00086-78.md | holds | Mounted at server/routes.ts:4492. |
| guard advisory (73) | docs/decisions/00087-73.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00087-73.md | holds | Client Route or Redirect matches /services/:p. |
| route GET /api/services/:id | docs/decisions/00087-73.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| guard advisory (R-A) | docs/decisions/00088-R-A.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-B) | docs/decisions/00089-R-B.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips | docs/decisions/00089-R-B.md | holds | Mounted at server/routes.ts:1456. |
| guard advisory (R-C) | docs/decisions/00090-R-C.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-D) | docs/decisions/00091-R-D.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-E) | docs/decisions/00092-R-E.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-F) | docs/decisions/00093-R-F.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-G) | docs/decisions/00094-R-G.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-H) | docs/decisions/00095-R-H.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-I) | docs/decisions/00096-R-I.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (R-J) | docs/decisions/00097-R-J.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (79) | docs/decisions/00098-79.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/provider/services/:id | docs/decisions/00098-79.md | holds | Mounted at server/routes.ts:4492. |
| guard advisory (80) | docs/decisions/00099-80.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (82) | docs/decisions/00101-82.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/cart | docs/decisions/00101-82.md | holds | Mounted (DELETE/GET/POST). |
| route /api/cart/fee-preview | docs/decisions/00101-82.md | holds | Mounted (GET). |
| route /api/checkout | docs/decisions/00101-82.md | holds | Mounted (POST). |
| route /api/services/:id | docs/decisions/00101-82.md | holds | Mounted (GET). |
| route PATCH /api/cart/:id | docs/decisions/00101-82.md | holds | Mounted at server/routes.ts:10088. |
| route POST /api/checkout | docs/decisions/00101-82.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route POST /api/geocode | docs/decisions/00101-82.md | holds | Mounted at server/routes/content.routes.ts:4473. |
| guard advisory (83) | docs/decisions/00102-83.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/bookings/process-cart | docs/decisions/00102-83.md | holds | Mounted (POST). |
| route /api/checkout | docs/decisions/00102-83.md | holds | Mounted (POST). |
| route PATCH /api/cart/:id | docs/decisions/00102-83.md | holds | Mounted at server/routes.ts:10088. |
| route POST /api/checkout | docs/decisions/00102-83.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| guard advisory (84) | docs/decisions/00103-84.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/provider/market-insights | docs/decisions/00103-84.md | holds | Mounted at server/routes.ts:3296. |
| route POST /api/track/search | docs/decisions/00103-84.md | holds | Mounted at server/routes/content.routes.ts:9553. |
| guard advisory (85) | docs/decisions/00104-85.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/provider-application | docs/decisions/00104-85.md | holds | Mounted at server/routes.ts:2982. |
| route PATCH /api/provider/services | docs/decisions/00104-85.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route POST /api/geocode | docs/decisions/00104-85.md | holds | Mounted at server/routes/content.routes.ts:4473. |
| guard advisory (86) | docs/decisions/00105-86.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (87) | docs/decisions/00106-87.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/admin/seed-categories | docs/decisions/00106-87.md | holds | Mounted (POST). |
| guard advisory (88) | docs/decisions/00107-88.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/services/:id/edit | docs/decisions/00107-88.md | holds | Client Route or Redirect matches /provider/services/:p/edit. |
| route GET /api/provider/services/:id | docs/decisions/00107-88.md | holds | Mounted at server/routes.ts:3345. |
| route PATCH /api/provider/properties/:id | docs/decisions/00107-88.md | holds | Mounted at server/routes/provider.routes.ts:731. |
| route PATCH /api/provider/rooms/:id | docs/decisions/00107-88.md | holds | Mounted at server/routes/provider.routes.ts:884. |
| guard advisory (89) | docs/decisions/00108-89.md | holds | Row is marked advisory; it names no CI guard. |
| route /chat | docs/decisions/00108-89.md | holds | Client Route or Redirect matches /chat. |
| route /provider/services | docs/decisions/00108-89.md | holds | Client Route or Redirect matches /provider/services. |
| guard advisory (90) | docs/decisions/00109-90.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/experts/:id | docs/decisions/00109-90.md | holds | Mounted (GET). |
| route /chat | docs/decisions/00109-90.md | holds | Client Route or Redirect matches /chat. |
| route GET /api/me/earnings-by-source | docs/decisions/00109-90.md | holds | Mounted at server/routes/short-links.routes.ts:470. |
| route GET /api/me/link-analytics | docs/decisions/00109-90.md | holds | Mounted at server/routes/short-links.routes.ts:308. |
| route GET /api/notifications/unread-count | docs/decisions/00109-90.md | holds | Mounted at server/routes/content.routes.ts:3318. |
| route GET /api/provider/analytics/dashboard | docs/decisions/00109-90.md | holds | Mounted at server/routes.ts:9327. |
| route GET /api/provider/earnings/summary | docs/decisions/00109-90.md | holds | Mounted at server/routes/experts.routes.ts:193. |
| route GET /api/providers/:userId/public-verification | docs/decisions/00109-90.md | holds | Mounted at server/routes.ts:6552. |
| route POST /api/checkout | docs/decisions/00109-90.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route POST /api/payouts/request | docs/decisions/00109-90.md | holds | Mounted at server/routes/payments.routes.ts:3225. |
| guard advisory (91) | docs/decisions/00110-91.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/workstation | docs/decisions/00110-91.md | holds | Client Route or Redirect matches /provider/workstation. |
| guard advisory (92) | docs/decisions/00111-92.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (93) | docs/decisions/00112-93.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/services | docs/decisions/00112-93.md | holds | Client Route or Redirect matches /provider/services. |
| route PATCH /api/provider/services | docs/decisions/00112-93.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route PUT /api/provider/services/:id/route-points | docs/decisions/00112-93.md | holds | Mounted at server/routes.ts:3517. |
| guard advisory (94) | docs/decisions/00113-94.md | holds | Row is marked advisory; it names no CI guard. |
| route /expert/services/new | docs/decisions/00113-94.md | holds | Client Route or Redirect matches /expert/services/new. |
| route /provider/services/new | docs/decisions/00113-94.md | holds | Client Route or Redirect matches /provider/services/new. |
| route /provider/workstation | docs/decisions/00113-94.md | holds | Client Route or Redirect matches /provider/workstation. |
| guard advisory (95) | docs/decisions/00114-95.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/expert/bookings | docs/decisions/00114-95.md | holds | Mounted at server/routes.ts:6768. |
| route GET /api/provider/bookings | docs/decisions/00114-95.md | holds | Mounted at server/routes.ts:6803. |
| file:line stripe-payment.service.ts:1012-1019 | docs/decisions/00115-96.md | holds | No code symbol was named beside the citation. Line server/services/stripe-payment.service.ts:1012-1019 reads: `); |
| guard advisory (96) | docs/decisions/00115-96.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/provider | docs/decisions/00115-96.md | holds | Routes are still mounted under this prefix (for example PATCH /api/provider/availability/:id). |
| route POST /api/bookings/:id/cancel | docs/decisions/00115-96.md | holds | Mounted at server/routes.ts:8612. |
| guard advisory (97) | docs/decisions/00116-97.md | holds | Row is marked advisory; it names no CI guard. |
| route /expert/services | docs/decisions/00116-97.md | holds | Client Route or Redirect matches /expert/services. |
| route /provider/services/:id/edit | docs/decisions/00116-97.md | holds | Client Route or Redirect matches /provider/services/:p/edit. |
| route /provider/services/new | docs/decisions/00116-97.md | holds | Client Route or Redirect matches /provider/services/new. |
| route GET /api/me/services/:id/slots | docs/decisions/00116-97.md | holds | Mounted at server/routes/expert-console.routes.ts:235. |
| guard advisory (98) | docs/decisions/00117-98.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/distribute | docs/decisions/00117-98.md | holds | Client Route or Redirect matches /provider/distribute. |
| guard advisory (99) | docs/decisions/00118-99.md | holds | Row is marked advisory; it names no CI guard. |
| route /login | docs/decisions/00118-99.md | holds | Client Route or Redirect matches /login. |
| route PATCH /api/provider/services/:id | docs/decisions/00118-99.md | holds | Mounted at server/routes.ts:4492. |
| file:line provider.routes.ts:214-247 | docs/decisions/00119-100.md | holds | No code symbol was named beside the citation. Line server/routes/provider.routes.ts:214-247 reads: * a bundle (bundles stay flat — no bundles-of-bundles). Responds 400 and returns null |
| file:line shared/schema.ts:963-969 | docs/decisions/00119-100.md | drifted | bundle_components is not on the cited lines. It is at shared/schema.ts:1682. |
| guard advisory (100) | docs/decisions/00119-100.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00119-100.md | holds | Client Route or Redirect matches /services/:p. |
| route GET /api/services/:id | docs/decisions/00119-100.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| guard advisory (101) | docs/decisions/00120-101.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/services | docs/decisions/00120-101.md | holds | Mounted at server/routes/content.routes.ts:2971. |
| route GET /api/services/:id | docs/decisions/00120-101.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| guard advisory (102) | docs/decisions/00121-102.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (103) | docs/decisions/00122-103.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (104) | docs/decisions/00123-104.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/provider/services | docs/decisions/00123-104.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route POST /api/provider/properties | docs/decisions/00123-104.md | holds | Mounted at server/routes/provider.routes.ts:580. |
| guard advisory (105) | docs/decisions/00124-105.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/discover | docs/decisions/00124-105.md | holds | Mounted (GET). |
| route GET /api/discover | docs/decisions/00124-105.md | holds | Mounted at server/routes/content.routes.ts:2989. |
| route GET /api/service-bookings | docs/decisions/00124-105.md | holds | Mounted at server/routes.ts:6921. |
| guard advisory (106) | docs/decisions/00125-106.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (107) | docs/decisions/00126-107.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (108) | docs/decisions/00127-108.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/vendor-availability/:serviceId | docs/decisions/00127-108.md | holds | Mounted (GET). |
| route GET /api/cart | docs/decisions/00127-108.md | holds | Mounted at server/routes.ts:9468. |
| route GET /api/cart/fee-preview | docs/decisions/00127-108.md | holds | Mounted at server/routes/payments.routes.ts:2707. |
| route GET /api/services/:id/stay-availability | docs/decisions/00127-108.md | holds | Mounted at server/routes/content.routes.ts:2904. |
| guard advisory (109) | docs/decisions/00128-109.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (110) | docs/decisions/00129-110.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (111) | docs/decisions/00130-111.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/services/new | docs/decisions/00130-111.md | holds | Client Route or Redirect matches /provider/services/new. |
| guard advisory (112) | docs/decisions/00131-112.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (113) | docs/decisions/00132-113.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (114) | docs/decisions/00133-114.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (115) | docs/decisions/00134-115.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (116) | docs/decisions/00135-116.md | holds | Row is marked advisory; it names no CI guard. |
| route /itinerary-view/:token | docs/decisions/00135-116.md | holds | Client Route or Redirect matches /itinerary-view/:p. |
| route /p/:handle | docs/decisions/00135-116.md | holds | Client Route or Redirect matches /p/:p. |
| route /ready-made/:id | docs/decisions/00135-116.md | holds | Client Route or Redirect matches /ready-made/:p. |
| route /services/:id | docs/decisions/00135-116.md | holds | Client Route or Redirect matches /services/:p. |
| route /trips/shared/:token | docs/decisions/00135-116.md | holds | Client Route or Redirect matches /trips/shared/:p. |
| guard advisory (117) | docs/decisions/00136-117.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (118) | docs/decisions/00137-118.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/revenue-splits | docs/decisions/00137-118.md | holds | Mounted at server/routes/payments.routes.ts:296. |
| guard advisory (119) | docs/decisions/00138-119.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (120) | docs/decisions/00139-120.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (121) | docs/decisions/00140-121.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (122) | docs/decisions/00141-122.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/services/:id | docs/decisions/00141-122.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| guard check-decision-guards (2026-08-16-ledger-ids) | docs/decisions/00142-2026-08-16-ledger-ids.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-08-16-console-sweep) | docs/decisions/00143-2026-08-16-console-sweep.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-16-bring-access) | docs/decisions/00144-2026-08-16-bring-access.md | holds | Row is marked advisory; it names no CI guard. |
| file:line provider/services.tsx:688 | docs/decisions/00145-2026-08-16-render-or-rule.md | holds | No code symbol was named beside the citation. Line client/src/pages/provider/services.tsx:688 reads: <div className="flex items-center gap-2 flex-wrap"> |
| guard advisory (2026-08-16-render-or-rule) | docs/decisions/00145-2026-08-16-render-or-rule.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-16-console-conformance-fixes) | docs/decisions/00146-2026-08-16-console-conformance-fixes.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-17-partner-demand-phase2-rulings) | docs/decisions/00147-2026-08-17-partner-demand-phase2-rulings.md | holds | Row is marked advisory; it names no CI guard. |
| file:line routing.routes.ts:223 | docs/decisions/00148-2026-08-17-partner-demand-r15-transition-log.md | drifted | logItemTransition is not on the cited lines. It is at server/routes/routing.routes.ts:383. |
| guard advisory (2026-08-17-partner-demand-r15-transition-log) | docs/decisions/00148-2026-08-17-partner-demand-r15-transition-log.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-17-partner-demand-2c-sunset) | docs/decisions/00149-2026-08-17-partner-demand-2c-sunset.md | holds | Row is marked advisory; it names no CI guard. |
| file:line booking-actions.ts:268 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:268 reads: console.error('[expert-requests] revenue record failed (non-fatal):', revErr); |
| file:line item-routing.service.ts:62 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | holds | No code symbol was named beside the citation. Line server/services/item-routing.service.ts:62 reads: .set({ routingStatus: "purchased", bookingId, updatedAt: new Date() }) |
| file:line routing.routes.ts:212 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | holds | No code symbol was named beside the citation. Line server/routes/routing.routes.ts:212 reads: // ── Idempotent no-op: already in the requested state. Not a transition, so no edge is |
| file:line schema.ts:6817 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | feeLedger is not on the cited lines. It is at shared/schema.ts:9245. |
| file:line schema.ts:7093 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | provider_availability is not in shared/schema.ts. Cited line now reads: metadata: jsonb("metadata"), |
| file:line storage.ts:3025 | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | drifted | providerServices is not on the cited lines. It is at server/storage.ts:2449. |
| guard advisory (2026-08-17-partner-demand-phase0-rulings) | docs/decisions/00150-2026-08-17-partner-demand-phase0-rulings.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-17-delete-archive) | docs/decisions/00151-2026-08-17-delete-archive.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/checkout | docs/decisions/00151-2026-08-17-delete-archive.md | holds | Mounted (POST). |
| route DELETE /api/provider/services/:id | docs/decisions/00151-2026-08-17-delete-archive.md | holds | Mounted at server/routes.ts:5009. |
| route POST /api/provider/services/:id/archive | docs/decisions/00151-2026-08-17-delete-archive.md | holds | Mounted at server/routes.ts:5039. |
| guard advisory (2026-08-17-photos-rail) | docs/decisions/00152-2026-08-17-photos-rail.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/services/:id/cover-image | docs/decisions/00152-2026-08-17-photos-rail.md | holds | Mounted at server/routes.ts:7176. |
| route POST /api/provider/services/:id/cover-photo | docs/decisions/00152-2026-08-17-photos-rail.md | holds | Mounted at server/routes.ts:7084. |
| guard advisory (2026-08-17-create-flow-mock-fidelity) | docs/decisions/00153-2026-08-17-create-flow-mock-fidelity.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/services/new | docs/decisions/00153-2026-08-17-create-flow-mock-fidelity.md | holds | Client Route or Redirect matches /provider/services/new. |
| guard advisory (2026-08-17-capacity-seating-logistics) | docs/decisions/00154-2026-08-17-capacity-seating-logistics.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-17-catalog-preview-upgrade) | docs/decisions/00155-2026-08-17-catalog-preview-upgrade.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-17-create-service-spec-doa) | docs/decisions/00156-2026-08-17-create-service-spec-doa.md | holds | Row is marked advisory; it names no CI guard. |
| route /provider/services/:id/edit | docs/decisions/00156-2026-08-17-create-service-spec-doa.md | holds | Client Route or Redirect matches /provider/services/:p/edit. |
| guard advisory (2026-08-18-partner-demand-2b) | docs/decisions/00157-2026-08-18-partner-demand-2b.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-18-partner-demand-phase3) | docs/decisions/00158-2026-08-18-partner-demand-phase3.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-18-partner-demand-grain) | docs/decisions/00159-2026-08-18-partner-demand-grain.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/provider/market-insights | docs/decisions/00159-2026-08-18-partner-demand-grain.md | holds | Mounted (GET). |
| guard advisory (2026-08-18-partner-demand-floor-scope) | docs/decisions/00160-2026-08-18-partner-demand-floor-scope.md | holds | Row is marked advisory; it names no CI guard. |
| file:line itinerary-optimizer.ts:167 | docs/decisions/00161-2026-08-18-partner-demand-coords-fix.md | holds | No code symbol was named beside the citation. Line server/itinerary-optimizer.ts:167 reads: price?: number; |
| file:line itinerary-optimizer.ts:947 | docs/decisions/00161-2026-08-18-partner-demand-coords-fix.md | holds | No code symbol was named beside the citation. Line server/itinerary-optimizer.ts:947 reads: IMPORTANT: These are fixed commitments (flights, reservations, ceremonies). You MUST NOT place activities during anchor times or their buffe |
| guard advisory (2026-08-18-partner-demand-coords-fix) | docs/decisions/00161-2026-08-18-partner-demand-coords-fix.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-18-supersession-stamp) | docs/decisions/00162-2026-08-18-supersession-stamp.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-19-partner-demand-phase3-complete) | docs/decisions/00163-2026-08-19-partner-demand-phase3-complete.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-floor-class) | docs/decisions/00164-2026-08-20-partner-demand-floor-class.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-floor) | docs/decisions/00165-2026-08-20-partner-demand-onepager-floor.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-variant) | docs/decisions/00166-2026-08-20-partner-demand-onepager-variant.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-lifecycle) | docs/decisions/00167-2026-08-20-partner-demand-onepager-lifecycle.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-fraunces) | docs/decisions/00168-2026-08-20-partner-demand-onepager-fraunces.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-spotlight) | docs/decisions/00169-2026-08-20-partner-demand-onepager-spotlight.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-trend-lock) | docs/decisions/00170-2026-08-20-partner-demand-onepager-trend-lock.md | holds | Row is marked advisory; it names no CI guard. |
| file:line market-insights.service.ts:187 | docs/decisions/00171-2026-08-20-partner-demand-onepager-gap-pairing.md | drifted | resolveCoverageGaps is not on the cited lines. It is at server/services/market-insights.service.ts:123. |
| guard advisory (2026-08-20-partner-demand-onepager-gap-pairing) | docs/decisions/00171-2026-08-20-partner-demand-onepager-gap-pairing.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-context-map) | docs/decisions/00172-2026-08-20-partner-demand-onepager-context-map.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-map-position) | docs/decisions/00173-2026-08-20-partner-demand-onepager-map-position.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-admin-control) | docs/decisions/00174-2026-08-20-partner-demand-onepager-admin-control.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/demand/onepager | docs/decisions/00174-2026-08-20-partner-demand-onepager-admin-control.md | holds | Mounted at server/routes/demand.routes.ts:829. |
| route POST /api/admin/demand-one-pager | docs/decisions/00174-2026-08-20-partner-demand-onepager-admin-control.md | gone | No mounted POST /api/admin/demand-one-pager. |
| file:line shared/schema.ts:7806 | docs/decisions/00175-2026-08-21-trailhead-crosswalk.md | holds | No code symbol was named beside the citation. Line shared/schema.ts:7806 reads: id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()), |
| guard advisory (2026-08-21-trailhead-crosswalk) | docs/decisions/00175-2026-08-21-trailhead-crosswalk.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-kyoto-alone) | docs/decisions/00176-2026-08-21-trailhead-kyoto-alone.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-tavily-cap) | docs/decisions/00177-2026-08-21-trailhead-tavily-cap.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-seven-market-split) | docs/decisions/00178-2026-08-21-trailhead-seven-market-split.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t4-readpath) | docs/decisions/00179-2026-08-21-trailhead-t4-readpath.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-generate-tool) | docs/decisions/00180-2026-08-20-partner-demand-onepager-generate-tool.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-r38-provenance) | docs/decisions/00181-2026-08-20-partner-demand-r38-provenance.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-20-partner-demand-onepager-4-4b) | docs/decisions/00182-2026-08-20-partner-demand-onepager-4-4b.md | holds | Row is marked advisory; it names no CI guard. |
| file:line shared/schema.ts:7903 | docs/decisions/00183-2026-08-21-trailhead-t4-storefront.md | drifted | inventory_class is not on the cited lines. It is at shared/schema.ts:10784. |
| guard advisory (2026-08-21-trailhead-t4-storefront) | docs/decisions/00183-2026-08-21-trailhead-t4-storefront.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/admin/dmo/publish | docs/decisions/00183-2026-08-21-trailhead-t4-storefront.md | holds | Live path is POST /api/admin/dmo/publish/:id at server/routes/admin.routes.ts:2823. |
| route POST /api/affiliates/track | docs/decisions/00183-2026-08-21-trailhead-t4-storefront.md | holds | Mounted at server/routes/content.routes.ts:9383. |
| guard advisory (2026-08-21-trailhead-t2-ignition) | docs/decisions/00184-2026-08-21-trailhead-t2-ignition.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-rung-order) | docs/decisions/00185-2026-08-21-trailhead-t3-rung-order.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-high-confidence-match) | docs/decisions/00186-2026-08-21-trailhead-t3-high-confidence-match.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-rerunnable-pass) | docs/decisions/00187-2026-08-21-trailhead-t3-rerunnable-pass.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-official-channel) | docs/decisions/00188-2026-08-21-trailhead-t3-official-channel.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-first-pass-hardstop) | docs/decisions/00189-2026-08-21-trailhead-t3-first-pass-hardstop.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-21-trailhead-t3-waterfall) | docs/decisions/00190-2026-08-21-trailhead-t3-waterfall.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:ref | docs/decisions/00190-2026-08-21-trailhead-t3-waterfall.md | holds | Client Route or Redirect matches /services/:p. |
| route POST /api/admin/dmo/resolve | docs/decisions/00190-2026-08-21-trailhead-t3-waterfall.md | holds | Mounted at server/routes/admin.routes.ts:2922. |
| guard check-ledger-union-merge (2026-08-21-trailhead-ci-meta-guards) | docs/decisions/00191-2026-08-21-trailhead-ci-meta-guards.md | holds | File is scripts/check-ledger-union-merge.cjs. Ledger lint reports the guard wired. |
| guard check-replit-pending-label (2026-08-21-trailhead-ci-meta-guards) | docs/decisions/00191-2026-08-21-trailhead-ci-meta-guards.md | holds | File is scripts/check-replit-pending-label.cjs. Ledger lint reports the guard wired. |
| guard check-spec-arming (2026-08-21-trailhead-ci-meta-guards) | docs/decisions/00191-2026-08-21-trailhead-ci-meta-guards.md | holds | File is scripts/check-spec-arming.cjs. Ledger lint reports the guard wired. |
| file:line demand-onepager.service.ts:87 | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | No code symbol was named beside the citation. Line server/services/demand-onepager.service.ts:87 reads: const rows = await db |
| file:line itinerary-optimizer.ts:592 | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | No code symbol was named beside the citation. Line server/itinerary-optimizer.ts:592 reads: individual_with_discount: "Individual payments with group discounts — highlight group savings", |
| file:line location-view.service.ts:562 | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | No code symbol was named beside the citation. Line server/services/location-view.service.ts:562 reads: // SH-1 item 12: a test account's listings are never public. |
| file:line seed-travelpulse.ts:119 | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | No code symbol was named beside the citation. Line server/seed-travelpulse.ts:119 reads: if (existing.length === 0) { |
| file:line travelpulse.service.ts:411 | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | No code symbol was named beside the citation. Line server/services/travelpulse.service.ts:411 reads: visibleGemCondition(), |
| guard advisory (2026-08-21-travelpulse-event-ingest) | docs/decisions/00192-2026-08-21-travelpulse-event-ingest.md | holds | Row is marked advisory; it names no CI guard. |
| file:line check-demand-rollup.cjs:44-49 | docs/decisions/00193-2026-08-21-benchmark-revenue-denorm.md | holds | No code symbol was named beside the citation. Line scripts/check-demand-rollup.cjs:44-49 reads: // a MIXED legacy file — the two 2B endpoints added there only CALL the service functions (they never |
| file:line stripeReconciliation.ts:97 | docs/decisions/00193-2026-08-21-benchmark-revenue-denorm.md | holds | No code symbol was named beside the citation. Line server/jobs/stripeReconciliation.ts:97 reads: * ledger 2026-09-08-cart-fee-line). `POST /api/checkout` charges price + travel surcharge (both in |
| guard advisory (2026-08-21-benchmark-revenue-denorm) | docs/decisions/00193-2026-08-21-benchmark-revenue-denorm.md | holds | Row is marked advisory; it names no CI guard. |
| file:line content-query.service.ts:807 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | No code symbol was named beside the citation. Line server/services/content-query.service.ts:807 reads: * origin rows are HARD-EXCLUDED, exactly like the traveler resolver, so DMO content never |
| file:line content.routes.ts:2636 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | drifted | destination_search_patterns is not in server/routes/content.routes.ts. Cited line now reads: .innerJoin(cityNeighborhoods, eq(providerNeighborhoodCoverage.neighborhoodId, cityNeighborhoods.id)) |
| file:line discover.tsx:563 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | No code symbol was named beside the citation. Line client/src/pages/discover.tsx:563 reads: <div |
| file:line shared/schema.ts:6222 | docs/decisions/00194-2026-08-21-search-writepath-dark.md | drifted | search_analytics is not on the cited lines. It is at shared/schema.ts:8606. |
| guard advisory (2026-08-21-search-writepath-dark) | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/analytics/search-event | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | Mounted (POST). |
| route /api/track/destination-search | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | Mounted (POST). |
| route /api/track/search | docs/decisions/00194-2026-08-21-search-writepath-dark.md | holds | Mounted (POST). |
| guard advisory (2026-08-22-nav-storefront-readymade) | docs/decisions/00195-2026-08-22-nav-storefront-readymade.md | holds | Row is marked advisory; it names no CI guard. |
| route /p/:handle | docs/decisions/00195-2026-08-22-nav-storefront-readymade.md | holds | Client Route or Redirect matches /p/:p. |
| route GET /api/ready-made | docs/decisions/00195-2026-08-22-nav-storefront-readymade.md | holds | Mounted at server/routes/ready-made.routes.ts:1073. |
| guard advisory (2026-08-22-concierge-naming) | docs/decisions/00196-2026-08-22-concierge-naming.md | holds | Row is marked advisory; it names no CI guard. |
| route /concierge | docs/decisions/00196-2026-08-22-concierge-naming.md | holds | Client Route or Redirect matches /concierge. |
| route POST /api/concierge/escalations | docs/decisions/00196-2026-08-22-concierge-naming.md | holds | Mounted at server/routes/concierge.routes.ts:536. |
| file:line chat.tsx:740-751 | docs/decisions/00197-2026-08-22-ai-console-frame.md | holds | No code symbol was named beside the citation. Line client/src/pages/chat.tsx:740-751 reads: title: isBlocked ? "Message not delivered" : "Message failed", |
| guard advisory (2026-08-22-ai-console-frame) | docs/decisions/00197-2026-08-22-ai-console-frame.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-slip-optimize-bulk) | docs/decisions/00198-2026-08-22-slip-optimize-bulk.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/cart | docs/decisions/00198-2026-08-22-slip-optimize-bulk.md | holds | Mounted (DELETE/GET/POST). |
| route /api/checkout | docs/decisions/00198-2026-08-22-slip-optimize-bulk.md | holds | Mounted (POST). |
| file:line itinerary-optimizer.ts:967-1058 | docs/decisions/00199-2026-08-22-slip-optimize-review-first.md | drifted | travel_time is not on the cited lines. It is at server/itinerary-optimizer.ts:1829. |
| guard advisory (2026-08-22-slip-optimize-review-first) | docs/decisions/00199-2026-08-22-slip-optimize-review-first.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/travelpulse/trending/:city | docs/decisions/00199-2026-08-22-slip-optimize-review-first.md | holds | Mounted (GET). |
| route /plans/:tripId | docs/decisions/00199-2026-08-22-slip-optimize-review-first.md | holds | Client Route or Redirect matches /plans/:p. |
| guard advisory (2026-08-22-ai-slip-defects) | docs/decisions/00200-2026-08-22-ai-slip-defects.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/content/discover | docs/decisions/00200-2026-08-22-ai-slip-defects.md | holds | Mounted (GET). |
| route /api/generated-itineraries | docs/decisions/00200-2026-08-22-ai-slip-defects.md | holds | Mounted (POST). |
| route /api/trips | docs/decisions/00200-2026-08-22-ai-slip-defects.md | holds | Mounted (GET/POST). |
| route POST /api/ai/itineraries/:id/save-as-trip | docs/decisions/00200-2026-08-22-ai-slip-defects.md | holds | Mounted at server/routes/content.routes.ts:5380. |
| guard advisory (2026-08-22-first-run-prefs) | docs/decisions/00201-2026-08-22-first-run-prefs.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-booking-price-provenance) | docs/decisions/00202-2026-08-22-booking-price-provenance.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-slip-review-copy) | docs/decisions/00203-2026-08-22-slip-review-copy.md | holds | Row is marked advisory; it names no CI guard. |
| route /generate | docs/decisions/00203-2026-08-22-slip-review-copy.md | gone | No client Route or Redirect matches /generate. |
| route /plans/:tripId | docs/decisions/00203-2026-08-22-slip-review-copy.md | holds | Client Route or Redirect matches /plans/:p. |
| guard advisory (2026-08-22-optimizer-catalog-honesty) | docs/decisions/00204-2026-08-22-optimizer-catalog-honesty.md | holds | Row is marked advisory; it names no CI guard. |
| file:line service-location-map.tsx:560 | docs/decisions/00205-2026-08-22-spec-family-map-authoring-migration.md | holds | No code symbol was named beside the citation. Line client/src/components/service-location-map.tsx:560 reads: position={[s.lat, s.lng]} |
| guard advisory (2026-08-22-spec-family-map-authoring-migration) | docs/decisions/00205-2026-08-22-spec-family-map-authoring-migration.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-ready-made-themes) | docs/decisions/00206-2026-08-22-ready-made-themes.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/ready-made | docs/decisions/00206-2026-08-22-ready-made-themes.md | holds | Mounted at server/routes/ready-made.routes.ts:1073. |
| guard advisory (2026-08-22-storefront-nav) | docs/decisions/00207-2026-08-22-storefront-nav.md | holds | Row is marked advisory; it names no CI guard. |
| route /p/:handle | docs/decisions/00207-2026-08-22-storefront-nav.md | holds | Client Route or Redirect matches /p/:p. |
| guard advisory (2026-08-22-post-purchase-hardening) | docs/decisions/00208-2026-08-22-post-purchase-hardening.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-expert-minted-themes) | docs/decisions/00209-2026-08-22-expert-minted-themes.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/ready-made | docs/decisions/00209-2026-08-22-expert-minted-themes.md | holds | Mounted at server/routes/ready-made.routes.ts:1073. |
| guard advisory (2026-08-22-readymade-slip-delivery) | docs/decisions/00210-2026-08-22-readymade-slip-delivery.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/trips/:id/plancard | docs/decisions/00210-2026-08-22-readymade-slip-delivery.md | holds | Mounted (GET). |
| route /plans/:id | docs/decisions/00210-2026-08-22-readymade-slip-delivery.md | holds | Client Route or Redirect matches /plans/:p. |
| route /plans/:tripId | docs/decisions/00210-2026-08-22-readymade-slip-delivery.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00210-2026-08-22-readymade-slip-delivery.md | holds | Client Route or Redirect matches /trip/:p. |
| guard advisory (2026-08-22-concierge-revision) | docs/decisions/00211-2026-08-22-concierge-revision.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:id | docs/decisions/00211-2026-08-22-concierge-revision.md | holds | Client Route or Redirect matches /plans/:p. |
| route GET /api/ready-made/purchases/by-clone/:tripId | docs/decisions/00211-2026-08-22-concierge-revision.md | holds | Mounted at server/routes/ready-made.routes.ts:1649. |
| route POST /api/ready-made/purchases/:id/request-revision | docs/decisions/00211-2026-08-22-concierge-revision.md | holds | Mounted at server/routes/ready-made.routes.ts:1729. |
| guard advisory (2026-08-22-handle-claim-nudge) | docs/decisions/00212-2026-08-22-handle-claim-nudge.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me/business-setup | docs/decisions/00212-2026-08-22-handle-claim-nudge.md | holds | Mounted (GET). |
| route /expert/today | docs/decisions/00212-2026-08-22-handle-claim-nudge.md | holds | Client Route or Redirect matches /expert/today. |
| file:line booking-actions.ts:698 | docs/decisions/00213-2026-08-22-concierge-revision-p2.md | drifted | getExpertAssignedTrips is not on the cited lines. It is at server/routes/booking-actions.ts:904. |
| file:line experts.routes.ts:619 | docs/decisions/00213-2026-08-22-concierge-revision-p2.md | drifted | getExpertAssignedTrips is not in server/routes/experts.routes.ts. Cited line now reads: |
| guard advisory (2026-08-22-concierge-revision-p2) | docs/decisions/00213-2026-08-22-concierge-revision-p2.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-22-slip-map-view) | docs/decisions/00214-2026-08-22-slip-map-view.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:tripId | docs/decisions/00214-2026-08-22-slip-map-view.md | holds | Client Route or Redirect matches /plans/:p. |
| guard advisory (2026-08-22-provenance-defects) | docs/decisions/00215-2026-08-22-provenance-defects.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/expert/selected-services | docs/decisions/00215-2026-08-22-provenance-defects.md | holds | Mounted at server/routes.ts:5962. |
| guard advisory (2026-08-22-concierge-p3) | docs/decisions/00216-2026-08-22-concierge-p3.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/ready-made/disputes | docs/decisions/00216-2026-08-22-concierge-p3.md | holds | Mounted at server/routes/admin.routes.ts:1578. |
| route POST /api/admin/ready-made/disputes/:id/refund | docs/decisions/00216-2026-08-22-concierge-p3.md | holds | Mounted at server/routes/admin.routes.ts:1627. |
| route POST /api/ready-made/purchases/:id/refund | docs/decisions/00216-2026-08-22-concierge-p3.md | gone | No mounted POST /api/ready-made/purchases/:p/refund. |
| guard advisory (2026-08-23-console-preview-state) | docs/decisions/00217-2026-08-23-console-preview-state.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-provenance-creation) | docs/decisions/00218-2026-08-23-provenance-creation.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-deliverables-surfacing) | docs/decisions/00219-2026-08-23-deliverables-surfacing.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/service-bookings | docs/decisions/00219-2026-08-23-deliverables-surfacing.md | holds | Mounted (GET). |
| route /services/:id | docs/decisions/00219-2026-08-23-deliverables-surfacing.md | holds | Client Route or Redirect matches /services/:p. |
| route GET /api/service-bookings/:id/deliverable | docs/decisions/00219-2026-08-23-deliverables-surfacing.md | holds | Mounted at server/routes.ts:7314. |
| route GET /api/service-bookings/:id/deliverable/meta | docs/decisions/00219-2026-08-23-deliverables-surfacing.md | holds | Mounted at server/routes.ts:7406. |
| guard advisory (2026-08-23-provenance-audit-read) | docs/decisions/00220-2026-08-23-provenance-audit-read.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/audit-logs | docs/decisions/00220-2026-08-23-provenance-audit-read.md | holds | Mounted at server/routes/admin.routes.ts:7238. |
| guard advisory (2026-08-23-item2-grounding) | docs/decisions/00221-2026-08-23-item2-grounding.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00221-2026-08-23-item2-grounding.md | holds | Mounted at server/routes.ts:1691. |
| guard advisory (2026-08-23-concierge-q2-softrevoke-fix) | docs/decisions/00222-2026-08-23-concierge-q2-softrevoke-fix.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-item2-affiliate) | docs/decisions/00223-2026-08-23-item2-affiliate.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/affiliate-booking-requests | docs/decisions/00223-2026-08-23-item2-affiliate.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| guard advisory (2026-08-23-item2-affiliate-server) | docs/decisions/00224-2026-08-23-item2-affiliate-server.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/affiliate-booking-requests | docs/decisions/00224-2026-08-23-item2-affiliate-server.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| guard advisory (2026-08-23-item2-affiliate-reconcile) | docs/decisions/00225-2026-08-23-item2-affiliate-reconcile.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-provenance-move2-seeders) | docs/decisions/00226-2026-08-23-provenance-move2-seeders.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-provenance-move3) | docs/decisions/00227-2026-08-23-provenance-move3.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/content/:trackingNumber | docs/decisions/00227-2026-08-23-provenance-move3.md | holds | Mounted at server/routes/admin.routes.ts:4766. |
| guard advisory (2026-08-23-provenance-move4-closed) | docs/decisions/00228-2026-08-23-provenance-move4-closed.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/audit-logs | docs/decisions/00228-2026-08-23-provenance-move4-closed.md | holds | Mounted at server/routes/admin.routes.ts:7238. |
| guard advisory (2026-08-23-optimizer-three-variants) | docs/decisions/00229-2026-08-23-optimizer-three-variants.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-optimizer-anchors) | docs/decisions/00230-2026-08-23-optimizer-anchors.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-23-optimizer-pinned-anchor) | docs/decisions/00231-2026-08-23-optimizer-pinned-anchor.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/itinerary-comparisons/:id/anchor-candidates | docs/decisions/00231-2026-08-23-optimizer-pinned-anchor.md | holds | Mounted at server/routes/trips.routes.ts:844. |
| route POST /api/itinerary-comparisons/:id/generate | docs/decisions/00231-2026-08-23-optimizer-pinned-anchor.md | holds | Mounted at server/routes.ts:10731. |
| guard advisory (2026-08-23-optimizer-pin-liveroute) | docs/decisions/00232-2026-08-23-optimizer-pin-liveroute.md | holds | Row is marked advisory; it names no CI guard. |
| route /generate | docs/decisions/00232-2026-08-23-optimizer-pin-liveroute.md | gone | No client Route or Redirect matches /generate. |
| route POST /api/itinerary-comparisons/:id/generate | docs/decisions/00232-2026-08-23-optimizer-pin-liveroute.md | holds | Mounted at server/routes.ts:10731. |
| guard advisory (2026-08-23-discover-ia-consolidate) | docs/decisions/00233-2026-08-23-discover-ia-consolidate.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover | docs/decisions/00233-2026-08-23-discover-ia-consolidate.md | holds | Client Route or Redirect matches /discover. |
| route /discover-experiences | docs/decisions/00233-2026-08-23-discover-ia-consolidate.md | holds | Client Route or Redirect matches /discover-experiences. |
| route /experiences | docs/decisions/00233-2026-08-23-discover-ia-consolidate.md | holds | Client Route or Redirect matches /experiences. |
| route /experts | docs/decisions/00233-2026-08-23-discover-ia-consolidate.md | holds | Client Route or Redirect matches /experts. |
| guard advisory (2026-08-23-discover-vocabulary) | docs/decisions/00234-2026-08-23-discover-vocabulary.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover | docs/decisions/00234-2026-08-23-discover-vocabulary.md | holds | Client Route or Redirect matches /discover. |
| guard advisory (2026-08-23-marketplace-ungroup) | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Row is marked advisory; it names no CI guard. |
| route /destinations | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /destinations. |
| route /discover | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /discover. |
| route /discover-experiences | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /discover-experiences. |
| route /events | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /events. |
| route /help-me-decide | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /help-me-decide. |
| route /ready-made | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /ready-made. |
| route /services | docs/decisions/00235-2026-08-23-marketplace-ungroup.md | holds | Client Route or Redirect matches /services. |
| guard advisory (113) | docs/decisions/00236-113.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/storefront/:handle | docs/decisions/00236-113.md | holds | Mounted at server/routes/storefront.routes.ts:1258. |
| guard advisory (2026-08-24-service-detail-continuity) | docs/decisions/00237-2026-08-24-service-detail-continuity.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00237-2026-08-24-service-detail-continuity.md | holds | Client Route or Redirect matches /services/:p. |
| guard advisory (2026-08-24-storefront-continuity) | docs/decisions/00238-2026-08-24-storefront-continuity.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/storefront/:handle | docs/decisions/00238-2026-08-24-storefront-continuity.md | holds | Mounted (GET). |
| route /p/:handle | docs/decisions/00238-2026-08-24-storefront-continuity.md | holds | Client Route or Redirect matches /p/:p. |
| guard advisory (2026-08-24-experts-continuity) | docs/decisions/00239-2026-08-24-experts-continuity.md | holds | Row is marked advisory; it names no CI guard. |
| route /experts | docs/decisions/00239-2026-08-24-experts-continuity.md | holds | Client Route or Redirect matches /experts. |
| route /experts/:id | docs/decisions/00239-2026-08-24-experts-continuity.md | holds | Client Route or Redirect matches /experts/:p. |
| guard advisory (2026-08-24-provider-directory) | docs/decisions/00240-2026-08-24-provider-directory.md | holds | Row is marked advisory; it names no CI guard. |
| route /p/:handle | docs/decisions/00240-2026-08-24-provider-directory.md | holds | Client Route or Redirect matches /p/:p. |
| route /providers | docs/decisions/00240-2026-08-24-provider-directory.md | holds | Client Route or Redirect matches /providers. |
| route /services | docs/decisions/00240-2026-08-24-provider-directory.md | holds | Client Route or Redirect matches /services. |
| route GET /api/provider-storefronts | docs/decisions/00240-2026-08-24-provider-directory.md | holds | Mounted at server/routes/storefront.routes.ts:1288. |
| file:line ready-made.routes.ts:51 | docs/decisions/00241-2026-08-24-ready-made-detail-continuity.md | holds | No code symbol was named beside the citation. Line server/routes/ready-made.routes.ts:51 reads: const AUTHOR_ROLES = new Set(["local_expert", "travel_expert", "admin"]); // D3 (Leon, 2026-07-25) |
| guard advisory (2026-08-24-ready-made-detail-continuity) | docs/decisions/00241-2026-08-24-ready-made-detail-continuity.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-24-client-tree-canonical) | docs/decisions/00242-2026-08-24-client-tree-canonical.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-24-hard-stop-commit-observation) | docs/decisions/00244-2026-08-24-hard-stop-commit-observation.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-24-main-force-push-protection) | docs/decisions/00245-2026-08-24-main-force-push-protection.md | holds | Row is marked advisory; it names no CI guard. |
| guard artifact-deploy-guard (2026-08-24-artifact-deploy-override) | docs/decisions/00246-2026-08-24-artifact-deploy-override.md | holds | File is scripts/check-artifact-deploy-guard.cjs. Ledger lint reports the guard wired. |
| route /s/:handle | docs/decisions/00247-2026-08-25-ready-made-approve-gate.md | holds | Client Route or Redirect matches /s/:p. |
| test pin ready-made-completeness-gate.test.ts (2026-08-25-ready-made-approve-gate) | docs/decisions/00247-2026-08-25-ready-made-approve-gate.md | holds | File is server/routes/__tests__/ready-made-completeness-gate.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-08-25-outage-window) | docs/decisions/00248-2026-08-25-outage-window.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-marketplace-earn-grammar) | docs/decisions/00249-2026-08-25-marketplace-earn-grammar.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-nav-icons) | docs/decisions/00250-2026-08-25-nav-icons.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-surface-rail) | docs/decisions/00251-2026-08-25-surface-rail.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-two-field-search) | docs/decisions/00252-2026-08-25-two-field-search.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-card-family) | docs/decisions/00253-2026-08-25-card-family.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-card-source-link) | docs/decisions/00254-2026-08-25-card-source-link.md | holds | Row is marked advisory; it names no CI guard. |
| route /experts/:id | docs/decisions/00254-2026-08-25-card-source-link.md | holds | Client Route or Redirect matches /experts/:p. |
| route /providers | docs/decisions/00254-2026-08-25-card-source-link.md | holds | Client Route or Redirect matches /providers. |
| route /s/:handle | docs/decisions/00254-2026-08-25-card-source-link.md | holds | Client Route or Redirect matches /s/:p. |
| guard advisory (2026-08-25-open-card-skeleton) | docs/decisions/00255-2026-08-25-open-card-skeleton.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-events-as-designed) | docs/decisions/00256-2026-08-25-events-as-designed.md | holds | Row is marked advisory; it names no CI guard. |
| route /events | docs/decisions/00256-2026-08-25-events-as-designed.md | holds | Client Route or Redirect matches /events. |
| guard advisory (2026-08-25-discover-shell-removed) | docs/decisions/00257-2026-08-25-discover-shell-removed.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover | docs/decisions/00257-2026-08-25-discover-shell-removed.md | holds | Client Route or Redirect matches /discover. |
| guard advisory (2026-08-25-discover-transcribe-in-place) | docs/decisions/00258-2026-08-25-discover-transcribe-in-place.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-experts-tabs-three-roles) | docs/decisions/00259-2026-08-25-experts-tabs-three-roles.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-providers-directory-live) | docs/decisions/00260-2026-08-25-providers-directory-live.md | holds | Row is marked advisory; it names no CI guard. |
| route /providers | docs/decisions/00260-2026-08-25-providers-directory-live.md | holds | Client Route or Redirect matches /providers. |
| guard advisory (2026-08-25-citycard-converge) | docs/decisions/00261-2026-08-25-citycard-converge.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-city-feed-bento) | docs/decisions/00262-2026-08-25-city-feed-bento.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover/location/:city | docs/decisions/00262-2026-08-25-city-feed-bento.md | holds | Client Route or Redirect matches /discover/location/:p. |
| guard advisory (2026-08-25-landing-after-marketplace) | docs/decisions/00263-2026-08-25-landing-after-marketplace.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-25-optimizer-pin-on-create) | docs/decisions/00264-2026-08-25-optimizer-pin-on-create.md | holds | Row is marked advisory; it names no CI guard. |
| route /generate | docs/decisions/00264-2026-08-25-optimizer-pin-on-create.md | gone | No client Route or Redirect matches /generate. |
| route POST /api/itinerary-comparisons | docs/decisions/00264-2026-08-25-optimizer-pin-on-create.md | holds | Mounted at server/routes.ts:10334. |
| guard advisory (2026-08-25-adopt-review-board-parity) | docs/decisions/00265-2026-08-25-adopt-review-board-parity.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-26-storefront-role-agnostic) | docs/decisions/00266-2026-08-26-storefront-role-agnostic.md | holds | Row is marked advisory; it names no CI guard. |
| route /p/:handle | docs/decisions/00266-2026-08-26-storefront-role-agnostic.md | holds | Client Route or Redirect matches /p/:p. |
| route /providers/:handle | docs/decisions/00266-2026-08-26-storefront-role-agnostic.md | gone | No client Route or Redirect matches /providers/:p. |
| route /s/:handle | docs/decisions/00266-2026-08-26-storefront-role-agnostic.md | holds | Client Route or Redirect matches /s/:p. |
| guard advisory (2026-08-25-two-modes) | docs/decisions/00267-2026-08-25-two-modes.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-26-ready-made-no-templates) | docs/decisions/00268-2026-08-26-ready-made-no-templates.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert-templates | docs/decisions/00268-2026-08-26-ready-made-no-templates.md | gone | No mounted handler matches /api/expert-templates. |
| route /ready-made | docs/decisions/00268-2026-08-26-ready-made-no-templates.md | holds | Client Route or Redirect matches /ready-made. |
| guard advisory (2026-08-26-variants-are-proposals) | docs/decisions/00269-2026-08-26-variants-are-proposals.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-26-adopt-applies-in-place) | docs/decisions/00270-2026-08-26-adopt-applies-in-place.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/itinerary-comparisons/:id/apply-to-trip | docs/decisions/00270-2026-08-26-adopt-applies-in-place.md | holds | Mounted at server/routes/plancard.routes.ts:120. |
| guard advisory (2026-08-26-per-stop-adopt-deferred) | docs/decisions/00271-2026-08-26-per-stop-adopt-deferred.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-26-city-feed-bento-landed) | docs/decisions/00272-2026-08-26-city-feed-bento-landed.md | holds | Row is marked advisory; it names no CI guard. |
| route /destinations | docs/decisions/00272-2026-08-26-city-feed-bento-landed.md | holds | Client Route or Redirect matches /destinations. |
| route /discover/location/:city | docs/decisions/00272-2026-08-26-city-feed-bento-landed.md | holds | Client Route or Redirect matches /discover/location/:p. |
| guard advisory (2026-08-26-bento-compact-density) | docs/decisions/00273-2026-08-26-bento-compact-density.md | holds | Row is marked advisory; it names no CI guard. |
| route /ready-made | docs/decisions/00273-2026-08-26-bento-compact-density.md | holds | Client Route or Redirect matches /ready-made. |
| route /ready-made/:id | docs/decisions/00273-2026-08-26-bento-compact-density.md | holds | Client Route or Redirect matches /ready-made/:p. |
| route /services | docs/decisions/00273-2026-08-26-bento-compact-density.md | holds | Client Route or Redirect matches /services. |
| guard advisory (2026-08-27-bento-assembly-spec) | docs/decisions/00274-2026-08-27-bento-assembly-spec.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-27-neighbourhood-slug-match) | docs/decisions/00275-2026-08-27-neighbourhood-slug-match.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/discover/location/Mumbai | docs/decisions/00275-2026-08-27-neighbourhood-slug-match.md | holds | Live path is GET /api/discover/location/:city at server/routes/content.routes.ts:1000. |
| guard advisory (2026-08-26-see-all-is-filter) | docs/decisions/00276-2026-08-26-see-all-is-filter.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover/location/:city | docs/decisions/00276-2026-08-26-see-all-is-filter.md | holds | Client Route or Redirect matches /discover/location/:p. |
| guard advisory (2026-08-27-plus-is-delivery) | docs/decisions/00277-2026-08-27-plus-is-delivery.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /internal/run-occasion-drafts | docs/decisions/00277-2026-08-27-plus-is-delivery.md | holds | Mounted at server/routes/internal.routes.ts:251. |
| guard advisory (2026-08-27-plan-memberships) | docs/decisions/00278-2026-08-27-plan-memberships.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-28-my-plans) | docs/decisions/00279-2026-08-28-my-plans.md | holds | Row is marked advisory; it names no CI guard. |
| route /dashboard | docs/decisions/00279-2026-08-28-my-plans.md | holds | Client Route or Redirect matches /dashboard. |
| guard advisory (2026-08-28-hero-ticker-links) | docs/decisions/00280-2026-08-28-hero-ticker-links.md | holds | Row is marked advisory; it names no CI guard. |
| route /discover/location/:city | docs/decisions/00280-2026-08-28-hero-ticker-links.md | holds | Client Route or Redirect matches /discover/location/:p. |
| guard advisory (2026-08-28-chrome-alignment) | docs/decisions/00281-2026-08-28-chrome-alignment.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-29-replit-gem-audit) | docs/decisions/00282-2026-08-29-replit-gem-audit.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/trips/:tripId/itinerary-items/:itemId | docs/decisions/00282-2026-08-29-replit-gem-audit.md | holds | Mounted at server/routes/trips.routes.ts:3190. |
| guard advisory (2026-08-28-single-planning-entry) | docs/decisions/00283-2026-08-28-single-planning-entry.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:tripId | docs/decisions/00283-2026-08-28-single-planning-entry.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00283-2026-08-28-single-planning-entry.md | holds | Client Route or Redirect matches /trip/:p. |
| guard check-money-endpoints (2026-08-29-trip-pass) | docs/decisions/00284-2026-08-29-trip-pass.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| route /pricing | docs/decisions/00284-2026-08-29-trip-pass.md | holds | Client Route or Redirect matches /pricing. |
| guard check-money-endpoints (2026-08-29-trip-pass-provenance) | docs/decisions/00285-2026-08-29-trip-pass-provenance.md | holds | File is scripts/check-money-endpoints.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-08-29-persona-coverage-complete) | docs/decisions/00286-2026-08-29-persona-coverage-complete.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/cart/fee-preview | docs/decisions/00286-2026-08-29-persona-coverage-complete.md | holds | Mounted at server/routes/payments.routes.ts:2707. |
| route POST /internal/run-occasion-drafts | docs/decisions/00286-2026-08-29-persona-coverage-complete.md | holds | Mounted at server/routes/internal.routes.ts:251. |
| guard advisory (2026-08-30-autonomous-walkthroughs) | docs/decisions/00287-2026-08-30-autonomous-walkthroughs.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-31-rebuild-delete-money-guard) | docs/decisions/00288-2026-08-31-rebuild-delete-money-guard.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00288-2026-08-31-rebuild-delete-money-guard.md | holds | Mounted at server/routes.ts:1691. |
| guard advisory (2026-08-31-two-surfaces-one-handoff) | docs/decisions/00289-2026-08-31-two-surfaces-one-handoff.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips/:tripId/finalize | docs/decisions/00289-2026-08-31-two-surfaces-one-handoff.md | holds | Mounted at server/routes/routing.routes.ts:473. |
| guard advisory (2026-08-31-trip-card-snapshot-render) | docs/decisions/00290-2026-08-31-trip-card-snapshot-render.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:tripId | docs/decisions/00290-2026-08-31-trip-card-snapshot-render.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00290-2026-08-31-trip-card-snapshot-render.md | holds | Client Route or Redirect matches /trip/:p. |
| route POST /api/itinerary-comparisons/:id/adopt-stop | docs/decisions/00290-2026-08-31-trip-card-snapshot-render.md | holds | Mounted at server/routes/plancard.routes.ts:411. |
| guard advisory (2026-08-31-finalize-gate) | docs/decisions/00291-2026-08-31-finalize-gate.md | holds | Row is marked advisory; it names no CI guard. |
| route /trip/:id | docs/decisions/00291-2026-08-31-finalize-gate.md | holds | Client Route or Redirect matches /trip/:p. |
| guard advisory (2026-08-31-manifest-is-the-boundary) | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:tripId | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Client Route or Redirect matches /plans/:p. |
| route /services | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Client Route or Redirect matches /services. |
| route /trip/:id | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Client Route or Redirect matches /trip/:p. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Mounted at server/routes.ts:1691. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00292-2026-08-31-manifest-is-the-boundary.md | holds | Mounted at server/routes.ts:13414. |
| guard advisory (2026-08-31-mid-trip-purchase-versions) | docs/decisions/00293-2026-08-31-mid-trip-purchase-versions.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-31-stage-a-dashboard) | docs/decisions/00294-2026-08-31-stage-a-dashboard.md | holds | Row is marked advisory; it names no CI guard. |
| route /dashboard | docs/decisions/00294-2026-08-31-stage-a-dashboard.md | holds | Client Route or Redirect matches /dashboard. |
| route /plans/:id | docs/decisions/00294-2026-08-31-stage-a-dashboard.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00294-2026-08-31-stage-a-dashboard.md | holds | Client Route or Redirect matches /trip/:p. |
| guard advisory (2026-08-31-trip-card-rebuild-docs-suites) | docs/decisions/00295-2026-08-31-trip-card-rebuild-docs-suites.md | holds | Row is marked advisory; it names no CI guard. |
| route /itinerary/:id | docs/decisions/00295-2026-08-31-trip-card-rebuild-docs-suites.md | holds | Client Route or Redirect matches /itinerary/:p. |
| route /plans/:id | docs/decisions/00295-2026-08-31-trip-card-rebuild-docs-suites.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00295-2026-08-31-trip-card-rebuild-docs-suites.md | holds | Client Route or Redirect matches /trip/:p. |
| guard adopt-version-semantics (2026-08-31-adopt-merge-finalize-lock) | docs/decisions/00296-2026-08-31-adopt-merge-finalize-lock.md | holds | File is server/__tests__/adopt-version-semantics.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-01-landing-moments) | docs/decisions/00297-2026-09-01-landing-moments.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/landing/moments/event | docs/decisions/00297-2026-09-01-landing-moments.md | holds | Mounted at server/routes/landing.routes.ts:207. |
| guard advisory (2026-09-01-plus-in-pricing) | docs/decisions/00298-2026-09-01-plus-in-pricing.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/pricing | docs/decisions/00298-2026-09-01-plus-in-pricing.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| guard advisory (2026-09-01-moment-key) | docs/decisions/00299-2026-09-01-moment-key.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-01-photo-tiers) | docs/decisions/00300-2026-09-01-photo-tiers.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/landing/moments | docs/decisions/00300-2026-09-01-photo-tiers.md | holds | Mounted at server/routes/landing.routes.ts:182. |
| guard advisory (2026-09-02-reference-photo-chip) | docs/decisions/00301-2026-09-02-reference-photo-chip.md | holds | Row is marked advisory; it names no CI guard. |
| file:line trip-finalize.service.ts:33-36 | docs/decisions/00302-2026-08-31-landing-v2.5-close-out.md | drifted | special_requests is not in server/services/trip-finalize.service.ts. Cited line now reads: import { platformCarFits as readPlatformCarFits } from "./airport-leg.service"; |
| guard advisory (2026-08-31-landing-v2.5-close-out) | docs/decisions/00302-2026-08-31-landing-v2.5-close-out.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/ai/generate-itinerary | docs/decisions/00302-2026-08-31-landing-v2.5-close-out.md | holds | Mounted (POST). |
| route GET /api/landing/moments | docs/decisions/00302-2026-08-31-landing-v2.5-close-out.md | holds | Mounted at server/routes/landing.routes.ts:182. |
| guard advisory (2026-09-01-moments-slot-l4) | docs/decisions/00303-2026-09-01-moments-slot-l4.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/landing/moments | docs/decisions/00303-2026-09-01-moments-slot-l4.md | holds | Mounted at server/routes/landing.routes.ts:182. |
| file:line booking-actions.ts:131 | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:131 reads: |
| file:line payments.routes.ts:493 | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | No code symbol was named beside the citation. Line server/routes/payments.routes.ts:493 reads: while (d < end) { |
| file:line routes.ts:947 | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | No code symbol was named beside the citation. Line server/routes.ts:947 reads: // was the one of the three that never got the check (§18 rule 1 — one question, one answer). |
| file:line stripe-connect.service.ts:120 | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | No code symbol was named beside the citation. Line server/services/stripe-connect.service.ts:120 reads: const transfer = await stripe.transfers.create( |
| file:line transport-hub.routes.ts:313 | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | No code symbol was named beside the citation. Line server/routes/transport-hub.routes.ts:313 reads: // AF-1: the same projection drops `affiliateCode` too. |
| guard traveler-fee-coverage (2026-09-02-traveler-fee-applies-everywhere) | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | File is scripts/check-traveler-fee-coverage.cjs. Ledger lint reports the guard wired. |
| route POST /api/bookings/process-cart | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | Mounted at server/routes/bookings.ts:162. |
| route POST /api/checkout | docs/decisions/00304-2026-09-02-traveler-fee-applies-everywhere.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route /admin/reconciliation | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| route GET /api/admin/jobs/health | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | Mounted at server/routes/admin.routes.ts:2089. |
| route GET /internal/jobs/health | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | Mounted at server/routes/internal.routes.ts:513. |
| test pin internal-jobs-heartbeat.db.test.ts (2026-09-01-internal-jobs-hardening) | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | File is server/routes/__tests__/internal-jobs-heartbeat.db.test.ts. Ledger lint reports the guard wired. |
| test pin internal-jobs-limiter.http.test.ts (2026-09-01-internal-jobs-hardening) | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | File is server/routes/__tests__/internal-jobs-limiter.http.test.ts. Ledger lint reports the guard wired. |
| test pin internal-jobs-skip-semantics.db.test.ts (2026-09-01-internal-jobs-hardening) | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | File is server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts. Ledger lint reports the guard wired. |
| test pin internal-spa-fallback-exemption.test.ts (2026-09-01-internal-jobs-hardening) | docs/decisions/00305-2026-09-01-internal-jobs-hardening.md | holds | File is server/__tests__/internal-spa-fallback-exemption.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-02-traveler-fee-refundability) | docs/decisions/00306-2026-09-02-traveler-fee-refundability.md | holds | Row is marked advisory; it names no CI guard. |
| file:line server/services/dmo-ingestion.service.ts:118 | docs/decisions/00307-2026-09-01-web-gap-check.md | holds | No code symbol was named beside the citation. Line server/services/dmo-ingestion.service.ts:118 reads: base.skipped++; |
| guard advisory (2026-09-01-web-gap-check) | docs/decisions/00307-2026-09-01-web-gap-check.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-01-evidence-thresholds-config) | docs/decisions/00308-2026-09-01-evidence-thresholds-config.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/admin/evidence-thresholds/:key | docs/decisions/00308-2026-09-01-evidence-thresholds-config.md | holds | Mounted at server/routes/neighborhood-claims.routes.ts:310. |
| guard advisory (2026-09-01-scorer-model) | docs/decisions/00309-2026-09-01-scorer-model.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-01-access-claims-held) | docs/decisions/00310-2026-09-01-access-claims-held.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-privileged-field-completeness (2026-09-02-field-knowledge-phase0-ratified) | docs/decisions/00311-2026-09-02-field-knowledge-phase0-ratified.md | holds | File is scripts/check-privileged-field-completeness.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-08-29-neighborhood-claims) | docs/decisions/00312-2026-08-29-neighborhood-claims.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-29-evidence-is-the-test) | docs/decisions/00313-2026-08-29-evidence-is-the-test.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-29-graded-unlocks) | docs/decisions/00314-2026-08-29-graded-unlocks.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-08-29-scout-check) | docs/decisions/00315-2026-08-29-scout-check.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-02-optimizer-run-price) | docs/decisions/00316-2026-09-02-optimizer-run-price.md | holds | Row is marked advisory; it names no CI guard. |
| route /pricing | docs/decisions/00316-2026-09-02-optimizer-run-price.md | holds | Client Route or Redirect matches /pricing. |
| guard advisory (2026-09-02-memberships-checkout-start) | docs/decisions/00317-2026-09-02-memberships-checkout-start.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-02-scout-check-is-a-service) | docs/decisions/00318-2026-09-02-scout-check-is-a-service.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-02-field-knowledge-v2-canonical) | docs/decisions/00319-2026-09-02-field-knowledge-v2-canonical.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/neighborhood-claims | docs/decisions/00319-2026-09-02-field-knowledge-v2-canonical.md | holds | Client Route or Redirect matches /admin/neighborhood-claims. |
| route /expert/neighborhoods | docs/decisions/00319-2026-09-02-field-knowledge-v2-canonical.md | holds | Client Route or Redirect matches /expert/neighborhoods. |
| guard advisory (2026-09-02-traveler-fee-refund-lane) | docs/decisions/00320-2026-09-02-traveler-fee-refund-lane.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-02-outbound-fetch-egress) | docs/decisions/00321-2026-09-02-outbound-fetch-egress.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-02-field-knowledge-phase2-landed) | docs/decisions/00322-2026-09-02-field-knowledge-phase2-landed.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/neighborhood-claims | docs/decisions/00322-2026-09-02-field-knowledge-phase2-landed.md | holds | Client Route or Redirect matches /admin/neighborhood-claims. |
| route GET /api/admin/neighborhood-claims | docs/decisions/00322-2026-09-02-field-knowledge-phase2-landed.md | holds | Mounted at server/routes/neighborhood-claims.routes.ts:208. |
| route POST /internal/jobs/score-neighborhood-claims | docs/decisions/00322-2026-09-02-field-knowledge-phase2-landed.md | holds | Mounted at server/routes/internal.routes.ts:392. |
| guard advisory (2026-09-03-expert-templates-consumer-sunset) | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/expert-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Client Route or Redirect matches /admin/expert-templates. |
| route /discover | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Client Route or Redirect matches /discover. |
| route /experiences/:slug | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /expert-templates/:id | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No client Route or Redirect matches /expert-templates/:p. |
| route /expert/templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No client Route or Redirect matches /expert/templates. |
| route DELETE /api/expert/templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted DELETE /api/expert/templates. |
| route GET /api/admin/expert-templates/pending | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/admin/expert-templates/pending. |
| route GET /api/expert-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert-templates. |
| route GET /api/expert-templates/:id | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert-templates/:p. |
| route GET /api/expert/template-sales | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/expert/template-sales. |
| route GET /api/experts | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Mounted at server/routes.ts:5490. |
| route GET /api/my-purchased-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted GET /api/my-purchased-templates. |
| route GET /api/recommendations/user | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Mounted at server/routes.ts:9204. |
| route GET /api/storefront/:handle | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Mounted at server/routes/storefront.routes.ts:1258. |
| route PATCH /api/admin/expert-templates | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | holds | Live path is PATCH /api/admin/expert-templates/:id/roles at server/routes/admin.routes.ts:3918. |
| route POST /api/expert-templates/:id/purchase | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert-templates/:p/purchase. |
| route POST /api/expert-templates/:id/reviews | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert-templates/:p/reviews. |
| route POST /api/expert/templates/:id/submit | docs/decisions/00323-2026-09-03-expert-templates-consumer-sunset.md | gone | No mounted POST /api/expert/templates/:p/submit. |
| guard advisory (2026-09-03-slip-convergence) | docs/decisions/00324-2026-09-03-slip-convergence.md | holds | Row is marked advisory; it names no CI guard. |
| route /cart | docs/decisions/00324-2026-09-03-slip-convergence.md | holds | Client Route or Redirect matches /cart. |
| route POST /api/cart | docs/decisions/00324-2026-09-03-slip-convergence.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00324-2026-09-03-slip-convergence.md | holds | Mounted at server/routes.ts:13414. |
| guard advisory (2026-09-03-trip-pdf) | docs/decisions/00325-2026-09-03-trip-pdf.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/my-itinerary/:id/pdf | docs/decisions/00325-2026-09-03-trip-pdf.md | holds | Mounted at server/routes/my-itinerary.routes.ts:297. |
| route GET /api/trips/:tripId/pdf | docs/decisions/00325-2026-09-03-trip-pdf.md | holds | Mounted at server/routes/trips.routes.ts:1283. |
| guard advisory (2026-09-03-plan-vocabulary) | docs/decisions/00326-2026-09-03-plan-vocabulary.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/trips/:id/itinerary-items | docs/decisions/00326-2026-09-03-plan-vocabulary.md | holds | Mounted (GET/POST). |
| route /plans/:id | docs/decisions/00326-2026-09-03-plan-vocabulary.md | holds | Client Route or Redirect matches /plans/:p. |
| file:line SlipLogisticsSection.tsx:52 | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/SlipLogisticsSection.tsx:52 reads: * `2026-09-05-slip-switch-reads-events-first`; Locked Decision 42 D1, Locked Decision 28). |
| guard advisory (2026-09-03-occasion-vocabulary) | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences/corporate | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /experiences/romance | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Client Route or Redirect matches /experiences/:p. |
| route PATCH /api/trips/:id | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Mounted at server/routes.ts:1609. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| route PUT /api/trip-context | docs/decisions/00327-2026-09-03-occasion-vocabulary.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| guard advisory (2026-09-03-item-event-link) | docs/decisions/00328-2026-09-03-item-event-link.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:tripId/itinerary-items | docs/decisions/00328-2026-09-03-item-event-link.md | holds | Mounted at server/routes.ts:13338. |
| route PATCH /api/trips/:tripId/itinerary-items/:itemId | docs/decisions/00328-2026-09-03-item-event-link.md | holds | Mounted at server/routes/trips.routes.ts:3190. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00328-2026-09-03-item-event-link.md | holds | Mounted at server/routes.ts:13414. |
| route POST /api/user-experiences | docs/decisions/00328-2026-09-03-item-event-link.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| guard advisory (2026-09-03-occasion-switches) | docs/decisions/00329-2026-09-03-occasion-switches.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences/corporate | docs/decisions/00329-2026-09-03-occasion-switches.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /experiences/romance | docs/decisions/00329-2026-09-03-occasion-switches.md | holds | Client Route or Redirect matches /experiences/:p. |
| guard advisory (2026-09-03-occasion-hygiene) | docs/decisions/00330-2026-09-03-occasion-hygiene.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences | docs/decisions/00330-2026-09-03-occasion-hygiene.md | holds | Client Route or Redirect matches /experiences. |
| guard advisory (2026-09-03-security-9-11-13) | docs/decisions/00331-2026-09-03-security-9-11-13.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/ai | docs/decisions/00331-2026-09-03-security-9-11-13.md | holds | Routes are still mounted under this prefix (for example POST /api/ai/chat). |
| route POST /api/grok/chat | docs/decisions/00331-2026-09-03-security-9-11-13.md | gone | No mounted POST /api/grok/chat. |
| route POST /api/transport-booking-options/seed/test-variant | docs/decisions/00331-2026-09-03-security-9-11-13.md | holds | Mounted at server/routes/transport-hub.routes.ts:597. |
| guard advisory (2026-09-03-share-link-price-redaction) | docs/decisions/00332-2026-09-03-share-link-price-redaction.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/itinerary-share/:token | docs/decisions/00332-2026-09-03-share-link-price-redaction.md | holds | Mounted at server/routes/trips.routes.ts:2000. |
| guard advisory (2026-09-03-deposit-paid-cancel) | docs/decisions/00333-2026-09-03-deposit-paid-cancel.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-03-switch-readers) | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/experience-types | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/content.routes.ts:1255. |
| route GET /api/logistics/presets/:slug | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/trips.routes.ts:1823. |
| route POST /api/trips/:id/anchors | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/trips.routes.ts:1609. |
| route POST /api/user-experiences | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| route PUT /api/anchors/:id | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/trips.routes.ts:1698. |
| route PUT /api/trip-context | docs/decisions/00334-2026-09-03-switch-readers.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| guard advisory (2026-09-04-plan-mint) | docs/decisions/00335-2026-09-04-plan-mint.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/user-experiences | docs/decisions/00335-2026-09-04-plan-mint.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| guard advisory (2026-09-04-invite-mailer) | docs/decisions/00336-2026-09-04-invite-mailer.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/events/:experienceId/invites/send | docs/decisions/00336-2026-09-04-invite-mailer.md | holds | Mounted at server/routes/guest-invites.ts:310. |
| route POST /api/events/:id/invites | docs/decisions/00336-2026-09-04-invite-mailer.md | holds | Mounted at server/routes/guest-invites.ts:151. |
| guard advisory (2026-09-04-location-mismatch) | docs/decisions/00337-2026-09-04-location-mismatch.md | holds | Row is marked advisory; it names no CI guard. |
| route /services | docs/decisions/00337-2026-09-04-location-mismatch.md | holds | Client Route or Redirect matches /services. |
| route GET /api/trips | docs/decisions/00337-2026-09-04-location-mismatch.md | holds | Mounted at server/routes.ts:1416. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00337-2026-09-04-location-mismatch.md | holds | Mounted at server/routes.ts:13414. |
| guard advisory (2026-09-04-slip-events) | docs/decisions/00338-2026-09-04-slip-events.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/user-experiences | docs/decisions/00338-2026-09-04-slip-events.md | holds | Mounted (GET/POST). |
| guard check-category-reachability (2026-09-04-taxonomy-reconcile) | docs/decisions/00339-2026-09-04-taxonomy-reconcile.md | holds | File is scripts/check-category-reachability.cjs. Ledger lint reports the guard wired. |
| route /earn | docs/decisions/00339-2026-09-04-taxonomy-reconcile.md | holds | Client Route or Redirect matches /earn. |
| route GET /api/service-categories/provider-counts | docs/decisions/00339-2026-09-04-taxonomy-reconcile.md | holds | Mounted at server/routes/content.routes.ts:1031. |
| route POST /api/admin/seed-categories | docs/decisions/00339-2026-09-04-taxonomy-reconcile.md | holds | Mounted at server/routes/admin.routes.ts:4223. |
| guard advisory (2026-09-04-which-event-picker) | docs/decisions/00340-2026-09-04-which-event-picker.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/user-experiences | docs/decisions/00340-2026-09-04-which-event-picker.md | holds | Mounted (GET/POST). |
| route /services/:id | docs/decisions/00340-2026-09-04-which-event-picker.md | holds | Client Route or Redirect matches /services/:p. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00340-2026-09-04-which-event-picker.md | holds | Mounted at server/routes.ts:13414. |
| file:line content.routes.ts:164 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | insertTripParticipantSchema is not on the cited lines. It is at server/routes/content.routes.ts:7213. |
| file:line server/index.ts:583 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | No code symbol was named beside the citation. Line server/index.ts:583 reads: } else { |
| file:line server/routes.ts:10590 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | trip_participants is not in server/routes.ts. Cited line now reads: fixedCommitments, |
| file:line shared/guest-invites-schema.ts:20 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | event_invites is still on shared/guest-invites-schema.ts:20. |
| file:line shared/schema.ts:4208 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | No code symbol was named beside the citation. Line shared/schema.ts:4208 reads: |
| file:line SlipLogisticsSection.tsx:52 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/SlipLogisticsSection.tsx:52 reads: * `2026-09-05-slip-switch-reads-events-first`; Locked Decision 42 D1, Locked Decision 28). |
| file:line trip-strip.tsx:182 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | drifted | user_experiences is not in client/src/components/trip/trip-strip.tsx. Cited line now reads: ? "" |
| file:line trips.routes.ts:864 | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | No code symbol was named beside the citation. Line server/routes/trips.routes.ts:864 reads: res.json(ranked); |
| guard advisory (2026-09-04-guest-list-reconciliation) | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/trips/:tripId/participants/:participantId | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | gone | No mounted handler matches /api/trips/:p/participants/:p. |
| route /invite/:token | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | Client Route or Redirect matches /invite/:p. |
| route PATCH /api/participants/:id | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | Mounted at server/routes/content.routes.ts:7278. |
| route POST /api/trips/:tripId/participants | docs/decisions/00341-2026-09-04-guest-list-reconciliation.md | holds | Mounted at server/routes.ts:12978. |
| guard advisory (2026-09-04-event-order) | docs/decisions/00342-2026-09-04-event-order.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/user-experiences | docs/decisions/00342-2026-09-04-event-order.md | holds | Mounted (GET/POST). |
| guard advisory (2026-09-04-roles-needed) | docs/decisions/00343-2026-09-04-roles-needed.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-04-mock-audits-phase-a) | docs/decisions/00344-2026-09-04-mock-audits-phase-a.md | holds | Row is marked advisory; it names no CI guard. |
| route /start/events | docs/decisions/00344-2026-09-04-mock-audits-phase-a.md | holds | Client Route or Redirect matches /start/events. |
| guard advisory (2026-09-04-which-event-hint) | docs/decisions/00345-2026-09-04-which-event-hint.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/services/:id | docs/decisions/00345-2026-09-04-which-event-hint.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| route GET /api/user-experiences | docs/decisions/00345-2026-09-04-which-event-hint.md | holds | Mounted at server/routes/content.routes.ts:1871. |
| guard advisory (2026-09-04-hire-from-slip) | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/experts | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted (GET). |
| route GET /api/experts | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted at server/routes.ts:5490. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| route POST /api/expert-requests | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted at server/routes/booking-actions.ts:206. |
| route POST /api/trips/:id/expert-advisor | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted at server/routes/booking-actions.ts:730. |
| route POST /api/trips/:tripId/advisors | docs/decisions/00346-2026-09-04-hire-from-slip.md | holds | Mounted at server/routes/booking-actions.ts:803. |
| guard advisory (2026-09-04-storefront-slip) | docs/decisions/00347-2026-09-04-storefront-slip.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/expert-booking-requests | docs/decisions/00347-2026-09-04-storefront-slip.md | holds | Mounted at server/routes.ts:2052. |
| file:line server/routes/admin.routes.ts:7322 | docs/decisions/00348-2026-09-04-template-inquiry-slip.md | holds | No code symbol was named beside the citation. Line server/routes/admin.routes.ts:7322 reads: if (suppressed === "template_not_allowed") { |
| guard advisory (2026-09-04-template-inquiry-slip) | docs/decisions/00348-2026-09-04-template-inquiry-slip.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert-requests | docs/decisions/00348-2026-09-04-template-inquiry-slip.md | holds | Mounted (GET/POST). |
| route /api/expert/assigned-trips | docs/decisions/00348-2026-09-04-template-inquiry-slip.md | holds | Mounted (GET). |
| route POST /api/trips | docs/decisions/00348-2026-09-04-template-inquiry-slip.md | holds | Mounted at server/routes.ts:1456. |
| guard advisory (2026-09-04-entry-unification) | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Row is marked advisory; it names no CI guard. |
| route /become-expert | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /become-expert. |
| route /become-provider | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /become-provider. |
| route /destinations | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /destinations. |
| route /discover | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /discover. |
| route /earn | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /earn. |
| route /events | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /events. |
| route /experiences | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /experiences. |
| route /expert/apply | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /expert/apply. |
| route /experts | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /experts. |
| route /provider/new-service | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /provider/new-service. |
| route /ready-made | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /ready-made. |
| route /services | docs/decisions/00349-2026-09-04-entry-unification.md | holds | Client Route or Redirect matches /services. |
| guard advisory (2026-09-04-slip-precondition) | docs/decisions/00350-2026-09-04-slip-precondition.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert/assigned-trips | docs/decisions/00350-2026-09-04-slip-precondition.md | holds | Mounted (GET). |
| route POST /api/expert-booking-requests | docs/decisions/00350-2026-09-04-slip-precondition.md | holds | Mounted at server/routes.ts:2052. |
| file:line admin-query.service.ts:948 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | No code symbol was named beside the citation. Line server/services/admin-query.service.ts:948 reads: eu.first_name \|\| ' ' \|\| eu.last_name AS expert_name |
| file:line admin.routes.ts:7339 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | No code symbol was named beside the citation. Line server/routes/admin.routes.ts:7339 reads: const adminUser = await getFullAdminUser(userId); |
| file:line booking-actions.service.ts:602 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | drifted | ensureTripAdvisorRow is not on the cited lines. It is at server/services/booking-actions.service.ts:917. |
| file:line ready-made.routes.ts:1596 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | No code symbol was named beside the citation. Line server/routes/ready-made.routes.ts:1596 reads: // disputed, or refunded/revoked. One honest 409 covers the reachable owner cases. |
| file:line storage.ts:6652 | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | No code symbol was named beside the citation. Line server/storage.ts:6652 reads: const prov = await db.update(providerEarnings) |
| guard advisory (2026-09-04-slip-precondition-authors) | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00351-2026-09-04-slip-precondition-authors.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| guard advisory (2026-09-04-wedding-landing-moment) | docs/decisions/00352-2026-09-04-wedding-landing-moment.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/landing/moments | docs/decisions/00352-2026-09-04-wedding-landing-moment.md | holds | Mounted (GET). |
| route /start/events | docs/decisions/00352-2026-09-04-wedding-landing-moment.md | holds | Client Route or Redirect matches /start/events. |
| guard check-planning-entry (2026-09-04-wedding-entry-doors) | docs/decisions/00353-2026-09-04-wedding-entry-doors.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /experiences/wedding | docs/decisions/00353-2026-09-04-wedding-entry-doors.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /start/events | docs/decisions/00353-2026-09-04-wedding-entry-doors.md | holds | Client Route or Redirect matches /start/events. |
| guard advisory (2026-09-04-one-modal-many-doors) | docs/decisions/00354-2026-09-04-one-modal-many-doors.md | holds | Row is marked advisory; it names no CI guard. |
| route /start/events | docs/decisions/00354-2026-09-04-one-modal-many-doors.md | holds | Client Route or Redirect matches /start/events. |
| route PATCH /api/trips/:id | docs/decisions/00354-2026-09-04-one-modal-many-doors.md | holds | Mounted at server/routes.ts:1609. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00354-2026-09-04-one-modal-many-doors.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| route PUT /api/trip-context | docs/decisions/00354-2026-09-04-one-modal-many-doors.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| guard advisory (2026-09-04-golf-occasion-and-housekeeping) | docs/decisions/00355-2026-09-04-golf-occasion-and-housekeeping.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences | docs/decisions/00355-2026-09-04-golf-occasion-and-housekeeping.md | holds | Client Route or Redirect matches /experiences. |
| route GET /api/expert/assigned-trips | docs/decisions/00355-2026-09-04-golf-occasion-and-housekeeping.md | holds | Mounted at server/routes/booking-actions.ts:899. |
| route GET /api/logistics/presets/:slug | docs/decisions/00355-2026-09-04-golf-occasion-and-housekeeping.md | holds | Mounted at server/routes/trips.routes.ts:1823. |
| route /plans/:tripId/guests | docs/decisions/00356-2026-09-04-guests-per-event.md | holds | Client Route or Redirect matches /plans/:p/guests. |
| route GET /api/trips/:tripId/guests | docs/decisions/00356-2026-09-04-guests-per-event.md | holds | Mounted at server/routes/guest-invites.ts:229. |
| test pin plan-guest-roster.test.ts (2026-09-04-guests-per-event) | docs/decisions/00356-2026-09-04-guests-per-event.md | holds | File is server/__tests__/plan-guest-roster.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-04-earn-planner-roles) | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/offering-types | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Client Route or Redirect matches /admin/offering-types. |
| route /experts | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Client Route or Redirect matches /experts. |
| route /start/events | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Client Route or Redirect matches /start/events. |
| route GET /api/offering-types/experts | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Mounted at server/routes/content.routes.ts:449. |
| route POST /api/expert-application | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Mounted at server/routes.ts:2702. |
| route POST /api/expert-forms | docs/decisions/00357-2026-09-04-earn-planner-roles.md | holds | Mounted at server/routes.ts:2796. |
| guard advisory (2026-09-04-stops-and-event-time) | docs/decisions/00358-2026-09-04-stops-and-event-time.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:id | docs/decisions/00358-2026-09-04-stops-and-event-time.md | holds | Mounted at server/routes/trips.routes.ts:390. |
| route GET /api/user-experiences | docs/decisions/00358-2026-09-04-stops-and-event-time.md | holds | Mounted at server/routes/content.routes.ts:1871. |
| route PUT /api/trips/:tripId/destinations | docs/decisions/00358-2026-09-04-stops-and-event-time.md | holds | Mounted at server/routes/trips.routes.ts:528. |
| guard advisory (2026-09-04-plan-stops-ui) | docs/decisions/00359-2026-09-04-plan-stops-ui.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:id | docs/decisions/00359-2026-09-04-plan-stops-ui.md | holds | Mounted at server/routes/trips.routes.ts:390. |
| route PUT /api/trips/:tripId/destinations | docs/decisions/00359-2026-09-04-plan-stops-ui.md | holds | Mounted at server/routes/trips.routes.ts:528. |
| guard advisory (2026-09-04-event-time-ui) | docs/decisions/00360-2026-09-04-event-time-ui.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/user-experiences/:id | docs/decisions/00360-2026-09-04-event-time-ui.md | holds | Mounted (DELETE/GET/PATCH). |
| route PUT /api/trip-context | docs/decisions/00360-2026-09-04-event-time-ui.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| guard advisory (2026-09-04-earn-role-safety) | docs/decisions/00361-2026-09-04-earn-role-safety.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/expert/role | docs/decisions/00361-2026-09-04-earn-role-safety.md | holds | Mounted at server/routes/expert-console.routes.ts:75. |
| guard check-advisor-row-author (2026-09-04-advisor-row-one-author) | docs/decisions/00362-2026-09-04-advisor-row-one-author.md | holds | File is scripts/check-advisor-row-author.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-04-cost-split-phase-one) | docs/decisions/00363-2026-09-04-cost-split-phase-one.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/participants/:id | docs/decisions/00363-2026-09-04-cost-split-phase-one.md | holds | Mounted at server/routes/content.routes.ts:7278. |
| route POST /api/bookings/:id/pay-balance | docs/decisions/00363-2026-09-04-cost-split-phase-one.md | holds | Mounted at server/routes/payments.routes.ts:2478. |
| guard check-category-reachability.cjs (2026-09-04-venue-category) | docs/decisions/00364-2026-09-04-venue-category.md | holds | File is scripts/check-category-reachability.cjs. Ledger lint reports the guard wired. |
| guard check-earn-planner-keys.cjs (2026-09-04-venue-category) | docs/decisions/00364-2026-09-04-venue-category.md | holds | File is scripts/check-earn-planner-keys.cjs. Ledger lint reports the guard wired. |
| guard check-roles-needed-reachability.cjs (2026-09-04-venue-category) | docs/decisions/00364-2026-09-04-venue-category.md | holds | File is scripts/check-roles-needed-reachability.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-04-contract-stats-column) | docs/decisions/00365-2026-09-04-contract-stats-column.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-04-retire-dead-plan-columns) | docs/decisions/00366-2026-09-04-retire-dead-plan-columns.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/participants/:id | docs/decisions/00366-2026-09-04-retire-dead-plan-columns.md | holds | Mounted at server/routes/content.routes.ts:7278. |
| guard advisory (2026-09-04-held-decisions) | docs/decisions/00367-2026-09-04-held-decisions.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-04-step4-variants-fields) | docs/decisions/00368-2026-09-04-step4-variants-fields.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/auth/user | docs/decisions/00368-2026-09-04-step4-variants-fields.md | holds | Mounted at server/replit_integrations/auth/routes.ts:152. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00368-2026-09-04-step4-variants-fields.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| route PUT /api/trip-context | docs/decisions/00368-2026-09-04-step4-variants-fields.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| file:line client/src/pages/plan-guests.tsx:17 | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | No code symbol was named beside the citation. Line client/src/pages/plan-guests.tsx:17 reads: * • An event's start TIME. The column EXISTS — `user_experiences.start_time`, migration 282, |
| guard advisory (2026-09-04-wedding-flow-reaudit) | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | Row is marked advisory; it names no CI guard. |
| route /plans/:tripId/guests | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | Client Route or Redirect matches /plans/:p/guests. |
| route /start/events | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | Client Route or Redirect matches /start/events. |
| route GET /api/experience-types | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | Mounted at server/routes/content.routes.ts:1255. |
| route GET /api/trips/:tripId/guests | docs/decisions/00369-2026-09-04-wedding-flow-reaudit.md | holds | Mounted at server/routes/guest-invites.ts:229. |
| route /plans/:tripId/guests | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Client Route or Redirect matches /plans/:p/guests. |
| route GET /api/logistics/presets/:slug | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Mounted at server/routes/trips.routes.ts:1823. |
| route GET /api/trips/:tripId/contracts/overdue | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Mounted at server/routes.ts:13095. |
| route POST /api/participants/:id/payment | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Mounted at server/routes/content.routes.ts:7323. |
| route POST /api/trips/:tripId/participants | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Mounted at server/routes.ts:12978. |
| route POST /api/user-experiences | docs/decisions/00370-2026-09-04-plan-islands.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| test pin participant-write-rail.test.ts (2026-09-04-plan-islands) | docs/decisions/00370-2026-09-04-plan-islands.md | holds | File is server/__tests__/participant-write-rail.test.ts. Ledger lint reports the guard wired. |
| test pin plan-islands.test.ts (2026-09-04-plan-islands) | docs/decisions/00370-2026-09-04-plan-islands.md | holds | File is client/src/lib/__tests__/plan-islands.test.ts. Ledger lint reports the guard wired. |
| route POST /api/user-experiences | docs/decisions/00371-2026-09-04-event-budget.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| test pin plan-budget.test.ts (2026-09-04-event-budget) | docs/decisions/00371-2026-09-04-event-budget.md | holds | File is client/src/lib/__tests__/plan-budget.test.ts. Ledger lint reports the guard wired. |
| test pin user-experience-start-time.test.ts (2026-09-04-event-budget) | docs/decisions/00371-2026-09-04-event-budget.md | holds | File is shared/__tests__/user-experience-start-time.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-04-earn-contained-fixes) | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Routes are still mounted under this prefix (for example GET /api/me/available-now). |
| route /earn | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Client Route or Redirect matches /earn. |
| route GET /api/expert/analytics/dashboard | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes.ts:8883. |
| route GET /api/experts/:id | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes.ts:5624. |
| route GET /api/service-categories | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes/content.routes.ts:1025. |
| route PATCH /api/provider/services/:id | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes.ts:4492. |
| route POST /api/expert/specializations | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes.ts:5984. |
| route POST /api/me/offering-requests | docs/decisions/00372-2026-09-04-earn-contained-fixes.md | holds | Mounted at server/routes/offering-requests.routes.ts:47. |
| route /experiences/travel | docs/decisions/00373-2026-09-04-reaudit-fixes.md | holds | Client Route or Redirect matches /experiences/:p. |
| test pin experience-type-switches.test.ts (2026-09-04-reaudit-fixes) | docs/decisions/00373-2026-09-04-reaudit-fixes.md | holds | File is shared/__tests__/experience-type-switches.test.ts. Ledger lint reports the guard wired. |
| test pin plan-steps.test.ts (2026-09-04-reaudit-fixes) | docs/decisions/00373-2026-09-04-reaudit-fixes.md | holds | File is client/src/lib/__tests__/plan-steps.test.ts. Ledger lint reports the guard wired. |
| test pin slip-events.test.ts (2026-09-04-reaudit-fixes) | docs/decisions/00373-2026-09-04-reaudit-fixes.md | holds | File is client/src/lib/__tests__/slip-events.test.ts. Ledger lint reports the guard wired. |
| test pin wedding-presets.test.ts (2026-09-04-reaudit-fixes) | docs/decisions/00373-2026-09-04-reaudit-fixes.md | holds | File is server/services/__tests__/wedding-presets.test.ts. Ledger lint reports the guard wired. |
| guard check-query-userid-reads (2026-09-05-custom-venues-owner-scope) | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | File is scripts/check-query-userid-reads.cjs. Ledger lint reports the guard wired. |
| route GET /api/custom-venues | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | Mounted at server/routes/content.routes.ts:1112. |
| route GET /api/custom-venues/:id | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | Mounted at server/routes/content.routes.ts:1142. |
| route GET /api/providers/:userId/public-verification | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | Mounted at server/routes.ts:6552. |
| route GET /api/vendors | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | Mounted at server/routes.ts:2581. |
| route POST /api/custom-venues | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | Mounted at server/routes/content.routes.ts:1158. |
| test pin custom-venues-owner-scope.test.ts (2026-09-05-custom-venues-owner-scope) | docs/decisions/00374-2026-09-05-custom-venues-owner-scope.md | holds | File is server/__tests__/custom-venues-owner-scope.test.ts. Ledger lint reports the guard wired. |
| file:line server/routes.ts:1998 | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | No code symbol was named beside the citation. Line server/routes.ts:1998 reads: itemType: activity.type \|\| "activity", |
| guard check-query-userid-reads (2026-09-05-vendors-read-scope) | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | File is scripts/check-query-userid-reads.cjs. Ledger lint reports the guard wired. |
| route GET /api/admin/vendors | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | Mounted at server/routes.ts:2596. |
| route GET /api/vendors | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | Mounted at server/routes.ts:2581. |
| route GET /api/vendors/:id | docs/decisions/00375-2026-09-05-vendors-read-scope.md | gone | No mounted GET /api/vendors/:p. |
| route POST /api/vendors | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | Mounted at server/routes.ts:2643. |
| test pin vendors-read-scope.test.ts (2026-09-05-vendors-read-scope) | docs/decisions/00375-2026-09-05-vendors-read-scope.md | holds | File is server/__tests__/vendors-read-scope.test.ts. Ledger lint reports the guard wired. |
| route /api/user-experiences | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | Mounted (GET/POST). |
| route /profile | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | Client Route or Redirect matches /profile. |
| route PATCH /api/me/home-city | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | Mounted at server/routes/occasions.routes.ts:190. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| test pin plan-islands.test.ts (2026-09-05-slip-events-first-render) | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | File is client/src/lib/__tests__/plan-islands.test.ts. Ledger lint reports the guard wired. |
| test pin plan-party-total.test.ts (2026-09-05-slip-events-first-render) | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | File is shared/__tests__/plan-party-total.test.ts. Ledger lint reports the guard wired. |
| test pin slip-events.test.ts (2026-09-05-slip-events-first-render) | docs/decisions/00376-2026-09-05-slip-events-first-render.md | holds | File is client/src/lib/__tests__/slip-events.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-05-fee-ledger-test-robustness) | docs/decisions/00377-2026-09-05-fee-ledger-test-robustness.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-05-fee-ledger-hang-root-cause) | docs/decisions/00378-2026-09-05-fee-ledger-hang-root-cause.md | holds | Row is marked advisory; it names no CI guard. |
| file:line routes.ts:652 | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | No code symbol was named beside the citation. Line server/routes.ts:652 reads: message: |
| file:line storage.ts:3697 | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | No code symbol was named beside the citation. Line server/storage.ts:3697 reads: return updated; |
| route /api/experts | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Mounted (GET). |
| route /experts/:id | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Client Route or Redirect matches /experts/:p. |
| route /s/:handle | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Client Route or Redirect matches /s/:p. |
| route GET /api/experts | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Mounted at server/routes.ts:5490. |
| route GET /api/experts/:id | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Mounted at server/routes.ts:5624. |
| route GET /api/experts/:id/services | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Mounted at server/routes.ts:5654. |
| route GET /api/experts/counts | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | Mounted at server/routes.ts:5434. |
| test pin experts-public-projection.test.ts (2026-09-05-experts-public-projection) | docs/decisions/00379-2026-09-05-experts-public-projection.md | holds | File is server/__tests__/experts-public-projection.test.ts. Ledger lint reports the guard wired. |
| route /s/:handle | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Client Route or Redirect matches /s/:p. |
| route GET /api/admin/conversations | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes/conversations.routes.ts:172. |
| route GET /api/experts | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes.ts:5490. |
| route GET /api/experts/:id | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes.ts:5624. |
| route GET /api/messages | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes/messages.ts:80. |
| route GET /api/messages/conversation/:id | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes/messages.ts:96. |
| route POST /api/chats | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes.ts:2442. |
| route POST /api/conversations/start | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| route POST /api/messages | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | Mounted at server/routes/messages.ts:174. |
| test pin contact-rails.test.ts (2026-09-05-user-id-is-internal) | docs/decisions/00380-2026-09-05-user-id-is-internal.md | holds | File is server/__tests__/contact-rails.test.ts. Ledger lint reports the guard wired. |
| guard check-public-user-id (2026-09-05-ld40-lane2-public-ids) | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | File is scripts/check-public-user-id.cjs. Ledger lint reports the guard wired. |
| route /api/experts | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted (GET). |
| route /api/experts/:id | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted (GET). |
| route /api/provider-storefront/:handle | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted (GET). |
| route /experts | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Client Route or Redirect matches /experts. |
| route /experts/:id | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Client Route or Redirect matches /experts/:p. |
| route GET /api/discover | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes/content.routes.ts:2989. |
| route GET /api/provider-services | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes.ts:3177. |
| route GET /api/provider-storefronts | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes/storefront.routes.ts:1288. |
| route GET /api/providers/:userId/public-verification | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes.ts:6552. |
| route GET /api/services/:id | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| route GET /api/services/:id/provider-verification | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes.ts:6536. |
| route POST /api/conversations/start | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| route POST /api/trips/:tripId/advisors | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | Mounted at server/routes/booking-actions.ts:803. |
| test pin public-user-id.test.ts (2026-09-05-ld40-lane2-public-ids) | docs/decisions/00381-2026-09-05-ld40-lane2-public-ids.md | holds | File is server/__tests__/public-user-id.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-05-slip-one-surface-seventeen) | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Row is marked advisory; it names no CI guard. |
| route /experts | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Client Route or Redirect matches /experts. |
| route /plans/:tripId | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Client Route or Redirect matches /plans/:p. |
| route /quick-start | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Client Route or Redirect matches /quick-start. |
| route /trip/:id | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Client Route or Redirect matches /trip/:p. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| route POST /api/trips/:id/expert-advisor | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Mounted at server/routes/booking-actions.ts:730. |
| route POST /api/trips/:tripId/advisors | docs/decisions/00382-2026-09-05-slip-one-surface-seventeen.md | holds | Mounted at server/routes/booking-actions.ts:803. |
| guard check-planning-entry (2026-09-05-doors-source-fields) | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /chat | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | Client Route or Redirect matches /chat. |
| route /experiences | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | Client Route or Redirect matches /experiences. |
| route /providers | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | Client Route or Redirect matches /providers. |
| route /ready-made/:id | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | Client Route or Redirect matches /ready-made/:p. |
| route /s/:handle | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | Client Route or Redirect matches /s/:p. |
| test pin plan-entry-source-fields.test.ts (2026-09-05-doors-source-fields) | docs/decisions/00383-2026-09-05-doors-source-fields.md | holds | File is client/src/lib/__tests__/plan-entry-source-fields.test.ts. Ledger lint reports the guard wired. |
| file:line itinerary.tsx:424 | docs/decisions/00384-2026-09-05-slip-switch-reads-events-first.md | gone | No file matches itinerary.tsx. |
| file:line PlanCard.tsx:752 | docs/decisions/00384-2026-09-05-slip-switch-reads-events-first.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/PlanCard.tsx:752 reads: // and would fire on a share link with no live approval data behind it at all). Suppressed in |
| route /api/experience-types | docs/decisions/00384-2026-09-05-slip-switch-reads-events-first.md | holds | Mounted (GET). |
| test pin occasion-switch-readers.test.ts (2026-09-05-slip-switch-reads-events-first) | docs/decisions/00384-2026-09-05-slip-switch-reads-events-first.md | holds | File is client/src/lib/__tests__/occasion-switch-readers.test.ts. Ledger lint reports the guard wired. |
| file:line ai-matched-experts-section.tsx:279 | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | holds | No code symbol was named beside the citation. Line client/src/components/ai-matched-experts-section.tsx:279 reads: <ExpertMatchCard |
| route /cart | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | holds | Client Route or Redirect matches /cart. |
| route PATCH /api/cart/:id | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | holds | Mounted at server/routes.ts:10088. |
| route POST /api/vendor-availability/:id/book | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | gone | No mounted POST /api/vendor-availability/:p/book. |
| test pin cart-quantity.test.ts (2026-09-05-dead-surfaces-and-cart-qty) | docs/decisions/00385-2026-09-05-dead-surfaces-and-cart-qty.md | holds | Basename matches 2 files (client/src/lib/__tests__/cart-quantity.test.ts, shared/__tests__/cart-quantity.test.ts). Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/00386-2026-09-05-mint-market-slug-invariant.md | holds | Mounted at server/routes.ts:1456. |
| test pin mint-market-slug-invariant.test.ts (2026-09-05-mint-market-slug-invariant) | docs/decisions/00386-2026-09-05-mint-market-slug-invariant.md | holds | File is server/__tests__/mint-market-slug-invariant.test.ts. Ledger lint reports the guard wired. |
| guard check-ai-draft-eligibility (2026-09-05-draft-only-on-empty) | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | File is scripts/check-ai-draft-eligibility.cjs. Ledger lint reports the guard wired. |
| route /api/optimization-payments | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Mounted (POST). |
| route /plans/:tripId | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Client Route or Redirect matches /plans/:p. |
| route POST /api/ai/generate-itinerary | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/ai/itineraries/:id/save-as-trip | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Mounted at server/routes/content.routes.ts:5380. |
| route POST /api/grok/itinerary/generate | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | gone | No mounted POST /api/grok/itinerary/generate. |
| route POST /api/quick-start-itinerary | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Mounted at server/routes.ts:12348. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | Mounted at server/routes.ts:1691. |
| test pin ai-draft-eligibility.test.ts (2026-09-05-draft-only-on-empty) | docs/decisions/00387-2026-09-05-draft-only-on-empty.md | holds | File is server/__tests__/ai-draft-eligibility.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ai/generate-itinerary | docs/decisions/00388-2026-09-05-draft-cost-tracking-and-tier.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00388-2026-09-05-draft-cost-tracking-and-tier.md | holds | Mounted at server/routes.ts:1691. |
| test pin ai-draft-eligibility.test.ts (2026-09-05-draft-cost-tracking-and-tier) | docs/decisions/00388-2026-09-05-draft-cost-tracking-and-tier.md | holds | File is server/__tests__/ai-draft-eligibility.test.ts. Ledger lint reports the guard wired. |
| test pin ai-json-parse.test.ts (2026-09-05-draft-cost-tracking-and-tier) | docs/decisions/00388-2026-09-05-draft-cost-tracking-and-tier.md | holds | File is server/__tests__/ai-json-parse.test.ts. Ledger lint reports the guard wired. |
| route GET /api/optimization-fee | docs/decisions/00389-2026-09-05-optimize-preview-on-slip.md | holds | Mounted at server/routes/optimization.routes.ts:283. |
| route GET /api/optimization-preview | docs/decisions/00389-2026-09-05-optimize-preview-on-slip.md | holds | Mounted at server/routes/optimization.routes.ts:181. |
| route POST /api/optimization-preview | docs/decisions/00389-2026-09-05-optimize-preview-on-slip.md | holds | Mounted at server/routes/optimization.routes.ts:76. |
| test pin client/src/components/plancard/__tests__/optimizer-lead.test.tsx (2026-09-05-optimize-preview-on-slip) | docs/decisions/00389-2026-09-05-optimize-preview-on-slip.md | holds | File is client/src/components/plancard/__tests__/optimizer-lead.test.tsx. Ledger lint reports the guard wired. |
| test pin optimize-preview-on-slip.test.ts (2026-09-05-optimize-preview-on-slip) | docs/decisions/00389-2026-09-05-optimize-preview-on-slip.md | holds | File is server/__tests__/optimize-preview-on-slip.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/map-scene.test.ts (2026-09-05-comparison-map-baseline-compare) | docs/decisions/00390-2026-09-05-comparison-map-baseline-compare.md | holds | File is client/src/lib/__tests__/map-scene.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-05-draft-sketch-optimize-plan) | docs/decisions/00391-2026-09-05-draft-sketch-optimize-plan.md | holds | Row is marked advisory; it names no CI guard. |
| route /pricing | docs/decisions/00391-2026-09-05-draft-sketch-optimize-plan.md | holds | Client Route or Redirect matches /pricing. |
| route POST /api/optimization-payments | docs/decisions/00391-2026-09-05-draft-sketch-optimize-plan.md | holds | Mounted at server/routes/optimization.routes.ts:402. |
| route POST /api/optimization-preview | docs/decisions/00391-2026-09-05-draft-sketch-optimize-plan.md | holds | Mounted at server/routes/optimization.routes.ts:76. |
| test pin optimizer-run-authorization.test.ts (2026-09-05-trip-pass-run-gate) | docs/decisions/00392-2026-09-05-trip-pass-run-gate.md | holds | File is server/__tests__/optimizer-run-authorization.test.ts. Ledger lint reports the guard wired. |
| route /api/version | docs/decisions/00393-2026-09-05-build-id-and-map-fallback.md | holds | Mounted (GET). |
| route GET /api/health | docs/decisions/00393-2026-09-05-build-id-and-map-fallback.md | holds | Mounted at server/routes/content.routes.ts:387. |
| route GET /api/provider-services | docs/decisions/00393-2026-09-05-build-id-and-map-fallback.md | holds | Mounted at server/routes.ts:3177. |
| route GET /api/version | docs/decisions/00393-2026-09-05-build-id-and-map-fallback.md | holds | Mounted at server/index.ts:288. |
| test pin build-info.test.ts (2026-09-05-build-id-and-map-fallback) | docs/decisions/00393-2026-09-05-build-id-and-map-fallback.md | holds | File is server/__tests__/build-info.test.ts. Ledger lint reports the guard wired. |
| guard retired with R354 (2026-09-05-template-card-and-preview-door) | docs/decisions/00394-2026-09-05-template-card-and-preview-door.md | holds | Tag on main still records the surface as removed: [retired with R354 — surface removed]. |
| route /plans/:tripId | docs/decisions/00394-2026-09-05-template-card-and-preview-door.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00394-2026-09-05-template-card-and-preview-door.md | holds | Client Route or Redirect matches /trip/:p. |
| guard advisory (2026-09-05-payment-method-posture) | docs/decisions/00395-2026-09-05-payment-method-posture.md | holds | Row is marked advisory; it names no CI guard. |
| route /booking/confirmation | docs/decisions/00396-2026-09-05-wallets-on-platform-intents.md | holds | Client Route or Redirect matches /booking/confirmation. |
| route GET /api/me/payment-methods | docs/decisions/00396-2026-09-05-wallets-on-platform-intents.md | holds | Mounted at server/routes/payment-methods.routes.ts:30. |
| test pin payment-method-posture.test.ts (2026-09-05-wallets-on-platform-intents) | docs/decisions/00396-2026-09-05-wallets-on-platform-intents.md | holds | File is server/__tests__/payment-method-posture.test.ts. Ledger lint reports the guard wired. |
| test pin save-payment-prompt.test.ts (2026-09-05-wallets-on-platform-intents) | docs/decisions/00396-2026-09-05-wallets-on-platform-intents.md | holds | File is client/src/lib/__tests__/save-payment-prompt.test.ts. Ledger lint reports the guard wired. |
| test pin well-known-static.test.ts (2026-09-05-well-known-static) | docs/decisions/00397-2026-09-05-well-known-static.md | holds | File is server/__tests__/well-known-static.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-05-slip-rail-regroup) | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Row is marked advisory; it names no CI guard. |
| route /trip/:id | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Client Route or Redirect matches /trip/:p. |
| route /trips/shared/:token | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Client Route or Redirect matches /trips/shared/:p. |
| route GET /api/trips/:tripId/calendar | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Mounted at server/routes/trips.routes.ts:1363. |
| route PATCH /api/trips/:id | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Mounted at server/routes.ts:1609. |
| route POST /api/conversations/start | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| route POST /api/trips/:id/expert-advisor | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Mounted at server/routes/booking-actions.ts:730. |
| route POST /api/trips/:id/share | docs/decisions/00398-2026-09-05-slip-rail-regroup.md | holds | Mounted at server/routes/booking-actions.ts:576. |
| route DELETE /api/trips/:tripId/itinerary-items/:itemId | docs/decisions/00399-2026-09-05-slip-own-your-plan.md | holds | Mounted at server/routes/trips.routes.ts:3404. |
| route GET /api/trips/:tripId/itinerary-items | docs/decisions/00399-2026-09-05-slip-own-your-plan.md | holds | Mounted at server/routes.ts:13338. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00399-2026-09-05-slip-own-your-plan.md | holds | Mounted at server/routes.ts:13414. |
| test pin item-delete-booked-guard.test.ts (2026-09-05-slip-own-your-plan) | docs/decisions/00399-2026-09-05-slip-own-your-plan.md | holds | File is server/__tests__/item-delete-booked-guard.test.ts. Ledger lint reports the guard wired. |
| test pin slip-own-your-plan.test.ts (2026-09-05-slip-own-your-plan) | docs/decisions/00399-2026-09-05-slip-own-your-plan.md | holds | File is client/src/lib/__tests__/slip-own-your-plan.test.ts. Ledger lint reports the guard wired. |
| route GET /api/affiliate-booking-requests/:id/open | docs/decisions/00400-2026-09-05-affiliate-subid-live.md | holds | Mounted at server/routes/content.routes.ts:7963. |
| route POST /api/affiliate-booking-requests | docs/decisions/00400-2026-09-05-affiliate-subid-live.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| test pin affiliate-subid-attribution.test.ts (2026-09-05-affiliate-subid-live) | docs/decisions/00400-2026-09-05-affiliate-subid-live.md | holds | File is server/__tests__/affiliate-subid-attribution.test.ts. Ledger lint reports the guard wired. |
| route /experts/:id | docs/decisions/00401-2026-09-05-handles-are-claimed.md | holds | Client Route or Redirect matches /experts/:p. |
| route PATCH /api/me/handle | docs/decisions/00401-2026-09-05-handles-are-claimed.md | holds | Mounted at server/routes/storefront.routes.ts:101. |
| test pin handle-claim-prompt.test.ts (2026-09-05-handles-are-claimed) | docs/decisions/00401-2026-09-05-handles-are-claimed.md | holds | File is client/src/lib/__tests__/handle-claim-prompt.test.ts. Ledger lint reports the guard wired. |
| file:line content-query.service.ts:568 | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | No code symbol was named beside the citation. Line server/services/content-query.service.ts:568 reads: ? await tx.insert(itineraryComparisons).values({ |
| file:line content.routes.ts:7534 | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | No code symbol was named beside the citation. Line server/routes/content.routes.ts:7534 reads: city: z.string().optional(), |
| file:line expert/inbox.tsx:462 | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/inbox.tsx:462 reads: </p> |
| file:line expert/workspace.tsx:3121 | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:3121 reads: onClick={() => { setDestDraft(""); setEditingDest(true); }} |
| guard advisory (2026-09-05-ai-booking-agent) | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/amadeus/flights | docs/decisions/00402-2026-09-05-ai-booking-agent.md | gone | No mounted handler matches /api/amadeus/flights. |
| route /api/amadeus/locations | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | Mounted (GET). |
| route GET /api/affiliate-booking-requests/user | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | Mounted at server/routes/content.routes.ts:7900. |
| route POST /api/content/affiliate-redirect | docs/decisions/00402-2026-09-05-ai-booking-agent.md | holds | Mounted at server/routes/content.routes.ts:9260. |
| guard advisory (2026-09-05-slip-decisions-d18-d22) | docs/decisions/00403-2026-09-05-slip-decisions-d18-d22.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00404-2026-09-06-slip-small-additions.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| route POST /api/conversations/start | docs/decisions/00404-2026-09-06-slip-small-additions.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| test pin advisor-conversation-context.test.ts (2026-09-06-slip-small-additions) | docs/decisions/00404-2026-09-06-slip-small-additions.md | holds | File is server/__tests__/advisor-conversation-context.test.ts. Ledger lint reports the guard wired. |
| guard scripts/lib/slip-action-inventory.cjs (2026-09-06-slip-conformance) | docs/decisions/00405-2026-09-06-slip-conformance.md | holds | File is scripts/lib/slip-action-inventory.cjs. Ledger lint reports the guard wired. |
| test pin slip-conformance.test.ts (2026-09-06-slip-conformance) | docs/decisions/00405-2026-09-06-slip-conformance.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin plancard-origin-exposure.test.ts (2026-09-06-item-origin-chip) | docs/decisions/00406-2026-09-06-item-origin-chip.md | holds | File is server/__tests__/plancard-origin-exposure.test.ts. Ledger lint reports the guard wired. |
| guard scripts/lib/slip-action-inventory.cjs (2026-09-06-role-chips-filter) | docs/decisions/00407-2026-09-06-role-chips-filter.md | holds | File is scripts/lib/slip-action-inventory.cjs. Ledger lint reports the guard wired. |
| route /api/service-categories | docs/decisions/00407-2026-09-06-role-chips-filter.md | holds | Mounted (GET/POST). |
| route /services | docs/decisions/00407-2026-09-06-role-chips-filter.md | holds | Client Route or Redirect matches /services. |
| test pin slip-conformance.test.ts (2026-09-06-role-chips-filter) | docs/decisions/00407-2026-09-06-role-chips-filter.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| file:line client/src/components/trip/plan-modal.tsx:985 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | commitPlan is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:813. |
| file:line plan-modal.tsx:1020 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | No code symbol was named beside the citation. Line client/src/components/trip/plan-modal.tsx:1020 reads: * `2026-09-06-event-mint-dedupe`). An event inside a plan IS a `user_experiences` row bound |
| file:line plan-modal.tsx:1117-1132 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | readPendingEvents is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:483. |
| file:line plan-modal.tsx:475 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | drifted | readPendingEvents is not on the cited lines. It is at client/src/components/trip/plan-modal.tsx:483. |
| file:line server/storage.ts:1459 | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | No code symbol was named beside the citation. Line server/storage.ts:1459 reads: getFullComparisonByTripId(tripId: string): Promise<any \| null>; |
| route /api/user-experiences | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | Mounted (GET/POST). |
| route PATCH /api/user-experiences/:id | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | Mounted at server/routes/content.routes.ts:2008. |
| route POST /api/trips | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | Mounted at server/routes.ts:1456. |
| route POST /api/user-experiences | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | Mounted at server/routes/content.routes.ts:1965. |
| test pin event-mint-dedupe.test.ts (2026-09-06-event-mint-dedupe) | docs/decisions/00408-2026-09-06-event-mint-dedupe.md | holds | File is client/src/lib/__tests__/event-mint-dedupe.test.ts. Ledger lint reports the guard wired. |
| guard check-category-reachability.cjs (2026-09-06-category-key-repair) | docs/decisions/00409-2026-09-06-category-key-repair.md | holds | File is scripts/check-category-reachability.cjs. Ledger lint reports the guard wired. |
| guard check-roles-needed-reachability.cjs (2026-09-06-category-key-repair) | docs/decisions/00409-2026-09-06-category-key-repair.md | holds | File is scripts/check-roles-needed-reachability.cjs. Ledger lint reports the guard wired. |
| route GET /api/service-categories | docs/decisions/00409-2026-09-06-category-key-repair.md | holds | Mounted at server/routes/content.routes.ts:1025. |
| guard publish-preflight (2026-09-06-publish-preflight) | docs/decisions/00410-2026-09-06-publish-preflight.md | holds | File is scripts/publish-preflight.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-06-operating-procedure) | docs/decisions/00411-2026-09-06-operating-procedure.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/optimization-preview | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | Mounted at server/routes/optimization.routes.ts:181. |
| route POST /api/itinerary-comparisons | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | Mounted at server/routes.ts:10334. |
| route POST /api/itinerary-comparisons/:id/apply-to-trip | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | Mounted at server/routes/plancard.routes.ts:120. |
| route POST /api/itinerary-comparisons/:id/generate | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | Mounted at server/routes.ts:10731. |
| route POST /api/trips/:tripId/itinerary/optimize-order | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | Mounted at server/routes.ts:13728. |
| test pin optimizer-run-predicate.test.ts (2026-09-06-optimizer-run-predicate) | docs/decisions/00412-2026-09-06-optimizer-run-predicate.md | holds | File is server/__tests__/optimizer-run-predicate.test.ts. Ledger lint reports the guard wired. |
| file:line build.yml:390 | docs/decisions/00413-2026-09-06-expert-work-protected.md | holds | No code symbol was named beside the citation. Line .github/workflows/build.yml:390 reads: if { [ "$rc" -eq 1 ] \|\| [ "$rc" -eq 2 ]; } && [ "$count" -gt 0 ]; then reported=yes; fi |
| test pin expert-work-protected.test.ts (2026-09-06-expert-work-protected) | docs/decisions/00413-2026-09-06-expert-work-protected.md | holds | File is server/__tests__/expert-work-protected.test.ts. Ledger lint reports the guard wired. |
| route /cart | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | Client Route or Redirect matches /cart. |
| route /dashboard | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | Client Route or Redirect matches /dashboard. |
| route /experts | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | Client Route or Redirect matches /experts. |
| route /experts/:id | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | Client Route or Redirect matches /experts/:p. |
| route /services/:id | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | Client Route or Redirect matches /services/:p. |
| test pin console-grammar.test.ts (2026-09-07-console-one-grammar-code) | docs/decisions/00414-2026-09-07-console-one-grammar-code.md | holds | File is client/src/lib/__tests__/console-grammar.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-07-concierge-conversation-trip-id) | docs/decisions/00415-2026-09-07-concierge-conversation-trip-id.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-07-concierge-page-is-a-door) | docs/decisions/00416-2026-09-07-concierge-page-is-a-door.md | holds | Row is marked advisory; it names no CI guard. |
| route /concierge | docs/decisions/00416-2026-09-07-concierge-page-is-a-door.md | holds | Client Route or Redirect matches /concierge. |
| route /quick-start | docs/decisions/00416-2026-09-07-concierge-page-is-a-door.md | holds | Client Route or Redirect matches /quick-start. |
| guard advisory (2026-09-07-ask-ai-drawer-paid-task) | docs/decisions/00417-2026-09-07-ask-ai-drawer-paid-task.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-07-trip-cart-leaves-sidebar) | docs/decisions/00418-2026-09-07-trip-cart-leaves-sidebar.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/cart | docs/decisions/00418-2026-09-07-trip-cart-leaves-sidebar.md | holds | Mounted (DELETE/GET/POST). |
| route /cart | docs/decisions/00418-2026-09-07-trip-cart-leaves-sidebar.md | holds | Client Route or Redirect matches /cart. |
| guard advisory (2026-09-07-my-events-folds-into-my-plans) | docs/decisions/00419-2026-09-07-my-events-folds-into-my-plans.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-07-trip-card-loses-tab-shell) | docs/decisions/00420-2026-09-07-trip-card-loses-tab-shell.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-07-console-one-grammar) | docs/decisions/00421-2026-09-07-console-one-grammar.md | holds | Row is marked advisory; it names no CI guard. |
| route /cart | docs/decisions/00421-2026-09-07-console-one-grammar.md | holds | Client Route or Redirect matches /cart. |
| route /dashboard | docs/decisions/00421-2026-09-07-console-one-grammar.md | holds | Client Route or Redirect matches /dashboard. |
| route /discover/location/:city | docs/decisions/00421-2026-09-07-console-one-grammar.md | holds | Client Route or Redirect matches /discover/location/:p. |
| route /experts | docs/decisions/00421-2026-09-07-console-one-grammar.md | holds | Client Route or Redirect matches /experts. |
| guard advisory (2026-09-07-home-owns-time-axis) | docs/decisions/00422-2026-09-07-home-owns-time-axis.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me/plan-activity | docs/decisions/00422-2026-09-07-home-owns-time-axis.md | holds | Mounted (GET). |
| route GET /api/me/upcoming | docs/decisions/00422-2026-09-07-home-owns-time-axis.md | holds | Mounted at server/routes/upcoming.routes.ts:33. |
| guard advisory (2026-09-07-slip-canvas-unrecoverable) | docs/decisions/00423-2026-09-07-slip-canvas-unrecoverable.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-07-dev-entry-cross-platform) | docs/decisions/00424-2026-09-07-dev-entry-cross-platform.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/health | docs/decisions/00424-2026-09-07-dev-entry-cross-platform.md | holds | Mounted (GET). |
| route /api/ready | docs/decisions/00424-2026-09-07-dev-entry-cross-platform.md | holds | Mounted (GET). |
| route /api/trips/:id/plancard | docs/decisions/00425-2026-09-07-my-plans-rows.md | holds | Mounted (GET). |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00425-2026-09-07-my-plans-rows.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| test pin plan-row-model.test.ts (2026-09-07-my-plans-rows) | docs/decisions/00425-2026-09-07-my-plans-rows.md | holds | File is client/src/lib/__tests__/plan-row-model.test.ts. Ledger lint reports the guard wired. |
| guard check-planning-entry (2026-09-07-home-honesty) | docs/decisions/00426-2026-09-07-home-honesty.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route GET /api/trips/mine/advisors | docs/decisions/00426-2026-09-07-home-honesty.md | holds | Mounted at server/routes/booking-actions.ts:923. |
| guard check-planning-entry (2026-09-07-start-with-ai-door) | docs/decisions/00427-2026-09-07-start-with-ai-door.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/00427-2026-09-07-start-with-ai-door.md | holds | Mounted at server/routes.ts:1456. |
| guard check-trip-card-honesty (2026-09-07-trip-card-honesty) | docs/decisions/00428-2026-09-07-trip-card-honesty.md | holds | File is scripts/check-trip-card-honesty.cjs. Ledger lint reports the guard wired. |
| route GET /api/geocode | docs/decisions/00428-2026-09-07-trip-card-honesty.md | holds | Mounted at server/routes/content.routes.ts:6611. |
| test pin hero-photo-honesty.test.ts (2026-09-07-trip-card-honesty) | docs/decisions/00428-2026-09-07-trip-card-honesty.md | holds | File is client/src/components/plancard/__tests__/hero-photo-honesty.test.ts. Ledger lint reports the guard wired. |
| route /services | docs/decisions/00429-2026-09-07-client-pen-scope.md | holds | Client Route or Redirect matches /services. |
| route GET /api/auth/user | docs/decisions/00429-2026-09-07-client-pen-scope.md | holds | Mounted at server/replit_integrations/auth/routes.ts:152. |
| route PUT /api/trip-context | docs/decisions/00429-2026-09-07-client-pen-scope.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| test pin client-pen-scope.test.ts (2026-09-07-client-pen-scope) | docs/decisions/00429-2026-09-07-client-pen-scope.md | holds | File is client/src/lib/__tests__/client-pen-scope.test.ts. Ledger lint reports the guard wired. |
| route /api/expert-requests | docs/decisions/00430-2026-09-07-request-is-a-click.md | holds | Mounted (GET/POST). |
| route /experiences/:slug | docs/decisions/00430-2026-09-07-request-is-a-click.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /quick-start | docs/decisions/00430-2026-09-07-request-is-a-click.md | holds | Client Route or Redirect matches /quick-start. |
| route POST /api/expert-requests | docs/decisions/00430-2026-09-07-request-is-a-click.md | holds | Mounted at server/routes/booking-actions.ts:206. |
| test pin expert-request-review.test.ts (2026-09-07-request-is-a-click) | docs/decisions/00430-2026-09-07-request-is-a-click.md | holds | File is client/src/lib/__tests__/expert-request-review.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-07-impact-class) | docs/decisions/00431-2026-09-07-impact-class.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-planning-entry (2026-09-07-concierge-door) | docs/decisions/00432-2026-09-07-concierge-door.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /api/expert-requests | docs/decisions/00432-2026-09-07-concierge-door.md | holds | Mounted (GET/POST). |
| route /concierge | docs/decisions/00432-2026-09-07-concierge-door.md | holds | Client Route or Redirect matches /concierge. |
| route GET /api/experience-types | docs/decisions/00432-2026-09-07-concierge-door.md | holds | Mounted at server/routes/content.routes.ts:1255. |
| route POST /api/concierge/quote | docs/decisions/00432-2026-09-07-concierge-door.md | holds | Mounted at server/routes/concierge.routes.ts:251. |
| route POST /api/trips | docs/decisions/00432-2026-09-07-concierge-door.md | holds | Mounted at server/routes.ts:1456. |
| test pin concierge-tiers.test.ts (2026-09-07-concierge-door) | docs/decisions/00432-2026-09-07-concierge-door.md | holds | File is client/src/lib/__tests__/concierge-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin expert-request-review.test.ts (2026-09-07-concierge-door) | docs/decisions/00432-2026-09-07-concierge-door.md | holds | File is client/src/lib/__tests__/expert-request-review.test.ts. Ledger lint reports the guard wired. |
| guard trip-card-one-page (2026-09-07-trip-card-one-page) | docs/decisions/00433-2026-09-07-trip-card-one-page.md | holds | File is client/src/lib/__tests__/trip-card-one-page.test.ts. Ledger lint reports the guard wired. |
| route /itinerary/:id | docs/decisions/00433-2026-09-07-trip-card-one-page.md | holds | Client Route or Redirect matches /itinerary/:p. |
| route /plans/:tripId | docs/decisions/00433-2026-09-07-trip-card-one-page.md | holds | Client Route or Redirect matches /plans/:p. |
| route GET /api/affiliate-booking-requests/user | docs/decisions/00433-2026-09-07-trip-card-one-page.md | holds | Mounted at server/routes/content.routes.ts:7900. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00433-2026-09-07-trip-card-one-page.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| guard check-query-userid-reads (2026-09-07-home-time-axis) | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | File is scripts/check-query-userid-reads.cjs. Ledger lint reports the guard wired. |
| guard home-time-axis (2026-09-07-home-time-axis) | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Basename matches 2 files (client/src/lib/home-time-axis.ts, client/src/lib/__tests__/home-time-axis.test.ts). Ledger lint reports the guard wired. |
| route /api/me/plan-activity | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Mounted (GET). |
| route /api/travelpulse/cities | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Mounted (GET). |
| route /dashboard | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Client Route or Redirect matches /dashboard. |
| route /plans/:tripId | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Client Route or Redirect matches /plans/:p. |
| route GET /api/me/home-city | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Mounted at server/routes/occasions.routes.ts:179. |
| route GET /api/me/upcoming | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Mounted at server/routes/upcoming.routes.ts:33. |
| route GET /api/trips/mine/advisors | docs/decisions/00434-2026-09-07-home-time-axis.md | holds | Mounted at server/routes/booking-actions.ts:923. |
| guard my-events-fold (2026-09-07-my-events-fold) | docs/decisions/00435-2026-09-07-my-events-fold.md | holds | No file is named my-events-fold. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| route /concierge | docs/decisions/00435-2026-09-07-my-events-fold.md | holds | Client Route or Redirect matches /concierge. |
| route /my-events | docs/decisions/00435-2026-09-07-my-events-fold.md | holds | Client Route or Redirect matches /my-events. |
| route GET /api/coordination-states | docs/decisions/00435-2026-09-07-my-events-fold.md | holds | Mounted at server/routes.ts:11220. |
| guard inbox-context (2026-09-07-inbox-context) | docs/decisions/00436-2026-09-07-inbox-context.md | holds | Basename matches 2 files (client/src/lib/inbox-context.ts, client/src/lib/__tests__/inbox-context.test.ts). Ledger lint reports the guard wired. |
| route GET /api/messages | docs/decisions/00436-2026-09-07-inbox-context.md | holds | Mounted at server/routes/messages.ts:80. |
| guard home-gate (2026-09-07-home-gate) | docs/decisions/00437-2026-09-07-home-gate.md | holds | File is playwright/tests/home-gate.spec.ts. Ledger lint reports the guard wired. |
| route /dashboard | docs/decisions/00437-2026-09-07-home-gate.md | holds | Client Route or Redirect matches /dashboard. |
| guard advisory (2026-09-07-register-answers) | docs/decisions/00438-2026-09-07-register-answers.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-trip-route-shadows (2026-09-07-shadowed-trip-twins) | docs/decisions/00439-2026-09-07-shadowed-trip-twins.md | holds | File is scripts/check-trip-route-shadows.cjs. Ledger lint reports the guard wired. |
| route /cart | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /cart. |
| route /destinations | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /destinations. |
| route /discover/location/:city | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /discover/location/:p. |
| route /events | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /events. |
| route /experts | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /experts. |
| route /ready-made | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /ready-made. |
| route /services | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Client Route or Redirect matches /services. |
| route GET /api/user-experiences | docs/decisions/00440-2026-09-07-discover-in-shell.md | holds | Mounted at server/routes/content.routes.ts:1871. |
| guard check-planning-entry (2026-09-07-doors-pass-tripid) | docs/decisions/00441-2026-09-07-doors-pass-tripid.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route POST /api/trip-context/extract | docs/decisions/00442-2026-09-07-extraction-date-anchor.md | holds | Mounted at server/routes/trip-context.routes.ts:381. |
| route /api/my-bookings | docs/decisions/00443-2026-09-07-bookings-by-plan.md | holds | Mounted (GET). |
| route GET /api/trips/mine/advisors | docs/decisions/00444-2026-09-07-orphan-sweep.md | holds | Mounted at server/routes/booking-actions.ts:923. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00445-2026-09-07-all-advisors-reader.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| route /api/concierge/quote | docs/decisions/00446-2026-09-07-concierge-trip-ownership.md | holds | Mounted (POST). |
| route POST /api/concierge/requests | docs/decisions/00446-2026-09-07-concierge-trip-ownership.md | holds | Mounted at server/routes/concierge.routes.ts:194. |
| route /api/cart | docs/decisions/00447-2026-09-08-cart-fee-line.md | holds | Mounted (DELETE/GET/POST). |
| route /api/checkout | docs/decisions/00447-2026-09-08-cart-fee-line.md | holds | Mounted (POST). |
| guard advisory (2026-09-08-ask-ai-drawer-brief) | docs/decisions/00448-2026-09-08-ask-ai-drawer-brief.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/affiliate-booking-requests/:id | docs/decisions/00449-2026-09-08-agent-phase-zero.md | holds | Mounted at server/routes/content.routes.ts:8120. |
| route GET /api/service-bookings | docs/decisions/00451-2026-09-08-recorded-cleanups.md | holds | Mounted at server/routes.ts:6921. |
| guard advisory (2026-09-08-rulings-11-12) | docs/decisions/00454-2026-09-08-rulings-11-12.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-08-assignment-is-claimed) | docs/decisions/00455-2026-09-08-assignment-is-claimed.md | holds | Row is marked advisory; it names no CI guard. |
| file:line BookingFlowModal.tsx:257 | docs/decisions/00456-2026-09-08-punchlist.md | gone | No file matches BookingFlowModal.tsx. |
| file:line transport-hub.routes.ts:353-354 | docs/decisions/00456-2026-09-08-punchlist.md | holds | No code symbol was named beside the citation. Line server/routes/transport-hub.routes.ts:353-354 reads: if (option.bookingType !== "platform") { |
| guard advisory (2026-09-08-punchlist) | docs/decisions/00456-2026-09-08-punchlist.md | holds | Row is marked advisory; it names no CI guard. |
| guard confirm-honesty (2026-09-08-transport-confirm-timing) | docs/decisions/00457-2026-09-08-transport-confirm-timing.md | holds | File is server/__tests__/confirm-honesty.test.ts. Ledger lint reports the guard wired. |
| route POST /api/transport-booking-options/:optionId/book | docs/decisions/00457-2026-09-08-transport-confirm-timing.md | holds | Mounted at server/routes/transport-hub.routes.ts:333. |
| guard confirm-honesty (2026-09-08-confirmation-code-is-the-server-s) | docs/decisions/00458-2026-09-08-confirmation-code-is-the-server-s.md | holds | File is server/__tests__/confirm-honesty.test.ts. Ledger lint reports the guard wired. |
| route /api/bookings/bulk-status | docs/decisions/00458-2026-09-08-confirmation-code-is-the-server-s.md | holds | Mounted (POST). |
| guard advisory (2026-09-11-one-decision-register) | docs/decisions/00459-2026-09-11-one-decision-register.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-11-commerce-contract-plan) | docs/decisions/00460-2026-09-11-commerce-contract-plan.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-11-oc-a1-ratified) | docs/decisions/00461-2026-09-11-oc-a1-ratified.md | holds | Row is marked advisory; it names no CI guard. |
| test pin booking-mode-provenance.test.ts (2026-09-11-booking-mode-provenance) | docs/decisions/00462-2026-09-11-booking-mode-provenance.md | holds | File is shared/__tests__/booking-mode-provenance.test.ts. Ledger lint reports the guard wired. |
| test pin offering-commerce-contract.test.ts (2026-09-11-offering-commerce-resolver) | docs/decisions/00463-2026-09-11-offering-commerce-resolver.md | holds | File is server/__tests__/offering-commerce-contract.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/provider/services | docs/decisions/00464-2026-09-11-offering-activation-validation.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| test pin offering-activation-gate.test.ts (2026-09-11-offering-activation-validation) | docs/decisions/00464-2026-09-11-offering-activation-validation.md | holds | File is server/__tests__/offering-activation-gate.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings | docs/decisions/00465-2026-09-12-offering-contract-snapshot.md | holds | Mounted at server/routes.ts:7605. |
| test pin offering-contract-snapshot.test.ts (2026-09-12-offering-contract-snapshot) | docs/decisions/00465-2026-09-12-offering-contract-snapshot.md | holds | File is server/__tests__/offering-contract-snapshot.test.ts. Ledger lint reports the guard wired. |
| guard archetype-fixtures (2026-09-12-archetype-fixtures) | docs/decisions/00466-2026-09-12-archetype-fixtures.md | holds | No file is named archetype-fixtures. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| route POST /api/bookings | docs/decisions/00466-2026-09-12-archetype-fixtures.md | holds | Mounted at server/routes.ts:7605. |
| file:line server/routes.ts:6571 | docs/decisions/00467-2026-09-12-archetype-findings.md | holds | No code symbol was named beside the citation. Line server/routes.ts:6571 reads: }); |
| guard advisory (2026-09-12-archetype-findings) | docs/decisions/00467-2026-09-12-archetype-findings.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/bookings | docs/decisions/00467-2026-09-12-archetype-findings.md | holds | Mounted at server/routes.ts:7605. |
| guard advisory (2026-09-12-listing-names-its-expert-offering) | docs/decisions/00468-2026-09-12-listing-names-its-expert-offering.md | holds | Row is marked advisory; it names no CI guard. |
| route /earn | docs/decisions/00468-2026-09-12-listing-names-its-expert-offering.md | holds | Client Route or Redirect matches /earn. |
| guard booking-birth-provenance (2026-09-12-booking-birth-holes) | docs/decisions/00469-2026-09-12-booking-birth-holes.md | holds | File is server/__tests__/booking-birth-provenance.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings | docs/decisions/00469-2026-09-12-booking-birth-holes.md | holds | Mounted at server/routes.ts:7605. |
| guard confirm-honesty (2026-09-12-transport-status-self-report-gate) | docs/decisions/00470-2026-09-12-transport-status-self-report-gate.md | holds | File is server/__tests__/confirm-honesty.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/transport-booking-options/:optionId/status | docs/decisions/00470-2026-09-12-transport-status-self-report-gate.md | gone | No mounted PATCH /api/transport-booking-options/:p/status. |
| guard archetype-fixtures (2026-09-12-listing-expert-offering-key) | docs/decisions/00471-2026-09-12-listing-expert-offering-key.md | holds | No file is named archetype-fixtures. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| guard offering-activation-gate (2026-09-12-listing-expert-offering-key) | docs/decisions/00471-2026-09-12-listing-expert-offering-key.md | holds | File is server/__tests__/offering-activation-gate.test.ts. Ledger lint reports the guard wired. |
| route /api/provider/services | docs/decisions/00471-2026-09-12-listing-expert-offering-key.md | holds | Mounted (GET/POST). |
| guard confirm-honesty (2026-09-12-delete-dead-transport-status) | docs/decisions/00472-2026-09-12-delete-dead-transport-status.md | holds | File is server/__tests__/confirm-honesty.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/transport-booking-options/:optionId/status | docs/decisions/00472-2026-09-12-delete-dead-transport-status.md | gone | No mounted PATCH /api/transport-booking-options/:p/status. |
| guard offering-activation-gate (2026-09-12-offering-key-is-canonical) | docs/decisions/00473-2026-09-12-offering-key-is-canonical.md | holds | File is server/__tests__/offering-activation-gate.test.ts. Ledger lint reports the guard wired. |
| route /api/cart | docs/decisions/00473-2026-09-12-offering-key-is-canonical.md | holds | Mounted (DELETE/GET/POST). |
| route /api/cart/fee-preview | docs/decisions/00473-2026-09-12-offering-key-is-canonical.md | holds | Mounted (GET). |
| guard fee-band-admin-guards (2026-09-12-fee-band-admin-gaps) | docs/decisions/00474-2026-09-12-fee-band-admin-gaps.md | holds | File is server/__tests__/fee-band-admin-guards.test.ts. Ledger lint reports the guard wired. |
| guard reconciliation-detection (2026-09-12-readymade-reconciliation-rail) | docs/decisions/00475-2026-09-12-readymade-reconciliation-rail.md | holds | File is server/__tests__/reconciliation-detection.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/admin/reconciliation/exceptions | docs/decisions/00475-2026-09-12-readymade-reconciliation-rail.md | holds | Mounted at server/routes/admin.routes.ts:2161. |
| guard reconciliation-detection (2026-09-12-readymade-recovery-path) | docs/decisions/00476-2026-09-12-readymade-recovery-path.md | holds | File is server/__tests__/reconciliation-detection.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ready-made/:id/purchase | docs/decisions/00476-2026-09-12-readymade-recovery-path.md | holds | Mounted at server/routes/ready-made.routes.ts:1386. |
| route POST /api/ready-made/:id/purchase/confirm | docs/decisions/00476-2026-09-12-readymade-recovery-path.md | holds | Mounted at server/routes/ready-made.routes.ts:1481. |
| guard reconciliation-detection (2026-09-12-readymade-earning-retry) | docs/decisions/00477-2026-09-12-readymade-earning-retry.md | holds | File is server/__tests__/reconciliation-detection.db.test.ts. Ledger lint reports the guard wired. |
| guard cart-priceless-listing (2026-09-13-cart-priceless-gap) | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | File is server/__tests__/cart-priceless-listing.http.test.ts. Ledger lint reports the guard wired. |
| route /api/cart/fee-preview | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted (GET). |
| route GET /api/cart | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:9468. |
| route GET /api/services/:id | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| route PATCH /api/cart/:id | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:10088. |
| route POST /api/auth/register | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| route POST /api/bookings | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:7605. |
| route POST /api/cart | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/cart/items | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:7464. |
| route POST /api/cart/resolve-trip | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes.ts:9690. |
| route POST /api/checkout | docs/decisions/00478-2026-09-13-cart-priceless-gap.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| guard advisory (2026-09-13-cart-quantity-means-what) | docs/decisions/00479-2026-09-13-cart-quantity-means-what.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-13-guest-optimization-is-a-plan-gap) | docs/decisions/00480-2026-09-13-guest-optimization-is-a-plan-gap.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/cart/resolve-trip | docs/decisions/00480-2026-09-13-guest-optimization-is-a-plan-gap.md | holds | Mounted at server/routes.ts:9690. |
| guard guest-cart-becomes-plan (2026-09-13-guest-cart-becomes-plan) | docs/decisions/00481-2026-09-13-guest-cart-becomes-plan.md | holds | File is server/__tests__/guest-cart-becomes-plan.http.test.ts. Ledger lint reports the guard wired. |
| route /api/cart/convert-to-itinerary | docs/decisions/00481-2026-09-13-guest-cart-becomes-plan.md | holds | Mounted (POST). |
| route /cart | docs/decisions/00481-2026-09-13-guest-cart-becomes-plan.md | holds | Client Route or Redirect matches /cart. |
| route POST /api/cart/resolve-trip | docs/decisions/00481-2026-09-13-guest-cart-becomes-plan.md | holds | Mounted at server/routes.ts:9690. |
| route POST /api/checkout | docs/decisions/00481-2026-09-13-guest-cart-becomes-plan.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| guard service-buy-action (2026-09-13-service-detail-buy-action) | docs/decisions/00482-2026-09-13-service-detail-buy-action.md | holds | Basename matches 2 files (client/src/lib/service-buy-action.ts, client/src/lib/__tests__/service-buy-action.test.ts). Ledger lint reports the guard wired. |
| route GET /api/services/:id | docs/decisions/00482-2026-09-13-service-detail-buy-action.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| guard ready-made-clone-fields (2026-09-13-clone-carries-content-not-state) | docs/decisions/00483-2026-09-13-clone-carries-content-not-state.md | holds | File is server/__tests__/ready-made-clone-fields.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-13-punchlist-reverified) | docs/decisions/00484-2026-09-13-punchlist-reverified.md | holds | Row is marked advisory; it names no CI guard. |
| guard linkage-preservation (2026-09-13-delete-bulk-insert-itinerary-items) | docs/decisions/00485-2026-09-13-delete-bulk-insert-itinerary-items.md | holds | File is scripts/check-linkage-preservation.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-13-clone-backfill-not-owed) | docs/decisions/00486-2026-09-13-clone-backfill-not-owed.md | holds | Row is marked advisory; it names no CI guard. |
| guard publish-preflight (2026-09-13-preflight-deployment-checkpoint) | docs/decisions/00487-2026-09-13-preflight-deployment-checkpoint.md | holds | File is scripts/publish-preflight.cjs. Ledger lint reports the guard wired. |
| file:line publish-gate-and-fundamentals-gate.yml:272 | docs/decisions/00488-2026-09-13-test-files-wired.md | holds | No code symbol was named beside the citation. Line .github/workflows/publish-gate-and-fundamentals-gate.yml:272 reads: echo "::error::publish-gate-and-fundamentals: one or more of the 5 suites (38 proofs) failed — see the verdict table in the run summary." |
| guard check-test-files-wired (2026-09-13-test-files-wired) | docs/decisions/00488-2026-09-13-test-files-wired.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| file:line .github/workflows/publish-gate-and-fundamentals-gate.yml:272 | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | No code symbol was named beside the citation. Line .github/workflows/publish-gate-and-fundamentals-gate.yml:272 reads: echo "::error::publish-gate-and-fundamentals: one or more of the 5 suites (38 proofs) failed — see the verdict table in the run summary." |
| guard check-test-files-wired (2026-09-14-test-files-wired-orphans) | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| route /api/ready | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Mounted (GET). |
| route /cart | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /cart. |
| route /discover-experiences | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /discover-experiences. |
| route /itinerary/:id | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /itinerary/:p. |
| route /my-itinerary/:id | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /my-itinerary/:p. |
| route /p/:handle | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /p/:p. |
| route /plans/:tripId | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /plans/:p. |
| route /s/:handle | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /s/:p. |
| route /trip/:id | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Client Route or Redirect matches /trip/:p. |
| route POST /api/trips | docs/decisions/00489-2026-09-14-test-files-wired-orphans.md | holds | Mounted at server/routes.ts:1456. |
| guard advisory (2026-09-14-required-check-names) | docs/decisions/00490-2026-09-14-required-check-names.md | holds | Row is marked advisory; it names no CI guard. |
| file:line discover.tsx:494 | docs/decisions/00491-2026-09-14-price-unit-one-derivation.md | holds | No code symbol was named beside the citation. Line client/src/pages/discover.tsx:494 reads: ).toUpperCase(); |
| guard advisory (2026-09-14-price-unit-one-derivation) | docs/decisions/00491-2026-09-14-price-unit-one-derivation.md | holds | Row is marked advisory; it names no CI guard. |
| route /services/:id | docs/decisions/00491-2026-09-14-price-unit-one-derivation.md | holds | Client Route or Redirect matches /services/:p. |
| guard advisory (2026-09-14-direct-booking-panel-conditioned) | docs/decisions/00492-2026-09-14-direct-booking-panel-conditioned.md | holds | Row is marked advisory; it names no CI guard. |
| guard transport-payment-intent (2026-09-14-transport-confirm-stamps-pi) | docs/decisions/00493-2026-09-14-transport-confirm-stamps-pi.md | holds | File is server/__tests__/transport-payment-intent.db.test.ts. Ledger lint reports the guard wired. |
| guard transport-payment-intent (2026-09-14-transport-card-cancel) | docs/decisions/00494-2026-09-14-transport-card-cancel.md | holds | File is server/__tests__/transport-payment-intent.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings/:id/cancel | docs/decisions/00494-2026-09-14-transport-card-cancel.md | holds | Mounted at server/routes.ts:8612. |
| guard advisory (2026-09-14-trips-mint-400) | docs/decisions/00495-2026-09-14-trips-mint-400.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/auth/user | docs/decisions/00495-2026-09-14-trips-mint-400.md | holds | Mounted (GET). |
| route POST /api/trips | docs/decisions/00495-2026-09-14-trips-mint-400.md | holds | Mounted at server/routes.ts:1456. |
| guard ready-made-clone-fields (2026-09-14-readymade-notifications) | docs/decisions/00496-2026-09-14-readymade-notifications.md | holds | File is server/__tests__/ready-made-clone-fields.db.test.ts. Ledger lint reports the guard wired. |
| guard ready-made-clone-fields (2026-09-14-clone-items-are-expert-work) | docs/decisions/00497-2026-09-14-clone-items-are-expert-work.md | holds | File is server/__tests__/ready-made-clone-fields.db.test.ts. Ledger lint reports the guard wired. |
| file:line buy-action-payload.ts:188-203 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | resolveBuyAction is not on the cited lines. It is at server/services/buy-action-payload.ts:292. |
| file:line plan-modal.tsx:880-891 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | trip_contexts is not in client/src/components/trip/plan-modal.tsx. Cited line now reads: |
| file:line ready-made-purchase.service.ts:219-221 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | durationDays is not on the cited lines. It is at server/services/ready-made-purchase.service.ts:226. |
| file:line trip-plan.service.ts:774-860 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | holds | providerServiceId is still on server/services/trip-plan.service.ts:774-860. |
| file:line trips.routes.ts:3163-3179 | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | drifted | trip_contexts is not in server/routes/trips.routes.ts. Cited line now reads: } catch (err) { |
| guard advisory (2026-09-14-clone-date-revalidation) | docs/decisions/00498-2026-09-14-clone-date-revalidation.md | holds | Row is marked advisory; it names no CI guard. |
| file:line server/routes.ts:1339 | docs/decisions/00499-2026-09-14-guest-trip-mint-responds.md | holds | No code symbol was named beside the citation. Line server/routes.ts:1339 reads: app.use(profilePhotoRoutes); |
| guard guest-trip-mint-responds (2026-09-14-guest-trip-mint-responds) | docs/decisions/00499-2026-09-14-guest-trip-mint-responds.md | holds | File is server/__tests__/guest-trip-mint-responds.http.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/00499-2026-09-14-guest-trip-mint-responds.md | holds | Mounted at server/routes.ts:1456. |
| guard plan-work-one-rail (2026-09-15-plan-work-one-rail) | docs/decisions/00500-2026-09-15-plan-work-one-rail.md | holds | No file is named plan-work-one-rail. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| guard booking-agent-claim (2026-09-15-booking-agent-claim) | docs/decisions/00501-2026-09-15-booking-agent-claim.md | holds | Basename matches 3 files (client/src/lib/booking-agent-claim.ts, server/__tests__/booking-agent-claim.db.test.ts, client/src/lib/__tests__/booking-agent-claim.test.ts). Ledger lint reports the guard wired. |
| route POST /api/affiliate-booking-requests | docs/decisions/00501-2026-09-15-booking-agent-claim.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| route POST /api/affiliate-booking-requests/:id/claim | docs/decisions/00501-2026-09-15-booking-agent-claim.md | holds | Mounted at server/routes/content.routes.ts:8062. |
| guard offering-activation-gate (2026-09-15-offering-key-id-drop) | docs/decisions/00502-2026-09-15-offering-key-id-drop.md | holds | File is server/__tests__/offering-activation-gate.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-15-ask-ai-drawer-brief-v2) | docs/decisions/00503-2026-09-15-ask-ai-drawer-brief-v2.md | holds | Row is marked advisory; it names no CI guard. |
| guard service-buy-action (2026-09-15-buy-label-cards) | docs/decisions/00504-2026-09-15-buy-label-cards.md | holds | Basename matches 2 files (client/src/lib/service-buy-action.ts, client/src/lib/__tests__/service-buy-action.test.ts). Ledger lint reports the guard wired. |
| route /p/:handle | docs/decisions/00504-2026-09-15-buy-label-cards.md | holds | Client Route or Redirect matches /p/:p. |
| route GET /api/provider/services | docs/decisions/00504-2026-09-15-buy-label-cards.md | holds | Mounted at server/routes.ts:3256. |
| guard advisory (2026-09-15-d1-ready-made-editable-template) | docs/decisions/00505-2026-09-15-d1-ready-made-editable-template.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-15-d2-one-revision-not-a-consultation) | docs/decisions/00506-2026-09-15-d2-one-revision-not-a-consultation.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/ready-made/purchases/:id/request-revision | docs/decisions/00506-2026-09-15-d2-one-revision-not-a-consultation.md | holds | Mounted at server/routes/ready-made.routes.ts:1729. |
| guard advisory (2026-09-15-d3-readymade-separate-checkout) | docs/decisions/00507-2026-09-15-d3-readymade-separate-checkout.md | holds | Row is marked advisory; it names no CI guard. |
| guard authored-item-price-contract (2026-09-15-d4-item-kind-contract) | docs/decisions/00508-2026-09-15-d4-item-kind-contract.md | holds | File is server/__tests__/authored-item-price-contract.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-15-d5-no-milestone-billing) | docs/decisions/00509-2026-09-15-d5-no-milestone-billing.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/pricing | docs/decisions/00509-2026-09-15-d5-no-milestone-billing.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| guard advisory (2026-09-15-d6-acceptance-for-artifacts) | docs/decisions/00510-2026-09-15-d6-acceptance-for-artifacts.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-15-d7-completion-split) | docs/decisions/00511-2026-09-15-d7-completion-split.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/admin/disputes | docs/decisions/00511-2026-09-15-d7-completion-split.md | holds | Mounted at server/routes/admin.routes.ts:1044. |
| guard advisory (2026-09-15-d8-quotes-with-expiry) | docs/decisions/00512-2026-09-15-d8-quotes-with-expiry.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/expert-booking-requests | docs/decisions/00512-2026-09-15-d8-quotes-with-expiry.md | holds | Mounted at server/routes.ts:2052. |
| guard advisory (2026-09-15-d9-partial-bundle-completion) | docs/decisions/00513-2026-09-15-d9-partial-bundle-completion.md | holds | Row is marked advisory; it names no CI guard. |
| guard booking-agent-claim (2026-09-15-d10-confirmed-needs-partner-evidence) | docs/decisions/00514-2026-09-15-d10-confirmed-needs-partner-evidence.md | holds | Basename matches 3 files (client/src/lib/booking-agent-claim.ts, server/__tests__/booking-agent-claim.db.test.ts, client/src/lib/__tests__/booking-agent-claim.test.ts). Ledger lint reports the guard wired. |
| guard booking-birth-provenance (2026-09-15-d11-no-item-booking-exception) | docs/decisions/00515-2026-09-15-d11-no-item-booking-exception.md | holds | File is server/__tests__/booking-birth-provenance.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings | docs/decisions/00515-2026-09-15-d11-no-item-booking-exception.md | holds | Mounted at server/routes.ts:7605. |
| route POST /api/expert-booking-requests | docs/decisions/00515-2026-09-15-d11-no-item-booking-exception.md | holds | Mounted at server/routes.ts:2052. |
| guard legacy-rail-closed (2026-09-15-d12-service-bookings-canonical) | docs/decisions/00516-2026-09-15-d12-service-bookings-canonical.md | holds | File is server/__tests__/legacy-rail-closed.test.ts. Ledger lint reports the guard wired. |
| route /booking-demo | docs/decisions/00516-2026-09-15-d12-service-bookings-canonical.md | gone | No client Route or Redirect matches /booking-demo. |
| route POST /api/bookings/process-cart | docs/decisions/00516-2026-09-15-d12-service-bookings-canonical.md | holds | Mounted at server/routes/bookings.ts:162. |
| guard cart-priceless-listing-gate (2026-09-15-d14-quantity-is-units) | docs/decisions/00517-2026-09-15-d14-quantity-is-units.md | holds | File is .github/workflows/cart-priceless-listing-gate.yml. Ledger lint reports the guard wired. |
| route /cart | docs/decisions/00517-2026-09-15-d14-quantity-is-units.md | holds | Client Route or Redirect matches /cart. |
| route PATCH /api/cart/:id | docs/decisions/00517-2026-09-15-d14-quantity-is-units.md | holds | Mounted at server/routes.ts:10088. |
| route POST /api/cart | docs/decisions/00517-2026-09-15-d14-quantity-is-units.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/cart/items | docs/decisions/00517-2026-09-15-d14-quantity-is-units.md | holds | Mounted at server/routes.ts:7464. |
| guard guest-cart-becomes-plan (2026-09-15-d16-plan-holds-venues-and-content) | docs/decisions/00518-2026-09-15-d16-plan-holds-venues-and-content.md | holds | File is server/__tests__/guest-cart-becomes-plan.http.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-15-d17-d8-specs-armed) | docs/decisions/00519-2026-09-15-d17-d8-specs-armed.md | holds | Row is marked advisory; it names no CI guard. |
| route /local-experts | docs/decisions/00519-2026-09-15-d17-d8-specs-armed.md | holds | Client Route or Redirect matches /local-experts. |
| route /plans/:id | docs/decisions/00519-2026-09-15-d17-d8-specs-armed.md | holds | Client Route or Redirect matches /plans/:p. |
| route /plans/:tripId | docs/decisions/00519-2026-09-15-d17-d8-specs-armed.md | holds | Client Route or Redirect matches /plans/:p. |
| route /trip/:id | docs/decisions/00519-2026-09-15-d17-d8-specs-armed.md | holds | Client Route or Redirect matches /trip/:p. |
| guard advisory (2026-09-15-section2-recheck-v21-v26) | docs/decisions/00520-2026-09-15-section2-recheck-v21-v26.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/coordination-states/:id/status | docs/decisions/00520-2026-09-15-section2-recheck-v21-v26.md | holds | Mounted at server/routes.ts:11335. |
| route POST /api/expert-booking-requests | docs/decisions/00520-2026-09-15-section2-recheck-v21-v26.md | holds | Mounted at server/routes.ts:2052. |
| guard reconciliation-detection (2026-09-15-d18-announced-marker) | docs/decisions/00521-2026-09-15-d18-announced-marker.md | holds | File is server/__tests__/reconciliation-detection.db.test.ts. Ledger lint reports the guard wired. |
| guard guest-cart-becomes-plan (2026-09-15-d41-item-quantity) | docs/decisions/00522-2026-09-15-d41-item-quantity.md | holds | File is server/__tests__/guest-cart-becomes-plan.http.test.ts. Ledger lint reports the guard wired. |
| guard from-state-guards (2026-09-15-v23-v25-from-state-guards) | docs/decisions/00523-2026-09-15-v23-v25-from-state-guards.md | holds | File is server/__tests__/from-state-guards.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/disputes/:bookingId/reject | docs/decisions/00523-2026-09-15-v23-v25-from-state-guards.md | holds | Mounted at server/routes/admin.routes.ts:1789. |
| route POST /api/bookings/:id/dispute | docs/decisions/00523-2026-09-15-v23-v25-from-state-guards.md | holds | Mounted at server/routes/bookings.ts:859. |
| guard slot-units (2026-09-15-v26-slot-units) | docs/decisions/00524-2026-09-15-v26-slot-units.md | holds | File is server/__tests__/slot-units.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-15-v21-terms-copy) | docs/decisions/00525-2026-09-15-v21-terms-copy.md | holds | Row is marked advisory; it names no CI guard. |
| route /earn | docs/decisions/00525-2026-09-15-v21-terms-copy.md | holds | Client Route or Redirect matches /earn. |
| route /pricing | docs/decisions/00525-2026-09-15-v21-terms-copy.md | holds | Client Route or Redirect matches /pricing. |
| guard plan-proposals (2026-09-15-d19-plan-proposals) | docs/decisions/00526-2026-09-15-d19-plan-proposals.md | holds | Basename matches 2 files (shared/plan-proposals.ts, server/__tests__/plan-proposals.db.test.ts). Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/proposals | docs/decisions/00526-2026-09-15-d19-plan-proposals.md | holds | Mounted at server/routes/trips.routes.ts:3732. |
| route POST /api/conversations/start | docs/decisions/00526-2026-09-15-d19-plan-proposals.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| route POST /api/trips/:id/suggestions | docs/decisions/00526-2026-09-15-d19-plan-proposals.md | holds | Mounted at server/routes/booking-actions.ts:1083. |
| route POST /api/trips/:tripId/proposals/:id/discard | docs/decisions/00526-2026-09-15-d19-plan-proposals.md | holds | Mounted at server/routes/trips.routes.ts:3940. |
| guard plan-proposals (2026-09-15-d20-d21-proposal-charge) | docs/decisions/00527-2026-09-15-d20-d21-proposal-charge.md | holds | Basename matches 2 files (shared/plan-proposals.ts, server/__tests__/plan-proposals.db.test.ts). Ledger lint reports the guard wired. |
| route /pricing | docs/decisions/00527-2026-09-15-d20-d21-proposal-charge.md | holds | Client Route or Redirect matches /pricing. |
| route POST /api/trips/:tripId/proposals/:id/pay | docs/decisions/00527-2026-09-15-d20-d21-proposal-charge.md | holds | Mounted at server/routes/trips.routes.ts:3991. |
| guard advisory (2026-09-15-section3-resweep) | docs/decisions/00528-2026-09-15-section3-resweep.md | holds | Row is marked advisory; it names no CI guard. |
| file:line .github/workflows/publish-gate-and-fundamentals-gate.yml:272 | docs/decisions/00529-2026-09-15-test-guard-prose-echo.md | holds | No code symbol was named beside the citation. Line .github/workflows/publish-gate-and-fundamentals-gate.yml:272 reads: echo "::error::publish-gate-and-fundamentals: one or more of the 5 suites (38 proofs) failed — see the verdict table in the run summary." |
| file:line build.yml:35 | docs/decisions/00529-2026-09-15-test-guard-prose-echo.md | holds | No code symbol was named beside the citation. Line .github/workflows/build.yml:35 reads: |
| guard check-test-files-wired (2026-09-15-test-guard-prose-echo) | docs/decisions/00529-2026-09-15-test-guard-prose-echo.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| guard terms-copy-honesty (2026-09-15-v27-v28-privacy-kind-labels) | docs/decisions/00530-2026-09-15-v27-v28-privacy-kind-labels.md | holds | File is client/src/lib/__tests__/terms-copy-honesty.test.ts. Ledger lint reports the guard wired. |
| route /admin/reconciliation | docs/decisions/00530-2026-09-15-v27-v28-privacy-kind-labels.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| guard one-trip-write-resolver (2026-09-15-v29-one-trip-write-resolver) | docs/decisions/00531-2026-09-15-v29-one-trip-write-resolver.md | holds | File is server/__tests__/one-trip-write-resolver.db.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/transport-legs/:legId/status | docs/decisions/00531-2026-09-15-v29-one-trip-write-resolver.md | holds | Mounted at server/routes/plancard.routes.ts:1150. |
| route POST /api/itinerary-items/:id/backup | docs/decisions/00531-2026-09-15-v29-one-trip-write-resolver.md | holds | Mounted at server/routes.ts:13664. |
| route POST /api/trips/:tripId/itinerary/optimize-order | docs/decisions/00531-2026-09-15-v29-one-trip-write-resolver.md | holds | Mounted at server/routes.ts:13728. |
| file:line item-event-link.db.test.ts:222 | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | No code symbol was named beside the citation. Line server/__tests__/item-event-link.db.test.ts:222 reads: // (a) THE LIVE PATCH RAIL — the real router, the real auth, the real handler. |
| guard advisory (2026-09-15-orphan-triage) | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | Row is marked advisory; it names no CI guard. |
| route DELETE /api/admin/service-offering-types/:key | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | Mounted at server/routes/admin.routes.ts:8627. |
| route DELETE /api/admin/slow-queries | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | Mounted at server/routes.ts:12892. |
| route DELETE /api/ea/executives/:id | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | Mounted at server/routes/ea.routes.ts:325. |
| route POST /api/auth/register | docs/decisions/00532-2026-09-15-orphan-triage.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| route POST /api/expert/templates | docs/decisions/00532-2026-09-15-orphan-triage.md | gone | No mounted POST /api/expert/templates. |
| guard reconciliation-run-tallies (2026-09-15-d42-reconciliation-tallies) | docs/decisions/00533-2026-09-15-d42-reconciliation-tallies.md | holds | File is server/__tests__/reconciliation-run-tallies.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/reconciliation | docs/decisions/00533-2026-09-15-d42-reconciliation-tallies.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| guard dates-confirmed (2026-09-15-d22-dates-confirmed) | docs/decisions/00534-2026-09-15-d22-dates-confirmed.md | holds | File is server/__tests__/dates-confirmed.db.test.ts. Ledger lint reports the guard wired. |
| route /api/me/upcoming | docs/decisions/00534-2026-09-15-d22-dates-confirmed.md | holds | Mounted (GET). |
| route PATCH /api/trips/:id | docs/decisions/00534-2026-09-15-d22-dates-confirmed.md | holds | Mounted at server/routes.ts:1609. |
| route POST /api/trips | docs/decisions/00534-2026-09-15-d22-dates-confirmed.md | holds | Mounted at server/routes.ts:1456. |
| file:line build.yml:1385 | docs/decisions/00535-2026-09-15-orphan-ratchet.md | holds | No code symbol was named beside the citation. Line .github/workflows/build.yml:1385 reads: # TOGETHER in exactly one module - the pin is the TRIPLE and the distinctive "you added", |
| file:line build.yml:2614 | docs/decisions/00535-2026-09-15-orphan-ratchet.md | holds | No code symbol was named beside the citation. Line .github/workflows/build.yml:2614 reads: # composer births `allocation_cents` that sum EXACTLY to total_amount (S1); the settlement is ONE |
| file:line build.yml:48 | docs/decisions/00535-2026-09-15-orphan-ratchet.md | holds | No code symbol was named beside the citation. Line .github/workflows/build.yml:48 reads: # exception). It does not make the 233 rows it carries acceptable, and `e2e/` stays out of |
| file:line unwired-spec-gate.yml:5 | docs/decisions/00535-2026-09-15-orphan-ratchet.md | gone | No file matches unwired-spec-gate.yml. |
| guard check-test-files-wired (2026-09-15-orphan-ratchet) | docs/decisions/00535-2026-09-15-orphan-ratchet.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| file:line server/routes.ts:18777 | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | drifted | server/routes.ts has 14062 lines; cited line 18777 is past EOF. |
| file:line server/routes/admin.routes.ts:4119 | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | No code symbol was named beside the citation. Line server/routes/admin.routes.ts:4119 reads: |
| file:line server/routes/payments.routes.ts:2867 | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | No code symbol was named beside the citation. Line server/routes/payments.routes.ts:2867 reads: const itemRates = await resolveCommissionRates( |
| file:line server/routes/trips.routes.ts:359-371 | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | No code symbol was named beside the citation. Line server/routes/trips.routes.ts:359-371 reads: changeType, |
| guard none (2026-09-15-v31-loginas-verifies) | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Row states it has no CI guard: none — see the note. |
| route /api/auth/login | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted (POST). |
| route /api/auth/user | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted (GET). |
| route /login | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Client Route or Redirect matches /login. |
| route GET /api/admin/revenue | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/routes/admin.routes.ts:2949. |
| route GET /api/auth/user | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/replit_integrations/auth/routes.ts:152. |
| route GET /api/logout | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/replit_integrations/auth/replitAuth.ts:331. |
| route GET /api/trips/:tripId/itinerary-items | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/routes.ts:13338. |
| route PATCH /api/admin/services/:id/status | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/routes/admin.routes.ts:5057. |
| route POST /api/auth/login | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:281. |
| route POST /api/auth/logout | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:601. |
| route POST /api/leads/route | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | gone | No mounted POST /api/leads/route. |
| route POST /api/trips | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/routes.ts:1456. |
| route POST /api/trips/:id/expert-advisor | docs/decisions/00536-2026-09-15-v31-loginas-verifies.md | holds | Mounted at server/routes/booking-actions.ts:730. |
| guard acceptance-rails (2026-09-15-d24-d26-acceptance-columns) | docs/decisions/00537-2026-09-15-d24-d26-acceptance-columns.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/service-bookings/:id/deliverable | docs/decisions/00537-2026-09-15-d24-d26-acceptance-columns.md | holds | Mounted at server/routes.ts:7314. |
| route POST /api/bookings/:id/accept-deliverable | docs/decisions/00537-2026-09-15-d24-d26-acceptance-columns.md | holds | Mounted at server/routes/bookings.ts:1000. |
| route POST /api/bookings/:id/deliver-artifact | docs/decisions/00537-2026-09-15-d24-d26-acceptance-columns.md | holds | Mounted at server/routes/bookings.ts:1069. |
| route POST /api/bookings/:id/request-revision | docs/decisions/00537-2026-09-15-d24-d26-acceptance-columns.md | holds | Mounted at server/routes/bookings.ts:1026. |
| guard acceptance-rails (2026-09-15-d27-artifact-timer-acceptance-prompt) | docs/decisions/00538-2026-09-15-d27-artifact-timer-acceptance-prompt.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/admin/disputes | docs/decisions/00538-2026-09-15-d27-artifact-timer-acceptance-prompt.md | holds | Mounted at server/routes/admin.routes.ts:1044. |
| guard check-test-files-wired (2026-09-15-orphans-t1-t3-green-directories) | docs/decisions/00539-2026-09-15-orphans-t1-t3-green-directories.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| guard check-test-files-wired (2026-09-15-orphans-t4-t7-red-suites) | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| route /api/expert/neighborhood-claims | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | Mounted (GET/POST). |
| route /api/expert/templates | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | gone | No mounted handler matches /api/expert/templates. |
| route DELETE /api/admin/service-offering-types/:key | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | Mounted at server/routes/admin.routes.ts:8627. |
| route DELETE /api/admin/slow-queries | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | Mounted at server/routes.ts:12892. |
| route DELETE /api/ea/executives/:id | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | Mounted at server/routes/ea.routes.ts:325. |
| route POST /api/auth/register | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| route POST /api/expert/templates | docs/decisions/00540-2026-09-15-orphans-t4-t7-red-suites.md | gone | No mounted POST /api/expert/templates. |
| file:line trips.routes.ts:359-371 | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | No code symbol was named beside the citation. Line server/routes/trips.routes.ts:359-371 reads: changeType, |
| guard leads-door-and-trip-read-gate (2026-09-15-v32-v33-leads-door-item-read-gate) | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | File is server/__tests__/leads-door-and-trip-read-gate.db.test.ts. Ledger lint reports the guard wired. |
| route /api/expert-requests | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted (GET/POST). |
| route GET /api/trips/:id | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes/trips.routes.ts:390. |
| route GET /api/trips/:tripId/expert-notes | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes/booking-actions.ts:1836. |
| route GET /api/trips/:tripId/itinerary-items | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes.ts:13338. |
| route POST /api/expert-requests | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes/booking-actions.ts:206. |
| route POST /api/leads/route | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | gone | No mounted POST /api/leads/route. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes.ts:1691. |
| route POST /api/trips/:tripId/advisors | docs/decisions/00541-2026-09-15-v32-v33-leads-door-item-read-gate.md | holds | Mounted at server/routes/booking-actions.ts:803. |
| guard check-test-files-wired (2026-09-15-orphans-t8-t9-server-tests-class) | docs/decisions/00542-2026-09-15-orphans-t8-t9-server-tests-class.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| route GET /api/discover/location/:city | docs/decisions/00542-2026-09-15-orphans-t8-t9-server-tests-class.md | holds | Mounted at server/routes/content.routes.ts:1000. |
| file:line client/src/components/plancard/ExpertSuggestionsPanel.tsx:32 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/ExpertSuggestionsPanel.tsx:32 reads: DialogContent, |
| file:line client/src/lib/slip-rail.ts:54 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line client/src/lib/slip-rail.ts:54 reads: * it re-checks in the route and again inside the snapshot transaction — and a refusal is shown |
| file:line server/infrastructure/message-rate-limiter.ts:128 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line server/infrastructure/message-rate-limiter.ts:128 reads: * @param recipientId the recipient's user id |
| file:line server/routes/pricing.routes.ts:78 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line server/routes/pricing.routes.ts:78 reads: // not a misconfiguration — the pricing page shows the SAME documented default the |
| file:line server/routes/trip-pass.routes.ts:47 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line server/routes/trip-pass.routes.ts:47 reads: if (!trip) return { trip: null, error: 404 as const }; |
| file:line server/routes/trips.routes.ts:3457 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line server/routes/trips.routes.ts:3457 reads: await rerouteIfStayItemChanged(tripId, [existing as any]); |
| file:line server/services/trip-finalize.service.ts:119 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line server/services/trip-finalize.service.ts:119 reads: * the Trip Card assembler (Phase 2 snapshot-only render) and by the auto-refinalize helper. */ |
| file:line shared/schema.ts:338 | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | No code symbol was named beside the citation. Line shared/schema.ts:338 reads: name: varchar("name", { length: 255 }).notNull(), // the place as the traveler typed/picked it |
| guard advisory (2026-09-15-l16-ask-ai-drawer-brief) | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/pricing | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| route POST /api/trips/:tripId/proposals | docs/decisions/00543-2026-09-15-l16-ask-ai-drawer-brief.md | holds | Mounted at server/routes/trips.routes.ts:3831. |
| guard advisory (2026-09-16-l16-rulings-d45-d50) | docs/decisions/00544-2026-09-16-l16-rulings-d45-d50.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/trips/:tripId/proposals | docs/decisions/00544-2026-09-16-l16-rulings-d45-d50.md | holds | Mounted at server/routes/trips.routes.ts:3732. |
| route POST /api/trips/:tripId/proposals | docs/decisions/00544-2026-09-16-l16-rulings-d45-d50.md | holds | Mounted at server/routes/trips.routes.ts:3831. |
| test pin server/__tests__/ai-ask-create-rail.db.test.ts (2026-09-16-l16-lane1-review-fixes) | docs/decisions/00545-2026-09-16-l16-lane1-review-fixes.md | holds | File is server/__tests__/ai-ask-create-rail.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ai-ask-create-rail.test.ts (2026-09-16-l16-lane1-review-fixes) | docs/decisions/00545-2026-09-16-l16-lane1-review-fixes.md | holds | File is server/__tests__/ai-ask-create-rail.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-proposal-refund.db.test.ts (2026-09-16-l16-lane1-review-fixes) | docs/decisions/00545-2026-09-16-l16-lane1-review-fixes.md | holds | File is server/__tests__/plan-proposal-refund.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-15-d12-legacy-cutoff-date) | docs/decisions/00546-2026-09-15-d12-legacy-cutoff-date.md | holds | Row is marked advisory; it names no CI guard. |
| route /booking-demo | docs/decisions/00546-2026-09-15-d12-legacy-cutoff-date.md | gone | No client Route or Redirect matches /booking-demo. |
| route POST /api/bookings/process-cart | docs/decisions/00546-2026-09-15-d12-legacy-cutoff-date.md | holds | Mounted at server/routes/bookings.ts:162. |
| guard advisory (2026-09-16-ci-main-red-repairs) | docs/decisions/00547-2026-09-16-ci-main-red-repairs.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-16-ci-manifest-pin-role-auth-mock) | docs/decisions/00548-2026-09-16-ci-manifest-pin-role-auth-mock.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/bookings/:id | docs/decisions/00548-2026-09-16-ci-manifest-pin-role-auth-mock.md | holds | Mounted at server/routes/bookings.ts:74. |
| guard acceptance-rails (2026-09-15-d36-d39-completion-declared) | docs/decisions/00549-2026-09-15-d36-d39-completion-declared.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/admin/disputes | docs/decisions/00549-2026-09-15-d36-d39-completion-declared.md | holds | Mounted at server/routes/admin.routes.ts:1044. |
| route PATCH /api/coordination-states/:id/status | docs/decisions/00549-2026-09-15-d36-d39-completion-declared.md | holds | Mounted at server/routes.ts:11335. |
| route POST /api/coordination-states/:id/refund | docs/decisions/00549-2026-09-15-d36-d39-completion-declared.md | holds | Mounted at server/routes.ts:11868. |
| guard service-quotes (2026-09-15-d28-d31-service-quotes) | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Basename matches 2 files (shared/service-quotes.ts, server/__tests__/service-quotes.db.test.ts). Ledger lint reports the guard wired. |
| route POST /api/bookings | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes.ts:7605. |
| route POST /api/checkout | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route POST /api/expert-booking-requests | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes.ts:2052. |
| route POST /api/provider/quotes/:id/issue | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes/service-quotes.routes.ts:155. |
| route POST /api/quotes/:id/accept | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes/service-quotes.routes.ts:121. |
| route POST /api/services/:id/quote-requests | docs/decisions/00550-2026-09-15-d28-d31-service-quotes.md | holds | Mounted at server/routes/service-quotes.routes.ts:83. |
| guard acceptance-rails (2026-09-16-d32-d35-bundle-components) | docs/decisions/00551-2026-09-16-d32-d35-bundle-components.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| guard acceptance-rails (2026-09-16-bundle-partial-settlement) | docs/decisions/00552-2026-09-16-bundle-partial-settlement.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| guard acceptance-rails (2026-09-16-bundle-component-traveler-cancel) | docs/decisions/00553-2026-09-16-bundle-component-traveler-cancel.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| route /api/bookings/:id/cancel | docs/decisions/00553-2026-09-16-bundle-component-traveler-cancel.md | holds | Mounted (POST). |
| route POST /api/bookings/:id/components/:componentServiceId/cancel | docs/decisions/00553-2026-09-16-bundle-component-traveler-cancel.md | holds | Mounted at server/routes.ts:8404. |
| guard advisory (2026-09-16-ci-red-repairs-3) | docs/decisions/00554-2026-09-16-ci-red-repairs-3.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/expert | docs/decisions/00554-2026-09-16-ci-red-repairs-3.md | holds | Live path is POST /api/expert/:expertId/tip at server/routes.ts:6222. |
| route POST /api/provider/quotes/:quoteId/issue | docs/decisions/00554-2026-09-16-ci-red-repairs-3.md | holds | Mounted at server/routes/service-quotes.routes.ts:155. |
| guard advisory (2026-09-17-orphan-971-wired) | docs/decisions/00555-2026-09-17-orphan-971-wired.md | holds | Row is marked advisory; it names no CI guard. |
| test pin server/__tests__/ai-ask-create-rail.db.test.ts (2026-09-16-l16-lane1b-model-call) | docs/decisions/00556-2026-09-16-l16-lane1b-model-call.md | holds | File is server/__tests__/ai-ask-create-rail.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ai-ask-create-rail.test.ts (2026-09-16-l16-lane1b-model-call) | docs/decisions/00556-2026-09-16-l16-lane1b-model-call.md | holds | File is server/__tests__/ai-ask-create-rail.test.ts. Ledger lint reports the guard wired. |
| guard acceptance-rails (2026-09-17-ld50-remainder-and-artifact-refund) | docs/decisions/00557-2026-09-17-ld50-remainder-and-artifact-refund.md | holds | File is server/__tests__/acceptance-rails.db.test.ts. Ledger lint reports the guard wired. |
| route /api/bookings/:id/cancel | docs/decisions/00557-2026-09-17-ld50-remainder-and-artifact-refund.md | holds | Mounted (POST). |
| route /api/bookings/:id/cancel-preview | docs/decisions/00557-2026-09-17-ld50-remainder-and-artifact-refund.md | holds | Mounted (GET). |
| route POST /api/admin/disputes/:bookingId/refund-rejected-artifact | docs/decisions/00557-2026-09-17-ld50-remainder-and-artifact-refund.md | holds | Mounted at server/routes/admin.routes.ts:1976. |
| guard advisory (2026-09-16-l16-lanes2-3-drawer) | docs/decisions/00558-2026-09-16-l16-lanes2-3-drawer.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/pricing | docs/decisions/00558-2026-09-16-l16-lanes2-3-drawer.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| route GET /api/trips/:tripId/proposals | docs/decisions/00558-2026-09-16-l16-lanes2-3-drawer.md | holds | Mounted at server/routes/trips.routes.ts:3732. |
| route POST /api/trips/:tripId/proposals | docs/decisions/00558-2026-09-16-l16-lanes2-3-drawer.md | holds | Mounted at server/routes/trips.routes.ts:3831. |
| guard advisory (2026-09-17-surfaces-acceptance-completion) | docs/decisions/00559-2026-09-17-surfaces-acceptance-completion.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert/bookings | docs/decisions/00559-2026-09-17-surfaces-acceptance-completion.md | holds | Mounted (GET). |
| route /api/my-bookings | docs/decisions/00559-2026-09-17-surfaces-acceptance-completion.md | holds | Mounted (GET). |
| route /api/provider/bookings | docs/decisions/00559-2026-09-17-surfaces-acceptance-completion.md | holds | Mounted (GET). |
| route GET /api/bookings/:id | docs/decisions/00559-2026-09-17-surfaces-acceptance-completion.md | holds | Mounted at server/routes/bookings.ts:74. |
| route /api/checkout | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Mounted (POST). |
| route /expert/bookings | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Client Route or Redirect matches /expert/bookings. |
| route /expert/catalog | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Client Route or Redirect matches /expert/catalog. |
| route /my-bookings | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Client Route or Redirect matches /my-bookings. |
| route /provider/inbox | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Client Route or Redirect matches /provider/inbox. |
| route /provider/services | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Client Route or Redirect matches /provider/services. |
| route GET /api/bookings/:id/components | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Mounted at server/routes/booking-components.routes.ts:78. |
| route GET /api/me/quotes | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Mounted at server/routes/service-quotes.routes.ts:111. |
| route GET /api/provider/quotes | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Mounted at server/routes/service-quotes.routes.ts:145. |
| route POST /api/quotes/:id/accept | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | Mounted at server/routes/service-quotes.routes.ts:121. |
| test pin client/src/lib/__tests__/api-refusal.test.ts (2026-09-17-surfaces-quotes-settlement) | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | File is client/src/lib/__tests__/api-refusal.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/bundle-component-state-copy.test.ts (2026-09-17-surfaces-quotes-settlement) | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | File is client/src/lib/__tests__/bundle-component-state-copy.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/quote-copy.test.ts (2026-09-17-surfaces-quotes-settlement) | docs/decisions/00560-2026-09-17-surfaces-quotes-settlement.md | holds | File is client/src/lib/__tests__/quote-copy.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-17-l16-lane4-postfinal) | docs/decisions/00561-2026-09-17-l16-lane4-postfinal.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/pricing | docs/decisions/00561-2026-09-17-l16-lane4-postfinal.md | holds | Mounted (GET). |
| guard build.yml (2026-09-17-all-undelivered-parent) | docs/decisions/00562-2026-09-17-all-undelivered-parent.md | holds | File is .github/workflows/build.yml. Ledger lint reports the guard wired. |
| route POST /api/bookings/:id/components/:componentServiceId/cancel | docs/decisions/00562-2026-09-17-all-undelivered-parent.md | holds | Mounted at server/routes.ts:8404. |
| test pin server/__tests__/ai-cost-attribution.db.test.ts (2026-09-17-ai-cost-actor-id) | docs/decisions/00563-2026-09-17-ai-cost-actor-id.md | holds | File is server/__tests__/ai-cost-attribution.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-17-per-component-capacity-not-built) | docs/decisions/00564-2026-09-17-per-component-capacity-not-built.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/bookings/confirm-payment | docs/decisions/00565-2026-09-18-quote-born-charge.md | holds | Mounted at server/routes/bookings.ts:265. |
| route POST /api/checkout | docs/decisions/00565-2026-09-18-quote-born-charge.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin server/__tests__/quote-born-charge.db.test.ts (2026-09-18-quote-born-charge) | docs/decisions/00565-2026-09-18-quote-born-charge.md | holds | File is server/__tests__/quote-born-charge.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/revenue | docs/decisions/00566-2026-09-18-tavily-spend-logged.md | holds | Client Route or Redirect matches /admin/revenue. |
| route GET /api/admin/revenue/unified | docs/decisions/00566-2026-09-18-tavily-spend-logged.md | holds | Mounted at server/routes/admin.routes.ts:5594. |
| test pin server/__tests__/tavily-client.test.ts (2026-09-18-tavily-spend-logged) | docs/decisions/00566-2026-09-18-tavily-spend-logged.md | holds | File is server/__tests__/tavily-client.test.ts. Ledger lint reports the guard wired. |
| route /pricing | docs/decisions/00567-2026-09-18-concierge-fee-cap-split.md | holds | Client Route or Redirect matches /pricing. |
| route GET /api/cart | docs/decisions/00567-2026-09-18-concierge-fee-cap-split.md | holds | Mounted at server/routes.ts:9468. |
| route GET /api/pricing | docs/decisions/00567-2026-09-18-concierge-fee-cap-split.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| test pin server/__tests__/concierge-fee-split.db.test.ts (2026-09-18-concierge-fee-cap-split) | docs/decisions/00567-2026-09-18-concierge-fee-cap-split.md | holds | File is server/__tests__/concierge-fee-split.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/affiliate/partners/:id/scrape | docs/decisions/00568-2026-09-18-scraper-robots.md | holds | Mounted at server/routes/content.routes.ts:8910. |
| test pin server/__tests__/egress-guard.test.ts (2026-09-18-scraper-robots) | docs/decisions/00568-2026-09-18-scraper-robots.md | holds | File is server/__tests__/egress-guard.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/robots-txt.test.ts (2026-09-18-scraper-robots) | docs/decisions/00568-2026-09-18-scraper-robots.md | holds | File is server/__tests__/robots-txt.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/discover-add-body.test.ts (2026-09-18-add-to-plan-lossless) | docs/decisions/00569-2026-09-18-add-to-plan-lossless.md | holds | File is client/src/lib/__tests__/discover-add-body.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/item-affiliate-link.db.test.ts (2026-09-18-add-to-plan-lossless) | docs/decisions/00569-2026-09-18-add-to-plan-lossless.md | holds | File is server/__tests__/item-affiliate-link.db.test.ts. Ledger lint reports the guard wired. |
| route /api/checkout | docs/decisions/00570-2026-09-18-concierge-handoff.md | holds | Mounted (POST). |
| route /plans/:tripId | docs/decisions/00570-2026-09-18-concierge-handoff.md | holds | Client Route or Redirect matches /plans/:p. |
| route POST /api/affiliate-booking-requests | docs/decisions/00570-2026-09-18-concierge-handoff.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| test pin server/__tests__/concierge-handoff.db.test.ts (2026-09-18-concierge-handoff) | docs/decisions/00570-2026-09-18-concierge-handoff.md | holds | File is server/__tests__/concierge-handoff.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/experts | docs/decisions/00571-2026-09-18-platform-concierge-listing.md | holds | Mounted at server/routes.ts:5490. |
| route POST /api/affiliate-booking-requests | docs/decisions/00571-2026-09-18-platform-concierge-listing.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| test pin server/__tests__/platform-concierge-listing.db.test.ts (2026-09-18-platform-concierge-listing) | docs/decisions/00571-2026-09-18-platform-concierge-listing.md | holds | File is server/__tests__/platform-concierge-listing.db.test.ts. Ledger lint reports the guard wired. |
| route /api/discover/location/:city | docs/decisions/00572-2026-09-19-cosmetic-public-surfaces.md | holds | Mounted (GET). |
| route /api/media/place-photo | docs/decisions/00572-2026-09-19-cosmetic-public-surfaces.md | holds | Mounted (GET). |
| route /discover/location/:city | docs/decisions/00572-2026-09-19-cosmetic-public-surfaces.md | holds | Client Route or Redirect matches /discover/location/:p. |
| route /earn | docs/decisions/00572-2026-09-19-cosmetic-public-surfaces.md | holds | Client Route or Redirect matches /earn. |
| test pin playwright/tests/cosmetic-public-surfaces.spec.ts (2026-09-19-cosmetic-public-surfaces) | docs/decisions/00572-2026-09-19-cosmetic-public-surfaces.md | holds | File is playwright/tests/cosmetic-public-surfaces.spec.ts. Ledger lint reports the guard wired. |
| file:line landing-moments.db.test.ts:138 | docs/decisions/00573-2026-09-19-demo-seeders-gated.md | holds | No code symbol was named beside the citation. Line server/__tests__/landing-moments.db.test.ts:138 reads: assert.deepEqual(proposal!.photos.map((photo) => photo.url), [NONSTOCK_PROPOSAL]); |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-19-demo-seeders-gated) | docs/decisions/00573-2026-09-19-demo-seeders-gated.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/quote-copy.test.ts (2026-09-19-quote-born-traveler-fee) | docs/decisions/00574-2026-09-19-quote-born-traveler-fee.md | holds | File is client/src/lib/__tests__/quote-copy.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/quote-born-charge.db.test.ts (2026-09-19-quote-born-traveler-fee) | docs/decisions/00574-2026-09-19-quote-born-traveler-fee.md | holds | File is server/__tests__/quote-born-charge.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-19-concierge-custody-rulings) | docs/decisions/00575-2026-09-19-concierge-custody-rulings.md | holds | Row is marked advisory; it names no CI guard. |
| route PATCH /api/affiliate-booking-requests/:id | docs/decisions/00576-2026-09-19-linked-item-purchase-write.md | holds | Mounted at server/routes/content.routes.ts:8120. |
| test pin server/__tests__/linked-item-purchase-write.db.test.ts (2026-09-19-linked-item-purchase-write) | docs/decisions/00576-2026-09-19-linked-item-purchase-write.md | holds | File is server/__tests__/linked-item-purchase-write.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-proposal-refund.db.test.ts (2026-09-19-proposal-refund-race-reason) | docs/decisions/00577-2026-09-19-proposal-refund-race-reason.md | holds | File is server/__tests__/plan-proposal-refund.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/me/quotes | docs/decisions/00578-2026-09-19-quote-plan-link.md | holds | Mounted at server/routes/service-quotes.routes.ts:111. |
| test pin server/__tests__/quote-plan-link.db.test.ts (2026-09-19-quote-plan-link) | docs/decisions/00578-2026-09-19-quote-plan-link.md | holds | File is server/__tests__/quote-plan-link.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-19-plan-v14-reconcile) | docs/decisions/00579-2026-09-19-plan-v14-reconcile.md | holds | Row is marked advisory; it names no CI guard. |
| guard scripts/check-jobs-cron-roster.cjs (2026-09-20-jobs-cron-single-schedule) | docs/decisions/00580-2026-09-20-jobs-cron-single-schedule.md | holds | File is scripts/check-jobs-cron-roster.cjs. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00580-2026-09-20-jobs-cron-single-schedule.md | holds | Mounted (GET). |
| route POST /api/bookings/refund | docs/decisions/00581-2026-09-20-quote-fee-preaccept.md | holds | Mounted at server/routes/bookings.ts:658. |
| test pin server/__tests__/quote-born-charge.db.test.ts (2026-09-20-quote-fee-preaccept) | docs/decisions/00581-2026-09-20-quote-fee-preaccept.md | holds | File is server/__tests__/quote-born-charge.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/concierge-handoff.db.test.ts (2026-09-20-handoff-booking-trip-basis) | docs/decisions/00582-2026-09-20-handoff-booking-trip-basis.md | holds | File is server/__tests__/concierge-handoff.db.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/provider/services | docs/decisions/00583-2026-09-20-quote-listing-goes-live.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| test pin server/__tests__/service-quotes.db.test.ts (2026-09-20-quote-listing-goes-live) | docs/decisions/00583-2026-09-20-quote-listing-goes-live.md | holds | File is server/__tests__/service-quotes.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/affiliate-booking-requests/:id/verify | docs/decisions/00584-2026-09-20-concierge-plan-read.md | holds | Mounted at server/routes/content.routes.ts:8415. |
| test pin server/__tests__/concierge-plan-read.db.test.ts (2026-09-20-concierge-plan-read) | docs/decisions/00584-2026-09-20-concierge-plan-read.md | holds | File is server/__tests__/concierge-plan-read.db.test.ts. Ledger lint reports the guard wired. |
| route /api/ready | docs/decisions/00585-2026-09-20-jobs-cron-cold-start-retry.md | holds | Mounted (GET). |
| route /api/version | docs/decisions/00585-2026-09-20-jobs-cron-cold-start-retry.md | holds | Mounted (GET). |
| route POST /internal/jobs/booking-expiry | docs/decisions/00585-2026-09-20-jobs-cron-cold-start-retry.md | holds | Mounted at server/routes/internal.routes.ts:339. |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-09-20-jobs-cron-cold-start-retry) | docs/decisions/00585-2026-09-20-jobs-cron-cold-start-retry.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| route POST /api/affiliate-booking-requests | docs/decisions/00586-2026-09-20-handoff-born-received.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| test pin server/__tests__/concierge-handoff.db.test.ts (2026-09-20-handoff-born-received) | docs/decisions/00586-2026-09-20-handoff-born-received.md | holds | File is server/__tests__/concierge-handoff.db.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00587-2026-09-20-jobs-trigger-replit-scheduled.md | holds | Mounted (GET). |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-09-20-jobs-trigger-replit-scheduled) | docs/decisions/00587-2026-09-20-jobs-trigger-replit-scheduled.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| test pin server/__tests__/checkout-payment-promotion.db.test.ts (2026-09-20-plan-work-grant-concierge-exclusion) | docs/decisions/00588-2026-09-20-plan-work-grant-concierge-exclusion.md | holds | File is server/__tests__/checkout-payment-promotion.db.test.ts. Ledger lint reports the guard wired. |
| file:line server/routes.ts:11085 | docs/decisions/00589-2026-09-20-dummy-seeder-gated-preview-widened.md | drifted | seedDatabase is not on the cited lines. It is at server/routes.ts:12099. |
| guard advisory (2026-09-20-dummy-seeder-gated-preview-widened) | docs/decisions/00589-2026-09-20-dummy-seeder-gated-preview-widened.md | holds | Row is marked advisory; it names no CI guard. |
| route /internal/jobs/health | docs/decisions/00589-2026-09-20-dummy-seeder-gated-preview-widened.md | holds | Mounted (GET). |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-20-admin-test-account-not-in-prod) | docs/decisions/00590-2026-09-20-admin-test-account-not-in-prod.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| route /services | docs/decisions/00591-2026-09-20-california-demo-seed-gated.md | holds | Client Route or Redirect matches /services. |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-20-california-demo-seed-gated) | docs/decisions/00591-2026-09-20-california-demo-seed-gated.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/landing-hero.test.ts (2026-09-20-landing-hero-representative-fallbacks) | docs/decisions/00592-2026-09-20-landing-hero-representative-fallbacks.md | holds | File is server/services/__tests__/landing-hero.test.ts. Ledger lint reports the guard wired. |
| file:line server/seeds/beta-launch-data.ts:759 | docs/decisions/00593-2026-09-20-cli-demo-seeders-gated.md | holds | No code symbol was named beside the citation. Line server/seeds/beta-launch-data.ts:759 reads: createdCategories.push(category); |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-20-cli-demo-seeders-gated) | docs/decisions/00593-2026-09-20-cli-demo-seeders-gated.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-20-dev-fixtures) | docs/decisions/00594-2026-09-20-dev-fixtures.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-20-beta-retirement-deferred) | docs/decisions/00595-2026-09-20-beta-retirement-deferred.md | holds | Row is marked advisory; it names no CI guard. |
| route /my-bookings | docs/decisions/00596-2026-09-20-dev-fixtures-quotes.md | holds | Client Route or Redirect matches /my-bookings. |
| test pin server/__tests__/demo-seeders-gated.test.ts (2026-09-20-dev-fixtures-quotes) | docs/decisions/00596-2026-09-20-dev-fixtures-quotes.md | holds | File is server/__tests__/demo-seeders-gated.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/spend-guard.test.ts (2026-09-21-tavily-spend-breaker) | docs/decisions/00597-2026-09-21-tavily-spend-breaker.md | holds | File is server/__tests__/spend-guard.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/admin/fee-bands/:bandKey | docs/decisions/00598-2026-09-21-platform-concierge-price-editable.md | holds | Mounted at server/routes/admin.routes.ts:8311. |
| test pin server/__tests__/platform-concierge-price.db.test.ts (2026-09-21-platform-concierge-price-editable) | docs/decisions/00598-2026-09-21-platform-concierge-price-editable.md | holds | File is server/__tests__/platform-concierge-price.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/membership-writer.db.test.ts (2026-09-21-membership-writer) | docs/decisions/00599-2026-09-21-membership-writer.md | holds | File is server/__tests__/membership-writer.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/offering-activation-gate.test.ts (2026-09-21-k6-regression-and-price-ids) | docs/decisions/00600-2026-09-21-k6-regression-and-price-ids.md | holds | File is server/__tests__/offering-activation-gate.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-21-ci-latency-cancel-and-workers) | docs/decisions/00601-2026-09-21-ci-latency-cancel-and-workers.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-21-guard-batch) | docs/decisions/00602-2026-09-21-guard-batch.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/memberships/checkout | docs/decisions/00603-2026-09-21-membership-checkout.md | holds | Mounted at server/routes/payments.routes.ts:3549. |
| test pin server/__tests__/membership-checkout-shape.test.ts (2026-09-21-membership-checkout) | docs/decisions/00603-2026-09-21-membership-checkout.md | holds | File is server/__tests__/membership-checkout-shape.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/membership-checkout.db.test.ts (2026-09-21-membership-checkout) | docs/decisions/00603-2026-09-21-membership-checkout.md | holds | File is server/__tests__/membership-checkout.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/plan-price-resolver.test.ts (2026-09-21-membership-checkout) | docs/decisions/00603-2026-09-21-membership-checkout.md | holds | File is server/services/__tests__/plan-price-resolver.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/membership-reconciliation.db.test.ts (2026-09-21-membership-reconciliation) | docs/decisions/00604-2026-09-21-membership-reconciliation.md | holds | File is server/__tests__/membership-reconciliation.db.test.ts. Ledger lint reports the guard wired. |
| file:line server/services/commission.ts:521 | docs/decisions/00605-2026-09-22-early-adopter-gate-exit.md | drifted | isEarlyAdopterProvider is not in server/services/commission.ts. Cited line now reads: * Ruling 25 (migration 174): EXPERIENCE_CART platform-take rate from fee_bands. |
| guard advisory (2026-09-22-early-adopter-gate-exit) | docs/decisions/00605-2026-09-22-early-adopter-gate-exit.md | holds | Row is marked advisory; it names no CI guard. |
| file:line content-matching.service.ts:401 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/services/content-matching.service.ts:401 reads: bookingsCount: providerServices.bookingsCount, |
| file:line experts-query.service.ts:497 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/services/experts-query.service.ts:497 reads: const { |
| file:line location-view.service.ts:502 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/services/location-view.service.ts:502 reads: .select({ |
| file:line routes.ts:5055 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/routes.ts:5055 reads: .where( |
| file:line storage.ts:3535-3538 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/storage.ts:3535-3538 reads: .insert(serviceBookings) |
| file:line transport-booking-options.service.ts:397 | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | No code symbol was named beside the citation. Line server/services/transport-booking-options.service.ts:397 reads: isExternal: boolean; |
| guard advisory (2026-09-22-denorm-counters-are-display-only) | docs/decisions/00606-2026-09-22-denorm-counters-are-display-only.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/checkout | docs/decisions/00607-2026-09-23-early-adopter-gate-was-already-dead.md | holds | Mounted (POST). |
| test pin server/services/__tests__/commission-phase1.test.ts (2026-09-23-early-adopter-gate-was-already-dead) | docs/decisions/00607-2026-09-23-early-adopter-gate-was-already-dead.md | holds | File is server/services/__tests__/commission-phase1.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-test-files-wired.cjs (2026-09-23-orphan-ratchet-scans-scripts) | docs/decisions/00608-2026-09-23-orphan-ratchet-scans-scripts.md | holds | File is scripts/check-test-files-wired.cjs. Ledger lint reports the guard wired. |
| route /experts | docs/decisions/00609-2026-09-23-local-finish-mints.md | holds | Client Route or Redirect matches /experts. |
| route /plans/:tripId | docs/decisions/00609-2026-09-23-local-finish-mints.md | holds | Client Route or Redirect matches /plans/:p. |
| route /s/:handle | docs/decisions/00609-2026-09-23-local-finish-mints.md | holds | Client Route or Redirect matches /s/:p. |
| route POST /api/expert-booking-requests | docs/decisions/00609-2026-09-23-local-finish-mints.md | holds | Mounted at server/routes.ts:2052. |
| test pin client/src/lib/__tests__/local-finish-mints.test.ts (2026-09-23-local-finish-mints) | docs/decisions/00609-2026-09-23-local-finish-mints.md | holds | File is client/src/lib/__tests__/local-finish-mints.test.ts. Ledger lint reports the guard wired. |
| route /s/:handle | docs/decisions/00610-2026-09-23-advisors-rail-takes-a-handle.md | holds | Client Route or Redirect matches /s/:p. |
| route POST /api/trips/:tripId/advisors | docs/decisions/00610-2026-09-23-advisors-rail-takes-a-handle.md | holds | Mounted at server/routes/booking-actions.ts:803. |
| test pin server/__tests__/hire-advisor-guards.test.ts (2026-09-23-advisors-rail-takes-a-handle) | docs/decisions/00610-2026-09-23-advisors-rail-takes-a-handle.md | holds | File is server/__tests__/hire-advisor-guards.test.ts. Ledger lint reports the guard wired. |
| route /s/:handle | docs/decisions/00611-2026-09-23-storefront-booking-panel.md | holds | Client Route or Redirect matches /s/:p. |
| route GET /api/trips/:id/expert-advisor | docs/decisions/00611-2026-09-23-storefront-booking-panel.md | holds | Mounted at server/routes/booking-actions.ts:689. |
| test pin client/src/lib/__tests__/storefront-booking-panel.test.ts (2026-09-23-storefront-booking-panel) | docs/decisions/00611-2026-09-23-storefront-booking-panel.md | holds | File is client/src/lib/__tests__/storefront-booking-panel.test.ts. Ledger lint reports the guard wired. |
| route /providers | docs/decisions/00612-2026-09-23-provider-directory-card.md | holds | Client Route or Redirect matches /providers. |
| test pin server/__tests__/provider-directory-listings.test.ts (2026-09-23-provider-directory-card) | docs/decisions/00612-2026-09-23-provider-directory-card.md | holds | File is server/__tests__/provider-directory-listings.test.ts. Ledger lint reports the guard wired. |
| route /s/porto-provider | docs/decisions/00613-2026-09-23-storefront-business-identity.md | holds | Client Route or Redirect matches /s/:p. |
| test pin server/__tests__/storefront-role-agnostic.http.test.ts (2026-09-23-storefront-business-identity) | docs/decisions/00613-2026-09-23-storefront-business-identity.md | holds | File is server/__tests__/storefront-role-agnostic.http.test.ts. Ledger lint reports the guard wired. |
| route /experts/:id | docs/decisions/00614-2026-09-23-storefront-price-cents.md | holds | Client Route or Redirect matches /experts/:p. |
| route /s/:handle | docs/decisions/00614-2026-09-23-storefront-price-cents.md | holds | Client Route or Redirect matches /s/:p. |
| route /s/kansai-bizlang | docs/decisions/00614-2026-09-23-storefront-price-cents.md | holds | Client Route or Redirect matches /s/:p. |
| test pin client/src/lib/__tests__/provider-directory-presentation.test.ts (2026-09-23-storefront-price-cents) | docs/decisions/00614-2026-09-23-storefront-price-cents.md | holds | File is client/src/lib/__tests__/provider-directory-presentation.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/storefront-role-agnostic.http.test.ts (2026-09-23-storefront-handle-converged) | docs/decisions/00615-2026-09-23-storefront-handle-converged.md | holds | File is server/__tests__/storefront-role-agnostic.http.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-23-kansai-translation-quoted) | docs/decisions/00616-2026-09-23-kansai-translation-quoted.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/experts | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | Mounted (GET). |
| route /api/experts/:id | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | Mounted (GET). |
| route /api/provider-storefronts | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | Mounted (GET). |
| route /api/storefront/:handle | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | Mounted (GET). |
| route /providers | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | Client Route or Redirect matches /providers. |
| test pin server/__tests__/earner-rating.test.ts (2026-09-23-earner-rating-one-rule) | docs/decisions/00617-2026-09-23-earner-rating-one-rule.md | holds | File is server/__tests__/earner-rating.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/reconciliation-month-boundary.db.test.ts (2026-09-23-reconciliation-month-boundary) | docs/decisions/00618-2026-09-23-reconciliation-month-boundary.md | holds | File is server/__tests__/reconciliation-month-boundary.db.test.ts. Ledger lint reports the guard wired. |
| route /api/storefront/:handle | docs/decisions/00619-2026-09-23-profile-saves-read-back.md | holds | Mounted (GET). |
| route PATCH /api/me/preferences | docs/decisions/00619-2026-09-23-profile-saves-read-back.md | holds | Mounted at server/routes/storefront.routes.ts:276. |
| route PATCH /api/me/storefront | docs/decisions/00619-2026-09-23-profile-saves-read-back.md | holds | Mounted at server/routes/storefront.routes.ts:345. |
| route PATCH /api/me/travel-preferences | docs/decisions/00619-2026-09-23-profile-saves-read-back.md | holds | Mounted at server/routes/storefront.routes.ts:422. |
| test pin server/__tests__/profile-saves-read-back.http.test.ts (2026-09-23-profile-saves-read-back) | docs/decisions/00619-2026-09-23-profile-saves-read-back.md | holds | File is server/__tests__/profile-saves-read-back.http.test.ts. Ledger lint reports the guard wired. |
| guard check-preferences-writer (2026-09-23-preferences-one-writer) | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | File is scripts/check-preferences-writer.cjs. Ledger lint reports the guard wired. |
| route PATCH /api/ea/preferences | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | Mounted at server/routes/ea.routes.ts:729. |
| route PATCH /api/me/preferences | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | Mounted at server/routes/storefront.routes.ts:276. |
| route PATCH /api/me/storefront | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | Mounted at server/routes/storefront.routes.ts:345. |
| route PATCH /api/me/travel-preferences | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | Mounted at server/routes/storefront.routes.ts:422. |
| route POST /api/me/research-prefs | docs/decisions/00620-2026-09-23-preferences-one-writer.md | holds | Mounted at server/routes/demand.routes.ts:933. |
| guard advisory (2026-09-23-kansai-repair-unstamped) | docs/decisions/00621-2026-09-23-kansai-repair-unstamped.md | holds | Row is marked advisory; it names no CI guard. |
| route /s/kansai-bizlang | docs/decisions/00621-2026-09-23-kansai-repair-unstamped.md | holds | Client Route or Redirect matches /s/:p. |
| route /profile | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Client Route or Redirect matches /profile. |
| route DELETE /api/me/ea-links/:id | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Mounted at server/routes/ea.routes.ts:815. |
| route GET /api/instagram/authorize | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Mounted at server/routes/instagram.ts:124. |
| route PATCH /api/affiliate-booking-requests/:id | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Mounted at server/routes/content.routes.ts:8120. |
| route POST /api/cache/refresh | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Mounted at server/routes/content.routes.ts:3992. |
| route POST /api/ea/clients | docs/decisions/00622-2026-09-23-phase1-security.md | holds | Mounted at server/routes/ea.routes.ts:84. |
| test pin server/__tests__/phase1-security.http.test.ts (2026-09-23-phase1-security) | docs/decisions/00622-2026-09-23-phase1-security.md | holds | File is server/__tests__/phase1-security.http.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/ea-client-label.test.ts (2026-09-23-ea-accepted-client-name) | docs/decisions/00623-2026-09-23-ea-accepted-client-name.md | holds | File is client/src/lib/__tests__/ea-client-label.test.ts. Ledger lint reports the guard wired. |
| route /api/coordination-states/:id/pay | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | Mounted (POST). |
| test pin assignment-notice-optout.db.test.ts (2026-09-23-phase2-messages) | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | File is server/__tests__/assignment-notice-optout.db.test.ts. Ledger lint reports the guard wired. |
| test pin booking-alert-outbox.db.test.ts (2026-09-23-phase2-messages) | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | File is server/__tests__/booking-alert-outbox.db.test.ts. Ledger lint reports the guard wired. |
| test pin dead-email-digest.db.test.ts (2026-09-23-phase2-messages) | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | File is server/__tests__/dead-email-digest.db.test.ts. Ledger lint reports the guard wired. |
| test pin ops-alert.db.test.ts (2026-09-23-phase2-messages) | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | File is server/__tests__/ops-alert.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/form-status-transition.db.test.ts (2026-09-23-phase2-messages) | docs/decisions/00624-2026-09-23-phase2-messages.md | holds | File is server/__tests__/form-status-transition.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/travelpayouts/__tests__/no-invented-figures.test.ts (2026-09-23-phase2-honesty) | docs/decisions/00625-2026-09-23-phase2-honesty.md | holds | File is server/services/travelpayouts/__tests__/no-invented-figures.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/background-check-flags-repair.db.test.ts (2026-09-24-background-check-flags-repair) | docs/decisions/00626-2026-09-24-background-check-flags-repair.md | holds | File is server/__tests__/background-check-flags-repair.db.test.ts. Ledger lint reports the guard wired. |
| route /api/bookings | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | Mounted (POST). |
| route /api/optimization-payments | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | Mounted (POST). |
| route /api/trips | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | Mounted (GET/POST). |
| route POST /api/expert/:expertId/tip | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | Mounted at server/routes.ts:6222. |
| route POST /api/ready-made/:id/purchase/confirm | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | Mounted at server/routes/ready-made.routes.ts:1481. |
| test pin server/__tests__/mutation-auth/payments-other-rails-mutation-auth.test.ts (2026-09-24-payments-other-rails-probed) | docs/decisions/00627-2026-09-24-payments-other-rails-probed.md | holds | File is server/__tests__/mutation-auth/payments-other-rails-mutation-auth.test.ts. Ledger lint reports the guard wired. |
| route GET /api/admin/bookings/out-of-band-refunds | docs/decisions/00628-2026-09-24-out-of-band-refund-blocks-mint.md | holds | Mounted at server/routes/admin.routes.ts:684. |
| route POST /api/admin/bookings/:bookingId/out-of-band-refund/clear | docs/decisions/00628-2026-09-24-out-of-band-refund-blocks-mint.md | holds | Mounted at server/routes/admin.routes.ts:702. |
| test pin server/__tests__/out-of-band-refund.db.test.ts (2026-09-24-out-of-band-refund-blocks-mint) | docs/decisions/00628-2026-09-24-out-of-band-refund-blocks-mint.md | holds | File is server/__tests__/out-of-band-refund.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile | docs/decisions/00629-2026-09-24-lost-chargeback-refund-guard.md | holds | Mounted at server/routes/admin.routes.ts:850. |
| route POST /api/bookings/refund | docs/decisions/00629-2026-09-24-lost-chargeback-refund-guard.md | holds | Mounted at server/routes/bookings.ts:658. |
| test pin server/__tests__/lost-chargeback-guard.db.test.ts (2026-09-24-lost-chargeback-refund-guard) | docs/decisions/00629-2026-09-24-lost-chargeback-refund-guard.md | holds | File is server/__tests__/lost-chargeback-guard.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/log-header-allowlist.test.ts (2026-09-24-log-header-allowlist) | docs/decisions/00630-2026-09-24-log-header-allowlist.md | holds | File is server/__tests__/log-header-allowlist.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/cover-photo.test.ts (2026-09-24-gem-photo-credit) | docs/decisions/00631-2026-09-24-gem-photo-credit.md | holds | File is client/src/lib/__tests__/cover-photo.test.ts. Ledger lint reports the guard wired. |
| route POST /api/itinerary-comparisons | docs/decisions/00632-2026-09-24-quotes-stored-as-typed.md | holds | Mounted at server/routes.ts:10334. |
| test pin server/utils/__tests__/sanitize-and-head.test.ts (2026-09-24-quotes-stored-as-typed) | docs/decisions/00632-2026-09-24-quotes-stored-as-typed.md | holds | File is server/utils/__tests__/sanitize-and-head.test.ts. Ledger lint reports the guard wired. |
| route /api/expert-forms | docs/decisions/00633-2026-09-24-one-expert-application-per-user.md | holds | Mounted (POST). |
| route POST /api/expert-application | docs/decisions/00633-2026-09-24-one-expert-application-per-user.md | holds | Mounted at server/routes.ts:2702. |
| test pin server/__tests__/expert-application-race.db.test.ts (2026-09-24-one-expert-application-per-user) | docs/decisions/00633-2026-09-24-one-expert-application-per-user.md | holds | File is server/__tests__/expert-application-race.db.test.ts. Ledger lint reports the guard wired. |
| route /trip/:id | docs/decisions/00634-2026-09-24-phase4-small-bugs.md | holds | Client Route or Redirect matches /trip/:p. |
| route POST /api/saved-items | docs/decisions/00634-2026-09-24-phase4-small-bugs.md | holds | Mounted at server/routes/saved-items.routes.ts:38. |
| test pin client/src/lib/__tests__/plan-stops.test.ts (2026-09-24-phase4-small-bugs) | docs/decisions/00634-2026-09-24-phase4-small-bugs.md | holds | File is client/src/lib/__tests__/plan-stops.test.ts. Ledger lint reports the guard wired. |
| route /api/my-bookings | docs/decisions/00635-2026-09-24-phase3-launch-gaps-1.md | holds | Mounted (GET). |
| route /api/provider/application-status | docs/decisions/00635-2026-09-24-phase3-launch-gaps-1.md | holds | Mounted (GET). |
| route GET /api/admin/system/test-email/:id | docs/decisions/00635-2026-09-24-phase3-launch-gaps-1.md | holds | Mounted at server/routes/admin.routes.ts:7483. |
| route POST /api/provider/services/:id/gallery-photo | docs/decisions/00635-2026-09-24-phase3-launch-gaps-1.md | holds | Mounted at server/routes.ts:7221. |
| test pin shared/__tests__/location-match.test.ts (2026-09-24-phase3-launch-gaps-1) | docs/decisions/00635-2026-09-24-phase3-launch-gaps-1.md | holds | File is shared/__tests__/location-match.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/bundle-city.test.ts (2026-09-24-phase3-launch-gaps-2) | docs/decisions/00636-2026-09-24-phase3-launch-gaps-2.md | holds | File is shared/__tests__/bundle-city.test.ts. Ledger lint reports the guard wired. |
| route /api/checkout | docs/decisions/00637-2026-09-24-cart-two-paths.md | holds | Mounted (POST). |
| route DELETE /api/cart/:id | docs/decisions/00637-2026-09-24-cart-two-paths.md | holds | Mounted at server/routes.ts:10160. |
| test pin client/src/lib/__tests__/cart-intent.test.ts (2026-09-24-cart-two-paths) | docs/decisions/00637-2026-09-24-cart-two-paths.md | holds | File is client/src/lib/__tests__/cart-intent.test.ts. Ledger lint reports the guard wired. |
| route /api/checkout | docs/decisions/00638-2026-09-24-approve-and-book.md | holds | Mounted (POST). |
| route POST /api/trips/:tripId/plan-review | docs/decisions/00638-2026-09-24-approve-and-book.md | holds | Mounted at server/routes/booking-actions.ts:1503. |
| test pin client/src/lib/__tests__/slip-plan-actions.test.ts (2026-09-24-approve-and-book) | docs/decisions/00638-2026-09-24-approve-and-book.md | holds | File is client/src/lib/__tests__/slip-plan-actions.test.ts. Ledger lint reports the guard wired. |
| route POST /api/expert-booking-requests | docs/decisions/00639-2026-09-24-request-rail-unpaid.md | holds | Mounted at server/routes.ts:2052. |
| test pin server/utils/__tests__/owner-accept-unpaid.test.ts (2026-09-24-request-rail-unpaid) | docs/decisions/00639-2026-09-24-request-rail-unpaid.md | holds | File is server/utils/__tests__/owner-accept-unpaid.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-24-storefront-message-first) | docs/decisions/00640-2026-09-24-storefront-message-first.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert-booking-requests | docs/decisions/00640-2026-09-24-storefront-message-first.md | holds | Mounted (POST). |
| route /experts/:id | docs/decisions/00640-2026-09-24-storefront-message-first.md | holds | Client Route or Redirect matches /experts/:p. |
| route /s/:handle | docs/decisions/00640-2026-09-24-storefront-message-first.md | holds | Client Route or Redirect matches /s/:p. |
| test pin server/__tests__/suggestion-listing-activity-email.db.test.ts (2026-09-24-suggestion-names-listing) | docs/decisions/00641-2026-09-24-suggestion-names-listing.md | holds | File is server/__tests__/suggestion-listing-activity-email.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/suggestion-listing-activity-email.db.test.ts (2026-09-24-earner-email-notifications) | docs/decisions/00642-2026-09-24-earner-email-notifications.md | holds | File is server/__tests__/suggestion-listing-activity-email.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/*.test.ts (2026-09-24-earner-email-notifications) | docs/decisions/00642-2026-09-24-earner-email-notifications.md | holds | File is server/utils/__tests__/activity-email-copy.test.ts. Ledger lint reports the guard wired. |
| route DELETE /api/push/subscriptions | docs/decisions/00643-2026-09-24-web-push.md | holds | Mounted at server/routes/push.routes.ts:106. |
| route GET /api/push/config | docs/decisions/00643-2026-09-24-web-push.md | holds | Mounted at server/routes/push.routes.ts:49. |
| route GET /api/push/subscriptions/status | docs/decisions/00643-2026-09-24-web-push.md | holds | Mounted at server/routes/push.routes.ts:57. |
| route POST /api/push/test | docs/decisions/00643-2026-09-24-web-push.md | holds | Mounted at server/routes/push.routes.ts:122. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-24-web-push) | docs/decisions/00643-2026-09-24-web-push.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/web-push.db.test.ts (2026-09-24-web-push) | docs/decisions/00643-2026-09-24-web-push.md | holds | File is server/__tests__/web-push.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/*.test.ts* (2026-09-24-web-push) | docs/decisions/00643-2026-09-24-web-push.md | holds | File is shared/__tests__/acceptance-window.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/trips/:id | docs/decisions/00644-2026-09-24-trip-body-allowlist.md | holds | Mounted at server/routes.ts:1609. |
| route POST /api/trips | docs/decisions/00644-2026-09-24-trip-body-allowlist.md | holds | Mounted at server/routes.ts:1456. |
| test pin server/__tests__/ea-plans-delegate.db.test.ts (2026-09-24-trip-body-allowlist) | docs/decisions/00644-2026-09-24-trip-body-allowlist.md | holds | File is server/__tests__/ea-plans-delegate.db.test.ts. Ledger lint reports the guard wired. |
| route /api/ea | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | Routes are still mounted under this prefix (for example GET /api/ea/ai-tasks). |
| route GET /api/ea/clients/:id/trips | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | Mounted at server/routes/ea.routes.ts:263. |
| route GET /api/ea/trips | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | Mounted at server/routes/ea.routes.ts:275. |
| route POST /api/ea/clients/:id/trips | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | Mounted at server/routes/ea.routes.ts:235. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-24-ea-plans-for-executive) | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ea-plans-delegate.db.test.ts (2026-09-24-ea-plans-for-executive) | docs/decisions/00645-2026-09-24-ea-plans-for-executive.md | holds | File is server/__tests__/ea-plans-delegate.db.test.ts. Ledger lint reports the guard wired. |
| route /experts | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | Client Route or Redirect matches /experts. |
| route POST /api/qa-sessions/:bookingId/start | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | Mounted at server/routes/live-help.routes.ts:96. |
| route PUT /api/me/available-now | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | Mounted at server/routes/live-help.routes.ts:62. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-24-live-chat-qa-sessions) | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/live-help.db.test.ts (2026-09-24-live-chat-qa-sessions) | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | File is server/__tests__/live-help.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/*.test.ts* (2026-09-24-live-chat-qa-sessions) | docs/decisions/00646-2026-09-24-live-chat-qa-sessions.md | holds | File is shared/__tests__/acceptance-window.test.ts. Ledger lint reports the guard wired. |
| route /experts/:id | docs/decisions/00647-2026-09-24-zero-listing-message.md | holds | Client Route or Redirect matches /experts/:p. |
| route /local-experts/:id | docs/decisions/00647-2026-09-24-zero-listing-message.md | holds | Client Route or Redirect matches /local-experts/:p. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-24-zero-listing-message) | docs/decisions/00647-2026-09-24-zero-listing-message.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-24-expert-bundle-panel-inbox) | docs/decisions/00648-2026-09-24-expert-bundle-panel-inbox.md | holds | Row is marked advisory; it names no CI guard. |
| route /expert/bookings | docs/decisions/00648-2026-09-24-expert-bundle-panel-inbox.md | holds | Client Route or Redirect matches /expert/bookings. |
| route POST /api/expert/bookings/:id/component-failed | docs/decisions/00648-2026-09-24-expert-bundle-panel-inbox.md | holds | Mounted at server/routes.ts:8366. |
| route POST /api/ai/generate-itinerary | docs/decisions/00649-2026-09-24-rc1-finish-mints.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/trips | docs/decisions/00649-2026-09-24-rc1-finish-mints.md | holds | Mounted at server/routes.ts:1456. |
| test pin client/src/lib/__tests__/local-finish-mints.test.ts (2026-09-24-rc1-finish-mints) | docs/decisions/00649-2026-09-24-rc1-finish-mints.md | holds | File is client/src/lib/__tests__/local-finish-mints.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/rc1-finish-mints.test.ts (2026-09-24-rc1-finish-mints) | docs/decisions/00649-2026-09-24-rc1-finish-mints.md | holds | File is client/src/lib/__tests__/rc1-finish-mints.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-24-plan-v14-trip-pass-benefits) | docs/decisions/00650-2026-09-24-plan-v14-trip-pass-benefits.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips/:tripId/trip-pass/purchase | docs/decisions/00650-2026-09-24-plan-v14-trip-pass-benefits.md | holds | Mounted at server/routes/trip-pass.routes.ts:75. |
| guard advisory (2026-09-24-pricing-map-row-keys) | docs/decisions/00651-2026-09-24-pricing-map-row-keys.md | holds | Row is marked advisory; it names no CI guard. |
| guard --self-test (2026-09-25-doc-band-key-guard) | docs/decisions/00652-2026-09-25-doc-band-key-guard.md | holds | No file is named --self-test. A workflow run or job name still contains it, and the ledger lint accepts the guard. |
| guard scripts/check-doc-band-keys.cjs (2026-09-25-doc-band-key-guard) | docs/decisions/00652-2026-09-25-doc-band-key-guard.md | holds | File is scripts/check-doc-band-keys.cjs. Ledger lint reports the guard wired. |
| route /admin/analytics/discover | docs/decisions/00653-2026-09-24-discover-impressions-admin.md | holds | Client Route or Redirect matches /admin/analytics/discover. |
| route GET /api/admin/discover/impressions | docs/decisions/00653-2026-09-24-discover-impressions-admin.md | holds | Mounted at server/routes/content.routes.ts:9498. |
| route POST /api/affiliates/track | docs/decisions/00653-2026-09-24-discover-impressions-admin.md | holds | Mounted at server/routes/content.routes.ts:9383. |
| test pin server/__tests__/discover-impressions.db.test.ts (2026-09-24-discover-impressions-admin) | docs/decisions/00653-2026-09-24-discover-impressions-admin.md | holds | File is server/__tests__/discover-impressions.db.test.ts. Ledger lint reports the guard wired. |
| route /api/cart | docs/decisions/00654-2026-09-24-rc2-add-to-plan.md | holds | Mounted (DELETE/GET/POST). |
| route POST /api/cart | docs/decisions/00654-2026-09-24-rc2-add-to-plan.md | holds | Mounted at server/routes.ts:9893. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-24-rc2-add-to-plan) | docs/decisions/00654-2026-09-24-rc2-add-to-plan.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| route GET /api/saved-places/shared/:token | docs/decisions/00655-2026-09-24-saved-places-plan-and-share.md | holds | Mounted at server/routes/saved-items.routes.ts:122. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00655-2026-09-24-saved-places-plan-and-share.md | holds | Mounted at server/routes.ts:13414. |
| test pin server/__tests__/saved-place-shares.db.test.ts (2026-09-24-saved-places-plan-and-share) | docs/decisions/00655-2026-09-24-saved-places-plan-and-share.md | holds | File is server/__tests__/saved-place-shares.db.test.ts. Ledger lint reports the guard wired. |
| route /api/experts/:id | docs/decisions/00656-2026-09-25-expert-detail-deleted.md | holds | Mounted (GET). |
| route /experts/:id | docs/decisions/00656-2026-09-25-expert-detail-deleted.md | holds | Client Route or Redirect matches /experts/:p. |
| route /local-experts/:id | docs/decisions/00656-2026-09-25-expert-detail-deleted.md | holds | Client Route or Redirect matches /local-experts/:p. |
| route /s/:handle | docs/decisions/00656-2026-09-25-expert-detail-deleted.md | holds | Client Route or Redirect matches /s/:p. |
| test pin client/src/lib/__tests__/earner-address.test.ts (2026-09-25-expert-detail-deleted) | docs/decisions/00656-2026-09-25-expert-detail-deleted.md | holds | File is client/src/lib/__tests__/earner-address.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/trips/:id | docs/decisions/00657-2026-09-25-rc6-bound-plan-city.md | holds | Mounted at server/routes.ts:1609. |
| test pin client/src/lib/__tests__/*.test.ts* (2026-09-25-rc6-bound-plan-city) | docs/decisions/00657-2026-09-25-rc6-bound-plan-city.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| route GET /api/me/discover-impressions | docs/decisions/00658-2026-09-25-discover-impressions-earner.md | holds | Mounted at server/routes/content.routes.ts:9517. |
| test pin server/__tests__/discover-impressions.db.test.ts (2026-09-25-discover-impressions-earner) | docs/decisions/00658-2026-09-25-discover-impressions-earner.md | holds | File is server/__tests__/discover-impressions.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-25-publish-prompt-new-objects) | docs/decisions/00659-2026-09-25-publish-prompt-new-objects.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/affiliate-booking-requests | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | Mounted at server/routes/content.routes.ts:7683. |
| route POST /api/ai/generate-itinerary | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/ai/generate-optimized-itineraries | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | Mounted at server/routes/content.routes.ts:5241. |
| route POST /api/ai/itineraries/:id/save-as-trip | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | Mounted at server/routes/content.routes.ts:5380. |
| test pin client/src/lib/__tests__/rc12-party-size.test.ts (2026-09-25-rc12-party-size) | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | File is client/src/lib/__tests__/rc12-party-size.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-party-total.test.ts (2026-09-25-rc12-party-size) | docs/decisions/00660-2026-09-25-rc12-party-size.md | holds | File is shared/__tests__/plan-party-total.test.ts. Ledger lint reports the guard wired. |
| route /api/auth/user | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | Mounted (GET). |
| route /api/experts | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | Mounted (GET). |
| route /api/experts/:id | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | Mounted (GET). |
| route /experts/:id | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | Client Route or Redirect matches /experts/:p. |
| route /s/:handle | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | Client Route or Redirect matches /s/:p. |
| test pin server/__tests__/experts-public-projection.test.ts (2026-09-25-experts-cover-unpublished) | docs/decisions/00661-2026-09-25-experts-cover-unpublished.md | holds | File is server/__tests__/experts-public-projection.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/me/handle | docs/decisions/00662-2026-09-25-journey-4-5-rewritten.md | holds | Mounted at server/routes/storefront.routes.ts:101. |
| test pin e2e/specs/journey-4-5.spec.ts (2026-09-25-journey-4-5-rewritten) | docs/decisions/00662-2026-09-25-journey-4-5-rewritten.md | holds | File is e2e/specs/journey-4-5.spec.ts. Ledger lint reports the guard wired. |
| test pin e2e/specs/journey-4-5.spec.ts (2026-09-25-provisional-claim-payout-line) | docs/decisions/00663-2026-09-25-provisional-claim-payout-line.md | holds | File is e2e/specs/journey-4-5.spec.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings/process-cart | docs/decisions/00664-2026-09-25-legacy-cutoff-boot-line.md | holds | Mounted at server/routes/bookings.ts:162. |
| test pin server/__tests__/legacy-rail-closed.test.ts (2026-09-25-legacy-cutoff-boot-line) | docs/decisions/00664-2026-09-25-legacy-cutoff-boot-line.md | holds | File is server/__tests__/legacy-rail-closed.test.ts. Ledger lint reports the guard wired. |
| guard .github/workflows/ci-db-setup-lint.yml (2026-09-25-ci-postgres-runner-local) | docs/decisions/00665-2026-09-25-ci-postgres-runner-local.md | holds | File is .github/workflows/ci-db-setup-lint.yml. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/rc7-new-plan-visible.test.ts (2026-09-25-rc7-new-plan-visible) | docs/decisions/00666-2026-09-25-rc7-new-plan-visible.md | holds | File is client/src/lib/__tests__/rc7-new-plan-visible.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/00667-2026-09-25-journey-4-5-plans-first.md | holds | Mounted at server/routes.ts:1456. |
| route POST /api/trips/:tripId/items/:itemId/route | docs/decisions/00667-2026-09-25-journey-4-5-plans-first.md | holds | Mounted at server/routes/routing.routes.ts:138. |
| test pin e2e/specs/journey-4-5.spec.ts (2026-09-25-journey-4-5-plans-first) | docs/decisions/00667-2026-09-25-journey-4-5-plans-first.md | holds | File is e2e/specs/journey-4-5.spec.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-25-planning-tolls) | docs/decisions/00668-2026-09-25-planning-tolls.md | holds | Row is marked advisory; it names no CI guard. |
| test pin server/__tests__/planning-tolls-ledger.db.test.ts (2026-09-25-tolls-fee-ledger) | docs/decisions/00669-2026-09-25-tolls-fee-ledger.md | holds | File is server/__tests__/planning-tolls-ledger.db.test.ts. Ledger lint reports the guard wired. |
| route /profile | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | Client Route or Redirect matches /profile. |
| route DELETE /api/me/profile-photo | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | Mounted at server/routes/profile-photo.routes.ts:114. |
| route GET /api/avatars/:file | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | Mounted at server/routes/profile-photo.routes.ts:138. |
| route PATCH /api/profile | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | Mounted at server/replit_integrations/auth/routes.ts:104. |
| route POST /api/me/profile-photo | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | Mounted at server/routes/profile-photo.routes.ts:51. |
| test pin server/__tests__/profile-photo.db.test.ts (2026-09-25-rc10-profile-photo) | docs/decisions/00670-2026-09-25-rc10-profile-photo.md | holds | File is server/__tests__/profile-photo.db.test.ts. Ledger lint reports the guard wired. |
| route /my-trips | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | Client Route or Redirect matches /my-trips. |
| route /plans/:id | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | Client Route or Redirect matches /plans/:p. |
| route /quick-start | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | Client Route or Redirect matches /quick-start. |
| route /services | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | Client Route or Redirect matches /services. |
| route GET /api/trip-context | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | Mounted at server/routes/trip-context.routes.ts:229. |
| test pin client/src/lib/__tests__/rc345-active-plan.test.ts (2026-09-25-rc345-active-plan) | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | File is client/src/lib/__tests__/rc345-active-plan.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/trip-context-recovery.db.test.ts (2026-09-25-rc345-active-plan) | docs/decisions/00671-2026-09-25-rc345-active-plan.md | holds | File is server/__tests__/trip-context-recovery.db.test.ts. Ledger lint reports the guard wired. |
| route PUT /api/trip-context | docs/decisions/00672-2026-09-25-r3-resume-after-dismiss.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| test pin client/src/lib/__tests__/plan-resume.test.ts (2026-09-25-r3-resume-after-dismiss) | docs/decisions/00672-2026-09-25-r3-resume-after-dismiss.md | holds | File is client/src/lib/__tests__/plan-resume.test.ts. Ledger lint reports the guard wired. |
| route /s/kyoto-provider | docs/decisions/00673-2026-09-25-rc11-first-message.md | holds | Client Route or Redirect matches /s/:p. |
| route POST /api/chats | docs/decisions/00673-2026-09-25-rc11-first-message.md | holds | Mounted at server/routes.ts:2442. |
| route POST /api/conversations/start | docs/decisions/00673-2026-09-25-rc11-first-message.md | holds | Mounted at server/routes/conversations.routes.ts:68. |
| test pin server/__tests__/rc11-first-message.db.test.ts (2026-09-25-rc11-first-message) | docs/decisions/00673-2026-09-25-rc11-first-message.md | holds | File is server/__tests__/rc11-first-message.db.test.ts. Ledger lint reports the guard wired. |
| route /api/chats | docs/decisions/00674-2026-09-25-ld40-lane2-inboxes.md | holds | Mounted (GET/POST). |
| route /api/messages | docs/decisions/00674-2026-09-25-ld40-lane2-inboxes.md | holds | Mounted (GET/POST). |
| route /expert/clients/:clientUserId | docs/decisions/00674-2026-09-25-ld40-lane2-inboxes.md | holds | Client Route or Redirect matches /expert/clients/:p. |
| test pin client/src/lib/__tests__/ld40-lane2-inboxes.test.ts (2026-09-25-ld40-lane2-inboxes) | docs/decisions/00674-2026-09-25-ld40-lane2-inboxes.md | holds | File is client/src/lib/__tests__/ld40-lane2-inboxes.test.ts. Ledger lint reports the guard wired. |
| route /api/cart/fee-preview | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted (GET). |
| route /services/:id | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Client Route or Redirect matches /services/:p. |
| route GET /api/cart | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes.ts:9468. |
| route POST /api/bookings | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes.ts:7605. |
| route POST /api/cart | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/cart/items | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes.ts:7464. |
| route POST /api/checkout | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route POST /api/expert-booking-requests | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | Mounted at server/routes.ts:2052. |
| test pin server/__tests__/checkout-request-mode.http.test.ts (2026-09-25-checkout-request-mode) | docs/decisions/00675-2026-09-25-checkout-request-mode.md | holds | File is server/__tests__/checkout-request-mode.http.test.ts. Ledger lint reports the guard wired. |
| route /admin/service-approvals | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | Client Route or Redirect matches /admin/service-approvals. |
| route GET /api/admin/listings/booking-mode-summary | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | Mounted at server/routes/booking-mode-prompt.routes.ts:59. |
| route GET /api/me/listings/booking-mode-status | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | Mounted at server/routes/booking-mode-prompt.routes.ts:31. |
| route PATCH /api/provider/services/:id | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | Mounted at server/routes.ts:4492. |
| route POST /api/me/listings/booking-mode/decide | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | Mounted at server/routes/booking-mode-prompt.routes.ts:42. |
| test pin client/src/lib/__tests__/booking-mode-prompt.test.ts (2026-09-25-seller-booking-mode-prompt) | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | File is client/src/lib/__tests__/booking-mode-prompt.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/booking-mode-status.db.test.ts (2026-09-25-seller-booking-mode-prompt) | docs/decisions/00676-2026-09-25-seller-booking-mode-prompt.md | holds | File is server/__tests__/booking-mode-status.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/services/:id | docs/decisions/00677-2026-09-25-storefront-booking-actions.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| test pin client/src/lib/__tests__/storefront-offering-action.test.ts (2026-09-25-storefront-booking-actions) | docs/decisions/00677-2026-09-25-storefront-booking-actions.md | holds | File is client/src/lib/__tests__/storefront-offering-action.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/storefront-booking-actions.db.test.ts (2026-09-25-storefront-booking-actions) | docs/decisions/00677-2026-09-25-storefront-booking-actions.md | holds | File is server/__tests__/storefront-booking-actions.db.test.ts. Ledger lint reports the guard wired. |
| route /api/discover | docs/decisions/00678-2026-09-25-provider-action-buttons.md | holds | Mounted (GET). |
| test pin client/src/lib/__tests__/service-buy-action.test.ts (2026-09-25-provider-action-buttons) | docs/decisions/00678-2026-09-25-provider-action-buttons.md | holds | File is client/src/lib/__tests__/service-buy-action.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/storefront-offering-action.test.ts (2026-09-25-provider-action-buttons) | docs/decisions/00678-2026-09-25-provider-action-buttons.md | holds | File is client/src/lib/__tests__/storefront-offering-action.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/buy-action.test.ts (2026-09-25-provider-action-buttons) | docs/decisions/00678-2026-09-25-provider-action-buttons.md | holds | File is shared/__tests__/buy-action.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/provider/services | docs/decisions/00679-2026-09-25-price-basis.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| test pin server/__tests__/cart-quantity-admission.http.test.ts (2026-09-25-price-basis) | docs/decisions/00679-2026-09-25-price-basis.md | holds | File is server/__tests__/cart-quantity-admission.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/price-basis.db.test.ts (2026-09-25-price-basis) | docs/decisions/00679-2026-09-25-price-basis.md | holds | File is server/__tests__/price-basis.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-25-e2e-supply-demand-pass2) | docs/decisions/00680-2026-09-25-e2e-supply-demand-pass2.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me/quotes | docs/decisions/00681-2026-09-25-p1-approve-and-quotes.md | holds | Mounted (GET). |
| route /my-bookings | docs/decisions/00681-2026-09-25-p1-approve-and-quotes.md | holds | Client Route or Redirect matches /my-bookings. |
| test pin client/src/lib/__tests__/my-bookings-view.test.ts (2026-09-25-p1-approve-and-quotes) | docs/decisions/00681-2026-09-25-p1-approve-and-quotes.md | holds | File is client/src/lib/__tests__/my-bookings-view.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-redelivery-reopens-review.db.test.ts (2026-09-25-p1-approve-and-quotes) | docs/decisions/00681-2026-09-25-p1-approve-and-quotes.md | holds | File is server/__tests__/plan-redelivery-reopens-review.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings | docs/decisions/00682-2026-09-25-quote-platform-fee.md | holds | Mounted at server/routes.ts:7605. |
| test pin server/__tests__/service-quotes.db.test.ts (2026-09-25-quote-platform-fee) | docs/decisions/00682-2026-09-25-quote-platform-fee.md | holds | File is server/__tests__/service-quotes.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/booking-mode-status.db.test.ts (2026-09-26-instant-false-is-request) | docs/decisions/00683-2026-09-26-instant-false-is-request.md | holds | File is server/__tests__/booking-mode-status.db.test.ts. Ledger lint reports the guard wired. |
| route /quick-start | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | Client Route or Redirect matches /quick-start. |
| route DELETE /api/cart/:id | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | Mounted at server/routes.ts:10160. |
| route GET /api/cart | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | Mounted at server/routes.ts:9468. |
| route POST /api/cart | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | Mounted at server/routes.ts:13414. |
| test pin shared/__tests__/cart-content-line.test.ts (2026-09-26-rc9-external-cart-lines) | docs/decisions/00684-2026-09-26-rc9-external-cart-lines.md | holds | File is shared/__tests__/cart-content-line.test.ts. Ledger lint reports the guard wired. |
| route DELETE /api/cart | docs/decisions/00685-2026-09-26-checkout-keeps-partner-lines.md | holds | Mounted at server/routes.ts:10178. |
| test pin server/__tests__/checkout-keeps-partner-lines.db.test.ts (2026-09-26-checkout-keeps-partner-lines) | docs/decisions/00685-2026-09-26-checkout-keeps-partner-lines.md | holds | File is server/__tests__/checkout-keeps-partner-lines.db.test.ts. Ledger lint reports the guard wired. |
| route /api/routes/transit-multi | docs/decisions/00686-2026-09-26-partner-picks-map-coords.md | holds | Mounted (POST). |
| route GET /api/cart | docs/decisions/00686-2026-09-26-partner-picks-map-coords.md | holds | Mounted at server/routes.ts:9468. |
| route POST /api/cart | docs/decisions/00686-2026-09-26-partner-picks-map-coords.md | holds | Mounted at server/routes.ts:9893. |
| test pin server/__tests__/guest-cart-becomes-plan.http.test.ts (2026-09-26-partner-picks-map-coords) | docs/decisions/00686-2026-09-26-partner-picks-map-coords.md | holds | File is server/__tests__/guest-cart-becomes-plan.http.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/cart-content-line.test.ts (2026-09-26-partner-picks-map-coords) | docs/decisions/00686-2026-09-26-partner-picks-map-coords.md | holds | File is shared/__tests__/cart-content-line.test.ts. Ledger lint reports the guard wired. |
| route GET /api/transport-options | docs/decisions/00687-2026-09-26-transfer-link-tracked.md | holds | Mounted at server/routes/transport-hub.routes.ts:511. |
| route POST /api/transport-options/click | docs/decisions/00687-2026-09-26-transfer-link-tracked.md | holds | Mounted at server/routes/transport-hub.routes.ts:544. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-09-26-transfer-link-tracked) | docs/decisions/00687-2026-09-26-transfer-link-tracked.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/transfer-link-tracked.db.test.ts (2026-09-26-transfer-link-tracked) | docs/decisions/00687-2026-09-26-transfer-link-tracked.md | holds | File is server/__tests__/transfer-link-tracked.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-26-plan-option-tables) | docs/decisions/00688-2026-09-26-plan-option-tables.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-finalize-refuses-open-sets) | docs/decisions/00689-2026-09-26-finalize-refuses-open-sets.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-open-sets-not-non-empty) | docs/decisions/00690-2026-09-26-open-sets-not-non-empty.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-experience-groups-derived) | docs/decisions/00691-2026-09-26-experience-groups-derived.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-three-versions-fixed-objectives) | docs/decisions/00692-2026-09-26-three-versions-fixed-objectives.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-owner-chooses-options) | docs/decisions/00693-2026-09-26-owner-chooses-options.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-slip-step0-scope) | docs/decisions/00694-2026-09-26-slip-step0-scope.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-option-a-label-retired) | docs/decisions/00695-2026-09-26-option-a-label-retired.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-j6-ci-cadence) | docs/decisions/00696-2026-09-26-j6-ci-cadence.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-26-slip-map-ratification-gate) | docs/decisions/00697-2026-09-26-slip-map-ratification-gate.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/itinerary-comparisons/:id/adopt-stop | docs/decisions/00698-2026-09-26-adopt-stop-write-access.md | holds | Mounted at server/routes/plancard.routes.ts:411. |
| test pin server/__tests__/adopt-stop-write-and-apply-to-cart-flag.db.test.ts (2026-09-26-adopt-stop-write-access) | docs/decisions/00698-2026-09-26-adopt-stop-write-access.md | holds | File is server/__tests__/adopt-stop-write-and-apply-to-cart-flag.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/itinerary-comparisons/:id/apply-to-cart | docs/decisions/00699-2026-09-26-apply-to-cart-flag-off.md | holds | Mounted at server/routes.ts:11044. |
| test pin server/__tests__/adopt-stop-write-and-apply-to-cart-flag.db.test.ts (2026-09-26-apply-to-cart-flag-off) | docs/decisions/00699-2026-09-26-apply-to-cart-flag-off.md | holds | File is server/__tests__/adopt-stop-write-and-apply-to-cart-flag.db.test.ts. Ledger lint reports the guard wired. |
| route /experiences/:slug | docs/decisions/00700-2026-09-26-occasion-read-only.md | holds | Client Route or Redirect matches /experiences/:p. |
| route PATCH /api/trips/:tripId/occasion | docs/decisions/00700-2026-09-26-occasion-read-only.md | holds | Mounted at server/routes/trips.routes.ts:3601. |
| route PUT /api/trip-context | docs/decisions/00700-2026-09-26-occasion-read-only.md | holds | Mounted at server/routes/trip-context.routes.ts:267. |
| test pin client/src/lib/__tests__/occasion-read-only.test.ts (2026-09-26-occasion-read-only) | docs/decisions/00700-2026-09-26-occasion-read-only.md | holds | File is client/src/lib/__tests__/occasion-read-only.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/occasion-read-only.db.test.ts (2026-09-26-occasion-read-only) | docs/decisions/00700-2026-09-26-occasion-read-only.md | holds | File is server/__tests__/occasion-read-only.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:id/plancard | docs/decisions/00701-2026-09-26-slip-renders-live.md | holds | Mounted at server/routes/plancard.routes.ts:778. |
| test pin server/__tests__/slip-card-integrity.db.test.ts (2026-09-26-slip-renders-live) | docs/decisions/00701-2026-09-26-slip-renders-live.md | holds | File is server/__tests__/slip-card-integrity.db.test.ts. Ledger lint reports the guard wired. |
| route /trip/:id | docs/decisions/00702-2026-09-26-card-routing-read-only.md | holds | Client Route or Redirect matches /trip/:p. |
| route POST /api/trips/:tripId/items/:itemId/route | docs/decisions/00702-2026-09-26-card-routing-read-only.md | holds | Mounted at server/routes/routing.routes.ts:138. |
| test pin server/__tests__/slip-card-integrity.db.test.ts (2026-09-26-card-routing-read-only) | docs/decisions/00702-2026-09-26-card-routing-read-only.md | holds | File is server/__tests__/slip-card-integrity.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/slip-card-integrity.db.test.ts (2026-09-26-send-to-expert-needs-expert) | docs/decisions/00703-2026-09-26-send-to-expert-needs-expert.md | holds | File is server/__tests__/slip-card-integrity.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/route-refusal.test.ts (2026-09-26-finalized-checkout-messages) | docs/decisions/00704-2026-09-26-finalized-checkout-messages.md | holds | File is client/src/lib/__tests__/route-refusal.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-27-occasion-backfill-tier-a) | docs/decisions/00705-2026-09-27-occasion-backfill-tier-a.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-accommodation-req-multiday) | docs/decisions/00706-2026-09-27-accommodation-req-multiday.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-celebrations-venue-req) | docs/decisions/00707-2026-09-27-celebrations-venue-req.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-pending-advisor-no-comments) | docs/decisions/00708-2026-09-27-pending-advisor-no-comments.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-override-test) | docs/decisions/00709-2026-09-27-override-test.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-proposal-dining-req) | docs/decisions/00710-2026-09-27-proposal-dining-req.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-cart-plan-or-standalone) | docs/decisions/00711-2026-09-27-cart-plan-or-standalone.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/checkout | docs/decisions/00711-2026-09-27-cart-plan-or-standalone.md | holds | Mounted (POST). |
| guard advisory (2026-09-27-slip-map-ratified) | docs/decisions/00712-2026-09-27-slip-map-ratified.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-27-overrides-confirmed-custom-venue-anchor) | docs/decisions/00713-2026-09-27-overrides-confirmed-custom-venue-anchor.md | holds | Row is marked advisory; it names no CI guard. |
| guard .github/branch-protection.json (2026-09-27-required-checks-promotion) | docs/decisions/00714-2026-09-27-required-checks-promotion.md | holds | File is .github/branch-protection.json. Ledger lint reports the guard wired. |
| guard .github/branch-protection.json (2026-09-27-supply-demand-e2e-required) | docs/decisions/00715-2026-09-27-supply-demand-e2e-required.md | holds | File is .github/branch-protection.json. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/items/:itemId/comments | docs/decisions/00716-2026-09-27-pending-advisor-no-comments-fix.md | holds | Mounted at server/routes/booking-actions.ts:1734. |
| test pin server/__tests__/item-comments-write-status.db.test.ts (2026-09-27-pending-advisor-no-comments-fix) | docs/decisions/00716-2026-09-27-pending-advisor-no-comments-fix.md | holds | File is server/__tests__/item-comments-write-status.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/ready-made/:id/approve | docs/decisions/00717-2026-09-27-admin-kind-reflects-refunds.md | holds | Mounted at server/routes/admin.routes.ts:1379. |
| test pin server/__tests__/admin-kind-reflects-refunds.db.test.ts (2026-09-27-admin-kind-reflects-refunds) | docs/decisions/00717-2026-09-27-admin-kind-reflects-refunds.md | holds | File is server/__tests__/admin-kind-reflects-refunds.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/bundle-all-undelivered.db.test.ts (2026-09-27-bundle-all-undelivered-reverts-item) | docs/decisions/00718-2026-09-27-bundle-all-undelivered-reverts-item.md | holds | File is server/__tests__/bundle-all-undelivered.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/cart | docs/decisions/00719-2026-09-27-service-fee-before-checkout.md | holds | Mounted at server/routes.ts:9468. |
| route POST /api/checkout | docs/decisions/00719-2026-09-27-service-fee-before-checkout.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin client/src/lib/__tests__/traveler-fee-preview.test.ts (2026-09-27-service-fee-before-checkout) | docs/decisions/00719-2026-09-27-service-fee-before-checkout.md | holds | File is client/src/lib/__tests__/traveler-fee-preview.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/cart-traveler-fee-preview.http.test.ts (2026-09-27-service-fee-before-checkout) | docs/decisions/00719-2026-09-27-service-fee-before-checkout.md | holds | File is server/__tests__/cart-traveler-fee-preview.http.test.ts. Ledger lint reports the guard wired. |
| route GET /api/cart/fee-preview | docs/decisions/00720-2026-09-27-trip-pass-waiver-per-line.md | holds | Mounted at server/routes/payments.routes.ts:2707. |
| route POST /api/checkout | docs/decisions/00720-2026-09-27-trip-pass-waiver-per-line.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin server/__tests__/checkout-trip-pass-per-line.http.test.ts (2026-09-27-trip-pass-waiver-per-line) | docs/decisions/00720-2026-09-27-trip-pass-waiver-per-line.md | holds | File is server/__tests__/checkout-trip-pass-per-line.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fee-preview-entitlement.http.test.ts (2026-09-27-trip-pass-waiver-per-line) | docs/decisions/00720-2026-09-27-trip-pass-waiver-per-line.md | holds | File is server/__tests__/fee-preview-entitlement.http.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-27-checkout-stamp-from-line-trip) | docs/decisions/00721-2026-09-27-checkout-stamp-from-line-trip.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/checkout | docs/decisions/00721-2026-09-27-checkout-stamp-from-line-trip.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin client/src/lib/__tests__/item-booking-state.test.ts (2026-09-27-refunded-item-status) | docs/decisions/00722-2026-09-27-refunded-item-status.md | holds | File is client/src/lib/__tests__/item-booking-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/refunded-item-status.db.test.ts (2026-09-27-refunded-item-status) | docs/decisions/00722-2026-09-27-refunded-item-status.md | holds | File is server/__tests__/refunded-item-status.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/booking-status-vocabulary.test.ts (2026-09-27-booking-status-vocabulary) | docs/decisions/00723-2026-09-27-booking-status-vocabulary.md | holds | File is client/src/lib/__tests__/booking-status-vocabulary.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/item-booking-state.test.ts (2026-09-27-booking-status-vocabulary) | docs/decisions/00723-2026-09-27-booking-status-vocabulary.md | holds | File is client/src/lib/__tests__/item-booking-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/booking-status-vocabulary.db.test.ts (2026-09-27-booking-status-vocabulary) | docs/decisions/00723-2026-09-27-booking-status-vocabulary.md | holds | File is server/__tests__/booking-status-vocabulary.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/plancard | docs/decisions/00724-2026-09-27-payer-reads-plancard.md | holds | Mounted at server/routes/plancard.routes.ts:778. |
| test pin server/__tests__/payer-reads-plancard.db.test.ts (2026-09-27-payer-reads-plancard) | docs/decisions/00724-2026-09-27-payer-reads-plancard.md | holds | File is server/__tests__/payer-reads-plancard.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/items/:itemId/route | docs/decisions/00725-2026-09-27-retry-failed-payment.md | holds | Mounted at server/routes/routing.routes.ts:138. |
| test pin server/__tests__/retry-failed-payment.db.test.ts (2026-09-27-retry-failed-payment) | docs/decisions/00725-2026-09-27-retry-failed-payment.md | holds | File is server/__tests__/retry-failed-payment.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-27-bundle-cancel-notice-deferred) | docs/decisions/00726-2026-09-27-bundle-cancel-notice-deferred.md | holds | Row is marked advisory; it names no CI guard. |
| guard playwright.supply-demand.config.ts (2026-09-27-s1-approval-queue-load-race) | docs/decisions/00727-2026-09-27-s1-approval-queue-load-race.md | holds | File is playwright.supply-demand.config.ts. Ledger lint reports the guard wired. |
| route /admin/service-approvals | docs/decisions/00727-2026-09-27-s1-approval-queue-load-race.md | holds | Client Route or Redirect matches /admin/service-approvals. |
| route GET /api/admin/provider-services/pending | docs/decisions/00727-2026-09-27-s1-approval-queue-load-race.md | holds | Mounted at server/routes/admin.routes.ts:4332. |
| guard playwright.supply-demand.config.ts (2026-09-27-s1-login-must-land) | docs/decisions/00728-2026-09-27-s1-login-must-land.md | holds | File is playwright.supply-demand.config.ts. Ledger lint reports the guard wired. |
| route GET /api/auth/user | docs/decisions/00728-2026-09-27-s1-login-must-land.md | holds | Mounted at server/replit_integrations/auth/routes.ts:152. |
| route POST /api/auth/login | docs/decisions/00728-2026-09-27-s1-login-must-land.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:281. |
| guard scripts/check-e2e-helper-waits.cjs (2026-09-27-e2e-helpers-confirm-effect) | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | File is scripts/check-e2e-helper-waits.cjs. Ledger lint reports the guard wired. |
| route PATCH /api/admin/users/:id/verification | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/routes/admin.routes.ts:3386. |
| route PATCH /api/me/handle | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/routes/storefront.routes.ts:101. |
| route PATCH /api/provider/services | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Live path is PATCH /api/provider/services/:id at server/routes.ts:4492. |
| route PATCH /api/provider/services/:id | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/routes.ts:4492. |
| route POST /api/auth/register | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| route POST /api/expert-application | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/routes.ts:2702. |
| route POST /api/provider-application | docs/decisions/00729-2026-09-27-e2e-helpers-confirm-effect.md | holds | Mounted at server/routes.ts:2943. |
| guard scripts/check-decision-guards.cjs (2026-09-27-r-number-lint) | docs/decisions/00730-2026-09-27-r-number-lint.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-27-fetch-blocked-port) | docs/decisions/00731-2026-09-27-fetch-blocked-port.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/my-bookings | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | Mounted (GET). |
| route GET /api/my-bookings | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | Mounted at server/routes.ts:6849. |
| route POST /api/bookings/:id/cancel | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | Mounted at server/routes.ts:8612. |
| route POST /api/bookings/:id/dispute | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | Mounted at server/routes/bookings.ts:859. |
| route POST /api/bookings/webhooks/stripe | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | Mounted at server/routes/bookings.ts:652. |
| test pin client/src/lib/__tests__/item-booking-state.test.ts (2026-09-27-dashboard-refund-reads-refunded) | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | File is client/src/lib/__tests__/item-booking-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/dashboard-refund-reads-refunded.db.test.ts (2026-09-27-dashboard-refund-reads-refunded) | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | File is server/__tests__/dashboard-refund-reads-refunded.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/refund-merged-design.db.test.ts (2026-09-27-dashboard-refund-reads-refunded) | docs/decisions/00732-2026-09-27-dashboard-refund-reads-refunded.md | holds | File is server/__tests__/refund-merged-design.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/bookings/process-cart | docs/decisions/00733-2026-09-27-platform-payment-failed.md | holds | Mounted at server/routes/bookings.ts:162. |
| route POST /api/bookings/webhooks/stripe | docs/decisions/00733-2026-09-27-platform-payment-failed.md | holds | Mounted at server/routes/bookings.ts:652. |
| route POST /api/webhooks/stripe | docs/decisions/00733-2026-09-27-platform-payment-failed.md | holds | Mounted at server/routes/webhooks.routes.ts:535. |
| test pin server/__tests__/platform-payment-failed.db.test.ts (2026-09-27-platform-payment-failed) | docs/decisions/00733-2026-09-27-platform-payment-failed.md | holds | File is server/__tests__/platform-payment-failed.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/checkout | docs/decisions/00734-2026-09-27-failed-is-final.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin server/__tests__/checkout-payment-failed-final.stripe.db.test.ts (2026-09-27-failed-is-final) | docs/decisions/00734-2026-09-27-failed-is-final.md | holds | File is server/__tests__/checkout-payment-failed-final.stripe.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/platform-payment-failed.db.test.ts (2026-09-27-failed-is-final) | docs/decisions/00734-2026-09-27-failed-is-final.md | holds | File is server/__tests__/platform-payment-failed.db.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/checkout-sweep | docs/decisions/00735-2026-09-27-stale-authorized-sweep.md | holds | Mounted (POST). |
| test pin server/__tests__/stale-authorized-sweep.db.test.ts (2026-09-27-stale-authorized-sweep) | docs/decisions/00735-2026-09-27-stale-authorized-sweep.md | holds | File is server/__tests__/stale-authorized-sweep.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/dispute-hardening.db.test.ts (2026-09-27-dispute-hardening) | docs/decisions/00736-2026-09-27-dispute-hardening.md | holds | File is server/__tests__/dispute-hardening.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stripe-refs-earner-leak.http.test.ts (2026-09-27-dispute-hardening) | docs/decisions/00736-2026-09-27-dispute-hardening.md | holds | File is server/__tests__/stripe-refs-earner-leak.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/data-sanitizer.test.ts (2026-09-27-dispute-hardening) | docs/decisions/00736-2026-09-27-dispute-hardening.md | holds | File is server/utils/__tests__/data-sanitizer.test.ts. Ledger lint reports the guard wired. |
| route /admin/reconciliation | docs/decisions/00737-2026-09-27-admin-exception-refund.md | holds | Client Route or Redirect matches /admin/reconciliation. |
| route POST /api/admin/bookings/:bookingId/exception-refund | docs/decisions/00737-2026-09-27-admin-exception-refund.md | holds | Mounted at server/routes/admin.routes.ts:784. |
| route POST /api/bookings/refund | docs/decisions/00737-2026-09-27-admin-exception-refund.md | holds | Mounted at server/routes/bookings.ts:658. |
| test pin client/src/lib/__tests__/exception-refund.test.ts (2026-09-27-admin-exception-refund) | docs/decisions/00737-2026-09-27-admin-exception-refund.md | holds | File is client/src/lib/__tests__/exception-refund.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/admin-exception-refund.db.test.ts (2026-09-27-admin-exception-refund) | docs/decisions/00737-2026-09-27-admin-exception-refund.md | holds | File is server/__tests__/admin-exception-refund.db.test.ts. Ledger lint reports the guard wired. |
| route /plans/:tripId | docs/decisions/00738-2026-09-27-expired-row-next-step.md | holds | Client Route or Redirect matches /plans/:p. |
| test pin client/src/lib/__tests__/expired-booking.test.ts (2026-09-27-expired-row-next-step) | docs/decisions/00738-2026-09-27-expired-row-next-step.md | holds | File is client/src/lib/__tests__/expired-booking.test.ts. Ledger lint reports the guard wired. |
| route GET /api/auth/terms-versions | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | Mounted at server/replit_integrations/auth/routes.ts:198. |
| route POST /api/auth/accept-terms | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | Mounted at server/replit_integrations/auth/routes.ts:164. |
| route POST /api/bookings/refund | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | Mounted at server/routes/bookings.ts:658. |
| test pin server/__tests__/cancel-preview-equals-refund.stripe.db.test.ts (2026-09-27-cancel-preview-equals-refund) | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | File is server/__tests__/cancel-preview-equals-refund.stripe.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/cancel-preview-matrix.db.test.ts (2026-09-27-cancel-preview-equals-refund) | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | File is server/__tests__/cancel-preview-matrix.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/legal-versions.test.ts (2026-09-27-cancel-preview-equals-refund) | docs/decisions/00739-2026-09-27-cancel-preview-equals-refund.md | holds | File is shared/__tests__/legal-versions.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stripe-refs-earner-leak.http.test.ts (2026-09-27-earner-reads-stripe-identifiers) | docs/decisions/00740-2026-09-27-earner-reads-stripe-identifiers.md | holds | File is server/__tests__/stripe-refs-earner-leak.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/data-sanitizer.test.ts (2026-09-27-earner-reads-stripe-identifiers) | docs/decisions/00740-2026-09-27-earner-reads-stripe-identifiers.md | holds | File is server/utils/__tests__/data-sanitizer.test.ts. Ledger lint reports the guard wired. |
| route /chat | docs/decisions/00741-2026-09-27-footer-ia.md | holds | Client Route or Redirect matches /chat. |
| route /dashboard | docs/decisions/00741-2026-09-27-footer-ia.md | holds | Client Route or Redirect matches /dashboard. |
| test pin client/src/lib/__tests__/footer-guest-routes.test.ts (2026-09-27-footer-ia) | docs/decisions/00741-2026-09-27-footer-ia.md | holds | File is client/src/lib/__tests__/footer-guest-routes.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/footer-links.spec.ts (2026-09-27-footer-ia) | docs/decisions/00741-2026-09-27-footer-ia.md | holds | File is playwright/tests/footer-links.spec.ts. Ledger lint reports the guard wired. |
| route POST /api/expert/trips/:tripId/vendors | docs/decisions/00742-2026-09-27-form-fields-admitted.md | holds | Mounted at server/routes/experts.routes.ts:357. |
| route POST /api/quick-start-itinerary | docs/decisions/00742-2026-09-27-form-fields-admitted.md | holds | Mounted at server/routes.ts:12348. |
| route POST /api/trips/:id/expert-advisor | docs/decisions/00742-2026-09-27-form-fields-admitted.md | holds | Mounted at server/routes/booking-actions.ts:730. |
| test pin scripts/form-field-allowlist/scan.test.ts (2026-09-27-form-fields-admitted) | docs/decisions/00742-2026-09-27-form-fields-admitted.md | holds | File is scripts/form-field-allowlist/scan.test.ts. Ledger lint reports the guard wired. |
| route POST /api/provider/properties | docs/decisions/00743-2026-09-27-property-cancel-tier.md | holds | Mounted at server/routes/provider.routes.ts:580. |
| test pin client/src/lib/__tests__/property-create-tiers.test.ts (2026-09-27-property-cancel-tier) | docs/decisions/00743-2026-09-27-property-cancel-tier.md | holds | File is client/src/lib/__tests__/property-create-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/s8-property-builder.db.test.ts (2026-09-27-property-cancel-tier) | docs/decisions/00743-2026-09-27-property-cancel-tier.md | holds | File is server/__tests__/s8-property-builder.db.test.ts. Ledger lint reports the guard wired. |
| route /api/pricing | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | Mounted (GET). |
| route /faq | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | Client Route or Redirect matches /faq. |
| route /help | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | Client Route or Redirect matches /help. |
| route /help/:slug | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | Client Route or Redirect matches /help/:p. |
| route GET /api/pricing | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| test pin client/src/lib/__tests__/company-facts.test.ts (2026-09-27-help-center-and-company-pages) | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | File is client/src/lib/__tests__/company-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/help-article-links.test.ts (2026-09-27-help-center-and-company-pages) | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | File is client/src/lib/__tests__/help-article-links.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/cancellation-schedule.test.ts (2026-09-27-help-center-and-company-pages) | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | File is shared/__tests__/cancellation-schedule.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/help-articles.test.ts (2026-09-27-help-center-and-company-pages) | docs/decisions/00744-2026-09-27-help-center-and-company-pages.md | holds | File is shared/__tests__/help-articles.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-27-bring-main-in-before-merge) | docs/decisions/00745-2026-09-27-bring-main-in-before-merge.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/expert/blog | docs/decisions/00746-2026-09-27-blog-lifecycle.md | holds | Routes are still mounted under this prefix (for example POST /api/expert/blog/posts/:id/sign). |
| test pin server/__tests__/blog-lifecycle.db.test.ts (2026-09-27-blog-lifecycle) | docs/decisions/00746-2026-09-27-blog-lifecycle.md | holds | File is server/__tests__/blog-lifecycle.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/blog/drafts | docs/decisions/00747-2026-09-27-blog-draft.md | holds | Mounted at server/routes/blog.routes.ts:124. |
| test pin server/__tests__/blog-draft.db.test.ts (2026-09-27-blog-draft) | docs/decisions/00747-2026-09-27-blog-draft.md | holds | File is server/__tests__/blog-draft.db.test.ts. Ledger lint reports the guard wired. |
| route /blog | docs/decisions/00748-2026-09-27-blog-reactions-ask.md | holds | Client Route or Redirect matches /blog. |
| route /blog/:slug | docs/decisions/00748-2026-09-27-blog-reactions-ask.md | holds | Client Route or Redirect matches /blog/:p. |
| test pin client/src/lib/__tests__/inbox-context.test.ts (2026-09-27-blog-reactions-ask) | docs/decisions/00748-2026-09-27-blog-reactions-ask.md | holds | File is client/src/lib/__tests__/inbox-context.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/advisor-conversation-context.test.ts (2026-09-27-blog-reactions-ask) | docs/decisions/00748-2026-09-27-blog-reactions-ask.md | holds | File is server/__tests__/advisor-conversation-context.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/blog-reactions-ask.db.test.ts (2026-09-27-blog-reactions-ask) | docs/decisions/00748-2026-09-27-blog-reactions-ask.md | holds | File is server/__tests__/blog-reactions-ask.db.test.ts. Ledger lint reports the guard wired. |
| route /blog | docs/decisions/00749-2026-09-27-blog-pages.md | holds | Client Route or Redirect matches /blog. |
| route /blog/:slug | docs/decisions/00749-2026-09-27-blog-pages.md | holds | Client Route or Redirect matches /blog/:p. |
| route /s/:handle | docs/decisions/00749-2026-09-27-blog-pages.md | holds | Client Route or Redirect matches /s/:p. |
| route GET /api/blog/posts | docs/decisions/00749-2026-09-27-blog-pages.md | holds | Mounted at server/routes/blog.routes.ts:212. |
| test pin client/src/lib/__tests__/blog-view.test.ts (2026-09-27-blog-pages) | docs/decisions/00749-2026-09-27-blog-pages.md | holds | File is client/src/lib/__tests__/blog-view.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-28-validation-kit-ratified) | docs/decisions/00750-2026-09-28-validation-kit-ratified.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-track-a-ratified) | docs/decisions/00751-2026-09-28-track-a-ratified.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-a0-census-gate) | docs/decisions/00752-2026-09-28-a0-census-gate.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-part2-m2-flags) | docs/decisions/00753-2026-09-28-part2-m2-flags.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-part2-m4-matrix-first) | docs/decisions/00754-2026-09-28-part2-m4-matrix-first.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-part2-m6-free-rerun-hotel) | docs/decisions/00755-2026-09-28-part2-m6-free-rerun-hotel.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-part2-n4-runs-outlive-plan) | docs/decisions/00756-2026-09-28-part2-n4-runs-outlive-plan.md | holds | Row is marked advisory; it names no CI guard. |
| guard scripts/check-page-hex.cjs (2026-09-28-footer-pages-one-layout) | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | File is scripts/check-page-hex.cjs. Ledger lint reports the guard wired. |
| route /destinations | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | Client Route or Redirect matches /destinations. |
| route /experiences | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | Client Route or Redirect matches /experiences. |
| route /experts | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | Client Route or Redirect matches /experts. |
| route /pricing | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | Client Route or Redirect matches /pricing. |
| route /providers | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | Client Route or Redirect matches /providers. |
| test pin client/src/lib/__tests__/footer-pages-one-layout.test.ts (2026-09-28-footer-pages-one-layout) | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | File is client/src/lib/__tests__/footer-pages-one-layout.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/footer-links.spec.ts (2026-09-28-footer-pages-one-layout) | docs/decisions/00757-2026-09-28-footer-pages-one-layout.md | holds | File is playwright/tests/footer-links.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/evidence-scorer-cost-tracking.test.ts (2026-09-27-evidence-scorer-cost) | docs/decisions/00758-2026-09-27-evidence-scorer-cost.md | holds | File is server/__tests__/evidence-scorer-cost-tracking.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/cancellation-schedule.test.ts (2026-09-27-cancel-filter-labels) | docs/decisions/00759-2026-09-27-cancel-filter-labels.md | holds | File is shared/__tests__/cancellation-schedule.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/nav-i18n-keys.test.ts (2026-09-27-landing-hero-copy) | docs/decisions/00760-2026-09-27-landing-hero-copy.md | holds | File is client/src/lib/__tests__/nav-i18n-keys.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/i18n-key-parity.spec.ts (2026-09-27-landing-hero-copy) | docs/decisions/00760-2026-09-27-landing-hero-copy.md | holds | File is playwright/tests/i18n-key-parity.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/paid-runs-never-pruned.db.test.ts (2026-09-27-paid-runs-never-pruned) | docs/decisions/00761-2026-09-27-paid-runs-never-pruned.md | holds | File is server/__tests__/paid-runs-never-pruned.db.test.ts. Ledger lint reports the guard wired. |
| guard check-migration-indexes-declared (2026-09-27-migration-indexes-declared) | docs/decisions/00762-2026-09-27-migration-indexes-declared.md | holds | File is scripts/check-migration-indexes-declared.cjs. Ledger lint reports the guard wired. |
| route GET /api/admin/funnel-stats | docs/decisions/00763-2026-09-27-funnel-revenue-on-paid.md | holds | Mounted at server/routes.ts:12898. |
| route POST /api/expert-booking-requests | docs/decisions/00763-2026-09-27-funnel-revenue-on-paid.md | holds | Mounted at server/routes.ts:2052. |
| test pin server/__tests__/checkout-payment-promotion.db.test.ts (2026-09-27-funnel-revenue-on-paid) | docs/decisions/00763-2026-09-27-funnel-revenue-on-paid.md | holds | File is server/__tests__/checkout-payment-promotion.db.test.ts. Ledger lint reports the guard wired. |
| route /api/me/earnings-by-source | docs/decisions/00764-2026-09-28-no-payment-no-earnings.md | holds | Mounted (GET). |
| test pin server/__tests__/no-payment-no-earnings.db.test.ts (2026-09-28-no-payment-no-earnings) | docs/decisions/00764-2026-09-28-no-payment-no-earnings.md | holds | File is server/__tests__/no-payment-no-earnings.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/payment-on-record-writers.test.ts (2026-09-28-no-payment-no-earnings) | docs/decisions/00764-2026-09-28-no-payment-no-earnings.md | holds | File is server/__tests__/payment-on-record-writers.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/shared/:token | docs/decisions/00765-2026-09-27-funnel-share-token-purged.md | holds | Mounted at server/routes/booking-actions.ts:629. |
| route POST /api/trips/:id/share | docs/decisions/00765-2026-09-27-funnel-share-token-purged.md | holds | Mounted at server/routes/booking-actions.ts:576. |
| test pin server/__tests__/funnel-share-token-purge.db.test.ts (2026-09-27-funnel-share-token-purged) | docs/decisions/00765-2026-09-27-funnel-share-token-purged.md | holds | File is server/__tests__/funnel-share-token-purge.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-28-kyoto-supply-closed) | docs/decisions/00766-2026-09-28-kyoto-supply-closed.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-a1-census-gate) | docs/decisions/00767-2026-09-28-a1-census-gate.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-28-legacy-unpaid-bookings) | docs/decisions/00768-2026-09-28-legacy-unpaid-bookings.md | holds | Row is marked advisory; it names no CI guard. |
| route /api/me/earnings-by-source | docs/decisions/00768-2026-09-28-legacy-unpaid-bookings.md | holds | Mounted (GET). |
| guard advisory (2026-09-28-analytics-retention) | docs/decisions/00769-2026-09-28-analytics-retention.md | holds | Row is marked advisory; it names no CI guard. |
| test pin client/src/lib/__tests__/footer-pages-one-layout.test.ts (2026-09-28-landing-heading-navy) | docs/decisions/00770-2026-09-28-landing-heading-navy.md | holds | File is client/src/lib/__tests__/footer-pages-one-layout.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-28-s20-decline-diff-and-persona-step) | docs/decisions/00771-2026-09-28-s20-decline-diff-and-persona-step.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/blog | docs/decisions/00772-2026-09-28-blog-consoles.md | holds | Client Route or Redirect matches /admin/blog. |
| route /expert/blog-review | docs/decisions/00772-2026-09-28-blog-consoles.md | holds | Client Route or Redirect matches /expert/blog-review. |
| test pin client/src/lib/__tests__/blog-console.test.ts (2026-09-28-blog-consoles) | docs/decisions/00772-2026-09-28-blog-consoles.md | holds | File is client/src/lib/__tests__/blog-console.test.ts. Ledger lint reports the guard wired. |
| route /pricing | docs/decisions/00773-2026-09-28-landing-reorder.md | holds | Client Route or Redirect matches /pricing. |
| route GET /api/landing/billboard-experts | docs/decisions/00773-2026-09-28-landing-reorder.md | holds | Mounted at server/routes/landing.routes.ts:237. |
| test pin client/src/components/__tests__/landing-hero-representative.test.tsx (2026-09-28-landing-reorder) | docs/decisions/00773-2026-09-28-landing-reorder.md | holds | File is client/src/components/__tests__/landing-hero-representative.test.tsx. Ledger lint reports the guard wired. |
| route /events | docs/decisions/00774-2026-09-28-city-events.md | holds | Client Route or Redirect matches /events. |
| test pin shared/__tests__/city-events.test.ts (2026-09-28-city-events) | docs/decisions/00774-2026-09-28-city-events.md | holds | File is shared/__tests__/city-events.test.ts. Ledger lint reports the guard wired. |
| route /plans/:id | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | Client Route or Redirect matches /plans/:p. |
| route GET /api/me/upcoming | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | Mounted at server/routes/upcoming.routes.ts:33. |
| route GET /api/optimization-fee | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | Mounted at server/routes/optimization.routes.ts:283. |
| route POST /api/trips | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | Mounted at server/routes.ts:1456. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-28-a0-slice-spec) | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/trip-mint-entry.test.ts (2026-09-28-a0-slice-spec) | docs/decisions/00775-2026-09-28-a0-slice-spec.md | holds | File is server/services/__tests__/trip-mint-entry.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ai/generate-itinerary | docs/decisions/00776-2026-09-28-kyoto-s4-draft-ci.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-28-kyoto-s4-draft-ci) | docs/decisions/00776-2026-09-28-kyoto-s4-draft-ci.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/free-draft-event.test.ts (2026-09-28-kyoto-s4-draft-ci) | docs/decisions/00776-2026-09-28-kyoto-s4-draft-ci.md | holds | File is server/services/__tests__/free-draft-event.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/upcoming-loader.db.test.ts (2026-09-28-upcoming-dates-confirmed) | docs/decisions/00777-2026-09-28-upcoming-dates-confirmed.md | holds | File is server/services/__tests__/upcoming-loader.db.test.ts. Ledger lint reports the guard wired. |
| guard .github/branch-protection.json (2026-09-28-kyoto-slice-required) | docs/decisions/00778-2026-09-28-kyoto-slice-required.md | holds | File is .github/branch-protection.json. Ledger lint reports the guard wired. |
| route /events | docs/decisions/00779-2026-09-28-landing-doors.md | holds | Client Route or Redirect matches /events. |
| route /pricing | docs/decisions/00779-2026-09-28-landing-doors.md | holds | Client Route or Redirect matches /pricing. |
| test pin server/services/__tests__/trip-mint-entry.test.ts (2026-09-28-landing-doors) | docs/decisions/00779-2026-09-28-landing-doors.md | holds | File is server/services/__tests__/trip-mint-entry.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/landing-hero-representative.test.tsx (2026-09-28-billboard-override-listing) | docs/decisions/00780-2026-09-28-billboard-override-listing.md | holds | File is client/src/components/__tests__/landing-hero-representative.test.tsx. Ledger lint reports the guard wired. |
| route /api/cart/items | docs/decisions/00781-2026-09-28-checkout-stamp-from-line-trip-built.md | holds | Mounted (POST). |
| route POST /api/cart | docs/decisions/00781-2026-09-28-checkout-stamp-from-line-trip-built.md | holds | Mounted at server/routes.ts:9893. |
| route POST /api/checkout | docs/decisions/00781-2026-09-28-checkout-stamp-from-line-trip-built.md | holds | Mounted at server/routes/payments.routes.ts:1142. |
| test pin server/__tests__/checkout-stamp-from-line-trip.http.test.ts (2026-09-28-checkout-stamp-from-line-trip-built) | docs/decisions/00781-2026-09-28-checkout-stamp-from-line-trip-built.md | holds | File is server/__tests__/checkout-stamp-from-line-trip.http.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/city-events.test.ts (2026-09-28-resale-ticket-hosts) | docs/decisions/00782-2026-09-28-resale-ticket-hosts.md | holds | File is shared/__tests__/city-events.test.ts. Ledger lint reports the guard wired. |
| route POST /api/cart | docs/decisions/00783-2026-09-28-cart-add-trip-ownership.md | holds | Mounted at server/routes.ts:9893. |
| test pin server/__tests__/cart-add-trip-ownership.http.test.ts (2026-09-28-cart-add-trip-ownership) | docs/decisions/00783-2026-09-28-cart-add-trip-ownership.md | holds | File is server/__tests__/cart-add-trip-ownership.http.test.ts. Ledger lint reports the guard wired. |
| route /experts | docs/decisions/00784-2026-09-29-expert-door.md | holds | Client Route or Redirect matches /experts. |
| route GET /api/trips/:tripId/expert-help/picker | docs/decisions/00784-2026-09-29-expert-door.md | holds | Mounted at server/routes/expert-door.routes.ts:36. |
| route POST /api/expert-booking-requests | docs/decisions/00784-2026-09-29-expert-door.md | holds | Mounted at server/routes.ts:2052. |
| test pin client/src/lib/__tests__/expert-door.test.ts (2026-09-29-expert-door) | docs/decisions/00784-2026-09-29-expert-door.md | holds | File is client/src/lib/__tests__/expert-door.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-expert-door) | docs/decisions/00784-2026-09-29-expert-door.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/trip-mint-entry.test.ts (2026-09-29-expert-door) | docs/decisions/00784-2026-09-29-expert-door.md | holds | File is server/services/__tests__/trip-mint-entry.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/expert-door.test.ts (2026-09-29-expert-door) | docs/decisions/00784-2026-09-29-expert-door.md | holds | File is shared/__tests__/expert-door.test.ts. Ledger lint reports the guard wired. |
| route /plans/:tripId/compare/:setId | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | Client Route or Redirect matches /plans/:p/compare/:p. |
| route POST /api/trips/:tripId/slip-events | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:277. |
| test pin client/src/lib/__tests__/plan-compare.test.ts (2026-09-29-a4-plan-fit-compare) | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | File is client/src/lib/__tests__/plan-compare.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-a4-plan-fit-compare) | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-option-sets.db.test.ts (2026-09-29-a4-plan-fit-compare) | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | File is server/__tests__/plan-option-sets.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-fit.test.ts (2026-09-29-a4-plan-fit-compare) | docs/decisions/00785-2026-09-29-a4-plan-fit-compare.md | holds | File is shared/__tests__/plan-fit.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:id | docs/decisions/00786-2026-09-29-a1-trips-frame.md | holds | Mounted at server/routes/trips.routes.ts:390. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-a1-trips-frame) | docs/decisions/00786-2026-09-29-a1-trips-frame.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/experience-group.test.ts (2026-09-29-a1-trips-frame) | docs/decisions/00786-2026-09-29-a1-trips-frame.md | holds | File is shared/__tests__/experience-group.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00787-2026-09-29-health-last-migration.md | holds | Mounted (GET). |
| test pin server/services/__tests__/migration-state.test.ts (2026-09-29-health-last-migration) | docs/decisions/00787-2026-09-29-health-last-migration.md | holds | File is server/services/__tests__/migration-state.test.ts. Ledger lint reports the guard wired. |
| guard scripts/assign-r-numbers.cjs (2026-09-29-r-number-at-merge) | docs/decisions/00788-2026-09-29-r-number-at-merge.md | holds | File is scripts/assign-r-numbers.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-09-29-census-gate-governs-release) | docs/decisions/00789-2026-09-29-census-gate-governs-release.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-09-29-m7-m9-ratified) | docs/decisions/00790-2026-09-29-m7-m9-ratified.md | holds | Row is marked advisory; it names no CI guard. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-a3b-option-sets-slip) | docs/decisions/00791-2026-09-29-a3b-option-sets-slip.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-option-sets.db.test.ts (2026-09-29-a3b-option-sets-slip) | docs/decisions/00791-2026-09-29-a3b-option-sets-slip.md | holds | File is server/__tests__/plan-option-sets.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-fit.test.ts (2026-09-29-a3b-option-sets-slip) | docs/decisions/00791-2026-09-29-a3b-option-sets-slip.md | holds | File is shared/__tests__/plan-fit.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/anchor/promote | docs/decisions/00792-2026-09-29-a3-option-sets.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:266. |
| test pin server/__tests__/plan-option-sets.db.test.ts (2026-09-29-a3-option-sets) | docs/decisions/00792-2026-09-29-a3-option-sets.md | holds | File is server/__tests__/plan-option-sets.db.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00793-2026-09-29-matrix-daily.md | holds | Mounted (GET). |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-matrix-daily) | docs/decisions/00793-2026-09-29-matrix-daily.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-09-29-matrix-daily) | docs/decisions/00793-2026-09-29-matrix-daily.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| route /api/destination-intelligence | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/destination-intelligence. |
| route /api/grok/chat | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/chat. |
| route /api/grok/content/generate | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/content/generate. |
| route /api/grok/health | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/health. |
| route /api/grok/intelligence | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/intelligence. |
| route /api/grok/itinerary/generate | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted handler matches /api/grok/itinerary/generate. |
| route /api/grok/match-experts | docs/decisions/00794-2026-09-30-retire-xai.md | holds | Mounted (POST). |
| route /api/ready | docs/decisions/00794-2026-09-30-retire-xai.md | holds | Mounted (GET). |
| route GET /api/trips/:tripId/itinerary/recommendations | docs/decisions/00794-2026-09-30-retire-xai.md | gone | No mounted GET /api/trips/:p/itinerary/recommendations. |
| route POST /api/expert/ai-tasks | docs/decisions/00794-2026-09-30-retire-xai.md | holds | Live path is POST /api/expert/ai-tasks/:taskId/approve at server/routes.ts:12632. |
| test pin server/__tests__/ai-draft-eligibility.test.ts (2026-09-30-retire-xai) | docs/decisions/00794-2026-09-30-retire-xai.md | holds | File is server/__tests__/ai-draft-eligibility.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ai-rate-limit-coverage.test.ts (2026-09-30-retire-xai) | docs/decisions/00794-2026-09-30-retire-xai.md | holds | File is server/__tests__/ai-rate-limit-coverage.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/affiliate/partners/:id/page-extract | docs/decisions/00795-2026-09-30-affiliate-extract-compliant.md | holds | Mounted at server/routes/content.routes.ts:8891. |
| test pin shared/__tests__/affiliate-extract.test.ts (2026-09-30-affiliate-extract-compliant) | docs/decisions/00795-2026-09-30-affiliate-extract-compliant.md | holds | File is shared/__tests__/affiliate-extract.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-09-30-a8-travel-time-service) | docs/decisions/00796-2026-09-30-a8-travel-time-service.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/expert/ai-stats | docs/decisions/00797-2026-09-30-ai-task-honest-numbers.md | holds | Mounted at server/routes.ts:12788. |
| route POST /api/expert/ai-tasks/delegate | docs/decisions/00797-2026-09-30-ai-task-honest-numbers.md | holds | Mounted at server/routes.ts:12536. |
| test pin server/__tests__/ai-honest-numbers.test.ts (2026-09-30-ai-task-honest-numbers) | docs/decisions/00797-2026-09-30-ai-task-honest-numbers.md | holds | File is server/__tests__/ai-honest-numbers.test.ts. Ledger lint reports the guard wired. |
| route POST /internal/jobs/travel-matrix-refresh | docs/decisions/00798-2026-09-29-a2-travel-time-matrix.md | holds | Mounted at server/routes/internal.routes.ts:408. |
| test pin shared/__tests__/travel-time.test.ts (2026-09-29-a2-travel-time-matrix) | docs/decisions/00798-2026-09-29-a2-travel-time-matrix.md | holds | File is shared/__tests__/travel-time.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-slip-item-name-390) | docs/decisions/00799-2026-09-29-slip-item-name-390.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| route /api/destination-intelligence | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | gone | No mounted handler matches /api/destination-intelligence. |
| route /api/discover/location/:city | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | Mounted (GET). |
| route /api/health | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | Mounted (GET). |
| route /api/landing/hero | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | Mounted (GET). |
| route /api/travelpulse/cities | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | Mounted (GET). |
| route /api/travelpulse/cities/:cityName | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | Mounted (GET). |
| test pin server/__tests__/travelpulse-public-crowd.db.test.ts (2026-09-29-travelpulse-hygiene) | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | File is server/__tests__/travelpulse-public-crowd.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/trend-engine/__tests__/run-health.test.ts (2026-09-29-travelpulse-hygiene) | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | File is server/services/trend-engine/__tests__/run-health.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/trend-display.test.ts (2026-09-29-travelpulse-hygiene) | docs/decisions/00800-2026-09-29-travelpulse-hygiene.md | holds | File is shared/__tests__/trend-display.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/content-facts-engine.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is server/services/__tests__/content-facts-engine.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/free-draft-event.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is server/services/__tests__/free-draft-event.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-facts.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is shared/__tests__/content-facts.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/draft-basis.test.ts (2026-09-29-a5-draft-open-set) | docs/decisions/00801-2026-09-29-a5-draft-open-set.md | holds | File is shared/__tests__/draft-basis.test.ts. Ledger lint reports the guard wired. |
| route POST /api/itinerary-comparisons/:id/adopt-stops | docs/decisions/00802-2026-09-30-a7-version-per-option.md | holds | Mounted at server/routes/plancard.routes.ts:570. |
| test pin server/__tests__/version-per-option.db.test.ts (2026-09-30-a7-version-per-option) | docs/decisions/00802-2026-09-30-a7-version-per-option.md | holds | File is server/__tests__/version-per-option.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/version-options.test.ts (2026-09-30-a7-version-per-option) | docs/decisions/00802-2026-09-30-a7-version-per-option.md | holds | File is shared/__tests__/version-options.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/activate-transport | docs/decisions/00803-2026-09-30-a8-travel-time-built.md | holds | Mounted at server/routes.ts:13779. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-30-a8-travel-time-built) | docs/decisions/00803-2026-09-30-a8-travel-time-built.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/leg-resolution.test.ts (2026-09-30-a8-travel-time-built) | docs/decisions/00803-2026-09-30-a8-travel-time-built.md | holds | File is shared/__tests__/leg-resolution.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/draft-party-and-honest-stats.test.ts (2026-09-30-occasion-party-and-honest-stats) | docs/decisions/00804-2026-09-30-occasion-party-and-honest-stats.md | holds | File is shared/__tests__/draft-party-and-honest-stats.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/blog/race-weekends | docs/decisions/00805-2026-09-30-blog-race-weekend.md | holds | Mounted at server/routes/blog.routes.ts:163. |
| test pin server/services/__tests__/blog-race-weekend.db.test.ts (2026-09-30-blog-race-weekend) | docs/decisions/00805-2026-09-30-blog-race-weekend.md | holds | File is server/services/__tests__/blog-race-weekend.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/blog/series-follows | docs/decisions/00806-2026-09-30-blog-series-follow.md | holds | Mounted at server/routes/blog.routes.ts:151. |
| test pin server/services/__tests__/blog-series-follow.db.test.ts (2026-09-30-blog-series-follow) | docs/decisions/00806-2026-09-30-blog-series-follow.md | holds | File is server/services/__tests__/blog-series-follow.db.test.ts. Ledger lint reports the guard wired. |
| route /blog/:slug | docs/decisions/00807-2026-09-30-blog-event-guide.md | holds | Client Route or Redirect matches /blog/:p. |
| route POST /api/admin/blog/event-guides | docs/decisions/00807-2026-09-30-blog-event-guide.md | holds | Mounted at server/routes/blog.routes.ts:141. |
| test pin server/services/__tests__/blog-event-guide.db.test.ts (2026-09-30-blog-event-guide) | docs/decisions/00807-2026-09-30-blog-event-guide.md | holds | File is server/services/__tests__/blog-event-guide.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-09-30-public-content-facts-rank-only) | docs/decisions/00808-2026-09-30-public-content-facts-rank-only.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/blog-event-guide.db.test.ts (2026-09-30-public-content-facts-rank-only) | docs/decisions/00808-2026-09-30-public-content-facts-rank-only.md | holds | File is server/services/__tests__/blog-event-guide.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events.db.test.ts (2026-09-30-city-events-vertical-series) | docs/decisions/00809-2026-09-30-city-events-vertical-series.md | holds | File is server/__tests__/city-events.db.test.ts. Ledger lint reports the guard wired. |
| route POST /internal/jobs/travelpulse-weekly | docs/decisions/00810-2026-09-30-travelpulse-weekly-schedule.md | holds | Mounted at server/routes/internal.routes.ts:415. |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-09-30-travelpulse-weekly-schedule) | docs/decisions/00810-2026-09-30-travelpulse-weekly-schedule.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/internal-jobs-auth.http.test.ts (2026-09-30-travelpulse-weekly-schedule) | docs/decisions/00810-2026-09-30-travelpulse-weekly-schedule.md | holds | File is server/routes/__tests__/internal-jobs-auth.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/travelpulse-weekly.db.test.ts (2026-09-30-travelpulse-weekly-schedule) | docs/decisions/00810-2026-09-30-travelpulse-weekly-schedule.md | holds | File is server/services/__tests__/travelpulse-weekly.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/blog/travelpulse-weekly | docs/decisions/00811-2026-09-30-travelpulse-weekly.md | holds | Mounted at server/routes/blog.routes.ts:133. |
| test pin server/services/__tests__/travelpulse-weekly.db.test.ts (2026-09-30-travelpulse-weekly) | docs/decisions/00811-2026-09-30-travelpulse-weekly.md | holds | File is server/services/__tests__/travelpulse-weekly.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/travelpulse-public-crowd.db.test.ts (2026-09-30-travelpulse-crowd-band) | docs/decisions/00812-2026-09-30-travelpulse-crowd-band.md | holds | File is server/__tests__/travelpulse-public-crowd.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/trend-engine/__tests__/crowd-band.test.ts (2026-09-30-travelpulse-crowd-band) | docs/decisions/00812-2026-09-30-travelpulse-crowd-band.md | holds | File is server/services/trend-engine/__tests__/crowd-band.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/trend-display.test.ts (2026-09-30-travelpulse-crowd-band) | docs/decisions/00812-2026-09-30-travelpulse-crowd-band.md | holds | File is shared/__tests__/trend-display.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/affiliate-extract.test.ts (2026-09-30-affiliate-extract-killswitch) | docs/decisions/00813-2026-09-30-affiliate-extract-killswitch.md | holds | File is shared/__tests__/affiliate-extract.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-30-b5-dates-days-and-nights) | docs/decisions/00814-2026-09-30-b5-dates-days-and-nights.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-span-label.test.ts (2026-09-30-b5-dates-days-and-nights) | docs/decisions/00814-2026-09-30-b5-dates-days-and-nights.md | holds | File is shared/__tests__/plan-span-label.test.ts. Ledger lint reports the guard wired. |
| route /itinerary-comparison/:id | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| route /plans/:id | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | Client Route or Redirect matches /plans/:p. |
| route POST /api/ai/generate-itinerary | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| test pin e2e/specs/journey-2.spec.ts (2026-09-30-b3-b6-draft-is-the-deliverable) | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | File is e2e/specs/journey-2.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-30-b3-b6-draft-is-the-deliverable) | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-09-30-b3-b6-draft-is-the-deliverable) | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/free-draft-no-optimizer.test.ts (2026-09-30-b3-b6-draft-is-the-deliverable) | docs/decisions/00815-2026-09-30-b3-b6-draft-is-the-deliverable.md | holds | File is server/__tests__/free-draft-no-optimizer.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/trips/:id | docs/decisions/00816-2026-09-30-b1-new-plan-inherits-nothing.md | holds | Mounted at server/routes.ts:1609. |
| test pin client/src/lib/__tests__/new-plan-door.test.ts (2026-09-30-b1-new-plan-inherits-nothing) | docs/decisions/00816-2026-09-30-b1-new-plan-inherits-nothing.md | holds | File is client/src/lib/__tests__/new-plan-door.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-09-30-b1-new-plan-inherits-nothing) | docs/decisions/00816-2026-09-30-b1-new-plan-inherits-nothing.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/optimizer-runs | docs/decisions/00817-2026-09-30-a9-run-records.md | holds | Mounted at server/routes/plancard.routes.ts:764. |
| test pin server/__tests__/optimizer-run-records.db.test.ts (2026-09-30-a9-run-records) | docs/decisions/00817-2026-09-30-a9-run-records.md | holds | File is server/__tests__/optimizer-run-records.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/migrations/__tests__/chain-integrity.test.ts (2026-09-30-a9-run-records) | docs/decisions/00817-2026-09-30-a9-run-records.md | holds | File is server/migrations/__tests__/chain-integrity.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/optimizer-runs.test.ts (2026-09-30-a9-run-records) | docs/decisions/00817-2026-09-30-a9-run-records.md | holds | File is shared/__tests__/optimizer-runs.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-09-30-places-named-gate) | docs/decisions/00818-2026-09-30-places-named-gate.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00819-2026-09-30-health-flags.md | holds | Mounted (GET). |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-09-30-health-flags) | docs/decisions/00819-2026-09-30-health-flags.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-09-30-places-address) | docs/decisions/00820-2026-09-30-places-address.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-09-30-places-address) | docs/decisions/00820-2026-09-30-places-address.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/content-facts-engine.test.ts (2026-09-30-places-address) | docs/decisions/00820-2026-09-30-places-address.md | holds | File is server/services/__tests__/content-facts-engine.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-01-city-events-seed-lane-2) | docs/decisions/00821-2026-10-01-city-events-seed-lane-2.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/00822-2026-10-01-city-events-nine-seed.md | holds | Client Route or Redirect matches /admin/content-sources. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-01-city-events-nine-seed) | docs/decisions/00822-2026-10-01-city-events-nine-seed.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/paid-run-fresh-fetch.test.ts (2026-10-01-a9-paid-run-fresh-fetch) | docs/decisions/00823-2026-10-01-a9-paid-run-fresh-fetch.md | holds | File is server/__tests__/paid-run-fresh-fetch.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/place-facts/:factId/confirm | docs/decisions/00824-2026-10-01-a6-expert-confirm.md | holds | Mounted at server/routes/content-facts.routes.ts:61. |
| test pin server/__tests__/fact-confirm.db.test.ts (2026-10-01-a6-expert-confirm) | docs/decisions/00824-2026-10-01-a6-expert-confirm.md | holds | File is server/__tests__/fact-confirm.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/itinerary-items/:itemId/fresh-facts | docs/decisions/00825-2026-10-01-a6-tavily-extract.md | holds | Mounted at server/routes/content-facts.routes.ts:27. |
| test pin server/__tests__/tavily-extract.db.test.ts (2026-10-01-a6-tavily-extract) | docs/decisions/00825-2026-10-01-a6-tavily-extract.md | holds | File is server/__tests__/tavily-extract.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/00826-2026-10-01-a6-registry-surface.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route /api/admin/content-sources | docs/decisions/00826-2026-10-01-a6-registry-surface.md | holds | Mounted (GET/POST). |
| test pin server/__tests__/content-sources.db.test.ts (2026-10-01-a6-registry-surface) | docs/decisions/00826-2026-10-01-a6-registry-surface.md | holds | File is server/__tests__/content-sources.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-coverage.test.ts (2026-10-01-a6-sub-needs) | docs/decisions/00827-2026-10-01-a6-sub-needs.md | holds | File is shared/__tests__/content-coverage.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ai/generate-itinerary | docs/decisions/00828-2026-10-01-ai-upstream-error-classes.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/ai/generate-optimized-itineraries | docs/decisions/00828-2026-10-01-ai-upstream-error-classes.md | holds | Mounted at server/routes/content.routes.ts:5241. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00828-2026-10-01-ai-upstream-error-classes.md | holds | Mounted at server/routes.ts:1691. |
| test pin server/__tests__/ai-upstream-errors.test.ts (2026-10-01-ai-upstream-error-classes) | docs/decisions/00828-2026-10-01-ai-upstream-error-classes.md | holds | File is server/__tests__/ai-upstream-errors.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-02-place-name-unicode-tokens) | docs/decisions/00829-2026-10-02-place-name-unicode-tokens.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-02-city-events-venue-relookup) | docs/decisions/00830-2026-10-02-city-events-venue-relookup.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events.db.test.ts (2026-10-02-city-events-venue-relookup) | docs/decisions/00830-2026-10-02-city-events-venue-relookup.md | holds | File is server/__tests__/city-events.db.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00831-2026-10-02-checkout-sweep-false-green.md | holds | Mounted (GET). |
| route POST /internal/jobs/checkout-sweep | docs/decisions/00831-2026-10-02-checkout-sweep-false-green.md | holds | Mounted at server/routes/internal.routes.ts:312. |
| test pin server/routes/__tests__/checkout-sweep-failure.vitest.ts (2026-10-02-checkout-sweep-false-green) | docs/decisions/00831-2026-10-02-checkout-sweep-false-green.md | holds | File is server/routes/__tests__/checkout-sweep-failure.vitest.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/canonical-booking-email.db.test.ts (2026-10-02-canonical-booking-confirmation) | docs/decisions/00832-2026-10-02-canonical-booking-confirmation.md | holds | File is server/__tests__/canonical-booking-email.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-02-vendor-email-sender-repair) | docs/decisions/00833-2026-10-02-vendor-email-sender-repair.md | holds | Row is marked advisory; it names no CI guard. |
| test pin server/__tests__/provider-rejection-email.test.ts (2026-10-02-automation-registry-provider) | docs/decisions/00834-2026-10-02-automation-registry-provider.md | holds | File is server/__tests__/provider-rejection-email.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/provider/__tests__/admin-follow-ons.test.ts (2026-10-02-automation-registry-provider) | docs/decisions/00834-2026-10-02-automation-registry-provider.md | holds | File is server/automations/provider/__tests__/admin-follow-ons.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/provider/__tests__/intake-boundaries.test.ts (2026-10-02-automation-registry-provider) | docs/decisions/00834-2026-10-02-automation-registry-provider.md | holds | File is server/automations/provider/__tests__/intake-boundaries.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/__tests__/messaging-delivery.test.ts (2026-10-02-automation-registry-messaging) | docs/decisions/00835-2026-10-02-automation-registry-messaging.md | holds | File is server/automations/__tests__/messaging-delivery.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/messaging/__tests__/chat-boundaries.test.ts (2026-10-02-automation-registry-messaging) | docs/decisions/00835-2026-10-02-automation-registry-messaging.md | holds | File is server/automations/messaging/__tests__/chat-boundaries.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/messaging/__tests__/producer-boundaries.test.ts (2026-10-02-automation-registry-messaging) | docs/decisions/00835-2026-10-02-automation-registry-messaging.md | holds | File is server/automations/messaging/__tests__/producer-boundaries.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/moderation-report-notification.db.test.ts (2026-10-02-automation-registry-moderation) | docs/decisions/00836-2026-10-02-automation-registry-moderation.md | holds | File is server/__tests__/moderation-report-notification.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/user-suspension.db.test.ts (2026-10-02-automation-registry-moderation) | docs/decisions/00836-2026-10-02-automation-registry-moderation.md | holds | File is server/__tests__/user-suspension.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/__tests__/moderation-registry.test.ts (2026-10-02-automation-registry-moderation) | docs/decisions/00836-2026-10-02-automation-registry-moderation.md | holds | File is server/automations/__tests__/moderation-registry.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/__tests__/booking-scheduler-entrypoints.test.ts (2026-10-02-automation-registry-bookings) | docs/decisions/00837-2026-10-02-automation-registry-bookings.md | holds | File is server/automations/__tests__/booking-scheduler-entrypoints.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/__tests__/bookings-registry.test.ts (2026-10-02-automation-registry-bookings) | docs/decisions/00837-2026-10-02-automation-registry-bookings.md | holds | File is server/automations/__tests__/bookings-registry.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verification-automation-webhook.db.test.ts (2026-10-02-automation-registry-payments) | docs/decisions/00838-2026-10-02-automation-registry-payments.md | holds | File is server/__tests__/verification-automation-webhook.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/payments/__tests__/signed-webhook-routing.test.ts (2026-10-02-automation-registry-payments) | docs/decisions/00838-2026-10-02-automation-registry-payments.md | holds | File is server/automations/payments/__tests__/signed-webhook-routing.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/checkout-sweep-failure.vitest.ts (2026-10-02-automation-registry-payments) | docs/decisions/00838-2026-10-02-automation-registry-payments.md | holds | File is server/routes/__tests__/checkout-sweep-failure.vitest.ts. Ledger lint reports the guard wired. |
| test pin server/automations/__tests__/registry-engine.test.ts (2026-10-02-automation-registry-core) | docs/decisions/00839-2026-10-02-automation-registry-core.md | holds | File is server/automations/__tests__/registry-engine.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts (2026-10-02-automation-registry-core) | docs/decisions/00839-2026-10-02-automation-registry-core.md | holds | File is server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/cart | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | Mounted at server/routes.ts:9468. |
| route POST /api/bookings/:id/resume-payment | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | Mounted at server/routes/payments.routes.ts:2413. |
| test pin client/src/lib/__tests__/api-refusal.test.ts (2026-10-02-checkout-display-equals-charge) | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | File is client/src/lib/__tests__/api-refusal.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/quote-copy.test.ts (2026-10-02-checkout-display-equals-charge) | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | File is client/src/lib/__tests__/quote-copy.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/traveler-fee-preview.test.ts (2026-10-02-checkout-display-equals-charge) | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | File is client/src/lib/__tests__/traveler-fee-preview.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/traveler-charge-composition.test.ts (2026-10-02-checkout-display-equals-charge) | docs/decisions/00840-2026-10-02-checkout-display-equals-charge.md | holds | File is server/__tests__/traveler-charge-composition.test.ts. Ledger lint reports the guard wired. |
| route /admin/dashboard | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | Client Route or Redirect matches /admin/dashboard. |
| route /dashboard | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | Client Route or Redirect matches /dashboard. |
| route /expert/dashboard | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | Client Route or Redirect matches /expert/dashboard. |
| route /provider/dashboard | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | Client Route or Redirect matches /provider/dashboard. |
| test pin client/src/lib/__tests__/quote-copy.test.ts (2026-10-02-listing-draft-and-quote-inbox) | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | File is client/src/lib/__tests__/quote-copy.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-target.test.ts (2026-10-02-listing-draft-and-quote-inbox) | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | File is client/src/lib/__tests__/trip-target.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/listing-price-gate.test.ts (2026-10-02-listing-draft-and-quote-inbox) | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | File is server/__tests__/listing-price-gate.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/listing-save-intent.test.ts (2026-10-02-listing-draft-and-quote-inbox) | docs/decisions/00841-2026-10-02-listing-draft-and-quote-inbox.md | holds | File is shared/__tests__/listing-save-intent.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:id/suggestions | docs/decisions/00842-2026-10-02-ea-dates-and-delegate-reads.md | holds | Mounted at server/routes/booking-actions.ts:1051. |
| test pin client/src/lib/__tests__/ea-event-time.test.ts (2026-10-02-ea-dates-and-delegate-reads) | docs/decisions/00842-2026-10-02-ea-dates-and-delegate-reads.md | holds | File is client/src/lib/__tests__/ea-event-time.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/ea-people.test.ts (2026-10-02-ea-dates-and-delegate-reads) | docs/decisions/00842-2026-10-02-ea-dates-and-delegate-reads.md | holds | File is client/src/lib/__tests__/ea-people.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-date-local-parse.test.ts (2026-10-02-ea-dates-and-delegate-reads) | docs/decisions/00842-2026-10-02-ea-dates-and-delegate-reads.md | holds | File is client/src/lib/__tests__/trip-date-local-parse.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ea-delegate-reads.test.ts (2026-10-02-ea-dates-and-delegate-reads) | docs/decisions/00842-2026-10-02-ea-dates-and-delegate-reads.md | holds | File is server/__tests__/ea-delegate-reads.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/chat-thread.test.ts (2026-10-02-traveler-polish) | docs/decisions/00843-2026-10-02-traveler-polish.md | holds | File is client/src/lib/__tests__/chat-thread.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/checkout-display-polish.test.ts (2026-10-02-traveler-polish) | docs/decisions/00843-2026-10-02-traveler-polish.md | holds | File is client/src/lib/__tests__/checkout-display-polish.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/home-time-axis.test.ts (2026-10-02-traveler-polish) | docs/decisions/00843-2026-10-02-traveler-polish.md | holds | File is client/src/lib/__tests__/home-time-axis.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/saved-card-choice.test.ts (2026-10-02-traveler-polish) | docs/decisions/00843-2026-10-02-traveler-polish.md | holds | File is server/__tests__/saved-card-choice.test.ts. Ledger lint reports the guard wired. |
| route /admin/category-fees | docs/decisions/00844-2026-10-02-beta-rollout-fees.md | holds | Client Route or Redirect matches /admin/category-fees. |
| route /admin/fee-bands | docs/decisions/00844-2026-10-02-beta-rollout-fees.md | holds | Client Route or Redirect matches /admin/fee-bands. |
| test pin server/__tests__/fee-resolution-authority.db.test.ts (2026-10-02-beta-rollout-fees) | docs/decisions/00844-2026-10-02-beta-rollout-fees.md | holds | File is server/__tests__/fee-resolution-authority.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/beta-rollout-fees.test.ts (2026-10-02-beta-rollout-fees) | docs/decisions/00844-2026-10-02-beta-rollout-fees.md | holds | File is server/services/__tests__/beta-rollout-fees.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/commission-phase1.test.ts (2026-10-02-beta-rollout-fees) | docs/decisions/00844-2026-10-02-beta-rollout-fees.md | holds | File is server/services/__tests__/commission-phase1.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/where-to-stay | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:333. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/slip-header-meta.test.tsx (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is client/src/components/plancard/__tests__/slip-header-meta.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/generated-itinerary-normalization.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is server/__tests__/generated-itinerary-normalization.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-span-label.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is shared/__tests__/plan-span-label.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/smoke4-draft-facts.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is shared/__tests__/smoke4-draft-facts.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/where-to-stay.test.ts (2026-10-02-smoke4-draft-fixes) | docs/decisions/00845-2026-10-02-smoke4-draft-fixes.md | holds | File is shared/__tests__/where-to-stay.test.ts. Ledger lint reports the guard wired. |
| guard check-decision-guards.cjs (2026-10-03-r-number-order) | docs/decisions/00846-2026-10-03-r-number-order.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-10-03-beta-flat-band-insert) | docs/decisions/00847-2026-10-03-beta-flat-band-insert.md | holds | Row is marked advisory; it names no CI guard. |
| route /destinations | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | Client Route or Redirect matches /destinations. |
| route /plans/:tripId | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | Client Route or Redirect matches /plans/:p. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke5-fixes.test.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is client/src/lib/__tests__/smoke5-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/where-to-stay.test.ts (2026-10-03-smoke5-fixes) | docs/decisions/00848-2026-10-03-smoke5-fixes.md | holds | File is shared/__tests__/where-to-stay.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route POST /api/admin/content-sources/:id/public-ok | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | Mounted at server/routes/content-sources.routes.ts:112. |
| test pin client/src/lib/__tests__/blog-view.test.ts (2026-10-03-official-facts-public-ok) | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | File is client/src/lib/__tests__/blog-view.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-sources.db.test.ts (2026-10-03-official-facts-public-ok) | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | File is server/__tests__/content-sources.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/blog-official-facts.db.test.ts (2026-10-03-official-facts-public-ok) | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | File is server/services/__tests__/blog-official-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-coverage.test.ts (2026-10-03-official-facts-public-ok) | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | File is shared/__tests__/content-coverage.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-facts.test.ts (2026-10-03-official-facts-public-ok) | docs/decisions/00849-2026-10-03-official-facts-public-ok.md | holds | File is shared/__tests__/content-facts.test.ts. Ledger lint reports the guard wired. |
| route /services | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | Client Route or Redirect matches /services. |
| route POST /api/trips/:tripId/slip-events | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:277. |
| test pin client/src/components/plancard/__tests__/surface-step1-parity.test.tsx (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is client/src/components/plancard/__tests__/surface-step1-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/item-kind-chip.test.ts (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is client/src/lib/__tests__/item-kind-chip.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/surface-step1.test.ts (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is client/src/lib/__tests__/surface-step1.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-surface-step1-item-row) | docs/decisions/00850-2026-10-03-surface-step1-item-row.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-10-03-rw-ai-place-text) | docs/decisions/00851-2026-10-03-rw-ai-place-text.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-rw-ai-place-text) | docs/decisions/00851-2026-10-03-rw-ai-place-text.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/ai-draft-sanitize.test.ts (2026-10-03-rw-ai-place-text) | docs/decisions/00851-2026-10-03-rw-ai-place-text.md | holds | File is server/utils/__tests__/ai-draft-sanitize.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/smoke4-draft-facts.test.ts (2026-10-03-rw-ai-place-text) | docs/decisions/00851-2026-10-03-rw-ai-place-text.md | holds | File is shared/__tests__/smoke4-draft-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/no-ward-pins.test.ts (2026-10-03-no-ward-pins) | docs/decisions/00852-2026-10-03-no-ward-pins.md | holds | File is client/src/lib/__tests__/no-ward-pins.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-03-no-ward-pins) | docs/decisions/00852-2026-10-03-no-ward-pins.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-no-ward-pins) | docs/decisions/00852-2026-10-03-no-ward-pins.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-03-no-ward-pins) | docs/decisions/00852-2026-10-03-no-ward-pins.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/plancard-poll-budget.test.ts (2026-10-03-no-ward-pins) | docs/decisions/00852-2026-10-03-no-ward-pins.md | holds | File is server/utils/__tests__/plancard-poll-budget.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/flight-lookup | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | Mounted at server/routes/trips.routes.ts:1654. |
| test pin client/src/components/plancard/__tests__/surface-step1-parity.test.tsx (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is client/src/components/plancard/__tests__/surface-step1-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/tools-tray.test.tsx (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is client/src/components/plancard/__tests__/tools-tray.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-rail.test.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is client/src/lib/__tests__/slip-rail.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/flight-lookup.test.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is server/utils/__tests__/flight-lookup.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/group-manifest.test.ts (2026-10-03-surface-step2-tools-tray) | docs/decisions/00853-2026-10-03-surface-step2-tools-tray.md | holds | File is shared/__tests__/group-manifest.test.ts. Ledger lint reports the guard wired. |
| route PUT /api/trips/:tripId/itinerary-items/:itemId/lock | docs/decisions/00854-2026-10-03-item-locks.md | holds | Mounted at server/routes/trips.routes.ts:3062. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-item-locks) | docs/decisions/00854-2026-10-03-item-locks.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/expert-work-protected.test.ts (2026-10-03-item-locks) | docs/decisions/00854-2026-10-03-item-locks.md | holds | File is server/__tests__/expert-work-protected.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/item-locks.db.test.ts (2026-10-03-item-locks) | docs/decisions/00854-2026-10-03-item-locks.md | holds | File is server/__tests__/item-locks.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/no-ward-pins.test.ts (2026-10-03-build-around-places) | docs/decisions/00855-2026-10-03-build-around-places.md | holds | File is client/src/lib/__tests__/no-ward-pins.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/build-around-places.db.test.ts (2026-10-03-build-around-places) | docs/decisions/00855-2026-10-03-build-around-places.md | holds | File is server/__tests__/build-around-places.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/airport-leg.test.tsx (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is client/src/components/plancard/__tests__/airport-leg.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke5-fixes.test.ts (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is client/src/lib/__tests__/smoke5-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-03-surface-step3-anchor-panel) | docs/decisions/00856-2026-10-03-surface-step3-anchor-panel.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/transport-booking-options/:optionId/book | docs/decisions/00857-2026-10-03-transport-price-literals.md | holds | Mounted at server/routes/transport-hub.routes.ts:333. |
| test pin server/__tests__/confirm-honesty.test.ts (2026-10-03-transport-price-literals) | docs/decisions/00857-2026-10-03-transport-price-literals.md | holds | File is server/__tests__/confirm-honesty.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/transport-payment-intent.db.test.ts (2026-10-03-transport-price-literals) | docs/decisions/00857-2026-10-03-transport-price-literals.md | holds | File is server/__tests__/transport-payment-intent.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/transport-price-literals.test.ts (2026-10-03-transport-price-literals) | docs/decisions/00857-2026-10-03-transport-price-literals.md | holds | File is server/utils/__tests__/transport-price-literals.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-03-places-field-mask) | docs/decisions/00858-2026-10-03-places-field-mask.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/content-facts-engine.test.ts (2026-10-03-places-field-mask) | docs/decisions/00858-2026-10-03-places-field-mask.md | holds | File is server/services/__tests__/content-facts-engine.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/places-field-mask.test.ts (2026-10-03-places-field-mask) | docs/decisions/00858-2026-10-03-places-field-mask.md | holds | File is server/utils/__tests__/places-field-mask.test.ts. Ledger lint reports the guard wired. |
| route /api/optimization-fee | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | Mounted (GET). |
| route GET /api/optimization-preview | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | Mounted at server/routes/optimization.routes.ts:181. |
| test pin client/src/components/plancard/__tests__/optimizer-lead.test.tsx (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is client/src/components/plancard/__tests__/optimizer-lead.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/optimize-preview-on-slip.test.ts (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is server/__tests__/optimize-preview-on-slip.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/optimizer-lead.test.ts (2026-10-03-surface-step4-optimizer-lead) | docs/decisions/00859-2026-10-03-surface-step4-optimizer-lead.md | holds | File is shared/__tests__/optimizer-lead.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00860-2026-10-04-health-flight-flag.md | holds | Mounted (GET). |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-04-health-flight-flag) | docs/decisions/00860-2026-10-04-health-flight-flag.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/tools-tray.test.tsx (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is client/src/components/plancard/__tests__/tools-tray.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke8-fixes.test.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is client/src/lib/__tests__/smoke8-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/flight-lookup.test.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is server/utils/__tests__/flight-lookup.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/places-field-mask.test.ts (2026-10-04-smoke8-fixes) | docs/decisions/00861-2026-10-04-smoke8-fixes.md | holds | File is server/utils/__tests__/places-field-mask.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/smoke9-render.test.tsx (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is client/src/components/plancard/__tests__/smoke9-render.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke9-fixes.test.ts (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is client/src/lib/__tests__/smoke9-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/smoke9-draft-gate.db.test.ts (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is server/__tests__/smoke9-draft-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-04-smoke9-fixes) | docs/decisions/00862-2026-10-04-smoke9-fixes.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| route /api/affiliate/products | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted (GET). |
| route /api/experts | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted (GET). |
| route /api/services | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted (GET). |
| route GET /api/maps/tiles | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted at server/routes/markets.routes.ts:32. |
| route GET /api/trips/:tripId/versions | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted at server/routes/versions.routes.ts:59. |
| route POST /api/trips/:tripId/days/:day/retime | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted at server/routes/versions.routes.ts:174. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted at server/routes.ts:13414. |
| route POST /api/trips/:tripId/versions/apply-days | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | Mounted at server/routes/versions.routes.ts:79. |
| test pin client/src/lib/__tests__/map-scene.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is client/src/lib/__tests__/map-scene.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-comparison-ref.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is client/src/lib/__tests__/plan-comparison-ref.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/surface-step1.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is client/src/lib/__tests__/surface-step1.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/versions-board.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is client/src/lib/__tests__/versions-board.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/version-board.db.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is server/__tests__/version-board.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/optimizer-source-item.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is server/utils/__tests__/optimizer-source-item.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/version-board.test.ts (2026-10-04-surface-step5-map-versions) | docs/decisions/00863-2026-10-04-surface-step5-map-versions.md | holds | File is shared/__tests__/version-board.test.ts. Ledger lint reports the guard wired. |
| route /admin/feedback | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | Client Route or Redirect matches /admin/feedback. |
| route DELETE /api/plans/:id/feedback | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | Mounted at server/routes/feedback.routes.ts:73. |
| route GET /api/admin/feedback | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | Mounted at server/routes/feedback.routes.ts:93. |
| test pin client/src/components/plancard/__tests__/feedback-tap.test.tsx (2026-10-04-feedback-phase-a) | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | File is client/src/components/plancard/__tests__/feedback-tap.test.tsx. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-feedback-phase-a) | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/feedback-events.db.test.ts (2026-10-04-feedback-phase-a) | docs/decisions/00864-2026-10-04-feedback-phase-a.md | holds | File is server/__tests__/feedback-events.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/where-to-stay | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:343. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke9-addendum.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is client/src/lib/__tests__/smoke9-addendum.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j1-golden-path.spec.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is playwright/tests/journeys/j1-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/ai-draft-events.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is server/utils/__tests__/ai-draft-events.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/ai-draft-sanitize.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is server/utils/__tests__/ai-draft-sanitize.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/smoke9-addendum.test.ts (2026-10-04-smoke9-addendum) | docs/decisions/00865-2026-10-04-smoke9-addendum.md | holds | File is shared/__tests__/smoke9-addendum.test.ts. Ledger lint reports the guard wired. |
| route /itinerary-comparison/:id | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| test pin client/src/components/plancard/__tests__/smoke10-render.test.tsx (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is client/src/components/plancard/__tests__/smoke10-render.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/place-facts.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is client/src/lib/__tests__/place-facts.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke10-fixes.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is client/src/lib/__tests__/smoke10-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke9-fixes.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is client/src/lib/__tests__/smoke9-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/surface-step1.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is client/src/lib/__tests__/surface-step1.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/smoke10-draft.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is server/utils/__tests__/smoke10-draft.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/smoke10-fixes.test.ts (2026-10-04-smoke10-fixes) | docs/decisions/00866-2026-10-04-smoke10-fixes.md | holds | File is shared/__tests__/smoke10-fixes.test.ts. Ledger lint reports the guard wired. |
| route /trip/:id | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | Client Route or Redirect matches /trip/:p. |
| route GET /api/trips/:tripId/place-photos | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | Mounted at server/routes/plancard.routes.ts:717. |
| route GET /api/trips/:tripId/recheck | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | Mounted at server/routes/plancard.routes.ts:644. |
| test pin client/src/components/plancard/__tests__/step6-card-parity.test.tsx (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is client/src/components/plancard/__tests__/step6-card-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/surface-step1.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is client/src/lib/__tests__/surface-step1.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/optimizer-run-authorization.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is server/__tests__/optimizer-run-authorization.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/step6-draft.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is server/utils/__tests__/step6-draft.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/step6-trip-card.test.ts (2026-10-04-step6-trip-card) | docs/decisions/00867-2026-10-04-step6-trip-card.md | holds | File is shared/__tests__/step6-trip-card.test.ts. Ledger lint reports the guard wired. |
| route POST /api/optimization-preview | docs/decisions/00868-2026-10-04-photo-references.md | holds | Mounted at server/routes/optimization.routes.ts:76. |
| test pin client/src/components/plancard/__tests__/step6-card-parity.test.tsx (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is client/src/components/plancard/__tests__/step6-card-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-card-one-page.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is client/src/lib/__tests__/trip-card-one-page.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/optimization-preview-auth.http.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is server/__tests__/optimization-preview-auth.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/photo-refs.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is server/utils/__tests__/photo-refs.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/places-field-mask.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is server/utils/__tests__/places-field-mask.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/step6-trip-card.test.ts (2026-10-04-photo-references) | docs/decisions/00868-2026-10-04-photo-references.md | holds | File is shared/__tests__/step6-trip-card.test.ts. Ledger lint reports the guard wired. |
| route /api/expert-workspace/scrape-jobs | docs/decisions/00869-2026-10-04-expert-scrape-jobs-gate.md | holds | Mounted (GET/POST). |
| route /api/health | docs/decisions/00869-2026-10-04-expert-scrape-jobs-gate.md | holds | Mounted (GET). |
| test pin server/__tests__/expert-scrape-jobs-gate.db.test.ts (2026-10-04-expert-scrape-jobs-gate) | docs/decisions/00869-2026-10-04-expert-scrape-jobs-gate.md | holds | File is server/__tests__/expert-scrape-jobs-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-04-expert-scrape-jobs-gate) | docs/decisions/00869-2026-10-04-expert-scrape-jobs-gate.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-conflict-markers.cjs (2026-10-04-maps-billing-audit) | docs/decisions/00870-2026-10-04-maps-billing-audit.md | holds | File is scripts/check-conflict-markers.cjs. Ledger lint reports the guard wired. |
| route /api/geocode | docs/decisions/00870-2026-10-04-maps-billing-audit.md | holds | Mounted (GET/POST). |
| route /api/media/place-photo | docs/decisions/00870-2026-10-04-maps-billing-audit.md | holds | Mounted (GET). |
| test pin server/__tests__/maps-billing-tiers.test.ts (2026-10-04-maps-billing-audit) | docs/decisions/00870-2026-10-04-maps-billing-audit.md | holds | File is server/__tests__/maps-billing-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/transport-leg-calculator.test.ts (2026-10-04-maps-billing-audit) | docs/decisions/00870-2026-10-04-maps-billing-audit.md | holds | File is server/services/__tests__/transport-leg-calculator.test.ts. Ledger lint reports the guard wired. |
| route DELETE /api/trips/:tripId/transport-legs/:legId | docs/decisions/00871-2026-10-04-leg-write-access.md | holds | Mounted at server/routes/transport-legs.routes.ts:394. |
| route PATCH /api/transport-legs/:legId/mode | docs/decisions/00871-2026-10-04-leg-write-access.md | holds | Mounted at server/routes/trips.routes.ts:2253. |
| route PATCH /api/transport-legs/:legId/status | docs/decisions/00871-2026-10-04-leg-write-access.md | holds | Mounted at server/routes/plancard.routes.ts:1150. |
| test pin server/__tests__/leg-write-access.db.test.ts (2026-10-04-leg-write-access) | docs/decisions/00871-2026-10-04-leg-write-access.md | holds | File is server/__tests__/leg-write-access.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/ready-made/purchases/by-clone/:tripId | docs/decisions/00872-2026-10-04-ready-made-provenance.md | holds | Mounted at server/routes/ready-made.routes.ts:1649. |
| route GET /api/trips/:tripId/plancard | docs/decisions/00872-2026-10-04-ready-made-provenance.md | holds | Mounted at server/routes/plancard.routes.ts:778. |
| test pin server/__tests__/ready-made-provenance.db.test.ts (2026-10-04-ready-made-provenance) | docs/decisions/00872-2026-10-04-ready-made-provenance.md | holds | File is server/__tests__/ready-made-provenance.db.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/trips/:tripId/transport-legs/:legId | docs/decisions/00873-2026-10-04-transport-leg-authoring.md | holds | Mounted at server/routes/transport-legs.routes.ts:259. |
| test pin server/__tests__/transport-leg-authoring.db.test.ts (2026-10-04-transport-leg-authoring) | docs/decisions/00873-2026-10-04-transport-leg-authoring.md | holds | File is server/__tests__/transport-leg-authoring.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/transport-legs/review | docs/decisions/00874-2026-10-04-transport-leg-review.md | holds | Mounted at server/routes/transport-legs.routes.ts:178. |
| test pin server/__tests__/transport-leg-review.db.test.ts (2026-10-04-transport-leg-review) | docs/decisions/00874-2026-10-04-transport-leg-review.md | holds | File is server/__tests__/transport-leg-review.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-leg-gate.db.test.ts (2026-10-04-ready-made-leg-gate) | docs/decisions/00875-2026-10-04-ready-made-leg-gate.md | holds | File is server/__tests__/ready-made-leg-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/ready-made-completeness-gate.test.ts (2026-10-04-ready-made-leg-gate) | docs/decisions/00875-2026-10-04-ready-made-leg-gate.md | holds | File is server/routes/__tests__/ready-made-completeness-gate.test.ts. Ledger lint reports the guard wired. |
| route GET /api/expert/ready-made/:id/readiness | docs/decisions/00876-2026-10-04-ready-made-readiness.md | holds | Mounted at server/routes/ready-made.routes.ts:764. |
| test pin server/__tests__/ready-made-leg-gate.db.test.ts (2026-10-04-ready-made-readiness) | docs/decisions/00876-2026-10-04-ready-made-readiness.md | holds | File is server/__tests__/ready-made-leg-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-readiness.db.test.ts (2026-10-04-ready-made-readiness) | docs/decisions/00876-2026-10-04-ready-made-readiness.md | holds | File is server/__tests__/ready-made-readiness.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/ready-made-completeness-gate.test.ts (2026-10-04-ready-made-readiness) | docs/decisions/00876-2026-10-04-ready-made-readiness.md | holds | File is server/routes/__tests__/ready-made-completeness-gate.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-clone-fields.db.test.ts (2026-10-04-ready-made-clone-legs) | docs/decisions/00877-2026-10-04-ready-made-clone-legs.md | holds | File is server/__tests__/ready-made-clone-fields.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-clone-legs.db.test.ts (2026-10-04-ready-made-clone-legs) | docs/decisions/00877-2026-10-04-ready-made-clone-legs.md | holds | File is server/__tests__/ready-made-clone-legs.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/ready-made-clone-routing.test.ts (2026-10-04-ready-made-clone-legs) | docs/decisions/00877-2026-10-04-ready-made-clone-legs.md | holds | File is server/services/__tests__/ready-made-clone-routing.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/anchors | docs/decisions/00878-2026-10-04-stay-reroute.md | holds | Mounted at server/routes/trips.routes.ts:1609. |
| route PUT /api/anchors/:id | docs/decisions/00878-2026-10-04-stay-reroute.md | holds | Mounted at server/routes/trips.routes.ts:1698. |
| test pin server/__tests__/dates-confirmed.db.test.ts (2026-10-04-stay-reroute) | docs/decisions/00878-2026-10-04-stay-reroute.md | holds | File is server/__tests__/dates-confirmed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-reroute.db.test.ts (2026-10-04-stay-reroute) | docs/decisions/00878-2026-10-04-stay-reroute.md | holds | File is server/__tests__/stay-reroute.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/option-sets/:setId/choose | docs/decisions/00879-2026-10-04-stay-item-reroute.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:222. |
| test pin server/__tests__/plan-option-sets.db.test.ts (2026-10-04-stay-item-reroute) | docs/decisions/00879-2026-10-04-stay-item-reroute.md | holds | File is server/__tests__/plan-option-sets.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-reroute.db.test.ts (2026-10-04-stay-item-reroute) | docs/decisions/00879-2026-10-04-stay-item-reroute.md | holds | File is server/__tests__/stay-reroute.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/where-to-stay.db.test.ts (2026-10-04-stay-item-reroute) | docs/decisions/00879-2026-10-04-stay-item-reroute.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| route /api/expert/inbox | docs/decisions/00880-2026-10-04-expert-inbox-questions.md | holds | Routes are still mounted under this prefix (for example GET /api/expert/inbox/questions). |
| route GET /api/expert/inbox/questions | docs/decisions/00880-2026-10-04-expert-inbox-questions.md | holds | Mounted at server/routes/expert-inbox-questions.routes.ts:33. |
| route POST /api/expert/inbox/questions/:id/answer | docs/decisions/00880-2026-10-04-expert-inbox-questions.md | holds | Mounted at server/routes/expert-inbox-questions.routes.ts:43. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-expert-inbox-questions) | docs/decisions/00880-2026-10-04-expert-inbox-questions.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/expert-inbox-questions.db.test.ts (2026-10-04-expert-inbox-questions) | docs/decisions/00880-2026-10-04-expert-inbox-questions.md | holds | File is server/__tests__/expert-inbox-questions.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/transport-legs/generate | docs/decisions/00881-2026-10-04-leg-generate-write-gate.md | holds | Mounted at server/routes/transport-legs.routes.ts:121. |
| test pin server/__tests__/leg-write-access.db.test.ts (2026-10-04-leg-generate-write-gate) | docs/decisions/00881-2026-10-04-leg-generate-write-gate.md | holds | File is server/__tests__/leg-write-access.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-04-leg-google-coords) | docs/decisions/00882-2026-10-04-leg-google-coords.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-reroute.db.test.ts (2026-10-04-leg-google-coords) | docs/decisions/00882-2026-10-04-leg-google-coords.md | holds | File is server/__tests__/stay-reroute.db.test.ts. Ledger lint reports the guard wired. |
| route /api/media/place-photo | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Mounted (GET). |
| route /api/search/experiences | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Mounted (GET). |
| route /api/travelpulse/media/ | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Live path is GET /api/travelpulse/media/:cityName/:country at server/routes/content.routes.ts:5887. |
| route GET /api/geocode | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Mounted at server/routes/content.routes.ts:6611. |
| route GET /api/search/experiences | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Mounted at server/routes/content.routes.ts:6633. |
| route POST /api/geocode | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | Mounted at server/routes/content.routes.ts:4473. |
| test pin client/src/lib/__tests__/maps-browser-key.test.ts (2026-10-04-maps-session-and-browser-key) | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | File is client/src/lib/__tests__/maps-browser-key.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-maps-session-and-browser-key) | docs/decisions/00883-2026-10-04-maps-session-and-browser-key.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| route POST /internal/jobs/leg-google-coords | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | Mounted at server/routes/internal.routes.ts:508. |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/leg-google-coords-refresh.db.test.ts (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is server/__tests__/leg-google-coords-refresh.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-reroute.db.test.ts (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is server/__tests__/stay-reroute.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/internal-jobs-auth.http.test.ts (2026-10-04-leg-google-coords-refresh) | docs/decisions/00884-2026-10-04-leg-google-coords-refresh.md | holds | File is server/routes/__tests__/internal-jobs-auth.http.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/me/itinerary-email-preferences | docs/decisions/00885-2026-10-04-itinerary-traveler-emails.md | holds | Mounted at server/routes/itinerary-email-preferences.routes.ts:48. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-04-itinerary-traveler-emails) | docs/decisions/00885-2026-10-04-itinerary-traveler-emails.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/automations/messaging/__tests__/producer-boundaries.test.ts (2026-10-04-itinerary-traveler-emails) | docs/decisions/00885-2026-10-04-itinerary-traveler-emails.md | holds | File is server/automations/messaging/__tests__/producer-boundaries.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/itinerary-followup-email.test.ts (2026-10-04-itinerary-traveler-emails) | docs/decisions/00885-2026-10-04-itinerary-traveler-emails.md | holds | File is server/services/__tests__/itinerary-followup-email.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/itinerary-outcome-email.test.ts (2026-10-04-itinerary-traveler-emails) | docs/decisions/00885-2026-10-04-itinerary-traveler-emails.md | holds | File is server/services/__tests__/itinerary-outcome-email.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/anchors | docs/decisions/00886-2026-10-05-anchor-overlap-wall-clock.md | holds | Mounted at server/routes/trips.routes.ts:1609. |
| test pin server/__tests__/ready-made-readiness.db.test.ts (2026-10-05-anchor-overlap-wall-clock) | docs/decisions/00886-2026-10-05-anchor-overlap-wall-clock.md | holds | File is server/__tests__/ready-made-readiness.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/optimizer-lead.test.ts (2026-10-05-anchor-overlap-wall-clock) | docs/decisions/00886-2026-10-05-anchor-overlap-wall-clock.md | holds | File is shared/__tests__/optimizer-lead.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/step6-trip-card.test.ts (2026-10-05-anchor-overlap-wall-clock) | docs/decisions/00886-2026-10-05-anchor-overlap-wall-clock.md | holds | File is shared/__tests__/step6-trip-card.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/anchors | docs/decisions/00887-2026-10-05-anchor-writers-wall-clock.md | holds | Mounted at server/routes/trips.routes.ts:1609. |
| test pin server/__tests__/anchor-writers-wall-clock.db.test.ts (2026-10-05-anchor-writers-wall-clock) | docs/decisions/00887-2026-10-05-anchor-writers-wall-clock.md | holds | File is server/__tests__/anchor-writers-wall-clock.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/anchor-time.test.ts (2026-10-05-anchor-writers-wall-clock) | docs/decisions/00887-2026-10-05-anchor-writers-wall-clock.md | holds | File is shared/__tests__/anchor-time.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/optimizer-lead.test.ts (2026-10-05-anchor-writers-wall-clock) | docs/decisions/00887-2026-10-05-anchor-writers-wall-clock.md | holds | File is shared/__tests__/optimizer-lead.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-05-health-maps-switches) | docs/decisions/00888-2026-10-05-health-maps-switches.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/anchor-readers-wall-clock.test.ts (2026-10-05-anchor-readers-wall-clock) | docs/decisions/00889-2026-10-05-anchor-readers-wall-clock.md | holds | File is server/__tests__/anchor-readers-wall-clock.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/event-coordination.test.ts (2026-10-05-anchor-readers-wall-clock) | docs/decisions/00889-2026-10-05-anchor-readers-wall-clock.md | holds | File is server/__tests__/event-coordination.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/anchor-time.test.ts (2026-10-05-anchor-readers-wall-clock) | docs/decisions/00889-2026-10-05-anchor-readers-wall-clock.md | holds | File is shared/__tests__/anchor-time.test.ts. Ledger lint reports the guard wired. |
| route POST /api/expert-review/:shareToken/submit | docs/decisions/00890-2026-10-05-expert-item-time-wall-clock.md | holds | Mounted at server/routes/trips.routes.ts:2749. |
| test pin shared/__tests__/expert-time-edit.test.ts (2026-10-05-expert-item-time-wall-clock) | docs/decisions/00890-2026-10-05-expert-item-time-wall-clock.md | holds | File is shared/__tests__/expert-time-edit.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts (2026-10-05-internal-jobs-skip-isolated) | docs/decisions/00891-2026-10-05-internal-jobs-skip-isolated.md | holds | File is server/routes/__tests__/internal-jobs-skip-semantics.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/smoke11.test.ts (2026-10-05-smoke11-fixes) | docs/decisions/00892-2026-10-05-smoke11-fixes.md | holds | File is client/src/components/plancard/__tests__/smoke11.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx (2026-10-05-step7a-workstation-remount) | docs/decisions/00893-2026-10-05-step7a-workstation-remount.md | holds | File is client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx. Ledger lint reports the guard wired. |
| route GET /api/expert/ready-made/:id/readiness | docs/decisions/00894-2026-10-05-readiness-checklist-ui.md | holds | Mounted at server/routes/ready-made.routes.ts:764. |
| test pin client/src/lib/__tests__/readiness-checklist.test.ts (2026-10-05-readiness-checklist-ui) | docs/decisions/00894-2026-10-05-readiness-checklist-ui.md | holds | File is client/src/lib/__tests__/readiness-checklist.test.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/s2-expert-publish.spec.ts (2026-10-05-readiness-checklist-ui) | docs/decisions/00894-2026-10-05-readiness-checklist-ui.md | holds | File is e2e/supply-demand/s2-expert-publish.spec.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/w1-kyoto-authoring.spec.ts (2026-10-05-readiness-checklist-ui) | docs/decisions/00894-2026-10-05-readiness-checklist-ui.md | holds | File is e2e/supply-demand/w1-kyoto-authoring.spec.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/handoffs/:id/assign | docs/decisions/00895-2026-10-05-step7b-handoff.md | holds | Mounted at server/routes/handoff.routes.ts:441. |
| route POST /api/expert-requests | docs/decisions/00895-2026-10-05-step7b-handoff.md | holds | Mounted at server/routes/booking-actions.ts:206. |
| route POST /api/trips/:tripId/handoff | docs/decisions/00895-2026-10-05-step7b-handoff.md | holds | Mounted at server/routes/handoff.routes.ts:197. |
| test pin server/__tests__/handoff-lifecycle.db.test.ts (2026-10-05-step7b-handoff) | docs/decisions/00895-2026-10-05-step7b-handoff.md | holds | File is server/__tests__/handoff-lifecycle.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/fee-bands | docs/decisions/00896-2026-10-05-handoff-bands-declared.md | holds | Client Route or Redirect matches /admin/fee-bands. |
| test pin server/__tests__/fee-band-admin-guards.test.ts (2026-10-05-handoff-bands-declared) | docs/decisions/00896-2026-10-05-handoff-bands-declared.md | holds | File is server/__tests__/fee-band-admin-guards.test.ts. Ledger lint reports the guard wired. |
| route /expert/inbox | docs/decisions/00897-2026-10-05-inbox-questions-tab.md | holds | Client Route or Redirect matches /expert/inbox. |
| route GET /api/expert/inbox/questions | docs/decisions/00897-2026-10-05-inbox-questions-tab.md | holds | Mounted at server/routes/expert-inbox-questions.routes.ts:33. |
| test pin client/src/lib/__tests__/inbox-questions.test.ts (2026-10-05-inbox-questions-tab) | docs/decisions/00897-2026-10-05-inbox-questions-tab.md | holds | File is client/src/lib/__tests__/inbox-questions.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/expert-inbox-questions.spec.ts (2026-10-05-inbox-questions-tab) | docs/decisions/00897-2026-10-05-inbox-questions-tab.md | holds | File is playwright/tests/expert-inbox-questions.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx (2026-10-05-leg-review-stepper) | docs/decisions/00898-2026-10-05-leg-review-stepper.md | holds | File is client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx (2026-10-05-leg-review-stepper) | docs/decisions/00898-2026-10-05-leg-review-stepper.md | holds | File is client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/leg-review.test.ts (2026-10-05-leg-review-stepper) | docs/decisions/00898-2026-10-05-leg-review-stepper.md | holds | File is client/src/lib/__tests__/leg-review.test.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/w1-kyoto-authoring.spec.ts (2026-10-05-leg-review-stepper) | docs/decisions/00898-2026-10-05-leg-review-stepper.md | holds | File is e2e/supply-demand/w1-kyoto-authoring.spec.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/transport-legs/:legId/path | docs/decisions/00899-2026-10-05-leg-live-hop-path.md | holds | Mounted at server/routes/transport-legs.routes.ts:199. |
| test pin client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx (2026-10-05-leg-live-hop-path) | docs/decisions/00899-2026-10-05-leg-live-hop-path.md | holds | File is client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/leg-route-path.test.ts (2026-10-05-leg-live-hop-path) | docs/decisions/00899-2026-10-05-leg-live-hop-path.md | holds | File is client/src/lib/__tests__/leg-route-path.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/maps-billing-tiers.test.ts (2026-10-05-leg-live-hop-path) | docs/decisions/00899-2026-10-05-leg-live-hop-path.md | holds | File is server/__tests__/maps-billing-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/leg-reachability.test.ts (2026-10-05-reachability-from-legs) | docs/decisions/00900-2026-10-05-reachability-from-legs.md | holds | File is client/src/lib/__tests__/leg-reachability.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-readiness.db.test.ts (2026-10-05-reachability-from-legs) | docs/decisions/00900-2026-10-05-reachability-from-legs.md | holds | File is server/__tests__/ready-made-readiness.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/step6-trip-card.test.ts (2026-10-05-reachability-from-legs) | docs/decisions/00900-2026-10-05-reachability-from-legs.md | holds | File is shared/__tests__/step6-trip-card.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-reroute.db.test.ts (2026-10-05-stay-reroute-gaps) | docs/decisions/00901-2026-10-05-stay-reroute-gaps.md | holds | File is server/__tests__/stay-reroute.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/ready-made-preview.test.tsx (2026-10-05-rmt-public-preview) | docs/decisions/00902-2026-10-05-rmt-public-preview.md | holds | File is client/src/lib/__tests__/ready-made-preview.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-preview.db.test.ts (2026-10-05-rmt-public-preview) | docs/decisions/00902-2026-10-05-rmt-public-preview.md | holds | File is server/__tests__/ready-made-preview.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/share-image/ready-made/:id.png | docs/decisions/00903-2026-10-05-rmt-share-images.md | holds | Mounted at server/routes/share-images.routes.ts:107. |
| test pin server/__tests__/ready-made-preview.db.test.ts (2026-10-05-rmt-share-images) | docs/decisions/00903-2026-10-05-rmt-share-images.md | holds | File is server/__tests__/ready-made-preview.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-share-image.test.ts (2026-10-05-rmt-share-images) | docs/decisions/00903-2026-10-05-rmt-share-images.md | holds | File is server/__tests__/ready-made-share-image.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-05-coral-fill-contrast) | docs/decisions/00904-2026-10-05-coral-fill-contrast.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-05-events-page-events-first) | docs/decisions/00905-2026-10-05-events-page-events-first.md | holds | Row is marked advisory; it names no CI guard. |
| route /events | docs/decisions/00905-2026-10-05-events-page-events-first.md | holds | Client Route or Redirect matches /events. |
| guard advisory (2026-10-05-experiences-map-planner) | docs/decisions/00906-2026-10-05-experiences-map-planner.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-05-pets-on-trips) | docs/decisions/00907-2026-10-05-pets-on-trips.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-05-coral-three-tokens) | docs/decisions/00908-2026-10-05-coral-three-tokens.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-05-event-real-city) | docs/decisions/00909-2026-10-05-event-real-city.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-05-step8-rulings) | docs/decisions/00910-2026-10-05-step8-rulings.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences | docs/decisions/00910-2026-10-05-step8-rulings.md | holds | Client Route or Redirect matches /experiences. |
| guard advisory (2026-10-05-pets-fields-and-service-animal) | docs/decisions/00911-2026-10-05-pets-fields-and-service-animal.md | holds | Row is marked advisory; it names no CI guard. |
| file:line plan-steps.ts:152 | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | No code symbol was named beside the citation. Line client/src/lib/plan-steps.ts:152 reads: * plan in hand) and a door naming its plan (`source.tripId`) are EDIT doors and are unchanged; a |
| file:line plan-steps.ts:222 | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | drifted | resolvePlanSteps is not on the cited lines. It is at client/src/lib/plan-steps.ts:226. |
| file:line PlanningContext.tsx:409 | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | No code symbol was named beside the citation. Line client/src/contexts/PlanningContext.tsx:409 reads: }, [pendingGemRecovery, setLocation]); |
| guard advisory (2026-10-05-step8-phase0-decisions) | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | Row is marked advisory; it names no CI guard. |
| route /experiences | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | Client Route or Redirect matches /experiences. |
| route /experiences/:slug | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | Client Route or Redirect matches /experiences/:p. |
| route /experiences/:slug/new | docs/decisions/00912-2026-10-05-step8-phase0-decisions.md | holds | Client Route or Redirect matches /experiences/:p/new. |
| route /itinerary/:id | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | Client Route or Redirect matches /itinerary/:p. |
| route /trip/:id | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | Client Route or Redirect matches /trip/:p. |
| route GET /api/trips/:tripId/transport-legs | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | Mounted at server/routes/trips.routes.ts:2207. |
| route PATCH /api/trips/:tripId/transport-legs/:legId | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | Mounted at server/routes/transport-legs.routes.ts:259. |
| test pin client/src/lib/__tests__/leg-reachability.test.ts (2026-10-06-smoke12-expert-fixes) | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | File is client/src/lib/__tests__/leg-reachability.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/surface-step1.test.ts (2026-10-06-smoke12-expert-fixes) | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | File is client/src/lib/__tests__/surface-step1.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/transport-leg-review.db.test.ts (2026-10-06-smoke12-expert-fixes) | docs/decisions/00913-2026-10-06-smoke12-expert-fixes.md | holds | File is server/__tests__/transport-leg-review.db.test.ts. Ledger lint reports the guard wired. |
| route /api/experts | docs/decisions/00914-2026-10-06-smoke13-handoff-money.md | holds | Mounted (GET). |
| route /api/health | docs/decisions/00914-2026-10-06-smoke13-handoff-money.md | holds | Mounted (GET). |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-06-smoke13-handoff-money) | docs/decisions/00914-2026-10-06-smoke13-handoff-money.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/expert-routability.test.ts (2026-10-06-smoke13-handoff-money) | docs/decisions/00914-2026-10-06-smoke13-handoff-money.md | holds | File is server/__tests__/expert-routability.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/smoke13-handoff-money.db.test.ts (2026-10-06-smoke13-handoff-money) | docs/decisions/00914-2026-10-06-smoke13-handoff-money.md | holds | File is server/__tests__/smoke13-handoff-money.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/landing-events-strip.test.tsx (2026-10-06-event-real-city-built) | docs/decisions/00915-2026-10-06-event-real-city-built.md | holds | File is client/src/components/__tests__/landing-events-strip.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-06-event-real-city-built) | docs/decisions/00915-2026-10-06-event-real-city-built.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/coral-fill-contrast.test.ts (2026-10-06-coral-fill-tokens) | docs/decisions/00916-2026-10-06-coral-fill-tokens.md | holds | File is client/src/lib/__tests__/coral-fill-contrast.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/footer-pages-one-layout.test.ts (2026-10-06-coral-fill-tokens) | docs/decisions/00916-2026-10-06-coral-fill-tokens.md | holds | File is client/src/lib/__tests__/footer-pages-one-layout.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-planning-entry.cjs (2026-10-06-step8a-experiences-entry) | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /experiences | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | Client Route or Redirect matches /experiences. |
| route GET /api/experience-types | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | Mounted at server/routes/content.routes.ts:1255. |
| test pin client/src/lib/__tests__/occasion-picker.test.ts (2026-10-06-step8a-experiences-entry) | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | File is client/src/lib/__tests__/occasion-picker.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-steps.test.ts (2026-10-06-step8a-experiences-entry) | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | File is client/src/lib/__tests__/plan-steps.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-06-step8a-experiences-entry) | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/trip-mint-entry.test.ts (2026-10-06-step8a-experiences-entry) | docs/decisions/00917-2026-10-06-step8a-experiences-entry.md | holds | File is server/services/__tests__/trip-mint-entry.test.ts. Ledger lint reports the guard wired. |
| route /api/travelpulse/global-calendar | docs/decisions/00918-2026-10-06-events-calendar.md | holds | Mounted (GET). |
| route /destinations | docs/decisions/00918-2026-10-06-events-calendar.md | holds | Client Route or Redirect matches /destinations. |
| route /events | docs/decisions/00918-2026-10-06-events-calendar.md | holds | Client Route or Redirect matches /events. |
| route GET /api/city-events/calendar | docs/decisions/00918-2026-10-06-events-calendar.md | holds | Mounted at server/routes/landing.routes.ts:275. |
| route GET /api/city-events/upcoming | docs/decisions/00918-2026-10-06-events-calendar.md | holds | Mounted at server/routes/landing.routes.ts:259. |
| test pin client/src/components/__tests__/landing-events-strip.test.tsx (2026-10-06-events-calendar) | docs/decisions/00918-2026-10-06-events-calendar.md | holds | File is client/src/components/__tests__/landing-events-strip.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs-events-calendar.spec.ts (2026-10-06-events-calendar) | docs/decisions/00918-2026-10-06-events-calendar.md | holds | File is playwright/tests/discover-tabs-events-calendar.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/events-calendar.db.test.ts (2026-10-06-events-calendar) | docs/decisions/00918-2026-10-06-events-calendar.md | holds | File is server/__tests__/events-calendar.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/events-calendar.test.ts (2026-10-06-events-calendar) | docs/decisions/00918-2026-10-06-events-calendar.md | holds | File is shared/__tests__/events-calendar.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/rc345-active-plan.test.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is client/src/lib/__tests__/rc345-active-plan.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/save-payment-prompt.test.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is client/src/lib/__tests__/save-payment-prompt.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-first-paint.test.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is client/src/lib/__tests__/slip-first-paint.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-rail.test.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is client/src/lib/__tests__/slip-rail.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-06-step8b1-slip-extraction) | docs/decisions/00919-2026-10-06-step8b1-slip-extraction.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| route /events | docs/decisions/00920-2026-10-06-event-page.md | holds | Client Route or Redirect matches /events. |
| route /events/:sourceId | docs/decisions/00920-2026-10-06-event-page.md | holds | Client Route or Redirect matches /events/:p. |
| route GET /api/city-events/:sourceId | docs/decisions/00920-2026-10-06-event-page.md | holds | Mounted at server/routes/landing.routes.ts:290. |
| test pin client/src/components/__tests__/event-detail-page.test.tsx (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is client/src/components/__tests__/event-detail-page.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs-events-calendar.spec.ts (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is playwright/tests/discover-tabs-events-calendar.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/event-page.db.test.ts (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is server/__tests__/event-page.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/blog-official-facts.db.test.ts (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is server/services/__tests__/blog-official-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/trip-mint-entry.test.ts (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is server/services/__tests__/trip-mint-entry.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/event-page.test.ts (2026-10-06-event-page) | docs/decisions/00920-2026-10-06-event-page.md | holds | File is shared/__tests__/event-page.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/billboard-verified-locals.db.test.ts (2026-10-06-billboard-locals-routable) | docs/decisions/00921-2026-10-06-billboard-locals-routable.md | holds | File is server/__tests__/billboard-verified-locals.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/event-page.db.test.ts (2026-10-06-billboard-locals-routable) | docs/decisions/00921-2026-10-06-billboard-locals-routable.md | holds | File is server/__tests__/event-page.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/billboard-verified-locals.db.test.ts (2026-10-06-billboard-slots-routable) | docs/decisions/00922-2026-10-06-billboard-slots-routable.md | holds | File is server/__tests__/billboard-verified-locals.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/landing-billboard-override.test.ts (2026-10-06-billboard-slots-routable) | docs/decisions/00922-2026-10-06-billboard-slots-routable.md | holds | File is server/services/__tests__/landing-billboard-override.test.ts. Ledger lint reports the guard wired. |
| route /experiences/:slug | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | Client Route or Redirect matches /experiences/:p. |
| test pin client/src/lib/__tests__/step8b2-map-layout.test.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is client/src/lib/__tests__/step8b2-map-layout.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/cosmetic-public-surfaces.spec.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is playwright/tests/cosmetic-public-surfaces.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-map-layout.spec.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is playwright/tests/journeys/j-map-layout.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/selection-controls.spec.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is playwright/tests/selection-controls.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-06-step8b2-map-layout) | docs/decisions/00923-2026-10-06-step8b2-map-layout.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| route /api/discover | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Mounted (GET). |
| route /api/discover/location/:city | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Mounted (GET). |
| route /api/experts | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Mounted (GET). |
| route /api/provider-services | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Mounted (GET). |
| route /api/services | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Mounted (GET). |
| route /destinations | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | Client Route or Redirect matches /destinations. |
| test pin server/__tests__/pool-listings-not-public.db.test.ts (2026-10-06-pool-listings-not-public) | docs/decisions/00924-2026-10-06-pool-listings-not-public.md | holds | File is server/__tests__/pool-listings-not-public.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-tripless-cart-writers.cjs (2026-10-07-step8c-retirements) | docs/decisions/00925-2026-10-07-step8c-retirements.md | holds | File is scripts/check-tripless-cart-writers.cjs. Ledger lint reports the guard wired. |
| guard check-public-user-id (2026-10-07-public-service-ids) | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | File is scripts/check-public-user-id.cjs. Ledger lint reports the guard wired. |
| route /experts/:id | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | Client Route or Redirect matches /experts/:p. |
| route /provider-verification | docs/decisions/00926-2026-10-07-public-service-ids.md | gone | No client Route or Redirect matches /provider-verification. |
| route GET /api/affiliate/products | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | Mounted at server/routes/content.routes.ts:8965. |
| route GET /api/discover | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | Mounted at server/routes/content.routes.ts:2989. |
| route GET /api/services | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | Mounted at server/routes/content.routes.ts:2971. |
| route GET /api/services/:id | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| test pin server/__tests__/public-service-ids.http.test.ts (2026-10-07-public-service-ids) | docs/decisions/00926-2026-10-07-public-service-ids.md | holds | File is server/__tests__/public-service-ids.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/city-events-seed.db.test.ts (2026-10-07-venue-locality-fill-sunset) | docs/decisions/00927-2026-10-07-venue-locality-fill-sunset.md | holds | File is server/__tests__/city-events-seed.db.test.ts. Ledger lint reports the guard wired. |
| file:line planning-entry.spec.ts:180 | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | No code symbol was named beside the citation. Line playwright/tests/planning-entry.spec.ts:180 reads: await page.getByTestId("option-vendor").click(); |
| route /api/affiliate/products/:id | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Mounted (GET). |
| route /api/geocode | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Mounted (GET/POST). |
| route /api/services | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Mounted (GET). |
| route /api/services/:id | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Mounted (GET). |
| route /plans/:tripId | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Client Route or Redirect matches /plans/:p. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | Mounted at server/routes.ts:13414. |
| test pin client/src/lib/__tests__/step8d-guest-map.test.ts (2026-10-07-step8d-guest-map) | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | File is client/src/lib/__tests__/step8d-guest-map.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-guest-map.spec.ts (2026-10-07-step8d-guest-map) | docs/decisions/00928-2026-10-07-step8d-guest-map.md | holds | File is playwright/tests/journeys/j-guest-map.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-map-dialog-click.spec.ts (2026-10-07-map-dialog-isolation) | docs/decisions/00929-2026-10-07-map-dialog-isolation.md | holds | File is playwright/tests/journeys/j-map-dialog-click.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-07-slip-leg-render-prop) | docs/decisions/00930-2026-10-07-slip-leg-render-prop.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-first-paint.test.ts (2026-10-07-slip-leg-render-prop) | docs/decisions/00930-2026-10-07-slip-leg-render-prop.md | holds | File is client/src/lib/__tests__/slip-first-paint.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-rail.test.ts (2026-10-07-slip-leg-render-prop) | docs/decisions/00930-2026-10-07-slip-leg-render-prop.md | holds | File is client/src/lib/__tests__/slip-rail.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | Mounted (GET). |
| test pin client/src/components/plancard/__tests__/step9a-routed-legs.test.tsx (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is client/src/components/plancard/__tests__/step9a-routed-legs.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/maps-billing-tiers.test.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is server/__tests__/maps-billing-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-legs-engine.db.test.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is server/__tests__/plan-legs-engine.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/routing-adapter-contract.test.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is server/__tests__/routing-adapter-contract.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/routing-call-count.test.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is server/__tests__/routing-call-count.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-routed-legs.test.ts (2026-10-07-step9a-routing-engine) | docs/decisions/00931-2026-10-07-step9a-routing-engine.md | holds | File is shared/__tests__/plan-routed-legs.test.ts. Ledger lint reports the guard wired. |
| file:line e2e/supply-demand/lib/db.ts:251 | docs/decisions/00932-2026-10-07-item-order-tiebreak.md | holds | No code symbol was named beside the citation. Line e2e/supply-demand/lib/db.ts:251 reads: LEAD(latitude) OVER w AS next_lat, LEAD(longitude) OVER w AS next_lng |
| test pin server/__tests__/item-order-tiebreak.db.test.ts (2026-10-07-item-order-tiebreak) | docs/decisions/00932-2026-10-07-item-order-tiebreak.md | holds | File is server/__tests__/item-order-tiebreak.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/recheck | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | Mounted at server/routes/plancard.routes.ts:644. |
| test pin client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/leg-reachability.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is client/src/lib/__tests__/leg-reachability.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin scripts/ci/post-internal-jobs.test.sh (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is scripts/ci/post-internal-jobs.test.sh. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/airport-legs.db.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is server/__tests__/airport-legs.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/leg-google-coords-refresh.db.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is server/__tests__/leg-google-coords-refresh.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/leg-recheck.db.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is server/__tests__/leg-recheck.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/facts-recheck-registration.vitest.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is server/routes/__tests__/facts-recheck-registration.vitest.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/internal-jobs-auth.http.test.ts (2026-10-07-step9b-optimizer-and-rechecks) | docs/decisions/00933-2026-10-07-step9b-optimizer-and-rechecks.md | holds | File is server/routes/__tests__/internal-jobs-auth.http.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx (2026-10-07-fu9b1-airport-minutes) | docs/decisions/00934-2026-10-07-fu9b1-airport-minutes.md | holds | File is client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-07-fu9b1-airport-minutes) | docs/decisions/00934-2026-10-07-fu9b1-airport-minutes.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| route /api/auth/user | docs/decisions/00935-2026-10-07-signup-welcome-outbox.md | holds | Mounted (GET). |
| route POST /api/auth/register | docs/decisions/00935-2026-10-07-signup-welcome-outbox.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| test pin server/__tests__/offering-contract-snapshot.test.ts (2026-10-07-signup-welcome-outbox) | docs/decisions/00935-2026-10-07-signup-welcome-outbox.md | holds | File is server/__tests__/offering-contract-snapshot.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/signup-welcome-outbox.db.test.ts (2026-10-07-signup-welcome-outbox) | docs/decisions/00935-2026-10-07-signup-welcome-outbox.md | holds | File is server/__tests__/signup-welcome-outbox.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/nav-experience-groups.test.tsx (2026-10-07-nav-experience-groups) | docs/decisions/00936-2026-10-07-nav-experience-groups.md | holds | File is client/src/lib/__tests__/nav-experience-groups.test.tsx. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00937-2026-10-08-tools-tray-live-only.md | holds | Mounted (GET). |
| test pin client/src/components/plancard/__tests__/tools-tray.test.tsx (2026-10-08-tools-tray-live-only) | docs/decisions/00937-2026-10-08-tools-tray-live-only.md | holds | File is client/src/components/plancard/__tests__/tools-tray.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-tools-tray-live-only) | docs/decisions/00937-2026-10-08-tools-tray-live-only.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | Mounted (GET). |
| route POST /api/trips/:tripId/transport-legs/:legId/options | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | Mounted at server/routes/transport-legs.routes.ts:384. |
| test pin client/src/components/plancard/__tests__/step9c-leg-sheet.test.tsx (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is client/src/components/plancard/__tests__/step9c-leg-sheet.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/tools-tray.test.tsx (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is client/src/components/plancard/__tests__/tools-tray.test.tsx. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/leg-options.db.test.ts (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is server/__tests__/leg-options.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/leg-options.test.ts (2026-10-07-step9c-leg-options) | docs/decisions/00938-2026-10-07-step9c-leg-options.md | holds | File is shared/__tests__/leg-options.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/smoke8-fixes.test.ts (2026-10-08-fu9c1-logistics-row-retired) | docs/decisions/00939-2026-10-08-fu9c1-logistics-row-retired.md | holds | File is client/src/lib/__tests__/smoke8-fixes.test.ts. Ledger lint reports the guard wired. |
| file:line anchor-panel.test.tsx:133 | docs/decisions/00940-2026-10-08-us-spelling-guard.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/__tests__/anchor-panel.test.tsx:133 reads: assert.match(t1, /Once some of your stops are on the map/); |
| guard scripts/check-us-spelling.cjs (2026-10-08-us-spelling-guard) | docs/decisions/00940-2026-10-08-us-spelling-guard.md | holds | File is scripts/check-us-spelling.cjs. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-08-us-spelling-guard) | docs/decisions/00940-2026-10-08-us-spelling-guard.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| file:line smoke5-fixes.test.ts:95 | docs/decisions/00941-2026-10-08-arrival-title-normalized.md | holds | No code symbol was named beside the citation. Line client/src/lib/__tests__/smoke5-fixes.test.ts:95 reads: assert.equal(isAcceptableArrivalLine("Arrive at Kyoto Station and drop bags", "Kyoto", "arrival"), true); |
| test pin client/src/lib/__tests__/smoke5-fixes.test.ts (2026-10-08-arrival-title-normalized) | docs/decisions/00941-2026-10-08-arrival-title-normalized.md | holds | File is client/src/lib/__tests__/smoke5-fixes.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/arrival-title-normalized.test.ts (2026-10-08-arrival-title-normalized) | docs/decisions/00941-2026-10-08-arrival-title-normalized.md | holds | File is server/utils/__tests__/arrival-title-normalized.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx (2026-10-08-getting-around-every-gap) | docs/decisions/00942-2026-10-08-getting-around-every-gap.md | holds | File is client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-getting-around-every-gap) | docs/decisions/00942-2026-10-08-getting-around-every-gap.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/console-grammar.test.ts (2026-10-08-conformance-slip-phase0) | docs/decisions/00943-2026-10-08-conformance-slip-phase0.md | holds | File is client/src/lib/__tests__/console-grammar.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-conformance-slip-phase0) | docs/decisions/00943-2026-10-08-conformance-slip-phase0.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| route GET /api/optimization-fee | docs/decisions/00944-2026-10-08-optimize-pay-flow.md | holds | Mounted at server/routes/optimization.routes.ts:283. |
| route POST /api/optimization-payments | docs/decisions/00944-2026-10-08-optimize-pay-flow.md | holds | Mounted at server/routes/optimization.routes.ts:402. |
| route POST /api/optimization-payments/cancel | docs/decisions/00944-2026-10-08-optimize-pay-flow.md | holds | Mounted at server/routes/optimization.routes.ts:620. |
| test pin client/src/lib/__tests__/optimize-pay-flow.test.ts (2026-10-08-optimize-pay-flow) | docs/decisions/00944-2026-10-08-optimize-pay-flow.md | holds | File is client/src/lib/__tests__/optimize-pay-flow.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-08-optimize-pay-flow) | docs/decisions/00944-2026-10-08-optimize-pay-flow.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/00945-2026-10-08-slip-empty-board.md | holds | Mounted at server/routes.ts:1456. |
| test pin client/src/components/plancard/__tests__/slip-empty-board.test.tsx (2026-10-08-slip-empty-board) | docs/decisions/00945-2026-10-08-slip-empty-board.md | holds | File is client/src/components/plancard/__tests__/slip-empty-board.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-08-slip-empty-board) | docs/decisions/00945-2026-10-08-slip-empty-board.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-slip-empty-board) | docs/decisions/00945-2026-10-08-slip-empty-board.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/optimizer-lead.test.tsx (2026-10-08-slip-moment-board) | docs/decisions/00946-2026-10-08-slip-moment-board.md | holds | File is client/src/components/plancard/__tests__/optimizer-lead.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/slip-moment-board.test.tsx (2026-10-08-slip-moment-board) | docs/decisions/00946-2026-10-08-slip-moment-board.md | holds | File is client/src/components/plancard/__tests__/slip-moment-board.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-slip-moment-board) | docs/decisions/00946-2026-10-08-slip-moment-board.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/slip-main-rows.test.tsx (2026-10-08-slip-main-rows) | docs/decisions/00947-2026-10-08-slip-main-rows.md | holds | File is client/src/components/plancard/__tests__/slip-main-rows.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx (2026-10-08-slip-main-rows) | docs/decisions/00947-2026-10-08-slip-main-rows.md | holds | File is client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/surface-step1-parity.test.tsx (2026-10-08-slip-main-rows) | docs/decisions/00947-2026-10-08-slip-main-rows.md | holds | File is client/src/components/plancard/__tests__/surface-step1-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-08-slip-main-rows) | docs/decisions/00947-2026-10-08-slip-main-rows.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/trip-pass/issue | docs/decisions/00948-2026-10-08-qa-trip-pass-issue.md | holds | Mounted at server/routes/admin.routes.ts:10483. |
| test pin client/src/lib/__tests__/qa-trip-pass-issue.test.ts (2026-10-08-qa-trip-pass-issue) | docs/decisions/00948-2026-10-08-qa-trip-pass-issue.md | holds | File is client/src/lib/__tests__/qa-trip-pass-issue.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-08-qa-trip-pass-issue) | docs/decisions/00948-2026-10-08-qa-trip-pass-issue.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| file:line location-view.service.ts:311 | docs/decisions/00949-2026-10-08-location-view-recs-rejection.md | drifted | unhandledRejection is not in server/services/location-view.service.ts. Cited line now reads: const hero = await heroPromise; |
| test pin server/__tests__/pool-listings-not-public.db.test.ts (2026-10-08-location-view-recs-rejection) | docs/decisions/00949-2026-10-08-location-view-recs-rejection.md | holds | File is server/__tests__/pool-listings-not-public.db.test.ts. Ledger lint reports the guard wired. |
| route /experiences | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | Client Route or Redirect matches /experiences. |
| route POST /api/trips | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | Mounted at server/routes.ts:1456. |
| test pin client/src/lib/__tests__/e1-zero-questions.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is client/src/lib/__tests__/e1-zero-questions.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/occasion-picker.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is client/src/lib/__tests__/occasion-picker.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-steps.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is client/src/lib/__tests__/plan-steps.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/rc12-party-size.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is client/src/lib/__tests__/rc12-party-size.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-legs-engine.db.test.ts (2026-10-08-e1-zero-questions) | docs/decisions/00950-2026-10-08-e1-zero-questions.md | holds | File is server/__tests__/plan-legs-engine.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:id/trip-pass | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | Mounted at server/routes/trip-pass.routes.ts:52. |
| test pin client/src/lib/__tests__/slip-conformance.test.ts (2026-10-08-slip-main-rail) | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | File is client/src/lib/__tests__/slip-conformance.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-rail.test.ts (2026-10-08-slip-main-rail) | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | File is client/src/lib/__tests__/slip-rail.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-pass-copy.test.ts (2026-10-08-slip-main-rail) | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | File is client/src/lib/__tests__/trip-pass-copy.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-08-slip-main-rail) | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-08-slip-main-rail) | docs/decisions/00951-2026-10-08-slip-main-rail.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/starts-soon-banner.test.ts (2026-10-08-starts-soon-needs-real-dates) | docs/decisions/00952-2026-10-08-starts-soon-needs-real-dates.md | holds | File is shared/__tests__/starts-soon-banner.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/step6-trip-card.test.ts (2026-10-08-starts-soon-needs-real-dates) | docs/decisions/00952-2026-10-08-starts-soon-needs-real-dates.md | holds | File is shared/__tests__/step6-trip-card.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-tokens-contrast.test.ts (2026-10-08-slip-tokens-contrast) | docs/decisions/00953-2026-10-08-slip-tokens-contrast.md | holds | File is client/src/lib/__tests__/slip-tokens-contrast.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/trip-card-handover-nudge.db.test.ts (2026-10-08-nudge-needs-real-dates) | docs/decisions/00954-2026-10-08-nudge-needs-real-dates.md | holds | File is server/__tests__/trip-card-handover-nudge.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/step8b2-map-layout.test.ts (2026-10-08-slip-map-board) | docs/decisions/00955-2026-10-08-slip-map-board.md | holds | File is client/src/lib/__tests__/step8b2-map-layout.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-map-layout.spec.ts (2026-10-08-slip-map-board) | docs/decisions/00955-2026-10-08-slip-map-board.md | holds | File is playwright/tests/journeys/j-map-layout.spec.ts. Ledger lint reports the guard wired. |
| file:line pricing.tsx:309 | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | No code symbol was named beside the citation. Line client/src/pages/pricing.tsx:309 reads: priceSuffix: "/ trip", |
| guard scripts/check-unlimited-runs.cjs (2026-10-08-trip-pass-five-runs) | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | File is scripts/check-unlimited-runs.cjs. Ledger lint reports the guard wired. |
| route /api/pricing | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | Mounted (GET). |
| route /pricing | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | Client Route or Redirect matches /pricing. |
| route GET /api/pricing | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | Mounted at server/routes/pricing.routes.ts:156. |
| test pin client/src/lib/__tests__/trip-pass-copy.test.ts (2026-10-08-trip-pass-five-runs) | docs/decisions/00956-2026-10-08-trip-pass-five-runs.md | holds | File is client/src/lib/__tests__/trip-pass-copy.test.ts. Ledger lint reports the guard wired. |
| guard where-to-stay.db (2026-10-09-s1-one-stay) | docs/decisions/00957-2026-10-09-s1-one-stay.md | holds | File is server/__tests__/where-to-stay.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/stay-pick/seen | docs/decisions/00957-2026-10-09-s1-one-stay.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:456. |
| test pin server/__tests__/stay-pick.db.test.ts (2026-10-09-s1-one-stay) | docs/decisions/00957-2026-10-09-s1-one-stay.md | holds | File is server/__tests__/stay-pick.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/stay-pick.test.ts (2026-10-09-s1-one-stay) | docs/decisions/00957-2026-10-09-s1-one-stay.md | holds | File is shared/__tests__/stay-pick.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-handoff-board.test.ts (2026-10-08-slip-handoff-board) | docs/decisions/00958-2026-10-08-slip-handoff-board.md | holds | File is client/src/lib/__tests__/slip-handoff-board.test.ts. Ledger lint reports the guard wired. |
| route /plans/:tripId/compare/:setId | docs/decisions/00959-2026-10-08-slip-compare-board.md | holds | Client Route or Redirect matches /plans/:p/compare/:p. |
| test pin client/src/components/plancard/__tests__/stay-pick-card.test.tsx (2026-10-08-slip-compare-board) | docs/decisions/00959-2026-10-08-slip-compare-board.md | holds | File is client/src/components/plancard/__tests__/stay-pick-card.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-compare.test.ts (2026-10-08-slip-compare-board) | docs/decisions/00959-2026-10-08-slip-compare-board.md | holds | File is client/src/lib/__tests__/plan-compare.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-compare-board.test.ts (2026-10-08-slip-compare-board) | docs/decisions/00959-2026-10-08-slip-compare-board.md | holds | File is client/src/lib/__tests__/slip-compare-board.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-08-slip-compare-board) | docs/decisions/00959-2026-10-08-slip-compare-board.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| route /itinerary-comparison/:id | docs/decisions/00960-2026-10-08-slip-optimized-board.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| test pin client/src/lib/__tests__/slip-optimized-board.test.ts (2026-10-08-slip-optimized-board) | docs/decisions/00960-2026-10-08-slip-optimized-board.md | holds | File is client/src/lib/__tests__/slip-optimized-board.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/versions-board.test.ts (2026-10-08-slip-optimized-board) | docs/decisions/00960-2026-10-08-slip-optimized-board.md | holds | File is client/src/lib/__tests__/versions-board.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-08-slip-optimized-board) | docs/decisions/00960-2026-10-08-slip-optimized-board.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-versions-board.test.ts (2026-10-08-slip-versions-board) | docs/decisions/00961-2026-10-08-slip-versions-board.md | holds | File is client/src/lib/__tests__/slip-versions-board.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/versions-board.test.ts (2026-10-08-slip-versions-board) | docs/decisions/00961-2026-10-08-slip-versions-board.md | holds | File is client/src/lib/__tests__/versions-board.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-08-slip-versions-board) | docs/decisions/00961-2026-10-08-slip-versions-board.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/step6-card-parity.test.tsx (2026-10-08-slip-trip-card-board) | docs/decisions/00962-2026-10-08-slip-trip-card-board.md | holds | File is client/src/components/plancard/__tests__/step6-card-parity.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-trip-card-board.test.ts (2026-10-08-slip-trip-card-board) | docs/decisions/00962-2026-10-08-slip-trip-card-board.md | holds | File is client/src/lib/__tests__/slip-trip-card-board.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-08-slip-trip-card-board) | docs/decisions/00962-2026-10-08-slip-trip-card-board.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/health | docs/decisions/00963-2026-10-09-fu-s1-1-stay-pick-cost.md | holds | Mounted (GET). |
| test pin server/__tests__/maps-billing-tiers.test.ts (2026-10-09-fu-s1-1-stay-pick-cost) | docs/decisions/00963-2026-10-09-fu-s1-1-stay-pick-cost.md | holds | File is server/__tests__/maps-billing-tiers.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-pick.db.test.ts (2026-10-09-fu-s1-1-stay-pick-cost) | docs/decisions/00963-2026-10-09-fu-s1-1-stay-pick-cost.md | holds | File is server/__tests__/stay-pick.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/stay-pick/link | docs/decisions/00964-2026-10-09-fu-s1-2-stay-link.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:360. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-09-fu-s1-2-stay-link) | docs/decisions/00964-2026-10-09-fu-s1-2-stay-link.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-link.db.test.ts (2026-10-09-fu-s1-2-stay-link) | docs/decisions/00964-2026-10-09-fu-s1-2-stay-link.md | holds | File is server/__tests__/stay-link.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-pick.db.test.ts (2026-10-09-fu-s1-2-stay-link) | docs/decisions/00964-2026-10-09-fu-s1-2-stay-link.md | holds | File is server/__tests__/stay-pick.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/stay-link.test.ts (2026-10-09-fu-s1-2-stay-link) | docs/decisions/00964-2026-10-09-fu-s1-2-stay-link.md | holds | File is shared/__tests__/stay-link.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-closeness-config.test.ts (2026-10-09-fu-s1-3-stay-closeness) | docs/decisions/00965-2026-10-09-fu-s1-3-stay-closeness.md | holds | File is server/__tests__/stay-closeness-config.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-pick.db.test.ts (2026-10-09-fu-s1-3-stay-closeness) | docs/decisions/00965-2026-10-09-fu-s1-3-stay-closeness.md | holds | File is server/__tests__/stay-pick.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/stay-pick.test.ts (2026-10-09-fu-s1-3-stay-closeness) | docs/decisions/00965-2026-10-09-fu-s1-3-stay-closeness.md | holds | File is shared/__tests__/stay-pick.test.ts. Ledger lint reports the guard wired. |
| guard share-link-price-redaction.http (2026-10-09-sh1-share-traveler-note) | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | File is server/__tests__/share-link-price-redaction.http.test.ts. Ledger lint reports the guard wired. |
| route /api/shared-trips/:token | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | Mounted (GET). |
| route /api/trips/shared/:token | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | Mounted (GET). |
| route GET /api/itinerary-share/:token | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | Mounted at server/routes/trips.routes.ts:2000. |
| route GET /api/trips/:id | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | Mounted at server/routes/trips.routes.ts:390. |
| test pin server/__tests__/share-traveler-note.http.test.ts (2026-10-09-sh1-share-traveler-note) | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | File is server/__tests__/share-traveler-note.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/share-traveler-note.test.ts (2026-10-09-sh1-share-traveler-note) | docs/decisions/00966-2026-10-09-sh1-share-traveler-note.md | holds | File is server/__tests__/share-traveler-note.test.ts. Ledger lint reports the guard wired. |
| file:line travel-experts.tsx:1361 | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | No code symbol was named beside the citation. Line client/src/pages/travel-experts.tsx:1361 reads: <span className="text-xl">{opt.emoji}</span> |
| guard scripts/check-us-spelling.cjs (2026-10-08-h1-home-copy) | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | File is scripts/check-us-spelling.cjs. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/landing-events-strip.test.tsx (2026-10-08-h1-home-copy) | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | File is client/src/components/__tests__/landing-events-strip.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/landing-hero-representative.test.tsx (2026-10-08-h1-home-copy) | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | File is client/src/components/__tests__/landing-hero-representative.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/moments-callout.test.tsx (2026-10-08-h1-home-copy) | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | File is client/src/components/__tests__/moments-callout.test.tsx. Ledger lint reports the guard wired. |
| test pin playwright/tests/home-word-count.spec.ts (2026-10-08-h1-home-copy) | docs/decisions/00967-2026-10-08-h1-home-copy.md | holds | File is playwright/tests/home-word-count.spec.ts. Ledger lint reports the guard wired. |
| guard scripts/check-planning-entry.cjs (2026-10-09-e2-plan-entry) | docs/decisions/00968-2026-10-09-e2-plan-entry.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /api/city-events/upcoming | docs/decisions/00968-2026-10-09-e2-plan-entry.md | holds | Mounted (GET). |
| route /experiences | docs/decisions/00968-2026-10-09-e2-plan-entry.md | holds | Client Route or Redirect matches /experiences. |
| test pin client/src/lib/__tests__/plan-entry.test.ts (2026-10-09-e2-plan-entry) | docs/decisions/00968-2026-10-09-e2-plan-entry.md | holds | File is client/src/lib/__tests__/plan-entry.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-09-e2-plan-entry) | docs/decisions/00968-2026-10-09-e2-plan-entry.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| guard scripts/check-planning-entry.cjs (2026-10-09-e3-experiences-inline) | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | File is scripts/check-planning-entry.cjs. Ledger lint reports the guard wired. |
| route /experiences | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | Client Route or Redirect matches /experiences. |
| route /experiences/:slug | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | Client Route or Redirect matches /experiences/:p. |
| test pin client/src/lib/__tests__/occasion-picker.test.ts (2026-10-09-e3-experiences-inline) | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | File is client/src/lib/__tests__/occasion-picker.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-entry.test.ts (2026-10-09-e3-experiences-inline) | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | File is client/src/lib/__tests__/plan-entry.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-09-e3-experiences-inline) | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/occasion-descriptions.test.ts (2026-10-09-e3-experiences-inline) | docs/decisions/00969-2026-10-09-e3-experiences-inline.md | holds | File is server/__tests__/occasion-descriptions.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/stay-card-closeness.test.tsx (2026-10-09-stay-card-closeness) | docs/decisions/00970-2026-10-09-stay-card-closeness.md | holds | File is client/src/components/plancard/__tests__/stay-card-closeness.test.tsx. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/stay-pick/link | docs/decisions/00971-2026-10-09-stay-card-link.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:360. |
| test pin client/src/components/plancard/__tests__/stay-card-link.test.tsx (2026-10-09-stay-card-link) | docs/decisions/00971-2026-10-09-stay-card-link.md | holds | File is client/src/components/plancard/__tests__/stay-card-link.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/plancard-cover-hero.test.tsx (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is client/src/components/plancard/__tests__/plancard-cover-hero.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-compare.test.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is client/src/lib/__tests__/plan-compare.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/run-charge-line.test.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is client/src/lib/__tests__/run-charge-line.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-fit.test.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is shared/__tests__/plan-fit.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/recommended-version.test.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is shared/__tests__/recommended-version.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/run-charge.test.ts (2026-10-09-slip-held-batch-1) | docs/decisions/00972-2026-10-09-slip-held-batch-1.md | holds | File is shared/__tests__/run-charge.test.ts. Ledger lint reports the guard wired. |
| route /api/grok/match-experts | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | Mounted (POST). |
| route /api/trip-experts | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | Mounted (GET). |
| route GET /api/experts/:id | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | Mounted at server/routes.ts:5624. |
| route POST /api/admin/handoffs/:id/assign | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | Mounted at server/routes/handoff.routes.ts:441. |
| test pin playwright/tests/journeys/j-no-seed-expert.spec.ts (2026-10-09-b3-expert-routability) | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | File is playwright/tests/journeys/j-no-seed-expert.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/expert-routability-surfaces.db.test.ts (2026-10-09-b3-expert-routability) | docs/decisions/00973-2026-10-09-b3-expert-routability.md | holds | File is server/__tests__/expert-routability-surfaces.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/admin/gems/:id/verify | docs/decisions/00974-2026-10-09-fd2-content-tier-tags.md | holds | Mounted at server/routes/admin.routes.ts:9188. |
| route POST /internal/jobs/content-expiry-census | docs/decisions/00974-2026-10-09-fd2-content-tier-tags.md | holds | Mounted at server/routes/internal.routes.ts:459. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-09-fd2-content-tier-tags) | docs/decisions/00974-2026-10-09-fd2-content-tier-tags.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-tiers.db.test.ts (2026-10-09-fd2-content-tier-tags) | docs/decisions/00974-2026-10-09-fd2-content-tier-tags.md | holds | File is server/__tests__/content-tiers.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-tiers.test.ts (2026-10-09-fd2-content-tier-tags) | docs/decisions/00974-2026-10-09-fd2-content-tier-tags.md | holds | File is shared/__tests__/content-tiers.test.ts. Ledger lint reports the guard wired. |
| route GET /api/me/free-drafts | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | Mounted at server/routes/content.routes.ts:4699. |
| route POST /api/ai/generate-itinerary | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | Mounted at server/routes/content.routes.ts:4709. |
| route POST /api/quick-start-itinerary | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | Mounted at server/routes.ts:12348. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | Mounted at server/routes.ts:1691. |
| test pin server/__tests__/free-draft-cap.db.test.ts (2026-10-09-fd1-free-draft-cap) | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | File is server/__tests__/free-draft-cap.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/free-draft-cap.test.ts (2026-10-09-fd1-free-draft-cap) | docs/decisions/00975-2026-10-09-fd1-free-draft-cap.md | holds | File is shared/__tests__/free-draft-cap.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/empty-anchor-card.test.ts (2026-10-10-empty-anchor-card) | docs/decisions/00976-2026-10-10-empty-anchor-card.md | holds | File is client/src/lib/__tests__/empty-anchor-card.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-10-empty-anchor-card) | docs/decisions/00976-2026-10-10-empty-anchor-card.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/no-stays-no-promise.test.tsx (2026-10-10-no-stays-no-promise) | docs/decisions/00977-2026-10-10-no-stays-no-promise.md | holds | File is client/src/components/plancard/__tests__/no-stays-no-promise.test.tsx. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/00978-2026-10-10-health-hotel-supply.md | holds | Mounted (GET). |
| test pin server/services/__tests__/hotel-supply.test.ts (2026-10-10-health-hotel-supply) | docs/decisions/00978-2026-10-10-health-hotel-supply.md | holds | File is server/services/__tests__/hotel-supply.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/liteapi-stay-row.test.tsx (2026-10-10-s1-d1-liteapi) | docs/decisions/00979-2026-10-10-s1-d1-liteapi.md | holds | File is client/src/components/plancard/__tests__/liteapi-stay-row.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-sync.db.test.ts (2026-10-10-s1-d1-liteapi) | docs/decisions/00979-2026-10-10-s1-d1-liteapi.md | holds | File is server/__tests__/liteapi-sync.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/hotel-supply.test.ts (2026-10-10-s1-d1-liteapi) | docs/decisions/00979-2026-10-10-s1-d1-liteapi.md | holds | File is server/services/__tests__/hotel-supply.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/liteapi.test.ts (2026-10-10-s1-d1-liteapi) | docs/decisions/00979-2026-10-10-s1-d1-liteapi.md | holds | File is server/services/__tests__/liteapi.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/stay-pick.test.ts (2026-10-10-s1-d1-liteapi) | docs/decisions/00979-2026-10-10-s1-d1-liteapi.md | holds | File is shared/__tests__/stay-pick.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/day-feasibility-line.test.tsx (2026-10-10-fd3-feasibility) | docs/decisions/00980-2026-10-10-fd3-feasibility.md | holds | File is client/src/components/plancard/__tests__/day-feasibility-line.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/fd3-feasibility.db.test.ts (2026-10-10-fd3-feasibility) | docs/decisions/00980-2026-10-10-fd3-feasibility.md | holds | File is server/__tests__/fd3-feasibility.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/feasibility-facts.test.ts (2026-10-10-fd3-feasibility) | docs/decisions/00980-2026-10-10-fd3-feasibility.md | holds | File is shared/__tests__/feasibility-facts.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/personas/journey-handoff.spec.ts (2026-10-10-jh1-journey-handoff) | docs/decisions/00981-2026-10-10-jh1-journey-handoff.md | holds | File is playwright/tests/personas/journey-handoff.spec.ts. Ledger lint reports the guard wired. |
| route /experiences | docs/decisions/00982-2026-10-10-mobile-nav-close.md | holds | Client Route or Redirect matches /experiences. |
| test pin playwright/tests/planning-entry.spec.ts (2026-10-10-mobile-nav-close) | docs/decisions/00982-2026-10-10-mobile-nav-close.md | holds | File is playwright/tests/planning-entry.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/anchor-panel.test.tsx (2026-10-10-s1b-provider-stays) | docs/decisions/00983-2026-10-10-s1b-provider-stays.md | holds | File is client/src/components/plancard/__tests__/anchor-panel.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/stay-pick-card.test.tsx (2026-10-10-s1b-provider-stays) | docs/decisions/00983-2026-10-10-s1b-provider-stays.md | holds | File is client/src/components/plancard/__tests__/stay-pick-card.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/occasion-descriptions.test.ts (2026-10-10-m364-occasion-descriptions) | docs/decisions/00984-2026-10-10-m364-occasion-descriptions.md | holds | File is server/__tests__/occasion-descriptions.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/day-local-teaser-line.test.tsx (2026-10-10-fd5-coverage-targets) | docs/decisions/00985-2026-10-10-fd5-coverage-targets.md | holds | File is client/src/components/plancard/__tests__/day-local-teaser-line.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/fd5-coverage-gate.db.test.ts (2026-10-10-fd5-coverage-targets) | docs/decisions/00985-2026-10-10-fd5-coverage-targets.md | holds | File is server/__tests__/fd5-coverage-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/coverage-targets.test.ts (2026-10-10-fd5-coverage-targets) | docs/decisions/00985-2026-10-10-fd5-coverage-targets.md | holds | File is shared/__tests__/coverage-targets.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-source-targets.test.ts (2026-10-10-ss1a-registry-entry-sheet) | docs/decisions/00986-2026-10-10-ss1a-registry-entry-sheet.md | holds | File is shared/__tests__/content-source-targets.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/stays/:stayId/rates | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:375. |
| test pin client/src/components/plancard/__tests__/stay-rates.test.tsx (2026-10-10-s1-d2-liteapi-rates) | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | File is client/src/components/plancard/__tests__/stay-rates.test.tsx. Ledger lint reports the guard wired. |
| test pin liteapi-stay-row.test.tsx (2026-10-10-s1-d2-liteapi-rates) | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | File is client/src/components/plancard/__tests__/liteapi-stay-row.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-rates.db.test.ts (2026-10-10-s1-d2-liteapi-rates) | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | File is server/__tests__/liteapi-rates.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/liteapi-rates-gate.test.ts (2026-10-10-s1-d2-liteapi-rates) | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | File is server/services/__tests__/liteapi-rates-gate.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/liteapi-rates.test.ts (2026-10-10-s1-d2-liteapi-rates) | docs/decisions/00987-2026-10-10-s1-d2-liteapi-rates.md | holds | File is shared/__tests__/liteapi-rates.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/p0-legs-slip.test.tsx (2026-10-10-p0-legs-baseline) | docs/decisions/00988-2026-10-10-p0-legs-baseline.md | holds | File is client/src/components/plancard/__tests__/p0-legs-slip.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0-legs-baseline.db.test.ts (2026-10-10-p0-legs-baseline) | docs/decisions/00988-2026-10-10-p0-legs-baseline.md | holds | File is server/__tests__/p0-legs-baseline.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-legs-engine.db.test.ts (2026-10-10-p0-legs-baseline) | docs/decisions/00988-2026-10-10-p0-legs-baseline.md | holds | File is server/__tests__/plan-legs-engine.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/trend-engine/__tests__/market-slug-resolver.test.ts (2026-10-10-p0-legs-baseline) | docs/decisions/00988-2026-10-10-p0-legs-baseline.md | holds | File is server/services/trend-engine/__tests__/market-slug-resolver.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fee-band-admin-guards.test.ts (2026-10-10-tc0-transport-commission-band) | docs/decisions/00989-2026-10-10-tc0-transport-commission-band.md | holds | File is server/__tests__/fee-band-admin-guards.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc0-transport-commission-band.db.test.ts (2026-10-10-tc0-transport-commission-band) | docs/decisions/00989-2026-10-10-tc0-transport-commission-band.md | holds | File is server/__tests__/tc0-transport-commission-band.db.test.ts. Ledger lint reports the guard wired. |
| route POST /internal/jobs/official-refresh | docs/decisions/00990-2026-10-10-ss1b-official-refresh.md | holds | Mounted at server/routes/internal.routes.ts:484. |
| test pin server/__tests__/official-refresh.db.test.ts (2026-10-10-ss1b-official-refresh) | docs/decisions/00990-2026-10-10-ss1b-official-refresh.md | holds | File is server/__tests__/official-refresh.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/official-refresh.test.ts (2026-10-10-ss1b-official-refresh) | docs/decisions/00990-2026-10-10-ss1b-official-refresh.md | holds | File is shared/__tests__/official-refresh.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/personas/journey-traveler.spec.ts (2026-10-10-jt-trip-pass-after-run) | docs/decisions/00991-2026-10-10-jt-trip-pass-after-run.md | holds | File is playwright/tests/personas/journey-traveler.spec.ts. Ledger lint reports the guard wired. |
| route POST /api/provider/properties | docs/decisions/00992-2026-10-10-pb1-property-category-city.md | holds | Mounted at server/routes/provider.routes.ts:580. |
| route POST /api/provider/services | docs/decisions/00992-2026-10-10-pb1-property-category-city.md | holds | Mounted at server/routes.ts:4056. |
| test pin client/src/lib/__tests__/property-neighborhood.test.ts (2026-10-10-pb1-property-category-city) | docs/decisions/00992-2026-10-10-pb1-property-category-city.md | holds | File is client/src/lib/__tests__/property-neighborhood.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/pb1-property-category-city.db.test.ts (2026-10-10-pb1-property-category-city) | docs/decisions/00992-2026-10-10-pb1-property-category-city.md | holds | File is server/__tests__/pb1-property-category-city.db.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/provider/properties/:id | docs/decisions/00993-2026-10-10-pb2-property-patch-rooms.md | holds | Mounted at server/routes/provider.routes.ts:731. |
| test pin server/__tests__/pb2-property-patch-rooms.db.test.ts (2026-10-10-pb2-property-patch-rooms) | docs/decisions/00993-2026-10-10-pb2-property-patch-rooms.md | holds | File is server/__tests__/pb2-property-patch-rooms.db.test.ts. Ledger lint reports the guard wired. |
| route /expert/catalog | docs/decisions/00994-2026-10-10-ss2a-spec-columns.md | holds | Client Route or Redirect matches /expert/catalog. |
| route /provider/services | docs/decisions/00994-2026-10-10-ss2a-spec-columns.md | holds | Client Route or Redirect matches /provider/services. |
| test pin e2e/specs/journey-2.spec.ts (2026-10-10-ss2a-spec-columns) | docs/decisions/00994-2026-10-10-ss2a-spec-columns.md | holds | File is e2e/specs/journey-2.spec.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/d5-guest-to-auth.spec.ts (2026-10-10-ss2a-spec-columns) | docs/decisions/00994-2026-10-10-ss2a-spec-columns.md | holds | File is e2e/supply-demand/d5-guest-to-auth.spec.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/d6-checkout.spec.ts (2026-10-10-ss2a-spec-columns) | docs/decisions/00994-2026-10-10-ss2a-spec-columns.md | holds | File is e2e/supply-demand/d6-checkout.spec.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-10-ss2b-retire-stale-specs) | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | holds | Row states it has no CI guard: none — a deletion; each retired test's current rule is named with its pin, or as a gap, in the PR body. |
| route /itinerary-comparison/:id | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| route /plans/:id | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | holds | Client Route or Redirect matches /plans/:p. |
| route /services | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | holds | Client Route or Redirect matches /services. |
| route /trip | docs/decisions/00995-2026-10-10-ss2b-retire-stale-specs.md | gone | No client Route or Redirect matches /trip. |
| route /destinations | docs/decisions/00996-2026-10-10-ss2c-quickstart-banner.md | holds | Client Route or Redirect matches /destinations. |
| route /quick-start | docs/decisions/00996-2026-10-10-ss2c-quickstart-banner.md | holds | Client Route or Redirect matches /quick-start. |
| test pin playwright/tests/discover-tabs.spec.ts (2026-10-10-ss2c-quickstart-banner) | docs/decisions/00996-2026-10-10-ss2c-quickstart-banner.md | holds | File is playwright/tests/discover-tabs.spec.ts. Ledger lint reports the guard wired. |
| file:line deprecated-route-redirects.spec.ts:188-214 | docs/decisions/00997-2026-10-10-ss2c-itinerary-redirect.md | holds | No code symbol was named beside the citation. Line playwright/tests/deprecated-route-redirects.spec.ts:188-214 reads: // SS-2 C (ledger `2026-10-10-ss2c-itinerary-redirect`, sanctioned): the legacy itinerary |
| route /itinerary/:id | docs/decisions/00997-2026-10-10-ss2c-itinerary-redirect.md | holds | Client Route or Redirect matches /itinerary/:p. |
| route /my-itinerary/:id | docs/decisions/00997-2026-10-10-ss2c-itinerary-redirect.md | holds | Client Route or Redirect matches /my-itinerary/:p. |
| route /trip/:id | docs/decisions/00997-2026-10-10-ss2c-itinerary-redirect.md | holds | Client Route or Redirect matches /trip/:p. |
| test pin playwright/tests/deprecated-route-redirects.spec.ts (2026-10-10-ss2c-itinerary-redirect) | docs/decisions/00997-2026-10-10-ss2c-itinerary-redirect.md | holds | File is playwright/tests/deprecated-route-redirects.spec.ts. Ledger lint reports the guard wired. |
| file:line deprecated-route-redirects.spec.ts:485 | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | No code symbol was named beside the citation. Line playwright/tests/deprecated-route-redirects.spec.ts:485 reads: |
| route /api/discover | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | Mounted (GET). |
| route /api/expert-requests | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | Mounted (GET/POST). |
| route /dashboard | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | Client Route or Redirect matches /dashboard. |
| route /itinerary-comparison/:id | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | Client Route or Redirect matches /itinerary-comparison/:p. |
| route /services | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | Client Route or Redirect matches /services. |
| test pin playwright/tests/admin-payout-trigger.spec.ts (2026-10-10-ss2d-pins) | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | File is playwright/tests/admin-payout-trigger.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/deprecated-route-redirects.spec.ts (2026-10-10-ss2d-pins) | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | File is playwright/tests/deprecated-route-redirects.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs.spec.ts (2026-10-10-ss2d-pins) | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | File is playwright/tests/discover-tabs.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-rail-actions.spec.ts (2026-10-10-ss2d-pins) | docs/decisions/00998-2026-10-10-ss2d-pins.md | holds | File is playwright/tests/slip-rail-actions.spec.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/rides | docs/decisions/00999-2026-10-11-tc3a-ride-item.md | holds | Mounted at server/routes/trips.routes.ts:3093. |
| test pin server/__tests__/mutation-auth/mutation-auth.http.test.ts (2026-10-11-tc3a-ride-item) | docs/decisions/00999-2026-10-11-tc3a-ride-item.md | holds | File is server/__tests__/mutation-auth/mutation-auth.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0-legs-baseline.db.test.ts (2026-10-11-tc3a-ride-item) | docs/decisions/00999-2026-10-11-tc3a-ride-item.md | holds | File is server/__tests__/p0-legs-baseline.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/plan-legs-engine.db.test.ts (2026-10-11-tc3a-ride-item) | docs/decisions/00999-2026-10-11-tc3a-ride-item.md | holds | File is server/__tests__/plan-legs-engine.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc3a-ride-item.db.test.ts (2026-10-11-tc3a-ride-item) | docs/decisions/00999-2026-10-11-tc3a-ride-item.md | holds | File is server/__tests__/tc3a-ride-item.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/01000-2026-10-11-tc3-ride-seed.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route GET /api/provider-services | docs/decisions/01000-2026-10-11-tc3-ride-seed.md | holds | Mounted at server/routes.ts:3177. |
| test pin server/__tests__/pool-listings-not-public.db.test.ts (2026-10-11-tc3-ride-seed) | docs/decisions/01000-2026-10-11-tc3-ride-seed.md | holds | File is server/__tests__/pool-listings-not-public.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc3-ride-seed.db.test.ts (2026-10-11-tc3-ride-seed) | docs/decisions/01000-2026-10-11-tc3-ride-seed.md | holds | File is server/__tests__/tc3-ride-seed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc3a-ride-item.db.test.ts (2026-10-11-tc3-ride-seed) | docs/decisions/01000-2026-10-11-tc3-ride-seed.md | holds | File is server/__tests__/tc3a-ride-item.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-liteapi-payment-method.cjs (2026-10-10-s1-d3a-liteapi-booking) | docs/decisions/01001-2026-10-10-s1-d3a-liteapi-booking.md | holds | File is scripts/check-liteapi-payment-method.cjs. Ledger lint reports the guard wired. |
| route /internal/jobs/liteapi-booking-sync | docs/decisions/01001-2026-10-10-s1-d3a-liteapi-booking.md | holds | Mounted (POST). |
| test pin server/__tests__/liteapi-booking.db.test.ts (2026-10-10-s1-d3a-liteapi-booking) | docs/decisions/01001-2026-10-10-s1-d3a-liteapi-booking.md | holds | File is server/__tests__/liteapi-booking.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/liteapi-booking.test.ts (2026-10-10-s1-d3a-liteapi-booking) | docs/decisions/01001-2026-10-10-s1-d3a-liteapi-booking.md | holds | File is shared/__tests__/liteapi-booking.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-11-ld64-d3a-wording-held) | docs/decisions/01002-2026-10-11-ld64-d3a-wording-held.md | holds | Row is marked advisory; it names no CI guard. |
| guard check-spec-arming (2026-10-11-spec-arming-verified) | docs/decisions/01003-2026-10-11-spec-arming-verified.md | holds | File is scripts/check-spec-arming.cjs. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/blog-event-guide.db.test.ts (2026-10-11-blog-draft-measurement-check) | docs/decisions/01004-2026-10-11-blog-draft-measurement-check.md | holds | File is server/services/__tests__/blog-event-guide.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/ride-suggestions/dismiss | docs/decisions/01005-2026-10-11-tc3b-ride-recommender.md | holds | Mounted at server/routes/trips.routes.ts:3137. |
| route PUT /api/trips/:tripId/profile-overlay | docs/decisions/01005-2026-10-11-tc3b-ride-recommender.md | holds | Mounted at server/routes/trips.routes.ts:3173. |
| test pin server/__tests__/tc3b-ride-recommender.db.test.ts (2026-10-11-tc3b-ride-recommender) | docs/decisions/01005-2026-10-11-tc3b-ride-recommender.md | holds | File is server/__tests__/tc3b-ride-recommender.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/ride-recommender.test.ts (2026-10-11-tc3b-ride-recommender) | docs/decisions/01005-2026-10-11-tc3b-ride-recommender.md | holds | File is shared/__tests__/ride-recommender.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/rides | docs/decisions/01006-2026-10-11-tc3c-better-way-line.md | holds | Mounted at server/routes/trips.routes.ts:3093. |
| test pin client/src/lib/__tests__/ride-suggestions.test.ts (2026-10-11-tc3c-better-way-line) | docs/decisions/01006-2026-10-11-tc3c-better-way-line.md | holds | File is client/src/lib/__tests__/ride-suggestions.test.ts. Ledger lint reports the guard wired. |
| route /plans/:tripId/stays/:itemId/booked | docs/decisions/01007-2026-10-11-s1-d3b-stay-book-ui.md | holds | Client Route or Redirect matches /plans/:p/stays/:p/booked. |
| test pin client/src/lib/__tests__/stay-booking.test.ts (2026-10-11-s1-d3b-stay-book-ui) | docs/decisions/01007-2026-10-11-s1-d3b-stay-book-ui.md | holds | File is client/src/lib/__tests__/stay-booking.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-booking.db.test.ts (2026-10-11-s1-d3b-stay-book-ui) | docs/decisions/01007-2026-10-11-s1-d3b-stay-book-ui.md | holds | File is server/__tests__/liteapi-booking.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/01008-2026-10-11-pf1-lookup-outcomes.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route GET /api/admin/content-sources/lookup-outcomes | docs/decisions/01008-2026-10-11-pf1-lookup-outcomes.md | holds | Mounted at server/routes/content-sources.routes.ts:59. |
| test pin server/__tests__/places-named-gate.db.test.ts (2026-10-11-pf1-lookup-outcomes) | docs/decisions/01008-2026-10-11-pf1-lookup-outcomes.md | holds | File is server/__tests__/places-named-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/place-lookup-outcomes.test.ts (2026-10-11-pf1-lookup-outcomes) | docs/decisions/01008-2026-10-11-pf1-lookup-outcomes.md | holds | File is shared/__tests__/place-lookup-outcomes.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | Mounted (GET). |
| test pin client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/p0-legs-slip.test.tsx (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is client/src/components/plancard/__tests__/p0-legs-slip.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/leg-recheck.db.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/__tests__/leg-recheck.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0-legs-baseline.db.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/__tests__/p0-legs-baseline.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-leg-gate.db.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/__tests__/ready-made-leg-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/transport-leg-authoring.db.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/__tests__/transport-leg-authoring.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/migration-state.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/services/__tests__/migration-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/transport-leg-calculator.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is server/services/__tests__/transport-leg-calculator.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/leg-resolution.test.ts (2026-10-11-p0b-routing-follow-ups) | docs/decisions/01009-2026-10-11-p0b-routing-follow-ups.md | holds | File is shared/__tests__/leg-resolution.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/trip-card-live-tier.test.tsx (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is client/src/components/plancard/__tests__/trip-card-live-tier.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-card-live-tier.test.ts (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is client/src/lib/__tests__/trip-card-live-tier.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-facts.db.test.ts (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is server/__tests__/content-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/live-directions.db.test.ts (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is server/__tests__/live-directions.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc3b-ride-recommender.db.test.ts (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is server/__tests__/tc3b-ride-recommender.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/live-directions.test.ts (2026-10-11-tc4-live-directions) | docs/decisions/01010-2026-10-11-tc4-live-directions.md | holds | File is shared/__tests__/live-directions.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/v1-versions-board.test.ts (2026-10-11-v1-version-sanity) | docs/decisions/01011-2026-10-11-v1-version-sanity.md | holds | File is client/src/lib/__tests__/v1-versions-board.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/v1-version-locate.db.test.ts (2026-10-11-v1-version-sanity) | docs/decisions/01011-2026-10-11-v1-version-sanity.md | holds | File is server/__tests__/v1-version-locate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/anchor-v1-activity-filter.test.ts (2026-10-11-v1-version-sanity) | docs/decisions/01011-2026-10-11-v1-version-sanity.md | holds | File is server/services/__tests__/anchor-v1-activity-filter.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-11-ss1-sheet-read-filled) | docs/decisions/01012-2026-10-11-ss1-sheet-read-filled.md | holds | Row states it has no CI guard: none — docs only. |
| guard check-decision-guards (2026-10-12-gw1-guard-tags) | docs/decisions/01013-2026-10-12-gw1-guard-tags.md | holds | File is scripts/check-decision-guards.cjs. Ledger lint reports the guard wired. |
| route POST /api/cart | docs/decisions/01013-2026-10-12-gw1-guard-tags.md | holds | Mounted at server/routes.ts:9893. |
| test pin shared/__tests__/cart-content-line.test.ts (2026-10-12-gw1-guard-tags) | docs/decisions/01013-2026-10-12-gw1-guard-tags.md | holds | File is shared/__tests__/cart-content-line.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/plancard | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | Mounted at server/routes/plancard.routes.ts:778. |
| route GET /api/trips/:tripId/recheck | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | Mounted at server/routes/plancard.routes.ts:644. |
| test pin client/src/components/plancard/__tests__/leg-rule.test.tsx (2026-10-12-p0c-hotfix) | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | File is client/src/components/plancard/__tests__/leg-rule.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/trip-card-start-time.test.tsx (2026-10-12-p0c-hotfix) | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | File is client/src/components/plancard/__tests__/trip-card-start-time.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/m374-echoed-leg-mode.db.test.ts (2026-10-12-p0c-hotfix) | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | File is server/__tests__/m374-echoed-leg-mode.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0c-card-snapshot-refresh.db.test.ts (2026-10-12-p0c-hotfix) | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | File is server/__tests__/p0c-card-snapshot-refresh.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0c-plancard-legs-skipped.db.test.ts (2026-10-12-p0c-hotfix) | docs/decisions/01014-2026-10-12-p0c-hotfix.md | holds | File is server/__tests__/p0c-plancard-legs-skipped.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/v1b-google-version-legs.db.test.ts (2026-10-12-v1b-google-version-legs) | docs/decisions/01015-2026-10-12-v1b-google-version-legs.md | holds | File is server/__tests__/v1b-google-version-legs.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/legacy-webhook-confirmation.db.test.ts (2026-10-08-legacy-webhook-confirmation-claim) | docs/decisions/01016-2026-10-08-legacy-webhook-confirmation-claim.md | holds | File is server/__tests__/legacy-webhook-confirmation.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/legacy-webhook-confirmation.db.test.ts (2026-10-12-legacy-confirmation-persistence) | docs/decisions/01017-2026-10-12-legacy-confirmation-persistence.md | holds | File is server/__tests__/legacy-webhook-confirmation.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/optimization-preview | docs/decisions/01018-2026-10-12-p0d-coverage-bridges.md | holds | Mounted at server/routes/optimization.routes.ts:181. |
| test pin client/src/components/plancard/__tests__/p0d-coverage-bridges.test.tsx (2026-10-12-p0d-coverage-bridges) | docs/decisions/01018-2026-10-12-p0d-coverage-bridges.md | holds | File is client/src/components/plancard/__tests__/p0d-coverage-bridges.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0d-leg-coverage.db.test.ts (2026-10-12-p0d-coverage-bridges) | docs/decisions/01018-2026-10-12-p0d-coverage-bridges.md | holds | File is server/__tests__/p0d-leg-coverage.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/p0d-leg-coverage.test.ts (2026-10-12-p0d-coverage-bridges) | docs/decisions/01018-2026-10-12-p0d-coverage-bridges.md | holds | File is shared/__tests__/p0d-leg-coverage.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/trips/:tripId/itinerary-items/:itemId | docs/decisions/01019-2026-10-12-st1-stop-time-edit.md | holds | Mounted at server/routes/trips.routes.ts:3190. |
| test pin client/src/components/plancard/__tests__/st1-stop-time-edit.test.tsx (2026-10-12-st1-stop-time-edit) | docs/decisions/01019-2026-10-12-st1-stop-time-edit.md | holds | File is client/src/components/plancard/__tests__/st1-stop-time-edit.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/st1-ride-flag.db.test.ts (2026-10-12-st1-stop-time-edit) | docs/decisions/01019-2026-10-12-st1-stop-time-edit.md | holds | File is server/__tests__/st1-ride-flag.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/st1-stop-time-edit.test.ts (2026-10-12-st1-stop-time-edit) | docs/decisions/01019-2026-10-12-st1-stop-time-edit.md | holds | File is shared/__tests__/st1-stop-time-edit.test.ts. Ledger lint reports the guard wired. |
| route GET /api/transport-booking-options/:optionId | docs/decisions/01020-2026-10-12-af1-transport-token-leak.md | holds | Mounted at server/routes/transport-hub.routes.ts:663. |
| route GET /api/transport-legs/:legId/options | docs/decisions/01020-2026-10-12-af1-transport-token-leak.md | holds | Mounted at server/routes/transport-hub.routes.ts:285. |
| test pin server/__tests__/af1-transport-token-leak.db.test.ts (2026-10-12-af1-transport-token-leak) | docs/decisions/01020-2026-10-12-af1-transport-token-leak.md | holds | File is server/__tests__/af1-transport-token-leak.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-booking.db.test.ts (2026-10-12-s1-d3c-prebook-ssp-floor) | docs/decisions/01021-2026-10-12-s1-d3c-prebook-ssp-floor.md | holds | File is server/__tests__/liteapi-booking.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/liteapi.test.ts (2026-10-12-s1-d3c-prebook-ssp-floor) | docs/decisions/01021-2026-10-12-s1-d3c-prebook-ssp-floor.md | holds | File is server/services/__tests__/liteapi.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/liteapi-booking.test.ts (2026-10-12-s1-d3c-prebook-ssp-floor) | docs/decisions/01021-2026-10-12-s1-d3c-prebook-ssp-floor.md | holds | File is shared/__tests__/liteapi-booking.test.ts. Ledger lint reports the guard wired. |
| route POST /api/content/affiliate-redirect | docs/decisions/01022-2026-10-12-af2-catalog-token-leak.md | holds | Mounted at server/routes/content.routes.ts:9260. |
| test pin server/__tests__/af2-catalog-token-leak.db.test.ts (2026-10-12-af2-catalog-token-leak) | docs/decisions/01022-2026-10-12-af2-catalog-token-leak.md | holds | File is server/__tests__/af2-catalog-token-leak.db.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-stay-book-sandbox.spec.ts (2026-10-11-s1-d3b-sandbox-e2e) | docs/decisions/01023-2026-10-11-s1-d3b-sandbox-e2e.md | holds | File is playwright/tests/journeys/j-stay-book-sandbox.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/slip-trip-card-link.spec.ts (2026-10-12-tc5a-trip-card-entry) | docs/decisions/01024-2026-10-12-tc5a-trip-card-entry.md | holds | File is playwright/tests/slip-trip-card-link.spec.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | Client Route or Redirect matches /admin/content-sources. |
| test pin client/src/components/plancard/__tests__/p0e-card-additions.test.tsx (2026-10-12-p0e-findings-and-gaps) | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | File is client/src/components/plancard/__tests__/p0e-card-additions.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/p0e-findings-gaps.test.tsx (2026-10-12-p0e-findings-and-gaps) | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | File is client/src/components/plancard/__tests__/p0e-findings-gaps.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/content-sources-refresh-fields.test.ts (2026-10-12-p0e-findings-and-gaps) | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | File is client/src/lib/__tests__/content-sources-refresh-fields.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/p0e-seasonal-hours.db.test.ts (2026-10-12-p0e-findings-and-gaps) | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | File is server/__tests__/p0e-seasonal-hours.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/p0e-findings-and-gaps.test.ts (2026-10-12-p0e-findings-and-gaps) | docs/decisions/01025-2026-10-12-p0e-findings-and-gaps.md | holds | File is shared/__tests__/p0e-findings-and-gaps.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/booking-path-placement.test.ts (2026-10-12-bp1-booking-path) | docs/decisions/01026-2026-10-12-bp1-booking-path.md | holds | File is client/src/lib/__tests__/booking-path-placement.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/bp1-booking-path.db.test.ts (2026-10-12-bp1-booking-path) | docs/decisions/01026-2026-10-12-bp1-booking-path.md | holds | File is server/__tests__/bp1-booking-path.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/booking-path.test.ts (2026-10-12-bp1-booking-path) | docs/decisions/01026-2026-10-12-bp1-booking-path.md | holds | File is shared/__tests__/booking-path.test.ts. Ledger lint reports the guard wired. |
| route PATCH /api/admin/fee-bands/:bandKey | docs/decisions/01027-2026-10-12-fe1-fee-integrity.md | holds | Mounted at server/routes/admin.routes.ts:8311. |
| test pin server/__tests__/fe1-fee-integrity.db.test.ts (2026-10-12-fe1-fee-integrity) | docs/decisions/01027-2026-10-12-fe1-fee-integrity.md | holds | File is server/__tests__/fe1-fee-integrity.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/01028-2026-10-12-ginkakuji-official-target.md | holds | Client Route or Redirect matches /admin/content-sources. |
| test pin server/__tests__/content-tiers.db.test.ts (2026-10-12-ginkakuji-official-target) | docs/decisions/01028-2026-10-12-ginkakuji-official-target.md | holds | File is server/__tests__/content-tiers.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-source-targets.test.ts (2026-10-12-ginkakuji-official-target) | docs/decisions/01028-2026-10-12-ginkakuji-official-target.md | holds | File is shared/__tests__/content-source-targets.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/tc2-affiliate-legs.db.test.ts (2026-10-12-tc2-affiliate-legs) | docs/decisions/01029-2026-10-12-tc2-affiliate-legs.md | holds | File is server/__tests__/tc2-affiliate-legs.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/tc2-transport-affiliate.test.ts (2026-10-12-tc2-affiliate-legs) | docs/decisions/01029-2026-10-12-tc2-affiliate-legs.md | holds | File is shared/__tests__/tc2-transport-affiliate.test.ts. Ledger lint reports the guard wired. |
| route /api/trips/:tripId/stops/:itemId/checks | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | Mounted (GET). |
| route GET /api/trips/:tripId/stops/:itemId/checks | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | Mounted at server/routes/plancard.routes.ts:624. |
| test pin client/src/components/__tests__/ap1-lookup-outcome-reasons.test.tsx (2026-10-13-ap1-save-then-warn) | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | File is client/src/components/__tests__/ap1-lookup-outcome-reasons.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/ap1-add-checks.test.tsx (2026-10-13-ap1-save-then-warn) | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | File is client/src/components/plancard/__tests__/ap1-add-checks.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/ap1-save-then-warn.db.test.ts (2026-10-13-ap1-save-then-warn) | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | File is server/__tests__/ap1-save-then-warn.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/ap1-add-checks.test.ts (2026-10-13-ap1-save-then-warn) | docs/decisions/01030-2026-10-13-ap1-save-then-warn.md | holds | File is shared/__tests__/ap1-add-checks.test.ts. Ledger lint reports the guard wired. |
| guard assign-r-numbers (2026-10-12-ci1-post-merge-stamp) | docs/decisions/01031-2026-10-12-ci1-post-merge-stamp.md | holds | File is scripts/assign-r-numbers.cjs. Ledger lint reports the guard wired. |
| guard none (2026-10-13-ci1-followups) | docs/decisions/01032-2026-10-13-ci1-followups.md | holds | Row states it has no CI guard: none — workflow configuration only. |
| guard none (2026-10-14-ci1-key-normalize) | docs/decisions/01033-2026-10-14-ci1-key-normalize.md | holds | Row states it has no CI guard: none — workflow configuration only. |
| guard none (2026-10-14-ci1-ruleset-split) | docs/decisions/01034-2026-10-14-ci1-ruleset-split.md | holds | Row states it has no CI guard: none — workflow configuration only. |
| route /api/experts/:id | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Mounted (GET). |
| route /provider/services/:id | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Client Route or Redirect matches /provider/services/:p. |
| route /provider/services/:id/edit | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Client Route or Redirect matches /provider/services/:p/edit. |
| route GET /api/expert/profile | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Mounted at server/routes.ts:5813. |
| route PATCH /api/expert/profile | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Mounted at server/routes.ts:5845. |
| route POST /api/admin/expert-applications/:id/rescore | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Mounted at server/routes/admin.routes.ts:3308. |
| route POST /api/me/services/:serviceId/slots | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | Mounted at server/routes/expert-console.routes.ts:255. |
| test pin ex1-expert-console.http.test.ts (2026-10-15-ex1-expert-console) | docs/decisions/01035-2026-10-15-ex1-expert-console.md | holds | File is server/__tests__/ex1-expert-console.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-booking.db.test.ts (2026-10-15-liteapi-cancel-needs-review) | docs/decisions/01036-2026-10-15-liteapi-cancel-needs-review.md | holds | File is server/__tests__/liteapi-booking.db.test.ts. Ledger lint reports the guard wired. |
| route /api/experts | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted (GET). |
| route /api/experts/:id | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted (GET). |
| route /api/experts/:id/services | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted (GET). |
| route /api/provider-services | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted (GET). |
| route /api/services | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted (GET). |
| route GET /api/services/:id | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | Mounted at server/routes/content.routes.ts:2451. |
| test pin cp1-public-payloads.http.test.ts (2026-10-15-cp1-public-payloads) | docs/decisions/01037-2026-10-15-cp1-public-payloads.md | holds | File is server/__tests__/cp1-public-payloads.http.test.ts. Ledger lint reports the guard wired. |
| route /api/ready-made/preview/:slug | docs/decisions/01038-2026-10-15-cp1-teasers.md | holds | Mounted (GET). |
| route /api/share-image/service/:id.png | docs/decisions/01038-2026-10-15-cp1-teasers.md | holds | Mounted (GET). |
| test pin cp1-teasers.http.test.ts (2026-10-15-cp1-teasers) | docs/decisions/01038-2026-10-15-cp1-teasers.md | holds | File is server/__tests__/cp1-teasers.http.test.ts. Ledger lint reports the guard wired. |
| test pin share-image-bundle.http.test.ts (2026-10-15-cp1-share-image-bundle) | docs/decisions/01039-2026-10-15-cp1-share-image-bundle.md | holds | File is server/__tests__/share-image-bundle.http.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-migration-indexes-declared.cjs (2026-10-15-liteapi-review-holds-item) | docs/decisions/01040-2026-10-15-liteapi-review-holds-item.md | holds | File is scripts/check-migration-indexes-declared.cjs. Ledger lint reports the guard wired. |
| test pin shared/__tests__/liteapi-booking.test.ts (2026-10-15-cancel-refused-logged) | docs/decisions/01041-2026-10-15-cancel-refused-logged.md | holds | File is shared/__tests__/liteapi-booking.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/liteapi-booking.db.test.ts (2026-10-15-liteapi-cancel-with-charges) | docs/decisions/01042-2026-10-15-liteapi-cancel-with-charges.md | holds | File is server/__tests__/liteapi-booking.db.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-15-ci1-stamp-push-identity) | docs/decisions/01043-2026-10-15-ci1-stamp-push-identity.md | holds | Row states it has no CI guard: none — workflow configuration only. |
| guard none (2026-10-15-ledger-merge-rule) | docs/decisions/01044-2026-10-15-ledger-merge-rule.md | holds | Row states it has no CI guard: none — a working rule for people and sessions. |
| route /admin/bot-accounts | docs/decisions/01045-2026-10-15-bot1-phase1.md | holds | Client Route or Redirect matches /admin/bot-accounts. |
| route /admin/bot-proposals | docs/decisions/01045-2026-10-15-bot1-phase1.md | holds | Client Route or Redirect matches /admin/bot-proposals. |
| route /api/admin | docs/decisions/01045-2026-10-15-bot1-phase1.md | holds | Routes are still mounted under this prefix (for example POST /api/admin/affiliate/partners). |
| test pin server/__tests__/bot-proposals.db.test.ts (2026-10-15-bot1-phase1) | docs/decisions/01045-2026-10-15-bot1-phase1.md | holds | File is server/__tests__/bot-proposals.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/oauth-email-merge.test.ts (2026-10-15-lw1-0-oauth-email-merge) | docs/decisions/01046-2026-10-15-lw1-0-oauth-email-merge.md | holds | File is server/__tests__/oauth-email-merge.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-15-sandbox-rates-unavailable-skip) | docs/decisions/01047-2026-10-15-sandbox-rates-unavailable-skip.md | holds | Row states it has no CI guard: none — e2e spec and workflow only. |
| guard scripts/check-migration-indexes-declared.cjs (2026-10-15-lw1a-launch-waitlist) | docs/decisions/01048-2026-10-15-lw1a-launch-waitlist.md | holds | File is scripts/check-migration-indexes-declared.cjs. Ledger lint reports the guard wired. |
| route /admin/waitlist | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Client Route or Redirect matches /admin/waitlist. |
| route /api/admin | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Routes are still mounted under this prefix (for example POST /api/admin/affiliate/partners). |
| route GET /api/admin/waitlist | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:141. |
| route GET /api/admin/waitlist/export | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:149. |
| route GET /api/public/signup-mode | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Mounted at server/routes/launch-public.routes.ts:10. |
| route POST /api/waitlist | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:53. |
| test pin server/__tests__/launch-waitlist.http.test.ts (2026-10-16-lw1c-kyoto-waitlist) | docs/decisions/01049-2026-10-16-lw1c-kyoto-waitlist.md | holds | File is server/__tests__/launch-waitlist.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/bot-proposals.db.test.ts (2026-10-15-bot-proposal-fact-fk) | docs/decisions/01050-2026-10-15-bot-proposal-fact-fk.md | holds | File is server/__tests__/bot-proposals.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/system | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Client Route or Redirect matches /admin/system. |
| route /become-expert | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Client Route or Redirect matches /become-expert. |
| route /become-provider | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Client Route or Redirect matches /become-provider. |
| route /signup | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Client Route or Redirect matches /signup. |
| route GET /api/public/signup-mode | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Mounted at server/routes/launch-public.routes.ts:10. |
| route PATCH /api/admin/platform-settings/:settingKey | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Mounted at server/routes/admin.routes.ts:8710. |
| route POST /api/auth/login | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:281. |
| route POST /api/auth/register | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| route POST /api/ready-made/:id/purchase | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | Mounted at server/routes/ready-made.routes.ts:1386. |
| test pin server/__tests__/traveler-signup-switch.test.ts (2026-10-15-lw1b-traveler-signup-switch) | docs/decisions/01051-2026-10-15-lw1b-traveler-signup-switch.md | holds | File is server/__tests__/traveler-signup-switch.test.ts. Ledger lint reports the guard wired. |
| route /become-provider | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Client Route or Redirect matches /become-provider. |
| route /discover | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Client Route or Redirect matches /discover. |
| route /earn | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Client Route or Redirect matches /earn. |
| route /experts | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Client Route or Redirect matches /experts. |
| route /ready-made | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Client Route or Redirect matches /ready-made. |
| route GET /api/fee-policies/keep-rates | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | Mounted at server/routes/payments.routes.ts:3155. |
| test pin client/src/lib/__tests__/fee-keep-copy.test.ts (2026-10-16-cp2-public-copy) | docs/decisions/01052-2026-10-16-cp2-public-copy.md | holds | File is client/src/lib/__tests__/fee-keep-copy.test.ts. Ledger lint reports the guard wired. |
| route /ready-made/:id | docs/decisions/01053-2026-10-16-lw1d-source-and-referral.md | holds | Client Route or Redirect matches /ready-made/:p. |
| route GET /api/admin/users/export | docs/decisions/01053-2026-10-16-lw1d-source-and-referral.md | holds | Mounted at server/routes/admin.routes.ts:6542. |
| route GET /api/public/signup-mode | docs/decisions/01053-2026-10-16-lw1d-source-and-referral.md | holds | Mounted at server/routes/launch-public.routes.ts:10. |
| route POST /api/waitlist | docs/decisions/01053-2026-10-16-lw1d-source-and-referral.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:53. |
| test pin server/__tests__/waitlist-referral.db.test.ts (2026-10-16-lw1d-source-and-referral) | docs/decisions/01053-2026-10-16-lw1d-source-and-referral.md | holds | File is server/__tests__/waitlist-referral.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/bookings/:kind/:id | docs/decisions/01054-2026-10-15-pay1-payment-checks.md | holds | Client Route or Redirect matches /admin/bookings/:p/:p. |
| route GET /api/admin/bookings/:kind | docs/decisions/01054-2026-10-15-pay1-payment-checks.md | holds | Routes are still mounted under this prefix (for example GET /api/admin/bookings/:bookingId/exception-refund). |
| test pin server/__tests__/pay1-payment-checks.db.test.ts (2026-10-15-pay1-payment-checks) | docs/decisions/01054-2026-10-15-pay1-payment-checks.md | holds | File is server/__tests__/pay1-payment-checks.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/transport-payment-intent.db.test.ts (2026-10-16-pay1b-option-booking-id) | docs/decisions/01055-2026-10-16-pay1b-option-booking-id.md | holds | File is server/__tests__/transport-payment-intent.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/auth-three-defects.db.test.ts (2026-10-16-auth1-verify-before-welcome-reset-revoke) | docs/decisions/01056-2026-10-16-auth1-verify-before-welcome-reset-revoke.md | holds | File is server/__tests__/auth-three-defects.db.test.ts. Ledger lint reports the guard wired. |
| route /api/auth/user | docs/decisions/01057-2026-10-16-auth1-3a-register-and-sign-in.md | holds | Mounted (GET). |
| route POST /api/auth/login | docs/decisions/01057-2026-10-16-auth1-3a-register-and-sign-in.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:281. |
| route POST /api/auth/register | docs/decisions/01057-2026-10-16-auth1-3a-register-and-sign-in.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| test pin server/__tests__/payout-parity-route.http.test.ts (2026-10-16-auth1-3a-register-and-sign-in) | docs/decisions/01057-2026-10-16-auth1-3a-register-and-sign-in.md | holds | File is server/__tests__/payout-parity-route.http.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-16-liteapi-cancel-margin-refund) | docs/decisions/01058-2026-10-16-liteapi-cancel-margin-refund.md | holds | Row is marked advisory; it names no CI guard. |
| route /admin/bookings | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | holds | Client Route or Redirect matches /admin/bookings. |
| route /admin/bookings/:kind/:id | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | holds | Client Route or Redirect matches /admin/bookings/:p/:p. |
| route /admin/bookings/service/no-such-booking | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | gone | No client Route or Redirect matches /admin/bookings/service/no-such-booking. |
| route GET /api/admin/bookings | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | holds | Mounted at server/routes/admin.routes.ts:454. |
| test pin server/__tests__/admin-bookings-list.db.test.ts (2026-10-16-pay1c-admin-bookings-list) | docs/decisions/01059-2026-10-16-pay1c-admin-bookings-list.md | holds | File is server/__tests__/admin-bookings-list.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-16-cp4-privacy-claims-removed) | docs/decisions/01060-2026-10-16-cp4-privacy-claims-removed.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/auth/login | docs/decisions/01061-2026-10-16-auth1-3b-neutral-registration.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:281. |
| route POST /api/auth/register | docs/decisions/01061-2026-10-16-auth1-3b-neutral-registration.md | holds | Mounted at server/replit_integrations/auth/emailAuth.ts:125. |
| test pin server/__tests__/auth-three-defects.db.test.ts (2026-10-16-auth1-3b-neutral-registration) | docs/decisions/01061-2026-10-16-auth1-3b-neutral-registration.md | holds | File is server/__tests__/auth-three-defects.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/expert/rate | docs/decisions/01062-2026-10-16-fe2-beta-cohort.md | holds | Mounted at server/routes/experts.routes.ts:242. |
| route PATCH /api/admin/fee-bands/:bandKey | docs/decisions/01062-2026-10-16-fe2-beta-cohort.md | holds | Mounted at server/routes/admin.routes.ts:8311. |
| test pin server/__tests__/fe2-beta-cohort.db.test.ts (2026-10-16-fe2-beta-cohort) | docs/decisions/01062-2026-10-16-fe2-beta-cohort.md | holds | File is server/__tests__/fe2-beta-cohort.db.test.ts. Ledger lint reports the guard wired. |
| route DELETE /api/admin/waitlist/:id | docs/decisions/01063-2026-10-16-lw1e-waitlist-admin.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:189. |
| route GET /api/admin/waitlist/search | docs/decisions/01063-2026-10-16-lw1e-waitlist-admin.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:178. |
| test pin server/__tests__/launch-waitlist.http.test.ts (2026-10-16-lw1e-waitlist-admin) | docs/decisions/01063-2026-10-16-lw1e-waitlist-admin.md | holds | File is server/__tests__/launch-waitlist.http.test.ts. Ledger lint reports the guard wired. |
| route /api/public/signup-mode | docs/decisions/01064-2026-10-16-lw1f-kyoto-ticker.md | holds | Mounted (GET). |
| route GET /api/public/ticker | docs/decisions/01064-2026-10-16-lw1f-kyoto-ticker.md | holds | Mounted at server/routes/ticker.routes.ts:36. |
| test pin server/__tests__/ticker.db.test.ts (2026-10-16-lw1f-kyoto-ticker) | docs/decisions/01064-2026-10-16-lw1f-kyoto-ticker.md | holds | File is server/__tests__/ticker.db.test.ts. Ledger lint reports the guard wired. |
| route /api/ready-made | docs/decisions/01065-2026-10-16-lw1g-earn-calculator.md | holds | Mounted (GET). |
| route /earn | docs/decisions/01065-2026-10-16-lw1g-earn-calculator.md | holds | Client Route or Redirect matches /earn. |
| route GET /api/fee-policies/keep-rates | docs/decisions/01065-2026-10-16-lw1g-earn-calculator.md | holds | Mounted at server/routes/payments.routes.ts:3155. |
| test pin server/__tests__/earn-keep-rates.db.test.ts (2026-10-16-lw1g-earn-calculator) | docs/decisions/01065-2026-10-16-lw1g-earn-calculator.md | holds | File is server/__tests__/earn-keep-rates.db.test.ts. Ledger lint reports the guard wired. |
| route POST /internal/jobs/waitlist-retention | docs/decisions/01066-2026-10-16-lw1h-waitlist-retention.md | holds | Mounted at server/routes/internal.routes.ts:471. |
| test pin server/__tests__/waitlist-retention.db.test.ts (2026-10-16-lw1h-waitlist-retention) | docs/decisions/01066-2026-10-16-lw1h-waitlist-retention.md | holds | File is server/__tests__/waitlist-retention.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/waitlist | docs/decisions/01067-2026-10-16-lw2-all-markets-waitlist.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:53. |
| test pin server/__tests__/launch-waitlist.http.test.ts (2026-10-16-lw2-all-markets-waitlist) | docs/decisions/01067-2026-10-16-lw2-all-markets-waitlist.md | holds | File is server/__tests__/launch-waitlist.http.test.ts. Ledger lint reports the guard wired. |
| route /admin/blog | docs/decisions/01068-2026-10-16-ed1a-editorial-guides.md | holds | Client Route or Redirect matches /admin/blog. |
| test pin server/__tests__/blog-lifecycle.db.test.ts (2026-10-16-ed1a-editorial-guides) | docs/decisions/01068-2026-10-16-ed1a-editorial-guides.md | holds | File is server/__tests__/blog-lifecycle.db.test.ts. Ledger lint reports the guard wired. |
| route /blog | docs/decisions/01069-2026-10-16-blog-footer-count.md | holds | Client Route or Redirect matches /blog. |
| route GET /api/blog/footer-visible | docs/decisions/01069-2026-10-16-blog-footer-count.md | holds | Mounted at server/routes/blog.routes.ts:208. |
| test pin server/__tests__/blog-footer-count.db.test.ts (2026-10-16-blog-footer-count) | docs/decisions/01069-2026-10-16-blog-footer-count.md | holds | File is server/__tests__/blog-footer-count.db.test.ts. Ledger lint reports the guard wired. |
| route /api/public/signup-mode | docs/decisions/01070-2026-10-16-lw1f-b-beta-cities.md | holds | Mounted (GET). |
| route GET /api/public/ticker | docs/decisions/01070-2026-10-16-lw1f-b-beta-cities.md | holds | Mounted at server/routes/ticker.routes.ts:36. |
| test pin client/src/lib/__tests__/ticker-rules.test.ts (2026-10-16-lw1f-b-beta-cities) | docs/decisions/01070-2026-10-16-lw1f-b-beta-cities.md | holds | File is client/src/lib/__tests__/ticker-rules.test.ts. Ledger lint reports the guard wired. |
| route GET /api/share-image/ready-made/:id.png | docs/decisions/01071-2026-10-16-cp3-share-image-ref.md | holds | Mounted at server/routes/share-images.routes.ts:107. |
| route POST /api/short-links | docs/decisions/01071-2026-10-16-cp3-share-image-ref.md | holds | Mounted at server/routes/short-links.routes.ts:85. |
| test pin server/__tests__/cp3-share-image-ref.db.test.ts (2026-10-16-cp3-share-image-ref) | docs/decisions/01071-2026-10-16-cp3-share-image-ref.md | holds | File is server/__tests__/cp3-share-image-ref.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/blog-lifecycle.db.test.ts (2026-10-16-ed1b-editorial-house-account) | docs/decisions/01072-2026-10-16-ed1b-editorial-house-account.md | holds | File is server/__tests__/blog-lifecycle.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/osrm-routing-adapter.test.ts (2026-10-16-9b-a-osrm-adapter) | docs/decisions/01073-2026-10-16-9b-a-osrm-adapter.md | holds | File is server/__tests__/osrm-routing-adapter.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/recheck | docs/decisions/01074-2026-10-16-9b-b-legs-off-google.md | holds | Mounted at server/routes/plancard.routes.ts:644. |
| route POST /api/itinerary-variants/:variantId/calculate-transport | docs/decisions/01074-2026-10-16-9b-b-legs-off-google.md | holds | Mounted at server/routes/trips.routes.ts:2620. |
| test pin server/__tests__/google-legs-rebuild.db.test.ts (2026-10-16-9b-b-legs-off-google) | docs/decisions/01074-2026-10-16-9b-b-legs-off-google.md | holds | File is server/__tests__/google-legs-rebuild.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/leave-by-drive-leg.test.tsx (2026-10-17-9b-c-leave-by) | docs/decisions/01075-2026-10-17-9b-c-leave-by.md | holds | File is client/src/components/plancard/__tests__/leave-by-drive-leg.test.tsx. Ledger lint reports the guard wired. |
| test pin shared/__tests__/leave-by.test.ts (2026-10-17-9b-c-leave-by) | docs/decisions/01075-2026-10-17-9b-c-leave-by.md | holds | File is shared/__tests__/leave-by.test.ts. Ledger lint reports the guard wired. |
| route /internal/jobs/legs-dayof-recheck | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | gone | No mounted handler matches /internal/jobs/legs-dayof-recheck. |
| route /internal/jobs/routing-recheck | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | holds | Mounted (POST). |
| route GET /api/trips/:tripId/recheck | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | holds | Mounted at server/routes/plancard.routes.ts:644. |
| test pin client/src/lib/__tests__/slip-legs-estimate.test.ts (2026-10-17-9b-d-routing-recheck) | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | holds | File is client/src/lib/__tests__/slip-legs-estimate.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/routing-recheck.test.ts (2026-10-17-9b-d-routing-recheck) | docs/decisions/01076-2026-10-17-9b-d-routing-recheck.md | holds | File is server/__tests__/routing-recheck.test.ts. Ledger lint reports the guard wired. |
| route /api/push/config | docs/decisions/01077-2026-10-17-phone-delivery-calendar.md | holds | Mounted (GET). |
| test pin server/__tests__/phone-delivery.db.test.ts (2026-10-17-phone-delivery-calendar) | docs/decisions/01077-2026-10-17-phone-delivery-calendar.md | holds | File is server/__tests__/phone-delivery.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/ci/ci-skip-rules.cjs (2026-10-17-ci1b-non-required-off-main-push) | docs/decisions/01078-2026-10-17-ci1b-non-required-off-main-push.md | holds | File is scripts/ci/ci-skip-rules.cjs. Ledger lint reports the guard wired. |
| route /api/geocode | docs/decisions/01079-2026-10-17-gc1-google-coords.md | holds | Mounted (GET/POST). |
| test pin server/__tests__/gc1-google-coords.db.test.ts (2026-10-17-gc1-google-coords) | docs/decisions/01079-2026-10-17-gc1-google-coords.md | holds | File is server/__tests__/gc1-google-coords.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/osrm-routing-adapter.test.ts (2026-10-17-9b-a-osrm-extract-checked) | docs/decisions/01080-2026-10-17-9b-a-osrm-extract-checked.md | holds | File is server/__tests__/osrm-routing-adapter.test.ts. Ledger lint reports the guard wired. |
| route /trip | docs/decisions/01081-2026-10-17-9a-ii-osrm-vm.md | gone | No client Route or Redirect matches /trip. |
| test pin infra/osrm/proxy.test.mjs (2026-10-17-9a-ii-osrm-vm) | docs/decisions/01081-2026-10-17-9a-ii-osrm-vm.md | holds | File is infra/osrm/proxy.test.mjs. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/01082-2026-10-17-9b-e-regeocode-dry-run.md | holds | Mounted (GET). |
| test pin server/services/__tests__/item-osm-regeocode.test.ts (2026-10-17-9b-e-regeocode-dry-run) | docs/decisions/01082-2026-10-17-9b-e-regeocode-dry-run.md | holds | File is server/services/__tests__/item-osm-regeocode.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/gh1-no-google-hours.db.test.ts (2026-10-17-gh1-no-google-hours) | docs/decisions/01083-2026-10-17-gh1-no-google-hours.md | holds | File is server/__tests__/gh1-no-google-hours.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/maps-browser-key.test.ts (2026-10-17-maps-browser-key-one-name) | docs/decisions/01084-2026-10-17-maps-browser-key-one-name.md | holds | File is client/src/lib/__tests__/maps-browser-key.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/item-osm-regeocode.test.ts (2026-10-17-9b-e-regeocode-v2) | docs/decisions/01085-2026-10-17-9b-e-regeocode-v2.md | holds | File is server/services/__tests__/item-osm-regeocode.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ai/generate-optimized-itineraries | docs/decisions/01086-2026-10-17-fb1-optimized-itineraries-off.md | holds | Mounted at server/routes/content.routes.ts:5241. |
| test pin server/__tests__/fb1-optimized-itineraries-off.test.ts (2026-10-17-fb1-optimized-itineraries-off) | docs/decisions/01086-2026-10-17-fb1-optimized-itineraries-off.md | holds | File is server/__tests__/fb1-optimized-itineraries-off.test.ts. Ledger lint reports the guard wired. |
| route GET /api/itinerary-share/:token | docs/decisions/01087-2026-10-17-lg1-leg-options-provenance.md | holds | Mounted at server/routes/trips.routes.ts:2000. |
| route GET /api/trips/:id/legs/:legId/options | docs/decisions/01087-2026-10-17-lg1-leg-options-provenance.md | holds | Mounted at server/routes/transport-legs.routes.ts:391. |
| route POST /api/trips/:tripId/transport-legs/:legId/options | docs/decisions/01087-2026-10-17-lg1-leg-options-provenance.md | holds | Mounted at server/routes/transport-legs.routes.ts:384. |
| test pin server/__tests__/lg1-leg-options-provenance.db.test.ts (2026-10-17-lg1-leg-options-provenance) | docs/decisions/01087-2026-10-17-lg1-leg-options-provenance.md | holds | File is server/__tests__/lg1-leg-options-provenance.db.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-17-distribute-route-frame-copy) | docs/decisions/01088-2026-10-17-distribute-route-frame-copy.md | holds | Row states it has no CI guard: none — one sentence of copy; FOUNDER WORDING REVIEW on the PR. |
| test pin shared/__tests__/lg1-checked-day.test.ts (2026-10-17-lg1-checked-day-plan-tz) | docs/decisions/01089-2026-10-17-lg1-checked-day-plan-tz.md | holds | File is shared/__tests__/lg1-checked-day.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/neighborhood-centroid-osm.test.ts (2026-10-17-lg1-neighborhood-centroids-dry-run) | docs/decisions/01090-2026-10-17-lg1-neighborhood-centroids-dry-run.md | holds | File is server/services/__tests__/neighborhood-centroid-osm.test.ts. Ledger lint reports the guard wired. |
| route PUT /api/admin/place-coords/:placeId | docs/decisions/01091-2026-10-17-lg1-osm-place-coords.md | holds | Mounted at server/routes/admin-place-coords.routes.ts:30. |
| test pin server/__tests__/lg1-open-coords-engine.db.test.ts (2026-10-17-lg1-osm-place-coords) | docs/decisions/01091-2026-10-17-lg1-osm-place-coords.md | holds | File is server/__tests__/lg1-open-coords-engine.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/open-place-coords.test.ts (2026-10-17-lg1-osm-place-coords) | docs/decisions/01091-2026-10-17-lg1-osm-place-coords.md | holds | File is server/__tests__/open-place-coords.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/osrm-routing-adapter.test.ts (2026-10-17-lg1-osm-place-coords) | docs/decisions/01091-2026-10-17-lg1-osm-place-coords.md | holds | File is server/__tests__/osrm-routing-adapter.test.ts. Ledger lint reports the guard wired. |
| route /api/content/discover | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | Mounted (GET). |
| route /api/health | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | Mounted (GET). |
| route POST /api/content/affiliate-redirect | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | Mounted at server/routes/content.routes.ts:9260. |
| test pin client/src/lib/__tests__/step8b2-map-layout.test.ts (2026-10-18-px1-partner-links) | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | File is client/src/lib/__tests__/step8b2-map-layout.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/px1-partner-link-secrets.db.test.ts (2026-10-18-px1-partner-links) | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | File is server/__tests__/px1-partner-link-secrets.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/runtime-flags.test.ts (2026-10-18-px1-partner-links) | docs/decisions/01092-2026-10-18-px1-partner-links.md | holds | File is server/services/__tests__/runtime-flags.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/day-ics-untimed.test.ts (2026-10-18-ics-untimed-all-day) | docs/decisions/01093-2026-10-18-ics-untimed-all-day.md | holds | File is client/src/components/plancard/__tests__/day-ics-untimed.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/slip-header-meta.test.tsx (2026-10-18-b5-test-fixed-zone) | docs/decisions/01094-2026-10-18-b5-test-fixed-zone.md | holds | File is client/src/components/plancard/__tests__/slip-header-meta.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/px1b-partner-token-redaction.db.test.ts (2026-10-18-partner-token-redaction) | docs/decisions/01095-2026-10-18-partner-token-redaction.md | holds | File is server/__tests__/px1b-partner-token-redaction.db.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-18-google-hours-spec-strikes) | docs/decisions/01096-2026-10-18-google-hours-spec-strikes.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/trips/:tripId/slip-events | docs/decisions/01097-2026-10-18-teaser-copy-events.md | holds | Mounted at server/routes/plan-option-sets.routes.ts:277. |
| test pin server/__tests__/slip-teaser-events.db.test.ts (2026-10-18-teaser-copy-events) | docs/decisions/01097-2026-10-18-teaser-copy-events.md | holds | File is server/__tests__/slip-teaser-events.db.test.ts. Ledger lint reports the guard wired. |
| route /api/catalog/viator-feed | docs/decisions/01098-2026-10-18-viator-direct-live.md | holds | Mounted (GET). |
| route /api/health | docs/decisions/01098-2026-10-18-viator-direct-live.md | holds | Mounted (GET). |
| route GET /api/viator/live/products | docs/decisions/01098-2026-10-18-viator-direct-live.md | holds | Mounted at server/routes/content.routes.ts:1603. |
| route POST /api/viator/live/click | docs/decisions/01098-2026-10-18-viator-direct-live.md | holds | Mounted at server/routes/content.routes.ts:1619. |
| test pin server/__tests__/vd1-viator-live.db.test.ts (2026-10-18-viator-direct-live) | docs/decisions/01098-2026-10-18-viator-direct-live.md | holds | File is server/__tests__/vd1-viator-live.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/optimization-preview | docs/decisions/01099-2026-10-17-fb1-checker-open-coords.md | holds | Mounted at server/routes/optimization.routes.ts:181. |
| test pin server/__tests__/fb1-checker-open-coords.db.test.ts (2026-10-17-fb1-checker-open-coords) | docs/decisions/01099-2026-10-17-fb1-checker-open-coords.md | holds | File is server/__tests__/fb1-checker-open-coords.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-checker-open-coords.test.ts (2026-10-17-fb1-checker-open-coords) | docs/decisions/01099-2026-10-17-fb1-checker-open-coords.md | holds | File is server/__tests__/fb1-checker-open-coords.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/lb8-lb9-card-wiring.test.tsx (2026-10-18-lb8-lb9-card-wiring) | docs/decisions/01100-2026-10-18-lb8-lb9-card-wiring.md | holds | File is client/src/components/plancard/__tests__/lb8-lb9-card-wiring.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/lb8-card-anchor-stops.db.test.ts (2026-10-18-lb8-lb9-card-wiring) | docs/decisions/01100-2026-10-18-lb8-lb9-card-wiring.md | holds | File is server/__tests__/lb8-card-anchor-stops.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-plan-check-parity.db.test.ts (2026-10-18-fb1-pure-checker) | docs/decisions/01101-2026-10-18-fb1-pure-checker.md | holds | File is server/__tests__/fb1-plan-check-parity.db.test.ts. Ledger lint reports the guard wired. |
| route /itinerary/schedules | docs/decisions/01102-2026-10-18-google-writers-open-coords.md | holds | Client Route or Redirect matches /itinerary/:p. |
| test pin server/__tests__/google-legs-rebuild.db.test.ts (2026-10-18-google-writers-open-coords) | docs/decisions/01102-2026-10-18-google-writers-open-coords.md | holds | File is server/__tests__/google-legs-rebuild.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/google-writers-open-coords.db.test.ts (2026-10-18-google-writers-open-coords) | docs/decisions/01102-2026-10-18-google-writers-open-coords.md | holds | File is server/__tests__/google-writers-open-coords.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-pick.db.test.ts (2026-10-18-google-writers-open-coords) | docs/decisions/01102-2026-10-18-google-writers-open-coords.md | holds | File is server/__tests__/stay-pick.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/itinerary-items | docs/decisions/01103-2026-10-18-viator-add-to-plan.md | holds | Mounted at server/routes.ts:13414. |
| test pin server/__tests__/vd1b-viator-add-to-plan.db.test.ts (2026-10-18-viator-add-to-plan) | docs/decisions/01103-2026-10-18-viator-add-to-plan.md | holds | File is server/__tests__/vd1b-viator-add-to-plan.db.test.ts. Ledger lint reports the guard wired. |
| guard .github/workflows/viator-sandbox-contract.yml (2026-10-18-viator-contract-nightly) | docs/decisions/01104-2026-10-18-viator-contract-nightly.md | holds | File is .github/workflows/viator-sandbox-contract.yml. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg1-open-coords-rekey.db.test.ts (2026-10-18-lg1-open-coords-rekey) | docs/decisions/01105-2026-10-18-lg1-open-coords-rekey.md | holds | File is server/__tests__/lg1-open-coords-rekey.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg1-wikidata-lookup.test.ts (2026-10-18-lg1-wikidata-readonly) | docs/decisions/01106-2026-10-18-lg1-wikidata-readonly.md | holds | File is server/__tests__/lg1-wikidata-lookup.test.ts. Ledger lint reports the guard wired. |
| route /api/affiliate/products | docs/decisions/01107-2026-10-18-public-partner-price-strip.md | holds | Mounted (GET). |
| route /api/affiliate/products/:id | docs/decisions/01107-2026-10-18-public-partner-price-strip.md | holds | Mounted (GET). |
| route /api/affiliate/products/by-location | docs/decisions/01107-2026-10-18-public-partner-price-strip.md | holds | Live path is GET /api/affiliate/products/:id at server/routes/content.routes.ts:8998. |
| route GET /api/affiliate/products | docs/decisions/01107-2026-10-18-public-partner-price-strip.md | holds | Mounted at server/routes/content.routes.ts:8965. |
| test pin server/__tests__/px2-public-partner-price.db.test.ts (2026-10-18-public-partner-price-strip) | docs/decisions/01107-2026-10-18-public-partner-price-strip.md | holds | File is server/__tests__/px2-public-partner-price.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-version-gate.db.test.ts (2026-10-18-fb1-version-gate) | docs/decisions/01108-2026-10-18-fb1-version-gate.md | holds | File is server/__tests__/fb1-version-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-version-check.test.ts (2026-10-18-fb1-version-gate) | docs/decisions/01108-2026-10-18-fb1-version-gate.md | holds | File is shared/__tests__/fb1-version-check.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-sequencing-windows.test.ts (2026-10-18-fb1-sequencing-windows) | docs/decisions/01109-2026-10-18-fb1-sequencing-windows.md | holds | File is server/__tests__/fb1-sequencing-windows.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-version-gate.db.test.ts (2026-10-18-fb1-sequencing-windows) | docs/decisions/01109-2026-10-18-fb1-sequencing-windows.md | holds | File is server/__tests__/fb1-version-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/serp-cache-off.test.ts (2026-10-18-serp-cache-off) | docs/decisions/01110-2026-10-18-serp-cache-off.md | holds | File is server/services/__tests__/serp-cache-off.test.ts. Ledger lint reports the guard wired. |
| route /api/ready | docs/decisions/01111-2026-10-18-boot-removals.md | holds | Mounted (GET). |
| route POST /api/admin/gems/backfill-photos | docs/decisions/01111-2026-10-18-boot-removals.md | holds | Mounted at server/routes/admin.routes.ts:360. |
| test pin server/__tests__/boot-removals.db.test.ts (2026-10-18-boot-removals) | docs/decisions/01111-2026-10-18-boot-removals.md | holds | File is server/__tests__/boot-removals.db.test.ts. Ledger lint reports the guard wired. |
| route /api/itinerary-share/:token | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | Mounted (GET). |
| route /api/saved-places/shared/:token | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | Mounted (GET). |
| route /api/share-image/ready-made/:id.png | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | Mounted (GET). |
| route /api/shared-trips/:token | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | Mounted (GET). |
| route /api/trips/shared/:token | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | Mounted (GET). |
| test pin server/__tests__/share-local-projection.http.test.ts (2026-10-18-fd4-share-projection) | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | File is server/__tests__/share-local-projection.http.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/share-projection.test.ts (2026-10-18-fd4-share-projection) | docs/decisions/01112-2026-10-18-fd4-share-projection.md | holds | File is shared/__tests__/share-projection.test.ts. Ledger lint reports the guard wired. |
| guard scripts/ci/ci-skip-rules.cjs (2026-10-18-merge-queue-triggers) | docs/decisions/01113-2026-10-18-merge-queue-triggers.md | holds | File is scripts/ci/ci-skip-rules.cjs. Ledger lint reports the guard wired. |
| guard advisory (2026-10-18-automation-d1-cart-activity-stamp) | docs/decisions/01114-2026-10-18-automation-d1-cart-activity-stamp.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-18-automation-d6-qa-inboxes) | docs/decisions/01115-2026-10-18-automation-d6-qa-inboxes.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-18-automation-d7-scheduler) | docs/decisions/01116-2026-10-18-automation-d7-scheduler.md | holds | Row is marked advisory; it names no CI guard. |
| guard none (2026-10-18-kyoto-sources-batch-1) | docs/decisions/01117-2026-10-18-kyoto-sources-batch-1.md | holds | Row states it has no CI guard: none — documentation only; no code reads `docs/content/kyoto-sources-batch-1.md`. |
| route /admin/content-sources | docs/decisions/01117-2026-10-18-kyoto-sources-batch-1.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route GET /api/affiliate/products/:id | docs/decisions/01118-2026-10-18-by-location-deleted.md | holds | Mounted at server/routes/content.routes.ts:8998. |
| route GET /api/affiliate/products/by-location | docs/decisions/01118-2026-10-18-by-location-deleted.md | holds | Live path is GET /api/affiliate/products/:id at server/routes/content.routes.ts:8998. |
| test pin server/__tests__/route-param-shadow.test.ts (2026-10-18-by-location-deleted) | docs/decisions/01118-2026-10-18-by-location-deleted.md | holds | File is server/__tests__/route-param-shadow.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg2-open-coord-review.db.test.ts (2026-10-18-lg2-open-coord-review) | docs/decisions/01119-2026-10-18-lg2-open-coord-review.md | holds | File is server/__tests__/lg2-open-coord-review.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg2-route-matrix-delete.test.ts (2026-10-18-lg2-route-matrix-delete) | docs/decisions/01120-2026-10-18-lg2-route-matrix-delete.md | holds | File is server/__tests__/lg2-route-matrix-delete.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/stay-card-est.test.ts (2026-10-18-stay-pick-est-fallback) | docs/decisions/01121-2026-10-18-stay-pick-est-fallback.md | holds | File is client/src/lib/__tests__/stay-card-est.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-link.db.test.ts (2026-10-18-stay-pick-est-fallback) | docs/decisions/01121-2026-10-18-stay-pick-est-fallback.md | holds | File is server/__tests__/stay-link.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stay-pick-est-fallback.db.test.ts (2026-10-18-stay-pick-est-fallback) | docs/decisions/01121-2026-10-18-stay-pick-est-fallback.md | holds | File is server/__tests__/stay-pick-est-fallback.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg2-gion-titles.db.test.ts (2026-10-18-lg2-banned-phrases) | docs/decisions/01122-2026-10-18-lg2-banned-phrases.md | holds | File is server/__tests__/lg2-gion-titles.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/lg2-banned-phrases-sanitize.test.ts (2026-10-18-lg2-banned-phrases) | docs/decisions/01122-2026-10-18-lg2-banned-phrases.md | holds | File is server/utils/__tests__/lg2-banned-phrases-sanitize.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/lg2-banned-copy.test.ts (2026-10-18-lg2-banned-phrases) | docs/decisions/01122-2026-10-18-lg2-banned-phrases.md | holds | File is shared/__tests__/lg2-banned-copy.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/lg2-matcher-planner.test.ts (2026-10-19-lg2-matcher-planner) | docs/decisions/01123-2026-10-19-lg2-matcher-planner.md | holds | File is server/services/__tests__/lg2-matcher-planner.test.ts. Ledger lint reports the guard wired. |
| route /concierge | docs/decisions/01124-2026-10-18-traveler-doors-hidden.md | holds | Client Route or Redirect matches /concierge. |
| route /my-events | docs/decisions/01124-2026-10-18-traveler-doors-hidden.md | holds | Client Route or Redirect matches /my-events. |
| route /pricing | docs/decisions/01124-2026-10-18-traveler-doors-hidden.md | holds | Client Route or Redirect matches /pricing. |
| route GET /api/traveler-doors | docs/decisions/01124-2026-10-18-traveler-doors-hidden.md | holds | Mounted at server/routes/concierge.routes.ts:594. |
| test pin client/src/components/__tests__/traveler-doors.test.tsx (2026-10-18-traveler-doors-hidden) | docs/decisions/01124-2026-10-18-traveler-doors-hidden.md | holds | File is client/src/components/__tests__/traveler-doors.test.tsx. Ledger lint reports the guard wired. |
| guard none (2026-10-19-1517-salvage) | docs/decisions/01125-2026-10-19-1517-salvage.md | holds | Row states it has no CI guard: none — documentation only; no code reads these files. |
| test pin server/services/__tests__/lg2-classifier-meeting.test.ts (2026-10-19-lg2-classifier-meeting) | docs/decisions/01126-2026-10-19-lg2-classifier-meeting.md | holds | File is server/services/__tests__/lg2-classifier-meeting.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/lg2-osm-credit.test.tsx (2026-10-19-lg2-licence-geocoder) | docs/decisions/01127-2026-10-19-lg2-licence-geocoder.md | holds | File is client/src/components/plancard/__tests__/lg2-osm-credit.test.tsx. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/lg2-licence-geocoder.test.ts (2026-10-19-lg2-licence-geocoder) | docs/decisions/01127-2026-10-19-lg2-licence-geocoder.md | holds | File is server/services/__tests__/lg2-licence-geocoder.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-expert-hook.test.ts (2026-10-18-fb1-expert-hook) | docs/decisions/01128-2026-10-18-fb1-expert-hook.md | holds | File is shared/__tests__/fb1-expert-hook.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/admin-osm-points.test.ts (2026-10-19-lg2-admin-points-dry-run) | docs/decisions/01129-2026-10-19-lg2-admin-points-dry-run.md | holds | File is shared/__tests__/admin-osm-points.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/versions/fixed | docs/decisions/01130-2026-10-19-fb1-fixed-by-tap.md | holds | Mounted at server/routes/versions.routes.ts:128. |
| route POST /api/trips/:tripId/versions/apply-days | docs/decisions/01130-2026-10-19-fb1-fixed-by-tap.md | holds | Mounted at server/routes/versions.routes.ts:79. |
| test pin client/src/lib/__tests__/fixed-plan.test.ts (2026-10-19-fb1-fixed-by-tap) | docs/decisions/01130-2026-10-19-fb1-fixed-by-tap.md | holds | File is client/src/lib/__tests__/fixed-plan.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-apply-days-callers.test.ts (2026-10-19-fb1-fixed-by-tap) | docs/decisions/01130-2026-10-19-fb1-fixed-by-tap.md | holds | File is server/__tests__/fb1-apply-days-callers.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-fixed-by-tap.db.test.ts (2026-10-19-fb1-fixed-by-tap) | docs/decisions/01130-2026-10-19-fb1-fixed-by-tap.md | holds | File is server/__tests__/fb1-fixed-by-tap.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/ai/generate-optimized-itineraries | docs/decisions/01131-2026-10-19-fb1-prompt-cleanup.md | holds | Mounted at server/routes/content.routes.ts:5241. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/01131-2026-10-19-fb1-prompt-cleanup.md | holds | Mounted at server/routes.ts:1691. |
| test pin server/__tests__/fb1-prompt-cleanup.test.ts (2026-10-19-fb1-prompt-cleanup) | docs/decisions/01131-2026-10-19-fb1-prompt-cleanup.md | holds | File is server/__tests__/fb1-prompt-cleanup.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/retime-fixes | docs/decisions/01132-2026-10-19-fb1-free-retime.md | holds | Mounted at server/routes/versions.routes.ts:145. |
| route POST /api/trips/:tripId/retime-fixes/:itemId/apply | docs/decisions/01132-2026-10-19-fb1-free-retime.md | holds | Mounted at server/routes/versions.routes.ts:155. |
| test pin server/__tests__/fb1-free-retime.db.test.ts (2026-10-19-fb1-free-retime) | docs/decisions/01132-2026-10-19-fb1-free-retime.md | holds | File is server/__tests__/fb1-free-retime.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-free-retime.test.ts (2026-10-19-fb1-free-retime) | docs/decisions/01132-2026-10-19-fb1-free-retime.md | holds | File is shared/__tests__/fb1-free-retime.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-closed-dates.db.test.ts (2026-10-19-fb1-closed-dates) | docs/decisions/01133-2026-10-19-fb1-closed-dates.md | holds | File is server/__tests__/fb1-closed-dates.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-closed-dates.test.ts (2026-10-19-fb1-closed-dates) | docs/decisions/01133-2026-10-19-fb1-closed-dates.md | holds | File is shared/__tests__/fb1-closed-dates.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/lg2-ask6-adjacent-legs.test.ts (2026-10-19-lg2-adjacent-legs) | docs/decisions/01134-2026-10-19-lg2-adjacent-legs.md | holds | File is server/services/__tests__/lg2-ask6-adjacent-legs.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/boot-seed-warm.db.test.ts (2026-10-19-boot-seed-timing) | docs/decisions/01135-2026-10-19-boot-seed-timing.md | holds | File is server/__tests__/boot-seed-warm.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/draft-readers-tagged.db.test.ts (2026-10-18-fact-tags-exhaustive) | docs/decisions/01136-2026-10-18-fact-tags-exhaustive.md | holds | File is server/__tests__/draft-readers-tagged.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/content-tiers.test.ts (2026-10-18-fact-tags-exhaustive) | docs/decisions/01136-2026-10-18-fact-tags-exhaustive.md | holds | File is shared/__tests__/content-tiers.test.ts. Ledger lint reports the guard wired. |
| route /admin/content-sources | docs/decisions/01137-2026-10-18-cs1-source-signoff.md | holds | Client Route or Redirect matches /admin/content-sources. |
| route POST /api/admin/content-sources/:id/signoff | docs/decisions/01137-2026-10-18-cs1-source-signoff.md | holds | Mounted at server/routes/content-sources.routes.ts:120. |
| route POST /api/admin/place-photo-blocks | docs/decisions/01137-2026-10-18-cs1-source-signoff.md | holds | Mounted at server/routes/place-photo-blocks.routes.ts:25. |
| test pin server/__tests__/source-signoff-photo-blocks.db.test.ts (2026-10-18-cs1-source-signoff) | docs/decisions/01137-2026-10-18-cs1-source-signoff.md | holds | File is server/__tests__/source-signoff-photo-blocks.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/lg2-admin-entry.db.test.ts (2026-10-19-lg2-admin-osm-points) | docs/decisions/01138-2026-10-19-lg2-admin-osm-points.md | holds | File is server/__tests__/lg2-admin-entry.db.test.ts. Ledger lint reports the guard wired. |
| route /api/fever/cache/events/:cityCode | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/cache/status | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/cities | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/cities/:cityCode/dates | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/cities/:cityCode/free | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/cities/:cityCode/upcoming | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/events | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/events/:eventId | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/fever/status | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route /api/travelpulse/fever-events/:cityName | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted (GET). |
| route GET /api/fever/events | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted at server/routes/content.routes.ts:6874. |
| route POST /api/content/affiliate-redirect | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | Mounted at server/routes/content.routes.ts:9260. |
| test pin client/src/lib/__tests__/sh1-destination-page.test.ts (2026-10-19-sh1-destination-page) | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | File is client/src/lib/__tests__/sh1-destination-page.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/sh1-fever-public.db.test.ts (2026-10-19-sh1-destination-page) | docs/decisions/01139-2026-10-19-sh1-destination-page.md | holds | File is server/__tests__/sh1-fever-public.db.test.ts. Ledger lint reports the guard wired. |
| route /api/experts/ | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | Mounted (GET). |
| route /api/experts/:id | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | Mounted (GET). |
| route GET /api/expert-availability | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | Mounted at server/routes/expert-door.routes.ts:60. |
| test pin client/src/components/__tests__/city-feed-card-recommendation.test.tsx (2026-10-19-sh1-expert-availability) | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | File is client/src/components/__tests__/city-feed-card-recommendation.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/sh1-expert-availability.test.ts (2026-10-19-sh1-expert-availability) | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | File is client/src/lib/__tests__/sh1-expert-availability.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/sh1-expert-availability.db.test.ts (2026-10-19-sh1-expert-availability) | docs/decisions/01140-2026-10-19-sh1-expert-availability.md | holds | File is server/__tests__/sh1-expert-availability.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/admin-osm-points.test.ts (2026-10-19-lg2-attach-one) | docs/decisions/01141-2026-10-19-lg2-attach-one.md | holds | File is shared/__tests__/admin-osm-points.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/places-writer-cap.db.test.ts (2026-10-19-places-writer-cap) | docs/decisions/01142-2026-10-19-places-writer-cap.md | holds | File is server/__tests__/places-writer-cap.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/system | docs/decisions/01143-2026-10-19-fb1-busy-bus.md | holds | Client Route or Redirect matches /admin/system. |
| test pin client/src/components/__tests__/fb1-busy-bus-line.test.tsx (2026-10-19-fb1-busy-bus) | docs/decisions/01143-2026-10-19-fb1-busy-bus.md | holds | File is client/src/components/__tests__/fb1-busy-bus-line.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-busy-bus.db.test.ts (2026-10-19-fb1-busy-bus) | docs/decisions/01143-2026-10-19-fb1-busy-bus.md | holds | File is server/__tests__/fb1-busy-bus.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-busy-bus.test.ts (2026-10-19-fb1-busy-bus) | docs/decisions/01143-2026-10-19-fb1-busy-bus.md | holds | File is shared/__tests__/fb1-busy-bus.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/timed-entry-warning.test.ts (2026-10-19-fb1-timed-entry) | docs/decisions/01144-2026-10-19-fb1-timed-entry.md | holds | File is client/src/lib/__tests__/timed-entry-warning.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-timed-entry.db.test.ts (2026-10-19-fb1-timed-entry) | docs/decisions/01144-2026-10-19-fb1-timed-entry.md | holds | File is server/__tests__/fb1-timed-entry.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fb1-timed-entry.test.ts (2026-10-19-fb1-timed-entry) | docs/decisions/01144-2026-10-19-fb1-timed-entry.md | holds | File is shared/__tests__/fb1-timed-entry.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-19-kyoto-slice-retime-drag) | docs/decisions/01145-2026-10-19-kyoto-slice-retime-drag.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| route /api/provider-services | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | Mounted (GET). |
| route /api/services | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | Mounted (GET). |
| route /experts | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | Client Route or Redirect matches /experts. |
| route PATCH /api/admin/users/:id/test-flag | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | Mounted at server/routes/admin.routes.ts:3494. |
| test pin server/__tests__/expert-routability.test.ts (2026-10-19-sh1-test-flag) | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | File is server/__tests__/expert-routability.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/test-account-exclusion.db.test.ts (2026-10-19-sh1-test-flag) | docs/decisions/01146-2026-10-19-sh1-test-flag.md | holds | File is server/__tests__/test-account-exclusion.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-never-say-copy.ts (2026-10-19-sh1-banned-copy) | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | File is scripts/check-never-say-copy.ts. Ledger lint reports the guard wired. |
| route GET /api/public/live-markets | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | Mounted at server/routes/ticker.routes.ts:58. |
| test pin client/src/components/__tests__/sh1-claims-removed.test.tsx (2026-10-19-sh1-banned-copy) | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | File is client/src/components/__tests__/sh1-claims-removed.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/live-markets.db.test.ts (2026-10-19-sh1-banned-copy) | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | File is server/__tests__/live-markets.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/sh1-seed-copy.db.test.ts (2026-10-19-sh1-banned-copy) | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | File is server/__tests__/sh1-seed-copy.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/sh1-never-say.test.ts (2026-10-19-sh1-banned-copy) | docs/decisions/01147-2026-10-19-sh1-banned-copy.md | holds | File is shared/__tests__/sh1-never-say.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fact-review.db.test.ts (2026-10-19-cs1-fact-review) | docs/decisions/01148-2026-10-19-cs1-fact-review.md | holds | File is server/__tests__/fact-review.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/show-series.test.ts (2026-10-19-sh1-show-dates) | docs/decisions/01149-2026-10-19-sh1-show-dates.md | holds | File is shared/__tests__/show-series.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/live-facts.db.test.ts (2026-10-19-cs1-live-facts) | docs/decisions/01150-2026-10-19-cs1-live-facts.md | holds | File is server/__tests__/live-facts.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/venue-city.test.ts (2026-10-19-sh1-venue-city) | docs/decisions/01151-2026-10-19-sh1-venue-city.md | holds | File is shared/__tests__/venue-city.test.ts. Ledger lint reports the guard wired. |
| route GET /api/experts | docs/decisions/01152-2026-10-20-lc1-kyoto-launch-copy.md | holds | Mounted at server/routes.ts:5490. |
| test pin client/src/lib/__tests__/lc1-kyoto-launch.test.tsx (2026-10-20-lc1-kyoto-launch-copy) | docs/decisions/01152-2026-10-20-lc1-kyoto-launch-copy.md | holds | File is client/src/lib/__tests__/lc1-kyoto-launch.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/lc1-kyoto-launch.test.tsx (2026-10-20-lc1b-kyoto-present) | docs/decisions/01153-2026-10-20-lc1b-kyoto-present.md | holds | File is client/src/lib/__tests__/lc1-kyoto-launch.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/privacy-city-waitlists.test.ts (2026-10-20-lc1b-kyoto-present) | docs/decisions/01153-2026-10-20-lc1b-kyoto-present.md | holds | File is client/src/lib/__tests__/privacy-city-waitlists.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/waitlist-markets.test.ts (2026-10-20-lc1b-kyoto-present) | docs/decisions/01153-2026-10-20-lc1b-kyoto-present.md | holds | File is client/src/lib/__tests__/waitlist-markets.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/01154-2026-10-20-js1-journey-suite.md | holds | Mounted at server/routes.ts:1691. |
| test pin client/src/lib/__tests__/ai-draft-failure.test.tsx (2026-10-20-js1-journey-suite) | docs/decisions/01154-2026-10-20-js1-journey-suite.md | holds | File is client/src/lib/__tests__/ai-draft-failure.test.tsx. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/e2e-ai-stub-gate.test.ts (2026-10-20-js1-journey-suite) | docs/decisions/01154-2026-10-20-js1-journey-suite.md | holds | File is server/utils/__tests__/e2e-ai-stub-gate.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/01155-2026-10-20-js1-stub-never-in-production.md | holds | Mounted (GET). |
| route POST /api/trips/:id/generate-itinerary | docs/decisions/01155-2026-10-20-js1-stub-never-in-production.md | holds | Mounted at server/routes.ts:1691. |
| test pin server/utils/__tests__/e2e-ai-stub-gate.test.ts (2026-10-20-js1-stub-never-in-production) | docs/decisions/01155-2026-10-20-js1-stub-never-in-production.md | holds | File is server/utils/__tests__/e2e-ai-stub-gate.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-draft-stub.spec.ts (2026-10-20-js1-production-draft-failure) | docs/decisions/01156-2026-10-20-js1-production-draft-failure.md | holds | File is playwright/tests/journeys/j-kyoto-draft-stub.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts (2026-10-20-js1-production-draft-failure) | docs/decisions/01156-2026-10-20-js1-production-draft-failure.md | holds | File is playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-draft-stub.spec.ts (2026-10-20-js1-draft-stub-report) | docs/decisions/01157-2026-10-20-js1-draft-stub-report.md | holds | File is playwright/tests/journeys/j-kyoto-draft-stub.spec.ts. Ledger lint reports the guard wired. |
| test pin e2e/supply-demand/d4-ai-draft.spec.ts (2026-10-20-js1-production-jobs-draft-failure) | docs/decisions/01158-2026-10-20-js1-production-jobs-draft-failure.md | holds | File is e2e/supply-demand/d4-ai-draft.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j13-share-stub.spec.ts (2026-10-20-js1-production-jobs-draft-failure) | docs/decisions/01158-2026-10-20-js1-production-jobs-draft-failure.md | holds | File is playwright/tests/journeys/j13-share-stub.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j13-share.spec.ts (2026-10-20-js1-production-jobs-draft-failure) | docs/decisions/01158-2026-10-20-js1-production-jobs-draft-failure.md | holds | File is playwright/tests/journeys/j13-share.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/personas/journey-plus-stub.spec.ts (2026-10-20-js1-production-jobs-draft-failure) | docs/decisions/01158-2026-10-20-js1-production-jobs-draft-failure.md | holds | File is playwright/tests/personas/journey-plus-stub.spec.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/personas/journey-plus.spec.ts (2026-10-20-js1-production-jobs-draft-failure) | docs/decisions/01158-2026-10-20-js1-production-jobs-draft-failure.md | holds | File is playwright/tests/personas/journey-plus.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/sh1-photo-scan.test.ts (2026-10-20-sh1-banned-photos) | docs/decisions/01159-2026-10-20-sh1-banned-photos.md | holds | File is server/__tests__/sh1-photo-scan.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/m05-m06-copy.test.ts (2026-10-20-m05-m06-kyoto-copy) | docs/decisions/01160-2026-10-20-m05-m06-kyoto-copy.md | holds | File is client/src/lib/__tests__/m05-m06-copy.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/banned-marketing-copy.test.ts (2026-10-21-marketing-banned-copy) | docs/decisions/01161-2026-10-21-marketing-banned-copy.md | holds | File is shared/__tests__/banned-marketing-copy.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/banned-marketing-copy.test.ts (2026-10-21-marketing-banned-copy-followup) | docs/decisions/01162-2026-10-21-marketing-banned-copy-followup.md | holds | File is shared/__tests__/banned-marketing-copy.test.ts. Ledger lint reports the guard wired. |
| route GET /api/admin/kyoto-gem-copy | docs/decisions/01163-2026-10-20-kyoto-feed-cleanup.md | holds | Mounted at server/routes/kyoto-gem-copy.routes.ts:12. |
| test pin shared/__tests__/kyoto-feed-cleanup.test.ts (2026-10-20-kyoto-feed-cleanup) | docs/decisions/01163-2026-10-20-kyoto-feed-cleanup.md | holds | File is shared/__tests__/kyoto-feed-cleanup.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/fever-card-place.test.ts (2026-10-21-blog-checks-fever-area) | docs/decisions/01164-2026-10-21-blog-checks-fever-area.md | holds | File is client/src/lib/__tests__/fever-card-place.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/blog-event-guide.db.test.ts (2026-10-21-blog-checks-fever-area) | docs/decisions/01164-2026-10-21-blog-checks-fever-area.md | holds | File is server/services/__tests__/blog-event-guide.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/fever-area.test.ts (2026-10-21-blog-checks-fever-area) | docs/decisions/01164-2026-10-21-blog-checks-fever-area.md | holds | File is server/services/__tests__/fever-area.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/blog-copy-checks.test.ts (2026-10-21-blog-checks-fever-area) | docs/decisions/01164-2026-10-21-blog-checks-fever-area.md | holds | File is shared/__tests__/blog-copy-checks.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fever-area.test.ts (2026-10-21-blog-checks-fever-area) | docs/decisions/01164-2026-10-21-blog-checks-fever-area.md | holds | File is shared/__tests__/fever-area.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/feed-title-filter.test.ts (2026-10-21-blog-fever-followup) | docs/decisions/01165-2026-10-21-blog-fever-followup.md | holds | File is client/src/lib/__tests__/feed-title-filter.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/fever-area.test.ts (2026-10-21-blog-fever-followup) | docs/decisions/01165-2026-10-21-blog-fever-followup.md | holds | File is server/services/__tests__/fever-area.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/blog-copy-checks.test.ts (2026-10-21-blog-fever-followup) | docs/decisions/01165-2026-10-21-blog-fever-followup.md | holds | File is shared/__tests__/blog-copy-checks.test.ts. Ledger lint reports the guard wired. |
| guard check-ledger-union-merge (2026-10-21-ledger-one-file) | docs/decisions/01166-2026-10-21-ledger-one-file.md | holds | File is scripts/check-ledger-union-merge.cjs. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/optimizer-lead.test.tsx (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is client/src/components/plancard/__tests__/optimizer-lead.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/optimize-failure-copy.test.ts (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is client/src/lib/__tests__/optimize-failure-copy.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/optimize-pay-flow.test.ts (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is client/src/lib/__tests__/optimize-pay-flow.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/optimizer-run-refund.db.test.ts (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is server/__tests__/optimizer-run-refund.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/optimizer-run-refund.stripe.db.test.ts (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is server/__tests__/optimizer-run-refund.stripe.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/optimizer-run-refund.test.ts (2026-10-20-optimize-paid-failure-refund) | docs/decisions/01167-2026-10-20-optimize-paid-failure-refund.md | holds | File is shared/__tests__/optimizer-run-refund.test.ts. Ledger lint reports the guard wired. |
| route /api/login | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | Mounted (GET). |
| route /dashboard | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | Client Route or Redirect matches /dashboard. |
| route GET /api/callback | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | Mounted at server/replit_integrations/auth/replitAuth.ts:291. |
| test pin client/src/lib/__tests__/social-sign-in-source.test.ts (2026-10-21-guest-map-social-return) | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | File is client/src/lib/__tests__/social-sign-in-source.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-guest-map.spec.ts (2026-10-21-guest-map-social-return) | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | File is playwright/tests/journeys/j-guest-map.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/oauth-state.test.ts (2026-10-21-guest-map-social-return) | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | File is server/__tests__/oauth-state.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/traveler-signup-switch.test.ts (2026-10-21-guest-map-social-return) | docs/decisions/01168-2026-10-21-guest-map-social-return.md | holds | File is server/__tests__/traveler-signup-switch.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-prompt-cleanup.test.ts (2026-10-21-optimizer-no-trending-preference) | docs/decisions/01169-2026-10-21-optimizer-no-trending-preference.md | holds | File is server/__tests__/fb1-prompt-cleanup.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/bento-anchor.test.ts (2026-10-20-bento-hero-is-ours) | docs/decisions/01170-2026-10-20-bento-hero-is-ours.md | holds | File is client/src/lib/__tests__/bento-anchor.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs.spec.ts (2026-10-20-bento-hero-is-ours) | docs/decisions/01170-2026-10-20-bento-hero-is-ours.md | holds | File is playwright/tests/discover-tabs.spec.ts. Ledger lint reports the guard wired. |
| route /discover/location/:city | docs/decisions/01171-2026-10-20-empty-neighbourhood-wanted.md | holds | Client Route or Redirect matches /discover/location/:p. |
| route /earn | docs/decisions/01171-2026-10-20-empty-neighbourhood-wanted.md | holds | Client Route or Redirect matches /earn. |
| test pin client/src/lib/__tests__/feed-stream-empty-neighbourhood.test.ts (2026-10-20-empty-neighbourhood-wanted) | docs/decisions/01171-2026-10-20-empty-neighbourhood-wanted.md | holds | File is client/src/lib/__tests__/feed-stream-empty-neighbourhood.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs.spec.ts (2026-10-20-empty-neighbourhood-wanted) | docs/decisions/01171-2026-10-20-empty-neighbourhood-wanted.md | holds | File is playwright/tests/discover-tabs.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-target.test.ts (2026-10-20-add-plan-open-plans) | docs/decisions/01172-2026-10-20-add-plan-open-plans.md | holds | File is client/src/lib/__tests__/trip-target.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/partner-activity-card.test.tsx (2026-10-20-g02-g06-copy) | docs/decisions/01173-2026-10-20-g02-g06-copy.md | holds | File is client/src/components/__tests__/partner-activity-card.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/g02-g06-copy.test.ts (2026-10-20-g02-g06-copy) | docs/decisions/01173-2026-10-20-g02-g06-copy.md | holds | File is client/src/lib/__tests__/g02-g06-copy.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/partner-card-copy.test.ts (2026-10-20-g02-g06-copy) | docs/decisions/01173-2026-10-20-g02-g06-copy.md | holds | File is shared/__tests__/partner-card-copy.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-migration-approval.cjs (2026-10-21-migration-approval-check) | docs/decisions/01174-2026-10-21-migration-approval-check.md | holds | File is scripts/check-migration-approval.cjs. Ledger lint reports the guard wired. |
| route /admin/system | docs/decisions/01175-2026-10-20-marketing-email-footer.md | holds | Client Route or Redirect matches /admin/system. |
| test pin server/services/__tests__/marketing-email-footer.test.ts (2026-10-20-marketing-email-footer) | docs/decisions/01175-2026-10-20-marketing-email-footer.md | holds | File is server/services/__tests__/marketing-email-footer.test.ts. Ledger lint reports the guard wired. |
| route /events/:sourceId | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | Client Route or Redirect matches /events/:p. |
| test pin client/src/components/__tests__/partner-event-row.test.ts (2026-10-21-event-card-partner-area) | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | File is client/src/components/__tests__/partner-event-row.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/fever-card-place.test.ts (2026-10-21-event-card-partner-area) | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | File is client/src/lib/__tests__/fever-card-place.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/partner-calendar.test.ts (2026-10-21-event-card-partner-area) | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | File is server/services/__tests__/partner-calendar.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/fever-area.test.ts (2026-10-21-event-card-partner-area) | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | File is shared/__tests__/fever-area.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/partner-calendar.test.ts (2026-10-21-event-card-partner-area) | docs/decisions/01176-2026-10-21-event-card-partner-area.md | holds | File is shared/__tests__/partner-calendar.test.ts. Ledger lint reports the guard wired. |
| route /become-provider | docs/decisions/01177-2026-10-21-s22-waitlist-apply-path.md | holds | Client Route or Redirect matches /become-provider. |
| route GET /api/public/live-markets | docs/decisions/01177-2026-10-21-s22-waitlist-apply-path.md | holds | Mounted at server/routes/ticker.routes.ts:58. |
| route POST /api/waitlist | docs/decisions/01177-2026-10-21-s22-waitlist-apply-path.md | holds | Mounted at server/routes/launch-waitlist.routes.ts:53. |
| test pin client/src/lib/__tests__/s22-waitlist-apply.test.tsx (2026-10-21-s22-waitlist-apply-path) | docs/decisions/01177-2026-10-21-s22-waitlist-apply-path.md | holds | File is client/src/lib/__tests__/s22-waitlist-apply.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/s22-waitlist-apply.db.test.ts (2026-10-21-s22-waitlist-apply-path) | docs/decisions/01177-2026-10-21-s22-waitlist-apply-path.md | holds | File is server/__tests__/s22-waitlist-apply.db.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/auth/login-enumeration.spec.ts (2026-10-21-login-enumeration) | docs/decisions/01178-2026-10-21-login-enumeration.md | holds | File is playwright/tests/auth/login-enumeration.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/login-enumeration.http.test.ts (2026-10-21-login-enumeration) | docs/decisions/01178-2026-10-21-login-enumeration.md | holds | File is server/__tests__/login-enumeration.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/login-enumeration.test.ts (2026-10-21-login-enumeration) | docs/decisions/01178-2026-10-21-login-enumeration.md | holds | File is server/__tests__/login-enumeration.test.ts. Ledger lint reports the guard wired. |
| route /become-expert | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | Client Route or Redirect matches /become-expert. |
| route /become-provider | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | Client Route or Redirect matches /become-provider. |
| route /earn | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | Client Route or Redirect matches /earn. |
| route GET /api/fee-policies/keep-rates | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | Mounted at server/routes/payments.routes.ts:3155. |
| test pin client/src/lib/__tests__/fee-keep-copy.test.ts (2026-10-21-supply-registration-fixes) | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | File is client/src/lib/__tests__/fee-keep-copy.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/supply-registration.test.ts (2026-10-21-supply-registration-fixes) | docs/decisions/01179-2026-10-21-supply-registration-fixes.md | holds | File is shared/__tests__/supply-registration.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/admin-qa-alerting.test.ts (2026-10-21-admin-qa-alerting) | docs/decisions/01180-2026-10-21-admin-qa-alerting.md | holds | File is server/__tests__/admin-qa-alerting.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/pending-supply-public.db.test.ts (2026-10-21-pending-supply-dashboard) | docs/decisions/01181-2026-10-21-pending-supply-dashboard.md | holds | File is server/__tests__/pending-supply-public.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/application-status.test.ts (2026-10-21-pending-supply-dashboard) | docs/decisions/01181-2026-10-21-pending-supply-dashboard.md | holds | File is shared/__tests__/application-status.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stripe-customer-create.test.ts (2026-10-21-saved-method-required) | docs/decisions/01182-2026-10-21-saved-method-required.md | holds | File is server/__tests__/stripe-customer-create.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stripe-key-policy.test.ts (2026-10-21-saved-method-required) | docs/decisions/01182-2026-10-21-saved-method-required.md | holds | File is server/__tests__/stripe-key-policy.test.ts. Ledger lint reports the guard wired. |
| test pin server/services/__tests__/plan-price-resolver.test.ts (2026-10-21-saved-method-required) | docs/decisions/01182-2026-10-21-saved-method-required.md | holds | File is server/services/__tests__/plan-price-resolver.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/checkout-session-fulfillment.test.ts (2026-10-21-checkout-dynamic-methods) | docs/decisions/01183-2026-10-21-checkout-dynamic-methods.md | holds | File is server/__tests__/checkout-session-fulfillment.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/saved-payment-method.test.ts (2026-10-21-saved-method-list-and-express) | docs/decisions/01184-2026-10-21-saved-method-list-and-express.md | holds | File is shared/__tests__/saved-payment-method.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/stripe-intent-key.test.ts (2026-10-21-saved-method-onsession) | docs/decisions/01185-2026-10-21-saved-method-onsession.md | holds | File is server/__tests__/stripe-intent-key.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/payment-method-setup.test.ts (2026-10-21-signup-payment-step) | docs/decisions/01186-2026-10-21-signup-payment-step.md | holds | File is client/src/lib/__tests__/payment-method-setup.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/city-knowledge-scoring.test.ts (2026-10-21-city-knowledge-test) | docs/decisions/01187-2026-10-21-city-knowledge-test.md | holds | File is shared/__tests__/city-knowledge-scoring.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/email-verification-hold.test.ts (2026-10-21-email-verification-gate) | docs/decisions/01188-2026-10-21-email-verification-gate.md | holds | File is client/src/lib/__tests__/email-verification-hold.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-verification-gate.http.test.ts (2026-10-21-email-verification-gate) | docs/decisions/01188-2026-10-21-email-verification-gate.md | holds | File is server/__tests__/email-verification-gate.http.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/email-verification-gate.test.ts (2026-10-21-email-verification-gate) | docs/decisions/01188-2026-10-21-email-verification-gate.md | holds | File is shared/__tests__/email-verification-gate.test.ts. Ledger lint reports the guard wired. |
| route /become-expert | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | Client Route or Redirect matches /become-expert. |
| route /become-provider | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | Client Route or Redirect matches /become-provider. |
| route /earn | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | Client Route or Redirect matches /earn. |
| route /signup | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | Client Route or Redirect matches /signup. |
| route /start/events | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | Client Route or Redirect matches /start/events. |
| test pin server/__tests__/supply-entry-paths.test.ts (2026-10-21-supply-entry-paths) | docs/decisions/01189-2026-10-21-supply-entry-paths.md | holds | File is server/__tests__/supply-entry-paths.test.ts. Ledger lint reports the guard wired. |
| route /earn | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | Client Route or Redirect matches /earn. |
| route /expert | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | gone | No client Route or Redirect matches /expert. |
| route /expert-status | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | Client Route or Redirect matches /expert-status. |
| route /experts | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | Client Route or Redirect matches /experts. |
| route /provider | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | gone | No client Route or Redirect matches /provider. |
| route /provider-status | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | Client Route or Redirect matches /provider-status. |
| route /providers | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | Client Route or Redirect matches /providers. |
| test pin client/src/lib/__tests__/payment-method-setup.test.ts (2026-10-22-card-gate-skip-supply) | docs/decisions/01190-2026-10-22-card-gate-skip-supply.md | holds | File is client/src/lib/__tests__/payment-method-setup.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/payment-method-setup.test.ts (2026-10-22-card-gate-skippable) | docs/decisions/01191-2026-10-22-card-gate-skippable.md | holds | File is client/src/lib/__tests__/payment-method-setup.test.ts. Ledger lint reports the guard wired. |
| route GET /api/health | docs/decisions/01192-2026-10-22-neon-connect-timeout.md | holds | Mounted at server/routes/content.routes.ts:387. |
| route GET /api/ready | docs/decisions/01192-2026-10-22-neon-connect-timeout.md | holds | Mounted at server/index.ts:200. |
| test pin server/services/__tests__/neon-connect-timeout.test.ts (2026-10-22-neon-connect-timeout) | docs/decisions/01192-2026-10-22-neon-connect-timeout.md | holds | File is server/services/__tests__/neon-connect-timeout.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-closed-dates.db.test.ts (2026-10-22-add-check-closed-dates) | docs/decisions/01193-2026-10-22-add-check-closed-dates.md | holds | File is server/__tests__/fb1-closed-dates.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/bot-proposals.db.test.ts (2026-10-22-bot-closed-dates-timed-entry) | docs/decisions/01194-2026-10-22-bot-closed-dates-timed-entry.md | holds | File is server/__tests__/bot-proposals.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/bot-proposals.test.ts (2026-10-22-bot-closed-dates-timed-entry) | docs/decisions/01194-2026-10-22-bot-closed-dates-timed-entry.md | holds | File is shared/__tests__/bot-proposals.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/fb1-timed-entry.db.test.ts (2026-10-22-timed-entry-booked) | docs/decisions/01195-2026-10-22-timed-entry-booked.md | holds | File is server/__tests__/fb1-timed-entry.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/listing-report-audit.db.test.ts (2026-10-22-listing-report-audit) | docs/decisions/01196-2026-10-22-listing-report-audit.md | holds | File is server/__tests__/listing-report-audit.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/trips | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | Mounted at server/routes.ts:1456. |
| test pin client/src/components/__tests__/sh1-launch-pr5.test.tsx (2026-10-22-sh1-launch-pr5) | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | File is client/src/components/__tests__/sh1-launch-pr5.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-entry.test.ts (2026-10-22-sh1-launch-pr5) | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | File is client/src/lib/__tests__/plan-entry.test.ts. Ledger lint reports the guard wired. |
| test pin playwright/tests/discover-tabs-events-calendar.spec.ts (2026-10-22-sh1-launch-pr5) | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | File is playwright/tests/discover-tabs-events-calendar.spec.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/sh1-launch-pr5.db.test.ts (2026-10-22-sh1-launch-pr5) | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | File is server/__tests__/sh1-launch-pr5.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/market-today.test.ts (2026-10-22-sh1-launch-pr5) | docs/decisions/01197-2026-10-22-sh1-launch-pr5.md | holds | File is shared/__tests__/market-today.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/reconciliation-detection.db.test.ts (2026-10-22-n24c-purchase-race) | docs/decisions/01198-2026-10-22-n24c-purchase-race.md | holds | File is server/__tests__/reconciliation-detection.db.test.ts. Ledger lint reports the guard wired. |
| route /api/admin | docs/decisions/01199-2026-10-22-staff-roles.md | holds | Routes are still mounted under this prefix (for example POST /api/admin/affiliate/partners). |
| test pin shared/__tests__/staff-permissions.test.ts (2026-10-22-staff-roles) | docs/decisions/01199-2026-10-22-staff-roles.md | holds | File is shared/__tests__/staff-permissions.test.ts. Ledger lint reports the guard wired. |
| route /admin/audit-log | docs/decisions/01200-2026-10-22-audit-log-all-actions.md | holds | Client Route or Redirect matches /admin/audit-log. |
| route /api/admin | docs/decisions/01200-2026-10-22-audit-log-all-actions.md | holds | Routes are still mounted under this prefix (for example POST /api/admin/affiliate/partners). |
| route GET /api/admin/audit-logs/all | docs/decisions/01200-2026-10-22-audit-log-all-actions.md | holds | Mounted at server/routes/admin.routes.ts:7220. |
| test pin client/src/lib/__tests__/audit-log-all.test.ts (2026-10-22-audit-log-all-actions) | docs/decisions/01200-2026-10-22-audit-log-all-actions.md | holds | File is client/src/lib/__tests__/audit-log-all.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/audit-log-all.db.test.ts (2026-10-22-audit-log-all-actions) | docs/decisions/01200-2026-10-22-audit-log-all-actions.md | holds | File is server/__tests__/audit-log-all.db.test.ts. Ledger lint reports the guard wired. |
| route /admin/bookings/service/:id | docs/decisions/01201-2026-10-22-admin-ops-screens.md | gone | No client Route or Redirect matches /admin/bookings/service/:p. |
| route /admin/system | docs/decisions/01201-2026-10-22-admin-ops-screens.md | holds | Client Route or Redirect matches /admin/system. |
| route POST /api/admin/bookings/auto-cancel/run | docs/decisions/01201-2026-10-22-admin-ops-screens.md | holds | Mounted at server/routes/admin.routes.ts:2305. |
| test pin client/src/components/__tests__/admin-ops-tabs.test.tsx (2026-10-22-admin-ops-screens) | docs/decisions/01201-2026-10-22-admin-ops-screens.md | holds | File is client/src/components/__tests__/admin-ops-tabs.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/admin-ops-audit.db.test.ts (2026-10-22-admin-ops-screens) | docs/decisions/01201-2026-10-22-admin-ops-screens.md | holds | File is server/__tests__/admin-ops-audit.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-outbox.test.ts (2026-10-22-email-sends-enabled) | docs/decisions/01202-2026-10-22-email-sends-enabled.md | holds | File is server/__tests__/email-outbox.test.ts. Ledger lint reports the guard wired. |
| route /admin/support | docs/decisions/01203-2026-10-22-support-intake-queue.md | holds | Client Route or Redirect matches /admin/support. |
| route PATCH /api/admin/contact-submissions/:id | docs/decisions/01203-2026-10-22-support-intake-queue.md | holds | Mounted at server/routes/admin.routes.ts:2990. |
| test pin client/src/components/__tests__/support-inbox.test.tsx (2026-10-22-support-intake-queue) | docs/decisions/01203-2026-10-22-support-intake-queue.md | holds | File is client/src/components/__tests__/support-inbox.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/support-intake.db.test.ts (2026-10-22-support-intake-queue) | docs/decisions/01203-2026-10-22-support-intake-queue.md | holds | File is server/__tests__/support-intake.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/support-intake.test.ts (2026-10-22-support-intake-queue) | docs/decisions/01203-2026-10-22-support-intake-queue.md | holds | File is shared/__tests__/support-intake.test.ts. Ledger lint reports the guard wired. |
| route /admin/message-moderation/:id/context | docs/decisions/01204-2026-10-22-report-message-context.md | holds | Client Route or Redirect matches /admin/message-moderation/:p/context. |
| route GET /api/admin/message-reports/:id/context | docs/decisions/01204-2026-10-22-report-message-context.md | holds | Mounted at server/routes/admin.routes.ts:8061. |
| test pin client/src/components/__tests__/report-context-view.test.tsx (2026-10-22-report-message-context) | docs/decisions/01204-2026-10-22-report-message-context.md | holds | File is client/src/components/__tests__/report-context-view.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/report-context.db.test.ts (2026-10-22-report-message-context) | docs/decisions/01204-2026-10-22-report-message-context.md | holds | File is server/__tests__/report-context.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/report-context.test.ts (2026-10-22-report-message-context) | docs/decisions/01204-2026-10-22-report-message-context.md | holds | File is shared/__tests__/report-context.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/staff-permissions.test.ts (2026-10-22-report-message-context) | docs/decisions/01204-2026-10-22-report-message-context.md | holds | File is shared/__tests__/staff-permissions.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/content-tiers.db.test.ts (2026-10-22-census-missing-source) | docs/decisions/01205-2026-10-22-census-missing-source.md | holds | File is server/__tests__/content-tiers.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/city-events/calendar | docs/decisions/01206-2026-10-23-season-bands-admin-windows.md | holds | Mounted at server/routes/landing.routes.ts:275. |
| test pin server/__tests__/events-calendar.db.test.ts (2026-10-23-season-bands-admin-windows) | docs/decisions/01206-2026-10-23-season-bands-admin-windows.md | holds | File is server/__tests__/events-calendar.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/season-band-windows.test.ts (2026-10-23-season-bands-admin-windows) | docs/decisions/01206-2026-10-23-season-bands-admin-windows.md | holds | File is shared/__tests__/season-band-windows.test.ts. Ledger lint reports the guard wired. |
| route /admin/experts | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | Client Route or Redirect matches /admin/experts. |
| route /admin/payouts | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | Client Route or Redirect matches /admin/payouts. |
| route /admin/providers | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | Client Route or Redirect matches /admin/providers. |
| route /api/admin/platform-service-providers | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | Mounted (GET). |
| test pin client/src/components/__tests__/gap9-payout-screens.test.tsx (2026-10-22-gap9-payout-admin-screens) | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | File is client/src/components/__tests__/gap9-payout-screens.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/gap9-screens.db.test.ts (2026-10-22-gap9-payout-admin-screens) | docs/decisions/01207-2026-10-22-gap9-payout-admin-screens.md | holds | File is server/__tests__/gap9-screens.db.test.ts. Ledger lint reports the guard wired. |
| route /api/health | docs/decisions/01208-2026-10-22-boot-seed-stamps.md | holds | Mounted (GET). |
| route /api/ready | docs/decisions/01208-2026-10-22-boot-seed-stamps.md | holds | Mounted (GET). |
| test pin server/__tests__/boot-seed-stamps.test.ts (2026-10-22-boot-seed-stamps) | docs/decisions/01208-2026-10-22-boot-seed-stamps.md | holds | File is server/__tests__/boot-seed-stamps.test.ts. Ledger lint reports the guard wired. |
| route GET /api/discover/location/:city | docs/decisions/01209-2026-10-22-r07-drop-seasonal-highlights.md | holds | Mounted at server/routes/content.routes.ts:1000. |
| route GET /api/travelpulse/ai/city/:cityName | docs/decisions/01209-2026-10-22-r07-drop-seasonal-highlights.md | holds | Mounted at server/routes/content.routes.ts:6016. |
| test pin server/__tests__/r07-drop-seasonal-highlights.db.test.ts (2026-10-22-r07-drop-seasonal-highlights) | docs/decisions/01209-2026-10-22-r07-drop-seasonal-highlights.md | holds | File is server/__tests__/r07-drop-seasonal-highlights.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/events-calendar.db.test.ts (2026-10-23-koyo-drop-tips) | docs/decisions/01210-2026-10-23-koyo-drop-tips.md | holds | File is server/__tests__/events-calendar.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/season-band-haswindow.test.tsx (2026-10-23-season-band-haswindow-badge) | docs/decisions/01211-2026-10-23-season-band-haswindow-badge.md | holds | File is client/src/components/__tests__/season-band-haswindow.test.tsx. Ledger lint reports the guard wired. |
| route GET /api/admin/payouts/owed | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | Mounted at server/routes/admin.routes.ts:6059. |
| route GET /api/me/payout-setup | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | Mounted at server/routes/payments.routes.ts:3185. |
| route POST /api/payouts/request | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | Mounted at server/routes/payments.routes.ts:3225. |
| route PUT /api/me/payout-setup | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | Mounted at server/routes/payments.routes.ts:3198. |
| test pin server/__tests__/payout-setup.db.test.ts (2026-10-23-payout-setup-server) | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | File is server/__tests__/payout-setup.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/payout-setup.test.ts (2026-10-23-payout-setup-server) | docs/decisions/01212-2026-10-23-payout-setup-server.md | holds | File is server/__tests__/payout-setup.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-23-multi-currency-pricing-and-fx-margin) | docs/decisions/01213-2026-10-23-multi-currency-pricing-and-fx-margin.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/stripe/connect/onboard | docs/decisions/01214-2026-10-23-payout-setup-screens.md | holds | Mounted at server/routes/payments.routes.ts:2997. |
| route PUT /api/me/payout-setup | docs/decisions/01214-2026-10-23-payout-setup-screens.md | holds | Mounted at server/routes/payments.routes.ts:3198. |
| test pin client/src/components/__tests__/payout-setup-screens.test.tsx (2026-10-23-payout-setup-screens) | docs/decisions/01214-2026-10-23-payout-setup-screens.md | holds | File is client/src/components/__tests__/payout-setup-screens.test.tsx. Ledger lint reports the guard wired. |
| guard advisory (2026-10-23-experience-themes) | docs/decisions/01215-2026-10-23-experience-themes.md | holds | Row is marked advisory; it names no CI guard. |
| route GET /api/discover | docs/decisions/01215-2026-10-23-experience-themes.md | holds | Mounted at server/routes/content.routes.ts:2989. |
| guard advisory (2026-10-23-fx-ruling-stripe-cost-plus-margin) | docs/decisions/01216-2026-10-23-fx-ruling-stripe-cost-plus-margin.md | holds | Row is marked advisory; it names no CI guard. |
| test pin client/src/lib/__tests__/listing-banned-wording.test.ts (2026-10-23-listing-banned-wording-flag) | docs/decisions/01217-2026-10-23-listing-banned-wording-flag.md | holds | File is client/src/lib/__tests__/listing-banned-wording.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/listing-banned-wording.http.test.ts (2026-10-23-listing-banned-wording-flag) | docs/decisions/01217-2026-10-23-listing-banned-wording-flag.md | holds | File is server/__tests__/listing-banned-wording.http.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/email-verification-hold.test.ts (2026-10-23-drop-check-email) | docs/decisions/01218-2026-10-23-drop-check-email.md | holds | File is client/src/lib/__tests__/email-verification-hold.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-verification-gate.http.test.ts (2026-10-23-drop-check-email) | docs/decisions/01218-2026-10-23-drop-check-email.md | holds | File is server/__tests__/email-verification-gate.http.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/email-verification-gate.test.ts (2026-10-23-drop-check-email) | docs/decisions/01218-2026-10-23-drop-check-email.md | holds | File is shared/__tests__/email-verification-gate.test.ts. Ledger lint reports the guard wired. |
| route /experiences | docs/decisions/01219-2026-10-24-h10-experiences-popup.md | holds | Client Route or Redirect matches /experiences. |
| route /experiences/:slug | docs/decisions/01219-2026-10-24-h10-experiences-popup.md | holds | Client Route or Redirect matches /experiences/:p. |
| test pin client/src/lib/__tests__/h10-experiences-popup.test.ts (2026-10-24-h10-experiences-popup) | docs/decisions/01219-2026-10-24-h10-experiences-popup.md | holds | File is client/src/lib/__tests__/h10-experiences-popup.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-entry.test.ts (2026-10-24-h10-experiences-popup) | docs/decisions/01219-2026-10-24-h10-experiences-popup.md | holds | File is client/src/lib/__tests__/plan-entry.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/discovery-status-seed.test.ts (2026-10-24-discovery-status-emerging) | docs/decisions/01220-2026-10-24-discovery-status-emerging.md | holds | File is shared/__tests__/discovery-status-seed.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/discover-need-help.test.ts (2026-10-24-discover-need-help-body) | docs/decisions/01221-2026-10-24-discover-need-help-body.md | holds | File is client/src/lib/__tests__/discover-need-help.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/payout-setup.db.test.ts (2026-10-24-payout-setup-test-handle) | docs/decisions/01222-2026-10-24-payout-setup-test-handle.md | holds | File is server/__tests__/payout-setup.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/events-long-run-count.test.tsx (2026-10-24-events-long-run-count) | docs/decisions/01223-2026-10-24-events-long-run-count.md | holds | File is client/src/components/__tests__/events-long-run-count.test.tsx. Ledger lint reports the guard wired. |
| test pin shared/__tests__/events-calendar.test.ts (2026-10-24-events-long-run-count) | docs/decisions/01223-2026-10-24-events-long-run-count.md | holds | File is shared/__tests__/events-calendar.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/add-from-search-outcome.test.ts (2026-10-24-add-from-search-outcome) | docs/decisions/01224-2026-10-24-add-from-search-outcome.md | holds | File is client/src/lib/__tests__/add-from-search-outcome.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/map-add-plancard.test.ts (2026-10-24-add-from-search-outcome) | docs/decisions/01224-2026-10-24-add-from-search-outcome.md | holds | File is client/src/lib/__tests__/map-add-plancard.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-dates.test.ts (2026-10-24-trip-dates-single-day) | docs/decisions/01225-2026-10-24-trip-dates-single-day.md | holds | File is client/src/lib/__tests__/trip-dates.test.ts. Ledger lint reports the guard wired. |
| route /api/auth/send-verification | docs/decisions/01226-2026-10-24-verify-reminder-banner.md | holds | Mounted (POST). |
| route GET /api/auth/user | docs/decisions/01226-2026-10-24-verify-reminder-banner.md | holds | Mounted at server/replit_integrations/auth/routes.ts:152. |
| test pin client/src/components/__tests__/verify-email-reminder.test.tsx (2026-10-24-verify-reminder-banner) | docs/decisions/01226-2026-10-24-verify-reminder-banner.md | holds | File is client/src/components/__tests__/verify-email-reminder.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-template-allowlist.test.ts (2026-10-24-email-template-allowlist) | docs/decisions/01227-2026-10-24-email-template-allowlist.md | holds | File is server/__tests__/email-template-allowlist.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/panel-trip-dates.test.ts (2026-10-24-panels-trip-dates) | docs/decisions/01228-2026-10-24-panels-trip-dates.md | holds | File is client/src/components/__tests__/panel-trip-dates.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-action-gate.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-action-gate.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-change-paths.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-change-paths.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-checkout-gate.http.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-checkout-gate.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-expert-contact.http.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-expert-contact.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-expert-contact.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-expert-contact.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-password-reset.db.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-password-reset.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-payout-gate.db.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-payout-gate.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/verified-email-payout-gate.test.ts (2026-10-24-soft-email-verification) | docs/decisions/01229-2026-10-24-soft-email-verification.md | holds | File is server/__tests__/verified-email-payout-gate.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-24-traveler-automation-rulings) | docs/decisions/01230-2026-10-24-traveler-automation-rulings.md | holds | Row is marked advisory; it names no CI guard. |
| test pin server/__tests__/email-single-exit.test.ts (2026-10-24-email-single-exit) | docs/decisions/01231-2026-10-24-email-single-exit.md | holds | File is server/__tests__/email-single-exit.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/login-email-no-clear.db.test.ts (2026-10-24-login-email-no-clear) | docs/decisions/01232-2026-10-24-login-email-no-clear.md | holds | File is server/__tests__/login-email-no-clear.db.test.ts. Ledger lint reports the guard wired. |
| route /api/travelpulse/cities | docs/decisions/01233-2026-10-25-comparison-remove-travelpulse.md | holds | Mounted (GET). |
| route /api/travelpulse/trending | docs/decisions/01233-2026-10-25-comparison-remove-travelpulse.md | holds | Live path is GET /api/travelpulse/trending/:city at server/routes/content.routes.ts:5552. |
| test pin client/src/lib/__tests__/comparison-context.test.ts (2026-10-25-comparison-remove-travelpulse) | docs/decisions/01233-2026-10-25-comparison-remove-travelpulse.md | holds | File is client/src/lib/__tests__/comparison-context.test.ts. Ledger lint reports the guard wired. |
| route DELETE /api/trips/:tripId/itinerary-items/:itemId | docs/decisions/01234-2026-10-25-comparison-add-undo.md | holds | Mounted at server/routes/trips.routes.ts:3404. |
| route POST /api/itinerary-comparisons/:id/adopt-stop | docs/decisions/01234-2026-10-25-comparison-add-undo.md | holds | Mounted at server/routes/plancard.routes.ts:411. |
| test pin client/src/lib/__tests__/comparison-add-undo.test.ts (2026-10-25-comparison-add-undo) | docs/decisions/01234-2026-10-25-comparison-add-undo.md | holds | File is client/src/lib/__tests__/comparison-add-undo.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-25-baseline-variant-anchor) | docs/decisions/01235-2026-10-25-baseline-variant-anchor.md | holds | Row is marked advisory; it names no CI guard. |
| guard advisory (2026-10-25-custom-location-geocode) | docs/decisions/01236-2026-10-25-custom-location-geocode.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/optimization-payments | docs/decisions/01236-2026-10-25-custom-location-geocode.md | holds | Mounted at server/routes/optimization.routes.ts:402. |
| guard advisory (2026-10-25-pinned-anchor-not-found) | docs/decisions/01237-2026-10-25-pinned-anchor-not-found.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/itinerary-comparisons | docs/decisions/01237-2026-10-25-pinned-anchor-not-found.md | holds | Mounted at server/routes.ts:10334. |
| route POST /api/itinerary-comparisons/:id/generate | docs/decisions/01237-2026-10-25-pinned-anchor-not-found.md | holds | Mounted at server/routes.ts:10731. |
| route POST /api/optimization-payments | docs/decisions/01237-2026-10-25-pinned-anchor-not-found.md | holds | Mounted at server/routes/optimization.routes.ts:402. |
| route /generate | docs/decisions/01238-2026-10-25-custom-pin-client.md | gone | No client Route or Redirect matches /generate. |
| test pin client/src/lib/__tests__/custom-pin-client.test.ts (2026-10-25-custom-pin-client) | docs/decisions/01238-2026-10-25-custom-pin-client.md | holds | File is client/src/lib/__tests__/custom-pin-client.test.ts. Ledger lint reports the guard wired. |
| route /trip-pass/purchase | docs/decisions/01239-2026-10-25-dates-gate-gaps.md | gone | No client Route or Redirect matches /trip-pass/purchase. |
| test pin client/src/lib/__tests__/dates-gate-gaps.test.ts (2026-10-25-dates-gate-gaps) | docs/decisions/01239-2026-10-25-dates-gate-gaps.md | holds | File is client/src/lib/__tests__/dates-gate-gaps.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:id/anchors | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | Mounted at server/routes/trips.routes.ts:1559. |
| route GET /api/trips/:tripId/plancard | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | Mounted at server/routes/plancard.routes.ts:778. |
| test pin server/__tests__/final-airport-leg-forward.db.test.ts (2026-10-25-final-airport-leg) | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | File is server/__tests__/final-airport-leg-forward.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/final-airport-leg-reader.test.ts (2026-10-25-final-airport-leg) | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | File is server/__tests__/final-airport-leg-reader.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/final-airport-leg-route.db.test.ts (2026-10-25-final-airport-leg) | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | File is server/__tests__/final-airport-leg-route.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/trip-final-airport-snapshot.db.test.ts (2026-10-25-final-airport-leg) | docs/decisions/01240-2026-10-25-final-airport-leg.md | holds | File is server/__tests__/trip-final-airport-snapshot.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/expert-availability | docs/decisions/01241-2026-10-25-expert-doors-gated.md | holds | Mounted at server/routes/expert-door.routes.ts:60. |
| test pin client/src/components/__tests__/expert-doors-gated.test.tsx (2026-10-25-expert-doors-gated) | docs/decisions/01241-2026-10-25-expert-doors-gated.md | holds | File is client/src/components/__tests__/expert-doors-gated.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/trip-card-airport-row.test.tsx (2026-10-25-trip-card-airport-row) | docs/decisions/01242-2026-10-25-trip-card-airport-row.md | holds | File is client/src/components/plancard/__tests__/trip-card-airport-row.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/plan-compare.test.ts (2026-10-25-compare-checked-minutes) | docs/decisions/01243-2026-10-25-compare-checked-minutes.md | holds | File is client/src/lib/__tests__/plan-compare.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/slip-compare-board.test.ts (2026-10-25-compare-checked-minutes) | docs/decisions/01243-2026-10-25-compare-checked-minutes.md | holds | File is client/src/lib/__tests__/slip-compare-board.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/plan-fit.test.ts (2026-10-25-compare-checked-minutes) | docs/decisions/01243-2026-10-25-compare-checked-minutes.md | holds | File is shared/__tests__/plan-fit.test.ts. Ledger lint reports the guard wired. |
| guard advisory (2026-10-25-delete-artifacts-traveloure) | docs/decisions/01244-2026-10-25-delete-artifacts-traveloure.md | holds | Row is marked advisory; it names no CI guard. |
| route POST /api/ai/generate-optimized-itineraries | docs/decisions/01244-2026-10-25-delete-artifacts-traveloure.md | holds | Mounted at server/routes/content.routes.ts:5241. |
| route POST /api/itinerary-comparisons | docs/decisions/01245-2026-10-25-pinned-anchor-invalid.md | holds | Mounted at server/routes.ts:10334. |
| route POST /api/itinerary-comparisons/:id/generate | docs/decisions/01245-2026-10-25-pinned-anchor-invalid.md | holds | Mounted at server/routes.ts:10731. |
| route POST /api/optimization-payments | docs/decisions/01245-2026-10-25-pinned-anchor-invalid.md | holds | Mounted at server/routes/optimization.routes.ts:402. |
| test pin server/services/__tests__/custom-pin-before-charge.test.ts (2026-10-25-pinned-anchor-invalid) | docs/decisions/01245-2026-10-25-pinned-anchor-invalid.md | holds | File is server/services/__tests__/custom-pin-before-charge.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/b8-no-straight-line-minutes.test.tsx (2026-10-25-b8-straight-line-minutes) | docs/decisions/01246-2026-10-25-b8-straight-line-minutes.md | holds | File is client/src/components/plancard/__tests__/b8-no-straight-line-minutes.test.tsx. Ledger lint reports the guard wired. |
| file:line BuildAroundDialog.tsx:69 | docs/decisions/01247-2026-10-25-b8-transport-section.md | holds | No code symbol was named beside the citation. Line client/src/components/plancard/BuildAroundDialog.tsx:69 reads: optionsLabel: (typeLabel: string): string => `${typeLabel} options`, |
| file:line DayTransportPanel.tsx:207-215 | docs/decisions/01247-2026-10-25-b8-transport-section.md | gone | No file matches DayTransportPanel.tsx. |
| file:line my-itinerary.tsx:636-641 | docs/decisions/01247-2026-10-25-b8-transport-section.md | gone | No file matches my-itinerary.tsx. |
| test pin client/src/components/plancard/__tests__/b8-transport-section-checked-minutes.test.tsx (2026-10-25-b8-transport-section) | docs/decisions/01247-2026-10-25-b8-transport-section.md | holds | File is client/src/components/plancard/__tests__/b8-transport-section-checked-minutes.test.tsx. Ledger lint reports the guard wired. |
| route POST /api/trips/:tripId/versions/days/:day/restore | docs/decisions/01248-2026-10-25-d3-restore-day.md | holds | Mounted at server/routes/versions.routes.ts:109. |
| test pin server/__tests__/version-day-restore.db.test.ts (2026-10-25-d3-restore-day) | docs/decisions/01248-2026-10-25-d3-restore-day.md | holds | File is server/__tests__/version-day-restore.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx (2026-10-26-b8-live-site-unchecked-minutes) | docs/decisions/01249-2026-10-26-b8-live-site-unchecked-minutes.md | holds | File is client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/handoff-hold-release.db.test.ts (2026-10-25-handoff-release-pending) | docs/decisions/01250-2026-10-25-handoff-release-pending.md | holds | File is server/__tests__/handoff-hold-release.db.test.ts. Ledger lint reports the guard wired. |
| file:line cart.tsx:1641 | docs/decisions/01251-2026-10-25-cart-dates-gate.md | holds | No code symbol was named beside the citation. Line client/src/pages/cart.tsx:1641 reads: const userExperienceId: string \| undefined = ctxAtPayment.userExperienceId \|\| ctxAtPayment.id; |
| route PATCH /api/trips/:id | docs/decisions/01251-2026-10-25-cart-dates-gate.md | holds | Mounted at server/routes.ts:1609. |
| test pin client/src/lib/__tests__/cart-dates-gate.test.ts (2026-10-25-cart-dates-gate) | docs/decisions/01251-2026-10-25-cart-dates-gate.md | holds | File is client/src/lib/__tests__/cart-dates-gate.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/versions-restore-copy.test.ts (2026-10-25-d3-step0-versions-restore-copy) | docs/decisions/01252-2026-10-25-d3-step0-versions-restore-copy.md | holds | File is client/src/components/plancard/__tests__/versions-restore-copy.test.ts. Ledger lint reports the guard wired. |
| route /api/city-neighborhoods | docs/decisions/01253-2026-10-25-e4-area-pins.md | holds | Mounted (GET). |
| test pin client/src/lib/__tests__/e4-neighbourhood-pin-label.test.ts (2026-10-25-e4-area-pins) | docs/decisions/01253-2026-10-25-e4-area-pins.md | holds | File is client/src/lib/__tests__/e4-neighbourhood-pin-label.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx (2026-10-26-b8-remaining-unchecked-minutes) | docs/decisions/01254-2026-10-26-b8-remaining-unchecked-minutes.md | holds | File is client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-outbox-expiry.test.ts (2026-10-25-email-outbox-expires-at) | docs/decisions/01255-2026-10-25-email-outbox-expires-at.md | holds | File is server/__tests__/email-outbox-expiry.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/platform-webhook-processed.db.test.ts (2026-10-25-platform-webhook-processed) | docs/decisions/01256-2026-10-25-platform-webhook-processed.md | holds | File is server/__tests__/platform-webhook-processed.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/phone-delivery.db.test.ts (2026-10-26-pd5-dtstamp-regex) | docs/decisions/01257-2026-10-26-pd5-dtstamp-regex.md | holds | File is server/__tests__/phone-delivery.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/plan-cost-strip.test.tsx (2026-10-26-per-person-cost-strip) | docs/decisions/01258-2026-10-26-per-person-cost-strip.md | holds | File is client/src/components/plancard/__tests__/plan-cost-strip.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/e4-neighbourhood-pin-icon.test.ts (2026-10-26-neighbourhood-pin-icon-prop) | docs/decisions/01259-2026-10-26-neighbourhood-pin-icon-prop.md | holds | File is client/src/lib/__tests__/e4-neighbourhood-pin-icon.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/demand-test-exclusion-qa-domain.test.ts (2026-10-26-demand-qa-domain) | docs/decisions/01260-2026-10-26-demand-qa-domain.md | holds | File is server/__tests__/demand-test-exclusion-qa-domain.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/admin-audit-digest.db.test.ts (2026-10-26-admin-audit-digest) | docs/decisions/01261-2026-10-26-admin-audit-digest.md | holds | File is server/__tests__/admin-audit-digest.db.test.ts. Ledger lint reports the guard wired. |
| route GET /api/trips/:tripId/versions/restorable | docs/decisions/01262-2026-10-26-d3-restore-my-draft-screen.md | holds | Mounted at server/routes/versions.routes.ts:98. |
| test pin client/src/components/plancard/__tests__/versions-restore.test.tsx (2026-10-26-d3-restore-my-draft-screen) | docs/decisions/01262-2026-10-26-d3-restore-my-draft-screen.md | holds | File is client/src/components/plancard/__tests__/versions-restore.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-outbox-readdress.db.test.ts (2026-10-26-outbox-readdress) | docs/decisions/01263-2026-10-26-outbox-readdress.md | holds | File is server/__tests__/email-outbox-readdress.db.test.ts. Ledger lint reports the guard wired. |
| file:line shared/leave-by.ts:141 | docs/decisions/01264-2026-10-26-daylegs-routed-flag.md | holds | No code symbol was named beside the citation. Line shared/leave-by.ts:141 reads: if (!leg \|\| !leg.routed) return { kind: "none", stopId: stop.id, reason: "needs_routed_leg", line: LEAVE_BY_COPY.needsRoutedLeg }; |
| test pin b8-live-site-unchecked-minutes.test.tsx (2026-10-26-daylegs-routed-flag) | docs/decisions/01264-2026-10-26-daylegs-routed-flag.md | holds | File is client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/daylegs-routed-flag.test.tsx (2026-10-26-daylegs-routed-flag) | docs/decisions/01264-2026-10-26-daylegs-routed-flag.md | holds | File is client/src/components/plancard/__tests__/daylegs-routed-flag.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/password-changed-notice.db.test.ts (2026-10-26-family5-slice-b) | docs/decisions/01265-2026-10-26-family5-slice-b.md | holds | File is server/__tests__/password-changed-notice.db.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-27-ci-postgres-18-runner) | docs/decisions/01266-2026-10-27-ci-postgres-18-runner.md | holds | Row states it has no CI guard: none — CI configuration only. |
| test pin server/__tests__/email-changed-notices.db.test.ts (2026-10-26-family5-slice-d) | docs/decisions/01267-2026-10-26-family5-slice-d.md | holds | File is server/__tests__/email-changed-notices.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row54-dead-files-gone.test.tsx (2026-10-26-row54-dead-files-and-fences) | docs/decisions/01268-2026-10-26-row54-dead-files-and-fences.md | holds | File is client/src/components/plancard/__tests__/row54-dead-files-gone.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/email-delivery-targets.db.test.ts (2026-10-26-delivery-target-15min) | docs/decisions/01269-2026-10-26-delivery-target-15min.md | holds | File is server/__tests__/email-delivery-targets.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row257-ai-wording.test.ts (2026-10-27-row257-remove-ai-wording) | docs/decisions/01270-2026-10-27-row257-remove-ai-wording.md | holds | File is client/src/lib/__tests__/row257-ai-wording.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/site-meta-copy.test.ts (2026-10-27-site-title-no-ai) | docs/decisions/01271-2026-10-27-site-title-no-ai.md | holds | File is client/src/lib/__tests__/site-meta-copy.test.ts. Ledger lint reports the guard wired. |
| file:line discover-add-body.test.ts:59 | docs/decisions/01272-2026-10-27-no-source-in-notes.md | holds | No code symbol was named beside the citation. Line client/src/lib/__tests__/discover-add-body.test.ts:59 reads: assert.equal("notes" in body, false, "no source label is written into notes (row 262)"); |
| file:line pages/expert/workspace.tsx:2493 | docs/decisions/01272-2026-10-27-no-source-in-notes.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2493 reads: // convert it into an invented cost figure on the itinerary. |
| file:line workspace.tsx:2493 | docs/decisions/01272-2026-10-27-no-source-in-notes.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2493 reads: // convert it into an invented cost figure on the itinerary. |
| test pin client/src/lib/__tests__/add-path-no-source-notes.test.ts (2026-10-27-no-source-in-notes) | docs/decisions/01272-2026-10-27-no-source-in-notes.md | holds | File is client/src/lib/__tests__/add-path-no-source-notes.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/discover-add-body.test.ts (2026-10-27-no-source-in-notes) | docs/decisions/01272-2026-10-27-no-source-in-notes.md | holds | File is client/src/lib/__tests__/discover-add-body.test.ts. Ledger lint reports the guard wired. |
| route POST /api/handoffs/:id/cannot-book | docs/decisions/01273-2026-10-28-failed-booking-refund.md | holds | Mounted at server/routes/handoff.routes.ts:423. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-28-failed-booking-refund) | docs/decisions/01273-2026-10-28-failed-booking-refund.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/handoff-failed-booking.db.test.ts (2026-10-28-failed-booking-refund) | docs/decisions/01273-2026-10-28-failed-booking-refund.md | holds | File is server/__tests__/handoff-failed-booking.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/journey-dismisses-card-prompt.test.ts (2026-10-28-journeys-dismiss-card-prompt) | docs/decisions/01274-2026-10-28-journeys-dismiss-card-prompt.md | holds | File is client/src/lib/__tests__/journey-dismisses-card-prompt.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/saved-card-oneclick-no-redirect.test.ts (2026-10-28-saved-card-oneclick-no-redirect) | docs/decisions/01275-2026-10-28-saved-card-oneclick-no-redirect.md | holds | File is server/__tests__/saved-card-oneclick-no-redirect.test.ts. Ledger lint reports the guard wired. |
| route GET /api/invites/:token | docs/decisions/01276-2026-10-28-guest-landing-fields.md | holds | Mounted at server/routes/guest-invites.ts:444. |
| route POST /api/invites/:token/view | docs/decisions/01276-2026-10-28-guest-landing-fields.md | holds | Mounted at server/routes/guest-invites.ts:486. |
| test pin server/__tests__/guest-invite-landing.test.ts (2026-10-28-guest-landing-fields) | docs/decisions/01276-2026-10-28-guest-landing-fields.md | holds | File is server/__tests__/guest-invite-landing.test.ts. Ledger lint reports the guard wired. |
| route GET /api/invites/:token/recommendations | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | gone | No mounted GET /api/invites/:p/recommendations. |
| route POST /api/invites/:token/travel-plans | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | gone | No mounted POST /api/invites/:p/travel-plans. |
| route POST /api/invites/:token/view | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | holds | Mounted at server/routes/guest-invites.ts:486. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-28-row263-dead-recommendations-route) | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row263-guest-invite-no-recommendations.test.ts (2026-10-28-row263-dead-recommendations-route) | docs/decisions/01277-2026-10-28-row263-dead-recommendations-route.md | holds | File is server/__tests__/row263-guest-invite-no-recommendations.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/apex-to-www-redirect.test.ts (2026-10-27-apex-to-www-301) | docs/decisions/01278-2026-10-27-apex-to-www-301.md | holds | File is server/__tests__/apex-to-www-redirect.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/canonical-www.test.ts (2026-10-27-apex-to-www-301) | docs/decisions/01278-2026-10-27-apex-to-www-301.md | holds | File is shared/__tests__/canonical-www.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/guest-invite-send.db.test.ts (2026-10-28-invite-send-state-server) | docs/decisions/01279-2026-10-28-invite-send-state-server.md | holds | File is server/__tests__/guest-invite-send.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row263-guest-invite-no-recommendations.test.tsx (2026-10-28-guest-landing-render) | docs/decisions/01280-2026-10-28-guest-landing-render.md | holds | File is client/src/components/plancard/__tests__/row263-guest-invite-no-recommendations.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row278-guest-landing.test.ts (2026-10-28-guest-landing-render) | docs/decisions/01280-2026-10-28-guest-landing-render.md | holds | File is client/src/lib/__tests__/row278-guest-landing.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/row207-invite-send-state-screen.test.tsx (2026-10-29-invite-send-state-screen) | docs/decisions/01281-2026-10-29-invite-send-state-screen.md | holds | File is client/src/components/__tests__/row207-invite-send-state-screen.test.tsx. Ledger lint reports the guard wired. |
| route GET /api/user-experiences/:id | docs/decisions/01282-2026-10-29-invite-host-details.md | holds | Mounted at server/routes/content.routes.ts:1886. |
| route PATCH /api/user-experiences/:id | docs/decisions/01282-2026-10-29-invite-host-details.md | holds | Mounted at server/routes/content.routes.ts:2008. |
| test pin client/src/components/__tests__/row290-invite-host-details.test.tsx (2026-10-29-invite-host-details) | docs/decisions/01282-2026-10-29-invite-host-details.md | holds | File is client/src/components/__tests__/row290-invite-host-details.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/waitlist-consent.db.test.ts (2026-10-29-waitlist-consent-server) | docs/decisions/01283-2026-10-29-waitlist-consent-server.md | holds | File is server/__tests__/waitlist-consent.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row279-guest-card.test.tsx (2026-10-29-guest-post-rsvp-card) | docs/decisions/01284-2026-10-29-guest-post-rsvp-card.md | holds | File is client/src/lib/__tests__/row279-guest-card.test.tsx. Ledger lint reports the guard wired. |
| route POST /api/invites/:token/rsvp | docs/decisions/01285-2026-10-29-rsvp-accommodation-by-answer.md | holds | Mounted at server/routes/guest-invites.ts:538. |
| test pin server/__tests__/rsvp-accommodation-by-answer.http.test.ts (2026-10-29-rsvp-accommodation-by-answer) | docs/decisions/01285-2026-10-29-rsvp-accommodation-by-answer.md | holds | File is server/__tests__/rsvp-accommodation-by-answer.http.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/rsvp-accommodation-by-answer.test.ts (2026-10-29-rsvp-accommodation-by-answer) | docs/decisions/01285-2026-10-29-rsvp-accommodation-by-answer.md | holds | File is server/__tests__/rsvp-accommodation-by-answer.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row293-unsubscribe-link.test.ts (2026-10-29-unsubscribe-link-page) | docs/decisions/01286-2026-10-29-unsubscribe-link-page.md | holds | File is server/__tests__/row293-unsubscribe-link.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row291b-waitlist-consent-screens.test.tsx (2026-10-29-waitlist-consent-screens) | docs/decisions/01287-2026-10-29-waitlist-consent-screens.md | holds | File is client/src/lib/__tests__/row291b-waitlist-consent-screens.test.tsx. Ledger lint reports the guard wired. |
| route POST /api/invites/:token/plan | docs/decisions/01288-2026-10-29-invite-plan-around-event.md | holds | Mounted at server/routes/guest-invites.ts:568. |
| test pin server/__tests__/row280a-invite-plan.db.test.ts (2026-10-29-invite-plan-around-event) | docs/decisions/01288-2026-10-29-invite-plan-around-event.md | holds | File is server/__tests__/row280a-invite-plan.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/check-e2e-helper-waits.cjs (2026-10-29-act-and-await-fails-loud) | docs/decisions/01289-2026-10-29-act-and-await-fails-loud.md | holds | File is scripts/check-e2e-helper-waits.cjs. Ledger lint reports the guard wired. |
| test pin playwright/tests/journeys/j-kyoto-draft-stub.spec.ts (2026-10-29-kyoto-draft-stub-dismiss-card-prompt) | docs/decisions/01290-2026-10-29-kyoto-draft-stub-dismiss-card-prompt.md | holds | File is playwright/tests/journeys/j-kyoto-draft-stub.spec.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row251-restore-strip-owner.test.tsx (2026-10-29-versions-restore-owner-only) | docs/decisions/01291-2026-10-29-versions-restore-owner-only.md | holds | File is client/src/components/plancard/__tests__/row251-restore-strip-owner.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row264-gem-marker-note.test.ts (2026-10-29-hide-gem-marker-in-notes) | docs/decisions/01292-2026-10-29-hide-gem-marker-in-notes.md | holds | File is client/src/components/plancard/__tests__/row264-gem-marker-note.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row54-dead-files-gone.test.tsx (2026-10-29-transport-cancel-module-deleted) | docs/decisions/01293-2026-10-29-transport-cancel-module-deleted.md | holds | File is client/src/components/plancard/__tests__/row54-dead-files-gone.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/cancel-booking-dialog.test.ts (2026-10-29-transport-cancel-module-deleted) | docs/decisions/01293-2026-10-29-transport-cancel-module-deleted.md | holds | File is client/src/lib/__tests__/cancel-booking-dialog.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row247-leg-minutes-est.test.tsx (2026-10-29-leg-minutes-est) | docs/decisions/01294-2026-10-29-leg-minutes-est.md | holds | File is client/src/components/plancard/__tests__/row247-leg-minutes-est.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/components/__tests__/panel-trip-dates.test.ts (2026-10-29-trip-dates-locale) | docs/decisions/01295-2026-10-29-trip-dates-locale.md | holds | File is client/src/components/__tests__/panel-trip-dates.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/trip-dates-locale.test.ts (2026-10-29-trip-dates-locale) | docs/decisions/01295-2026-10-29-trip-dates-locale.md | holds | File is client/src/lib/__tests__/trip-dates-locale.test.ts. Ledger lint reports the guard wired. |
| test pin server/utils/__tests__/stripe-payment-domain-check.test.ts (2026-10-29-apple-pay-domain-check) | docs/decisions/01296-2026-10-29-apple-pay-domain-check.md | holds | File is server/utils/__tests__/stripe-payment-domain-check.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/handoff-failed-booking.db.test.ts (2026-10-29-c3b-booking-failed-banner-kind) | docs/decisions/01297-2026-10-29-c3b-booking-failed-banner-kind.md | holds | File is server/__tests__/handoff-failed-booking.db.test.ts. Ledger lint reports the guard wired. |
| guard none (2026-10-29-docs-drop-recommendations-route) | docs/decisions/01298-2026-10-29-docs-drop-recommendations-route.md | holds | Row states it has no CI guard: none — docs only; the route removal itself is guarded by server/__tests__/row263-guest-invite-no-recommendations.test.ts. |
| guard journey-real-stripe-subset.yml (2026-10-29-journey-real-stripe-pr-subset) | docs/decisions/01299-2026-10-29-journey-real-stripe-pr-subset.md | holds | File is .github/workflows/journey-real-stripe-subset.yml. Ledger lint reports the guard wired. |
| guard scripts/ci/ci-skip-rules.cjs (2026-10-29-journey-real-stripe-pr-subset) | docs/decisions/01299-2026-10-29-journey-real-stripe-pr-subset.md | holds | File is scripts/ci/ci-skip-rules.cjs. Ledger lint reports the guard wired. |
| test pin server/__tests__/ready-made-preview.db.test.ts (2026-10-29-ready-made-share-site-origin) | docs/decisions/01300-2026-10-29-ready-made-share-site-origin.md | holds | File is server/__tests__/ready-made-preview.db.test.ts. Ledger lint reports the guard wired. |
| test pin shared/__tests__/canonical-www.test.ts (2026-10-29-ready-made-share-site-origin) | docs/decisions/01300-2026-10-29-ready-made-share-site-origin.md | holds | File is shared/__tests__/canonical-www.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-29-reconciliation-run-now-post) | docs/decisions/01301-2026-10-29-reconciliation-run-now-post.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/row270-reconciliation-run-now-post.db.test.ts (2026-10-29-reconciliation-run-now-post) | docs/decisions/01301-2026-10-29-reconciliation-run-now-post.md | holds | File is server/routes/__tests__/row270-reconciliation-run-now-post.db.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row292a-provider-payout-block.db.test.ts (2026-10-29-provider-payout-block) | docs/decisions/01302-2026-10-29-provider-payout-block.md | holds | File is server/__tests__/row292a-provider-payout-block.db.test.ts. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-30-row292a-drop-p9-count-pin) | docs/decisions/01303-2026-10-30-row292a-drop-p9-count-pin.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row292a-provider-payout-block.db.test.ts (2026-10-30-row292a-drop-p9-count-pin) | docs/decisions/01303-2026-10-30-row292a-drop-p9-count-pin.md | holds | File is server/__tests__/row292a-provider-payout-block.db.test.ts. Ledger lint reports the guard wired. |
| guard .github/workflows/suite-server-tests.yml (2026-10-30-row253b-ci-postgres-16) | docs/decisions/01304-2026-10-30-row253b-ci-postgres-16.md | holds | File is .github/workflows/suite-server-tests.yml. Ledger lint reports the guard wired. |
| test pin scripts/mutation-auth/extractor.test.ts (2026-10-29-affiliate-reconciliation-post) | docs/decisions/01305-2026-10-29-affiliate-reconciliation-post.md | holds | File is scripts/mutation-auth/extractor.test.ts. Ledger lint reports the guard wired. |
| test pin server/routes/__tests__/row272-affiliate-reconciliation-post.db.test.ts (2026-10-29-affiliate-reconciliation-post) | docs/decisions/01305-2026-10-29-affiliate-reconciliation-post.md | holds | File is server/routes/__tests__/row272-affiliate-reconciliation-post.db.test.ts. Ledger lint reports the guard wired. |
| route POST /api/invites/:token/plan | docs/decisions/01306-2026-10-29-guest-plan-my-day-button.md | holds | Mounted at server/routes/guest-invites.ts:568. |
| test pin client/src/components/plancard/__tests__/row280b-plan-my-day-button.test.tsx (2026-10-29-guest-plan-my-day-button) | docs/decisions/01306-2026-10-29-guest-plan-my-day-button.md | holds | File is client/src/components/plancard/__tests__/row280b-plan-my-day-button.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/row209-held-guest-invites.db.test.ts (2026-10-30-row209-held-guest-invites-view) | docs/decisions/01307-2026-10-30-row209-held-guest-invites-view.md | holds | File is server/__tests__/row209-held-guest-invites.db.test.ts. Ledger lint reports the guard wired. |
| guard scripts/ci/ci-skip-rules.cjs (2026-10-30-row253a-playwright-unpin) | docs/decisions/01308-2026-10-30-row253a-playwright-unpin.md | holds | File is scripts/ci/ci-skip-rules.cjs. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/pets-welcome-gate.test.ts (2026-10-30-row187-pets-welcome-gate) | docs/decisions/01309-2026-10-30-row187-pets-welcome-gate.md | holds | File is client/src/lib/__tests__/pets-welcome-gate.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row280c-slip-rsvp-by.db.test.ts (2026-10-30-row280c-slip-rsvp-by) | docs/decisions/01310-2026-10-30-row280c-slip-rsvp-by.md | holds | File is server/__tests__/row280c-slip-rsvp-by.db.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/components/plancard/__tests__/row276-failed-booking-banner.test.ts (2026-10-30-failed-booking-banner-client) | docs/decisions/01311-2026-10-30-failed-booking-banner-client.md | holds | File is client/src/components/plancard/__tests__/row276-failed-booking-banner.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/wlb-provider-signup-gate.test.ts (2026-10-30-wlb-provider-signup-gate) | docs/decisions/01312-2026-10-30-wlb-provider-signup-gate.md | holds | File is server/__tests__/wlb-provider-signup-gate.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/row220-geocode-provider-error-alert.test.ts (2026-10-30-row220-geocode-provider-error-alert) | docs/decisions/01313-2026-10-30-row220-geocode-provider-error-alert.md | holds | File is server/__tests__/row220-geocode-provider-error-alert.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/signup-provider-fields.test.tsx (2026-10-30-wlb-provider-signup-screen) | docs/decisions/01314-2026-10-30-wlb-provider-signup-screen.md | holds | File is client/src/lib/__tests__/signup-provider-fields.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/row244-stay-day-closeness.test.ts (2026-10-30-row244-stay-day-closeness) | docs/decisions/01315-2026-10-30-row244-stay-day-closeness.md | holds | File is server/__tests__/row244-stay-day-closeness.test.ts. Ledger lint reports the guard wired. |
| test pin server/__tests__/cost-source.test.ts (2026-10-30-row242-cost-source) | docs/decisions/01316-2026-10-30-row242-cost-source.md | holds | File is server/__tests__/cost-source.test.ts. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row292b-provider-payout-block-wording.test.tsx (2026-10-30-row292b-provider-payout-block-wording) | docs/decisions/01317-2026-10-30-row292b-provider-payout-block-wording.md | holds | File is client/src/lib/__tests__/row292b-provider-payout-block-wording.test.tsx. Ledger lint reports the guard wired. |
| test pin client/src/lib/__tests__/row294-marketing-consent.test.tsx (2026-10-30-row294-marketing-consent) | docs/decisions/01318-2026-10-30-row294-marketing-consent.md | holds | File is client/src/lib/__tests__/row294-marketing-consent.test.tsx. Ledger lint reports the guard wired. |
| test pin server/__tests__/row294-marketing-consent.db.test.ts (2026-10-30-row294-marketing-consent) | docs/decisions/01318-2026-10-30-row294-marketing-consent.md | holds | File is server/__tests__/row294-marketing-consent.db.test.ts. Ledger lint reports the guard wired. |
| file:line admin.routes.ts:5726 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/admin.routes.ts:5726 reads: fever, |
| file:line booking-actions.ts:1114-1138 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1114-1138 reads: return res.status(400).json({ error: 'type and title are required' }); |
| file:line booking-actions.ts:1114-1211 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1114-1211 reads: return res.status(400).json({ error: 'type and title are required' }); |
| file:line booking-actions.ts:1119-1123 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | fee_bands is not in server/routes/booking-actions.ts. Cited line now reads: dayNumber: dayNumber ?? null, title, |
| file:line booking-actions.ts:1129 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | localExpertId is not on the cited lines. It is at server/routes/booking-actions.ts:844. |
| file:line booking-actions.ts:1144-1153 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1144-1153 reads: } as any); |
| file:line booking-actions.ts:1611 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1611 reads: console.error('[PlanReview] expert notify failed (non-fatal):', notifyErr); |
| file:line booking-actions.ts:1651 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | detectAnchorImpacts is not on the cited lines. It is at server/routes/booking-actions.ts:2031. |
| file:line booking-actions.ts:1662 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | boundaryViolations is not on the cited lines. It is at server/routes/booking-actions.ts:2056. |
| file:line booking-actions.ts:1752 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1752 reads: |
| file:line booking-actions.ts:1811 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1811 reads: console.error('Create item comment error:', error); |
| file:line booking-actions.ts:696 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:696 reads: const owns = await isTripOwner(id, userId); |
| file:line client/src/pages/expert/workspace.tsx:222-226 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | findIndex is not on the cited lines. It is at client/src/pages/expert/workspace.tsx:1214. |
| file:line client/src/pages/expert/workspace.tsx:2695-2708 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2695-2708 reads: if (noteSaveStatus === "saving" \|\| travelerNoteSaveStatus === "saving") { |
| file:line commission.ts:176 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/commission.ts:176 reads: return "default"; |
| file:line commission.ts:216 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/commission.ts:216 reads: * AMOUNT is read from this band (Phase 3.4); the 75/25 split is applied |
| file:line commission.ts:38-39 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/commission.ts:38-39 reads: import { |
| file:line commission.ts:48-49 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/commission.ts:48-49 reads: export { |
| file:line content.routes.ts:5711 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/content.routes.ts:5711 reads: res.json({ activities, city: cityName, count: activities.length }); |
| file:line expert-workspace.routes.ts:40 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | requireExpert is not on the cited lines. It is at server/routes/expert-workspace.routes.ts:46. |
| file:line experts.routes.ts:606 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/experts.routes.ts:606 reads: if (!updated) return res.status(404).json({ message: "Request not found" }); |
| file:line handler server/routes.ts:2033 for GET /api/provider/services | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:3256. |
| file:line handler server/routes.ts:8706 for GET /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:13338. |
| file:line handler server/routes.ts:8784 for POST /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes.ts:13414. |
| file:line handler server/routes/booking-actions.ts:1050 for GET /api/trips/:tripId/traveler-profile | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1298. |
| file:line handler server/routes/booking-actions.ts:1114 for PATCH /api/expert/assignments/:id/workspace-status | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1375. |
| file:line handler server/routes/booking-actions.ts:1488 for GET /api/trips/:tripId/my-assignment | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1817. |
| file:line handler server/routes/booking-actions.ts:1502 for GET /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1836. |
| file:line handler server/routes/booking-actions.ts:1523 for PATCH /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1861. |
| file:line handler server/routes/booking-actions.ts:1541 for GET /api/trips/:tripId/commission | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/booking-actions.ts:1882. |
| file:line handler server/routes/content.routes.ts:5711 for GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/content.routes.ts:6611. |
| file:line handler server/routes/content.routes.ts:5730 for GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Mounted handler is server/routes/content.routes.ts:6633. |
| file:line itinerary-intelligence.service.ts:343-362 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | optimizeOrder is not on the cited lines. It is at server/services/itinerary-intelligence.service.ts:330. |
| file:line itinerary-optimizer.ts:1206 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/itinerary-optimizer.ts:1206 reads: variantId: baselineVariant[0].id, |
| file:line routes.ts:3973-3975 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:3973-3975 reads: serviceId: owned.service.id, |
| file:line routes.ts:719 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:719 reads: if (!plan) return { tollRunId }; |
| file:line routes.ts:8938 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:8938 reads: |
| file:line server/routes.ts:2033 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:2033 reads: }); |
| file:line server/routes.ts:3973-3975 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:3973-3975 reads: serviceId: owned.service.id, |
| file:line server/routes.ts:4637 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | createTripExpertAdvisor is not on the cited lines. It is at server/routes.ts:8079. |
| file:line server/routes.ts:719 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | fee_bands is not on the cited lines. It is at server/routes.ts:7880. |
| file:line server/routes.ts:8706 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes.ts:8706 reads: // is the SAME one the pre-check reads (§18 rule 1), so the two can never disagree, and |
| file:line server/routes.ts:8784 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | isExpertAssignedToTrip is not on the cited lines. It is at server/routes.ts:12082. |
| file:line server/routes/admin.routes.ts:5655-5712 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | confirmLeadAssignmentHandler is not on the cited lines. It is at server/routes/admin.routes.ts:9027. |
| file:line server/routes/booking-actions.ts:1050 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1050 reads: */ |
| file:line server/routes/booking-actions.ts:1114 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1114 reads: return res.status(400).json({ error: 'type and title are required' }); |
| file:line server/routes/booking-actions.ts:1114-1138 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | updateExpertAssignmentWorkspaceStatus is not on the cited lines. It is at server/routes/booking-actions.ts:1416. |
| file:line server/routes/booking-actions.ts:1119-1123 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | in_review is not on the cited lines. It is at server/routes/booking-actions.ts:1381. |
| file:line server/routes/booking-actions.ts:1488 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getExpertAssignedTrips is not on the cited lines. It is at server/routes/booking-actions.ts:904. |
| file:line server/routes/booking-actions.ts:1502 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getTripExpertAdvisoryAssignment is not on the cited lines. It is at server/routes/booking-actions.ts:1821. |
| file:line server/routes/booking-actions.ts:1523 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1523 reads: // expert has ever advised this trip we take the most recently assigned), then flip it with |
| file:line server/routes/booking-actions.ts:1541 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | canMutateTrip is not in server/routes/booking-actions.ts. Cited line now reads: // pays the expert and returns the pen; request changes spends one of the two included rounds and |
| file:line server/routes/booking-actions.ts:1611 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/booking-actions.ts:1611 reads: console.error('[PlanReview] expert notify failed (non-fatal):', notifyErr); |
| file:line server/routes/content.routes.ts:5711 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/content.routes.ts:5711 reads: res.json({ activities, city: cityName, count: activities.length }); |
| file:line server/routes/content.routes.ts:5730 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/content.routes.ts:5730 reads: |
| file:line server/routes/experts.routes.ts:606 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/experts.routes.ts:606 reads: if (!updated) return res.status(404).json({ message: "Request not found" }); |
| file:line server/routes/payments.routes.ts:835 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | serviceExpertPct is not in server/routes/payments.routes.ts. Cited line now reads: // and the client must NOT call stripe.confirmPayment with the clientSecret. `requiresAction` |
| file:line server/services/admin-query.service.ts:807 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/admin-query.service.ts:807 reads: .orderBy(desc(serviceReviews.createdAt)); |
| file:line server/services/commission.ts:379 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | resolveCommissionRates is not on the cited lines. It is at server/services/commission.ts:615. |
| file:line server/services/commission.ts:38-39 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/commission.ts:38-39 reads: import { |
| file:line server/services/commission.ts:48-49 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | EXPERT_SHARE_RATE is not on the cited lines. It is at server/services/commission.ts:98. |
| file:line server/services/transport-gap.service.ts:107 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | analyzeTransportGaps is not on the cited lines. It is at server/services/transport-gap.service.ts:110. |
| file:line server/storage.ts:4815 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | trip_expert_advisors is not in server/storage.ts. Cited line now reads: // guard, never a check-then-insert). `inserted` is what a caller gates a non-idempotent |
| file:line server/utils/trip-role.ts:30 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/utils/trip-role.ts:30 reads: export async function getTripRole(tripId: string, userId: string): Promise<TripRole> { |
| file:line shared/schema.ts:6239 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | expertShareRate is not in shared/schema.ts. Cited line now reads: // FD-2 (migration 361; ledger `2026-10-09-fd2-content-tier-tags`): content-tier tags. Nullable, no |
| file:line smart-sequencing.service.ts:1400 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/services/smart-sequencing.service.ts:1400 reads: activityId: undefined, |
| file:line smart-sequencing.service.ts:1824 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | applyEnergyBalancing is not on the cited lines. It is at server/services/smart-sequencing.service.ts:1916. |
| file:line storage.ts:4795 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | getExpertAssignedTrips is not in server/storage.ts. Cited line now reads: const [newNotification] = await db.insert(notifications).values(notification).returning(); |
| file:line trips.routes.ts:1396 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line server/routes/trips.routes.ts:1396 reads: // `planDatesAreConfirmed` (`shared/plan-dates.ts`), shared with every other reader. |
| file:line workspace.tsx:2546 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2546 reads: optimization: "Optimization", |
| file:line workspace.tsx:2553 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2553 reads: // side state an admin resolves — but it must never render as a raw token. |
| file:line workspace.tsx:2641 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2641 reads: queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] }); |
| file:line workspace.tsx:2695-2708 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2695-2708 reads: if (noteSaveStatus === "saving" \|\| travelerNoteSaveStatus === "saving") { |
| file:line workspace.tsx:2699 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:2699 reads: setLocation(path); |
| file:line workspace.tsx:2715 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | autoSaveNotesMutation is not on the cited lines. It is at client/src/pages/expert/workspace.tsx:2601. |
| file:line workspace.tsx:3735 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:3735 reads: onClick={() => setPartnerSubTab("networks")} |
| file:line workspace.tsx:3735-3939 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | No code symbol was named beside the citation. Line client/src/pages/expert/workspace.tsx:3735-3939 reads: onClick={() => setPartnerSubTab("networks")} |
| guard `isAuthenticated` on GET /api/expert/assigned-trips | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:899 still authenticates. |
| guard `isAuthenticated` on GET /api/provider/services | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes.ts:3256 still authenticates. |
| guard `isAuthenticated` on GET /api/trips/:tripId/commission | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1882 still authenticates. |
| guard `isAuthenticated` on GET /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1836 still authenticates. |
| guard `isAuthenticated` on GET /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes.ts:13338 still authenticates. |
| guard `isAuthenticated` on GET /api/trips/:tripId/my-assignment | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1817 still authenticates. |
| guard `isAuthenticated` on GET /api/trips/:tripId/traveler-profile | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1298 still authenticates. |
| guard `isAuthenticated` on PATCH /api/expert/assignments/:id/workspace-status | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1375 still authenticates. |
| guard `isAuthenticated` on PATCH /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes/booking-actions.ts:1861 still authenticates. |
| guard `isAuthenticated` on POST /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Handler at server/routes.ts:13414 still authenticates. |
| guard none (public) on GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6611 requires a session. |
| guard none (public) on GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | Inventory says public. Handler at server/routes/content.routes.ts:6633 requires a session. |
| route /api/admin/leads/:expertRequestId/confirm | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted (POST). |
| route /expert/workspace/:tripId | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Client Route or Redirect matches /expert/workspace/:p. |
| route GET /api/expert/assigned-trips | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:899. |
| route GET /api/geocode | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/content.routes.ts:6611. |
| route GET /api/provider/services | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:3256. |
| route GET /api/search/experiences | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/content.routes.ts:6633. |
| route GET /api/trips/:tripId/commission | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1882. |
| route GET /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1836. |
| route GET /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:13338. |
| route GET /api/trips/:tripId/my-assignment | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1817. |
| route GET /api/trips/:tripId/traveler-profile | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1298. |
| route GET /api/trips/:tripId/workspace-constraints | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:2000. |
| route PATCH /api/expert/assignments/:assignmentId/workspace-status | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1375. |
| route PATCH /api/expert/assignments/:id/workspace-status | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1375. |
| route PATCH /api/expert/bookings/:id/status | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:8100. |
| route PATCH /api/trips/:tripId/expert-notes | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:1861. |
| route POST /api/admin/routing-queue/:requestId/confirm | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/admin.routes.ts:9097. |
| route POST /api/expert-forms | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:2796. |
| route POST /api/trips/:tripId/calculate-energy | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:2140. |
| route POST /api/trips/:tripId/generate-presets | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes/booking-actions.ts:2199. |
| route POST /api/trips/:tripId/itinerary-items | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:13414. |
| route POST /api/trips/:tripId/itinerary/optimize-order | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Mounted at server/routes.ts:13728. |
| test pin A1 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:351 "A1-403: non-admin confirm is 403; no advisor row, lead status unchanged". |
| test pin A1-403 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:351 "A1-403: non-admin confirm is 403; no advisor row, lead status unchanged". |
| test pin A1-PF | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:363 "A1-PF: induced insert failure rolls back the whole bridge — neither write lands". |
| test pin A1-TX | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:374 "A1-TX: admin confirm writes the advisor row AND flips the lead in one transaction". |
| test pin A2 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:172 "A2: empty-body PATCH is a 400 and the DB status is untouched". |
| test pin A4 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:289 "A4: workspace-constraints is mounted and assignment-gated". |
| test pin A5 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | Covered outside the console-sigma file by server/services/__tests__/expert-split-band.db.test.ts, server/__tests__/trip-commission-band-edit.http.test.ts, server/services/__tests__/experience-cart-band.db.test.ts. |
| test pin console-sigma-workspace-machine.http.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File is server/__tests__/console-sigma-workspace-machine.http.test.ts. |
| test pin D6a | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:265 "D6a: the delivered flip minted no R7 credit for a fixture with no paid expert_requests". |
| test pin experience-cart-band.db.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File is server/services/__tests__/experience-cart-band.db.test.ts. |
| test pin expert-split-band.db.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File is server/services/__tests__/expert-split-band.db.test.ts. |
| test pin K1 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:201 "K1: smuggled status:'approved' is stripped by the guard; fresh submission lands status='pending'". |
| test pin K2 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:226 "K2: approving a nonexistent application is a 404". |
| test pin K3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | drifted | server/__tests__/console-sigma-kyoto-bench.http.test.ts:239 is "K3: a Kyoto local expert cannot be approved without a city-knowledge pass". The inventory says K3 approves the form and flips users.role to local_expert. The test now expects 409 city-knowledge and leaves the role traveler. |
| test pin K4 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-kyoto-bench.http.test.ts:263 "K4: durable Kyoto bench fixture exists via the full lifecycle (reconciling, idempotent)". |
| test pin L1 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:216 "L1: draft→in_review wrote one workspace_status_transition diary row (itemId NULL, actor=expert)". |
| test pin L2 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:232 "S2+M2+L2: explicit legal target in_review→delivered still works and is diarised". |
| test pin L3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:248 "M3+L3: delivered is terminal; rejected advances leave status and diary frozen". |
| test pin M1/S1 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:206 "S1+S3: intent:'advance' with a lying workspaceStatus lands the SERVER-derived next state". |
| test pin M2/S2 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:232 "S2+M2+L2: explicit legal target in_review→delivered still works and is diarised". |
| test pin M3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:248 "M3+L3: delivered is terminal; rejected advances leave status and diary frozen". |
| test pin M4 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:193 "M4: draft → delivered jump is rejected; DB fact unchanged". |
| test pin M5 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:183 "M5: non-owning expert gets 403; status and diary untouched". |
| test pin M6 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:277 "M6: stale expectedCurrentStatus precondition writes neither status nor diary row". |
| test pin R22 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-reorder-divergence.db.test.ts:74 "R22 EXPECTED DIVERGENCE: optimizeOrder reorders a non-flexible anchor by energy weight". |
| test pin S3 | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | server/__tests__/console-sigma-workspace-machine.http.test.ts:206 "S1+S3: intent:'advance' with a lying workspaceStatus lands the SERVER-derived next state". |
| test pin server/__tests__/console-sigma-kyoto-bench.http.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File exists. |
| test pin server/__tests__/console-sigma-reorder-divergence.db.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File exists. |
| test pin server/__tests__/console-sigma-workspace-machine.http.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File exists. |
| test pin trip-commission-band-edit.http.test.ts | docs/testing/CONSOLE_SIGMA_AUDIT.md | holds | File is server/__tests__/trip-commission-band-edit.http.test.ts. |
| test pin boundaryTotals admin-role 198, session-self 369, resource-owner 102, signature 6, public-or-system 53, unknown 0 | scripts/mutation-auth/extractor.test.ts | holds | Manifest matches the assertion, and the live unique tally is {"admin-role":198,"resource-owner":102,"session-self":369,"public-or-system":53,"signature":6}. These totals follow the override map, including the three boundaries whose handlers no longer match the map. |
| test pin categoryTotals payments 31, admin 198, user-data 251, other 248 | scripts/mutation-auth/extractor.test.ts | holds | Manifest {"payments":31,"admin":198,"user-data":251,"other":248}; live unique tally {"admin":198,"other":248,"user-data":251,"payments":31}. |
| test pin POST /api/admin/experts/:userId/remind-stripe → admin-role | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it admin / admin-role at server/routes/admin.routes.ts:3615. |
| test pin POST /api/admin/payouts → admin / admin-role | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it admin / admin-role at server/routes/admin.routes.ts:6076. |
| test pin POST /api/admin/payouts/:id/mark-paid → admin / admin-role | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it admin / admin-role at server/routes/admin.routes.ts:6421. |
| test pin POST /api/admin/providers/:userId/remind-stripe → admin-role | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it admin / admin-role at server/routes/admin.routes.ts:3619. |
| test pin POST /api/bookings/process-cart → payments / session-self | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it payments / session-self at server/routes/bookings.ts:162. |
| test pin POST /api/coordination-states/:id/pay → resource-owner | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it payments / resource-owner at server/routes.ts:11568. |
| test pin POST /api/trips → user-data / public-or-system | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it user-data / public-or-system at server/routes.ts:1456. |
| test pin POST /api/webhooks/stripe → signature | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it payments / signature at server/routes/webhooks.routes.ts:535. |
| test pin PUT /api/me/payout-setup → user-data / session-self | scripts/mutation-auth/extractor.test.ts | holds | Extractor classifies it user-data / session-self at server/routes/payments.routes.ts:3198. |
| test pin rawRegistrationCount 736 | scripts/mutation-auth/extractor.test.ts | holds | Live mount walk returned 736 mutation registrations (GET excluded). |
| test pin uniqueMethodNormalizedPathCount 728 | scripts/mutation-auth/extractor.test.ts | holds | Live unique method+path count is 728. |
| guard admin-role on PATCH /api/admin/payouts/:id | scripts/mutation-auth/extractor.ts | holds | admin.routes.ts:6182 is behind the admin guard. |
| guard admin-role on POST /api/admin/payouts | scripts/mutation-auth/extractor.ts | holds | admin.routes.ts:6076 is behind the admin guard. |
| guard admin-role on POST /api/admin/ready-made/disputes/:purchaseId/refund | scripts/mutation-auth/extractor.ts | holds | admin.routes.ts:1627 is behind the admin guard. |
| guard public-or-system on POST /api/trips | scripts/mutation-auth/extractor.ts | drifted | The override comment says guest creation is public and mints a share token. The live handler at server/routes.ts:1456 returns 401 Sign in to create a plan when getUserId is empty. The shadowed twin at server/routes/trips.routes.ts:571 still contains the old guest branch and does not serve. |
| guard public-or-system on POST /api/waitlist | scripts/mutation-auth/extractor.ts | holds | launch-waitlist.routes.ts:53 is a rate-limited public form. getUserId is optional and only refuses a self-referral. |
| guard public-or-system on POST /api/waitlist/unsubscribe | scripts/mutation-auth/extractor.ts | holds | launch-waitlist.routes.ts:104 revokes by token. No session is required. |
| guard resource-owner on POST /api/bookings/:id/confirm-completion | scripts/mutation-auth/extractor.ts | holds | bookings.ts:781 checks ownership before completion. |
| guard resource-owner on POST /api/bookings/:id/dispute | scripts/mutation-auth/extractor.ts | holds | bookings.ts:859 checks ownership before opening a dispute. |
| guard resource-owner on POST /api/bookings/:id/pay-balance | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:2478 checks the booking owner. |
| guard resource-owner on POST /api/bookings/confirm-payment | scripts/mutation-auth/extractor.ts | holds | bookings.ts:265 returns 403 when cart.owned is false. |
| guard resource-owner on POST /api/bookings/refund | scripts/mutation-auth/extractor.ts | holds | bookings.ts:677 refuses a non-owner who is not an admin. |
| guard resource-owner on POST /api/contracts/:id/milestone | scripts/mutation-auth/extractor.ts | holds | routes.ts:13161 checks the contract owner. |
| guard resource-owner on POST /api/contracts/:id/payment | scripts/mutation-auth/extractor.ts | holds | routes.ts:13143 checks the contract owner. |
| guard resource-owner on POST /api/coordination-states/:id/pay | scripts/mutation-auth/extractor.ts | holds | routes.ts:11568 charges the coordination owner. |
| guard resource-owner on POST /api/coordination-states/:id/pay/confirm | scripts/mutation-auth/extractor.ts | holds | routes.ts:11792 confirms the owner's coordination payment. |
| guard resource-owner on POST /api/coordination-states/:id/refund | scripts/mutation-auth/extractor.ts | drifted | routes.ts:11868 is admin-only (role !== admin returns 403). The map still says resource-owner. |
| guard resource-owner on POST /api/expert-requests/payment-intent | scripts/mutation-auth/extractor.ts | holds | booking-actions.ts:135 returns 403 when ownerUserId is not the session. |
| guard resource-owner on POST /api/expert/:expertId/tip | scripts/mutation-auth/extractor.ts | drifted | routes.ts:6222 is isAuthenticated and then an unconditional 501. It does not check that the caller owns a tippable relationship. |
| guard resource-owner on POST /api/optimization-payments | scripts/mutation-auth/extractor.ts | holds | optimization.routes.ts:402 checks plan ownership before payment. |
| guard resource-owner on POST /api/optimization-payments/confirm | scripts/mutation-auth/extractor.ts | holds | optimization.routes.ts:641 confirms only the owner's payment. |
| guard resource-owner on POST /api/participants/:id/payment | scripts/mutation-auth/extractor.ts | holds | content.routes.ts:7323 checks the participant's payer. |
| guard resource-owner on POST /api/ready-made/:id/purchase/confirm | scripts/mutation-auth/extractor.ts | holds | ready-made.routes.ts:1498 requires PaymentIntent metadata buyerId to be the session user. |
| guard resource-owner on POST /api/ready-made/purchases/:id/concern | scripts/mutation-auth/extractor.ts | holds | ready-made.routes.ts:1588 updates only where buyerId is the session user. |
| guard resource-owner on POST /api/ready-made/purchases/:id/request-revision | scripts/mutation-auth/extractor.ts | holds | ready-made.routes.ts:1744 returns 404 unless purchase.buyerId is the session user. |
| guard resource-owner on PUT /api/provider/services/:id/surcharge-tiers | scripts/mutation-auth/extractor.ts | holds | routes.ts:3614 writes tiers only for the service owner. |
| guard session-self on DELETE /api/me/payment-methods/:id | scripts/mutation-auth/extractor.ts | holds | payment-methods.routes.ts:85 deletes the session user's method. |
| guard session-self on POST /api/bookings/process-cart | scripts/mutation-auth/extractor.ts | holds | bookings.ts:162 takes the actor from the session and never from the body. |
| guard session-self on POST /api/checkout | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:1142 uses isAuthenticated and the session user. |
| guard session-self on POST /api/credits/purchase | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:286 purchases credits for the session user. |
| guard session-self on POST /api/me/payment-methods/default | scripts/mutation-auth/extractor.ts | holds | payment-methods.routes.ts:66 updates the session user's default. |
| guard session-self on POST /api/me/payment-methods/setup-intent | scripts/mutation-auth/extractor.ts | holds | payment-methods.routes.ts:50 is the session user's own setup intent. |
| guard session-self on POST /api/payouts/request | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:3225 requests a payout for the session earner. |
| guard session-self on POST /api/ready-made/:id/purchase | scripts/mutation-auth/extractor.ts | holds | ready-made.routes.ts:1386 buys as the session user. |
| guard session-self on POST /api/stripe/connect/onboard | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:2997 onboards the session earner. |
| guard session-self on POST /api/wallet/add-credits | scripts/mutation-auth/extractor.ts | holds | payments.routes.ts:280 credits the session user. |
| guard signature on POST /api/bookings/webhooks/stripe | scripts/mutation-auth/extractor.ts | holds | bookings.ts createPlatformStripeWebhookHandler calls stripe.webhooks.constructEvent. |
| guard signature on POST /api/webhooks/stripe | scripts/mutation-auth/extractor.ts | holds | webhooks.routes.ts createConnectStripeWebhookHandler calls stripe.webhooks.constructEvent on the stripe-signature header. |
| route DELETE /api/me/payment-methods/:id | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payment-methods.routes.ts:85. |
| route PATCH /api/admin/payouts/:id | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/admin.routes.ts:6182. |
| route POST /api/admin/payouts | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/admin.routes.ts:6076. |
| route POST /api/admin/ready-made/disputes/:purchaseId/refund | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/admin.routes.ts:1627. |
| route POST /api/bookings/:id/confirm-completion | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:781. |
| route POST /api/bookings/:id/dispute | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:859. |
| route POST /api/bookings/:id/pay-balance | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:2478. |
| route POST /api/bookings/confirm-payment | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:265. |
| route POST /api/bookings/process-cart | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:162. |
| route POST /api/bookings/refund | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:658. |
| route POST /api/bookings/webhooks/stripe | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/bookings.ts:652. |
| route POST /api/checkout | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:1142. |
| route POST /api/contracts/:id/milestone | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:13161. |
| route POST /api/contracts/:id/payment | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:13143. |
| route POST /api/coordination-states/:id/pay | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:11568. |
| route POST /api/coordination-states/:id/pay/confirm | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:11792. |
| route POST /api/coordination-states/:id/refund | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:11868. |
| route POST /api/credits/purchase | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:286. |
| route POST /api/expert-requests/payment-intent | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/booking-actions.ts:118. |
| route POST /api/expert/:expertId/tip | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:6222. |
| route POST /api/me/payment-methods/default | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payment-methods.routes.ts:66. |
| route POST /api/me/payment-methods/setup-intent | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payment-methods.routes.ts:50. |
| route POST /api/optimization-payments | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/optimization.routes.ts:402. |
| route POST /api/optimization-payments/confirm | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/optimization.routes.ts:641. |
| route POST /api/participants/:id/payment | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/content.routes.ts:7323. |
| route POST /api/payouts/request | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:3225. |
| route POST /api/ready-made/:id/purchase | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/ready-made.routes.ts:1386. |
| route POST /api/ready-made/:id/purchase/confirm | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/ready-made.routes.ts:1481. |
| route POST /api/ready-made/purchases/:id/concern | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/ready-made.routes.ts:1576. |
| route POST /api/ready-made/purchases/:id/request-revision | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/ready-made.routes.ts:1729. |
| route POST /api/stripe/connect/onboard | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:2997. |
| route POST /api/trips | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:1456 and server/routes/trips.routes.ts:571. |
| route POST /api/waitlist | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/launch-waitlist.routes.ts:53. |
| route POST /api/waitlist/unsubscribe | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/launch-waitlist.routes.ts:104. |
| route POST /api/wallet/add-credits | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/payments.routes.ts:280. |
| route POST /api/webhooks/stripe | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes/webhooks.routes.ts:535. |
| route PUT /api/provider/services/:id/surcharge-tiers | scripts/mutation-auth/extractor.ts | holds | Mounted at server/routes.ts:3614. |
