# Business Plan ↔ Codebase Gap Audit

**Plan version audited:** Traveloure Business Plan v1.3 (Jan 2025)
**Audit date:** 2026-06-05
**Method:** grep + read of `client/src/` and `server/` against §4.8 fee schedule, Feature & Requirements Index, and the v4 commerce wireframes.

---

## 1. Feature Gaps

### Traveler

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| Email/password auth + register | Accounts | ✅ Built | `server/replit_integrations/auth/emailAuth.ts:55,116` | scrypt |
| **Password reset (token flow)** | Accounts | 🟡 Partial — **P0 security bug** | `server/replit_integrations/auth/emailAuth.ts:217-259` | Accepts `{email, newPassword}` with **no token**. Any caller can reset any account. |
| Email verification | Accounts | ❌ Missing | column at `shared/models/auth.ts:42`; set as side-effect at `server/routes.ts:11975` | No send/confirm endpoints |
| Search + filters | Discovery | ✅ Built | `server/routes/content.routes.ts:1777,5152`; `client/src/pages/discover.tsx` |  |
| Cart system | Discovery | 🟡 Partial | `client/src/pages/cart.tsx`; `shared/schema.ts:781 cartItems` | Multi-currency missing (single `currency` field, no FX); sharing not implemented |
| Booking flow | Discovery | ✅ Built | `server/routes.ts:5244,5380` |  |
| Refunds | Discovery | 🟡 Partial | `server/routes/bookings.ts:242` | Endpoint exists; no admin dispute/refund flow |
| Review moderation | Discovery | 🟡 Partial | `server/routes.ts:5441` | Only generic content moderation queue, no review-specific moderation |
| Trip share | Trips | ✅ Built | `client/src/pages/trip-details.tsx:184`; `client/src/pages/shared-trip.tsx:55` |  |
| Multi-traveler split-pay | Trips | ✅ Built | `server/routes/trips.routes.ts:1061-1340` |  |

### Expert

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| Expert role enum + application | §3.1, Compliance | ✅ Built | `shared/models/auth.ts:25-34`; `server/routes/experts.routes.ts:195-298` |  |
| Service creation (custom) | Expert | ✅ Built | `server/routes/experts.routes.ts:472`; consolidated to `provider_services` per CLAUDE.md |  |
| Approval workflow | Expert | ✅ Built | `shared/schema.ts:536`; `server/routes/admin.routes.ts:725,788` |  |
| Identity verification (Stripe Identity) | Compliance | ✅ Built | `server/routes/identity.routes.ts:16` |  |
| Stripe Connect onboarding | Payments | ✅ Built | `server/routes/payments.routes.ts:465,504,533` |  |
| Expert AI Assistant | AI | ✅ Built | `client/src/pages/expert/ai-assistant.tsx`; `expertAiTasks` `shared/schema.ts:2057` |  |
| Expert Content Studio | Expert | ✅ Built | `client/src/pages/expert/content-studio.tsx` |  |
| **5-Tier service structure** ($25-75, $75-200, $200-500, $50-150/hr, $100-300/hr) | §3.1 | ❌ Missing | no `tier`/`tierLevel` column on `providerServices` (`shared/schema.ts:486`) | Schema is free-form `price` + `serviceType` enum; plan's 5 tiers absent |
| Expert "new vs established" commission tier (85/15 → 75/25) | §4.8, §2.2 | ❌ Missing | grep finds no `expertTier`/`isEstablishedExpert` field |  |
| Expert workspace Map view | Expert wireframe | 🟡 Partial | `client/src/pages/expert/workspace.tsx:808` | "Map view coming soon" — but PlanCard MapControlCenter is built; just not wired here |
| Expert workspace affiliate integrations | Expert wireframe | 🟡 Partial | `client/src/pages/expert/workspace.tsx:1386` | "Coming soon" toast |
| Verification & appeals flow | §5.3 | 🟡 Partial | identity built; no appeal endpoints/UI (grep `appeal` → 0 hits) |  |
| Background check | §5.3 | ❌ Missing | grep `background.check` → 0 hits in `server/` | Stripe Identity is document scan, not criminal screen |
| Expert Leaderboard | Expert | 🟪 Intentionally Deferred | `client/src/pages/expert/leaderboard.tsx:18` | "Coming Soon" marker |

