# SERP API Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRAVELOURE PLATFORM                          │
│                      SERP API Integration (Phase 1)                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Experience Template Page (experience-template.tsx)           │ │
│  │  Location: /experience/wedding                                │ │
│  └────────────────────────┬──────────────────────────────────────┘ │
│                           │                                          │
│                           ├─► Venues Tab                             │
│                           ├─► Vendors Tab                            │
│                           ├─► Guest Accommodations Tab              │
│                           └─► Rehearsal Tab                          │
│                           │                                          │
│  ┌────────────────────────▼──────────────────────────────────────┐ │
│  │  VenueSearchPanel Component                                   │ │
│  │  • Location input (from main form)                            │ │
│  │  • Vendor type selector (for vendors tab)                     │ │
│  │  • Rating filter dropdown                                     │ │
│  │  • Custom keyword input                                       │ │
│  │  • Refresh button                                             │ │
│  └────────────────────────┬──────────────────────────────────────┘ │
│                           │                                          │
│                           │ TanStack Query                           │
│                           │ (React Query)                            │
│                           │                                          │
│  ┌────────────────────────▼──────────────────────────────────────┐ │
│  │  Results Grid                                                 │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │ │
│  │  │ VenueCard│  │ VenueCard│  │ VenueCard│                   │ │
│  │  │  Photo   │  │  Photo   │  │  Photo   │                   │ │
│  │  │  Name    │  │  Name    │  │  Name    │                   │ │
│  │  │  Rating  │  │  Rating  │  │  Rating  │  ... (grid)       │ │
│  │  │  Address │  │  Address │  │  Address │                   │ │
│  │  │  [+ Cart]│  │  [+ Cart]│  │  [+ Cart]│                   │ │
│  │  └──────────┘  └──────────┘  └──────────┘                   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP Requests
                               │ fetch()
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                              BACKEND                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  API Routes (routes.ts)                                       │  │
│  │                                                                │  │
│  │  GET /api/venues/search                                       │  │
│  │  ├─► location (required)                                      │  │
│  │  ├─► type (optional): wedding_venue, hotel, restaurant        │  │
│  │  ├─► keyword (optional): custom search term                   │  │
│  │  ├─► minRating (optional): 0, 3.5, 4.0, 4.5                  │  │
│  │  └─► radius (optional): search radius in meters               │  │
│  │                                                                │  │
│  │  GET /api/venues/:placeId                                     │  │
│  │  └─► Returns full venue details                               │  │
│  │                                                                │  │
│  │  GET /api/venues/wedding-vendors                              │  │
│  │  ├─► location (required)                                      │  │
│  │  └─► vendorType (required): photographer, florist, etc.       │  │
│  │                                                                │  │
│  └────────────────────────┬──────────────────────────────────────┘  │
│                           │                                           │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │  VenueSearchService (venue-search.service.ts)                │  │
│  │                                                                │  │
│  │  Methods:                                                      │  │
│  │  • searchVenues(params)                                       │  │
│  │  • getVenueDetails(placeId)                                   │  │
│  │  • searchWeddingVendors(location, type)                       │  │
│  │  • geocodeLocation(location)                                  │  │
│  │                                                                │  │
│  │  Features:                                                     │  │
│  │  ✓ Cache checking (before API call)                          │  │
│  │  ✓ Error handling & logging                                  │  │
│  │  ✓ Result transformation                                      │  │
│  │  ✓ Cache saving (after API call)                             │  │
│  │                                                                │  │
│  └────────────────────────┬──────────────────────────────────────┘  │
│                           │                                           │
│                           ├─► Check Cache                             │
│                           │   (24-hour TTL)                           │
│                           │                                           │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │  Cache Layer (Drizzle ORM → PostgreSQL)                      │  │
│  │  Table: serp_cache                                            │  │
│  │                                                                │  │
│  │  Columns:                                                      │  │
│  │  • cache_key (unique)                                         │  │
│  │  • query                                                       │  │
│  │  • location                                                    │  │
│  │  • category                                                    │  │
│  │  • results (JSONB)                                            │  │
│  │  • cached_at (timestamp)                                      │  │
│  │                                                                │  │
│  │  If cached & fresh → Return immediately                       │  │
│  │  If not cached or expired → Call Google Places API            │  │
│  │                                                                │  │
│  └────────────────────────┬──────────────────────────────────────┘  │
│                           │ If cache miss                             │
│                           │                                           │
└───────────────────────────┼───────────────────────────────────────────┘
                            │
                            │ HTTPS Request
                            │
