# Fee Architecture Workstream — Scoping Doc

**Status:** scoping (not an execution brief). Sizes the cluster, maps dependencies, proposes phased groupings.
**Source:** Audit Coverage Tracker (June 2026); §4.8 of v1.3 Business Plan ("every fee admin-configurable, resolved at transaction time from a single settings store").
**Goal of this doc:** decide which items deserve execution briefs before launch vs which can defer to Phase-2, and in what sequence.

---

## CURRENT STATE INVENTORY

The tracker lists 11 FEE items. Grouped by what already partially exists:

### Group A — Already partially landed (resolver-side cleanup)
| Item | Current state | Evidence |
|---|---|---|
| **Single fee resolver every charge path reads from** | **Partial.** LB-P2 wired checkout to `/api/booking-fee-config`. LB-P3 mounts the optimization-fee resolver. EXP-OVR added the Tier-3 per-expert branch to `commission.ts:resolveCommissionRates`. CON-A.P2 introduced `getFee()` as the AI Concierge resolver. **What's missing:** unification — there are now TWO resolvers (`commission.ts` for booking + Stripe Connect splits; `optimization-fee.service.ts` for AI Concierge), each with its own fallback chain. | `server/services/commission.ts:41-93`; `server/services/optimization-fee.service.ts` |
| **6 of 9 §4.8 fees hard-coded or missing** | Down to 3 of 9 after CON-A + EXP-OVR + LB-P5a: ✅ AI Concierge (FEE-A), ✅ per-expert override (EXP-OVR), ✅ credit packages (LB-P5a as constants — see Group C). **Still hard-coded:** provider commission tiers (T1 12%/T2 8%/T3 6%/Premium 4%), affiliate handling (per-partner retain/markup/rebate), expert new-vs-established split. | tracker; §4.8 schedule |

### Group B — Missing DB columns blocking other items
| Item | Current state | Gap |
|---|---|---|
| **Expert `expertTier` new/established split (85/15 → 75/25)** | EXP-OVR shipped per-expert override which can simulate the tier split (admin sets new beta experts to 80 = 80/20). But the *tiered* default (auto: new → 85/15; established → 75/25 based on some signal) is absent. | One nullable column on `users` (`expertTier: 'new' \| 'established'`), one new branch in `commission.ts` BEFORE the per-expert override Tier-3. Decision needed: what flips an expert from "new" to "established"? GMV threshold, time-on-platform, admin manual? §2.2 says "Progressive: 85/15 → 75/25" — implies automatic, but doesn't specify the trigger. |
| **Provider insurance-tier → tier commission (12/8/6/4)** | Provider form (`serviceProviderForms`) captures business license, GST, photos but **no insurance fields** and **no `insuranceTier` column**. Commission is resolved by category in `booking_fee_configs`, not by provider tier. | Schema: add insurance-tier capture + `insuranceTier` column on `serviceProviderForms`. Resolver: extend `resolveCommissionRates` with a `providerId → providerTier → rate` branch sibling to the existing per-expert override. Tier rate seeds: 12%/8%/6%/4% from §3.3. **Decision needed:** is the provider's insurance tier admin-validated (provider uploads docs, admin approves) or self-attested? Compliance question, not engineering. |
| **Affiliate `behaviorMode` (retain/markup/rebate)** | `affiliate_partners` table (`shared/schema.ts:3533`) has commissionRate (admin-editable, LB-P4a wired) but **no `behaviorMode` column** for the §4.8 "retain margin / mark up / rebate to traveler" distinction. | One column on `affiliate_partners` (text enum); one branch in `affiliate.service.ts:generateLink` to apply the chosen behavior at link-creation time. **Decision needed:** when behavior=markup, what's the markup formula? Flat $/%? Per-partner config? §4.8 says "Admin sets per-partner: retain margin, mark up, or rebate to traveler" — implies fully admin-configurable, but the markup *amount* needs a config home. |

