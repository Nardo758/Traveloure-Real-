import {
  Calendar, Star, TrainFront, Clock,
} from "lucide-react";
import { MODE_COLORS, MODE_ICON_MAP, getModeIcon } from "@/lib/transport-modes";

// Re-exported for back-compat; the single source is @/lib/transport-modes.
export { MODE_COLORS, MODE_ICON_MAP };

export const TYPE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  dining:      { bg: "bg-amber-100 dark:bg-amber-900/30",  fg: "text-amber-800 dark:text-amber-300",  dot: "#f59e0b" },
  attraction:  { bg: "bg-blue-100 dark:bg-blue-900/30",    fg: "text-blue-800 dark:text-blue-300",    dot: "#3b82f6" },
  shopping:    { bg: "bg-pink-100 dark:bg-pink-900/30",     fg: "text-pink-800 dark:text-pink-300",    dot: "#ec4899" },
  transport:   { bg: "bg-green-100 dark:bg-green-900/30",   fg: "text-green-800 dark:text-green-300",  dot: "#22c55e" },
  accommodation:{ bg: "bg-purple-100 dark:bg-purple-900/30",fg: "text-purple-800 dark:text-purple-300",dot: "#8b5cf6" },
};

export const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-800 dark:text-green-300", label: "Confirmed" },
  pending:   { bg: "bg-yellow-100 dark:bg-yellow-900/30", fg: "text-yellow-800 dark:text-yellow-300", label: "Pending" },
  suggested: { bg: "bg-indigo-100 dark:bg-indigo-900/30", fg: "text-indigo-800 dark:text-indigo-300", label: "Suggested" },
};

export const CHANGE_DOT_COLORS: Record<string, string> = {
  expert: "bg-blue-500", friend: "bg-purple-500", ai: "bg-green-500", owner: "bg-amber-500",
};

export const ENERGY_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  relaxed:  { bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-700 dark:text-green-400", label: "Relaxed" },
  balanced: { bg: "bg-yellow-100 dark:bg-yellow-900/30", fg: "text-yellow-700 dark:text-yellow-400", label: "Balanced" },
  intense:  { bg: "bg-red-100 dark:bg-red-900/30", fg: "text-red-700 dark:text-red-400", label: "Intense" },
};

export const STATS_ICONS = [Calendar, Star, TrainFront, Clock] as const;


export interface TemplateConfig {
  activityLabel: string;
  transportLabel: string;
  statsLabels: [string, string, string, string];
  activityTypes: Record<string, string>;
}

export const TEMPLATES: Record<string, TemplateConfig> = {
  travel: {
    activityLabel: "Activities",
    transportLabel: "Transport",
    statsLabels: ["Days", "Activities", "Transit Legs", "Transit Time"],
    activityTypes: { dining: "Dining", attraction: "Attraction", shopping: "Shopping", transport: "Transport" },
  },
  wedding: {
    activityLabel: "Events & Vendors",
    transportLabel: "Transport",
    statsLabels: ["Days", "Events", "Transfers", "Travel Time"],
    activityTypes: { dining: "Catering", attraction: "Venue", shopping: "Vendor", transport: "Transfer" },
  },
  corporate: {
    activityLabel: "Agenda",
    transportLabel: "Logistics",
    statsLabels: ["Days", "Sessions", "Transfers", "Travel Time"],
    activityTypes: { dining: "Meal", attraction: "Session", shopping: "Site Visit", transport: "Transfer" },
  },
};

export function getTemplateConfig(eventType: string | null | undefined): TemplateConfig {
  if (eventType === "wedding" || eventType === "honeymoon" || eventType === "proposal") return TEMPLATES.wedding;
  if (eventType === "corporate") return TEMPLATES.corporate;
  return TEMPLATES.travel;
}

/**
 * Curated destination → Unsplash CDN photo.
 * Keyed by lowercase city/country keyword. Falls back to a generic travel shot.
 */
