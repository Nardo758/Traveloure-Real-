import { Link } from "wouter";
import {
  Sparkles, Bot, Users, CreditCard, MapPin,
  Heart, Building2, Gift, Plane, ChevronRight, Star,
} from "lucide-react";

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  experienceType?: string | null;
  itineraryData?: any;
}

interface User {
  firstName?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
}

interface ServiceRec {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  title: string;
  context: string;
  description: string;
  cta: string;
  href: string;
  urgency?: "now" | "soon";
  priority: number;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function hasItinerary(trip: Trip): boolean {
  if (!trip.itineraryData) return false;
  if (typeof trip.itineraryData === "object") {
    return (trip.itineraryData as any)?.days?.length > 0;
  }
  return false;
}

const EXPERIENCE_META: Record<string, {
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  label: string;
  serviceHref: string;
  serviceTitle: string;
  serviceDesc: string;
}> = {
  wedding: {
    icon: <Heart className="w-5 h-5" />,
    iconBg: "bg-rose-100 text-rose-500 dark:bg-rose-900/40",
    accentColor: "border-l-rose-400",
    label: "Wedding",
    serviceHref: "/experiences/wedding/new",
    serviceTitle: "Wedding planning specialists",
    serviceDesc: "Connect with experts who specialise in destination weddings and luxury ceremony experiences.",
  },
  proposal: {
    icon: <Heart className="w-5 h-5" />,
    iconBg: "bg-pink-100 text-pink-500 dark:bg-pink-900/40",
    accentColor: "border-l-pink-400",
    label: "Proposal",
    serviceHref: "/experiences/proposal/new",
    serviceTitle: "Proposal specialists",
    serviceDesc: "Make the moment perfect with a dedicated proposal expert and hand-picked romantic settings.",
  },
  birthday: {
    icon: <Gift className="w-5 h-5" />,
    iconBg: "bg-amber-100 text-amber-500 dark:bg-amber-900/40",
    accentColor: "border-l-amber-400",
    label: "Birthday",
    serviceHref: "/experiences/birthday/new",
    serviceTitle: "Birthday experience experts",
    serviceDesc: "Plan an unforgettable celebration with expert-curated venues, surprises, and activities.",
  },
  corporate: {
    icon: <Building2 className="w-5 h-5" />,
    iconBg: "bg-slate-100 text-slate-500 dark:bg-slate-900/40",
    accentColor: "border-l-slate-400",
    label: "Corporate",
    serviceHref: "/experiences/corporate-events/new",
    serviceTitle: "Corporate event services",
    serviceDesc: "From team retreats to client events — managed end-to-end by corporate travel specialists.",
  },
};

function buildRecs(
  trips: Trip[] | null | undefined,
  credits: number | undefined,
  user: User | null | undefined
): ServiceRec[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const recs: ServiceRec[] = [];

  const active = (trips ?? []).filter((t) => {
    const s = new Date(t.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(t.endDate);   e.setHours(23, 59, 59, 999);
    return s <= now && e >= now;
  });

  const upcoming = (trips ?? [])
    .filter((t) => new Date(t.startDate) > now && t.status !== "cancelled")
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const hasTrips = (trips?.length ?? 0) > 0;

  // 1 — Active trip right now
  if (active.length > 0) {
    const trip = active[0];
    recs.push({
      id: "active-trip",
      icon: <MapPin className="w-5 h-5" />,
      iconBg: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
      accentColor: "border-l-green-500",
      title: "Your trip is happening now",
      context: trip.destination,
      description: "Open your live itinerary to see today's schedule, transport connections, and navigation.",
      cta: "Open Itinerary",
      href: `/itinerary/${trip.id}`,
      urgency: "now",
      priority: 1,
    });
  }

  // 2 — Upcoming trip with no itinerary yet
  const unplanned = upcoming.find((t) => !hasItinerary(t));
  if (unplanned) {
    const days = daysUntil(unplanned.startDate);
    recs.push({
      id: "generate-itinerary",
      icon: <Bot className="w-5 h-5" />,
      iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
      accentColor: "border-l-violet-500",
      title: "Generate your AI itinerary",
      context: `${unplanned.destination} · ${days <= 1 ? "Tomorrow" : `${days} days away`}`,
      description: "Let our AI plan your perfect day-by-day schedule with activities, transport, and expert notes.",
      cta: "Generate Now",
      href: `/itinerary/${unplanned.id}`,
      urgency: days <= 7 ? "now" : days <= 30 ? "soon" : undefined,
      priority: 2,
    });
  }

  // 3 — Experience-specific service for upcoming special trip
  const specialTrip = upcoming.find(
    (t) => t.experienceType && EXPERIENCE_META[t.experienceType]
  );
  if (specialTrip?.experienceType) {
    const meta = EXPERIENCE_META[specialTrip.experienceType];
    if (meta) {
      const days = daysUntil(specialTrip.startDate);
      recs.push({
        id: "experience-service",
        icon: meta.icon,
        iconBg: meta.iconBg,
        accentColor: meta.accentColor,
        title: meta.serviceTitle,
        context: `${specialTrip.destination} · ${days} days away`,
        description: meta.serviceDesc,
        cta: "Explore Services",
        href: meta.serviceHref,
        urgency: days <= 30 ? "soon" : undefined,
        priority: 3,
      });
    }
  }

  // 4 — Book an expert for a confirmed upcoming trip
  const confirmed = upcoming.find((t) => ["confirmed", "planning"].includes(t.status));
  if (confirmed && active.length === 0) {
    recs.push({
      id: "book-expert",
      icon: <Users className="w-5 h-5" />,
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
      accentColor: "border-l-blue-500",
      title: "Connect with a local expert",
      context: `For your ${confirmed.destination} trip`,
      description: "Get personalised insider tips, private tours, and on-the-ground support from a verified local.",
      cta: "Find Experts",
      href: "/chat",
      priority: 4,
    });
  }

  // 5 — Low credits
  if (credits !== undefined && credits < 50 && hasTrips) {
    recs.push({
      id: "top-up-credits",
      icon: <CreditCard className="w-5 h-5" />,
      iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
      accentColor: "border-l-amber-500",
      title: "Credits running low",
      context: `${credits} credit${credits !== 1 ? "s" : ""} remaining`,
      description: "Credits unlock AI itinerary generation, expert bookings, and premium experiences.",
      cta: "Top Up",
      href: "/credits",
      urgency: credits < 10 ? "now" : "soon",
      priority: 5,
    });
  }

  // 6 — No trips at all
  if (!hasTrips) {
    recs.push({
      id: "first-plan",
      icon: <Plane className="w-5 h-5" />,
      iconBg: "bg-[#FFE3E8] text-[#FF385C]",
      accentColor: "border-l-[#FF385C]",
      title: "Plan your first experience",
      context: "Getting started",
      description: "Tell us your dream destination and let our AI and expert team craft your perfect journey.",
      cta: "Start Planning",
      href: "/experiences",
      priority: 6,
    });
    recs.push({
      id: "browse-experts",
      icon: <Users className="w-5 h-5" />,
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
      accentColor: "border-l-blue-500",
      title: "Browse expert advisors",
      context: "Meet our specialists",
      description: "Our verified experts cover travel, weddings, proposals, corporate events, and more.",
      cta: "Meet the Experts",
      href: "/chat",
      priority: 7,
    });
  }

  // 7 — Profile incomplete
  if (!user?.bio || !user?.profileImageUrl) {
    recs.push({
      id: "complete-profile",
      icon: <Star className="w-5 h-5" />,
      iconBg: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
      accentColor: "border-l-purple-500",
      title: "Complete your profile",
      context: "Personalise your experience",
      description: "A complete profile helps our AI and experts tailor recommendations just for you.",
      cta: "Update Profile",
      href: "/profile",
      priority: 8,
    });
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, 2);
}

export function SmartServiceRecommendations({
  trips,
  credits,
  user,
}: {
  trips: Trip[] | null | undefined;
  credits: number | undefined;
  user: User | null | undefined;
}) {
  const recs = buildRecs(trips, credits, user);
  if (recs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[#FF385C]" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recommended for You
        </h2>
      </div>

      <div className="space-y-3">
        {recs.map((rec) => (
          <Link key={rec.id} href={rec.href}>
            <div
              className={`group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer border-l-4 ${rec.accentColor}`}
              data-testid={`service-rec-${rec.id}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${rec.iconBg}`}>
                {rec.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-sm text-foreground">{rec.title}</p>
                  {rec.urgency === "now" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                      Live
                    </span>
                  )}
                  {rec.urgency === "soon" && (
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                      Action needed
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{rec.context}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-1">{rec.description}</p>
              </div>

              <span className="flex items-center gap-1 text-xs font-semibold text-[#FF385C] group-hover:gap-2 transition-all flex-shrink-0">
                {rec.cta}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
