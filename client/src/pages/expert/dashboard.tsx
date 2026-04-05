import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Gift,
  Package,
  Loader2,
  TrendingUp,
  BarChart3,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { ExpertConstraintDashboard, ExpertCoordinationHub } from "@/components/logistics";
import { TravelPulseTicker } from "@/components/shared/travel-pulse-ticker";

interface AnalyticsDashboard {
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    pendingBookings: number;
    completedBookings: number;
  };
  earnings: any[];
}

interface AiStats {
  tasksDelegated: number;
  tasksCompleted: number;
  timeSaved: number;
  avgQualityScore: string;
}

interface Booking {
  id: string;
  status: string;
  totalAmount: string;
  bookingDetails: any;
  traveler?: { displayName: string };
  createdAt: string;
}

export default function ExpertDashboard() {
  const [selectedTripId, setSelectedTripId] = useState("");

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ["/api/expert/analytics/dashboard"],
  });

  const { data: bookings } = useQuery<Booking[]>({
    queryKey: ["/api/expert/bookings"],
  });

  const { data: aiStats } = useQuery<AiStats>({
    queryKey: ["/api/expert/ai-stats"],
  });

  const pendingBookings = bookings?.filter(b => b.status === "pending" || b.status === "confirmed") || [];
  const activeClients = pendingBookings.slice(0, 3);

  const stats = [
    { label: "Active Clients", value: analytics?.summary?.pendingBookings ?? 0, icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "Revenue This Month", value: `$${(analytics?.summary?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "bg-green-100 text-green-600" },
    { label: "Rating Average", value: (analytics?.summary?.avgRating ?? 0).toFixed(1), icon: Star, suffix: "/5", color: "bg-yellow-100 text-yellow-600" },
    { label: "AI Hours Saved", value: `${aiStats?.timeSaved ?? 0} hrs`, icon: Clock, color: "bg-purple-100 text-purple-600" },
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

  if (analyticsLoading) {
    return (
      <ExpertLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </ExpertLayout>
    );
  }

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-expert-welcome">
            Welcome back, Expert!
          </h1>
          <p className="text-gray-600 mt-1">{analytics?.summary?.pendingBookings || 0} active clients • Top Destination Expert</p>
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

        {/* TravelPulse Ticker */}
        <TravelPulseTicker items={[
          { city: "Kyoto", text: "Spring season: cultural tours booming", type: "up" },
          { city: "Tokyo", text: "Tech tours trending +80% this month", type: "up" },
          { city: "Pricing", text: "Your rates: premium tier ✓", type: "neutral" },
          { city: "Demand", text: "Expert consultation: peak hours noon-3PM", type: "up" },
          { city: "Trends", text: "AI itineraries: 45% of bookings", type: "up" },
        ]} />

        {/* Two-Panel Layout: Left 60%, Right 40% */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - 60% width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Link href="/chat">
                    <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-quick-messages">
                      <MessageSquare className="w-5 h-5 mb-1" />
                      <span className="text-xs">Messages</span>
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-quick-itinerary">
                    <Calendar className="w-5 h-5 mb-1" />
                    <span className="text-xs">Itinerary</span>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-quick-content">
                    <Zap className="w-5 h-5 mb-1" />
                    <span className="text-xs">Content</span>
                  </Button>
                  <Link href="/expert/ai-assistant">
                    <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-quick-ai">
                      <Bot className="w-5 h-5 mb-1" />
                      <span className="text-xs">AI Help</span>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* My Clients */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">My Clients ({analytics?.summary?.pendingBookings || 0})</CardTitle>
                  <Link href="/expert/clients">
                    <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="link-view-all-clients">
                      View All <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeClients.length > 0 ? activeClients.map((client) => (
                  <div
                    key={client.id}
                    className="p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                    data-testid={`card-client-${client.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center flex-shrink-0">
                        <Plane className="w-5 h-5 text-[#FF385C]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">{client.traveler?.displayName || "Client"}</p>
                            <p className="text-sm text-gray-500 mt-0.5">
                              ${parseFloat(client.totalAmount || "0").toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {client.status}
                          </Badge>
                        </div>
                        <div className="mt-3 flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs" data-testid={`button-chat-${client.id}`}>
                            <MessageSquare className="w-3 h-3 mr-1" /> Chat
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" data-testid={`button-itinerary-${client.id}`}>
                            <Calendar className="w-3 h-3 mr-1" /> Itinerary
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" data-testid={`button-ai-assist-${client.id}`}>
                            <Bot className="w-3 h-3 mr-1" /> AI
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-4">No active clients yet</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Bookings */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Recent Bookings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { service: "Full Expert Service", client: "Sarah Mitchell", amount: 499, date: "Mar 28", status: "confirmed" },
                  { service: "AI + Expert Review", client: "David Chen", amount: 49.99, date: "Mar 22", status: "confirmed" },
                  { service: "Full Expert Service", client: "Emma Laurent", amount: 399, date: "Mar 15", status: "confirmed" },
                ].map((booking, idx) => (
                  <div key={idx} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:pb-0 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{booking.service}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{booking.client}</p>
                          <p className="text-xs text-gray-400 mt-1">{booking.date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm font-bold text-emerald-700">${booking.amount}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${booking.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingBookings.length > 0 ? pendingBookings.slice(0, 4).map((booking, index) => (
                    <div key={booking.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:pb-0 last:border-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Plane className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{booking.traveler?.displayName || "Client"}</p>
                        <p className="text-sm text-gray-500">${parseFloat(booking.totalAmount || "0").toLocaleString()}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : "Recently"}
                        </p>
                      </div>
                      <Badge className="text-xs flex-shrink-0" variant={booking.status === "pending" ? "destructive" : "default"}>
                        {booking.status}
                      </Badge>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-center py-4">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - 40% width */}
          <div className="space-y-6 hidden lg:block">
            {/* Earnings Snapshot */}
            <Card className="border border-gray-200 bg-gradient-to-br from-green-50 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">Earnings</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">This Month</p>
                  <p className="text-3xl font-bold text-gray-900">${(analytics?.summary?.totalRevenue ?? 0).toLocaleString()}</p>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: "65%" }}></div>
                </div>
                <Button className="w-full bg-green-600 hover:bg-green-700" data-testid="button-request-payout">
                  Request Payout
                </Button>
              </CardContent>
            </Card>

            {/* Action Items */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <CardTitle className="text-lg">Action Items ({pendingBookings.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingBookings.length > 0 ? pendingBookings.slice(0, 3).map((booking) => (
                  <div
                    key={booking.id}
                    className={`p-3 rounded-lg border text-sm ${booking.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}
                    data-testid={`card-action-${booking.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{booking.traveler?.displayName || "Client"}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Booking: ${parseFloat(booking.totalAmount || "0").toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {booking.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" data-testid={`button-action-${booking.id}`}>
                        Review
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-3 text-sm">All caught up!</p>
                )}
              </CardContent>
            </Card>

            {/* Market Insights */}
            <Card className="border border-gray-200 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg">Market Insights</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Experts in City</span>
                    <span className="font-semibold text-gray-900">847</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Avg Booking Rate</span>
                    <span className="font-semibold text-gray-900">68%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Your Ranking</span>
                    <span className="font-semibold text-amber-600">#12</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-view-analytics">
                  <BarChart3 className="w-4 h-4 mr-1" /> View Analytics
                </Button>
              </CardContent>
            </Card>

            {/* AI Assistant Activity */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Assistant</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Tasks Completed</span>
                  <span className="font-semibold">{aiStats?.tasksCompleted ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Time Saved</span>
                  <span className="font-semibold">{aiStats?.timeSaved ?? 0}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Quality Score</span>
                  <span className="font-semibold text-green-600">{aiStats?.avgQualityScore ?? "N/A"}</span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-review-ai-work">
                  View Details
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        {/* Trip Logistics Coordination */}
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg">Trip Logistics</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-500">Trip ID:</Label>
                <Input
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  placeholder="Enter trip ID"
                  className="w-48 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedTripId ? (
              <Tabs defaultValue="constraints">
                <TabsList>
                  <TabsTrigger value="constraints">Client Constraints</TabsTrigger>
                  <TabsTrigger value="vendors">Vendor Coordination</TabsTrigger>
                </TabsList>
                <TabsContent value="constraints" className="mt-4">
                  <ExpertConstraintDashboard tripId={selectedTripId} />
                </TabsContent>
                <TabsContent value="vendors" className="mt-4">
                  <ExpertCoordinationHub tripId={selectedTripId} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                Enter a trip ID above to view client constraints and coordinate vendors.
                Select a client from the Active Clients list to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
