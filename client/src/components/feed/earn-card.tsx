/**
 * Feed panel — Ways-to-Earn concierge card (extracted from discover-location.tsx
 * inline `EarnCard` for the city-feed bento, Phase 2).
 *
 * `--earn-ground` background. Phase 2d: the coral-only rule governs BUTTONS —
 * the TEXT eyebrow is coral-ink as the mock draws it; the primary CTA is
 * navy-filled. Behaviour and testids preserved verbatim:
 *   - wrapper testid `feed-card-earn`
 *   - `btn-earn-expert` (Become an expert → /earn)
 *   - `btn-earn-provider` (List a service → /earn)
 */
import { Button } from "@/components/ui/button";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function toTitleCase(str: string): string {
  return str
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Phase 2e Part A (2026-08-26-bento-compact-density): "compact" clamps the blurb to
// two lines to fit the ~200px bento panel; both CTAs and testids are unchanged.
export function FeedEarnCard({ city, density = "full" }: { city: string; density?: "full" | "compact" }) {
  const displayCity = toTitleCase(city);
  const isCompact = density === "compact";
  return (
    <div
      className="flex h-full flex-col gap-1.5 rounded-xl border p-3.5"
      style={{ background: "var(--earn-ground)", borderColor: "var(--earn-border)" }}
      data-testid="feed-card-earn"
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--earn-coral-ink)", fontFamily: EARN_MONO }}
      >
        Earn on Traveloure
      </span>
      <h3
        className="text-[16px] font-semibold leading-tight"
        style={{ color: "var(--earn-navy)", fontFamily: FRAUNCES }}
      >
        Know {displayCity} like a local? Offer a service here?
      </h3>
      <p className={isCompact ? "text-[12px] line-clamp-2" : "text-[12px]"} style={{ color: "var(--earn-muted)" }}>
        Local experts share their knowledge; providers list bookable services — both earn on Traveloure.
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-7 border-none px-3 text-xs text-white"
          style={{ background: "var(--earn-navy)" }}
          asChild
          data-testid="btn-earn-expert"
        >
          <a href="/earn">Become an expert</a>
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-3 text-xs" asChild data-testid="btn-earn-provider">
          <a href="/earn">List a service</a>
        </Button>
      </div>
    </div>
  );
}
