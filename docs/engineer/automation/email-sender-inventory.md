# Email sender inventory

Read-only inventory of every path under `server/` and `shared/` that can enqueue into `email_outbox` or call `sendEmail` / `client.emails.send`. Searched with:

```
rg -n "enqueueEmail|sendEmail\(|email_outbox|emailOutbox" server shared
```

Line numbers are from this branch. `shared/` has the `email_outbox` table (`shared/schema.ts`) and the `waitlist_apply_invite` type constant. It has no sender.

`EMAIL_TEMPLATE_ALLOWLIST` applies only to outbox delivery. Rows in the first table stay held until their `email_type` is listed and `EMAIL_SENDS_ENABLED=true`. The two bypass tables are not gated by the allowlist.

`authCritical` is yes when the type is in `AUTH_EMAIL_TYPES` (`password_reset`, `email_verification` in `server/services/email-outbox.service.ts`) or `metadata.authCritical` is true. Those two writers set that flag. Auth-critical rows are not exempt from either gate.

`enqueueEmail` defaults a missing `emailType` to `generic` (`outboxInsertValues`). No production caller omits `emailType`.

## Through the outbox (31 rows)

The drain (`drainOutbox`, every 5 minutes, and `POST /internal/jobs/email-outbox`) claims due `pending` / `failed` / `held` rows and expired `processing` leases whose `email_type` is on the allowlist. `enqueueEmail` also attempts delivery immediately after insert. A kick (`deliverQueuedEmail` / `kickLegacyConfirmationDelivery`) is the same delivery path.

