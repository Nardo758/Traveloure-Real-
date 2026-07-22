/**
 * My Events — traveler-facing event-coordination engagements (Concierge Phase 1b).
 *
 * The consumer surface for the coordination stack: when a signed-in traveler picks the
 * Full / done-for-you concierge tier, a `coordination_states` row is created (Phase 1a).
 * This page lists those engagements with their status + the server-quoted coordination fee
 * (credit-aware, §7), and lets the traveler PAY the fee via the same Stripe Elements flow
 * the rest of the app uses (POST /pay → Elements → POST /pay/confirm). The fee amount is
 * always server-derived (§14) — the client never sends an amount.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { Crown, Calendar, MapPin, CheckCircle2, Loader2, Sparkles, RefreshCcw } from "lucide-react";

interface Engagement {
  id: string;
  experienceType: string;
  status: string | null;
  path: string | null;
  destination: string | null;
  budget: { amount?: number; currency?: string } | null;
  feePaymentStatus: string;
  feeAmountCents: number | null;
  feeCreditCents: number | null;
  createdAt: string | null;
}

interface FeeQuote {
  feeCents: number;
  currency: string;
  rule: "floor" | "percent";
  optimizeCreditCents: number;
  feePaymentStatus?: string;
  breakdown: { floorCents: number; percentOfBudget: number; appliedPercent: number };
}

const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const titleCase = (s: string) => s.replace(/(^|[_\s-])(\w)/g, (_, __, c) => " " + c.toUpperCase()).trim();

function StatusBadge({ status }: { status: string | null }) {
  const s = status || "intake";
  return <Badge variant="secondary" className="capitalize">{titleCase(s)}</Badge>;
}

function FeeBadge({ feePaymentStatus }: { feePaymentStatus: string }) {
  if (feePaymentStatus === "paid")
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Fee paid</Badge>;
  if (feePaymentStatus === "refunded")
    return <Badge className="bg-gray-100 text-gray-600 border border-gray-200">Fee refunded</Badge>;
  if (feePaymentStatus === "pending")
    return <Badge variant="outline">Payment in progress</Badge>;
  return <Badge variant="outline">Fee due</Badge>;
}

function EngagementCard({ engagement }: { engagement: Engagement }) {
  const { toast } = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pi, setPi] = useState<{ clientSecret: string; paymentIntentId: string; amount: number } | null>(null);

  const isPaid = engagement.feePaymentStatus === "paid";
  const isRefunded = engagement.feePaymentStatus === "refunded";

  const { data: fee, isLoading: feeLoading } = useQuery<FeeQuote>({
    queryKey: [`/api/coordination-states/${engagement.id}/fee`],
    enabled: !isPaid && !isRefunded, // once settled, the stored amount is authoritative — no need to re-quote
  });

  async function startPayment() {
    setStarting(true);
    try {
      const res = await apiRequest("POST", `/api/coordination-states/${engagement.id}/pay`);
      const data = await res.json();
      if (data.alreadyPaid || data.paid) {
        toast({ title: "Coordination fee settled", description: "This engagement is fully paid." });
        queryClient.invalidateQueries({ queryKey: ["/api/coordination-states"] });
        return;
      }
      if (data.alreadyRefunded) {
        toast({ title: "Fee already refunded", description: "This coordination fee was refunded and cannot be charged again.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: ["/api/coordination-states"] });
        return;
      }
      setPi({ clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId, amount: data.feeCents });
      setPayOpen(true);
    } catch (err: any) {
      toast({ title: "Couldn't start payment", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function confirmPayment(paymentIntentId: string) {
    try {
      await apiRequest("POST", `/api/coordination-states/${engagement.id}/pay/confirm`);
      toast({ title: "Coordination fee paid", description: "Your coordinator will take it from here." });
      setPayOpen(false);
      setPi(null);
      queryClient.invalidateQueries({ queryKey: ["/api/coordination-states"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coordination-states/${engagement.id}/fee`] });
    } catch (err: any) {
      toast({ title: "Payment recorded, confirmation failed", description: err?.message || "We'll reconcile it shortly.", variant: "destructive" });
    }
  }

  const isSettled = isPaid || isRefunded;
  const creditCents = isSettled ? (engagement.feeCreditCents ?? 0) : (fee?.optimizeCreditCents ?? 0);
  const dueCents = isSettled ? (engagement.feeAmountCents ?? 0) : (fee?.feeCents ?? 0);

  return (
    <Card data-testid={`card-engagement-${engagement.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            {titleCase(engagement.experienceType)} coordination
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={engagement.status} />
            <FeeBadge feePaymentStatus={engagement.feePaymentStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {engagement.destination && (
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{engagement.destination}</span>
          )}
          {engagement.budget?.amount ? (
            <span className="flex items-center gap-1.5">
              Budget {money((engagement.budget.amount || 0) * 100, engagement.budget.currency || "USD")}
            </span>
          ) : null}
          {engagement.createdAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Started {new Date(engagement.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Fee line */}
        <div className="rounded-lg border border-border p-4">
          {feeLoading && !isSettled ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {isPaid ? "Coordination fee paid" : isRefunded ? "Coordination fee refunded" : "Coordination fee"}
                </span>
                <span className="text-lg font-semibold" data-testid={`text-fee-${engagement.id}`}>
                  {money(dueCents, fee?.currency || "USD")}
                </span>
              </div>
              {creditCents > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Sparkles className="w-3.5 h-3.5" />
                  {money(creditCents)} optimize credit applied
                </div>
              )}
            </div>
          )}
        </div>

        {isPaid ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Paid — your coordinator is handling the rest.
          </div>
        ) : isRefunded ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-refunded-${engagement.id}`}>
            <RefreshCcw className="w-4 h-4" /> This coordination fee was refunded and cannot be charged again.
          </div>
        ) : (
          <Button
            className="w-full"
            disabled={starting || feeLoading}
            onClick={startPayment}
            data-testid={`button-pay-fee-${engagement.id}`}
          >
            {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Pay coordination fee
          </Button>
        )}
      </CardContent>

      <Dialog open={payOpen} onOpenChange={(o) => { if (!o) { setPayOpen(false); setPi(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay coordination fee</DialogTitle>
          </DialogHeader>
          {pi && (
            <StripeCheckout
              paymentIntent={pi}
              bookingIds={[]}
              onSuccess={confirmPayment}
              onError={(msg) => toast({ title: "Payment failed", description: msg, variant: "destructive" })}
              onCancel={() => { setPayOpen(false); setPi(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function MyEvents() {
  const { data: engagements, isLoading } = useQuery<Engagement[]>({
    queryKey: ["/api/coordination-states"],
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Events</h1>
          <p className="text-muted-foreground">
            Your done-for-you event coordination engagements and their fees.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : engagements && engagements.length > 0 ? (
          <div className="space-y-4">
            {engagements.map((e) => (
              <EngagementCard key={e.id} engagement={e} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Crown className="w-6 h-6 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">No events yet</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Planning a wedding, proposal, or milestone event? Our concierge can coordinate
                it end-to-end — vendors, timeline, and RSVPs.
              </p>
              <Link href="/concierge">
                <Button data-testid="button-start-event">Plan an event</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
