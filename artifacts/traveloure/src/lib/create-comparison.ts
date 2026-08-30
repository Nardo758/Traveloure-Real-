import { apiRequest } from "@/lib/queryClient";

// R-B: the one create-comparison rail. Four near-duplicate `POST /api/itinerary-comparisons`
// callers (experience-template.tsx, cart.tsx, discover.tsx, + the itinerary-comparison.tsx retry
// that ground-truth showed calls a DIFFERENT endpoint — see that file's own comment) collapse
// onto this single typed helper. Payload shape mirrors the server's real reads
// (server/routes.ts `POST /api/itinerary-comparisons`) exactly — nothing here changes server
// money/optimizer logic, this only centralizes the client-side request construction.

export interface ComparisonBaselineItem {
  name: string;
  category: string;
  price: string;
  provider: string;
  location: string;
  description?: string;
}

export interface CreateComparisonOptions {
  /** Falls back server-side to "My Itinerary Comparison" when omitted. */
  title?: string;
  tripId?: string;
  userExperienceId?: string;
  experienceTypeSlug?: string;
  baselineItems?: ComparisonBaselineItem[];
  /** Required — callers must resolve a real destination before calling this (§13: never invent one). */
  destination: string;
  startDate: string;
  endDate: string;
  /** Falls back server-side to 1 when omitted (server/routes.ts: `travelers || 1`). */
  travelers?: number;
  budget?: string;
  /** Proof that a paid (or free-re-run-eligible) optimization run authorizes the AI call. */
  optimizationPaymentId?: string;
}

export interface CreateComparisonResult {
  id: string;
  [key: string]: unknown;
}

/**
 * POSTs /api/itinerary-comparisons with the given options and returns the created comparison
 * (at minimum its `id`). Callers remain responsible for their own pre-flight checks (empty
 * cart, signed-in gate, etc.) and for anything they do after the comparison is created
 * (sessionStorage baseline seeding, navigation, ?autoApply query param, etc.) — this helper
 * only centralizes the request itself.
 */
export async function createComparison(
  options: CreateComparisonOptions,
): Promise<CreateComparisonResult> {
  const {
    title,
    tripId,
    userExperienceId,
    experienceTypeSlug,
    baselineItems,
    destination,
    startDate,
    endDate,
    travelers,
    budget,
    optimizationPaymentId,
  } = options;

  const response = await apiRequest("POST", "/api/itinerary-comparisons", {
    title,
    destination,
    startDate,
    endDate,
    ...(budget !== undefined ? { budget } : {}),
    ...(travelers !== undefined ? { travelers } : {}),
    ...(baselineItems !== undefined ? { baselineItems } : {}),
    ...(tripId ? { tripId } : {}),
    ...(userExperienceId ? { userExperienceId } : {}),
    ...(experienceTypeSlug ? { experienceTypeSlug } : {}),
    ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
  });

  return response.json();
}
