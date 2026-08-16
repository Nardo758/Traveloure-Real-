/**
 * Provider Distribute — the ONE distribution hub (Catalog+Distribute ruling 74, lanes D1-D4/C6;
 * S6 — ruling-74-disposition-6 clarification).
 *
 * This page is five sections: Storefront · Share kit · Direct link · Marketplace · Promote.
 * Visual spec: console design tokens — INK/MUT/HAIR/GRD/PAPER/ACC — plain div cards, no shadcn
 * Card wrapper. "moves here from Catalog" pills on Storefront, Share kit, and Promote headers.
 *
 * REUSE, not reimplementation — every section composes an EXISTING component, never a fork:
 *   - Storefront ← data from /api/provider/services + useAuth(), custom console-card render.
 *   - Marketplace ← GET /api/provider/services/:id/publish-readiness.
 *   - Social/Share kit ← <OfferingShareDetail/> from share-tools.tsx.
 *   - Promote ← <PostingOpportunitiesCard/> from share-tools.tsx.
 *
 * Caption hold (ruling 74 / ruling 69 disposition 2): attribution + rails only — no fee-waiver
 * wording ("skip the service fee") until the traveler fee is billed on the direct path.
 *
 * Measurement stays on Analytics/Earnings (ruling 74 disposition 8).
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import {
  ensureShortLink,
  buildOfferingCaption,
  InstagramPublishButton,
  type OfferingShareOption,
  type PostingOpportunity,
} from "@/components/backoffice/share-tools";
import { qrCodeSvgDataUrl } from "@/lib/qrcode";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HandleClaimCard } from "@/components/backoffice/handle-claim-card";
import { ArrowRight, Download, ExternalLink, Copy, MessageCircle, QrCode } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────────────────────
const INK  = "#1A1A18";
const MUT  = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD  = "#FAFAF8";
const PGE  = "#FFFFFF";
const ACC  = "#35605A";
const ACCS = "#EDF2F1";
const WBG  = "#FBF6EC";
const WLN  = "#D9C79A";
const WINK = "#6B551F";

// Error (red) tokens — for VERIFICATION_GATE blockers (identity/business verification failures)
const ERR_BG  = "#FDF3F2";
const ERR_LN  = "#F5C6C2";
const ERR_INK = "#B84235";

const T = {
  card: { background: PGE, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" as const } as React.CSSProperties,
  cardHd: { padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const } as React.CSSProperties,
  cardBody: { padding: "20px 22px" } as React.CSSProperties,
  pill: { display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUT, background: GRD, whiteSpace: "nowrap" as const } as React.CSSProperties,
  noteQuiet: { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "12px 15px", fontSize: 12.5, color: MUT, lineHeight: 1.55, marginTop: 14 } as React.CSSProperties,
  btn: { border: `1px solid ${HAIR}`, background: PGE, color: INK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", whiteSpace: "nowrap" as const } as React.CSSProperties,
  btnAccent: { border: `1px solid ${ACC}`, background: ACC, color: PGE, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", whiteSpace: "nowrap" as const } as React.CSSProperties,
  mono: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 5, padding: "8px 10px", wordBreak: "break-all" as const, lineHeight: 1.6 } as React.CSSProperties,
  sectionLabel: { fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em" } as React.CSSProperties,
  liveChip: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 9px", borderRadius: 100, border: "1px solid #BFD5D0", background: ACCS, color: ACC } as React.CSSProperties,
  warnChip: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 9px", borderRadius: 100, border: `1px solid ${WLN}`, background: WBG, color: WINK } as React.CSSProperties,
};

// Numbered gap-state circle — shown in card headers when a channel is blocked
function GapNumber({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: MUT, background: HAIR, borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {n}
    </span>
  );
}

// Blocker severity: VERIFICATION_GATE is blocking/hard (error red); everything else is soft (warn amber)
function blockerSev(code: string): "error" | "warn" {
  return code === "VERIFICATION_GATE" ? "error" : "warn";
}

// ── Data types ────────────────────────────────────────────────────────────────────────────────
interface OwnerService {
  id: string;
  serviceName: string;
  approvalStatus?: string | null;
  status: string;
  productShape?: string | null;
  price?: string | number | null;
  pricingUnit?: string | null;
  city?: string | null;
}

function formatListingPrice(price?: string | number | null, unit?: string | null): string | null {
  if (price == null || price === "" || price === "0" || price === 0) return null;
  const dollars = `$${Number(price).toLocaleString("en-US")}`;
  if (!unit) return dollars;
  if (unit === "per_person") return `${dollars}/person`;
  if (unit === "per_group") return `${dollars}/group`;
  if (unit === "per_night") return `${dollars}/night`;
  if (unit === "per_hour")  return `${dollars}/hr`;
  return dollars;
}

interface PublishReadiness {
  serviceId: string;
  name: string;
  approvalStatus: string;
  status: string;
  isLive: boolean;
  publicHref: string;
  verification: { ok: boolean; role: string | null; identityVerified: boolean; businessVerified: boolean | null };
  attestation: { ok: boolean; unaffirmed: { key: string; label: unknown }[] };
  blockers: { code: string; message: string; fixHref: string }[];
}

interface OwnerShortLink { code: string; targetType: string; targetId: string | null; frame: string | null }
interface LinkAnalyticsShape { links: OwnerShortLink[] }

function findDirectLink(links: OwnerShortLink[] | undefined, serviceId: string | null): OwnerShortLink | null {
  if (!links || !serviceId) return null;
  return links.find((l) => l.targetType === "service" && l.targetId === serviceId && l.frame === null) ?? null;
}

const ANALYTICS_HOME_HREF = "/provider/performance?tab=analytics";
// hint: Renamed and reformatted. Prefer the structural change, verify formatting.

// ── 1. Storefront card (account-level) ────────────────────────────────────────────────────────
//
// Distribute — Storefront section. Two-column card header (text + QR), 5-button action row,
// then a live-listings roster below the card. The storefront manager bar lived on Catalog;
// it moves here (S6) because Catalog is what you sell — this is how you sell it.
// hint: Structural and logic conflict. Both design and behavior differ.
function StorefrontCard({ services }: { services: OwnerService[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const handle = (user as any)?.handle as string | null | undefined;
  const [editingStorefront, setEditingStorefront] = useState(false);

  const liveServices = services.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  );
  const liveCount  = liveServices.length;
  const isLive     = !!handle && liveCount > 0;
  const publicPath = handle ? `/p/${handle}` : null;
  const publicUrl  = publicPath ? `${window.location.origin}${publicPath}` : null;
  const displayUrl = handle ? `${window.location.host}/s/${handle}` : null;
  const qrSvgUrl   = publicUrl ? qrCodeSvgDataUrl(publicUrl) : null;

  async function getStorefrontLink(): Promise<string> {
    if (!publicPath) return "";
    return ensureShortLink({ targetType: "storefront" }, publicPath);
  }

  async function copyLink() {
    const url = await getStorefrontLink();
    await navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: "Link copied", description: url });
  }

  async function storefrontWhatsApp() {
    const url = await getStorefrontLink();
    window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  }

  async function storefrontPostToX() {
    const url = await getStorefrontLink();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      {/* ── Main card ── */}
      <div style={{ ...T.card, marginBottom: 16 }} data-testid="card-storefront-header">
        {/* Two-column header: text left, QR right */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title + live chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>Your storefront page</span>
              {isLive && <span style={T.liveChip} data-testid="badge-storefront-live">✓ Live</span>}
            </div>
            <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 12px", lineHeight: 1.5 }}>
              Your public page — every approved, active listing you own in one place for travelers to browse and book.
            </p>
            {/* URL line */}
            {handle ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                <code style={{ fontSize: 12, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 4, padding: "4px 10px" }} data-testid="text-storefront-url">
                  {displayUrl}
                </code>
                <button
                  style={{ fontSize: 11.5, color: MUT, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}
                  onClick={() => setEditingStorefront((v) => !v)}
                  data-testid="button-edit-handle-bio"
                >
                  {editingStorefront ? "Close editor" : "Edit handle & bio"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingStorefront(true)}
                style={{ fontSize: 12.5, color: ACC, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
                data-testid="link-storefront-claim-handle"
              >
                Claim your handle →
              </button>
            )}
          </div>

          {/* QR — inline SVG when live, placeholder when not */}
          {qrSvgUrl ? (
            <img
              src={qrSvgUrl}
              alt={`QR code for ${displayUrl}`}
              style={{ width: 88, height: 88, borderRadius: 8, border: `1px solid ${HAIR}`, background: GRD, flexShrink: 0 }}
              data-testid="img-storefront-qr"
            />
          ) : (
            <div
              style={{ width: 88, height: 88, borderRadius: 8, border: `1px solid ${HAIR}`, background: GRD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 36, color: HAIR }}
              data-testid="img-storefront-qr-placeholder"
            >
              ▣
            </div>
          )}
        </div>

        {/* Inline editor (shown when toggled) */}
        {editingStorefront && (
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${HAIR}` }} data-testid="panel-storefront-editor">
            <HandleClaimCard currentHandle={handle} />
          </div>
        )}

        {/* Action row */}
        <div style={{ padding: "14px 20px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <button style={T.btn} onClick={copyLink} disabled={!publicUrl} data-testid="button-storefront-copy-link">
            Copy link
          </button>
          <button style={T.btn} onClick={storefrontWhatsApp} disabled={!publicUrl} data-testid="button-storefront-whatsapp">
            WhatsApp
          </button>
          <button style={T.btn} onClick={storefrontPostToX} disabled={!publicUrl} data-testid="button-storefront-post-x">
            Post to X
          </button>
          {qrSvgUrl && (
            <>
              <button
                style={T.btn}
                onClick={() => downloadQrPng(qrSvgUrl, `storefront-${handle}-qr.png`)}
                data-testid="button-storefront-qr-download-png"
              >
                Download QR (PNG)
              </button>
              <a
                href={qrSvgUrl}
                download={`storefront-${handle}-qr.svg`}
                style={{ ...T.btn, textDecoration: "none", display: "inline-block" }}
                data-testid="link-storefront-qr-download-svg"
              >
                Download QR (SVG)
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── Live listings roster ── */}
      {liveCount > 0 && (
        <div style={{ marginBottom: 16 }} data-testid="section-storefront-listings">
          <p style={{ ...T.sectionLabel, marginBottom: 10 }}>
            What's showing on your storefront ({liveCount} live listing{liveCount === 1 ? "" : "s"})
          </p>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {liveServices.map((s) => {
              const priceLabel = formatListingPrice(s.price, s.pricingUnit);
              return (
                <div
                  key={s.id}
                  style={{ background: PGE, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  data-testid={`row-storefront-listing-${s.id}`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={T.liveChip} data-testid={`badge-listing-live-${s.id}`}>Live</span>
                    <span style={{ fontSize: 13, color: INK }}>{s.serviceName}</span>
                  </div>
                  {priceLabel && (
                    <span style={{ fontSize: 12.5, color: MUT, whiteSpace: "nowrap" as const }} data-testid={`text-listing-price-${s.id}`}>
                      {priceLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No handle yet — zero-state note */}
      {!handle && (
        <p style={T.noteQuiet} data-testid="text-storefront-no-handle-note">
          Claim a handle above to get your storefront URL and QR code.
        </p>
      )}
    </>
  );
}
// ── 2. Channel-state strip (per-listing, 4 chips) ─────────────────────────────────────────────
//
// Honest status derived from REAL state only (§13). Chips: 🏪 Storefront · 🛍️ Marketplace ·
// 🔗 Direct · 🖼️ Social. Storefront is account-level (handle + approved listings); the other
// three resolve per listing. Deep-link to Analytics home (D4 — no analytics panel here).
// hint: Structural and logic conflict. Both design and behavior differ.
function ChannelStateStrip({ services, selectedId }: { services: OwnerService[]; selectedId: string | null }) {
  const { user } = useAuth();
  const handle = (user as any)?.handle as string | null | undefined;

  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${selectedId}/publish-readiness`],
    enabled: !!selectedId,
  });
  const analytics = useQuery<LinkAnalyticsShape>({
    queryKey: ["/api/me/link-analytics"],
    enabled: !!selectedId,
  });

  const approvedActiveCount = services.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  ).length;
  const storefrontReady = !!handle && approvedActiveCount > 0;
  const marketplaceLive  = readiness.data?.isLive ?? false;
  const directReady      = !!findDirectLink(analytics.data?.links, selectedId);
  const socialReady      = readiness.data?.isLive ?? false;
  const resolving        = !!selectedId && (readiness.isLoading || analytics.isLoading);

  function Chip({ icon, label, ok, warn, text, resolving: res }: { icon: string; label: string; ok: boolean; warn?: boolean; text: string; resolving?: boolean }) {
    const border = !ok && warn ? WLN  : HAIR;
    const bg     = !ok && warn ? WBG  : PGE;
    const subClr = ok ? "#166534" : warn ? WINK : MUT;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 7, padding: "8px 10px", border: `1px solid ${border}`, background: bg }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: INK, lineHeight: 1.2 }}>{label}</div>
          {res ? (
            <div style={{ fontSize: 10.5, color: MUT, lineHeight: 1.2, marginTop: 2 }}>Checking…</div>
          ) : ok ? (
            <div style={{ fontSize: 10.5, color: "#166534", lineHeight: 1.2, marginTop: 2 }}>✓ {text}</div>
          ) : (
            <div style={{ fontSize: 10.5, color: subClr, lineHeight: 1.2, marginTop: 2 }}>{text}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const, marginBottom: 14 }}
      data-testid="channel-state-strip"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, flex: 1, minWidth: 0 }}>
        <Chip icon="🏪" label="Storefront" ok={storefrontReady} text={handle ? "live" : "no handle yet"} />
        <Chip icon="🛍️" label="Marketplace" ok={marketplaceLive} warn={!marketplaceLive && !resolving} text={marketplaceLive ? "live" : "not live yet"} resolving={resolving} />
        <Chip icon="🔗" label="Direct" ok={directReady} text={directReady ? "link ready" : "no link yet"} resolving={resolving} />
        <Chip icon="🖼️" label="Social" ok={socialReady} warn={!socialReady && !resolving} text={socialReady ? "images ready" : "needs approval"} resolving={resolving} />
      </div>
      <Link href={ANALYTICS_HOME_HREF}>
        <button style={T.btn} data-testid="button-view-link-performance">
          View link performance →
        </button>
      </Link>
    </div>
  );
}
// ── 3. Share-kit card (per-listing; S6 — moves here from Catalog) ─────────────────────────────
//
// Tap-to-select frame gallery (Story · Feed · Route) → shared editable caption → unified action
// row (Copy caption + link / WhatsApp / Post to X / Publish to Instagram).
// Social images locked until listing is approved+active (§13).
// Server frames: feed | story | route (share-frames.ts).

