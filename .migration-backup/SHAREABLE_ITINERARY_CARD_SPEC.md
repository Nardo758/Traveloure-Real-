# SHAREABLE ITINERARY CARD SYSTEM
## Complete Implementation Specification

**Version:** 1.0
**Date:** March 24, 2026
**For:** Traveloure Development Team (India + Leon)
**Estimated Effort:** 7-10 days
**Priority:** Launch Blocker
**Status:** Ready to Execute

---

## TABLE OF CONTENTS

1. Overview & Architectural Decision
2. Data Flow
3. Database Schema
4. Transport Leg Calculator (Server-Side Engine)
5. API Endpoints
6. Native Maps Integration (Google Maps + Apple Maps Layer System)
7. KML/GPX Export Engine
8. Frontend Components
9. Shareable Itinerary View Page
10. Expert "Suggest Modifications" Flow
11. Template Tab Removal
12. Destination-Specific Transport Profiles
13. File Reference Map

---

## 1. OVERVIEW & ARCHITECTURAL DECISION

### What We're Building

A rich, shareable itinerary card that:
- Embeds transportation per-leg between every activity (mode, duration, cost)
- Opens as a navigable route layer in Google Maps or Apple Maps
- Lets users control transport preferences before OR during the trip
- Can be shared via link (public, no auth required to view)
- Can be sent to an expert who can suggest modifications
- Replaces the Transportation tab in experience templates

### Why Transportation Moved Out of Templates

The itinerary flow is:

```
User builds cart → Optimizer sequences & clusters →
Output lands in user's account (or routes to expert)
```

Transport between activities CANNOT be calculated until the optimizer finalizes:
- The sequence of activities per day
- The start/end times
- The geographic clustering
- The temporal anchor constraints

Templates collect transport PREFERENCES (budget vs. time-saver, preferred modes).
The actual transport legs are computed server-side AFTER optimization.

### Two Modes of the Card

**PLANNING MODE (before trip):**
- View full itinerary with transport legs inline
- "Open Day in Maps" → loads full day route in Google/Apple Maps
- Adjust transport preferences per leg → server recalculates timing
- "Export Full Trip" → KML/GPX file imports as map layer
- Share with expert for review

**LIVE MODE (during trip):**
- "Navigate to Next Stop" → opens turn-by-turn from current location
- Shows current day's activities with progress indicator
- Transport mode can be changed on-the-fly in native maps app
- Tap any activity → deep link to that specific location in maps

---

## 2. DATA FLOW

```
USER BUILDS CART (with transport preferences in profile)
       │
       ▼
AI OPTIMIZER runs
  - Smart sequencing
  - Geographic clustering
  - Temporal anchor respect
  - Energy budget modeling
       │
       ▼
OPTIMIZER OUTPUT: 4 variant plans
  - Cost Saver
  - Time Saver
  - Popular
  - Local Expert
  Each variant has day-by-day sequenced activities with times + coordinates
       │
       ▼
TRANSPORT LEG CALCULATOR runs on EACH variant (server-side)
  For each sequential activity pair (A → B) in each day:
    1. Calculate distance from A.lat/lng to B.lat/lng (haversine)
    2. Load destination transport profile (Kyoto = train+bike, Mumbai = auto+metro)
    3. Evaluate available modes against distance, user prefs, time of day
    4. Score each mode: time × cost × energy_impact × user_preference_weight
    5. Select recommended mode
    6. Calculate estimated cost for this leg
    7. Store transport_leg record linked to the variant
       │
       ▼
USER VIEWS itinerary-comparison page
  - Each variant card now shows total transport time + cost
  - User selects a variant
       │
       ▼
ITINERARY CARD renders with activities + transport legs inline
  - [Share] → generates UUID token link
  - [Send to Expert] → routes to expert inbox
  - [Open Day in Maps] → deep link to Google/Apple Maps with all stops
  - [Export Full Trip] → downloads KML or GPX file
       │
       ▼
USER OVERRIDES transport mode on a specific leg
  - Client sends PATCH to update that leg's mode
  - Server recalculates duration + cost for that leg
  - Server recalculates downstream activity start times if timing shifted
  - Client re-renders the card with updated data
```

---

## 3. DATABASE SCHEMA

### New Table: `transport_legs`

```typescript
// shared/schema.ts — ADD THIS TABLE

export const transportLegs = pgTable("transport_legs", {
  id: serial("id").primaryKey(),

  // Link to the specific itinerary variant
  variantId: integer("variant_id")
    .notNull()
    .references(() => itineraryVariants.id, { onDelete: "cascade" }),

  // Which day in the itinerary (1-indexed)
  dayNumber: integer("day_number").notNull(),

  // Sequential position within the day (leg 1 = between activity 1→2)
  legOrder: integer("leg_order").notNull(),

  // Origin activity
  fromActivityId: integer("from_activity_id"),
  fromName: text("from_name").notNull(),
  fromLat: doublePrecision("from_lat").notNull(),
  fromLng: doublePrecision("from_lng").notNull(),

  // Destination activity
  toActivityId: integer("to_activity_id"),
  toName: text("to_name").notNull(),
  toLat: doublePrecision("to_lat").notNull(),
  toLng: doublePrecision("to_lng").notNull(),

  // Distance
  distanceMeters: integer("distance_meters").notNull(),
  distanceDisplay: text("distance_display").notNull(), // "1.2 km" or "0.8 mi"

  // Recommended transport
  recommendedMode: text("recommended_mode").notNull(),
  // Values: "walk", "transit", "taxi", "rideshare", "private_driver",
  //         "rental_car", "bike", "train", "tram", "ferry", "auto_rickshaw",
  //         "tuk_tuk", "cable_car"

  // User override (null = using recommendation)
  userSelectedMode: text("user_selected_mode"),

  // Timing
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"), // null = free (walking)

  // Alternative modes evaluated
  alternativeModes: jsonb("alternative_modes").$type<TransportAlternative[]>(),
  // Array of { mode, durationMinutes, costUsd, reason }

  // Energy impact (integrates with energy budget system)
  energyCost: integer("energy_cost").default(0), // 0-20 scale
  // walking in heat = 15, taxi = 2, metro = 5

  // For bookable transport products
  linkedProductId: integer("linked_product_id"), // FK to marketplace product
  linkedProductUrl: text("linked_product_url"),  // Viator/GetYourGuide link

  // Metadata
  calculatedAt: timestamp("calculated_at").defaultNow(),
  destinationProfile: text("destination_profile"), // "kyoto", "mumbai", etc.

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// TypeScript interface for alternativeModes JSONB
interface TransportAlternative {
  mode: string;
  durationMinutes: number;
  costUsd: number | null;
  energyCost: number;
  reason: string; // "Fastest option" | "Cheapest" | "Most scenic"
}
```

