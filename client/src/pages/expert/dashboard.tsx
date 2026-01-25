import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  DollarSign, 
  Star, 
  Clock, 
  AlertCircle,
  MessageSquare,
  Calendar,
  Bot,
  ArrowRight,
  CheckCircle,
  Plane,
  Heart,
  Gift
} from "lucide-react";
import { Link } from "wouter";

export default function ExpertDashboard() {
  const stats = [
    { label: "Active Clients", value: 12, icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "Revenue This Month", value: "$4,850", icon: DollarSign, color: "bg-green-100 text-green-600" },
    { label: "Rating Average", value: "4.9", icon: Star, suffix: "/5", color: "bg-yellow-100 text-yellow-600" },
    { label: "AI Hours Saved", value: "38 hrs", icon: Clock, color: "bg-purple-100 text-purple-600" },
  ];

  const urgentItems = [
    {
      id: 1,
      client: "Sarah & Mike",
      event: "Tokyo Trip",
      priority: "urgent",
      message: "Restaurant reservation needed (today!)",
      icon: Plane,
    },
    {
      id: 2,
      client: "Jennifer",
      event: "Proposal Planning",
      priority: "high",
      message: "Response needed: Venue options review",
      icon: Heart,
    },
    {
      id: 3,
      client: "David & Emma",
      event: "Anniversary Dinner",
      priority: "medium",
      message: "Reminder: Menu selection due tomorrow",
      icon: Gift,
    },
  ];

  const activeClients = [
    {
      id: 1,
      name: "Sarah & Mike",
      event: "Tokyo Trip",
      status: "Currently traveling",
      statusDetail: "Day 3 of 10",
      lastContact: "2 hours ago",
      action: "Restaurant reservation needed",
      progress: 30,
      icon: Plane,
    },
    {
      id: 2,
      name: "Jennifer",
      event: "Proposal Planning",
      status: "Planning phase",
      statusDetail: "60% complete",
      eventDate: "April 28",
      daysAway: 29,
      action: "Review venue options",
      progress: 60,
      icon: Heart,
    },
  ];

  const aiActivity = [
    { text: "Researched 3 new restaurants for Sarah & Mike", time: "2 hours ago" },
    { text: "Updated Jennifer's proposal timeline", time: "4 hours ago" },
    { text: "Drafted response to David's menu question", time: "6 hours ago" },
    { text: "Optimized next week's booking calendar", time: "8 hours ago" },
  ];

  const upcomingEvents = [
    { day: "Tuesday", event: "Sarah & Mike check-in call", time: "3:00 PM" },
    { day: "Wednesday", event: "Jennifer venue viewing", time: "10:00 AM" },
    { day: "Friday", event: "David & Emma final menu review", time: "2:00 PM" },
  ];

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-200";
      case "high":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "medium":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-expert-welcome">
              Welcome back, Expert!
            </h1>
            <p className="text-gray-600">Here's what needs your attention today</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <Card key={index} className="border border-gray-200" data-testid={`card-stat-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stat.value}
                      {stat.suffix && <span className="text-lg text-gray-500">{stat.suffix}</span>}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Needs Attention */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <CardTitle className="text-lg">Needs Attention ({urgentItems.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {urgentItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border ${getPriorityStyles(item.priority)}`}
                    data-testid={`card-urgent-item-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <item.icon className="w-5 h-5 mt-0.5" />
                        <div>
                          <p className="font-medium">{item.client} - {item.event}</p>
                          <p className="text-sm opacity-80">{item.message}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={getPriorityStyles(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="bg-[#FF385C] " data-testid={`button-handle-${item.id}`}>
                        Handle Now
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-delegate-${item.id}`}>
                        Delegate to AI
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Active Clients */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Active Clients (12)</CardTitle>
                  <Link href="/expert/clients">
                    <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="link-view-all-clients">
                      View All <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeClients.map((client) => (
                  <div
                    key={client.id}
                    className="p-4 rounded-lg border border-gray-200 bg-white"
                    data-testid={`card-client-${client.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center">
                        <client.icon className="w-5 h-5 text-[#FF385C]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900">{client.name} - {client.event}</p>
                          <Badge variant="outline" className="text-xs">
                            {client.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {client.statusDetail}
                          {client.lastContact && ` • Last contact: ${client.lastContact}`}
                          {client.eventDate && ` • Event: ${client.eventDate} (${client.daysAway} days away)`}
                        </p>
                        {client.action && (
                          <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Action: {client.action}
                          </p>
                        )}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Progress</span>
                            <span>{client.progress}%</span>
                          </div>
                          <Progress value={client.progress} className="h-2" />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" data-testid={`button-chat-${client.id}`}>
                            <MessageSquare className="w-3 h-3 mr-1" /> Chat
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-itinerary-${client.id}`}>
                            <Calendar className="w-3 h-3 mr-1" /> Itinerary
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-ai-assist-${client.id}`}>
                            <Bot className="w-3 h-3 mr-1" /> AI Assist
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* AI Assistant Activity */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Assistant Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">
                  <CheckCircle className="w-4 h-4 inline text-green-500 mr-1" />
                  Completed 8 tasks in last 24 hours
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
                    <span className="font-medium">5 drafts</span> waiting for your review
                  </p>
                </div>
                <Button 
                  className="w-full mt-4 bg-[#FF385C] " 
                  data-testid="button-review-ai-work"
                >
                  Review AI Work <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#FF385C]" />
                  <CardTitle className="text-lg">This Week</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingEvents.map((event, index) => (
                  <div key={index} className="flex items-start gap-3 text-sm" data-testid={`event-${index}`}>
                    <span className="font-medium text-gray-700 min-w-20">{event.day}</span>
                    <div>
                      <p className="text-gray-800">{event.event}</p>
                      <p className="text-gray-500">{event.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-messages">
                  <MessageSquare className="w-4 h-4 mr-2" /> Messages
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-ai-tasks">
                  <Bot className="w-4 h-4 mr-2" /> AI Tasks
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-analytics">
                  <DollarSign className="w-4 h-4 mr-2" /> Analytics
                </Button>
                <Button variant="outline" size="sm" className="justify-start" data-testid="button-quick-payout">
                  <DollarSign className="w-4 h-4 mr-2" /> Request Payout
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
