/**
 * THE TRAVELER'S ACCEPTANCE + DECLARED-WINDOW PANEL.
 *
 * Ledger `2026-09-17-surfaces-acceptance-completion`; CLAUDE.md Locked Decision 46 (accept / request
 * revision / the D-27 ask-and-escalate timer) and Locked Decision 47 (the seller declares, the
 * traveler has a window, "completed" is said at its close).
 *
 * EVERY DECISION THIS COMPONENT MAKES COMES FROM `client/src/lib/booking-lifecycle.ts`, which reads
 * the SERVER's own answers — the acceptance deadline derived from `delivered_at` +
 * `acceptanceWindowDays()`, the dispute-by date derived from `declaredCompletionWindowDays()`, the
 * live revision allowance, and the from-state lists the rails themselves guard on. Nothing here adds
 * days to a date or decides who may write; the buttons call EXISTING rails and repeat, by name, what
 * the server answers.
 *
 * RAILS CALLED (all pre-existing; this lane added none):
 *   POST /api/bookings/:id/accept-deliverable   — the traveler accepts
 *   POST /api/bookings/:id/request-revision     — `.strict()` body of exactly one optional `note`
 *   POST /api/bookings/:id/dispute              — the ONE dispute writer
 *
 * §13: a booking whose listing takes no acceptance renders NOTHING (the view returns null); an
 * ESCALATED row says it is with our team and never says "refunded"; a booking with no delivery
 * instant says it is on no clock rather than showing an invented date; a listing with no revision
 * allowance shows no revision affordance at all.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Loader2, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  LIFECYCLE_COPY,
  daysRemaining,
  travelerAcceptanceView,
  travelerDeclarationView,
  type LifecycleAudience,
  type LifecycleBooking,
} from "@/lib/booking-lifecycle";

/** ISO in, a date a person reads out. An unparseable instant renders nothing rather than "Invalid Date". */
function readableDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return format(new Date(ms), "MMM d, yyyy");
}

export interface BookingAcceptancePanelProps {
  booking: LifecycleBooking;
  /** Who is looking. Anything but `owner` renders nothing (LD 42 D16 — the controls are the owner's). */
  audience: LifecycleAudience;
  /** Query keys to refresh after a write. The caller owns its own reads; this panel owns none. */
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function BookingAcceptancePanel({ booking, audience, invalidateKeys = [] }: BookingAcceptancePanelProps) {
  const { toast } = useToast();
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseNote, setReviseNote] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const acceptance = travelerAcceptanceView(booking, audience);
  const declaration = travelerDeclarationView(booking, audience);