const SK_FRAMES = [
  { id: "story" as const, label: "Story",  sub: "9:16 · 1080 × 1920" },
  { id: "feed"  as const, label: "Feed",   sub: "Portrait · 1080 × 1350" },
  { id: "route" as const, label: "Route",  sub: "Stop sequence" },
] as const;
type SkFrame = (typeof SK_FRAMES)[number]["id"];

// hint: Structural and logic conflict. Both design and behavior differ.
function ShareKitCard({ service, serviceId }: { service: OwnerService | null; serviceId: string | null }) {
  const { toast } = useToast();

  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${serviceId}/publish-readiness`],
    enabled: !!serviceId,
  });
  const isLive = readiness.data?.isLive ?? false;

  const [selectedFrame, setSelectedFrame] = useState<SkFrame>("story");
  const [caption, setCaption] = useState("");
  const [defaultCaption, setDefaultCaption] = useState("");
  const [routeAvailable, setRouteAvailable] = useState(true);

  // Reset frame + route flag when listing changes
  useEffect(() => {
    setSelectedFrame("story");
    setRouteAvailable(true);
  }, [serviceId]);

  // Caption: client fallback immediately, server caption when available
  useEffect(() => {
    if (!service) return;
    const fallback = buildOfferingCaption({
      id: service.id,
      lane: "service",
      laneLabel: "Service",
      name: service.serviceName || "Untitled service",
      city: service.city ?? null,
      price: null,
      publicHref: `/services/${service.id}`,
    });
    setCaption(fallback);
    setDefaultCaption(fallback);
    let cancelled = false;
    fetch(`/api/promo-text?targetType=service&targetId=${service.id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.caption) {
          setCaption(d.caption);
          setDefaultCaption(d.caption);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [service]);

  async function getShareLink(): Promise<string> {
    return ensureShortLink(
      { targetType: "service", targetId: serviceId ?? "" },
      service ? `/services/${service.id}` : "/",
    );
  }

  async function copyCaptionAndLink() {
    const url = await getShareLink();
    const text = `${caption} ${url}`;
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    toast({ title: "Caption copied", description: "Caption + link copied to clipboard." });
  }

  async function shareWhatsApp() {
    const url = await getShareLink();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${url}`)}`, "_blank", "noopener,noreferrer");
  }

  async function postToX() {
    const url = await getShareLink();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${caption} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  const activeImageUrl = serviceId ? `/api/share-image/service/${serviceId}.png?format=${selectedFrame}` : null;

  return (
    <div style={{ ...T.card, marginBottom: 16 }} data-testid="card-channel-social">
      {/* Card header */}
      <div style={T.cardHd}>
        {!!serviceId && !readiness.isLoading && !isLive && <GapNumber n={3} />}
        <span style={{ fontSize: 16 }}>🖼️</span>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>
          {!!serviceId && !readiness.isLoading && !isLive ? "Share kit — locked until approved" : "Share kit"}
        </h3>
        {isLive && <span style={T.liveChip} data-testid="badge-social-images-ready">✓ Images ready</span>}
        <span style={T.pill}>moves here from Catalog</span>
      </div>

      {/* Card body */}
      <div style={T.cardBody}>
        {!serviceId ? (
          <p style={{ fontSize: 13, color: MUT }} data-testid="text-social-no-selection">
            Pick a listing above to see its share kit.
          </p>
        ) : readiness.isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }} data-testid="skeleton-social">
            {SK_FRAMES.map((f) => (
              <div key={f.id} style={{ background: HAIR, borderRadius: 8, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20, opacity: 0.3 }}>🖼️</span>
              </div>
            ))}
          </div>
        ) : !isLive ? (
          /* Locked: listing not yet live (§13) */
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }} data-testid="social-locked-frames">
              {SK_FRAMES.map((f) => (
                <div key={f.id} style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  <div style={{ background: HAIR, borderRadius: 8, border: `1px dashed ${HAIR}`, aspectRatio: "1", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 20, opacity: 0.35 }}>🖼️</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: "0 0 1px" }}>{f.label}</p>
                    <p style={{ fontSize: 11.5, color: MUT, margin: 0 }}>{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: MUT }} data-testid="social-unavailable">
              Social images unlock once this listing is approved and active on the marketplace.
            </p>
          </div>
        ) : (
          /* Live: tap-to-select gallery + shared caption + unified action row */
          <div>
            <p style={{ fontSize: 12.5, color: MUT, marginBottom: 16, lineHeight: 1.55 }}>
              Tap an image to select it, edit the caption, then copy, post to X or publish directly to Instagram.
            </p>

            {/* Frame picker */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }} data-testid="social-frame-picker">
              {SK_FRAMES.map((f) => {
                const selected  = selectedFrame === f.id;
                const unavail   = f.id === "route" && !routeAvailable;
                const imgUrl    = `/api/share-image/service/${serviceId}.png?format=${f.id}`;
                return (
                  <button
                    key={f.id}
                    onClick={() => !unavail && setSelectedFrame(f.id)}
                    disabled={unavail}
                    data-testid={`button-social-frame-${f.id}`}
                    style={{
                      position: "relative", cursor: unavail ? "default" : "pointer",
                      border: selected ? `2px solid ${ACC}` : `1px solid ${HAIR}`,
                      borderRadius: 8, background: "none", padding: 0, overflow: "hidden",
                      opacity: unavail ? 0.4 : 1, display: "flex", flexDirection: "column" as const,
                    }}
                  >
                    {selected && (
                      <span style={{ position: "absolute", top: 6, right: 6, zIndex: 2, background: ACC, color: PGE, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.05em" }}>
                        SELECTED
                      </span>
                    )}
                    <img
                      src={imgUrl}
                      alt={`${f.label} share image`}
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: GRD }}
                      onError={() => { if (f.id === "route") { setRouteAvailable(false); if (selectedFrame === "route") setSelectedFrame("story"); } }}
                      data-testid={`img-social-frame-${f.id}`}
                    />
                    <div style={{ padding: "8px 10px", textAlign: "left" as const, background: PGE }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: INK, margin: "0 0 1px" }}>{f.label}</p>
                      <p style={{ fontSize: 11, color: MUT, margin: 0 }}>{f.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Caption editor */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={T.sectionLabel}>Caption</span>
                <button
                  style={{ fontSize: 11.5, color: MUT, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                  onClick={() => setCaption(defaultCaption)}
                  data-testid="button-social-caption-reset"
                >
                  Reset to default
                </button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                style={{ width: "100%", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, padding: "10px 12px", fontSize: 12.5, color: INK, resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" as const, fontFamily: "inherit" }}
                data-testid="textarea-social-caption"
              />
            </div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 }}>
              <button style={T.btn} onClick={copyCaptionAndLink} data-testid="button-social-copy-caption">
                Copy caption + link
              </button>
              <button style={T.btn} onClick={shareWhatsApp} data-testid="button-social-whatsapp">
                WhatsApp
              </button>
              <button style={T.btn} onClick={postToX} data-testid="button-social-post-x">
                Post to X
              </button>
              {/* Instagram publish — uses real OAuth + container + publish rail */}
              {activeImageUrl && (
                <InstagramPublishButton
                  imageUrl={activeImageUrl}
                  caption={caption}
                  available={selectedFrame !== "route" || routeAvailable}
                  unavailableReason={selectedFrame === "route" && !routeAvailable ? "This service has no route stops yet" : undefined}
                  idPrefix={`sharekit-${serviceId}`}
                />
              )}
            </div>

            <p style={{ fontSize: 11.5, color: MUT, lineHeight: 1.5, margin: 0 }}>
              Instagram publish sends the selected image + caption to your connected account. Connect your account in Settings if you haven't yet.
            </p>
          </div>
        )}

        {/* noteQuiet — shown regardless of state */}
        <p style={T.noteQuiet}>
          The Route frame draws the same stops you authored on the map —{" "}
          <strong style={{ color: INK }}>sequence, not travel routing</strong>. No distance or duration is invented for a share image.
        </p>
      </div>
    </div>
  );
}
// ── QR PNG download helper ────────────────────────────────────────────────────
// Converts the SVG data-URL from qrCodeSvgDataUrl() into a PNG via an offscreen
// canvas, then triggers a download. No external library needed.
async function downloadQrPng(svgDataUrl: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("toBlob failed")); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        resolve();
      }, "image/png");
    };
    img.onerror = reject;
    img.src = svgDataUrl;
  });
}

