import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck,
  Calendar,
  DollarSign,
  Star,
  MessageSquare,
  TrendingUp,
  Clock,
  Users,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  Loader2,
  AlertCircle,
  Plane,
} from "lucide-react";
import { Link } from "wouter";
import { PayoutBanner } from "@/components/expert/PayoutBanner";
import { SetupChecklistCard } from "@/components/backoffice/SetupChecklistCard";
import { useAuth } from "@/hooks/use-auth";
// Ledger 90 (FP-5, X1): the ONE booking-visibility predicate shared with Inbox, Customers, Money
// and the server aggregations — see shared/booking-visibility.ts.
import {
  isActionableBooking,
  isProvisionalBooking,
  PROVISIONAL_BOOKING_LABEL,
  PROVISIONAL_BOOKING_HINT,
} from "@shared/booking-visibility";

interface ProviderAnalytics {
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    pendingBookings: number;
    completedBookings: number;
  };
}

interface BookingRequest {
  id: string;
  status: string;
  totalAmount: string;
  bookingDetails: any;
  traveler?: { displayName: string };
  service?: { serviceName: string; serviceType: string };
  referredBy?: string;
  createdAt: string;
}

// Minimal shape of GET /api/me/business-setup — same endpoint SetupChecklistCard queries
// (react-query dedups the shared key, so this doesn't add a network round-trip). Used only
// to drive the compact/expanded toggle around that card without duplicating its rendering.
interface BusinessSetupSummary {
  eligible: boolean;
  steps?: {
    handle: { done: boolean };
    payouts: { done: boolean };
    firstOffering: { done: boolean };
    approvedOffering: { done: boolean };
    availability: { done: boolean; applicable?: boolean };
    verification: { done: boolean; requiredForStorefront?: boolean };
  };
}

// Must match SetupChecklistCard's own dismiss-key format exactly — read-only here, this
// page never writes it (the card's own "X" button is the sole writer).
const SETUP_DISMISS_KEY_PREFIX = "traveloure_setup_dismissed_";

// Vacation mode (mockup §06b, provider back-office wave, decision-maker ratified Aug 9 2026).
// Read-only here — GET /api/me/vacation, the same server-derived `active` the Settings card
// and storefront/advisor/checkout enforcement points all read. Business-level flag only.
interface VacationStatus {
  vacationUntil: string | null;
  vacationMessage: string | null;
  active: boolean;
}

// Trending rail (mockup §12) — reads the SAME payload the Demand tab reads
// (GET /api/me/demand-signals, server/routes/demand.routes.ts). Every field mirrors
// client/src/pages/provider/performance.tsx's Demand tab shapes exactly (§13: one server
// contract, no second reading of it).
interface DemandSignalRow {
  kind: string;
  label: string;
  count: number;
  detail?: string;
}
interface CrowdMonthRow {
  month: number;
  monthLabel: string;
  crowdLevel: string | null;
  rating: string | null;
}
interface UpcomingEventRow {
  id: string;
  title: string;
  eventType: string | null;
  startMonth: number | null;
  endMonth: number | null;
  specificDate: string | null;
}
interface DemandSignalsResponse {
  market: string | null;
  lowSignal: boolean;
  signals: DemandSignalRow[];
  crowd: CrowdMonthRow[] | null;
  events: UpcomingEventRow[] | null;
}

interface TrendingItem {
  key: string;
  label: string;
  sourceLine: string;
  badge?: string;
}

/** Up to 6 items: real demand signals first (each with its own count/source), then the nearest
 *  crowd-level headline, then the next upcoming event — same priority order the mockup specifies.
 *  §13: never pads with invented items; a thin market just renders fewer. */