### Group C — Cross-cutting infra (no single feature; affects all)
| Item | Current state | Gap |
|---|---|---|
| **Override granularity (global → market → tier → entity)** | Today: most fee tables have ONE row per (category) or (tier) — no market or entity dimension. EXP-OVR added one per-entity override (per-expert). | Per row, add nullable `market` + nullable `appliesTo` (entity FK) columns + resolver cascade: entity > tier > market > global. Touches: `booking_fee_configs`, `optimization_fees`, `concierge_tier_config` (CON-B), `event_packages`. **Decision needed:** is "market" a string (city), or FK to a markets table? Probably a small new table. |
| **Effective-dating on fee configs** | None of the fee tables have `effectiveFrom` / `effectiveTo`. Admin changes take effect immediately on next read. | Add nullable `effective_from` + `effective_to` columns to each fee config table; resolver queries gain `AND now() BETWEEN effective_from AND COALESCE(effective_to, 'infinity')`. **Decision needed:** what happens to a quote/invoice that was generated at one rate and gets paid after a rate change? Answer is probably "PI metadata locks the rate at time of charge" — already partially true in optimization.routes.ts. |
| **Fee-change audit trail / history table** | `accessAuditLogs` exists (used by EXP-OVR.P3) but no dedicated `fee_change_log` table; changes overwrite-on-update. | One new `fee_changes` table (table_name, row_id, field, old_value, new_value, changed_by, changed_at); insert from every fee-config PATCH handler. Phase 1 of admin-fee-management console (§4.8). |
| **Reset-to-approved-default per fee** | None. The §4.8 defaults live in code constants (e.g. `DEFAULT_FEE_CENTS` in `optimization-fee.service.ts`) but no UI button surfaces them. | One PATCH endpoint per fee + Reset button in admin UI. Cheap once the §4.8 defaults are codified consistently in a single place. |
| **Credit-package bonus logic (no `credit_packages` table)** | `shared/credit-packages.ts` (LB-P5a) is a TypeScript constants file — single canonical source, but not DB-backed. No bonus credits, no admin editing without a redeploy. §4.8 credit package bonuses: $25:8% / $50:10% / $100:20% / $200:25% / $500:30%. | New `credit_packages` table (id, credits, price_cents, bonus_credits, popular, savings_label, features jsonb, is_active). Admin CRUD endpoints. Existing 5 consumers swap from constants to query. Bonus logic gets applied at purchase time (wallet receives credits + bonus_credits). |

### Group D — Specific hard-coded literals (small file-touches)
| Item | Current state | Gap |
|---|---|---|
| **`pricing.service.ts` deposit rate (25%) + expert tier markups** | `server/services/pricing.service.ts:20` `depositRate = 0.25`. `:119-122` `expertRates = { standard: 0.10, premium: 0.15, concierge: 0.20 }`. | Resolve through `commission.ts` or a new `pricing_config` table. **Status check:** is `pricing.service.ts` actually called? Need to grep — if it's dead like the unmounted route modules, this is bookkeeping not engineering. |

---

## DEPENDENCY MAP

```
Group A (resolver unification)
   │
   ├──► Group D (pricing.service.ts) — depends on a single resolver to call into
   │
   ├──► Group C effective-dating — needs ALL fee tables touched in coordination
   │
   └──► Group C audit trail — needs ALL fee-config PATCH handlers wired in coordination

Group B (missing columns)
   │
   ├── Expert tier  — small, additive; resolver gets a new branch. Independent.
   ├── Provider tier — bigger; form capture + admin approval flow + resolver branch.
   └── Affiliate behaviorMode — small; one column + one branch in affiliate.service.ts.

Group C override granularity
   │
   └──► depends on someone having decided the market schema first (a markets table or just strings).
```

**Reading:** Group A unification is the spine. Group B items are independent of each other and can land in any order. Group C items are "everywhere all at once" — touch every fee config table in coordination; cheapest after Group A unification consolidates the resolver surface.

---

## LAUNCH-BLOCKING vs PHASE-2 TRIAGE

Per the v1.3 timeline + audit-tracker's "Phase-2 (Months 7–12)" categorization, here's my read of what actually blocks first-market launch:

### Definitely launch-blocking
- **Provider commission resolution by tier** — §3.3 explicitly lists T1 12% / T2 8% / T3 6% / Premium 4%. If a provider expects 12% commission and gets billed at the category default, that's a recruitment/revenue problem on day one. Same class as the EXP-OVR gap I shipped. **One-brief sized.**
- **Pricing.service.ts literals IF the service is actually called** — quick grep needed; if live, it's a billing inconsistency.

### Probably launch-blocking (depends on launch market scope)
- **Affiliate behaviorMode** — only matters if launch markets route bookings through affiliate partners with non-default behavior. Mumbai / Kyoto: 12Go, Viator, Booking.com all do plain pass-through; "mark up" and "rebate" are §4.8 niceties that aren't being used at first-market launch. **Defer.**
- **Credit packages DB table** — only matters if Traveloure actively sells credits at launch. The shared/credit-packages.ts constants file works fine if admin-set-once-and-forget is acceptable for the beta. **Defer unless credits are a beta-promoted feature.**