const DESTINATION_PHOTOS: Record<string, string> = {
  // Japan
  tokyo: "photo-1540959733332-eab4deabeeaf",
  kyoto: "photo-1545569341-9eb8b30979d9",
  osaka: "photo-1590559899731-a382839e5549",
  japan: "photo-1490806843957-31f4c9a91c65",
  // Europe
  paris: "photo-1502602898657-3e91760cbb34",
  london: "photo-1513635269975-59663e0ac1ad",
  rome: "photo-1552832230-c0197dd311b5",
  barcelona: "photo-1539037116277-4db20889f2d4",
  amsterdam: "photo-1534351590666-13e3e96b5017",
  florence: "photo-1523906834658-6e24ef2386f9",
  venice: "photo-1523905330026-b8bd1f5f320e",
  santorini: "photo-1570077188670-e3a8d69ac5ff",
  athens: "photo-1555993539-1732b0258235",
  lisbon: "photo-1585208798174-6cedd4d46d9e",
  porto: "photo-1555881400-74d7acaacd8b",
  edinburgh: "photo-1506377585622-bedcbb027afc",
  prague: "photo-1541849546-216549ae216d",
  vienna: "photo-1516550893923-42d28e5677af",
  budapest: "photo-1541849546-216549ae216d",
  berlin: "photo-1560969184-10fe8719e047",
  // Asia
  bali: "photo-1537996194471-e657df975ab4",
  singapore: "photo-1525625293386-3f8f99389edd",
  bangkok: "photo-1506665531195-3566af2b4dfa",
  "hong kong": "photo-1507941097613-9f2157b69235",
  seoul: "photo-1538485399081-7191377e8241",
  dubai: "photo-1512453979798-5ea266f8880c",
  // India
  mumbai: "photo-1566552881560-0be862a7c445",
  goa: "photo-1614082242765-7c98ca0f3df3",
  delhi: "photo-1587474260584-136574528ed5",
  jaipur: "photo-1477587458883-47145ed6979e",
  india: "photo-1524492412937-b28074a5d7da",
  // Americas
  "new york": "photo-1496442226666-8d4d0e62e6e9",
  california: "photo-1449034446853-66c86144b0ad",
  "los angeles": "photo-1534190760961-74e8c1c5c3da",
  miami: "photo-1514214246283-d8a5e0942f6c",
  "san francisco": "photo-1501594907352-04cda38ebc29",
  "new orleans": "photo-1568869944-ef2e4e9a51ba",
  cancun: "photo-1552074284-5e88ef1aef18",
  mexico: "photo-1518638150340-f706e86654de",
  bogota: "photo-1591804774201-e3779a445793",
  colombia: "photo-1557499305-0af888c3d8ec",
  "rio de janeiro": "photo-1483729558449-99ef09a8c945",
  // Oceania
  sydney: "photo-1506973035872-a4ec16b8e8d9",
  "new zealand": "photo-1507699622108-4be3abd695ad",
  // Africa
  marrakech: "photo-1539020140153-e479b8c22e70",
  morocco: "photo-1489749798305-4fea3ae63d43",
  "cape town": "photo-1580060839134-75a5edca2e99",
  // Nordic
  iceland: "photo-1531366936337-7c912a4589a7",
  norway: "photo-1513519245088-0e12902e5a38",
  // Generic fallback keyword
  beach: "photo-1507525428034-b723cf961d3e",
  mountains: "photo-1464822759023-fed622ff2c3b",
  travel: "photo-1488085061387-422e29b40080",
};

function unsplashUrl(id: string): string {
  return `https://images.unsplash.com/${id}?w=900&auto=format&fit=crop&q=80`; // fee-literal-ok: image width URL param, not fee config
}

export function getDestinationPhoto(destination: string | undefined | null): string | null {
  if (!destination) return unsplashUrl(DESTINATION_PHOTOS.travel);
  const lower = destination.toLowerCase();
  for (const [key, id] of Object.entries(DESTINATION_PHOTOS)) {
    if (lower.includes(key)) return unsplashUrl(id);
  }
  return unsplashUrl(DESTINATION_PHOTOS.travel);
}

