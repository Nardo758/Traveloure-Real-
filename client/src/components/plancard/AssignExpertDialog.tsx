/**
 * AssignExpertDialog — the choose-an-expert step (Trip Card rebuild Phase 3b, row 10;
 * ledger 2026-08-31-manifest-is-the-boundary).
 *
 * The slip already carries the per-item `with_expert` routing action ("Send to expert",
 * ActivitiesSection RoutingActions) — but that presupposes an expert is assigned. The
 * WHICH-expert choice had no home on the slip; it lived only on the trip-details expert-tab
 * bolt-on. Per the ruling ("move into the slip's send step if the slip lacks a choice step,
 * else delete"), the picker relocates here — a controlled two-step dialog the slip mounts.
 *
 * Choosing an expert is a planning decision, so this belongs to the slip (planning surface),
 * not the finalized Trip Card. Self-contained: owns its picker state, the expert + offering
 * queries, and the assign mutation.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, Sparkles, Star, User, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AssignAdvisorState {
  advisor_id: string;
  status: "pending" | "accepted" | "rejected";
}

interface Expert {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  specialties: string[];
  destinations: string[];
  hourly_rate: string | null;
  years_of_experience: string | null;
  availability: string | null;
  response_time: string | null;
  profile_image_url: string | null;
  avg_rating: string;
  review_count: number;
}

interface ExpertOfferingOption {
  offering_type_key: string;
  display_name: string;
  service_tier: string;
  tagline: string | null;
}

/**
 * AssignExpertSlot — the slip's entry point for the picker. Owns the advisor-status query
 * so it shows the "Add a local expert" affordance ONLY to the owner and ONLY while no expert
 * is assigned; once one is assigned it renders nothing (the assigned expert is surfaced by the
 * family's advisor strip on the summary card — row 9). This is the single mount SlipView adds.
 */
