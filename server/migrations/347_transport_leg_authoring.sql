-- Work plan L1-1 (docs/planning/expert-console-ready-made-work-plan.md; rulings R-ay, R-az, R-bf,
-- R-ba, R-bb). SQL APPROVED by the decision-maker, Oct 4, 2026. ADDITIVE ONLY: seven nullable columns
-- on transport_legs. No DEFAULT, no CHECK, no index, no FK, no backfill. Declared in
-- shared/schema.ts (deploy-push durability rule). IF NOT EXISTS so a second run is a no-op.
--   author_tip                  R-ay: the author's plain-text tip, <=140 chars (app-enforced)
--   pickup_provider_service_id  R-az: a provider_services id (no FK); validated by the app
--   checked_by / checked_at     R-bf: who confirmed the leg on the expert side, and when
--   origin                      R-ba: author_pick | rerouted_for_stay on a buyer's copy (L1-3/L1-4)
--   leg_check_status            R-bb: ok | changed | broken from the re-check job (L1-5)
--   leg_checked_at              R-bb: when that job last checked the leg
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS author_tip text;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS pickup_provider_service_id varchar;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS checked_by varchar;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS checked_at timestamp;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS origin varchar(30);
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS leg_check_status varchar(20);
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS leg_checked_at timestamp;
