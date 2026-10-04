import { z } from "zod";
import { gatedMapsCallOrNull } from "./maps-billing/maps-billing.service";
import { DRIVE_FIELD_MASK, MODE_FIELD_MASK, drivingRouteBody, modeRouteBody } from "./maps-billing/maps-requests";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const TransitLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
});

export const TransitRequestSchema = z.object({
  origin: TransitLocationSchema,
  destination: TransitLocationSchema,
  departureTime: z.string().optional(),
  transitPreferences: z.object({
    routingPreference: z.enum(["LESS_WALKING", "FEWER_TRANSFERS"]).optional(),
    allowedTravelModes: z.array(z.enum(["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL"])).optional(),
  }).optional(),
});

export type TransitRequest = z.infer<typeof TransitRequestSchema>;

interface TransitStep {
  travelMode: string;
  distanceMeters: number;
  staticDuration: string;
  transitDetails?: {
    stopDetails: {
      arrivalStop: { name: string };
      departureStop: { name: string };
      arrivalTime: string;
      departureTime: string;
    };
    headsign: string;
    transitLine: {
      agencies: { name: string }[];
      name: string;
      nameShort?: string;
      color?: string;
      textColor?: string;
      vehicle: {
        type: string;
        name?: { text: string };
        iconUri?: string;
      };
    };
    stopCount: number;
  };
  navigationInstruction?: {
    maneuver?: string;
    instructions?: string;
  };
  startLocation?: {
    latLng: { latitude: number; longitude: number };
  };
  endLocation?: {
    latLng: { latitude: number; longitude: number };
  };
}

interface TransitLeg {
  distanceMeters: number;
  duration: string;
  staticDuration: string;
  polyline?: {
    encodedPolyline: string;
  };
  startLocation: {
    latLng: { latitude: number; longitude: number };
  };
  endLocation: {
    latLng: { latitude: number; longitude: number };
  };
  steps: TransitStep[];
}

interface TransitRoute {
  distanceMeters: number;
  duration: string;
  staticDuration: string;
  polyline?: {
    encodedPolyline: string;
  };
  legs: TransitLeg[];
  localizedValues?: {
    distance?: { text: string };
    duration?: { text: string };
    staticDuration?: { text: string };
  };
}

export interface TransitRouteResponse {
  routes: TransitRoute[];
}

export interface ParsedTransitRoute {
  totalDistance: number;
  totalDuration: number;
  durationText: string;
  distanceText: string;
  polyline?: string;
  steps: ParsedTransitStep[];
}

export interface ParsedTransitStep {
  mode: "WALK" | "TRANSIT";
  distance: number;
  duration: number;
  durationMinutes: number;
  instruction?: string;
  transit?: {
    lineName: string;
    lineNameShort?: string;
    lineColor?: string;
    lineTextColor?: string;
    vehicleType: string;
    vehicleIcon?: string;
    agencyName: string;
    departureStop: string;
    arrivalStop: string;
    departureTime: string;
    arrivalTime: string;
    headsign: string;
    stopCount: number;
  };
  startLocation?: { lat: number; lng: number };
  endLocation?: { lat: number; lng: number };
}

export interface DrivingRouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  /**
   * RFC 3339. R298: NOT sent — a TRAFFIC_UNAWARE drive needs no departure, and the field is kept
   * only so callers that already compute one do not change shape.
   */
  departureTime?: string;
}

export interface ParsedDrivingRoute {
  distanceMeters: number;
  durationSeconds: number;
  durationMinutes: number;
  polyline?: string;
  provider: "google_routes";
  routingPreference: "TRAFFIC_UNAWARE";
  retrievedAt: string;
}

