import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitBranch,
  MapPin,
  User,
  Star,
  CheckCircle,
  RotateCcw,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface QueueItem {
  id: string;
  trip_id: string;
  user_id: string;
  destination_city: string;
  request_type: string;
  status: string;
  assigned_expert_id: string;
  created_at: string;
  traveler_name: string;
  traveler_email: string;
  expert_name: string;
  expert_email: string;
  top_score: number | null;
  scores_json: any[] | null;
}

interface ScoreBreakdown {
  expertId: string;
  expertName: string;
  totalScore: number;
  destinationScore: number;
  specialtyScore: number;
  availabilityScore: number;
  responseRateScore: number;
}

function ScoreBadge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex flex-col items-center min-w-[60px]">
      <div className={`text-xs font-semibold ${color}`}>{value}/{max}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const [expanded, setExpanded] = useState(false);
  const [reassignExpertId, setReassignExpertId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const scores: ScoreBreakdown[] = Array.isArray(item.scores_json) ? item.scores_json : [];
  const topScore = scores[0];
  const otherCandidates = scores.slice(1);

  const confirmMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/routing-queue/${item.id}/confirm`, {}),
    onSuccess: async (data: any) => {
      if (data?.alreadyExists || data?.alreadyConfirmed) {
        toast({ title: "Already assigned", description: data.message || "No change needed." });
      } else {
        toast({ title: "Assignment confirmed", description: `${item.expert_name} has been assigned. The workspace is now open.` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-queue"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to confirm assignment.", variant: "destructive" });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/routing-queue/${item.id}/reassign`, { expertId: reassignExpertId }),
    onSuccess: (data: any) => {
      toast({ title: "Reassigned", description: `Lead reassigned to ${data?.expertName || "new expert"}.` });
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-queue"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reassign.", variant: "destructive" });
    },
  });

  return (
    <div
      className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden"
      data-testid={`card-routing-queue-${item.id}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-gray-100">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              {item.destination_city || "Unknown destination"}
            </span>
            {item.request_type && (
              <Badge variant="outline" className="text-[10px]">{item.request_type}</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Traveler: {item.traveler_name || item.user_id?.slice(0, 8) || "—"}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-500" />
              Expert: <strong className="text-gray-700 dark:text-gray-300">{item.expert_name || "—"}</strong>
              {item.top_score != null && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded text-[10px] font-semibold">
                  {item.top_score}/100
                </span>
              )}
            </span>
          </div>
          {topScore && (
            <div className="flex flex-wrap gap-4 pt-1">
              <ScoreBadge label="Dest" value={topScore.destinationScore} max={40} color="text-blue-600" />
              <ScoreBadge label="Spec" value={topScore.specialtyScore} max={25} color="text-purple-600" />
              <ScoreBadge label="Avail" value={topScore.availabilityScore} max={20} color="text-green-600" />
              <ScoreBadge label="Resp" value={topScore.responseRateScore} max={15} color="text-orange-500" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {otherCandidates.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setExpanded((v) => !v)}
              data-testid={`button-toggle-reassign-${item.id}`}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reassign
              {expanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#E85D55] hover:bg-[#d44e47] text-white text-xs h-8"
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            data-testid={`button-confirm-assignment-${item.id}`}
          >
            {confirmMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
            )}
            Confirm
          </Button>
        </div>
      </div>

      {expanded && otherCandidates.length > 0 && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
          <p className="text-xs text-gray-500 py-3">Pick a different expert from the scored candidates:</p>
          <div className="flex items-center gap-2">
            <Select value={reassignExpertId} onValueChange={setReassignExpertId}>
              <SelectTrigger
                className="flex-1 h-8 text-xs"
                data-testid={`select-reassign-expert-${item.id}`}
              >
                <SelectValue placeholder="Select expert…" />
              </SelectTrigger>
              <SelectContent>
                {otherCandidates.map((c) => (
                  <SelectItem key={c.expertId} value={c.expertId}>
                    {c.expertName} — {c.totalScore}/100
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              disabled={!reassignExpertId || reassignMutation.isPending}
              onClick={() => reassignMutation.mutate()}
              data-testid={`button-do-reassign-${item.id}`}
            >
              {reassignMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Apply"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminRoutingQueue() {
  const { data: items, isLoading, error } = useQuery<QueueItem[]>({
    queryKey: ["/api/admin/routing-queue"],
  });

  return (
    <AdminLayout title="Routing Queue">
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
            <GitBranch className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Expert Assignment Queue</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              These leads have been scored and auto-routed, but need your confirmation before the expert workspace opens.
              You can also reassign to a different scored candidate before confirming.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Pending Confirmations
              {!isLoading && items && (
                <Badge variant="secondary" className="text-xs" data-testid="badge-pending-count">
                  {items.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-6" data-testid="text-error-message">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Failed to load routing queue.</span>
              </div>
            )}
            {!isLoading && !error && items?.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-400" />
                <p className="font-medium text-sm">Queue is clear</p>
                <p className="text-xs mt-1">All routed leads have been confirmed or there are no pending assignments.</p>
              </div>
            )}
            {!isLoading && items && items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
