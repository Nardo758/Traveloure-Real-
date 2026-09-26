/**
 * BookingModeToggle — the expert Catalog's per-listing Instant / Request control.
 *
 * Ledger `2026-09-25-seller-booking-mode-prompt`. The provider Catalog already carries the
 * "Card shows" Booking control; the expert Catalog (`MyOfferingsTable`) had none, so the banner's
 * "Choose per listing" had nowhere to land for an expert. It reads the SAME server status the
 * banner reads (`GET /api/me/listings/booking-mode-status` — effective mode + whether it was
 * chosen) and writes through the EXISTING listing PATCH rail (`PATCH /api/provider/services/:id`
 * `{ bookingMode }`, a SAFE edit under Locked Decision 23) — no second writer.
 *
 * Only Instant and Request are offered here: `hidden` remains a provider Catalog choice, and a
 * listing already set to hidden shows it as the current state without being offered here.
 * Custom-quote listings render a sentence, never a toggle — they are request by construction.
 */
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BookingModeStatusListing } from "@/lib/booking-mode-prompt";
import { invalidateBookingModeReads } from "@/components/backoffice/booking-mode-banner";

const OPTIONS: Array<{ value: "instant" | "request"; label: string }> = [
  { value: "instant", label: "Instant" },
  { value: "request", label: "Request" },
];

export function BookingModeToggle({ listing }: { listing: BookingModeStatusListing }) {
  const { toast } = useToast();
  const patch = useMutation({
    mutationFn: async (mode: "instant" | "request") =>
      apiRequest("PATCH", `/api/provider/services/${listing.id}`, { bookingMode: mode }),
    onSuccess: () => invalidateBookingModeReads(),
    onError: (e: Error) =>
      toast({ title: "Could not change booking", description: e.message, variant: "destructive" }),
  });

  if (listing.state === "quote") {
    return (
      <span className="text-[11px] text-muted-foreground" data-testid={`booking-mode-quote-${listing.id}`}>
        Booking: Request (custom quote)
      </span>
    );
  }

  const chosen = listing.state === "chosen";
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid={`booking-mode-toggle-${listing.id}`}>
      <span className="text-[11px] text-muted-foreground">Booking</span>
      <div className="inline-flex rounded-[6px] border border-[#E8E8E2] overflow-hidden" role="group">
        {OPTIONS.map((opt) => {
          const active = chosen && listing.mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={patch.isPending}
              onClick={() => patch.mutate(opt.value)}
              aria-pressed={active}
              className={cn(
                "px-2 py-[2px] text-[11px] font-medium border-r border-[#E8E8E2] last:border-r-0",
                active ? "bg-[#1A1A18] text-white" : "bg-white text-[#7A7A72] hover:bg-[#FAFAF8]",
              )}
              data-testid={`button-booking-mode-${listing.id}-${opt.value}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {chosen && listing.mode === "hidden" && (
        <span className="text-[11px] text-muted-foreground">Currently hidden</span>
      )}
      {!chosen && (
        <span className="text-[11px] text-[#B45309]" data-testid={`booking-mode-unchosen-${listing.id}`}>
          Not chosen yet — travelers see “{listing.mode === "instant" ? "Book now" : "Request to book"}”
        </span>
      )}
    </div>
  );
}
