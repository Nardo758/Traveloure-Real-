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
  Loader2
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

const systemHealth = [
  { metric: "System Status", value: "All Systems Operational", status: "good" },
  { metric: "API Response Time", value: "45ms", status: "excellent" },
  { metric: "Server Load", value: "32%", status: "normal" },
  { metric: "Database", value: "Connected", status: "good" },
];

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
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
