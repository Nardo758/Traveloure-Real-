/**
 * SocialKitCard — the F3 social distribution kit (DISTRIBUTION_FORMATS.md `social:*`, ratified
 * BOTH outputs; visual spec: docs/backoffice/mockups/mockup-destination-formats.html §4).
 *
 * Rendered inside the Workstation Distribute panel's Social channel card. Produces:
 *   1. The story view (`social:story`, grouping "story-frames"): hero frame → up to 4 highlight
 *      frames picked deterministically from REAL itinerary items → CTA frame carrying the
 *      expert's real trackable link. §13 throughout: a 0-item build shows an honest empty state,
 *      never invented highlights; the CTA link renders only when a real handle/short-link exists.
 *   2. The caption + share-image pack: rides the EXISTING promo-text service
 *      (GET /api/promo-text?targetType=ready_made — owner-gated server-side) and the EXISTING
 *      SH1 share-image render (GET /api/share-image/ready-made/:id.png — F2/§10-gated to
 *      approved+active listings). No parallel caption engine; a build with no store listing
 *      shows the honest "ship to store first" gate.
 *
 * Console tokens only (§17 two-palettes rule) — frame gradients are color-mix derivations of
 * the console palette (design, not data), zero raw hex.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { resolveFormat } from "@/lib/build-formats/registry";
import { getMarketGeography, projectPath, projectPoint } from "@shared/geo/market-geography";
import {
  INK, MID, FAINT, LINE, GROUND, CARD, BRAND,
  type FormatDay, type FlatFormatItem, flattenDays, compareChrono,
} from "./format-shared";

/** The slice of the store listing the kit needs (structural subset of ReadyMadeListing). */
interface SocialKitListing {
  id: string;
  status: string;
}

interface SocialKitCardProps {
  tripTitle: string;
  destination: string | null;
  experienceType: string | null;
  /** Real itinerary day groups (GET /api/trips/:tripId/itinerary-items shape). */
  days: FormatDay[];
  /** The build's store listing when one exists — the caption/share-image target. */
  listing: SocialKitListing | null;
  /** The Direct channel's trackable short-link, when already created this session. */
  directLink: string | null;
}

/**
 * Deterministic highlight pick (§13 — real items only, never invented):
 * chronological sort, then the EARLIEST item of each distinct area (locationName, falling back
 * to the day when no area is set) so frames spread across the build instead of clustering in
 * day 1; if fewer distinct areas than slots, the remaining slots fill with the next unpicked
 * items in chronological order. Fewer items → fewer frames.
 */
export function pickHighlightItems(days: FormatDay[], max = 4): FlatFormatItem[] {
  const chrono = flattenDays(days).slice().sort(compareChrono);
  const picked: FlatFormatItem[] = [];
  const seenAreas = new Set<string>();
  for (const item of chrono) {
    if (picked.length >= max) break;
    const area = (item.locationName ?? "").trim().toLowerCase() || `day-${item.dayNumber}`;
    if (seenAreas.has(area)) continue;
    seenAreas.add(area);
    picked.push(item);
  }
  if (picked.length < max) {
    const pickedIds = new Set(picked.map((p) => p.id));
    for (const item of chrono) {
      if (picked.length >= max) break;
      if (!pickedIds.has(item.id)) {
        pickedIds.add(item.id);
        picked.push(item);
      }
    }
    picked.sort(compareChrono);
  }
  return picked;
}

/** The route frame's day-color palette (approved mock) — literal, not console tokens, because it
 *  encodes DATA (which day a stop belongs to) rather than UI chrome; day 1 happens to land on the
 *  same red as the console brand color, which is coincidental, not a dependency. */
const DAY_ROUTE_COLORS = ["#E85D55", "#3B6EA5", "#2E7D5B", "#B45309"];
const ROUTE_VIEW_W = 120;
const ROUTE_VIEW_H = 160;

