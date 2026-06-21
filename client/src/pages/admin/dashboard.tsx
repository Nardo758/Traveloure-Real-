import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  ClipboardList,
  DollarSign,
  UserPlus,
  UserCheck,
  Building2,
  CheckCircle,
  Clock,
  Server,
  Activity,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Database,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LocalExpertForm, ServiceProviderForm } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { FunnelChart } from "@/components/admin/FunnelChart";

interface AdminStats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  monthlyRevenue: number;
  newUsersToday: number;
  pendingExpertApplications: number;
  pendingProviderApplications: number;
}

interface StaleBooking {
  id: string;
  user_id: string;
  trip_id: string;
  title: string;
  status: string;
  total_amount: string;
  created_at: string;
  booking_date: string;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
}

interface SlowQuery {
  url: string;
  method?: string;
  duration: number;
  timestamp: string;
  queryCount?: number;
}

interface SlowQueryData {
  count: number;
  threshold: number | string;
  queries: SlowQuery[];
}

export default function AdminDashboard() {
  const [slowOpen, setSlowOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: expertApps } = useQuery<LocalExpertForm[]>({
    queryKey: ["/api/admin/expert-applications"],
  });

  const { data: providerApps } = useQuery<ServiceProviderForm[]>({
    queryKey: ["/api/admin/provider-applications"],
  });

  const { data: healthData } = useQuery<{ services: any[] }>({
    queryKey: ["/api/admin/system/health"],
  });

  const { data: stalePendingData } = useQuery<{ bookings: StaleBooking[]; count: number }>({
    queryKey: ["/api/admin/bookings/stale-pending"],
  });

  const { data: slowData, refetch: refetchSlow } = useQuery<SlowQueryData>({
    queryKey: ["/api/admin/slow-queries"],
    refetchInterval: 60 * 1000,
  });

  const systemHealth = healthData?.services?.slice(0, 4).map(s => ({
    metric: s.service,
    value: s.status === "operational" ? s.uptime || "Operational" : s.status,
    status: s.status === "operational" ? "good" : "normal",
  })) || [];

  const pendingExperts = expertApps?.filter(e => e.status === "pending") || [];
  const pendingProviders = providerApps?.filter(p => p.status === "pending") || [];
  const staleBookings = stalePendingData?.bookings || [];

  if (statsLoading) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  const statsData = [
    { label: "Total Users", value: stats?.totalUsers?.toLocaleString() || "0", icon: Users, color: "text-blue-600" },
    { label: "Total Bookings", value: stats?.totalBookings?.toLocaleString() || "0", icon: ClipboardList, color: "text-green-600" },
    { label: "Revenue (MTD)", value: `$${(stats?.monthlyRevenue || 0).toFixed(2)}`, icon: DollarSign, color: "text-amber-600" },
    { label: "New Users (Today)", value: stats?.newUsersToday?.toString() || "0", icon: UserPlus, color: "text-purple-600" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="p-6 space-y-6">

        {/* ── Funnel drop-off visualizer — first widget ── */}
        <FunnelChart />

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stale Pending Bookings alert */}
        {staleBookings.length > 0 && (
          <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" data-testid="card-stale-bookings">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Stale Pending Bookings ({staleBookings.length})
              </CardTitle>
              <Badge variant="outline" className="text-amber-700 border-amber-400 text-xs">
                &gt;24h in pending_payment
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                These bookings have been stuck in{" "}
                <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">pending_payment</code> for over 24 hours.
                Check the associated PaymentIntent in the Stripe dashboard.
              </p>
              {staleBookings.slice(0, 5).map((booking, index) => {
                const hoursAgo = Math.floor((Date.now() - new Date(booking.created_at).getTime()) / 3_600_000);
                const userName = [booking.user_first_name, booking.user_last_name].filter(Boolean).join(" ") || booking.user_email || booking.user_id;
                return (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between py-2 border-b border-amber-200 dark:border-amber-700 last:border-0"
                    data-testid={`row-stale-booking-${index}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {booking.title || `Booking #${booking.id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {userName} · ${parseFloat(booking.total_amount || "0").toFixed(2)}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-2 text-xs text-amber-700 border-amber-400 whitespace-nowrap flex-shrink-0">
                      {hoursAgo}h ago
                    </Badge>
                  </div>
                );
              })}
              {staleBookings.length > 5 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  +{staleBookings.length - 5} more stale bookings
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Applications */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="w-5 h-5 text-blue-600" />
                Expert Applications ({pendingExperts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingExperts.length > 0 ? (
                pendingExperts.slice(0, 5).map((expert, index) => (
                  <div
                    key={expert.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    data-testid={`row-expert-application-${index}`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">Expert #{expert.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-500">{expert.yearsInCity} years experience</p>
                    </div>
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No pending applications</p>
              )}
              <Link href="/admin/experts">
                <Button variant="ghost" className="w-full" data-testid="button-review-expert-applications">
                  Review Applications <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-5 h-5 text-green-600" />
                Provider Applications ({pendingProviders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingProviders.length > 0 ? (
                pendingProviders.slice(0, 5).map((provider, index) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    data-testid={`row-provider-application-${index}`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{provider.businessName}</p>
                      <p className="text-sm text-gray-500">{provider.businessType}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No pending applications</p>
              )}
              <Link href="/admin/providers">
                <Button variant="ghost" className="w-full" data-testid="button-review-provider-applications">
                  Review Applications <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Platform health + quick stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-green-600" />
                Platform Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {systemHealth.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                  data-testid={`row-health-${index}`}
                >
                  <p className="text-gray-600 dark:text-gray-400">{item.metric}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{item.value}</span>
                    <CheckCircle className={`w-4 h-4 ${item.status === "good" ? "text-blue-500" : "text-gray-400"}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-400">Total Platform Revenue</p>
                    <p className="text-xl font-bold text-green-800 dark:text-green-300">${(stats?.totalRevenue || 0).toFixed(2)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700 dark:text-blue-400">Pending Applications</p>
                    <p className="text-xl font-bold text-blue-800 dark:text-blue-300">
                      {(stats?.pendingExpertApplications || 0) + (stats?.pendingProviderApplications || 0)}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              {stalePendingData !== undefined && (
                <div className={`p-4 rounded-lg ${staleBookings.length > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-gray-50 dark:bg-gray-800/40"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${staleBookings.length > 0 ? "text-amber-700 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"}`}>
                        Stale Pending Payments
                      </p>
                      <p className={`text-xl font-bold ${staleBookings.length > 0 ? "text-amber-800 dark:text-amber-300" : "text-gray-700 dark:text-gray-300"}`}>
                        {staleBookings.length}
                      </p>
                    </div>
                    <AlertTriangle className={`w-8 h-8 ${staleBookings.length > 0 ? "text-amber-600" : "text-gray-400"}`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Slow Query Monitor */}
        <Card data-testid="card-slow-queries">
          <CardHeader
            className="flex flex-row items-center justify-between gap-2 cursor-pointer select-none"
            onClick={() => setSlowOpen((o) => !o)}
          >
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-500" />
              Slow Queries
              {slowData && slowData.count > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs ml-1">
                  {slowData.count}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:inline">
                ≥{slowData?.threshold ?? 500}ms · refreshes every 60s
              </span>
              {slowOpen
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </CardHeader>

          {slowOpen && (
            <CardContent>
              {slowData && slowData.queries.length > 0 ? (
                <div className="space-y-1">
                  {[...slowData.queries].reverse().slice(0, 5).map((q: SlowQuery, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      data-testid={`row-slow-query-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">{q.url}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(q.timestamp).toLocaleTimeString()}
                          {q.queryCount !== undefined && ` · ${q.queryCount} DB queries`}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="ml-3 text-xs text-orange-600 border-orange-300 whitespace-nowrap flex-shrink-0"
                      >
                        {q.duration}ms
                      </Badge>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-gray-500 mt-2"
                    data-testid="button-clear-slow-queries"
                    onClick={(e) => {
                      e.stopPropagation();
                      apiRequest("DELETE", "/api/admin/slow-queries").then(() => refetchSlow());
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Clear log
                  </Button>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-sm">
                  No slow queries recorded. Threshold: {slowData?.threshold ?? 500}ms.
                </p>
              )}
            </CardContent>
          )}
        </Card>

      </div>
    </AdminLayout>
  );
}
