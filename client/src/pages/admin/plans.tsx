import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Eye,
  EyeOff,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowRight,
  History,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const typeColors: Record<string, string> = {
  Wedding: "bg-pink-100 text-pink-700 border-pink-200",
  Travel: "bg-blue-100 text-blue-700 border-blue-200",
  Corporate: "bg-purple-100 text-purple-700 border-purple-200",
  Event: "bg-amber-100 text-amber-700 border-amber-200",
};

// §13: the API now returns a date-derived phase (upcoming/active/past) — NOT trips.status
// (a dead write-once field nothing ever advances). See docs/briefs/L3-trips-status-brief.md.
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  upcoming: "bg-amber-100 text-amber-700 border-amber-200",
  past: "bg-blue-100 text-blue-700 border-blue-200",
};

const workspaceStatusLabels: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  delivered: "Delivered",
};

const workspaceStatusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-amber-100 text-amber-700",
  delivered: "bg-green-100 text-green-700",
};

interface WorkspaceHistoryEntry {
  id: string;
  tripId: string;
  itemId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

function WorkspaceHistory({ tripId }: { tripId: string }) {
  const { data, isLoading, isError } = useQuery<WorkspaceHistoryEntry[]>({
    queryKey: ["/api/admin/trips", tripId, "workspace-history"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/trips/${tripId}/workspace-history`);
      if (!res.ok) throw new Error("Failed to load workspace history");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-500 text-sm" data-testid="workspace-history-loading">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading workspace history…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-4 text-red-600 text-sm" data-testid="workspace-history-error">
        <AlertTriangle className="w-4 h-4" />
        Could not load workspace history.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-4 text-sm text-gray-500 italic" data-testid="workspace-history-empty">
        No workspace status changes recorded for this trip.
      </p>
    );
  }

  return (
    <ol className="space-y-2" data-testid="workspace-history-list">
      {data.map((entry) => {
        const from = entry.fromStatus ? (workspaceStatusLabels[entry.fromStatus] ?? entry.fromStatus) : null;
        const to = entry.toStatus ? (workspaceStatusLabels[entry.toStatus] ?? entry.toStatus) : null;
        const when = new Date(entry.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <li
            key={entry.id}
            className="flex flex-wrap items-center gap-2 text-sm py-2 border-b border-gray-100 last:border-0"
            data-testid={`workspace-history-entry-${entry.id}`}
          >
            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 shrink-0">{when}</span>
            {from && (
              <>
                <Badge className={`${workspaceStatusColors[entry.fromStatus ?? ""] ?? "bg-gray-100 text-gray-700"} text-xs`}>
                  {from}
                </Badge>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </>
            )}
            {to && (
              <Badge className={`${workspaceStatusColors[entry.toStatus ?? ""] ?? "bg-gray-100 text-gray-700"} text-xs`}>
                {to}
              </Badge>
            )}
            <span className="text-gray-500 ml-auto shrink-0">
              {entry.actorName
                ? `by ${entry.actorName}`
                : entry.actorId
                  ? `by user ${entry.actorId.slice(0, 8)}…`
                  : `by ${entry.actorType}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function AdminPlans() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);

  const { data: plansData, isLoading } = useQuery<{
    trips: Array<{ id: string; title: string; type: string; destination: string; startDate: string; endDate: string; guests: number; budget: string; status: string; user: string; created: string }>;
    stats: { total: number; upcoming: number; active: number; past: number };
  }>({ queryKey: ["/api/admin/trips", { search: searchQuery, status: statusFilter }] });

  if (isLoading) {
    return (
      <AdminLayout title="Plan Management">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  const trips = plansData?.trips ?? [];

  // Capitalize first letter of type (eventType)
  const formatType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // status is already the API's date-derived phase (upcoming/active/past) — no client remap.
  const plans = trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    type: formatType(trip.type),
    destination: trip.destination,
    date: trip.startDate && trip.endDate
      ? `${trip.startDate} - ${trip.endDate}`
      : trip.startDate || trip.endDate || "",
    guests: trip.guests,
    budget: trip.budget,
    status: trip.status,
    user: trip.user,
    created: trip.created,
  }));

  const filteredPlans = plans.filter((plan) => {
    const matchesSearch = plan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          plan.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || plan.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = plansData?.stats ?? {
    total: plans.length,
    upcoming: plans.filter(p => p.status === "upcoming").length,
    active: plans.filter(p => p.status === "active").length,
    past: plans.filter(p => p.status === "past").length,
  };

  return (
    <AdminLayout title="Plan Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Plans</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-upcoming">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.upcoming}</p>
              <p className="text-sm text-gray-500">Upcoming</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-past">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.past}</p>
              <p className="text-sm text-gray-500">Past</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search plans..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-plans"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={statusFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(null)}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("active")}
                  data-testid="button-filter-active"
                >
                  Active
                </Button>
                <Button
                  variant={statusFilter === "upcoming" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("upcoming")}
                  data-testid="button-filter-upcoming"
                >
                  Upcoming
                </Button>
                <Button
                  variant={statusFilter === "past" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("past")}
                  data-testid="button-filter-past"
                >
                  Past
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plans List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              All Plans ({filteredPlans.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredPlans.map((plan) => {
              const isExpanded = expandedTripId === plan.id;
              return (
                <div
                  key={plan.id}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                  data-testid={`card-plan-${plan.id}`}
                >
                  <div className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={typeColors[plan.type] ?? "bg-gray-100 text-gray-700 border-gray-200"}>{plan.type}</Badge>
                          <Badge className={statusColors[plan.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}>{plan.status}</Badge>
                          <h3 className="font-semibold text-gray-900">{plan.title}</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <MapPin className="w-4 h-4" /> {plan.destination}
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar className="w-4 h-4" /> {plan.date}
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Users className="w-4 h-4" /> {plan.guests} guests
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <DollarSign className="w-4 h-4" /> {plan.budget}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>User: {plan.user}</span>
                          <span>Created: {plan.created}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedTripId(isExpanded ? null : plan.id)}
                          data-testid={`button-view-${plan.id}`}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? (
                            <><EyeOff className="w-4 h-4 mr-1" /> Hide</>
                          ) : (
                            <><Eye className="w-4 h-4 mr-1" /> View</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Workspace status history panel */}
                  {isExpanded && (
                    <div
                      className="border-t border-gray-100 bg-gray-50 px-4 py-3"
                      data-testid={`workspace-history-panel-${plan.id}`}
                    >
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <History className="w-4 h-4 text-gray-500" />
                        Workspace Status History
                      </h4>
                      <WorkspaceHistory tripId={plan.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
