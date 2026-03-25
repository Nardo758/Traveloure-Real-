import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Share2, MessageCircle, User, ExternalLink, CheckCircle, XCircle, Eye } from "lucide-react";
import { ItineraryCard, type ItineraryCardData, type ActivityDiff, type TransportDiff } from "@/components/itinerary/ItineraryCard";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SharedItineraryResponse {
  variant: {
    id: string;
    name: string;
    description?: string | null;
    destination?: string | null;
    dateRange?: { start?: string | null; end?: string | null };
    totalCost?: string | number | null;
    optimizationScore?: number | null;
    days: Array<{
      dayNumber: number;
      date?: string;
      activities: Array<{
        id: string;
        name: string;
        startTime?: string | null;
        endTime?: string | null;
        lat?: number | null;
        lng?: number | null;
        category?: string | null;
        cost?: number;
        description?: string | null;
        location?: string | null;
        duration?: number | null;
      }>;
      transportLegs: InlineTransportLegData[];
    }>;
    transportSummary?: {
      totalLegs: number;
      totalMinutes: number;
      totalCostUsd: number;
    };
  };
  mapsLinks?: {
    googleMapsPerDay?: Record<number, string>;
    appleMapsPerDay?: Record<number, string>;
    appleMapsWebPerDay?: Record<number, string>;
    kmlDownloadUrl?: string;
    gpxDownloadUrl?: string;
  };
  sharedBy?: { name: string; avatarUrl?: string | null; userId?: string };
  permissions?: string;
  shareToken?: string;
  expertStatus?: string;
  expertNotes?: string | null;
  expertDiff?: {
    activityDiffs?: Record<string, ActivityDiff>;
    transportDiffs?: Record<string, TransportDiff>;
    submittedAt?: string;
  } | null;
  sharedWithExpert?: boolean;
  isOwner?: boolean;
}

