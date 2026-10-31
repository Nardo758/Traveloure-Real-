/**
 * Feed panel — Wanted / recruitment slot (extracted from discover-location.tsx
 * inline `WantedSlotCard` for the city-feed bento, Phase 2).
 *
 * Restyled per the bento dispatch: dashed border, GOLD eyebrow, a `Ways to earn`
 * primary and an `Ask an expert` secondary. ADDITIVE — every behaviour and
 * testid the inline card carried is preserved verbatim:
 *   - wrapper testid `section-recruitment-${neighborhoodId}`
 *   - the high-demand badge `badge-high-demand` (≥5 demandCount)
 *   - the apply CTA testid `link-wanted-apply` (still /become-expert — its PARAMS changed;
 *     see the note on the CTA and `lib/wanted-slot-link.ts`)
 *   - the demandCount copy branch
 * No amount/identity/rate is read here (§19 N/A — ordinary content).
 */
import { ChevronRight } from "lucide-react";
import type { FeedItem } from "@/lib/feed-stream";
import type { WantedSlotData } from "@/lib/feed-composition";
import { useExpertAvailability } from "@/lib/expert-availability";
import { useAskExpert } from "@/lib/use-ask-expert";
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

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Phase 2e Part A (2026-08-26-bento-compact-density): `density` is accepted so the
// bento call site can pass it uniformly. This panel already meets the compact spec
// (~200px, descriptive copy at line-clamp-2), so full and compact render the same.
export function FeedWantedSlotCard({ item }: { item: FeedItem; density?: "full" | "compact" }) {
  const askExpert = useAskExpert();
  const { user } = useAuth();
  const {
    offeringLabel,
    offeringKey,
    neighborhoodName,
    neighborhoodSlug,
    city: slotCity,
    demandCount,
    dateContext,
    neighborhoodId,
  } = item.data as WantedSlotData;
  const isHighDemand = (demandCount ?? 0) >= 5;
  // 299b: slug + offering key. Signed-in travelers see "Plan your day here".
  // Everyone else sees the two cleared apply lines. No Wanted here, no Ways to earn.
  const arashiyamaItinerary = isArashiyamaItineraryWanted({
    offeringKey,
    neighborhoodSlug,
  });
  const showApplyLinks = arashiyamaItinerary && arashiyamaShowsApplyLinks(!!user, user?.role);
  // SH-1 item 11: Ask draws only when the server says this city has an expert to ask.
  const expertAvailable = useExpertAvailability({ city: slotCity });

  return (
    <div
      className="flex h-full flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5"
      style={{ borderColor: "var(--earn-gold)", background: "var(--earn-gold-wash)" }}
      data-testid={`section-recruitment-${neighborhoodId}`}
    >
      <div className="min-w-0">
        {!arashiyamaItinerary && (
          <div
            className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--earn-gold-ink)", fontFamily: EARN_MONO }}
          >
            Wanted here
          </div>
        )}
        {isHighDemand && !arashiyamaItinerary && (
          <span
            className="mb-1 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600"
            data-testid="badge-high-demand"
          >
            🔥 High demand
          </span>
        )}
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
              >
                {ARASHIYAMA_ITINERARY_EXPERT_LINK}
              </a>
              <a
                href={ARASHIYAMA_ITINERARY_PROVIDER_HREF}
                className="text-[13px] font-semibold hover:underline"
                style={{ color: "var(--earn-ink)" }}
                data-testid="link-arashiyama-provider-apply"
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
            {demandCount && demandCount > 0
              ? `${demandCount} traveler${demandCount !== 1 ? "s" : ""} in ${neighborhoodName} want this${dateContext ? ` for ${dateContext}` : ""} · Be the first to offer it`
              : `Be the first to offer ${offeringLabel.toLowerCase()} for travelers in ${neighborhoodName}`}
          </p>
        )}
        {/* C5 (cosmetic-public-surfaces dispatch, ruled): /earn is the specific target for a
            recruitment card's "More info" — /how-it-works was generic and unrelated to earning. */}
        {!arashiyamaItinerary && (
          <a
            href="/earn"
            className="mt-1 inline-flex w-fit text-[11px] hover:underline"
            style={{ color: "var(--earn-teal-ink)", fontFamily: EARN_MONO }}
            data-testid={`link-wanted-more-info-${neighborhoodId}`}
            onClick={() => trackRecruitmentClick({ source: "discover_wanted_slot", target: "more_info", city: slotCity ?? undefined })}
          >
            More info →
          </a>
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
            onClick={() => trackRecruitmentClick({ source: "discover_wanted_slot", target: offeringKey ?? offeringLabel, city: slotCity ?? undefined })}
          >
            Ways to earn <ChevronRight className="h-3 w-3" />
          </a>
        )}
        {expertAvailable && !arashiyamaItinerary && (
          <button
            type="button"
            onClick={() => askExpert({ city: slotCity, subject: `${offeringLabel} in ${neighborhoodName}` })}
            className="inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderColor: "var(--earn-gold)", color: "var(--earn-gold-ink)" }}
            data-testid={`link-wanted-ask-${neighborhoodId}`}
          >
            Ask an expert
          </button>
        )}
      </div>
    </div>
  );
}
