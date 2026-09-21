-- 315 — the platform Booking Concierge listing's price becomes $35, and the admin panel can
-- actually change it from here on (ledger `2026-09-21-platform-concierge-price-editable`).
--
-- DECISION-MAKER RULING, 2026-09-21. Migration 313 seeded $25 and the ledger recorded that price
-- as UNRATIFIED. The 2026-09-21 Kyoto experience-streams audit showed why that mattered more than
-- it looked: this listing is the ONLY real card on every sampled stream's Services tab, so its
-- price is the platform's entire commercial surface today. The decision-maker set $35.
--
-- DATA ONLY. No ALTER, no CHECK, no index, no DEFAULT change, no new column, no backfill of any
-- other row. `scripts/preflight-prod-constraints.cjs` therefore needs no new manifest entry and
-- the Replit deploy push has nothing to fail on (CLAUDE.md §20 / the publish-trap rules) — the
-- same posture migrations 289 and 313(c) take.
--
-- WHY THE VALUE IS SET UNCONDITIONALLY rather than guarded on the seeded 25.00: nothing could
-- legitimately have changed it. The `fee_bands` row was admin-editable but UNREAD, and no admin
-- surface has ever been able to write `provider_services.price` for this listing — that is the
-- defect this lane closes. So there is no admin-set value here to preserve, and a guard would only
-- risk the ruled price not landing. FROM NOW ON this migration is the LAST word a migration has on
-- this number: every subsequent change is an admin-panel edit through
-- `PATCH /api/admin/fee-bands/platform_concierge_booking_listing_price`, which repoints the
-- listing through `server/services/platform-concierge-price.service.ts`. Do not add a 316 that
-- sets this price again — that would be a second author fighting the panel.

-- (a) the admin-facing number, and the seeded default for a fresh database.
UPDATE fee_bands
   SET default_rate = 35.00,
       description  = 'Locked Decision 51 / migrations 313 + 315: list price of the platform-owned '
                      'Booking Concierge listing shown where no expert offers one in a market. '
                      'EDITING THIS ROW IN THE ADMIN PANEL NOW REPOINTS THE LISTING: the PATCH '
                      'handler calls syncPlatformConciergeListingPrice(), which writes '
                      'provider_services.price for the platform-owned row. The COLUMN remains the '
                      'authority every reader and the LD 51 charge path use; this band is the '
                      'admin control and the §8 home for the amount.',
       updated_at   = NOW()
 WHERE band_key = 'platform_concierge_booking_listing_price';

-- (b) the LIVE price — the column Locked Decision 51's `conciergeFeeAmt` multiplies at checkout.
-- Addressed by the platform account + offering key, matching the ONE writer's own predicate,
-- rather than by 313's hardcoded uuid.
UPDATE provider_services ps
   SET price = 35.00,
       updated_at = NOW()
  FROM platform_settings s
 WHERE s.setting_key = 'platform_concierge_user_id'
   AND ps.user_id = s.setting_value
   AND ps.expert_offering_type_key = 'booking_concierge';