### Provider

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| Provider role + application | §3.3 | ✅ Built | `shared/schema.ts:402 serviceProviderForms` |  |
| Provider dashboards (15 pages) | Provider | ✅ Built | `client/src/pages/provider/*.tsx` |  |
| Availability, blackout, requests | Provider | ✅ Built | `shared/schema.ts:4489,4509,4519`; `server/services/provider-matching.service.ts` |  |
| KYB (Persona) | Compliance | ✅ Built | `server/routes/identity.routes.ts:59`; manual fallback when key missing |  |
| **4-Tier insurance/commission structure** (12%/8%/6%/4%) | §3.3, §5.2 | ❌ Missing | no `insuranceTier`/`tierLevel`/`commissionRate` column on `serviceProviderForms` (`shared/schema.ts:402-444`) | Commissions resolve by category, not by provider tier |
| Insurance tier capture | §5.2 | ❌ Missing | `serviceProviderForms` captures license/GST but **no insurance fields** |  |

### Admin

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| Dashboard, users, experts, providers, analytics | Admin | ✅ Built | `client/src/pages/admin/{dashboard,users,experts,providers,analytics}.tsx` |  |
| Revenue tracking | Admin | ✅ Built | `server/routes/admin.routes.ts:1668-1888` |  |
| Payouts | Admin | ✅ Built | `client/src/pages/admin/payouts.tsx`; `/api/admin/payouts` |  |
| Content moderation queue | Admin | ✅ Built | `server/routes/admin.routes.ts:1133,1151,1186,1204` |  |
| Fee config | Admin | 🟡 Partial | `client/src/pages/admin/fee-config.tsx`; see Fee Audit | Only booking-fee-by-category + 3 optimization tiers editable |
| Lead routing queue | Admin | ✅ Built | `client/src/pages/admin/routing-queue.tsx`; `server/routes/admin.routes.ts:3810-3978` |  |
| AI/API cost tracking | Admin | ✅ Built | `server/routes/admin.routes.ts:1496-1647` |  |
| **Dispute resolution** | Admin | ❌ Missing | grep "dispute" → only enum values; no table, no routes, no UI |  |
| Invoice management | Admin | 🟡 Partial | server endpoints at `server/routes/admin.routes.ts:1403,1443,1467`; UI says "coming soon" at `client/src/pages/admin/content-tracking.tsx:423` |  |
| Executive Assistant role | Accounts | 🟡 Partial | `client/src/pages/ea/` directory exists | RBAC granularity unclear; not full plan |

### AI / Optimization

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| AI Itinerary Builder (Grok) | AI | ✅ Built | `client/src/components/ai-itinerary-builder.tsx`; `server/routes.ts:9150` |  |
| AI Optimization Engine — **backend** | AI | ✅ Built | `server/routes.ts:1275` `/api/ai/optimize-experience` (with smart-sequencing rules) | Plus variants at `server/routes.ts:9325` |
| AI Optimization Engine — **UI** | AI | 🟡 Partial | `client/src/pages/optimize.tsx:43-164` | **Page is a static Paris mock** — hardcoded plans, tiers, savings. Does NOT call the backend endpoint. |
| AI Optimization paywall | wireframes | 🟡 Partial | `server/routes/optimization.routes.ts:162` exists but **router is unmounted** (dead at runtime); shipped `/api/ai/optimize-experience` has **no payment gate** | Backend tiers `simple/standard/complex`; UI mock shows `$19.99/$49.99/$199` — **two never meet** |
| AI Savings Analysis (**free, public, no-auth**) | AI | ❌ Missing | grep `savings.?analysis` returns 0 in `server/`; `/optimize` requires auth | The guest acquisition hook is absent |
| AI Expert Matching | AI | ✅ Built | `server/routes.ts:8379`; `server/services/ai-orchestrator.ts`; persists to `expertMatchScores` |  |
| AI Content Assistant (experts) | AI | ✅ Built | `client/src/pages/expert/content-studio.tsx` |  |
| TravelPulse market intelligence | AI | ✅ Built | `server/services/travelpulse.service.ts`; 30+ endpoints; 8+ tables `shared/schema.ts:2108-2531` |  |
| Itinerary comparison (variants) | AI | ✅ Built | `server/routes.ts:6399-6732`; 4 tables |  |

