import React, { useState } from "react";
import { useImpressionTracker } from "@/hooks/use-impression-tracker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar, ExternalLink, Info, MapPin, Plus, Star, CheckCircle2, Wifi, Waves, Globe, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateGuestSessionId } from "@/lib/guest-session";
import { gemCategory, type MatchSuggestion } from "@/lib/feed-stream";
import { resolveBookability, type Bookability } from "@shared/bookability";
import { useAskExpert } from "@/lib/use-ask-expert";
import { normalizeGemScore } from "@/lib/gem-score";
import type { BentoCompactActionState } from "@/lib/bento-action-state";
import { isReferencePhoto } from "@/lib/photo-provenance";
import { ReferencePhotoChip } from "@/components/ui/reference-photo-chip";
import { ADD_TO_PLAN_LABEL } from "@/lib/plan-vocabulary";

// Bookability (native | deeplink | info_only) is DERIVED, never stored. The single
// source of truth is `resolveBookability` in @shared/bookability — both this client
// and the server (location-view payload) read it.

/**
 * Build srcSet + sizes for retina delivery.
 */
function buildSrcSet(url: string | null | undefined): { srcSet?: string; sizes: string } {
  const sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
  if (!url) return { sizes };
  if (url.includes("unsplash.com") || url.includes("images.unsplash.com")) {
    const [base, qs = ""] = url.split("?");
    const p1 = new URLSearchParams(qs);
    p1.set("w", "800");
    p1.set("auto", "format"); // AVIF/WebP for capable browsers
    p1.delete("fm");
    const p2 = new URLSearchParams(qs);
    p2.set("w", "1600");
    p2.set("auto", "format");
    p2.delete("fm");
    return { srcSet: `${base}?${p1} 800w, ${base}?${p2} 1600w`, sizes };
  }
  return { sizes };
}

// ─── Family-card grammar helpers (2026-08-25-card-family) ─────────────────────
// Mono face for the facts row / source row / count badges — same per-file local
// const pattern as expert-card.tsx and the feed/* panels.
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface CardFact {
  value: string;
  label: string;
  /** Optional per-fact testid, so a fact that re-homes an existing meta row keeps its id. */
  testid?: string;
}

/**
 * Three-column mono facts row (family grammar). §13: only REAL facts render —
 * an absent fact is omitted, never placeholdered — so the row can carry fewer
 * than three columns, and disappears entirely when the record has none.
 */
