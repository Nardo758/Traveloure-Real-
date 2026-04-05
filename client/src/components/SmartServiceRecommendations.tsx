import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Bot, Users, CreditCard, Calendar, MapPin,
  Heart, Building2, Gift, Plane, ChevronRight, Star, AlertCircle,
} from "lucide-react";

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  experienceType?: string | null;
  itineraryData?: any;
  title?: string;
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
  title: string;
  context: string;
  description: string;
  cta: string;
  href: string;
  urgency?: "now" | "soon" | "whenever";
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
    const keys = Object.keys(trip.itineraryData);
    return keys.length > 0 && trip.itineraryData.days?.length > 0;
  }
  return false;
}

const EXPERIENCE_CONFIG: Record<string, { emoji: string; label: string; serviceHref: string; serviceLabel: string }> = {
  wedding: { emoji: "💍", label: "Wedding", serviceHref: "/experiences/wedding/new", serviceLabel: "Wedding Planning Services" },
  proposal: { emoji: "💝", label: "Proposal", serviceHref: "/experiences/proposal/new", serviceLabel: "Proposal Specialists" },
  birthday: { emoji: "🎂", label: "Birthday", serviceHref: "/experiences/birthday/new", serviceLabel: "Birthday Experiences" },
  corporate: { emoji: "🏢", label: "Corporate", serviceHref: "/experiences/corporate-events/new", serviceLabel: "Corporate Event Services" },
  romance: { emoji: "❤️", label: "Romance", serviceHref: "/experiences/proposal/new", serviceLabel: "Romance Packages" },
  travel: { emoji: "✈️", label: "Travel", serviceHref: "/experiences/travel/new", serviceLabel: "Travel Experiences" },
  "boys-trip": { emoji: "🧳", label: "Boys Trip", serviceHref: "/experiences/travel/new", serviceLabel: "Group Travel Experiences" },
  "girls-trip": { emoji: "👯", label: "Girls Trip", serviceHref: "/experiences/travel/new", serviceLabel: "Group Travel Experiences" },
};

