# Audit Coverage Tracker

Maps every gap from the Business Plan ↔ Codebase Gap Audit (2026-06-05) to an owner and status, so it's clear at a glance what's claimed vs orphaned. Update the **Status** column as work lands.

**Owners**
- `LB-Pn` — Launch Blocker Fix Brief, phase n (execution-ready)
- `CON-A/B/C` — Concierge plan, phase A/B/C (plan pending Claude Code)
- `FEE` — Fee Architecture workstream (needs planning — see note at bottom)
- `P2` — Deferred to Phase-2 per v1.3 timeline (Months 7–12)
- `—` — Unowned (needs assignment)

**Status:** `Specced` (brief exists) · `Plan pending` · `Needs planning` · `Unowned` · `Deferred` · `Not a gap`

---

## Launch Blocker sweep — SHIPPED (branch `claude/laughing-bardeen-KyTUY`)

| Gap | Owner | Status |
|---|---|---|
| Password reset accepts no token (P0 account takeover) | LB-P1 | ✅ Shipped (`ca26a73`) — token flow via Resend; gated on RESEND_API_KEY (set) + verified sending domain (in progress) for E2E delivery |
| Checkout fee literals `itinerary.tsx` 12%/70% (P0 billing) | LB-P2 | ✅ Shipped (`622c955`) — reads `/api/booking-fee-config` |
| Booking footer shows raw rate % (design) | LB-P2 | ✅ Shipped (`622c955`) — collapsed to Subtotal/Fees/Total per v4 wireframe |
| AI optimization router unmounted / no paywall | LB-P3 | ✅ Shipped (verified IN as Phase A prereq) |
| Free AI Savings preview unreachable (guest hook) | LB-P3 | ✅ Shipped (verified IN as Phase A prereq; `/api/optimization-preview` guest-reachable) |
| Ungated free LLM optimization | LB-P3 | ✅ Shipped — absorbed into CON-A.P1 (`e6da614`), both `/api/ai/optimize-experience` defs restricted to admin/expert |
| Affiliate `commissionRate` column ignored by service | LB-P4a | ✅ Shipped (`250f0e9`) — `affiliate.service.ts` resolves rate from DB |
| Expert verification badge not rendered traveler-side | LB-P4b | ✅ Shipped (`250f0e9`) — `expert-card.tsx` reads `identityVerificationStatus` |
| 3 conflicting credit-package definitions | LB-P5a | ✅ Shipped (`e96e159`) — canonical `shared/credit-packages.ts`, 5 duplicates removed |
| Expert workspace Map "coming soon" | LB-P5b | ✅ Shipped (`e96e159`) — `MapControlCenter` wired into workspace |

## Concierge Phase A — SHIPPED (branch `claude/laughing-bardeen-KyTUY`)

| Gap | Owner | Status |
|---|---|---|
| `/optimize` static mock → real request surface | CON-A | ✅ Shipped (P6 `2c4e5e7`) |
| AI Concierge pay-per-use surface | CON-A | ✅ Shipped (P5/P6) |
| Expert Concierge escalation UX + availability gating | CON-A | ✅ Shipped (P4 `61739ef`, P7 `c36984a`) |
| AI Concierge fee per-event-type mapping (`$0=off`, $9.99/$49.99) — FEE-A | CON-A | ✅ Shipped (P2 `bba24fd`) |
| `concierge_requests` intent log (N5) | CON-A | ✅ Shipped (P3 `db1f3e1`) |
| `event_packages` catalog (N6) | CON-A | ✅ Shipped (P8 `74c481f`) |
| Legacy `/api/ai/optimize-experience` free LLM leak | CON-A | ✅ Shipped (P1 `e6da614`) |
| $9 concierge tier (subscription, allowance, overage) — FEE-B | CON-B | **Specced** — `docs/planning/concierge-phase-b-brief.md` (`1d032dc`); execution gated on ≥4 weeks of `ai_cost_tracking` data to set included-plan cap per §4.7 |
| Full / Done-for-You transactional flow | CON-C | **Specced** — `docs/planning/concierge-phase-c-brief.md` (`87c4aec`); execution gated on ≥1 active `event_package` per launch market + ≥1 assignable expert |

## Fee Architecture (triage applied — see `docs/planning/fee-workstream-scoping.md`)

