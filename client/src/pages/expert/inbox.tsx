import { useState, useEffect, useMemo } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plane,
  FileCheck,
  Search,
  ThumbsUp,
  ThumbsDown,
  Plus,
  X,
  ListChecks,
  DollarSign,
  Clock,
  CheckCircle,
  MessageSquare,
  Lightbulb,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// ─── Shared shapes ──────────────────────────────────────────────────────────

// Visa metadata rides service_bookings.booking_metadata (lifted with the visa-status
// management from the retired /expert/bookings page — Console IA C5).
interface VisaBookingMetadata {
  passportNationality?: string;
  destinationCountry?: string;
  travelStartDate?: string;
  travelEndDate?: string;
  visaType?: string;
  specialCircumstances?: string;
  visaApplicationStatus?: "pending" | "submitted" | "in_review" | "approved" | "rejected";
  visaStatusNotes?: string;
  visaStatusUpdatedAt?: string;
  documentChecklist?: Array<{ label: string; checked: boolean }>;
}

// Shape per GET /api/expert/bookings (audit B-6): traveler is a nested sanitized object
// (displayName), and there is no `date` field — createdAt is the request timestamp.
interface InboxBooking {
  id: string;
  traveler?: { displayName?: string | null } | null;
  createdAt?: string;
  status: string;
  tripId?: string;
  totalAmount?: string | number | null;
  platformFee?: string | number | null;
  providerEarnings?: string | number | null;
  notes?: string;
  bookingMetadata?: VisaBookingMetadata;
  [key: string]: any;
}

interface AssignedTrip {
  trip_id: string;
  assignment_id: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  traveler_name: string;
  traveler_user_id?: string;
  status: "pending" | "accepted";
  assigned_at?: string;
  suggestion_count?: number;
}

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

