import { z } from "zod";

/**
 * Discover recommendations are rendered before a trip exists, so click
 * attribution may identify its impression by a market context instead of trip.
 * Other upsell surfaces remain trip-scoped.
 */
export const upsellClickBodySchema = z.object({
  tripId: z.string().trim().min(1).optional(),
  surface: z.string().trim().min(1),
  offeringId: z.string().trim().min(1),
  city: z.string().trim().min(1).optional(),
  neighborhoodId: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.tripId && !value.city) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "tripId or city is required for upsell click attribution",
      path: ["city"],
    });
  }

  if (value.neighborhoodId && !value.city) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "neighborhoodId requires city",
      path: ["neighborhoodId"],
    });
  }
});