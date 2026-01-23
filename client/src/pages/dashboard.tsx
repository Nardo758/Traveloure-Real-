import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, MessageSquare, CreditCard, Bot, Calendar, Bookmark, Clock, ChevronRight, Plane, Heart, PartyPopper, Briefcase } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/dashboard-layout";
import { format, differenceInDays } from "date-fns";

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

const recentActivity = [
  { id: 1, message: "AI completed your Tokyo itinerary", time: "2 hours ago" },
  { id: 2, message: "You saved a restaurant in Paris", time: "5 hours ago" },
  { id: 3, message: "Expert Yuki M. sent you a message", time: "Yesterday" },
  { id: 4, message: "New deal available for Bali trips", time: "2 days ago" },
];

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();

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

  const stats = [
    { label: "Active Plans", value: activeTrips.length + upcomingTrips.filter(t => t.status === "planning").length, icon: Calendar, color: "bg-[#FFE3E8] text-[#FF385C]" },
    { label: "Upcoming Events", value: upcomingTrips.length, icon: Clock, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
    { label: "Credits Balance", value: 150, icon: CreditCard, color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
    { label: "Saved Items", value: 12, icon: Bookmark, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  ];

  const getProgressValue = (trip: any) => {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const total = differenceInDays(end, start);
    if (total <= 0) return 100;
    const elapsed = differenceInDays(now, start);
    if (elapsed < 0) return Math.min(Math.random() * 60 + 20, 95);
    if (elapsed > total) return 100;
    return Math.round((elapsed / total) * 100);
  };

  const getStatusBadge = (trip: any) => {
    const start = new Date(trip.startDate);
    if (start > now) {
      const days = differenceInDays(start, now);
      if (days <= 30) return { label: `${days} days away`, variant: "default" as const };
      return { label: "Upcoming", variant: "secondary" as const };
    }
    return { label: "Planning", variant: "outline" as const };
  };

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
            <div className="space-y-4">
              {allPlans.slice(0, 3).map((trip, i) => {
                const Icon = eventTypeIcons[trip.eventType || "vacation"] || Plane;
                const progress = getProgressValue(trip);
                const status = getStatusBadge(trip);
                
                return (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card className="border border-[#E5E7EB] hover:shadow-md transition-shadow" data-testid={`card-plan-${trip.id}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-lg bg-[#FFE3E8] flex items-center justify-center flex-shrink-0">
                            <Icon className="w-6 h-6 text-[#FF385C]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <h3 className="font-semibold text-[#111827] dark:text-white truncate" data-testid={`text-plan-title-${trip.id}`}>
                                  {trip.title}
                                </h3>
                                <p className="text-sm text-[#6B7280]">
                                  {format(new Date(trip.startDate), "MMM d")} - {format(new Date(trip.endDate), "MMM d, yyyy")} • {trip.destination}
                                </p>
                              </div>
                              <Badge variant={status.variant} className="flex-shrink-0" data-testid={`badge-status-${trip.id}`}>
                                {status.label}
                              </Badge>
                            </div>
                            
                            <div className="mb-3">
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-[#6B7280]">Progress</span>
                                <span className="font-medium text-[#111827] dark:text-white">{progress}%</span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/trip/${trip.id}`}>
                                <Button size="sm" variant="outline" data-testid={`button-view-plan-${trip.id}`}>
                                  Open Plan
                                </Button>
                              </Link>
                              <Link href={`/itinerary/${trip.id}`}>
                                <Button size="sm" variant="default" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-view-itinerary-${trip.id}`}>
                                  <Calendar className="w-4 h-4 mr-1" />
                                  View Itinerary
                                </Button>
                              </Link>
                              <Link href="/chat">
                                <Button size="sm" variant="ghost" className="text-[#6B7280]" data-testid={`button-chat-${trip.id}`}>
                                  <MessageSquare className="w-4 h-4 mr-1" />
                                  Chat with Expert
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
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
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3" data-testid={`activity-${activity.id}`}>
                    <div className="w-2 h-2 rounded-full bg-[#FF385C] mt-2 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] dark:text-white">{activity.message}</p>
                      <p className="text-xs text-[#9CA3AF]">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
