import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Sparkles,
  Camera,
  Music,
  Clock,
  Calendar,
  CheckCircle,
  Wand2,
} from "lucide-react";

interface AnchorPreset {
  anchorType: string;
  label: string;
  defaultBufferBefore: number;
  defaultBufferAfter: number;
  defaultTimeOfDay: string;
  dayOffset: number;
  isImmovable: boolean;
  description: string;
}

interface PresetsResponse {
  anchors: AnchorPreset[];
  dayBoundaries: Array<{
    dayOffset: number;
    latestActivityEnd: string;
    mustReturnToHotel: boolean;
    reason: string;
  }>;
}

const ANCHOR_ICONS: Record<string, typeof Heart> = {
  ceremony_time: Heart,
  reception_start: Music,
  rehearsal_time: Clock,
  hair_makeup_start: Sparkles,
  photographer_arrival: Camera,
  proposal_moment: Heart,
  dinner_reservation: Clock,
};

interface WeddingAnchorPresetsProps {
  tripId: string;
  templateSlug: string;
  eventDate: string;
  userExperienceId?: string;
  onPresetsGenerated?: () => void;
}

export function WeddingAnchorPresets({
  tripId,
  templateSlug,
  eventDate,
  userExperienceId,
  onPresetsGenerated,
}: WeddingAnchorPresetsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customEventDate, setCustomEventDate] = useState(eventDate || "");
  const [generated, setGenerated] = useState(false);

  const { data: presets } = useQuery<PresetsResponse>({
    queryKey: [`/api/logistics/presets/${templateSlug}`],
    enabled: !!templateSlug,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/generate-presets`, {
        templateSlug,
        eventDate: customEventDate || eventDate,
        userExperienceId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGenerated(true);
      toast({
        title: "Presets Generated",
        description: `Created ${data.anchorsCreated} anchors and ${data.boundariesCreated} day boundaries.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/anchors`] });
      onPresetsGenerated?.();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to generate presets", description: error.message });
    },
  });

  function formatDayLabel(offset: number): string {
    if (offset === 0) return "Event Day";
    if (offset === -1) return "Day Before";
    if (offset === 1) return "Day After";
    return offset > 0 ? `${offset} Days After` : `${Math.abs(offset)} Days Before`;
  }

  if (!presets || presets.anchors.length === 0) {
    return null;
  }

  return (
    <Card className="border-pink-200 bg-gradient-to-br from-pink-50/50 to-purple-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-pink-600" />
          {templateSlug === "wedding" ? "Wedding" : templateSlug === "proposal" ? "Proposal" : "Trip"} Schedule Template
        </CardTitle>
        <CardDescription>
          Auto-generate time anchors for your {templateSlug}. You can customize them after.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Event Date */}
        <div className="space-y-2">
          <Label>{templateSlug === "wedding" ? "Wedding Date" : "Event Date"}</Label>
          <Input
            type="date"
            value={customEventDate}
            onChange={e => setCustomEventDate(e.target.value)}
          />
        </div>

        {/* Preview anchors */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Will create these anchors:</Label>
          <div className="space-y-1.5">
            {presets.anchors.map((preset, i) => {
              const Icon = ANCHOR_ICONS[preset.anchorType] || Clock;
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/80 border text-sm">
                  <Icon className="h-4 w-4 text-pink-600 shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-muted-foreground ml-2">at {preset.defaultTimeOfDay}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formatDayLabel(preset.dayOffset)}
                  </Badge>
                  {preset.isImmovable && (
                    <Badge variant="secondary" className="text-xs">Locked</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day boundaries preview */}
        {presets.dayBoundaries.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Day boundaries:</Label>
            {presets.dayBoundaries.map((boundary, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground p-1.5 rounded bg-white/60">
                <Calendar className="h-3 w-3" />
                <span>{formatDayLabel(boundary.dayOffset)}: end by {boundary.latestActivityEnd}</span>
                {boundary.mustReturnToHotel && <Badge variant="outline" className="text-xs">Hotel</Badge>}
              </div>
            ))}
          </div>
        )}

        {/* Generate button */}
        {generated ? (
          <div className="flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="h-4 w-4" />
            Presets generated! Customize them in the Temporal Anchors panel above.
          </div>
        ) : (
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !customEventDate}
            className="w-full bg-pink-600 hover:bg-pink-700"
          >
            {generateMutation.isPending ? "Generating..." : `Generate ${templateSlug === "wedding" ? "Wedding" : "Event"} Schedule`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
