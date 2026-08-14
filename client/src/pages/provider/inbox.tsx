import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
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
// Ledger 90 (FP-5, X1/I1): the ONE booking-visibility predicate, shared with Today, Customers,
// the Money page and the server aggregations. See shared/booking-visibility.ts for why.
import {
  isActionableBooking,
  isEarningBooking,
  isHistoryBooking,
  isProvisionalBooking,
  PROVISIONAL_BOOKING_LABEL,
  PROVISIONAL_BOOKING_HINT,
} from "@shared/booking-visibility";
import {
  Inbox as InboxIcon,
  CalendarDays,
  User,
  Search,
  Filter,
  ThumbsUp,
  ThumbsDown,
  Plus,
  X,
  ListChecks,
  DollarSign,
  Clock,
  CheckCircle,
  FileCheck,
  MessageSquare,
  Plane,
  Loader2,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// ─── Shared shapes ──────────────────────────────────────────────────────────
//
// Console IA C9 (§17 17→9 collapse): this replaces the retired /provider/bookings page
// AND the bare Messages sidebar link. Booking shape verified against the LIVE
// GET /api/provider/bookings response (routes.ts) — the retired page's Booking interface
// (eventType/clientName/date/time/guests/amount/expert) named fields the endpoint never
// returns, so those cards silently rendered blank (the same "never-rendered traveler
// names" class the expert C5 absorption fixed). This page uses the real shape: traveler is
// a nested sanitized object (displayName), service is the full provider_services row, and
// money fields are totalAmount/platformFee/providerEarnings.

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

interface InboxBooking {
  id: string;
  traveler?: { id?: string; displayName?: string | null } | null;
  service?: { serviceName?: string | null } | null;
  createdAt?: string;
  status: string;
  tripId?: string;
  totalAmount?: string | number | null;
  platformFee?: string | number | null;
  providerEarnings?: string | number | null;
  bookingMetadata?: VisaBookingMetadata;
  [key: string]: any;
}

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

// ─── Notifications tab (ruling 112 / R3): the bell's unread dot finally resolves somewhere ──
// Run-2 finding R3: the wizard promises "you'll be notified when it's been looked at", the
// decision writers now create the rows (admin.routes.ts notifyListingDecision), and THIS is
// where a provider reads them. Real rows only — an empty list says so (§13).
function NotificationsSection() {
  const { data: notifs = [], isLoading } = useQuery<Array<{
    id: string; type: string; title: string; message: string; isRead: boolean | null; createdAt: string | null;
  }>>({ queryKey: ["/api/notifications"] });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unread = notifs.filter((n) => !n.isRead).length;
  return (
    <Card data-testid="section-inbox-notifications">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Notifications{unread > 0 ? ` · ${unread} unread` : ""}
          </p>
          {unread > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : notifs.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-notifications">
            Nothing yet. Review decisions on your listings land here.
          </p>
        ) : (
          <ul className="space-y-2">
            {notifs.map((n) => (
              <li
                key={n.id}
                className={`rounded-md border px-3 py-2 ${n.isRead ? "opacity-70" : "border-l-2 border-l-primary"}`}
                data-testid={`notification-${n.id}`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                {n.createdAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Visa status: shared dialog (Queue + History both open it) ─────────────
// Endpoint unchanged: PATCH /api/service-bookings/:id/visa-status (ownership-gated on
// booking.providerId, role-agnostic — same handler the expert Inbox uses). The retired
// provider bookings.tsx dialog only wrote status+notes; the endpoint already accepts a
// documentChecklist too, so this dialog carries the fuller (expert-parity) capability —
// a superset, nothing lost.

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
  const option = VISA_STATUS_OPTIONS.find((o) => o.value === status);
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
      setDocumentItems((booking.bookingMetadata?.documentChecklist || []).map((d) => d.label));
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
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
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

// ─── Queue tab: stats + pending bookings needing accept/decline ────────────
// Lifted from the retired /provider/bookings page: the stats row (total/confirmed/
// pending/completed) and the accept/decline action. PATCH /api/provider/bookings/:id/status
// unchanged (handleOwnerBookingStatus in routes.ts — shared with the expert route, same
// ownership gate + confirmed/cancelled-only transition allow-list).

function StatsRow({
  bookings,
  actionable,
  awaitingPayment,
}: {
  bookings: InboxBooking[];
  /** THE SAME ARRAY the queue below maps over — see QueueSection (ledger 90 / FP-5 I1). */
  actionable: InboxBooking[];
  /** Provisional §15b claims — disclosed as information, never as a queue item. */
  awaitingPayment: InboxBooking[];
}) {
  // L10b: real service_bookings statuses also include payment_pending, in_progress,
  // disputed, cancelled, refunded, failed (see my-bookings.tsx's PENDING/ACTIVE/COMPLETED
  // sets) — bucketing every other real status into an honest "Other" tile means Total always
  // equals the sum of the tiles.
  //
  // Ledger 90 (FP-5, I1/X1): "Pending" used to FOLD `payment_pending` in, while the queue list
  // below filtered `status === 'pending'` only. The result was a tile reading "1 Pending" above
  // the words "No bookings waiting", counting a row the page could not display anywhere — on the
  // surface subtitled "Everything that needs your response". The exclusion from the queue was the
  // CORRECT half (a provider must not Accept an unauthorised claim — §18b); the tile was the lie.
  // The count is now literally `actionable.length` — the length of the array the list renders —
  // so the counter and the list cannot disagree by construction, and the provisional claim gets
  // its own honest tile instead of hiding inside someone else's number.
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  const completed = bookings.filter((b) => b.status === "completed").length;
  const stats = {
    total: bookings.length,
    confirmed,
    pending: actionable.length,
    awaitingPayment: awaitingPayment.length,
    completed,
    other: bookings.length - confirmed - actionable.length - awaitingPayment.length - completed,
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="section-inbox-stats">
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-total">
        <p className="text-2xl font-bold text-console-darkest">{stats.total}</p>
        <p className="text-sm text-console-mid">Total</p>
      </div>
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-confirmed">
        <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
        <p className="text-sm text-console-mid">Confirmed</p>
      </div>
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-pending">
        <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        <p className="text-sm text-console-mid">Pending</p>
      </div>
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-awaiting-payment">
        <p className="text-2xl font-bold text-console-mid">{stats.awaitingPayment}</p>
        <p className="text-sm text-console-mid">{PROVISIONAL_BOOKING_LABEL}</p>
      </div>
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-completed">
        <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
        <p className="text-sm text-console-mid">Completed</p>
      </div>
      <div className="p-3 bg-console-hover rounded-lg text-center" data-testid="stat-other">
        <p className="text-2xl font-bold text-console-mid">{stats.other}</p>
        <p className="text-sm text-console-mid">Other</p>
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  onOpenVisaDialog,
  showAcceptDecline,
  statusMutation,
  moneyBanked = true,
}: {
  booking: InboxBooking;
  onOpenVisaDialog: (b: InboxBooking) => void;
  showAcceptDecline: boolean;
  statusMutation: ReturnType<typeof useMutation<any, any, { id: string; status: "confirmed" | "cancelled" }>>;
  /**
   * False for a CLOSED (declined/cancelled/refunded) row (ledger 90 QA-1 follow-up). Defaults to
   * `true` so every existing caller (Queue's actionable + awaiting-payment cards) renders exactly
   * as before — only History passes `false`, and only for rows `isEarningBooking` already
   * excludes. The FP-5 idiom: disclosed via the status badge, never implied payable.
   */
  moneyBanked?: boolean;
}) {
  const [, navigate] = useLocation();
  const isVisa = isVisaBooking(booking);
  const total = booking.totalAmount != null ? Number(booking.totalAmount) : null;
  const fee = booking.platformFee != null ? Number(booking.platformFee) : null;
  const payout = booking.providerEarnings != null
    ? Number(booking.providerEarnings)
    : (total != null ? total - (fee ?? 0) : null);

  return (
    <Card className="border border-console-light" data-testid={`inbox-booking-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
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
            {booking.service?.serviceName && (
              <p className="text-sm text-console-dark">{booking.service.serviceName}</p>
            )}
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
            {(payout != null || total != null) && (
              moneyBanked ? (
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
              ) : (
                // CLOSED (declined/cancelled/refunded): disclosed via the status badge above,
                // never implied payable — no dollar figure rides a row that isn't earnings.
                <div
                  className="mt-3 rounded-md bg-console-hover border border-console-light px-3 py-2 text-xs text-console-mid"
                  data-testid={`booking-no-payout-${booking.id}`}
                >
                  No payout — this booking was {booking.status === "refunded" ? "refunded" : "cancelled"}.
                </div>
              )
            )}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {showAcceptDecline && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: booking.id, status: "confirmed" })}
                  data-testid={`button-accept-booking-${booking.id}`}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
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
                  <X className="w-3.5 h-3.5 mr-1" />
                  Decline
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              {isVisa && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenVisaDialog(booking)}
                  data-testid={`button-update-visa-status-${booking.id}`}
                >
                  <Plane className="w-3 h-3 mr-1" />
                  Visa Status
                </Button>
              )}
              {booking.traveler?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/chat?clientId=${booking.traveler!.id}`)}
                  data-testid={`button-message-${booking.id}`}
                  title="Message traveler"
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueSection({
  bookings,
  isLoading,
  onOpenVisaDialog,
}: {
  bookings: InboxBooking[];
  isLoading: boolean;
  onOpenVisaDialog: (b: InboxBooking) => void;
}) {
  const { toast } = useToast();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "cancelled" }) =>
      apiRequest("PATCH", `/api/provider/bookings/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: variables.status === "confirmed" ? "Booking accepted" : "Booking declined",
        description:
          variables.status === "confirmed"
            ? "The traveler has been notified you accepted."
            : "The traveler has been notified you declined.",
      });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update the booking. Please try again.", variant: "destructive" });
    },
  });

  // Ledger 90 (FP-5, I1/X1): ONE shared predicate, derived ONCE here and handed to both the
  // stats row and the list — so the count is the length of the displayed set, not a second
  // filter that can drift away from it.
  const actionable = bookings.filter((b) => isActionableBooking(b.status));
  const awaitingPayment = bookings.filter((b) => isProvisionalBooking(b.status));

  return (
    <div className="space-y-6" data-testid="section-inbox-queue">
      <StatsRow bookings={bookings} actionable={actionable} awaitingPayment={awaitingPayment} />

      <section>
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
          Bookings needing a response {actionable.length > 0 && `(${actionable.length})`}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : actionable.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings waiting"
            body="New booking requests will show up here."
            testId="empty-inbox-queue"
          />
        ) : (
          <div className="space-y-2">
            {actionable.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onOpenVisaDialog={onOpenVisaDialog}
                showAcceptDecline
                statusMutation={statusMutation}
              />
            ))}
          </div>
        )}
      </section>

      {/* Ledger 90 (FP-5, I1): the honest home for the row the "Awaiting payment" tile counts.
          Deliberately NOT in the queue above and deliberately WITHOUT Accept/Decline — the owner
          rail may not move a booking out of a provisional state (§18b), so offering the button
          would be the defect. Listed read-only so the tile is never a number with no row. */}
      {!isLoading && awaitingPayment.length > 0 && (
        <section data-testid="section-inbox-awaiting-payment">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-1">
            {PROVISIONAL_BOOKING_LABEL} ({awaitingPayment.length})
          </h2>
          <p className="text-sm text-console-mid mb-2">{PROVISIONAL_BOOKING_HINT}</p>
          <div className="space-y-2">
            {awaitingPayment.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onOpenVisaDialog={onOpenVisaDialog}
                showAcceptDecline={false}
                statusMutation={statusMutation}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── History tab: search + status filter + confirmed/completed record ──────
// Lifted from the retired /provider/bookings page's search box + status filter buttons.

function HistorySection({
  bookings,
  isLoading,
  onOpenVisaDialog,
}: {
  bookings: InboxBooking[];
  isLoading: boolean;
  onOpenVisaDialog: (b: InboxBooking) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // The record: the earner's real book of business PLUS its declined/cancelled/refunded outcomes
  // (pending and payment_pending live on Queue; the search/filter capability from the retired
  // page is preserved over this scope).
  // Ledger 90 (FP-5, X1) widened this to the shared RECORD predicate (`deposit_paid`,
  // `in_progress` — real bookings that had no home). QA-1 widens it again to HISTORY (RECORD ∪
  // CLOSED): a provider's Decline previously vanished with no visible record at all — never a
  // provisional claim, which keeps its own read-only section on the Queue tab.
  const history = bookings.filter((b) => isHistoryBooking(b.status));

  const filtered = history.filter((booking) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (booking.traveler?.displayName || "").toLowerCase().includes(q) ||
      (booking.service?.serviceName || "").toLowerCase().includes(q);
    const matchesStatus = !statusFilter || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const visaCases = history.filter(isVisaBooking).length;
  // Dummy mutation shape so BookingCard's accept/decline branch never renders here
  // (showAcceptDecline=false) — History is a record view, not an action queue.
  const noopMutation = { isPending: false, mutate: () => {} } as any;

  return (
    <div className="space-y-6" data-testid="section-inbox-history">
      {visaCases > 0 && (
        <div className="p-3 bg-console-hover rounded-lg text-center border border-console-light" data-testid="stat-visa-cases">
          <p className="text-2xl font-bold text-console-darkest">{visaCases}</p>
          <p className="text-sm text-console-mid flex items-center justify-center gap-1">
            <Plane className="w-3 h-3" /> Visa Cases
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-console-mid" />
              <Input
                placeholder="Search by traveler or service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-history"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={statusFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(null)}
                data-testid="button-filter-all"
              >
                <Filter className="w-3.5 h-3.5 mr-1" /> All
              </Button>
              <Button
                variant={statusFilter === "confirmed" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("confirmed")}
                data-testid="button-filter-confirmed"
              >
                Confirmed
              </Button>
              <Button
                variant={statusFilter === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("completed")}
                data-testid="button-filter-completed"
              >
                Completed
              </Button>
              {/* QA-1: declined bookings previously had no home on History at all — now filterable
                  like every other real outcome. Never counted as earnings/actionable (isEarningBooking
                  gates the payout box below); disclosed via the honest StatusBadge on each card. */}
              <Button
                variant={statusFilter === "cancelled" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("cancelled")}
                data-testid="button-filter-cancelled"
              >
                Cancelled
              </Button>
              <Button
                variant={statusFilter === "refunded" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("refunded")}
                data-testid="button-filter-refunded"
              >
                Refunded
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
          Booking record {filtered.length > 0 && `(${filtered.length})`}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No booking history yet"
            body="Bookings you accept, decline or complete show up here."
            testId="empty-inbox-history"
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onOpenVisaDialog={onOpenVisaDialog}
                showAcceptDecline={false}
                statusMutation={noopMutation}
                moneyBanked={isEarningBooking(booking.status)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Messages tab: recent-threads queue (C5 pattern — /chat stays the thread home) ──
// Row shape per GET /api/chats — role-agnostic, session-scoped (storage.getChats(userId));
// verified NOT expert-only (server/routes.ts). Unlike the expert Inbox (which has no
// participant name and cross-references /expert/assigned-trips), the server here already
// enriches each row with `participant.displayName` — used directly, no client-side join.

interface ChatRow {
  id: string;
  senderId: string;
  receiverId: string | null;
  message: string | null;
  createdAt: string | null;
  participant?: { id?: string; displayName?: string | null } | null;
}

function MessageThreadsSection() {
  const { user } = useAuth();
  const { data: chats, isLoading } = useQuery<ChatRow[] | null>({
    queryKey: ["/api/chats"],
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
          {threads.map(([counterpartId, last]) => (
            <Link key={counterpartId} href={`/chat?clientId=${counterpartId}`}>
              <Card
                className="border border-console-light hover-elevate cursor-pointer"
                data-testid={`inbox-thread-${counterpartId}`}
              >
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-console-darkest truncate flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-console-mid flex-shrink-0" />
                      {last.participant?.displayName || "Traveler"}
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
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

const INBOX_TABS = ["queue", "history", "messages"];

export default function ProviderInbox() {
  // ?tab= deep-link (the C5/C9 seam pattern). The retired /provider/bookings redirect
  // lands here on the default Queue tab.
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") ?? "queue";
  const initialTab = INBOX_TABS.includes(tabParam) ? tabParam : "queue";

  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [selectedVisaBooking, setSelectedVisaBooking] = useState<InboxBooking | null>(null);

  const { data: bookings, isLoading } = useQuery<InboxBooking[]>({
    queryKey: ["/api/provider/bookings"],
  });
  const all = bookings ?? [];

  const openVisaDialog = (booking: InboxBooking) => {
    setSelectedVisaBooking(booking);
    setVisaDialogOpen(true);
  };

  return (
    <ProviderLayout title="Inbox">
      {/* FP-4: normalized onto ProviderLayout's shared content container (its own
          narrower `max-w-4xl mx-auto` is dropped, not stacked). */}
      <div className="p-6 space-y-6">
        <PageHeader
          title="Inbox"
          subtitle="Everything that needs your response"
          icon={InboxIcon}
          testId="text-inbox-title"
        />

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="queue" data-testid="tab-inbox-queue">Queue</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-inbox-history">History</TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-inbox-messages">Messages</TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-inbox-notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <QueueSection bookings={all} isLoading={isLoading} onOpenVisaDialog={openVisaDialog} />
          </TabsContent>

          <TabsContent value="history">
            <HistorySection bookings={all} isLoading={isLoading} onOpenVisaDialog={openVisaDialog} />
          </TabsContent>

          <TabsContent value="messages">
            <MessageThreadsSection />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>
        </Tabs>
      </div>

      <VisaStatusDialog
        open={visaDialogOpen}
        onOpenChange={setVisaDialogOpen}
        booking={selectedVisaBooking}
      />
    </ProviderLayout>
  );
}
