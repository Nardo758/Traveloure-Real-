import { z } from 'zod';
import { 
  insertTripSchema, 
  trips, 
  generatedItineraries, 
  insertGeneratedItinerarySchema,
  reviewRatings,
  insertReviewRatingSchema,
  userAndExpertChats,
  insertUserAndExpertChatSchema,
  touristPlaceResults,
  helpGuideTrips,
  insertHelpGuideTripSchema
} from './schema';
import { users } from './models/auth';

export type TripListItem = typeof trips.$inferSelect & {
  occasion: {
    label: string;
    date: string;
  } | null;
  /**
   * The latest `trip_finals` version for this trip, or null when the trip has no final
   * (the pre-final state). Lets the My Plans list flip a tile between "Open slip" (pre-final)
   * and "View Trip Card · Final · v{N}" (post-final) WITHOUT a per-row plancard query
   * (Trip Card rebuild Phase 4, ledger 2026-08-31-stage-a-dashboard). A trip reopened for
   * revision keeps its latest version here (a final still exists, so /trip/:id still renders
   * the frozen snapshot) — the flip is "a final exists", i.e. finalVersion != null.
   */
  finalVersion: number | null;
};

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  trips: {
    list: {
      method: 'GET' as const,
      path: '/api/trips',
      responses: {
        200: z.array(z.custom<TripListItem>()),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/trips/:id',
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/trips',
      input: insertTripSchema,
      responses: {
        201: z.custom<typeof trips.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/trips/:id',
      input: insertTripSchema.partial(),
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/trips/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    generateItinerary: {
      method: 'POST' as const,
      path: '/api/trips/:id/generate-itinerary',
      responses: {
        201: z.custom<typeof generatedItineraries.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
  touristPlaces: {
    search: {
      method: 'GET' as const,
      path: '/api/tourist-places/search',
      input: z.object({ query: z.string() }),
      responses: {
        200: z.array(z.custom<typeof touristPlaceResults.$inferSelect>()),
      },
    },
  },
  chats: {
    list: {
      method: 'GET' as const,
      path: '/api/chats',
      responses: {
        200: z.array(z.custom<typeof userAndExpertChats.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/chats',
      input: insertUserAndExpertChatSchema,
      responses: {
        201: z.custom<typeof userAndExpertChats.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  helpGuideTrips: {
    list: {
      method: 'GET' as const,
      path: '/api/help-guide-trips',
      responses: {
        200: z.array(z.custom<typeof helpGuideTrips.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/help-guide-trips/:id',
      responses: {
        200: z.custom<typeof helpGuideTrips.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