┌───────────────────────────▼───────────────────────────────────────────┐
│                      GOOGLE PLACES API                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Endpoints Used:                                                      │
│  1. Text Search                                                       │
│     https://maps.googleapis.com/maps/api/place/textsearch/json       │
│     └─► Search venues by query and location                           │
│                                                                        │
│  2. Place Details                                                     │
│     https://maps.googleapis.com/maps/api/place/details/json           │
│     └─► Get full details for a specific venue                         │
│                                                                        │
│  3. Place Photos                                                      │
│     https://maps.googleapis.com/maps/api/place/photo                  │
│     └─► Retrieve venue photos                                         │
│                                                                        │
│  Returns:                                                             │
│  • Place ID                                                           │
│  • Name                                                               │
│  • Address                                                            │
│  • Rating (0-5 stars)                                                 │
│  • Review count                                                       │
│  • Price level (1-4 = $-$$$$)                                        │
│  • Photos (references)                                                │
│  • Phone number                                                       │
│  • Website URL                                                        │
│  • Opening hours                                                      │
│  • Coordinates (lat/lng)                                              │
│  • Types/categories                                                   │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Search Flow (First Time)

```
1. User enters location: "New York"
   └─► VenueSearchPanel receives location prop

2. User clicks "Venues" tab
   └─► activeTab changes to "venues"
   └─► VenueSearchPanel renders

3. Component makes API call
   GET /api/venues/search?location=New York&type=venue&keyword=wedding venues
   
4. Backend receives request
   └─► VenueSearchService.searchVenues()
   
5. Check cache
   └─► Cache key: "venue-new york-venue-wedding venues"
   └─► Cache miss (first search)
   
6. Call Google Places API
   └─► Query: "wedding venues in New York"
   └─► Receive 20 results
   
7. Transform results
   └─► Extract: name, address, rating, photos, etc.
   └─► Generate photo URLs
   
8. Save to cache
   └─► TTL: 24 hours
   
9. Return to frontend
   └─► JSON response with venues array
   
10. VenueSearchPanel renders results
    └─► Map over venues
    └─► Render VenueCard for each
    
11. User sees venue cards with photos
```

### Search Flow (Cached)

```
1. User searches "New York" again (or another user searches same location)
   
2. GET /api/venues/search?location=New York&type=venue&keyword=wedding venues
   
3. Backend receives request
   └─► VenueSearchService.searchVenues()
   
4. Check cache
   └─► Cache key: "venue-new york-venue-wedding venues"
   └─► Cache hit! (cached < 24h ago)
   
5. Return cached results immediately
   └─► Skip Google Places API call
   └─► Return JSON response
   
6. Frontend receives results instantly
   └─► No loading delay
   └─► Render venue cards
   
Result: Instant response, no API cost
```

### Vendor Search Flow

```
1. User clicks "Vendors" tab
   └─► activeTab changes to "vendors"
   
2. User selects vendor type: "Photographer"
   └─► vendorType state updates
   
3. API call triggered
   GET /api/venues/wedding-vendors?location=New York&vendorType=photographer
   
4. Backend receives request
   └─► VenueSearchService.searchWeddingVendors()
   
5. Build specialized query
   └─► Query: "wedding photographer in New York"
   └─► minRating: 4.0 (default for vendors)
   
6. Check cache → Google Places API → Transform → Save → Return
   
7. Frontend renders photographer results
   └─► VenueCards with photographer-specific data
```

## Component Hierarchy

```
ExperienceTemplatePage
  │
  ├─► Tabs
  │    ├─► Venues
  │    ├─► Vendors
  │    ├─► Guest Accommodations
  │    └─► Rehearsal
  │
  └─► Tab Content
       │
       ├─► IF tab in [venues, vendors, guest-accommodations, rehearsal]
       │    │
       │    └─► VenueSearchPanel
       │         │
       │         ├─► Search Controls
       │         │    ├─► Vendor Type Selector (vendors tab only)
       │         │    ├─► Custom Keyword Input
       │         │    ├─► Min Rating Filter
       │         │    └─► Refresh Button
       │         │
       │         └─► Results Grid
       │              │
       │              └─► VenueCard (for each result)
       │                   ├─► Photo
       │                   ├─► Name
       │                   ├─► Rating + Reviews
       │                   ├─► Price Level
       │                   ├─► Address
       │                   ├─► Phone
       │                   ├─► Website Link
       │                   └─► Add to Cart Button
       │
       └─► ELSE (other tabs)
            └─► ServiceBrowser / FlightSearch / etc.
```

