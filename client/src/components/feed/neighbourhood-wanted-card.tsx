/**
 * Row 301 (ledger `2026-10-31-bento-layout-config`): the Wanted hero an unstocked neighbourhood
 * section shows, moved out of `pages/discover-location.tsx` into the card family unchanged. The
 * bento's `BentoTile` renders it for a `wanted-slot` item carrying `neighbourhoodWantedHero`.
 */
import {
  neighbourhoodWantedBody,
  NEIGHBOURHOOD_WANTED_BUTTON,
  NEIGHBOURHOOD_WANTED_HREF,
} from "@/lib/feed-stream";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function FeedNeighbourhoodWantedCard({ name, slug }: { name: string; slug: string }) {
  return (
    <div
      className="flex h-full flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5"
      style={{ borderColor: "var(--earn-gold)", background: "var(--earn-gold-wash)" }}
      data-testid={`neighbourhood-wanted-${slug}`}
    >
      <div className="min-w-0">
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--earn-gold-ink)", fontFamily: EARN_MONO }}
        >
          Wanted here
        </div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }}>
          {neighbourhoodWantedBody(name || slug)}
        </p>
      </div>
      <a
        href={NEIGHBOURHOOD_WANTED_HREF}
        className="inline-flex w-fit items-center rounded-md px-2.5 py-1 text-[11px] font-bold text-white"
        style={{ background: "var(--earn-gold-ink)" }}
        data-testid={`link-neighbourhood-join-${slug}`}
      >
        {NEIGHBOURHOOD_WANTED_BUTTON}
      </a>
    </div>
  );
}