function FactsRow({ facts, testid }: { facts: CardFact[]; testid?: string }) {
  const real = facts.filter((f) => f.value && f.value.trim().length > 0).slice(0, 3);
  if (real.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 border-t border-border pt-2" data-testid={testid}>
      {real.map((f) => (
        <div key={f.label} className="min-w-0">
          <div
            className="text-[12.5px] font-semibold leading-none truncate"
            style={{ fontFamily: EARN_MONO }}
            data-testid={f.testid}
          >
            {f.value}
          </div>
          <div
            className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground truncate"
            style={{ fontFamily: EARN_MONO }}
          >
            {f.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Mono source row (2026-08-25-card-source-link): an in-platform id link when the
 * card resolves to a Traveloure entity, a plain partner LABEL when the source is
 * affiliate/external (never a raw partner URL on the face — §16), and nothing at
 * all when the card has no real source (§13).
 */
function SourceRow({
  href,
  label,
  testid,
}: {
  href?: string | null;
  label: string;
  testid?: string;
}) {
  if (!label) return null;
  const inner = (
    <span className="inline-flex items-center gap-1 min-w-0">
      <MapPin className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
  return (
    <div
      className="flex items-center text-[11px] text-muted-foreground"
      style={{ fontFamily: EARN_MONO }}
      data-testid={testid}
    >
      {href ? (
        <a
          href={href}
          className="inline-flex items-center gap-1 min-w-0 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

// ─── Compact-density helpers (2026-08-26-bento-compact-density) ────────────────
// Phase 2e Part A: the "compact" bento layout replaces the 3-column FactsRow with
// ONE mono meta line, truncates the title to a single line, and drops the photo
// band to 84px. §13 is unchanged — every meta fragment is omitted when its field
// is absent (joinMeta drops empty/whitespace parts), never placeholdered.
function joinMeta(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p) => p && String(p).trim().length > 0)
    .map((p) => String(p))
    .join(" · ");
}

/** Single mono meta line for compact cards. Renders nothing when empty (§13). */
function CompactMetaLine({ text, testid }: { text: string; testid?: string }) {
  if (!text) return null;
  return (
    <div
      className="text-[11px] text-muted-foreground truncate"
      style={{ fontFamily: EARN_MONO }}
      data-testid={testid}
    >
      {text}
    </div>
  );
}

/** A gem's area DISPLAY name — a real display field only (§13): `gem.neighborhood`
 *  is the slug and is never rendered; no display name ⇒ the area is omitted. */
function gemAreaName(gem: any): string | null {
  const v = gem?.neighborhoodName ?? gem?.neighborhood_name ?? gem?.areaName ?? null;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** Gem attribution (2026-08-29 Replit-audit rulings 1+2): the server resolves
 *  `curated_by_expert_id` into `gem.curatedBy` — a REAL user row or null, never
 *  a fabricated name (§13). These read only that resolved shape. */
function gemCurator(gem: any): { id: string; firstName: string | null; lastName: string | null; profileImageUrl?: string | null } | null {
  const c = gem?.curatedBy;
  return c && typeof c.id === "string" && c.id.length > 0 ? c : null;
}

/** Short display name for a curator ("Yuki"); null when nothing real to show. */
function gemCuratorShortName(gem: any): string | null {
  const c = gemCurator(gem);
  if (!c) return null;
  const name = (c.firstName ?? "").trim() || (c.lastName ?? "").trim();
  return name.length > 0 ? name : null;
}

/** Full display name for a curator ("Yuki Tanaka"); null when nothing real to show. */
function gemCuratorFullName(gem: any): string | null {
  const c = gemCurator(gem);
  if (!c) return null;
  const name = [c.firstName, c.lastName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name.length > 0 ? name : null;
}

/** Compact duration label (Phase 2f): whole hours read "{n} hr(s)", anything else
 *  "{n} min". §13: no duration field ⇒ null (the fragment is omitted, not zeroed). */
function compactDuration(mins: unknown): string | null {
  const n = typeof mins === "number" ? mins : Number(mins);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n % 60 === 0) {
    const h = n / 60;
    return `${h} hr${h === 1 ? "" : "s"}`;
  }
  return `${n} min`;
}

/**
 * The compact meta line's SOURCE fragment (Phase 2f + 2026-08-25-card-source-link):
 * a provider HANDLE resolves to an in-platform storefront link (`/s/:handle`); a
 * provider NAME with no handle is a plain label (no link — there is no id to key on);
 * affiliate supply is a partner LABEL ("via {Partner}", never a raw URL — §16). §13:
 * a row with no attributable source returns null and the fragment is omitted.
 */
function compactSource(item: any): { label: string; href: string | null } | null {
  const handle = item?.providerHandle ?? item?.expertHandle ?? item?.handle;
  if (typeof handle === "string" && handle.trim().length > 0) {
    const h = handle.trim().replace(/^@/, "");
    return { label: `@${h}`, href: `/s/${h}` };
  }
  const name = item?.providerName ?? item?.expertName ?? item?.vendorName;
  if (typeof name === "string" && name.trim().length > 0) {
    return { label: name.trim(), href: null };
  }
  const partner = item?.affiliatePartner ?? item?.partnerName ?? item?.supplierName;
  if (typeof partner === "string" && partner.trim().length > 0) {
    return { label: `via ${partner.trim()}`, href: null };
  }
  return null;
}

/** Compact meta line carrying an optional LINKED source fragment (Phase 2f). The
 *  duration is plain mono text; the source is a storefront link when it has an href,
 *  a plain label otherwise. Renders nothing when both are absent (§13). */
function CompactSourceMetaLine({
  duration,
  source,
  testid,
}: {
  duration: string | null;
  source: { label: string; href: string | null } | null;
  testid?: string;
}) {
  if (!duration && !source) return null;
  return (
    <div
      className="text-[11px] text-muted-foreground truncate"
      style={{ fontFamily: EARN_MONO }}
      data-testid={testid}
    >
      {duration && <span>{duration}</span>}
      {duration && source && <span> · </span>}
      {source &&
        (source.href ? (
          <a href={source.href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {source.label}
          </a>
        ) : (
          <span>{source.label}</span>
        ))}
    </div>
  );
}

/** Make a whole card the link (family grammar): Enter/Space activate too. */
function cardLinkProps(onActivate: () => void) {
  return {
    role: "link" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** §4a: a passive cue that makes the card-body detail path discoverable. */
function CompactInfoCue({ testid }: { testid: string }) {
  return (
    <Info
      aria-hidden="true"
      className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5"
      style={{ color: "var(--earn-muted)" }}
      data-testid={testid}
    />
  );
}

// ─── Type metadata ─────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  emoji: string;
  tagBg: string;
  tagText: string;
  phBg: string;
  phText: string;
  /** Photo-band fallback gradient (family grammar: gradient + tag, no grey box). */
  phGrad: string;
}

function gemTypeMeta(placeType: string | null | undefined): TypeMeta {
  const cat = gemCategory(placeType);
  const t = (placeType ?? "").toLowerCase();

  if (cat === "photo_spots") {
    return { label: "Photo spot", emoji: "📷", tagBg: "bg-teal-50", tagText: "text-teal-700", phBg: "bg-teal-50", phText: "text-teal-600", phGrad: "bg-gradient-to-br from-teal-50 via-teal-100 to-teal-200/70" };
  }
  if (cat === "stay") {
    const isMarquee = ["ryokan", "resort", "boutique"].some((k) => t.includes(k));
    return {
      label: isMarquee ? "Marquee stay" : "Stay",
      emoji: isMarquee ? "🏯" : "🏨",
      tagBg: "bg-blue-50",
      tagText: "text-blue-700",
      phBg: "bg-blue-50",
      phText: "text-blue-600",
      phGrad: "bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200/70",
    };
  }
  if (cat === "eat") {
    return { label: "Eat", emoji: "🍵", tagBg: "bg-pink-50", tagText: "text-pink-700", phBg: "bg-pink-50", phText: "text-pink-600", phGrad: "bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200/70" };
  }

  // "do" — distinguish landmark, day-trip, and general attraction
  const isLandmark = ["temple", "shrine", "palace", "castle", "landmark", "monument"].some((k) => t.includes(k));
  const isDayTrip = ["day trip", "day-trip", "daytrip"].some((k) => t.includes(k));
  if (isDayTrip) {
    return { label: "Day trip", emoji: "🚌", tagBg: "bg-indigo-50", tagText: "text-indigo-700", phBg: "bg-indigo-50", phText: "text-indigo-600", phGrad: "bg-gradient-to-br from-indigo-50 via-indigo-100 to-indigo-200/70" };
  }
  if (isLandmark) {
    return { label: "Landmark", emoji: "🌉", tagBg: "bg-stone-100", tagText: "text-stone-700", phBg: "bg-stone-100", phText: "text-stone-600", phGrad: "bg-gradient-to-br from-stone-100 via-stone-200 to-stone-300/70" };
  }
  return { label: "Do", emoji: "⛩", tagBg: "bg-amber-50", tagText: "text-amber-800", phBg: "bg-amber-50", phText: "text-amber-700", phGrad: "bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200/70" };
}

// ─── Three-state action row (family grammar) ──────────────────────────────────
// Book now (teal) / Add to trip (navy) / Ask an expert (outline). The teal and
// navy fills come from the earn tokens; every handler stops propagation so the
// card-as-link container never double-fires.
const BOOK_BTN_STYLE = { background: "var(--earn-teal)", color: "#fff", border: "none" } as const;
const ADD_BTN_STYLE = { background: "var(--earn-navy)", color: "#fff", border: "none" } as const;

// ─── Booking badge ─────────────────────────────────────────────────────────────

function BookingBadge({ level, trending }: { level: Bookability; trending?: boolean }) {
  if (trending) {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-orange-100 text-orange-700 whitespace-nowrap">
        🔥 Trending
      </span>
    );
  }
  if (level === "native") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-teal-50 text-teal-700 whitespace-nowrap">
        Book on Traveloure
      </span>
    );
  }
  if (level === "deeplink") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-blue-50 text-blue-700 whitespace-nowrap">
        Affiliate link
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-500 whitespace-nowrap">
      Not bookable
    </span>
  );
}

// ─── Match strip ──────────────────────────────────────────────────────────────

function MatchedServiceStrip({
  suggestion,
  id,
  city,
}: {
  suggestion: MatchSuggestion;
  id: string;
  city?: string;
}) {
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isRequest = suggestion.isRequest === true;

  async function handleRequest() {
    if (requested || submitting || !suggestion.offeringTypeKey) return;
    setSubmitting(true);
    try {
      const resp = await fetch("/api/services/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringTypeKey: suggestion.offeringTypeKey,
          city: city ?? "",
          guestSessionId: getOrCreateGuestSessionId(),
        }),
      });
      // Dead endpoints return 200-HTML via the Vite catch-all (CLAUDE.md §9), so resp.ok
      // alone would show a FALSE "Request recorded" success. Require a real JSON response.
      const isJson = (resp.headers.get("content-type") ?? "").includes("application/json");
      if (!resp.ok || !isJson) throw new Error(`Request failed: ${resp.status}`);
      setRequested(true);
      toast({
        title: "Request recorded",
        description: `We'll notify you when ${suggestion.matchText} becomes available.`,
      });
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="border-t border-dashed border-border pt-2 mt-1 flex items-center gap-2 flex-wrap"
      data-testid={`suggestion-${id}`}
    >
      <span className="text-[11px] text-muted-foreground flex-1 min-w-[100px]">
        {suggestion.icon}{" "}
        {isRequest ? (
          <span className="text-foreground font-semibold">{suggestion.matchText}</span>
        ) : (
          <>
            matched:{" "}
            <strong className="text-foreground font-semibold">{suggestion.matchText}</strong>
          </>
        )}
      </span>
      {isRequest ? (
        requested ? (
          <span
            className="flex items-center gap-1 text-[11px] text-green-700 font-semibold flex-shrink-0"
            data-testid={`status-requested-service-${id}`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Requested
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2.5 flex-shrink-0 font-semibold border-dashed"
            disabled={submitting}
            data-testid={`btn-request-service-${id}`}
            data-offering-type={suggestion.offeringTypeKey}
            onClick={handleRequest}
          >
            {suggestion.actionLabel}
          </Button>
        )
      ) : (
        <Button
          size="sm"
          className={cn(
            "h-6 text-[11px] px-2.5 flex-shrink-0 font-semibold",
            suggestion.actionVariant === "affiliate"
              ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
              : "",
          )}
          asChild
        >
          <a href={suggestion.href}>{suggestion.actionLabel}</a>
        </Button>
      )}
    </div>
  );
}

// ─── More Info Sheet ──────────────────────────────────────────────────────────

type MoreInfoCardType = "gem" | "event" | "vendor-service" | "supply";

interface MoreInfoSheetProps {
  open: boolean;
  onClose: () => void;
  cardType: MoreInfoCardType;
  data: any;
}

function MoreInfoSheet({ open, onClose, cardType, data }: MoreInfoSheetProps) {
  // Thin gem detail (2026-08-29 Replit-audit ruling 3): the sheet renders the
  // ruled TEASER set only. Address, the locals-vs-tourists popularity ratio,
  // the "goes mainstream" forecast and the discovery status were REMOVED —
  // the server no longer ships them (shared/gem-teaser.ts) and this render
  // must not resurrect them from a stale or hand-built payload.
  const renderGemContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {/* Byline (2026-08-29 Replit-audit ruling 1): server-resolved curator only —
          no curatedBy ⇒ no byline, never a fabricated attribution (§13). */}
      {gemCuratorFullName(data) && (
        <p
          className="text-[12px] text-muted-foreground"
          style={{ fontFamily: EARN_MONO }}
          data-testid={`gem-curated-by-${data.id}`}
        >
          Curated by {gemCuratorFullName(data)}
        </p>
      )}

      {data.description && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
        </div>
      )}

      {Array.isArray(data.bestFor) && data.bestFor.length > 2 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">Best for</p>
          <div className="flex flex-wrap gap-1.5">
            {(data.bestFor as string[]).map((tag) => (
              <span key={tag} className="text-[11px] bg-amber-50 text-amber-800 rounded-full px-2.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.whyLocalsLoveIt && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Why locals love it</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.whyLocalsLoveIt}</p>
        </div>
      )}
    </div>
  );

  const renderEventContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {(data.description || data.shortDescription) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description || data.shortDescription}</p>
        </div>
      )}

      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">Highlights</p>
          <ul className="flex flex-col gap-1">
            {(data.highlights as string[]).map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <span className="text-amber-500 mt-0.5">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.venueName || data.venueAddress) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Venue</p>
          {data.venueName && <p className="text-[13px] text-foreground">{data.venueName}</p>}
          {data.venueAddress && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(data.venueAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-[13px] text-blue-600 hover:underline mt-0.5"
              data-testid="link-event-venue"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {data.venueAddress}
            </a>
          )}
        </div>
      )}

      {data.tips && (
        <div className="bg-amber-50 rounded-lg px-3 py-2.5">
          <p className="text-[12px] font-semibold text-amber-700 mb-0.5">Tips</p>
          <p className="text-[13px] text-amber-800 leading-relaxed">{data.tips}</p>
        </div>
      )}

      {(data.category || data.subcategory) && (
        <div className="flex gap-2">
          {data.category && (
            <span className="text-[11px] bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground capitalize">{data.category}</span>
          )}
          {data.subcategory && (
            <span className="text-[11px] bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground capitalize">{data.subcategory}</span>
          )}
        </div>
      )}
    </div>
  );

  const renderVendorServiceContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {data.description && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
        </div>
      )}

      {Array.isArray(data.whatIncluded) && data.whatIncluded.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">What's included</p>
          <ul className="flex flex-col gap-1">
            {(data.whatIncluded as string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.requirements && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Requirements</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.requirements}</p>
        </div>
      )}

      {(data.meetingPoint || data.pickupAvailable != null) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Meeting point</p>
          {data.meetingPoint && <p className="text-[13px] text-muted-foreground">{data.meetingPoint}</p>}
          {data.pickupAvailable != null && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {data.pickupAvailable ? "✓ Hotel pickup available" : "No pickup — self-arrival"}
            </p>
          )}
        </div>
      )}

      {data.cancellationPolicy && (
        <div className="bg-muted rounded-lg px-3 py-2.5">
          <p className="text-[12px] font-semibold text-foreground mb-0.5">Cancellation policy</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.cancellationPolicy}</p>
        </div>
      )}
    </div>
  );

  const renderSupplyContent = () => {
    const isHotel = data._kind === "supply-hotel";
    return (
      <div className="flex flex-col gap-4 pt-2">
        {data.description && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
          </div>
        )}

        {data.address && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Address</p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(data.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-[13px] text-blue-600 hover:underline"
              data-testid="link-supply-address"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {data.address}
            </a>
          </div>
        )}

        {isHotel && Array.isArray(data.amenities) && data.amenities.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1.5">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {(data.amenities as string[]).map((a) => (
                <span key={a} className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  {a.toLowerCase().includes("wifi") ? <Wifi className="w-2.5 h-2.5" /> : <Waves className="w-2.5 h-2.5" />}
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {(data.rating || data.reviewCount) && (
          <div className="bg-amber-50 rounded-lg px-3 py-2.5">
            <p className="text-[12px] font-semibold text-amber-700 mb-0.5">Guest reviews</p>
            <div className="flex items-center gap-1.5">
              {data.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-[14px] font-bold text-foreground">{data.rating}</span>
                </div>
              )}
              {data.reviewCount && (
                <span className="text-[12px] text-muted-foreground">· {Number(data.reviewCount).toLocaleString()} reviews</span>
              )}
            </div>
          </div>
        )}

        {!isHotel && data.durationMinutes && (
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Duration: {data.durationMinutes >= 60
              ? `${Math.floor(data.durationMinutes / 60)}h ${data.durationMinutes % 60 > 0 ? `${data.durationMinutes % 60}m` : ""}`
              : `${data.durationMinutes}m`}
            </span>
          </div>
        )}

        {/* Secondary outbound link (F6): bookings stay on-site — the external partner
            link is available here, not on the card face. Keeps the affiliate track. */}
        {(data.bookingLink || data.externalUrl || data.url) && (
          <a
            href={data.bookingLink || data.externalUrl || data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              const impId = typeof data._getImpressionId === "function" ? data._getImpressionId() : undefined;
              fetch("/api/affiliates/track", {
                method: "POST",
                keepalive: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ partner: "discover-supply", destination: data._city ?? "", contentType: data._kind, contentId: String(data.id ?? ""), impressionId: impId }),
              }).catch(() => {});
            }}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            data-testid={`link-partner-site-${data.id}`}
          >
            Partner site <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  };

  const titleMap: Record<MoreInfoCardType, string> = {
    gem: data.placeName ?? "Gem details",
    event: data.title ?? data.name ?? "Event details",
    "vendor-service": data.serviceName ?? "Service details",
    supply: data.name ?? data.title ?? "Details",
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl px-5 pb-8">
        <SheetHeader className="mb-2">
          <SheetTitle className="text-left text-[17px] leading-snug pr-8">{titleMap[cardType]}</SheetTitle>
        </SheetHeader>
        {cardType === "gem" && renderGemContent()}
        {cardType === "event" && renderEventContent()}
        {cardType === "vendor-service" && renderVendorServiceContent()}
        {cardType === "supply" && renderSupplyContent()}
      </SheetContent>
    </Sheet>
  );
}

