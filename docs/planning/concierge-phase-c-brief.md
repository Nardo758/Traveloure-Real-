# Concierge — Phase C Execution Brief (Full / Done-for-You)

**Goal:** Ship the transactional flow on top of the `event_packages` catalog from CON-A.P8. A traveler picks "Request quote" on the Full tier → admin drafts and sends a quote → traveler approves → Stripe charges the full quoted amount → trip auto-creates with the assigned expert + workspace opens. Outcome-priced events (weddings, proposals, corporate) handled per §2.3.

**Source:** Business Plan v1.3 §2.3 (Full / DFY tier) + §4.8 (admin-configurable fees). Concierge Implementation Plan §3 (C1) + §4 (Phase C sequencing).

**Target:** Claude Code, repo working tree.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. Phases share the `event_quotes` row contract.
2. Work in strict phase order: 0 → 4.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(CON-C.Pn): …`). Do not proceed past a failing gate.
4. **Typecheck floor = 140 pre-existing errors.** Every phase must return `npm run check` at **≤140 errors**. No net-new errors in the files a phase touches.
5. **Phase 1 edits `shared/schema.ts` — SINGLE-SESSION.** Concurrency-conflict surface.
6. File:line refs are from CON-A landings + Phase B brief (June 2026) and may have drifted; confirm before editing.

---

## HARD PREREQS — DO NOT START WITHOUT THESE

1. **Concierge Phase A live in production.** `event_packages` table exists (CON-A.P8 — migration 019, commit `74c481f`). Admin can create packages via `/admin/event-packages`. The `routeConcierge()` service surfaces matching packages with `route.full.available=true` and lands a `concierge_requests` row with `chosenTier='full'` when the traveler picks the Full card.
2. **At least one event_package row exists per launch market.** Otherwise the Full tier shows "Quote on request" but the admin queue has nothing actionable.
3. **At least one expert per launch market is in `users` with role `travel_expert`/`local_expert`/`event_planner`.** The admin assigns one to each quote; the quote cannot be drafted without an assignable expert.
4. **EXP-OVR shipped** (`7d1c250`, `5b13915`, `79b335f`). Commission for Full events flows through `commission.ts:resolveCommissionRates` with `expertId` threaded — per-expert overrides apply automatically.
5. **Phase B is NOT a prereq.** A member with allowance gets the standard $0 AI-Concierge flow on AI tier; Full tier doesn't touch the allowance counter. CON-C and CON-B are independent; either can ship first.

---

## DECIDED DEFAULTS (do not ask — settled)

- **D1 Currency:** USD; admin enters quoted amount in cents. Stripe Tax integration is out of scope (Phase D); for now, quoted amount is what gets charged.
- **D2 Quote expiry:** 7 days from sent_at by default; admin can override per-quote on creation. Expired quotes can be re-issued as a new row (old one's status → `expired`). Auto-expiry is sweep-on-read, not a cron job.
- **D3 Revisions vs re-issue:** while `status='draft'`, admin can edit freely. Once `status='sent'`, the quote is immutable except for cancellation. To change a sent quote, admin cancels it (`status='cancelled'`) and creates a new one — preserves the audit trail.
- **D4 Partial payments:** not supported. Single PI for the full quoted amount. Deferred to a possible Phase D.
- **D5 Refunds:** full refund only, before `delivery_started_at` is set. Once an expert opens the workspace and starts delivery, refunds become a dispute case — that's the (deferred) dispute-resolution surface, not Phase C scope.
- **D6 Commission resolution:** routes through `commission.ts:resolveCommissionRates({ category, expertId, source: 'expert' })`. eventType passed via the category arg; per-expert override applies via the `EXP-OVR` Tier-3 branch. No new commission dimension introduced.
- **D7 Workspace creation flow:** on Stripe payment success → create `trips` row (eventType from package, destination from package, userId from `concierge_request.userId`) → assign expert via `trip_expert_advisors` → mark `event_quotes.delivery_started_at = NOW()` → notify both parties. Admin and expert reach the existing workspace UI by `/expert/workspace/:tripId`.
- **D8 Notifications:** in-app via the existing `notifications` table (works today). Email delivery via Resend reuses `sendQuoteEmail` (new in `email.service.ts`) — **gated on the LB-P1 Resend domain verification.** Phase C ships in-app notifications functional; email delivery degrades to skip-and-log if `RESEND_API_KEY` is unset or the domain is unverified (same pattern as existing `sendPasswordResetEmail`).
- **D9 Expert assignment:** admin sets `expert_user_id` at quote-creation time. The selected expert sees a draft notification ("You've been proposed for a $X package — accept or decline") and can decline before the quote is sent. Once sent to the traveler, the expert is locked unless the quote is cancelled.

---

## GLOBAL "WHAT NOT TO DO"

- **No new fee/price/rate constants.** Quote amount is admin-entered per row. Commission resolves through the existing `commission.ts` resolver — no Full-tier-specific commission constant.
- **Do not couple Full quotes to the AI Concierge fee or the $9 tier.** Different tier, different rate, different ledger row. Member allowance is irrelevant.
- **Do not add new routes to `server/routes.ts`.** All Phase C endpoints go in `server/routes/concierge.routes.ts` (extends Phase A).
- **Do not fork PlanCard / trip / workspace.** A Full-tier trip is just a `trips` row with `eventType` matching the package. The existing workspace UI handles delivery.
- **Do not bypass the `concierge_requests` row.** Every quote MUST link to a `concierge_requests.id` (CON-A.P5 + P6 already creates one when the traveler picks `tier=full`). That row is the funnel anchor; revenue attribution depends on it.
- **Do not retroactively modify a sent quote.** D3 explicit. Cancel and reissue.
- **Do not create the `trips` row at quote-send time.** Trip is only real after payment. Until then, the package + package metadata is what the traveler sees.
- **Do not auto-assign experts.** Admin manually picks the expert for each quote. Auto-assignment is Phase D territory.
- **Do not block the brief on Resend.** Email delivery is the *channel*; in-app notifications work today and are the source of truth for delivery state.

---

## REUSE MAP (consume as-is unless noted)

| Need | Use | Evidence |
|---|---|---|
| Full/DFY catalog | `event_packages` | `shared/schema.ts` (CON-A.P8); migration 019 |
| Funnel anchor | `concierge_requests` rows with `chosenTier='full'` | `shared/schema.ts` (CON-A.P3); `concierge.routes.ts` |
| Trip + expert assignment | `trips` + `trip_expert_advisors` | existing |
| Commission resolver | `resolveCommissionRates({ category, expertId, source: 'expert' })` | `server/services/commission.ts` (EXP-OVR shipped) |
| Stripe customer / save-card | `stripe.customers.list/create` + `setup_future_usage` | `server/routes/optimization.routes.ts:204-224` |
| Revenue ledger | `revenueTrackingService.recordRevenueEvent` with new `sourceType: 'event_package'` | `server/services/revenue-tracking.service.ts:13`; `shared/schema.ts:3995` — needs enum extension |
| Workspace UI | `client/src/pages/expert/workspace.tsx` | existing |
| Admin layout for queue page | `client/src/components/admin-sidebar.tsx` + `AdminLayout` | existing |
| Notifications | `notifications` table + existing in-app surface | existing |
| Email channel | `sendQuoteEmail` (new in `email.service.ts`) — Resend-backed | LB-P1 `ca26a73` |

**Replace, don't reuse:** nothing — Phase C is pure additive on top of Phase A.

---

## PHASE 0 — Pre-flight + catalog sanity check (no code)

**Objective:** confirm the surface is ready for transactional flow.

1. **Catalog populated.** `SELECT count(*) FROM event_packages WHERE status='active' GROUP BY event_type, market`. Should return ≥1 row per (eventType, market) you plan to launch with. If empty: stop and seed via the admin UI.
2. **Phase A → Full handoff working.** Hit `POST /api/concierge/quote` with `{ eventType: 'wedding', destination: '<a market with packages>' }`. Response should have `full.available=true` and a `requestId`. Then `POST /api/concierge/select` with `tier='full'` — the `concierge_requests` row should land with `status='selected'`, `chosenTier='full'`. If not, fix Phase A's wiring before continuing.
3. **Assignable experts exist.** `SELECT id FROM users WHERE role IN ('travel_expert','local_expert','event_planner','expert') AND … any-market-relevant filter`. Need ≥1 per market.
4. **Stripe seeding.** Same Stripe customer flow as `optimization.routes.ts`; no new Stripe products. Quote PIs are one-off charges, not subscriptions.
5. **Revenue ledger enum check.**
   ```
   grep -n "revenueSourceTypes" shared/schema.ts
   ```
   Current enum includes `subscription` and `optimization_fee` but **not `event_package`**. Phase 1 needs to extend it.
6. **Notifications shape.** Confirm the `notifications` table accepts the type/data shape Phase C will use (`type='quote_sent'`, `type='quote_approved'`, etc.). One quick grep to confirm types are free-form strings, not a closed enum.

**Gate:** catalog count, expert count, ledger enum extension noted, Phase A handoff verified. No code changed.

---

## PHASE 1 — `event_quotes` schema + revenue enum extension

**Objective:** persist quotes and their lifecycle. Single source of truth for the Full tier's transactional state.

**Files:** `shared/schema.ts`, `server/migrations/024_event_quotes.sql`, `server/migrations/run-migrations.ts`.

**Steps**
1. **Schema `event_quotes`:**
   ```
   id (uuid)
   concierge_request_id (uuid, FK concierge_requests.id, REQUIRED — funnel anchor)
   event_package_id (uuid, FK event_packages.id, ON DELETE SET NULL — catalog row at time of quote)
   user_id (text, FK users.id — the traveler being quoted)
   expert_user_id (text, FK users.id — assigned expert)
   amount_cents (int, REQUIRED, > 0)
   currency (varchar 3, default 'USD')
   notes_internal (text, nullable — admin notes, not visible to traveler)
   notes_traveler (text, nullable — message included with the quote)
   status (text, default 'draft' — draft | sent | accepted | rejected | cancelled | expired)
   stripe_payment_intent_id (text, nullable, UNIQUE — set when traveler approves)
   sent_at, accepted_at, rejected_at, cancelled_at, expired_at (timestamp, nullable)
   expires_at (timestamp, nullable — set on send; default sent_at + 7d)
   delivery_started_at (timestamp, nullable — set when workspace opens)
   trip_id (varchar, FK trips.id, nullable — set on payment success)
   created_by_admin_id (text, FK users.id — admin who drafted)
   created_at, updated_at
   ```
   Plus Zod insert schema, type exports.
2. **Migration `024_event_quotes.sql`:** `CREATE TABLE IF NOT EXISTS` with indexes on `(status)`, `(expert_user_id, status)`, `(user_id, status)`, `(concierge_request_id) WHERE status != 'draft'`, `(expires_at) WHERE status='sent' AND expired_at IS NULL`.
3. **Extend `revenueSourceTypes`:** add `'event_package'` to the enum (`shared/schema.ts`). One-line change but it's in a `const as const` array — keep the order stable so existing rows don't shift index.
4. Register migration in `run-migrations.ts` after 023 (or 022 if Phase B hasn't shipped — number sequentially).

**Acceptance**
- `event_quotes` table migrates cleanly; constraints honored.
- `revenueSourceTypes` now includes `event_package`.
- No app code reads/writes the table yet — that's Phase 2.

**Verify / Gate**
```
grep -rn "event_quotes\|eventQuotes" shared/ server/migrations/
grep -n "'event_package'" shared/schema.ts
npm run check                                                                   # ≤140
```
Commit: `feat(CON-C.P1): event_quotes table + revenue ledger enum`

---

## PHASE 2 — Admin endpoints + quote-review queue UI

**Objective:** admin sees the queue of `concierge_requests` with `chosenTier='full'`, drafts a quote against each, assigns an expert, and sends it.

**Files:** `server/routes/concierge.routes.ts` (extend), `server/routes/admin.routes.ts` (extend), `client/src/pages/admin/quote-review.tsx` (new), `client/src/App.tsx` (route), `client/src/components/admin-sidebar.tsx` (nav entry).

**Steps**
1. **Admin endpoints (in `admin.routes.ts`):**
   - `GET /api/admin/quote-queue` — returns pending Full requests (concierge_requests with `chosenTier='full'` AND no event_quote with status `sent|accepted` linked yet) PLUS in-flight quotes (status `draft|sent`). Joins package, traveler, expert pool. Admin-gated.
   - `POST /api/admin/event-quotes` — draft a new quote. Body `{ conciergeRequestId, eventPackageId, expertUserId, amountCents, notesInternal?, notesTraveler? }`. Validates: request must be in `selected` state with `chosenTier='full'`; package must be active; expert must be in expert-class roles. Creates row with `status='draft'`, `created_by_admin_id` from session. Audit-log via `accessAuditLogs`.
   - `PATCH /api/admin/event-quotes/:id` — update a draft (any field). Refuse if `status !== 'draft'` (D3).
   - `POST /api/admin/event-quotes/:id/send` — transition draft → sent. Stamps `sent_at`, `expires_at = sent_at + 7d` (or admin-provided override). Inserts `notifications` row for the traveler (type `quote_sent`). Optional Resend email via `sendQuoteEmail` if `RESEND_API_KEY` is set + domain verified (skip-and-log otherwise per D8). Updates `concierge_requests.status` to `quoted`.
   - `POST /api/admin/event-quotes/:id/cancel` — admin-only cancel (D3). Stamps `cancelled_at`. Notifies traveler if quote was already sent.
2. **Quote-queue UI (`client/src/pages/admin/quote-review.tsx`):**
   - Two sections: "Awaiting quote" (concierge requests with `chosenTier='full'`, no live quote) and "In flight" (quotes with status `draft|sent`).
   - "Awaiting" rows expand into a draft form: package dropdown (filtered to the request's eventType + destination), expert dropdown, amount input (USD with cents conversion), notes fields. Save → POST /api/admin/event-quotes; Send → POST /send.
   - "In flight" rows show current status; draft rows are editable; sent rows show traveler-facing copy + cancel button.
3. **Email template (`server/services/email.service.ts`):** new `sendQuoteEmail({ toEmail, firstName, packageTitle, amountCents, currency, quoteUrl, expiresInDays })`. Mirrors `sendPasswordResetEmail` shape — Resend client guard + skip-and-log on missing API key. `quoteUrl` points to `/concierge/quotes/:id` (Phase 3 surface).
4. **Sidebar + App.tsx wiring** — Quote Review under the Concierge or Money admin section, page route gated by `requiredRole="admin"`.

**Acceptance**
- Admin sees Full-tier requests in the queue.
- Admin drafts → edits → sends a quote; sent quotes are immutable except cancellation.
- Traveler receives an in-app notification with a link to the quote view (even without email).
- Audit-log captures admin's action (drafted, sent, cancelled).

**Verify / Gate**
```
grep -rn "event-quotes\|sendQuoteEmail" server/routes/ server/services/email.service.ts
grep -rn "/admin/quote-review\|QuoteReview" client/src/
npm run check                                                                   # ≤140
```
Commit: `feat(CON-C.P2): admin quote draft + send + cancel + review queue`

---

## PHASE 3 — Traveler quote view + Stripe-gated approval + on-success workspace creation

**Objective:** the traveler views the sent quote, approves with Stripe Elements, and on payment success the trip + workspace open. End-to-end Full tier transactional flow.

**Files:** `client/src/pages/concierge/quote-view.tsx` (new), `client/src/App.tsx` (route), `server/routes/concierge.routes.ts` (traveler endpoints), `server/routes/webhooks.routes.ts` (PI succeeded handler).

**Steps**
1. **Traveler quote view (`/concierge/quotes/:id`):**
   - Auth-required (sender = `event_quotes.user_id`). 404 on mismatch.
   - Renders package title, description, amount, expires-at, expert name + bio snippet, admin's `notes_traveler` message.
   - Three states: `sent` → action buttons (Approve / Decline); `accepted` → "Payment confirmed; your trip is being set up"; `rejected|cancelled|expired` → terminal state with copy.
   - Approve flow: client calls `POST /api/concierge/quotes/:id/approve` which (a) on the server, creates a Stripe PI for `amount_cents` with metadata `{ type: 'event_package', conciergeRequestId, eventQuoteId, userId, expertUserId }` and `setup_future_usage: off_session`, (b) returns `clientSecret`. Stripe Elements on the client confirms; on success, the existing webhook handler (step 4) writes status + trip.
   - Decline flow: `POST /api/concierge/quotes/:id/reject`. Stamps `rejected_at`, notifies admin via in-app notification.
2. **Server endpoints (`concierge.routes.ts`):**
   - `GET /api/concierge/quotes/:id` — auth + ownership-gated (traveler only). Returns the quote + sanitized expert/package details (no admin notes).
   - `POST /api/concierge/quotes/:id/approve` — refuses unless `status='sent'` AND `expires_at > now()` AND `user_id === current user`. Creates Stripe PI (reuses customer lookup). Does NOT change quote status here; the webhook is the single write path for `accepted` (D8-style consistency, matches CON-B.P2 pattern).
   - `POST /api/concierge/quotes/:id/reject` — flips status; idempotent.
3. **Webhook handler (`webhooks.routes.ts`):** extend the existing PI-succeeded handler to detect `metadata.type === 'event_package'`:
   - Look up `event_quotes` by `metadata.eventQuoteId`. Refuse if not in `sent` state.
   - Within a transaction: stamp `accepted_at`, set `stripe_payment_intent_id`, create `trips` row (eventType + destination from linked `event_packages`, userId from quote), insert into `trip_expert_advisors` with the assigned expert, set `event_quotes.trip_id` and `delivery_started_at`, update `concierge_requests.status='delivered'` (or `paid`; pick one and stick to it). Record revenue via `revenueTrackingService.recordRevenueEvent({ sourceType: 'event_package', sourceId: paymentIntent.id, grossAmount: amount/100, expertId, … })` — commission resolves through `resolveCommissionRates({ category: eventType, expertId, source: 'expert' })`.
   - Notify both parties in-app. Email via `sendQuoteEmail`-style for the traveler (confirmation), and a new `sendExpertAssignmentEmail` for the expert if Resend is wired.
4. **Trip + workspace UX.** After the PI confirms client-side, the quote view shows "Your trip is being set up — opening workspace shortly" and polls `GET /api/concierge/quotes/:id` (or webhook-driven SSE if available); once `trip_id` is set, redirect to `/trip/:tripId` (existing trip view). Admin's `/admin/quote-review` queue updates to show the quote as "Accepted; in delivery."

**Acceptance**
- Traveler with a sent quote can approve it via Stripe Elements.
- On PI succeeded: trip auto-creates, expert assignment lands, quote status flips, revenue recorded with correct commission via the resolver.
- Webhook is idempotent: re-delivering the same PI event does not double-create the trip or double-record revenue.
- Expert sees the new trip in their workspace.

**Verify / Gate**
```
grep -rn "/concierge/quotes\|quote-view" client/src/ server/routes/concierge.routes.ts
grep -n "event_package" server/routes/webhooks.routes.ts server/services/revenue-tracking.service.ts
npm run check                                                                   # ≤140
```
Commit: `feat(CON-C.P3): traveler quote approval + Stripe-gated workspace creation`

---

## PHASE 4 — Sweep-on-read expiry + edge cases

**Objective:** quotes that nobody touched naturally expire without a cron job. Edge-case states (cancel after send, decline after approval race) handled correctly.

**Files:** `server/routes/concierge.routes.ts`, `server/services/concierge-router.service.ts`.

**Steps**
1. **Sweep-on-read.** In `GET /api/concierge/quotes/:id` AND `GET /api/admin/quote-queue`, before returning, run a single UPDATE:
   ```sql
   UPDATE event_quotes SET status='expired', expired_at=NOW()
   WHERE status='sent' AND expires_at <= NOW() AND expired_at IS NULL
   ```
   Idempotent; cheap; no cron needed for the Phase C MVP volume.
2. **Race guards in `/approve`:** the Stripe PI creation already guards against `status != 'sent'`. Add a second guard in the webhook handler — if the quote was cancelled between client `/approve` and PI succeeded webhook arrival, refund the PI immediately and record the refund in the ledger as `event_package_refund`. (Edge case — should be rare.)
3. **Notification on expiry.** When sweep-on-read flips a quote to expired, insert a `notifications` row for the traveler ("Your quote expired — request a new one") and the admin ("Quote expired; reissue if still relevant").
4. **`concierge_requests` cleanup on quote terminal state.** When all linked quotes are in terminal states (`accepted|rejected|cancelled|expired`) AND no `accepted` exists, optionally flip `concierge_requests.status` back to `selected` so the admin queue resurfaces the request for a reissue.

**Acceptance**
- A quote whose `expires_at` passed becomes `expired` on the next read (admin or traveler).
- Cancelled-after-approval edge case auto-refunds the PI.
- Notifications fire on auto-expiry.

**Verify / Gate**
```
grep -rn "status='expired'\|expired_at" server/routes/concierge.routes.ts
npm run check                                                                   # ≤140
```
Commit: `feat(CON-C.P4): sweep-on-read expiry + race guards + cleanup`

---

## FINAL VERIFICATION CHECKLIST

- [ ] **P1** — `event_quotes` table migrates cleanly; `revenueSourceTypes` includes `event_package`.
- [ ] **P2** — Admin drafts → sends → cancels quotes; queue surfaces Full-tier requests; audit-logged.
- [ ] **P3** — Traveler approves quote via Stripe Elements; PI succeeded webhook creates trip + assigns expert + records revenue (commission via the resolver, EXP-OVR applies).
- [ ] **P4** — Auto-expiry on read; race guards handle cancel-during-approval; notifications fire.
- [ ] Webhook idempotent: PI replay doesn't double-create trips or double-record revenue.
- [ ] Resend-channel email degrades cleanly when `RESEND_API_KEY` is unset or the domain is unverified (in-app notifications remain the source of truth).
- [ ] No new fee/price/rate constants introduced.
- [ ] No new routes added to `server/routes.ts`; everything in `server/routes/concierge.routes.ts` or `admin.routes.ts`.
- [ ] `npm run check` ≤ 140 (the floor) after every phase.

## KNOWN FOLLOW-UPS (not in this brief)

- **Partial / deposit payments** — Phase C MVP charges full amount upfront. A 50% deposit + balance-on-delivery model is a real-world Full-tier expectation; size and prioritize after first quotes ship.
- **Dispute resolution surface** — once `delivery_started_at` is set, refunds and disputes need a dedicated surface (currently tracked as Deferred-P2 in `audit-coverage-tracker.md`).
- **Multi-expert team assignments** — single expert per quote in Phase C. Wedding-grade events may need 2+ experts; flag for Phase D.
- **Per-package commission override** — `event_packages` could carry a `commissionRateOverride` field that beats `commission.ts`'s category lookup. Skipping in Phase C; resolver already supports the dimension if added.
- **Quote PDF generation** — for traveler records. Out of scope; tracker-level item.
- **Auto-assignment / matching** — admin manually picks the expert. Matching service is a Phase D nicety.

## OUT OF SCOPE

$9 power-user tier (CON-B) · subscription/allowance logic · AI Concierge fee changes · FEE workstream (override hierarchy, effective-dating, audit trail, etc.) · dispute resolution · refund workflow after delivery starts · multi-currency · multi-expert per quote · partial/deposit payments · quote PDF generation.

---

## CHANNEL-DEGRADATION NOTE

Phase C ships with email delivery via Resend as **optional**: if `RESEND_API_KEY` is set AND the LB-P1 domain is verified, traveler/expert notifications also send email. If either is missing, in-app `notifications` rows are the source of truth and the flow still works end-to-end — just without the inbox copy. This decouples CON-C from the still-pending Resend domain verification.
