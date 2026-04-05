import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MessageSquare,
  Calendar,
  Bot,
  Eye,
  Plane,
  Heart,
  Gift,
  PartyPopper,
  Briefcase,
  AlertCircle,
  Clock
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const eventTypeIcons: Record<string, any> = {
  travel: Plane,
  proposal: Heart,
  anniversary: Gift,
  birthday: PartyPopper,
  corporate: Briefcase,
};

interface Trip {
  id: string;
  destination?: string;
  userId?: string;
  travelerName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: any;
}

export default function ExpertClients() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/expert/assigned-trips"],
  });

  // Group trips by traveler to build client list
  const clients = useMemo(() => {
    if (!trips) return [];
    const grouped = new Map<string, any>();
    for (const trip of trips) {
      const key = trip.userId || trip.travelerName || "unknown";
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: trip.travelerName || "Traveler",
          eventType: "travel",
          trips: [],
          status: trip.status || "planning",
          statusLabel: trip.status === "active" ? "Currently traveling" : "Planning phase",
          progress: 50,
        });
      }
      grouped.get(key).trips.push(trip);
    }
    return Array.from(grouped.values()).map((client) => ({
      ...client,
      event: client.trips[0]?.destination || "Trip",
      statusDetail: `${client.trips.length} trip${client.trips.length > 1 ? "s" : ""}`,
    }));
  }, [trips]);

  const filteredClients = clients.filter((client) => {
    if (statusFilter !== "all" && client.status !== statusFilter) return false;
    if (searchQuery && !client.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !client.event.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case "traveling":
        return "bg-green-100 text-green-700 border-green-200";
      case "planning":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "completed":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-red-600";
      case "high":
        return "text-yellow-600";
      case "medium":
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <ExpertLayout title="Clients">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Clients</h1>
            <p className="text-gray-600">Manage your client relationships and projects</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
                data-testid="input-search-clients"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="traveling">Traveling</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </>
          ) : (
            <>
              <Card className="border border-gray-200 bg-gray-50" data-testid="card-active-clients-stat">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.status !== "completed").length}</p>
                  <p className="text-sm text-gray-600">Active Clients</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-gray-50" data-testid="card-traveling-stat">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.status === "traveling").length}</p>
                  <p className="text-sm text-gray-600">Currently Traveling</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-gray-50" data-testid="card-attention-stat">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.action).length}</p>
                  <p className="text-sm text-gray-600">Need Attention</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </>
          ) : filteredClients.length === 0 ? (
            <Card className="border border-gray-200">
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No clients found matching your criteria</p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map((client) => {
              const Icon = eventTypeIcons[client.eventType] || Plane;
              return (
                <Card key={client.id} className="border border-gray-200" data-testid={`card-client-${client.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[#FF385C]/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-[#FF385C]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-lg">{client.name}</h3>
                            <p className="text-gray-600">{client.event}</p>
                          </div>
                          <Badge variant="outline" className={getStatusBadgeStyles(client.status)}>
                            {client.statusLabel}
                          </Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>{client.statusDetail}</span>
                          {client.lastContact && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last contact: {client.lastContact}
                            </span>
                          )}
                          {client.eventDate && (
                            <span>Event: {client.eventDate} ({client.daysAway} days away)</span>
                          )}
                        </div>

                        {client.action && (
                          <p className={`text-sm mt-2 flex items-center gap-1 ${getPriorityStyles(client.actionPriority || "")}`}>
                            <AlertCircle className="w-3 h-3" />
                            Action needed: {client.action}
                          </p>
                        )}

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Progress</span>
                            <span>{client.progress}%</span>
                          </div>
                          <Progress value={client.progress} className="h-2" />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {client.status === "traveling" && (
                            <Button size="sm" variant="outline" data-testid={`button-live-view-${client.id}`}>
                              <Eye className="w-3 h-3 mr-1" /> Live View
                            </Button>
                          )}
                          <Button size="sm" variant="outline" data-testid={`button-chat-${client.id}`}>
                            <MessageSquare className="w-3 h-3 mr-1" /> Chat
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-itinerary-${client.id}`}>
                            <Calendar className="w-3 h-3 mr-1" /> Itinerary
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-ai-assist-${client.id}`}>
                            <Bot className="w-3 h-3 mr-1" /> AI Assist
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </ExpertLayout>
  );
}
