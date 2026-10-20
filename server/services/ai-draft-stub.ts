/**
 * The E2E draft stub (CI and the provisioned staging deployment, behind `E2E_AI_STUB`): a canned,
 * deterministic draft derived from the request, so every step after the model call runs on real code.
 * Its own module so a fixture test can read it without the AI service (smoke 10 S10-7: its meals sit
 * inside the prompt's meal windows, `AI_MEAL_WINDOWS`).
 */
import type { AutonomousItineraryRequest, AutonomousItineraryResult } from "./ai-generation.service";

/**
 * The ONE gate for the E2E model stand-in (§18 rule 1). Journey CI and the provisioned staging
 * deployment set `E2E_AI_STUB=1`. Production (`ENVIRONMENT=PROD`, or production mode without the
 * test-account opt-in) never serves a stub, even if the flag is copied there.
 * The stub replaces the model call on the happy path only. A real provider failure still goes
 * through `aiFailureResponse` — this function does not classify or hide one.
 */
export function isE2eAiStubEnabled(): boolean {
  return (
    process.env.E2E_AI_STUB === "1" &&
    (process.env.NODE_ENV !== "production" ||
      (process.env.ALLOW_TEST_ACCOUNTS === "1" && process.env.ENVIRONMENT !== "PROD"))
  );
}

/** The `days[]` shape `POST /api/trips/:id/generate-itinerary` stores and the share page renders. */
export function buildStubTripItinerary(input: { destination: string; durationDays: number }): {
  days: Array<{
    day: number;
    title: string;
    activities: Array<{
      time: string;
      title: string;
      description: string;
      type: string;
      locationName: string;
      durationMinutes: number;
      estimatedCost: number;
    }>;
  }>;
} {
  const days = Math.max(1, Math.floor(input.durationDays) || 1);
  const place = input.destination.trim() || "the destination";
  return {
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Day ${i + 1} in ${place}`,
      activities: [
        {
          time: "10:00 AM",
          title: `Walk through ${place}`,
          description: "A short orientation walk. This is a CI stand-in, not a model plan.",
          type: "sightseeing",
          locationName: place,
          durationMinutes: 90,
          estimatedCost: 0,
        },
      ],
    })),
  };
}

export function buildStubItinerary(request: AutonomousItineraryRequest): AutonomousItineraryResult {
  const dest = request.destination || "Your Destination";
  const start = request.dates?.start || new Date().toISOString().slice(0, 10);
  return {
    title: `${dest} Trip (E2E stub)`,
    summary: `Stubbed itinerary for ${dest} — generated without an LLM for CI.`,
    totalEstimatedCost: 500,
    dailyItinerary: [
      {
        day: 1,
        date: start,
        theme: "Arrival & orientation",
        activities: [
          {
            time: "10:00 AM",
            name: `Explore ${dest}`,
            type: "activities",
            duration: "2 hours",
            estimatedCost: 0,
            location: dest,
            description: "Self-guided orientation walk.",
            bookingRequired: false,
          },
        ],
        meals: [
          {
            time: "8:00 AM",
            type: "breakfast",
            suggestion: "Café breakfast",
            cuisine: "Local",
            priceRange: "$",
          },
          {
            time: "1:00 PM",
            type: "lunch",
            suggestion: "Local café",
            cuisine: "Local",
            priceRange: "$",
          },
        ],
        transportation: [],
      },
    ],
    accommodationSuggestions: [
      {
        name: "Central Stay",
        type: "hotel",
        pricePerNight: 120,
        neighborhood: "City Center",
        whyRecommended: "Walkable to the day-1 activity.",
      },
    ],
    packingList: ["Comfortable shoes", "Weather-appropriate layers"],
    travelTips: ["This is a CI stub itinerary — not a real AI plan."],
  };
}
