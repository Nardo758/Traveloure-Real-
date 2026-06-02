import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  Calendar as CalendarIcon,
  Bot,
  ArrowRight,
  MessageSquare,
  Plane,
  Gift,
  BarChart3,
  CheckCircle,
  Inbox,
} from "lucide-react";
import { Link } from "wouter";

interface Client {
  id: string | number;
  name?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}

export default function EADashboard() {
  const { user } = useAuth();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/ea/clients"],
  });

  const clientCount = clients?.length ?? 0;
  const displayName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "there" : "there";

  return (
    <EALayout title="Dashboard">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A18]" data-testid="text-ea-welcome">
            Welcome back, {displayName}!
          </h1>
          <p className="text-[#7A7A72]">Here's your executive coordination overview</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-[#E8E8E2]" data-testid="card-stat-clients">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#7A7A72]">Clients</p>
                  <p className="text-2xl font-bold text-[#1A1A18]">{clientCount}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="card-stat-events">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#7A7A72]">Active Events</p>
                  <p className="text-2xl font-bold text-[#1A1A18]">0</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="card-stat-tasks">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#7A7A72]">AI Tasks</p>
                  <p className="text-2xl font-bold text-[#1A1A18]">0</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="card-stat-messages">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#7A7A72]">Messages</p>
                  <p className="text-2xl font-bold text-[#1A1A18]">0</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Clients Overview */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#FF385C]" />
                    <CardTitle className="text-lg">Clients ({clientCount})</CardTitle>
                  </div>
                  <Link href="/ea/clients">
                    <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-clients">
                      View All <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {clients && clients.length > 0 ? (
                  <div className="space-y-3">
                    {clients.slice(0, 4).map((client) => {
                      const name = client.displayName ||
                        (client.firstName && client.lastName ? `${client.firstName} ${client.lastName}` : null) ||
                        client.name ||
                        "Client";
                      return (
                        <div key={String(client.id)} className="flex items-center gap-3 p-3 rounded-lg border border-[#E8E8E2]" data-testid={`client-row-${client.id}`}>
                          <div className="w-9 h-9 rounded-full bg-[#FF385C]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-[#FF385C]">
                              {String(name)[0]?.toUpperCase()}
                            </span>
                          </div>
                          <p className="font-medium text-[#1A1A18]">{name}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                    <p className="text-[#7A7A72] text-sm">No clients yet</p>
                    <Link href="/ea/clients">
                      <Button size="sm" className="mt-3 bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-add-client">
                        Add Client
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Inbox className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                  <p className="text-[#7A7A72] text-sm">No recent activity</p>
                  <p className="text-[#AEAEA6] text-xs mt-1">Activity will appear here as you work</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* AI Assistant */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Assistant</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#7A7A72] mb-4">
                  Delegate tasks to your AI assistant to save time on routine coordination work.
                </p>
                <Link href="/ea/ai-assistant">
                  <Button className="w-full bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-open-ai">
                    Open AI Assistant <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Link href="/ea/communications">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-update">
                    <MessageSquare className="w-4 h-4 mr-2" /> Send Update
                  </Button>
                </Link>
                <Link href="/ea/ai-assistant">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-delegate">
                    <Bot className="w-4 h-4 mr-2" /> Delegate to AI
                  </Button>
                </Link>
                <Link href="/ea/calendar">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-book">
                    <CalendarIcon className="w-4 h-4 mr-2" /> Book Event
                  </Button>
                </Link>
                <Link href="/ea/travel">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-travel">
                    <Plane className="w-4 h-4 mr-2" /> Arrange Travel
                  </Button>
                </Link>
                <Link href="/ea/gifts">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-gift">
                    <Gift className="w-4 h-4 mr-2" /> Order Gift
                  </Button>
                </Link>
                <Link href="/ea/reports">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-report">
                    <BarChart3 className="w-4 h-4 mr-2" /> Reports
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
