-- 178_fee_ledger_bands.sql — Fee-Ledger lane Phase 1A (D0/D1/D2/D3, ruled 2026-08-06)
--
-- Structure C, "split & disclosed": four provider commission bands resolved via
-- service_categories.commission_band_key, plus a capped + disclosed traveler service fee, plus a
-- rails band whose resolution is min(category band, rails) with the traveler fee waived.
--
-- VERIFY-THEN-SEED (D1 step 1): the four provider bands were verified present at the ruled rates
-- before this migration was written — limited 0.1200, moderate 0.0800, commercial 0.0600,
-- premium 0.0400, all is_active — so this migration seeds NONE of them. It seeds only what was
-- absent (traveler_service_fee, provider_rails) and deactivates what D2 ruled dead (beta_flat).
--
-- Idempotent: ON CONFLICT DO NOTHING on the seeds; the UPDATEs are predicate-guarded. Safe to
-- re-run. No CHECK constraint is added (migration-159/171/177 posture), so there is no
-- publish-time CHECK trap; the new column is declared in shared/schema.ts in the SAME commit per
-- the deploy-push durability rule (CLAUDE.md: an object the code depends on must be declared in
-- schema.ts or the Autoscale push is authoritative and will drop it).

-- ── 1. Amount cap storage (D1) ────────────────────────────────────────────────────────────────
-- The traveler service fee is "0.07, capped at $25.00 per booking (cap enforced at resolution,
-- stored on the band row ... not in code)". fee_bands.min_rate/max_rate are RATE bounds (fractions
-- in [0,1]); a per-booking dollar ceiling is a different quantity and needs its own column.
-- NULL means "no cap", which is every pre-existing band's behaviour — so this is behaviour-neutral
-- on apply.
ALTER TABLE fee_bands ADD COLUMN IF NOT EXISTS max_amount NUMERIC(10,2);

COMMENT ON COLUMN fee_bands.max_amount IS
  'Per-booking dollar ceiling on the resolved amount (NULL = uncapped). Distinct from max_rate, '
  'which bounds the RATE. Enforced at resolution, never in code (D1, fee-ledger lane).';

-- ── 2. traveler_service_fee (D3: keep, disclosed, first-class) ────────────────────────────────
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, max_amount, display_name, description, is_active)
VALUES (
  'traveler_service_fee', 'percent', 0.0700, 0.0000, 0.2000, 25.00,
  'Traveler service fee',
  'D3 (fee-ledger lane, ruled 2026-08-06): the traveler-facing service fee, KEPT and DISCLOSED as '
  'its own labeled checkout line and its own fee_ledger type. 7% of the booking subtotal, capped at '
  '$25.00 per booking via max_amount. WAIVED entirely on rails-attributed bookings (D1) — that '
  'waiver is the provider''s quotable pitch. Before this band the same computed number was both '
  'added to the traveler total and deducted from the provider base while only one side was recorded '
  '(audit C1).',
  true
)
ON CONFLICT (band_key) DO NOTHING;

-- ── 3. provider_rails (D1: 0.08, resolution = min(category band, rails)) ──────────────────────
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES (
  'provider_rails', 'percent', 0.0800, 0.0000, 0.1200,
  'Provider rails (attributed short link)',
  'D1 (fee-ledger lane, ruled 2026-08-06): the attributed-short-link rate. RESOLUTION IS '
  'min(category band, this band) so rails can never exceed a premium provider''s full rate — a '
  'premium provider (0.04) stays at 0.04 on a rails booking rather than being raised to 0.08. '
  'Rails bookings additionally waive traveler_service_fee. Repeat-pair rails remains '
  'spec-ahead-of-code: the band and the resolution accommodate it, the detection logic is NOT '
  'built (D1).',
  true
)
ON CONFLICT (band_key) DO NOTHING;

