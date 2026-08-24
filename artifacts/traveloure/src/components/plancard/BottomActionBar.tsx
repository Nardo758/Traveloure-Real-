/**
 * CLAUDE.md §18, item 3 — sticky bottom action bar (mobile viewports only). "Message
 * [expert]" only when an ACCEPTED advisor exists (the audit's realistic no-advisor case
 * falls back to "Get help" → the existing concierge entry point, never a dead button).
 * Buttons are ≥44px (min-h-11) with safe-area inset padding.
 */
import { Link } from "wouter";
import { Map as MapIcon, MessageCircle, Share2, LifeBuoy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { openInMaps } from "@/lib/navigate";

interface AdvisorLite {
  status: "pending" | "accepted" | "rejected";
  first_name?: string | null;
}

interface BottomActionBarProps {
  tripId: string;
  destination: string;
  shareToken?: string | null;
}

export function BottomActionBar({
  tripId,
  destination,
  shareToken,
  advisor,
}: BottomActionBarProps & { advisor?: AdvisorLite | null }) {
  const { toast } = useToast();

  const handleMaps = () => {
    if (!destination) return;
    openInMaps({ destination: { name: destination } });
  };

  const handleShare = () => {
    const shareUrl = shareToken
      ? `${window.location.origin}/itinerary-view/${shareToken}`
      : `${window.location.origin}/itinerary/${tripId}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    toast({ title: "Link copied!", description: "Share link copied to clipboard." });
    if (navigator.share) {
      navigator.share({ title: "My Traveloure trip", url: shareUrl }).catch(() => {});
    }
  };

  const hasAcceptedAdvisor = advisor?.status === "accepted";

  return (
    // `fixed` (not `sticky`) — the ancestor page layout (DashboardLayout's <main>, out of
    // this component's scope) sets `overflow: auto` without ever actually developing
    // scrollable overflow itself (see the day-switcher comment in PlanCard.tsx), which
    // silently breaks `position: sticky` against real window scroll. `fixed` escapes that
    // ancestor chain entirely (only trapped by transform/filter/contain, none of which are
    // in play here) — also the more conventional choice for a persistent mobile bottom bar.
    <div
      className="sm:hidden fixed inset-x-0 bottom-0 z-30 flex gap-1.5 px-3 pt-2 bg-card border-t border-border"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      data-testid={`bottom-action-bar-${tripId}`}
    >
      <button
        type="button"
        onClick={handleMaps}
        className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10.5px] font-bold text-muted-foreground hover:bg-muted/50 transition-colors"
        data-testid={`button-bottombar-maps-${tripId}`}
      >
        <MapIcon className="w-[18px] h-[18px]" />
        Map
      </button>

      {hasAcceptedAdvisor ? (
        <Link
          href="/chat"
          className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10.5px] font-bold bg-primary/10 text-primary transition-colors"
          data-testid={`button-bottombar-message-${tripId}`}
        >
          <MessageCircle className="w-[18px] h-[18px]" />
          {advisor?.first_name ? `Message ${advisor.first_name}` : "Message expert"}
        </Link>
      ) : (
        <Link
          href="/concierge"
          className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10.5px] font-bold bg-primary/10 text-primary transition-colors"
          data-testid={`button-bottombar-help-${tripId}`}
        >
          <LifeBuoy className="w-[18px] h-[18px]" />
          Get help
        </Link>
      )}

      <button
        type="button"
        onClick={handleShare}
        className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10.5px] font-bold text-muted-foreground hover:bg-muted/50 transition-colors"
        data-testid={`button-bottombar-share-${tripId}`}
      >
        <Share2 className="w-[18px] h-[18px]" />
        Share
      </button>
    </div>
  );
}
