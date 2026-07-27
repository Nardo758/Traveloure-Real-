import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, EmptyState, StatusBadge } from "@/components/backoffice/primitives";
import {
  Inbox as InboxIcon,
  CalendarDays,
  MapPin,
  ExternalLink,
  User,
  Star,
  ShieldAlert,
  ClipboardCheck,
  Send,
  Loader2,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Section 1: Bookings needing a response ─────────────────────────────────

interface InboxBooking {
  id: string;
  travelerName?: string;
  date?: string;
  status: string;
  tripId?: string;
  totalAmount?: string | number | null;
  providerEarnings?: string | number | null;
  [key: string]: any;
}

function BookingsSection() {
  const { toast } = useToast();
  const { data: bookings, isLoading } = useQuery<InboxBooking[]>({
    queryKey: ["/api/expert/bookings"],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/expert/bookings/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: variables.status === "confirmed" ? "Booking accepted" : "Booking declined",
        description:
          variables.status === "confirmed"
            ? "The booking has been confirmed."
            : "The booking has been declined.",
      });
    },
    onError: () => {
      toast({ title: "Action failed", description: "Could not update booking status. Please try again.", variant: "destructive" });
    },
  });

  const pending = (bookings ?? []).filter((b) => b.status === "pending");

  return (
    <section data-testid="section-inbox-bookings">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Bookings needing a response {pending.length > 0 && `(${pending.length})`}
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : pending.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No bookings waiting" body="New booking requests will show up here." testId="empty-inbox-bookings" />
      ) : (
        <div className="space-y-2">
          {pending.map((booking) => (
            <Card key={booking.id} className="border border-console-light" data-testid={`inbox-booking-${booking.id}`}>
              <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-console-darkest flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-console-mid" />
                      {booking.travelerName || "Traveler"}
                    </span>
                    <StatusBadge status={booking.status} />
                  </div>
                  {booking.date && (
                    <p className="text-xs text-console-mid">{booking.date}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: booking.id, status: "confirmed" })}
                    data-testid={`button-accept-booking-${booking.id}`}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: booking.id, status: "cancelled" })}
                    data-testid={`button-decline-booking-${booking.id}`}
                  >
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 6: Disputed bookings (read-only) — shares the same query ───────

