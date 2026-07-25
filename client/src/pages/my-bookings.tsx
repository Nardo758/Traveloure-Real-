import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  FileText, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  Star,
  Plane,
  FileCheck,
  Search,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  ListChecks,
  Copy,
  Check,
  MapPin,
  BookOpen,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSignInModal } from "@/contexts/SignInModalContext";

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

interface Booking {
  id: string;
  serviceId: string;
  providerId: string;
  contractId: string | null;
  tripId: string | null;
  bookingDetails: {
    scheduledDate?: string;
    notes?: string;
    quantity?: number;
  };
  bookingMetadata?: VisaBookingMetadata;
  status: string;
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  confirmationCode: string | null;
  hasReview?: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  disputed: { label: "Disputed", variant: "destructive", icon: AlertTriangle },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
  refunded: { label: "Refunded", variant: "outline", icon: DollarSign },
};

const VISA_STATUS_STEPS: Array<{
  key: VisaBookingMetadata["visaApplicationStatus"];
  label: string;
  description: string;
  icon: any;
  color: string;
}> = [
  { key: "pending", label: "Pending", description: "Your application is being reviewed by the expert", icon: Clock, color: "text-yellow-500" },
  { key: "submitted", label: "Submitted", description: "Documents submitted to the embassy", icon: FileCheck, color: "text-blue-500" },
  { key: "in_review", label: "Under Review", description: "Embassy is processing your application", icon: Search, color: "text-purple-500" },
  { key: "approved", label: "Approved", description: "Your visa has been approved!", icon: ThumbsUp, color: "text-green-600" },
  { key: "rejected", label: "Rejected", description: "Visa application was not approved", icon: ThumbsDown, color: "text-red-500" },
];

function isVisaBooking(booking: Booking): boolean {
  const meta = booking.bookingMetadata;
  return !!(meta && (meta.passportNationality || meta.destinationCountry || meta.visaType || meta.visaApplicationStatus));
}