### PlanCard / Transport

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| PlanCard component + Hero/Stats/DaySelector/SectionTabs/Activities/Transport/ChangeLog | PLANCARD_SPEC | ✅ Built | `client/src/components/plancard/*` (PlanCard 1160 LOC; MapControlCenter 711 LOC) |  |
| Plancard backend | PLANCARD_SPEC | ✅ Built | `server/routes/plancard.routes.ts:139` |  |
| Transport Hub | Transport spec | ✅ Built | `server/routes/transport-hub.routes.ts` |  |
| Multi-day pass recs | Transport spec | 🟡 Partial | `server/services/transport-booking-options.service.ts` exists; UI field present at `transport-hub.routes.ts:48` |  |
| Maps export (KML/GPX) + share token | PlanCard | ✅ Built | `server/routes.ts:16320,16425,16743,16816` |  |

### Compliance & Trust

| Feature | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| Stripe Identity / Persona KYB | Compliance | ✅ Built | `server/routes/identity.routes.ts:16,59` |  |
| **Verification badge on traveler-facing expert cards** | §5.3 | 🟡 Partial | `shared/schema.ts:394,433` has `identityVerificationStatus`; grep on `client/src/pages/travel-experts.tsx` and `expert-detail.tsx` → **no badge component reads it** | Data captured, UI omits it |
| Background verification + appeals | §5.3 | ❌ Missing |  |  |
| Money-transmitter / AML hooks | §5.1 | ❌ Missing | grep `kyc`/`aml` → 0 hits beyond Stripe/Persona |  |
| **Membership tiers ($19.99/$39.99)** | §4.7, §1.3 | ❌ Missing — superseded by §2.3 update | no `memberships`/`subscriptions` table; no `/api/membership` routes; only `subscription` enum value at `shared/schema.ts:3988` | Dropped per v1.3 update; replaced by $9 concierge tier |
| Credit packages | Payments | 🟡 Partial | `server/routes/payments.routes.ts:204` purchase works; **no bonus logic**, **no gifting endpoint**, **3 conflicting hardcoded definitions** (see Fee Audit) |  |

---

## 2. Fee Audit

### Verdict
**Fee system is partially admin-controlled — 6 of 9 §4.8 fees are hard-coded or missing entirely.** Only booking commission (by category, not by tier) and optimization tier prices flow through admin-editable configs. Provider tiers, expert tiers, membership, credit packages, platform-usage credits, premium-feature credits, and affiliate behavior are all hard-coded or absent.

