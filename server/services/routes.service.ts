import { z } from "zod";

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

function parseDuration(durationString: string): number {
  const match = durationString.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
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
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY not configured");
    return null;
  }

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

  try {
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
      return null;
    }

    const data: TransitRouteResponse = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      console.log("No transit routes found");
      return null;
    }

    return parseTransitRoute(data.routes[0]);
  } catch (error) {
    console.error("Error fetching transit route:", error);
    return null;
  }
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
