import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Share2, User, MapPin, Clock, DollarSign, Download, Navigation, Star } from "lucide-react";
import { TransportLeg, type TransportLegData } from "./TransportLeg";
import { DayMapsButton } from "./DayMapsButton";
import { TripExportButton } from "./TripExportButton";
import { NavigateNextButton } from "./NavigateNextButton";
import { cn } from "@/lib/utils";

export interface ItineraryActivity {
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
}

export interface ItineraryDay {
  dayNumber: number;
  date?: string;
  title?: string;
  activities: ItineraryActivity[];
  transportLegs: TransportLegData[];
}

export interface ItineraryCardData {
  id: string;
  name: string;
  description?: string | null;
  destination?: string | null;
  dateRange?: { start?: string | null; end?: string | null };
  totalCost?: string | number | null;
  optimizationScore?: number | null;
  days: ItineraryDay[];
  transportSummary?: {
    totalLegs: number;
    totalMinutes: number;
    totalCostUsd: number;
  };
}

interface ItineraryCardProps {
  data: ItineraryCardData;
  mapsLinks?: {
    googleMapsPerDay?: Record<number, string>;
    appleMapsPerDay?: Record<number, string>;
    appleMapsWebPerDay?: Record<number, string>;
    kmlDownloadUrl?: string;
    gpxDownloadUrl?: string;
  };
  sharedBy?: { name: string; avatarUrl?: string | null };
  shareToken?: string;
  permissions?: string;
  readOnly?: boolean;
  isOwner?: boolean;
  variantId?: string;
  showShareButton?: boolean;
  onShareSuccess?: (token: string, url: string) => void;
  liveMode?: boolean;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function ItineraryCard({
  data,
  mapsLinks,
  sharedBy,
  shareToken,
  permissions,
  readOnly = false,
  isOwner = false,
  variantId,
  showShareButton = false,
  onShareSuccess,
  liveMode = false,
}: ItineraryCardProps) {
  const { toast } = useToast();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareNotes, setShareNotes] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!variantId) throw new Error("No variant ID");
      return apiRequest("POST", `/api/itinerary-variants/${variantId}/share`, {
        permissions: "view",
      });
    },
    onSuccess: (data: any) => {
      setCopiedUrl(data.shareUrl);
      navigator.clipboard?.writeText(data.shareUrl).catch(() => {});
      toast({ title: "Share link created!", description: "Link copied to clipboard." });
      onShareSuccess?.(data.shareToken, data.shareUrl);
    },
    onError: () => {
      toast({ title: "Failed to create share link", variant: "destructive" });
    },
  });

  const totalDays = data.days.length;
  const totalCost = data.totalCost ? parseFloat(String(data.totalCost)) : null;

  const now = new Date();

  return (
    <div className="space-y-0" data-testid="itinerary-card">
      <div className="relative overflow-hidden rounded-xl mb-6">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent z-10" />
        <img
          src={`https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80`}
          alt={data.destination || "Destination"}
          className="w-full h-48 object-cover"
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-5">
          <div className="text-white">
            <h2 className="text-2xl font-bold uppercase tracking-wide">
              {data.destination || data.name}
            </h2>
            {data.dateRange?.start && (
              <p className="text-sm text-white/80 mt-0.5">
                {formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {data.optimizationScore && (
                <Badge className="bg-amber-500 text-white text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Score {data.optimizationScore}
                </Badge>
              )}
              {totalCost && (
                <Badge className="bg-white/20 text-white text-xs backdrop-blur-sm">
                  <DollarSign className="h-3 w-3 mr-1" />${totalCost.toFixed(0)} total
                </Badge>
              )}
              {totalDays > 0 && (
                <Badge className="bg-white/20 text-white text-xs backdrop-blur-sm">
                  <Clock className="h-3 w-3 mr-1" />{totalDays} day{totalDays !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {sharedBy && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {sharedBy.avatarUrl ? (
              <img src={sharedBy.avatarUrl} alt={sharedBy.name} className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">Shared by <strong>{sharedBy.name}</strong></p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {showShareButton && variantId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => shareMutation.mutate()}
            disabled={shareMutation.isPending}
            className="gap-2"
            data-testid="button-share-itinerary"
          >
            <Share2 className="h-4 w-4" />
            {copiedUrl ? "Link Copied!" : "Share"}
          </Button>
        )}
        {shareToken && (
          <TripExportButton shareToken={shareToken} />
        )}
      </div>

      {data.days.map((day) => {
        const googleUrl = mapsLinks?.googleMapsPerDay?.[day.dayNumber] || "";
        const appleUrl = mapsLinks?.appleMapsPerDay?.[day.dayNumber] || "";
        const appleWebUrl = mapsLinks?.appleMapsWebPerDay?.[day.dayNumber] || "";

        const totalDayTransportMin = day.transportLegs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);
        const totalDayTransportCost = day.transportLegs.reduce((s, l) => s + (l.estimatedCostUsd || 0), 0);

        return (
          <div key={day.dayNumber} className="mb-8" data-testid={`day-section-${day.dayNumber}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-base font-semibold">
                  📅 Day {day.dayNumber}
                  {day.date ? ` — ${formatDayDate(day.date)}` : ""}
                </h3>
                {day.title && <p className="text-sm text-muted-foreground mt-0.5">{day.title}</p>}
              </div>
              {(googleUrl || appleUrl || appleWebUrl) && (
                <DayMapsButton
                  dayNumber={day.dayNumber}
                  googleUrl={googleUrl}
                  appleUrl={appleUrl}
                  appleWebUrl={appleWebUrl}
                />
              )}
            </div>

            <div className="space-y-0">
              {day.activities.map((activity, actIdx) => {
                const legAfter = day.transportLegs.find(l => l.legOrder === actIdx + 1);
                const isCurrentOrNext = liveMode && actIdx === 0;

                return (
                  <div key={activity.id}>
                    <Card className={cn("border", isCurrentOrNext && "border-primary/50 bg-primary/5")}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {activity.startTime && (
                              <p className="text-xs font-mono text-muted-foreground mb-0.5">{activity.startTime}</p>
                            )}
                            <h4 className="font-medium text-sm leading-tight">{activity.name}</h4>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {activity.category && (
                                <Badge variant="secondary" className="text-xs">{activity.category}</Badge>
                              )}
                              {activity.duration && (
                                <span className="text-xs text-muted-foreground">{activity.duration} min</span>
                              )}
                              {activity.cost !== undefined && activity.cost !== null && (
                                <span className="text-xs text-muted-foreground">
                                  {activity.cost === 0 ? "Free" : `$${activity.cost}`}
                                </span>
                              )}
                            </div>
                            {activity.location && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.location}</p>
                            )}
                          </div>
                          {activity.lat && activity.lng && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.name)}&center=${activity.lat},${activity.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80"
                              title="Open in Maps"
                              data-testid={`link-activity-maps-${activity.id}`}
                            >
                              <MapPin className="h-4 w-4" />
                            </a>
                          )}
                        </div>

                        {liveMode && legAfter && (
                          <div className="mt-3 pt-3 border-t">
                            <NavigateNextButton
                              leg={legAfter}
                              shareToken={shareToken}
                              dayNumber={day.dayNumber}
                              toActivityName={day.activities[actIdx + 1]?.name || "Next stop"}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {legAfter && (
                      <TransportLeg
                        leg={legAfter}
                        readOnly={readOnly}
                        shareToken={shareToken}
                        dayNumber={day.dayNumber}
                        className="my-1"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {day.transportLegs.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3 pl-3">
                Day {day.dayNumber} transport: {day.transportLegs.length} leg{day.transportLegs.length !== 1 ? "s" : ""} • {totalDayTransportMin} min total
                {totalDayTransportCost > 0 && ` • $${totalDayTransportCost.toFixed(2)} total`}
              </p>
            )}
          </div>
        );
      })}

      {data.transportSummary && data.transportSummary.totalLegs > 0 && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">Trip Transport Summary</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold">{data.transportSummary.totalLegs}</p>
                <p className="text-xs text-muted-foreground">Transport legs</p>
              </div>
              <div>
                <p className="text-lg font-bold">
                  {Math.floor(data.transportSummary.totalMinutes / 60)}h {data.transportSummary.totalMinutes % 60}m
                </p>
                <p className="text-xs text-muted-foreground">Total transit time</p>
              </div>
              <div>
                <p className="text-lg font-bold">${data.transportSummary.totalCostUsd.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Transport cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