function parseDuration(durationString: string): number {
  const match = durationString.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Authoritative activity-to-activity driving route. There is deliberately no geometric fallback:
 * callers must surface an unavailable route rather than presenting a straight-line estimate as a
 * real drive time.
 *
 * R298 (Maps billing audit): Compute Routes ESSENTIALS — `routingPreference: TRAFFIC_UNAWARE`, no
 * departure. It was TRAFFIC_AWARE (the Pro SKU), but a leg is computed while planning and most legs
 * had no real departure (they fell back to now + 10 min), so the "traffic" was the traffic at the
 * moment of planning, not on the day. Gated by `routes_drive` (`@shared/maps-billing`).
 */
export async function getTrafficAwareDrivingRoute(
  request: DrivingRouteRequest,
): Promise<ParsedDrivingRoute | null> {
  return gatedMapsCallOrNull("routes_drive", async (apiKey) => {
    const response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DRIVE_FIELD_MASK,
      },
      body: JSON.stringify(drivingRouteBody(request)),
    });
    if (!response.ok) {
      console.error("[Routes] driving route failed:", response.status, await response.text());
      return { value: null, success: false };
    }
    const data = await response.json() as { routes?: Array<{ duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }> };
    const route = data.routes?.[0];
    const durationSeconds = route?.duration ? parseDuration(route.duration) : 0;
    if (!route || !Number.isFinite(route.distanceMeters) || !durationSeconds) return { value: null };
    return {
      value: {
        distanceMeters: route.distanceMeters!,
        durationSeconds,
        durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        polyline: route.polyline?.encodedPolyline,
        provider: "google_routes" as const,
        routingPreference: "TRAFFIC_UNAWARE" as const,
        retrievedAt: new Date().toISOString(),
      },
    };
  }).catch((error) => {
    console.error("[Routes] driving route request failed:", error);
    return null;
  });
}

function parseTransitRoute(route: TransitRoute): ParsedTransitRoute {
  const totalDuration = parseDuration(route.duration || route.staticDuration);
  
  const steps: ParsedTransitStep[] = [];
  
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const stepDuration = parseDuration(step.staticDuration);
      
      if (step.transitDetails) {
        const td = step.transitDetails;
        steps.push({
          mode: "TRANSIT",
          distance: step.distanceMeters,
          duration: stepDuration,
          durationMinutes: Math.round(stepDuration / 60),
          transit: {
            lineName: td.transitLine.name,
            lineNameShort: td.transitLine.nameShort,
            lineColor: td.transitLine.color,
            lineTextColor: td.transitLine.textColor,
            vehicleType: td.transitLine.vehicle.type,
            vehicleIcon: td.transitLine.vehicle.iconUri,
            agencyName: td.transitLine.agencies[0]?.name || "Transit",
            departureStop: td.stopDetails.departureStop.name,
            arrivalStop: td.stopDetails.arrivalStop.name,
            departureTime: td.stopDetails.departureTime,
            arrivalTime: td.stopDetails.arrivalTime,
            headsign: td.headsign,
            stopCount: td.stopCount,
          },
          startLocation: step.startLocation ? {
            lat: step.startLocation.latLng.latitude,
            lng: step.startLocation.latLng.longitude,
          } : undefined,
          endLocation: step.endLocation ? {
            lat: step.endLocation.latLng.latitude,
            lng: step.endLocation.latLng.longitude,
          } : undefined,
        });
      } else {
        steps.push({
          mode: "WALK",
          distance: step.distanceMeters,
          duration: stepDuration,
          durationMinutes: Math.round(stepDuration / 60),
          instruction: step.navigationInstruction?.instructions,
          startLocation: step.startLocation ? {
            lat: step.startLocation.latLng.latitude,
            lng: step.startLocation.latLng.longitude,
          } : undefined,
          endLocation: step.endLocation ? {
            lat: step.endLocation.latLng.latitude,
            lng: step.endLocation.latLng.longitude,
          } : undefined,
        });
      }
    }
  }

  return {
    totalDistance: route.distanceMeters,
    totalDuration,
    durationText: route.localizedValues?.duration?.text || `${Math.round(totalDuration / 60)} min`,
    distanceText: route.localizedValues?.distance?.text || `${(route.distanceMeters / 1000).toFixed(1)} km`,
    polyline: route.polyline?.encodedPolyline,
    steps,
  };
}

