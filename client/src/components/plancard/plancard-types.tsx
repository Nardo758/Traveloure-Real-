import {
  Calendar, Star, TrainFront, Clock, Footprints, Car, Bus, Ship, Bike,
} from "lucide-react";

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

export const MODE_COLORS: Record<string, string> = {
  walk: "#22c55e", train: "#3b82f6", taxi: "#f59e0b", car: "#f59e0b",
  bus: "#8b5cf6", shuttle: "#ec4899", ferry: "#06b6d4", bicycle: "#84cc16",
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

export const MODE_ICON_MAP: Record<string, typeof Footprints> = {
  walk: Footprints, train: TrainFront, taxi: Car, car: Car,
  bus: Bus, shuttle: Bus, ferry: Ship, bicycle: Bike,
};

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

export function getDestinationPhotoUrl(destination: string): string {
  return `https://source.unsplash.com/800x400/?${encodeURIComponent(destination)},travel,landmark`;
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
  const Icon = MODE_ICON_MAP[mode] || Footprints;
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

export interface PlanCardData {
  days: PlanCardDay[];
  changeLog: PlanCardChange[];
  metrics: PlanCardMetrics;
  stats: PlanCardStats;
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

export interface PlanCardProps {
  trip: PlanCardTrip;
  score?: { tripId: string; optimizationScore: number | null; shareToken: string | null };
  index?: number;
}

export interface PlanCardScore {
  tripId: string;
  optimizationScore: number | null;
  shareToken: string | null;
}