### Fee-by-fee
| Fee | §4.8 default | Configurable? | Hard-coded? | Admin UI? | Resolver evidence |
|---|---|---|---|---|---|
| Expert service commission (15% new / 25% established) | 15%/25% | ❌ tier concept absent | `server/services/commission.ts:16-17` `EXPERT_SHARE_RATE=0.75`, `PLATFORM_FEE_RATE=0.25` | 🟡 per-category only, no new/established toggle | `server/services/commission.ts:41-93` reads `booking_fee_configs` (category, not tier) |
| Provider commission (T1 12% · T2 8% · T3 6% · Premium 4%) | tiered | ❌ no provider-tier column | category fallback in `server/routes/payments.routes.ts:585-595` | 🟡 category-keyed, no T1-Premium concept | Same resolver — tier dimension absent |
| Discount platform commission (3%) | 3% | 🟡 per-partner column exists but not consulted | `server/services/affiliate.service.ts:23-52` (in-memory map `viator=0.08, getyourguide=0.08, booking=0.04, twelvego=0.05`) | 🟡 `affiliate-partners.tsx:1056-1074` edits `commissionRate` — **service ignores it** | `affiliate_partners.commissionRate` `shared/schema.ts:3530` never read |
| AI Optimization fee ($9.99 std / $49.99 event / 5 credits / $0=off) | tiered | 🟡 partially | tier mapping hard-coded `server/services/smart-sequencing.service.ts:915-921`; defaults $4.99/$9.99/$19.99 (`server/routes/optimization.routes.ts:36-40`, `client/src/pages/admin/fee-config.tsx:373-377`) — **don't match §4.8** | 🟡 3 prices editable; no credit-pay; no "off" semantics; no per-event-type override beyond 3 buckets | `optimization.routes.ts:42-52` `getFeeForTier` reads `optimization_fees` table — but **router is unmounted** |
| Affiliate handling (pass-through) | pass-through | ❌ | rate hard-coded in `affiliate.service.ts`; no markup/rebate/pass-through behavior column on `affiliate_partners` (`shared/schema.ts:3521-3542`) | ❌ no behavior toggle in UI | None |
| Credit package bonus | tiered | ❌ | **3 conflicting hardcoded definitions**: `client/src/pages/pricing.tsx:22-53`, `client/src/pages/credits.tsx:12-44`, `server/routes/payments.routes.ts:196-201` + `server/routes.ts:2893` | ❌ no admin UI | no `credit_packages` table |
| Platform usage fee (1–3 credits/txn; matching 2 credits) | per-action | ❌ | not implemented | ❌ | none |
| Concierge power-user tier ($9/mo or annual) | per §4.8 v1.3 update | ❌ | not implemented | ❌ | none |
| Premium feature fee (5–10 credits/mo) — Deferred-P2 | per-feature | ❌ | not implemented | ❌ | none |

### Hard-coded fee literals (P1 to clean)
- **`client/src/pages/itinerary.tsx:649-654`** — `platformFeePercent = 12; expertSharePercent = 70;` Bookings Summary card. Endpoint `/api/booking-fee-config` exists at `server/routes/payments.routes.ts:565-599` and is **not called**.
- **`server/services/commission.ts:16-22`** — `EXPERT_SHARE_RATE=0.75`, `PLATFORM_FEE_RATE=0.25`, `AI_PLATFORM_FEE=1.00`, `AFFILIATE_PLATFORM_FEE=0.70`, `AFFILIATE_EXPERT_SHARE=0.30`, `PROCESSING_FEE_RATE=0.03`.
- **`server/services/affiliate.service.ts:23-52`** — in-memory partner commission map; ignores DB-editable column.
- **`server/services/pricing.service.ts:20,119-122`** — deposit rate 25%; expert tier markups `{standard:0.10, premium:0.15, concierge:0.20}`.
- **`server/routes/optimization.routes.ts:36-40`** — `DEFAULT_FEE_CENTS = {simple:499, standard:999, complex:1999}` (not §4.8).
- **`server/routes/payments.routes.ts:585-595`** + **`client/src/pages/admin/fee-config.tsx:64`** — duplicated category fallback `accommodation:15, activities:12, …`.

### AI Optimization fee — current state
- **Paywall?** `optimization.routes.ts` defines paid endpoints, but router is **never mounted** → 404 at runtime. The shipped `/api/ai/optimize-experience` (`server/routes.ts:1275`) has **no payment gate** — any authenticated user gets full Claude output for free.
- **Per-experience-type rate ($9.99 / $49.99 / 5 credits / $0=off)?** No. Only 3 complexity buckets; no credit pay; no "off" semantic; defaults are $4.99/$9.99/$19.99, not §4.8's values.
- **Free AI Savings Analysis distinguished from paid?** No. `/api/optimization-preview` (free heuristic) exists in the same unmounted router; user-facing `/optimize` is a static mock.

### Affiliate handling — current state
- **Margin tracked per booking?** 🟡 `affiliate_links`, `affiliate_clicks`, `affiliate_conversions`, `affiliate_earnings` persist; reconciliation pulls partner APIs (`server/services/affiliate-reconciliation.service.ts:76-115`). But the *rate used at link-creation time* is the hard-coded map, not the admin-editable column.
- **Per-partner retain/markup/rebate?** ❌ No behavior column on `affiliate_partners`.
- **Native-first display rule?** ❌ `client/src/pages/browse.tsx:93,100` distinguishes `PARTNER_PROVIDERS` only for badge/icon — no sort priority.