-- ── 4. beta_flat DEACTIVATED (D2) ────────────────────────────────────────────────────────────
-- Incoherent under structure C: 0.10 is worse for the provider than the commercial (0.06) and
-- premium (0.04) bands it would sit beside. A founding-Kyoto promise, if wanted, becomes
-- premium-band-for-life granted through the D0 entity-override mechanism with provenance — a
-- separate later decision that this lane does not implement.
UPDATE fee_bands
   SET is_active = false,
       description = COALESCE(description, '') ||
         ' [DEACTIVATED by D2 (fee-ledger lane, ruled 2026-08-06): incoherent under structure C — '
         'a 10% take is worse for the provider than the commercial (0.06) and premium (0.04) bands. '
         'Superseded by the four category-resolved provider bands. Do not reactivate; a founding-'
         'provider promise is a premium-band grant via the D0 override mechanism, not this band.]',
       updated_at = now()
 WHERE band_key = 'beta_flat'
   AND is_active = true;

-- ── 4b. Repoint the settings that NAME the deactivated band ──────────────────────────────────
-- Deactivating a band is not enough on its own: `platform_settings.default_commission_band_key`
-- and `active_provider_commission_policy` both held the literal 'beta_flat', and the resolver reads
-- them BEFORE any code fallback — so the band went inactive while two settings still pointed at it,
-- and every provider line that reached them threw `commission band missing: bandKey=beta_flat`.
-- (Found by `verify-fee-config-parity` in CI, which is precisely its job.)
--
-- `expert_standard` is the documented last-resort default the EXPERT_SHARE_RATE / PLATFORM_FEE_RATE
-- code constants already mirror (commission.ts:51-52), so this restores the behaviour those
-- constants describe rather than inventing a rate. Per-category bands (ruling 48, migration 180)
-- are what actually resolve a provider line; this default is the floor beneath them.
-- Predicate-guarded, so an admin who has already chosen a different default is never overwritten.
UPDATE platform_settings
   SET setting_value = 'expert_standard', updated_at = now()
 WHERE setting_key = 'default_commission_band_key'
   AND setting_value = 'beta_flat';

-- The tiered policy is the one that resolves per-category bands (ruling 48). The 'beta_flat' policy
-- named a band that no longer exists as an active row.
UPDATE platform_settings
   SET setting_value = 'tiered', updated_at = now()
 WHERE setting_key = 'active_provider_commission_policy'
   AND setting_value = 'beta_flat';

-- ── 5. provider_services.revenue_share_rate — the "0.75" literal default is DELETED (D0) ──────
-- Audit Q9: this per-service snapshot was the FIRST operand at payments.routes.ts:826/877/1090
-- ("the final override"), so fee_bands never decided the rate — which defeated ruling 32's proof
-- that an admin band edit changes the resolved value. D0 ends that: the column stops being the
-- final override, and its hardcoded default is a fee literal per ruling 32 and is removed here.
-- Dropping the DEFAULT does NOT rewrite existing rows; step 6 handles those.
ALTER TABLE provider_services ALTER COLUMN revenue_share_rate DROP DEFAULT;

-- ── 6. Backfill: retire stale snapshots (D0) ──────────────────────────────────────────────────
-- bc18f6f (MI-1, ruling 42) began deriving this column server-side but shipped NO migration, so
-- every row written before it — including every bench fixture — still carries whatever it had
-- (0.75 in the observed case). D0: "a backfill migration ships for rows carrying stale snapshots
-- ... do not repeat [that gap]".
--
-- The backfill NULLs the column rather than writing a computed rate into it. Writing a rate here
-- would re-create the very thing D0 removes — a denormalized snapshot that goes stale the next
-- time an admin edits a band. NULL means "no override; ask the resolver", which is exactly D0's
-- rate authority. safeParseRate already treats a non-finite value as absent and falls through to
-- the resolved rate, so this is safe ahead of the resolver work landing.
UPDATE provider_services
   SET revenue_share_rate = NULL,
       updated_at = now()
 WHERE revenue_share_rate IS NOT NULL;
