import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb,
  Plus,
  Sparkles,
  AlertTriangle,
  Info,
  Clock,
  Plane,
  Hotel,
  Heart,
  Camera,
  RefreshCw,
} from "lucide-react";

interface AnchorSuggestion {
  anchorType: string;
  suggestedTime: string;
  suggestedDayNumber: number;
  bufferBefore: number;
  bufferAfter: number;
  reason: string;
  confidence: "high" | "medium" | "low";
  source: "template" | "destination" | "booking" | "ai";
}

interface OptimizationTip {
  tip: string;
  severity: "info" | "warning" | "critical";
}

const ANCHOR_ICONS: Record<string, typeof Clock> = {
  flight_arrival: Plane,
  flight_departure: Plane,
  hotel_checkin: Hotel,
  hotel_checkout: Hotel,
  ceremony_time: Heart,
  proposal_moment: Heart,
  photographer_arrival: Camera,
  hair_makeup_start: Sparkles,
};

interface AnchorSuggestionsPanelProps {
  tripId: string;
  templateSlug?: string;
  onSuggestionApplied?: () => void;
}

export function AnchorSuggestionsPanel({
  tripId,
  templateSlug,
  onSuggestionApplied,
}: AnchorSuggestionsPanelProps) {
  const { toast } = useToast();

  const suggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/anchor-suggestions`, {
        templateSlug,
      });
      return response.json() as Promise<{ suggestions: AnchorSuggestion[] }>;
    },
  });

  const { data: tipsData } = useQuery<{ tips: OptimizationTip[] }>({
    queryKey: [`/api/trips/${tripId}/anchor-optimization`],
    enabled: !!tripId,
  });

  const applyMutation = useMutation({
    mutationFn: async (suggestion: AnchorSuggestion) => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/anchors`, {
        anchorType: suggestion.anchorType,
        dayNumber: suggestion.suggestedDayNumber,
        suggestedTime: suggestion.suggestedTime,
        bufferBefore: suggestion.bufferBefore,
        bufferAfter: suggestion.bufferAfter,
        isImmovable: suggestion.confidence === "high",
        description: suggestion.reason.split('.')[0],
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Suggestion Applied", description: "Anchor added to your trip." });
      onSuggestionApplied?.();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to apply", description: error.message });
    },
  });

  function formatAnchorType(type: string): string {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function getConfidenceBadge(confidence: string) {
    if (confidence === "high") return <Badge className="bg-green-100 text-green-800 text-xs">High confidence</Badge>;
    if (confidence === "medium") return <Badge className="bg-amber-100 text-amber-800 text-xs">Suggested</Badge>;
    return <Badge variant="outline" className="text-xs">Optional</Badge>;
  }

  function getSeverityIcon(severity: string) {
    if (severity === "critical") return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
    if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
    return <Info className="h-3.5 w-3.5 text-blue-600" />;
  }

  const suggestions = suggestionsMutation.data?.suggestions || [];
  const tips = tipsData?.tips || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Smart Suggestions
            </CardTitle>
            <CardDescription>
              AI-powered anchor recommendations for your trip
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => suggestionsMutation.mutate()}
            disabled={suggestionsMutation.isPending}
          >
            {suggestionsMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            Analyze
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Optimization Tips */}
        {tips.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Optimization Tips</span>
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded text-sm bg-muted/50">
                {getSeverityIcon(tip.severity)}
                <span>{tip.tip}</span>
              </div>
            ))}
          </div>
        )}

        {tips.length > 0 && suggestions.length > 0 && <Separator />}

        {/* AI Suggestions */}
        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suggested Anchors</span>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {suggestions.map((s, i) => {
                  const Icon = ANCHOR_ICONS[s.anchorType] || Clock;
                  return (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-sm">{formatAnchorType(s.anchorType)}</span>
                          {getConfidenceBadge(s.confidence)}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => applyMutation.mutate(s)}
                          disabled={applyMutation.isPending}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Apply
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Day {s.suggestedDayNumber} at {s.suggestedTime} · {s.bufferBefore}min before · {s.bufferAfter}min after
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        ) : !suggestionsMutation.isPending && suggestionsMutation.data ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No additional suggestions — your anchors look well-configured!</p>
          </div>
        ) : !suggestionsMutation.data ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <p>Click "Analyze" to get AI-powered scheduling suggestions</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
