/**
 * Customers — Console IA PR-Ca phase C4 (§17 module 6, mockup-console-pages.html section 7).
 *
 * HONEST self-scoped aggregation: every row is derived from this earner's REAL bookings,
 * store purchases, and assigned trips (GET /api/me/customers — read-only). No invented CRM
 * fields (no notes, no tags, no lead status — none exist, none are faked, per the ratified
 * section-7 decision). The expanded detail REFERENCES each item's owning module (bookings →
 * Inbox History (/expert/inbox?tab=history, C5), trips → the Workstation build, purchases →
 * the Catalog listing lane) —
 * this page never re-renders another module's surface (§17 one-home-per-list rule).
 *
 * Money label honesty (§13): the figure shown is BOOKED VALUE — the gross amount customers
 * paid (service_bookings.total_amount + ready_made_purchases.price_paid_cents), NOT this
 * earner's earnings. The label says so.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { PageHeader, EmptyState, StatusBadge, type StatusBadgeEntry } from "@/components/backoffice/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronDown, ChevronRight, Calendar, Map, Package } from "lucide-react";

interface CustomerBookingItem {
  id: string;
  serviceName: string | null;
  status: string | null;
  totalAmount: number;
  createdAt: string | null;
}

interface CustomerPurchaseItem {
  id: string;
  readyMadeTripId: string;
  listingTitle: string;
  status: string;
  pricePaid: number;
  purchasedAt: string | null;
}

interface CustomerTripItem {
  advisorId: string;
  tripId: string;
  title: string | null;
  destination: string | null;
  tripStatus: string;
  startDate: string | null;
  assignedAt: string | null;
}

interface CustomerRow {
  userId: string | null;
  displayName: string;
  relationship: "active_trip" | "repeat" | "one_time";
  bookings: number;
  purchases: number;
  trips: number;
  hasActiveTrip: boolean;
  bookedValue: number;
  purchaseValue: number;
  totalBookedValue: number;
  lastActivity: string | null;
  items: {
    bookings: CustomerBookingItem[];
    purchases: CustomerPurchaseItem[];
    trips: CustomerTripItem[];
  };
}

// Relationship chips ride the shared StatusBadge idiom with a page-local map — these three
// values are the endpoint's honest, derived vocabulary (active_trip wins; repeat = 2+ real
// transactions; one_time otherwise).
const RELATIONSHIP_MAP: Record<string, StatusBadgeEntry> = {
  active_trip: { label: "Active trip", className: "bg-primary/10 text-primary border-transparent" },
  repeat: { label: "Repeat", className: "bg-green-100 text-green-700 border-green-200" },
  one_time: { label: "One-time", className: "bg-muted text-muted-foreground border-transparent" },
};

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "MMM d, yyyy");
}

function CustomerDetail({ customer }: { customer: CustomerRow }) {
  const { bookings, purchases, trips } = customer.items;
  return (
    <div className="border-t border-console-light bg-console-bg/50 px-4 py-3 space-y-3">
      {bookings.length > 0 && (
        <div data-testid={`detail-bookings-${customer.userId ?? "guest"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-1.5">
            Bookings
          </p>
          <ul className="space-y-1">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href="/expert/inbox?tab=history"
                  className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
                >
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
                  <span className="truncate">{b.serviceName ?? "Service booking"}</span>
                </Link>
                <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
                  {b.status && <StatusBadge status={b.status} />}
                  <span>{money(b.totalAmount)}</span>
                  {shortDate(b.createdAt) && <span>{shortDate(b.createdAt)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {purchases.length > 0 && (
        <div data-testid={`detail-purchases-${customer.userId ?? "guest"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-1.5">
            Store purchases
          </p>
          <ul className="space-y-1">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href="/expert/catalog"
                  className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
                >
                  <Package className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
                  <span className="truncate">{p.listingTitle}</span>
                </Link>
                <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <span>{money(p.pricePaid)}</span>
                  {shortDate(p.purchasedAt) && <span>{shortDate(p.purchasedAt)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {trips.length > 0 && (
        <div data-testid={`detail-trips-${customer.userId ?? "guest"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-1.5">
            Assigned trips
          </p>
          <ul className="space-y-1">
            {trips.map((t) => (
              <li key={t.advisorId} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href={`/expert/workspace/${t.tripId}`}
                  className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
                >
                  <Map className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
                  <span className="truncate">
                    {t.title ?? "Trip"}
                    {t.destination ? ` · ${t.destination}` : ""}
                  </span>
                </Link>
                <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
                  <StatusBadge status={t.tripStatus} />
                  {t.startDate && <span>{shortDate(t.startDate) ?? t.startDate}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function factsLine(c: CustomerRow): string {
  const parts: string[] = [];
  if (c.bookings > 0) parts.push(`${c.bookings} booking${c.bookings === 1 ? "" : "s"}`);
  if (c.purchases > 0) parts.push(`${c.purchases} purchase${c.purchases === 1 ? "" : "s"}`);
  if (c.trips > 0) parts.push(`${c.trips} trip${c.trips === 1 ? "" : "s"}`);
  if (c.totalBookedValue > 0) parts.push(`${money(c.totalBookedValue)} booked value`);
  const last = shortDate(c.lastActivity);
  if (last) parts.push(`last activity ${last}`);
  return parts.join(" · ");
}

export default function ExpertCustomers() {
  const { data, isLoading } = useQuery<{ customers: CustomerRow[] }>({
    queryKey: ["/api/me/customers"],
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const customers = data?.customers ?? [];

  return (
    <ExpertLayout title="Customers">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Customers"
          subtitle="Everyone you've actually worked with — derived from your real bookings, store sales, and client trips"
          icon={Users}
          testId="text-customers-title"
        />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers yet"
            body="They appear with your first booking, sale, or client trip."
            testId="empty-customers"
          />
        ) : (
          <Card className="border border-console-light" data-testid="card-customers-list">
            <CardContent className="p-0">
              {customers.map((c, i) => {
                const key = c.userId ?? "guest";
                const isOpen = expanded === key;
                return (
                  <div
                    key={key}
                    className={i > 0 ? "border-t border-console-light" : undefined}
                    data-testid={`customer-row-${key}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-console-bg/60 transition-colors"
                      data-testid={`button-customer-toggle-${key}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 flex-shrink-0 text-console-mid" />
                      ) : (
                        <ChevronRight className="w-4 h-4 flex-shrink-0 text-console-mid" />
                      )}
                      <span className="font-semibold text-console-darkest truncate">
                        {c.displayName}
                      </span>
                      <StatusBadge status={c.relationship} map={RELATIONSHIP_MAP} />
                      <span
                        className="ml-auto text-sm text-console-mid text-right flex-shrink-0"
                        data-testid={`customer-facts-${key}`}
                      >
                        {factsLine(c)}
                      </span>
                    </button>
                    {isOpen && <CustomerDetail customer={c} />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-console-mid">
          Booked value is what your customers paid across bookings and store purchases — it is not
          your earnings. See Earnings for your ledger.
        </p>
      </div>
    </ExpertLayout>
  );
}
