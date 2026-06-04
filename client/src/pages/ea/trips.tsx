import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plane, Plus, ArrowRight, MapPin, Calendar, UserCheck } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface ManagedTrip {
  id: string;
  trackingNumber: string | null;
  title: string | null;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  numberOfTravelers: number | null;
  expertId: string | null;
  createdAt: string;
  clientUserId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientEmail: string | null;
  eaClientRelationshipId: string | null;
}

interface EaClient {
  id: string;
  clientUserId: string | null;
  clientEmail: string | null;
  displayName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

function statusColor(status: string) {
  switch (status) {
    case "draft": return "bg-gray-100 text-gray-700";
    case "planning": return "bg-blue-100 text-blue-700";
    case "confirmed": return "bg-green-100 text-green-700";
    case "completed": return "bg-purple-100 text-purple-700";
    case "cancelled": return "bg-red-100 text-red-700";
    default: return "bg-amber-100 text-amber-700";
  }
}

function clientName(trip: ManagedTrip) {
  const first = trip.clientFirstName || "";
  const last = trip.clientLastName || "";
  const full = `${first} ${last}`.trim();
  return full || trip.clientEmail || "Client";
}

export default function EATrips() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    clientRelationshipId: "",
    title: "",
    destination: "",
    startDate: "",
    endDate: "",
    eventType: "vacation",
    numberOfTravelers: 1,
    specialRequests: "",
  });

  const { data: trips = [], isLoading } = useQuery<ManagedTrip[]>({
    queryKey: ["/api/ea/trips"],
  });

  const { data: clients = [] } = useQuery<EaClient[]>({
    queryKey: ["/api/ea/clients"],
  });

  const createTrip = useMutation({
    mutationFn: async () => {
      if (!form.clientRelationshipId) throw new Error("Pick a client");
      const res = await apiRequest("POST", `/api/ea/clients/${form.clientRelationshipId}/trips`, {
        title: form.title || undefined,
        destination: form.destination,
        startDate: form.startDate,
        endDate: form.endDate,
        eventType: form.eventType,
        numberOfTravelers: form.numberOfTravelers,
        specialRequests: form.specialRequests || undefined,
      });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ea/trips"] });
      toast({ title: "Trip created", description: "Your client has been notified." });
      setCreateOpen(false);
      setForm({
        clientRelationshipId: "",
        title: "",
        destination: "",
        startDate: "",
        endDate: "",
        eventType: "vacation",
        numberOfTravelers: 1,
        specialRequests: "",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Could not create trip",
        description: err?.message || "Try again",
      });
    },
  });

  const clientsWithAccount = clients.filter((c) => c.clientUserId);

  return (
    <EALayout title="Managed Trips">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A18]" data-testid="text-ea-trips-title">
              Managed Trips
            </h1>
            <p className="text-[#7A7A72]">Trips you coordinate on behalf of your clients</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-create-trip">
                <Plus className="w-4 h-4 mr-2" /> New Trip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create a trip for a client</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Client</Label>
                  <Select
                    value={form.clientRelationshipId}
                    onValueChange={(v) => setForm((f) => ({ ...f, clientRelationshipId: v }))}
                  >
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Pick a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientsWithAccount.length === 0 && (
                        <SelectItem value="" disabled>
                          No clients with platform accounts yet
                        </SelectItem>
                      )}
                      {clientsWithAccount.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.displayName ||
                            `${c.userFirstName || ""} ${c.userLastName || ""}`.trim() ||
                            c.clientEmail}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title (optional)</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Auto-generated if blank"
                    data-testid="input-title"
                  />
                </div>
                <div>
                  <Label>Destination</Label>
                  <Input
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    placeholder="e.g. Kyoto, Japan"
                    data-testid="input-destination"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start</Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Event type</Label>
                    <Select
                      value={form.eventType}
                      onValueChange={(v) => setForm((f) => ({ ...f, eventType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vacation">Vacation</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="wedding">Wedding</SelectItem>
                        <SelectItem value="celebration">Celebration</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Travelers</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.numberOfTravelers}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, numberOfTravelers: Number(e.target.value) || 1 }))
                      }
                      data-testid="input-travelers"
                    />
                  </div>
                </div>
                <div>
                  <Label>Special requests</Label>
                  <Textarea
                    rows={3}
                    value={form.specialRequests}
                    onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))}
                    placeholder="Dietary, accessibility, must-haves…"
                    data-testid="input-special-requests"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createTrip.mutate()}
                  disabled={
                    createTrip.isPending ||
                    !form.clientRelationshipId ||
                    !form.destination ||
                    !form.startDate ||
                    !form.endDate
                  }
                  className="bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-submit-create-trip"
                >
                  {createTrip.isPending ? "Creating…" : "Create Trip"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-8 text-center text-[#7A7A72]">Loading…</CardContent></Card>
        ) : trips.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Plane className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
              <p className="text-[#7A7A72] mb-4">No managed trips yet</p>
              <Button
                className="bg-[#FF385C] hover:bg-[#E23350]"
                onClick={() => setCreateOpen(true)}
                data-testid="button-create-first-trip"
              >
                <Plus className="w-4 h-4 mr-2" /> Create your first trip
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip) => (
              <Card key={trip.id} className="border border-[#E8E8E2]" data-testid={`card-trip-${trip.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{trip.title || trip.destination}</CardTitle>
                    <Badge className={statusColor(trip.status)}>{trip.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[#7A7A72]">
                    <MapPin className="w-3.5 h-3.5" /> {trip.destination}
                  </div>
                  <div className="flex items-center gap-2 text-[#7A7A72]">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(trip.startDate).toLocaleDateString()} –{" "}
                    {new Date(trip.endDate).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-[#7A7A72]">
                    <UserCheck className="w-3.5 h-3.5" /> For {clientName(trip)}
                  </div>
                  {trip.expertId && (
                    <Badge variant="outline" className="text-xs">Expert assigned</Badge>
                  )}
                  <Link href={`/trip/${trip.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      data-testid={`button-open-trip-${trip.id}`}
                    >
                      Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </EALayout>
  );
}