// ── 4. Direct-link card (D2, per-listing) ────────────────────────────────────────────────────
//
// Trackable, rails-attributed booking link. First action mints the link inline (D-4, no
// separate "mint" step). §13: URL shown only once it actually exists.
// hint: Structural and logic conflict. Both design and behavior differ.
function DirectLinkCard({ serviceId, serviceName }: { serviceId: string | null; serviceName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const analytics = useQuery<LinkAnalyticsShape>({
    queryKey: ["/api/me/link-analytics"],
    enabled: !!serviceId,
  });

  const existing = findDirectLink(analytics.data?.links, serviceId);
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setMintedUrl(null);
    setShowQr(false);
  }, [serviceId]);

  const linkUrl = existing ? `${window.location.origin}/r/${existing.code}` : mintedUrl;
  const caption = buildOfferingCaption({
    id: serviceId ?? "",
    lane: "service",
    laneLabel: "Service",
    name: serviceName,
    city: null,
    price: null,
    publicHref: serviceId ? `/services/${serviceId}` : "/",
  });
  const captionWithLink = linkUrl ? `${caption} ${linkUrl}` : caption;

  async function ensureUrl(): Promise<string | null> {
    if (linkUrl) return linkUrl;
    if (!serviceId) return null;
    setMinting(true);
    try {
      const url = await ensureShortLink(
        { targetType: "service", targetId: serviceId },
        `/services/${serviceId}`,
      );
      setMintedUrl(url);
      queryClient.invalidateQueries({ queryKey: ["/api/me/link-analytics"] });
      return url;
    } catch {
      toast({ title: "Couldn't create a link", description: "Please try again.", variant: "destructive" });
      return null;
    } finally {
      setMinting(false);
    }
  }

  async function copyLink() {
    const url = await ensureUrl();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch { /* fallback: URL is visible */ }
    toast({ title: "Link copied", description: url });
  }

  async function copyCaptionAndLink() {
    const url = await ensureUrl();
    if (!url) return;
    const text = `${caption} ${url}`;
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    toast({ title: "Caption copied", description: "Caption + link copied to clipboard." });
  }

  async function shareWhatsApp() {
    const url = await ensureUrl();
    if (!url) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${url}`)}`, "_blank", "noopener,noreferrer");
  }

  async function postToX() {
    const url = await ensureUrl();
    if (!url) return;
    const text = `${caption} ${url}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function toggleQr() {
    if (showQr) { setShowQr(false); return; }
    const url = await ensureUrl();
    if (!url) return;
    setShowQr(true);
  }

  const qrSvgUrl = linkUrl ? qrCodeSvgDataUrl(linkUrl) : null;
  // Gap state: no link yet and not currently loading
  const noLinkYet = !!serviceId && !analytics.isLoading && !linkUrl && !minting;
  const directHeading = noLinkYet ? "Direct link — no link yet" : "Direct link";

  return (
    <div style={{ ...T.card, marginBottom: 16 }} data-testid="card-channel-direct">
      {/* Card header */}
      <div style={T.cardHd}>
        {noLinkYet && <GapNumber n={2} />}
        <span style={{ fontSize: 16 }}>🔗</span>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>{directHeading}</h3>
        {linkUrl && <span style={T.liveChip}>✓ Link ready</span>}
      </div>

      {/* Card body */}
      <div style={T.cardBody}>
        {!serviceId ? (
          <p style={{ fontSize: 13, color: MUT }} data-testid="text-direct-no-selection">
            Pick a listing above to get its direct link.
          </p>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: MUT, marginBottom: 14 }} data-testid="text-direct-framing">
              {noLinkYet
                ? "The link is minted the first time you act — Copy link, WhatsApp or Show QR. Nothing to resolve beforehand."
                : "A booking through your own link is attributed to you and secures your rails rate."
              }
            </p>

            {/* URL box (shown once the link exists) */}
            {linkUrl && (
              <p style={{ ...T.mono, marginBottom: 14 }} data-testid="text-direct-url">{linkUrl}</p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
              <button style={T.btn} onClick={copyLink} disabled={minting} data-testid="button-direct-copy">
                {minting ? "Creating link…" : "Copy link"}
              </button>
              <button style={T.btn} onClick={shareWhatsApp} disabled={minting} data-testid="button-direct-whatsapp">
                WhatsApp
              </button>
              <button
                style={{ ...T.btn, borderColor: showQr ? ACC : HAIR, background: showQr ? ACCS : PGE, color: showQr ? ACC : INK }}
                onClick={toggleQr}
                disabled={minting}
                data-testid="button-direct-qr-toggle"
              >
                {showQr ? "Hide QR" : "Show QR"}
              </button>
            </div>

            {/* QR block */}
            {showQr && linkUrl && qrSvgUrl && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }} data-testid="block-direct-qr">
                <img
                  src={qrSvgUrl}
                  alt={`QR code for the direct link to ${serviceName}`}
                  style={{ width: 140, height: 140, borderRadius: 10, border: `1px solid ${HAIR}`, background: PGE, flexShrink: 0 }}
                  data-testid="img-direct-qr"
                />
                <div style={{ paddingTop: 8 }}>
                  <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 10px", lineHeight: 1.5, maxWidth: "38ch" }}>
                    Scan to open the booking page directly — use this on printed menus, table cards, or anywhere you meet guests in person.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                    <button
                      style={T.btn}
                      onClick={() => downloadQrPng(qrSvgUrl, `${serviceId}-direct-qr.png`)}
                      data-testid="button-direct-qr-download-png"
                    >
                      ↓ Download QR (PNG)
                    </button>
                    <a
                      href={qrSvgUrl}
                      download={`${serviceId}-direct-qr.svg`}
                      style={{ ...T.btn, textDecoration: "none", display: "inline-block" }}
                      data-testid="link-direct-qr-download-svg"
                    >
                      ↓ Download QR (SVG)
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Gap-state mint note — only shown before the link is created */}
            {noLinkYet && (
              <p style={{ fontSize: 11.5, color: MUT, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }} data-testid="text-direct-mint-note">
                Tapping any action above mints the link inline — the tracked /r/ rail is unchanged underneath.
              </p>
            )}

            {/* Suggested caption — only shown once a link exists */}
            {linkUrl && (
              <div style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 7, padding: "14px 16px" }}>
                <p style={{ ...T.sectionLabel, marginBottom: 8 }}>Suggested caption</p>
                <p style={{ fontSize: 12.5, color: INK, lineHeight: 1.6, margin: "0 0 10px" }}>
                  🌟 {captionWithLink}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  <button style={T.btn} onClick={copyCaptionAndLink} disabled={minting} data-testid="button-direct-copy-caption">
                    Copy caption + link
                  </button>
                  <button style={T.btn} onClick={shareWhatsApp} disabled={minting} data-testid="button-direct-caption-whatsapp">
                    WhatsApp
                  </button>
                  <button style={T.btn} onClick={postToX} disabled={minting} data-testid="button-direct-post-x">
                    Post to X
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// ── 5. Marketplace card (per-listing) ────────────────────────────────────────────────────────
//
// Honest live/blocked state from GET /api/provider/services/:id/publish-readiness. Blocked
// listings show the real blocker(s) + deep-link to fix (§13), never an optimistic "ready".
// Blocker severity: VERIFICATION_GATE → error (red ✕); everything else → warn (amber ⚠).
function MarketplaceCard({ serviceId }: { serviceId: string | null }) {
  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${serviceId}/publish-readiness`],
    enabled: !!serviceId,
  });

  const blocked = !!serviceId && !readiness.isLoading && readiness.data && !readiness.data.isLive;
  const heading = blocked ? "Marketplace — listing not live" : "Marketplace";

  return (
    <div style={{ ...T.card, marginBottom: 16 }} data-testid="card-channel-marketplace">
      {/* Card header */}
      <div style={T.cardHd}>
        {blocked && <GapNumber n={1} />}
        <span style={{ fontSize: 16 }}>🛍️</span>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>{heading}</h3>
        {!blocked && (
          <p style={{ fontSize: 13, color: MUT, margin: 0 }}>
            Where travelers discover this listing on Traveloure — Search, Discover and the feeds.
          </p>
        )}
      </div>

      {/* Card body */}
      <div style={T.cardBody}>
        {!serviceId ? (
          <p style={{ fontSize: 13, color: MUT }} data-testid="text-marketplace-no-selection">
            Pick a listing above to see its marketplace status.
          </p>
        ) : readiness.isLoading ? (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }} data-testid="skeleton-marketplace">
            <div style={{ height: 18, borderRadius: 4, background: HAIR, width: 160 }} />
            <div style={{ height: 14, borderRadius: 4, background: HAIR, width: "100%" }} />
          </div>
        ) : readiness.isError || !readiness.data ? (
          <p style={{ fontSize: 13, color: MUT }} data-testid="text-marketplace-error">
            Couldn't load this listing's status. Try again.
          </p>
        ) : readiness.data.isLive ? (
          <div data-testid="marketplace-state">
            <span style={T.liveChip} data-testid="badge-marketplace-live">✓ Live on the marketplace</span>
            <p style={{ fontSize: 13, color: MUT, margin: "10px 0 10px" }} data-testid="text-marketplace-live-detail">
              Travelers can find and book <strong style={{ color: INK }}>{readiness.data.name}</strong> right now.
            </p>
            <button
              style={T.btn}
              onClick={() => window.open(`${window.location.origin}${readiness.data!.publicHref}`, "_blank", "noopener,noreferrer")}
              data-testid="button-marketplace-view-public"
            >
              View public page →
            </button>
          </div>
        ) : (
          <div data-testid="marketplace-state">
            <p style={{ fontSize: 13, color: MUT, marginBottom: 12 }}>
              This listing can't go live until you resolve the following:
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }} data-testid="list-marketplace-blockers">
              {readiness.data.blockers.map((b) => {
                const sev  = blockerSev(b.code);
                const bg   = sev === "error" ? ERR_BG  : WBG;
                const ln   = sev === "error" ? ERR_LN  : WLN;
                const ink  = sev === "error" ? ERR_INK : WINK;
                const icon = sev === "error" ? "✕" : "⚠";
                return (
                  <div
                    key={b.code}
                    style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderRadius: 7, border: `1px solid ${ln}`, background: bg, padding: "11px 14px" }}
                    data-testid={`blocker-${b.code}`}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: ink, flexShrink: 0, fontSize: 13 }}>{icon}</span>
                      <p style={{ fontSize: 12.5, color: ink, margin: 0, lineHeight: 1.5 }}>{b.message}</p>
                    </div>
                    <Link href={b.fixHref}>
                      <button style={{ fontSize: 12, fontWeight: 600, color: ink, background: "none", border: `1px solid ${ln}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0, fontFamily: "inherit" }} data-testid={`button-fix-${b.code}`}>
                        Fix →
                      </button>
                    </Link>
                  </div>
                );
              })}
              {readiness.data.blockers.length === 0 && (
                <p style={{ fontSize: 13, color: MUT }} data-testid="text-marketplace-no-reason">
                  Status is resolving — check back in a moment.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ── Promote helpers ───────────────────────────────────────────────────────────

// Tag chip colors — Open slot = amber, Review = teal, fallback = neutral
const PROMO_TAG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "Open slot": { bg: WBG,      color: WINK,    border: WLN   },
  "Review":    { bg: ACCS,     color: ACC,     border: "#BFD5D0" },
  "Seasonal":  { bg: ACCS,     color: ACC,     border: "#BFD5D0" },
  "Event":     { bg: "#F0F4FF", color: "#3352CC", border: "#C5D0F5" },
};

function PromoTagChip({ tag }: { tag: string }) {
  const s = PROMO_TAG_STYLES[tag] ?? { bg: GRD, color: MUT, border: HAIR };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${s.border}`, background: s.bg, color: s.color, fontWeight: 600, whiteSpace: "nowrap" as const }}>
      {tag}
    </span>
  );
}

