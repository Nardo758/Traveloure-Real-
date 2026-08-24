# Replit suggestion triage

Source: the Replit Agent "Suggested" enhancements panel (screenshots, Jul 20 2026).
Method: each item cross-checked against `main` — Replit generates these mechanically from
code patterns and does **not** know what already shipped or what decisions rule out, so the
label is never trusted. Before building any 🟢DO item, re-verify against `main` (the
`rating-hold` lesson: a branch/suggestion can look un-done by every quick signal yet already
be in `main`).

Tags: ✅ DONE (don't rebuild) · 🟢 DO (real gap, worth it) · 🟡 DECISION (needs a product/infra
call first) · ⚪ SKIP (noise, or conflicts with a ratified decision).

---

## ✅ DONE — already in `main`, do not rebuild

| Suggestion | Where it already lives |
|---|---|
| Catch broken navbar / footer / app-route / setLocation / navigate links before they ship | `navbar-links-gate`, `footer-links-gate`, `app-routes-gate` CI workflows |
| Catch stale nav/footer links with a CI gate | same gates (Route Coverage Gate) |
| Catch a Postgres-service workflow that never calls the composite action | `composite-action-script-paths` + `ci-db-setup-lint` gates |
| Add an automated check that catches migration chain gaps | migration-chain test over `server/migrations/migration-files.ts` |
| Verify migrations run clean on a fresh prod database | `scripts/preflight-prod-constraints.cjs` (+ RELEASE.md) |
| Extend double-confirmation protection to the service bookings flow | §15 idempotency (`service_bookings.idempotency_key`, migration 096) |
| Prevent duplicate bookings for the same activity on the same date | migration 099 slot-unique index + checkout idempotency |
| Make sure the cart price matches what gets charged at checkout | §14 — client never sends the amount; server derives it |
| Keep the cart fee preview accurate when a booking-concierge service is removed | covered by the `loadCoveringInventory` gating (§1 F2 extension) |
| Fix pre-existing TypeScript errors in the migration runner | part of the known 255-error tsc baseline (not a regression) |
| Catch broken EA routes / seed EA gift+event rows for smoke tests | EA console activated + smoke coverage (§9 EA activation) |
| Catch blank EA trip cards when start/end date missing | already guarded in the EA console |
| Stamp the removed 075 migration in the prod ledger | documented in `migration-files.ts` header (075 consolidation note) |
| Use content-impression data to improve the Discover feed loop | migration 116 + `/api/tracking/impression` writer already landed |
| Extend the sign-in intercept to the Replit/Social OAuth path | passport serializers register in all envs (fix #133) |

## 🟢 DO — real gaps, cross-checked as genuinely missing

These map to **filed follow-ups already in CLAUDE.md**, so they're pre-blessed in principle.

### Provider hub (continues the provider-hub thread)
- **Let providers duplicate / bulk-edit their services** — `storage.duplicateService()` exists but has **no UI button**. Small: wire a "Duplicate" action on the provider services list. (F2-safe: duplicate already resets approval to `submitted`.)
- **Let providers see their own verification status + request a review** — no UI today (only payout-request UI exists). Needs a read of `users.providerVerificationStatus` + a request action.
- **Email providers when their background check is approved/rejected** — needs email infra (see 🟡).
- **Validate & preview pricing tiers before saving; show pricing tiers on booking cards + checkout** — `pricingTiers` is on `provider_services` and partly shown on service-detail; **not** surfaced in cart/checkout. Medium.

### Money / fees (all filed under §7/§8)
- **Make the Booking-Concierge fee configurable from the admin panel** — still hardcoded `$499 / 8%` (`fee-literal-ok`, "Phase 4.1 TODO" in `optimization-fee.service.ts`). Migrate to `fee_bands`/config.
- **Show the Booking-Concierge / coordination fee on booking detail + my-bookings** — filed; fee is computed but not surfaced to the traveler there.
- **Remove duplicate provider-role fee logic** — verify against `resolveCommissionRates`; likely a real dedupe.

### Demand-signal loop (the "wanted slot" system)
- **Wire the "request this service" form so travelers can submit a service need** — no submit form found; `service_demand_signals` is read-only today (`GET /api/services/demand`).
- **Add a "Request this service" button on offering cards that aren't available yet.**
- **Notify travelers when a requested service goes live** — needs email/notification infra (see 🟡).

## 🟡 DECISION — valid, but needs a call before building

- **Promote more CI gates to required branch-protection checks** — good instinct, but we just fixed a required-context **name mismatch** (#263). Any new required check must use the *exact* reported name or it sticks on "Expected." Do this deliberately, one at a time, with the real names.
- **Share the build cache / parallelise the three gate setup jobs into one shared cache** — real CI-speed win, low risk; worth doing but it's infra work, schedule it on its own.
- **Any email feature** (booking confirmation codes, payment-failure emails, weekly admin/traveler digests, background-check-decision emails) — all blocked on an **email-infrastructure decision** (provider, templates, unsubscribe). One decision unblocks ~6 suggestions.
- **Seed catalog services for party/event templates; seed platform expert service tiers** — check against the **Kyoto single-market wedge (§12)** before seeding breadth; may be premature.
- **Make the slow-query threshold configurable per endpoint; add slow-query warnings to expert-listing / AI-chat endpoints** — reasonable, but confirm we want per-endpoint tuning vs the global monitor we just relocated to System.

## ⚪ SKIP — noise or already-covered

- Most "prevent X from crashing / looping / reaching production" items (broken share link, itinerary stuck loading, shared-trip crash on invalid token, etc.) are **already covered** by the existing route/smoke gates, or are speculative. Only add a gate if a real failure is observed.
- "Add a React error boundary around the checkout UpsellSlot" / "wire real-click navigation for UpsellSlot cards" — verify UpsellSlot is even mounted before hardening it (much of that surface was dark per §9).

---

## Recommended first batch

Highest value-per-effort, all 🟢, all continuing threads we just shipped, none blocked on a decision:

1. **Provider self-service** — duplicate/bulk-edit services (UI for the existing storage fn) + verification-status + request-review. One PR.
2. **Booking-Concierge fee → config + display** — migrate the `$499/8%` literals to `fee_bands`/config and surface the fee on booking detail / my-bookings. One PR (closes two §7/§8 TODOs).

Email-dependent items wait on the email-infra decision; CI-required-check promotion is done one-at-a-time with exact names.
