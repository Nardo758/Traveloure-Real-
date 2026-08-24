# Per-Expert Commission Override — Execution Brief

**Goal:** Honor the §6.9 beta-recruitment promise ("reduced commissions (20% vs 25%)") by letting an admin set a per-expert commission override. Without this, the first beta expert's first settled booking quietly bills at the category default — the promise is broken on day one in exactly the markets we're launching (Mumbai, Kyoto).

**Owner:** CON workstream — flagged in `audit-coverage-tracker.md` as *BLOCKS BETA OUTREACH*.

**Source:** Phase A planning discussion (2026-06-05); confirmed no real outreach with the §6.9 "20% vs 25%" language has gone out yet. This brief must land before the first DM using that language is sent.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. The three phases share the storage/resolver/UI contract.
2. Work in strict phase order: 0 → 3.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(EXP-OVR.Pn): …`).
4. **Typecheck floor = 140 pre-existing errors.** Every phase must return `npm run check` at **≤140 errors**. No net-new errors in the files a phase touches.
5. **Phase 1 edits `shared/schema.ts` — run SINGLE-SESSION.** Concurrent sessions on the schema file is the documented conflict surface.
6. File:line refs may have drifted — confirm before editing.

---

## DECIDED DEFAULTS (do not ask — settled)

- **D1 Storage shape:** one nullable decimal column on the `users` table, named `commission_override_expert_share_percent`, range 0–100. **Why on users:** keeps the resolver lookup keyed by `userId` (the only id available in every commission path); avoids a new table for one column; nullable so it's a no-op for everyone who doesn't have an override set. Travel experts and local experts both live in `users` with role-based filtering, so one column covers both.
- **D2 Semantic:** the stored value is the **expert's share** (e.g. `80` for "expert keeps 80%, platform takes 20%"). Matches `booking_fee_configs.expertSharePercent` already in use. The §6.9 "20% vs 25%" wording is platform-take; the stored 80 (= 100 − 20) is the inverse.
- **D3 Resolver precedence:** **override > category > code-level fallback.** The resolver checks for an override row first; if present, returns the override; otherwise reads `booking_fee_configs` by category as today; otherwise falls back to the in-code defaults at `commission.ts:16-22`.
- **D4 Admin UI placement:** the expert approval form at `client/src/pages/admin/experts.tsx`. One numeric input + help text; saved via PATCH to an existing or new admin endpoint.
- **D5 Validation:** override percent must be in `[0, 100]`. Empty/null clears the override (returns to category default).

---

## GLOBAL "WHAT NOT TO DO"

- **No fee constants introduced.** The override is data, not code; nothing in `commission.ts` gets a hardcoded value.
- **Do not change `commission.ts:16-22` constants** (`EXPERT_SHARE_RATE=0.75`, etc.). They remain the absolute floor when both the per-expert override and category config are missing.
- **Do not gate the override behind any role check beyond admin.** Admins can set any percentage in [0,100] for any expert-class user; that's the point.
- **Do not add a category dimension** ("override for X category only"). Phase A keeps it per-expert flat; per-(expert, category) granularity is a FEE workstream nice-to-have.
- **Do not retroactively apply the override to already-settled bookings.** Honor the override from the moment it's saved forward.

---

## PHASE 0 — Pre-flight discovery (no code)

**Objective:** confirm the resolver signature and the admin approval flow before editing.

1. **Resolver shape.** Read `server/services/commission.ts:41-93` (`resolveCommissionRates`). Note the input shape (does it take an `expertId` / `userId`? if not, you'll need to thread one through the call sites). Note every call site so Phase 2 can pass the id where needed:
   ```
   grep -rn "resolveCommissionRates" server/
   ```
2. **Approval surface.** Confirm where the admin sets per-expert metadata today:
   ```
   grep -n "expert-applications\|approve.*expert\|approvalStatus" server/routes/admin.routes.ts client/src/pages/admin/experts.tsx
   ```
3. **No prior column.** Confirm `users` has no existing commission-override field:
   ```
   grep -n "commission_override\|commissionOverride" shared/
   ```

**Gate:** resolver signature noted, call sites enumerated, approval surface located, no prior column. No code changed.

---

## PHASE 1 — Schema column + migration

**Objective:** persist the override.

**Files:** `shared/schema.ts`, `server/migrations/020_commission_override.sql` (new), `server/migrations/run-migrations.ts`.

**Steps**
1. Add to `users` (`shared/schema.ts:38`):
   ```ts
   commissionOverrideExpertSharePercent: decimal("commission_override_expert_share_percent", { precision: 5, scale: 2 }),
   ```
   Nullable, no default. (Decimal precision 5,2 allows 0.00–999.99; we enforce [0,100] at validation time.)
2. Create migration `server/migrations/020_commission_override.sql`:
   ```sql
   ALTER TABLE users
     ADD COLUMN IF NOT EXISTS commission_override_expert_share_percent NUMERIC(5,2);
   COMMENT ON COLUMN users.commission_override_expert_share_percent IS
     'Per-expert commission override (expert keeps this %, platform takes 100-x%). NULL = use booking_fee_configs category default. Honors §6.9 beta recruitment terms.';
   ```
3. Register in `server/migrations/run-migrations.ts` `MIGRATION_FILES` array after `019_event_packages.sql`.

**Acceptance:** column exists on `users`; migration is registered; nothing reads from it yet.

**Verify / Gate**
```
grep -rn "commission_override\|commissionOverride" shared/schema.ts server/migrations/
npm run check                                              # ≤140
```
Commit: `feat(EXP-OVR.P1): users.commission_override_expert_share_percent column`

---

## PHASE 2 — Resolver wiring + call-site threading

**Objective:** the resolver returns the override when set; the constants and category default remain in place as fallback (precedence per D3).

**Files:** `server/services/commission.ts`, plus any call sites Phase 0 identified that don't already pass an expertId.

**Steps**
1. **If `resolveCommissionRates` already accepts `expertId`/`userId`:** add a single new branch at the top of the function — read `users.commissionOverrideExpertSharePercent` for that id; if not null, derive `{ expertSharePercent: override, platformFeePercent: 100 - override }` and return without consulting `booking_fee_configs`. If null, fall through to the existing category lookup unchanged.
2. **If `resolveCommissionRates` does NOT take an expert id today:** add an optional `expertId?: string` parameter, thread it through call sites (only the ones that actually have an expert id — pass `undefined` from contexts that don't). When the new param is undefined, behavior is identical to today's path. Anti-tampering matters here: the override must resolve **from the DB**, not from anything client-supplied.
3. **Do not touch the existing constants** at `commission.ts:16-22`. They remain the bottom of the precedence chain.
4. Add a tiny in-memory cache (60s TTL keyed by `expertId`) only if Phase 0 shows the resolver runs on every booking write — otherwise skip; the lookup is one cheap row read.

**Acceptance**
- An expert with `commission_override_expert_share_percent = 80` settled into a booking → expert receives 80%, platform takes 20%, regardless of category.
- An expert with the column NULL → identical behavior to before this brief (category default + constants).
- No constants moved; no category lookup removed.

**Verify / Gate**
```
grep -rn "commissionOverrideExpertSharePercent\|commission_override_expert_share_percent" server/
grep -rn "resolveCommissionRates" server/                  # confirm call sites still compile
npm run check                                              # ≤140
```
Commit: `feat(EXP-OVR.P2): per-expert commission override read in resolveCommissionRates`

---

## PHASE 3 — Admin UI field

**Objective:** an admin can set the override on the expert approval form (and edit it later for any expert).

**Files:** `server/routes/admin.routes.ts` (extend the existing expert-application/users patch endpoint), `client/src/pages/admin/experts.tsx`.

**Steps**
1. **Server:** either extend the existing PATCH for expert applications, or add a small endpoint `PATCH /api/admin/users/:id/commission-override` (admin-only). Validate the body `{ commissionOverrideExpertSharePercent: number | null }` against `[0, 100]` plus null. Write to `users`.
2. **Client:** add a numeric input + small help text to the expert approval form. Default empty (= clear override). Persist via the mutation from step 1. Show the current value when editing an already-approved expert.
3. **Audit trail:** log the change with the admin's userId and old/new values to `accessAuditLogs` (or wherever admin actions are logged today — quick grep).

**Acceptance**
- Admin sees and can edit "Commission override (%)" on the expert page.
- Saving null clears the override.
- The displayed expert split UI shows "platform: 100 − x%, expert: x%" derived from the value.

**Verify / Gate**
```
grep -rn "commission-override\|commissionOverrideExpertSharePercent" server/routes/admin.routes.ts client/src/pages/admin/
npm run check                                              # ≤140
```
Commit: `feat(EXP-OVR.P3): admin UI field for per-expert commission override`

---

## FINAL VERIFICATION CHECKLIST

- [ ] **P1** — column on `users`, migration registered.
- [ ] **P2** — resolver returns override when set; category + constants remain the fallback chain.
- [ ] **P3** — admin can read/write the override per expert; audit-logged.
- [ ] An expert seeded with the column set to `80` shows a 20%/80% split end-to-end (a settled booking applies that split, not the category default).
- [ ] An expert with NULL is unaffected — identical to today's behavior.
- [ ] No new fee constants introduced; `commission.ts:16-22` untouched.
- [ ] `npm run check` ≤ 140 (the floor) after every phase.

---

## OUT OF SCOPE

- Per-(expert, category) granularity (FEE workstream).
- Effective-dating ("override active from X to Y") — FEE workstream.
- Cascading override hierarchy (global → market → tier → entity) — FEE workstream.
- A bulk admin "all Mumbai beta experts → 80%" tool. Until volume justifies it, admins set them one at a time.
- Notifying the expert when their override is changed (a Phase-2 trust feature).
- Migrating already-settled bookings to the new rate (do NOT — honor only forward).

---

## RECRUITMENT GATE

**This brief must merge before any §6.9 outreach DM with the "20% vs 25%" language is sent.** The tracker's *BLOCKS BETA OUTREACH* flag stays on until this lands. After merge, the gate clears and Mumbai/Kyoto recruitment can proceed.