| Gap | Owner | Status |
|---|---|---|
| **Per-expert commission override** (`users.commission_override_expert_share_percent` + Tier-3 branch in `resolveCommissionRates` before category fallback + admin editor, audit-logged) | **CON / ✅ Shipped** (P1 `7d1c250`, P2 `5b13915`, P3 `79b335f`) | **Recruitment gate clears once tested E2E in staging.** Then §6.9 "20% vs 25%" outreach can ship; admin sets new beta experts to 80 before first booking settles. (Stored as expert-share %, not platform rate — same math, self-documenting name.) |
| **Provider insurance-tier → tier commission (12/8/6/4)** | **FEE-2** | **Launch-blocking. Specced** — `docs/planning/fee-2-provider-insurance-tier-brief.md`. Three phases: insurance fields + tier column on `serviceProviderForms`, resolver branch, admin UI. Locked admin-validated (compliance + revenue-anchored). Ready to execute. |
| **`pricing.service.ts` deposit rate hardcoded 0.25** (P0 billing literal — charged via Stripe PI on deposit-method checkouts) | **FEE-3 / ✅ Shipped** | ✅ Shipped — `fix(FEE-3)` resolves deposit rate from `booking_fee_configs.platform_deposit_rate` (seeded 25, identical day-one behavior) with 60 s cache + safe 0.25 fallback; dead `calculateExpertFee` removed in separate `chore(pricing)`. Brief narrowed after live-trace: `calculatePlatformFees` was already config-resolved (commission resolver); `calculateExpertFee` had zero callers (landmine removed). Migration `023_platform_deposit_rate.sql`. |
| Single fee resolver every charge path reads from | FEE / Deferred-P2 | Works as two resolvers (`commission.ts` + `optimization-fee.service.ts`) in parallel. Unification is structural cleanup, not launch-blocking. |
| 6 of 9 §4.8 fees hard-coded or missing | FEE | Down to **2 of 9 remaining** after CON-A + EXP-OVR + LB-P5a + FEE-3. Remaining: provider commission tiers (FEE-2, parked on provider-promise answer), expert new-vs-established split (Deferred-P2). Affiliate handling deferred. |
| Override granularity (global→market→tier→entity) | FEE / Deferred-P2 | Phase-2 batch brief. Only matters at multi-market scale; first market doesn't need it. |
| Effective-dating on fee configs | FEE / Deferred-P2 | Phase-2 batch brief. Only matters when scheduling future rate changes. |
| Fee-change audit trail / history table | FEE / Deferred-P2 | Phase-2 batch brief. `accessAuditLogs` partially covers via EXP-OVR pattern. |
| Reset-to-approved-default per fee | FEE / Deferred-P2 | Phase-2 batch brief. Admin UX polish. |
| Expert `expertTier` new/established split (85/15→75/25) | FEE / Deferred-P2 | EXP-OVR's manual override covers the beta-recruitment case until launch + GMV data signals the auto-flip trigger. Open decision: GMV / time / admin manual (scoping doc Q1). |
| Affiliate `behaviorMode` (retain/markup/rebate) | FEE / Deferred-P2 | Launch markets (Mumbai/Kyoto) use plain pass-through with all current affiliate partners — defer until a partner needs markup/rebate. Open decision: markup formula (scoping doc Q3). |
| Hard-coded literals — `itinerary.tsx` → **LB-P2 ✅**; `affiliate.service.ts` → **LB-P4a ✅**; `commission.ts` AI/AFFILIATE constants → **CON-A (FEE-A) ✅**; `pricing.service.ts` deposit → **FEE-3 ✅** (tier markups were dead `calculateExpertFee`, deleted) | split | per reconciliation — different files, different owners |
| Credit-package bonus logic (no `credit_packages` table) | FEE / Deferred-P2 | `shared/credit-packages.ts` constants file (LB-P5a) works for beta admin-set-once. Phase-2 batch when bonus logic + admin editing without redeploy becomes a real ask. |

## Unowned (needs assignment)

| Gap | Owner | Status |
|---|---|---|
| Email verification on signup | LB-P1 (extension) | ✅ Shipped (`e87f61f`) — `email_verification_tokens` table (migration 022), `sendEmailVerificationEmail` Resend helper, `POST /api/auth/send-verification` + `POST /api/auth/verify-email`, `/verify-email` landing page, fire-and-forget hook on `/api/auth/register`. |
| Expert workspace affiliate-integrations panel "coming soon" | CON | ✅ Shipped (`2a5c89d`) — workspace reads admin `affiliate_partners` via `GET /api/affiliate/partners?isActive=true`; hardcoded list + "Coming soon" toast removed. |
| Review-specific moderation (only generic queue) | — | Unowned |
| Route fragmentation — `server/routes.ts` duplicates `routes/*.routes.ts` | post-launch | **Specced** — `docs/planning/route-defragmentation-brief.md`. Six phases (one per unmounted module, smallest first), ~7-9 days total. Hard prereqs: first market live + Playwright baseline green + per-phase feature freeze. Active billing leak from this fragmentation was patched in `d886791` (LB-P3.5). |
| Executive Assistant role — RBAC granularity unclear | — | Unowned |
| Cart multi-currency + sharing | — | Unowned |

## Deferred to Phase-2 (per v1.3 timeline)

| Gap | Owner | Status |
|---|---|---|
| 5-tier expert service structure with enforced ranges | P2 | Deferred |
| Dispute resolution surface (table + admin + traveler UI) | P2 | Deferred |
| Provider insurance tier capture (form fields) | P2 | Deferred |
| Background-check integration + appeals flow | P2 | Deferred |
| Money-transmitter / KYC / AML hooks | P2 | Deferred |
| Native-first browse sort (display weight, not just badge) | P2 | Deferred |
| Platform-usage credits / premium-feature credits | P2 | Deferred |
| Credit gifting | P2 | Deferred |
| Multi-day transport pass recs (partial) | P2 | Deferred |

## Not a gap

| Item | Note |
|---|---|
| Premium feature fee (5–10 credits/mo) | **Re-added to §4.8 as Deferred-P2** (its drop was an edit artifact, not a decision) |
| Membership tiers ($19.99/$39.99) | **Removed** — superseded by the $9 concierge tier (CON-B) |
| Expert Leaderboard "Coming Soon" | Intentionally deferred |
| Deeper expert analytics "Coming Soon" | Intentionally deferred |
| Admin invoice UI "coming soon" | Intentionally deferred (backend endpoints exist) |
| Experience-type modules unified into one templated page | Acceptable design choice; awareness only |

---

> **Note on the Fee Architecture workstream:** this cluster has no brief yet and is a hard dependency of the Concierge ($9 tier and AI Concierge fee can't bill correctly without it). The Concierge planning prompt now audits it as a sequenced dependency (Method step 1), but if Claude Code's plan confirms it's large, it likely deserves its own phase-ordered brief alongside the Concierge plan. Promote it from "Needs planning" once that exists.
