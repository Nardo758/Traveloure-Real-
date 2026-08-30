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
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LocalExpertForm, ServiceProviderForm } from "@shared/schema";

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

function DigestTriggerButton() {
  const [lastSent, setLastSent] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/digest/send-now", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to trigger digest");
      return res.json();
    },
    onSuccess: () => {
      setLastSent(new Date().toLocaleTimeString());
    },
  });

  return (
    <div className="flex items-center gap-3">
      <button
        data-testid="button-send-digest"
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="text-xs px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {trigger.isPending ? "Sending..." : "📧 Send digest now"}
      </button>

      {trigger.isSuccess && lastSent && (
        <span data-testid="text-digest-sent" className="text-xs text-emerald-600 font-medium">
          ✓ Sent at {lastSent}
        </span>
      )}

      {trigger.isError && (
        <span data-testid="text-digest-error" className="text-xs text-red-500">
          ✗ Failed — check server logs
        </span>
      )}
    </div>
  );
}

export default function AdminDashboard() {
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

  // Build 1: activation funnel — pure read aggregation over existing tables (§13).
  const { data: funnel } = useQuery<{
    expert_applications: number;
    expert_approved: number;
    provider_applications: number;
    provider_approved: number;
    earners: number;
    with_handle: number;
    payouts_connected: number;
    with_offering: number;
    with_approved_offering: number;
    with_booking: number;
  }>({
    queryKey: ["/api/admin/business-funnel"],
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

        {/* Dashboard header row */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <DigestTriggerButton />
        </div>

        {/* Funnel drop-off → Analytics; Slow query → System; Lead alerts → Notifications page. */}

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

        {/* Build 1: business activation funnel — where earners fall out between applying and first booking */}
        {funnel && (
          <Card data-testid="card-business-funnel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-5 h-5 text-gray-500" />
                Business activation funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    label: "Applications",
                    value: (funnel.expert_applications ?? 0) + (funnel.provider_applications ?? 0),
                    sub: `${funnel.expert_applications ?? 0} expert · ${funnel.provider_applications ?? 0} provider`,
                  },
                  {
                    label: "Approved earners",
                    value: funnel.earners ?? 0,
                    sub: `${funnel.expert_approved ?? 0} + ${funnel.provider_approved ?? 0} approvals`,
                  },
                  { label: "Handle claimed", value: funnel.with_handle ?? 0, sub: "storefront live-able" },
                  { label: "Has offering", value: funnel.with_offering ?? 0, sub: "any lane" },
                  { label: "Approved to sell", value: funnel.with_approved_offering ?? 0, sub: "≥1 approved offering" },
                  { label: "First booking", value: funnel.with_booking ?? 0, sub: "earned on-platform" },
                ].map((stage) => (
                  <div key={stage.label} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3" data-testid={`funnel-${stage.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stage.value}</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{stage.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{stage.sub}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Payouts connected: {funnel.payouts_connected ?? 0}. All counts derive live from existing
                tables — nothing is tracked separately.
              </p>
            </CardContent>
          </Card>
        )}

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

      </div>
    </AdminLayout>
  );
}