### Admin Fee Management console — capability gaps
| Capability | State | Evidence |
|---|---|---|
| View+edit each fee | 🟡 partial | booking-by-category + 3 optimization tiers + affiliate commission only; provider/expert tiers, credits, memberships, platform usage, premium features all absent |
| Override granularity (global→market→tier→entity) | ❌ missing | `booking_fee_configs` keyed by category only (`shared/schema.ts:5417-5429`); no market/tier/entity layer |
| Effective-dating | ❌ missing | no `effectiveFrom`/`effectiveTo` columns |
| Audit trail | 🟡 partial | `updatedBy`/`updatedAt` overwrite-on-update; no history table; `accessAuditLogs` not wired to fee changes |
| Reset to approved default | ❌ missing | no endpoint; defaults live in client + route fallbacks, not a policy table |

---

## 3. Design Gaps (UI ≠ wireframe/spec)

| Area | Gap | Evidence |
|---|---|---|
| **`/optimize` page** | Wireframe v4 prescribes: real cart → AI compare. **Page is static Paris demo** with hardcoded `plans`, `pricingTiers`, savings. | `client/src/pages/optimize.tsx:43-164` |
| **Booking footer fee labels** | Wireframes show single Subtotal/Total. Footer shows raw `12%`/`70%` literals next to row — bad UX once admin changes rates. | `client/src/pages/itinerary.tsx:649-693` |
| **Expert workspace Map tab** | Per workspace spec, Map view should render trip activities. Renders "Map view coming soon". | `client/src/pages/expert/workspace.tsx:808` |
| **Expert workspace affiliate integrations panel** | Spec calls for native partner attachment from workspace. | `client/src/pages/expert/workspace.tsx:1386` toast "Coming soon" |
| **Traveler-facing expert verification badge** | §5.3 trust signal; data exists in schema; no badge component on `travel-experts.tsx` / `expert-detail.tsx`. | grep on user-facing files = 0 matches for `verified.*badge` reading `identityVerificationStatus` |
| **Native-first sort in browse** | §4.8 display rule + competitive positioning. Currently only a badge differentiator, not a sort weight. | `client/src/pages/browse.tsx:93,100` |
| **3 credit-purchase UIs disagree** | `pricing.tsx`, `credits.tsx`, `credits-billing.tsx` show different package prices & bonuses. Wireframe expects one canonical screen. | `client/src/pages/{pricing,credits,credits-billing}.tsx` |
| **Experience-type modules unified into one page** | Commerce wireframe v4 splits 6 modules (Travel/Wedding/Proposal/Date Night/Birthday/Corporate) into separate experiences. Code routes all of them to one `ExperienceTemplatePage` (`client/src/App.tsx:93`). Acceptable as a templated approach, but flagging for design awareness. | `client/src/App.tsx:93,316,319` |
| **Route fragmentation** | `server/routes.ts` (20,289 LOC, 648 endpoints) duplicates routes that also live in `server/routes/*.routes.ts` (`/api/cart`, `/api/discover`, `/api/wallet`, `/api/credits/purchase`, etc.). Silent conflict risk. | grep cross-files for duplicates |

---

## 4. Easy Add-Ons (ranked by value-to-effort)

