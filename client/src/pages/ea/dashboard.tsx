import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Bell,
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

interface ImportantDate {
  label: string;
  date: string;
}

interface EaExecutive {
  id: string;
  name: string;
  family?: {
    spouse?: string;
    anniversary?: string;
    children?: string;
    importantDates?: ImportantDate[];
  };
}

interface UpcomingDate {
  executiveName: string;
  label: string;
  daysUntil: number;
  dateStr: string;
}

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseMonthDay(dateStr: string): { month: number; day: number } | null {
  const cleaned = dateStr.trim().replace(/,/g, "");
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;
  const monthKey = parts[0].toLowerCase();
  const day = parseInt(parts[1], 10);
  const month = MONTH_MAP[monthKey];
  if (month === undefined || isNaN(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function daysUntilNextOccurrence(month: number, day: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(today.getFullYear(), month, day);
  if (target.getTime() < today.getTime()) {
    target = new Date(today.getFullYear() + 1, month, day);
  }
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getUpcomingDates(executives: EaExecutive[], windowDays = 30): UpcomingDate[] {
  const results: UpcomingDate[] = [];

  for (const exec of executives) {
    const dates = exec.family?.importantDates ?? [];
    for (const entry of dates) {
      const parsed = parseMonthDay(entry.date);
      if (!parsed) continue;
      const daysUntil = daysUntilNextOccurrence(parsed.month, parsed.day);
      if (daysUntil <= windowDays) {
        results.push({
          executiveName: exec.name,
          label: entry.label,
          daysUntil,
          dateStr: entry.date,
        });
      }
    }

    if (exec.family?.anniversary) {
      const parsed = parseMonthDay(exec.family.anniversary);
      if (parsed) {
        const daysUntil = daysUntilNextOccurrence(parsed.month, parsed.day);
        if (daysUntil <= windowDays) {
          results.push({
            executiveName: exec.name,
            label: "Anniversary",
            daysUntil,
            dateStr: exec.family.anniversary,
          });
        }
      }
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

function urgencyBadge(daysUntil: number) {
  if (daysUntil === 0) return <Badge className="bg-red-100 text-red-700 border-red-200" data-testid="badge-urgency-today">Today</Badge>;
  if (daysUntil === 1) return <Badge className="bg-orange-100 text-orange-700 border-orange-200" data-testid="badge-urgency-tomorrow">Tomorrow</Badge>;
  if (daysUntil <= 7) return <Badge className="bg-amber-100 text-amber-700 border-amber-200" data-testid={`badge-urgency-${daysUntil}d`}>{daysUntil}d</Badge>;
  return <Badge variant="outline" className="text-[#7A7A72]" data-testid={`badge-urgency-${daysUntil}d`}>{daysUntil}d</Badge>;
}

export default function EADashboard() {
  const { user } = useAuth();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/ea/clients"],
  });

  const { data: managedTrips } = useQuery<{ id: string; status: string }[]>({
    queryKey: ["/api/ea/trips"],
  });

  const { data: executives } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const clientCount = clients?.length ?? 0;
  const tripCount = managedTrips?.length ?? 0;
  const activeTripCount = managedTrips?.filter((t) => t.status !== "completed" && t.status !== "cancelled").length ?? 0;
  const displayName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "there" : "there";

  const upcomingDates = getUpcomingDates(executives ?? []);

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
          <Card className="border border-[#E8E8E2]" data-testid="card-stat-trips">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#7A7A72]">Active Trips</p>
                  <p className="text-2xl font-bold text-[#1A1A18]">{activeTripCount}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                  <Plane className="w-5 h-5" />
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

        {/* Upcoming Important Dates Banner (only shown when dates exist) */}
        {upcomingDates.length > 0 && (
          <Card className="border border-amber-200 bg-amber-50" data-testid="card-upcoming-dates-banner">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  {upcomingDates.length} important date{upcomingDates.length > 1 ? "s" : ""} coming up in the next 30 days
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {upcomingDates.slice(0, 4).map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100 rounded-full px-3 py-1"
                    data-testid={`upcoming-date-chip-${i}`}
                  >
                    <span className="font-medium">{d.executiveName}:</span>
                    <span>{d.label}</span>
                    <span className="text-amber-600">
                      {d.daysUntil === 0 ? "today" : d.daysUntil === 1 ? "tomorrow" : `in ${d.daysUntil}d`}
                    </span>
                  </div>
                ))}
                {upcomingDates.length > 4 && (
                  <span className="text-xs text-amber-600 flex items-center">+{upcomingDates.length - 4} more</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Clients Overview */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">Clients ({clientCount})</CardTitle>
                  </div>
                  <Link href="/ea/clients">
                    <Button variant="ghost" size="sm" className="text-primary" data-testid="button-view-all-clients">
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
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-primary">
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
                      <Button size="sm" className="mt-3 bg-primary hover:bg-primary/90" data-testid="button-add-client">
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
            {/* Upcoming Important Dates */}
            <Card className="border border-[#E8E8E2]" data-testid="card-upcoming-dates">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">Upcoming Dates</CardTitle>
                  </div>
                  {upcomingDates.length > 0 && (
                    <Badge className="bg-primary/10 text-primary border-primary/20" data-testid="badge-upcoming-count">
                      {upcomingDates.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {upcomingDates.length > 0 ? (
                  <div className="space-y-2" data-testid="list-upcoming-dates">
                    {upcomingDates.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-[#E8E8E2] hover:bg-[#F8F8F5] transition-colors"
                        data-testid={`upcoming-date-row-${i}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1A1A18] truncate" data-testid={`upcoming-date-label-${i}`}>
                            {entry.label}
                          </p>
                          <p className="text-xs text-[#7A7A72] truncate" data-testid={`upcoming-date-exec-${i}`}>
                            {entry.executiveName} · {entry.dateStr}
                          </p>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          {urgencyBadge(entry.daysUntil)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6" data-testid="upcoming-dates-empty">
                    <CalendarIcon className="w-8 h-8 text-[#AEAEA6] mx-auto mb-2" />
                    <p className="text-[#7A7A72] text-sm">No dates in the next 30 days</p>
                    <Link href="/ea/executives">
                      <Button variant="ghost" size="sm" className="mt-2 text-primary text-xs" data-testid="button-manage-executives">
                        Manage Executives
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

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
                  <Button className="w-full bg-primary hover:bg-primary/90" data-testid="button-open-ai">
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
                <Link href="/ea/trips">
                  <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-quick-trip">
                    <Plane className="w-4 h-4 mr-2" /> Manage Trips
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
