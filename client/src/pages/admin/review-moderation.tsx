import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import {
  Star,
  CheckCircle,
  Flag,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Eraser,
} from "lucide-react";

type ReviewStatus = "pending" | "approved" | "flagged" | "removed";

interface ModerationReview {
  id: string;
  serviceId: string;
  travelerId: string;
  rating: number;
  reviewText: string | null;
  responseText: string | null;
  responseAt: string | null;
  status: ReviewStatus;
  flagReason: string | null;
  moderatedAt: string | null;
  createdAt: string;
  travelerName: string;
  serviceName: string;
  logs: Array<{ action: string; reason: string | null; createdAt: string }>;
}

const STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  flagged: "bg-red-100 text-red-800 border-red-200",
  removed: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_ICONS: Record<ReviewStatus, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle,
  flagged: AlertTriangle,
  removed: Trash2,
};

function ReviewRow({ review, onAction }: {
  review: ModerationReview;
  onAction: (id: string, status: string, reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const Icon = STATUS_ICONS[review.status] ?? Clock;

  function handleAction(action: string) {
    if ((action === "flagged" || action === "removed" || action === "clear_response") && !showReason) {
      setPendingAction(action);
      setShowReason(true);
      return;
    }
    onAction(review.id, action, reason || undefined);
    setShowReason(false);
    setReason("");
    setPendingAction(null);
  }

  const pendingActionLabel = pendingAction === "clear_response" ? "clear response" : pendingAction;

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid={`card-moderation-review-${review.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm" data-testid={`text-reviewer-${review.id}`}>{review.travelerName}</span>
            <span className="text-muted-foreground text-xs">on</span>
            <span className="text-sm font-medium truncate max-w-[200px]" data-testid={`text-service-${review.id}`}>{review.serviceName}</span>
          </div>
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {format(new Date(review.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          {review.reviewText ? (
            <p className="text-sm text-foreground" data-testid={`text-review-body-${review.id}`}>{review.reviewText}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No review text.</p>
          )}
          {review.flagReason && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
              <Flag className="w-3 h-3 mt-0.5 shrink-0" />
              <span data-testid={`text-flag-reason-${review.id}`}>{review.flagReason}</span>
            </div>
          )}
          {review.responseText && (
            <div className="mt-2 rounded border bg-muted/40 px-2.5 py-2" data-testid={`block-response-${review.id}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                <MessageSquare className="w-3 h-3" />
                Provider response
                {review.responseAt && (
                  <span className="font-normal opacity-70">{format(new Date(review.responseAt), "MMM d, yyyy")}</span>
                )}
              </div>
              <p className="text-sm text-foreground" data-testid={`text-response-body-${review.id}`}>{review.responseText}</p>
            </div>
          )}
        </div>
        <Badge className={`text-xs border ${STATUS_COLORS[review.status]} shrink-0`} data-testid={`badge-status-${review.id}`}>
          <Icon className="w-3 h-3 mr-1" />
          {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
        </Badge>
      </div>

      {showReason && (
        <div className="space-y-2">
          <Textarea
            placeholder={`Reason for ${pendingActionLabel} (optional)`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="text-sm h-20"
            data-testid={`input-reason-${review.id}`}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleAction(pendingAction!)} data-testid={`button-confirm-${pendingAction}-${review.id}`}>
              Confirm {pendingActionLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowReason(false); setPendingAction(null); setReason(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showReason && (
        <div className="flex gap-2 flex-wrap">
          {review.status !== "approved" && (
            <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50"
              onClick={() => handleAction("approved")} data-testid={`button-approve-${review.id}`}>
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              Approve
            </Button>
          )}
          {review.status !== "flagged" && (
            <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => handleAction("flagged")} data-testid={`button-flag-${review.id}`}>
              <Flag className="w-3.5 h-3.5 mr-1.5" />
              Flag
            </Button>
          )}
          {review.status !== "removed" && (
            <Button size="sm" variant="outline" className="text-gray-700 border-gray-200 hover:bg-gray-50"
              onClick={() => handleAction("removed")} data-testid={`button-remove-${review.id}`}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Remove
            </Button>
          )}
          {review.status === "removed" && (
            <Button size="sm" variant="outline" onClick={() => onAction(review.id, "pending")} data-testid={`button-restore-${review.id}`}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Restore
            </Button>
          )}
          {review.responseText && (
            <Button size="sm" variant="outline" className="text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => handleAction("clear_response")} data-testid={`button-clear-response-${review.id}`}>
              <Eraser className="w-3.5 h-3.5 mr-1.5" />
              Clear response
            </Button>
          )}
        </div>
      )}

      {review.logs.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Moderation history ({review.logs.length})</summary>
          <ul className="mt-1.5 space-y-1 pl-3 border-l border-muted">
            {review.logs.map((log, i) => (
              <li key={i} data-testid={`log-entry-${review.id}-${i}`}>
                <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                {log.reason && <span> — {log.reason}</span>}
                <span className="ml-1 opacity-60">{format(new Date(log.createdAt), "MMM d HH:mm")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function AdminReviewModeration() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("queue");

  const queryKey = ["/api/admin/reviews", statusFilter === "queue" ? undefined : statusFilter];

  const { data: reviews, isLoading } = useQuery<ModerationReview[]>({
    queryKey,
    queryFn: () => {
      const url = statusFilter === "queue"
        ? "/api/admin/reviews"
        : `/api/admin/reviews?status=${statusFilter}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
  });

  const moderateMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      status === "clear_response"
        ? apiRequest("POST", `/api/admin/reviews/${id}/clear-response`, { reason })
        : apiRequest("PATCH", `/api/admin/reviews/${id}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      toast({ title: "Review updated" });
    },
    onError: () => toast({ title: "Failed to update review", variant: "destructive" }),
  });

  const pending = reviews?.filter(r => r.status === "pending").length ?? 0;
  const flagged = reviews?.filter(r => r.status === "flagged").length ?? 0;

  return (
    <AdminLayout title="Review Moderation">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Review Moderation
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Approve, flag, or remove user-submitted reviews.
            </p>
          </div>
          <div className="flex gap-3">
            {pending > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                {pending} pending
              </Badge>
            )}
            {flagged > 0 && (
              <Badge className="bg-red-100 text-red-800 border border-red-200 px-3 py-1.5">
                <Flag className="w-3.5 h-3.5 mr-1.5" />
                {flagged} flagged
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Show:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue">Pending + Flagged</SelectItem>
              <SelectItem value="pending">Pending only</SelectItem>
              <SelectItem value="flagged">Flagged only</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="py-4 px-5 border-b">
            <CardTitle className="text-base">
              {statusFilter === "queue" ? "Moderation Queue" : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Reviews`}
              {reviews && <span className="ml-2 text-sm font-normal text-muted-foreground">({reviews.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))
            ) : !reviews || reviews.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-empty-queue">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Queue is clear</p>
                <p className="text-sm mt-1">No reviews need attention right now.</p>
              </div>
            ) : (
              reviews.map(review => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  onAction={(id, status, reason) => moderateMutation.mutate({ id, status, reason })}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
