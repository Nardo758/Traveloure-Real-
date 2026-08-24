# Traveloure — Listing Engine Phase

**Status:** Gated — post-landing, off merged main. Supply-side build; rank it **ahead of most surface-wiring**, because good, complete, coverage-tagged listings are upstream of every recommendation the engine makes.

**This is an extend, not a rebuild.** `ServiceForm.tsx` already captures a solid generic field set (name, category, price/type, delivery method, duration, what's-included, gallery, lead time, cancellation, single neighborhood). Keep it. The work is to make it schema-driven, gate it, and connect it to the structures the engine depends on.

**The audit's headline (read before prioritizing):** the per-category field gap is real but it's a *quality* problem. Two findings outrank it:
1. **No verification gate** — `requiresBackgroundCheck`/`insuranceBand` are on the read-only catalog, not the listing; the publish path has no guard. Any provider can go live unverified, including childcare. Safety/trust/liability, not a feature.
2. **`provider_neighborhood_coverage` is orphaned** — nothing writes it. The upsell engine's "category × neighborhood" query returns empty in production regardless of how well the front end is wired. This is the missing link between the demand engine and real inventory.

---

## Architecture

Extend `ServiceForm` into a schema-driven listing engine with five capabilities. Generic fields stay; everything below layers on.

- **Per-category fields via a field schema + jsonb attributes.** Add a `category_field_schema` table (admin-configurable: `categoryKey → [{key,label,type,required,options}]`) and a `category_attributes jsonb` column on `provider_services`. The form fetches the schema for the selected category and renders the extra fields dynamically into the jsonb. One form, data-driven — **not 30 sparse columns, not 60 bespoke forms.**
- **Verification publish-gate.** Resolve the category's `requiresBackgroundCheck` + `insuranceBand` (from the catalog) at publish time. A listing in a gated category cannot reach `status:"active"` until the provider's verification is confirmed — it can save as **draft**. (Prerequisite to confirm: a provider verification status to check against. If none exists, that mechanism — a verification record + the admin/automated flow that sets it — is part of this phase.)
- **Coverage writer.** Replace the single-slug neighborhood field with a multi-select, and on save write `(providerId, neighborhoodId)` rows to `provider_neighborhood_coverage`. This is what makes the engine's neighborhood queries return anything. Delete-and-reinsert the provider's coverage rows on each save to stay consistent.
- **Richer pricing model.** Add the shapes the catalog implies: hourly (drivers, live-support), package tiers (Basic/Standard/Premium for photography), per-event (catering/weddings), alongside the existing flat/range/per-person. Store as a structured pricing jsonb or a small rate table; the form shows the right shape per category.
- **Expert 5-tier connection.** Expose `expertOfferingTypes.service_tier` (advisory/planning/coordination/live_support/specialized) in the expert listing path, replacing the disconnected `serviceType` enum, with per-tier price + turnaround, and expose `revisionsIncluded` on the expert path.

**`/earn` connection:** the "I do this → {offering}" CTA carries the chosen `offeringTypeKey` into the listing form, which pre-selects the category, loads that category's field schema, and pre-arms the verification gate. The supply funnel (browse → apply → list) becomes continuous.

---

## Priority steps (one commit each, gated)

1. **Verification publish-gate** — highest priority; it's a safety/liability hole. Move the gate logic onto the publish path, resolve `requiresBackgroundCheck`/`insuranceBand` from the catalog, block go-live until verified (draft allowed). Confirm/establish the provider-verification mechanism first. Gate: a childcare/transport listing cannot publish active without verification (test); draft still works. Commit.
2. **Coverage writer** — the integration-critical fix. Multi-neighborhood selector → `provider_neighborhood_coverage` rows on save. Gate: a saved listing produces coverage rows; the engine's "category × neighborhood" query now returns that provider for its neighborhoods (test the round-trip). Commit.
3. **Field-schema layer** — `category_field_schema` table + `category_attributes` jsonb + dynamic rendering. Seed schemas for the categories that need them most (transport: vehicle/seats/license; photography: portfolio/equipment/style; childcare: age-ranges/certs/group-vs-1:1). Gate: selecting a category renders its extra fields; they persist to jsonb; a category with no schema falls back to generic cleanly. Commit.
4. **Pricing model** — hourly + package tiers + per-event. Gate: a driver lists an hourly rate, a photographer lists tiered packages, both persist and render. Commit.
5. **Expert 5-tier connection** — wire `service_tier` into the expert path + `/earn` pre-fill. Gate: an expert lists against a real tier, price + turnaround persist, the listing resolves back to its `expertOfferingType`. Commit.

---

## What NOT to do
- Don't rebuild `ServiceForm` — extend it. The generic base is fine.
- Don't add a column per category field — use the schema + jsonb. (Bespoke columns are how you end up with 40 sparse fields.)
- Don't let a `requiresBackgroundCheck` category publish active unverified. Draft is the only pre-verification state.
- Don't ship without the coverage writer — every prior phase's neighborhood logic is inert until listings populate `provider_neighborhood_coverage`.
- Don't hardcode the field schemas in the component — they're admin-configurable rows, same principle as fees and the matrix.
- Don't render category/tier keys to providers — labels only.