### Clearly Phase-2 (not launch-blocking)
- Override granularity (global→market→tier→entity) — only matters when multi-market with per-market overrides
- Effective-dating — only matters when scheduling future rate changes
- Audit trail — useful but not blocking (accessAuditLogs partially covers it via EXP-OVR pattern)
- Reset-to-default — admin UX polish
- Expert new/established auto-tier — EXP-OVR's manual override covers this until launch + a few months of GMV data
- Resolver unification — structural cleanup; the two resolvers work fine in parallel

---

## PROPOSED BRIEF SEQUENCE

Three execution briefs land before launch; the rest become a single Phase-2 batch.

### FEE-2 brief (launch-blocking, ~one session)
**Provider commission by insurance tier (12/8/6/4).**
- P1: Insurance fields on `serviceProviderForms` (coverage amount, doc upload optional) + admin verification flow + `insuranceTier` column.
- P2: Resolver branch in `resolveCommissionRates` between AI/affiliate and per-expert: if `providerId` resolves to a tier, return that tier's rate. Tier rates seeded into `booking_fee_configs` as new rows or as a sibling `provider_tier_rates` table.
- P3: Admin UI in `fee-config.tsx` for tier rates + provider approval queue extension to show tier.

### FEE-3 brief (small, launch-blocking pending grep, ~half session)
**pricing.service.ts deposit rate + tier markups removed.**
- P0: Confirm `pricing.service.ts` is actually called (not dead like the unmounted route modules).
- P1: If alive: extract `depositRate` and `expertRates` into `booking_fee_configs` rows (`category='deposit'`, `category='expert_tier_markup'` × 3) and read through `resolveCommissionRates`.
- P2: If dead: delete or mark dead-code; close the tracker row.

### FEE-Defer (Phase-2 batch, all of Groups A, C, and the rest of B)
**Single brief that produces a batch migration:**
- Resolver unification (`commission.ts` + `optimization-fee.service.ts` → one `fee-resolver.service.ts`)
- Override granularity columns
- Effective-dating columns
- `fee_changes` audit table
- Reset-to-default endpoints
- Credit packages DB table (if not done by then)
- Affiliate behaviorMode column
- Expert new/established auto-tier (with the trigger decision)

This batch is large but coherent: all of it lives in `shared/schema.ts` migrations + the resolver service + the admin UI. ~4-6 sessions of execution work after planning.

---

## OPEN DECISIONS (block briefs from being written)

The brief drafts above can't finalize until these are answered:

| # | Question | Brief blocked |
|---|---|---|
| 1 | What triggers expert `new → established` flip? GMV threshold, days-on-platform, admin manual? | FEE-Defer |
| 2 | Provider insurance tier: admin-validated (upload docs, admin approves) or self-attested? | FEE-2 |
| 3 | Affiliate "markup" behavior: flat $, %, or per-partner formula? | FEE-Defer |
| 4 | "Market" in override granularity: free-text city, FK to a markets table, or both? | FEE-Defer |
| 5 | Is `pricing.service.ts` actually called at runtime? | FEE-3 (P0 answers this) |
| 6 | Does the launch market use any non-pass-through affiliate behavior? | Confirms FEE-Defer can defer rather than block |

---

## TRACKER MOVES THIS DOC RECOMMENDS

| Tracker row | Current | Recommended |
|---|---|---|
| Provider insurance-tier → tier commission | "Needs planning" | **Promote to FEE-2 brief; mark launch-blocking** |
| pricing.service.ts deposit + tier markups | "Needs planning" | **Promote to FEE-3 brief; mark launch-blocking pending P0** |
| Single fee resolver every charge path reads from | "Partial" | Move to "Deferred — Phase 2" with note (it works as two resolvers today) |
| Override granularity, Effective-dating, Audit trail, Reset-to-default | "Needs planning" | Move to "Deferred — Phase 2" as a single batched brief |
| Expert `expertTier` new/established | "Needs planning" | Move to "Deferred — Phase 2" (EXP-OVR covers beta-recruitment case manually) |
| Affiliate `behaviorMode` | "Needs planning" | Move to "Deferred — Phase 2 (confirm with launch-market routing first)" |
| Credit-package bonus logic | "Needs planning" | Move to "Deferred — Phase 2 (constants file works for beta)" |