export function AssignExpertSlot({
  tripId,
  destination,
  isOwner,
}: {
  tripId: string;
  destination: string | null | undefined;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: advisorData } = useQuery<{ advisor: AssignAdvisorState | null }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: isOwner && !!tripId,
  });

  // Not the owner, or an expert is already assigned ⇒ no assign entry on the slip.
  if (!isOwner || advisorData?.advisor) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4" data-testid="slip-assign-expert-slot">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Want a local expert on this trip?</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choosing an expert is part of planning — pick one to curate {destination || "your trip"} and send suggestions.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 flex-shrink-0" onClick={() => setOpen(true)} data-testid="button-find-expert">
          <Sparkles className="w-3.5 h-3.5" />
          Add a local expert
        </Button>
      </div>
      <AssignExpertDialog tripId={tripId} destination={destination} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function AssignExpertDialog({
  tripId,
  destination,
  open,
  onOpenChange,
}: {
  tripId: string;
  destination: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [expertMessage, setExpertMessage] = useState("");
  const [selectedOfferingType, setSelectedOfferingType] = useState<{ key: string; label: string; tier: string } | null>(null);

  const reset = () => {
    setSelectedExpert(null);
    setExpertMessage("");
    setSelectedOfferingType(null);
  };

  const { data: expertsData, isLoading: expertsLoading } = useQuery<Expert[]>({
    queryKey: [`/api/trip-experts?destination=${encodeURIComponent(destination || "")}`],
    enabled: open && !!destination,
  });

  const { data: expertOfferingOptions } = useQuery<ExpertOfferingOption[]>({
    queryKey: ["/api/offering-types/experts"],
    queryFn: async () => {
      const res = await fetch("/api/offering-types/experts");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
    staleTime: 15 * 60_000,
  });

  const assignExpertMutation = useMutation({
    mutationFn: async ({ expertUserId, message, offeringTypeKey }: { expertUserId: string; message: string; offeringTypeKey?: string }) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/expert-advisor`, { expertUserId, message, offeringTypeKey });
      return res.json() as Promise<{ success: boolean; advisorId: string; status: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/expert-advisor`] });
      onOpenChange(false);
      reset();
      toast({ title: "Expert request sent!", description: "They will review and respond soon." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to assign expert", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-expert-picker">
        <DialogHeader>
          <DialogTitle>
            {selectedOfferingType ? `Choose an expert for ${destination}` : "What kind of help do you need?"}
          </DialogTitle>
          <DialogDescription>
            {selectedOfferingType
              ? `${selectedOfferingType.label} — select an expert to help curate your trip.`
              : "Pick the type of expert service you're looking for."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 0 — pick offering type */}
        {!selectedOfferingType && (
          <div className="mt-2 space-y-2" data-testid="expert-picker-offering-step">
            {(expertOfferingOptions ?? []).length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : (
              (expertOfferingOptions ?? []).map((o) => (
                <button
                  key={o.offering_type_key}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setSelectedOfferingType({ key: o.offering_type_key, label: o.display_name, tier: o.service_tier })}
                  data-testid={`button-offering-type-${o.offering_type_key}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">{o.display_name}</div>
                    {o.tagline && <p className="text-xs text-muted-foreground truncate">{o.tagline}</p>}
                  </div>
                  <Badge variant="secondary" className="text-[10px] capitalize flex-shrink-0">{o.service_tier.replace(/_/g, " ")}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        )}

        {selectedOfferingType && selectedExpert ? (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedExpert.profile_image_url ?? undefined} />
                <AvatarFallback>{selectedExpert.first_name?.[0]}{selectedExpert.last_name?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{selectedExpert.first_name} {selectedExpert.last_name}</div>
                {parseFloat(selectedExpert.avg_rating) > 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current text-amber-500" />
                    {parseFloat(selectedExpert.avg_rating).toFixed(1)}
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedExpert(null)} data-testid="button-change-expert">
                Change
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message (optional)</label>
              <Textarea
                placeholder="Tell the expert about your preferences, goals, or any specific requests..."
                value={expertMessage}
                onChange={(e) => setExpertMessage(e.target.value)}
                rows={3}
                data-testid="input-expert-message"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => assignExpertMutation.mutate({ expertUserId: selectedExpert.user_id, message: expertMessage, offeringTypeKey: selectedOfferingType?.key })}
              disabled={assignExpertMutation.isPending}
              data-testid="button-confirm-expert"
            >
              {assignExpertMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Send request to {selectedExpert.first_name}
            </Button>
          </div>
        ) : selectedOfferingType ? (
          <div className="mt-2 space-y-3" data-testid="expert-picker-expert-step">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
              onClick={() => { setSelectedExpert(null); setSelectedOfferingType(null); }}
              data-testid="button-picker-back"
            >
              <ArrowLeft className="w-3 h-3" /> Change service type
            </button>
            {expertsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : expertsData && expertsData.length > 0 ? (
              expertsData.map((expert) => (
                <button
                  key={expert.id}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setSelectedExpert(expert)}
                  data-testid={`button-select-expert-${expert.id}`}
                >
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarImage src={expert.profile_image_url ?? undefined} />
                    <AvatarFallback>{expert.first_name?.[0]}{expert.last_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">
                      {expert.first_name} {expert.last_name}
                    </div>
                    {expert.bio && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{expert.bio}</p>}
                    {Array.isArray(expert.specialties) && expert.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(expert.specialties as string[]).slice(0, 3).map((s, si) => (
                          <span key={si} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                      {parseFloat(expert.avg_rating) > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-current text-amber-500" />
                          {parseFloat(expert.avg_rating).toFixed(1)}
                        </span>
                      )}
                      {expert.hourly_rate && <span>${expert.hourly_rate}/hr</span>}
                      {expert.response_time && <span>Responds {expert.response_time}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </button>
              ))
            ) : (
              <div className="text-center py-8">
                <User className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No experts found for {destination}.</p>
                <p className="text-sm mt-1 text-muted-foreground">Check back soon or browse all experts.</p>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
