import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Plus, Loader2, MessageSquare, CreditCard, Bot, Calendar, Bookmark, Clock,
  ChevronRight, Plane, Heart, PartyPopper, Briefcase, MapPin, Users, Share2,
  Edit, Lightbulb, Zap
} from "lucide-react";
import { SiGoogle, SiApple } from "react-icons/si";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/dashboard-layout";
import { format, differenceInDays, getMonth } from "date-fns";
import { UserTemplateRecommendations } from "@/components/user/template-recommendations";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { detectMapsPlatform, openInMaps } from "@/lib/maps-platform";

const eventTypeIcons: Record<string, any> = {
  vacation: Plane,
  wedding: Heart,
  honeymoon: Heart,
  proposal: Heart,
  anniversary: Heart,
  birthday: PartyPopper,
  corporate: Briefcase,
  adventure: Plane,
};

const eventTypeVibeTags: Record<string, string[]> = {
  vacation: ["Explore", "Relaxation", "Culture"],
  travel: ["Adventure", "Explore", "Discovery"],
  wedding: ["Romantic", "Celebration", "Luxury"],
  honeymoon: ["Romantic", "Intimate", "Luxury"],
  proposal: ["Romantic", "Surprise", "Memorable"],
  anniversary: ["Romantic", "Celebration", "Fine Dining"],
  birthday: ["Fun", "Party", "Celebration"],
  corporate: ["Business", "Networking", "Professional"],
  adventure: ["Outdoors", "Thrill", "Nature"],
  "boys-trip": ["Fun", "Adventure", "Nightlife"],
  "girls-trip": ["Fun", "Spa", "Shopping"],
  "date-night": ["Romantic", "Foodie", "Intimate"],
  default: ["Travel", "Explore", "Adventure"],
};

function getVibeTags(eventType: string | null | undefined): string[] {
  return eventTypeVibeTags[eventType || "default"] || eventTypeVibeTags.default;
}

function getSeasonalTip(destination: string, startDate: string): string {
  const month = getMonth(new Date(startDate)); // 0-11
  const dest = destination.toLowerCase();

  if (month >= 11 || month <= 1) {
    return `Winter travel to ${destination} peaks in December — book heated stays early and check for holiday closures.`;
  } else if (month >= 2 && month <= 4) {
    return `Spring is shoulder season in ${destination} — expect better prices, fewer crowds, and pleasant weather.`;
  } else if (month >= 5 && month <= 7) {
    return `Peak summer in ${destination}: book flights 3+ months ahead and look for early-bird hotel deals.`;
  } else {
    return `Fall is ideal for ${destination} — golden foliage, cultural events, and lower accommodation rates.`;
  }
}

function getDestinationPhotoUrl(destination: string): string {
  return `https://source.unsplash.com/800x400/?${encodeURIComponent(destination)},travel,landmark`;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
}

interface TripScore {
  tripId: string;
  optimizationScore: number | null;
  shareToken: string | null;
}