### New Table: `shared_itineraries`

```typescript
export const sharedItineraries = pgTable("shared_itineraries", {
  id: serial("id").primaryKey(),

  // The share token (UUID, used in the public URL)
  shareToken: text("share_token").notNull().unique(),

  // Which variant is being shared
  variantId: integer("variant_id")
    .notNull()
    .references(() => itineraryVariants.id, { onDelete: "cascade" }),

  // Who shared it
  sharedByUserId: integer("shared_by_user_id")
    .notNull()
    .references(() => users.id),

  // Optional: sent to a specific expert
  sharedWithUserId: integer("shared_with_user_id")
    .references(() => users.id),

  // Permissions
  permissions: text("permissions").notNull().default("view"),
  // "view" = read-only, "suggest" = can suggest modifications

  // Expert action tracking
  expertStatus: text("expert_status").default("pending"),
  // "pending" | "viewed" | "suggestions_made"

  // Transport preference snapshot (user's prefs at time of share)
  transportPreferences: jsonb("transport_preferences").$type<TransportPrefs>(),

  // Metadata
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  expiresAt: timestamp("expires_at"), // optional expiry

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

interface TransportPrefs {
  defaultMode: string;      // user's preferred default
  avoidModes: string[];     // modes user wants to avoid
  prioritize: "time" | "cost" | "comfort" | "scenic";
  maxWalkMinutes: number;   // threshold before suggesting transit
  accessibility: boolean;   // wheelchair/accessibility needs
}
```

### New Table: `maps_export_cache`

```typescript
export const mapsExportCache = pgTable("maps_export_cache", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id")
    .notNull()
    .references(() => itineraryVariants.id, { onDelete: "cascade" }),

  // Cached export files
  kmlContent: text("kml_content"),     // Full KML XML string
  gpxContent: text("gpx_content"),     // Full GPX XML string
  geoJsonContent: jsonb("geojson_content"), // GeoJSON object

  // Per-day Google Maps URLs (pre-computed)
  googleMapsUrls: jsonb("google_maps_urls").$type<Record<number, string>>(),
  // { 1: "https://www.google.com/maps/dir/...", 2: "https://..." }

  // Per-day Apple Maps URLs (pre-computed)
  appleMapsUrls: jsonb("apple_maps_urls").$type<Record<number, string>>(),
  // { 1: "maps://?saddr=...&daddr=...", 2: "maps://..." }

  // Invalidation
  generatedAt: timestamp("generated_at").defaultNow(),
  transportLegsHash: text("transport_legs_hash"), // hash of leg data, regenerate if changed
});
```

### Migration

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

---

## 4. TRANSPORT LEG CALCULATOR (Server-Side Engine)

### Location: `server/services/transport-leg-calculator.ts`

