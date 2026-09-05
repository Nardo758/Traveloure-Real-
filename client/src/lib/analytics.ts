/**
 * Tourism Analytics Tracking
 * Lightweight fire-and-forget tracking for the project's existing analytics API.
 */

const API_BASE = import.meta.env?.VITE_API_URL || "";

interface SearchEventData {
  destination: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  experienceType?: string;
  searchContext?: "discover" | "experience-template" | "quick-start";
  contextFields?: Record<string, string>;
}

interface ItineraryGeneratedData {
  tripId?: string;
  destination: string;
  activities?: string[];
  duration?: number;
  travelers?: number;
  budget?: number;
  variationType?: "user_plan" | "weather_optimized" | "best_value";
  experienceType?: string;
}

interface BookingEventData {
  type: "hotel" | "activity" | "flight" | "service" | "transport";
  destination?: string;
  price?: number;
  travelers?: number;
  tripId?: string;
  itemId?: string;
  provider?: "amadeus" | "viator" | "platform" | "external";
  bookingStatus?: "initiated" | "confirmed" | "pending";
}

const sendAnalyticsEvent = async (
  endpoint: string,
  data: object,
): Promise<void> => {
  try {
    const payload = JSON.stringify(data);
    const url = `${API_BASE}${endpoint}`;

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        credentials: "include",
        keepalive: true,
      }).catch(() => {
        // Existing analytics must never break the app.
      });
    }
  } catch {
    // Existing analytics must never break the app.
  }
};

export const trackSearchEvent = (data: SearchEventData): void => {
  void sendAnalyticsEvent("/api/analytics/search-event", data);
};

export const trackItineraryGenerated = (data: ItineraryGeneratedData): void => {
  void sendAnalyticsEvent("/api/analytics/itinerary-generated", data);
};

export const trackBookingEvent = (data: BookingEventData): void => {
  void sendAnalyticsEvent("/api/analytics/booking", data);
};

export type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app.
  }
}

export const analytics = {
  trackSearchEvent,
  trackItineraryGenerated,
  trackBookingEvent,
  trackEvent,
};

export default analytics;
