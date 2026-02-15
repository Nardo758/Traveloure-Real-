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
} from "lucide-react";
import { Link } from "wouter";
import { ExpertConstraintDashboard, ExpertCoordinationHub } from "@/components/logistics";

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
                  <CardTitle className="text-lg">Needs Attention ({pendingBookings.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingBookings.length > 0 ? pendingBookings.slice(0, 3).map((booking) => (
                  <div
                    key={booking.id}
                    className={`p-4 rounded-lg border ${booking.status === "pending" ? getPriorityStyles("urgent") : getPriorityStyles("medium")}`}
                    data-testid={`card-urgent-item-${booking.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Plane className="w-5 h-5 mt-0.5" />
                        <div>
                          <p className="font-medium">{booking.traveler?.displayName || "Client"} - Booking</p>
                          <p className="text-sm opacity-80">${parseFloat(booking.totalAmount || "0").toLocaleString()} - {booking.status}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={getPriorityStyles(booking.status === "pending" ? "urgent" : "medium")}>
                        {booking.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="bg-[#FF385C] " data-testid={`button-handle-${booking.id}`}>
                        Handle Now
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-delegate-${booking.id}`}>
                        Delegate to AI
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-4">No urgent items - you're all caught up!</p>
                )}
              </CardContent>
            </Card>

            {/* Active Clients */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Active Clients ({analytics?.summary?.pendingBookings || 0})</CardTitle>
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
                    className="p-4 rounded-lg border border-gray-200 bg-white"
                    data-testid={`card-client-${client.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center">
                        <Plane className="w-5 h-5 text-[#FF385C]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900">{client.traveler?.displayName || "Client"}</p>
                          <Badge variant="outline" className="text-xs">
                            {client.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          ${parseFloat(client.totalAmount || "0").toLocaleString()}
                        </p>
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
                )) : (
                  <p className="text-gray-500 text-center py-4">No active clients yet</p>
                )}
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
                  {aiStats?.tasksCompleted ?? 0} tasks completed (last 30 days)
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span className="text-gray-700">Tasks delegated: {aiStats?.tasksDelegated ?? 0}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span className="text-gray-700">Time saved: {aiStats?.timeSaved ?? 0} hours</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span className="text-gray-700">Quality score: {aiStats?.avgQualityScore ?? "N/A"}</span>
                  </div>
                </div>
                <Button
                  className="w-full mt-4 bg-[#FF385C] "
                  data-testid="button-review-ai-work"
                >
                  Review AI Work <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Recent Earnings */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">Recent Earnings</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.earnings || []).slice(0, 3).map((earning: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 text-sm" data-testid={`earning-${index}`}>
                    <span className="font-medium text-gray-700 min-w-20">${Number(earning.amount || 0).toLocaleString()}</span>
                    <div>
                      <p className="text-gray-800">{earning.type || "Earning"}</p>
                      <p className="text-gray-500">{earning.createdAt ? new Date(earning.createdAt).toLocaleDateString() : ""}</p>
                    </div>
                  </div>
                ))}
                {(!analytics?.earnings || analytics.earnings.length === 0) && (
                  <p className="text-gray-500 text-center py-2">No recent earnings</p>
                )}
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
