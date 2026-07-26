# Earn Pipeline Evaluation — application → console → offering → verification → payout

**Date:** Jul 25, 2026 (direct audit; the 4-agent workflow hit the monthly spend limit, so this was traced
by hand with targeted searches — every claim below is file:line-cited from a file actually opened).

**Headline:** the KYC + banking spine the decision-maker asked for is **substantially BUILT** — much more
than the program dispatch assumed. Stripe Identity (individuals) + Persona KYB (businesses) + Stripe Connect
Express (bank + payout) are all coded, mounted, client-wired, and webhook-backed. **The gap is orchestration,
not construction: verification exists but is not ENFORCED as a gate, and Connect onboarding is a
self-service button not sequenced into the application flow.** That makes the "verify everyone through
Stripe/Plaid/similar" requirement a *gating* job, not a *build-from-scratch* job — far cheaper than feared.

---

## 1. Earn page → application (COMPLETE)

- `/earn` (`client/src/pages/earn.tsx`) is clean and fully config-driven: 4 role cards + an EA text link,
  earning %s resolved live from `fee_bands` (no literals), role→offering mapping partition-by-construction
  in `client/src/lib/earn-roles.ts` (with a completeness test).
- Four advertised paths → two application routes: **Service Provider** + **Event Planner** →
  `/become-provider` (`ServicesProviderPage`); **Trip Planner** → `/become-expert?type=travel_expert`;
  **Local Expert** → `/become-expert?type=local_expert`. **EA** → `/become-expert?type=executive_assistant`
  (earn-roles.ts:113, explicitly "real signup, no offering backing yet").
- Every "I do this →" carries `?offeringTypeKey=…` into signup (§5 selection-only — the applicant *selects*
  an offering type, doesn't create a listing).
- Routes resolve: `App.tsx:448-459` maps both `/become-*` and the supply-recruitment aliases
  (`/expert/apply`, `/provider/new-service`) to the two application pages. **No advertised path is
  dead; no orphan form.** Matches the console roles exactly.

## 2. Role grant timing — at SELECTION, not approval (design choice worth stating)

The user's `role` is set when they **pick their subtype at signup** (`storage.updateLocalExpertFormType` →
`users.role = expertType`, storage.ts:1049-1056), **not** when an admin approves. The approval function
(`updateLocalExpertFormStatus`, storage.ts:914) captures neighborhoods + enrolls the city but **never
touches `users.role`** (verified: zero `role` writes in 914-1053).

Consequence: an applicant gets **console access immediately** (pending form status), and **F2 born-submitted
+ the read-gate** are what keep their offerings hidden from the public until approval — not console entry.
This is internally consistent (console = build surface; approval = public visibility), but it means
**"pending" applicants are already inside the console**, so the empty-state/onboarding copy must be honest
about their pending status. Two vocabulary quirks found: provider role is checked as **both** `"provider"`
and `"service_provider"` in different gates (experts.routes.ts:394 etc.) — a latent inconsistency the
backoffice work should normalize.

## 3. Identity verification (KYC) — BUILT, NOT GATED (the real gap)

**What exists (all mounted + wired — this surprised the audit):**
- **Stripe Identity** (document verification, individuals): `server/routes/identity.routes.ts` — mounted at
  `routes.ts:566`, `POST /api/identity/create-session` creates a `stripe.identity.verificationSessions`
  (type `document`), stamps `identityVerificationSessionId` + status `processing` on the form. Client
  consumers: `expert-status.tsx:106`, `provider-status.tsx:164`, `provider/settings.tsx:71`,
  `expert/settings.tsx:61`, `ea/settings.tsx:39`. **Webhook** `identity.verification_session.verified` →
  `updateFormIdentityVerification(...'verified')` (webhooks.routes.ts:65-73). Admin queues display the
  status (admin/experts.tsx:520, admin/providers.tsx:709); the "Verified" badge on expert cards resolves
  from `identityVerificationStatus === "verified"` (expert-card.tsx:109 — the honest post-§13 badge).
- **Persona KYB** (business verification): `POST /api/identity/business/create-inquiry`
  (identity.routes.ts:59) — real Persona inquiry API, HMAC-verified webhook (webhooks.routes.ts:81), with a
  graceful **no-key fallback** to `businessVerificationStatus='submitted'` for manual admin review.
- **NOT Plaid** — but "Stripe or similar" is satisfied by Stripe Identity + Persona.

