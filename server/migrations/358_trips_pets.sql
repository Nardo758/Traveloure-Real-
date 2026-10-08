-- 358 — the plan's pets (ledger `2026-10-08-e1-zero-questions`; R340 `2026-10-05-pets-fields-and-service-animal`,
-- R336 `2026-10-05-pets-on-trips`). SQL HELD for the founder's ruling before merge. ADDITIVE ONLY. No function,
-- trigger, CREATE OR REPLACE or DO block. IF NOT EXISTS, so a second run is a no-op. Declared in shared/schema.ts
-- (deploy-push durability rule).
--
-- trips.pet_kind  — what the pet is, in the traveler's words ("dog", "cat"). NULL = never answered.
-- trips.pet_count — how many pets. NULL = never answered; 0 is a real answer ("no pet") only when the traveler
--                   gives it — an unanswered question is never read as "no pet" (R336 §13).
-- Service animals are not pets and are never counted here (R340). Nullable, no DEFAULT / CHECK / index / FK,
-- no backfill. Written only through the pick-based `tripOccasionBody` on PATCH /api/trips/:tripId/occasion (§19).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pet_kind varchar(60);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pet_count integer;
