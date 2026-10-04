# Part 3 preflight and Phase 0 reuse check — 2026-10-04

## Preserved baseline
Task branch: task-cart-wishlist-part3, reconciled with current origin/main and the reviewed remote Part 1–2 branch. The migration-list conflict was resolved by preserving both full filenames; the ledger keys on complete filenames, not numeric prefixes. No Part 3 automation code or new migration has been implemented.
Fresh checks: 14 contract/render checks, 8 Part 1 rollback-only DB checks, 20 Part 2 DB checks passed. Transport was intercepted: these are not new live receipt evidence. Live certification still needs actual provider-delivered receipts for the built Part 3 nodes.

## Discovery answers
1. Abandonment: cart_items stores lines and created_at, but no authoritative abandoned_at, activity threshold or cart-left producer exists. Stripe abandoned-payment cleanup is not cart abandonment. A durable cart activity/episode tracker and an explicit idle policy are required.
2. Prices: pricing_intelligence is service/destination-level market statistics, not item price history. saved_items stores identity/display data, not a watched price. cache.service.verifyActivityAvailability compares cached/current Viator activity prices; storage.registerAffiliateProductContent records previous/new price and active state in content versions. Neither produces durable wishlist-drop events or connects to saved_items. Extend these real catalog producers, persist currency/basis-comparable price events, and deduplicate saved-item delivery per event. Exact percent boundaries must use decimal/cents arithmetic, not approximate floats or market averages.
3. Guests: discover/cart keep unauthenticated pending service IDs in traveloure_guest_cart_pending localStorage. After authentication, cart.tsx migrates them using authenticated POST /api/cart. The cart resolves to the authenticated account email then—not an anonymous checkout email field. Checkout is authenticated. Retain this real association, or explicitly authorize a new guest session/email/consent capture flow.
Receipt inbox: reuse the approved development ITINERARY_OUTCOME_TEST_EMAIL; no new variable is needed. No recipient value is included here; production settings remain unchanged.

## Minimal prerequisites proposed — not approved or implemented
- Durable cart episode/activity/abandonment state alongside the existing cart projection writer. Do not create a second cart_items writer. An idle threshold must be explicitly approved before marking abandoned; reminder delays begin after abandonment.
- Durable authoritative price/availability change events extending existing producers. Match actual saved-item identities and same-currency/comparable price basis; no fabricated prices for unpriced items.
- Persisted saved-search criteria, opt-in, baseline/match history and once-per-local-day delivery through the shared outbox. No saved-search subscription/match-alert implementation was found.
- Reuse existing sign-in email linking, or add guest checkout capture only after the operator approves that additional flow.
Suggested idle policy: 30 minutes without cart activity, then +1h/+1d/+3d reminders (first reminder 90 minutes after the last activity). This is a proposal, not a discovered existing rule.

## Phase 0 mapping
| Requested intent | Existing matching node | Plan |
|---|---|---|
| cart_reminder_1h | None | New intent definition; reuse outbox scheduling/delivery |
| cart_reminder_1d | None | New intent definition in the same bounded cart sequence |
| cart_reminder_3d | None | New intent definition; terminal third reminder |
| cart_item_changed | None | New intent definition; extend actual catalog/availability producers |
| saved_search_alert | None | New intent definition; requires persisted subscriptions and match history |
| wishlist_price_drop | None | New intent definition; extend real price/version producers and saved-item references |

Existing messaging.activity-email, messaging.notification-create and guest-invite-send have different business intents; their generic delivery capabilities do not constitute existing cart/wishlist automations. Reuse messaging.email-outbox-enqueue, email-outbox-drain, email-provider-transport and the established shared registry runtime. Payment checkout-claim sweep expires unpaid booking claims, not shopping carts.

## Complete current registry inventory (89 nodes)

### bookingAutomationRegistry (17)
- bookings.auto-completion — Unified paid booking auto-completion
- bookings.declared-window-close — Close elapsed declared booking completion windows
- bookings.artifact-acceptance — Artifact acceptance prompt and escalation
- bookings.coordination-window-close — Close elapsed coordination completion windows
- bookings.completion-ledger-reconciliation — Repair missing ledgers for completed bookings
- bookings.legacy-payment-expiry — Expire stale legacy pending-payment bookings
- bookings.earner-no-response-notice — Notify travelers about unanswered booking requests
- bookings.trip-card-handover-nudge — Nudge trip owner to review the Trip Card
- bookings.occasion-drafts — Generate eligible Plus occasion trip drafts
- bookings.availability-horizon-materialization — Extend recurring service availability horizon
- bookings.availability-pattern-authoring — Materialize slots after weekly-pattern save
- bookings.availability-date-range-authoring — Materialize and reprice slots after date-range save
- bookings.availability-blackout-authoring — Re-run availability materializers after blackout save
- bookings.completion-writer — Shared service-booking completion writer
- bookings.completion-declaration-writer — Shared booking completion declaration writer
- bookings.provider-acceptance-follow-on — Provider acceptance status and traveler notice
- bookings.cancellation-follow-ons — Shared booking cancellation follow-ons and slot release