function promoOppKey(o: PostingOpportunity): string {
  return o.kind === "new_review" ? `review-${o.reviewId}` : `slot-${o.serviceId}-${o.nextDate}`;
}

function promoTag(o: PostingOpportunity): string {
  return o.kind === "new_review" ? "Review" : "Open slot";
}

function promoUrgency(o: PostingOpportunity): string {
  if (o.kind === "new_review") {
    const diff = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000);
    return diff <= 0 ? "Just now" : diff === 1 ? "Yesterday" : `${diff} days ago`;
  }
  const d = new Date(`${o.nextDate}T00:00:00`);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 6) return `This ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  const weeks = Math.round(diff / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} away`;
}

function promoTitle(o: PostingOpportunity): string {
  if (o.kind === "new_review") return `New ${o.rating}★ review on ${o.serviceName}`;
  const d = new Date(`${o.nextDate}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `You have an open slot on ${label}`;
}

function promoBody(o: PostingOpportunity): string {
  if (o.kind === "new_review") {
    const quote = o.text ? ` "${o.text}"` : "";
    return `Share this review to build trust with future travelers.${quote}`;
  }
  const spots = o.openSpots === 1 ? "1 spot" : `${o.openSpots} spots`;
  const d = new Date(`${o.nextDate}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `You have ${spots} open on ${label} that hasn't been booked yet. A quick post can fill it.`;
}

function promoCaption(o: PostingOpportunity): string {
  if (o.kind === "new_review") {
    const quote = o.text ? ` — "${o.text}"` : "";
    return `New ${o.rating}★ review on ${o.serviceName}${quote} 🙌`;
  }
  const spots = o.openSpots === 1 ? "1 spot" : `${o.openSpots} spots`;
  const d = new Date(`${o.nextDate}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${spots} still open for ${o.serviceName} on ${label} — book yours on Traveloure.`;
}

function promoImageUrl(o: PostingOpportunity): string {
  if (o.kind === "new_review") return `/api/share-image/review/${o.reviewId}.png`;
  return `/api/share-image/service/${o.serviceId}.png?format=${o.suggestedFrame}`;
}

function promoLinkParams(o: PostingOpportunity): { body: { targetType: string; targetId: string; frame: string }; fallback: string } {
  if (o.kind === "new_review") return { body: { targetType: "service", targetId: o.serviceId, frame: o.suggestedFrame }, fallback: `/services/${o.serviceId}` };
  return { body: { targetType: "service", targetId: o.serviceId, frame: o.suggestedFrame }, fallback: `/services/${o.serviceId}` };
}

// ── Single promote opportunity row ────────────────────────────────────────────
function PromoOppRow({ o, onDismiss }: { o: PostingOpportunity; onDismiss: () => void }) {
  const { toast } = useToast();
  const [imgFailed, setImgFailed] = useState(false);
  const caption = promoCaption(o);
  const imageUrl = promoImageUrl(o);
  const linkParams = promoLinkParams(o);

  async function getLink() {
    return ensureShortLink(linkParams.body as any, linkParams.fallback);
  }

  async function copyCaption() {
    const url = await getLink();
    try { await navigator.clipboard.writeText(`${caption}\n\n${url}`); } catch { /* fallback */ }
    toast({ title: "Caption copied", description: "Caption + link copied to clipboard." });
  }

  async function shareWhatsApp() {
    const url = await getLink();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${url}`)}`, "_blank", "noopener,noreferrer");
  }

  async function postToX() {
    const url = await getLink();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${caption} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ ...T.card, marginBottom: 0 }} data-testid={`card-promo-${promoOppKey(o)}`}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" as const }}>
            <PromoTagChip tag={promoTag(o)} />
            <span style={{ fontSize: 11.5, color: MUT }}>{promoUrgency(o)}</span>
            <span style={{ fontSize: 11, color: HAIR }}>·</span>
            <span style={{ fontSize: 11, color: MUT, fontStyle: "italic" }}>
              {o.kind === "new_review" ? o.serviceName : o.serviceName}
            </span>
          </div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: 0 }}>{promoTitle(o)}</p>
        </div>
        <button
          style={{ fontSize: 11.5, color: MUT, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", flexShrink: 0 }}
          onClick={onDismiss}
          data-testid={`button-promo-dismiss-${promoOppKey(o)}`}
        >
          Dismiss
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px" }}>
        <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 12px", lineHeight: 1.5 }}>{promoBody(o)}</p>

        {/* Ready-to-post caption box */}
        <div style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
          <p style={{ ...T.sectionLabel, marginBottom: 6 }}>Ready-to-post caption</p>
          <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
            {caption}
          </p>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <button style={T.btn} onClick={copyCaption} data-testid={`button-promo-copy-${promoOppKey(o)}`}>
            Copy caption + link
          </button>
          <button style={T.btn} onClick={shareWhatsApp} data-testid={`button-promo-whatsapp-${promoOppKey(o)}`}>
            WhatsApp
          </button>
          <button style={T.btn} onClick={postToX} data-testid={`button-promo-x-${promoOppKey(o)}`}>
            Post to X
          </button>
          <InstagramPublishButton
            imageUrl={imageUrl}
            caption={caption}
            available={!imgFailed}
            unavailableReason={imgFailed ? "Share image unavailable right now" : undefined}
            idPrefix={`promo-${promoOppKey(o)}`}
          />
        </div>
      </div>
    </div>
  );
}

