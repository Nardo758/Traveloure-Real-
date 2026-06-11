-- Migration 063: Promote Local Expert city-planning offerings to top of catalog.
--
-- local_city_itinerary / local_perfect_day / local_neighbourhood_plan were
-- seeded into the specialized tier (sort_order 86-88) in migration 062.
-- The user expects itinerary-planning work to lead the Local Expert catalog,
-- not trail after all advisory and live_support rows (sort_orders 1-65).
-- Negative sort_orders are valid (INT column) and sort before everything else.

UPDATE expert_offering_types SET sort_order = -3 WHERE offering_type_key = 'local_city_itinerary';
UPDATE expert_offering_types SET sort_order = -2 WHERE offering_type_key = 'local_perfect_day';
UPDATE expert_offering_types SET sort_order = -1 WHERE offering_type_key = 'local_neighbourhood_plan';
