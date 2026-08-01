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
| `server/routes/trips.routes.ts:72` | **declared, zero call sites** (dead) |
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
| `stripe-payment.service.ts:876` (`createExpertServicePaymentIntent`) | expert review / review+book / full-concierge fee | **NO — gap (F-3)** |
| `routes.ts:3509` | expert-template purchase (price from `expert_templates`) | **NO — gap (F-3)** |
| `routes.ts:7084` (+ saved-card path `:7028`) | coordination fee | YES `coord-fee-<id>` |
| `optimization.routes.ts:332` (+ saved-card path `:284`) | optimization fee | saved-card YES / Elements path **NO — gap (F-3)** |
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
| `content.routes.ts:7665` | content-hub curated item | NO | **NONE — F-1, money collected, nothing fulfilled/recorded** |

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
Create: `storage.ts:3604`; from agent-booking confirm `content.routes.ts:6917` (**commission written "0.00"** — F-8).
Reconciliation matcher UPDATE `affiliate-reconciliation.service.ts:402`; admin status PATCH `:509`.

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
- `coordination_states.fee_payment_status`: claim `routes.ts:6962`; paid `:7016/:7162`; rollback `:7128`;
  refunded `:7302`.
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
| POST `/api/content/checkout` (`content.routes.ts:7607`) | hosted checkout session | isAuthenticated — **F-1: no fulfillment** |
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
| POST `/api/bookings/webhooks/stripe` (`bookings.ts:348`) | `STRIPE_WEBHOOK_SECRET` | YES but secret defaults `''` — constructEvent just fails; **no prod-presence guard** | PI lifecycle, charge.refunded, checkout.session.completed (`expert_service`, `transport_booking`) |
| POST `/api/webhooks/stripe-identity` (`webhooks.routes.ts:28`) | `STRIPE_IDENTITY_WEBHOOK_SECRET` | YES; same non-prod fallback | identity verification |
| POST `/api/webhooks/persona` (`webhooks.routes.ts:81`) | `PERSONA_WEBHOOK_SECRET` | YES (HMAC, prod-required) | Persona KYC |

Raw body capture: `server/index.ts:82`. Dead code: `verifyStripeWebhookSignature`
(`stripe.service.ts:240`) — zero call sites.
**None of the four secrets appear in `.env.example`** (F-2); `STRIPE_WEBHOOK_SECRET` is at least
logged at boot (`server/index.ts:195`) and listed in `docs/backoffice/LAUNCH_ENV_CHECKLIST.md`.

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
(referral `'50'` fallback) · payout floor duplicated THREE times (`admin.routes.ts:3690`, `:3768`,
`payments.routes.ts:1118`).

---

## FINDINGS (open, ranked — filed Aug 1 2026 by the map sweep)

- **F-1 🔴 Content-hub checkout collects money with NO fulfillment.** `POST /api/content/checkout`
  (`content.routes.ts:7607`) creates a real Stripe Checkout Session (`metadata.type='content_hub_purchase'`),
  and it is client-reachable (`curated-content-section.tsx:236`) — but NO webhook branch, ledger write, or
  delivery handles that metadata type. A traveler can pay and nothing is recorded or delivered. Fix options:
  gate honestly (the W0.4 tip-endpoint 501 pattern) until a fulfillment leg exists, or build the
  `checkout.session.completed` branch + ledger write. Decision-maker call which.
- **F-2 🔴 Webhook secrets undiscoverable.** `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
  `STRIPE_IDENTITY_WEBHOOK_SECRET`, `PERSONA_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` — none in
  `.env.example`, none in `validate-env.ts`. Draft task #143 covers the Connect one; add all five.
  Add a prod-presence guard to `bookings.ts:367` (secret currently defaults `''`).
- **F-3 🟡 Three charge sites lack a Stripe idempotencyKey:** expert-service PI
  (`stripe-payment.service.ts:876`), template-purchase PI (`routes.ts:3509`), optimization Elements-path PI
  (`optimization.routes.ts:332`). All three DO have DB-side §15 claims on confirm, so the exposure is a
  duplicate *uncaptured* PI on retry, not a double charge — still, add deterministic keys (cheap).
  The three `checkout.sessions.create` sites are keyless too.
- **F-4 🟡 Two raw ledger INSERTs bypass the canonical writers** (`booking.service.ts:716/735` inside the
  cart-confirm tx). Deliberate (transactionality) but undocumented — any change to
  `createProviderEarning`/`recordPlatformRevenue` semantics (e.g. new default column) silently misses them.
  Either route through the canonical writers inside the tx or mark both sites with a pointer comment.
- **F-5 🟡 Agent-booking affiliate earnings recorded as `"0.00"`** (`content.routes.ts:6917`) — the
  reconciliation matcher can never amount-match them (5% band of 0). Real commissions from Travelpayouts
  polling will stay `unmatched` for this rail. Needs an expected-commission estimate at write time or a
  matcher rule for zero-amount internal rows.
- **F-6 🟢 Dead code:** `verifyStripeWebhookSignature` (`stripe.service.ts:240`, zero callers);
  `trips.routes.ts:72` Stripe client (zero call sites). Delete both.
- **F-7 🟢 Payout floor literal ×3** — single source it (config or one exported const).
- **F-8 🟢 `.env.example` missing `TRAVELPAYOUTS_MARKER`** (added by PR #390's env centralization).

**Update discipline:** when a finding is fixed, strike it here in the same PR. When new money surfaces land
(bundle booking, property booking, tip payment leg — all ratified-but-unbuilt), add their sites here BEFORE
the money brief is executed.
