import type { Page } from "@playwright/test";

export const SLIP_PARITY_TRIP_ID = "slip-parity-trip";
export const SLIP_PARITY_COMPARISON_ID = "slip-parity-comparison";

export type SlipParityScenario = "three" | "two" | "zero" | "forbidden";

type FixtureResponse = {
  method?: "GET";
  path: string;
  body: unknown;
  status?: number;
};

const fixtureUser = {
  id: "slip-parity-user",
  firstName: "Slip",
  lastName: "Reviewer",
  email: "slip-parity@example.com",
  role: "user",
  termsAcceptedAt: "2026-01-01T00:00:00.000Z",
  privacyAcceptedAt: "2026-01-01T00:00:00.000Z",
};

const fixtureComparison = {
  id: SLIP_PARITY_COMPARISON_ID,
  userId: fixtureUser.id,
  tripId: SLIP_PARITY_TRIP_ID,
  title: "Kyoto optimization review",
  destination: "Kyoto, Japan",
  startDate: "2026-10-01",
  endDate: "2026-10-05",
  budget: "1500.00",
  travelers: 2,
  status: "generated",
  selectedVariantId: null,
};

const fixturePlancard = {
  tripRole: "owner",
  trip: {
    id: SLIP_PARITY_TRIP_ID,
    title: "Kyoto autumn plan",
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    travelers: 2,
    trackingNumber: "KYO-042",
    planVersion: 2,
  },
  days: [
    {
      dayNum: 1,
      date: "2026-10-01",
      label: "Day 1",
      activities: [
        {
          id: "fixture-hotel",
          type: "accommodation",
          status: "confirmed",
          time: "15:00",
          location: "Gion, Kyoto",
          name: "Gion Garden Hotel",
          description: "A calm base in eastern Kyoto.",
          cost: 180,
          comments: 0,
          routingStatus: "purchased",
        },
        {
          id: "fixture-market",
          type: "attraction",
          status: "suggested",
          time: "10:00",
          location: "Nishiki Market",
          name: "Nishiki Market walk",
          description: "A guided market morning.",
          cost: 45,
          comments: 0,
          routingStatus: "in_planning",
        },
      ],
      transports: [],
    },
  ],
  changeLog: [],
  metrics: {},
  stats: { totalActivities: 2, confirmedActivities: 1, totalLegs: 0, totalTransitMinutes: 0 },
  recentTransitions: [],
  meta: { deliveredBy: null },
};

function variantItem(id: string, name: string, price: string) {
  return {
    id,
    dayNumber: 1,
    timeSlot: "morning",
    startTime: "10:00",
    endTime: "12:00",
    name,
    description: `${name} description`,
    serviceType: "attraction",
    price,
    rating: "4.7",
    location: "Kyoto, Japan",
    duration: 120,
    travelTimeFromPrevious: 10,
    isReplacement: true,
    replacementReason: "Better fit for the selected anchor",
  };
}

function variant(
  id: string,
  name: string,
  source: "user" | "ai_optimized",
  totalCost: string,
  optimizationScore: number,
  anchorType?: "hotel" | "neighborhood" | "activity",
) {
  return {
    id,
    name,
    description: `${name} keeps the purchased hotel and rebuilds the rest of the plan.`,
    source,
    status: "generated",
    totalCost,
    totalTravelTime: 35,
    averageRating: "4.7",
    freeTimeMinutes: 180,
    optimizationScore,
    aiReasoning: source === "user" ? "" : "Rebalanced the morning around one clear anchor.",
    sortOrder: source === "user" ? 0 : optimizationScore,
    items: source === "user"
      ? [variantItem(`${id}-original`, "Nishiki Market walk", "45.00")]
      : [variantItem(`${id}-replacement`, `${name} activity`, "55.00")],
    metrics: [],
    anchorType: source === "user" ? null : anchorType,
    anchorName: source === "user" ? null : anchorType === "hotel"
      ? "Gion Garden Hotel"
      : anchorType === "neighborhood"
        ? "Gion"
        : "Nishiki Market",
    anchorMedianMeters: source === "user" ? null : 480,
  };
}

function responsesFor(scenario: SlipParityScenario): FixtureResponse[] {
  if (scenario === "forbidden") {
    return [{
      path: `/api/itinerary-comparisons/${SLIP_PARITY_COMPARISON_ID}`,
      status: 403,
      body: { message: "You do not have access to this comparison." },
    }];
  }

  const allVariants = [
    variant("fixture-baseline", "Your plan", "user", "225.00", 0),
    variant("fixture-v1", "Calm mornings", "ai_optimized", "210.00", 92, "hotel"),
    variant("fixture-v2", "Neighborhood rhythm", "ai_optimized", "235.00", 86, "neighborhood"),
    variant("fixture-v3", "Market first", "ai_optimized", "245.00", 80, "activity"),
  ];
  const aiCount = scenario === "three" ? 3 : scenario === "two" ? 2 : 0;
  const variants = [allVariants[0], ...allVariants.slice(1, aiCount + 1)];

  return [
    {
      path: `/api/itinerary-comparisons/${SLIP_PARITY_COMPARISON_ID}`,
      body: { comparison: fixtureComparison, variants, upsellSuggestions: [] },
    },
    {
      path: `/api/trips/${SLIP_PARITY_TRIP_ID}/plancard`,
      body: fixturePlancard,
    },
    {
      path: "/api/travelpulse/cities/Kyoto",
      body: {},
    },
    {
      path: "/api/travelpulse/trending/Kyoto",
      body: { experiences: [] },
    },
    {
      path: "/api/notifications/unread-count",
      body: { count: 0 },
    },
    {
      path: "/api/notifications",
      body: [],
    },
    {
      path: "/api/messages/unread/count",
      body: { count: 0 },
    },
    ...allVariants.map((currentVariant) => ({
      path: `/api/itinerary-variants/${currentVariant.id}/transport-legs`,
      body: [],
    })),
  ];
}

/**
 * Install a client-only authenticated read fixture before navigation.
 *
 * This deliberately intercepts every /api request. Known reads receive fixture data;
 * unknown reads get an inert response; all non-GET requests fail locally. That makes
 * accidental payment, generation, apply, checkout, or other mutations impossible in
 * this audit suite while preserving the real application and route rendering.
 */
export async function installSlipParityFixture(
  page: Page,
  scenario: SlipParityScenario,
) {
  const responses = responsesFor(scenario);

  await page.addInitScript(
    ({ user, responses: fixtureResponses }) => {
      const originalFetch = window.fetch.bind(window);
      const requests: Array<{ method: string; path: string; fixtureBlocked?: true }> = [];

      Object.defineProperty(window, "__slipParityRequests", {
        configurable: true,
        value: requests,
      });

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
        const parsed = new URL(url, window.location.origin);
        const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

        if (!parsed.pathname.startsWith("/api/")) {
          return originalFetch(input, init);
        }

        requests.push({ method, path: parsed.pathname });

        if (parsed.pathname === "/api/auth/user") {
          return new Response(JSON.stringify(user), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method !== "GET") {
          requests[requests.length - 1].fixtureBlocked = true;
          return new Response(JSON.stringify({ error: "Mutation blocked by slip parity fixture" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
          });
        }

        const response = fixtureResponses.find((candidate) => candidate.path === parsed.pathname);
        return new Response(JSON.stringify(response?.body ?? {}), {
          status: response?.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      };
    },
    { user: fixtureUser, responses },
  );
}