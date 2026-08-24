-- 202: Per-listing card display options (Catalog+Distribute DECISIONS.md ruling 74/75, lane C3).
--
-- RATIFIED DESIGN (decision-maker, ruling 74): each listing gets a "Card shows" control on the
-- Catalog Manage view — Show price (on/off) and Booking (Instant / Request / Hidden). These render
-- on the SHARED traveler OfferingCard, in Catalog Preview AND on the public storefront ("a provider
-- who hides the price hides it everywhere").
--
-- TWO additive columns on `provider_services`. NEITHER is a money/identity/rate field (§14/§18/§19
-- do NOT apply — no amount, no actor, nothing that multiplies a platform take or selects a fee band):
-- both are ordinary owner-authored DISPLAY prefs, like `price`/`serviceRadius` beside them. They are
-- therefore legitimately client-settable and are NOT stripped; the fee gate cannot misread them.
--
--   (a) show_price BOOLEAN DEFAULT true — false ⇒ the card hides the price and shows an honest
--       "Enquire for pricing" affordance instead (never a blank, never a fake "$0" — §13). Allowed
--       for ALL services, not only quote-based ones (ruling 74 resolution A). DEFAULT true so every
--       existing and new row is concrete with no backfill and behaves exactly as today.
--   (b) booking_mode varchar(20) — app-enforced enum 'instant' | 'request' | 'hidden'
--       (bookingModeEnum / insertProviderServiceSchema). NO DB CHECK (the migration-144/195 posture,
--       publish-trap avoidance — an app-layer vocabulary is the enforcement, never a CHECK the
--       Autoscale deploy-push would apply ahead of any value remap). NULL = unset ⇒ the read-time
--       default is DERIVED from the account's existing service_provider_forms.instant_booking by
--       resolveBookingMode() (instant if true, request if false); the account flag is NOT duplicated
--       here. NO DEFAULT on this column: NULL is a meaningful "inherit the account default" state
--       distinct from an explicit choice.
--
-- PUBLISH-TRAP POSTURE (CLAUDE.md): additive, no CHECK; both columns are DECLARED in shared/schema.ts
-- in the SAME commit — an undeclared object is dropped by the deploy push and, because this migration
-- is stamped after its first run, would never be recreated.

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS show_price boolean DEFAULT true;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS booking_mode varchar(20);

COMMENT ON COLUMN provider_services.show_price IS
  'C3 (ruling 74/75). Display pref (NOT a money field). DEFAULT true. false ⇒ the traveler card '
  'hides the price and shows "Enquire for pricing" (never a blank/$0 — §13). Allowed for ALL '
  'services. Renders in Catalog Preview and on the public storefront alike.';

COMMENT ON COLUMN provider_services.booking_mode IS
  'C3 (ruling 74/75). Display pref (NOT a money field). App-enforced bookingModeEnum '
  '(instant|request|hidden), no DB CHECK. NULL = unset ⇒ derived at read time from '
  'service_provider_forms.instant_booking via resolveBookingMode (instant if true, else request); '
  'hidden is only ever an explicit per-listing choice.';