export function getEnergyProfile(day: PlanCardDay | undefined | null): string {
  if (day?.energyProfile) return day.energyProfile;
  const activities = day?.activities;
  if (!activities || activities.length === 0) return "relaxed";
  if (activities.length >= 5) return "intense";
  if (activities.length >= 3) return "balanced";
  return "relaxed";
}

export function ModeIcon({ mode, className }: { mode: string; className?: string }) {
  const Icon = getModeIcon(mode);
  return <Icon className={className || "w-4 h-4"} />;
}

export interface PlanCardActivity {
  id: string;
  name: string;
  type: string;
  status: string;
  time: string;
  location: string;
  lat?: number;
  lng?: number;
  cost: number;
  comments: number;
  changes?: Array<{ who: string; what: string }>;
  expertNote?: string;
  /** Provider-canonical Maps link (from googlePlaceId); preferred for nav. */
  mapsUrl?: string;
}

export interface PlanCardTransport {
  id: string;
  mode: string;
  from: string;
  to: string;
  fromName?: string;
  toName?: string;
  duration: number;
  cost: number;
  status: string;
  line?: string;
  suggestedBy?: string;
  partnerName?: string;
  bookingSource?: "platform" | "affiliate";
  // Per-leg mode-selection fields (feed the TransportConnector picker)
  legOrder?: number;
  recommendedMode?: string;
  userSelectedMode?: string | null;
  alternativeModes?: Array<{
    mode: string;
    durationMinutes: number;
    costUsd: number | null;
    energyCost?: number;
    reason?: string;
  }>;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  distanceDisplay?: string;
  estimatedDurationMinutes?: number;
  estimatedCostUsd?: number | null;
  mapsUrl?: string | null;
}

export interface PlanCardDay {
  dayNum: number;
  date: string;
  label: string;
  energyProfile?: string;
  activities: PlanCardActivity[];
  transports: PlanCardTransport[];
}

export interface PlanCardChange {
  id: string;
  who: string;
  role: string;
  type: string;
  what: string;
  when: string;
}

export interface PlanCardMetrics {
  traveloureScore?: number;
  optimizationScore?: number;
  totalCost?: number;
  perPersonCost?: number;
  savings?: number;
  savingsPercent?: number;
  wellnessMinutes?: number;
  travelDistanceMinutes?: number;
  starRatingDelta?: number;
}

export interface PlanCardStats {
  totalActivities?: number;
  confirmedActivities?: number;
  totalLegs?: number;
  totalTransitMinutes?: number;
  pendingExpertChanges?: number;
}

export interface OptimizationDelta {
  savings?: number | null;
  savingsPercent?: number | null;
  starRatingDelta?: number | null;
  travelDistanceMinutes?: number | null;
  optimizationScore?: number | null;
}

export interface PlanCardData {
  tripRole?: PlanCardRole;
  days: PlanCardDay[];
  changeLog: PlanCardChange[];
  metrics: PlanCardMetrics;
  stats: PlanCardStats;
  optimizationDelta?: OptimizationDelta | null;
  lastOptimizedAt?: string | null;
}

export interface PlanCardTrip {
  id: string;
  destination: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  numberOfTravelers: number;
  budget?: string | number;
  eventType?: string;
}

export type PlanCardRole = "owner" | "expert" | "friend" | "viewer";
export type PlanCardStage = "summary" | "full";

export interface PlanCardProps {
  trip: PlanCardTrip;
  score?: { tripId: string; optimizationScore: number | null; shareToken: string | null };
  index?: number;
  role?: PlanCardRole;
  stage?: PlanCardStage;
  days?: PlanCardDay[];
}

export interface PlanCardScore {
  tripId: string;
  optimizationScore: number | null;
  shareToken: string | null;
}