  const refresh = () => {
    for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key as unknown[] });
  };

  // The server's refusal is the message. `booking-acceptance.service.ts` answers a NAMED code with a
  // sentence that states the number where a number is what refused it (§13) — repeating our own
  // guess here would be the second authority this whole lane exists to avoid.
  const serverMessage = async (err: any, fallback: string) => {
    const raw = String(err?.message ?? "");
    const match = raw.match(/\{[\s\S]*\}$/);
    if (match) {
      try {
        const body = JSON.parse(match[0]);
        if (typeof body?.message === "string" && body.message.trim()) return body.message;
      } catch {
        /* fall through to the fallback below */
      }
    }
    return fallback;
  };

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${booking.id}/accept-deliverable`),
    onSuccess: async (res) => {
      const body = await res.json().catch(() => ({} as any));
      refresh();
      toast({
        title: "Accepted",
        // D-40: a `records_only` acceptance completes NOTHING, and the toast must not imply it did.
        description: body?.completed
          ? "Thanks — your booking is complete and your expert has been paid out."
          : LIFECYCLE_COPY.recordsOnlyNote,
      });
    },
    onError: async (err: any) => {
      toast({
        title: "Could not accept",
        description: await serverMessage(err, "Please reload and try again."),
        variant: "destructive",
      });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: (note: string) =>
      apiRequest("POST", `/api/bookings/${booking.id}/request-revision`, note.trim() ? { note: note.trim() } : {}),
    onSuccess: () => {
      refresh();
      setReviseOpen(false);
      setReviseNote("");
      toast({ title: "Revision requested", description: "Your expert has your note." });
    },
    onError: async (err: any) => {
      toast({
        title: "Could not request a revision",
        description: await serverMessage(err, "Please reload and try again."),
        variant: "destructive",
      });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: (reason: string) => apiRequest("POST", `/api/bookings/${booking.id}/dispute`, { reason }),
    onSuccess: () => {
      refresh();
      setDisputeOpen(false);
      setDisputeReason("");
      toast({ title: "Raised with our team", description: "We'll review it and follow up with you." });
    },
    onError: async (err: any) => {
      toast({
        title: "Could not raise this",
        description: await serverMessage(err, "Please reload and try again."),
        variant: "destructive",
      });
    },
  });

  // §13: nothing to say about this booking's lifecycle ⇒ nothing is drawn. Not an empty card.
  if (!acceptance && !declaration) return null;

  const deliveredOn = readableDate(acceptance?.deliveredAt);
  const deadlineOn = readableDate(acceptance?.deadline);
  const left = daysRemaining(acceptance?.deadline ?? null);
  const acceptedOn = readableDate(acceptance?.acceptedAt);
  const declaredOn = readableDate(declaration?.declaredAt);
  const disputeByOn = readableDate(declaration?.disputeBy);

  return (
    <div className="mt-2 rounded-lg border border-border p-3 space-y-2" data-testid={`lifecycle-${booking.id}`}>
      {acceptance && (
        <div className="space-y-2" data-testid={`acceptance-${booking.id}`} data-stage={acceptance.stage}>
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
            {LIFECYCLE_COPY.acceptTitle}
          </p>
          <p className="text-[12.5px] text-foreground" data-testid={`acceptance-headline-${booking.id}`}>
            {acceptance.headline}
          </p>

          {/* §13: the delivery date is rendered only when the server holds one. */}
          {deliveredOn && (
            <p className="text-xs text-muted-foreground" data-testid={`acceptance-delivered-${booking.id}`}>
              Delivered on {deliveredOn}
              {/* D-26: "the file made for you" and "the file this listing ships to everyone" are
                  different facts, so the fallback is named rather than served silently. */}
              {!acceptance.hasBookingDeliverable && ` — ${LIFECYCLE_COPY.listingFileNote}`}
            </p>
          )}

          {/* The window: the SERVER's derived deadline, or the honest reason there is none. */}
          {acceptance.noClockReason ? (
            <p className="text-xs text-muted-foreground" data-testid={`acceptance-no-clock-${booking.id}`}>
              {acceptance.noClockReason}
            </p>
          ) : deadlineOn && acceptance.stage === "asked" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`acceptance-window-${booking.id}`}>
              <Clock className="w-3 h-3" />
              {left === 0
                ? `Your review window closed on ${deadlineOn}.`
                : `${left} day${left === 1 ? "" : "s"} left to answer — window closes ${deadlineOn}.`}
            </p>
          ) : null}

          {acceptedOn && (
            <p className="flex items-center gap-1 text-xs text-emerald-700" data-testid={`acceptance-accepted-${booking.id}`}>
              <CheckCircle className="w-3 h-3" />
              Accepted on {acceptedOn}
            </p>
          )}

          {/* D-40: accepting a declared hybrid artifact records an answer and moves no money. */}
          {acceptance.mode === "records_only" && acceptance.canAccept && (
            <p className="text-xs text-muted-foreground" data-testid={`acceptance-records-only-${booking.id}`}>
              {LIFECYCLE_COPY.recordsOnlyNote}
            </p>
          )}

          {(acceptance.canAccept || acceptance.canRequestRevision) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {acceptance.canAccept && (
                <Button
                  size="sm"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                  data-testid={`button-accept-deliverable-${booking.id}`}
                >
                  {acceptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 mr-1" />
                  )}
                  {LIFECYCLE_COPY.acceptButton}
                </Button>
              )}
              {acceptance.canRequestRevision && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReviseOpen(true)}
                  disabled={reviseMutation.isPending}
                  data-testid={`button-request-revision-${booking.id}`}
                >
                  <MessageSquareWarning className="w-4 h-4 mr-1" />
                  {LIFECYCLE_COPY.reviseButton}
                  {/* The NUMBER, from the server's live allowance — never a stored count. */}
                  {acceptance.revisionsRemaining !== null && ` (${acceptance.revisionsRemaining} left)`}
                </Button>
              )}
            </div>
          )}

          {/* The traveler's own words, back to them. A revision with no note renders its date alone. */}
          {acceptance.revisions.length > 0 && (
            <div className="pt-1" data-testid={`revisions-${booking.id}`}>
              <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                {LIFECYCLE_COPY.revisionsHeading}
              </p>
              <ul className="mt-1 space-y-1">
                {acceptance.revisions.map((r) => {
                  const askedOn = readableDate(r.requestedAt);
                  const doneOn = readableDate(r.resolvedAt);
                  return (
                    <li key={r.position} className="text-xs text-muted-foreground" data-testid={`revision-${booking.id}-${r.position}`}>
                      <span className="text-foreground">{askedOn ?? `Revision ${r.position}`}</span>
                      {doneOn ? ` · re-delivered ${doneOn}` : " · open"}
                      {r.note ? <span className="block text-foreground">“{r.note}”</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* LD 47 — the seller's declaration, and the window it opened. */}
      {declaration && (
        <div className="space-y-1 border-t border-border pt-2" data-testid={`declaration-${booking.id}`}>
          <p className="text-[12.5px] text-foreground" data-testid={`declaration-headline-${booking.id}`}>
            {declaredOn
              ? `Your provider declared this complete on ${declaredOn}.`
              : "Your provider declared this complete."}
            {/* "Completed" is never said before the window closes (LD 47). */}
            {disputeByOn && ` Your review window closes ${disputeByOn}.`}
          </p>
          {declaration.canDispute && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setDisputeOpen(true)}
              disabled={disputeMutation.isPending}
              data-testid={`button-dispute-declared-${booking.id}`}
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              {LIFECYCLE_COPY.disputeButton}
            </Button>
          )}
        </div>
      )}

      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent data-testid={`dialog-revision-${booking.id}`}>
          <DialogHeader>
            <DialogTitle>{LIFECYCLE_COPY.reviseButton}</DialogTitle>
            <DialogDescription>
              Tell your expert what you'd like changed. This is a revision your listing includes — it isn't a dispute.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reviseNote}
            onChange={(e) => setReviseNote(e.target.value)}
            placeholder="What would you like changed?"
            data-testid={`input-revision-note-${booking.id}`}
          />
          <DialogFooter>
            <Button
              onClick={() => reviseMutation.mutate(reviseNote)}
              disabled={reviseMutation.isPending}
              data-testid={`button-submit-revision-${booking.id}`}
            >
              {reviseMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent data-testid={`dialog-declared-dispute-${booking.id}`}>
          <DialogHeader>
            <DialogTitle>{LIFECYCLE_COPY.disputeButton}</DialogTitle>
            <DialogDescription>
              Tell us what happened. Our team reviews it — nothing is paid out while it's open.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="What went wrong?"
            data-testid={`input-declared-dispute-reason-${booking.id}`}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => disputeMutation.mutate(disputeReason)}
              disabled={disputeMutation.isPending || !disputeReason.trim()}
              data-testid={`button-submit-declared-dispute-${booking.id}`}
            >
              {disputeMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