// ─── Gem card ─────────────────────────────────────────────────────────────────

interface CityFeedCardGemProps {
  gem: any;
  city: string;
  scheduledDate?: string | null;
  bookability?: Bookability;
  onAdd?: (item: any) => void;
  compact?: boolean;
  layout?: "column" | "row";
  className?: string;
  cardPosition?: number;
  /** Marquee gem inside a neighborhood container — renders a "Top pick" chip on the image. */
  topPick?: boolean;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" renders the
   *  tighter ~200px bento tile; "full" (default) is byte-identical to today. */
  density?: "full" | "compact";
  compactActionState?: BentoCompactActionState;
}

export function CityFeedCardGem({
  gem,
  city,
  scheduledDate,
  bookability,
  onAdd,
  compact = false,
  layout = "column",
  className,
  cardPosition,
  topPick = false,
  density = "full",
  compactActionState,
}: CityFeedCardGemProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const askExpert = useAskExpert();
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);

  const resolvedBookability: Bookability = bookability ?? resolveBookability(gem);
  // DISABLED: GET /api/gems/:id/matched-service has no server implementation — every gem
  // card was firing a dead fetch (200-HTML via the Vite catch-all) per render. Re-enable
  // when the matched-service endpoint ships; the strip + suggestion-first Book href below
  // are already wired for it.
  const { data: suggestion } = useQuery<MatchSuggestion | null>({
    queryKey: [`/api/gems/${gem.id}/matched-service`],
    staleTime: 5 * 60 * 1000,
    enabled: false,
  });

  // Book/Reserve destination — §16 sanitized at the read layer.
  //
  // This used to fall through to the gem record's OWN partner-URL fields
  // (affiliateUrl / affiliateLink / bookingUrl / externalUrl), which are free-shape values
  // carried on gem-ish feed records: an off-site partner booking CTA rendered straight from
  // stored data, exactly what §16 forbids. Only IN-PLATFORM destinations are accepted now
  // (a matched platform service, the gem's provider service, or a relative platform path);
  // any absolute off-site URL is dropped. Historical stored rows are NOT rewritten (no data
  // migration) — the client simply stops reading the partner-URL fields. Without an
  // in-platform destination the Book button doesn't render at all (honest no-link state);
  // the card keeps its informational body, "Ask" and "More info" actions. Never "#", never
  // a fabricated link.
  const platformPath: string | null =
    typeof gem.platformBookingUrl === "string" && gem.platformBookingUrl.startsWith("/")
      ? gem.platformBookingUrl
      : null;
  const bookHref: string | null =
    suggestion?.href ??
    (gem.providerServiceId ? `/services/${gem.providerServiceId}` : null) ??
    platformPath;
  const compactHasBookAction =
    compactActionState === "platform" &&
    resolvedBookability !== "info_only" &&
    Boolean(bookHref);
  const typeMeta = gemTypeMeta(gem.placeType);
  const gemScore = normalizeGemScore(gem.gemScore);
  const isTrending = gemScore !== null && gemScore >= 85;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : ADD_TO_PLAN_LABEL;
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  const isRow = layout === "row";

  const { ref: impressionRef, getImpressionId } = useImpressionTracker("gem", gem.id, city, cardPosition);

  // Body copy: prefer whyLocalsLoveIt, fall back to description
  const bodyText = gem.whyLocalsLoveIt || gem.description;

  // bestFor chips — show first 2 on card face
  const bestForFace: string[] = Array.isArray(gem.bestFor) ? (gem.bestFor as string[]).slice(0, 2) : [];

  // Photo / placeholder area — family grammar: the no-photo fallback is the
  // kind-tinted GRADIENT carrying the kind tag, never a grey box.
  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center",
        typeMeta.phGrad,
        typeMeta.phText,
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {!loading && photoUrl && (
        <img
          src={photoUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={gem.placeName}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* No-photo fallback is the kind gradient ALONE — no emoji glyph (Phase 2d). */}
      {/* Every gems[]-sourced tile carries the Hidden gem tag — green wash, mono. */}
      <span
        className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
        style={{ fontFamily: EARN_MONO }}
        data-testid={`gem-hidden-tag-${gem.id}`}
      >
        Hidden gem
      </span>
      {topPick && (
        <span
          className="absolute top-2 right-2 bg-foreground/80 text-background text-[10px] font-medium rounded-full px-2 py-0.5"
          data-testid={`gem-top-pick-${gem.id}`}
        >
          Top pick
        </span>
      )}
      {/* Tier-1 reference-photo chip (2026-09-01-photo-tiers): a stock/places image on this
          TEASER surface is labeled until an attributed real photo replaces it. Non-stock
          (attributed) photos and the no-photo gradient carry no chip. */}
      {!loading && photoUrl && isReferencePhoto({ url: photoUrl }) && (
        <ReferencePhotoChip testId={`gem-reference-photo-${gem.id}`} />
      )}
    </div>
  );

  // Card body
  const cardBody = (
    <div className={cn("p-3 flex flex-col gap-1.5 flex-1 min-w-0")}>
      {/* Type tag + booking badge + priceRange */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
            typeMeta.tagBg,
            typeMeta.tagText,
          )}
        >
          {typeMeta.label}
        </span>
        <BookingBadge level={resolvedBookability} trending={isTrending} />
        {gem.priceRange && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600" data-testid={`gem-price-range-${gem.id}`}>
            {gem.priceRange}
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {gem.placeName}
      </h3>

      {/* Body copy: whyLocalsLoveIt or description — column layout */}
      {!compact && !isRow && bodyText && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{bodyText}</p>
      )}

      {/* Row layout body copy */}
      {isRow && bodyText && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{bodyText}</p>
      )}

      {/* bestFor chips */}
      {!compact && bestForFace.length > 0 && (
        <div className="flex gap-1 flex-wrap" data-testid={`gem-best-for-chips-${gem.id}`}>
          {bestForFace.map((tag) => (
            <span key={tag} className="text-[10px] bg-amber-50 text-amber-800 rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Neighborhood tag — display name only, never the slug (§13 / Phase 2d) */}
      {gemAreaName(gem) && !isRow && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span>{gemAreaName(gem)}</span>
        </div>
      )}

      {/* Matched-service suggestion strip */}
      {!compact && suggestion && <MatchedServiceStrip suggestion={suggestion} id={gem.id} city={city} />}

      {/* Facts row (family grammar) — real record fields only, §13 */}
      {!compact && (
        <FactsRow
          facts={[
            { value: gemScore !== null ? String(gemScore) : "", label: "gem score" },
            { value: gemAreaName(gem) ?? "", label: "area" },
            { value: bestForFace[0] ?? "", label: "best for" },
          ]}
          testid={`gem-facts-${gem.id}`}
        />
      )}

      {/* Three-state action row (family grammar): Book now teal / Add to trip
          navy / Ask an expert outline. No "More info" text link — the CARD is
          the link (it opens the details sheet). */}
      {!compact && (
        <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
          {resolvedBookability !== "info_only" && bookHref && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              style={BOOK_BTN_STYLE}
              asChild
              onClick={(e) => {
                e.stopPropagation();
                const impId = getImpressionId();
                fetch("/api/affiliates/track", {
                  method: "POST",
                  keepalive: true,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ partner: "discover", destination: city, contentType: "gem", contentId: String(gem.id), impressionId: impId }),
                }).catch(() => {});
              }}
            >
              {/* bookHref is always an in-platform path (§16 sanitization above) — no
                  target=_blank / off-site hop remains on this CTA. */}
              <a href={bookHref}>
                {resolvedBookability === "deeplink" ? "Reserve" : "Book now"}
              </a>
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            style={ADD_BTN_STYLE}
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.({
                title: gem.placeName,
                description: gem.description,
                city,
                type: "gem",
                scheduledDate,
                sourceImpressionId: getImpressionId(),
                sourceContentId: gem.id,
              });
            }}
            data-testid={`btn-add-gem-${gem.id}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              askExpert({
                city,
                subject: gem.placeName,
                expertId: gemCurator(gem)?.id ?? null,
                fallbackName: gemCuratorFullName(gem),
                fallbackAvatar: gemCurator(gem)?.profileImageUrl ?? null,
              });
            }}
            data-testid={`btn-ask-gem-${gem.id}`}
          >
            {gemCuratorShortName(gem) ? `Ask ${gemCuratorShortName(gem)}` : "Ask an expert"}
          </Button>
        </div>
      )}
    </div>
  );

  // ─── Compact density (2026-08-26-bento-compact-density) ─────────────────────
  // One mono meta line stands in for the facts row / body / chips; the card stays
  // the link (opens the same details sheet). §13: score/best-for/area each omitted
  // when absent.
  if (density === "compact") {
    const gemScoreStr = gemScore !== null ? String(gemScore) : null;
    // Byline fragment (rulings 1+2): only a server-resolved curator renders;
    // no attribution ⇒ the fragment is omitted (§13), never placeholdered.
    const curatorName = gemCuratorShortName(gem);
    const metaText = joinMeta(
      gemScoreStr,
      bestForFace[0] ? `best for ${bestForFace[0]}` : null,
      gemAreaName(gem),
      curatorName ? `curated by ${curatorName}` : null,
    );
    return (
      <>
        <div
          ref={impressionRef}
          className={cn(
            "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow h-full cursor-pointer flex flex-col",
            className,
          )}
          data-testid={`feed-card-gem-${gem.id}`}
          aria-label={`${gem.placeName} details`}
          {...cardLinkProps(() => setSheetOpen(true))}
        >
          {/* §4a: the card body is the detail path; this passive cue makes it discoverable. */}
          <div
            className={cn(
              "relative overflow-hidden flex-shrink-0 flex items-center justify-center h-[84px] w-full",
              typeMeta.phGrad,
              typeMeta.phText,
            )}
          >
            {!loading && photoUrl && (
              <img
                src={photoUrl}
                srcSet={srcSet}
                sizes={sizes}
                alt={gem.placeName}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0",
                )}
              />
            )}
            <span
              className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              style={{ fontFamily: EARN_MONO }}
              data-testid={`gem-hidden-tag-${gem.id}`}
            >
              Hidden gem
            </span>
            <CompactInfoCue testid={`info-cue-gem-${gem.id}`} />
            {topPick && (
              <span
                className="absolute top-9 right-2 bg-foreground/80 text-background text-[10px] font-medium rounded-full px-2 py-0.5"
                data-testid={`gem-top-pick-${gem.id}`}
              >
                Top pick
              </span>
            )}
            {/* Tier-1 reference-photo chip (2026-09-01-photo-tiers) — see full-density note above. */}
            {!loading && photoUrl && isReferencePhoto({ url: photoUrl }) && (
              <ReferencePhotoChip testId={`gem-reference-photo-${gem.id}`} />
            )}
          </div>
          <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">
              {gem.placeName}
            </h3>
            <CompactMetaLine text={metaText} testid={`gem-facts-${gem.id}`} />
            <div className="flex gap-1.5 pt-0.5 items-center mt-auto">
              {compactHasBookAction && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  style={BOOK_BTN_STYLE}
                  asChild
                  onClick={(e) => {
                    e.stopPropagation();
                    const impId = getImpressionId();
                    fetch("/api/affiliates/track", {
                      method: "POST",
                      keepalive: true,
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ partner: "discover", destination: city, contentType: "gem", contentId: String(gem.id), impressionId: impId }),
                    }).catch(() => {});
                  }}
                >
                  <a href={bookHref ?? undefined}>{resolvedBookability === "deeplink" ? "Reserve" : "Book now"}</a>
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={ADD_BTN_STYLE}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.({
                    title: gem.placeName,
                    description: gem.description,
                    city,
                    type: "gem",
                    scheduledDate,
                    sourceImpressionId: getImpressionId(),
                    sourceContentId: gem.id,
                  });
                }}
                data-testid={`btn-add-gem-${gem.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                {addLabel}
              </Button>
              {/* Compact = exactly two buttons: Ask shows ONLY when Book is absent.
                  Ruling 2: an attributed gem's Ask targets ITS curator by name;
                  otherwise the honest city-resolution fallback stands. */}
              {!compactHasBookAction && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    askExpert({
                      city,
                      subject: gem.placeName,
                      expertId: gemCurator(gem)?.id ?? null,
                      fallbackName: gemCuratorFullName(gem),
                      fallbackAvatar: gemCurator(gem)?.profileImageUrl ?? null,
                    });
                  }}
                  data-testid={`btn-ask-gem-${gem.id}`}
                >
                  {curatorName ? `Ask ${curatorName}` : "Ask an expert"}
                </Button>
              )}
            </div>
          </div>
        </div>
        <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="gem" data={gem} />
      </>
    );
  }

  return (
    <>
      <div
        ref={impressionRef}
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow h-full cursor-pointer",
          isRow ? "flex flex-row" : "flex flex-col",
          className,
        )}
        data-testid={`feed-card-gem-${gem.id}`}
        aria-label={`${gem.placeName} details`}
        {...cardLinkProps(() => setSheetOpen(true))}
      >
        {photoArea}
        {cardBody}
      </div>
      <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="gem" data={gem} />
    </>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

