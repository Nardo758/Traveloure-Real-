import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Users,
  MapPin,
  Calendar,
  Plane,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3,
  Briefcase,
  Heart,
  Star,
  MessageSquare,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Trip } from "@shared/schema";

// §13: `trips.status` is a dead write-once field (born draft/planning at creation, nothing ever
// advances it) — do not read it for phase. Phase is derived from dates instead, mirroring the
// convention every traveler-facing renderer already uses (client/src/pages/my-trips.tsx). See
// docs/briefs/L3-trips-status-brief.md (Option B, ratified Jul 31, 2026).
type TripPhase = "upcoming" | "active" | "past";

function deriveTripPhase(trip: Pick<Trip, "startDate" | "endDate">, now: Date): TripPhase {
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (end < now) return "past";
  if (start <= now && end >= now) return "active";
  return "upcoming";
}

interface TripStats {
  total: number;
  upcoming: number;
  active: number;
  past: number;
}

export default function ExecutiveAssistant() {
  const [, setLocation] = useLocation();

  const { data: trips = [], isLoading: loadingTrips } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const now = new Date();

  const stats: TripStats = {
    total: trips.length,
    upcoming: trips.filter(t => deriveTripPhase(t, now) === "upcoming").length,
    active: trips.filter(t => deriveTripPhase(t, now) === "active").length,
    past: trips.filter(t => deriveTripPhase(t, now) === "past").length,
  };

  const upcomingTrips = trips
    .filter(t => t.startDate && new Date(t.startDate) > new Date())
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())
    .slice(0, 5);

  const recentTrips = trips
    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
    .slice(0, 5);

  const getStatusColor = (phase: TripPhase) => {
    switch (phase) {
      case "active":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "past":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "upcoming":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getEventTypeIcon = (eventType: string | null) => {
    switch (eventType) {
      case "wedding":
      case "honeymoon":
      case "proposal":
      case "anniversary":
        return Heart;
      case "corporate":
        return Briefcase;
      default:
        return Plane;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/dashboard")}
            className="mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary rounded-lg">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                Executive Assistant
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and oversee all travel operations
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700" data-testid="card-stat-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Plane className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total Trips</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700" data-testid="card-stat-active">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Active Trips</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700" data-testid="card-stat-past">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.past}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Past</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700" data-testid="card-stat-upcoming-count">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.upcoming}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Upcoming</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">
              <Calendar className="w-4 h-4 mr-2" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="recent" data-testid="tab-recent">
              <Clock className="w-4 h-4 mr-2" />
              Recent
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              <Plane className="w-4 h-4 mr-2" />
              All Trips
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Upcoming Trips</CardTitle>
                <CardDescription>Trips scheduled for the future</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTrips ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400" />
                  </div>
                ) : upcomingTrips.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 mx-auto text-gray-600 dark:text-gray-400 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No upcoming trips scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingTrips.map((trip) => {
                      const EventIcon = getEventTypeIcon(trip.eventType);
                      return (
                        <div
                          key={trip.id}
                          className="flex items-center gap-4 p-4 rounded-lg border bg-card cursor-pointer transition-all"
                          onClick={() => setLocation(`/trip/${trip.id}`)}
                          data-testid={`card-trip-${trip.id}`}
                        >
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <EventIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{trip.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <MapPin className="w-3 h-3" />
                              <span>{trip.destination}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {trip.startDate ? new Date(trip.startDate).toLocaleDateString() : "No date"}
                            </p>
                            <Badge className={cn("mt-1", getStatusColor(deriveTripPhase(trip, now)))}>
                              {deriveTripPhase(trip, now)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Recently Created</CardTitle>
                <CardDescription>Latest trips added to the system</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTrips ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400" />
                  </div>
                ) : recentTrips.length === 0 ? (
                  <div className="text-center py-12">
                    <Plane className="w-12 h-12 mx-auto text-gray-600 dark:text-gray-400 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No trips created yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentTrips.map((trip) => {
                      const EventIcon = getEventTypeIcon(trip.eventType);
                      return (
                        <div
                          key={trip.id}
                          className="flex items-center gap-4 p-4 rounded-lg border bg-card cursor-pointer transition-all"
                          onClick={() => setLocation(`/trip/${trip.id}`)}
                          data-testid={`card-trip-${trip.id}`}
                        >
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <EventIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{trip.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <MapPin className="w-3 h-3" />
                              <span>{trip.destination}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Created {trip.createdAt ? new Date(trip.createdAt).toLocaleDateString() : ""}
                            </p>
                            <Badge className={cn("mt-1", getStatusColor(deriveTripPhase(trip, now)))}>
                              {deriveTripPhase(trip, now)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">All Trips</CardTitle>
                <CardDescription>Complete overview of all trips</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {loadingTrips ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400" />
                    </div>
                  ) : trips.length === 0 ? (
                    <div className="text-center py-12">
                      <Plane className="w-12 h-12 mx-auto text-gray-600 dark:text-gray-400 mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">No trips available</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pr-4">
                      {trips.map((trip) => {
                        const EventIcon = getEventTypeIcon(trip.eventType);
                        return (
                          <div
                            key={trip.id}
                            className="flex items-center gap-4 p-4 rounded-lg border bg-card cursor-pointer transition-all"
                            onClick={() => setLocation(`/trip/${trip.id}`)}
                            data-testid={`card-trip-${trip.id}`}
                          >
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <EventIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold truncate">{trip.title}</h3>
                                {trip.eventType && (
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {trip.eventType}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{trip.destination}</span>
                                </div>
                                {trip.numberOfTravelers && (
                                  <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    <span>{trip.numberOfTravelers}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {trip.startDate && (
                                <p className="text-sm font-medium">
                                  {new Date(trip.startDate).toLocaleDateString()}
                                </p>
                              )}
                              <Badge className={cn("mt-1", getStatusColor(deriveTripPhase(trip, now)))}>
                                {deriveTripPhase(trip, now)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => setLocation("/experiences")}
                data-testid="button-quick-new-trip"
              >
                <Plane className="w-4 h-4 mr-2" />
                Plan Experience
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => setLocation("/ai-assistant")}
                data-testid="button-quick-ai-assistant"
              >
                <Star className="w-4 h-4 mr-2" />
                Open AI Assistant
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => setLocation("/vendors")}
                data-testid="button-quick-vendors"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                Manage Vendors
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                Alerts & Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.upcoming > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <Clock className="w-5 h-5 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium">{stats.upcoming} upcoming trip(s)</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">May need preparation</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-600 dark:text-gray-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>All trips are up to date</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