function PlanCard({ trip, score, i }: { trip: any; score: TripScore | undefined; i: number }) {
  const { toast } = useToast();

  const vibeTags = getVibeTags(trip.eventType);
  const tip = getSeasonalTip(trip.destination, trip.startDate);
  const photoUrl = getDestinationPhotoUrl(trip.destination);
  const optimizationScore = score?.optimizationScore;
  const shareToken = score?.shareToken;

  const daysUntil = differenceInDays(new Date(trip.startDate), new Date());
  const statusLabel = daysUntil > 0
    ? (daysUntil <= 30 ? `${daysUntil}d away` : "Upcoming")
    : "Planning";

  const destinationParts = trip.destination.split(",");
  const city = destinationParts[0]?.trim() || trip.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";

  function handleGoogleMaps() {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination)}`;
    openInMaps(url);
  }

  function handleAppleMaps() {
    const platform = detectMapsPlatform();
    const query = encodeURIComponent(trip.destination);
    if (platform === "apple") {
      openInMaps(`maps://?q=${query}`);
    } else {
      openInMaps(`https://maps.apple.com/?q=${query}`);
    }
  }

  async function handleShare() {
    const shareUrl = shareToken
      ? `${window.location.origin}/itinerary-view/${shareToken}`
      : `${window.location.origin}/itinerary/${trip.id}`;
    if (navigator.share) {
      navigator.share({ title: `${trip.title} • Traveloure`, url: shareUrl }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(shareUrl).catch(() => {});
      toast({ title: "Link copied!", description: "Share link copied to clipboard." });
    }
  }

  return (
    <motion.div
      key={trip.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08 }}
    >
      <Card
        className="overflow-hidden border border-[#E5E7EB] hover:shadow-xl transition-all duration-300 group"
        data-testid={`card-plan-${trip.id}`}
      >
        {/* Photo Hero */}
        <div className="relative h-44 overflow-hidden">
          <img
            src={photoUrl}
            alt={trip.destination}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-3 left-3 flex gap-2 items-center">
            <Badge className="bg-[#FF385C] text-white border-0 text-xs font-semibold gap-1 px-2 py-1">
              <Zap className="w-3 h-3" />
              {statusLabel}
            </Badge>
            {trip.numberOfTravelers && trip.numberOfTravelers > 1 && (
              <Badge className="bg-black/50 text-white border-0 text-xs backdrop-blur-sm gap-1 px-2 py-1">
                <Users className="w-3 h-3" />
                {trip.numberOfTravelers}
              </Badge>
            )}
          </div>

          {/* Score badge top-right */}
          {optimizationScore != null && (
            <div
              className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-md"
              data-testid={`badge-score-${trip.id}`}
            >
              <span className="text-sm font-bold text-[#111827]">{optimizationScore}</span>
            </div>
          )}

          {/* Destination overlay text */}
          <div className="absolute bottom-3 left-4">
            <h3 className="text-white text-xl font-bold leading-tight drop-shadow-sm" data-testid={`text-plan-city-${trip.id}`}>
              {city}
            </h3>
            {country && (
              <div className="flex items-center gap-1 text-white/85 text-xs mt-0.5">
                <MapPin className="w-3 h-3" />
                <span>{country}</span>
              </div>
            )}
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Trip title & dates */}
          <div>
            <p className="font-semibold text-[#111827] dark:text-white text-sm leading-snug" data-testid={`text-plan-title-${trip.id}`}>
              {trip.title}
            </p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {format(new Date(trip.startDate), "MMM d")} – {format(new Date(trip.endDate), "MMM d, yyyy")}
            </p>
          </div>

          {/* Vibe tags */}
          <div className="flex flex-wrap gap-1.5">
            {vibeTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#374151] dark:bg-gray-700 dark:text-gray-200"
              >
                {tag}
              </Badge>
            ))}
            {trip.budget && (
              <span className="text-xs font-semibold text-[#111827] dark:text-white ml-auto">
                ${Number(trip.budget).toLocaleString()}
              </span>
            )}
          </div>

          {/* Seasonal insight tip */}
          <div className="flex items-start gap-2 bg-green-50 dark:bg-green-950/20 rounded-lg p-2.5 border border-green-100 dark:border-green-900/40">
            <Lightbulb className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">{tip}</p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <button
              onClick={handleGoogleMaps}
              data-testid={`button-google-maps-${trip.id}`}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-[#F9FAFB] dark:bg-gray-800 hover:bg-[#F3F4F6] dark:hover:bg-gray-700 transition-colors text-[#374151] dark:text-gray-200 group/btn"
              title="Open in Google Maps"
            >
              <SiGoogle className="w-4 h-4 text-[#4285F4]" />
              <span className="text-[10px] font-medium leading-none">Google</span>
            </button>

            <button
              onClick={handleAppleMaps}
              data-testid={`button-apple-maps-${trip.id}`}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-[#F9FAFB] dark:bg-gray-800 hover:bg-[#F3F4F6] dark:hover:bg-gray-700 transition-colors text-[#374151] dark:text-gray-200"
              title="Open in Apple Maps"
            >
              <SiApple className="w-4 h-4 text-[#555]" />
              <span className="text-[10px] font-medium leading-none">Apple</span>
            </button>

            <button
              onClick={handleShare}
              data-testid={`button-share-${trip.id}`}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-[#F9FAFB] dark:bg-gray-800 hover:bg-[#F3F4F6] dark:hover:bg-gray-700 transition-colors text-[#374151] dark:text-gray-200"
              title="Share itinerary"
            >
              <Share2 className="w-4 h-4 text-[#FF385C]" />
              <span className="text-[10px] font-medium leading-none">Share</span>
            </button>

            <Link href={`/trip/${trip.id}`}>
              <button
                data-testid={`button-modify-${trip.id}`}
                className="w-full flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-[#F9FAFB] dark:bg-gray-800 hover:bg-[#F3F4F6] dark:hover:bg-gray-700 transition-colors text-[#374151] dark:text-gray-200"
                title="Modify plan"
              >
                <Edit className="w-4 h-4 text-[#8B5CF6]" />
                <span className="text-[10px] font-medium leading-none">Modify</span>
              </button>
            </Link>
          </div>

          {/* View Itinerary link */}
          <Link href={`/itinerary/${trip.id}`}>
            <Button
              size="sm"
              className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white text-xs font-semibold"
              data-testid={`button-view-itinerary-${trip.id}`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              View Full Itinerary
            </Button>
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData } = useQuery<any[]>({ queryKey: ["/api/notifications"] });
  const { data: walletData } = useQuery<{ credits: number }>({ queryKey: ["/api/wallet"] });
  const { data: tripScores } = useQuery<TripScore[]>({
    queryKey: ["/api/dashboard/trip-scores"],
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF385C]" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
          <p className="text-[#6B7280] mt-2">Could not load your trips. Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const activeTrips = trips?.filter(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    return start <= now && end >= now;
  }) || [];

  const upcomingTrips = trips?.filter(t => new Date(t.startDate) > now) || [];
  const allPlans = trips || [];

  const recentActivity = (notificationsData ?? []).slice(0, 4).map((n: any, index: number) => ({
    id: index + 1,
    message: n.title ?? n.message ?? "New notification",
    time: n.createdAt ? getRelativeTime(n.createdAt) : "Recently",
  }));

  const stats = [
    { label: "Active Plans", value: activeTrips.length + upcomingTrips.filter(t => t.status === "planning").length, icon: Calendar, color: "bg-[#FFE3E8] text-[#FF385C]" },
    { label: "Upcoming Events", value: upcomingTrips.length, icon: Clock, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
    { label: "Credits Balance", value: walletData?.credits ?? 0, icon: CreditCard, color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
    { label: "Saved Items", value: 0, icon: Bookmark, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  ];

  const scoreMap = new Map(tripScores?.map(s => [s.tripId, s]) ?? []);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#111827] dark:text-white" data-testid="text-welcome">
              Welcome back, {user?.firstName || 'Traveler'}!
            </h1>
            <p className="text-[#6B7280] mt-1">
              Ready for your next adventure?
            </p>
          </div>
          <Link href="/experiences">
            <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white font-semibold" data-testid="button-new-plan">
              <Plus className="w-4 h-4 mr-2" />
              Create New Plan
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="border border-[#E5E7EB]" data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#111827] dark:text-white" data-testid={`text-stat-value-${i}`}>{stat.value}</p>
                    <p className="text-sm text-[#6B7280]">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Your Active Plans */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#111827] dark:text-white">Your Active Plans</h2>
            <Link href="/my-trips">
              <Button variant="ghost" className="text-[#FF385C] hover:text-[#E23350]" data-testid="link-view-all-plans">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          {allPlans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {allPlans.slice(0, 6).map((trip, i) => (
                <PlanCard
                  key={trip.id}
                  trip={trip}
                  score={scoreMap.get(trip.id)}
                  i={i}
                />
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-[#E5E7EB]">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-[#FF385C]" />
                </div>
                <h3 className="text-lg font-semibold text-[#111827] dark:text-white mb-2">No plans yet</h3>
                <p className="text-[#6B7280] mb-4">Start planning your next adventure!</p>
                <Link href="/experiences">
                  <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-first-plan">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Plan
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Create New Plan Card */}
        <Card className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold mb-2">What's your next experience?</h3>
                <p className="text-white/80">Create a new plan and let our AI and experts help you.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/experiences/travel/new">
                  <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-quick-travel">
                    Travel
                  </Button>
                </Link>
                <Link href="/experiences/wedding/new">
                  <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-quick-wedding">
                    Wedding
                  </Button>
                </Link>
                <Link href="/experiences/proposal/new">
                  <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-quick-proposal">
                    Proposal
                  </Button>
                </Link>
                <Link href="/experiences/birthday/new">
                  <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-quick-birthday">
                    Birthday
                  </Button>
                </Link>
                <Link href="/experiences/corporate-events/new">
                  <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-quick-corporate">
                    Corporate
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Recent Activity */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card className="border border-[#E5E7EB]">
            <CardHeader>
              <CardTitle className="text-lg text-[#111827] dark:text-white">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/chat" className="block">
                <Button variant="outline" className="w-full justify-start text-[#6B7280] hover:text-[#111827]" data-testid="button-quick-message">
                  <MessageSquare className="w-5 h-5 mr-3 text-blue-500" />
                  Message Expert
                </Button>
              </Link>
              <Link href="/credits" className="block">
                <Button variant="outline" className="w-full justify-start text-[#6B7280] hover:text-[#111827]" data-testid="button-quick-credits">
                  <CreditCard className="w-5 h-5 mr-3 text-green-500" />
                  Buy Credits
                </Button>
              </Link>
              <Link href="/ai-assistant" className="block">
                <Button variant="outline" className="w-full justify-start text-[#6B7280] hover:text-[#111827]" data-testid="button-quick-ai">
                  <Bot className="w-5 h-5 mr-3 text-[#FF385C]" />
                  AI Assistant
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border border-[#E5E7EB]">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg text-[#111827] dark:text-white">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-activity">
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity: any) => (
                    <div key={activity.id} className="flex items-start gap-3" data-testid={`activity-${activity.id}`}>
                      <div className="w-2 h-2 rounded-full bg-[#FF385C] mt-2 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#111827] dark:text-white">{activity.message}</p>
                        <p className="text-xs text-[#9CA3AF]">{activity.time}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#6B7280]">No recent activity</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trending Recommendations */}
        <UserTemplateRecommendations />
      </div>
    </DashboardLayout>
  );
}
