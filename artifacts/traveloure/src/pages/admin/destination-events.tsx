import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  CalendarDays,
  CheckCircle,
  Clock,
  MapPin,
  Sparkles,
  Ticket,
  UserRound,
  X,
} from "lucide-react";

/**
 * Admin review queue for destination (By-Date calendar) events.
 *
 * Machine-generated events (AI/Grok, Fever) are born `pending` (D1a lesson applied to
 * machine content — AI can hallucinate events, so it doesn't self-publish to the public
 * calendar). User-submitted events also land here. Approve → status='approved' (the public
 * calendar's read gate); reject → 'rejected' with a reason. Endpoints ride the blanket
 * admin guard (§2).
 */

interface DestinationEvent {
  id: string;
  title: string;
  city: string;
  country: string | null;
  description: string | null;
  eventType: string | null;
  sourceType: string | null; // ai | fever | manual | user
  startMonth?: number | null;
  specificDate?: string | null;
  createdAt?: string | null;
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sourceBadge(source: string | null) {
  switch (source) {
    case "ai":
      return (
        <Badge className="bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950 dark:text-purple-300">
          <Sparkles className="w-3 h-3 mr-1" /> AI-generated
        </Badge>
      );
    case "fever":
      return (
        <Badge className="bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-300">
          <Ticket className="w-3 h-3 mr-1" /> Partner feed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <UserRound className="w-3 h-3 mr-1" /> User-submitted
        </Badge>
      );
  }
}

function EventRow({
  event,
  onApprove,
  onReject,
  busy,
}: {
  event: DestinationEvent;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const when = event.specificDate
    ? event.specificDate
    : event.startMonth
    ? MONTHS[event.startMonth] ?? ""
    : "";

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid={`event-row-${event.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{event.title}</h3>
            {sourceBadge(event.sourceType)}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {event.city}{event.country ? `, ${event.country}` : ""}
            </span>
            {when && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> {when}
              </span>
            )}
            {event.eventType && <span className="capitalize">{event.eventType}</span>}
          </div>
        </div>
      </div>

      {event.description && (
        <p className="text-sm text-muted-foreground">{event.description}</p>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="w-full text-sm rounded-md border bg-background px-3 py-2"
            data-testid={`input-reject-reason-${event.id}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || reason.trim().length === 0}
              onClick={() => onReject(event.id, reason.trim())}
              data-testid={`button-confirm-reject-${event.id}`}
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onApprove(event.id)}
            data-testid={`button-approve-${event.id}`}
          >
            <CheckCircle className="w-4 h-4 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setRejecting(true)}
            data-testid={`button-reject-${event.id}`}
          >
            <X className="w-4 h-4 mr-1" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminDestinationEvents() {
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<DestinationEvent[]>({
    queryKey: ["/api/admin/destination-events/pending"],
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/destination-events/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/destination-events/pending"] });
      toast({ title: "Event approved", description: "It's now live on the By-Date calendar." });
    },
    onError: () => toast({ title: "Failed to approve event", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/admin/destination-events/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/destination-events/pending"] });
      toast({ title: "Event rejected" });
    },
    onError: () => toast({ title: "Failed to reject event", variant: "destructive" }),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const count = events?.length ?? 0;

  return (
    <AdminLayout title="Event Review">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              Event Review
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Approve or reject calendar events before they go live. AI and partner-feed events
              land here for review — nothing machine-generated publishes to the public calendar
              unreviewed.
            </p>
          </div>
          {count > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {count} pending
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader className="py-4 px-5 border-b">
            <CardTitle className="text-base">
              Pending events
              {events && <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
            ) : count === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-empty-queue">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Queue is clear</p>
                <p className="text-sm mt-1">No events waiting for review.</p>
              </div>
            ) : (
              events!.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  busy={busy}
                  onApprove={(id) => approveMutation.mutate(id)}
                  onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
