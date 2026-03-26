/**
 * Tourism Analytics Tracking
 * Lightweight fire-and-forget tracking for tourism data capture
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

interface SearchEventData {
  destination: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  experienceType?: string;
  searchContext?: 'discover' | 'experience-template' | 'quick-start';
}

interface ItineraryGeneratedData {
  tripId?: string;
  destination: string;
  activities?: string[];
  duration?: number;
  travelers?: number;
  budget?: number;
  variationType?: 'user_plan' | 'weather_optimized' | 'best_value';
  experienceType?: string;
}

interface BookingEventData {
  type: 'hotel' | 'activity' | 'flight' | 'service' | 'transport';
  destination?: string;
  price?: number;
  travelers?: number;
  tripId?: string;
  itemId?: string;
  provider?: 'amadeus' | 'viator' | 'platform' | 'external';
  bookingStatus?: 'initiated' | 'confirmed' | 'pending';
}

/**
 * Fire-and-forget analytics tracking
 * Does not block UI - silently fails on error
 */
const sendAnalyticsEvent = async (endpoint: string, data: Record<string, unknown>): Promise<void> => {
  try {
    // Use navigator.sendBeacon for better reliability on page unload, fallback to fetch
    const payload = JSON.stringify(data);
    const url = `${API_BASE}${endpoint}`;
    
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback: async fetch with no await to avoid blocking
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        credentials: 'include',
        keepalive: true,
      }).catch(() => {
        // Silently ignore errors - analytics should never break UX
      });
    }
  } catch {
    // Silently ignore - analytics should never break UX
  }
};

/**
 * Track destination search events
 */
export const trackSearchEvent = (data: SearchEventData): void => {
  sendAnalyticsEvent('/api/analytics/search-event', data);
};

/**
 * Track itinerary generation events
 */
export const trackItineraryGenerated = (data: ItineraryGeneratedData): void => {
  sendAnalyticsEvent('/api/analytics/itinerary-generated', data);
};

/**
 * Track booking events
 */
export const trackBookingEvent = (data: BookingEventData): void => {
  sendAnalyticsEvent('/api/analytics/booking', data);
};

export const analytics = {
  trackSearchEvent,
  trackItineraryGenerated,
  trackBookingEvent,
};

export default analytics;
