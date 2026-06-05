# Launch-Blocker Fix Brief

**Source:** Business Plan ↔ Codebase Gap Audit (2026-06-05)
**Scope:** The four pre-launch must-fixes + a final batch of zero-risk mechanical cleanups. Everything else from the audit (the $9 concierge power-user tier, 5-tier service structure, dispute resolution, insurance tiers, KYC/AML, effective-dating, audit trail) is **Phase-2, out of scope here** — the v1.3 plan defers those to Months 7–12.

> **Monetization context (read once):** Traveloure no longer has a discount-club subscription. Monetization is a pay-per-use **Concierge** layer above the experts — **AI Concierge** (the AI Optimization Engine, per-task fee), **Expert Concierge** (commission split), **Full / Done-for-You** (events) — plus an optional $9/mo concierge tier that *discounts but never gates* the concierge. For this brief, that means **Phase 3 is now a revenue path, not a cleanup**: the AI Optimization endpoint *is* the AI Concierge, and its per-task fee is a launch revenue line. The $9 tier's included-allowance/overage logic is **Phase-2** — out of scope here.
**Target agent:** Claude Code, working in the repo working tree (not the deployed URL).

---

## HOW TO USE THIS BRIEF — READ BEFORE WRITING ANY CODE

1. **Read this entire document first.** Do not start Phase 1 until you have read every phase. The phases share context (route duplication, the fee resolver) and the order is deliberate.
2. **Work strictly in phase order.** Phase 1 → 2 → 3 → 4 → 5. Do not jump ahead or batch phases together.
3. **Stop at each verification gate.** Every phase ends with a grep + `tsc` check and a commit. If a verification step fails, fix it before moving on. Do not proceed with a failing typecheck.
4. **Use the file:line references as starting points, not gospel.** Line numbers are from the audit and may have drifted. Confirm by reading the file before editing.
5. **One branch per phase or one branch for the whole brief — your call — but one commit per phase**, with the phase number in the message (e.g. `fix(P1): token-based password reset`).
6. If a step is blocked by a missing dependency (see Phase 1's email note), **stop and surface it** rather than inventing an integration.

---

## GLOBAL "WHAT NOT TO DO"

- **Do not** introduce any new hard-coded fee/rate/price literal. Every rate must resolve from the existing config store or the §4.8 defaults table — never a constant in checkout/payout logic.
- **Do not** create a second copy of anything that already exists. If a table, endpoint, or component is already present (the audit lists many "exists but unused" items), **wire the existing one in** — do not build a parallel version.
- **Do not** add new routes to the 20K-LOC `server/routes.ts`. New endpoints go in the appropriate `server/routes/*.routes.ts` module.
- **Do not** weaken auth, expand a token's lifetime, or log secrets/tokens in plaintext.
- **Do not** touch any item marked Intentionally Deferred (Expert Leaderboard, deeper expert analytics, admin invoice UI).
- **Do not** refactor unrelated code "while you're in there." Stay inside the phase's file list.
- **Do not** mark a phase done if its acceptance criteria aren't all met.

---

## PHASE 0 — Orientation & Baseline (no code changes)

**Objective:** Establish a clean baseline and confirm the duplicate-route landscape before changing anything.

**Steps**
1. Confirm the working tree is clean and on a fresh branch off the main line.
2. Capture a baseline typecheck: run `tsc --noEmit` (or the project's `npm run check` / `npm run typecheck`) and save the output. You need to know which errors pre-exist so you don't get blamed for them.
3. Map the duplicate-route risk. The audit flags that `server/routes.ts` (≈20,289 LOC) re-declares routes that also live in `server/routes/*.routes.ts`. Run:
   ```
   grep -rn "app.use(" server/index.ts server/routes.ts server/app.ts 2>/dev/null
   grep -rn "booking-fee-config" server/
   grep -rn "optimize-experience\|optimization.routes\|optimizationRouter" server/
   grep -rn "/api/credits/purchase\|/api/cart\b" server/
   ```
   Note, for each relevant endpoint, **which file registers it and in what order** (last registration wins). You will need this in Phases 2 and 3.

**Verify / Gate:** Baseline typecheck captured; duplicate-route map written down. No code changed.

---

## PHASE 1 — P0 SECURITY: Token-based password reset

**Objective:** Eliminate the account-takeover hole. The current reset endpoint accepts `{email, newPassword}` with **no token**, so any caller can reset any account.

**Files**
- `server/replit_integrations/auth/emailAuth.ts:217-259` (the vulnerable handler)
- `shared/schema.ts` (new reset-token storage)
- The auth router module that mounts these handlers (find it; do not add to `server/routes.ts`)
- Wherever scrypt hashing already lives (reuse it — see `emailAuth.ts:55,116`)

**Required flow (replace the existing handler entirely)**
1. **Storage:** add a `password_reset_tokens` table — `id`, `userId`, `tokenHash` (store a hash of the token, never the raw token), `expiresAt`, `usedAt` (nullable), `createdAt`. Generate the migration the project's tooling expects (Drizzle).
2. **Request endpoint** `POST /api/auth/forgot-password` — body `{ email }`:
   - Always respond `200` with a generic message regardless of whether the email exists (no account enumeration).
   - If the user exists: generate a cryptographically random token (≥32 bytes), store its **hash** with a short `expiresAt` (e.g. 30–60 min), and send the raw token to the user via email as a reset link.
3. **Reset endpoint** `POST /api/auth/reset-password` — body `{ token, newPassword }`:
   - Look up by token hash; reject if not found, expired, or already used.
   - Validate password strength to the project's existing standard.
   - Hash the new password with the **same scrypt path** the rest of auth uses.
   - Mark the token `usedAt`, and invalidate the user's existing sessions.
4. **Delete** the old tokenless reset path so it can't be called.

**Email dependency — surface, don't invent.** The audit shows email verification has no send/confirm endpoints, which suggests **no transactional email provider is wired**. Before assuming one exists:
```
grep -rni "sendgrid\|postmark\|resend\|nodemailer\|ses\|mailgun\|smtp" server/ package.json
```
- If a sender exists, use it.
- If none exists, **stop and flag it.** Do not fabricate an email integration. The secure interim that still ships: implement the full token flow and the two endpoints, remove the vulnerable handler, and report "reset email requires a transactional email provider — none configured" as a blocker for the launch owner to resolve. Closing the hole is the non-negotiable part; the delivery channel is the decision to escalate.

**Acceptance criteria**
- The tokenless `{email, newPassword}` reset path no longer exists anywhere.
- `forgot-password` never reveals whether an email is registered.
- A reset token is single-use, hashed at rest, and time-limited.
- Resetting invalidates existing sessions.
- New password uses the existing scrypt hashing, not a new scheme.

**Verify / Gate**
```
grep -rn "newPassword" server/replit_integrations/auth/   # confirm no tokenless reset remains
grep -rn "password_reset_tokens" shared/ server/           # storage + usage present
tsc --noEmit                                               # no new errors vs Phase 0 baseline
```
Commit: `fix(P1): token-based password reset, remove account-takeover endpoint`

---

## PHASE 2 — P0 BILLING INTEGRITY: Remove checkout fee literals

**Objective:** Stop showing/charging fees from hard-coded numbers that don't match the resolver. `client/src/pages/itinerary.tsx:649-654` hard-codes `platformFeePercent = 12; expertSharePercent = 70;`. The real config endpoint `/api/booking-fee-config` already exists at `server/routes/payments.routes.ts:565-599` and is **not called**.

**Files**
- `client/src/pages/itinerary.tsx:649-693` (Bookings Summary card)
- `server/routes/payments.routes.ts:565-599` (existing endpoint — confirm it's the one that wins, per Phase 0)

**Steps**
1. Using the Phase 0 route map, confirm `/api/booking-fee-config` is not shadowed by a duplicate in `server/routes.ts`. If a duplicate exists, the canonical handler is the one in `payments.routes.ts`; note the conflict for the launch owner but wire the client to the documented endpoint.
2. In `itinerary.tsx`, remove the `12`/`70` literals. Fetch the resolved rate(s) from `/api/booking-fee-config` and compute the summary as `pendingTotal * resolvedRate` (the shape the endpoint already returns).
3. Fix the **design gap** at the same time: the footer currently prints raw `12%`/`70%` next to the row. Per the v4 wireframe, show a single Subtotal / Fees / Total — do not print raw rate percentages that will look wrong the moment an admin changes them.
4. Handle the loading/error state (don't render a total against `undefined` rate).

**Acceptance criteria**
- No numeric fee literal remains in `itinerary.tsx`.
- The summary total matches what the server-side resolver would compute for the same cart.
- Footer shows Subtotal / Fees / Total, not raw rate percentages.

**Verify / Gate**
```
grep -n "platformFeePercent\|expertSharePercent\|= 12\|= 70" client/src/pages/itinerary.tsx   # expect 0 fee literals
grep -n "booking-fee-config" client/src/pages/itinerary.tsx                                   # endpoint now consumed
tsc --noEmit
```
Commit: `fix(P2): checkout reads booking-fee-config, remove hard-coded 12/70 literals`

---

## PHASE 3 — Activate the AI Concierge router (paywall + free savings preview)

**Objective:** `server/routes/optimization.routes.ts` is fully written but **never mounted** → 404 at runtime, so the paid optimization flow and the free `/api/optimization-preview` heuristic are both dead. Meanwhile the shipped `/api/ai/optimize-experience` (`server/routes.ts:1275`) has **no payment gate** and gives full LLM output free. Mounting the router restores the intended split.

**Files**
- `server/routes/optimization.routes.ts` (the unmounted router; fee logic at `:36-52`)
- Wherever routers are registered (the `app.use(...)` site found in Phase 0 — **not** a new line in `routes.ts`)
- `server/routes.ts:1275` (the ungated endpoint)

**Steps**
1. Mount `optimization.routes.ts` at its intended base path via the existing router-registration site. Confirm it does not collide with `/api/ai/optimize-experience`.
2. Verify the free vs paid split now works end to end:
   - `/api/optimization-preview` returns the **free heuristic** output (no LLM) and is reachable without payment.
   - The paid optimization endpoint enforces its gate.
3. Reconcile the fee defaults with §4.8. The router currently defaults to `{simple:499, standard:999, complex:1999}` cents, which do **not** match §4.8 ($9.99 standard / $49.99 event / 5 credits / $0=off). Update the defaults in `optimization.routes.ts:36-40` (and the matching admin config at `client/src/pages/admin/fee-config.tsx:373-377`) to the §4.8 values. **Do not** introduce a new literal elsewhere — these must remain the admin-editable `optimization_fees` config with §4.8 as the fallback.
4. Decide the ungated `/api/ai/optimize-experience`: either route it behind the same gate or restrict it to internal/expert use. Do not leave a free public path to full LLM optimization. Flag the choice in the commit message.

> **Out of scope for this phase:** replacing the static `/optimize` Paris mock with a real backend call (audit add-on #12) and the guest-facing savings-analysis page (#8). Those are M-effort UI builds — leave them for the Phase-2 brief. This phase only restores the backend wiring and the fee defaults.

**Acceptance criteria**
- `optimization.routes.ts` is mounted and its endpoints return non-404.
- A free heuristic preview path exists and requires no payment.
- No unauthenticated/free path to full LLM optimization remains.
- Optimization fee defaults equal §4.8; still resolved from `optimization_fees` config, not a constant.

**Verify / Gate**
```
grep -rn "optimization.routes\|optimizationRouter" server/         # mounted, single registration
grep -n "499\|999\|1999" server/routes/optimization.routes.ts      # expect updated to §4.8 values
tsc --noEmit
```
Commit: `fix(P3): mount optimization router, align fees to §4.8, gate LLM optimization`

---

## PHASE 4 — Affiliate rate wiring + expert verification badge

Two independent S-effort trust/revenue fixes. Do both, verify together.

### 4a — Wire `affiliate_partners.commissionRate` into the service
**Problem:** `server/services/affiliate.service.ts:23-52` uses an in-memory commission map and **ignores** the admin-editable `affiliate_partners.commissionRate` column (`shared/schema.ts:3530`), which the admin UI at `affiliate-partners.tsx:1056-1074` already writes.

**Steps**
- Replace the in-memory map lookup with a read of the partner's `commissionRate` from the DB at link-creation time.
- Keep the in-memory values only as a fallback when a partner row has no rate set.

**Acceptance:** changing a partner's commission in the admin UI changes the rate used at link creation; no in-memory rate overrides a DB value.

### 4b — Render the verification badge on traveler-facing expert cards
**Problem:** `identityVerificationStatus` exists (`shared/schema.ts:394,433`) but no traveler-facing UI reads it.

**Steps**
- Add a `<ShieldCheck />`-style badge that renders when `identityVerificationStatus === 'verified'` on `client/src/pages/travel-experts.tsx` and `client/src/pages/expert-detail.tsx` (and the shared `ExpertCard` component if one exists — check before duplicating markup).
- Do not show anything for unverified/pending (no negative badge).

**Acceptance:** verified experts show the badge on listing and detail; the value is read from `identityVerificationStatus`, not hard-coded.

**Verify / Gate**
```
grep -rn "commissionRate" server/services/affiliate.service.ts          # column now read
grep -rn "identityVerificationStatus" client/src/pages/travel-experts.tsx client/src/pages/expert-detail.tsx
tsc --noEmit
```
Commit: `fix(P4): affiliate rate from admin config + expert verification badge`

---

## PHASE 5 — Mechanical cleanups (zero-risk batch)

Only the genuinely mechanical, no-decision items. Skip anything that needs a schema decision.

### 5a — Single source of truth for credit packages
**Problem:** three conflicting hard-coded package definitions: `client/src/pages/pricing.tsx:22-53`, `client/src/pages/credits.tsx:12-44`, `server/routes/payments.routes.ts:196-201` (and `server/routes.ts:2893`).

**Steps**
- Pick `server/routes/payments.routes.ts:196` as canonical, move the definition into `shared/`, and import it everywhere. Delete the other copies.
- Confirm `pricing.tsx`, `credits.tsx`, and `credits-billing.tsx` now render identical packages/bonuses.

**Acceptance:** one definition; all three screens agree.

### 5b — Wire MapControlCenter into the expert workspace Map tab
**Problem:** `client/src/pages/expert/workspace.tsx:808` renders "Map view coming soon" though `MapControlCenter` (711 LOC) is already built and used by PlanCard.

**Steps:** drop the existing `MapControlCenter` into the workspace Map tab, passing the trip's activities. Reuse — do not fork the component.

**Acceptance:** workspace Map tab renders the activity map; no new map component created.

**Verify / Gate**
```
grep -rn "credit_packages\|CREDIT_PACKAGES\|creditPackages" shared/      # single canonical export
grep -n "coming soon" client/src/pages/expert/workspace.tsx              # map line resolved
tsc --noEmit
```
Commit: `chore(P5): canonical credit packages + wire MapControlCenter into workspace`

---

## FINAL VERIFICATION CHECKLIST (run before declaring done)

- [ ] **P1** — No tokenless reset path remains; token flow is single-use, hashed, time-limited, session-invalidating. Email dependency resolved or escalated.
- [ ] **P2** — No fee literals in `itinerary.tsx`; totals match the resolver; footer shows Subtotal/Fees/Total.
- [ ] **P3** — Optimization router mounted; free preview reachable; no free public LLM-optimization path; fee defaults = §4.8 via config.
- [ ] **P4** — Affiliate rate reads admin config; verification badge renders for verified experts.
- [ ] **P5** — One credit-package definition; workspace Map tab live.
- [ ] `tsc --noEmit` shows **no new errors** vs the Phase 0 baseline.
- [ ] No new hard-coded fee/rate literal was introduced in any phase.
- [ ] No new route was added to `server/routes.ts`.

## OUT OF SCOPE (Phase-2 brief, do not start here)
$9 concierge power-user tier (included AI allowance + overage + priority-expert routing) · 5-tier expert service structure · dispute resolution surface · provider insurance tiers + tier-based commission · `expertTier` new/established split · fee effective-dating · fee-change audit trail · affiliate `behaviorMode` (retain/markup/rebate) · native-first browse sort · replacing the `/optimize` static mock · guest-facing savings-analysis page · KYC/AML hooks · background-check + appeals · email verification send/confirm.