| email_type | template / function | trigger and how often | recipient | authCritical | drain | test |
| --- | --- | --- | --- | --- | --- | --- |
| `password_reset` | `sendPasswordResetEmailAction` `server/services/email.service.ts:807` via `enqueueTransactionalEmail` | Traveler submits forgot-password (`server/replit_integrations/auth/emailAuth.ts:376`). Once per issued token; a repeat of the same token dedupes. | user | yes | yes | `server/__tests__/critical-email-outbox.test.ts`, `server/__tests__/email-outbox.test.ts`, `server/__tests__/verified-email-password-reset.db.test.ts` |
| `email_verification` | `sendEmailVerificationEmailAction` `server/services/email.service.ts:883` | Account verification dispatch (`server/services/email-verification.service.ts:191` and `:210`). Once per issued link. | user | yes | yes | `server/__tests__/signup-verification-email-gate.db.test.ts`, `server/__tests__/critical-email-outbox.test.ts` |
| `cancellation_refund` | `sendBookingCancellationWithRefundEmail` `server/services/email.service.ts:1119` | Traveler cancellation that records a refund (`server/routes.ts:7916`). Once per booking cancellation. | user | no | yes | `server/__tests__/critical-email-outbox.test.ts` |
| `payment_failed` | `sendPaymentFailedEmail` `server/services/email.service.ts:1702` | Checkout claim calls it (`server/services/checkout-claim.service.ts:1509`; the local name is `sendEmail`). Once per failed booking payment. | user | no | yes | `server/__tests__/critical-email-outbox.test.ts` |
| `expert_application_approved` | `sendExpertApplicationApprovalEmail` `server/services/email.service.ts:1855` | Admin approves an expert application (`server/routes/admin.routes.ts:3249`). Once per approval. | expert | no | yes | `server/__tests__/critical-email-outbox.test.ts` |
| `expert_application_rejected` | `sendExpertApplicationRejectionEmail` `server/services/email.service.ts:1937` | Admin rejects an expert application (`server/routes/admin.routes.ts:3280`). Again if the rejection note changes. | expert | no | yes | `server/__tests__/critical-email-outbox.test.ts` |
| `provider_application_approved` | `sendProviderApplicationApprovalEmail` `server/services/email.service.ts:2138` | Admin approves a provider application (`server/routes/admin.routes.ts:3690`). Once per approval. | provider | no | yes | `server/__tests__/provider-approval-email.test.ts`, `server/__tests__/critical-email-outbox.test.ts` |
| `provider_application_rejected` | `sendProviderApplicationRejectionEmail` `server/services/email.service.ts:2045` | Admin rejects a provider application (`server/routes/admin.routes.ts:3726` and `:3775`). Once per rejection. | provider | no | yes | `server/__tests__/provider-rejection-email.test.ts`, `server/__tests__/critical-email-outbox.test.ts` |
| `booking_confirmation` | `persistLegacyBookingConfirmationEmail` `server/services/email-outbox.service.ts:756` | Winning legacy payment confirmation, inside that transaction (`server/services/stripe-payment.service.ts:1182`, `server/services/booking.service.ts:878`). Then `kickLegacyConfirmationDelivery`. Once per confirming update. | user | no | yes | No dedicated delivery test named on this writer. The outbox drain tests cover the shared delivery path. |
| `booking_confirmation` | `enqueueBookingConfirmationEmail` `server/services/email-outbox.service.ts:807` | No caller under `server/` except the function itself. | user | no | yes | none found |
| `provider_booking_alert` | `enqueueBookingAlertEmail` `server/services/email-outbox.service.ts:889` | New booking request (`server/services/booking.service.ts:684`, `server/routes/payments.routes.ts:952`, `server/routes.ts:2266`) and booking confirmed (`server/services/booking.service.ts:1017`). Once per those events. | provider | no | yes | `server/__tests__/booking-alert-outbox.db.test.ts` |
| `guest_invite` | `enqueueGuestInviteEmail` `server/services/email-outbox.service.ts:922` | Traveler sends experience invites (`server/services/guest-invite-send.service.ts:147`, route `server/routes/guest-invites.ts:352`). Once per invite send. | guest | no | yes | `server/__tests__/guest-invite-mailer.test.ts`, `server/__tests__/guest-invite-send.db.test.ts` |
| `signup_welcome` | `enqueueSignupWelcome` `server/services/signup-welcome-outbox.service.ts:51` | Email signup transaction (`server/replit_integrations/auth/emailAuth.ts:174`, then `deliverQueuedEmail` at `:211`). SSO welcome (`sendWelcomeEmail` → `enqueueWelcomeForEmail`, Facebook `facebookAuth.ts:170`, Replit `replitAuth.ts:163`). Once per account. | user | no | yes | `server/__tests__/signup-welcome-outbox.db.test.ts` |
| `itinerary_ready` | `persistGenerationOutcome` `server/services/itinerary-generation-outcome.service.ts:74` | Optimizer finishes a comparison as ready (`finishComparisonGeneration`, called from `server/itinerary-optimizer.ts`). Once per ready outcome; a cancelled row can be reused. | user | no | yes | `server/services/__tests__/itinerary-generation-outcome.vitest.ts` |
| `itinerary_failed` | same function, `emailType` ``itinerary_${outcome}`` | Optimizer finishes a comparison as failed. Once per failed outcome. | user | no | yes | `server/services/__tests__/itinerary-generation-outcome.vitest.ts` |
| `itinerary_nudge_2h` | `scheduleItineraryFollowups` `server/services/itinerary-followup.service.ts:73` | Scheduled when a ready notice is stored. Drain delivers about 2 hours later if still eligible. One row per itinerary. | user | no | yes | `server/services/__tests__/itinerary-followups.vitest.ts`, `server/services/__tests__/itinerary-followups-live.vitest.ts` |
| `itinerary_followup_24h` | same scheduler, kind from `server/services/itinerary-followup-email.ts:5` | Same ready event. Drain delivers about 24 hours later. | user | no | yes | same followup tests |
| `itinerary_reengagement_5d` | same scheduler, kind at `itinerary-followup-email.ts:6` | Same ready event. Drain delivers about 120 hours later. | user | no | yes | same followup tests |
| `liteapi_stay_voucher` | `voucherRow` `server/services/liteapi-booking.service.ts:346`, inserted at `:450` | Confirmed LiteAPI stay, inside that transaction. Once per confirmed book. No immediate kick; the drain delivers the `pending` row. A missing address is inserted `dead`. | user | no | yes | `server/__tests__/liteapi-booking.db.test.ts` covers the book path. This inventory did not re-prove the voucher assertion. |
| `canonical_booking_confirmation` | `persistCanonicalBookingConfirmation` `server/services/canonical-booking-email.service.ts:128` | Checkout claim promotion (`server/services/checkout-claim.service.ts:1334` and `:2512`), inside the transaction. Once per promotion. Drain delivers. | user | no | yes | `server/__tests__/canonical-booking-email.db.test.ts` |
| `waitlist_apply_invite` | `notifyWaitlistProviderApply` `server/services/waitlist-apply-invite-email.ts:111` | `POST /api/waitlist` when a provider joins a live city and the row is newly inserted (`server/routes/launch-waitlist.routes.ts:65`). Once per new provider join. | provider | no | yes | `server/__tests__/s22-waitlist-apply.db.test.ts` |
| `ready_made_purchase_delivered` | `server/services/ready-made-notifications.service.ts:190` | Ready-made purchase delivered. Once per purchase (dedupe key on the row). | user | no | yes | `server/__tests__/ready-made-clone-fields.db.test.ts` |
| `ready_made_revision_requested` | `server/services/ready-made-notifications.service.ts:258` | Buyer requests a revision. Once per request (dedupe key). | expert | no | yes | `server/__tests__/ready-made-announce-marker.test.ts` pins the source. No separate delivery assertion was re-run for this inventory. |
| `occasion_reminder` | `server/services/occasion-drafts.service.ts:428` | `runOccasionDrafts`: daily internal job and the in-process timer (`server/services/occasion-drafts-scheduler.service.ts`). One per draft after `notifiedAt` is claimed. | user | no | yes | `server/__tests__/occasion-drafts.db.test.ts` |
| `earner_no_response` | `server/services/earner-no-response.service.ts:147` | `runEarnerNoResponseNotices` from the booking-expiry scheduler (`server/services/booking-expiry-scheduler.service.ts:138`). Once per candidate that has booking-request email consent and an address. | user | no | yes | `server/__tests__/earner-no-response.db.test.ts` |
| `ai_upstream_alert` | `reportAiUpstreamError` `server/services/ai-upstream-errors.ts:248` | Non-retryable AI provider failure (`server/services/claude.service.ts:430` and the optimizer). At most once per `AI_ALERT_WINDOW_MS` (1 hour). | admin (`AI_ALERT_EMAIL`, else `Admin@traveloure.com`) | no | yes | `server/__tests__/ai-upstream-errors.test.ts` covers classification. It does not assert the enqueue. |
| `activity_new_message` | `sendActivityEmailAction` `server/services/activity-email.service.ts:82` and `:101` | New chat to an earner (`server/storage.ts:1990`, `server/services/messages.service.ts:253`, `server/routes/content.routes.ts:626`). At most once per sender-recipient pair per hour. | expert or provider | no | yes | `server/__tests__/suggestion-listing-activity-email.db.test.ts` |
| `activity_advisor_invite` | same sender | Advisor invite (`server/services/booking-actions.service.ts:988`). Once per invite notification. | expert | no | yes | same activity-email test file does not call this kind |
| `activity_quote_request` | same sender | Traveler requests a quote (`server/routes/service-quotes.routes.ts:62`). Once per quote notification insert. | expert or provider | no | yes | `server/__tests__/suggestion-listing-activity-email.db.test.ts` |
| `activity_booking_cancelled` | same sender | Traveler cancels; the seller is notified (`server/routes.ts:8727`). Once per cancellation notification. | expert or provider | no | yes | no dedicated test found for this kind |
| `activity_review_received` | same sender | Traveler submits a service review (`server/routes/content.routes.ts:3437`). Once per review notification. | expert or provider | no | yes | `server/__tests__/suggestion-listing-activity-email.db.test.ts` |

