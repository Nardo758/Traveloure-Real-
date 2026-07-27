/**
 * Today — the ops home (Backoffice Phase B5, ratified v9 spec, module 1 + retirement strip).
 *
 * "Today references, it never re-renders — every number has exactly one home; Today links
 * into the module pages." Retires the old Dashboard (client/src/pages/expert/dashboard.tsx),
 * which rendered three duplicate booking lists off the same two queries Inbox now owns, plus
 * two DISAGREEING Stripe-Connect sources (a live GET /api/stripe/connect/status banner and a
 * <PayoutBanner/> driven by the stale /api/expert/dashboard `stripeConnectStatus` derived from
 * local_expert_forms). Today uses ONLY the live Connect-status endpoint.
 *
 * Sections and their single owning source:
 *  1. "Needs your response" — COUNTS ONLY, same four queries Inbox (/expert/inbox) uses to
 *     render the actual lists: /api/expert/bookings, /api/expert/assigned-trips,
 *     /api/expert/coordination-engagements, /api/affiliate-booking-requests/expert.
 *  2. Money strip — GET /api/expert/earnings/details `summary` (the /expert/earnings page,
 *     rebuilt in B1, is its detail view).
 *  3. Connect status — GET /api/stripe/connect/status ONLY (never /api/expert/dashboard).
 *  4. Channel snapshot — GET /api/me/earnings-by-source, compact top sources (full breakdown
 *     lives on /expert/performance, which renders EarningsBySourcePanel).
 *  5. Posting opportunities — GET /api/me/posting-opportunities, compact preview (full surface
 *     is /expert/share-promote).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { PageHeader, EmptyState } from "@/components/backoffice/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home,
  Inbox as InboxIcon,
  CalendarDays,
  MapPin,
  ClipboardCheck,
  ExternalLink,
  Wallet,
  Compass,
  Link2,
  Share2,
  Sparkles,
  Star,
} from "lucide-react";

// ─── Section 1: Needs your response (counts only) ───────────────────────────

interface InboxBooking {
  id: string;
  status: string;
}

interface AssignedTrip {
  trip_id: string;
  status: "pending" | "accepted";
}

interface CoordinationEngagement {
  id: string;
  status: string | null;
}

interface AffiliateBookingRequest {
  id: string;
  status: string;
}

function NeedsResponseSection() {
  const { data: bookings, isLoading: bookingsLoading } = useQuery<InboxBooking[]>({
    queryKey: ["/api/expert/bookings"],
  });
  const { data: assignedTrips, isLoading: tripsLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
  });
  const { data: coordinationData, isLoading: coordinationLoading } = useQuery<{
    engagements: CoordinationEngagement[];
  }>({
    queryKey: ["/api/expert/coordination-engagements"],
  });
  const { data: agentRequests, isLoading: agentRequestsLoading } = useQuery<AffiliateBookingRequest[]>({
    queryKey: ["/api/affiliate-booking-requests/expert"],
  });

  const isLoading = bookingsLoading || tripsLoading || coordinationLoading || agentRequestsLoading;

  const pendingBookingsCount = (bookings ?? []).filter((b) => b.status === "pending").length;
  const pendingInvitesCount = (assignedTrips ?? []).filter((t) => t.status === "pending").length;
  const coordinationCount = (coordinationData?.engagements ?? []).length;
  const pendingAgentRequestsCount = (agentRequests ?? []).filter((r) => r.status === "pending").length;

  const rows = [
    { key: "bookings", count: pendingBookingsCount, label: "booking request", icon: CalendarDays },
    { key: "invites", count: pendingInvitesCount, label: "assignment invite", icon: MapPin },
    { key: "coordination", count: coordinationCount, label: "coordination engagement", icon: ClipboardCheck },
    { key: "agent", count: pendingAgentRequestsCount, label: "agent-booking request", icon: ExternalLink },
  ].filter((r) => r.count > 0);

  return (
    <Card className="border border-console-light" data-testid="card-today-needs-response">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <InboxIcon className="w-4 h-4 text-console-mid" />
          Needs your response
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-console-mid" data-testid="text-today-nothing-waiting">
            Nothing waiting on you right now.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 py-2 border-b border-console-light last:border-0 last:pb-0"
                data-testid={`row-today-needs-${row.key}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <row.icon className="w-4 h-4 text-console-mid flex-shrink-0" />
                  <span className="text-sm text-console-darkest">
                    {row.count} {row.label}
                    {row.count === 1 ? "" : "s"}
                  </span>
                </div>
                <Link href="/expert/inbox">
                  <span
                    className="text-xs font-medium text-primary hover:underline flex-shrink-0 cursor-pointer"
                    data-testid={`link-today-open-inbox-${row.key}`}
                  >
                    Open Inbox →
                  </span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 2 + 3: Money strip + Connect status ────────────────────────────

interface EarningsDetails {
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    availableEarnings: number;
    paidOut: number;
  };
}

interface StripeConnectStatus {
  connected: boolean;
  status: string;
}

function MoneyStripSection() {
  const { data, isLoading } = useQuery<EarningsDetails>({
    queryKey: ["/api/expert/earnings/details"],
  });
  const { data: stripeStatus, isLoading: stripeLoading } = useQuery<StripeConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
  });

  const summary = data?.summary;
  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card className="border border-console-light" data-testid="card-today-money">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-4 h-4 text-console-mid" />
            Money
          </CardTitle>
          <Link href="/expert/earnings">
            <span
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
              data-testid="link-today-money"
            >
              Money →
            </span>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
        ) : !summary ? (
          <p className="text-sm text-console-mid">Earnings data isn't available right now.</p>
        ) : (
          <div className="flex flex-wrap gap-6" data-testid="row-today-money-figures">
            <div>
              <p className="text-xs text-console-mid">Cleared</p>
              <p className="text-xl font-bold text-console-darkest" data-testid="text-today-cleared">
                {fmt(summary.availableEarnings)}
              </p>
            </div>
            <div>
              <p className="text-xs text-console-mid">In escrow</p>
              <p className="text-xl font-bold text-console-darkest" data-testid="text-today-escrow">
                {fmt(summary.pendingEarnings)}
              </p>
            </div>
            <div>
              <p className="text-xs text-console-mid">Paid out</p>
              <p className="text-xl font-bold text-console-darkest" data-testid="text-today-paid-out">
                {fmt(summary.paidOut)}
              </p>
            </div>
          </div>
        )}

        {/* Connect status strip — /api/stripe/connect/status ONLY, never /api/expert/dashboard */}
        {stripeLoading ? (
          <Skeleton className="h-9 rounded-lg" />
        ) : !stripeStatus?.connected ? (
          <Link href="/expert/earnings">
            <div
              className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/60 transition-colors"
              data-testid="banner-today-stripe-connect"
            >
              <p className="text-sm text-amber-900">Connect a Stripe account to receive payouts.</p>
              <span className="text-xs font-medium text-amber-700 flex-shrink-0">Set up →</span>
            </div>
          </Link>
        ) : (
          <p className="text-xs text-console-mid" data-testid="text-today-stripe-connected">
            {stripeStatus.status === "complete"
              ? "Stripe account connected and verified."
              : "Stripe account connected — verification in progress."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 4: Channel snapshot ────────────────────────────────────────────

interface SourceBucket {
  source: "direct" | "link" | "cross_sell";
  label: string;
  count: number;
  revenue: number;
}

interface EarningsBySourceResponse {
  buckets: SourceBucket[];
  totals: { count: number; revenue: number };
}

const BUCKET_ICON: Record<string, typeof Link2> = {
  direct: Compass,
  link: Link2,
  cross_sell: Share2,
};

function ChannelSnapshotSection() {
  const { data, isLoading } = useQuery<EarningsBySourceResponse>({
    queryKey: ["/api/me/earnings-by-source"],
  });

  const buckets = [...(data?.buckets ?? [])]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);
  const hasBookings = (data?.totals?.count ?? 0) > 0;

  return (
    <Card className="border border-console-light" data-testid="card-today-channel-snapshot">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Compass className="w-4 h-4 text-console-mid" />
            Channel snapshot
          </CardTitle>
          <Link href="/expert/performance">
            <span
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
              data-testid="link-today-performance"
            >
              Performance →
            </span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : !hasBookings ? (
          <p className="text-sm text-console-mid" data-testid="text-today-no-channel-data">
            No attributed bookings yet — share a booking link to see which channel earns.
          </p>
        ) : (
          <div className="space-y-2">
            {buckets.map((b) => {
              const Icon = BUCKET_ICON[b.source] ?? Compass;
              return (
                <div
                  key={b.source}
                  className="flex items-center justify-between gap-3 text-sm"
                  data-testid={`row-today-source-${b.source}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-console-mid flex-shrink-0" />
                    <span className="text-console-darkest truncate">{b.label}</span>
                  </div>
                  <span className="font-semibold text-console-darkest flex-shrink-0">
                    ${b.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 5: Posting opportunities ───────────────────────────────────────

type PostingOpportunity =
  | {
      kind: "new_review";
      reviewId: string;
      rating: number;
      text: string;
      serviceId: string;
      serviceName: string;
    }
  | {
      kind: "open_slots";
      serviceId: string;
      serviceName: string;
      nextDate: string;
      openSpots: number;
    };

function opportunityText(o: PostingOpportunity): string {
  if (o.kind === "new_review") {
    return `New ${o.rating}★ review on ${o.serviceName}`;
  }
  const spots = o.openSpots === 1 ? "1 spot" : `${o.openSpots} spots`;
  return `${spots} open for ${o.serviceName}`;
}

function PostingOpportunitiesSection() {
  const { data, isLoading } = useQuery<{ opportunities: PostingOpportunity[] }>({
    queryKey: ["/api/me/posting-opportunities"],
  });
  const opportunities = (data?.opportunities ?? []).slice(0, 3);

  if (!isLoading && opportunities.length === 0) {
    // Mandate: omit the section entirely when there is nothing to show.
    return null;
  }

  return (
    <Card className="border border-console-light" data-testid="card-today-posting-opportunities">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-console-mid" />
            Posting opportunities
          </CardTitle>
          <Link href="/expert/share-promote">
            <span
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
              data-testid="link-today-share-promote"
            >
              Share & Promote →
            </span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map((o) => {
              const key = o.kind === "new_review" ? `review-${o.reviewId}` : `slots-${o.serviceId}`;
              const Icon = o.kind === "new_review" ? Star : Sparkles;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 text-sm text-console-darkest"
                  data-testid={`row-today-opportunity-${key}`}
                >
                  <Icon className="w-3.5 h-3.5 text-console-mid flex-shrink-0" />
                  <span className="truncate">{opportunityText(o)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ExpertToday() {
  const todaySubtitle = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <ExpertLayout title="Today">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <PageHeader title="Today" subtitle={todaySubtitle} icon={Home} testId="text-today-title" />

        <NeedsResponseSection />
        <MoneyStripSection />
        <ChannelSnapshotSection />
        <PostingOpportunitiesSection />
      </div>
    </ExpertLayout>
  );
}