interface RoutePoint {
  id: string;
  dayNumber: number;
  lon: number;
  lat: number;
  /** 1-based position in itinerary order across the WHOLE trip (§13: guide-order, not per-day). */
  guideOrder: number;
}

/** Mirrors workspace.tsx's `isLocatedItem` (finite, in-range, non-zero lat/lng) — implemented
 *  locally per this build's file ownership split; an item lacking real coordinates is simply
 *  absent from the route, never given a fabricated position (§13). `FormatItem` doesn't type
 *  latitude/longitude (format-shared.ts is out of scope here), but the real itinerary-items GET
 *  the workspace feeds this card from carries them on every row. */
function isLocatedPoint(lat: unknown, lng: unknown): lat is number {
  const latNum = lat == null ? NaN : typeof lat === "number" ? lat : parseFloat(String(lat));
  const lngNum = lng == null ? NaN : typeof lng === "number" ? lng : parseFloat(String(lng));
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return false;
  if (latNum === 0 && lngNum === 0) return false;
  return true;
}

/** Real located items only, in itinerary order (chronological across the whole trip — the same
 *  ordering `pickHighlightItems` uses), each stamped with its trip-wide guide-order number. */
function buildRoutePoints(days: FormatDay[]): RoutePoint[] {
  const chrono = flattenDays(days).slice().sort(compareChrono);
  const points: RoutePoint[] = [];
  for (const item of chrono) {
    const raw = item as unknown as { latitude?: unknown; longitude?: unknown };
    if (!isLocatedPoint(raw.latitude, raw.longitude)) continue;
    points.push({
      id: item.id,
      dayNumber: item.dayNumber,
      lat: typeof raw.latitude === "number" ? raw.latitude : parseFloat(String(raw.latitude)),
      lon: typeof raw.longitude === "number" ? raw.longitude : parseFloat(String(raw.longitude)),
      guideOrder: points.length + 1,
    });
  }
  return points;
}

/** Groups already-chronological points into contiguous same-day runs, so each run renders as one
 *  polyline in that day's color — never connecting across a day boundary. */
function groupRouteByDay(points: RoutePoint[]): RoutePoint[][] {
  const groups: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  let currentDay: number | null = null;
  for (const p of points) {
    if (p.dayNumber !== currentDay) {
      if (current.length) groups.push(current);
      current = [];
      currentDay = p.dayNumber;
    }
    current.push(p);
  }
  if (current.length) groups.push(current);
  return groups;
}

/** No geography layer for this market → project against the located points' own bounding box
 *  (padded) instead, so the route still draws sensibly on plain ground rather than being skipped. */
function fallbackBbox(points: RoutePoint[]): [number, number, number, number] {
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const w = Math.min(...lons), e = Math.max(...lons);
  const s = Math.min(...lats), n = Math.max(...lats);
  const padLon = Math.max((e - w) * 0.18, 0.01);
  const padLat = Math.max((n - s) * 0.18, 0.01);
  return [w - padLon, s - padLat, e + padLon, n + padLat];
}

/** Frame gradients — a cohesive ink↔brand family derived from the console tokens (design only). */
const HERO_GRADIENT = `linear-gradient(180deg, color-mix(in srgb, ${INK} 82%, ${BRAND}) 20%, color-mix(in srgb, ${BRAND} 78%, ${INK}))`;
const HIGHLIGHT_GRADIENTS = [
  `linear-gradient(180deg, color-mix(in srgb, ${INK} 88%, ${BRAND}) 20%, color-mix(in srgb, ${INK} 45%, ${BRAND}))`,
  `linear-gradient(180deg, color-mix(in srgb, ${INK} 76%, ${BRAND}) 20%, color-mix(in srgb, ${BRAND} 60%, ${INK}))`,
  `linear-gradient(180deg, color-mix(in srgb, ${INK} 68%, ${BRAND}) 20%, color-mix(in srgb, ${BRAND} 88%, ${INK}))`,
  `linear-gradient(180deg, color-mix(in srgb, ${INK} 58%, ${BRAND}) 20%, ${BRAND})`,
];

