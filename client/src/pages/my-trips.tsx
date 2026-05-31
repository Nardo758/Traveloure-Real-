import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Search, Grid, List, Filter, Plane, Heart, PartyPopper, Briefcase, Star, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import { format, differenceInDays } from "date-fns";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const filterOptions = [
  { value: "all", label: "All" },
  { value: "vacation", label: "Travel" },
  { value: "wedding", label: "Weddings" },
  { value: "birthday", label: "Birthdays" },
  { value: "corporate", label: "Corporate" },
];

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

export default function MyTrips() {
  const { data: trips, isLoading, isError } = useTrips();
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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
  
  const filteredTrips = (trips || []).filter(trip => {
    if (typeFilter !== "all" && trip.eventType !== typeFilter) return false;
    
    if (statusFilter !== "all") {
      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      
      if (statusFilter === "active" && !(start <= now && end >= now)) return false;
      if (statusFilter === "upcoming" && !(start > now)) return false;
      if (statusFilter === "completed" && !(end < now)) return false;
    }
    
    if (searchQuery && !(trip.title || "").toLowerCase().includes(searchQuery.toLowerCase()) && 
        !trip.destination.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const activeTrips = filteredTrips.filter(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    return (start <= now && end >= now) || (start > now && t.status === "planning");
  });
  
  const upcomingTrips = filteredTrips.filter(t => new Date(t.startDate) > now);
  const completedTrips = filteredTrips.filter(t => new Date(t.endDate) < now);

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

  const TripCard = ({ trip }: { trip: any }) => {
    const Icon = eventTypeIcons[trip.eventType || "vacation"] || Plane;
    const progress = getProgressValue(trip);
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const isUpcoming = start > now;
    const isCompleted = end < now;
    const daysAway = differenceInDays(start, now);

    return (
      <Card className="border border-[#E5E7EB] hover:shadow-md transition-shadow" data-testid={`card-trip-${trip.id}`}>
        <CardContent className={viewMode === "list" ? "p-5" : "p-4"}>
          <div className={viewMode === "list" ? "flex items-start gap-4" : "space-y-4"}>
            <div className={`${viewMode === "list" ? "w-16 h-16" : "w-full h-32"} rounded-lg bg-gradient-to-br from-[#FFE3E8] to-[#FFF1F3] flex items-center justify-center flex-shrink-0`}>
              <Icon className={`${viewMode === "list" ? "w-8 h-8" : "w-12 h-12"} text-[#FF385C]`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-[#111827] dark:text-white truncate" data-testid={`text-trip-title-${trip.id}`}>
                    {trip.title}
                  </h3>
                  <p className="text-sm text-[#6B7280]">
                    {format(start, "MMM d")} - {format(end, "MMM d, yyyy")} • {trip.destination}
                  </p>
                </div>
                {isCompleted ? (
                  <Badge variant="secondary" className="flex-shrink-0">
                    <Star className="w-3 h-3 mr-1" /> Completed
                  </Badge>
                ) : isUpcoming && daysAway <= 30 ? (
                  <Badge className="flex-shrink-0 bg-blue-100 text-blue-600 hover:bg-blue-100">
                    {daysAway} days away
                  </Badge>
                ) : (
                  <Badge variant="outline" className="flex-shrink-0">
                    Planning
                  </Badge>
                )}
              </div>
              
              {!isCompleted && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[#6B7280]">Progress</span>
                    <span className="font-medium text-[#111827] dark:text-white">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/trip/${trip.id}`}>
                  <Button size="sm" variant="outline" data-testid={`button-view-${trip.id}`}>
                    View
                  </Button>
                </Link>
                <Link href="/chat">
                  <Button size="sm" variant="ghost" className="text-[#6B7280]" data-testid={`button-chat-${trip.id}`}>
                    Chat
                  </Button>
                </Link>
                {!isCompleted && (
                  <Link href={`/trip/${trip.id}/edit`}>
                    <Button size="sm" variant="ghost" className="text-[#6B7280]" data-testid={`button-edit-${trip.id}`}>
                      Edit
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
            My Plans & Events
          </h1>
          <Link href="/experiences">
            <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-create-new">
              <Plus className="w-4 h-4 mr-2" />
              Create New
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <Input 
              placeholder="Search plans..." 
              className="pl-10 border-[#E5E7EB]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] border-[#E5E7EB]" data-testid="select-type-filter">
                <Filter className="w-4 h-4 mr-2 text-[#6B7280]" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] border-[#E5E7EB]" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex border border-[#E5E7EB] rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className={viewMode === "grid" ? "bg-[#F3F4F6]" : ""}
                onClick={() => setViewMode("grid")}
                data-testid="button-grid-view"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={viewMode === "list" ? "bg-[#F3F4F6]" : ""}
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Active Plans */}
        {activeTrips.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[#111827] dark:text-white mb-4 flex items-center gap-2">
              Active Plans ({activeTrips.length})
            </h2>
            <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
              {activeTrips.map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TripCard trip={trip} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        {upcomingTrips.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[#111827] dark:text-white mb-4 flex items-center gap-2">
              Upcoming Events ({upcomingTrips.length})
            </h2>
            <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
              {upcomingTrips.map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TripCard trip={trip} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completedTrips.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#111827] dark:text-white flex items-center gap-2">
                Completed ({completedTrips.length})
              </h2>
              <Button variant="ghost" className="text-[#FF385C]" data-testid="button-show-all-completed">
                Show All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
              {completedTrips.slice(0, 3).map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TripCard trip={trip} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {filteredTrips.length === 0 && (
          <Card className="border-2 border-dashed border-[#E5E7EB]">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
                <Plane className="w-8 h-8 text-[#FF385C]" />
              </div>
              <h3 className="text-lg font-semibold text-[#111827] dark:text-white mb-2">
                {searchQuery || typeFilter !== "all" || statusFilter !== "all" 
                  ? "No matching plans found" 
                  : "No plans yet"}
              </h3>
              <p className="text-[#6B7280] mb-4">
                {searchQuery || typeFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Start planning your next adventure!"}
              </p>
              {!searchQuery && typeFilter === "all" && statusFilter === "all" && (
                <Link href="/experiences">
                  <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-create-first">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Plan
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