// ─── Queue · Section 1: Bookings needing a response ─────────────────────────

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
                      {booking.traveler?.displayName || "Traveler"}
                    </span>
                    <StatusBadge status={booking.status} />
                  </div>
                  {booking.createdAt && (
                    <p className="text-xs text-console-mid">
                      Requested {new Date(booking.createdAt).toLocaleDateString()}
                    </p>
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

// ─── Queue · Section 6: Disputed bookings (read-only) — shares the same query ───

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
                    {booking.traveler?.displayName || "A traveler"} disputed this booking
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

// ─── Queue · Section 2: Assignment invites ──────────────────────────────────

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

// ─── Queue · Section 3: Coordination engagements ────────────────────────────

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

// ─── Queue · Section 4: Agent-booking requests ──────────────────────────────

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

// ─── Queue · Section 5: Reviews awaiting a reply ────────────────────────────

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
  // Audit B-3: filter to reviews WITHOUT a reply — the endpoint now emits `responded`,
  // so a replied review clears from this queue on refetch instead of reappearing forever.
  const reviews = (data?.opportunities ?? []).filter(
    (o) => o.kind === "new_review" && !(o as any).responded,
  );

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

// ─── History tab: booking record + visa management + trip-plan snapshot ─────
// Lifted from the retired /expert/bookings page (Console IA C5). Endpoints unchanged:
// GET /api/expert/bookings, PATCH /api/service-bookings/:id/visa-status,
// GET /api/expert/bookings/:id/plan-snapshot.

interface PlanSnapshot {
  trip: {
    id: string;
    title?: string | null;
    destination?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    numberOfTravelers?: number | null;
    eventType?: string | null;
  };
  itineraryItems: Array<{
    title?: string | null;
    description?: string | null;
    dayNumber?: number | null;
    itemType?: string | null;
    scheduledDate?: string | null;
  }>;
  cartItems: Array<{
    name: string;
    type: string;
    price?: string | number | null;
    quantity: number;
    city?: string | null;
    scheduledDate?: string | null;
  }>;
}

/** Sprint 2.1 expert plan handoff: the traveler's trip + cart snapshot for a
 *  booking that carries a tripId. Server-gated to the booking's own expert. */
function TripPlanDialog({
  bookingId,
  travelerName,
  onOpenChange,
}: {
  bookingId: string | null;
  travelerName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: snapshot, isLoading, isError } = useQuery<PlanSnapshot>({
    queryKey: ["/api/expert/bookings", bookingId, "plan-snapshot"],
    queryFn: async () => {
      const res = await fetch(`/api/expert/bookings/${bookingId}/plan-snapshot`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load plan");
      return res.json();
    },
    enabled: !!bookingId,
  });

  return (
    <Dialog open={!!bookingId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-trip-plan">
        <DialogHeader>
          <DialogTitle>{travelerName ? `${travelerName}'s trip plan` : "Traveler's trip plan"}</DialogTitle>
          <DialogDescription>
            The plan this traveler shared when requesting your help.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError || !snapshot ? (
          <p className="text-sm text-console-mid py-4">Could not load the trip plan.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-console-light p-3">
              <p className="font-semibold text-console-darkest" data-testid="text-plan-trip-title">
                {snapshot.trip.title || "Untitled trip"}
              </p>
              <p className="text-sm text-console-mid mt-0.5">
                {[
                  snapshot.trip.destination,
                  snapshot.trip.startDate && snapshot.trip.endDate
                    ? `${snapshot.trip.startDate} → ${snapshot.trip.endDate}`
                    : snapshot.trip.startDate,
                  snapshot.trip.numberOfTravelers ? `${snapshot.trip.numberOfTravelers} travelers` : null,
                  snapshot.trip.eventType && snapshot.trip.eventType !== "trip" ? snapshot.trip.eventType : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {snapshot.cartItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-2">
                  In their cart ({snapshot.cartItems.length})
                </p>
                <div className="space-y-1.5">
                  {snapshot.cartItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-md border border-console-light px-3 py-2 text-sm"
                      data-testid={`plan-cart-item-${idx}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-console-darkest truncate">{item.name}</p>
                        <p className="text-xs text-console-mid">
                          {[item.type !== "service" ? item.type : null, item.city].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {item.price != null && (
                        <span className="text-sm font-semibold text-console-darkest shrink-0">
                          ${Number(item.price).toFixed(0)}
                          {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {snapshot.itineraryItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-2">
                  Itinerary so far ({snapshot.itineraryItems.length})
                </p>
                <div className="space-y-1.5">
                  {snapshot.itineraryItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-console-light px-3 py-2 text-sm"
                      data-testid={`plan-itinerary-item-${idx}`}
                    >
                      <p className="font-medium text-console-darkest">
                        {item.dayNumber ? `Day ${item.dayNumber} — ` : ""}
                        {item.title || "Item"}
                      </p>
                      {item.description && (
                        <p className="text-xs text-console-mid line-clamp-2">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {snapshot.cartItems.length === 0 && snapshot.itineraryItems.length === 0 && (
              <p className="text-sm text-console-mid py-2">
                The trip has no items yet — the traveler is starting from scratch.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const VISA_STATUS_OPTIONS: Array<{ value: VisaBookingMetadata["visaApplicationStatus"]; label: string; icon: any; color: string }> = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-600" },
  { value: "submitted", label: "Submitted to Embassy", icon: FileCheck, color: "text-blue-600" },
  { value: "in_review", label: "Under Embassy Review", icon: Search, color: "text-purple-600" },
  { value: "approved", label: "Approved", icon: ThumbsUp, color: "text-green-600" },
  { value: "rejected", label: "Rejected", icon: ThumbsDown, color: "text-red-600" },
];

function isVisaBooking(booking: InboxBooking): boolean {
  const meta = booking.bookingMetadata;
  return !!(meta && (meta.passportNationality || meta.destinationCountry || meta.visaType || meta.visaApplicationStatus));
}

function VisaStatusBadge({ status }: { status: VisaBookingMetadata["visaApplicationStatus"] }) {
  const option = VISA_STATUS_OPTIONS.find(o => o.value === status);
  if (!option) return null;
  const Icon = option.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${option.color}`}>
      <Icon className="w-3 h-3" />
      {option.label}
    </span>
  );
}

function VisaStatusDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: InboxBooking | null;
}) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>("pending");
  const [notes, setNotes] = useState("");
  const [documentItems, setDocumentItems] = useState<string[]>([]);
  const [newDocItem, setNewDocItem] = useState("");

  useEffect(() => {
    if (open && booking) {
      setSelectedStatus(booking.bookingMetadata?.visaApplicationStatus || "pending");
      setNotes(booking.bookingMetadata?.visaStatusNotes || "");
      setDocumentItems(
        (booking.bookingMetadata?.documentChecklist || []).map((d) => d.label)
      );
      setNewDocItem("");
    }
  }, [open, booking]);

  const mutation = useMutation({
    mutationFn: ({
      id,
      visaApplicationStatus,
      notes,
      documentChecklist,
    }: {
      id: string;
      visaApplicationStatus: string;
      notes: string;
      documentChecklist: Array<{ label: string; checked: boolean }>;
    }) =>
      apiRequest("PATCH", `/api/service-bookings/${id}/visa-status`, {
        visaApplicationStatus,
        notes,
        documentChecklist,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/bookings"] });
      toast({ title: "Visa status updated", description: "The traveler will see the updated status." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update visa status. Please try again.", variant: "destructive" });
    },
  });

  const handleAddDocItem = () => {
    const trimmed = newDocItem.trim();
    if (!trimmed) return;
    setDocumentItems((prev) => [...prev, trimmed]);
    setNewDocItem("");
  };

  const handleRemoveDocItem = (idx: number) => {
    setDocumentItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!booking) return;
    const existingChecklist = booking.bookingMetadata?.documentChecklist || [];
    const documentChecklist = documentItems.map((label) => {
      const existing = existingChecklist.find((d) => d.label === label);
      return { label, checked: existing?.checked ?? false };
    });
    mutation.mutate({ id: booking.id, visaApplicationStatus: selectedStatus, notes, documentChecklist });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-visa-dialog-title">Update Visa Application Status</DialogTitle>
          <DialogDescription>
            {booking?.bookingMetadata?.passportNationality && booking?.bookingMetadata?.destinationCountry
              ? `${booking.bookingMetadata.passportNationality} → ${booking.bookingMetadata.destinationCountry} (${booking.bookingMetadata.visaType || "visa"})`
              : "Update the applicant's visa progress"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-2 block">Application Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger data-testid="select-visa-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISA_STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <SelectItem key={opt.value} value={opt.value!} data-testid={`option-visa-status-${opt.value}`}>
                      <span className={`flex items-center gap-2 ${opt.color}`}>
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="visa-notes" className="mb-2 block">Notes for traveler (optional)</Label>
            <Textarea
              id="visa-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Your appointment is on June 15th at 9am. Please bring all original documents."
              rows={3}
              data-testid="input-visa-notes"
            />
          </div>

          <div>
            <Label className="mb-2 flex items-center gap-1.5 block">
              <ListChecks className="w-4 h-4" />
              Required Documents Checklist
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Add documents the traveler must gather. They can check them off as they prepare.
            </p>
            {documentItems.length > 0 && (
              <ul className="mb-2 space-y-1" data-testid="document-checklist-items">
                {documentItems.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 text-sm bg-muted/40 rounded px-2 py-1"
                    data-testid={`checklist-item-${idx}`}
                  >
                    <span className="flex-1">{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDocItem(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`button-remove-doc-item-${idx}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newDocItem}
                onChange={(e) => setNewDocItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDocItem(); } }}
                placeholder="e.g. 2 passport-size photos"
                className="text-sm"
                data-testid="input-new-doc-item"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddDocItem}
                disabled={!newDocItem.trim()}
                data-testid="button-add-doc-item"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-visa-update">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-visa-status">
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Status"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySection() {
  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [selectedVisaBooking, setSelectedVisaBooking] = useState<InboxBooking | null>(null);
  const [planBooking, setPlanBooking] = useState<InboxBooking | null>(null);

  const { data: bookings, isLoading } = useQuery<InboxBooking[]>({
    queryKey: ["/api/expert/bookings"],
  });

  const all = bookings ?? [];
  // The Queue tab owns pending (actionable) bookings; History is the record —
  // confirmed and completed bookings.
  const history = all.filter((b) => b.status === "confirmed" || b.status === "completed");
  const visaCases = all.filter(isVisaBooking).length;

  const openVisaDialog = (booking: InboxBooking) => {
    setSelectedVisaBooking(booking);
    setVisaDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="section-inbox-history">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-total">
          <p className="text-2xl font-bold text-console-darkest">{all.length}</p>
          <p className="text-sm text-console-mid">Total</p>
        </div>
        <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-pending">
          <p className="text-2xl font-bold text-amber-600">
            {all.filter((b) => b.status === "pending").length}
          </p>
          <p className="text-sm text-console-mid">Pending</p>
        </div>
        <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-confirmed">
          <p className="text-2xl font-bold text-green-600">
            {all.filter((b) => b.status === "confirmed").length}
          </p>
          <p className="text-sm text-console-mid">Confirmed</p>
        </div>
        <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-completed">
          <p className="text-2xl font-bold text-blue-600">
            {all.filter((b) => b.status === "completed").length}
          </p>
          <p className="text-sm text-console-mid">Completed</p>
        </div>
      </div>
      {visaCases > 0 && (
        <div className="p-3 bg-console-hover rounded-lg text-center border border-console-light" data-testid="stat-visa-cases">
          <p className="text-2xl font-bold text-console-darkest">{visaCases}</p>
          <p className="text-sm text-console-mid flex items-center justify-center gap-1">
            <Plane className="w-3 h-3" /> Visa Cases
          </p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
          Confirmed & completed bookings {history.length > 0 && `(${history.length})`}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No booking history yet"
            body="Bookings you accept show up here once confirmed."
            testId="empty-inbox-history"
          />
        ) : (
          <div className="space-y-2">
            {history.map((booking) => {
              const isVisa = isVisaBooking(booking);
              return (
                <Card key={booking.id} className="border border-console-light" data-testid={`inbox-history-${booking.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-console-darkest flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-console-mid" />
                            {booking.traveler?.displayName || "Traveler"}
                          </span>
                          <StatusBadge status={booking.status} />
                          {isVisa && (
                            <Badge variant="outline" className="text-xs">
                              <Plane className="w-3 h-3 mr-1" /> Visa Application
                            </Badge>
                          )}
                        </div>
                        {booking.createdAt && (
                          <p className="text-xs text-console-mid">
                            Requested {new Date(booking.createdAt).toLocaleDateString()}
                          </p>
                        )}
                        {isVisa && booking.bookingMetadata && (
                          <div className="mt-2 text-xs text-console-mid space-y-0.5">
                            {booking.bookingMetadata.passportNationality && (
                              <span className="mr-3">Passport: <strong>{booking.bookingMetadata.passportNationality}</strong></span>
                            )}
                            {booking.bookingMetadata.destinationCountry && (
                              <span className="mr-3">Destination: <strong>{booking.bookingMetadata.destinationCountry}</strong></span>
                            )}
                            {booking.bookingMetadata.visaApplicationStatus && (
                              <span className="block mt-1">
                                Visa status: <VisaStatusBadge status={booking.bookingMetadata.visaApplicationStatus} />
                              </span>
                            )}
                          </div>
                        )}
                        {booking.notes && (
                          <p className="text-sm text-console-mid mt-2 italic">Note: {booking.notes}</p>
                        )}
                        {(() => {
                          // Two-sided fee disclosure (fields ride the booking payload —
                          // sanitizeBookingForExpert keeps totalAmount/platformFee/providerEarnings).
                          const total = booking.totalAmount != null ? Number(booking.totalAmount) : null;
                          const fee = booking.platformFee != null ? Number(booking.platformFee) : null;
                          const payout = booking.providerEarnings != null
                            ? Number(booking.providerEarnings)
                            : (total != null ? total - (fee ?? 0) : null);
                          if (payout == null && total == null) return null;
                          return (
                            <div
                              className="mt-3 rounded-md bg-green-50 border border-green-200 px-3 py-2"
                              data-testid={`booking-payout-${booking.id}`}
                            >
                              {payout != null && (
                                <div className="flex items-center gap-1.5 text-sm font-semibold text-green-800">
                                  <DollarSign className="w-4 h-4" />
                                  You earn ${payout.toFixed(2)}
                                </div>
                              )}
                              {total != null && (
                                <p className="text-xs text-green-700 mt-0.5">
                                  Booking total ${total.toFixed(2)}
                                  {fee != null && <> · platform fee ${fee.toFixed(2)}</>}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {isVisa && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openVisaDialog(booking)}
                            data-testid={`button-update-visa-status-${booking.id}`}
                          >
                            <Plane className="w-3 h-3 mr-1" />
                            Visa Status
                          </Button>
                        )}
                        {booking.tripId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPlanBooking(booking)}
                            data-testid={`button-view-trip-plan-${booking.id}`}
                          >
                            <ListChecks className="w-3 h-3 mr-1" />
                            Trip Plan
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <VisaStatusDialog
        open={visaDialogOpen}
        onOpenChange={setVisaDialogOpen}
        booking={selectedVisaBooking}
      />
      <TripPlanDialog
        bookingId={planBooking?.id ?? null}
        travelerName={planBooking?.traveler?.displayName ?? undefined}
        onOpenChange={(open) => { if (!open) setPlanBooking(null); }}
      />
    </div>
  );
}

// ─── Assignments tab: the assigned-trips list ───────────────────────────────
// Lifted from the retired /expert/assigned-trips page (Console IA C5), minus the Suggest
// flow (now on the Workstation Distribute→Client card) and the by-client grouping
// (lives on /expert/customers).

function AssignmentsSection() {
  const { toast } = useToast();
  const { data: assignedTrips, isLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    staleTime: 30000,
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

  return (
    <section data-testid="section-inbox-assigned-trips">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Assigned trips {(assignedTrips?.length ?? 0) > 0 && `(${assignedTrips!.length})`}
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : !assignedTrips || assignedTrips.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No assigned trips"
          body="When travelers assign you to their trip, they'll appear here."
          testId="empty-inbox-assigned-trips"
        />
      ) : (
        <div className="space-y-2" data-testid="assigned-trips-list">
          {assignedTrips.map((trip) => (
            <Card key={trip.trip_id} className="border border-console-light" data-testid={`assigned-trip-card-${trip.trip_id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-console-darkest truncate">
                        {trip.trip_title || trip.destination}
                      </h3>
                      <Badge
                        variant={trip.status === "accepted" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {trip.status === "accepted" ? "Active" : "Pending"}
                      </Badge>
                      {(trip.suggestion_count ?? 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Lightbulb className="w-2.5 h-2.5" />
                          {trip.suggestion_count} sent
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-console-mid">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {trip.destination}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                      </span>
                      {trip.traveler_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {trip.traveler_name}
                        </span>
                      )}
                      {trip.assigned_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Assigned {formatDate(trip.assigned_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {trip.status === "pending" && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => acceptMutation.mutate(trip.assignment_id)}
                        disabled={acceptMutation.isPending}
                        data-testid={`button-accept-${trip.trip_id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Accept
                      </Button>
                    )}
                    {trip.status === "accepted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        asChild
                        data-testid={`button-open-workspace-${trip.trip_id}`}
                      >
                        <Link href={`/expert/workspace/${trip.trip_id}`}>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Workspace
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Messages tab: recent-threads queue (C5 — /chat stays the thread home) ──

// Row shape per GET /api/chats (user_and_expert_chats — the same endpoint /chat's
// useChats consumes); this queue only groups it, it never writes.
interface ChatRow {
  id: string;
  senderId: string;
  receiverId: string | null;
  message: string | null;
  createdAt: string | null;
}

function MessageThreadsSection() {
  const { user } = useAuth();
  const { data: chats, isLoading } = useQuery<ChatRow[] | null>({
    queryKey: ["/api/chats"],
  });
  // Same client-side join chat.tsx uses: assigned trips carry traveler_user_id +
  // traveler_name, which is the only name source available for a chat counterpart.
  const { data: assignedTrips } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
  });

  const threads = useMemo(() => {
    const byCounterpart = new Map<string, ChatRow>();
    for (const c of chats ?? []) {
      const counterpartId = c.senderId === user?.id ? c.receiverId : c.senderId;
      if (!counterpartId) continue;
      const existing = byCounterpart.get(counterpartId);
      if (!existing || +new Date(c.createdAt ?? 0) > +new Date(existing.createdAt ?? 0)) {
        byCounterpart.set(counterpartId, c);
      }
    }
    return Array.from(byCounterpart.entries())
      .sort((a, b) => +new Date(b[1].createdAt ?? 0) - +new Date(a[1].createdAt ?? 0))
      .slice(0, 8);
  }, [chats, user?.id]);

  const nameFor = (counterpartId: string) =>
    (assignedTrips ?? []).find((t) => t.traveler_user_id === counterpartId)?.traveler_name || null;

  return (
    <section data-testid="section-inbox-messages">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide">
          Recent conversations {threads.length > 0 && `(${threads.length})`}
        </h2>
        <Button size="sm" variant="ghost" className="gap-1.5" asChild data-testid="button-open-messages">
          <Link href="/chat">
            <MessageSquare className="w-3.5 h-3.5" /> Open Messages
          </Link>
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          body="Messages travelers send you land in Messages."
          cta={
            <Button size="sm" variant="outline" asChild data-testid="button-empty-open-messages">
              <Link href="/chat">Open Messages</Link>
            </Button>
          }
          testId="empty-inbox-messages"
        />
      ) : (
        <div className="space-y-2">
          {threads.map(([counterpartId, last]) => {
            const name = nameFor(counterpartId);
            return (
              <Link key={counterpartId} href={`/chat?clientId=${counterpartId}`}>
                <Card
                  className="border border-console-light hover-elevate cursor-pointer"
                  data-testid={`inbox-thread-${counterpartId}`}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-console-darkest truncate flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-console-mid flex-shrink-0" />
                        {name || "Traveler"}
                      </p>
                      {last.message && (
                        <p className="text-xs text-console-mid truncate mt-0.5">{last.message}</p>
                      )}
                    </div>
                    <span className="text-xs text-console-mid flex-shrink-0">
                      {last.createdAt ? new Date(last.createdAt).toLocaleDateString() : ""}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

const INBOX_TABS = ["queue", "assignments", "history", "messages"];

export default function ExpertInbox() {
  // ?tab= deep-link (the console convention — analytics.tsx pattern). The retired
  // /expert/bookings and /expert/assigned-trips redirects land on history/assignments.
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") ?? "queue";
  const initialTab = INBOX_TABS.includes(tabParam) ? tabParam : "queue";

  return (
    <ExpertLayout title="Inbox">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Inbox"
          subtitle="Everything that needs your response"
          icon={InboxIcon}
          testId="text-inbox-title"
        />

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="queue" data-testid="tab-inbox-queue">Queue</TabsTrigger>
            <TabsTrigger value="assignments" data-testid="tab-inbox-assigned-trips">Assigned Trips</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-inbox-history">History</TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-inbox-messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-8">
            <BookingsSection />
            <AssignmentInvitesSection />
            <CoordinationEngagementsSection />
            <AgentBookingRequestsSection />
            <ReviewRepliesSection />
            <DisputedBookingsSection />
          </TabsContent>

          <TabsContent value="assignments">
            <AssignmentsSection />
          </TabsContent>

          <TabsContent value="history">
            <HistorySection />
          </TabsContent>

          <TabsContent value="messages">
            <MessageThreadsSection />
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