const frameBaseStyle: React.CSSProperties = {
  flex: "0 0 132px",
  aspectRatio: "9 / 16",
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  padding: 12,
  boxSizing: "border-box",
  fontSize: 11.5,
  // Frames are ink-family gradients: console-card is the theme-correct contrast color
  // (white-on-dark in light theme, dark-on-light in dark theme).
  color: CARD,
  position: "relative",
  overflow: "hidden",
};

function FrameNum({ n, total }: { n: number; total: number }) {
  return (
    <span style={{ position: "absolute", top: 9, right: 11, fontSize: 9.5, opacity: 0.75, fontFamily: "ui-monospace, Menlo, monospace" }}>
      {n}/{total}
    </span>
  );
}

function FrameKicker({ children }: { children: React.ReactNode }) {
  return (
    <small style={{ display: "block", opacity: 0.85, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
      {children}
    </small>
  );
}

function FrameTitle({ children }: { children: React.ReactNode }) {
  return <b style={{ fontSize: 13, lineHeight: 1.25, display: "block" }}>{children}</b>;
}

const laneTagStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: FAINT,
  marginBottom: 8,
};

export function SocialKitCard({ tripTitle, destination, experienceType, days, listing, directLink }: SocialKitCardProps) {
  const { toast } = useToast();
  // Handle from the cached auth user (/api/auth/user) — the same source HandleClaimCard reads.
  const { user } = useAuth() as { user?: { handle?: string | null } };
  const handle = user?.handle ?? null;

  // Registry-resolved format — every social render resolves to social:story in v1.
  const format = resolveFormat("social", experienceType, destination);

  const highlights = pickHighlightItems(days, 4);
  const dayCount = days.length;

  // Route frame data — the digitized-clone geography layer (real OSM-derived water/parks/roads
  // for launch markets) plus real located items only (§13). Absent geography or a market with no
  // layer → route+dots project against the located points' own bbox instead ("plain ground").
  const geography = getMarketGeography(destination);
  const routePoints = buildRoutePoints(days);
  const routeDayGroups = groupRouteByDay(routePoints);
  const routeBbox = geography?.bbox ?? (routePoints.length > 0 ? fallbackBbox(routePoints) : null);
  const routeStopCount = routePoints.length;

  // CTA link (§13 — only a REAL link, never a placeholder URL): the storefront handle first
  // (the durable public page), else the Direct channel's trackable short-link when the author
  // already created one this session; neither → the honest claim-your-handle state.
  const ctaUrl = handle ? `${window.location.origin}/p/${handle}` : directLink;
  const ctaDisplay = ctaUrl ? ctaUrl.replace(/^https?:\/\//, "") : null;

  const totalFrames = highlights.length + 3; // hero + route + highlights + CTA

  // Caption pack — the EXISTING promo-text engine, ready_made target (owner-gated server-side).
  // Only fetched when the build has a store listing; no listing → honest gate, no parallel path.
  const { data: promo, isLoading: promoLoading, isError: promoError } = useQuery<{ caption: string; source: "ai" | "template" }>({
    queryKey: [`/api/promo-text?targetType=ready_made&targetId=${listing?.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/promo-text?targetType=ready_made&targetId=${encodeURIComponent(listing!.id)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return res.json();
    },
    enabled: !!listing?.id,
    staleTime: 5 * 60 * 1000,
  });

  // The SH1 share-image render is F2/§10-gated server-side (approved+active only) — gate the
  // <img> on the same real status so we never render a broken image for an unapproved listing.
  const shareImageUnlocked = listing?.status === "approved";
  const [shareImageFailed, setShareImageFailed] = useState(false);

  const copyCaption = async () => {
    if (!promo?.caption) return;
    try {
      await navigator.clipboard.writeText(promo.caption);
      toast({ title: "Caption copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  return (
    <div style={{ padding: 12 }} data-testid="social-kit-card" data-format-key={format.key}>
      {/* ── Output 1: the story view preview ── */}
      <span style={laneTagStyle}>{format.key} · story preview</span>
      {highlights.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 12px", background: GROUND, border: `1px dashed ${LINE}`, borderRadius: 10, fontSize: 12, color: MID }} data-testid="social-story-empty">
          Add items to the build to generate a story
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }} data-testid="social-story-rail">
          {/* Hero frame — real title + destination + honest day count */}
          <div style={{ ...frameBaseStyle, background: HERO_GRADIENT }} data-testid="social-frame-hero">
            <FrameNum n={1} total={totalFrames} />
            <FrameKicker>
              {[destination || null, dayCount > 0 ? `${dayCount} day${dayCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
            </FrameKicker>
            <FrameTitle>{tripTitle}</FrameTitle>
          </div>

          {/* Route frame — the digitized-clone geography layer beneath day-colored polylines
              connecting each day's REAL located items in trip order (§13: unlocated items are
              simply absent, never guessed). New page in the story; nothing existing changes. */}
          <div
            style={{
              ...frameBaseStyle,
              background: "linear-gradient(180deg, #F7F4EA 0%, #EEE8D6 100%)",
              justifyContent: "flex-start",
              color: "#2A2A28",
            }}
            data-testid="social-frame-route"
          >
            <FrameNum n={2} total={totalFrames} />
            <small style={{ display: "block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND, marginBottom: 4 }}>
              The Route
            </small>
            <svg
              viewBox={`0 0 ${ROUTE_VIEW_W} ${ROUTE_VIEW_H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ flex: 1, width: "100%", minHeight: 0, display: "block" }}
              data-testid="svg-route-frame"
            >
              {geography && routeBbox && (
                <>
                  {geography.water.map((line, i) => (
                    <path
                      key={`w-${i}`}
                      d={projectPath(line, routeBbox, ROUTE_VIEW_W, ROUTE_VIEW_H)}
                      fill="none" stroke="#B9D2E8" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5}
                    />
                  ))}
                  {geography.parks.map((ring, i) => (
                    <path
                      key={`p-${i}`}
                      d={projectPath(ring, routeBbox, ROUTE_VIEW_W, ROUTE_VIEW_H, true)}
                      fill="#BFE0C4" opacity={0.5}
                    />
                  ))}
                  {geography.roads.map((line, i) => (
                    <path
                      key={`r-${i}`}
                      d={projectPath(line, routeBbox, ROUTE_VIEW_W, ROUTE_VIEW_H)}
                      fill="none" stroke="#C9C2AE" strokeWidth={0.6} opacity={0.5}
                    />
                  ))}
                </>
              )}
              {routeBbox && routeDayGroups.map((group, gi) => (
                group.length > 1 && (
                  <path
                    key={`route-${gi}`}
                    d={projectPath(group.map((p): [number, number] => [p.lon, p.lat]), routeBbox, ROUTE_VIEW_W, ROUTE_VIEW_H)}
                    fill="none"
                    stroke={DAY_ROUTE_COLORS[(group[0].dayNumber - 1) % DAY_ROUTE_COLORS.length]}
                    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  />
                )
              ))}
              {routeBbox && routePoints.map((p) => {
                const [x, y] = projectPoint([p.lon, p.lat], routeBbox, ROUTE_VIEW_W, ROUTE_VIEW_H);
                const color = DAY_ROUTE_COLORS[(p.dayNumber - 1) % DAY_ROUTE_COLORS.length];
                return (
                  <g key={p.id}>
                    <circle cx={x} cy={y} r={5} fill={color} stroke="white" strokeWidth={1} />
                    <text x={x} y={y + 2.2} fontSize={5} fontWeight={700} fill="white" textAnchor="middle">{p.guideOrder}</text>
                  </g>
                );
              })}
            </svg>
            <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 4 }} data-testid="text-route-stops">
              {routeStopCount} {routeStopCount === 1 ? "stop" : "stops"}
            </div>
            {geography && (
              <div style={{ fontSize: 6, opacity: 0.7, marginTop: 2 }} data-testid="text-route-attribution">
                Map © OpenStreetMap contributors
              </div>
            )}
          </div>

          {/* Highlight frames — real items, earliest per distinct area/day (§13) */}
          {highlights.map((item, i) => (
            <div key={item.id} style={{ ...frameBaseStyle, background: HIGHLIGHT_GRADIENTS[i % HIGHLIGHT_GRADIENTS.length] }} data-testid={`social-frame-highlight-${i + 1}`}>
              <FrameNum n={i + 3} total={totalFrames} />
              <FrameKicker>{(item.locationName ?? "").trim() || `Day ${item.dayNumber}`}</FrameKicker>
              <FrameTitle>{item.title}</FrameTitle>
            </div>
          ))}

          {/* CTA frame — the real trackable link, or the honest no-link state */}
          <div
            style={{ ...frameBaseStyle, background: INK, color: GROUND, justifyContent: "center", alignItems: "flex-start" }}
            data-testid="social-frame-cta"
          >
            <FrameNum n={totalFrames} total={totalFrames} />
            {ctaDisplay ? (
              <>
                <FrameKicker>Get the full plan</FrameKicker>
                <FrameTitle>Every stop, timed &amp; mapped</FrameTitle>
                <span style={{ background: BRAND, color: CARD, borderRadius: 999, padding: "5px 10px", fontSize: 10, fontWeight: 700, marginTop: 8, display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="social-cta-link">
                  {ctaDisplay} →
                </span>
              </>
            ) : (
              <>
                <FrameKicker>No link yet</FrameKicker>
                <span style={{ fontSize: 11, lineHeight: 1.4 }} data-testid="social-cta-no-link">
                  Claim your handle in Settings to add a link
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Output 2: caption + share-image pack (existing promo-text + SH1 share-image) ── */}
      <span style={{ ...laneTagStyle, marginTop: 12 }}>{format.key} · caption + share-image pack</span>
      {listing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", background: CARD }} data-testid="social-caption-box">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND }}>Instagram</span>
              <button
                onClick={copyCaption}
                disabled={!promo?.caption}
                data-testid="button-social-copy-caption"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: MID, background: GROUND, border: `1px solid ${LINE}`, borderRadius: 7, padding: "3px 8px", cursor: promo?.caption ? "pointer" : "default", opacity: promo?.caption ? 1 : 0.5 }}
              >
                <Copy style={{ width: 10, height: 10 }} /> Copy
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: INK, lineHeight: 1.5, whiteSpace: "pre-wrap" }} data-testid="text-social-caption">
              {promoLoading ? "Writing caption…" : promoError ? "Caption unavailable right now — try again shortly." : promo?.caption}
            </p>
          </div>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", background: CARD }} data-testid="social-share-image-box">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND, marginBottom: 6 }}>Share image</div>
            {shareImageUnlocked && !shareImageFailed ? (
              <img
                src={`/api/share-image/ready-made/${listing.id}.png?format=feed`}
                alt={`Share image for ${tripTitle}`}
                onError={() => setShareImageFailed(true)}
                style={{ width: "100%", borderRadius: 8, border: `1px solid ${LINE}`, display: "block" }}
                data-testid="img-social-share-image"
              />
            ) : (
              <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.5 }} data-testid="text-social-share-image-gate">
                {shareImageUnlocked
                  ? "The share image couldn't render right now — try again shortly."
                  : "The share image unlocks once your store listing is approved."}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px", background: GROUND, border: `1px dashed ${LINE}`, borderRadius: 10, fontSize: 12, color: MID, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 8 }} data-testid="social-caption-gate">
          <Link2 style={{ width: 12, height: 12, color: FAINT, flexShrink: 0, marginTop: 2 }} />
          <span>Ship to store to generate captions — the caption and share image run on your store listing.</span>
        </div>
      )}
    </div>
  );
}

export default SocialKitCard;
