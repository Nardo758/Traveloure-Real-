import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Calendar,
  MapPin,
  Users,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaEvent {
  id: string; title: string; executiveId?: string | null; executiveName?: string; type?: string;
  date?: string; venue?: string; guests?: number; status: string;
  notes?: string; giftNeeded?: boolean;
}

interface EaExecutive {
  id: string;
  name: string;
}

const EVENT_TYPES = ["dinner", "meeting", "travel", "personal"];

const emptyForm = {
  title: "",
  executiveId: "",
  type: "meeting",
  date: "",
  time: "",
  venue: "",
  guests: "",
  notes: "",
  giftNeeded: false,
};

export default function EAEvents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [executiveFilter, setExecutiveFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: events = [] } = useQuery<EaEvent[]>({
    queryKey: ["/api/ea/events"],
  });
  const { data: executives = [] } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const exec = executives.find((e) => e.id === form.executiveId);
      return apiRequest("POST", "/api/ea/events", {
        title: form.title,
        executiveId: form.executiveId || undefined,
        executiveName: exec?.name || undefined,
        type: form.type,
        date: form.date ? `${form.date}T${form.time || "00:00"}` : undefined,
        venue: form.venue || undefined,
        guests: form.guests ? Number(form.guests) : undefined,
        notes: form.notes || undefined,
        giftNeeded: form.giftNeeded,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/events"] });
      toast({ title: "Event created" });
      setForm(emptyForm);
      setAddOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not create event", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ea/events/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/events"] });
      toast({ title: "Event updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Derive stat cards from the real events list (was hardcoded 28/12/5/3 crowning
  // an otherwise-empty list — §13). Honest zero when there are no events.
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const activeCount = events.filter((e) => e.status !== "completed" && e.status !== "cancelled").length;
  const thisWeekCount = events.filter((e) => {
    if (!e.date) return false;
    const d = new Date(e.date);
    return !isNaN(d.getTime()) && d >= now && d <= weekFromNow;
  }).length;
  const pendingCount = events.filter((e) => e.status === "pending").length;
  const urgentCount = events.filter((e) => e.status === "urgent").length;

  const filteredEvents = events.filter((e) => {
    if (search && !`${e.title} ${e.venue ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (executiveFilter !== "all" && e.executiveId !== executiveFilter) return false;
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    return true;
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
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-new-event">
                <Plus className="w-4 h-4 mr-2" /> Create New Event
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Title <span className="text-red-500">*</span></Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Board Dinner" data-testid="input-event-title" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Executive</Label>
                    <Select value={form.executiveId || undefined} onValueChange={(v) => setForm({ ...form, executiveId: v })}>
                      <SelectTrigger data-testid="select-event-executive">
                        <SelectValue placeholder="Select executive" />
                      </SelectTrigger>
                      <SelectContent>
                        {executives.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-gray-400">No executives added yet</div>
                        )}
                        {executives.map((exec) => (
                          <SelectItem key={exec.id} value={exec.id}>{exec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger data-testid="select-event-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="input-event-date" />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} data-testid="input-event-time" />
                  </div>
                  <div>
                    <Label>Guests</Label>
                    <Input type="number" min="0" value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })} data-testid="input-event-guests" />
                  </div>
                </div>
                <div>
                  <Label>Venue</Label>
                  <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. The Ritz-Carlton, Kyoto" data-testid="input-event-venue" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} data-testid="input-event-notes" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="gift-needed"
                    checked={form.giftNeeded}
                    onCheckedChange={(v) => setForm({ ...form, giftNeeded: v === true })}
                    data-testid="checkbox-gift-needed"
                  />
                  <Label htmlFor="gift-needed" className="cursor-pointer font-normal">A gift is needed for this event</Label>
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={createMutation.isPending || !form.title}
                  onClick={() => createMutation.mutate()}
                  data-testid="button-submit-event"
                >
                  {createMutation.isPending ? "Creating…" : "Create Event"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-total-events">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{activeCount}</p>
              <p className="text-sm text-gray-600">Active Events</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-this-week">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{thisWeekCount}</p>
              <p className="text-sm text-gray-600">This Week</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              <p className="text-sm text-gray-600">Pending Approval</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-urgent">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">{urgentCount}</p>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-events"
            />
          </div>
          <Select value={executiveFilter} onValueChange={setExecutiveFilter}>
            <SelectTrigger className="w-48" data-testid="select-executive">
              <SelectValue placeholder="All Executives" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Executives</SelectItem>
              {executives.map((exec) => (
                <SelectItem key={exec.id} value={exec.id}>{exec.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40" data-testid="select-type">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status">
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
          {events.length > 0 && filteredEvents.length === 0 && (
            <Card className="border border-[#E8E8E2]">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-[#7A7A72]">No events match your filters</p>
              </CardContent>
            </Card>
          )}
          {filteredEvents.map((event) => (
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
                        <Users className="w-4 h-4" /> {event.executiveName || "—"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> {event.date ? new Date(event.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> {event.venue || "—"}
                      </p>
                      {!!event.guests && (
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
                    {event.status !== "confirmed" && (
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: event.id, status: "confirmed" })}
                        data-testid={`button-handle-${event.id}`}
                      >
                        {event.status === "urgent" ? "Handle Now" : "Mark Confirmed"}
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
