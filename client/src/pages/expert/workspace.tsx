import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Bot,
  Calendar,
  MapPin,
  Lightbulb,
  Loader2,
  PlusCircle,
  ExternalLink,
  Clock,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AssignedTrip {
  trip_id: string;
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

const SUGGESTION_TYPES = [
  { value: "activity", label: "Activity" },
  { value: "food", label: "Food / Restaurant" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "venue", label: "Venue" },
  { value: "note", label: "General note" },
];

export default function ExpertWorkspace() {
  const { tripId } = useParams<{ tripId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    type: "activity",
    dayNumber: "",
    title: "",
    description: "",
    estimatedCost: "",
  });

  const { data: assignedTrips, isLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
  });

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{
    suggestions: TripSuggestion[];
  }>({
    queryKey: [`/api/trips/${tripId}/suggestions`],
    enabled: !!tripId,
  });

  const submitSuggestionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/suggestions`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/suggestions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/assigned-trips"] });
      setForm({ type: "activity", dayNumber: "", title: "", description: "", estimatedCost: "" });
      toast({ title: "Suggestion sent!", description: "The traveler will review your idea." });
    },
    onError: (err: any) => {
      toast({ title: "Could not submit suggestion", description: err.message, variant: "destructive" });
    },
  });

  const trip = assignedTrips?.find((t) => t.trip_id === tripId);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const handleSubmit = () => {
    if (!tripId || !form.title.trim()) return;
    const payload: any = { type: form.type, title: form.title.trim() };
    if (form.dayNumber) payload.dayNumber = parseInt(form.dayNumber, 10);
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.estimatedCost) payload.estimatedCost = parseFloat(form.estimatedCost);
    submitSuggestionMutation.mutate(payload);
  };

  const suggestions = suggestionsData?.suggestions || [];

  return (
    <ExpertLayout title={trip ? `Workspace: ${trip.trip_title || trip.destination}` : "Workspace"}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/expert/dashboard">
            <button
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-workspace-back-dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/expert/clients">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-workspace-back-clients"
            >
              Clients
            </button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">
            {isLoading ? "Loading…" : trip ? (trip.trip_title || trip.destination) : `Trip ${tripId}`}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : !trip ? (
          /* Trip not found / not assigned */
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Trip not found</h3>
              <p className="text-muted-foreground text-sm mb-6">
                This trip isn't assigned to you, or it may no longer exist.
              </p>
              <Link href="/expert/assigned-trips">
                <Button data-testid="button-workspace-back-assigned">View Assigned Trips</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Trip header */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-bold text-foreground">
                        {trip.trip_title || trip.destination}
                      </h1>
                      <Badge
                        variant={trip.status === "accepted" ? "default" : "secondary"}
                        className="text-xs"
                        data-testid="badge-workspace-status"
                      >
                        {trip.status === "accepted" ? "Active" : "Pending"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {trip.destination}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {trip.traveler_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Assigned {formatDate(trip.assigned_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`/trip/${trip.trip_id}?tab=itinerary`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-workspace-open-itinerary">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Full Itinerary
                      </Button>
                    </a>
                    <Link href="/chat">
                      <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-workspace-open-chat">
                        Message Client
                      </Button>
                    </Link>
                    <Link href="/expert/ai-assistant">
                      <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-workspace-ai-assist">
                        <Bot className="w-3.5 h-3.5" />
                        AI Assist
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Empty state — no suggestions yet */}
            {!suggestionsLoading && suggestions.length === 0 && (
              <Card className="border-2 border-dashed border-muted-foreground/25 bg-muted/20">
                <CardContent className="p-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <PlusCircle className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Start Building This Itinerary</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                    No suggestions yet for this trip. Add your first recommendation or use AI to
                    generate ideas based on the destination.
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <Link href="/expert/ai-assistant">
                      <Button className="gap-2" data-testid="button-workspace-ai-quickstart">
                        <Bot className="w-4 h-4" />
                        AI Quick Start
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => document.getElementById("suggestion-form")?.scrollIntoView({ behavior: "smooth" })}
                      data-testid="button-workspace-add-first"
                    >
                      <Lightbulb className="w-4 h-4" />
                      Add First Suggestion
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Existing suggestions */}
            {suggestions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    Your Suggestions ({suggestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2" data-testid="workspace-suggestions-list">
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded-lg border p-3 text-sm ${
                        s.status === "approved"
                          ? "border-green-200 bg-green-50/50"
                          : s.status === "rejected"
                          ? "border-red-200 bg-red-50/50"
                          : "border-border bg-muted/20"
                      }`}
                      data-testid={`workspace-suggestion-${s.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground flex-1 truncate">{s.title}</span>
                        <Badge
                          variant={
                            s.status === "approved"
                              ? "default"
                              : s.status === "rejected"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px] flex-shrink-0"
                        >
                          {s.status}
                        </Badge>
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                      )}
                      {s.rejection_note && (
                        <p className="text-xs text-red-600 italic mt-1">"{s.rejection_note}"</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Add suggestion form */}
            <Card id="suggestion-form">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add a Suggestion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-type">Type</Label>
                    <Select
                      value={form.type}
                      onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                    >
                      <SelectTrigger id="ws-type" data-testid="select-workspace-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUGGESTION_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-day">Day (optional)</Label>
                    <Input
                      id="ws-day"
                      type="number"
                      min={1}
                      placeholder="e.g. 2"
                      value={form.dayNumber}
                      onChange={(e) => setForm((f) => ({ ...f, dayNumber: e.target.value }))}
                      data-testid="input-workspace-day"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-title">Title *</Label>
                  <Input
                    id="ws-title"
                    placeholder="e.g. Visit Senso-ji Temple at sunrise"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    data-testid="input-workspace-title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-desc">Details (optional)</Label>
                  <Textarea
                    id="ws-desc"
                    placeholder="Why this is special, how to book, insider tips…"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    data-testid="input-workspace-description"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-cost">Estimated cost USD (optional)</Label>
                  <Input
                    id="ws-cost"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.estimatedCost}
                    onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                    data-testid="input-workspace-cost"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={handleSubmit}
                  disabled={submitSuggestionMutation.isPending || !form.title.trim()}
                  data-testid="button-workspace-submit-suggestion"
                >
                  {submitSuggestionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lightbulb className="w-4 h-4" />
                  )}
                  Send suggestion
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ExpertLayout>
  );
}