interface CityFeedCardEventProps {
  event: any;
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
  cardPosition?: number;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" bento tile;
   *  "full" (default) renders byte-identical to today. */
  density?: "full" | "compact";
  compactActionState?: BentoCompactActionState;
}

export function CityFeedCardEvent({ event, city, scheduledDate, onAdd, className, cardPosition, density = "full", compactActionState: _compactActionState }: CityFeedCardEventProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const askExpert = useAskExpert();
  const dbImageUrl = event.image || event.imageUrl || null;
  const eventName = event.title || event.name || "";
  const { photoUrl, loading } = useGemPhoto(
    `event-${event.id ?? event.eventId ?? eventName}`,
    eventName,
    city,
    dbImageUrl,
  );

  const bookability: Bookability = resolveBookability({ ...event, externalUrl: event.url });
  const { ref: impressionRefEvt, getImpressionId: getImpIdEvt } = useImpressionTracker(
    "event",
    String(event.id ?? event.eventId ?? eventName),
    city,
    cardPosition,
  );
  const eventSuggestion: MatchSuggestion = {
    icon: "🎫",
    matchText: "tickets available",
    actionLabel: "Tickets",
    actionVariant: "affiliate",
    href: event.url || "/experiences",
  };
  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : ADD_TO_PLAN_LABEL;
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  // Price chip
  const priceChip = event.isFree
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-green-50 text-green-700" data-testid={`event-free-badge-${event.id}`}>Free</span>
    : (event.priceRange || event.minPrice)
      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600" data-testid={`event-price-${event.id}`}>{event.priceRange ?? `From $${event.minPrice}`}</span>
      : null;

  // ─── Compact density (2026-08-26-bento-compact-density) ─────────────────────
  // §13: date short (e.g. "Mar 12"); second fragment is venue when present, else
  // price; each omitted when absent. Keeps the Tickets/Add/Ask action row.
  if (density === "compact") {
    const dateStr = event.date
      ? new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
    const venueStr = event.venueName ? String(event.venueName) : null;
    const priceStr = event.isFree
      ? "Free"
      : event.priceRange ?? (event.minPrice ? `From $${event.minPrice}` : null);
    const metaText = joinMeta(dateStr, venueStr ?? priceStr);
    return (
      <>
        <div
          ref={impressionRefEvt}
          className={cn(
            "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
            className,
          )}
          data-testid={`feed-card-event-${event.id ?? event.eventId}`}
          aria-label={`${eventName} details`}
          {...cardLinkProps(() => setSheetOpen(true))}
        >
          <div className="h-[84px] relative overflow-hidden bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200/70 flex items-center justify-center text-pink-600 flex-shrink-0">
            {photoUrl && (
              <img
                src={photoUrl}
                srcSet={srcSet}
                sizes={sizes}
                alt={eventName}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
              />
            )}
            <span
              className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-pink-50 text-pink-700"
              style={{ fontFamily: EARN_MONO }}
            >
              Event
            </span>
            <CompactInfoCue testid={`info-cue-event-${event.id ?? event.eventId}`} />
          </div>
          <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">{eventName}</h3>
            <CompactMetaLine text={metaText} testid={`event-facts-${event.id}`} />
            <div className="flex gap-1.5 pt-0.5 items-center mt-auto">
              {event.url && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  style={{ background: "var(--earn-gold-ink)", color: "#fff", border: "none" }}
                  asChild
                  onClick={(e) => {
                    e.stopPropagation();
                    const impId = getImpIdEvt();
                    fetch("/api/affiliates/track", {
                      method: "POST",
                      keepalive: true,
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ partner: "discover-event", destination: city, contentType: "event", contentId: String(event.id), impressionId: impId }),
                    }).catch(() => {});
                  }}
                >
                  <a href={event.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Tickets
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={ADD_BTN_STYLE}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.({
                    title: eventName,
                    city,
                    type: "event",
                    scheduledDate,
                    sourceImpressionId: getImpIdEvt(),
                    sourceContentId: String(event.id ?? event.eventId ?? ""),
                  });
                }}
                data-testid={`btn-add-event-${event.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                {addLabel}
              </Button>
              {/* Compact = exactly two buttons: Tickets IS the book action, so Ask
                  shows ONLY when there is no ticket url. */}
              {!event.url && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    askExpert({ city, subject: eventName });
                  }}
                  data-testid={`btn-ask-event-${event.id}`}
                >
                  Ask an expert
                </Button>
              )}
            </div>
          </div>
        </div>
        <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="event" data={event} />
      </>
    );
  }

  return (
    <>
      <div
        ref={impressionRefEvt}
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
          className,
        )}
        data-testid={`feed-card-event-${event.id ?? event.eventId}`}
        aria-label={`${eventName} details`}
        {...cardLinkProps(() => setSheetOpen(true))}
      >
        {/* Family grammar: gradient + tag fallback, no grey box. */}
        <div className="h-[104px] relative overflow-hidden bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200/70 flex items-center justify-center text-pink-600 flex-shrink-0">
          {photoUrl && (
            <img
              src={photoUrl}
              srcSet={srcSet}
              sizes={sizes}
              alt={eventName}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {/* No-photo fallback is the gradient alone — no glyph (Phase 2d). */}
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-pink-50 text-pink-700">
              Event{event.date ? ` · ${new Date(event.date).toLocaleDateString("en-US", { month: "short" })}` : ""}
            </span>
            <BookingBadge level={bookability} />
            {priceChip}
          </div>

          <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{eventName}</h3>

          {/* 2-line description */}
          {(event.description || event.shortDescription) && (
            <p className="text-[12px] text-muted-foreground line-clamp-2" data-testid={`event-description-${event.id}`}>
              {event.description || event.shortDescription}
            </p>
          )}

          <MatchedServiceStrip suggestion={eventSuggestion} id={`event-${event.id ?? event.eventId}`} />

          {/* Facts row (family grammar) — date / venue / price, §13 omitted when absent */}
          <FactsRow
            facts={[
              {
                value: event.date
                  ? new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "",
                label: "date",
              },
              { value: event.venueName ? String(event.venueName) : "", label: "venue", testid: `event-venue-${event.id}` },
              {
                value: event.isFree ? "Free" : (event.priceRange ?? (event.minPrice ? `From $${event.minPrice}` : "")),
                label: "price",
              },
            ]}
            testid={`event-facts-${event.id}`}
          />

          {/* Source row — an event with an off-site ticketing URL is partner-fulfilled:
              a partner LABEL only, never the raw URL on the face (§16 /
              2026-08-25-card-source-link). Omitted when there is no source. */}
          {event.url && <SourceRow label="Partner ticketing" testid={`event-source-${event.id}`} />}

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            {event.url && (
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={{ background: "var(--earn-gold-ink)", color: "#fff", border: "none" }}
                asChild
                onClick={(e) => {
                  e.stopPropagation();
                  const impId = getImpIdEvt();
                  fetch("/api/affiliates/track", {
                    method: "POST",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ partner: "discover-event", destination: city, contentType: "event", contentId: String(event.id), impressionId: impId }),
                  }).catch(() => {});
                }}
              >
                <a href={event.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Tickets
                </a>
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              style={ADD_BTN_STYLE}
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.({
                  title: eventName,
                  city,
                  type: "event",
                  scheduledDate,
                  sourceImpressionId: getImpIdEvt(),
                  sourceContentId: String(event.id ?? event.eventId ?? ""),
                });
              }}
              data-testid={`btn-add-event-${event.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation();
                askExpert({ city, subject: eventName });
              }}
              data-testid={`btn-ask-event-${event.id}`}
            >
              Ask an expert
            </Button>
          </div>
        </div>
      </div>
      <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="event" data={event} />
    </>
  );
}

