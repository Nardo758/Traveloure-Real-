/**
 * The E2E draft stub (CI and the provisioned staging deployment, behind `E2E_AI_STUB`): a canned,
 * deterministic draft derived from the request, so every step after the model call runs on real code.
 * Its own module so a fixture test can read it without the AI service (smoke 10 S10-7: its meals sit
 * inside the prompt's meal windows, `AI_MEAL_WINDOWS`).
 */
import type { AutonomousItineraryRequest, AutonomousItineraryResult } from "./ai-generation.service";

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