```typescript
/**
 * TransportLegCalculator
 *
 * Runs server-side after the optimizer produces a variant.
 * Computes recommended transport mode, duration, and cost
 * for each sequential activity pair within each day.
 */

// ============================================================
// INTERFACES
// ============================================================

interface ActivityLocation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  scheduledTime: string; // ISO datetime
  dayNumber: number;
  order: number; // position within the day
}

interface TransportLegResult {
  fromActivity: ActivityLocation;
  toActivity: ActivityLocation;
  dayNumber: number;
  legOrder: number;
  distanceMeters: number;
  distanceDisplay: string;
  recommendedMode: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  alternativeModes: TransportAlternative[];
  energyCost: number;
  linkedProductId?: number;
  linkedProductUrl?: string;
}

interface UserTransportPrefs {
  prioritize: "time" | "cost" | "comfort" | "scenic";
  avoidModes: string[];
  maxWalkMinutes: number;
  accessibility: boolean;
  budgetTier: "budget" | "moderate" | "luxury";
}

interface DestinationTransportProfile {
  destinationSlug: string;
  availableModes: TransportModeConfig[];
  defaultCurrency: string;
  walkabilityScore: number;     // 0-100
  publicTransitQuality: number; // 0-100
  trafficSeverity: number;      // 0-100 (higher = worse traffic)
  cyclingInfrastructure: number; // 0-100
  specialNotes: string[];       // ["Trains stop at midnight", "Monsoon = no bikes"]
}

interface TransportModeConfig {
  mode: string;
  available: boolean;
  baseCostPerKm: number;       // USD
  flagFall: number;            // USD (minimum fare / starting fare)
  averageSpeedKmh: number;
  waitTimeMinutes: number;     // average wait for transit/taxi
  energyCostPerKm: number;     // 0-5 scale per km
  comfortScore: number;        // 0-100
  scenicScore: number;         // 0-100
  accessibilityScore: number;  // 0-100
  availableHours: { start: number; end: number }; // 24h format
  seasonalRestrictions?: string[];
  localName?: string;          // "auto-rickshaw", "tuk-tuk", "tram"
}

// ============================================================
// MAIN CALCULATOR FUNCTION
// ============================================================

export async function calculateTransportLegs(
  variantId: number,
  activities: ActivityLocation[],
  destination: string,
  userPrefs: UserTransportPrefs
): Promise<TransportLegResult[]> {

  // 1. Load destination transport profile
  const profile = getDestinationProfile(destination);

  // 2. Group activities by day
  const dayGroups = groupBy(activities, "dayNumber");

  const allLegs: TransportLegResult[] = [];

  // 3. For each day, compute legs between sequential activities
  for (const [dayNum, dayActivities] of Object.entries(dayGroups)) {
    // Sort by order within day
    const sorted = dayActivities.sort((a, b) => a.order - b.order);

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];

      const leg = computeSingleLeg(from, to, parseInt(dayNum), i + 1, profile, userPrefs);
      allLegs.push(leg);
    }
  }

  // 4. Persist to database
  await persistTransportLegs(variantId, allLegs, destination);

  // 5. Generate and cache maps URLs
  await generateMapsUrls(variantId, allLegs, destination);

  return allLegs;
}

// ============================================================
// SINGLE LEG COMPUTATION
// ============================================================

function computeSingleLeg(
  from: ActivityLocation,
  to: ActivityLocation,
  dayNumber: number,
  legOrder: number,
  profile: DestinationTransportProfile,
  userPrefs: UserTransportPrefs
): TransportLegResult {

  // Calculate straight-line distance (haversine)
  const distanceMeters = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = distanceMeters / 1000;

  // Get time of day for this leg (affects transit availability, traffic)
  const departureHour = new Date(from.scheduledTime).getHours();

  // Evaluate each available mode
  const evaluations: TransportAlternative[] = [];

  for (const modeConfig of profile.availableModes) {
    if (!modeConfig.available) continue;
    if (userPrefs.avoidModes.includes(modeConfig.mode)) continue;

    // Check if mode is available at this time of day
    if (departureHour < modeConfig.availableHours.start ||
        departureHour >= modeConfig.availableHours.end) continue;

    // Check accessibility requirement
    if (userPrefs.accessibility && modeConfig.accessibilityScore < 50) continue;

    // Calculate duration for this mode
    // Real distance ≈ straight-line × 1.3 (Manhattan distance factor)
    const realDistanceKm = distanceKm * 1.3;
    const travelMinutes = (realDistanceKm / modeConfig.averageSpeedKmh) * 60;
    const totalMinutes = Math.ceil(travelMinutes + modeConfig.waitTimeMinutes);

    // Calculate cost
    let costUsd: number | null = null;
    if (modeConfig.baseCostPerKm > 0) {
      costUsd = Math.round((modeConfig.flagFall + (realDistanceKm * modeConfig.baseCostPerKm)) * 100) / 100;
    }

    // Calculate energy cost
    const energyCost = Math.min(20, Math.ceil(realDistanceKm * modeConfig.energyCostPerKm));

    // Score this mode based on user preferences
    const score = scoreModeForUser(
      modeConfig, totalMinutes, costUsd, energyCost, userPrefs
    );

    evaluations.push({
      mode: modeConfig.mode,
      durationMinutes: totalMinutes,
      costUsd,
      energyCost,
      reason: getReasonLabel(modeConfig.mode, totalMinutes, costUsd, evaluations),
      _score: score, // internal, not persisted
    });
  }

  // Sort by score (highest = best match for user preferences)
  evaluations.sort((a, b) => (b as any)._score - (a as any)._score);

  // Best option is the recommendation
  const best = evaluations[0];

  // Check if there's a bookable transport product for this leg
  const linkedProduct = findLinkedTransportProduct(
    best.mode, from, to, profile.destinationSlug
  );

  return {
    fromActivity: from,
    toActivity: to,
    dayNumber,
    legOrder,
    distanceMeters,
    distanceDisplay: formatDistance(distanceMeters),
    recommendedMode: best.mode,
    estimatedDurationMinutes: best.durationMinutes,
    estimatedCostUsd: best.costUsd,
    alternativeModes: evaluations.slice(1).map(e => ({
      mode: e.mode,
      durationMinutes: e.durationMinutes,
      costUsd: e.costUsd,
      energyCost: e.energyCost,
      reason: e.reason,
    })),
    energyCost: best.energyCost,
    linkedProductId: linkedProduct?.id,
    linkedProductUrl: linkedProduct?.url,
  };
}

// ============================================================
// SCORING FUNCTION
// ============================================================

function scoreModeForUser(
  config: TransportModeConfig,
  durationMinutes: number,
  costUsd: number | null,
  energyCost: number,
  prefs: UserTransportPrefs
): number {

  // Base weights by user priority
  const weights = {
    time:    { time: 0.50, cost: 0.15, comfort: 0.20, scenic: 0.05, energy: 0.10 },
    cost:    { time: 0.15, cost: 0.50, comfort: 0.10, scenic: 0.05, energy: 0.20 },
    comfort: { time: 0.15, cost: 0.10, comfort: 0.50, scenic: 0.10, energy: 0.15 },
    scenic:  { time: 0.10, cost: 0.10, comfort: 0.15, scenic: 0.50, energy: 0.15 },
  };

  const w = weights[prefs.prioritize];

  // Normalize scores to 0-100
  const timeScore = Math.max(0, 100 - (durationMinutes * 2)); // penalty per minute
  const costScore = costUsd === null ? 100 : Math.max(0, 100 - (costUsd * 5));
  const comfortScore = config.comfortScore;
  const scenicScore = config.scenicScore;
  const energyScore = Math.max(0, 100 - (energyCost * 5));

  return (
    timeScore * w.time +
    costScore * w.cost +
    comfortScore * w.comfort +
    scenicScore * w.scenic +
    energyScore * w.energy
  );
}

// ============================================================
// HAVERSINE DISTANCE
// ============================================================

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number { return deg * (Math.PI / 180); }

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
```

---

## 5. API ENDPOINTS

### Location: `server/routes.ts` (add these endpoints)

### 5.1 Share Itinerary

```
POST /api/itinerary-variants/:variantId/share
```

**Request body:**
```json
{
  "sharedWithUserId": 42,          // optional: expert ID
  "permissions": "suggest",         // "view" | "suggest"
  "transportPreferences": {         // snapshot of user's prefs
    "defaultMode": "transit",
    "avoidModes": ["rental_car"],
    "prioritize": "time",
    "maxWalkMinutes": 15,
    "accessibility": false
  }
}
```

**Response:**
```json
{
  "shareToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "shareUrl": "https://traveloure.com/itinerary-view/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresAt": null
}
```

**Logic:**
1. Verify user owns this variant
2. Generate UUID v4 share token
3. Create shared_itineraries record
4. If sharedWithUserId provided, create notification for that expert
5. Return share URL

### 5.2 Get Shared Itinerary (PUBLIC — no auth required)

```
GET /api/itinerary-share/:token
```

