import { MapPin, Zap, TrendingUp, TrendingDown, Users, Bell, Check, Sparkles, Gem, Plane, MessageCircle, Info, Calendar } from "lucide-react";
import { Link } from "wouter";

/**
 * Shared city card — one component behind every "city" surface (Discover trending
 * grid, landing-page trending strip, By-Date destinations). Purely presentational:
 * consumers normalize their data into these props and pass their own handlers, so a
 * change here lands everywhere at once instead of drifting across three copies.
 *
 * Styled with the Ways-to-Earn palette tokens (--earn-*), which carry both light and
 * dark values — so the card themes automatically.
 *
 * Two variants:
 *   - "pulse":  trending grid — pulse score, Hot/Trending, travelers, price, crowds, deal, gems
 *   - "season": By-Date view — season score /10, ideal-month, event/package/expert counts
 */

export interface CityCardExperience {
  label: string;
  href: string;
}

export interface CityCardProps {
  variant: "pulse" | "season";
  cityName: string;
  country: string;
  imageUrl?: string | null;

  /** pulse: 0–100 pulse score · season: 0–10 season score (rendered "/10") */
  score?: number | null;

  // top-left photo badges
  isHot?: boolean;
  trendLabel?: string | null; // season: "Ideal month" / "Good month"; pulse falls back to "Trending"
  activeTravelers?: number | null;
  alertCount?: number | null;
  inTrip?: boolean;

  // body
  highlight?: string | null;
  bestTime?: string | null; // appended to highlight ("· best Sep")
  temp?: string | null; // season
  vibeTags?: string[];

  // pulse economics
  avgPrice?: string | null;
  priceChangePct?: number | null; // negative = cheaper (green)
  crowdLevel?: string | null;
  dealAlert?: string | null;
  trendingSpots?: number | null;
  hiddenGems?: number | null;

  // season counts (honest — hidden when 0)
  eventsCount?: number;
  packagesCount?: number;
  expertsCount?: number;

  // actions
  primaryLabel: string;
  onPrimary?: () => void;
  secondaryLabel?: string; // season: "More info"
  onSecondary?: () => void;
  onAsk?: () => void;
  experiences?: CityCardExperience[];
  onCardClick?: () => void;
  testId?: string;
}

function crowdClasses(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("low")) return "text-[var(--earn-green-ink)] bg-[color:var(--earn-teal-wash)]";
  if (l.includes("high") || l.includes("very")) return "text-[var(--earn-coral-ink)] bg-[color:var(--earn-coral-bg)]";
  return "text-[var(--earn-gold-ink)] bg-[color:var(--earn-gold-wash)]";
}

