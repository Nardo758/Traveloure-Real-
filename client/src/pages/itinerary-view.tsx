import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Share2, MessageCircle, User } from "lucide-react";
import { ItineraryCard, type ItineraryCardData } from "@/components/itinerary/ItineraryCard";
import type { TransportLegData } from "@/components/itinerary/TransportLeg";
import { useToast } from "@/hooks/use-toast";

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
      transportLegs: TransportLegData[];
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
  sharedBy?: { name: string; avatarUrl?: string | null };
  permissions?: string;
  shareToken?: string;
  expertStatus?: string;
  sharedWithExpert?: boolean;
}

export default function ItineraryViewPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [expertNotes, setExpertNotes] = useState("");

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
      const res = await fetch(`/api/itinerary-share/${token}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: expertNotes }),
      });
      if (!res.ok) throw new Error("Failed to send suggestion");
      return res.json();
    },
    onSuccess: () => {
      setShowExpertDialog(false);
      setExpertNotes("");
      toast({ title: "Suggestions sent!", description: "The traveler has been notified of your feedback." });
    },
    onError: () => {
      toast({ title: "Failed to send suggestions", variant: "destructive" });
    },
  });

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

  const title = `${data.variant.destination || data.variant.name} Itinerary • Traveloure`;
  const description = `${data.variant.name} — ${data.variant.destination}`;

  const isExpertView = data.permissions === "suggest" || data.sharedWithExpert;

  return (
    <div className="min-h-screen bg-background">
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />

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
                navigator.share({ title, url: window.location.href }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
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
                  You've been invited to review and suggest modifications to this itinerary.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowExpertDialog(true)}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                data-testid="button-suggest-modifications"
              >
                <MessageCircle className="h-4 w-4" />
                Suggest Modifications
              </Button>
            </div>
          </div>
        )}

        <ItineraryCard
          data={cardData}
          mapsLinks={data.mapsLinks}
          sharedBy={data.sharedBy}
          shareToken={token}
          permissions={data.permissions}
          readOnly={data.permissions === "view"}
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

      <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest Modifications</DialogTitle>
            <DialogDescription>
              Share your expert recommendations for this itinerary. The traveler will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="E.g. 'Day 2 is too packed — consider splitting the temple visit to Day 3. Also, the restaurant on Day 1 is fully booked in peak season, try XYZ instead...'"
            value={expertNotes}
            onChange={e => setExpertNotes(e.target.value)}
            rows={5}
            className="mt-2"
            data-testid="textarea-expert-notes"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpertDialog(false)}>Cancel</Button>
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
    </div>
  );
}