**Response:**
```json
{
  "variant": {
    "id": 1,
    "planType": "time_saver",
    "destination": "Kyoto",
    "country": "Japan",
    "region": "Kansai",
    "dateRange": { "start": "2026-04-01", "end": "2026-04-07" },
    "totalCost": 2450.00,
    "traveloureScore": 92,
    "vibeTags": ["Cultural", "Foodie", "Scenic"],
    "coverImageUrl": "https://...",
    "days": [
      {
        "dayNumber": 1,
        "date": "2026-04-01",
        "title": "Arrival & Eastern Kyoto",
        "activities": [
          {
            "id": 101,
            "name": "Fushimi Inari Shrine",
            "startTime": "09:00",
            "endTime": "11:00",
            "lat": 34.9671,
            "lng": 135.7727,
            "category": "Cultural",
            "cost": 0,
            "imageUrl": "https://..."
          },
          {
            "id": 102,
            "name": "Nishiki Market Food Tour",
            "startTime": "11:45",
            "endTime": "13:30",
            "lat": 35.0050,
            "lng": 135.7650,
            "category": "Food",
            "cost": 65,
            "imageUrl": "https://..."
          }
        ],
        "transportLegs": [
          {
            "legOrder": 1,
            "fromName": "Fushimi Inari Shrine",
            "toName": "Nishiki Market Food Tour",
            "recommendedMode": "train",
            "userSelectedMode": null,
            "distanceDisplay": "4.2 km",
            "estimatedDurationMinutes": 18,
            "estimatedCostUsd": 2.50,
            "energyCost": 3,
            "alternativeModes": [
              { "mode": "taxi", "durationMinutes": 12, "costUsd": 15.00, "energyCost": 1, "reason": "Fastest" },
              { "mode": "bike", "durationMinutes": 20, "costUsd": 3.00, "energyCost": 8, "reason": "Most scenic" },
              { "mode": "bus", "durationMinutes": 25, "costUsd": 1.50, "energyCost": 3, "reason": "Cheapest" }
            ],
            "linkedProductUrl": null
          }
        ]
      }
    ]
  },
  "mapsLinks": {
    "googleMapsPerDay": {
      "1": "https://www.google.com/maps/dir/34.9671,135.7727/35.0050,135.7650/35.0094,135.7681/?travelmode=transit",
      "2": "https://www.google.com/maps/dir/..."
    },
    "appleMapsPerDay": {
      "1": "maps://?saddr=34.9671,135.7727&daddr=35.0050,135.7650+to:35.0094,135.7681&dirflg=r",
      "2": "maps://..."
    },
    "kmlDownloadUrl": "/api/itinerary-share/:token/export/kml",
    "gpxDownloadUrl": "/api/itinerary-share/:token/export/gpx"
  },
  "sharedBy": {
    "name": "Leon",
    "avatarUrl": "https://..."
  },
  "permissions": "view",
  "transportPreferences": { ... }
}
```

### 5.3 Override Transport Mode

```
PATCH /api/transport-legs/:legId/mode
```

**Request body:**
```json
{
  "selectedMode": "taxi"
}
```

**Response:**
```json
{
  "updatedLeg": {
    "id": 55,
    "userSelectedMode": "taxi",
    "estimatedDurationMinutes": 12,
    "estimatedCostUsd": 15.00,
    "energyCost": 1
  },
  "downstreamImpact": {
    "nextActivityStartTimeShift": -6,
    "message": "Switching to taxi saves 6 minutes. Next activity can start earlier."
  },
  "updatedMapsUrls": {
    "googleMaps": "https://www.google.com/maps/dir/...",
    "appleMaps": "maps://..."
  }
}
```

**Logic:**
1. Look up the leg and its alternative modes
2. Set `userSelectedMode` to the requested mode
3. Update duration/cost from the alternatives array
4. Recalculate downstream activity start times if duration changed
5. Regenerate maps URLs for that day
6. Return updated data + downstream impact message

### 5.4 Export KML

```
GET /api/itinerary-share/:token/export/kml
```

Returns `Content-Type: application/vnd.google-earth.kml+xml` with a downloadable KML file.

### 5.5 Export GPX

```
GET /api/itinerary-share/:token/export/gpx
```

Returns `Content-Type: application/gpx+xml` with a downloadable GPX file.

### 5.6 Navigate to Next Stop (Live Mode)

```
GET /api/itinerary-share/:token/navigate/:dayNumber/:legOrder
```

**Query params:** `?platform=google|apple&currentLat=...&currentLng=...`

**Response:** Redirects to the appropriate maps deep link URL.

If `currentLat/currentLng` provided, uses current location as origin instead of the leg's `from` coordinates.

For Google: `https://www.google.com/maps/dir/?api=1&origin=CURRENT_LAT,CURRENT_LNG&destination=TO_LAT,TO_LNG&travelmode=MODE`

For Apple: `maps://?saddr=CURRENT_LAT,CURRENT_LNG&daddr=TO_LAT,TO_LNG&dirflg=MODE_FLAG`

---

## 6. NATIVE MAPS INTEGRATION

### 6.1 Google Maps URL Builder

```typescript
// server/services/maps-url-builder.ts

/**
 * Google Maps Directions URL
 * Supports up to 10 waypoints (stops) — perfect for a single day
 * https://developers.google.com/maps/documentation/urls/get-started
 */

const GOOGLE_TRAVEL_MODES: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  train: "transit",
  tram: "transit",
  bus: "transit",
  taxi: "driving",
  rideshare: "driving",
  private_driver: "driving",
  rental_car: "driving",
  bike: "bicycling",
  ferry: "transit",
  auto_rickshaw: "driving",
  tuk_tuk: "driving",
  cable_car: "walking", // fallback
};

export function buildGoogleMapsUrl(
  activities: ActivityLocation[],
  dominantMode: string // most common mode for the day
): string {
  if (activities.length < 2) return "";

  const origin = `${activities[0].lat},${activities[0].lng}`;
  const destination = `${activities[activities.length - 1].lat},${activities[activities.length - 1].lng}`;

  // Waypoints are everything in between (max 8 to stay under 10 total)
  const waypoints = activities.slice(1, -1).map(a => `${a.lat},${a.lng}`);

  const travelMode = GOOGLE_TRAVEL_MODES[dominantMode] || "transit";

  let url = `https://www.google.com/maps/dir/?api=1`;
  url += `&origin=${origin}`;
  url += `&destination=${destination}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.join("|")}`;
  }
  url += `&travelmode=${travelMode}`;

  return url;
}

