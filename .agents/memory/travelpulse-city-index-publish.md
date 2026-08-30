---
name: TravelPulse city index publish compatibility
description: Production retains duplicate normalized city/country rows, so its schema cannot receive the expression unique index through Publish.
---

Do not reintroduce `travel_pulse_cities_city_country_unique` into the development schema until the duplicate production city pairs are cleaned through an approved production-data operation.

**Why:** Replit Publish applies schema diffs but does not run the application's data-cleanup migrations against production. The production duplicates make the unique-index DDL fail validation, blocking deployment.

**How to apply:** Keep duplicate prevention in the existing normalized application-level city lookup paths. Before adding any database-level uniqueness constraint for this table, read production duplicate groups and choose an approved data-remediation path first.