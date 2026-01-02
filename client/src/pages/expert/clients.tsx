import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search,
  MessageSquare,
  Calendar,
  Bot,
  Eye,
  Plane,
  Heart,
  Gift,
  PartyPopper,
  Briefcase,
  AlertCircle,
  Clock
} from "lucide-react";
import { useState } from "react";

const eventTypeIcons: Record<string, any> = {
  travel: Plane,
  proposal: Heart,
  anniversary: Gift,
  birthday: PartyPopper,
  corporate: Briefcase,
};

export default function ExpertClients() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const clients = [
    {
      id: 1,
      name: "Sarah & Mike",
      event: "Tokyo Trip",
      eventType: "travel",
      status: "traveling",
      statusLabel: "Currently traveling",
      statusDetail: "Day 3 of 10",
      lastContact: "2 hours ago",
      action: "Restaurant reservation needed",
      actionPriority: "urgent",
      progress: 30,
      startDate: "2026-01-01",
      endDate: "2026-01-10",
    },
    {
      id: 2,
      name: "Jennifer",
      event: "Proposal Planning",
      eventType: "proposal",
      status: "planning",
      statusLabel: "Planning phase",
      statusDetail: "60% complete",
      eventDate: "April 28",
      daysAway: 29,
      action: "Review venue options",
      actionPriority: "high",
      progress: 60,
      startDate: "2026-04-28",
      endDate: "2026-04-28",
    },
    {
      id: 3,
      name: "David & Emma",
      event: "Anniversary Dinner",
      eventType: "anniversary",
      status: "planning",
      statusLabel: "Final preparations",
      statusDetail: "85% complete",
      eventDate: "January 15",
      daysAway: 14,
      action: "Menu selection due tomorrow",
      actionPriority: "medium",
      progress: 85,
      startDate: "2026-01-15",
      endDate: "2026-01-15",
    },
    {
      id: 4,
      name: "Corporate Tech Inc",
      event: "Team Retreat",
      eventType: "corporate",
      status: "completed",
      statusLabel: "Completed",
      statusDetail: "Ended Dec 20",
      progress: 100,
      startDate: "2025-12-18",
      endDate: "2025-12-20",
    },
    {
      id: 5,
      name: "Amanda",
      event: "Birthday Celebration",
      eventType: "birthday",
      status: "planning",
      statusLabel: "Early planning",
      statusDetail: "25% complete",
      eventDate: "March 5",
      daysAway: 63,
      progress: 25,
      startDate: "2026-03-05",
      endDate: "2026-03-05",
    },
  ];

  const filteredClients = clients.filter((client) => {
    if (statusFilter !== "all" && client.status !== statusFilter) return false;
    if (searchQuery && !client.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !client.event.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case "traveling":
        return "bg-green-100 text-green-700 border-green-200";
      case "planning":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "completed":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-red-600";
      case "high":
        return "text-yellow-600";
      case "medium":
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <ExpertLayout title="Clients">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Clients</h1>
            <p className="text-gray-600">Manage your client relationships and projects</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
                data-testid="input-search-clients"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="traveling">Traveling</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border border-gray-200 bg-gray-50" data-testid="card-active-clients-stat">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.status !== "completed").length}</p>
              <p className="text-sm text-gray-600">Active Clients</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 bg-gray-50" data-testid="card-traveling-stat">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.status === "traveling").length}</p>
              <p className="text-sm text-gray-600">Currently Traveling</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 bg-gray-50" data-testid="card-attention-stat">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{clients.filter(c => c.action).length}</p>
              <p className="text-sm text-gray-600">Need Attention</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <Card className="border border-gray-200">
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No clients found matching your criteria</p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map((client) => {
              const Icon = eventTypeIcons[client.eventType] || Plane;
              return (
                <Card key={client.id} className="border border-gray-200" data-testid={`card-client-${client.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[#FF385C]/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-[#FF385C]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-lg">{client.name}</h3>
                            <p className="text-gray-600">{client.event}</p>
                          </div>
                          <Badge variant="outline" className={getStatusBadgeStyles(client.status)}>
                            {client.statusLabel}
                          </Badge>
                        </div>
                        
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>{client.statusDetail}</span>
                          {client.lastContact && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last contact: {client.lastContact}
                            </span>
                          )}
                          {client.eventDate && (
                            <span>Event: {client.eventDate} ({client.daysAway} days away)</span>
                          )}
                        </div>

                        {client.action && (
                          <p className={`text-sm mt-2 flex items-center gap-1 ${getPriorityStyles(client.actionPriority || "")}`}>
                            <AlertCircle className="w-3 h-3" />
                            Action needed: {client.action}
                          </p>
                        )}

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Progress</span>
                            <span>{client.progress}%</span>
                          </div>
                          <Progress value={client.progress} className="h-2" />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {client.status === "traveling" && (
                            <Button size="sm" variant="outline" data-testid={`button-live-view-${client.id}`}>
                              <Eye className="w-3 h-3 mr-1" /> Live View
                            </Button>
                          )}
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
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </ExpertLayout>
  );
}
