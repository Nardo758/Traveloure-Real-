-- 372 — ride hard-filter facts (ledger `2026-10-11-tc3b-ride-recommender`; decision-maker ruling 4, Oct 11, 2026).
-- HELD: merges only with Leon's approval comment on the TC-3b PR. DATA ONLY: no ALTER, no CHECK, no index, no
-- DEFAULT — nothing to declare in shared/schema.ts.
--
-- Adds `service_transport_facts.notes.filters` — passes / payment / luggageMaxCm in a shape the recommender can
-- test — to the five seeded rides, DERIVED ONLY FROM EACH ROW'S OWN `fact_sources` ENTRIES (migration 369's
-- official read). `filters.from` names the fact_sources key each value came from; a field whose fact_sources entry
-- does not state it is left OUT, never guessed (§13):
--   · Sagano (both directions) — pass_validity: JR Pass not valid; payment_constraints: online cards must have
--     3-D Secure, printed vouchers not valid; luggage_rule: up to about 120 cm (three sides), nothing over 1 m.
--   · Hozugawa — payment_constraints: credit cards accepted. No pass or luggage entry ⇒ no pass or luggage filter.
--   · Eizan "Kirara" (both directions) — pass_validity: JR Pass not valid; payment_constraints: no credit or
--     cashless payment, transit IC cards accepted; luggage_rule: two items, each up to 250 cm total, 2 m long, 30 kg.
-- Each row also gains `fact_sources."notes.filters"` (the seed's rule, migration 369: every notes key names its
-- source): the url and quote of its payment_constraints entry — every row has one — plus `derivedFrom`, the
-- fact_sources keys the filter values were read from. Guarded by `NOT (notes ? 'filters')`, so an admin-edited filter
-- is never overwritten and a second run is a no-op.
-- The recommender reads these in a later lane; this migration changes no behaviour on its own.

UPDATE service_transport_facts
   SET notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('filters', $f${
     "passes": {"jrPass": false},
     "payment": {"online": ["card_3ds"], "notAccepted": ["printed_voucher"]},
     "luggageMaxCm": 120,
     "luggageMaxLengthCm": 100,
     "from": {"passes": "pass_validity", "payment": "payment_constraints", "luggageMaxCm": "luggage_rule", "luggageMaxLengthCm": "luggage_rule"}
   }$f$::jsonb),
       fact_sources = COALESCE(fact_sources, '{}'::jsonb) || jsonb_build_object('notes.filters', jsonb_build_object(
         'url', fact_sources -> 'payment_constraints' ->> 'url',
         'quote', fact_sources -> 'payment_constraints' ->> 'quote',
         'derivedFrom', '["pass_validity", "payment_constraints", "luggage_rule"]'::jsonb)),
       updated_at = NOW()
 WHERE service_id IN ('00000000-0000-4000-c369-000000000001', '00000000-0000-4000-c369-000000000002')
   AND NOT (COALESCE(notes, '{}'::jsonb) ? 'filters');

UPDATE service_transport_facts
   SET notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('filters', $f${
     "payment": {"accepted": ["card"]},
     "from": {"payment": "payment_constraints"}
   }$f$::jsonb),
       fact_sources = COALESCE(fact_sources, '{}'::jsonb) || jsonb_build_object('notes.filters', jsonb_build_object(
         'url', fact_sources -> 'payment_constraints' ->> 'url',
         'quote', fact_sources -> 'payment_constraints' ->> 'quote',
         'derivedFrom', '["payment_constraints"]'::jsonb)),
       updated_at = NOW()
 WHERE service_id = '00000000-0000-4000-c369-000000000003'
   AND NOT (COALESCE(notes, '{}'::jsonb) ? 'filters');

UPDATE service_transport_facts
   SET notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('filters', $f${
     "passes": {"jrPass": false},
     "payment": {"accepted": ["ic_card"], "notAccepted": ["credit_card", "cashless"]},
     "luggageMaxCm": 250,
     "luggageMaxLengthCm": 200,
     "luggageMaxItems": 2,
     "luggageMaxKg": 30,
     "from": {"passes": "pass_validity", "payment": "payment_constraints", "luggageMaxCm": "luggage_rule", "luggageMaxLengthCm": "luggage_rule", "luggageMaxItems": "luggage_rule", "luggageMaxKg": "luggage_rule"}
   }$f$::jsonb),
       fact_sources = COALESCE(fact_sources, '{}'::jsonb) || jsonb_build_object('notes.filters', jsonb_build_object(
         'url', fact_sources -> 'payment_constraints' ->> 'url',
         'quote', fact_sources -> 'payment_constraints' ->> 'quote',
         'derivedFrom', '["pass_validity", "payment_constraints", "luggage_rule"]'::jsonb)),
       updated_at = NOW()
 WHERE service_id IN ('00000000-0000-4000-c369-000000000004', '00000000-0000-4000-c369-000000000005')
   AND NOT (COALESCE(notes, '{}'::jsonb) ? 'filters');