/**
 * Single-leg navigation URL (for "Navigate to Next Stop")
 */
export function buildGoogleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const travelMode = GOOGLE_TRAVEL_MODES[mode] || "transit";
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=${travelMode}`;
}

/**
 * Single location deep link (tap activity → open in maps)
 */
export function buildGooglePlaceUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=&center=${lat},${lng}`;
}
```

### 6.2 Apple Maps URL Builder

```typescript
/**
 * Apple Maps URL scheme
 * https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 *
 * dirflg values:
 * d = driving, w = walking, r = transit, c = cycling (iOS 16+)
 */

const APPLE_TRAVEL_FLAGS: Record<string, string> = {
  walk: "w",
  transit: "r",
  train: "r",
  tram: "r",
  bus: "r",
  taxi: "d",
  rideshare: "d",
  private_driver: "d",
  rental_car: "d",
  bike: "c",        // iOS 16+ cycling directions
  ferry: "r",
  auto_rickshaw: "d",
  tuk_tuk: "d",
  cable_car: "w",
};

export function buildAppleMapsUrl(
  activities: ActivityLocation[],
  dominantMode: string
): string {
  if (activities.length < 2) return "";

  const flag = APPLE_TRAVEL_FLAGS[dominantMode] || "r";

  // Apple Maps supports multi-stop via sequential daddr values
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);

  // For multi-stop, Apple Maps uses the format:
  // maps://?saddr=ORIGIN&daddr=STOP1+to:STOP2+to:STOP3&dirflg=r
  let url = `maps://?saddr=${origin}&daddr=${stops.join("+to:")}&dirflg=${flag}`;

  return url;
}

/**
 * Apple Maps also supports HTTPS links for cross-platform:
 * https://maps.apple.com/?saddr=...&daddr=...&dirflg=...
 * This works on non-Apple devices too (opens in browser)
 */
export function buildAppleMapsWebUrl(
  activities: ActivityLocation[],
  dominantMode: string
): string {
  if (activities.length < 2) return "";

  const flag = APPLE_TRAVEL_FLAGS[dominantMode] || "r";
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);

  return `https://maps.apple.com/?saddr=${origin}&daddr=${stops.join("+to:")}&dirflg=${flag}`;
}

export function buildAppleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const flag = APPLE_TRAVEL_FLAGS[mode] || "r";
  return `maps://?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}&dirflg=${flag}`;
}
```

### 6.3 Platform Detection (Client-Side)

```typescript
// client/src/lib/maps-platform.ts

export function detectMapsPlatform(): "apple" | "google" {
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return isApple ? "apple" : "google";
}

export function openInMaps(url: string, platform: "apple" | "google") {
  // On mobile, this opens the native maps app
  // On desktop, opens in browser
  window.open(url, "_blank");
}

/**
 * Smart open: detects platform, uses the right URL
 */
export function openDayInMaps(
  googleUrl: string,
  appleUrl: string
) {
  const platform = detectMapsPlatform();
  const url = platform === "apple" ? appleUrl : googleUrl;
  openInMaps(url, platform);
}
```

---

## 7. KML/GPX EXPORT ENGINE

### 7.1 KML Generator (for Google My Maps "layer" import)

```typescript
// server/services/kml-generator.ts

interface KmlInput {
  tripName: string;
  destination: string;
  days: {
    dayNumber: number;
    date: string;
    activities: ActivityLocation[];
    transportLegs: TransportLegResult[];
  }[];
}

export function generateKml(input: KmlInput): string {
  const placemarks = [];
  const routes = [];

  for (const day of input.days) {
    // Add activity pins for this day
    for (const activity of day.activities) {
      placemarks.push(`
        <Placemark>
          <name>Day ${day.dayNumber}: ${activity.name}</name>
          <description><![CDATA[
            <b>${activity.name}</b><br/>
            Day ${day.dayNumber} - ${day.date}<br/>
            Time: ${activity.scheduledTime}<br/>
          ]]></description>
          <styleUrl>#day${day.dayNumber}Pin</styleUrl>
          <Point>
            <coordinates>${activity.lng},${activity.lat},0</coordinates>
          </Point>
        </Placemark>
      `);
    }

    // Add route lines between activities
    if (day.activities.length >= 2) {
      const coords = day.activities
        .map(a => `${a.lng},${a.lat},0`)
        .join("\n              ");

      routes.push(`
        <Placemark>
          <name>Day ${day.dayNumber} Route</name>
          <description>Day ${day.dayNumber} - ${day.date}</description>
          <styleUrl>#day${day.dayNumber}Route</styleUrl>
          <LineString>
            <tessellate>1</tessellate>
            <coordinates>
              ${coords}
            </coordinates>
          </LineString>
        </Placemark>
      `);
    }
  }

  // Color palette for days (up to 14 days)
  const dayColors = [
    "ff4444ff", // Day 1: Red
    "ff44aaff", // Day 2: Orange
    "ff44ffff", // Day 3: Yellow
    "ff44ff44", // Day 4: Green
    "ffff4444", // Day 5: Blue
    "ffff44aa", // Day 6: Purple
    "ffaa44ff", // Day 7: Pink
    "ff88ccff", // Day 8+
    "ffccff88", "ffff88cc", "ff88ffcc", "ffcc88ff", "ffffcc88", "ff88cccc"
  ];

  const styles = input.days.map((day, i) => `
    <Style id="day${day.dayNumber}Pin">
      <IconStyle>
        <color>${dayColors[i % dayColors.length]}</color>
        <scale>1.2</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/${day.dayNumber}.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="day${day.dayNumber}Route">
      <LineStyle>
        <color>${dayColors[i % dayColors.length]}</color>
        <width>4</width>
      </LineStyle>
    </Style>
  `).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${input.tripName} - ${input.destination}</name>
    <description>Traveloure Itinerary - Generated ${new Date().toISOString().split("T")[0]}</description>

    ${styles}

    ${input.days.map(day => `
    <Folder>
      <name>Day ${day.dayNumber} - ${day.date}</name>
      ${placemarks.filter(p => p.includes(`Day ${day.dayNumber}:`)).join("")}
      ${routes.filter(r => r.includes(`Day ${day.dayNumber} Route`)).join("")}
    </Folder>
    `).join("")}

  </Document>
</kml>`;
}
```

### 7.2 GPX Generator (for Apple Maps / GPS apps)

```typescript
// server/services/gpx-generator.ts

export function generateGpx(input: KmlInput): string {
  const waypoints = [];
  const tracks = [];

  for (const day of input.days) {
    for (const activity of day.activities) {
      waypoints.push(`
    <wpt lat="${activity.lat}" lon="${activity.lng}">
      <name>Day ${day.dayNumber}: ${activity.name}</name>
      <desc>Day ${day.dayNumber} - ${day.date} - ${activity.scheduledTime}</desc>
      <type>Activity</type>
    </wpt>`);
    }

    // Track for the day's route
    if (day.activities.length >= 2) {
      const trackpoints = day.activities
        .map(a => `        <trkpt lat="${a.lat}" lon="${a.lng}"><name>${a.name}</name></trkpt>`)
        .join("\n");

      tracks.push(`
    <trk>
      <name>Day ${day.dayNumber} - ${day.date}</name>
      <trkseg>
${trackpoints}
      </trkseg>
    </trk>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Traveloure"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${input.tripName} - ${input.destination}</name>
    <desc>Traveloure Itinerary</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints.join("")}