function buildTrendingItems(data: DemandSignalsResponse): TrendingItem[] {
  const items: TrendingItem[] = [];

  for (const s of data.signals) {
    items.push({
      key: `signal-${s.kind}`,
      label: s.label,
      sourceLine: `demand_signal_events · ${s.kind}`,
      badge: String(s.count),
    });
  }

  if (data.crowd && data.crowd.length > 0) {
    const currentMonth = new Date().getMonth() + 1;
    const nearest = [...data.crowd].sort((a, b) => {
      const da = ((a.month - currentMonth) % 12 + 12) % 12;
      const db = ((b.month - currentMonth) % 12 + 12) % 12;
      return da - db;
    })[0];
    if (nearest?.crowdLevel) {
      items.push({
        key: "crowd-headline",
        label: `${nearest.monthLabel}: ${nearest.crowdLevel} crowds expected`,
        sourceLine: "TravelPulse seasonality",
      });
    }
  }

  if (data.events && data.events.length > 0) {
    const next = data.events[0];
    items.push({ key: `event-${next.id}`, label: next.title, sourceLine: "destination calendar" });
  }

  return items.slice(0, 6);
}

// 3.4 Item 2.1 — the Today card's demand signal (server-chosen; mirrors the server TopDemandSignal).
interface TopDemandSignal {
  shape: "service" | "stay";
  marketSlug: string;
  marketName: string;
  amount?: number;   // service-shaped $ (R19 — never on a stay)
  count?: number;
  trips?: number;    // stay-shaped (R19 — NO $)
  nights?: number;
  lowN?: boolean;    // R29: early-signal (thin sample) — the card says so, never a silent full figure
}

/** R29 — "early signal" pill for a floor-cleared-but-thin (low-n) demand figure. States the thinness
 *  beside the value so a 3-sample figure never reads as a full one (§13). */
function EarlySignalPill() {
  return (
    <span
      data-testid="early-signal-pill"
      className="ml-1.5 align-middle rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-800"
    >
      early signal
    </span>
  );
}

/** ONE card for today's single highest-value demand opportunity (3.4 Item 2.1). Never a feed —
 *  the server picks the one signal. Gold edge; deep-links to Market Research (the closing station,
 *  where the market's demand + create/fill actions live). R19: a service signal shows $, a stay
 *  signal shows trips/nights and NEVER a dollar figure. Renders nothing when there is no signal. */
