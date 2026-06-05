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
| $9 concierge tier (subscription, allowance, overage) — FEE-B | CON-B | Plan pending |
| Full / Done-for-You transactional flow | CON-C | Plan pending |

## Fee Architecture (needs planning — dependency of Concierge)

| Gap | Owner | Status |
|---|---|---|
| **Per-expert commission override** (`users.commission_override_expert_share_percent` + Tier-3 branch in `resolveCommissionRates` before category fallback + admin editor, audit-logged) | **CON / ✅ Shipped** (P1 `7d1c250`, P2 `5b13915`, P3 `79b335f`) | **Recruitment gate clears once tested E2E in staging.** Then §6.9 "20% vs 25%" outreach can ship; admin sets new beta experts to 80 before first booking settles. (Stored as expert-share %, not platform rate — same math, self-documenting name.) |
| Single fee resolver every charge path reads from | FEE | **Partial** — LB-P2 wires checkout to `/api/booking-fee-config`; LB-P3 mounts the optimization-fee resolver. Remaining work is *unification*, not greenfield. |
| 6 of 9 §4.8 fees hard-coded or missing | FEE | Needs planning |
| Override granularity (global→market→tier→entity) | FEE | Needs planning |
| Effective-dating on fee configs | FEE | Needs planning |
| Fee-change audit trail / history table | FEE | Needs planning |
| Reset-to-approved-default per fee | FEE | Needs planning |
| Expert `expertTier` new/established split (85/15→75/25) | FEE | Needs planning |
| Provider insurance-tier → tier commission (12/8/6/4) | FEE | Needs planning |
| Hard-coded literals — `itinerary.tsx` → **LB-P2**; `affiliate.service.ts` → **LB-P4a**; `commission.ts` AI/AFFILIATE constants → **CON-A (FEE-A)**; `pricing.service.ts` deposit + tier markups → **FEE** | split | per reconciliation — different files, different owners |
| Affiliate `behaviorMode` (retain/markup/rebate) | FEE | Needs planning |
| Credit-package bonus logic (no `credit_packages` table) | FEE | Needs planning |

## Unowned (needs assignment)

| Gap | Owner | Status |
|---|---|---|
| Email verification — no send/confirm endpoints (+ no email provider wired) | LB-P1 (dep) | Dependency of an Specced item — LB-P1 surfaces the email-provider blocker; not orphaned |
| Expert workspace affiliate-integrations panel "coming soon" | — | Unowned |
| Review-specific moderation (only generic queue) | — | Unowned |
| Route fragmentation — `server/routes.ts` duplicates `routes/*.routes.ts` (mapped in LB-P0, not resolved) | — | Unowned |
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