`sendThroughNoSendGate` (`server/services/email-outbox.service.ts:138`) is the outbox calling `sendEmail`. It is not a separate sender. `getClient` wrapping `client.emails.send` (`server/services/email.service.ts:80`) is the provider inside `sendEmail`.

## Bypasses the outbox — `sendEmail` (7)

These call `sendEmail` and never insert `email_outbox`. `sendEmail` still refuses unless `EMAIL_SENDS_ENABLED=true`. The allowlist does not name them. Do not invent a type for them.

| email_type | function | trigger and how often | recipient | authCritical | drain | test |
| --- | --- | --- | --- | --- | --- | --- |
| none, direct `sendEmail` | `sendBookingDeclineEmail` `server/services/email.service.ts:994` | Provider or expert declines a request (`server/routes.ts:8010`). Once per decline. | user | no | no | `server/__tests__/booking-decline-reason.test.ts` covers the decline. This inventory did not re-prove the mail call. |
| none, direct `sendEmail` | `sendLateSuccessRefundEmail` `server/services/email.service.ts:1187` | Late-success refund (`server/services/checkout-claim.service.ts:2131` and `:2159`). Once per that refund. | user | no | no | no dedicated mail test found |
| none, direct `sendEmail` | `sendExpiredClaimEmail` `server/services/email.service.ts:1247` | Stamped claim released or swept (`server/services/checkout-claim.service.ts`). Once per expired claim. | user | no | no | `server/__tests__/stale-authorized-sweep.db.test.ts`, `server/__tests__/dispute-hardening.db.test.ts` inject a send seam |
| none, direct `sendEmail` | `sendWaitlistOpenEmail` `server/services/waitlist-open-email.ts:66` | Nothing schedules this. The only caller found is `server/services/__tests__/marketing-email-footer.test.ts`. The constant `waitlist_open` is not written to the outbox. | user | no | no | `server/services/__tests__/marketing-email-footer.test.ts` |
| none, direct `sendEmail` | `sendBulkVendorEmail` `server/services/vendor-management.service.ts:283` | `POST /api/trips/:tripId/vendors/bulk-email` (`server/routes/trips.routes.ts`). Authorized trip logistics. Rate limit 5 per 10 minutes per user. One message per vendor address on the request. | vendor address on the contract | no | no | no dedicated mail test found |
| none, direct `sendEmail` | `runDailyAdminDigest` `server/jobs/dailyAdminDigest.ts:190` | Admin action (`server/routes/admin.routes.ts:9936` and `:9948`). Not the 24-hour scheduler. One message to `ADMIN_EMAIL` per run. | admin | no | no | no dedicated mail test found |
| none, direct `sendEmail` | `runNightlyQA` `server/jobs/nightlyQA.ts:259` | About 02:00 UTC from `server/index.ts:984`, and `POST /api/admin/qa/run-nightly` (`server/routes/admin.routes.ts:10105`). One message per admin user email, plus `ADMIN_EMAIL` if set. | admin | no | no | no dedicated mail test found |

