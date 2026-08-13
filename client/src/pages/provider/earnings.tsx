import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  Calendar,
  Download,
  ArrowUpRight,
  Loader2,
  PieChart,
  Shield,
  Link2,
  MousePointerClick,
  Copy,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { ServiceBooking, ProviderService } from "@shared/schema";
import { StripeConnectCard } from "@/components/stripe-connect-card";
import { EarningsBySourcePanel } from "@/components/backoffice/earnings-by-source-panel";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StatCard, StatusBadge, EmptyState } from "@/components/backoffice/primitives";
// Ledger 90 (FP-5, M1): the ONE money-bearing status predicate, shared with the server
// aggregations (short-links.routes.ts) and the other console tabs. Every number on this page that
// carries an earnings/revenue label derives from it — see the `useMemo`s below.
import { isEarningBooking, isProvisionalBooking } from "@shared/booking-visibility";

type BookingWithService = ServiceBooking & { service?: ProviderService };

// Task #142: real escrow ledger + payout history, additive to the existing booking-derived stats
// above (left untouched — those are a separate, real computation from live bookings, not fabricated,
// and out of scope here). These two shapes render ONLY fields the API actually returns (§13 — never
// invented) and use an honest empty state when there's nothing yet.
interface ProviderPayoutRow {
  id: string;
  amount: string;
  status: string; // pending | processing | completed | failed
  requestedAt: string;
}

interface ProviderEarningsSummary {
  total: number;
  pending: number; // held in escrow, not yet releasable
  available: number; // releasable — payable now
  paidOut: number;
  // Ledger 90 (FP-5, S2): the effective payout threshold, resolved SERVER-side by the same helper
  // POST /api/payouts/request gates on — max(platform floor, this provider's Settings minimum).
  // Optional so an older/other payload simply falls back to the platform floor below.
  payoutMinimum?: {
    platformFloorCents: number;
    effectiveCents: number;
    source: "platform_floor" | "provider_setting";
  };
}

// "Link performance" card (§06a mockup). Reads the S5/S6 short-link rails
// (server/routes/short-links.routes.ts) — real data only (§13), never a fabricated trend: clicks
// are a lifetime counter with no per-day log, so there is deliberately no click-over-time chart here.
interface LinkAnalyticsRow {
  code: string;
  targetType: "storefront" | "service" | "template" | "ready_made";
  targetId: string | null;
  clicks: number;
  bookings: number;
  revenue: number;
}

interface LinkAnalyticsResponse {
  range: { days: number; since: string };
  clicksAreLifetime: boolean;
  links: LinkAnalyticsRow[];
  totals: {
    totalClicks: number;
    totalBookings: number;
    totalRevenue: number;
    conversionRate: number | null;
  };
}

interface SourceSplitBucket {
  source: "direct" | "link" | "cross_sell";
  label: string;
  count: number;
  revenue: number;
}

interface EarningsBySourceResponse {
  buckets: SourceSplitBucket[];
  totals: { count: number; revenue: number };
  preAttributionCaveat: boolean;
}

// Statements (mockup §06e). Reads server/routes/statements.routes.ts — months with real ledger
// activity only (§13: a quiet month is simply absent from this list, never a zeroed row).
interface StatementMonth {
  month: string; // "2026-07"
  bookings: number;
  gross: number;
  net: number;
}

const LINK_TARGET_LABEL: Record<LinkAnalyticsRow["targetType"], string> = {
  storefront: "Your storefront",
  service: "Service",
  template: "Itinerary template",
  ready_made: "Ready Made Trip",
};

const SOURCE_BAR_COLOR: Record<SourceSplitBucket["source"], string> = {
  direct: "bg-console-mid",
  link: "bg-primary",
  cross_sell: "bg-blue-500",
};