function DisputedBookingsSection() {
  const { data: bookings, isLoading } = useQuery<InboxBooking[]>({
    queryKey: ["/api/expert/bookings"],
  });
  const disputed = (bookings ?? []).filter((b) => b.status === "disputed");

  return (
    <section data-testid="section-inbox-disputes">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Disputed bookings {disputed.length > 0 && `(${disputed.length})`}
      </h2>
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : disputed.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No disputes" body="Disputed bookings will appear here." testId="empty-inbox-disputes" />
      ) : (
        <div className="space-y-2">
          {disputed.map((booking) => (
            <Card key={booking.id} className="border border-amber-200 bg-amber-50/50" data-testid={`inbox-dispute-${booking.id}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-console-darkest">
                    {booking.travelerName || "A traveler"} disputed this booking
                  </p>
                  <p className="text-xs text-console-mid mt-0.5">
                    The platform team is reviewing it; related earnings stay held until it resolves.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 2: Assignment invites ──────────────────────────────────────────

interface AssignedTrip {
  trip_id: string;
  assignment_id: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  traveler_name: string;
  status: "pending" | "accepted";
}

function AssignmentInvitesSection() {
  const { toast } = useToast();
  const { data: assignedTrips, isLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
  });

  const acceptMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await apiRequest("POST", `/api/expert/assignments/${assignmentId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/assigned-trips"] });
      toast({ title: "Trip accepted", description: "You can now open it in the workspace." });
    },
    onError: (err: any) => {
      toast({ title: "Could not accept trip", description: err.message, variant: "destructive" });
    },
  });

  const pending = (assignedTrips ?? []).filter((t) => t.status === "pending");

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <section data-testid="section-inbox-assignments">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Assignment invites {pending.length > 0 && `(${pending.length})`}
      </h2>
      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : pending.length === 0 ? (
        <EmptyState icon={MapPin} title="No pending invites" body="Trips travelers assign to you will appear here." testId="empty-inbox-assignments" />
      ) : (
        <div className="space-y-2">
          {pending.map((trip) => (
            <Card key={trip.trip_id} className="border border-console-light" data-testid={`inbox-assignment-${trip.trip_id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-console-darkest truncate">{trip.trip_title || trip.destination}</p>
                  <p className="text-xs text-console-mid">
                    {trip.destination} · {formatDate(trip.start_date)} – {formatDate(trip.end_date)} · {trip.traveler_name}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => acceptMutation.mutate(trip.assignment_id)}
                  disabled={acceptMutation.isPending}
                  data-testid={`button-accept-assignment-${trip.trip_id}`}
                >
                  Accept
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Coordination engagements ────────────────────────────────────

interface CoordinationEngagement {
  id: string;
  tripId: string | null;
  experienceType: string;
  status: string | null;
  destination: string | null;
  dates: Record<string, unknown> | null;
  feePaymentStatus: string | null;
  createdAt: string | null;
}

function CoordinationEngagementsSection() {
  const { data, isLoading } = useQuery<{ engagements: CoordinationEngagement[] }>({
    queryKey: ["/api/expert/coordination-engagements"],
  });
  const engagements = data?.engagements ?? [];

  return (
    <section data-testid="section-inbox-coordination">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Coordination engagements {engagements.length > 0 && `(${engagements.length})`}
      </h2>
      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : engagements.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No coordination engagements" body="Events assigned to you for coordination will appear here." testId="empty-inbox-coordination" />
      ) : (
        <div className="space-y-2">
          {engagements.map((e) => (
            <Card key={e.id} className="border border-console-light" data-testid={`inbox-engagement-${e.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-console-darkest capitalize">{e.experienceType} coordination</span>
                    <StatusBadge status={e.status ?? "intake"} />
                    {e.feePaymentStatus === "paid" && (
                      <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100">Fee paid</Badge>
                    )}
                  </div>
                  <p className="text-xs text-console-mid">{e.destination ?? "Destination TBC"}</p>
                </div>
                {e.tripId ? (
                  <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" asChild data-testid={`button-open-engagement-${e.id}`}>
                    <Link href={`/expert/workspace/${e.tripId}`}>
                      <ExternalLink className="w-3.5 h-3.5" /> Open workspace
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="outline" className="flex-shrink-0 text-[10px]">Awaiting trip setup</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 4: Agent-booking requests ──────────────────────────────────────

interface AffiliateBookingRequest {
  id: string;
  expertId: string | null;
  tripId: string | null;
  itemName: string;
  partnerName: string;
  partnerCategory?: string | null;
  travelDate?: string | null;
  travelers?: number | null;
  userNotes?: string | null;
  expertNotes?: string | null;
  confirmationRef?: string | null;
  price?: string | number | null;
  status: string;
  createdAt: string;
}

function AgentBookingRequestsSection() {
  const { toast } = useToast();
  const [confirmRefById, setConfirmRefById] = useState<Record<string, string>>({});

  const { data: requests, isLoading } = useQuery<AffiliateBookingRequest[]>({
    queryKey: ["/api/affiliate-booking-requests/expert"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/affiliate-booking-requests/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-booking-requests/expert"] });
      toast({ title: "Request updated" });
    },
    onError: (err: any) => {
      toast({ title: "Could not update request", description: err.message, variant: "destructive" });
    },
  });

  const sorted = [...(requests ?? [])].sort((a, b) => {
    const rank = (r: AffiliateBookingRequest) => (r.status === "pending" ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <section data-testid="section-inbox-agent-bookings">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Agent-booking requests {sorted.length > 0 && `(${sorted.length})`}
      </h2>
      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : sorted.length === 0 ? (
        <EmptyState icon={ExternalLink} title="No booking requests" body="Off-site bookings travelers ask you to facilitate will appear here." testId="empty-inbox-agent-bookings" />
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const isUnclaimed = !r.expertId;
            return (
              <Card key={r.id} className="border border-console-light" data-testid={`inbox-agent-booking-${r.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-console-darkest truncate">{r.itemName}</p>
                      <p className="text-xs text-console-mid">
                        {r.partnerName}
                        {r.travelDate ? ` · ${r.travelDate}` : ""}
                        {r.travelers ? ` · ${r.travelers} traveler${r.travelers > 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={r.status} />
                      {isUnclaimed && <Badge variant="outline" className="text-[10px]">Unclaimed</Badge>}
                    </div>
                  </div>
                  {isUnclaimed ? (
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: r.id, data: { expertId: "self" } })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-claim-${r.id}`}
                    >
                      Claim
                    </Button>
                  ) : r.status === "pending" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        placeholder="Confirmation ref (optional)"
                        className="h-8 text-sm max-w-xs"
                        value={confirmRefById[r.id] ?? ""}
                        onChange={(e) => setConfirmRefById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        data-testid={`input-confirmation-ref-${r.id}`}
                      />
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() =>
                          updateMutation.mutate({
                            id: r.id,
                            data: {
                              status: "confirmed",
                              ...(confirmRefById[r.id]?.trim() ? { confirmationRef: confirmRefById[r.id].trim() } : {}),
                            },
                          })
                        }
                        disabled={updateMutation.isPending}
                        data-testid={`button-confirm-agent-booking-${r.id}`}
                      >
                        Mark confirmed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => updateMutation.mutate({ id: r.id, data: { status: "failed" } })}
                        disabled={updateMutation.isPending}
                        data-testid={`button-fail-agent-booking-${r.id}`}
                      >
                        Mark failed
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Section 5: Reviews awaiting a reply ────────────────────────────────────

interface PostingOpportunity {
  kind: "new_review" | "open_slots";
  reviewId?: string;
  rating?: number;
  text?: string;
  serviceId?: string;
  serviceName?: string;
  createdAt?: string;
}

function ReviewReplyRow({ item }: { item: PostingOpportunity }) {
  const { toast } = useToast();
  const [responseText, setResponseText] = useState("");

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/expert/reviews/${item.reviewId}/respond`, { responseText });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/posting-opportunities"] });
      toast({ title: "Reply sent" });
      setResponseText("");
    },
    onError: (err: any) => {
      toast({ title: "Could not send reply", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border border-console-light" data-testid={`inbox-review-${item.reviewId}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-medium text-console-darkest truncate">{item.serviceName}</p>
            {item.rating != null && (
              <p className="text-xs text-console-mid flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {item.rating} / 5
              </p>
            )}
          </div>
        </div>
        {item.text && <p className="text-sm text-console-mid italic">"{item.text}"</p>}
        <div className="flex items-center gap-2">
          <Textarea
            placeholder="Write a reply…"
            className="text-sm min-h-[36px]"
            rows={1}
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            data-testid={`input-review-reply-${item.reviewId}`}
          />
          <Button
            size="sm"
            className="flex-shrink-0 gap-1.5"
            onClick={() => replyMutation.mutate()}
            disabled={replyMutation.isPending || !responseText.trim()}
            data-testid={`button-reply-review-${item.reviewId}`}
          >
            {replyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Reply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewRepliesSection() {
  const { data, isLoading } = useQuery<{ opportunities: PostingOpportunity[] }>({
    queryKey: ["/api/me/posting-opportunities"],
  });
  const reviews = (data?.opportunities ?? []).filter((o) => o.kind === "new_review");

  return (
    <section data-testid="section-inbox-reviews">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Reviews awaiting a reply {reviews.length > 0 && `(${reviews.length})`}
      </h2>
      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : reviews.length === 0 ? (
        <EmptyState icon={Star} title="No new reviews" body="Recent reviews on your approved, active offerings will appear here." testId="empty-inbox-reviews" />
      ) : (
        <div className="space-y-2">
          {reviews.map((item) => (
            <ReviewReplyRow key={item.reviewId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ExpertInbox() {
  return (
    <ExpertLayout title="Inbox">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="Inbox"
          subtitle="Everything that needs your response"
          icon={InboxIcon}
          testId="text-inbox-title"
        />

        <BookingsSection />
        <AssignmentInvitesSection />
        <CoordinationEngagementsSection />
        <AgentBookingRequestsSection />
        <ReviewRepliesSection />
        <DisputedBookingsSection />
      </div>
    </ExpertLayout>
  );
}