export function SmartServiceRecommendations({
  trips,
  credits,
  user,
}: {
  trips: Trip[] | null | undefined;
  credits: number | undefined;
  user: User | null | undefined;
}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const activeTrips = (trips ?? []).filter((t) => {
    const s = new Date(t.startDate);
    const e = new Date(t.endDate);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return s <= now && e >= now;
  });

  const upcomingTrips = (trips ?? [])
    .filter((t) => new Date(t.startDate) > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const hasAnyTrips = (trips?.length ?? 0) > 0;
  const recs: ServiceRec[] = [];

  // ── Priority 1: Active trip today ─────────────────────────────────────────
  for (const trip of activeTrips.slice(0, 1)) {
    recs.push({
      id: "active-trip",
      icon: <MapPin className="w-5 h-5" />,
      iconBg: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
      title: "Your trip is happening now!",
      context: `${trip.destination}`,
      description: "Open your live itinerary to see today's activities, transport connections, and navigation.",
      cta: "Open Itinerary",
      href: `/itinerary/${trip.id}`,
      urgency: "now",
      priority: 1,
    });
  }

  // ── Priority 2: Upcoming trip without itinerary ────────────────────────────
  const unplannedTrip = upcomingTrips.find((t) => !hasItinerary(t) && t.status !== "cancelled");
  if (unplannedTrip) {
    const days = daysUntil(unplannedTrip.startDate);
    recs.push({
      id: "generate-itinerary",
      icon: <Bot className="w-5 h-5" />,
      iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
      title: "Generate your AI itinerary",
      context: `${unplannedTrip.destination} · ${days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days} days away`}`,
      description: "Let our AI plan your perfect day-by-day schedule with activities, transport, and expert notes.",
      cta: "Generate Now",
      href: `/itinerary/${unplannedTrip.id}`,
      urgency: days <= 7 ? "now" : days <= 30 ? "soon" : "whenever",
      priority: 2,
    });
  }

  // ── Priority 3: Upcoming trip without expert booking ────────────────────────
  const confirmedTrip = upcomingTrips.find((t) => t.status === "confirmed" || t.status === "planning");
  if (confirmedTrip && activeTrips.length === 0) {
    const days = daysUntil(confirmedTrip.startDate);
    recs.push({
      id: "book-expert",
      icon: <Users className="w-5 h-5" />,
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
      title: "Connect with a local expert",
      context: `For your ${confirmedTrip.destination} trip`,
      description: `Get personalized insider tips, private tours, and on-the-ground support from a verified local.`,
      cta: "Find Experts",
      href: "/chat",
      urgency: days <= 14 ? "soon" : "whenever",
      priority: 3,
    });
  }

  // ── Priority 4: Experience-specific services ───────────────────────────────
  const specialTrip = upcomingTrips.find(
    (t) => t.experienceType && t.experienceType !== "travel" && EXPERIENCE_CONFIG[t.experienceType]
  );
  if (specialTrip && specialTrip.experienceType) {
    const cfg = EXPERIENCE_CONFIG[specialTrip.experienceType];
    if (cfg) {
      const days = daysUntil(specialTrip.startDate);
      const icon =
        specialTrip.experienceType === "wedding" ? <Heart className="w-5 h-5" /> :
        specialTrip.experienceType === "corporate" ? <Building2 className="w-5 h-5" /> :
        specialTrip.experienceType === "birthday" ? <Gift className="w-5 h-5" /> :
        <Star className="w-5 h-5" />;
      recs.push({
        id: "experience-service",
        icon,
        iconBg: "bg-rose-100 text-[#FF385C] dark:bg-rose-900/40",
        title: cfg.serviceLabel,
        context: `${cfg.emoji} ${specialTrip.destination} · ${days} days away`,
        description: `We have specialist experts and curated services tailored for ${cfg.label.toLowerCase()} experiences.`,
        cta: "Explore Services",
        href: cfg.serviceHref,
        urgency: days <= 30 ? "soon" : "whenever",
        priority: 4,
      });
    }
  }

  // ── Priority 5: Low credits ────────────────────────────────────────────────
  if (credits !== undefined && credits < 50 && hasAnyTrips) {
    recs.push({
      id: "top-up-credits",
      icon: <CreditCard className="w-5 h-5" />,
      iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
      title: "Credits running low",
      context: `${credits} credit${credits !== 1 ? "s" : ""} remaining`,
      description: "Credits unlock AI itinerary generation, expert bookings, and premium experiences.",
      cta: "Top Up Credits",
      href: "/credits",
      urgency: credits < 10 ? "now" : "soon",
      priority: 5,
    });
  }

  // ── Priority 6: No trips at all → getting started ─────────────────────────
  if (!hasAnyTrips) {
    recs.push({
      id: "first-plan",
      icon: <Plane className="w-5 h-5" />,
      iconBg: "bg-[#FFE3E8] text-[#FF385C]",
      title: "Plan your first experience",
      context: "Getting started",
      description: "Tell us your dream destination and let our AI and expert team craft your perfect journey.",
      cta: "Start Planning",
      href: "/experiences",
      urgency: "whenever",
      priority: 6,
    });
    recs.push({
      id: "explore-experts",
      icon: <Users className="w-5 h-5" />,
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
      title: "Browse expert advisors",
      context: "Meet our specialists",
      description: "Our verified experts cover travel, weddings, proposals, corporate events, and more.",
      cta: "Meet the Experts",
      href: "/chat",
      urgency: "whenever",
      priority: 7,
    });
  }

  // ── Priority 7: Profile incomplete ────────────────────────────────────────
  if (!user?.bio || !user?.profileImageUrl) {
    recs.push({
      id: "complete-profile",
      icon: <Star className="w-5 h-5" />,
      iconBg: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
      title: "Complete your profile",
      context: "Personalize your experience",
      description: "A full profile helps our AI and experts tailor recommendations and services just for you.",
      cta: "Update Profile",
      href: "/profile",
      urgency: "whenever",
      priority: 8,
    });
  }

  const visible = recs
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4);

  if (visible.length === 0) return null;

  const urgencyBadge = (u?: "now" | "soon" | "whenever") => {
    if (u === "now") return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
        Now
      </span>
    );
    if (u === "soon") return (
      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        Action needed
      </span>
    );
    return null;
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-[#111827] dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FF385C]" />
            Recommended for You
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personalised based on your plans and profile
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((rec) => (
          <Link key={rec.id} href={rec.href}>
            <div
              className="group flex gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full"
              data-testid={`service-rec-${rec.id}`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${rec.iconBg}`}>
                {rec.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-sm text-foreground leading-snug">{rec.title}</p>
                  {urgencyBadge(rec.urgency)}
                </div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {rec.context}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{rec.description}</p>
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-[#FF385C] group-hover:gap-2 transition-all">
                  {rec.cta}
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
