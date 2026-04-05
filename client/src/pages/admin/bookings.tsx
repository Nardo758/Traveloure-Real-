import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  MapPin,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Booking {
  id: string;
  trackingNumber: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
  confirmedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  traveler: { id: string; firstName: string; lastName: string; email: string } | null;
  provider: { id: string; firstName: string; lastName: string; email: string } | null;
  service: { id: string; serviceName: string } | null;
  bookingDetails?: { market?: string; dates?: { start: string; end: string } };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  "in-progress": "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function AdminBookings() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<string | null>(null);

  const { data: bookingsData, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/admin/bookings", { status: statusFilter }],
  });

  if (isLoading) {
    return (
      <AdminLayout title="All Bookings">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  const bookings = bookingsData ?? [];

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.trackingNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.traveler?.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.traveler?.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.service?.serviceName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = !statusFilter || booking.status === statusFilter;

    const matchesMarket =
      !marketFilter || booking.bookingDetails?.market === marketFilter;

    return matchesSearch && matchesStatus && matchesMarket;
  });

  const stats = {
    total: bookings.length,
    active: bookings.filter(
      (b) =>
        b.status === "confirmed" ||
        b.status === "in-progress"
    ).length,
    revenue: bookings.reduce((sum, b) => sum + parseFloat(String(b.totalAmount) || "0"), 0),
    pending: bookings.filter((b) => b.status === "pending").length,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="w-4 h-4" />;
      case "pending":
        return <AlertCircle className="w-4 h-4" />;
      case "cancelled":
        return <Clock className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <AdminLayout title="All Bookings">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.total}
                  </p>
                  <p className="text-sm text-gray-500">Total Bookings</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-active">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.active}
                  </p>
                  <p className="text-sm text-gray-500">Active Bookings</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-revenue">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(stats.revenue)}
                  </p>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                </div>
                <DollarSign className="w-8 h-8 text-purple-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-pending">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.pending}
                  </p>
                  <p className="text-sm text-gray-500">Pending</p>
                </div>
                <AlertCircle className="w-8 h-8 text-yellow-600 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by booking ID, traveler name, or service..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-bookings"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                <div className="flex gap-2">
                  <Button
                    variant={statusFilter === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(null)}
                    data-testid="button-filter-status-all"
                  >
                    All Status
                  </Button>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <Button
                      key={key}
                      variant={statusFilter === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatusFilter(key)}
                      data-testid={`button-filter-status-${key}`}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                <div className="flex gap-2 ml-auto flex-wrap sm:flex-nowrap">
                  <Button
                    variant={marketFilter === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMarketFilter(null)}
                    data-testid="button-filter-market-all"
                  >
                    All Markets
                  </Button>
                  {["Kyoto", "Edinburgh", "Cartagena", "Jaipur", "Porto"].map(
                    (market) => (
                      <Button
                        key={market}
                        variant={marketFilter === market ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMarketFilter(market)}
                        data-testid={`button-filter-market-${market.toLowerCase()}`}
                      >
                        {market}
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bookings Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Bookings ({filteredBookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredBookings.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No bookings found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        ID
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        Traveler
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        Provider
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        Service
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        Date
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                        data-testid={`row-booking-${booking.id}`}
                      >
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {booking.trackingNumber || booking.id.substring(0, 8)}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {booking.traveler
                                ? `${booking.traveler.firstName} ${booking.traveler.lastName}`
                                : "—"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {booking.traveler?.email || "—"}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {booking.provider
                                ? `${booking.provider.firstName} ${booking.provider.lastName}`
                                : "—"}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-sm text-gray-600">
                            {booking.service?.serviceName || "—"}
                          </p>
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-sm text-gray-600">
                            {formatDate(booking.createdAt)}
                          </p>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={statusColors[booking.status]}>
                            <span className="mr-1">
                              {getStatusIcon(booking.status)}
                            </span>
                            {statusLabels[booking.status]}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <p className="font-medium text-gray-900 text-sm">
                            {formatCurrency(parseFloat(String(booking.totalAmount) || "0"))}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