function TodayDemandCard({ signal }: { signal: TopDemandSignal | null | undefined }) {
  if (!signal) return null;
  const money =
    signal.amount != null
      ? signal.amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      : null;
  return (
    <Link href="/provider/market-research">
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-console-light border-l-4 border-l-amber-400 bg-amber-50/40 px-4 py-3 cursor-pointer hover:bg-amber-50 transition-colors"
        data-testid="card-today-demand"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            {signal.shape === "service" ? (
              <>
                <p className="text-[13px] font-bold text-console-darkest" data-testid="text-today-demand-headline">
                  {money} in requested {signal.marketName} experiences with no open slot
                  {signal.lowN && <EarlySignalPill />}
                </p>
                <p className="text-[11.5px] text-console-mid mt-0.5">
                  {signal.count ?? 0} planned {signal.count === 1 ? "experience" : "experiences"} · your highest-value opening today
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold text-console-darkest" data-testid="text-today-demand-headline">
                  {signal.trips ?? 0} {signal.trips === 1 ? "trip" : "trips"} seeking a {signal.marketName} stay
                  {signal.lowN && <EarlySignalPill />}
                </p>
                <p className="text-[11.5px] text-console-mid mt-0.5">
                  {signal.nights ?? 0} {signal.nights === 1 ? "night" : "nights"} requested · no on-platform stay yet
                </p>
              </>
            )}
          </div>
        </div>
        <span className="text-[12px] font-semibold text-amber-700 whitespace-nowrap flex items-center gap-0.5">
          See demand <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

export default function ProviderDashboard() {
  const { user } = useAuth();

  const { data: stripeStatus } = useQuery<{ connected: boolean; status: string }>({
    queryKey: ["/api/stripe/connect/status"],
  });

  // Refresh every 30 s so booking counts and revenue update without a reload.
  const { data: analytics, isLoading: analyticsLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
    refetchInterval: 30_000,
  });

  const { data: bookings } = useQuery<BookingRequest[]>({
    queryKey: ["/api/provider/bookings"],
    refetchInterval: 30_000,
  });

  const { data: requestsData } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/provider/booking-requests"],
  });

  const { data: vacationStatus } = useQuery<VacationStatus>({
    queryKey: ["/api/me/vacation"],
    enabled: !!user,
  });

  // Trending rail — hidden whole-card on error or a null market (honest absence, §13); never
  // partially rendered off a failed fetch.
  const { data: demandData, isError: demandError } = useQuery<DemandSignalsResponse>({
    queryKey: ["/api/me/demand-signals"],
    enabled: !!user,
  });
  const trendingItems = demandData?.market ? buildTrendingItems(demandData) : [];

  // 3.4 Item 2.1 — the Today card's ONE highest-value demand signal, chosen SERVER-SIDE
  // (/api/me/demand-rollup/top). The card renders the server's chosen signal verbatim (no client
  // math, no ranking here); absent/null ⇒ no card (§13 honest absence, never a feed).
  const { data: topDemand } = useQuery<{ signal: TopDemandSignal | null }>({
    queryKey: ["/api/me/demand-rollup/top"],
    enabled: !!user,
  });

  // Same query key SetupChecklistCard uses internally — read here only to size the compact
  // summary row (doneCount/total, eligibility). No extra request: react-query serves both
  // observers off the one cached fetch.
  const { data: setupSummary } = useQuery<BusinessSetupSummary>({
    queryKey: ["/api/me/business-setup"],
    enabled: !!user,
  });
  const setupDismissed = user?.id
    ? localStorage.getItem(SETUP_DISMISS_KEY_PREFIX + user.id) === "1"
    : false;
  let setupDoneCount = 0;
  let setupTotalCount = 0;
  if (setupSummary?.steps) {
    const s = setupSummary.steps;
    const flags = [s.handle.done, s.payouts.done, s.firstOffering.done, s.approvedOffering.done];
    if (s.availability?.applicable) flags.push(s.availability.done);
    if (s.verification?.requiredForStorefront) flags.push(s.verification.done);
    setupTotalCount = flags.length;
    setupDoneCount = flags.filter(Boolean).length;
  }
  const setupVisible = !setupDismissed && !!setupSummary?.eligible && !!setupSummary.steps;
  const [setupManualExpanded, setSetupManualExpanded] = useState<boolean | null>(null);
  // Default expanded only when nothing is done yet; otherwise a compact summary row.
  const setupExpanded = setupManualExpanded !== null ? setupManualExpanded : setupDoneCount === 0;

  // Ledger 90 (FP-5, X1): the ONE shared predicate, not a hand-written `status === "pending"`.
  // Today's answer was already the correct one of the three the exercise found (an unauthorized
  // §15b claim is NOT provider-actionable, §18b) — it just reached it by its own private filter,
  // which is how three tabs came to disagree about one row. The predicate is now the same object
  // the Inbox queue, the Inbox tile and the server's `pendingBookings` count read.
  const pendingBookings = bookings?.filter(b => isActionableBooking(b.status)) || [];
  const confirmedBookings = bookings?.filter(b => b.status === "confirmed") || [];
  // Disclosed on the same surface so "did a traveler try to buy something?" is answerable HERE,
  // rather than only on Customers — without ever being counted as an action item.
  const awaitingPaymentBookings = bookings?.filter(b => isProvisionalBooking(b.status)) || [];

  // Compute repeat customers: travelers with >1 booking
  const repeatCustomers = (() => {
    if (!bookings || bookings.length === 0) return 0;
    const travelerBookingCounts = new Map<string, number>();
    bookings.forEach(booking => {
      const travelerId = (booking as any).travelerId || (booking as any).traveler?.id;
      if (travelerId) {
        travelerBookingCounts.set(travelerId, (travelerBookingCounts.get(travelerId) || 0) + 1);
      }
    });
    return Array.from(travelerBookingCounts.values()).filter(count => count > 1).length;
  })();

  const stats = [
    { label: "Pending Bookings", value: String(analytics?.summary?.pendingBookings ?? 0), icon: Clock, color: "text-amber-600" },
    { label: "This Month", value: String(analytics?.summary?.totalBookings ?? 0), icon: Calendar, color: "text-blue-600" },
    { label: "Revenue (MTD)", value: `$${(analytics?.summary?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-green-600" },
    // §13 (mockup §12): a 0.0 with zero reviews reads as a real score — say the truth instead.
    { label: "Rating Average", value: (analytics?.summary?.avgRating ?? 0) > 0 ? (analytics!.summary.avgRating).toFixed(1) : "no reviews yet", icon: Star, color: "text-amber-500" },
  ];

  // Add repeat customers line if there are any
  if (repeatCustomers > 0) {
    stats.push(
      { label: "Repeat Customers", value: String(repeatCustomers), icon: Users, color: "text-blue-500" }
    );
  }

  // Console IA C9 (§17 17→9 collapse): this dashboard is the provider console's TODAY seat
  // (module 1, ops home) — the route stays /provider/dashboard (label-only rename, the
  // cheapest honest move; no expert today-strip rebuild — this page already leads with
  // today's bookings + pending action items). Provider back-office wave (Aug 9 2026): the
  // topbar/header title below is renamed "Today" → "Dashboard"; the sidebar entry's own label
  // is a separate file, renamed by a sibling change.
  if (analyticsLoading) {
    return (
      <ProviderLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-console-dark" />
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title="Dashboard">
      <div className="p-5 space-y-3">
        <PayoutBanner
          stripeConnectStatus={stripeStatus?.status ?? "not_started"}
          isPayable={stripeStatus?.connected ?? false}
        />

        {/* Vacation mode banner (mockup §06b) — business-level flag only, read-only here.
            Rendered above the KPIs per spec, linking to Settings' Vacation Mode card. */}
        {vacationStatus?.active && vacationStatus.vacationUntil && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex-wrap"
            data-testid="banner-vacation-mode"
          >
            <div className="flex items-center gap-2 text-xs text-amber-800">
              <Plane className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Vacation mode ON until{" "}
                {new Date(vacationStatus.vacationUntil).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                — new bookings paused
              </span>
            </div>
            <Link href="/provider/settings">
              <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100" data-testid="link-vacation-settings">
                Manage <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        {/* Welcome Section — the "N this month" subtitle was removed: it exactly duplicated
            the "This Month" KPI two rows below (§13, no reason to say the same number twice). */}
        <h2 className="text-lg font-bold text-console-darkest" data-testid="text-welcome">
          Welcome back!
        </h2>

        {/* 3.4 Item 2.1 — Today's single highest-value demand opportunity (server-chosen; gold edge). */}
        <TodayDemandCard signal={topDemand?.signal} />

        {/* Build 1: "Open your business" activation checklist — a compact summary row by
            default; expands to the full card (unchanged behavior/testids inside). Starts
            expanded only when nothing is complete yet — otherwise it's just chrome. */}
        {setupVisible && (
          setupExpanded ? (
            <div className="space-y-1.5">
              <SetupChecklistCard />
              <button
                type="button"
                onClick={() => setSetupManualExpanded(false)}
                className="flex items-center gap-1 text-xs text-console-mid hover:text-console-darkest"
                data-testid="button-collapse-setup"
              >
                <ChevronUp className="w-3.5 h-3.5" /> Collapse
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSetupManualExpanded(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-console-light bg-white hover:bg-console-hover transition-colors text-xs"
              data-testid="button-expand-setup"
            >
              <span className="font-semibold text-console-darkest">
                Open your business · {setupDoneCount} of {setupTotalCount} complete
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-console-mid" />
            </button>
          )
        )}

        {/* Stats Grid — dense KPI tiles matching the ratified mockup (§12): small uppercase
            label, tight bold value, no icon. Renders inline rather than through the shared
            StatCard primitive (used elsewhere with the chunkier icon-box treatment) — this
            page owns its own compact density per the decision-maker's aesthetics ruling. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => {
            const isPlaceholder = typeof stat.value === "string" && !/^[$\d]/.test(stat.value);
            return (
              <div
                key={stat.label}
                data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-lg border border-console-light bg-white px-3 py-2.5"
              >
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-console-mid">{stat.label}</p>
                <p className={isPlaceholder ? "text-[13px] text-console-mid mt-1" : "text-xl font-extrabold text-console-darkest mt-0.5"}>
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* Two-Panel Layout: Left 60%, Right 40% */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {/* Left Panel - 60% width */}
          <div className="lg:col-span-2 space-y-3">
            {/* Quick Actions — real navigation (wouter Link, same pattern the sidebar uses);
                the previous 4 buttons had no onClick at all (§13 dead chrome). Slim bordered
                pills, icon+label inline (mockup §12/§01) — not stacked icon-over-label boxes. */}
            <div className="flex flex-wrap gap-2">
              <Link href="/provider/inbox">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-semibold gap-1.5" data-testid="link-quick-inbox">
                  <MessageSquare className="w-3.5 h-3.5" /> Messages
                </Button>
              </Link>
              <Link href="/provider/calendar">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-semibold gap-1.5" data-testid="link-quick-calendar">
                  <Calendar className="w-3.5 h-3.5" /> Calendar
                </Button>
              </Link>
              <Link href="/provider/services">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-semibold gap-1.5" data-testid="link-quick-services">
                  <Package className="w-3.5 h-3.5" /> Services
                </Button>
              </Link>
              <Link href="/provider/performance">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-semibold gap-1.5" data-testid="link-quick-analytics">
                  <TrendingUp className="w-3.5 h-3.5" /> Analytics
                </Button>
              </Link>
            </div>

            {/* Today's Bookings */}
            <Card className="border border-console-light">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5 text-green-600" />
                    <CardTitle className="text-[13px] font-bold">Today's Bookings</CardTitle>
                  </div>
                  <Link href="/provider/calendar">
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-primary" data-testid="button-view-all-bookings">
                      View All <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {confirmedBookings.length > 0 ? confirmedBookings.slice(0, 4).map((booking) => (
                  <div
                    key={booking.id}
                    className="p-2.5 rounded-lg border border-console-light bg-white hover:bg-console-hover transition-colors"
                    data-testid={`card-booking-${booking.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-semibold text-console-darkest">{booking.service?.serviceName || "Service"}</p>
                            <p className="text-xs text-console-mid mt-0.5">{booking.traveler?.displayName || "Client"}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">
                            Confirmed
                          </Badge>
                        </div>
                        <p className="text-xs font-medium text-console-darkest mt-1.5">${parseFloat(booking.totalAmount || "0").toLocaleString()}</p>
                        {booking.referredBy && booking.referredBy !== "Direct" && (
                          <p className="text-[10.5px] text-[#2E8B8B] font-medium mt-1">via {booking.referredBy}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-console-mid text-center text-xs py-2">No confirmed bookings today</p>
                )}
              </CardContent>
            </Card>

            {/* My Services — removed mock services with hardcoded booking counts per §13 */}
            {/* Users access real services via /provider/services */}
          </div>

          {/* Right Panel - 40% width */}
          <div className="space-y-3 hidden lg:block">
            {/* Earnings card removed — it exactly duplicated the "Revenue (MTD)" KPI above (§13). */}

            {/* Upcoming 5 Days — removed fabricated schedule with hardcoded rides/amounts per §13 */}

            {/* Action Items */}
            <Card className="border border-console-light">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <CardTitle className="text-[13px] font-bold">Action Items ({pendingBookings.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {pendingBookings.length > 0 ? pendingBookings.slice(0, 3).map((request) => (
                  <div
                    key={request.id}
                    className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-xs"
                    data-testid={`card-action-${request.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-console-darkest">{request.service?.serviceName || "Request"}</p>
                        <p className="text-[10.5px] text-console-dark mt-0.5">{request.traveler?.displayName || "Client"}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0 border-amber-300 bg-amber-100">
                        {request.status}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" data-testid={`button-action-${request.id}`}>
                        Review
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-console-mid text-center py-2 text-xs">No pending items</p>
                )}
                {/* Ledger 90 (FP-5, X1): provisional §15b claims are DISCLOSED here, below the
                    action items and outside the "(N)" count — a traveler's abandoned/failed
                    payment is news, but it is not something the provider can act on (§18b). */}
                {awaitingPaymentBookings.length > 0 && (
                  <p className="text-[11px] text-console-mid pt-1" data-testid="text-awaiting-payment">
                    {awaitingPaymentBookings.length} {PROVISIONAL_BOOKING_LABEL.toLowerCase()} —{" "}
                    {PROVISIONAL_BOOKING_HINT.replace("Awaiting the traveler's payment — ", "")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Trending rail (mockup §12) — reads the same /api/me/demand-signals payload the
                Demand tab reads. Hidden entirely on a 404/error response or a null market
                (honest absence, §13); the compact layout above/below is otherwise untouched. */}
            {!demandError && demandData?.market && (
              <Card className="border border-console-light" data-testid="card-trending-rail">
                <CardHeader className="pb-2 pt-3 px-3.5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[11px] font-extrabold tracking-wide" data-testid="text-trending-title">
                      📈 TRENDING · {demandData.market.toUpperCase()}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-3.5 pb-3 space-y-1.5">
                  {trendingItems.length > 0 ? (
                    trendingItems.map((item) => (
                      <div
                        key={item.key}
                        className="p-2 rounded-lg border border-console-light bg-white"
                        data-testid={`row-trending-${item.key}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-console-darkest truncate">{item.label}</p>
                          {item.badge && (
                            <Badge variant="outline" className="text-[10px] flex-shrink-0 h-4 px-1.5">
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10.5px] text-console-mid mt-0.5">{item.sourceLine}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-console-mid text-center py-2" data-testid="text-trending-low-signal">
                      Not enough signal yet.
                    </p>
                  )}
                  <Link href="/provider/performance?tab=demand">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-primary w-full justify-center mt-0.5"
                      data-testid="link-full-demand-view"
                    >
                      Full demand view <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Performance — compacted to one row (was a 3-row card duplicating the Rating KPI
                and bookings count already shown above); "View Details" is now a real link
                (was a dead button with no onClick, §13). Completion rate stays removed —
                fabricated 94% with no data source per §13. */}
            <Card className="border border-console-light">
              <CardContent className="p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="font-semibold text-amber-600">{(analytics?.summary?.avgRating ?? 0).toFixed(1)}</span>
                  <span className="text-console-mid truncate">· {analytics?.summary?.totalBookings ?? 0} bookings</span>
                </div>
                <Link href="/provider/performance">
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-primary flex-shrink-0" data-testid="button-view-performance">
                    View Details <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Expert Partners — removed fabricated metrics (12 partners, $2,450 revenue, 28% of business) per §13 */}
          </div>
        </div>
        {/* Availability — the full Logistics & Availability manager (slot form + tabs) was
            removed from here: it's a full duplicate of the Catalog page's availability
            section (the ratified editing home) and was this page's single biggest length
            cost. This page doesn't otherwise query slot counts, so the CTA states real,
            non-fabricated copy rather than guessing a number (§13). */}
        <Card className="border border-console-light" data-testid="card-availability-cta">
          <CardContent className="p-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-console-dark">
              <Package className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span>Manage your published time slots and booking availability on Catalog.</span>
            </div>
            <Link href="/provider/services">
              <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="link-manage-availability">
                Manage availability <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