**The gap:** verification is **collected, displayed, and badge-driving — but not a hard gate.** Nothing
requires `identityVerificationStatus === 'verified'` before (a) admin approval, (b) offering
creation/publish, or (c) payout. The per-category `verificationRequired` + `requiredDocuments`
(admin.routes.ts:2044+) is **seed metadata, not enforced at runtime**. So today an unverified applicant can
be approved and list. Meeting the decision-maker's "must be verified" bar = **wiring the existing
`identityVerificationStatus` into the approval and/or publish gate** (an F2-style read-gate on a field that
already exists and is already populated), plus making the verification step a *required, sequenced* part of
the application rather than a button on the status page.

## 4. Bank accounts + payout — Stripe Connect Express, BUILT + payout-guarded

- **Connect Express account** (`stripe-connect.service.ts:37`, `type: 'express'`) — Express onboarding makes
  **Stripe collect bank details + verify identity**, so this *is* the bank-account collection and doubles as
  payout-KYC. No raw bank-number fields anywhere (correct — you never want to store those).
- Created via `POST` (payments.routes.ts:698) triggered by the **StripeConnectCard button** — gated to
  experts/providers, idempotent (reuses an active account), stores `stripeAccountId` +
  `stripeAccountStatus`. Status tracked via `getAccountStatus` (charges/payouts/details_submitted).
- **Payout correctly BLOCKS without an active account:** admin payout processing returns
  *"Recipient does not have an active Stripe Connect account. They must complete onboarding first."*
  (admin.routes.ts:3714), guarded on `recipientStripe.stripeAccountId && canReceivePayments` (3629).
- **The gap here is sequencing, not safety:** Connect onboarding is a **self-service button, not sequenced
  into the pipeline** — an approved earner who never clicks "Connect payouts" simply can't be paid (the
  guard catches it honestly, but nothing prompts them at the right moment). There's a
  `stripe-connect-reminder.service.ts` nudge, but onboarding isn't a required step gating go-live.

## 5. Verdict & what the program should add

The supply spine is in far better shape than the dispatch assumed — **application→console→offering is
complete, and KYC + banking are built.** What's missing is a thin **orchestration layer** that turns the
existing pieces into an enforced sequence:

**Proposed Phase 0.5 — "Verification gating & payout readiness" (mostly wiring existing fields):**
1. **Gate on the field that already exists:** make `identityVerificationStatus === 'verified'` (and, for
   businesses, `businessVerificationStatus`) a **required condition** for the step the decision-maker
   intends — recommend **publish/go-live** (offering becomes publicly visible) rather than console entry, to
   preserve the §5 "build while pending" model. This is an F2-style read-gate on a populated column.
2. **Sequence verification into the application**, not just a status-page button — the applicant should be
   walked through Identity (and KYB, for businesses) as part of applying, so "pending" means "pending
   review" not "hasn't started verifying."
3. **Sequence Connect onboarding into go-live:** an offering cannot be *published/paid-out-eligible* until
   the owner has an active Connect account (the payout guard already enforces the money side; this adds the
   surface-side prompt so earners aren't surprised at first payout).
4. **Normalize the `provider` vs `service_provider` role vocabulary** (latent inconsistency across gates).
5. **EA has no offering backing** (earn-roles.ts:113) — confirm EAs are intentionally non-selling (they are,
   per the role-fit pass) so the earn page's honest "no offering yet" copy stays.

**Tiering (for IMPLEMENTATION_MAP.md):** items 1, 3, 4 are **Sonnet** behind behavioral gates (verified-vs-
unverified publish, no-Connect payout still blocked); item 2 is **Sonnet** UI-sequencing; nothing here is a
from-scratch build or a money-math change, so **no Fable item** — the money guard (payout block) already
exists. Est. ~180k tokens total. This slots **before Phase 1 go-live surfacing** (an unverified `/p/{handle}`
must not be publishable), so it becomes a **Phase-1 dependency**, not a parallel lane.

**Filed defect adjacent to this pass:** the identity/KYB integration's env dependencies
(`STRIPE_*` webhook secret, `PERSONA_API_KEY`/`PERSONA_TEMPLATE_ID`/`PERSONA_WEBHOOK_SECRET`) are
deploy-time config — the no-key fallbacks are safe (manual review), but a launch checklist must confirm the
keys are set or every applicant silently falls to manual review.
