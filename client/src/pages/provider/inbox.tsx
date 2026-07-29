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

function StatsRow({ bookings }: { bookings: InboxBooking[] }) {
  // L10b: real service_bookings statuses also include payment_pending, in_progress,
  // disputed, cancelled, refunded, failed (see my-bookings.tsx's PENDING/ACTIVE/COMPLETED
  // sets) — folding payment_pending into "Pending" and bucketing every other real status
  // into an honest "Other" tile means Total always equals the sum of the tiles again.
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  const pending = bookings.filter((b) => b.status === "pending" || b.status === "payment_pending").length;
  const completed = bookings.filter((b) => b.status === "completed").length;
  const stats = {
    total: bookings.length,
    confirmed,
    pending,
    completed,
    other: bookings.length - confirmed - pending - completed,
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" data-testid="section-inbox-stats">
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
}: {
  booking: InboxBooking;
  onOpenVisaDialog: (b: InboxBooking) => void;
  showAcceptDecline: boolean;
  statusMutation: ReturnType<typeof useMutation<any, any, { id: string; status: "confirmed" | "cancelled" }>>;
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

  const pending = bookings.filter((b) => b.status === "pending");

  return (
    <div className="space-y-6" data-testid="section-inbox-queue">
      <StatsRow bookings={bookings} />

      <section>
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
          Bookings needing a response {pending.length > 0 && `(${pending.length})`}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings waiting"
            body="New booking requests will show up here."
            testId="empty-inbox-queue"
          />
        ) : (
          <div className="space-y-2">
            {pending.map((booking) => (
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

  // The record: confirmed + completed bookings (pending lives on Queue; the search/filter
  // capability from the retired page is preserved over this scope).
  const history = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");

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
            </div>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
          Confirmed & completed bookings {filtered.length > 0 && `(${filtered.length})`}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No booking history yet"
            body="Bookings you accept show up here once confirmed."
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
            <TabsTrigger value="history" data-testid="tab-inbox-history">History</TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-inbox-messages">Messages</TabsTrigger>
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
