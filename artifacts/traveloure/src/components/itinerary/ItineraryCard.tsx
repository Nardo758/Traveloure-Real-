import type { InlineTransportLegData } from "./InlineTransportSelector";

export interface ItineraryActivity {
  id: string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  cost?: number;
  description?: string | null;
  location?: string | null;
  duration?: number | null;
  booked?: boolean;
  bookingStatus?: "pending" | "booked" | "confirmed";
  bookingType?: "inApp" | "partner";
  partnerName?: string | null;
}

export interface ItineraryDay {
  dayNumber: number;
  date?: string;
  title?: string;
  activities: ItineraryActivity[];
  transportLegs: InlineTransportLegData[];
}

export interface ItineraryCardData {
  id: string;
  name: string;
  description?: string | null;
  destination?: string | null;
  dateRange?: { start?: string | null; end?: string | null };
  totalCost?: string | number | null;
  optimizationScore?: number | null;
  days: ItineraryDay[];
  transportSummary?: {
    totalLegs: number;
    totalMinutes: number;
    totalCostUsd: number;
  };
}

export interface ActivityDiff {
  name?: string;
  startTime?: string;
  note?: string;
  originalName: string;
  originalStartTime?: string;
}

export interface TransportDiff {
  originalMode: string;
  newMode: string;
  legOrder: number;
}