export default function ItineraryViewPage() {
  const { token } = useParams<{ token: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showSuggestDialog, setShowSuggestDialog] = useState(false);
  const [expertNotes, setExpertNotes] = useState("");
  const [activityDiffs, setActivityDiffs] = useState<Record<string, ActivityDiff>>({});
  const [transportDiffs, setTransportDiffs] = useState<Record<string, TransportDiff>>({});
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [rejectedDiffIds, setRejectedDiffIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<SharedItineraryResponse>({
    queryKey: ["/api/itinerary-share", token],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary-share/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error(err.error || "Failed to load itinerary");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const suggestModMutation = useMutation({
    mutationFn: async () => {
      if (!expertNotes.trim()) throw new Error("Please add a note in the Expert Notes panel before sending.");
      const res = await fetch(`/api/expert-review/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: expertNotes,
          activityDiffs,
          transportDiffs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send suggestion");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowSuggestDialog(false);
      toast({ title: "Edits sent!", description: "The traveler has been notified of your suggestions." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send edits", description: err.message, variant: "destructive" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ action, rejectedIds }: { action: "accept" | "reject"; rejectedIds?: string[] }) => {
      const res = await fetch(`/api/expert-review/${token}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectedDiffIds: rejectedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to acknowledge");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share", token] });
      setShowDiffReview(false);
      setRejectedDiffIds(new Set());
      toast({
        title: variables.action === "accept" ? "Edits accepted" : "Edits rejected",
        description: variables.action === "accept"
          ? "The expert's suggestions have been accepted."
          : "The expert's suggestions have been dismissed.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!data?.variant) return;

    const destination = data.variant.destination || data.variant.name;
    const cost = data.variant.totalCost ? `$${data.variant.totalCost}` : "";
    const days = data.variant.days?.length || 0;
    const dayText = days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : "";

    const categorySet = new Set<string>();
    data.variant.days?.forEach((day) => {
      day.activities?.forEach((act) => {
        if (act.category) categorySet.add(act.category);
      });
    });
    const vibeTags = Array.from(categorySet).slice(0, 3).join(", ");

    const descriptionParts = [vibeTags, dayText, cost].filter(Boolean);
    const description = `${destination} itinerary: ${descriptionParts.join(" • ")}`;

    document.title = `${destination} Itinerary • Traveloure`;

    const setMetaTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const setMetaName = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    setMetaTag("og:title", `${destination} Itinerary • Traveloure`);
    setMetaTag("og:description", description);
    setMetaName("description", description);

    const coverImageUrl = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&h=630&q=80";
    setMetaTag("og:image", coverImageUrl);
    setMetaTag("og:type", "website");

    return () => {
      document.title = "Traveloure";
    };
  }, [data?.variant]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-3 mt-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const errMsg = (error as Error).message;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">
            {errMsg.includes("expired") ? "Link Expired" : "Itinerary Not Found"}
          </h2>
          <p className="text-muted-foreground mb-4">
            {errMsg.includes("expired")
              ? "This share link has expired. Ask the owner to share a new link."
              : "This itinerary could not be found. The link may be invalid."}
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cardData: ItineraryCardData = {
    id: data.variant.id,
    name: data.variant.name,
    description: data.variant.description,
    destination: data.variant.destination,
    dateRange: data.variant.dateRange,
    totalCost: data.variant.totalCost,
    optimizationScore: data.variant.optimizationScore,
    days: data.variant.days,
    transportSummary: data.variant.transportSummary,
  };

  const isExpertView = data.permissions === "suggest" || data.permissions === "edit" || data.sharedWithExpert;
  const isOwnerView = !!data.isOwner;
  const expertStatus = data.expertStatus;
  const hasPendingReview = isOwnerView && expertStatus === "review_sent";

  const totalDiffs = Object.keys(activityDiffs).length + Object.keys(transportDiffs).length;
  const reviewActivityDiffs = data.expertDiff?.activityDiffs || {};
  const reviewTransportDiffs = data.expertDiff?.transportDiffs || {};
  const totalReviewDiffs = Object.keys(reviewActivityDiffs).length + Object.keys(reviewTransportDiffs).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 pb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">Traveloure</span>
            <Badge variant="secondary" className="text-xs">
              {isExpertView ? "Expert Review" : "Shared Itinerary"}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (navigator.share) {
                const shareTitle = `${data.variant.destination || data.variant.name} Itinerary • Traveloure`;
                navigator.share({ title: shareTitle, url: window.location.href }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
                toast({ title: "Link copied!" });
              }
            }}
            data-testid="button-share-page"
            className="gap-2"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>

        {isExpertView && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-amber-800 dark:text-amber-200">Expert Review Mode</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Edit activity names, times, and notes directly on the cards below. You can also swap transport modes.
                  {totalDiffs > 0 && ` (${totalDiffs} pending change${totalDiffs !== 1 ? "s" : ""})`}
                  {data.sharedBy?.name && ` Shared by ${data.sharedBy.name}.`}
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setShowSuggestDialog(true)}
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-send-edits"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send Edits
                </Button>
                {data.sharedBy?.userId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/expert-chat/${data.sharedBy!.userId}`)}
                    className="gap-2 border-amber-300"
                    data-testid="button-open-expert-chat"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Chat
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {hasPendingReview && (
          <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" data-testid="expert-review-banner">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-blue-800 dark:text-blue-200">Expert has sent edits for review</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  {data.expertDiff?.submittedAt && `Sent ${new Date(data.expertDiff.submittedAt).toLocaleDateString()}.`}
                  {totalReviewDiffs > 0 && ` ${totalReviewDiffs} suggestion${totalReviewDiffs !== 1 ? "s" : ""} awaiting your review.`}
                </p>
                {data.expertNotes && (
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-2 italic">
                    "{data.expertNotes}"
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {totalReviewDiffs > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setShowDiffReview(true)}
                    className="gap-2"
                    variant="outline"
                    data-testid="button-review-diffs"
                  >
                    <Eye className="h-4 w-4" />
                    Review Changes
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => acknowledgeMutation.mutate({ action: "accept" })}
                  disabled={acknowledgeMutation.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-accept-all"
                >
                  <CheckCircle className="h-4 w-4" />
                  Accept All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledgeMutation.mutate({ action: "reject" })}
                  disabled={acknowledgeMutation.isPending}
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                  data-testid="button-reject-all"
                >
                  <XCircle className="h-4 w-4" />
                  Reject All
                </Button>
              </div>
            </div>
          </div>
        )}

        {expertStatus === "acknowledged" && isOwnerView && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="expert-accepted-banner">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-800 dark:text-green-200">Expert edits accepted.</p>
            </div>
          </div>
        )}

        <ItineraryCard
          data={cardData}
          mapsLinks={data.mapsLinks}
          sharedBy={data.sharedBy}
          shareToken={token}
          permissions={data.permissions}
          readOnly={data.permissions === "view" && !data.isOwner}
          isOwner={!!data.isOwner}
          variantId={data.variant.id}
          expertDiff={data.expertDiff}
          onActivityDiffsChange={isExpertView ? setActivityDiffs : undefined}
          onTransportDiffsChange={isExpertView ? setTransportDiffs : undefined}
          onExpertNotesChange={isExpertView ? setExpertNotes : undefined}
        />

        {!isExpertView && (
          <div className="mt-8 pt-6 border-t text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Plan your own trip with Traveloure
            </p>
            <Button onClick={() => window.location.href = "/"} data-testid="button-plan-trip">
              Plan My Trip
            </Button>
          </div>
        )}
      </div>

      {/* Expert Send Edits Dialog */}
      <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Edits to Traveler</DialogTitle>
            <DialogDescription>
              Add your overall notes below. Your activity and transport edits will be included automatically.
            </DialogDescription>
          </DialogHeader>

          {totalDiffs > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                {totalDiffs} tracked change{totalDiffs !== 1 ? "s" : ""} will be included:
              </p>
              <ul className="mt-1 text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
                {Object.entries(activityDiffs).map(([id, diff]) => (
                  <li key={id}>• Activity: {diff.name || diff.originalName} {diff.name !== diff.originalName ? `(renamed from "${diff.originalName}")` : ""}</li>
                ))}
                {Object.entries(transportDiffs).map(([id, diff]) => (
                  <li key={id}>• Transport leg {diff.legOrder}: {diff.originalMode} → {diff.newMode}</li>
                ))}
              </ul>
            </div>
          )}

          {expertNotes.trim() ? (
            <div className="p-3 rounded-lg bg-muted border mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Your note (from Expert Notes panel):</p>
              <p className="text-sm italic">"{expertNotes}"</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                Add a note via the Expert Notes panel at the bottom of the itinerary, or type one here:
              </p>
              <Textarea
                placeholder="E.g. 'Day 2 is too packed — consider splitting the temple visit to Day 3...'"
                value={expertNotes}
                onChange={e => setExpertNotes(e.target.value)}
                rows={4}
                data-testid="textarea-expert-notes"
              />
            </div>
          )}
          {totalDiffs === 0 && !expertNotes.trim() && (
            <p className="text-xs text-muted-foreground">
              You can edit activities directly in the itinerary — changes are tracked and sent with your notes.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestDialog(false)}>Cancel</Button>
            <Button
              onClick={() => suggestModMutation.mutate()}
              disabled={!expertNotes.trim() || suggestModMutation.isPending}
              data-testid="button-send-suggestions"
            >
              {suggestModMutation.isPending ? "Sending..." : "Send to Traveler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Traveler Diff Review Dialog */}
      <Dialog open={showDiffReview} onOpenChange={setShowDiffReview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expert Suggestions</DialogTitle>
            <DialogDescription>
              Review the changes your expert proposed. Accept all to apply them, or reject to dismiss.
            </DialogDescription>
          </DialogHeader>

          {data.expertNotes && (
            <div className="p-3 rounded-lg bg-muted border mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Expert notes:</p>
              <p className="text-sm italic">"{data.expertNotes}"</p>
            </div>
          )}

          {Object.keys(reviewActivityDiffs).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Activity Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewActivityDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-amber-50 dark:bg-amber-950/20"
                    )} data-testid={`diff-activity-${id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {diff.name && diff.name !== diff.originalName && (
                            <div className="text-xs">
                              <span className="font-medium">Name:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalName}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.name}</span>
                            </div>
                          )}
                          {diff.startTime && diff.originalStartTime && diff.startTime !== diff.originalStartTime && (
                            <div className="text-xs">
                              <span className="font-medium">Time:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalStartTime}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.startTime}</span>
                            </div>
                          )}
                          {diff.note && (
                            <div className="text-xs italic text-amber-700 dark:text-amber-300">
                              Note: "{diff.note}"
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-activity-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(reviewTransportDiffs).length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium mb-2">Transport Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewTransportDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-blue-50 dark:bg-blue-950/20"
                    )} data-testid={`diff-transport-${id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium">Leg {diff.legOrder}:</span>{" "}
                          <span className="line-through text-muted-foreground">{diff.originalMode}</span>
                          {" → "}
                          <span className="font-medium text-green-700 dark:text-green-400">{diff.newMode}</span>
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-transport-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rejectedDiffIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {rejectedDiffIds.size} change{rejectedDiffIds.size !== 1 ? "s" : ""} will be rejected. The rest will be accepted.
            </p>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => acknowledgeMutation.mutate({ action: "reject" })}
              disabled={acknowledgeMutation.isPending}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
              data-testid="button-reject-diffs"
            >
              <XCircle className="h-4 w-4" />
              Reject All
            </Button>
            <Button
              onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: Array.from(rejectedDiffIds) })}
              disabled={acknowledgeMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-accept-diffs"
            >
              <CheckCircle className="h-4 w-4" />
              {rejectedDiffIds.size > 0 ? "Accept Selected" : "Accept All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