// ─── Vendor Service card ──────────────────────────────────────────────────────

interface CityFeedCardVendorServiceProps {
  service: any;
  city: string;
  className?: string;
  cardPosition?: number;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" bento tile;
   *  "full" (default) renders byte-identical to today. */
  density?: "full" | "compact";
  compactActionState?: BentoCompactActionState;
}

export function CityFeedCardVendorService({ service, city, className, cardPosition, scheduledDate, onAdd, density = "full", compactActionState }: CityFeedCardVendorServiceProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const askExpert = useAskExpert();
  const imageUrl = service.serviceImage || service.vendorPhoto || null;
  const { photoUrl, loading } = useGemPhoto(`vsvc-${service.id}`, service.serviceName, city, imageUrl);
  const { ref: impressionRefVendor, getImpressionId: getImpIdVendor } = useImpressionTracker(
    "vendor-service",
    String(service.id),
    city,
    cardPosition,
  );

  const externalUrl: string | null = service.vendorBookingLink || service.vendorWebsite || null;

  // A vendor-service is a real provider_services row: it books in-app on
  // /services/:id through the audited /api/checkout rail, so its native booking
  // signal is its own id. resolveBookability (@shared/bookability) is the single
  // source of truth — native for a platform service, deeplink only when it is
  // affiliate-sourced supply carrying an off-site link. This ONE value drives the
  // badge AND the action row, so a "Not bookable" badge can never sit beside a live
  // "Book" button (§13). The earlier `resolveBookability({ externalUrl })` badge
  // ignored the native id and mislabelled every link-less platform service.
  const resolvedBookability: Bookability = resolveBookability({
    ...service,
    providerServiceId: service.id,
    externalUrl,
  });

  const tag: string = (() => {
    const tags: string[] = service.contentAffinityTags ?? [];
    if (tags.length > 0) return tags[0];
    if (service.categoryName) return service.categoryName;
    return service.serviceType ?? "Service";
  })();

  const priceDisplay: string | null = (() => {
    if (!service.price) return null;
    const n = parseFloat(service.price);
    if (isNaN(n)) return null;
    if (n < 1) return "Custom quote";
    return `$${n % 1 === 0 ? n : n.toFixed(0)}`;
  })();

  const { srcSet, sizes } = buildSrcSet(photoUrl);

  // whatIncluded chips — first 2 on card face
  const includedFace: string[] = Array.isArray(service.whatIncluded)
    ? (service.whatIncluded as string[]).slice(0, 2)
    : [];

  // ─── Compact density (2026-08-26-bento-compact-density; Phase 2f) ───────────
  // The price rides the photo band as a pill (mock detail); the ONE mono meta line
  // now carries {duration · source} — the source LINKED per 2026-08-25-card-source-link
  // (handle → /s/:handle, name → plain, affiliate → "via {Partner}"). §13: price,
  // duration and source each omitted when absent. Two buttons only (Book + Add).
  if (density === "compact") {
    const durationLabel = compactDuration(service.durationMinutes);
    const source = compactSource(service);
    return (
      <>
        <div
          ref={impressionRefVendor}
          className={cn(
            "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
            className,
          )}
          data-testid={`feed-card-vendor-svc-${service.id}`}
          aria-label={`${service.serviceName} listing`}
          {...cardLinkProps(() => (window.location.href = `/services/${service.id}`))}
        >
          <div className="h-[84px] relative overflow-hidden bg-gradient-to-br from-teal-50 via-teal-100 to-teal-200/70 flex items-center justify-center text-teal-600 flex-shrink-0">
            {photoUrl && (
              <img
                src={photoUrl}
                srcSet={srcSet}
                sizes={sizes}
                alt={service.serviceName}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
              />
            )}
            <span
              className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 capitalize"
              style={{ fontFamily: EARN_MONO }}
            >
              {tag}
            </span>
            <CompactInfoCue testid={`info-cue-vendor-svc-${service.id}`} />
            {/* Price pill on the band (Phase 2f, §13: omitted when absent). */}
            {priceDisplay && (
              <span
                className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-white/95 text-foreground shadow-sm"
                style={{ fontFamily: EARN_MONO }}
                data-testid={`svc-price-${service.id}`}
              >
                {priceDisplay}
              </span>
            )}
            {service.isFeatured && (
              <span className="absolute top-9 right-2 bg-amber-500/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
                Featured
              </span>
            )}
          </div>
          <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">{service.serviceName}</h3>
            <CompactSourceMetaLine duration={durationLabel} source={source} testid={`svc-facts-${service.id}`} />
            <div className="flex gap-1.5 pt-0.5 items-center mt-auto">
              {compactActionState === "platform" && resolvedBookability !== "info_only" && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  style={BOOK_BTN_STYLE}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = `/services/${service.id}`;
                  }}
                  data-testid={`btn-book-svc-${service.id}`}
                >
                  {resolvedBookability === "deeplink" ? "Reserve" : "Book now"}
                </Button>
              )}
              {onAdd && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  style={ADD_BTN_STYLE}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd({
                      title: service.serviceName,
                      description: service.shortDescription,
                      city,
                      type: "service",
                      scheduledDate,
                      sourceImpressionId: getImpIdVendor(),
                      sourceContentId: String(service.id),
                    });
                  }}
                  data-testid={`btn-add-svc-${service.id}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add to trip
                </Button>
              )}
              {/* Compact = exactly two buttons (Book + Add): the Globe/website and
                  Ask buttons are dropped here; their full-density counterparts stay. */}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        ref={impressionRefVendor}
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
          className,
        )}
        data-testid={`feed-card-vendor-svc-${service.id}`}
        aria-label={`${service.serviceName} listing`}
        {...cardLinkProps(() => (window.location.href = `/services/${service.id}`))}
      >
        {/* Family grammar: gradient + tag fallback, no grey box. */}
        <div className="h-[104px] relative overflow-hidden bg-gradient-to-br from-teal-50 via-teal-100 to-teal-200/70 flex items-center justify-center text-teal-600 flex-shrink-0">
          {photoUrl && (
            <img
              src={photoUrl}
              srcSet={srcSet}
              sizes={sizes}
              alt={service.serviceName}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {/* No-photo fallback is the gradient alone — no glyph (Phase 2d). */}
          {service.isFeatured && (
            <span className="absolute top-2 left-2 bg-amber-500/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
              Featured
            </span>
          )}
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-teal-50 text-teal-700 capitalize">
              {tag}
            </span>
            <BookingBadge level={resolvedBookability} />
          </div>

          <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{service.serviceName}</h3>

          {service.shortDescription && (
            <p className="text-[12px] text-muted-foreground line-clamp-2">{service.shortDescription}</p>
          )}

          {/* whatIncluded chips */}
          {includedFace.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid={`svc-included-chips-${service.id}`}>
              {includedFace.map((item) => (
                <span key={item} className="text-[10px] bg-green-50 text-green-700 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {item}
                </span>
              ))}
            </div>
          )}

          {/* Facts row (family grammar) — price / rating / delivery, §13 */}
          <FactsRow
            facts={[
              { value: priceDisplay ?? "", label: "price" },
              {
                value: service.averageRating ? `★ ${Number(service.averageRating).toFixed(1)}` : "",
                label: "rating",
              },
              { value: service.deliveryTimeframe ? String(service.deliveryTimeframe) : "", label: "delivery", testid: `svc-delivery-${service.id}` },
            ]}
            testid={`svc-facts-${service.id}`}
          />

          {/* Source row — a vendor service is a Traveloure listing; id-based link
              (2026-08-25-card-source-link fallback: /services/:id). */}
          <SourceRow href={`/services/${service.id}`} label="Traveloure listing" testid={`svc-source-${service.id}`} />

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            {/* Three-state action row (§13, card-family grammar): the Book CTA renders
                only when the resolved bookability is bookable — native → "Book now"
                (teal), deeplink → "Reserve". The CTA always lands on the in-app service
                detail page (date/time picker → cart → the audited /api/checkout rail);
                it never hops off-site (§16). info_only shows no Book at all. */}
            {resolvedBookability !== "info_only" && (
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={BOOK_BTN_STYLE}
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/services/${service.id}`;
                }}
                data-testid={`btn-book-svc-${service.id}`}
              >
                {resolvedBookability === "deeplink" ? "Reserve" : "Book now"}
              </Button>
            )}
            {onAdd && (
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={ADD_BTN_STYLE}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd({
                    title: service.serviceName,
                    description: service.shortDescription,
                    city,
                    type: "service",
                    scheduledDate,
                    sourceImpressionId: getImpIdVendor(),
                    sourceContentId: String(service.id),
                  });
                }}
                data-testid={`btn-add-svc-${service.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add to trip
              </Button>
            )}
            {externalUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  const impId = getImpIdVendor();
                  fetch("/api/affiliates/track", {
                    method: "POST",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ partner: "discover-vendor", destination: city, contentType: "vendor-service", contentId: String(service.id), impressionId: impId }),
                  }).catch(() => {});
                  window.open(externalUrl, "_blank", "noopener");
                }}
                data-testid={`btn-website-svc-${service.id}`}
              >
                <Globe className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation();
                askExpert({ city, subject: service.serviceName });
              }}
              data-testid={`btn-ask-svc-${service.id}`}
            >
              Ask an expert
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Supply card (hotel / activity) ──────────────────────────────────────────

interface CityFeedCardSupplyProps {
  item: any;
  kind: "supply-hotel" | "supply-activity";
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
  cardPosition?: number;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" bento tile;
   *  "full" (default) renders byte-identical to today. */
  density?: "full" | "compact";
  compactActionState?: BentoCompactActionState;
}

export function CityFeedCardSupply({ item, kind, city, scheduledDate, onAdd, className, cardPosition, density = "full", compactActionState: _compactActionState }: CityFeedCardSupplyProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const askExpert = useAskExpert();
  const dbImageUrl = item.media?.[0]?.url || item.imageUrl || null;
  const itemName = item.name || item.title || "";
  const isHotel = kind === "supply-hotel";

  const { photoUrl, loading } = useGemPhoto(
    `supply-${item.id ?? itemName}`,
    itemName,
    city,
    dbImageUrl,
  );

  const { ref: impressionRefSupply, getImpressionId: getImpIdSupply } = useImpressionTracker(
    kind,
    String(item.id ?? itemName),
    city,
    cardPosition,
  );

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : ADD_TO_PLAN_LABEL;
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  // Price chip
  const priceText = item.price
    ? (typeof item.price === "string" ? item.price : `$${item.price}`)
    : item.priceRange ?? null;

  // Duration for activities
  const durationLabel = !isHotel && item.durationMinutes
    ? item.durationMinutes >= 60
      ? `${Math.floor(item.durationMinutes / 60)}h${item.durationMinutes % 60 > 0 ? ` ${item.durationMinutes % 60}m` : ""}`
      : `${item.durationMinutes}m`
    : null;

  // reviewCount: show alongside star rating
  const reviewCountLabel = item.reviewCount
    ? ` · ${Number(item.reviewCount).toLocaleString()} reviews`
    : "";

  // ─── Compact density (2026-08-26-bento-compact-density; Phase 2f) ───────────
  // Price rides the band as a pill; the ONE meta line carries {duration · source}
  // — supply is affiliate, so the source is a partner LABEL ("via {Partner}", never
  // a raw URL — §16). Card opens the details sheet (where the tracked partner
  // outbound lives — F6/§16). §13: each fragment omitted when absent. Add + Ask.
  if (density === "compact") {
    const compactDur = compactDuration(item.durationMinutes);
    const source = compactSource(item);
    return (
      <>
        <div
          ref={impressionRefSupply}
          className={cn(
            "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
            className,
          )}
          data-testid={`feed-card-${kind}-${item.id}`}
          aria-label={`${itemName} details`}
          {...cardLinkProps(() => setSheetOpen(true))}
        >
          <div
            className={cn(
              "h-[84px] relative overflow-hidden flex items-center justify-center flex-shrink-0",
              isHotel
                ? "bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200/70 text-blue-600"
                : "bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200/70 text-amber-700",
            )}
          >
            {photoUrl && (
              <img
                src={photoUrl}
                srcSet={srcSet}
                sizes={sizes}
                alt={itemName}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
              />
            )}
            <span
              className={cn(
                "absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                isHotel ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800",
              )}
              style={{ fontFamily: EARN_MONO }}
            >
              {isHotel ? "Hotel" : "Activity"}
            </span>
            <CompactInfoCue testid={`info-cue-${kind}-${item.id}`} />
            {/* Price pill on the band (Phase 2f, §13: omitted when absent). */}
            {priceText && (
              <span
                className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-white/95 text-foreground shadow-sm"
                style={{ fontFamily: EARN_MONO }}
                data-testid={`supply-price-${item.id}`}
              >
                {priceText}
              </span>
            )}
          </div>
          <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">{itemName}</h3>
            <CompactSourceMetaLine duration={compactDur} source={source} testid={`supply-facts-${item.id}`} />
            <div className="flex gap-1.5 pt-0.5 items-center mt-auto">
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={ADD_BTN_STYLE}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.({
                    title: itemName,
                    city,
                    type: isHotel ? "hotel" : "activity",
                    scheduledDate,
                    sourceImpressionId: getImpIdSupply(),
                    sourceContentId: String(item.id ?? ""),
                  });
                }}
                data-testid={`btn-add-supply-${item.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                {addLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={(e) => {
                  e.stopPropagation();
                  askExpert({ city, subject: itemName });
                }}
                data-testid={`btn-ask-supply-${item.id}`}
              >
                Ask an expert
              </Button>
            </div>
          </div>
        </div>
        <MoreInfoSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          cardType="supply"
          data={{ ...item, _kind: kind, _city: city, _getImpressionId: getImpIdSupply }}
        />
      </>
    );
  }

  return (
    <>
      <div
        ref={impressionRefSupply}
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
          className,
        )}
        data-testid={`feed-card-${kind}-${item.id}`}
        aria-label={`${itemName} details`}
        {...cardLinkProps(() => setSheetOpen(true))}
      >
        {/* Family grammar: gradient + tag fallback, no grey box. */}
        <div
          className={cn(
            "h-[104px] relative overflow-hidden flex items-center justify-center text-2xl flex-shrink-0",
            isHotel
              ? "bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200/70 text-blue-600"
              : "bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200/70 text-amber-700",
          )}
        >
          {photoUrl && (
            <img
              src={photoUrl}
              srcSet={srcSet}
              sizes={sizes}
              alt={itemName}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {/* No-photo fallback is the gradient alone — no glyph (Phase 2d). */}
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
              isHotel ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800",
            )}>
              {isHotel ? "Hotel" : "Activity"}
            </span>
            {/* No BookingBadge on the supply card face: no native vendor-inventory booking
                rail exists yet (filed) — the badge returns when it does. The partner link
                lives inside the Details sheet as a secondary outbound action. */}
            {priceText && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600"
                data-testid={`supply-price-${item.id}`}
              >
                {priceText}
              </span>
            )}
          </div>

          <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{itemName}</h3>

          {/* 2-line description */}
          {item.description && (
            <p className="text-[12px] text-muted-foreground line-clamp-2" data-testid={`supply-description-${item.id}`}>
              {item.description}
            </p>
          )}

          {isHotel && item.amenities && (
            <div className="flex flex-wrap gap-1">
              {(item.amenities as string[]).slice(0, 2).map((a) => (
                <span key={a} className="text-[10px] bg-muted rounded-full px-2 py-0.5 flex items-center gap-0.5">
                  {a.toLowerCase().includes("wifi") ? <Wifi className="w-2.5 h-2.5" /> : <Waves className="w-2.5 h-2.5" />}
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Facts row (family grammar) — price / rating / duration, §13 */}
          <FactsRow
            facts={[
              { value: priceText ?? "", label: "price" },
              { value: item.rating ? `★ ${item.rating}${reviewCountLabel}` : "", label: "rating", testid: `supply-rating-${item.id}` },
              { value: durationLabel ?? "", label: "duration", testid: `supply-duration-${item.id}` },
            ]}
            testid={`supply-facts-${item.id}`}
          />

          {/* Source row — partner-fed supply: a partner LABEL only on the face; the
              tracked outbound link stays inside the details sheet (F6 / §16). */}
          <SourceRow label="Partner supply" testid={`supply-source-${item.id}`} />

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            {/* Keep bookings on-site (F6): no external "Book" button on the card face.
                Add to trip is the primary action; the outbound partner link lives inside
                the details sheet (opened by the card itself) as a small secondary action. */}
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              style={ADD_BTN_STYLE}
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.({
                  title: itemName,
                  city,
                  type: isHotel ? "hotel" : "activity",
                  scheduledDate,
                  sourceImpressionId: getImpIdSupply(),
                  sourceContentId: String(item.id ?? ""),
                });
              }}
              data-testid={`btn-add-supply-${item.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation();
                askExpert({ city, subject: itemName });
              }}
              data-testid={`btn-ask-supply-${item.id}`}
            >
              Ask an expert
            </Button>
          </div>
        </div>
      </div>
      <MoreInfoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        cardType="supply"
        data={{ ...item, _kind: kind, _city: city, _getImpressionId: getImpIdSupply }}
      />
    </>
  );
}