export function CityCard(props: CityCardProps) {
  const {
    variant, cityName, country, imageUrl, score, isHot, trendLabel, activeTravelers,
    alertCount, inTrip, highlight, bestTime, temp, vibeTags = [], avgPrice, priceChangePct,
    crowdLevel, dealAlert, trendingSpots, hiddenGems, eventsCount = 0, packagesCount = 0,
    expertsCount = 0, primaryLabel, onPrimary, secondaryLabel, onSecondary, onAsk,
    experiences = [], onCardClick, testId,
  } = props;

  const priceDown = typeof priceChangePct === "number" && priceChangePct < 0;
  const countSegments = [
    eventsCount > 0 ? `🎆 ${eventsCount} ${eventsCount === 1 ? "event" : "events"}` : null,
    packagesCount > 0 ? `📔 ${packagesCount} ${packagesCount === 1 ? "trip" : "trips"}` : null,
    expertsCount > 0 ? `🧭 ${expertsCount} ${expertsCount === 1 ? "expert" : "experts"}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      onClick={onCardClick}
      role={onCardClick ? "button" : undefined}
      tabIndex={onCardClick ? 0 : undefined}
      onKeyDown={onCardClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick(); }
      } : undefined}
      aria-label={onCardClick ? `View ${cityName}` : undefined}
      className={`flex flex-col rounded-2xl overflow-hidden border transition-all duration-200 bg-[var(--earn-card)] border-[color:var(--earn-border)] hover:border-primary hover:shadow-[0_4px_16px_rgba(30,58,95,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${onCardClick ? "cursor-pointer" : ""}`}
      data-testid={testId}
    >
      {/* ── Photo (whole card is the click target; photo is presentational) ── */}
      <div className="relative h-40 w-full overflow-hidden group">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={cityName}
            className="w-full h-full object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[color:var(--earn-teal-wash)]">
            <MapPin className="h-10 w-10 text-[color:var(--earn-teal)]/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(20,32,45,0.62)] via-[rgba(20,32,45,0.12)] to-transparent" />

        {/* score pill (top-right) */}
        {typeof score === "number" && score > 0 && (
          <div className="absolute top-2.5 right-2.5 min-w-[38px] h-[38px] px-2 rounded-xl bg-white/95 shadow flex items-center justify-center gap-0.5">
            <span className="text-[15px] font-bold text-[var(--earn-teal-ink)] tabular-nums">{score}</span>
            {variant === "season" && <span className="text-[9px] font-semibold text-[var(--earn-muted)]">/10</span>}
          </div>
        )}

        {/* top-left badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {variant === "pulse" ? (
            isHot ? (
              <span className="px-2 py-0.5 rounded-md bg-[var(--earn-coral-ink)] text-white text-[11px] font-bold flex items-center gap-1"><Zap className="w-3 h-3 fill-white" />Hot</span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/95 text-[var(--earn-gold-ink)] text-[11px] font-bold flex items-center gap-1"><TrendingUp className="w-3 h-3" />Trending</span>
            )
          ) : (
            trendLabel && <span className="px-2 py-0.5 rounded-md bg-white/95 text-[var(--earn-gold-ink)] text-[11px] font-bold">☀️ {trendLabel}</span>
          )}
          {typeof activeTravelers === "number" && activeTravelers > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-white/90 text-gray-700 text-[11px] font-medium flex items-center gap-1 tabular-nums"><Users className="w-3 h-3" />{activeTravelers.toLocaleString()}</span>
          )}
          {typeof alertCount === "number" && alertCount > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-[var(--earn-coral-ink)] text-white text-[11px] font-medium flex items-center gap-1 tabular-nums"><Bell className="w-3 h-3" />{alertCount}</span>
          )}
        </div>

        {inTrip && (
          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[var(--earn-green)] text-[#14201b] text-[11px] font-bold flex items-center gap-1"><Check className="w-3 h-3" />In Trip</span>
        )}

        <div className="absolute bottom-2 left-3 right-14 z-[1]">
          <h3 className="text-lg font-bold text-white leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]">{cityName}</h3>
          <span className="text-xs text-white/85 flex items-center gap-1"><MapPin className="w-3 h-3" />{country}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-3.5 flex flex-col flex-1">
        {highlight && (
          <p className="text-[12.5px] leading-snug text-[var(--earn-teal-ink)] font-semibold mb-2 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{highlight}{bestTime ? <span className="text-[var(--earn-gold-ink)]"> · {bestTime}</span> : null}</span>
          </p>
        )}

        {(vibeTags.length > 0 || temp) && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {temp && <span className="text-[11px] text-[var(--earn-muted)] bg-[color:var(--earn-chip)] px-2 py-0.5 rounded-full">🌡 {temp}</span>}
            {vibeTags.slice(0, 3).map((t) => (
              <span key={t} className="text-[11px] text-[var(--earn-muted)] bg-[color:var(--earn-chip)] px-2 py-0.5 rounded-full capitalize">{t}</span>
            ))}
            {vibeTags.length > 3 && <span className="text-[11px] text-[var(--earn-muted)] bg-[color:var(--earn-chip)] px-2 py-0.5 rounded-full">+{vibeTags.length - 3}</span>}
          </div>
        )}

        {variant === "pulse" && (avgPrice || crowdLevel) && (
          <div className="flex items-center justify-between gap-2 mb-2.5">
            {avgPrice && (
              <span className="text-[15px] font-bold text-[var(--earn-navy)] tabular-nums flex items-center gap-1">
                ${avgPrice}<span className="text-[11px] font-medium text-[var(--earn-muted)]">/night</span>
                {typeof priceChangePct === "number" && priceChangePct !== 0 && (
                  <span className={`text-[11px] font-semibold flex items-center ${priceDown ? "text-[var(--earn-green-ink)]" : "text-[var(--earn-coral-ink)]"}`}>
                    {priceDown ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}{Math.abs(priceChangePct)}%
                  </span>
                )}
              </span>
            )}
            {crowdLevel && <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${crowdClasses(crowdLevel)}`}>{crowdLevel}</span>}
          </div>
        )}

        {variant === "pulse" && dealAlert && (
          <div className="flex items-start gap-2 rounded-xl px-2.5 py-2 mb-2.5 text-[11.5px] font-semibold text-[var(--earn-green-ink)] bg-[color:var(--earn-teal-wash)] border border-[color:var(--earn-border)]">
            💰<span className="line-clamp-2">{dealAlert}</span>
          </div>
        )}

        {/* stat footer */}
        {variant === "pulse" ? (
          <div className="flex items-center justify-between text-[11px] text-[var(--earn-muted)] border-t border-[color:var(--earn-border)] pt-2.5 mt-auto tabular-nums">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--earn-green)]" />Pulse {score ?? "—"}</span>
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{trendingSpots ?? 0} trending</span>
            <span className="flex items-center gap-1"><Gem className="w-3 h-3 text-[var(--earn-teal)]" />{hiddenGems ?? 0} gems</span>
          </div>
        ) : (
          countSegments.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-[var(--earn-muted)] border-t border-[color:var(--earn-border)] pt-2.5 mt-auto">
              {countSegments.map((s) => <span key={s}>{s}</span>)}
            </div>
          )
        )}

        {/* experience quick-links (§12 revenue entry) */}
        {experiences.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {experiences.slice(0, 3).map((ex) => (
              <Link key={ex.href} href={ex.href} onClick={(e) => e.stopPropagation()}>
                <span className="text-[11px] font-semibold text-[var(--earn-teal-ink)] bg-[color:var(--earn-teal-wash)] px-2.5 py-1 rounded-full inline-flex items-center gap-1 cursor-pointer hover:brightness-95">
                  <Plane className="w-3 h-3" />{ex.label}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* actions — neutral outline primary; the whole card handles navigation, so
            these are distinct actions and stopPropagation to not double-fire card click */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrimary?.(); }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary bg-transparent border border-primary hover:bg-primary/10 rounded-lg px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            data-testid={testId ? `${testId}-primary` : undefined}
          >
            {variant === "pulse" ? <Plane className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSecondary(); }}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--earn-muted)] bg-[var(--earn-card)] border border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)] hover:text-[var(--earn-teal-ink)] rounded-lg px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)]"
              data-testid={testId ? `${testId}-secondary` : undefined}
            >
              <Info className="w-3.5 h-3.5" />{secondaryLabel}
            </button>
          )}
          {onAsk && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAsk(); }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--earn-teal-ink)] bg-[color:var(--earn-teal-wash)] hover:brightness-95 rounded-lg px-2.5 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)]"
              data-testid={testId ? `${testId}-ask` : undefined}
              aria-label="Ask an expert"
            >
              <MessageCircle className="w-3.5 h-3.5" />Ask
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