${tracks.join("")}
</gpx>`;
}
```

---

## 8. FRONTEND COMPONENTS

### 8.1 TransportLeg Component (inline between activities)

**Location:** `client/src/components/itinerary/TransportLeg.tsx`

```
┌─────────────────────────────────────────────────────────┐
│  ┆                                                       │
│  ┆  🚃 Train • 18 min • $2.50 • 4.2 km                 │
│  ┆  [Walk 🚶] [Taxi 🚕] [Bike 🚲]  ← tap to switch    │
│  ┆                                                       │
│  ┆  📍 Open in Maps                                      │
│  ┆                                                       │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Shows recommended mode icon + name, duration, cost, distance
- Alternative mode chips: tap to switch → PATCH /api/transport-legs/:id/mode
- "Open in Maps" → opens THIS specific leg in Google/Apple Maps (platform-detected)
- Dotted vertical line on left connects to activity cards above/below

### 8.2 DayMapsButton Component

**Location:** `client/src/components/itinerary/DayMapsButton.tsx`

```
┌──────────────────────────────────────┐
│  🗺️ Open Day 1 in Maps              │
│  [Google Maps]  [Apple Maps]         │
└──────────────────────────────────────┘
```

**Behavior:**
- Appears at the top of each day section in the itinerary card
- Loads ALL that day's activities as waypoints into the selected maps app
- User can then change transport mode within the native maps app
- On mobile: opens native app directly
- On desktop: opens in browser tab

### 8.3 TripExportButton Component

**Location:** `client/src/components/itinerary/TripExportButton.tsx`

```
┌──────────────────────────────────────┐
│  📥 Export Full Trip                  │
│  [Google Maps Layer (KML)]           │
│  [Apple Maps / GPS (GPX)]            │
│  [GeoJSON]                           │
└──────────────────────────────────────┘
```

**Behavior:**
- Downloads the selected file format
- KML → user imports into Google My Maps (maps.google.com/mymaps) as a layer
- GPX → user imports into Apple Maps, Gaia GPS, or any GPS app
- GeoJSON → for developer/API use
- Instructions tooltip: "Open Google My Maps → Import → Select this KML file"

### 8.4 NavigateNextButton Component (Live Mode)

**Location:** `client/src/components/itinerary/NavigateNextButton.tsx`

```
┌──────────────────────────────────────┐
│  ▶ Navigate to Nishiki Market        │
│  🚃 Train • 18 min                   │
│  [Start Navigation]                   │
└──────────────────────────────────────┘
```

**Behavior:**
- Shows on the currently active or next upcoming activity
- Uses browser geolocation API to get current position
- Opens turn-by-turn navigation from CURRENT LOCATION → next activity
- Detects platform (Apple/Google) automatically
- Falls back to letting user choose if detection fails

### 8.5 ItineraryCard Component (the main card)

**Location:** `client/src/components/itinerary/ItineraryCard.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Full-bleed destination image with gradient overlay]          │
│                                                               │
│  KYOTO, JAPAN                                                │
│  Kansai Region                                                │
│                                                               │
│  [Cultural] [Foodie] [Scenic]          Traveloure Score: 92  │
│  $2,450 total • 7 days                                        │
│                                                               │
│  [Share 🔗] [Send to Expert 👤] [Export to Maps 🗺️]         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  📅 DAY 1 — April 1 — Arrival & Eastern Kyoto               │
│  [Open Day in Maps 🗺️]                                       │
│                                                               │
│  ┌─ 09:00 ──────────────────────────────────────────────┐    │
│  │ ⛩️ Fushimi Inari Shrine                               │    │
│  │ 2 hours • Free • Cultural                              │    │
│  │ [📍 Open in Maps]                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│     ┆ 🚃 Train • 18 min • $2.50 • 4.2 km                    │
│     ┆ [Walk] [Taxi] [Bike]  📍 Open leg in Maps             │
│                                                               │
│  ┌─ 11:45 ──────────────────────────────────────────────┐    │
│  │ 🍜 Nishiki Market Food Tour                           │    │
│  │ 1.75 hours • $65 • Food                                │    │
│  │ [📍 Open in Maps]                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│     ┆ 🚶 Walk • 12 min • Free • 0.8 km                      │
│     ┆ [Train] [Taxi] [Bike]  📍 Open leg in Maps            │
│                                                               │
│  ┌─ 14:00 ──────────────────────────────────────────────┐    │
│  │ 🏯 Nijo Castle                                         │    │
│  │ 1.5 hours • $12 • Cultural                             │    │
│  │ [📍 Open in Maps]                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Day 1 Transport: 3 legs • 42 min total • $5.00 total        │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│  📅 DAY 2 — April 2 — Western Kyoto & Bamboo                │
│  [Open Day in Maps 🗺️]                                       │
│  ...                                                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  TRIP TRANSPORT SUMMARY                                       │
│  Total transport time: 4.2 hours across 7 days               │
│  Total transport cost: $47.50                                 │
│  Primary mode: Train (65%) • Walking (25%) • Taxi (10%)      │
│                                                               │
│  📥 Export Full Trip to Maps                                  │
│  [Google Maps Layer (KML)] [Apple Maps / GPS (GPX)]          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. SHAREABLE ITINERARY VIEW PAGE