// ── 6. Promote card (account-level; S6 — moves here from Catalog) ─────────────────────────────
//
// Real posting nudges tied to reviews and open slots (§13 — no invented opportunities).
// Each card: TagChip · urgency · listing · Dismiss | title | body | ready-to-post caption |
// Copy + WhatsApp + X + Instagram. Measurement stays on Performance (ruling 74 disposition 8).
// hint: Structural and logic conflict. Both design and behavior differ.
function PromoteCard({ onSelectService: _onSelectService }: { onSelectService: (serviceId: string) => void }) {
  const oppsQuery = useQuery<{ opportunities: PostingOpportunity[] }>({
    queryKey: ["/api/me/posting-opportunities"],
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const opps = (oppsQuery.data?.opportunities ?? []).filter(
    (o) => !dismissed.has(promoOppKey(o)),
  );

  function dismiss(key: string) {
    setDismissed((prev) => new Set(Array.from(prev).concat(key)));
  }

  return (
    <div data-testid="section-channel-promote">
      {oppsQuery.isLoading ? (
        <div style={{ ...T.card, padding: "18px 22px" }}>
          <p style={{ fontSize: 13, color: MUT }}>Checking for reasons to post…</p>
        </div>
      ) : opps.length === 0 ? (
        <div style={{ borderRadius: 7, border: `1px dashed ${HAIR}`, background: GRD, padding: "14px 16px", textAlign: "center" as const }} data-testid="text-promo-empty">
          <p style={{ fontSize: 12.5, color: MUT, margin: 0, lineHeight: 1.5 }}>
            No opportunities right now — get at least one listing approved and we'll surface relevant moments to promote it.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          {opps.map((o) => (
            <PromoOppRow
              key={promoOppKey(o)}
              o={o}
              onDismiss={() => dismiss(promoOppKey(o))}
            />
          ))}
        </div>
      )}

      {/* Measurement note */}
      <p style={{ ...T.noteQuiet, marginTop: 16 }}>
        <strong style={{ color: INK }}>Measurement stays on Performance.</strong>{" "}
        This page makes the asset and hands you the link; how it did is a question the analytics module answers.
      </p>
    </div>
  );
}
// ── Main page ─────────────────────────────────────────────────────────────────────────────────
// hint: Logic changed on both sides. Requires understanding intent of each change.
export default function ProviderDistribute() {
  const { data: services, isLoading: servicesLoading } = useQuery<OwnerService[]>({
    queryKey: ["/api/provider/services"],
  });

  const listings = useMemo(() => (Array.isArray(services) ? services : []), [services]);

  // S6: Catalog's per-card "Distribute this →" pointer lands as ?listing=<id>.
  // A stale/foreign id is silently ignored and the page auto-selects the first listing.
  const search = useSearch();
  const deepLinkListing = new URLSearchParams(search).get("listing");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const consumedDeepLink = useRef<string | null>(null);

  useEffect(() => {
    if (selectedId || listings.length === 0) return;
    if (deepLinkListing && consumedDeepLink.current !== deepLinkListing) {
      consumedDeepLink.current = deepLinkListing;
      const match = listings.find((s) => s.id === deepLinkListing);
      if (match) { setSelectedId(match.id); return; }
    }
    setSelectedId(listings[0].id);
  }, [listings, selectedId, deepLinkListing]);

  const selectedService = listings.find((s) => s.id === selectedId) ?? null;
  const selectedName    = selectedService?.serviceName ?? "this listing";
  const arrivalService  = deepLinkListing ? listings.find((s) => s.id === deepLinkListing) ?? null : null;

  return (
    <ProviderLayout title="Distribute">
      <div style={{ padding: "22px 24px 80px", maxWidth: 900, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: INK }}>

        {/* Arrival banner — when landing from Catalog's "Distribute this →" link */}
        {arrivalService && (
          <div
            style={{ borderRadius: 10, border: `1px solid ${HAIR}`, background: GRD, padding: "12px 16px", marginBottom: 20 }}
            data-testid="banner-promote-arrival"
          >
            <p style={{ fontSize: 11, color: MUT, margin: "0 0 4px" }} data-testid="text-arrival-crumbs">
              <Link href="/provider/services"><span style={{ textDecoration: "underline", cursor: "pointer" }}>Catalog</span></Link>
              {" › "}Distribute{" › "}
              <span style={{ color: INK }}>{arrivalService.serviceName}</span>
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: 0 }} data-testid="text-arrival-promoting">
                Promoting «{arrivalService.serviceName}»
              </p>
              <Link href="/provider/services">
                <button style={T.btn} data-testid="button-back-to-catalog">← Back to Catalog</button>
              </Link>
            </div>
          </div>
        )}

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: "0 0 4px", letterSpacing: "-0.01em" }} data-testid="text-distribute-title">
            Distribute
          </h1>
          <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.55 }}>
            Where your listings meet an audience.
          </p>
        </div>

        {/* 1. Storefront (account-level) */}
        <StorefrontCard services={listings} />

        {/* Listing selector — scopes Share kit, Direct link, and Marketplace */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" as const }}>
          <span style={T.sectionLabel}>For listing</span>
          {servicesLoading ? (
            <div style={{ height: 32, width: 200, background: HAIR, borderRadius: 6 }} />
          ) : listings.length === 0 ? (
            <p style={{ fontSize: 13, color: MUT, margin: 0 }} data-testid="text-no-listings">
              No listings yet —{" "}
              <Link href="/provider/workstation">
                <span style={{ textDecoration: "underline", cursor: "pointer", color: ACC }} data-testid="link-create-listing">
                  create one in the Workstation →
                </span>
              </Link>
            </p>
          ) : (
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ border: `1px solid ${HAIR}`, background: PGE, color: INK, padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
              data-testid="select-listing"
            >
              {listings.map((s) => (
                <option key={s.id} value={s.id} data-testid={`option-listing-${s.id}`}>{s.serviceName}</option>
              ))}
            </select>
          )}
        </div>

        {/* Channel-state strip (shown when a listing is selected) */}
        {selectedId && <ChannelStateStrip services={listings} selectedId={selectedId} />}

        {/* 2. Marketplace (per-listing) — resolve first: it gates the other two */}
        <MarketplaceCard serviceId={selectedId} />

        {/* 3. Direct link (per-listing) — mints on first action, independent of marketplace */}
        <DirectLinkCard serviceId={selectedId} serviceName={selectedName} />

        {/* 4. Share kit (per-listing) — unlocks once listing is approved + active */}
        <ShareKitCard service={selectedService} serviceId={selectedId} />

        {/* 5. Promote (account-level) */}
        <PromoteCard onSelectService={setSelectedId} />

      </div>
    </ProviderLayout>
  );
}