function LinkPerformanceCard() {
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // days=365 is the widest range the rail offers (RANGE_DAYS in short-links.routes.ts) — the
  // closest honest approximation of "lifetime" for bookings/revenue, which — unlike clicks — are
  // NOT true lifetime counters server-side.
  const linkAnalyticsQuery = useQuery<LinkAnalyticsResponse>({
    queryKey: ["/api/me/link-analytics", { days: 365 }],
  });
  const sourceQuery = useQuery<EarningsBySourceResponse>({
    queryKey: ["/api/me/earnings-by-source"],
  });
  const servicesQuery = useQuery<ProviderService[]>({
    queryKey: ["/api/provider/services"],
  });

  // Endpoint error -> render nothing. An honest absence beats a broken/half-populated card.
  if (linkAnalyticsQuery.isError) return null;

  const links = linkAnalyticsQuery.data?.links ?? [];
  const totals = linkAnalyticsQuery.data?.totals;
  const hasLinks = links.length > 0;

  const serviceNameById = new Map((servicesQuery.data ?? []).map((s) => [s.id, s.serviceName]));
  function targetName(row: LinkAnalyticsRow): string {
    if (row.targetType === "service" && row.targetId) {
      return serviceNameById.get(row.targetId) ?? "Service";
    }
    return LINK_TARGET_LABEL[row.targetType];
  }

  async function copyLink(code: string) {
    const url = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      toast({ title: "Copied", description: "Share link copied to your clipboard." });
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Please copy the link manually.", variant: "destructive" });
    }
  }

  const sourceBuckets = sourceQuery.data?.buckets ?? [];
  const sourceTotalRevenue = sourceQuery.data?.totals?.revenue ?? 0;

  return (
    <Card className="border border-console-light" data-testid="card-link-performance">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          Link Performance
        </CardTitle>
        <CardDescription data-testid="text-link-performance-caveat">
          Stats count tracked share links only — a raw URL texted or pasted outside Traveloure isn't
          visible to this dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasLinks ? (
          <EmptyState
            icon={Link2}
            title="Share a service from your Catalog to start tracking clicks and bookings"
            cta={
              <Button size="sm" variant="outline" asChild data-testid="button-empty-link-performance">
                <Link href="/provider/services">Go to Catalog</Link>
              </Button>
            }
            testId="empty-link-performance"
          />
        ) : (
          <div className="space-y-6">
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Clicks"
                  value={(totals?.totalClicks ?? 0).toLocaleString()}
                  icon={MousePointerClick}
                  testId="stat-link-clicks"
                />
                <StatCard
                  label="Bookings via links"
                  value={(totals?.totalBookings ?? 0).toLocaleString()}
                  icon={CheckCircle}
                  iconClassName="bg-green-100 text-green-600"
                  testId="stat-link-bookings"
                />
                <StatCard
                  label="Revenue via links"
                  value={`$${(totals?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={DollarSign}
                  iconClassName="bg-console-bg text-console-darkest"
                  testId="stat-link-revenue"
                />
              </div>
              <p className="text-xs text-console-mid mt-2">Lifetime totals.</p>
            </div>

            <div className="space-y-2">
              {links.map((row) => (
                <div
                  key={row.code}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-console-light bg-console-bg"
                  data-testid={`row-link-${row.code}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-console-darkest truncate">{targetName(row)}</p>
                    <p className="text-xs text-console-mid truncate">{`${window.location.origin}/r/${row.code}`}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-shrink-0">
                    <div className="text-center">
                      <p className="font-semibold text-console-darkest">{row.clicks.toLocaleString()}</p>
                      <p className="text-xs text-console-mid">clicks</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-console-darkest">{row.bookings.toLocaleString()}</p>
                      <p className="text-xs text-console-mid">bookings</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-console-darkest">
                        ${row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-console-mid">revenue</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(row.code)}
                      data-testid={`button-copy-link-${row.code}`}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      {copiedCode === row.code ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {sourceBuckets.length > 0 && sourceTotalRevenue > 0 && (
              <div>
                <p className="text-sm font-medium text-console-darkest mb-2">Revenue by source</p>
                <div className="h-3 rounded-full overflow-hidden flex bg-console-bg" data-testid="bar-link-source-split">
                  {sourceBuckets.map((b) => {
                    const pct = (b.revenue / sourceTotalRevenue) * 100;
                    return <div key={b.source} className={SOURCE_BAR_COLOR[b.source]} style={{ width: `${pct}%` }} />;
                  })}
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-console-mid mt-1">
                  {sourceBuckets.map((b) => {
                    const pct = Math.round((b.revenue / sourceTotalRevenue) * 100);
                    return (
                      <span key={b.source} data-testid={`text-link-source-${b.source}`}>
                        {b.label} {pct}%
                      </span>
                    );
                  })}
                </div>
                {sourceQuery.data?.preAttributionCaveat && (
                  <p className="text-xs text-console-mid mt-2" data-testid="text-link-split-caveat">
                    This split isn't retroactive — bookings made before link tracking launched are
                    counted as Direct by default, not because they were confirmed direct.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (isNaN(d.getTime())) return month;
  return d.toLocaleString("default", { month: "long", year: "numeric" });
}

function StatementsCard() {
  // Endpoint 404 (pending mount, or a real "not applicable" 404) -> render nothing (§13 — an honest
  // absence beats a broken card). A 200-HTML unmounted-router response (§9 signature) fails res.json()
  // parsing the same way a real error does, so isError covers both cases uniformly.
  const statementsQuery = useQuery<StatementMonth[]>({
    queryKey: ["/api/me/statements"],
  });

  if (statementsQuery.isError) return null;

  const months = statementsQuery.data ?? [];

  return (
    <Card className="border border-console-light" data-testid="card-statements">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          Statements
        </CardTitle>
        <CardDescription>Download a CSV of every earning and payout event for a given month.</CardDescription>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <EmptyState
            icon={Download}
            title="Statements appear after your first booking month"
            testId="empty-statements"
          />
        ) : (
          <div className="space-y-2">
            {months.map((row) => (
              <div
                key={row.month}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-console-light bg-console-bg"
                data-testid={`row-statement-${row.month}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-console-darkest">{monthLabel(row.month)}</p>
                  <p className="text-xs text-console-mid">
                    {row.bookings} {row.bookings === 1 ? "booking" : "bookings"}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm flex-shrink-0">
                  <div className="text-center">
                    <p className="font-semibold text-console-darkest">
                      ${row.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-console-mid">gross</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-console-darkest">
                      ${row.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-console-mid">net</p>
                  </div>
                  <Button size="sm" variant="outline" asChild data-testid={`button-statement-csv-${row.month}`}>
                    <a href={`/api/me/statements/${row.month}.csv`} download={`statement-${row.month}.csv`}>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      CSV
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProviderEarnings() {
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);
  const { data: bookings, isLoading } = useQuery<BookingWithService[]>({
    queryKey: ["/api/provider/bookings"],
  });

  // Task #142: payout history from the new dedicated endpoint, and the real escrow-ledger
  // breakdown from the existing (already-live) summary endpoint — neither invents numbers.
  const { data: payouts } = useQuery<ProviderPayoutRow[]>({
    queryKey: ["/api/payouts"],
  });
  const { data: earningsSummary } = useQuery<ProviderEarningsSummary>({
    queryKey: ["/api/provider/earnings/summary"],
  });

  // Self-service payout REQUEST. The amount is server-derived from the cleared
  // (releasable) balance — this button only submits the request; the actual amount +
  // Stripe transfer happen server-side under admin processing. The client `available`
  // below is a display hint; the server is authoritative.
  const payoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payouts/request"),
    onSuccess: () => {
      setRequested(true);
      toast({ title: "Payout requested", description: "It's pending review — you'll be paid to your connected account once approved." });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.includes("payout_request_pending")) {
        setRequested(true);
        toast({ title: "Request already pending", description: "You already have a payout request under review." });
      } else if (msg.includes("stripe_not_connected")) {
        toast({ title: "Stripe account required", description: "Connect your Stripe account before requesting a payout. Finish setup in Settings.", variant: "destructive" });
      } else if (msg.includes("below_minimum")) {
        // Ledger 90 (FP-5, S2): no client-side "$10.00" literal — the server states the effective
        // threshold (and whether it is the platform floor or this provider's own Settings value).
        toast({ title: "Below minimum", description: "Your available balance is under your payout minimum. See Settings for the amount you set.", variant: "destructive" });
      } else if (msg.includes("no_balance")) {
        toast({ title: "No available balance", description: "You have no cleared earnings to withdraw yet.", variant: "destructive" });
      } else {
        toast({ title: "Could not submit request", description: "Please try again or contact support.", variant: "destructive" });
      }
    },
  });

  const stats = useMemo(() => {
    if (!bookings) return { total: 0, thisMonth: 0, pending: 0, available: 0 };

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    let total = 0;
    let monthly = 0;
    let pending = 0;
    let available = 0;

    bookings.forEach((b) => {
      // Ledger 90 (FP-5, M1): a row that is not money-bearing contributes to NOTHING here.
      // The `pending` bucket previously counted `status === "pending"` — the legacy rail's
      // birth state, where nothing has been charged — alongside the genuinely-paid `confirmed`.
      if (!isEarningBooking(b.status)) return;
      const earnings = parseFloat(b.providerEarnings || "0");
      const bookingDate = b.createdAt ? new Date(b.createdAt) : new Date();

      if (b.status === "completed") {
        total += earnings;
        available += earnings;
        if (bookingDate.getMonth() === thisMonth && bookingDate.getFullYear() === thisYear) {
          monthly += earnings;
        }
      } else {
        // Paid, not yet delivered/completed — real money, not yet releasable.
        pending += earnings;
      }
    });

    return { total, thisMonth: monthly, pending, available };
  }, [bookings]);

  // Ledger 90 (FP-5, M1): unauthorized §15b claims are DISCLOSED, never banked. Customers wrote
  // this idiom first ("1 booking (1 pending payment)"); Money adopts it rather than inventing a
  // second wording, so the page can carry the row without any tile pretending it is earnings.
  const provisionalClaims = useMemo(
    () => (bookings ?? []).filter((b) => isProvisionalBooking(b.status)),
    [bookings],
  );

  const transactions = useMemo(() => {
    if (!bookings) return [];
    return bookings
      .filter((b) => isEarningBooking(b.status))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map((b) => ({
        id: b.id,
        type: "payment" as const,
        description: b.service?.serviceName || "Service Booking",
        date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
        amount: `+$${parseFloat(b.providerEarnings || "0").toFixed(2)}`,
        status: b.status === "completed" ? "completed" : "pending",
      }));
  }, [bookings]);

  const monthlyEarnings = useMemo(() => {
    if (!bookings) return [];
    
    const monthData: { key: string; label: string; amount: number }[] = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('default', { month: 'short' });
      monthData.push({ key, label, amount: 0 });
    }
    
    bookings.forEach((b) => {
      // completed-only by design (this is the realised-earnings series); the shared predicate
      // is still the gate, so a status added later can never slip in unfiltered.
      if (isEarningBooking(b.status) && b.status === "completed" && b.createdAt) {
        const date = new Date(b.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthEntry = monthData.find(m => m.key === key);
        if (monthEntry) {
          monthEntry.amount += parseFloat(b.providerEarnings || "0");
        }
      }
    });
    
    return monthData.map(({ label, amount }) => ({ month: label, amount }));
  }, [bookings]);

  const maxEarning = Math.max(...monthlyEarnings.map(m => m.amount), 1);

  // Ledger 90 (FP-5, S2). The gate below was `stats.available < 10` — a client literal that
  // duplicated the server's floor and ignored the provider's own "Minimum Payout Amount" setting
  // entirely. Both numbers now come from ONE server-derived field; when the payload has not
  // arrived yet the button stays disabled rather than promising a payout the server would refuse.
  const platformFloorCents = earningsSummary?.payoutMinimum?.platformFloorCents ?? null;
  const effectiveMinimumCents = earningsSummary?.payoutMinimum?.effectiveCents ?? null;
  const payoutMinimumDollars = (effectiveMinimumCents ?? 0) / 100;
  const platformFloorDollars = (platformFloorCents ?? 0) / 100;
  const payoutMinimumIsOwnSetting = earningsSummary?.payoutMinimum?.source === "provider_setting";
  const meetsPayoutMinimum =
    effectiveMinimumCents !== null && Math.round(stats.available * 100) >= effectiveMinimumCents;

  const revenueBreakdown = useMemo(() => {
    // §8/§13: no client-side rate literal, no fabricated split. With zero gross there is no
    // real split to show — effectiveRate is null and the UI renders an honest empty state.
    // With gross > 0 the rate is derived from this provider's real booking rows (share/gross).
    //
    // Ledger 90 (FP-5, M1): this loop carried NO status filter at all, so a never-charged §15b
    // claim rendered as "Gross Booking Value $95.00 … Your Share $83.60 — Your lifetime earnings"
    // beside a ledger reading $0.00. The rate was always honest (share/gross, no literal); the
    // AMOUNT was the lie. Money-bearing rows only, same predicate as the server aggregations.
    if (!bookings) return { gross: 0, platformFee: 0, basePlatformFee: 0, insuranceFee: 0, providerShare: 0, effectiveRate: null as number | null };
    let gross = 0, fee = 0, share = 0, insurance = 0;
    for (const b of bookings) {
      if (!isEarningBooking(b.status)) continue;
      gross += Number(b.totalAmount ?? 0);
      fee += Number(b.platformFee ?? 0);
      share += Number(b.providerEarnings ?? 0);
      insurance += Number((b as any).insuranceFee ?? 0);
    }
    const effectiveRate: number | null = gross > 0 ? share / gross : null;
    const basePlatformFee = Math.round((fee - insurance) * 100) / 100;
    return { gross, platformFee: fee, basePlatformFee, insuranceFee: insurance, providerShare: share, effectiveRate };
  }, [bookings]);

  if (isLoading) {
    return (
      <ProviderLayout title="Money">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </ProviderLayout>
    );
  }

  const statsData = [
    { label: "Total Earnings", value: `$${stats.total.toFixed(2)}`, icon: DollarSign, color: "text-green-600" },
    { label: "This Month", value: `$${stats.thisMonth.toFixed(2)}`, icon: TrendingUp, color: "text-blue-600" },
    { label: "Pending", value: `$${stats.pending.toFixed(2)}`, icon: Clock, color: "text-amber-600" },
    { label: "Available", value: `$${stats.available.toFixed(2)}`, icon: CheckCircle, color: "text-green-600" },
  ];

  return (
    <ProviderLayout title="Money">
      <div className="p-6 space-y-6">
        <StripeConnectCard />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-console-mid">{stat.label}</p>
                    <p className="text-2xl font-bold text-console-darkest">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ledger 90 (FP-5, M1): the honest home for an unauthorized §15b claim. Every tile above
            and every panel below excludes it from the money; this band is where the provider is
            TOLD it exists, in the same words Customers uses, so "did I make a sale?" has one
            answer on this page instead of five. Rendered only when such a row exists (§13). */}
        {provisionalClaims.length > 0 && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            data-testid="banner-awaiting-payment"
          >
            <span className="font-medium">
              {provisionalClaims.length} booking{provisionalClaims.length === 1 ? "" : "s"} awaiting the traveler's payment
            </span>{" "}
            — not counted in any figure on this page. Nothing is owed to you until payment
            completes, and nothing for you to do until it does.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Monthly Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyEarnings.length > 0 ? (
                <div className="space-y-3">
                  {monthlyEarnings.map((month) => (
                    <div key={month.month} className="space-y-1" data-testid={`chart-bar-${month.month.toLowerCase()}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-console-dark">{month.month}</span>
                        <span className="font-medium text-console-darkest">${month.amount.toFixed(2)}</span>
                      </div>
                      <div className="h-3 bg-console-bg rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(month.amount / maxEarning) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-console-mid text-center py-8">No earnings data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Payout Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800" data-testid="card-available-balance">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-400">Available Balance</p>
                    <p className="text-xl font-bold text-green-800 dark:text-green-300">${stats.available.toFixed(2)}</p>
                  </div>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={payoutMutation.isPending || requested || !meetsPayoutMinimum}
                onClick={() => payoutMutation.mutate()}
                data-testid="button-request-payout"
              >
                {payoutMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Requesting…</>
                ) : requested ? (
                  "Payout requested — pending review"
                ) : (
                  <><ArrowUpRight className="w-4 h-4 mr-2" /> Request Payout</>
                )}
              </Button>
              {/* Ledger 90 (FP-5, S2): the EFFECTIVE threshold, server-derived — never a hardcoded
                  "$10.00" that the server may not be the one enforcing. When the provider's own
                  Settings minimum is the binding one, say so and link to where they set it, so a
                  provider who batches at $250 learns why the button is off. */}
              {!meetsPayoutMinimum && !requested && (
                <p className="text-xs text-muted-foreground text-center" data-testid="text-payout-minimum">
                  Minimum payout is ${payoutMinimumDollars.toFixed(2)}.
                  {payoutMinimumIsOwnSetting && (
                    <>
                      {" "}Your own minimum, set in{" "}
                      <Link href="/provider/settings" className="underline" data-testid="link-payout-minimum-setting">
                        Settings
                      </Link>
                      . The platform floor is ${platformFloorDollars.toFixed(2)}.
                    </>
                  )}
                </p>
              )}

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800" data-testid="card-pending-balance">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">Pending Earnings</p>
                    <p className="text-xl font-bold text-amber-800 dark:text-amber-300">${stats.pending.toFixed(2)}</p>
                  </div>
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">Clears after service completion</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Share Breakdown */}
        <Card data-testid="card-revenue-share">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="w-5 h-5 text-primary" />
              Revenue Share Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-console-bg rounded-lg border border-console-light text-center" data-testid="stat-gross-total">
                <p className="text-sm text-console-mid mb-1">Gross Booking Value</p>
                <p className="text-xl font-bold text-console-darkest">
                  ${revenueBreakdown.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-console-mid mt-1">Total from all bookings</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800 text-center" data-testid="stat-platform-fee">
                <p className="text-sm text-red-600 mb-1">Platform Fee{revenueBreakdown.effectiveRate != null ? ` (${Math.round((1 - revenueBreakdown.effectiveRate) * 100)}%)` : ""}</p>
                <p className="text-xl font-bold text-red-700">
                  -${revenueBreakdown.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-red-400 mt-1">Traveloure service charge</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center" data-testid="stat-your-share">
                <p className="text-sm text-green-600 mb-1">Your Share{revenueBreakdown.effectiveRate != null ? ` (${Math.round(revenueBreakdown.effectiveRate * 100)}%)` : ""}</p>
                <p className="text-xl font-bold text-green-700">
                  ${revenueBreakdown.providerShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-green-500 mt-1">Your lifetime earnings</p>
              </div>
            </div>

            {/* Fee breakdown line items */}
            <div className="mt-4 rounded-lg border border-border bg-muted/30 divide-y divide-border" data-testid="section-fee-breakdown">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-sm text-muted-foreground">Base commission</span>
                </div>
                <span className="text-sm font-medium text-red-600" data-testid="text-base-commission">
                  -${Math.max(0, revenueBreakdown.basePlatformFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {revenueBreakdown.insuranceFee > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5" data-testid="row-insurance-fee">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Insurance fee</span>
                  </div>
                  <span className="text-sm font-medium text-blue-600">
                    -${revenueBreakdown.insuranceFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 dark:bg-green-950/20 rounded-b-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">Your net earnings</span>
                </div>
                <span className="text-sm font-bold text-green-600" data-testid="text-net-earnings">
                  ${revenueBreakdown.providerShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {revenueBreakdown.effectiveRate != null ? (
              <>
                <div className="mt-3 h-3 bg-console-bg rounded-full overflow-hidden flex" data-testid="bar-revenue-split">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((1 - revenueBreakdown.effectiveRate) * 100)}%` }}
                  />
                  <div className="h-full bg-green-500 flex-1" />
                </div>
                <div className="flex justify-between text-xs text-console-mid mt-1">
                  <span>Platform {Math.round((1 - revenueBreakdown.effectiveRate) * 100)}%</span>
                  <span>You {Math.round(revenueBreakdown.effectiveRate * 100)}%</span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-console-mid text-center" data-testid="text-revenue-split-empty">
                No bookings yet — your split appears here after your first booking.
              </p>
            )}
          </CardContent>
        </Card>

        <EarningsBySourcePanel />

        <LinkPerformanceCard />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between py-3 border-b border-console-light last:border-0"
                    data-testid={`row-transaction-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                        <ArrowUpRight className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-console-darkest">{tx.description}</p>
                        <p className="text-sm text-console-mid">{tx.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{tx.amount}</p>
                      <Badge 
                        className={tx.status === "completed" 
                          ? "bg-green-100 text-green-700 border-green-200" 
                          : "bg-amber-100 text-amber-700 border-amber-200"
                        }
                      >
                        {tx.status === "completed" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-console-mid">
                <DollarSign className="w-12 h-12 mx-auto text-console-light mb-3" />
                <p>No transactions yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task #142: real escrow-ledger breakdown + payout history — additive, honest (§13), and
            distinct from the booking-derived "Available"/"Pending" cards above (those are a real but
            approximate read on live bookings; this section is the actual provider_earnings ledger). */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-console-light">
            <CardHeader>
              <CardTitle className="text-lg">Earnings Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Available to pay out"
                  value={`$${(earningsSummary?.available ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={CheckCircle}
                  iconClassName="bg-green-100 text-green-600"
                  testId="card-ledger-available"
                />
                <StatCard
                  label="Held in escrow"
                  value={`$${(earningsSummary?.pending ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={Clock}
                  iconClassName="bg-amber-100 text-amber-600"
                  testId="card-ledger-held"
                />
                <StatCard
                  label="Paid out"
                  value={`$${(earningsSummary?.paidOut ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={CheckCircle}
                  iconClassName="bg-blue-100 text-blue-600"
                  testId="card-ledger-paid-out"
                />
                <StatCard
                  label="Total earned"
                  value={`$${(earningsSummary?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={DollarSign}
                  iconClassName="bg-console-bg text-console-darkest"
                  testId="card-ledger-total"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-console-light">
            <CardHeader>
              <CardTitle className="text-lg">Payout History</CardTitle>
            </CardHeader>
            <CardContent>
              {payouts && payouts.length > 0 ? (
                <div className="space-y-3">
                  {payouts.map((payout) => (
                    <div
                      key={payout.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                      data-testid={`payout-${payout.id}`}
                    >
                      <div>
                        <p className="font-medium text-console-darkest">
                          ${parseFloat(payout.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-console-mid">{new Date(payout.requestedAt).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={payout.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No payout requests yet" body="Request a payout from your available balance above." testId="empty-payouts" />
              )}
            </CardContent>
          </Card>
        </div>

        <StatementsCard />
      </div>
    </ProviderLayout>
  );
}
