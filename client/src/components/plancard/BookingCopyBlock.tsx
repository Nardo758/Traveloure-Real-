/**
 * Row PS-6 — one booking copy on a Trip Card stop (model: `client/src/lib/booking-copy.ts`). Links only: it never
 * offers a Book action and never writes. Absent fields are omitted, never filled (§13).
 */
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { BookingCopy, MyBookingRowLike, PartnerRequestRowLike } from "@/lib/booking-copy";

/**
 * The two READS a Trip Card's booking copies come from — no write: My Bookings' own read (`GET /api/my-bookings`) for
 * platform bookings, and the booking-agent card's read (`GET /api/affiliate-booking-requests/user?tripId=`) for partner
 * bookings. Same query keys as those surfaces, so the cache is shared. A read that fails or is not yet in reads as
 * null and the copy falls back to what the plancard carries (§13 — never invented).
 */
export function useBookingCopyReads(tripId: string, enabled: boolean): { myBookings: MyBookingRowLike[] | null; partnerRequests: PartnerRequestRowLike[] | null } {
  const { data: myBookings } = useQuery<MyBookingRowLike[]>({ queryKey: ["/api/my-bookings"], enabled, retry: false, staleTime: 60_000 });
  const { data: partnerRequests } = useQuery<PartnerRequestRowLike[]>({
    queryKey: ["/api/affiliate-booking-requests/user", { tripId }],
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  return {
    myBookings: Array.isArray(myBookings) ? myBookings : null,
    partnerRequests: Array.isArray(partnerRequests) ? partnerRequests : null,
  };
}

function confirmedDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "MMM d, yyyy");
}

export function BookingCopyBlock({ id, copy }: { id: string; copy: BookingCopy }) {
  const day = confirmedDay(copy.confirmedAt);
  const facts = [copy.who, copy.reference ? `#${copy.reference}` : null, day].filter(Boolean) as string[];
  return (
    <div
      className="mt-1 self-start rounded-lg border border-[color:var(--slip-line)] px-2.5 py-1.5 text-xs"
      data-testid={`card-booking-copy-${id}`}
      data-kind={copy.kind}
      data-confirmed={copy.confirmed ? "true" : "false"}
    >
      <p className="font-semibold text-foreground" data-testid={`card-booking-copy-status-${id}`}>{copy.status}</p>
      {facts.length ? (
        <p className="text-muted-foreground" data-testid={`card-booking-copy-facts-${id}`}>{facts.join(" · ")}</p>
      ) : null}
      {copy.terms ? <p className="text-muted-foreground" data-testid={`card-booking-copy-terms-${id}`}>{copy.terms}</p> : null}
      {copy.link ? (
        copy.link.external ? (
          <a href={copy.link.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--slip-navy)] hover:underline" data-testid={`card-booking-copy-link-${id}`}>
            {copy.link.label}
          </a>
        ) : (
          <Link href={copy.link.href} className="font-semibold text-[color:var(--slip-navy)] hover:underline" data-testid={`card-booking-copy-link-${id}`}>
            {copy.link.label}
          </Link>
        )
      ) : null}
    </div>
  );
}
