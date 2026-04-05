import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Plus, Loader2, MessageSquare, CreditCard, Bot, Calendar, Bookmark, Clock,
  ChevronRight, MapPin, Sparkles, Users, Bell, HelpCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard-layout";
import { UserTemplateRecommendations } from "@/components/user/template-recommendations";
import { SmartServiceRecommendations } from "@/components/SmartServiceRecommendations";
import { useQuery } from "@tanstack/react-query";
import { PlanCard } from "@/components/plancard/PlanCard";

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

const QUICK_ACTIONS = [
  {
    href: "/chat",
    icon: MessageSquare,
    label: "Message Expert",
    description: "Chat with a travel expert",
    color: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    border: "border-blue-100 dark:border-blue-900",
    testId: "button-quick-message",
  },
  {
    href: "/help",
    icon: HelpCircle,
    label: "Help Centre",
    description: "Browse guides & support",
    color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-100 dark:border-emerald-900",
    testId: "button-quick-help",
  },
  {
    href: "/ai-assistant",
    icon: Bot,
    label: "AI Assistant",
    description: "Get smart travel suggestions",
    color: "bg-rose-50 dark:bg-rose-950/40 text-[#FF385C]",
    border: "border-rose-100 dark:border-rose-900",
    testId: "button-quick-ai",
  },
  {
    href: "/discover",
    icon: Sparkles,
    label: "Discover",
    description: "Explore trending experiences",
    color: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
    border: "border-violet-100 dark:border-violet-900",
    testId: "button-quick-discover",
  },
];

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData } = useQuery<any[]>({ queryKey: ["/api/notifications"] });
  const { data: walletData } = useQuery<{ credits: number }>({ queryKey: ["/api/wallet"] });
  const { data: tripScores } = useQuery<TripScore[]>({
    queryKey: ["/api/dashboard/trip-scores"],
  });
  const { data: savedTrips } = useQuery<any[]>({
    queryKey: ["/api/saved-trips"],
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

  const recentActivity = (notificationsData ?? []).slice(0, 5).map((n: any, index: number) => ({
    id: index + 1,
    message: n.title ?? n.message ?? "New notification",
    time: n.createdAt ? getRelativeTime(n.createdAt) : "Recently",
    type: n.type ?? "info",
  }));

  const stats = [
    { label: "Active Plans", value: activeTrips.length + upcomingTrips.filter(t => t.status === "planning").length, icon: Calendar, color: "bg-[#FFE3E8] text-[#FF385C]" },
    { label: "Upcoming Events", value: upcomingTrips.length, icon: Clock, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
    { label: "Credits Balance", value: walletData?.credits ?? 0, icon: CreditCard, color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
    { label: "Saved Items", value: savedTrips?.length ?? 0, icon: Bookmark, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
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

        {/* Smart Service Recommendations */}
        <SmartServiceRecommendations
          trips={trips}
          credits={walletData?.credits}
          user={user}
        />

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
                  index={i}
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

        {/* Saved Trips */}
        {savedTrips && savedTrips.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#111827] dark:text-white">
                <Bookmark className="w-5 h-5 inline mr-2 text-purple-500" />
                Saved Trips
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {savedTrips.map((saved: any, i: number) => {
                const matchedTrip = allPlans.find((t) => t.id === saved.trip_id);
                if (matchedTrip) {
                  return (
                    <PlanCard
                      key={saved.id}
                      trip={matchedTrip}
                      score={scoreMap.get(matchedTrip.id)}
                      index={i}
                    />
                  );
                }
                return (
                  <motion.div
                    key={saved.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Link href={`/itinerary-comparison/${saved.comparison_id}`}>
                      <Card className="border border-border hover:shadow-md transition-shadow cursor-pointer p-5" data-testid={`card-saved-trip-${saved.id}`}>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-foreground text-base">{saved.variant_name || saved.destination || "Saved Itinerary"}</h3>
                          <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-1 rounded-full shrink-0 ml-2">Saved</span>
                        </div>
                        {saved.destination && <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" />{saved.destination}</p>}
                        {(saved.start_date || saved.end_date) && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {saved.start_date && new Date(saved.start_date).toLocaleDateString()}
                            {saved.end_date && ` – ${new Date(saved.end_date).toLocaleDateString()}`}
                          </p>
                        )}
                        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Saved {new Date(saved.saved_at).toLocaleDateString()}</span>
                          <Button variant="ghost" size="sm" className="text-primary h-auto p-0 text-xs">View Details <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick Actions + Recent Activity */}
        <div className="grid md:grid-cols-5 gap-6">
          {/* Quick Actions — wider */}
          <div className="md:col-span-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-[#111827] dark:text-white">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.testId} href={action.href} className="block group">
                  <div
                    className={`rounded-xl border p-4 flex items-start gap-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 bg-card ${action.border}`}
                    data-testid={action.testId}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${action.color}`}>
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground leading-tight">{action.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{action.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* What's your next experience — moved here, compact */}
            <div className="rounded-xl bg-gradient-to-r from-[#FF385C] to-[#E23350] p-4 text-white">
              <p className="font-bold text-sm mb-2">What's your next experience?</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "✈️ Travel", href: "/experiences/travel/new", testId: "button-quick-travel" },
                  { label: "💍 Wedding", href: "/experiences/wedding/new", testId: "button-quick-wedding" },
                  { label: "💝 Proposal", href: "/experiences/proposal/new", testId: "button-quick-proposal" },
                  { label: "🎂 Birthday", href: "/experiences/birthday/new", testId: "button-quick-birthday" },
                  { label: "🏢 Corporate", href: "/experiences/corporate-events/new", testId: "button-quick-corporate" },
                ].map(({ label, href, testId }) => (
                  <Link key={testId} href={href}>
                    <button
                      className="bg-white/20 hover:bg-white/30 transition-colors text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20"
                      data-testid={testId}
                    >
                      {label}
                    </button>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity — narrower */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#111827] dark:text-white">Recent Activity</h2>
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="text-[#FF385C] hover:text-[#E23350] h-auto py-1 px-2 text-xs" data-testid="button-view-all-activity">
                  View All
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] dark:border-border bg-card h-full min-h-[200px] p-4">
              {recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3" data-testid={`activity-${activity.id}`}>
                      <div className="w-7 h-7 rounded-full bg-[#FFE3E8] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bell className="w-3.5 h-3.5 text-[#FF385C]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No activity yet</p>
                  <p className="text-xs text-muted-foreground max-w-[160px]">
                    Your bookings and updates will appear here
                  </p>
                  <Link href="/experiences">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 text-xs border-[#FF385C] text-[#FF385C] hover:bg-[#FFE3E8]"
                      data-testid="button-activity-cta"
                    >
                      <Plus className="w-3 h-3 mr-1.5" />
                      Start a plan
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trending Recommendations */}
        <UserTemplateRecommendations />
      </div>
    </DashboardLayout>
  );
}
