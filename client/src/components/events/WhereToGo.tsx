/**
 * WhereToGo.tsx — "Where to go" on /events (ledger `2026-10-06-events-calendar`; ruling A2.3).
 * Every operating market for the selected month, best season first. A city with no season row
 * for the month says "Not rated yet" and is never dropped (E6). A rating read from the COUNTRY's
 * row says so (E5). The vibe chips filter destinations only, never events.
 */
import { Link } from "wouter";
import { cityEventPhoto } from "@shared/city-events";
import { resolveBillboardCredit, type PhotoAttribution } from "@shared/landing-billboard";
import { SEASON_GROUP_LABELS, type WhereToGoRow, type SeasonGroup } from "@shared/events-calendar";
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";
import { MONO } from "./MonthGrid";

const FRAUNCES = "'Fraunces', Georgia, serif";

export const VIBES = ["Romantic", "Adventure", "Cultural", "Beach", "Foodie", "Nightlife", "Family", "Nature"] as const;

const GROUP_INK: Record<SeasonGroup, string> = {
  best: "var(--earn-green-ink)",
  good: "var(--earn-teal-ink)",
  average: "var(--earn-gold-ink)",
  off: "var(--earn-muted)",
  unrated: "var(--earn-muted)",
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Chip({ on, label, onClick, testId }: { on: boolean; label: string; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border px-3 py-1 text-[12.5px]"
      style={{
        borderColor: on ? "var(--earn-teal-ink)" : "var(--earn-border)",
        background: on ? "var(--earn-teal-ink)" : "var(--earn-card)",
        color: on ? "var(--earn-card)" : "var(--earn-ink)",
      }}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

export function WhereToGo({
  monthName,
  rows,
  vibe,
  onVibe,
}: {
  monthName: string;
  rows: readonly WhereToGoRow[];
  vibe: string;
  onVibe: (v: string) => void;
}) {
  return (
    <section className="mt-10 flex flex-col gap-4" data-testid="events-where-to-go">
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
          Where to go
        </span>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[24px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
            Where to go in {monthName}
          </h2>
          <span className="text-[12px]" style={{ fontFamily: MONO, color: "var(--earn-muted)" }} data-testid="events-where-count">
            {rows.length} {rows.length === 1 ? "destination" : "destinations"}
            {vibe !== "all" ? ` · ${titleCase(vibe)}` : ""}
          </span>
        </div>
        <span className="text-[12.5px]" style={{ color: "var(--earn-muted)" }}>
          Recommendations based on weather, events and crowd levels. Best season first; a city we have not rated yet says so.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip on={vibe === "all"} label="All destinations" onClick={() => onVibe("all")} testId="events-vibe-all" />
        {VIBES.map((v) => (
          <Chip key={v} on={vibe === v.toLowerCase()} label={v} onClick={() => onVibe(v.toLowerCase())} testId={`events-vibe-${v.toLowerCase()}`} />
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-dashed p-4" style={{ borderColor: "var(--earn-border-dash)" }}>
          <b className="text-[15px]" style={{ color: "var(--earn-navy)" }}>
            No {vibe} destinations for {monthName} yet
          </b>
          <span className="text-[12.5px]" style={{ color: "var(--earn-muted)" }}>
            Try another month, or clear the filter to see every destination.
          </span>
          <button type="button" onClick={() => onVibe("all")} className="self-start rounded-[8px] border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)" }}>
            Clear filter
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => {
            const photo = cityEventPhoto(null, r.place.marketKey);
            const credit = photo ? resolveBillboardCredit(photo.src, LANDING_PHOTO_ATTRIBUTION as PhotoAttribution[]) : null;
            return (
              <article
                key={r.place.marketKey}
                className="flex flex-col overflow-hidden rounded-[14px] border"
                style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
                data-testid={`events-where-${r.place.marketKey}`}
                data-group={r.group}
              >
                {photo && credit && (
                  <div className="relative h-[110px]">
                    <img src={photo.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    <span className="absolute bottom-1.5 right-2 text-[9px] text-white/90" style={{ fontFamily: MONO }}>
                      City photo · {credit.creator} · {credit.site}
                    </span>
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1 p-3.5">
                  <span className="text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: MONO, color: GROUP_INK[r.group] }} data-testid={`events-where-group-${r.place.marketKey}`}>
                    {SEASON_GROUP_LABELS[r.group]}
                  </span>
                  <b className="text-[18px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
                    {r.place.city}
                  </b>
                  <span className="text-[12px]" style={{ color: "var(--earn-muted)" }}>
                    {r.place.country}
                  </span>
                  {r.facts && (
                    <span className="text-[12.5px]" style={{ color: "var(--earn-ink)" }}>
                      {r.facts}
                    </span>
                  )}
                  {r.season?.scope === "country" && (
                    <span className="text-[11px]" style={{ color: "var(--earn-muted)" }} data-testid={`events-where-scope-${r.place.marketKey}`}>
                      Rated for {r.place.country} as a whole
                    </span>
                  )}
                  {r.place.vibeTags.length > 0 && (
                    <span className="text-[11.5px]" style={{ color: "var(--earn-muted)" }}>
                      {r.place.vibeTags.slice(0, 3).map(titleCase).join(" · ")}
                    </span>
                  )}
                  {r.eventCount > 0 && (
                    <span className="text-[12px]" style={{ color: "var(--earn-teal-ink)" }}>
                      {r.eventCount} {r.eventCount === 1 ? "event" : "events"} in {monthName}
                    </span>
                  )}
                  <Link
                    href={`/destinations?city=${encodeURIComponent(r.place.city)}`}
                    className="mt-auto pt-1 text-[12.5px] font-semibold underline-offset-2 hover:underline"
                    style={{ color: "var(--earn-teal-ink)" }}
                  >
                    {`See ${r.place.city} in ${monthName}`}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
