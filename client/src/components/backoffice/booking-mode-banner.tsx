/**
 * BookingModeBanner — "Choose how travelers book your listings", shown in BOTH earner consoles
 * while the seller has at least one live listing whose booking mode nobody chose.
 *
 * Ledger `2026-09-25-seller-booking-mode-prompt`. Mounted ONCE in `BackofficeShell` beside
 * `HandleClaimBanner` (one mount ⇒ one decision about when to ask, §18 rule 1). The rule is
 * `shouldShowBookingModeBanner`; the listing classification is the server's.
 *
 * Buttons: "Make them instant" / "Keep request" (one owner-scoped bulk call that touches ONLY the
 * undecided listings) and "Choose per listing" (the console's own Catalog, where each row has the
 * Instant / Request control). Dismissal is PER SESSION (sessionStorage) — the ask returns next
 * session until they choose; a throwing or absent store reads as NOT dismissed.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isEarnerRole } from "@shared/roles";
import {
  BOOKING_MODE_BANNER_DISMISS_KEY,
  BOOKING_MODE_QUOTE_NOTE,
  bookingModeBannerCopy,
  catalogHrefForRole,
  shouldShowBookingModeBanner,
  undecidedListings,
  type BookingModeStatus,
} from "@/lib/booking-mode-prompt";

export const BOOKING_MODE_STATUS_KEY = "/api/me/listings/booking-mode-status";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(BOOKING_MODE_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.sessionStorage.setItem(BOOKING_MODE_BANNER_DISMISS_KEY, "1");
  } catch {
    /* the ask returns on the next render — the safe direction */
  }
}

/** Everything that shows a listing's booking mode re-reads after a choice. */
export function invalidateBookingModeReads(): void {
  queryClient.invalidateQueries({ queryKey: [BOOKING_MODE_STATUS_KEY] });
  queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
  queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
}

export function BookingModeBanner() {
  const { user } = useAuth() as { user?: { role?: string | null } | null };
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const earner = !!user && isEarnerRole(user.role);
  const { data: status } = useQuery<BookingModeStatus>({
    queryKey: [BOOKING_MODE_STATUS_KEY],
    enabled: earner,
  });

  const decide = useMutation({
    mutationFn: async (mode: "instant" | "request") => {
      const res = await apiRequest("POST", "/api/me/listings/booking-mode/decide", { mode });
      return (await res.json()) as { updatedCount: number };
    },
    onSuccess: (data, mode) => {
      invalidateBookingModeReads();
      toast({
        title: mode === "instant" ? "Listings set to Instant" : "Listings kept as Request",
        description: `${data.updatedCount} ${data.updatedCount === 1 ? "listing" : "listings"} updated. You can change any of them in your Catalog.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  if (!shouldShowBookingModeBanner(user, status, dismissed) || !status) return null;
  const undecided = undecidedListings(status);
  const copy = bookingModeBannerCopy(undecided);
  const hasQuote = status.listings.some((l) => l.state === "quote");

  return (
    <div
      className="flex flex-col gap-2 px-5 py-3 border-b"
      style={{ background: "#EEF4F3", borderColor: "#E8E8E2" }}
      data-testid="booking-mode-banner"
    >
      <div className="flex items-start gap-3">
        <CalendarCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#35605A" }} />
        <div className="text-[13px] flex-1 min-w-0" style={{ color: "#1A1A18" }}>
          <p>
            <span className="font-semibold">{copy.headline}</span>{" "}
            <span data-testid="booking-mode-banner-count">{copy.detail}</span>
          </p>
          <p className="mt-0.5" style={{ color: "#4A4A45" }}>
            {copy.instant} {copy.request}
          </p>
          {hasQuote && (
            <p className="mt-0.5 text-[12px]" style={{ color: "#7A7A72" }} data-testid="booking-mode-banner-quote-note">
              {BOOKING_MODE_QUOTE_NOTE}
            </p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Dismiss for now"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
          data-testid="button-dismiss-booking-mode"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        <Button
          size="sm"
          className="h-8 bg-[#E85D55] hover:bg-[#D64F47] text-white"
          disabled={decide.isPending}
          onClick={() => decide.mutate("instant")}
          data-testid="button-booking-mode-all-instant"
        >
          Make them instant
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 bg-white"
          disabled={decide.isPending}
          onClick={() => decide.mutate("request")}
          data-testid="button-booking-mode-keep-request"
        >
          Keep request
        </Button>
        <Link href={catalogHrefForRole(user?.role)}>
          <Button size="sm" variant="ghost" className="h-8" data-testid="link-booking-mode-per-listing">
            Choose per listing
          </Button>
        </Link>
      </div>
    </div>
  );
}
