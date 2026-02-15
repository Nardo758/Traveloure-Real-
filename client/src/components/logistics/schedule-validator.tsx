import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  RefreshCw,
  Clock,
  Zap,
} from "lucide-react";

interface ValidationResult {
  valid: boolean;
  conflicts: Array<{
    anchorId: string;
    anchorType: string;
    conflict: string;
  }>;
  anchorsChecked: number;
  boundariesChecked: number;
}

interface ScheduleValidatorProps {
  tripId: string;
  items?: Array<{
    title: string;
    dayNumber: number;
    startTime: string;
    endTime?: string;
    date?: string;
    durationMinutes?: number;
  }>;
}

export function ScheduleValidator({ tripId, items = [] }: ScheduleValidatorProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<ValidationResult | null>(null);

  const { data: anchors = [] } = useQuery<Array<{ id: string; anchorType: string }>>({
    queryKey: [`/api/trips/${tripId}/anchors`],
    enabled: !!tripId,
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/validate-schedule`, { items });
      return response.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.valid) {
        toast({ title: "Schedule Valid", description: "No conflicts found with your anchors." });
      } else {
        toast({
          variant: "destructive",
          title: "Conflicts Detected",
          description: `${data.conflicts.length} conflict${data.conflicts.length !== 1 ? "s" : ""} found.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Validation failed", description: error.message });
    },
  });

  function getStatusIcon() {
    if (!result) return <Shield className="h-5 w-5 text-muted-foreground" />;
    if (result.valid) return <CheckCircle className="h-5 w-5 text-green-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  }

  function getStatusBadge() {
    if (!result) return <Badge variant="outline">Not validated</Badge>;
    if (result.valid) return <Badge className="bg-green-100 text-green-800">Valid</Badge>;
    return <Badge variant="destructive">{result.conflicts.length} conflict{result.conflicts.length !== 1 ? "s" : ""}</Badge>;
  }

  function formatAnchorType(type: string) {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">Schedule Validation</CardTitle>
              <CardDescription>
                Check your itinerary against temporal anchors and day boundaries
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <Button
              size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending || anchors.length === 0}
            >
              {validateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1" />
              )}
              Validate
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {anchors.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Add temporal anchors first to validate your schedule</p>
          </div>
        ) : !result ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <p>Click "Validate" to check your schedule against {anchors.length} anchor{anchors.length !== 1 ? "s" : ""}</p>
          </div>
        ) : result.valid ? (
          <div className="text-center py-4">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="font-medium text-green-700">All Clear</p>
            <p className="text-sm text-muted-foreground">
              No conflicts found across {result.anchorsChecked} anchors and {result.boundariesChecked} boundaries
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.conflicts.map((conflict, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {formatAnchorType(conflict.anchorType)}
                  </div>
                  <p className="text-sm text-red-700 mt-1">{conflict.conflict}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
