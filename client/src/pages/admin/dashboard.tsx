import { AdminLayout } from "@/components/admin/admin-layout";
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
  ShieldAlert,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

interface ActivityEntry {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  createdAt: string;
  actorEmail?: string;
  actorFirstName?: string;
  actorLastName?: string;
}

interface FlaggedContent {
  id: string;
  trackingNumber: string;
  contentType: string;
  title?: string;
  flagReason?: string;
  flaggedAt?: string;
  ownerEmail?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function formatAction(action: string, resourceType: string) {
  return `${action.replace(/_/g, " ")} • ${resourceType}`;
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

  const { data: activityFeed = [], isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/admin/activity/recent"],
  });

  const { data: flaggedContent = [], isLoading: flaggedLoading } = useQuery<FlaggedContent[]>({
    queryKey: ["/api/admin/flagged-content"],
  });

  const systemHealth = healthData?.services?.slice(0, 4).map(s => ({
    metric: s.service,
    value: s.status === "operational" ? s.uptime || "Operational" : s.status,
    status: s.status === "operational" ? "good" : "normal",
  })) || [];

  const pendingExperts = expertApps?.filter(e => e.status === "pending") || [];
  const pendingProviders = providerApps?.filter(p => p.status === "pending") || [];

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
        {/* KPI Stats */}
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
              <Link href="/admin/experts/pending">
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
              <Link href="/admin/providers/pending">
                <Button variant="ghost" className="w-full" data-testid="button-review-provider-applications">
                  Review Applications <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed + Flagged Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-5 h-5 text-indigo-600" />
                Recent Activity
              </CardTitle>
              {activityFeed.length > 0 && (
                <Badge variant="secondary" className="text-xs">{activityFeed.length} events</Badge>
              )}
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : activityFeed.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-6 text-sm">No recent activity</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {activityFeed.slice(0, 12).map((entry, i) => {
                    const actorName = entry.actorFirstName
                      ? `${entry.actorFirstName} ${entry.actorLastName || ""}`.trim()
                      : entry.actorEmail || entry.actorId.slice(0, 8);
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        data-testid={`row-activity-${i}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{actorName}</p>
                          <p className="text-xs text-gray-500 truncate">{formatAction(entry.action, entry.resourceType)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-gray-400">{entry.createdAt ? timeAgo(entry.createdAt) : ""}</span>
                          <Badge variant="outline" className="text-xs capitalize">{entry.actorRole}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Flagged Content Queue
              </CardTitle>
              {flaggedContent.length > 0 && (
                <Badge variant="destructive" className="text-xs">{flaggedContent.length} flagged</Badge>
              )}
            </CardHeader>
            <CardContent>
              {flaggedLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : flaggedContent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No flagged content</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {flaggedContent.slice(0, 8).map((item, i) => {
                    const ownerName = item.ownerFirstName
                      ? `${item.ownerFirstName} ${item.ownerLastName || ""}`.trim()
                      : item.ownerEmail || "Unknown";
                    return (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        data-testid={`row-flagged-content-${i}`}
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {item.title || item.trackingNumber}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {item.contentType} · {ownerName}
                            </p>
                            {item.flagReason && (
                              <p className="text-xs text-red-500 truncate">{item.flagReason}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {item.flaggedAt ? timeAgo(item.flaggedAt) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Platform Health + Quick Stats */}
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
                    <CheckCircle className={`w-4 h-4 ${
                      item.status === "excellent" ? "text-green-500" :
                      item.status === "good" ? "text-blue-500" : "text-gray-400"
                    }`} />
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
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-400">Flagged Content</p>
                    <p className="text-xl font-bold text-red-800 dark:text-red-300">{flaggedContent.length}</p>
                  </div>
                  <ShieldAlert className="w-8 h-8 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