export async function getTransitRoute(request: TransitRequest): Promise<ParsedTransitRoute | null> {
  const departureTime = request.departureTime || new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: request.origin.lat,
          longitude: request.origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: request.destination.lat,
          longitude: request.destination.lng,
        },
      },
    },
    travelMode: "TRANSIT",
    computeAlternativeRoutes: false,
    departureTime,
    transitPreferences: request.transitPreferences || {
      routingPreference: "LESS_WALKING",
    },
    languageCode: "en-US",
  };

  const fieldMask = [
    "routes.duration",
    "routes.distanceMeters",
    "routes.polyline.encodedPolyline",
    "routes.localizedValues",
    "routes.legs.duration",
    "routes.legs.distanceMeters",
    "routes.legs.polyline.encodedPolyline",
    "routes.legs.steps.staticDuration",
    "routes.legs.steps.distanceMeters",
    "routes.legs.steps.transitDetails",
    "routes.legs.steps.navigationInstruction",
    "routes.legs.steps.startLocation",
    "routes.legs.steps.endLocation",
  ].join(",");

  // R298: Compute Routes ESSENTIALS (TRANSIT; no Pro modifier). Gated by `routes_transit`.
  return gatedMapsCallOrNull("routes_transit", async (apiKey) => {
    const response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Routes API error:", response.status, errorText);
      return { value: null, success: false };
    }

    const data: TransitRouteResponse = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.log("No transit routes found");
      return { value: null };
    }

    return { value: parseTransitRoute(data.routes[0]) };
  }).catch((error) => {
    console.error("Error fetching transit route:", error);
    return null;
  });
}

export async function getMultipleTransitRoutes(
  origin: { lat: number; lng: number; name?: string },
  destinations: Array<{ id: string; lat: number; lng: number; name: string }>
): Promise<Map<string, ParsedTransitRoute | null>> {
  const results = new Map<string, ParsedTransitRoute | null>();
  
  const promises = destinations.map(async (dest) => {
    const route = await getTransitRoute({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: dest.lat, lng: dest.lng },
    });
    return { id: dest.id, route };
  });

  const settled = await Promise.allSettled(promises);
  
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.set(result.value.id, result.value.route);
    }
  }

  return results;
}

/**
 * A8 (R228): ONE Routes call per travel mode, for the ONE travel-time service's exact-leg tier.
 * Driving keeps the traffic-aware request above; walk / bicycle / transit ask Routes for that mode.
 * Null = Routes had no answer (no key, an error, no route) — the caller falls back to the matrix and
 * then the labelled estimate, never a guess.
 */
export async function getRouteForMode(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "walk" | "cycle" | "transit" | "drive",
): Promise<{ minutes: number; distanceMeters: number } | null> {
  if (mode === "drive") {
    const r = await getTrafficAwareDrivingRoute({ origin, destination });
    return r ? { minutes: r.durationMinutes, distanceMeters: r.distanceMeters } : null;
  }
  const travelMode = mode === "walk" ? "WALK" : mode === "cycle" ? "BICYCLE" : "TRANSIT";
  // R298: Compute Routes ESSENTIALS (a mode, no routing preference). Gated by `routes_mode`.
  return gatedMapsCallOrNull("routes_mode", async (apiKey) => {
    const response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": MODE_FIELD_MASK,
      },
      body: JSON.stringify(modeRouteBody(origin, destination, travelMode)),
    });
    if (!response.ok) {
      console.error(`[Routes] ${travelMode} route failed:`, response.status);
      return { value: null, success: false };
    }
    const data = (await response.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
    const route = data.routes?.[0];
    const seconds = route?.duration ? parseDuration(route.duration) : 0;
    if (!route || !Number.isFinite(route.distanceMeters) || !seconds) return { value: null };
    return { value: { minutes: Math.max(1, Math.ceil(seconds / 60)), distanceMeters: route.distanceMeters! } };
  }).catch((error) => {
    console.error(`[Routes] ${travelMode} route request failed:`, error);
    return null;
  });
}
