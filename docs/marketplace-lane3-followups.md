# Marketplace Lane 3 follow-ups

## City expert attribution

The TravelPulse city feed currently exposes city-level aggregates but no lead-expert
reference. The city card therefore links to the local-expert lane when an aggregate
count is present and to the trip-planner lane otherwise. Adding a named lead expert
requires a server-side join and is intentionally filed for a later lane.

## Plane icon boundary

The shared city card uses location, people, and conversation icons for its traveler
actions and source row. The Events season surface remains responsible for its own
event-specific Plane icon usage in `GlobalCalendar`; that component is intentionally
not changed by the CityCard convergence.