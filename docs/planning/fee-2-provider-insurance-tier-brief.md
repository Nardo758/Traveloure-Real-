# FEE-2 — Provider Insurance Tier → Tier Commission

**Goal:** Resolve provider commission by insurance tier (T1 12% / T2 8% / T3 6% / Premium 4%) per §3.3, instead of the current category fallback. Closes the provider-side equivalent of the EXP-OVR gap: a Tier-1 provider recruited on the promise of "12% platform commission" gets billed at the category default today, which silently breaks the promise.

**Status flagged in tracker:** `FEE-2 / Launch-blocking — brief pending`. Promotes from `Needs planning` in `audit-coverage-tracker.md`.

**Owner:** FEE workstream (this is the first FEE-specific brief; companion to `fee-3-pricing-service-brief.md`).

**Target:** Claude Code, repo working tree.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. Phases share the resolver contract introduced in EXP-OVR.
2. Work in strict phase order: 0 → 3.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(FEE-2.Pn): …`).
4. **Typecheck floor = 140 pre-existing errors.** Every phase must return `npm run check` at **≤140 errors**.
5. **Phase 1 edits `shared/schema.ts` — SINGLE-SESSION.**
6. File:line refs from the FEE scoping doc (June 2026); confirm before editing.

---

## HARD PREREQS

1. **EXP-OVR shipped** (`7d1c250`, `5b13915`, `79b335f`). The Tier-3 per-expert override branch in `commission.ts:resolveCommissionRates` is the pattern this brief mirrors. The new provider-tier branch sits as a sibling **before** per-expert — see "Resolver precedence" below.
2. **§3.3 rate values lock-in.** The defaults are T1 12% / T2 8% / T3 6% / Premium 4% per the v1.3 plan. These are admin-overridable in Phase 2's UI but seeded with §3.3 values.
3. **Decision on insurance verification flow** (open in FEE scoping doc Q2): admin-validated (provider uploads docs, admin approves the tier) vs self-attested (provider picks their tier; admin can audit-correct). **Recommend admin-validated** — compliance + revenue depend on the tier, and self-attest invites tier inflation. Phase 2 builds the admin verification UI.

---

## DECIDED DEFAULTS (lock-in before coding)

- **D1 Storage shape:** one new column `insuranceTier` on `serviceProviderForms` (text enum: `tier_1 | tier_2 | tier_3 | premium`, nullable, default null). Three nullable companion columns capture the underlying evidence: `insurance_coverage_cents` (int — total coverage amount), `insurance_doc_url` (text — uploaded cert), `insurance_verified_at` (timestamp — admin verification stamp). Tier is the admin-assigned classification, not derived from coverage alone.
- **D2 Rate storage:** four new rows in `booking_fee_configs` with `category = 'provider_tier_1'`, `'provider_tier_2'`, `'provider_tier_3'`, `'provider_premium'`. Each row carries `platform_fee_percent` (12 / 8 / 6 / 4) + `expert_share_percent` (100 - platform) per §3.3. Admin-editable via the existing fee-config UI.
- **D3 Resolver precedence:** **insurance-tier > per-expert override > category > constants.** Reasoning: insurance tier is provider-set + admin-validated (compliance-anchored); per-expert override is admin-discretionary (recruitment-anchored); both beat category default. **Caveat:** for the same booking, expertId and providerId can both apply — the booking has at most one expert AND one provider, and the commission is split between them. Per-expert override applies to the expert's share; insurance-tier applies to the provider's share. The two don't compete — they apply to different sides of the split.
- **D4 Backwards compatibility:** unset tier = no tier-specific rate, fall through to category default (today's behavior). No data migration; existing providers continue at category rate until an admin sets their tier.
- **D5 Validation:** `insuranceTier` must be one of the four enum values; `insurance_coverage_cents` must be ≥ 0. Admin can set tier without uploading docs (covers the provisional/grandfathered case), but `insurance_verified_at` should only be stamped when docs are present.

---

## GLOBAL "WHAT NOT TO DO"

- **No fee/price/rate constants.** Tier rates resolve from `booking_fee_configs` rows. Never a literal.
- **Do not derive insurance tier from coverage amount.** Coverage is evidence; tier is the admin's classification. §5.2's coverage thresholds are guidelines, not auto-mapping rules.
- **Do not auto-promote/demote tier.** Even if coverage changes, the tier stays where the admin set it until the admin moves it.
- **Do not couple to `expertTier` (FEE-Defer).** Provider tier is a separate dimension; the resolver branches are independent.
- **Do not block existing providers.** Unset tier = current behavior. No rate changes for any provider unless an admin sets their tier.

---

## REUSE MAP

| Need | Use | Evidence |
|---|---|---|
| Commission resolver | `commission.ts:resolveCommissionRates` | `server/services/commission.ts` (EXP-OVR pattern shipped) |
| Provider form (where insurance fields live) | `serviceProviderForms` | `shared/schema.ts:402` |
| Provider admin queue (where tier gets set) | `client/src/pages/admin/providers.tsx` | existing |
| Fee config admin UI | `client/src/pages/admin/fee-config.tsx` + `/api/admin/fee-config` | shipped |
| Audit-log pattern | `accessAuditLogs` (EXP-OVR.P3 pattern) | `shared/schema.ts:4084` |
| Threading expertId through callers (template to follow for providerId) | `payments.routes.ts:326,350` + `routes.ts:6391,6549,6573` | EXP-OVR.P2 |

---

## PHASE 0 — Pre-flight (no code)

1. **Confirm caller paths.** Grep every consumer of `resolveCommissionRates`. We added `expertId` to the options object in EXP-OVR.P2; same callers will need a `providerId` field. Most callers already have `item.service.providerId` (or equivalent) on the cart item — verify the field name in your schema. If `providerId` doesn't live on the cart row directly, derive it from `providerServices.userId` (the provider's user_id is the canonical key).
2. **Confirm `booking_fee_configs` shape.** It currently has `category, platform_fee_percent, expert_share_percent, is_active`. The four new rows fit the existing shape — no migration needed for the rate storage; the only schema change is the column on `serviceProviderForms`.
3. **Sample provider population.** Run `SELECT COUNT(*), insurance_tier FROM service_provider_forms GROUP BY insurance_tier` (post-Phase 1). All rows should be NULL after the migration; that's the backwards-compat invariant.

**Gate:** caller list noted, fee-config shape confirmed. No code changed.

---

## PHASE 1 — Schema: `insuranceTier` + evidence columns + seed rate rows

**Files:** `shared/schema.ts`, `server/migrations/023_provider_insurance_tier.sql`, `server/migrations/run-migrations.ts`.

**Steps**
1. **`serviceProviderForms` extension:** add four nullable columns — `insuranceTier` (varchar 20), `insuranceCoverageCents` (integer), `insuranceDocUrl` (text), `insuranceVerifiedAt` (timestamp).
2. **Migration `023_provider_insurance_tier.sql`:**
   ```sql
   ALTER TABLE service_provider_forms
     ADD COLUMN IF NOT EXISTS insurance_tier VARCHAR(20),
     ADD COLUMN IF NOT EXISTS insurance_coverage_cents INTEGER,
     ADD COLUMN IF NOT EXISTS insurance_doc_url TEXT,
     ADD COLUMN IF NOT EXISTS insurance_verified_at TIMESTAMP;

   -- Seed the §3.3 default rates into booking_fee_configs.
   -- ON CONFLICT — if the row already exists (e.g. admin pre-seeded), preserve their values.
   INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
   VALUES
     ('provider_tier_1', 12, 88, true),
     ('provider_tier_2',  8, 92, true),
     ('provider_tier_3',  6, 94, true),
     ('provider_premium', 4, 96, true)
   ON CONFLICT (category) DO NOTHING;
   ```
   Note: `expert_share_percent` for provider rows represents the **provider's** share (not the expert's) — same column, different semantic per category prefix. Document inline.
3. **Register migration** in `run-migrations.ts` after `022_email_verification_tokens.sql`.

**Acceptance:** columns exist; four new `booking_fee_configs` rows present; existing provider rows have NULL tier.

**Verify / Gate**
```
grep -n "insurance_tier\|insuranceTier" shared/schema.ts server/migrations/023_provider_insurance_tier.sql
grep -n "provider_tier_1\|provider_tier_2\|provider_tier_3\|provider_premium" server/migrations/023_provider_insurance_tier.sql
npm run check                                                                   # ≤140
```
Commit: `feat(FEE-2.P1): service_provider_forms.insurance_tier + §3.3 rate rows`

---

## PHASE 2 — Resolver branch + caller threading

**Files:** `server/services/commission.ts`, all callers identified in P0 that have `providerId` available.

**Steps**
1. **Extend `ResolveOptions`** with `providerId?: string | null`.
2. **New tier branch in `resolveCommissionRates`** — insert AFTER affiliate, BEFORE per-expert (D3 precedence):
   - If `providerId` provided, JOIN `serviceProviderForms` to find the provider's `insuranceTier`.
   - If tier set: look up `booking_fee_configs` for `category = 'provider_' || tier_slug` and `is_active = true`. Use that rate.
   - If tier unset OR rate row missing: fall through to per-expert branch (existing).
3. **Caller threading:** every site that already passes `expertId` should also pass `providerId`. Most cart-checkout call sites have both on `item.service` — `item.service.userId` is the expert, `item.service.providerId` (or `item.service.userId` for solo-provider services) is the provider. **Be explicit about which userId is which** in each call site to avoid the same person being treated as both.
4. **Audit-log pattern:** unlike EXP-OVR, the tier-rate lookup is read-only; no admin action happens here. The admin's tier assignment in Phase 3 is what gets audit-logged.

**Acceptance**
- A booking on a Tier-1 provider's service settles at 12% platform / 88% provider.
- A booking on a Tier-3 provider's service settles at 6% platform / 94% provider.
- A booking with no tier set on the provider settles at the category default (existing behavior — no regression).
- The per-expert override still works for the expert's share when both are set.

**Verify / Gate**
```
grep -rn "providerId\b" server/services/commission.ts
grep -rn "providerId\b" server/routes.ts server/routes/payments.routes.ts | head -15
npm run check                                                                   # ≤140
```
Commit: `feat(FEE-2.P2): provider-tier branch in resolveCommissionRates + caller threading`

---

## PHASE 3 — Admin UI: tier assignment + verification

**Files:** `server/routes/admin.routes.ts`, `client/src/pages/admin/providers.tsx`, `client/src/pages/admin/fee-config.tsx`.

**Steps**
1. **Admin endpoint:** `PATCH /api/admin/providers/:id/insurance-tier` — body `{ insuranceTier, insuranceCoverageCents?, insuranceDocUrl?, insuranceVerifiedAt? }`. Validates tier enum + non-negative coverage. Stamps `insuranceVerifiedAt = NOW()` only when `insuranceDocUrl` is provided. Audit-logs via `accessAuditLogs` (action `update_provider_insurance_tier`, previous → next).
2. **Provider admin page:** add a "Insurance" column to the provider list + an inline tier editor (similar to the `CommissionOverrideEditor` pattern from EXP-OVR.P3). Editor surfaces: tier dropdown (4 options + clear), coverage input ($), doc URL input, "Mark verified" checkbox (sets `insuranceVerifiedAt` if doc URL present).
3. **Fee-config UI extension:** add a "Provider Commission Tiers" section to `fee-config.tsx` showing the four `booking_fee_configs` rows. Reuses the existing per-category save mutation; just four new admin-editable rate rows.

**Acceptance**
- Admin sees + edits insurance tier per provider.
- Admin sees + edits the four tier rates from one screen.
- Changes audit-log.
- Existing providers shown with no tier display as "Unassigned" with a CTA to set it.

**Verify / Gate**
```
grep -n "insurance-tier\|insuranceTier" server/routes/admin.routes.ts client/src/pages/admin/
npm run check                                                                   # ≤140
```
Commit: `feat(FEE-2.P3): admin UI for provider insurance tier + tier rate editor`

---

## FINAL VERIFICATION CHECKLIST

- [ ] P1 — schema columns + seeded rate rows; existing providers default to unset.
- [ ] P2 — resolver routes by tier when set; falls through cleanly when unset; per-expert override still applies on the expert's share.
- [ ] P3 — admin assigns tier; rate-row admin editing surfaced; audit-logged.
- [ ] No new fee/rate constants introduced.
- [ ] `npm run check` ≤ 140 (the floor) after every phase.

## KNOWN FOLLOW-UPS (not in this brief)

- **Provider-side notification on tier change** — provider should see their new rate after admin assignment. Out of scope.
- **Self-service tier proposal** — provider uploads docs + proposes a tier; admin reviews. Adds a workflow state; out of scope.
- **Tier history table** — `provider_tier_changes` for an audit ledger separate from `accessAuditLogs`. Phase-2 FEE batch.
- **Effective-dating on tier changes** — rare ("starting next month, this provider is Tier 2"). FEE-Defer batch.

## OUT OF SCOPE

- Per-expert override expansion to the provider-share side (existing EXP-OVR covers expert side; no parallel "per-provider override" until volume signals a need).
- §5.2 insurance compliance flow (doc verification, expiry, renewal) — separate compliance workstream.
- Provider workflow gating (e.g. "Tier 1 providers can't list adventure activities") — separate scope.
- §6.9 beta provider recruitment with reduced rates — symmetric to the EXP-OVR recruitment gate, but providers aren't in §6.9; if added, mirror the EXP-OVR commission-override pattern as a separate brief.