## Cache Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                     CACHE STRATEGY                          │
└─────────────────────────────────────────────────────────────┘

Cache Key Format:
  venue-{location}-{type}-{keyword}
  
Examples:
  • venue-new york-venue-wedding venues
  • venue-new york-hotel-
  • venue-los angeles-venue-wedding photographer

TTL: 24 hours

Cache Hit Rate (Expected):
  • First week: 40-50% (building cache)
  • Steady state: 80-90% (popular locations cached)

Benefits:
  ✓ Instant results for popular searches
  ✓ Reduced API costs (stay in free tier)
  ✓ Better user experience
  ✓ Lower server load

Invalidation:
  • Automatic after 24 hours
  • Manual: Delete from serp_cache table
  • Refresh button: Bypasses cache (future)
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING                           │
└─────────────────────────────────────────────────────────────┘

Scenario 1: Missing API Key
  ├─► Backend: Log warning
  ├─► Return: Empty array []
  └─► Frontend: Shows "No venues found" message

Scenario 2: Invalid Location
  ├─► Google API: Returns status "ZERO_RESULTS"
  ├─► Backend: Log warning
  ├─► Return: Empty array []
  └─► Frontend: Shows "No venues found in {location}"

Scenario 3: Network Error
  ├─► API call fails (timeout/network)
  ├─► Backend: Catch error, log, return empty array
  ├─► Frontend: TanStack Query detects error
  └─► Show error alert with retry button

Scenario 4: API Rate Limit
  ├─► Google API: Returns status "OVER_QUERY_LIMIT"
  ├─► Backend: Log error
  ├─► Return: Empty array []
  └─► Frontend: Shows error message

Scenario 5: Photo Load Failure
  ├─► Image onError event
  ├─► VenueCard: Set imageError state
  └─► Display fallback image (generic venue photo)

All errors are handled gracefully - no crashes!
```

## Security Considerations

```
┌─────────────────────────────────────────────────────────────┐
│                        SECURITY                             │
└─────────────────────────────────────────────────────────────┘

API Key Protection:
  ✓ Stored in .env file (never committed)
  ✓ Backend-only (never sent to frontend)
  ✓ Should be restricted to specific APIs in GCP Console
  ✓ Should be restricted to production domain

Input Validation:
  ✓ Location sanitized (URL encoded)
  ✓ Vendor type validated against whitelist
  ✓ Rating validated (0, 3.5, 4.0, 4.5 only)
  ✓ Place ID validated before use

Rate Limiting:
  ✓ Caching reduces API calls by 80-90%
  ✓ Google enforces their own rate limits
  ✓ Frontend: TanStack Query prevents duplicate requests

Data Privacy:
  ✓ No user data sent to Google
  ✓ Only location searches (public data)
  ✓ Venue data is public (from Google Places)
```

## Performance Metrics

```
┌─────────────────────────────────────────────────────────────┐
│                     PERFORMANCE                             │
└─────────────────────────────────────────────────────────────┘

Response Times:
  • Cache hit: <50ms
  • Cache miss: 1-3 seconds (Google API)
  • Photo load: 200-500ms per image

Optimization Techniques:
  ✓ 24-hour cache (Redis via Drizzle ORM)
  ✓ TanStack Query caching (5 min stale time)
  ✓ Lazy image loading
  ✓ Skeleton loading states
  ✓ Results limited to 20 per search

Expected Cache Hit Rates:
  • Week 1: 40-50%
  • Week 2: 60-70%
  • Steady state: 80-90%

Bandwidth:
  • JSON response: ~50KB per search
  • Photos: ~100-200KB per venue (lazy loaded)
  • Total: ~300-400KB per search (first load)
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                  INTEGRATION POINTS                         │
└─────────────────────────────────────────────────────────────┘

1. Cart System
   VenueCard → onAddToCart() → addToCart()
   └─► Venue added as external cart item
   └─► Type: venue/vendor
   └─► Price: 0 (inquiry only)
   └─► Metadata: rating, photos, contact info

2. Experience Template
   VenueSearchPanel receives:
   • template (slug)
   • location (from main form)
   • tabId (current tab)
   └─► Determines what to search

3. Database (via Drizzle ORM)
   VenueSearchService ←→ serpCache table
   └─► Read cached results
   └─► Write new results

4. Logging (Winston)
   VenueSearchService uses logger
   └─► Debug: Cache hits/misses
   └─► Info: Search queries
   └─► Error: API failures
```

---

**Architecture Design:** Phase 1 MVP  
**Last Updated:** February 1, 2025  
**Status:** Implemented & Ready for Testing
