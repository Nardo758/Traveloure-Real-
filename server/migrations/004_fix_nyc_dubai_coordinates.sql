-- Fix missing lat/lon for New York and Dubai in travel_pulse_cities
-- Both cities had NULL coordinates, preventing them from being included
-- in any Amadeus lat/lon-based searches (activities, safety ratings).
UPDATE travel_pulse_cities
SET latitude = 40.7128, longitude = -74.0060
WHERE city_name = 'New York' AND (latitude IS NULL OR longitude IS NULL);

UPDATE travel_pulse_cities
SET latitude = 25.2048, longitude = 55.2708
WHERE city_name = 'Dubai' AND (latitude IS NULL OR longitude IS NULL);
