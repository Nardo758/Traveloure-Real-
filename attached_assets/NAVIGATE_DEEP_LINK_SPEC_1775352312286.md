# Navigate Deep-Link URL Builder — Implementation Spec

## Purpose

Utility module that constructs platform-aware deep links for native maps apps. Used by two touch points in the PlanCard on-trip view:

1. **Navigate FAB** — opens turn-by-turn directions to the "Up Next" activity
2. **Transport connector "Open in Maps"** — opens directions for a specific leg between two activities, using the selected transit mode

Both must detect the user's platform, respect their maps app preference, and pass the correct travel mode.

---

## 1. Platform Detection

Detection runs once on app load and caches the result. The logic cascades:

```
if (navigator.userAgent includes "iPhone" OR "iPad" OR "iPod")
  → platform = "ios"
else if (navigator.userAgent includes "Android")
  → platform = "android"
else
  → platform = "desktop"
```

On iOS, the default maps app is Apple Maps. On Android and desktop, the default is Google Maps. Users can override this via a maps preference setting stored in localStorage:

```
Key: "traveloure_maps_pref"
Values: "apple" | "google" | "waze" | "auto" (default)
```

When set to `"auto"`:
- iOS → Apple Maps
- Android / Desktop → Google Maps

---

## 2. URL Schemes by App

### 2a. Google Maps

Works on all platforms. On iOS/Android opens the native Google Maps app if installed, falls back to browser.

**Single destination (Navigate FAB):**
```
https://www.google.com/maps/dir/?api=1
  &destination={lat},{lng}
  &destination_place_id={google_place_id}   // optional, improves accuracy
  &travelmode={mode}
```

**Multi-stop full day route (Open Full Day):**
```
https://www.google.com/maps/dir/?api=1
  &origin={origin_lat},{origin_lng}
  &destination={final_lat},{final_lng}
  &waypoints={wp1_lat},{wp1_lng}|{wp2_lat},{wp2_lng}|...
  &travelmode={mode}
```

Google Maps `travelmode` values:
| Traveloure mode | Google param |
|-----------------|--------------|
| walk            | `walking`    |
| taxi / car      | `driving`    |
| bus / transit   | `transit`    |
| bicycle         | `bicycling`  |

**Leg-specific directions (Transport connector):**
```
https://www.google.com/maps/dir/?api=1
  &origin={from_lat},{from_lng}
  &destination={to_lat},{to_lng}
  &travelmode={mode}
```

**Notes:**
- Maximum 9 waypoints in multi-stop URLs
- `destination_place_id` is a Google Place ID — if we have it from the activity record, include it for pin accuracy
- On Android, to force the native app: `intent://...#Intent;scheme=google.navigation;...` — but the HTTPS URL already handles this via Chrome intent routing, so the standard URL is preferred

### 2b. Apple Maps

iOS and macOS only. Opens natively on iOS, opens maps.apple.com in browser on other platforms.

**Single destination:**
```
https://maps.apple.com/?daddr={lat},{lng}
  &dirflg={mode}
  &t=m
```

**Multi-stop route:**
Apple Maps does NOT support waypoints via URL scheme. For full-day routes on iOS, fall back to Google Maps URL or show a "not supported" message with option to open each leg individually.

**Leg-specific directions:**
```
https://maps.apple.com/?saddr={from_lat},{from_lng}
  &daddr={to_lat},{to_lng}
  &dirflg={mode}
  &t=m
```

Apple Maps `dirflg` values:
| Traveloure mode | Apple param |
|-----------------|-------------|
| walk            | `w`         |
| taxi / car      | `d`         |
| bus / transit   | `r`         |
| bicycle         | (not supported — fall back to `w`) |

**Notes:**
- `&t=m` sets standard map view (vs satellite)
- Apple Maps doesn't support bicycle routing — show walking as fallback with a note

### 2c. Waze

Driving-only app. Only offered as an option when the selected transit mode is taxi/car/driving.

**Single destination:**
```
https://waze.com/ul?ll={lat},{lng}&navigate=yes
```

**Leg-specific directions:**
```
https://waze.com/ul?ll={to_lat},{to_lng}&navigate=yes
```

**Notes:**
- Waze doesn't support origin specification — it always routes from current location
- Waze doesn't support walking, transit, or bicycle — only show Waze option for driving/taxi modes
- No multi-stop support

---

## 3. Transit Mode Mapping

Each transport leg in the itinerary has a `mode` field set during optimization/expert review. Map these to URL params:

