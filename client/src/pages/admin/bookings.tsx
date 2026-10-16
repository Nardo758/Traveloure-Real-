/**
 * /admin/bookings — PAY-1c. Every booking in one of the three booking tables, newest first, with the
 * filters an admin works the `needs_review` queue with: status, kind (which table) and creation day.
 * Each row opens the PAY-1 detail page (`/admin/bookings/:kind/:id`), where a held row is resolved.
 *
 * The filters are parsed by the ONE shared parser the route uses (`@shared/admin-booking-list`).
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_BOOKING_LIST_KINDS,
  ADMIN_BOOKING_LIST_STATUSES,
  adminBookingDetailPath,
  adminBookingListQueryString,
  type AdminBookingListFilters,
  type AdminBookingListKind,
} from "@shared/admin-booking-list";

interface AdminBookingListRow {
  kind: AdminBookingListKind;
  id: string;
  status: string | null;
  travelerName: string | null;
  travelerEmail: string | null;
  serviceName: string | null;
  total: string | null;
  currency: string | null;
  createdAt: string | null;
}

interface AdminBookingListResponse {
  rows: AdminBookingListRow[];
  limit: number;
}

const KIND_LABELS: Record<AdminBookingListKind, string> = {
  service: "Service bookings",
  legacy: "Legacy bookings",
  liteapi: "Hotel stays (LiteAPI)",
};

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default function AdminBookingsPage() {
  const [filters, setFilters] = useState<AdminBookingListFilters>({ kind: "service", status: "needs_review", from: null, to: null });
  const url = `/api/admin/bookings?${adminBookingListQueryString(filters)}`;
  const { data, isLoading, error } = useQuery<AdminBookingListResponse>({ queryKey: [url] });
  const set = (patch: Partial<AdminBookingListFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <AdminLayout title="Bookings">
      <div className="space-y-6 p-6" data-testid="admin-bookings">
        <div>
          <h1 className="text-2xl font-semibold">Bookings</h1>
          <p className="text-sm text-gray-500">Open a booking to see its payment and timeline. A booking at needs_review is resolved there.</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="space-y-1">
              <Label htmlFor="bookings-status">Status</Label>
              <select
                id="bookings-status"
                className={selectClass}
                value={filters.status ?? ""}
                onChange={(e) => set({ status: e.target.value || null })}
                data-testid="filter-status"
              >
                <option value="">All statuses</option>
                {ADMIN_BOOKING_LIST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bookings-kind">Kind</Label>
              <select
                id="bookings-kind"
                className={selectClass}
                value={filters.kind}
                onChange={(e) => set({ kind: e.target.value as AdminBookingListKind })}
                data-testid="filter-kind"
              >
                {ADMIN_BOOKING_LIST_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bookings-from">Created from</Label>
              <Input id="bookings-from" type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} data-testid="filter-from" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bookings-to">Created to</Label>
              <Input id="bookings-to" type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} data-testid="filter-to" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{KIND_LABELS[filters.kind]}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {error && <p className="text-sm text-red-600" data-testid="admin-bookings-error">The bookings could not be loaded. Check the filters and try again.</p>}
            {data && data.rows.length === 0 && (
              <p className="text-sm text-gray-500" data-testid="admin-bookings-empty">No bookings match these filters.</p>
            )}
            {data && data.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="admin-bookings-table">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Booking</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Traveler</th>
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={`${row.kind}-${row.id}`} className="border-b last:border-0" data-testid={`admin-booking-row-${row.id}`}>
                        <td className="py-2 pr-4 font-mono">
                          <Link href={adminBookingDetailPath(row.kind, row.id)} className="text-blue-600 hover:underline">
                            {row.id}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={row.status === "needs_review" ? "destructive" : "secondary"}>{row.status ?? "no status"}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <div>{row.travelerName ?? "—"}</div>
                          <div className="text-xs text-gray-500">{row.travelerEmail ?? ""}</div>
                        </td>
                        <td className="py-2 pr-4">{row.serviceName ?? "—"}</td>
                        <td className="py-2 pr-4">{row.total ? `${row.total}${row.currency ? ` ${row.currency}` : ""}` : "—"}</td>
                        <td className="py-2 pr-4">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length >= data.limit && (
                  <p className="mt-3 text-xs text-gray-500">Showing the newest {data.limit}. Narrow the filters to see older bookings.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