### Location: `client/src/pages/itinerary-view.tsx`

**Route:** `/itinerary-view/:token`

**Register in App.tsx:**
```typescript
<Route path="/itinerary-view/:token" component={ItineraryViewPage} />
```

**Behavior:**
- PUBLIC page — no auth required
- Fetches data via `GET /api/itinerary-share/:token`
- Renders the full `<ItineraryCard>` component
- Top banner shows who shared it
- If viewer is the assigned expert: shows "Suggest Modifications" CTA
- If viewer is the owner: shows full edit controls (transport mode overrides)
- If viewer is anyone else: read-only view with maps links active
- Increments viewCount on load

**Head/meta tags for social sharing:**
```html
<meta property="og:title" content="Kyoto 7-Day Itinerary • Traveloure" />
<meta property="og:description" content="Cultural • Foodie • Scenic — $2,450 — Score: 92" />
<meta property="og:image" content="[destination cover image]" />
```

---

## 10. EXPERT "SUGGEST MODIFICATIONS" FLOW

When an expert receives a shared itinerary:

1. Expert sees notification in their dashboard inbox
2. Opens the itinerary card via the share link (with `permissions: "suggest"`)
3. Expert can:
   - Add comment annotations to specific activities
   - Suggest swapping an activity for a different one
   - Suggest changing a transport mode for a specific leg
   - Add a "missing" activity they recommend
4. Expert clicks "Submit Suggestions"
5. Creates a `suggestions` record linked to the shared_itinerary
6. User (traveler) gets notification: "Your expert has suggestions for your Kyoto itinerary"
7. User reviews suggestions and accepts/rejects each one
8. Accepted transport mode changes → trigger leg recalculation
9. Accepted activity changes → trigger full re-optimization of transport for affected day

**Note:** Full implementation of the suggestions data model is a separate task. For launch, the MVP is: expert can view the card and message the user via existing chat with specific feedback. The "structured suggestions" UI is Phase 2.

---

## 11. TEMPLATE TAB REMOVAL

### File: `client/src/pages/experience-template.tsx`

Remove the "transportation" entry from `experienceConfigs` for ALL templates:

```typescript
// BEFORE
const experienceConfigs = {
  travel: {
    tabs: ["overview", "activities", "transportation", "accommodation", ...],
    ...
  },
  wedding: { ... },
  // etc.
};

// AFTER
const experienceConfigs = {
  travel: {
    tabs: ["overview", "activities", "accommodation", ...],
    // "transportation" REMOVED — now handled in ItineraryCard post-optimization
    ...
  },
  wedding: { ... },
  // etc.
};
```

**Safety check:** Search the codebase for any references to the transportation tab ID:
```bash
grep -r "transportation" client/src/ --include="*.tsx" --include="*.ts"
```

Ensure no conditional rendering logic breaks when the tab is absent.

Transport PREFERENCES (not the tab) remain in the user's profile settings:
- Preferred default mode
- Modes to avoid
- Priority (time/cost/comfort/scenic)
- Max walk time threshold
- Accessibility needs

These preferences are read by the Transport Leg Calculator when it runs post-optimization.

---

## 12. DESTINATION-SPECIFIC TRANSPORT PROFILES

### Location: `server/data/transport-profiles.ts`

Each of your 8 launch markets needs a profile defining what transport modes exist, their costs, speeds, and characteristics.

