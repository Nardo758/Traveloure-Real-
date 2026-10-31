/**
 * Feed panel — Wanted / recruitment slot (extracted from discover-location.tsx
 * inline `WantedSlotCard` for the city-feed bento, Phase 2).
 *
 * The generic tile's one primary action reads `tileActionLabel("wanted-slot")` (row 302a). The Arashiyama
 * itinerary tile keeps its own lines. ADDITIVE testids that remain:
 *   - wrapper testid `section-recruitment-${neighborhoodId}`
 *   - the apply CTA testid `link-wanted-apply` (still /become-expert — its PARAMS changed;
 *     see the note on the CTA and `lib/wanted-slot-link.ts`)
 * Row 300b (ledger `2026-10-31-wanted-tiles-no-demand`): the tile makes no crowd or demand
 * claim. The high-demand badge and the traveler-count line are gone; `demandCount` stays on the
 * data and is not rendered.
 * No amount/identity/rate is read here (§19 N/A — ordinary content).
 */
import { ChevronRight } from "lucide-react";
import { tileActionLabel } from "@/lib/bento-action-state";
import type { FeedItem } from "@/lib/feed-stream";
import type { WantedSlotData } from "@/lib/feed-composition";
import { buildWantedSlotSignupHref } from "@/lib/wanted-slot-link";
import { trackRecruitmentClick } from "@/lib/analytics";
import { useAuth } from "@/hooks/use-auth";
import {
  ARASHIYAMA_ITINERARY_EXPERT_HREF,
  ARASHIYAMA_ITINERARY_EXPERT_LINK,
  ARASHIYAMA_ITINERARY_PROVIDER_HREF,
  ARASHIYAMA_ITINERARY_PROVIDER_LINK,
  ARASHIYAMA_PLAN_YOUR_DAY,
  ARASHIYAMA_PLAN_YOUR_DAY_HREF,
  arashiyamaShowsApplyLinks,
  isArashiyamaItineraryWanted,
} from "@/lib/arashiyama-wanted-copy";


// Phase 2e Part A (2026-08-26-bento-compact-density): `density` is accepted so the
// bento call site can pass it uniformly. This panel already meets the compact spec
// (~200px, descriptive copy at line-clamp-2), so full and compact render the same.
export function FeedWantedSlotCard({ item }: { item: FeedItem; density?: "full" | "compact" }) {
  const { user } = useAuth();
  const {
    offeringLabel,
    offeringKey,
    neighborhoodName,
    neighborhoodSlug,
    city: slotCity,
    neighborhoodId,
  } = item.data as WantedSlotData;
  // 299b: slug + offering key. Signed-in travelers see "Plan your day here".
  // Everyone else sees the two cleared apply lines. No Ways to earn. No tile shows a "Wanted here" eyebrow (row 300b).
  const arashiyamaItinerary = isArashiyamaItineraryWanted({
    offeringKey,
    neighborhoodSlug,
  });
  const showApplyLinks = arashiyamaItinerary && arashiyamaShowsApplyLinks(!!user, user?.role);

  return (
    <div
      className="flex h-full flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5"
      style={{ borderColor: "var(--earn-gold)", background: "var(--earn-gold-wash)" }}
      data-testid={`section-recruitment-${neighborhoodId}`}
    >
      <div className="min-w-0">
        {/* C2 (cosmetic-public-surfaces dispatch): `truncate` clipped the only variable part of
            this line ("Local City Itinerary wanted in A…") on a ~200px card. line-clamp-2 shows
            the whole name instead of an ellipsis mid-word. */}
        {arashiyamaItinerary ? (
          showApplyLinks ? (
            <div className="flex flex-col gap-1">
              <a
                href={ARASHIYAMA_ITINERARY_EXPERT_HREF}
                className="text-[13px] font-semibold hover:underline"
                style={{ color: "var(--earn-ink)" }}
                data-testid="link-arashiyama-expert-apply"
                data-bento-primary-action=""
              >
                {ARASHIYAMA_ITINERARY_EXPERT_LINK}
              </a>
              <a
                href={ARASHIYAMA_ITINERARY_PROVIDER_HREF}
                className="text-[13px] font-semibold hover:underline"
                style={{ color: "var(--earn-ink)" }}
                data-testid="link-arashiyama-provider-apply"
                data-bento-primary-action=""
              >
                {ARASHIYAMA_ITINERARY_PROVIDER_LINK}
              </a>
            </div>
          ) : (
            <a
              href={ARASHIYAMA_PLAN_YOUR_DAY_HREF}
              className="text-[13px] font-semibold hover:underline"
              style={{ color: "var(--earn-ink)" }}
              data-testid="link-arashiyama-plan-day"
              data-bento-primary-action=""
            >
              {ARASHIYAMA_PLAN_YOUR_DAY}
            </a>
          )
        ) : (
          <p className="line-clamp-2 text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }}>
            {`${offeringLabel} wanted in ${neighborhoodName}`}
          </p>
        )}
        {!arashiyamaItinerary && (
          <p className="line-clamp-2 text-[11px]" style={{ color: "var(--earn-muted)" }}>
            {`Be the first to offer ${offeringLabel.toLowerCase()} for travelers in ${neighborhoodName}`}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {/* Gap 15 (ledger `2026-09-04-earn-contained-fixes`): this link used to carry
            `offering=<display label>` — a param the expert wizard never reads — and no `type=`,
            so a neighbourhood recruitment slot dropped the offering the demand was measured
            against AND landed the applicant in the Trip Planner flow. The mapping now lives in
            ONE tested place; `offeringTypeKey` is emitted only for a real catalog key. */}
        {!arashiyamaItinerary && (
          <a
            href={buildWantedSlotSignupHref({ city: slotCity, neighborhoodName, offeringKey, offeringLabel })}
            className="inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ background: "var(--earn-gold-ink)" }}
            data-testid="link-wanted-apply"
            data-bento-primary-action=""
            onClick={() => trackRecruitmentClick({ source: "discover_wanted_slot", target: offeringKey ?? offeringLabel, city: slotCity ?? undefined })}
          >
            {tileActionLabel("wanted-slot")} <ChevronRight className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
