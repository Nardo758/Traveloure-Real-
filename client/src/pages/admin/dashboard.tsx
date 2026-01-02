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
  AlertTriangle,
  CheckCircle,
  Clock,
  Server,
  Activity,
  ChevronRight
} from "lucide-react";

const stats = [
  { label: "Total Users", value: "12,450", icon: Users, color: "text-blue-600" },
  { label: "Active Plans", value: "342", icon: ClipboardList, color: "text-green-600" },
  { label: "Revenue (MTD)", value: "$125,600", icon: DollarSign, color: "text-amber-600" },
  { label: "New Users (Today)", value: "28", icon: UserPlus, color: "text-purple-600" },
];

const pendingApprovals = {
  experts: [
    { name: "Yuki Tanaka", role: "Tokyo Local Expert", daysAgo: 2 },
    { name: "Marie Dubois", role: "Paris Wedding Planner", daysAgo: 3 },
    { name: "Carlos Rivera", role: "Bogotá Travel Expert", daysAgo: 5 },
  ],
  providers: [
    { name: "Sunset Restaurant Group", daysAgo: 2 },
    { name: "Elite Photography Studios", daysAgo: 3 },
  ],
  disputes: [
    { id: "#4521", type: "Refund request" },
    { id: "#4498", type: "Service complaint" },
  ],
};

const systemHealth = [
  { metric: "System Status", value: "All Systems Operational", status: "good" },
  { metric: "API Response Time", value: "45ms", status: "excellent" },
  { metric: "Server Load", value: "32%", status: "normal" },
  { metric: "Active Sessions", value: "1,247 users", status: "normal" },
  { metric: "AI Processing Queue", value: "12 tasks (< 1 min wait)", status: "good" },
];

const recentActivity = [
  { text: "New wedding plan created (Sarah M.)", time: "5 min ago" },
  { text: "Expert approved (Yuki T.)", time: "15 min ago" },
  { text: "Payment processed: $250", time: "20 min ago" },
  { text: "New user registration (John D.)", time: "25 min ago" },
  { text: "Provider application received", time: "30 min ago" },
];

export default function AdminDashboard() {
  return (
    <AdminLayout title="Dashboard">
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Expert Applications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="w-5 h-5 text-blue-600" />
                New Expert Applications ({pendingApprovals.experts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingApprovals.experts.map((expert, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  data-testid={`row-expert-application-${index}`}
                >
                  <div>
                    <p className="font-medium text-gray-900">{expert.name}</p>
                    <p className="text-sm text-gray-500">{expert.role}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{expert.daysAgo}d ago</Badge>
                </div>
              ))}
              <Button variant="ghost" className="w-full" data-testid="button-review-expert-applications">
                Review Applications <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Provider Applications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-5 h-5 text-green-600" />
                New Provider Applications ({pendingApprovals.providers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingApprovals.providers.map((provider, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  data-testid={`row-provider-application-${index}`}
                >
                  <p className="font-medium text-gray-900">{provider.name}</p>
                  <Badge variant="outline" className="text-xs">{provider.daysAgo}d ago</Badge>
                </div>
              ))}
              <Button variant="ghost" className="w-full" data-testid="button-review-provider-applications">
                Review Applications <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Disputes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Dispute Resolution ({pendingApprovals.disputes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingApprovals.disputes.map((dispute, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  data-testid={`row-dispute-${index}`}
                >
                  <div>
                    <p className="font-medium text-gray-900">Booking {dispute.id}</p>
                    <p className="text-sm text-gray-500">{dispute.type}</p>
                  </div>
                  <Badge variant="destructive" className="text-xs">Urgent</Badge>
                </div>
              ))}
              <Button variant="ghost" className="w-full" data-testid="button-handle-disputes">
                Handle Disputes <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Platform Health */}
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
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  data-testid={`row-health-${index}`}
                >
                  <p className="text-gray-600">{item.metric}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{item.value}</span>
                    <CheckCircle className={`w-4 h-4 ${
                      item.status === "excellent" ? "text-green-500" : 
                      item.status === "good" ? "text-blue-500" : "text-gray-400"
                    }`} />
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" data-testid="button-view-system-logs">
                  View System Logs
                </Button>
                <Button variant="outline" size="sm" data-testid="button-performance-metrics">
                  Performance Metrics
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" data-testid="button-view-all-activity">
                View All
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  data-testid={`row-activity-${index}`}
                >
                  <p className="text-gray-700">{activity.text}</p>
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {activity.time}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