function VisaStatusTimeline({ metadata, bookingId }: { metadata: VisaBookingMetadata; bookingId: string }) {
  const { toast } = useToast();
  const currentStatus = metadata.visaApplicationStatus || "pending";
  const isRejected = currentStatus === "rejected";

  const stepsToShow = isRejected
    ? VISA_STATUS_STEPS.filter(s => s.key !== "approved")
    : VISA_STATUS_STEPS.filter(s => s.key !== "rejected");

  const currentIdx = stepsToShow.findIndex(s => s.key === currentStatus);

  const checklist = metadata.documentChecklist || [];

  const checklistMutation = useMutation({
    mutationFn: (updatedChecklist: Array<{ label: string; checked: boolean }>) =>
      apiRequest("PATCH", `/api/service-bookings/${bookingId}/document-checklist`, {
        documentChecklist: updatedChecklist,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save checklist progress.", variant: "destructive" });
    },
  });

  const handleToggleItem = (idx: number, checked: boolean) => {
    const updated = checklist.map((item, i) =>
      i === idx ? { ...item, checked } : item
    );
    checklistMutation.mutate(updated);
  };

  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/30" data-testid="visa-status-timeline">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Visa Application Status</span>
        {metadata.visaStatusUpdatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Updated {format(new Date(metadata.visaStatusUpdatedAt), "MMM d, yyyy")}
          </span>
        )}
      </div>

      {(metadata.passportNationality || metadata.destinationCountry) && (
        <div className="text-xs text-muted-foreground mb-3 flex gap-3">
          {metadata.passportNationality && <span>Passport: <strong>{metadata.passportNationality}</strong></span>}
          {metadata.destinationCountry && <span>Destination: <strong>{metadata.destinationCountry}</strong></span>}
          {metadata.visaType && <span>Type: <strong className="capitalize">{metadata.visaType}</strong></span>}
        </div>
      )}

      <div className="relative">
        <div className="flex items-start gap-0" data-testid="visa-steps">
          {stepsToShow.map((step, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const StepIcon = step.icon;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center relative" data-testid={`visa-step-${step.key}`}>
                {idx < stepsToShow.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 ${isPast || isCurrent ? "bg-primary" : "bg-muted-foreground/20"}`}
                    style={{ left: "50%", width: "100%" }}
                  />
                )}
                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCurrent
                      ? isRejected
                        ? "border-red-500 bg-red-50 text-red-500"
                        : "border-primary bg-primary text-white"
                      : isPast
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground/30 bg-background text-muted-foreground/40"
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                <span
                  className={`mt-1 text-xs text-center font-medium leading-tight ${
                    isCurrent ? (isRejected ? "text-red-500" : "text-primary") : isPast ? "text-foreground" : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {metadata.visaStatusNotes && (
        <div className="mt-3 flex gap-2 p-2 rounded bg-background border text-xs" data-testid="visa-status-notes">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{metadata.visaStatusNotes}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2 text-center">
        {stepsToShow.find(s => s.key === currentStatus)?.description}
      </p>

      {checklist.length > 0 && (
        <div className="mt-4 border-t pt-3" data-testid="document-checklist">
          <div className="flex items-center gap-1.5 mb-2">
            <ListChecks className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">Required Documents</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {checklist.filter(d => d.checked).length}/{checklist.length} ready
            </span>
          </div>
          <ul className="space-y-1.5" data-testid="document-checklist-items">
            {checklist.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2" data-testid={`checklist-item-${idx}`}>
                <Checkbox
                  id={`doc-item-${bookingId}-${idx}`}
                  checked={item.checked}
                  onCheckedChange={(checked) => handleToggleItem(idx, Boolean(checked))}
                  disabled={checklistMutation.isPending}
                  data-testid={`checkbox-doc-item-${idx}`}
                />
                <label
                  htmlFor={`doc-item-${bookingId}-${idx}`}
                  className={`text-xs cursor-pointer select-none ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}
                  data-testid={`label-doc-item-${idx}`}
                >
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Purchased expert package (template) — Marketplace Phase B3 (the delivery surface).
// Full itinerary lives on /expert-templates/:id, which unlocks for purchasers (B2 content-gate).
interface PurchasedPackage {
  id: string;
  templateId: string;
  status: string;
  price: string;
  purchasedAt: string | null;
  template: {
    id: string;
    title: string;
    destination: string;
    duration: number;
    coverImage?: string | null;
  } | null;
}

function PurchasedPackageCard({ purchase }: { purchase: PurchasedPackage }) {
  const t = purchase.template;
  return (
    <Card data-testid={`package-${purchase.id}`}>
      <CardContent className="p-4 flex items-center gap-4">
        {t?.coverImage ? (
          <img src={t.coverImage} alt={t.title} className="w-20 h-20 object-cover rounded-lg shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-8 h-8 text-primary/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{t?.title ?? "Package unavailable"}</p>
            {purchase.status === "completed" ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Purchased</Badge>
            ) : purchase.status === "refunded" ? (
              <Badge variant="destructive">Refunded</Badge>
            ) : (
              <Badge variant="outline">Payment pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            {t && (
              <>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {t.destination}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t.duration} days</span>
              </>
            )}
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${purchase.price}</span>
            {purchase.purchasedAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {format(new Date(purchase.purchasedAt), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
        {t && purchase.status === "completed" && (
          <Button asChild size="sm" data-testid={`button-view-package-${purchase.id}`}>
            <Link href={`/expert-templates/${t.id}`}>View itinerary</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/my-bookings"],
    enabled: !!user,
  });

  const { data: purchasedPackages } = useQuery<PurchasedPackage[]>({
    queryKey: ["/api/my-purchased-templates"],
    enabled: !!user,
  });

  // Ready-made STORE purchases (cloneable trips) — refundEligible is SERVER-computed on the
  // D7/escrow clock; the client renders it, never re-derives the window.
  const { data: rmPurchasesData } = useQuery<{ purchases: Array<{
    id: string; status: string; pricePaidCents: number; purchasedAt: string | null;
    cloneTripId: string | null; title: string; market: string; heroImageUrl: string | null;
    refundEligible: boolean;
  }> }>({ queryKey: ["/api/ready-made/purchases/mine"], enabled: !!user });
  const rmPurchases = rmPurchasesData?.purchases ?? [];

  const rmRefund = useMutation({
    mutationFn: async (purchaseId: string) => {
      const res = await fetch(`/api/ready-made/purchases/${purchaseId}/refund`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Refund failed");
      return body;
    },
    onSuccess: () => {
      toast({ title: "Refund issued", description: "Your payment is being returned; the trip copy has been removed." });
    },
    onError: (e: Error) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
    // Refetch on EITHER outcome: a 502 means the ledger already flipped to refunded (the server
    // retries only the Stripe leg), so the list must stop offering the refund button.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/ready-made/purchases/mine"] }),
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="container py-8 max-w-4xl mx-auto text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground mb-6">Please sign in to view your bookings</p>
          <Button onClick={() => openSignInModal()} data-testid="button-sign-in">Sign In</Button>
        </div>
      </DashboardLayout>
    );
  }

  const pendingBookings = bookings?.filter(b => b.status === "pending") || [];
  const activeBookings = bookings?.filter(b => ["confirmed", "in_progress"].includes(b.status)) || [];
  const completedBookings = bookings?.filter(b => ["completed", "disputed", "cancelled", "refunded"].includes(b.status)) || [];

  const openReviewDialog = (booking: Booking) => {
    setSelectedBooking(booking);
    setReviewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container py-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Bookings</h1>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (!bookings || bookings.length === 0) && (purchasedPackages?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No bookings yet</h2>
              <p className="text-muted-foreground mb-6">Browse our services and make your first booking</p>
              <Button asChild data-testid="button-browse-services">
                <Link href="/discover">Browse Services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs
            defaultValue={(bookings?.length ?? 0) === 0 && (purchasedPackages?.length ?? 0) > 0 ? "packages" : "all"}
            className="space-y-4"
          >
            <TabsList data-testid="tabs-booking-status">
              <TabsTrigger value="all" data-testid="tab-all">
                All ({bookings?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({pendingBookings.length})
              </TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({activeBookings.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed ({completedBookings.length})
              </TabsTrigger>
              {(purchasedPackages?.length ?? 0) > 0 && (
                <TabsTrigger value="packages" data-testid="tab-packages">
                  Trips ({purchasedPackages!.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {(bookings ?? []).map((booking) => (
                <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
              ))}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              {pendingBookings.length === 0 ? (
                <EmptyState message="No pending bookings" />
              ) : (
                pendingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              {activeBookings.length === 0 ? (
                <EmptyState message="No active bookings" />
              ) : (
                activeBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedBookings.length === 0 ? (
                <EmptyState message="No completed bookings" />
              ) : (
                completedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>

            {/* Purchased expert packages — Phase B3 delivery surface */}
            <TabsContent value="packages" className="space-y-4">
              {/* Ready-made STORE purchases — the buyer's clone + the D7 refund action.
                  Without this block the refund endpoint had zero callers (backend-without-surface). */}
              {rmPurchases.length > 0 && (
                <div className="space-y-3 mb-6" data-testid="rm-purchases">
                  <h3 className="font-semibold">Ready Made Trips you bought</h3>
                  {rmPurchases.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 border border-border rounded-xl p-3" data-testid={`rm-purchase-${p.id}`}>
                      {p.heroImageUrl && <img src={p.heroImageUrl} alt="" className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.market} · ${(p.pricePaidCents / 100).toFixed(2)} ·{" "}
                          {p.status === "refunded" ? "Refunded" : p.status === "revoked" ? "Revoked" : "Purchased"}
                        </div>
                      </div>
                      {p.cloneTripId && p.status !== "refunded" && (
                        <Button size="sm" variant="outline" asChild data-testid={`button-open-clone-${p.id}`}>
                          <Link href={`/trip/${p.cloneTripId}?tab=itinerary`}>Open my trip</Link>
                        </Button>
                      )}
                      {p.refundEligible ? (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={rmRefund.isPending}
                          onClick={() => rmRefund.mutate(p.id)} data-testid={`button-refund-${p.id}`}>
                          Request refund
                        </Button>
                      ) : (p.status === "paid" || p.status === "cloned") ? (
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">Refund window closed</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {(purchasedPackages ?? []).length === 0 ? (
                <EmptyState message="No purchased trips yet" />
              ) : (
                (purchasedPackages ?? []).map((purchase) => (
                  <PurchasedPackageCard key={purchase.id} purchase={purchase} />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        booking={selectedBooking}
      />
    </DashboardLayout>
  );
}

function ConfirmationCodeBadge({ code, bookingId }: { code: string; bookingId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
      data-testid={`confirmation-code-${bookingId}`}
    >
      <FileCheck className="w-3 h-3 flex-shrink-0" />
      <span className="text-xs font-mono font-semibold tracking-wide">{code}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-0.5 p-0.5 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
        title="Copy confirmation code"
        data-testid={`button-copy-code-${bookingId}`}
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="w-3 h-3 text-green-600 dark:text-green-400" />
        )}
      </button>
    </div>
  );
}

function BookingCard({ booking, onReview }: { booking: Booking; onReview: (booking: Booking) => void }) {
  const { toast } = useToast();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const canReview = booking.status === "completed" && !booking.hasReview;
  // Escrow Phase 3: once the provider marks the booking completed, the traveler can either confirm
  // completion (early-releases the provider's held earnings) or dispute (blocks release for admin
  // review). Both act on this service booking by id.
  const canConfirmOrDispute = booking.status === "completed";
  const isDisputed = booking.status === "disputed";
  const showVisaTimeline = isVisaBooking(booking) && booking.bookingMetadata;
  const isConfirmedOrBeyond = ["confirmed", "in_progress", "completed"].includes(booking.status);

  const confirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${booking.id}/confirm-completion`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({ title: "Thanks for confirming", description: "We've released the booking to your provider." });
    },
    onError: () => {
      toast({ title: "Could not confirm", description: "Please try again or contact support.", variant: "destructive" });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: (reason: string) => apiRequest("POST", `/api/bookings/${booking.id}/dispute`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setDisputeOpen(false);
      setDisputeReason("");
      toast({ title: "Dispute submitted", description: "Our team will review it and follow up with you." });
    },
    onError: (err: any) => {
      // The server rejects a dispute raised after the clearance window closes
      // (escrow decision 3 — dispute only during the ~7-day window). Surface the
      // real reason rather than a generic retry prompt.
      const msg = String(err?.message ?? "");
      if (msg.includes("dispute_window_closed")) {
        setDisputeOpen(false);
        toast({
          title: "Dispute window has closed",
          description: "The review window for this booking has passed, so it can no longer be disputed. Contact support if you need help.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Could not submit dispute", description: "Please try again or contact support.", variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={status.variant} data-testid={`badge-status-${booking.id}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
              {showVisaTimeline && (
                <Badge variant="outline" className="text-primary border-primary/30" data-testid={`badge-visa-${booking.id}`}>
                  <Plane className="w-3 h-3 mr-1" />
                  Visa Application
                </Badge>
              )}
              {booking.hasReview && (
                <Badge variant="outline" data-testid={`badge-reviewed-${booking.id}`}>
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  Reviewed
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
              </span>
            </div>

            {isConfirmedOrBeyond && (
              <div className="mb-2">
                {booking.confirmationCode ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Confirmation:</span>
                    <ConfirmationCodeBadge code={booking.confirmationCode} bookingId={booking.id} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid={`no-code-${booking.id}`}>
                    Confirmation code not yet available.{" "}
                    <a href="mailto:support@traveloure.com" className="underline hover:text-foreground transition-colors">
                      Contact support
                    </a>{" "}
                    if you need help.
                  </p>
                )}
              </div>
            )}
            
            <div className="text-sm text-muted-foreground space-y-1">
              {booking.bookingDetails?.scheduledDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Scheduled: {format(new Date(booking.bookingDetails.scheduledDate), "PPP")}
                </div>
              )}
              {booking.bookingDetails?.notes && (
                <p className="line-clamp-2">
                  Notes: {booking.bookingDetails.notes}
                </p>
              )}
            </div>

            {showVisaTimeline && booking.bookingMetadata && (
              <VisaStatusTimeline metadata={booking.bookingMetadata} bookingId={booking.id} />
            )}
          </div>
          
          <div className="text-right">
            <p className="font-bold text-lg" data-testid={`text-amount-${booking.id}`}>
              ${parseFloat(booking.totalAmount).toFixed(2)}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap justify-end">
              {canConfirmOrDispute && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                    data-testid={`button-confirm-completion-${booking.id}`}
                  >
                    <ShieldCheck className="w-4 h-4 mr-1" />
                    Confirm completion
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => setDisputeOpen(true)}
                    disabled={disputeMutation.isPending}
                    data-testid={`button-dispute-${booking.id}`}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Dispute
                  </Button>
                </>
              )}
              {isDisputed && (
                <span className="text-xs text-red-700 font-medium self-center" data-testid={`text-dispute-under-review-${booking.id}`}>
                  Dispute under review
                </span>
              )}
              {canReview && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onReview(booking)}
                  data-testid={`button-review-${booking.id}`}
                >
                  <Star className="w-4 h-4 mr-1" />
                  Review
                </Button>
              )}
              {booking.tripId && (
                <Button variant="outline" size="sm" asChild data-testid={`button-view-itinerary-${booking.id}`}>
                  <Link href={`/my-itinerary/${booking.tripId}`}>
                    <Package className="w-4 h-4 mr-1" />
                    View Itinerary
                  </Link>
                </Button>
              )}
              {booking.contractId && (
                <Button variant="outline" size="sm" asChild data-testid={`button-view-contract-${booking.id}`}>
                  <Link href={`/contracts/${booking.contractId}`}>
                    <FileText className="w-4 h-4 mr-1" />
                    Contract
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild data-testid={`button-message-${booking.id}`}>
                <Link href={`/chat?provider=${booking.providerId}`}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Message
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent data-testid={`dialog-dispute-${booking.id}`}>
          <DialogHeader>
            <DialogTitle>Dispute this booking</DialogTitle>
            <DialogDescription>
              Tell us what went wrong. Submitting a dispute pauses the payout to your provider while our
              team reviews it — you don't need to contact your bank.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Describe the issue (e.g. the service wasn't delivered as booked)…"
            rows={4}
            data-testid={`textarea-dispute-reason-${booking.id}`}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)} data-testid={`button-dispute-cancel-${booking.id}`}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disputeMutation.mutate(disputeReason.trim())}
              disabled={disputeMutation.isPending || disputeReason.trim().length === 0}
              data-testid={`button-dispute-submit-${booking.id}`}
            >
              Submit dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ReviewDialog({ 
  open, 
  onOpenChange, 
  booking 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  booking: Booking | null;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);

  const mutation = useMutation({
    mutationFn: async (data: { rating: number; reviewText: string }) => {
      return apiRequest("POST", `/api/services/${booking?.serviceId}/reviews`, {
        bookingId: booking?.id,
        rating: data.rating,
        reviewText: data.reviewText,
      });
    },
    onSuccess: () => {
      toast({ title: "Review submitted", description: "Thank you for your feedback!" });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      onOpenChange(false);
      setRating(5);
      setReviewText("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit review", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (rating < 1 || rating > 5) {
      toast({ title: "Invalid rating", description: "Please select a rating", variant: "destructive" });
      return;
    }
    mutation.mutate({ rating, reviewText });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-testid="text-review-dialog-title">Leave a Review</DialogTitle>
          <DialogDescription>
            Share your experience with this service
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="mb-2 block">Rating</Label>
            <div className="flex gap-1" data-testid="input-rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                  data-testid={`button-star-${star}`}
                >
                  <Star 
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating) 
                        ? "fill-yellow-400 text-yellow-400" 
                        : "text-muted-foreground"
                    }`} 
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="reviewText" className="mb-2 block">Your Review (optional)</Label>
            <Textarea
              id="reviewText"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell others about your experience..."
              rows={4}
              data-testid="input-review-text"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-review"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={mutation.isPending}
            data-testid="button-submit-review"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Review"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
