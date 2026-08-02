# MONEY MAP — every location where payment or payout happens

> **Purpose (decision-maker directive, Aug 1 2026):** any work that touches money — by any agent,
> on any surface (Replit included, since it holds live Stripe access) — MUST consult this map first
> and update it in the same PR when it adds, moves, or removes a listed site. A money site not on
> this map is a defect in the map; fix the map, don't ignore the site.
>
> **Governing rules (CLAUDE.md):** §14 — amounts and acting user are server-derived, never from
> `req.body`; §15 — every charge/transfer/purchase is idempotent via an atomic conditional DB claim
> PLUS a deterministic Stripe `idempotencyKey`; §8 — no fee/commission literals outside
> `fee_bands`/config (fallback defaults carry `fee-literal-ok`). CI guard:
> `scripts/check-money-endpoints.cjs`.
>
> **As-of:** branch `replit-sync-aug2` @ `60df477a` (post PR #390). Line numbers drift — treat them
> as anchors, re-grep before relying on one.
>
> **Update (branch `claude/money-hardening-r1`):** F-1, F-2, F-3, F-6, F-7, F-8 closed — see the
> struck FINDINGS entries below for what changed and where. F-4/F-5 untouched (need a design
> decision, out of scope for this pass).
>
> **Update (branch `claude/money-hardening-r2`):** F-4 closed via pointer comments (no behavior
> change, tx-aware refactor filed). F-5 machinery landed **dormant** — the outbound sub_id rewrite
> stays behind `TP_SUBID_ATTRIBUTION` (unset by default) until a live echo test confirms
> Travelpayouts' `marker.SubID` convention; the matcher's exact-token adoption pass is live
> regardless (it simply never fires without a token-bearing sub_id to match against). See the
> struck F-4/F-5 entries below.
>
> **Update (branch `claude/money-verify-cluster`) — verification lane, #846/#874/#875/#876/#877:**
> - **#846 (booking confirm-payment double-earnings) — ALREADY-SAFE, proven, not a bug.**
>   `bookingService.confirmBookingPayment` (`booking.service.ts` ~589-772) already claims the
>   `bookings` row atomically (`UPDATE ... WHERE status='pending_payment'`) INSIDE the same
>   `db.transaction` that writes `provider_earnings`/`platform_revenue` — a lost claim throws
>   before either ledger write, rolling back the whole tx (the §15 pattern, already correct).
>   Proven both sequentially and under real concurrency (`Promise.all`):
>   `server/__tests__/booking-confirm-payment-idempotency.test.ts`.
> - **#874 (refunded coordination fee re-entering 'paid') — REPRODUCED + FIXED.**
>   `POST /api/coordination-states/:id/pay/confirm` (`routes.ts` ~7144-7170) claimed via
>   `ne(feePaymentStatus, "paid")`, which ALSO matched `"refunded"` — Stripe leaves
>   `PaymentIntent.status == 'succeeded'` after a refund (refunds live on the Charge/Refund
>   objects, not the PI), and the refund endpoint never clears `feePaymentIntentId`, so a
>   stray/replayed confirm call could flip a refunded engagement back to `"paid"`. Fixed: an
>   explicit `refunded` early-return (mirroring `/pay`'s existing one) + the atomic UPDATE
>   tightened to `eq(feePaymentStatus, "pending")` (the only legitimate pre-confirm state — was
>   `ne(..., "paid")`, which also silently admitted `"unpaid"`). The claim (`/pay`,
>   `unpaid→pending`) and rollback (`/pay` catch, `pending→unpaid`) guards were already correct
>   (never touch `refunded`). Proven both pre-fix (bug reproduces) and post-fix (guard holds) +
>   claim/rollback: `server/__tests__/coordination-fee-refund-guard.test.ts`.
> - **#875 (coordination refund credit reuse) — ALREADY-SAFE, proven, not a bug.** The refund's
>   credit-release UPDATE (`routes.ts` ~7261-7265,
>   `SET consumed_by_coordination_id=NULL, consumed_at=NULL WHERE consumed_by_coordination_id=:id`)
>   fully un-consumes every credit the refunded coordination claimed, and the released credit is
>   then genuinely re-claimable by `claimCoordinationCredit` (`optimization-fee.service.ts` ~268)
>   for a fresh engagement. Proven end-to-end (claim → refund-release → re-claim):
>   `server/__tests__/coordination-refund-credit-release.test.ts`.
> - **#876 (refund retry Stripe/DB desync) — ALREADY-SAFE at all three §1c refund sites, proven,
>   not a bug.** Each site uses a DIFFERENT but individually sound ordering:
>   `refundServiceBooking` (`stripe-payment.service.ts` ~757-830) is claim-then-revert (atomic
>   claim first; the documented `~:804` revert on a Stripe throw returns the booking to its prior
>   status so a retry's claim succeeds cleanly); the coordination-fee refund (`routes.ts`
>   ~7205-7342) is Stripe-first (nothing is written to the DB until Stripe succeeds, so a Stripe
>   throw leaves the DB — and any linked `platform_revenue` row — untouched, nothing to revert);
>   the ready-made refund (`ready-made.routes.ts` ~1173-1205 +
>   `refundReadyMadePurchaseLedger`/`ready-made-purchase.service.ts` ~189) is ledger-first
>   (mirrors the dispute-uphold posture) with an idempotent, atomically-claimed ledger step, so a
>   Stripe-throw retry re-runs ONLY the (idempotency-keyed) Stripe leg. All three simulated with a
>   Stripe stub that throws once then succeeds, proving exactly one real Stripe refund + a
>   converged, non-double-written DB state at each site:
>   `server/__tests__/refund-retry-convergence.test.ts`.
> - **#877 (mark a ledger gap reviewed) — BUILT, additive migration 169.** The only persistent,
>   un-acknowledgeable "ledger gap" surface found was `coordination_states.revenue_reversal_missing`
>   (migration 128) — rendered as a permanent "Ledger gap:" warning in
>   `client/src/pages/admin/concierge-requests.tsx` with no way to dismiss it, even after manual
>   review. (The OTHER "gap" surface, `stripeReconciliation.ts`'s `reconciliation_mismatch`
>   `admin_notifications` rows, already has a working mark-read mechanism —
>   `PATCH /api/admin/notifications/:id/read` + `admin/notifications.tsx` — so nothing to build
>   there; the admin-digest webhook-gap check (§C) is ephemeral, recomputed per digest run, not a
>   persisted queue, so "reviewed" doesn't apply.) Fix: migration 169 adds additive-nullable
>   `revenue_reversal_reviewed_at`/`revenue_reversal_reviewed_by` to `coordination_states`
>   (declared in `shared/schema.ts` in the same commit — deploy-push durability rule); new
>   `POST /api/admin/coordination-states/:id/review-ledger-gap` (`admin.routes.ts`, admin-gated,
>   mirrors the neighboring `assign-coordinator` endpoint) stamps them WITHOUT ever clearing
>   `revenue_reversal_missing` — the underlying flag and its history are never deleted, only
>   annotated. Client: a "Mark reviewed" button on the open-warning banner, a reviewed-state
>   banner once stamped, and an "open ledger gaps only" filter toggle on the concierge-requests
>   admin page. Proven: `server/__tests__/coordination-ledger-gap-review.test.ts`.

---

## 1. Stripe API call sites

### 1a. Client instantiations (`new Stripe(...)`)

All read `STRIPE_SECRET_KEY`. Only `server/services/stripe.service.ts:55` enforces live/test key-prefix
vs `ENVIRONMENT==="PROD"` (`:26-53`) — the other instantiations accept whatever key is present.

| file:line | notes |
|---|---|
| `server/services/stripe.service.ts:55` | prefix-enforced |
| `server/services/stripe-payment.service.ts:31` | |
| `server/services/stripe-connect.service.ts:26` | Connect (transfers/accounts) |
| `server/routes/webhooks.routes.ts:22` | webhook processing |
| `server/routes/identity.routes.ts:11` | Stripe Identity |
| `server/jobs/stripeReconciliation.ts:27` | daily charge reconcile |
| `server/routes/optimization.routes.ts:34` | |
| `server/routes.ts:361` + per-request at `:3502`, `:3555`, `:6973`, `:7072`, `:7151`, `:7235` | monolith money endpoints |
| ~~`server/routes/trips.routes.ts:72`~~ | **REMOVED (F-6 closed)** — was declared, zero call sites |
| `server/routes/bookings.ts:360` | webhook verify |
| `server/routes/content.routes.ts:7658` | content-hub checkout |
| `server/routes/ready-made.routes.ts:1061`, `1109`, `1183` | ready-made buy/confirm/refund |
| `server/services/booking.service.ts:15` | cart confirm |
| `server/services/admin-digest-scheduler.service.ts:78` | missed-webhook gap check |

### 1b. Charges — `paymentIntents.create`

| file:line | charges what | idempotencyKey |
|---|---|---|
| `stripe-payment.service.ts:365` (`chargeSavedMethod`) | off-session saved-card charge | YES (caller key, `-recover` retry) |
| `stripe-payment.service.ts:478/480` (`createPaymentIntent`) | cart checkout total | YES `pi-<key>` |
| `stripe-payment.service.ts:876` (`createExpertServicePaymentIntent`) | expert review / review+book / full-concierge fee | YES `expert-svc-<variantId>-<comparisonId>-<serviceType>-<userId>` (F-3 closed) |
| `routes.ts:~3509` | expert-template purchase (price from `expert_templates`) | YES `tpl-buy-<templateId>-<userId>` (F-3 closed) |
| `routes.ts:7084` (+ saved-card path `:7028`) | coordination fee | YES `coord-fee-<id>` |
| `optimization.routes.ts:~332` (+ saved-card path `:~298`) | optimization fee | YES both paths, `opt-fee-<userId>-<target>-<YYYY-MM-DD>` via a shared `buildOptimizationFeeIdempotencyKey` helper (F-3 closed) |
| `ready-made.routes.ts:1064` | ready-made trip purchase | YES `rm-buy-<listing>-<user>` |

### 1c. Refunds — `refunds.create`

| file:line | refunds what | idempotencyKey |
|---|---|---|
| `stripe-payment.service.ts:793` (`refundServiceBooking`) | service booking, full `total_amount` | YES `refund-sb-<id>` |
| `routes.ts:7238` | coordination fee | YES `coord-refund-<id>` |
| `ready-made.routes.ts:1187` | ready-made purchase | YES `rm-refund-<id>` |

### 1d. Payouts — `transfers.create` (real money OUT)

ONE call site: `stripe-connect.service.ts:115` (`createTransfer`), key optional param.
ONE caller: `admin.routes.ts:3807` — `PATCH /api/admin/payouts/:id`, key `payout-<type>-<id>`,
behind the §15 atomic `claim{Expert,Provider}PayoutForProcessing`.

### 1e. Connect onboarding — `stripe-connect.service.ts`
`accounts.create :37` · `accountLinks.create :64` · `createLoginLink :75` · `accounts.retrieve :85`.

### 1f. Checkout Sessions (hosted checkout — the OTHER charge rail)

| file:line | charges what | idempotencyKey | fulfillment handler |
|---|---|---|---|
| `stripe.service.ts:134` | transport booking | NO | `handleStripePaymentSuccess` (`:178`) + `checkout.session.completed` type `transport_booking` |
| `stripe-payment.service.ts:934` | expert service hosted checkout | NO | `checkout.session.completed` type `expert_service` |
| ~~`content.routes.ts:7665`~~ | content-hub curated item | — | **REMOVED (F-1 closed).** `POST /api/content/checkout` now returns 501 `content_checkout_unavailable` instead of creating a session — see FINDINGS. |

### 1g. PI verification reads (`paymentIntents.retrieve`)
`stripe-payment.service.ts:838, 981` · `booking.service.ts:597` · `routes.ts:3558, 6974, 7152, 409` ·
`optimization.routes.ts:383` · `ready-made.routes.ts:1112`.

### 1h. Non-charging SDK usage
Customers/PMs: `stripe-payment.service.ts:139-322` (list/create customer, setupIntent, PM list/retrieve/detach,
default-PM update). Disputes: `webhooks.routes.ts:426, 484` (`charges.retrieve`). Reconcile:
`stripeReconciliation.ts:61` (`charges.list`). Digest: `admin-digest-scheduler.service.ts:84` (`events.list`).
Identity: `identity.routes.ts:27`.

---

## 2. Ledger writes (DB money records)

### `platform_revenue`
Canonical writer `storage.ts:3957` (`recordPlatformRevenue`, + daily summary `:3963`). Triggers:
- booking completed — `storage.ts:1629` (via `updateServiceBookingStatus`)
- cart confirm tx — `booking.service.ts:735` (**raw INSERT, bypasses canonical writer**)
- template purchase — `storage.ts:3353` and `routes.ts:3637`
- expert tip — `storage.ts:3528`
- ready-made — `ready-made-purchase.service.ts:149`; reversal `:246/:253`
- generic — `revenue-tracking.service.ts:88` (`recordRevenueEvent`, all sourceTypes)
- expert-review split re-write — `booking-actions.service.ts:92`
- reversals (flip + compensating negative row) — `storage.ts:3791/3797`, `routes.ts:7266/7278`

### `expert_earnings` / `provider_earnings`
Canonical writers `storage.ts:3451` / `:3664`. Creation triggers: booking completed (`:1663`/`:1650`),
template sale (`:3371`, `routes.ts:3611`), tip (`:3514`), referral (`:3582`), affiliate commission (`:3612`),
`recordRevenueEvent` shares (`revenue-tracking.service.ts:107/120`, born `held`), expert-review split
(`booking-actions.service.ts:111`), ready-made sale (`ready-made-purchase.service.ts:127`), cart confirm tx
(`booking.service.ts:716`, **raw INSERT**). State machine (held→releasable→paid_out / reversed / dispute):
release scheduler `storage.ts:3674/3683`, per-booking release `:3708/3700`, dispute set/clear `:3735-3745`,
reversal `:3769/3765`, ready-made reversal `ready-made-purchase.service.ts:231`.

### `affiliate_earnings`
Create: `storage.ts:3604`; from agent-booking confirm `content.routes.ts:6917` (**commission written "0.00"**
— F-5; corrected mislabel, was previously miscited here as F-8, which is the unrelated `.env.example` finding).
Reconciliation matcher: fuzzy UPDATE `affiliate-reconciliation.service.ts:~412`; **exact-token adoption UPDATE
`:~370-390` (F-5, new in `claude/money-hardening-r2`, dormant until `TP_SUBID_ATTRIBUTION=1`)**; admin status
PATCH `:~509`.

### `coordination_fee_credits`
Insert on paid Event-optimize `optimization.routes.ts:459` (unique on `sourcePaymentIntentId`); claim
`optimization-fee.service.ts:299`; release `:313`; refund release `routes.ts:7258`.

### Payout tables
`expert_payouts` / `provider_payouts`: create `storage.ts:3461/:3824`; atomic processing claim
`:3902/:3910` (§15 FIX 1); status update `:3894/:3923`. Callers: admin queue (`admin.routes.ts:3709-3856`),
self-service request (`payments.routes.ts:1179-1180`), transfer webhook (`webhooks.routes.ts:273-275`).

### Purchase/booking status machines
- `template_purchases`: born `pending_payment` `routes.ts:3489`; atomic `→completed` `:3598`.
- `service_bookings`: born `payment_pending` + idempotencyKey `payments.routes.ts:666`; PI stamp `:817`;
  webhook `→confirmed` `webhooks.routes.ts:301` / `→failed` `:365`; transport confirm `stripe.service.ts:193`;
  refund claim `stripe-payment.service.ts:773`; completion side-effects `storage.ts:~1595`
  (`updateServiceBookingStatus`); expiry `booking-expiry-scheduler.service.ts:131`.
- `coordination_states.fee_payment_status`: claim `routes.ts:6962` (`unpaid→pending`); paid `:7016/:7162`
  (`#874 fix`: `:7162`'s atomic UPDATE is now `eq(status,"pending")`, was `ne(status,"paid")` — the
  looser guard admitted both `unpaid` and the terminal `refunded` state into the flip; an explicit
  `refunded` early-return was also added, mirroring `/pay`'s existing one); rollback `:7128`
  (`pending→unpaid`); refunded `:7302` (terminal — never re-enters `pending`/`paid` post-fix).
  `revenue_reversal_missing` (bool, migration 128) flags a refund whose `platform_revenue` reversal
  found nothing to reverse; `#877` (migration 169) adds `revenue_reversal_reviewed_at`/`_by` +
  `POST /api/admin/coordination-states/:id/review-ledger-gap` so that flag can be acknowledged.
- `ready_made_purchases`: insert `ready-made.routes.ts:1129`; `paid→cloned` `ready-made-purchase.service.ts:106`;
  `→refunded` `:219`.
- Adjacent: `payment_intents` mirror rows (`stripe-payment.service.ts:485-709`, `webhooks.routes.ts:409`),
  `refunds` rows (`stripe-payment.service.ts:725, 810`), `webhook_events` dedup (`webhooks.routes.ts:162, 517-524`),
  `daily_revenue_summary` (`storage.ts:3960`, `routes.ts:7316`).

---

## 3. Money endpoints (route → money action → auth gate)

**Traveler-pay:**
| endpoint | money action | gate |
|---|---|---|
| POST `/api/checkout` (`payments.routes.ts:274`) | slot claims + booking insert + PI create | isAuthenticated |
| POST `/api/optimization-payments` (+`/confirm`) (`optimization.routes.ts:214/373`) | optimize fee charge; revenue + credit on confirm | isAuthenticated + owner + PI↔user binding |
| POST `/api/coordination-states/:id/pay` (+`/pay/confirm`) (`routes.ts:6942/7139`) | coordination fee charge (credit-aware) | isAuthenticated + owner + PI bindings |
| POST `/api/expert-templates/:id/purchase` (+`/confirm`) (`routes.ts:3457/3545`) | template purchase | isAuthenticated + buyer + PI metadata match |
| POST `/api/ready-made/:id/purchase` (+`/confirm`) (`ready-made.routes.ts:1023/1100`) | ready-made purchase | isAuthenticated + PI metadata match |
| POST `/api/expert-requests/payment-intent` → POST `/api/expert-requests` (`booking-actions.ts:103/166`) | expert service fee | isAuthenticated + variant owner + PI verify |
| POST `/api/bookings/process-cart` → `/confirm-payment` (`bookings.ts:72/125`) | cart bookings + earnings/revenue on confirm | isAuthenticated (+ ownership in service) |
| POST `/api/content/checkout` (`content.routes.ts:~7607`) | **GATED OFF — 501 `content_checkout_unavailable`** (F-1 closed; no fulfillment leg exists) | isAuthenticated |
| POST `/api/transport-booking-options/:id/book` (`transport-hub.routes.ts:326`) | transport checkout session | isAuthenticated + authorizeTripLogistics |

**Refund/dispute/escrow:**
POST `/api/bookings/refund` (`bookings.ts:385`, owner-or-admin) · POST `/api/bookings/:id/confirm-completion`
/ `/dispute` (`bookings.ts:468/493`, traveler-only) · POST `/api/ready-made/purchases/:id/refund`
(`ready-made.routes.ts:1173`, buyer) · POST `/api/coordination-states/:id/refund` (`routes.ts:7200`,
inline admin check) · admin dispute uphold/reject (`admin.routes.ts:884/856`).

**Payout rail:**
POST `/api/payouts/request` (`payments.routes.ts:1120`, earner self-request, server-capped) →
POST/PATCH `/api/admin/payouts` (`admin.routes.ts:3666/3733`, adminApiGuard; PATCH executes the transfer).

**Connect onboarding:** `/api/stripe/connect/onboard|status|dashboard` (`payments.routes.ts:946/995/1030`).

**Rate administration (adminApiGuard + audit log):** PATCH `/api/admin/fee-bands/:bandKey`
(`admin.routes.ts:5132`) · PATCH `/api/admin/platform-settings/:settingKey` (`:5366`) ·
POST `/api/admin/optimization-fees` (`:5905`).

**Public rate reads (deliberate):** `/api/booking-fee-config`, `/api/fee-bands/:bandKey`,
`/api/revenue-splits`, `/api/optimization-preview`.

**Retired (410 Gone):** wallet/credits endpoints (`payments.routes.ts:175-189`).

---

## 4. Webhooks

| path | secret env | verified? | notes |
|---|---|---|---|
| POST `/api/webhooks/stripe` (`webhooks.routes.ts:535`) | `STRIPE_CONNECT_WEBHOOK_SECRET` | YES; **unverified-parse fallback when secret unset AND NODE_ENV!=='production'** | account.updated, transfer.created/paid, payment_intent.succeeded/failed, charge.dispute.created/closed; `webhook_events` dedup |
| POST `/api/bookings/webhooks/stripe` (`bookings.ts:~348`) | `STRIPE_WEBHOOK_SECRET` | YES; secret still defaults `''`, but a **prod-presence guard now returns 503 before attempting verification** when unset in production (F-2 closed) | PI lifecycle, charge.refunded, checkout.session.completed (`expert_service`, `transport_booking`) |
| POST `/api/webhooks/stripe-identity` (`webhooks.routes.ts:28`) | `STRIPE_IDENTITY_WEBHOOK_SECRET` | YES; same non-prod fallback | identity verification |
| POST `/api/webhooks/persona` (`webhooks.routes.ts:81`) | `PERSONA_WEBHOOK_SECRET` | YES (HMAC, prod-required) | Persona KYC |

Raw body capture: `server/index.ts:82`. Dead code `verifyStripeWebhookSignature`
(`stripe.service.ts:240`, zero call sites) is **removed (F-6 closed)**.
**All five secrets now appear in `.env.example`** (F-2 + F-8 closed), and `server/validate-env.ts`
WARNs (non-fatal) when `STRIPE_SECRET_KEY` is set but a webhook secret is missing.
`STRIPE_WEBHOOK_SECRET` is also logged at boot (`server/index.ts:195`) and listed in
`docs/backoffice/LAUNCH_ENV_CHECKLIST.md`.

---

## 5. Client payment surfaces

Shared Elements host: `client/src/components/booking/StripeCheckout.tsx` (client never sends an amount — §14).

| surface | endpoint pair |
|---|---|
| `cart.tsx` (optimize fee, `:2065`) | `/api/optimization-payments` → `/confirm` |
| `cart.tsx` (cart checkout, `:2397`) | `/api/checkout` → webhook confirms |
| `ready-made-detail.tsx:334` | `/api/ready-made/:id/purchase` → `/confirm` |
| `expert-template-detail.tsx:373` | `/api/expert-templates/:id/purchase` → `/confirm` |
| `my-events.tsx:268` (coordination fee) | `/api/coordination-states/:id/pay` → `/pay/confirm` |
| `BookingFlowModal.tsx:520` | `/api/bookings/process-cart` → poll → `/confirm-payment` |
| `VariantActionButtons.tsx:386` (expert service) | `/api/expert-requests/payment-intent` → `/api/expert-requests` |
| `AddCardDialog.tsx:201` (SetupIntent, no charge) | `/api/me/payment-methods/setup-intent` |
| `BookingConfirmationPage.tsx` | 3DS redirect-back landing |
| `curated-content-section.tsx:236` | `/api/content/checkout` — **F-1 surface** |
| `my-bookings.tsx:377` (ready-made refund) · `admin/reconciliation.tsx:126` (uphold) · `admin/concierge-requests.tsx:96` (coordination refund) · `admin/payouts.tsx:119/142` (payout queue/transfer) · `provider|expert` earnings pages (payout request) | refund/payout triggers |

Publishable key `VITE_STRIPE_PUBLISHABLE_KEY` — also absent from `.env.example` (F-2).

---

## 6. Where rates resolve from

- **`fee_bands`** (canonical): generic reader `commission.ts:216`; band keys in use — `expert_standard`,
  `beta_flat`, `tip_handling`, `expert_concierge_booking`, `affiliate_standard`, `coordination_floor`,
  `coordination_percent`, `platform_deposit`, `expert_review_flat`, `expert_review_book_flat`,
  `expert_review_book_percent`, `full_concierge_flat`, `full_concierge_percent`,
  `expert_review_expert_share`, `ready_made_trip`, per-category `sc.commission_band_key`,
  `affiliate:<partner>` (upsell). Admin R/W `admin.routes.ts:5111/5167`.
- **`booking_fee_configs`**: transport commission + per-partner margins
  (`transport-booking-options.service.ts:288/305`). Insurance keys migrated OUT to `platform_settings`
  (migration 124).
- **`platform_settings` money keys**: `active_provider_commission_policy`, `default_commission_band_key`,
  `early_adopter_cutoff_date`, `insurance_enabled/rate_percent/applies_to` (`commission.ts:314-445`).
- **`optimization_fees`** table: `optimization-fee.service.ts:61-104`; admin write `admin.routes.ts:5905`.
- Per-record overrides: `provider_services.revenueShareRate` (`payments.routes.ts:567/617`),
  `users.commission_override_expert_share_percent` (`commission.ts:423`),
  `affiliate_partners.commission_rate` (`affiliate.service.ts:144`).
- Escrow hold windows: `server/config/earnings-hold.config.ts` (env-overridable).

### Unmarked rate literals (audit list — each needs `fee-literal-ok` + rationale, or a config home)
`commission.ts:36-42` (`AI_PLATFORM_FEE 1.00`, `AFFILIATE_PLATFORM_FEE 0.70`, `AFFILIATE_EXPERT_SHARE 0.30`,
`PROCESSING_FEE_RATE 0.03` declarations) · `pricing.service.ts:23` (`DEFAULT_DEPOSIT_RATE 0.25` fallback) ·
`transport-booking-options.service.ts:276-317` (transport/margin fallbacks) · `storage.ts:3591`
(referral `'50'` fallback) · ~~payout floor duplicated THREE times~~ **single-sourced (F-7 closed)** —
`server/config/payout.config.ts` (`MIN_PAYOUT_CENTS`/`MIN_PAYOUT_DOLLARS`, `fee-literal-ok`), imported by
`admin.routes.ts` (both sites) and `payments.routes.ts`.

---

## FINDINGS (open, ranked — filed Aug 1 2026 by the map sweep)

- ~~**F-1 🔴 Content-hub checkout collects money with NO fulfillment.**~~ **FIXED (`claude/money-hardening-r1`).**
  `POST /api/content/checkout` (`content.routes.ts:~7607`) now returns `501 { code: "content_checkout_unavailable" }`
  instead of creating a Stripe Checkout Session — gated honestly per the W0.4 tip-endpoint pattern; the
  Stripe-session code was removed (git history has it), not commented out. Client
  (`curated-content-section.tsx`) surfaces the server's message on error and, for the one case that ONLY led
  here (a priced non-affiliate curated item), replaces "Book Now" with a disabled "Not available yet" control
  instead of letting a traveler click into the dead end. **Fulfillment leg itself is filed, not built** — this
  closes the money-collected-for-nothing hazard; building `checkout.session.completed` handling + ledger write
  (or retiring the surface) is still a decision-maker call.
- ~~**F-2 🔴 Webhook secrets undiscoverable.**~~ **FIXED (`claude/money-hardening-r1`).** All five vars
  (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_IDENTITY_WEBHOOK_SECRET`,
  `PERSONA_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`) are now in `.env.example` with one-line comments;
  `server/validate-env.ts` WARNs (non-fatal) when `STRIPE_SECRET_KEY` is set but a webhook secret is missing.
  `bookings.ts`'s `/webhooks/stripe` route now returns 503 (logged once) instead of attempting
  `constructEvent` with an empty secret when `NODE_ENV==='production'` and `STRIPE_WEBHOOK_SECRET` is unset.
- ~~**F-3 🟡 Three charge sites lack a Stripe idempotencyKey.**~~ **FIXED (`claude/money-hardening-r1`).**
  All three now pass a deterministic key: expert-service PI (`stripe-payment.service.ts:876`,
  `expert-svc-<variantId>-<comparisonId>-<serviceType>-<userId>`), template-purchase PI (`routes.ts:~3509`,
  `tpl-buy-<templateId>-<userId>`), optimization Elements-path PI (`optimization.routes.ts:~332`, the exact
  `opt-fee-<userId>-<target>-<YYYY-MM-DD>` format the saved-card path already used, factored into a shared
  `buildOptimizationFeeIdempotencyKey` helper so the two paths can't drift). The three
  `checkout.sessions.create` sites remain keyless — out of scope this round, unchanged.
- ~~**F-4 🟡 Two raw ledger INSERTs bypass the canonical writers.**~~ **CLOSED via two-way pointer
  comments (`claude/money-hardening-r2`; decision-maker ratified: comments now, tx-aware refactor
  filed, no behavior change).** `booking.service.ts:~716` (provider_earnings) and `~735`
  (platform_revenue), inside the cart-confirm `db.transaction`, each now carry a comment stating
  they deliberately mirror the canonical writer for transactional atomicity and that any
  column/side-effect change to the canonical writer must be mirrored here. The canonical writers
  themselves — `storage.ts` `createProviderEarning` (~:3663) and `recordPlatformRevenue` (~:3956) —
  each gained a matching back-pointer comment naming the raw tx INSERT they must stay in sync
  with. Also recorded: the raw platform_revenue INSERT does **not** call
  `updateDailyRevenueSummary` the way the canonical writer does — a pre-existing divergence, called
  out in both comments, **not fixed here** (still needs the filed tx-aware refactor to resolve
  correctly, since the daily-summary write would need to run inside the same tx). **Filed (not
  built): the tx-aware refactor** — route the cart-confirm tx through the canonical writers
  directly (they'd need a `tx` param) instead of maintaining two hand-synced copies.
- ~~**F-5 🟡 Agent-booking affiliate earnings recorded as `"0.00"`.**~~ **Machinery LANDED, adoption
  DORMANT (`claude/money-hardening-r2`; decision-maker ratified design: never estimate a
  commission, adopt only on an exact attribution match).** `content.routes.ts:~6917` still writes
  `"0.00"` honestly at agent-booking confirm — unchanged, that part is correct (§13: the real
  commission is genuinely unknown until the partner reports it). What's new:
  - **Token helpers** (`travelpayouts-client.ts`): `buildAttributionSubId(token)` →
    `<marker>.<token>`; `parseAttributionSubId(subId)` → `{marker, token}` (first-dot split, no dot
    → `token: null`); `applyAttributionSubId(url, token, enabled)` — the pure, directly-testable
    rewrite helper (`enabled=false` returns `url` unchanged, byte-identical).
  - **Flag-gated outbound rewrite** (`content.routes.ts` `/api/affiliate-booking-requests/from-catalog`,
    ~:6685-6740): when `TP_SUBID_ATTRIBUTION=1` (unset by default) AND the resolved affiliate URL
    carries a `sub_id` param, it's rewritten to `buildAttributionSubId(<bookingRequestId>)` — the
    booking-request id is pre-generated (`crypto.randomUUID()`) so it can be baked into the URL
    **before** the row is written once (never patched after). Flag unset → `applyAttributionSubId`
    is a no-op → current behavior is byte-identical (unit-tested both flag states).
  - **Linkage found (item 3, no migration needed):** `affiliate_earnings.external_report_data` (jsonb,
    written at `content.routes.ts:~6917`) already carries `{affiliateBookingRequestId: <id>}` — that's
    the discoverable link between an `affiliate_earnings` row and its `affiliate_booking_requests`
    row. The expert-earning side link is also discoverable: `storage.ts` `createAffiliateEarning`
    (~:3612) credits the expert's share via `expert_earnings.referenceType='affiliate_earning'`,
    `referenceId=<affiliate_earnings.id>`.
  - **Exact-token adoption matcher** (`affiliate-reconciliation.service.ts`, private
    `adoptExactTokenMatches`, runs **before** the existing fuzzy pass in `matchRecords`): for each
    external row whose `sub_id` parses to a non-null token, finds the internal `unmatched` row
    whose `external_report_data.affiliateBookingRequestId` equals that token and adopts the
    partner-REPORTED amount verbatim (`total_commission`, `platform_share`/`expert_share` split via
    the existing `resolveCommissionRates({source:"affiliate"})` — §8, no new literal),
    `reconciliation_status='matched'`, `partner_reference_id`. Also updates the linked
    `expert_earnings` row's `amount` when found; when no linked row is found, adopts only the
    affiliate_earnings amount and appends a `reconciliation_notes` note flagging manual review
    (this path is exercised in test but not hit in practice today, since the create-time chain
    always creates the linked row when `expertId` is set). Idempotent (atomic
    `WHERE reconciliation_status <> 'matched'` claim; a second run updates 0 rows). External rows
    consumed here are skipped in the fuzzy pass (one partner report row is never credited twice).
    The fuzzy pass's pre-existing `internalAmt === 0 → reject` guard is untouched and still the
    only thing stopping a zero-amount row from being fuzzy-matched — exact-token adoption is the
    ONLY path a zero-amount row can ever be matched through.
  - **Still gated on:** a live echo test (Replit-side, separate — not part of this branch)
    confirming Travelpayouts actually returns the suffixed `sub_id` verbatim on `execute_query`
    action rows, before `TP_SUBID_ATTRIBUTION` is ever set to `1` anywhere real.
    `.env.example` documents this explicitly.
  - Tests: `server/__tests__/affiliate-reconciliation-token-adoption.test.ts` (11 cases — token
    round-trip incl. no-dot/trailing-dot; `applyAttributionSubId` both flag states incl. malformed
    URL; exact-token adoption incl. linked expert-earning; idempotent re-run; tokenless zero-row
    never matches; nonzero fuzzy matching regression-proofed unaffected).
- ~~**F-6 🟢 Dead code.**~~ **FIXED (`claude/money-hardening-r1`).** `verifyStripeWebhookSignature`
  (`stripe.service.ts:240`, zero callers) and the `trips.routes.ts:72` Stripe client (zero call sites in that
  file) are both deleted.
- ~~**F-7 🟢 Payout floor literal ×3.**~~ **FIXED (`claude/money-hardening-r1`).** Single-sourced in
  `server/config/payout.config.ts` (`MIN_PAYOUT_CENTS` = 1000, `MIN_PAYOUT_DOLLARS` derived,
  `fee-literal-ok: single source, admin-configurable is a filed follow-up`); `admin.routes.ts` (both sites)
  and `payments.routes.ts` now import it — behavior unchanged.
- ~~**F-8 🟢 `.env.example` missing `TRAVELPAYOUTS_MARKER`**.~~ **FIXED (`claude/money-hardening-r1`).** Added
  with a comment (affiliate attribution marker, falls back to the account marker).

**Update discipline:** when a finding is fixed, strike it here in the same PR. When new money surfaces land
(bundle booking, property booking, tip payment leg — all ratified-but-unbuilt), add their sites here BEFORE
the money brief is executed.
