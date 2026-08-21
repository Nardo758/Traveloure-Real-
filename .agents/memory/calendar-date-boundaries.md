---
name: Calendar-date boundaries
description: Durable rules for trip date-only values, calendar exports, and legacy naive booking timestamps.
---

Treat trip start/end values as calendar dates, not UTC instants. Parse their year/month/day components directly for UI labels and day arithmetic. Calendar exports without a stored IANA destination timezone must use floating trip-local event times; only metadata timestamps such as DTSTAMP are UTC.

**Why:** Native parsing of `YYYY-MM-DD` shifts visible dates backward in negative-offset browsers, and converting itinerary wall times through the server timezone shifts imported calendar events. Legacy naive cancellation timestamps also changed refund tiers with runtime timezone.

**How to apply:** Use calendar-date helpers for trip UI and day counts. Preserve explicit offsets for booking instants; interpret legacy naive/date-only booking timestamps using one documented UTC compatibility rule. Never infer destination time from the viewer or server timezone.