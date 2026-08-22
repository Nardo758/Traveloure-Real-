---
name: Logistics route semantics
description: Service itineraries and pickup collection routes are independent provider-listing concepts.
---

**Rule:** Keep the ordered places a service visits separate from ordered pickup collection points. They have independent persistence and must never share a write path or be relabeled through a coverage-mode switch.

**Why:** An experience stop can be a destination travelers visit, while a pickup stop is a point where travelers are collected. Conflating them creates incorrect traveler-facing logistics and risks overwriting one list when editing the other.

**How to apply:** Use the service itinerary route-point path for the visit sequence. Use the dedicated pickup-route path only when pickup coverage is defined as a route. In the provider UI, make each label and its help text name the relevant traveler question explicitly.