/**
 * Feed panel — Wanted / recruitment slot (extracted from discover-location.tsx
 * inline `WantedSlotCard` for the city-feed bento, Phase 2).
 *
 * Restyled per the bento dispatch: dashed border, GOLD eyebrow, a `Offer this`
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
import { useAskExpert } from "@/lib/use-ask-expert";
import { buildWantedSlotSignupHref } from "@/lib/wanted-slot-link";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Phase 2e Part A (2026-08-26-bento-compact-density): `density` is accepted so the
// bento call site can pass it uniformly. This panel already meets the compact spec
// (~200px, descriptive copy at line-clamp-2), so full and compact render the same.
export function FeedWantedSlotCard({ item }: { item: FeedItem; density?: "full" | "compact" }) {
  const askExpert = useAskExpert();
  const {
    offeringLabel,
    offeringKey,
    neighborhoodName,
    city: slotCity,
    demandCount,
    dateContext,
    neighborhoodId,
  } = item.data as WantedSlotData;
  const isHighDemand = (demandCount ?? 0) >= 5;

  return (
    <div
      className="flex h-full flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5"
      style={{ borderColor: "var(--earn-gold)", background: "var(--earn-gold-wash)" }}
      data-testid={`section-recruitment-${neighborhoodId}`}
    >
      <div className="min-w-0">
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--earn-gold-ink)", fontFamily: EARN_MONO }}
        >
          Wanted here
        </div>
        {isHighDemand && (
          <span
            className="mb-1 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600"
            data-testid="badge-high-demand"
          >
            🔥 High demand
          </span>
        )}
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }}>
          {offeringLabel} wanted in {neighborhoodName}
        </p>
        <p className="line-clamp-2 text-[11px]" style={{ color: "var(--earn-muted)" }}>
          {demandCount && demandCount > 0
            ? `${demandCount} traveller${demandCount !== 1 ? "s" : ""} in ${neighborhoodName} want this${dateContext ? ` for ${dateContext}` : ""} · Be the first to offer it`
            : `Be the first to offer ${offeringLabel.toLowerCase()} for travellers in ${neighborhoodName}`}
        </p>
        <a
          href="/how-it-works"
          className="mt-1 inline-flex w-fit text-[11px] hover:underline"
          style={{ color: "var(--earn-teal-ink)", fontFamily: EARN_MONO }}
          data-testid={`link-wanted-more-info-${neighborhoodId}`}
        >
          More info →
        </a>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {/* Gap 15 (ledger `2026-09-04-earn-contained-fixes`): this link used to carry
            `offering=<display label>` — a param the expert wizard never reads — and no `type=`,
            so a neighbourhood recruitment slot dropped the offering the demand was measured
            against AND landed the applicant in the Trip Planner flow. The mapping now lives in
            ONE tested place; `offeringTypeKey` is emitted only for a real catalog key. */}
        <a
          href={buildWantedSlotSignupHref({ city: slotCity, neighborhoodName, offeringKey, offeringLabel })}
          className="inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-[11px] font-bold text-white"
          style={{ background: "var(--earn-gold-ink)" }}
          data-testid="link-wanted-apply"
        >
          Offer this <ChevronRight className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={() => askExpert({ city: slotCity, subject: `${offeringLabel} in ${neighborhoodName}` })}
          className="inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold"
          style={{ borderColor: "var(--earn-gold)", color: "var(--earn-gold-ink)" }}
          data-testid={`link-wanted-ask-${neighborhoodId}`}
        >
          Ask an expert
        </button>
      </div>
    </div>
  );
}
