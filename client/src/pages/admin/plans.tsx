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
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const typeColors: Record<string, string> = {
  Wedding: "bg-pink-100 text-pink-700 border-pink-200",
  Travel: "bg-blue-100 text-blue-700 border-blue-200",
  Corporate: "bg-purple-100 text-purple-700 border-purple-200",
  Event: "bg-amber-100 text-amber-700 border-amber-200",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export default function AdminPlans() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: plansData, isLoading } = useQuery<{
    trips: Array<{ id: string; title: string; type: string; destination: string; startDate: string; endDate: string; guests: number; budget: string; status: string; user: string; created: string }>;
    stats: { total: number; active: number; pending: number; completed: number };
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

  // Map API status values to display status
  const mapStatus = (status: string): string => {
    switch (status) {
      case "planning":
      case "confirmed":
        return "active";
      case "draft":
        return "pending";
      case "completed":
        return "completed";
      case "cancelled":
        return "cancelled";
      default:
        return status;
    }
  };

  // Capitalize first letter of type (eventType)
  const formatType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

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
    status: mapStatus(trip.status),
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
    active: plans.filter(p => p.status === "active").length,
    pending: plans.filter(p => p.status === "pending").length,
    completed: plans.filter(p => p.status === "completed").length,
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
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              <p className="text-sm text-gray-500">Pending</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-completed">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
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
                  variant={statusFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                  data-testid="button-filter-pending"
                >
                  Pending
                </Button>
                <Button
                  variant={statusFilter === "completed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("completed")}
                  data-testid="button-filter-completed"
                >
                  Completed
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
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className="p-4 border border-gray-200 rounded-lg"
                data-testid={`card-plan-${plan.id}`}
              >
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
                    <Button variant="outline" size="sm" data-testid={`button-view-${plan.id}`}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
