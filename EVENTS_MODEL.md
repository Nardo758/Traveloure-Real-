# Events Model — Canonical Source of Truth

## Table Ownership Map

| Table | Role | Written By | Read By |
|-------|------|-----------|---------|
| `destination_events` | **CANONICAL** — user-facing event listing | TravelPulse AI, Fever cache write path, human contributors | Global calendar, AI matching, opportunity engine, destination calendar |
| `fever_event_cache` | Integration cache — Fever API, 24 h TTL | `fever-cache.service.ts` | Experience catalog browse; write path to `destination_events` |
| `travel_pulse_calendar_events` | Impact intelligence cache (crowd/price data) | `travelpulse.service.ts` | `/api/travelpulse/calendar/:city` (city impact view); write path to `destination_events` |
| `live_events` | Tourist search result cache | Tourist places search flow | Help Me Decide event display |
| `tourist_help_me_guide_events` | Context-specific — Help Me Guide feature | Help Me Guide frontend | Help Me Guide UI |
| `ea_events` | Context-specific — Executive Assistant module | EA dashboard CRUD | EA calendar/events pages |

---

## Canonical Table: `destination_events`

`destination_events` is the **single source of truth** for user-facing event display (the by-date Events view, global calendar, and AI itinerary enrichment).

### Why `destination_events`?

- Richest schema: city, country, eventType, month-based and specific-date fields, approval workflow, contributor tracking
- Has `sourceType` + `sourceId` columns for tracing event origin and preventing duplicate inserts
- Already the read target for AI matching (`ai-recommendation-engine.service.ts`, `opportunity-engine.service.ts`) and all calendar endpoints
- No TTL / expiry — permanent record, unlike the integration caches

---

## Write Paths Into the Canonical Table

### 1. TravelPulse AI Intelligence (`travelpulse.service.ts`)

After generating city intelligence, upcoming events are upserted into `destination_events` with `sourceType: 'ai'`.  
Duplicate check: `(city, country, title)` match before inserting.

### 2. Fever Event Cache (`fever-cache.service.ts`)

When Fever API events are fetched and stored in `fever_event_cache`, they are **also upserted** into `destination_events` with:
- `sourceType: 'fever'`
- `sourceId: feverEventId`

Duplicate check: `(sourceType='fever', sourceId=feverEventId)` before inserting.  
Extended Fever metadata (imageUrl, bookingUrl, pricing, venue) is stored in the `metadata` jsonb column.

### 3. Human Contributors

Experts and admins submit events via `POST /api/destination-calendar/events` with `sourceType: 'manual'`.  
These require `status: 'approved'` before appearing in the Events view.

---

## Read Paths (Canonical Table Only)

All Events-view queries read **exclusively** from `destination_events`:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/destination-calendar/events` | Main by-country/city event listing |
| `GET /api/travelpulse/global-calendar` | Global calendar by month |
| `GET /api/travelpulse/destination-calendar/:city/:country` | Full calendar data (seasons + events) |
| `server/services/ai-recommendation-engine.service.ts` | AI itinerary enrichment |
| `server/services/opportunity-engine.service.ts` | Service opportunity recommendations |

---

## Integration Cache Tables (Not Canonical)

### `fever_event_cache`

- Caches Fever API responses for 24 hours to reduce API calls
- The experience catalog browse UI may read this directly for rich Fever-specific fields (slug, sessions, affiliate URLs)
- The Events calendar view (by-date listing) reads from `destination_events`, not this cache
- Every successful cache write also triggers a canonical write into `destination_events`

### `travel_pulse_calendar_events`

- Stores AI-generated crowd/price impact intelligence per city and date range
- Contains fields not in `destination_events`: `crowdImpact`, `priceImpact`, `crowdImpactPercent`, `affectedAreas`, `tips`
- Read by `/api/travelpulse/calendar/:city` for the TravelPulse city impact view (used by `global-calendar.tsx` to show crowd/price badges)
- TravelPulse AI also writes the event names into `destination_events` (via `travelpulse.service.ts` `mergeDestinationData`)

---

## Context-Specific Tables (Not Part of Event Calendar)

### `live_events`

- Tied to tourist place search results (FK → `tourist_places_searches`)
- Used for the Help Me Decide event search display
- Does not participate in the destination event calendar system

### `tourist_help_me_guide_events`

- User-scoped (userId FK), stores raw jsonb event objects
- Part of the "Help Me Guide" user flow only
- Does not participate in the destination event calendar system

### `ea_events`

- Executive Assistant module events (meetings, corporate events)
- Completely separate namespace from travel destination events
- Does not participate in the destination event calendar system

---

## Deduplication Rules

Events are prevented from appearing twice in the Events view by:

1. **Canonical-only reads**: The Events calendar view reads **only** from `destination_events`. No endpoint unions `destination_events` + `fever_event_cache` + `travel_pulse_calendar_events` for the same view.

2. **Application-level insert guards**:
   - Fever events: check `(sourceType='fever', sourceId=feverEventId)` before inserting
   - TravelPulse AI events: check `(city, country, title)` before inserting
   - Human-contributed events: go through approval workflow (status filter prevents pending duplicates from appearing)

3. **Source tracking**: Every row in `destination_events` carries `sourceType` (`ai` | `fever` | `manual`) so origin can always be traced.