```typescript
export const TRANSPORT_PROFILES: Record<string, DestinationTransportProfile> = {

  kyoto: {
    destinationSlug: "kyoto",
    defaultCurrency: "USD",
    walkabilityScore: 75,
    publicTransitQuality: 90,
    trafficSeverity: 30,
    cyclingInfrastructure: 85,
    specialNotes: [
      "Trains are extremely punctual",
      "Last trains around 23:30",
      "Cycling is a popular local transport mode",
      "Bus system covers areas trains don't",
      "Taxis are expensive but very safe"
    ],
    availableModes: [
      {
        mode: "walk",
        available: true,
        baseCostPerKm: 0, flagFall: 0,
        averageSpeedKmh: 4.5, waitTimeMinutes: 0,
        energyCostPerKm: 3, comfortScore: 60, scenicScore: 90,
        accessibilityScore: 40,
        availableHours: { start: 0, end: 24 },
      },
      {
        mode: "train",
        available: true,
        baseCostPerKm: 0.60, flagFall: 1.50,
        averageSpeedKmh: 35, waitTimeMinutes: 5,
        energyCostPerKm: 0.5, comfortScore: 85, scenicScore: 50,
        accessibilityScore: 80,
        availableHours: { start: 5, end: 24 },
        localName: "JR / Hankyu / Keihan"
      },
      {
        mode: "bus",
        available: true,
        baseCostPerKm: 0, flagFall: 2.00, // flat fare
        averageSpeedKmh: 15, waitTimeMinutes: 10,
        energyCostPerKm: 0.5, comfortScore: 60, scenicScore: 70,
        accessibilityScore: 70,
        availableHours: { start: 6, end: 22 },
      },
      {
        mode: "bike",
        available: true,
        baseCostPerKm: 0.30, flagFall: 1.00, // rental base
        averageSpeedKmh: 12, waitTimeMinutes: 3,
        energyCostPerKm: 2, comfortScore: 70, scenicScore: 95,
        accessibilityScore: 10,
        availableHours: { start: 6, end: 22 },
        localName: "Rental bicycle / Pippa Cycle"
      },
      {
        mode: "taxi",
        available: true,
        baseCostPerKm: 3.50, flagFall: 6.00,
        averageSpeedKmh: 25, waitTimeMinutes: 5,
        energyCostPerKm: 0.2, comfortScore: 95, scenicScore: 40,
        accessibilityScore: 60,
        availableHours: { start: 0, end: 24 },
      },
      {
        mode: "rental_car",
        available: true,
        baseCostPerKm: 1.20, flagFall: 35.00, // daily rate amortized
        averageSpeedKmh: 20, waitTimeMinutes: 0,
        energyCostPerKm: 0.3, comfortScore: 80, scenicScore: 60,
        accessibilityScore: 70,
        availableHours: { start: 0, end: 24 },
        specialNotes: ["Parking in Kyoto is expensive and limited"],
      },
    ],
  },

  mumbai: {
    destinationSlug: "mumbai",
    defaultCurrency: "USD",
    walkabilityScore: 40,
    publicTransitQuality: 60,
    trafficSeverity: 95,
    cyclingInfrastructure: 10,
    specialNotes: [
      "Traffic is extreme — always prefer trains over taxis during rush hour",
      "Auto-rickshaws are the fastest short-distance option",
      "Mumbai local trains are fast but extremely crowded during peak hours",
      "AC taxis and Uber/Ola are comfortable but slow in traffic",
      "Walking can be challenging due to sidewalk conditions"
    ],
    availableModes: [
      {
        mode: "walk",
        available: true,
        baseCostPerKm: 0, flagFall: 0,
        averageSpeedKmh: 3.5, waitTimeMinutes: 0,
        energyCostPerKm: 4, comfortScore: 30, scenicScore: 60,
        accessibilityScore: 20,
        availableHours: { start: 6, end: 22 },
      },
      {
        mode: "train",
        available: true,
        baseCostPerKm: 0.05, flagFall: 0.10,
        averageSpeedKmh: 30, waitTimeMinutes: 8,
        energyCostPerKm: 1, comfortScore: 30, scenicScore: 40,
        accessibilityScore: 20,
        availableHours: { start: 4, end: 1 }, // nearly 24h
        localName: "Mumbai Local"
      },
      {
        mode: "auto_rickshaw",
        available: true,
        baseCostPerKm: 0.20, flagFall: 0.30,
        averageSpeedKmh: 18, waitTimeMinutes: 3,
        energyCostPerKm: 1, comfortScore: 50, scenicScore: 75,
        accessibilityScore: 15,
        availableHours: { start: 6, end: 24 },
        localName: "Auto-rickshaw"
      },
      {
        mode: "taxi",
        available: true,
        baseCostPerKm: 0.40, flagFall: 1.50,
        averageSpeedKmh: 12, waitTimeMinutes: 5,
        energyCostPerKm: 0.3, comfortScore: 75, scenicScore: 50,
        accessibilityScore: 50,
        availableHours: { start: 0, end: 24 },
        localName: "Kaali-Peeli / Uber / Ola"
      },
      {
        mode: "rideshare",
        available: true,
        baseCostPerKm: 0.30, flagFall: 1.00,
        averageSpeedKmh: 12, waitTimeMinutes: 7,
        energyCostPerKm: 0.3, comfortScore: 80, scenicScore: 50,
        accessibilityScore: 50,
        availableHours: { start: 0, end: 24 },
        localName: "Uber / Ola (AC)"
      },
      {
        mode: "ferry",
        available: true,
        baseCostPerKm: 0.15, flagFall: 0.50,
        averageSpeedKmh: 20, waitTimeMinutes: 15,
        energyCostPerKm: 0.5, comfortScore: 70, scenicScore: 95,
        accessibilityScore: 30,
        availableHours: { start: 6, end: 20 },
        localName: "Mumbai Ferry"
      },
    ],
  },

  // TODO: Complete profiles for remaining 6 launch markets:
  // bogota, goa, edinburgh, cartagena, jaipur, porto
  // Follow the same pattern — research local transport modes,
  // typical costs, and availability hours for each.
};
```

---

## 13. FILE REFERENCE MAP

### Files to CREATE:
```
server/services/transport-leg-calculator.ts  — Section 4
server/services/maps-url-builder.ts          — Section 6
server/services/kml-generator.ts             — Section 7.1
server/services/gpx-generator.ts             — Section 7.2
server/data/transport-profiles.ts            — Section 12
client/src/components/itinerary/TransportLeg.tsx      — Section 8.1
client/src/components/itinerary/DayMapsButton.tsx     — Section 8.2
client/src/components/itinerary/TripExportButton.tsx  — Section 8.3
client/src/components/itinerary/NavigateNextButton.tsx — Section 8.4
client/src/components/itinerary/ItineraryCard.tsx     — Section 8.5
client/src/pages/itinerary-view.tsx                   — Section 9
client/src/lib/maps-platform.ts                       — Section 6.3
```

### Files to MODIFY:
```
shared/schema.ts                              — Section 3 (add tables)
server/routes.ts                              — Section 5 (add endpoints)
server/itinerary-optimizer.ts                 — Hook transport calculator after optimization
server/services/smart-sequencing.service.ts   — Ensure output includes lat/lng per activity
client/src/pages/itinerary-comparison.tsx      — Add Share + Send to Expert buttons
client/src/components/ItineraryComparisonWithBooking.tsx — Wire up share actions
client/src/pages/experience-template.tsx       — Section 11 (remove transportation tab)
client/src/App.tsx                             — Register /itinerary-view/:token route
```

### Files to DELETE:
```
(Any standalone transportation tab component that existed in experience templates)
```

---

## IMPLEMENTATION ORDER

**Day 1-2: Foundation**
1. Add database tables (schema.ts + migration)
2. Create transport profiles for Kyoto + Mumbai (can stub others)
3. Build Transport Leg Calculator service

**Day 3-4: APIs + Maps Engine**
4. Build maps URL builder (Google + Apple)
5. Build KML/GPX generators
6. Add all API endpoints to routes.ts
7. Hook calculator into optimizer output

**Day 5-6: Frontend**
8. Build TransportLeg component
9. Build ItineraryCard component
10. Build DayMapsButton + TripExportButton + NavigateNextButton
11. Build itinerary-view.tsx page

**Day 7: Integration**
12. Add Share + Send to Expert to itinerary-comparison page
13. Remove Transportation tab from templates
14. Register new route in App.tsx
15. End-to-end testing

**Day 8-10: Polish + Remaining Markets**
16. Complete transport profiles for all 8 launch markets
17. Mobile responsiveness testing
18. Maps deep link testing on iOS + Android
19. Edge cases (single activity days, no coordinates, etc.)