```typescript
type TraveloureMode = 
  | 'walk' 
  | 'taxi' 
  | 'private_car' 
  | 'bus' 
  | 'metro' 
  | 'train' 
  | 'bicycle' 
  | 'ferry' 
  | 'rickshaw'   // market-specific
  | 'tuk_tuk';   // market-specific

// Normalize to maps-compatible modes
function normalizeMode(mode: TraveloureMode): 'walking' | 'driving' | 'transit' | 'bicycling' {
  switch (mode) {
    case 'walk':
      return 'walking';
    case 'taxi':
    case 'private_car':
    case 'rickshaw':
    case 'tuk_tuk':
      return 'driving';
    case 'bus':
    case 'metro':
    case 'train':
    case 'ferry':
      return 'transit';
    case 'bicycle':
      return 'bicycling';
    default:
      return 'driving';
  }
}
```

---

## 4. The Utility Function

### Interface

```typescript
interface NavigateParams {
  // Single destination (Navigate FAB / activity tap)
  destination?: {
    lat: number;
    lng: number;
    name: string;
    placeId?: string; // Google Place ID if available
  };

  // Leg-specific (Transport connector "Open in Maps")
  origin?: {
    lat: number;
    lng: number;
    name: string;
  };

  // Transit mode for this navigation
  mode?: TraveloureMode;

  // Full day route (Open Full Day button)
  waypoints?: Array<{
    lat: number;
    lng: number;
    name: string;
  }>;
}

function openInMaps(params: NavigateParams): void
```

### Logic Flow

```
openInMaps(params):
  1. Get cached platform ("ios" | "android" | "desktop")
  2. Get user maps preference from localStorage (default: "auto")
  3. Resolve target app:
     - "auto" + ios → "apple"
     - "auto" + android/desktop → "google"
     - "waze" + mode is not driving → fall back to "google" (Waze can't do walking/transit)
     - otherwise → use preference directly
  4. Normalize transit mode via normalizeMode()
  5. Build URL based on target app + params:
     - If waypoints[] present → build multi-stop URL (Google only; Apple → single-leg fallback)
     - If origin + destination → build leg URL
     - If destination only → build single-destination URL
  6. window.open(url, '_blank')
```

### Implementation

```typescript
// File: client/src/lib/navigate.ts

const PLATFORM = detectPlatform();

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function getMapsPref(): 'apple' | 'google' | 'waze' {
  const pref = localStorage.getItem('traveloure_maps_pref') || 'auto';
  if (pref === 'auto') {
    return PLATFORM === 'ios' ? 'apple' : 'google';
  }
  return pref as 'apple' | 'google' | 'waze';
}

function normalizeMode(mode?: TraveloureMode): string {
  // ... (as defined above)
}

function buildGoogleUrl(params: NavigateParams): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const searchParams = new URLSearchParams();
  const mode = normalizeMode(params.mode);
  searchParams.set('travelmode', mode);

  if (params.waypoints && params.waypoints.length > 1) {
    // Multi-stop: first = origin, last = destination, middle = waypoints
    const stops = params.waypoints;
    searchParams.set('origin', `${stops[0].lat},${stops[0].lng}`);
    searchParams.set('destination', `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`);
    if (stops.length > 2) {
      const wps = stops.slice(1, -1).map(s => `${s.lat},${s.lng}`).join('|');
      searchParams.set('waypoints', wps);
    }
  } else if (params.origin && params.destination) {
    // Leg-specific
    searchParams.set('origin', `${params.origin.lat},${params.origin.lng}`);
    searchParams.set('destination', `${params.destination.lat},${params.destination.lng}`);
    if (params.destination.placeId) {
      searchParams.set('destination_place_id', params.destination.placeId);
    }
  } else if (params.destination) {
    // Single destination (from current location)
    searchParams.set('destination', `${params.destination.lat},${params.destination.lng}`);
    if (params.destination.placeId) {
      searchParams.set('destination_place_id', params.destination.placeId);
    }
  }

  return `${base}&${searchParams.toString()}`;
}

function buildAppleUrl(params: NavigateParams): string {
  const searchParams = new URLSearchParams();
  const mode = params.mode ? normalizeMode(params.mode) : 'driving';

  // Apple Maps dirflg mapping
  const dirflgMap: Record<string, string> = {
    walking: 'w',
    driving: 'd',
    transit: 'r',
    bicycling: 'w', // fallback — Apple doesn't support bicycle
  };
  searchParams.set('dirflg', dirflgMap[mode] || 'd');
  searchParams.set('t', 'm');

  if (params.origin && params.destination) {
    searchParams.set('saddr', `${params.origin.lat},${params.origin.lng}`);
    searchParams.set('daddr', `${params.destination.lat},${params.destination.lng}`);
  } else if (params.destination) {
    searchParams.set('daddr', `${params.destination.lat},${params.destination.lng}`);
  }

  // Apple Maps does NOT support waypoints — if full day requested,
  // caller should fall back to Google Maps or open legs individually
  return `https://maps.apple.com/?${searchParams.toString()}`;
}

function buildWazeUrl(params: NavigateParams): string {
  const dest = params.destination || 
    (params.waypoints && params.waypoints[params.waypoints.length - 1]);
  if (!dest) return '';
  return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
}

