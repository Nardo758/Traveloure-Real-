import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plane,
  Hotel,
  Calendar,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus,
  Bot,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDelegateToAi } from "./use-ea-ai-delegate";

interface EaTravelArrangement {
  id: string; executiveId?: string | null; executiveName?: string; title: string; destination?: string;
  startDate?: string; endDate?: string; status: string;
  segments?: Array<{ city: string; dates: string; hotel: string; hotelStatus: string; flight: string; flightStatus: string }>;
  notes?: string;
}

interface EaExecutive {
  id: string;
  name: string;
}

const emptyForm = {
  title: "",
  executiveId: "",
  destination: "",
  startDate: "",
  endDate: "",
  notes: "",
};

export default function EATravel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [delegateTask, setDelegateTask] = useState("");
  const [form, setForm] = useState(emptyForm);

  const { data: allTravel = [] } = useQuery<EaTravelArrangement[]>({
    queryKey: ["/api/ea/travel"],
  });
  const { data: executives = [] } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const exec = executives.find((e) => e.id === form.executiveId);
      return apiRequest("POST", "/api/ea/travel", {
        title: form.title,
        executiveId: form.executiveId || undefined,
        executiveName: exec?.name || undefined,
        destination: form.destination || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
        status: "planning",
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/travel"] });
      toast({ title: "Trip arranged", description: "Added to travel coordination." });
      setForm(emptyForm);
      setAddOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not arrange trip", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/ea/travel/${id}`, { status: "confirmed" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/travel"] });
      toast({ title: "Trip confirmed" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delegate = useDelegateToAi();

  const activeTrips = allTravel.filter(t => ["confirmed", "pending_approval", "in_progress"].includes(t.status));
  const upcomingTravel = allTravel.filter(t => t.status === "planning" || t.status === "pending");

  return (
    <EALayout title="Travel Coordination">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-travel-title">
              Travel Coordination
            </h1>
            <p className="text-gray-600">Manage executive travel arrangements</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-new-trip">
                <Plus className="w-4 h-4 mr-2" /> Arrange New Trip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Arrange New Trip</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Title <span className="text-red-500">*</span></Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Tokyo Board Meeting" data-testid="input-trip-title" />
                </div>
                <div>
                  <Label>Executive</Label>
                  <Select value={form.executiveId || undefined} onValueChange={(v) => setForm({ ...form, executiveId: v })}>
                    <SelectTrigger data-testid="select-trip-executive">
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
                  <Label>Destination</Label>
                  <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="e.g. Kyoto, Japan" data-testid="input-trip-destination" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-trip-start" />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-trip-end" />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} data-testid="input-trip-notes" />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={createMutation.isPending || !form.title}
                  onClick={() => createMutation.mutate()}
                  data-testid="button-submit-trip"
                >
                  {createMutation.isPending ? "Arranging…" : "Arrange Trip"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-[#E8E8E2]" data-testid="stat-active-trips">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{activeTrips.length}</p>
              <p className="text-sm text-[#7A7A72]">Active Trips</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">
                {activeTrips.filter(t => t.status === "pending_approval").length}
              </p>
              <p className="text-sm text-[#7A7A72]">Pending Approval</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-upcoming">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{upcomingTravel.length}</p>
              <p className="text-sm text-[#7A7A72]">Upcoming</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-confirmed">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">
                {activeTrips.filter(t => t.status === "confirmed").length}
              </p>
              <p className="text-sm text-[#7A7A72]">Confirmed</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Trips */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary" />
              Active Trips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {activeTrips.length === 0 && (
              <div className="text-center py-8">
                <Plane className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No active trips</p>
                <p className="text-sm text-[#7A7A72] mt-1">Trip arrangements will appear here</p>
              </div>
            )}
            {activeTrips.map((trip) => (
              <div
                key={trip.id}
                className={`p-4 rounded-lg border ${trip.status === "pending_approval" ? "border-yellow-200 bg-yellow-50/50" : "border-gray-200"}`}
                data-testid={`trip-${trip.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-900">{trip.executiveName ? `${trip.executiveName} — ` : ""}{trip.title}</p>
                      {trip.status === "confirmed" ? (
                        <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700"><AlertCircle className="w-3 h-3 mr-1" /> Pending Approval</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4" /> {trip.destination ?? "—"}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> {trip.startDate ?? "—"}{trip.endDate ? ` → ${trip.endDate}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {trip.status !== "confirmed" && (
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(trip.id)}
                        data-testid={`button-approve-trip-${trip.id}`}
                      >
                        Approve All
                      </Button>
                    )}
                  </div>
                </div>

                {trip.notes && (
                  <p className="text-sm text-yellow-600 mb-4">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {trip.notes}
                  </p>
                )}

                {/* Segments */}
                {!!(trip.segments ?? []).length && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(trip.segments ?? []).map((segment, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          <span className="font-medium text-gray-900">{segment.city}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{segment.dates}</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-gray-600">
                              <Plane className="w-3 h-3" /> {segment.flight}
                            </span>
                            {segment.flightStatus === "confirmed" ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-gray-600">
                              <Hotel className="w-3 h-3" /> {segment.hotel}
                            </span>
                            {segment.hotelStatus === "confirmed" ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Travel */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Travel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingTravel.length === 0 && (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-[#AEAEA6] mx-auto mb-2" />
                  <p className="text-[#7A7A72] text-sm">No upcoming travel</p>
                </div>
              )}
              {upcomingTravel.map((travel, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  data-testid={`upcoming-travel-${idx}`}
                >
                  <div>
                    <p className="font-medium text-gray-900">{travel.executiveName ?? "—"}</p>
                    <p className="text-sm text-gray-500">{travel.destination ?? "—"}{travel.startDate ? ` • ${travel.startDate}` : ""}</p>
                  </div>
                  <Badge variant={travel.status === "confirmed" ? "default" : "outline"}>
                    {travel.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI Travel Assistant */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-600" />
                AI Travel Assistant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">Delegate a travel task — it lands in your AI Assistant queue for review:</p>
              <ul className="space-y-2 text-sm text-gray-600 mb-4">
                <li>• Search optimal flight routes and times</li>
                <li>• Find hotels matching executive preferences</li>
                <li>• Coordinate multi-city itineraries</li>
                <li>• Handle booking modifications</li>
                <li>• Track frequent flyer programs</li>
              </ul>
              <Textarea
                placeholder="Describe the travel task… (e.g. 'Research business-class flights to Tokyo for James, week of Aug 10')"
                value={delegateTask}
                onChange={(e) => setDelegateTask(e.target.value)}
                rows={2}
                className="mb-3"
                data-testid="input-travel-delegate-task"
              />
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                disabled={delegate.isPending || !delegateTask.trim()}
                onClick={() => {
                  delegate.mutate({ type: "travel", task: delegateTask.trim() }, {
                    onSuccess: () => setDelegateTask(""),
                  });
                }}
                data-testid="button-ai-travel"
              >
                <Bot className="w-4 h-4 mr-2" /> {delegate.isPending ? "Sending…" : "Delegate Travel Task"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </EALayout>
  );
}
