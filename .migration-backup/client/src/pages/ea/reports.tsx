import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  Bot,
  Users,
  DollarSign
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

interface EaEvent { id: string; type?: string; createdAt?: string; }
interface EaAiTask { id: string; status: string; createdAt?: string; }
interface EaExecutive { id: string; }
interface EaTravelArrangement { id: string; }
interface EaGift { id: string; }
interface EaSavedVenue { id: string; }
interface EaCommunication { id: string; }

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Real per-month counts from each row's own createdAt — no invented trend data.
function monthlyBreakdown(events: EaEvent[], aiTasks: EaAiTask[], monthsBack: number) {
  const now = new Date();
  const buckets: { month: string; year: number; monthIndex: number; events: number; aiTasks: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ month: MONTH_NAMES[d.getMonth()], year: d.getFullYear(), monthIndex: d.getMonth(), events: 0, aiTasks: 0 });
  }
  const inBucket = (dateStr: string | undefined, year: number, monthIndex: number) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIndex;
  };
  for (const bucket of buckets) {
    bucket.events = events.filter((e) => inBucket(e.createdAt, bucket.year, bucket.monthIndex)).length;
    bucket.aiTasks = aiTasks.filter((t) => inBucket(t.createdAt, bucket.year, bucket.monthIndex)).length;
  }
  return buckets.reverse();
}

export default function EAReports() {
  const { data: events = [] } = useQuery<EaEvent[]>({ queryKey: ["/api/ea/events"] });
  const { data: aiTasks = [] } = useQuery<EaAiTask[]>({ queryKey: ["/api/ea/ai-tasks"] });
  const { data: executives = [] } = useQuery<EaExecutive[]>({ queryKey: ["/api/ea/executives"] });
  const { data: travel = [] } = useQuery<EaTravelArrangement[]>({ queryKey: ["/api/ea/travel"] });
  const { data: gifts = [] } = useQuery<EaGift[]>({ queryKey: ["/api/ea/gifts"] });
  const { data: venues = [] } = useQuery<EaSavedVenue[]>({ queryKey: ["/api/ea/venues"] });
  const { data: communications = [] } = useQuery<EaCommunication[]>({ queryKey: ["/api/ea/communications"] });

  // Every figure below is a real count from a live EA endpoint (was 100% hardcoded
  // literals with zero fetches — §13). "Time Saved" / "Quality Score" / "Satisfaction"
  // / trend arrows are REMOVED rather than zeroed: no scorer or timing instrumentation
  // exists anywhere in the system to ever produce those numbers honestly.
  const completedAiTasks = aiTasks.filter((t) => t.status === "approved").length;
  const completionRate = aiTasks.length > 0 ? Math.round((completedAiTasks / aiTasks.length) * 100) : 0;

  const monthlyMetrics = monthlyBreakdown(events, aiTasks, 3);

  const topActivities = [
    { activity: "Travel Coordination", count: travel.length },
    { activity: "Venue Research", count: venues.length },
    { activity: "Event Coordination", count: events.length },
    { activity: "Gift Procurement", count: gifts.length },
    { activity: "Communications Logged", count: communications.length },
  ].sort((a, b) => b.count - a.count);

  return (
    <EALayout title="Reports">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-reports-title">
              Reports & Analytics
            </h1>
            <p className="text-gray-600">Track your productivity and performance</p>
          </div>
          <div className="flex gap-2">
            <Select data-testid="select-period">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Overview counts — real totals, not a period-filtered snapshot (the period
            selector above has nothing to filter by yet). */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="border border-gray-200" data-testid="stat-events">
            <CardContent className="p-4 text-center">
              <Calendar className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold text-gray-900">{events.length}</p>
              <p className="text-xs text-gray-600">Events Managed</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-ai-tasks">
            <CardContent className="p-4 text-center">
              <Bot className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{aiTasks.length}</p>
              <p className="text-xs text-gray-600">AI Tasks</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-executives">
            <CardContent className="p-4 text-center">
              <Users className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <p className="text-2xl font-bold text-gray-900">{executives.length}</p>
              <p className="text-xs text-gray-600">Executives</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-travel">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
              <p className="text-2xl font-bold text-gray-900">{travel.length}</p>
              <p className="text-xs text-gray-600">Trips Arranged</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-gifts">
            <CardContent className="p-4 text-center">
              <DollarSign className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{gifts.length}</p>
              <p className="text-xs text-gray-600">Gifts Ordered</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Performance */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Monthly Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyMetrics.map((month, index) => (
                  <div
                    key={`${month.year}-${month.monthIndex}`}
                    className="p-4 rounded-lg border border-gray-100"
                    data-testid={`monthly-metric-${index}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-gray-900">{month.month} {month.year}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Events</p>
                        <p className="font-medium text-gray-900">{month.events}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">AI Tasks</p>
                        <p className="font-medium text-gray-900">{month.aiTasks}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Activities */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Activity Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topActivities.map((activity, index) => (
                  <div
                    key={activity.activity}
                    className="flex items-center justify-between"
                    data-testid={`activity-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <span className="text-gray-900">{activity.activity}</span>
                    </div>
                    <span className="font-medium text-gray-900">{activity.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Performance */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-600" />
                AI Assistant Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tasks Delegated</span>
                <span className="font-medium">{aiTasks.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tasks Completed</span>
                <span className="font-medium">{completedAiTasks} ({completionRate}%)</span>
              </div>
              {/* Time Saved / Quality Score / Edit Rate removed (§13) — no scorer or
                  timing instrumentation exists to ever produce these honestly. */}
            </CardContent>
          </Card>

          {/* Quick Reports */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Generate Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" data-testid="button-weekly-report">
                <Calendar className="w-4 h-4 mr-2" /> Weekly Summary
              </Button>
              <Button variant="outline" className="w-full justify-start" data-testid="button-expense-report">
                <DollarSign className="w-4 h-4 mr-2" /> Expense Report
              </Button>
              <Button variant="outline" className="w-full justify-start" data-testid="button-travel-report">
                <TrendingUp className="w-4 h-4 mr-2" /> Travel Summary
              </Button>
              <Button variant="outline" className="w-full justify-start" data-testid="button-executive-report">
                <Users className="w-4 h-4 mr-2" /> Executive Activity
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </EALayout>
  );
}