| # | Add-on | Why it's cheap | Effort | Files |
|---|---|---|---|---|
| 1 | **Mount `optimization.routes.ts`** — router is fully written, never mounted | Single `app.use(optimizationRouter)` line; unlocks free preview (guest-hook) + payment flow + per-experience-type fee plumbing | XS | `server/routes.ts` (add import + use) |
| 2 | **Wire `affiliate_partners.commissionRate` into `affiliate.service.ts`** | Schema column + admin UI both exist; service ignores them in favor of in-memory map. Replace the lookup. | S | `server/services/affiliate.service.ts:23-52`, `:link-creation` |
| 3 | **Fix `itinerary.tsx:649` fee literal** — call existing `/api/booking-fee-config` | Endpoint already lives at `server/routes/payments.routes.ts:565`; just consume it like the planned `pendingTotal * resolvedRate`. Bonus: closes the Stage 1 cost over-billing regression | S | `client/src/pages/itinerary.tsx` |
| 4 | **Add verification badge to traveler-facing expert cards** | `identityVerificationStatus` column exists; just render a `<ShieldCheck />` when status === verified | S | `client/src/pages/travel-experts.tsx`, `expert-detail.tsx`, possibly `client/src/components/expert/ExpertCard.tsx` if it exists |
| 5 | **Single source for credit packages** — consolidate the 3 hardcoded copies | Pick `server/routes/payments.routes.ts:196` as canonical, export from `shared/`, import elsewhere. Eliminates UI/server price mismatch. | S | `shared/`, `server/routes/payments.routes.ts`, `server/routes.ts:2893`, `client/src/pages/{pricing,credits,credits-billing}.tsx` |
| 6 | **Add `expertTier` field (new/established)** + read it in commission resolver | Single boolean on users/experts; one branch in `resolveCommissionRates`. Unlocks §4.8 85/15 vs 75/25 split. | S–M | `shared/schema.ts` (add column + migration), `server/services/commission.ts:41-93` |
| 7 | **Add insurance tier capture + `commissionRate` column to provider form** | Adds 4 fields to `serviceProviderForms`, one dropdown in `client/src/pages/provider/onboarding.tsx`. Lets the commission resolver pick tier (12/8/6/4) instead of category. | M | `shared/schema.ts:402`, `client/src/pages/provider/onboarding.tsx`, `server/services/commission.ts` |
| 8 | **Distinguish free AI Savings Analysis from paid optimization in UI** | `/api/optimization-preview` already returns heuristic-only output (no LLM). Build a guest-accessible page that hits it. | M | new `client/src/pages/savings-analysis.tsx`, `client/src/App.tsx` route |
| 9 | **Reset-to-default + audit-trail for fee-config** | UI already exists; add a Reset button per fee + an `fee_change_log` table populated by the PATCH handler. | M | `client/src/pages/admin/fee-config.tsx`, `server/routes/admin.routes.ts:3743-3805`, `shared/schema.ts` |
| 10 | **Affiliate `behaviorMode` column** (retain / markup / rebate) | Adds one enum column + UI dropdown in `affiliate-partners.tsx`; service branches on it at link-build time. Encodes §4.8's pass-through rule. | M | `shared/schema.ts:3521`, `client/src/pages/admin/affiliate-partners.tsx`, `server/services/affiliate.service.ts` |
| 11 | **Effective-dating columns on `booking_fee_configs` + `optimization_fees`** | Two nullable timestamp columns; resolver query adds `WHERE effectiveFrom <= now() AND (effectiveTo IS NULL OR effectiveTo > now())`. | M | `shared/schema.ts:876,5417`, `server/services/commission.ts`, `server/routes/optimization.routes.ts:42` |
| 12 | **Replace `/optimize` static mock with real backend call** | Backend exists (`/api/ai/optimize-experience`). Page just needs to pull trip data → POST → render variants. | M | `client/src/pages/optimize.tsx` |
| 13 | **Wire MapControlCenter into expert workspace Map tab** | Component is already built and used in PlanCard; drop it into the workspace tab. | S | `client/src/pages/expert/workspace.tsx:808` |

### Not in Easy Add-Ons (genuine big rewrites — flagging only)
- $9 concierge tier ($19.99/$39.99 membership dropped per v1.3 update) — new tables, Stripe subscriptions, recurring billing.
- 5-tier expert service structure with enforced ranges.
- Dispute resolution surface (table + admin + traveler UI).
- Token-based password reset (P0 security, but proper email flow + token storage = M not S).
- Background-check integration + appeals.
- KYC/AML compliance hooks.

### Intentionally Deferred (don't flag as gaps)
- Expert Leaderboard — `client/src/pages/expert/leaderboard.tsx:18` "Coming Soon"
- Expert analytics deeper view — `client/src/pages/expert/analytics.tsx:1197` "Coming Soon"
- Admin invoice UI — `client/src/pages/admin/content-tracking.tsx:423` "Invoice management coming soon" (backend endpoints exist)
