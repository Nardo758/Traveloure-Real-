import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Calendar,
  Loader2,
  Lightbulb,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  ExternalLink,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface AssignedTrip {
  trip_id: string;
  assignment_id: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  traveler_name: string;
  status: "pending" | "accepted";
  assigned_at: string;
  suggestion_count: number;
}

interface TripSuggestion {
  id: string;
  type: string;
  day_number: number | null;
  title: string;
  description: string | null;
  estimated_cost: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  created_at: string;
}

interface CoordinationEngagement {
  id: string;
  tripId: string | null;
  experienceType: string;
  status: string | null;
  destination: string | null;
  dates: Record<string, unknown> | null;
  feePaymentStatus: string | null;
  createdAt: string | null;
}

interface SuggestionPayload {
  type: string;
  dayNumber?: number;
  title: string;
  description?: string;
  estimatedCost?: number;
}

const SUGGESTION_TYPES = [
  { value: "activity", label: "Activity" },
  { value: "food", label: "Food / Restaurant" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "venue", label: "Venue" },
  { value: "note", label: "General note" },
];

export default function ExpertAssignedTrips() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTripTitle, setSelectedTripTitle] = useState<string>("");
  // Grouped-by-client view — absorbs the retired /expert/clients page (sidebar audit, ratified
  // 2026-07-25): that page re-rendered this exact query grouped by traveler, so the grouping
  // lives here now. ?view=clients (the old dashboard "My Clients" link) opens it directly.
  const [view, setView] = useState<"trips" | "clients">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "clients"
      ? "clients"
      : "trips",
  );

  const [form, setForm] = useState({
    type: "activity",
    dayNumber: "",
    title: "",
    description: "",
    estimatedCost: "",
  });

  const { data: assignedTrips, isLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    staleTime: 30000,
  });

  // Factory wire A: event-coordination engagements assigned to this expert (Phase-1c admin
  // assignment previously dead-ended — no expert-side list existed).
  const { data: engagementsData } = useQuery<{ engagements: CoordinationEngagement[] }>({
    queryKey: ["/api/expert/coordination-engagements"],
    staleTime: 30000,
  });
  const engagements = engagementsData?.engagements ?? [];

  const { data: selectedTripSuggestions, isLoading: suggestionsLoading } = useQuery<{ suggestions: TripSuggestion[] }>({
    queryKey: [`/api/trips/${selectedTripId}/suggestions`],
    enabled: !!selectedTripId && suggestDialogOpen,
  });

  const submitSuggestionMutation = useMutation({
    mutationFn: async ({ tripId, payload }: { tripId: string; payload: SuggestionPayload }) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/suggestions`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${selectedTripId}/suggestions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/assigned-trips"] });
      setForm({ type: "activity", dayNumber: "", title: "", description: "", estimatedCost: "" });
      toast({ title: "Suggestion sent!", description: "The traveler will review your idea." });
    },
    onError: (err: any) => {
      toast({ title: "Could not submit suggestion", description: err.message, variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await apiRequest("POST", `/api/expert/assignments/${assignmentId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/assigned-trips"] });
      toast({ title: "Trip accepted", description: "You can now open it in the workspace." });
    },
    onError: (err: any) => {
      toast({ title: "Could not accept trip", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedTripId || !form.title.trim()) return;
    const payload: SuggestionPayload = {
      type: form.type,
      title: form.title.trim(),
    };
    if (form.dayNumber) payload.dayNumber = parseInt(form.dayNumber, 10);
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.estimatedCost) payload.estimatedCost = parseFloat(form.estimatedCost);
    submitSuggestionMutation.mutate({ tripId: selectedTripId, payload });
  };

  const openDialog = (trip: AssignedTrip) => {
    setSelectedTripId(trip.trip_id);
    setSelectedTripTitle(trip.trip_title || trip.destination);
    setForm({ type: "activity", dayNumber: "", title: "", description: "", estimatedCost: "" });
    setSuggestDialogOpen(true);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <ExpertLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assigned Trips</h1>
            <p className="text-muted-foreground mt-1">
              Trips assigned to you for curation. Submit suggestions and the traveler can approve them.
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0" role="tablist">
            <button
              onClick={() => setView("trips")}
              data-testid="toggle-view-trips"
              className={`px-3 py-1.5 text-xs font-semibold ${view === "trips" ? "bg-foreground text-background" : "bg-background text-muted-foreground"}`}
            >
              By trip
            </button>
            <button
              onClick={() => setView("clients")}
              data-testid="toggle-view-clients"
              className={`px-3 py-1.5 text-xs font-semibold ${view === "clients" ? "bg-foreground text-background" : "bg-background text-muted-foreground"}`}
            >
              By client
            </button>
          </div>
        </div>

        {/* Coordination engagements — events this expert coordinates (assigned by an admin). */}
        {engagements.length > 0 && (
          <div className="mb-6" data-testid="coordination-engagements">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Event coordination
            </h2>
            <div className="space-y-2">
              {engagements.map((e) => (
                <Card key={e.id} data-testid={`engagement-${e.id}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground capitalize">
                          {e.experienceType} coordination
                        </span>
                        <Badge variant="secondary" className="text-[10px] capitalize">{e.status ?? "intake"}</Badge>
                        {e.feePaymentStatus === "paid" && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100">Fee paid</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {e.destination ?? "Destination TBC"}
                      </span>
                    </div>
                    {e.tripId ? (
                      <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" asChild data-testid={`button-open-engagement-${e.id}`}>
                        <Link href={`/expert/workspace/${e.tripId}`}>
                          <ExternalLink className="w-3.5 h-3.5" /> Open workspace
                        </Link>
                      </Button>
                    ) : (
                      // Honest state: a concierge-born engagement may not have a trip yet — there is
                      // nothing to open until intake produces one (§13: no dead button pretending).
                      <Badge variant="outline" className="flex-shrink-0 text-[10px]">Awaiting trip setup</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Grouped-by-client view: same data, grouped by traveler. */}
        {view === "clients" && assignedTrips && assignedTrips.length > 0 && (
          <div className="space-y-4 mb-6" data-testid="clients-grouped-list">
            {Object.entries(
              assignedTrips.reduce<Record<string, AssignedTrip[]>>((acc, t) => {
                const key = t.traveler_name || "Client";
                (acc[key] = acc[key] ?? []).push(t);
                return acc;
              }, {}),
            ).map(([client, trips]) => (
              <Card key={client} data-testid={`client-group-${client}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    {client}
                    <span className="text-xs font-normal text-muted-foreground">
                      {trips.length} trip{trips.length > 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {trips.map((trip) => (
                    <div key={trip.trip_id} className="flex items-center justify-between gap-3 text-sm border border-border rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground truncate block">{trip.trip_title || trip.destination}</span>
                        <span className="text-xs text-muted-foreground">
                          {trip.destination} · {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                        </span>
                      </div>
                      {trip.status === "accepted" ? (
                        <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" asChild>
                          <Link href={`/expert/workspace/${trip.trip_id}`}>
                            <ExternalLink className="w-3.5 h-3.5" /> Workspace
                          </Link>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="flex-shrink-0">Pending</Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-64 mb-3" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : view === "clients" && assignedTrips && assignedTrips.length > 0 ? null : !assignedTrips || assignedTrips.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">No assigned trips</h3>
              <p className="text-muted-foreground text-sm">
                When travelers assign you to their trip, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4" data-testid="assigned-trips-list">
            {assignedTrips.map((trip) => (
              <Card key={trip.trip_id} data-testid={`assigned-trip-card-${trip.trip_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">
                          {trip.trip_title || trip.destination}
                        </h3>
                        <Badge
                          variant={trip.status === "accepted" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {trip.status === "accepted" ? "Active" : "Pending"}
                        </Badge>
                        {trip.suggestion_count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                            <Lightbulb className="w-2.5 h-2.5" />
                            {trip.suggestion_count} sent
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {trip.destination}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Assigned {formatDate(trip.assigned_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {trip.status === "pending" && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => acceptMutation.mutate(trip.assignment_id)}
                          disabled={acceptMutation.isPending}
                          data-testid={`button-accept-${trip.trip_id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Accept
                        </Button>
                      )}
                      {trip.status === "accepted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          asChild
                          data-testid={`button-open-workspace-${trip.trip_id}`}
                        >
                          <Link href={`/expert/workspace/${trip.trip_id}`}>
                            <ExternalLink className="w-3.5 h-3.5" />
                            Workspace
                          </Link>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openDialog(trip)}
                        data-testid={`button-suggest-${trip.trip_id}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Suggest
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Suggestion Submission Dialog */}
        <Dialog open={suggestDialogOpen} onOpenChange={(open) => {
          setSuggestDialogOpen(open);
          if (!open) setSelectedTripId(null);
        }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-submit-suggestion">
            <DialogHeader>
              <DialogTitle>Suggest a change for {selectedTripTitle}</DialogTitle>
              <DialogDescription>
                Your suggestion will be sent to the traveler for approval. Approved suggestions are added to their itinerary.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="suggestion-type">Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger id="suggestion-type" data-testid="select-suggestion-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUGGESTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="suggestion-day">Day (optional)</Label>
                  <Input
                    id="suggestion-day"
                    type="number"
                    min={1}
                    placeholder="e.g. 2"
                    value={form.dayNumber}
                    onChange={(e) => setForm(f => ({ ...f, dayNumber: e.target.value }))}
                    data-testid="input-suggestion-day"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="suggestion-title">Title *</Label>
                <Input
                  id="suggestion-title"
                  placeholder="e.g. Visit Senso-ji Temple at sunrise"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  data-testid="input-suggestion-title"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="suggestion-description">Details (optional)</Label>
                <Textarea
                  id="suggestion-description"
                  placeholder="Why this is special, how to book, insider tips..."
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  data-testid="input-suggestion-description"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="suggestion-cost">Estimated cost (USD, optional)</Label>
                <Input
                  id="suggestion-cost"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.estimatedCost}
                  onChange={(e) => setForm(f => ({ ...f, estimatedCost: e.target.value }))}
                  data-testid="input-suggestion-cost"
                />
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleSubmit}
                disabled={submitSuggestionMutation.isPending || !form.title.trim()}
                data-testid="button-submit-suggestion"
              >
                {submitSuggestionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lightbulb className="w-4 h-4" />
                )}
                Send suggestion
              </Button>
            </div>

            {/* Previous suggestions log */}
            {selectedTripId && (
              <div className="border-t border-border pt-4 mt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Your previous suggestions</h4>
                {suggestionsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
                  </div>
                ) : selectedTripSuggestions?.suggestions?.length ? (
                  <div className="space-y-2" data-testid="expert-suggestions-log">
                    {selectedTripSuggestions.suggestions.map(s => (
                      <div
                        key={s.id}
                        className={`rounded-lg border p-3 text-sm ${
                          s.status === "approved"
                            ? "border-green-200 bg-green-50/50"
                            : s.status === "rejected"
                            ? "border-red-200 bg-red-50/50"
                            : "border-border bg-muted/20"
                        }`}
                        data-testid={`expert-suggestion-log-${s.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground truncate flex-1">{s.title}</span>
                          {s.status === "approved" && (
                            <span className="flex items-center gap-1 text-[10px] text-green-700 flex-shrink-0">
                              <CheckCircle className="w-3 h-3" /> Approved
                            </span>
                          )}
                          {s.status === "rejected" && (
                            <span className="flex items-center gap-1 text-[10px] text-red-700 flex-shrink-0">
                              <XCircle className="w-3 h-3" /> Declined
                            </span>
                          )}
                          {s.status === "pending" && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-700 flex-shrink-0">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </div>
                        {s.rejection_note && (
                          <p className="text-xs text-red-600 italic">"{s.rejection_note}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No suggestions sent yet.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ExpertLayout>
  );
}
