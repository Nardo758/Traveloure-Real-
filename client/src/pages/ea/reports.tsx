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
  Clock,
  Bot,
  Users,
  DollarSign
} from "lucide-react";

export default function EAReports() {
  const weeklyStats = {
    eventsManaged: 24,
    aiTasksCompleted: 45,
    timeSaved: 18,
    executivesSupported: 8,
    travelArranged: 3,
    giftsOrdered: 2,
  };

  const monthlyMetrics = [
    { month: "March", events: 92, aiTasks: 180, timeSaved: 72, satisfaction: 98 },
    { month: "February", events: 84, aiTasks: 156, timeSaved: 65, satisfaction: 97 },
    { month: "January", events: 78, aiTasks: 142, timeSaved: 58, satisfaction: 96 },
  ];

  const topActivities = [
    { activity: "Travel Coordination", count: 45, trend: "+12%" },
    { activity: "Restaurant Bookings", count: 38, trend: "+8%" },
    { activity: "Meeting Scheduling", count: 32, trend: "+5%" },
    { activity: "Gift Procurement", count: 18, trend: "+15%" },
    { activity: "Venue Research", count: 15, trend: "+3%" },
  ];

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
                <SelectValue placeholder="This Week" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Weekly Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border border-gray-200" data-testid="stat-events">
            <CardContent className="p-4 text-center">
              <Calendar className="w-6 h-6 mx-auto mb-2 text-[#FF385C]" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.eventsManaged}</p>
              <p className="text-xs text-gray-600">Events Managed</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-ai-tasks">
            <CardContent className="p-4 text-center">
              <Bot className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.aiTasksCompleted}</p>
              <p className="text-xs text-gray-600">AI Tasks</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-time-saved">
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 mx-auto mb-2 text-purple-600" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.timeSaved}h</p>
              <p className="text-xs text-gray-600">Time Saved</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-executives">
            <CardContent className="p-4 text-center">
              <Users className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.executivesSupported}</p>
              <p className="text-xs text-gray-600">Executives</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-travel">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.travelArranged}</p>
              <p className="text-xs text-gray-600">Trips Arranged</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-gifts">
            <CardContent className="p-4 text-center">
              <DollarSign className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{weeklyStats.giftsOrdered}</p>
              <p className="text-xs text-gray-600">Gifts Ordered</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Performance */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#FF385C]" />
                Monthly Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyMetrics.map((month, index) => (
                  <div 
                    key={index} 
                    className="p-4 rounded-lg border border-gray-100"
                    data-testid={`monthly-metric-${index}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-gray-900">{month.month}</p>
                      <Badge variant="secondary">{month.satisfaction}% Satisfaction</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Events</p>
                        <p className="font-medium text-gray-900">{month.events}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">AI Tasks</p>
                        <p className="font-medium text-gray-900">{month.aiTasks}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Hours Saved</p>
                        <p className="font-medium text-green-600">{month.timeSaved}h</p>
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
              <CardTitle className="text-lg">Top Activities This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topActivities.map((activity, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between"
                    data-testid={`activity-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <span className="text-gray-900">{activity.activity}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{activity.count}</span>
                      <Badge className="bg-green-100 text-green-700">{activity.trend}</Badge>
                    </div>
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
                <span className="font-medium">245</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tasks Completed</span>
                <span className="font-medium">238 (97%)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Time Saved</span>
                <span className="font-medium text-green-600">52 hours</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Avg Quality Score</span>
                <span className="font-medium">9.3/10</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Edit Rate</span>
                <span className="font-medium text-green-600">12% (Lower = Better)</span>
              </div>
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