## Bypasses the outbox — `client.emails.send` (7)

These do not call `sendEmail` and do not insert `email_outbox`. They also skip `EMAIL_SENDS_ENABLED`. The allowlist does not name them.

| email_type | function | trigger and how often | recipient | authCritical | drain | test |
| --- | --- | --- | --- | --- | --- | --- |
| none, direct `sendEmail` | `sendBookingConfirmationEmail` `server/services/email.service.ts:609` | Deprecated. No caller under `server/` except the definition. If invoked, it calls Resend directly. | user | no | no | none found |
| none, direct `sendEmail` | `sendAdminDigestEmail` `server/services/email.service.ts:1506` | Scheduler every 24 hours (`server/services/admin-digest-scheduler.service.ts:232`). Once per UTC date, only when there is something to report and `RESEND_API_KEY` is set. Recipient `ADMIN_EMAIL`. | admin | no | no | no dedicated delivery test found |
| none, direct `sendEmail` | `sendVerificationDecisionEmail` `server/services/email.service.ts:1780` | Admin verification decision (`server/routes/admin.routes.ts:3420`). Once per decision. | provider | no | no | `server/automations/provider/__tests__/admin-follow-ons.test.ts` pins the call site |
| none, direct `sendEmail` | `sendPlanDeliveredEmailAction` `server/services/email.service.ts:2241` | Workspace status becomes delivered (`server/routes/booking-actions.ts:1452`). Once per that transition. | user | no | no | no dedicated delivery test found |
| none, direct `sendEmail` | `sendPlanApprovedEmailAction` `server/services/email.service.ts:2313` | Plan approved (`server/routes/booking-actions.ts:1621`). Once per that transition. | expert | no | no | no dedicated delivery test found |
| none, direct `sendEmail` | `sendPlanChangesRequestedEmailAction` `server/services/email.service.ts:2391` | Plan changes requested (`server/routes/booking-actions.ts:1627`). Once per that transition. | expert | no | no | no dedicated delivery test found |
| none, direct `sendEmail` | `sendNewSuggestionEmailAction` `server/services/email.service.ts:2466` | Post-approval suggestion (`server/routes/booking-actions.ts:1161`). The caller sends only when the plan is already approved. | user | no | no | no dedicated delivery test found |

## Needs a human

None. Every `enqueueEmail`, `sendEmail(`, and `email_outbox` / `emailOutbox` hit under `server/` and `shared/` is in the tables above, or it is the outbox implementation, a test fixture, the schema, or an admin/list query that does not send.

Two functions have no production caller: `enqueueBookingConfirmationEmail` and the deprecated `sendBookingConfirmationEmail`. That is what the search showed. Deleting them is a separate change.

`server/services/stripe-connect-reminder.service.ts` does not enqueue or call `sendEmail`.

## What a lift sends today

This inventory was not run against production. There is no production count here.

When `EMAIL_SENDS_ENABLED` becomes `true`, two things happen:

1. Every `email_outbox` row that is already due (`pending`, `failed`, `held`, or an expired `processing` lease) and whose `email_type` is on `EMAIL_TEMPLATE_ALLOWLIST` is eligible for the next drain. Unlisted types stay as they are.
2. New enqueues of a listed type start sending. Unlisted enqueues are stored and held.

Direct `sendEmail` callers start sending when `EMAIL_SENDS_ENABLED=true` even if the allowlist is empty. The seven `client.emails.send` callers already send without that variable.

Leon can read the queued mix in Replit. This is read-only. Do not run it from this repo against production:

```sql
SELECT email_type, status, count(*), min(created_at), max(created_at)
FROM email_outbox
GROUP BY 1, 2
ORDER BY 1, 2;
```
