import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Plus, 
  Calendar,
  MapPin,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  Filter
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

interface EaEvent {
  id: string; title: string; executiveName?: string; type?: string;
  date?: string; venue?: string; guests?: number; status: string;
  notes?: string; giftNeeded?: boolean;
}

export default function EAEvents() {
  const { data: events = [] } = useQuery<EaEvent[]>({
    queryKey: ["/api/ea/events"],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "urgent":
        return <Badge className="bg-red-500 text-white"><AlertCircle className="w-3 h-3 mr-1" /> Urgent</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700">Pending Approval</Badge>;
      case "confirmed":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <EALayout title="Events">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-events-title">
              Events Management
            </h1>
            <p className="text-gray-600">Track and manage all executive events</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-new-event">
            <Plus className="w-4 h-4 mr-2" /> Create New Event
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-total-events">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">28</p>
              <p className="text-sm text-gray-600">Active Events</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-this-week">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">12</p>
              <p className="text-sm text-gray-600">This Week</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">5</p>
              <p className="text-sm text-gray-600">Pending Approval</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-urgent">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">3</p>
              <p className="text-sm text-gray-600">Need Attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search events..." 
              className="pl-9"
              data-testid="input-search-events"
            />
          </div>
          <Select data-testid="select-executive">
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Executives" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Executives</SelectItem>
              <SelectItem value="james">James Anderson</SelectItem>
              <SelectItem value="sarah">Sarah Chen</SelectItem>
              <SelectItem value="michael">Michael Torres</SelectItem>
              <SelectItem value="lisa">Lisa Parker</SelectItem>
            </SelectContent>
          </Select>
          <Select data-testid="select-type">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="dinner">Dinner</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="travel">Travel</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
            </SelectContent>
          </Select>
          <Select data-testid="select-status">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          {events.length === 0 && (
            <Card className="border border-[#E8E8E2]">
              <CardContent className="p-12 text-center">
                <Calendar className="w-12 h-12 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No events yet</p>
                <p className="text-sm text-[#7A7A72] mt-1">Events you create will appear here</p>
              </CardContent>
            </Card>
          )}
          {events.map((event) => (
            <Card 
              key={event.id} 
              className={`border ${event.status === "urgent" ? "border-red-200 bg-red-50/50" : "border-gray-200"}`}
              data-testid={`event-${event.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{event.title}</h3>
                      {getStatusBadge(event.status)}
                      <Badge variant="outline">{event.type}</Badge>
                      {event.giftNeeded && (
                        <Badge className="bg-purple-100 text-purple-700">Gift Needed</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                      <p className="flex items-center gap-2">
                        <Users className="w-4 h-4" /> {event.executiveName}
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> {event.date}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> {event.venue}
                      </p>
                      {event.guests && (
                        <p className="flex items-center gap-2">
                          <Users className="w-4 h-4" /> {event.guests} guests
                        </p>
                      )}
                    </div>
                    {event.notes && (
                      <p className="text-sm text-red-600 mt-2">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {event.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" data-testid={`button-view-${event.id}`}>
                      View Details
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-edit-${event.id}`}>
                      Edit
                    </Button>
                    {event.status === "urgent" && (
                      <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-handle-${event.id}`}>
                        Handle Now
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </EALayout>
  );
}
