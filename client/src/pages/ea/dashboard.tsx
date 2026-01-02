import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  Calendar as CalendarIcon, 
  Clock, 
  AlertCircle,
  CheckCircle,
  Bot,
  ArrowRight,
  MessageSquare,
  Plane,
  Gift,
  BarChart3,
  User
} from "lucide-react";
import { Link } from "wouter";

export default function EADashboard() {
  const stats = [
    { label: "Active Events", value: 28, icon: CalendarIcon, color: "bg-blue-100 text-blue-600" },
    { label: "Executives Supported", value: 8, icon: Users, color: "bg-green-100 text-green-600" },
    { label: "This Week Events", value: 12, icon: CalendarIcon, color: "bg-purple-100 text-purple-600" },
    { label: "AI Hours Saved", value: "52 hrs", icon: Clock, color: "bg-yellow-100 text-yellow-600" },
  ];

  const urgentItems = [
    {
      id: 1,
      priority: "critical",
      title: "CEO's Paris dinner tonight",
      executive: "James Anderson (CEO)",
      event: "Client dinner at Le Jules Verne",
      issue: "Restaurant called - dietary restriction noted",
      action: "Confirm menu changes by 2pm",
    },
    {
      id: 2,
      priority: "high",
      title: "Board member travel arrangements",
      executive: "Sarah Chen (COO)",
      event: "London → Tokyo → Singapore (10 days)",
      issue: "Flights booked, hotel approval needed",
      action: "Approve by end of day",
    },
    {
      id: 3,
      priority: "medium",
      title: "VP's anniversary dinner",
      executive: "Michael Torres (VP Sales)",
      event: "10th anniversary dinner (this Friday)",
      issue: "Venue booked, gift recommendation needed",
      action: "Select gift option",
    },
  ];

  const executives = [
    {
      id: 1,
      name: "James Anderson",
      title: "CEO",
      activeEvents: 4,
      upcoming: 7,
      profileComplete: true,
      weekEvents: [
        { day: "Today", event: "Paris client dinner (URGENT - menu issue)", urgent: true },
        { day: "Thu", event: "Board meeting prep + catering" },
        { day: "Fri", event: "Weekend getaway with spouse (all set)", done: true },
      ],
    },
    {
      id: 2,
      name: "Sarah Chen",
      title: "COO",
      activeEvents: 3,
      upcoming: 5,
      profileComplete: true,
      weekEvents: [
        { day: "Wed", event: "London flight departure (hotel approval needed)", urgent: true },
        { day: "Thu-Sat", event: "International trip (10 days, 3 countries)" },
      ],
    },
  ];

  const aiActivity = [
    { text: "Researched 5 hotel options for Sarah's Tokyo leg", time: "1 hour ago" },
    { text: "Drafted thank-you notes for James (3 clients)", time: "2 hours ago" },
    { text: "Coordinated restaurant confirmation for Michael", time: "3 hours ago" },
    { text: "Updated calendar conflicts for 4 executives", time: "5 hours ago" },
    { text: "Researched anniversary gift options (15 curated)", time: "6 hours ago" },
  ];

  const calendarOverview = [
    { day: "Mon", events: 3 },
    { day: "Tue", events: 4 },
    { day: "Wed", events: 5 },
    { day: "Thu", events: 6 },
    { day: "Fri", events: 4 },
    { day: "Weekend", events: 2 },
  ];

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case "critical":
        return { bg: "bg-red-100 border-red-200", badge: "bg-red-500 text-white", icon: "text-red-600" };
      case "high":
        return { bg: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-500 text-white", icon: "text-yellow-600" };
      case "medium":
        return { bg: "bg-blue-50 border-blue-200", badge: "bg-blue-500 text-white", icon: "text-blue-600" };
      default:
        return { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-500 text-white", icon: "text-gray-600" };
    }
  };

  return (
    <EALayout title="Dashboard">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-ea-welcome">
            Welcome back, Rachel!
          </h1>
          <p className="text-gray-600">Here's your executive coordination overview</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <Card key={index} className="border border-gray-200" data-testid={`card-stat-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Urgent Items */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <CardTitle className="text-lg">Urgent Attention Needed ({urgentItems.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {urgentItems.map((item) => {
                  const styles = getPriorityStyles(item.priority);
                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 rounded-lg border ${styles.bg}`}
                      data-testid={`urgent-item-${item.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={styles.badge}>{item.priority.toUpperCase()}</Badge>
                          <span className="font-semibold text-gray-900">{item.title}</span>
                        </div>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600 mb-3">
                        <p><span className="font-medium">Executive:</span> {item.executive}</p>
                        <p><span className="font-medium">Event:</span> {item.event}</p>
                        <p><span className="font-medium">Issue:</span> {item.issue}</p>
                        <p className="text-red-600"><span className="font-medium">Action:</span> {item.action}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-handle-${item.id}`}>
                          Handle Now
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`button-delegate-${item.id}`}>
                          <Bot className="w-3 h-3 mr-1" /> Delegate to AI
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`button-details-${item.id}`}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Executives Overview */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#FF385C]" />
                    <CardTitle className="text-lg">Executives Overview (8 Total)</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-executives">
                    View All <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {executives.map((exec) => (
                  <div 
                    key={exec.id} 
                    className="p-4 rounded-lg border border-gray-200"
                    data-testid={`executive-card-${exec.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#FF385C]/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-[#FF385C]" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{exec.name} - {exec.title}</p>
                          <p className="text-sm text-gray-500">
                            Active Events: {exec.activeEvents} | Upcoming: {exec.upcoming} | Profile: {exec.profileComplete ? "Complete" : "Incomplete"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">This Week:</p>
                      <div className="space-y-1">
                        {exec.weekEvents.map((event, idx) => (
                          <p key={idx} className={`text-sm ${event.urgent ? "text-red-600" : event.done ? "text-green-600" : "text-gray-600"}`}>
                            {event.day}: {event.event} {event.done && <CheckCircle className="w-3 h-3 inline ml-1" />}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" data-testid={`button-calendar-${exec.id}`}>
                        <CalendarIcon className="w-3 h-3 mr-1" /> View Calendar
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-events-${exec.id}`}>
                        All Events
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-update-${exec.id}`}>
                        <MessageSquare className="w-3 h-3 mr-1" /> Send Update
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* AI Activity */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Activity (24h)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">
                  <CheckCircle className="w-4 h-4 inline text-green-500 mr-1" />
                  Completed 18 tasks automatically
                </p>
                <div className="space-y-2">
                  {aiActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm" data-testid={`ai-activity-${index}`}>
                      <span className="text-gray-400 mt-0.5">•</span>
                      <div>
                        <span className="text-gray-700">{activity.text}</span>
                        <span className="text-gray-400 ml-2">({activity.time})</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">7 items</span> awaiting your approval
                  </p>
                </div>
                <Button 
                  className="w-full mt-4 bg-[#FF385C] hover:bg-[#E23350]" 
                  data-testid="button-review-ai-work"
                >
                  Review AI Work <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Calendar Overview */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-[#FF385C]" />
                  <CardTitle className="text-lg">Calendar - This Week</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {calendarOverview.map((day, index) => (
                    <div key={index} className="p-2 bg-gray-50 rounded-lg text-center" data-testid={`calendar-day-${index}`}>
                      <p className="text-xs text-gray-500">{day.day}</p>
                      <p className="text-lg font-bold text-gray-900">{day.events}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" data-testid="button-master-calendar">
                    View Master Calendar
                  </Button>
                  <Button size="sm" variant="outline" data-testid="button-conflicts">
                    Conflicts
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-update">
                  <MessageSquare className="w-4 h-4 mr-2" /> Send Update
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-delegate">
                  <Bot className="w-4 h-4 mr-2" /> Delegate to AI
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-book">
                  <CalendarIcon className="w-4 h-4 mr-2" /> Book Event
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-travel">
                  <Plane className="w-4 h-4 mr-2" /> Arrange Travel
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-gift">
                  <Gift className="w-4 h-4 mr-2" /> Order Gift
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-report">
                  <BarChart3 className="w-4 h-4 mr-2" /> Weekly Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