### messagingAutomationRegistry (23)
- messaging.email-outbox-enqueue — Enqueue and immediately attempt transactional email delivery
- messaging.email-outbox-drain — Drain due transactional email outbox rows
- messaging.email-outbox-admin-retry — Drain email outbox after an administrator retry
- messaging.push-notification-dispatch — Attempt immediate phone push for a notification
- messaging.push-notification-sweep — Sweep recent notifications for unclaimed phone push
- messaging.auth-password-reset-email — Send password-reset email
- messaging.auth-verification-email — Send email-verification email
- messaging.auth-welcome-email — Send account welcome email
- messaging.plan-delivered-email — Notify traveler that a plan was delivered
- messaging.itinerary-failed-email — Notify traveler that itinerary generation failed
- messaging.plan-approved-email — Notify expert that a delivered plan was approved
- messaging.plan-changes-requested-email — Notify expert that plan changes were requested
- messaging.plan-suggestion-email — Notify traveler of an expert plan suggestion
- messaging.activity-email — Enqueue earner activity email
- messaging.guest-invite-send — Enqueue guest invitation emails
- messaging.email-provider-transport — Submit email through configured Resend client
- messaging.chat-follow-ons — Schedule recipient notification and activity email after shared chat persistence
- messaging.message-follow-ons — Schedule direct-message notification and activity email after message persistence
- messaging.notification-create — Dispatch the existing notification phone twin after bell-row creation
- messaging.chat-realtime-fanout — Relay an already-persisted chat frame to the recipient socket
- messaging.itinerary-nudge-2h — Send itinerary_nudge_2h
- messaging.itinerary-followup-24h — Send itinerary_followup_24h
- messaging.itinerary-reengagement-5d — Send itinerary_reengagement_5d

### moderationAutomationRegistry (11)
- moderation.claim-submit-score — Score submitted neighborhood claim
- moderation.claim-score-hourly — Neighborhood claim scorer authoritative hourly pass
- moderation.claim-score-warm — Neighborhood claim scorer warm-instance defense pass
- moderation.verification-held-listing-activation — Activate approved listings held for owner verification
- moderation.pending-report-admin-notification — Notify admins of a newly pending message or user report
- moderation.content-flag-created — Persist a generic content flag and mark its content registry row flagged
- moderation.suspension-session-cleanup — Purge sessions and close live sockets after a persisted manual suspension
- moderation.password-reset-session-purge — Invalidate sessions atomically after password reset
- moderation.rate-limiter-cleanup — Evict expired in-memory request rate-limit entries
- moderation.internal-jobs-limiter-cleanup — Evict expired internal-job limiter state
- moderation.message-rate-limiter-cleanup — Evict expired messaging limiter entries

### paymentAutomationRegistry (30)
- payments.stripe-reconciliation — Stripe reconciliation
- payments.stripe-reconciliation-manual — Admin-requested Stripe reconciliation
- payments.checkout-claim-sweep — Checkout claim expiry and stale authorization sweep
- payments.checkout-paid-promotion — Shared cart paid-checkout promotion
- payments.balance-paid-promotion — Balance-payment paid promotion
- payments.platform-late-success-refund — Late success refund for failed booking
- payments.earnings-release — Matured earnings release
- payments.travelpayouts-report-poll — Travelpayouts affiliate report poll
- payments.bundle-partial-settlement — Bundle partial-settlement recovery sweep
- payments.partnerize-campaign-sync — Conditional Partnerize campaign sync
- payments.partnerize-report-poll — Conditional Partnerize conversion report poll
- payments.stripe-connect-reminder — Stripe Connect onboarding reminder
- payments.platform-payment-intent-succeeded — Platform PaymentIntent succeeded
- payments.ready-made-purchase-fulfilment — Shared ready-made purchase fulfilment
- payments.platform-legacy-booking-success — Platform legacy booking success
- payments.platform-payment-intent-failed — Platform PaymentIntent failed
- payments.platform-payment-intent-canceled — Platform PaymentIntent canceled
- payments.platform-payment-intent-requires-action — Platform PaymentIntent requires customer action
- payments.platform-charge-refunded — Platform charge refund receipt and protection
- payments.platform-checkout-session-completed — Platform checkout session completed
- payments.platform-subscription-membership — Platform Stripe subscription membership synchronization
- payments.connect-payment-intent-succeeded — Connected-account PaymentIntent succeeded and revenue record
- payments.connect-payment-intent-failed — Connected-account PaymentIntent failed
- payments.connect-dispute-lifecycle — Connected-account Stripe dispute lifecycle
- payments.connect-transfer-status — Connected-account transfer status callback
- payments.platform-stripe-dispute-lifecycle — Platform Stripe dispute lifecycle
- payments.platform-stripe-bank-payout-alert — Platform Stripe bank-payout alert
- payments.affiliate-booking-purchase-ledger — Affiliate agent-booking purchase ledger entry
- payments.affiliate-admin-reconciliation-view — Admin affiliate reconciliation view and matching
- payments.affiliate-exact-report-adoption — Affiliate exact attribution-token report adoption

### providerAutomationRegistry (8)
- provider.application-bio-mirror — Mirror submitted application biography to the account profile
- provider.expert-application-neighborhood-stamp — Stamp the existing new-expert no-neighborhoods state
- provider.expert-application-decision-follow-ons — Run existing expert application decision follow-ons
- provider.provider-application-decision-follow-ons — Run existing provider application decision follow-ons
- provider.expert-rejection-feedback-notification — Notify expert after existing rejection feedback edit
- provider.provider-rejection-feedback-follow-ons — Run existing provider rejection feedback notice and email
- provider.verification-decision-email — Send existing provider verification decision email
- provider.listing-review-decision-notification — Insert existing provider listing review decision notification

## Status
Preflight discovery and Phase 0 mapping recorded. Missing foundations/policy are awaiting approval. Part 3 is not built or certified; no deferred requirement is being labeled satisfied.