export function openInMaps(params: NavigateParams): void {
  let app = getMapsPref();

  // Waze can only do driving — if mode isn't driving-compatible, fall back
  const normalized = normalizeMode(params.mode);
  if (app === 'waze' && normalized !== 'driving') {
    app = PLATFORM === 'ios' ? 'apple' : 'google';
  }

  // Apple Maps can't do multi-stop — fall back to Google
  if (app === 'apple' && params.waypoints && params.waypoints.length > 2) {
    app = 'google';
  }

  let url: string;
  switch (app) {
    case 'apple':
      url = buildAppleUrl(params);
      break;
    case 'waze':
      url = buildWazeUrl(params);
      break;
    case 'google':
    default:
      url = buildGoogleUrl(params);
      break;
  }

  window.open(url, '_blank');
}
```

---

## 5. Integration Points

### Navigate FAB (Up Next activity)

```typescript
// In the PlanCard on-trip view component
const upNextActivity = getUpNextActivity(dayActivities, currentTime);

<button onClick={() => openInMaps({
  destination: {
    lat: upNextActivity.lat,
    lng: upNextActivity.lng,
    name: upNextActivity.name,
    placeId: upNextActivity.googlePlaceId,
  },
  mode: getTransportLeg(previousActivity, upNextActivity)?.mode || 'walk',
})}>
  Navigate ↗
</button>
```

### Transport Connector "Open in Maps"

```typescript
// Each transport connector between activities
const leg = transportLegs[index];

<a onClick={(e) => {
  e.preventDefault();
  openInMaps({
    origin: {
      lat: leg.from.lat,
      lng: leg.from.lng,
      name: leg.from.name,
    },
    destination: {
      lat: leg.to.lat,
      lng: leg.to.lng,
      name: leg.to.name,
      placeId: leg.to.googlePlaceId,
    },
    mode: leg.selectedMode, // updates when user swaps mode via alt panel
  });
}}>
  Open in Maps
</a>
```

### Open Full Day in Maps

```typescript
// Optional: button at top of day view to see entire route
const todayStops = dayActivities
  .filter(a => !a.visited)
  .map(a => ({ lat: a.lat, lng: a.lng, name: a.name }));

<button onClick={() => openInMaps({
  waypoints: todayStops,
  mode: 'driving', // default for overview; individual legs use their own modes
})}>
  Open Full Day in Maps
</button>
```

**Note on full-day mode:** Google Maps multi-stop URLs use a single `travelmode` for all legs. Since Traveloure legs can mix modes (walk → taxi → bus), the full-day button uses `driving` as a route overview. For mode-accurate navigation, the transport connector "Open in Maps" per leg is the primary UX.

---

## 6. Mode Swap → URL Update

When a user taps a transport connector and selects an alternative mode (e.g., switches from "walk" to "taxi"), two things update:

1. **The connector UI** — icon, duration, cost text
2. **The "Open in Maps" link** — rebuilds with the new mode

This is reactive: the transport leg's `selectedMode` state updates, which triggers a re-render of both the connector text and the `openInMaps` call params. No separate URL rebuild needed — it's a function call, not a pre-built href.

---

## 7. Maps Preference Setting

Add a simple preference selector to the trip settings or the PlanCard's map view menu:

```
Default maps app:
  (•) Auto-detect
  ( ) Google Maps
  ( ) Apple Maps        ← only shown on iOS/macOS
  ( ) Waze              ← only shown when driving modes present
```

Stored in `localStorage` as `traveloure_maps_pref`. The setting persists across sessions on the same device. Future: sync to user profile server-side so it persists across devices.

---

## 8. Edge Cases

| Scenario | Handling |
|----------|----------|
| Activity has no lat/lng | Disable Navigate button; show "Location not set" tooltip |
| Waze selected but mode is walking | Auto-fall back to Google/Apple with no error shown |
| Apple Maps + full day route | Fall back to Google Maps (Apple can't do waypoints) |
| Bicycle mode on Apple Maps | Use walking mode; optionally show "Cycling not available on Apple Maps" toast |
| User has no maps app installed | HTTPS URLs open in browser — Google Maps web works, Apple Maps web works, Waze web works |
| More than 9 stops in a day | Split into two Google Maps URLs (first 9 stops, remaining stops) — or use per-leg navigation only |
| Rickshaw / tuk-tuk mode | Maps as "driving" — maps won't know the vehicle type, but the route is correct |
| Offline / no internet | Deep link still opens maps app which may have cached map tiles; navigation may fail gracefully in the maps app itself |

---

## 9. File Location

```
client/src/lib/navigate.ts     — utility function + types
client/src/hooks/useMapsPref.ts — React hook for maps preference state
```

Both are pure client-side. No server calls needed for navigation.
