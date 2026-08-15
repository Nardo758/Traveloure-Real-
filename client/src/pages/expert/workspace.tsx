import { useState, useEffect, useRef, useCallback, useSyncExternalStore, Component, type ReactNode, type ErrorInfo } from "react";
import { PlanCard } from "@/components/plancard/PlanCard";
import { ItemComments } from "@/components/plancard/ItemComments";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { DmoPickerCore } from "@/components/expert/dmo-picker-modal";
import { ServicePickerModal } from "@/components/expert/service-picker-modal";
import { TransportPickerCore } from "@/components/expert/transport-picker";
import { PartnerCatalogPickerCore } from "@/components/expert/partner-catalog-picker";
import { parsePartnerSource } from "@/lib/partner-source";
import { PlatformContentPickerCore } from "@/components/expert/platform-content-picker";
import { MyServicesPickerCore } from "@/components/expert/my-services-picker";
import ReadyMadeListingPanel, { type ReadyMadeListing } from "@/components/expert/ready-made-listing-panel";
import { resolveFormat } from "@/lib/build-formats/registry";
import { ClientFormatView } from "@/components/build-formats/ClientFormatView";
import { SocialKitCard } from "@/components/build-formats/SocialKitCard";
import { STORE_GATE_MESSAGE } from "@shared/launch-markets";
import { APIProvider, Map, InfoWindow, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapMarker, GOOGLE_MAPS_MAP_ID } from "@/components/ui/map-marker";
// Advisor Phase 1 — the route layer's per-day polylines on the Google branch (Leaflet's own
// react-leaflet Polyline is used directly inside leaflet-plan-map.tsx instead).
import { Polyline } from "@/components/ui/map-polyline";
import {
  MapPin, ChevronRight, ChevronDown, ChevronUp, Pencil, Sparkles, Link2, PenSquare,
  Send, MessageSquare, Plus, Lock, Eye, EyeOff,
  FileText, CheckCircle, Clock, StickyNote, X, ShieldCheck, ExternalLink, User, Mail,
  CreditCard, CalendarDays, Loader2, ArrowLeft, Users,
  Search, Star, MapPinned, Shield, BatteryLow,
  ShoppingBag, Store, Copy, Megaphone, AlertTriangle, Lightbulb, XCircle,
  Trash2, RefreshCw, Route, Building2, Briefcase,
} from "lucide-react";
// L4b: the mode picker's chauffeured-field gate mirrors the SAME shared constant/predicate the
// server uses (CLAUDE.md §18's chauffeured set) — never a hand-typed duplicate list.
import { CHAUFFEURED_MODES, isChauffeuredMode } from "@shared/trip-plan";
import { TRANSPORT_MODE_ICONS, TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { parseApiErrorMessage } from "@/lib/api-error";
// W5-A (QA_PUNCH_LIST item 19) — the discovery-layer candidate-pin publish/subscribe store. Every
// Add-panel source drawer publishes its own current results here; CanvasMapSection reads the
// single active publisher. See client/src/lib/map-candidates.ts for the full contract.
import { usePublishMapCandidates, useMapCandidates, type MapCandidate } from "@/lib/map-candidates";
// WORKSTATION_LOCATION_MAP_SPEC Part B — keyless OSM fallback for CanvasMapSection's plan map,
// rendered instead of the Google block when VITE_GOOGLE_MAPS_API_KEY is unset (see that file's
// doc comment for the "Google swap point" contract).
import { LeafletPlanMap } from "@/components/expert/leaflet-plan-map";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/** Runtime Google Maps auth-failure detection — Google calls the global `gm_authFailure` hook
 *  when the JS API loads but the key is rejected (RefererNotAllowedMapError, ExpiredKeyMapError,
 *  BillingNotEnabled…). A build-time `MAPS_KEY` check can't see these, so without this the plan
 *  map dead-ends on Google's "AuthFailure" overlay even though the keyless Leaflet fallback
 *  works. Module-level store + useSyncExternalStore so every map surface reacts at once. */
let googleMapsAuthFailed = false;
const gmAuthListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // @vis.gl/react-google-maps assigns its OWN window.gm_authFailure (that's where its
  // "Error: AuthFailure" overlay comes from), which would clobber a plain assignment made here
  // at module-eval time. An accessor property survives that: any later assignment lands in
  // `inner` and our detector stays wrapped around whatever handler is current.
  const w = window as any;
  // Idempotent across HMR / repeated module evaluation — install exactly once.
  if (!w.__gmAuthFailureHooked) {
    let inner: (() => void) | undefined = typeof w.gm_authFailure === "function" ? w.gm_authFailure : undefined;
    // ONE stable wrapper (not a fresh closure per get) so `window.gm_authFailure =
    // window.gm_authFailure` round-trips harmlessly; the setter drops assignments of the
    // wrapper itself, so it can never end up as its own `inner` (no recursion).
    const wrapper = () => {
      googleMapsAuthFailed = true;
      gmAuthListeners.forEach(l => l());
      inner?.();
    };
    try {
      Object.defineProperty(w, "gm_authFailure", {
        configurable: true,
        get: () => wrapper,
        set(fn: unknown) { if (fn !== wrapper) inner = typeof fn === "function" ? (fn as () => void) : undefined; },
      });
      w.__gmAuthFailureHooked = true;
    } catch {
      // Non-configurable pre-existing descriptor — leave the global alone; the map simply
      // keeps Google's own AuthFailure overlay (the pre-fallback behavior), never a crash.
    }
  }
}
function useGoogleMapsAuthFailed(): boolean {
  return useSyncExternalStore(
    (cb) => { gmAuthListeners.add(cb); return () => gmAuthListeners.delete(cb); },
    () => googleMapsAuthFailed,
    () => false,
  );
}

// ── Console tokens (§17 two-palettes rule: never raw hex in console pages) ──
// These resolve against the .console-scope block in client/src/index.css (light + dark),
// which BackofficeShell (via ExpertLayout) wraps around every console page.
const INK = "var(--console-ink)";
const MID = "var(--console-mid)";
const FAINT = "var(--console-faint)";
const LINE = "var(--console-line)";
const GROUND = "var(--console-ground)";
const CARD = "var(--console-card)";
const BRAND = "var(--console-brand)";
const BRAND_SOFT = "var(--console-brand-soft)";
const OK = "var(--console-ok)";
const OK_SOFT = "var(--console-ok-soft)";
const WARN = "var(--console-warn)";
const WARN_SOFT = "var(--console-warn-soft)";
const DANGER = "var(--console-danger)";
const DANGER_SOFT = "var(--console-danger-soft)";

// Spec .btn-primary (mockup-unified-workspace.html :105-108): 1px brand border +
// brand-soft fill + ink text — never a solid brand fill.
const btnPrimaryStyle: React.CSSProperties = {
  border: `1px solid ${BRAND}`,
  background: BRAND_SOFT,
  color: INK,
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};
const btnQuietStyle: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: CARD,
  color: INK,
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};

function Av({ i, s = 32 }: { i: string; s?: number }) {
  return (
    <div style={{ width: s, height: s, borderRadius: "50%", background: BRAND, display: "flex", alignItems: "center", justifyContent: "center", color: CARD, fontSize: s * 0.35, fontWeight: 600, flexShrink: 0 }}>{i}</div>
  );
}

type ChipTone = "ok" | "warn" | "danger" | "brand" | "mut";

/** Spec .chip (mockup :100-104): the distribution/state chip vocabulary. */
function StateChip({ tone = "mut", children, testId }: { tone?: ChipTone; children: React.ReactNode; testId?: string }) {
  const m: Record<ChipTone, { bg: string; tx: string; bd: string }> = {
    ok: { bg: OK_SOFT, tx: OK, bd: "transparent" },
    warn: { bg: WARN_SOFT, tx: WARN, bd: "transparent" },
    danger: { bg: DANGER_SOFT, tx: DANGER, bd: "transparent" },
    brand: { bg: BRAND_SOFT, tx: BRAND, bd: "transparent" },
    mut: { bg: GROUND, tx: MID, bd: LINE },
  };
  const col = m[tone];
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: col.bg, color: col.tx, border: `1px solid ${col.bd}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Chip({ children, active = false, onClick }: any) {
  return <button data-testid={`chip-${String(children).toLowerCase().replace(/[^a-z0-9]/g, "-")}`} onClick={onClick} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 500, cursor: "pointer", border: active ? `1.5px solid ${BRAND}` : `1.5px solid ${LINE}`, background: active ? BRAND_SOFT : CARD, color: active ? BRAND : MID }}>{children}</button>;
}

// AI booking copilot — verification leg. Renders ONLY real snapshot data (§13: no verification
// snapshot ⇒ an honest "Not verified" state, never invented values). Never renders a URL — the
// server never sends the affiliateUrl in the snapshot to begin with (§16).
const VERDICT_CHIP: Record<string, { tone: ChipTone; label: string }> = {
  verified: { tone: "ok", label: "Verified" },
  flagged: { tone: "warn", label: "Flagged" },
  unclear: { tone: "mut", label: "Unclear" },
};
const FLAG_LABEL: Record<string, string> = {
  price_drift: "Price changed since the traveler saw it",
  possibly_sold_out: "May be sold out",
  date_unavailable: "Requested date may not be available",
  unclear: "Some details couldn't be confirmed from the page",
};

function VerificationPanel({ verification, testId }: { verification: any; testId: string }) {
  const { toast } = useToast();
  if (!verification) {
    return (
      <div data-testid={testId} style={{ fontSize: 11, color: FAINT, fontStyle: "italic", marginBottom: 8 }}>
        Not verified — run "Verify with AI" before booking to confirm current price and availability.
      </div>
    );
  }
  const chip = VERDICT_CHIP[verification.verdict] ?? VERDICT_CHIP.unclear;
  const flags: Array<{ type: string; seen?: number; current?: number }> = Array.isArray(verification.flags) ? verification.flags : [];
  const hasPriceDrift = flags.some((f) => f.type === "price_drift");
  const verifiedAt = verification.verifiedAt ? new Date(verification.verifiedAt) : null;

  return (
    <div data-testid={testId} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 9px", marginBottom: 8, background: GROUND }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck style={{ width: 12, height: 12, color: MID }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: INK }}>AI verification</span>
          <StateChip tone={chip.tone}>{chip.label}</StateChip>
        </div>
        {verifiedAt && <span style={{ fontSize: 10, color: FAINT }}>{formatRelativeTime(verifiedAt)}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: flags.length ? 6 : 0 }}>
        <div style={{ fontSize: 11, color: MID }}>
          Price:{" "}
          {verification.price != null ? (
            <span style={{ color: hasPriceDrift ? DANGER : INK, fontWeight: 600 }}>
              {verification.currency ?? ""} {verification.price}
            </span>
          ) : (
            <span style={{ fontStyle: "italic" }}>not clearly stated on the partner page</span>
          )}
          {hasPriceDrift && (() => {
            const drift = flags.find((f) => f.type === "price_drift");
            return drift ? (
              <span style={{ color: DANGER, marginLeft: 6 }}>(traveler was quoted {drift.seen})</span>
            ) : null;
          })()}
        </div>
        <div style={{ fontSize: 11, color: MID }}>
          Availability:{" "}
          <span style={{ fontWeight: 600, color: verification.availability === "sold_out" ? DANGER : verification.availability === "bookable" ? OK : MID }}>
            {verification.availability === "bookable" ? "Bookable" : verification.availability === "sold_out" ? "Possibly sold out" : "Unclear"}
          </span>
        </div>
        {verification.cancellation && (
          <div style={{ fontSize: 11, color: MID }}>Cancellation: {verification.cancellation}</div>
        )}
      </div>

      {flags.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
          {flags.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: f.type === "unclear" ? MID : WARN }}>
              <AlertTriangle style={{ width: 10, height: 10, flexShrink: 0 }} />
              {FLAG_LABEL[f.type] ?? f.type}
            </div>
          ))}
        </div>
      )}

      {verification.agentNote && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ flex: 1, fontSize: 10.5, color: MID, lineHeight: 1.5 }}>{verification.agentNote}</div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(verification.agentNote).then(
                () => toast({ title: "Copied", description: "Agent note copied to clipboard." }),
                () => toast({ title: "Couldn't copy", variant: "destructive" }),
              );
            }}
            data-testid={`${testId}-copy-note`}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", background: CARD, color: MID, border: `1px solid ${LINE}` }}
          >
            <Copy style={{ width: 10, height: 10 }} />Copy
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline detail panel for a Viator activity card. Fetches
 *  GET /api/viator/activities/:productCode on demand and renders
 *  description, duration, inclusions, exclusions, and cancellation policy.
 *  Lives outside the workspace component so it can use useQuery without
 *  violating the rules-of-hooks ordering. */
function ViatorDetailPanel({ productCode }: { productCode: string }) {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/viator/activities/${productCode}`],
    staleTime: 5 * 60 * 1000,
  });
  // Description "show more" — collapsed at 400 chars so the card doesn't dominate
  // the panel; experts can expand to read the full text before adding.
  const DESC_COLLAPSE = 400;
  const [descExpanded, setDescExpanded] = useState(false);

  if (isLoading) {
    return (
      <div style={{ padding: "10px 0 4px" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 14, borderRadius: 4, background: "var(--console-ground)", marginBottom: 7 }} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ padding: "8px 0 2px", fontSize: 11, color: "var(--console-faint)", fontStyle: "italic" }}>
        Could not load activity details.
      </div>
    );
  }

  const formatDuration = (dur: any): string | null => {
    if (!dur) return null;
    if (dur.fixedDurationInMinutes) {
      const h = Math.floor(dur.fixedDurationInMinutes / 60);
      const m = dur.fixedDurationInMinutes % 60;
      return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
    }
    if (dur.variableDurationFromMinutes != null && dur.variableDurationToMinutes != null) {
      const fmtMin = (n: number) => {
        const h = Math.floor(n / 60); const m = n % 60;
        return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
      };
      return `${fmtMin(dur.variableDurationFromMinutes)} – ${fmtMin(dur.variableDurationToMinutes)}`;
    }
    return null;
  };

  const dur = formatDuration(data.duration ?? data.itinerary?.duration);
  // All inclusions and exclusions — no artificial slice limit.
  const inclusions: string[] = (data.inclusions ?? [])
    .map((inc: any) => inc.otherDescription ?? inc.typeDescription ?? inc.categoryDescription)
    .filter(Boolean);
  const exclusions: string[] = (data.exclusions ?? [])
    .map((exc: any) => exc.otherDescription ?? exc.typeDescription ?? exc.categoryDescription)
    .filter(Boolean);

  const cancelPolicy = data.cancellationPolicy;
  const cancelLabel = cancelPolicy?.type === "STANDARD" ? "Standard (free cancellation available)"
    : cancelPolicy?.type === "ALL_SALES_FINAL" ? "Non-refundable"
    : cancelPolicy?.description ?? cancelPolicy?.type ?? null;

  const fullDesc: string = data.description ?? "";
  const descNeedsToggle = fullDesc.length > DESC_COLLAPSE;
  const visibleDesc = descNeedsToggle && !descExpanded
    ? `${fullDesc.slice(0, DESC_COLLAPSE)}…`
    : fullDesc;

  return (
    <div
      data-testid={`viator-detail-panel-${productCode}`}
      style={{ paddingTop: 10, borderTop: `1px solid var(--console-line)`, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {/* Description — full text with optional collapse for long entries */}
      {fullDesc && (
        <div>
          <div style={{ fontSize: 11.5, color: "var(--console-ink)", lineHeight: 1.55 }}>
            {visibleDesc}
          </div>
          {descNeedsToggle && (
            <button
              onClick={() => setDescExpanded(e => !e)}
              data-testid={`button-viator-desc-toggle-${productCode}`}
              style={{ background: "none", border: "none", padding: "3px 0 0", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--console-brand)" }}
            >
              {descExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Duration */}
      {dur && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--console-mid)" }}>
          <Clock style={{ width: 11, height: 11, flexShrink: 0 }} />
          <span><strong style={{ color: "var(--console-ink)" }}>Duration:</strong> {dur}</span>
        </div>
      )}

      {/* Inclusions — all items */}
      {inclusions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--console-faint)", marginBottom: 3 }}>Included</div>
          <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            {inclusions.map((inc, i) => (
              <li key={i} style={{ fontSize: 11, color: "var(--console-mid)", lineHeight: 1.4 }}>{inc}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Exclusions — all items */}
      {exclusions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--console-faint)", marginBottom: 3 }}>Not included</div>
          <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            {exclusions.map((exc, i) => (
              <li key={i} style={{ fontSize: 11, color: "var(--console-mid)", lineHeight: 1.4 }}>{exc}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Cancellation policy */}
      {cancelLabel && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: 11, color: "var(--console-mid)" }}>
          <Shield style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
          <span><strong style={{ color: "var(--console-ink)" }}>Cancellation:</strong> {cancelLabel}</span>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hr ago";
  return `${diffHr} hr ago`;
}

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "Client review" },
  { key: "delivered", label: "Delivered" },
];

interface TravelerProfile {
  tripId: string;
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  numberOfTravelers: number;
  travelerName: string;
  travelerEmail: string | null;
  profileImageUrl: string | null;
}

function BookingBriefModal({
  provider, bookingUrl, tripId, onClose,
  itemId, itemTitle, onConfirm, onConfirmed,
}: {
  provider: string;
  bookingUrl?: string;
  tripId: string;
  onClose: () => void;
  /** When set, the "Confirm booking" action PATCHes this item's bookingStatus to "pending". */
  itemId?: string;
  /** Displayed in the modal sub-header as the item being booked. */
  itemTitle?: string;
  /** Called after the server PATCH succeeds (or immediately if no itemId / no status change). */
  onConfirm?: () => void;
  /** Called with the provider name after the expert clicks "Continue" — used by the
   *  session-level confirmedProviders set (task #128) to show "already confirmed" badges. */
  onConfirmed?: (provider: string) => void;
}) {
  const { toast } = useToast();
  const { data: profile, isLoading } = useQuery<TravelerProfile>({
    queryKey: [`/api/trips/${tripId}/traveler-profile`],
    enabled: !!tripId,
  });
  // Opt-in checkbox: the expert explicitly decides whether opening the brief means they
  // are starting the booking (→ mark pending). Unchecked by default so that merely
  // reviewing PII does not silently change item state.
  const [markPending, setMarkPending] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!itemId || !markPending) return;
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/itinerary-items/${itemId}`, { bookingStatus: "pending" });
      return res.json();
    },
    onSuccess: () => {
      if (itemId && markPending) {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
        toast({ title: "Booking started", description: "Item marked as pending — complete the booking with the vendor." });
      }
      onConfirm?.();
      onClose();
    },
    onError: (err: any) => toast({ title: "Could not update status", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  const formatDateLocal = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const rows = profile ? [
    { icon: <User style={{ width: 13, height: 13 }} />, label: "Booking name", value: profile.travelerName },
    { icon: <Mail style={{ width: 13, height: 13 }} />, label: "Contact email", value: profile.travelerEmail || "Not on file" },
    { icon: <MapPin style={{ width: 13, height: 13 }} />, label: "Destination", value: profile.destination },
    { icon: <CalendarDays style={{ width: 13, height: 13 }} />, label: "Travel dates", value: `${formatDateLocal(profile.startDate)} → ${formatDateLocal(profile.endDate)}` },
    { icon: <Users style={{ width: 13, height: 13 }} />, label: "Travellers", value: profile.numberOfTravelers ? `${profile.numberOfTravelers} person${profile.numberOfTravelers > 1 ? "s" : ""}` : "1 person" },
    { icon: <CreditCard style={{ width: 13, height: 13 }} />, label: "Passport / ID", value: "Not on file" },
  ] : [];

  const handleContinue = () => {
    if (bookingUrl) {
      window.open(bookingUrl, "_blank", "noopener,noreferrer");
    }
    onConfirmed?.(provider);
    if (itemId) {
      statusMutation.mutate();
    } else {
      onConfirm?.();
      onClose();
    }
  };

  const subtitle = itemTitle
    ? `Secure client details — ${itemTitle}`
    : `Secure client details for ${provider}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: CARD, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: BRAND_SOFT, display: "flex", alignItems: "center", justifyContent: "center" }}><ShieldCheck style={{ width: 16, height: 16, color: BRAND }} /></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>Booking Brief</div>
              <div style={{ fontSize: 11, color: MID, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
            </div>
          </div>
          <button onClick={onClose} data-testid="button-close-booking-brief" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 4, display: "flex" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        {itemTitle && (
          <div style={{ margin: "12px 18px 0", padding: "6px 10px", background: BRAND_SOFT, border: `1px solid ${BRAND}`, borderRadius: 8, fontSize: 11.5, fontWeight: 600, color: INK }}>
            <FileText style={{ width: 11, height: 11, display: "inline", marginRight: 5, verticalAlign: "middle" }} />
            {itemTitle}
          </div>
        )}
        <div style={{ margin: "12px 18px 0", padding: "8px 12px", background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Lock style={{ width: 13, height: 13, color: MID, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: MID, lineHeight: 1.5 }}>Booking context only. Use these details to complete your client's reservation. Do not save or share with unrelated third parties.</span>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {isLoading ? (
            <>
              <div style={{ height: 44, background: GROUND, borderRadius: 8, animation: "pulse 1.5s infinite" }} />
              <div style={{ height: 44, background: GROUND, borderRadius: 8, animation: "pulse 1.5s infinite" }} />
              <div style={{ height: 44, background: GROUND, borderRadius: 8, animation: "pulse 1.5s infinite" }} />
            </>
          ) : rows.map((row, i) => (
            <div key={i} data-testid={`booking-brief-row-${row.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: GROUND, borderRadius: 8, border: `1px solid ${LINE}` }}>
              <div style={{ color: FAINT, flexShrink: 0 }}>{row.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: row.value === "Not on file" ? FAINT : INK }}>{row.value}</div>
              </div>
            </div>
          ))}
        </div>
        {itemId && (
          <div style={{ margin: "0 18px 2px", padding: "8px 10px", background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="checkbox"
              id="booking-brief-mark-pending"
              checked={markPending}
              onChange={e => setMarkPending(e.target.checked)}
              data-testid="checkbox-mark-booking-pending"
              style={{ marginTop: 2, cursor: "pointer", accentColor: BRAND }}
            />
            <label htmlFor="booking-brief-mark-pending" style={{ fontSize: 11.5, color: MID, lineHeight: 1.5, cursor: "pointer" }}>
              I'm starting this booking — mark item as <strong style={{ color: INK }}>pending</strong>
            </label>
          </div>
        )}
        <div style={{ padding: "14px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={statusMutation.isPending} style={{ ...btnQuietStyle, flex: 1, padding: "8px", fontSize: 13, color: MID }}>Cancel</button>
          <button
            onClick={handleContinue}
            disabled={statusMutation.isPending}
            data-testid="button-confirm-booking"
            style={{ ...btnPrimaryStyle, flex: 2, padding: "8px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: statusMutation.isPending ? 0.6 : 1 }}
          >
            {statusMutation.isPending
              ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
              : <ExternalLink style={{ width: 13, height: 13 }} />}
            {bookingUrl ? `Continue to ${provider}` : "Got the details"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** QA_PUNCH_LIST item 17 — Google Places autocomplete, the inner render (needs an `<APIProvider>`
 *  ancestor for `useMapsLibrary`). Uses the classic `AutocompleteService`/`PlacesService` pair
 *  (works with just the `places` library, loaded on demand — no `libraries` prop needed on
 *  `<APIProvider>`, `useMapsLibrary` imports it lazily). A plain, uncontrolled suggestion
 *  dropdown — no external autocomplete widget/web-component, so it composes with this file's own
 *  input styling. `onChange` fires on every keystroke regardless of API state, so typing is never
 *  gated on Places being available — only the SUGGESTIONS are. */
function PlacesAutocompleteInputInner({
  value, onChange, onPlaceSelected, placeholder, testId, disabled, style, autoFocus, onKeyDown, onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlaceSelected?: (place: { text: string; lat?: string; lng?: string }) => void;
  placeholder?: string;
  testId: string;
  disabled?: boolean;
  style: React.CSSProperties;
  autoFocus?: boolean;
  /** Passthroughs for hosts that commit on Enter/blur (the destination chip editor). Composed
   *  with — never replacing — the dropdown's own close-on-blur. Suggestion clicks use onMouseDown
   *  preventDefault, so picking a suggestion does NOT blur the input and cannot mis-fire a
   *  blur-commit. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    try {
      acServiceRef.current = new placesLib.AutocompleteService();
      placesServiceRef.current = new placesLib.PlacesService(document.createElement("div"));
    } catch {
      // Construction failing (bad key / billing) is exactly the fallback case — leave the refs
      // null so getPlacePredictions below is skipped and this behaves as plain text.
      acServiceRef.current = null;
      placesServiceRef.current = null;
    }
  }, [placesLib]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!acServiceRef.current || !v.trim()) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      try {
        acServiceRef.current!.getPlacePredictions({ input: v }, (results, status) => {
          if (status === "OK" && results?.length) {
            setPredictions(results);
            setOpen(true);
          } else {
            // Covers REQUEST_DENIED (bad key) and every other non-OK status — same fallback
            // posture as a load failure: no dropdown, plain text keeps working.
            setPredictions([]);
            setOpen(false);
          }
        });
      } catch {
        setPredictions([]);
        setOpen(false);
      }
    }, 300);
  };

  const pick = (prediction: google.maps.places.AutocompletePrediction) => {
    onChange(prediction.description);
    setOpen(false);
    setPredictions([]);
    if (!onPlaceSelected) return;
    if (!placesServiceRef.current) {
      onPlaceSelected({ text: prediction.description });
      return;
    }
    try {
      placesServiceRef.current.getDetails(
        { placeId: prediction.place_id, fields: ["geometry", "name"] },
        (place, status) => {
          if (status === "OK" && place?.geometry?.location) {
            onPlaceSelected({
              text: prediction.description,
              lat: String(place.geometry.location.lat()),
              lng: String(place.geometry.location.lng()),
            });
          } else {
            onPlaceSelected({ text: prediction.description });
          }
        },
      );
    } catch {
      onPlaceSelected({ text: prediction.description });
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onBlur?.(); }}
        onFocus={() => { if (predictions.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        data-testid={testId}
        disabled={disabled}
        style={style}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {open && predictions.length > 0 && (
        <div
          data-testid={`${testId}-suggestions`}
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 3, maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}
        >
          {predictions.map(p => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(p); }}
              data-testid={`${testId}-suggestion-${p.place_id}`}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 12.5, background: "none", border: "none", cursor: "pointer", color: INK }}
            >
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** QA_PUNCH_LIST item 17 outer wrapper — decides whether Places is even attempted. FALLBACK IS
 *  MANDATORY (no key, or the Maps API failed to load): renders a plain `<input>`, byte-identical
 *  to what these two fields rendered before this lane — never blocks typing, never crashes. A
 *  local `<APIProvider>` (not a page-wide one) mirrors this file's established convention of
 *  wrapping Maps usage locally around the section that needs it (see the Platform-services browse
 *  map below); nesting multiple `<APIProvider>`s with the SAME apiKey is safe — the underlying
 *  loader is a de-duped singleton keyed by its serialized params (`GoogleMapsApiLoader.load`),
 *  so a second provider with identical params is a harmless no-op re-import, never a duplicate
 *  script load or a "loaded with different parameters" conflict. */
function PlacesAutocompleteInput(props: {
  value: string;
  onChange: (v: string) => void;
  onPlaceSelected?: (place: { text: string; lat?: string; lng?: string }) => void;
  placeholder?: string;
  testId: string;
  disabled?: boolean;
  style: React.CSSProperties;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const mapsAuthFailed = useGoogleMapsAuthFailed();
  if (!MAPS_KEY || loadFailed || mapsAuthFailed) {
    return (
      <input
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={props.onKeyDown}
        onBlur={props.onBlur}
        placeholder={props.placeholder}
        data-testid={props.testId}
        disabled={props.disabled}
        style={props.style}
        autoFocus={props.autoFocus}
      />
    );
  }
  return (
    <APIProvider apiKey={MAPS_KEY} onError={() => setLoadFailed(true)}>
      <PlacesAutocompleteInputInner {...props} />
    </APIProvider>
  );
}

/** The ONE submit-time geocode fallback for Workstation location fields (spec: "one resolver,
 *  not three") — used by InlineAddItemForm, LogBookingForm and the item editor's location field
 *  whenever no exact Places pick supplied coordinates. Same server rail as everything else
 *  (`GET /api/geocode`), `destination` only ever a disambiguation suffix on real item-level text
 *  (§13 — the caller must not pass an empty locationName). Best-effort: any failure/miss returns
 *  undefined and the item stays honestly coordinate-less; the Part A resolve-on-write backfill
 *  retries server-side on the next item-list read. */
async function geocodeLocationText(
  locationName: string,
  destination?: string,
): Promise<{ latitude: string; longitude: string } | undefined> {
  try {
    const address = destination ? `${locationName}, ${destination}` : locationName;
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    if (res.ok) {
      const j = await res.json();
      if (Number.isFinite(j?.lat) && Number.isFinite(j?.lng)) {
        return { latitude: String(j.lat), longitude: String(j.lng) };
      }
    }
  } catch {
    // Geocode failure must never block the write — submit without coords, exactly as today.
  }
  return undefined;
}

/** The Add panel's "Custom" source — same fields, same POST /api/trips/:tripId/itinerary-items
 *  write as the old AddItemModal. Day-aware (P2-13): the add targets the day in focus.
 *  `estimatedCost` writes to `itinerary_items.estimated_cost`, a decimal(10,2) column —
 *  `insertItineraryItemSchema` (drizzle-zod) expects a STRING for decimal columns, so a raw
 *  `parseFloat` JS number 400s with "invalid_type expected string received number" (the same
 *  drift `server/routes.ts:1271,7793` already guard against via `String(...)`). */
function InlineAddItemForm({ tripId, dayNumber, destination, onAdded }: { tripId: string; dayNumber: number; destination?: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", itemType: "activity", startTime: "", estimatedCost: "", locationName: "" });
  const [geocoding, setGeocoding] = useState(false);
  // Item 17: coordinates from an ACTUAL Places pick (exact precision) — cleared whenever the
  // location text is edited by hand (typing after a pick means the text may no longer match the
  // picked place, so the stale coords must not silently ride along).
  const [placeCoords, setPlaceCoords] = useState<{ lat: string; lng: string } | null>(null);
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Item added", description: `Added to Day ${dayNumber}` });
      setForm({ title: "", itemType: "activity", startTime: "", estimatedCost: "", locationName: "" });
      setPlaceCoords(null);
    },
    onError: (err: any) => toast({ title: "Failed to add item", description: parseApiErrorMessage(err, "Please check the fields and try again."), variant: "destructive" }),
  });
  // FIX 4 (QA pass) + item 17: attach real coordinates, never fabricate. Preference order:
  // (1) an exact Places pick (placeCoords) — skip the geocode entirely, it's already exact;
  // (2) FALLBACK — the shared submit-time geocode (geocodeLocationText above), unchanged
  //     behavior (this is the "Places unavailable → behaves exactly as today" path,
  //     item 17's mandatory fallback). On any failure/miss: no coords, honest null — never a
  //     city-center guess. Geocoding is best-effort and must never block the add.
  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    let coords: { latitude: string; longitude: string } | undefined;
    const locationName = form.locationName.trim();
    if (placeCoords) {
      coords = { latitude: placeCoords.lat, longitude: placeCoords.lng };
    } else if (locationName) {
      setGeocoding(true);
      coords = await geocodeLocationText(locationName, destination);
      setGeocoding(false);
    }
    createMutation.mutate({
      ...form,
      dayNumber,
      estimatedCost: form.estimatedCost ? String(parseFloat(form.estimatedCost)) : undefined,
      ...(coords ?? {}),
    });
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: MID, display: "block", marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${LINE}`, fontSize: 13, outline: "none", boxSizing: "border-box" as any, background: CARD, color: INK };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>Title *</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senso-ji Temple visit" data-testid="input-inline-add-title" style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))} data-testid="select-inline-add-type" style={inputStyle}>
            <option value="activity">Activity</option>
            <option value="dining">Dining</option>
            <option value="hotel">Hotel</option>
            <option value="transport">Transport</option>
            <option value="culture">Culture</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Start Time</label>
          <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} data-testid="input-inline-add-time" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Location</label>
          <PlacesAutocompleteInput
            value={form.locationName}
            onChange={v => { setForm(f => ({ ...f, locationName: v })); setPlaceCoords(null); }}
            onPlaceSelected={place => {
              setForm(f => ({ ...f, locationName: place.text }));
              setPlaceCoords(place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null);
            }}
            placeholder="Venue name"
            testId="input-inline-add-location"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Est. Cost (USD)</label>
          <input type="number" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="0" data-testid="input-inline-add-cost" style={inputStyle} />
        </div>
      </div>
      <button onClick={handleSubmit} disabled={!form.title.trim() || createMutation.isPending || geocoding} data-testid="button-inline-add-confirm" style={{ ...btnPrimaryStyle, padding: "9px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: !form.title.trim() || createMutation.isPending || geocoding ? 0.6 : 1 }}>
        {(createMutation.isPending || geocoding) ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Plus style={{ width: 13, height: 13 }} />} Add to Day {dayNumber}
      </button>
    </div>
  );
}

/** W1-A: "Log completed booking" — a small inline form on each Partner-inventory (affiliate
 *  network) card, for an expert who booked something OFF-SITE through that network and wants
 *  it to show up on the client's plan. Writes through the SAME item-create rail as every other
 *  Add-panel source (POST /api/trips/:tripId/itinerary-items) — no new endpoint. The provider
 *  name is the one honest, non-affiliate fact this form carries about the network: it goes into
 *  `description` as a plain "Booked via <Network>" prefix (mirrors InlineAddItemForm/DmoPickerCore
 *  writing real-but-plain text into existing free-text columns, never a new field). `bookingStatus`
 *  is set to "confirmed" — this form exists specifically to log a booking that already happened.
 *  §16: the affiliate/booking URL is NEVER read here — this component only ever receives
 *  `providerName` (a plain string), never the partner's `websiteUrl`/affiliate link, so there is
 *  nothing to leak into the write even by accident. */
function LogBookingForm({
  tripId, dayNumber, providerName, destination, onAdded, onClose,
}: { tripId: string; dayNumber: number; providerName: string; destination?: string; onAdded: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", startTime: "", estimatedCost: "", locationName: "" });
  // Location resolution (workstation improvement, Aug 9 2026): same two-tier shape as
  // InlineAddItemForm — an exact Places pick carries its own coords (cleared on hand-edit, since
  // edited text may no longer match the picked place), else the shared submit-time geocode.
  const [placeCoords, setPlaceCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Booking logged", description: `Added to Day ${dayNumber}` });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed to log booking", description: parseApiErrorMessage(err, "Please check the fields and try again."), variant: "destructive" }),
  });
  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    let coords: { latitude: string; longitude: string } | undefined;
    const locationName = form.locationName.trim();
    if (placeCoords) {
      coords = { latitude: placeCoords.lat, longitude: placeCoords.lng };
    } else if (locationName) {
      setGeocoding(true);
      coords = await geocodeLocationText(locationName, destination);
      setGeocoding(false);
    }
    createMutation.mutate({
      title: form.title.trim(),
      itemType: "activity",
      dayNumber,
      startTime: form.startTime || undefined,
      estimatedCost: form.estimatedCost ? String(parseFloat(form.estimatedCost)) : undefined,
      locationName: locationName || undefined,
      description: `Booked via ${providerName}`,
      bookingStatus: "confirmed",
      ...(coords ?? {}),
    });
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: MID, display: "block", marginBottom: 3 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${LINE}`, fontSize: 12.5, outline: "none", boxSizing: "border-box" as any, background: CARD, color: INK };
  return (
    <div style={{ marginTop: 8, padding: "9px 10px", background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 7 }} data-testid={`form-log-booking-${providerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
      <div style={{ fontSize: 11, color: MID }}>Booked via <strong style={{ color: INK }}>{providerName}</strong> — Day {dayNumber}</div>
      <div>
        <label style={labelStyle}>Title *</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Fushimi Inari night tour" data-testid="input-log-booking-title" style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        <div>
          <label style={labelStyle}>Start time</label>
          <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} data-testid="input-log-booking-time" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Est. cost (USD)</label>
          <input type="number" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="0" data-testid="input-log-booking-cost" style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Location (optional)</label>
        <PlacesAutocompleteInput
          value={form.locationName}
          onChange={v => { setForm(f => ({ ...f, locationName: v })); setPlaceCoords(null); }}
          onPlaceSelected={place => {
            setForm(f => ({ ...f, locationName: place.text }));
            setPlaceCoords(place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null);
          }}
          placeholder="Meeting point"
          testId="input-log-booking-location"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onClose} data-testid="button-log-booking-cancel" style={{ ...btnQuietStyle, flex: 1, padding: "6px", fontSize: 12 }}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!form.title.trim() || createMutation.isPending || geocoding}
          data-testid="button-log-booking-confirm"
          style={{ ...btnPrimaryStyle, flex: 2, padding: "6px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: !form.title.trim() || createMutation.isPending || geocoding ? 0.6 : 1 }}
        >
          {(createMutation.isPending || geocoding) ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <CheckCircle style={{ width: 12, height: 12 }} />} Log booking
        </button>
      </div>
    </div>
  );
}

/** D-1 (Workstation audit): local section-scoped error boundary for the Platform-services
 *  browse map ONLY. Google Maps can throw (billing/key errors — BillingNotEnabledMapError
 *  and friends) at mount; without a boundary that unwinds the whole workspace. This class
 *  wraps just the map block so the results LIST beneath it (which fetches independently)
 *  keeps working, with a one-line honest notice in place of the map. */
class MapSectionErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Workstation] Browse map failed to render:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: "100%", background: GROUND, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
          <MapPin style={{ width: 24, height: 24, color: FAINT }} />
          <span style={{ fontSize: 12, color: MID }}>Map unavailable — showing list results</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// hint: Logic changed on both sides. Requires understanding intent of each change.
/** A-2 / C-1 (Workstation audit): the canvas item editor. Collapsible, day-grouped list of
 *  every item on the build with a "Move to day" select (A-2) and an "Expert note" textarea
 *  (C-1b — the traveler-visible tip, distinct from the private Build notes sidebar). Both
 *  write through the existing PATCH /api/trips/:tripId/itinerary-items/:itemId endpoint
 *  (trips.routes.ts) — no new server surface for A-2; C-1's server change is the read-side
 *  column preference in plancard.routes.ts.
 *
 *  QA_PUNCH_LIST item 18: also the within-day reorder UI (up/down arrows per item calling the
 *  existing POST .../itinerary/reorder with the day's full ordered id list — properly
 *  authorizeTripLogistics- AND now plan-approval-mode-flip-gated server-side, see routes.ts) and
 *  a per-day "Suggest best order" action (POST .../itinerary/optimize-order) that stages the
 *  machine's proposed order for an explicit "Apply this order?" confirm — never auto-applied
 *  (D1a posture: the machine proposes, the expert confirms). This panel is also item 16's
 *  "Go to item" scroll target (see focusItemId/onFocusHandled below) — the only per-item,
 *  DOM-addressable list the canvas renders (the day list itself is the shared PlanCard, a
 *  read-mostly component this lane deliberately does not modify). */
function ItemsEditorPanel({
  tripId, days, maxDay, destination, onDayMoved, onOpenBookingBrief, confirmedProviders,
  onConfirmedProvider, resolveBookingUrl, focusItemId, onFocusHandled, onSelectItem,
  suggestOrderForDay, onSuggestHandled,
}: {
  tripId: string;
  days: { dayNumber: number; items: ItineraryItem[] }[];
  maxDay: number;
  /** Geocode disambiguation suffix for the location editor below — same role it plays in
   *  InlineAddItemForm ("<location>, <destination>"), never the sole address (§13). */
  destination?: string;
  onDayMoved: () => void;
  // W3-A: opens the shared BookingBriefModal for a partner-sourced item. The item's mere
  // presence here is the gate itself — on an assignment trip a partner item ONLY reaches
  // itinerary_items via an approved suggestion (partner-catalog-picker.tsx never creates the
  // item directly there), so any row this panel can show is already either author-owned or
  // client-approved. Nothing here needs to re-check approval state.
  onOpenBookingBrief: (network: string) => void;
  /** Providers the expert has already confirmed (clicked "Continue to …") this session.
   *  Used to show an "already confirmed" badge on the per-item Book button. */
  confirmedProviders?: Set<string>;
  /** Called after the expert clicks "Continue" in the per-item BookingBriefModal.
   *  Must update the confirmedProviders set in the parent so the badge reflects the change. */
  onConfirmedProvider?: (provider: string) => void;
  /** Resolves a partner-network name to its affiliate booking URL so the per-item modal can
   *  open the vendor site for partner-sourced items (same source as the partner-card path). */
  resolveBookingUrl?: (network: string) => string | undefined;
  // Item 16's "Go to item": when set, this panel opens (if closed), expands that item's row,
  // and scrolls it into view, then reports back via onFocusHandled so the caller clears the
  // request (a one-shot signal, not a controlled/sticky prop).
  focusItemId?: string | null;
  onFocusHandled?: () => void;
  // WORKSTATION_LOCATION_MAP_SPEC Part B — "vice versa": a located row's pin-icon button reports
  // itself here so the plan map can pan to and select the matching pin. Undefined for a row with
  // no coordinates (nothing to show — never a guessed pin, §13).
  onSelectItem?: (itemId: string) => void;
  // Advisor Phase 2-4: a THIRD one-shot signal, same shape/contract as focusItemId above — when
  // set, this panel opens (if closed) and fires its OWN optimizeMutation for that day (the
  // existing staged "Suggested order" apply/discard UI below takes over from there — never a
  // second, duplicated write/algorithm), then reports back via onSuggestHandled so the caller
  // clears the request.
  suggestOrderForDay?: number | null;
  onSuggestHandled?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // Location editor (workstation improvement, Aug 9 2026): per-item drafts mirroring noteDrafts,
  // plus the exact-Places-pick coords (cleared on hand-edit — edited text may no longer match the
  // picked place) and which row is mid-geocode. This is the fix-up path for the plan map's
  // "not on map" tray: before this, an unlocated item had NO surface in the Workstation where a
  // location could be added at all.
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const [locationPickCoords, setLocationPickCoords] = useState<Record<string, { lat: string; lng: string } | null>>({});
  const [geocodingItemId, setGeocodingItemId] = useState<string | null>(null);
  // dayNumber → machine-suggested id order, staged from optimize-order and applied only on
  // explicit confirm (never auto-applied).
  const [suggestedOrder, setSuggestedOrder] = useState<Record<number, string[]>>({});
  // Per-item Booking Brief: hoveredItemId drives hover highlighting on the "Book" button
  // (always rendered for keyboard/touch accessibility); bookingBriefItem stores whichever item
  // has the modal open, plus the resolved partner booking URL.
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [bookingBriefItem, setBookingBriefItem] = useState<{ item: ItineraryItem; bookingUrl?: string } | null>(null);

  useEffect(() => {
    if (!focusItemId) return;
    setOpen(true);
    setExpandedId(focusItemId);
    // Wait one paint for the (possibly just-opened) panel to render the row before scrolling.
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-testid="item-editor-row-${focusItemId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusHandled?.();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId]);

  const reorderMutation = useMutation({
    mutationFn: async ({ dayNumber, itemIds }: { dayNumber: number; itemIds: string[] }) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary/reorder`, { dayNumber, itemIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    // Same mode-flip 409 as the other item mutations above — surfaced honestly, not generically.
    onError: (err: any) => toast({ title: "Failed to reorder", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  const moveWithinDay = (day: { dayNumber: number; items: ItineraryItem[] }, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= day.items.length) return;
    const itemIds = day.items.map(i => i.id);
    [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];
    reorderMutation.mutate({ dayNumber: day.dayNumber, itemIds });
  };

  const optimizeMutation = useMutation({
    mutationFn: async (dayNumber: number) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary/optimize-order`, { dayNumber });
      const json = await res.json();
      return { dayNumber, optimizedOrder: (json.optimizedOrder ?? []) as string[] };
    },
    onSuccess: ({ dayNumber, optimizedOrder }) => {
      setSuggestedOrder(s => ({ ...s, [dayNumber]: optimizedOrder }));
    },
    onError: (err: any) => toast({ title: "Couldn't suggest an order", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  // Advisor Phase 2-4's one-shot: open the panel and fire the SAME optimizeMutation the per-day
  // "Suggest best order" button uses — the staged suggestion (with its existing Apply/Discard UI
  // below) is what actually appears; this effect only triggers the existing flow, it never
  // computes or applies an order itself.
  useEffect(() => {
    if (suggestOrderForDay == null) return;
    setOpen(true);
    optimizeMutation.mutate(suggestOrderForDay);
    onSuggestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestOrderForDay]);

  const applySuggestedOrder = (dayNumber: number) => {
    const itemIds = suggestedOrder[dayNumber];
    if (!itemIds) return;
    reorderMutation.mutate({ dayNumber, itemIds }, {
      onSuccess: () => setSuggestedOrder(s => { const next = { ...s }; delete next[dayNumber]; return next; }),
    });
  };
  const discardSuggestedOrder = (dayNumber: number) => setSuggestedOrder(s => { const next = { ...s }; delete next[dayNumber]; return next; });

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/itinerary-items/${itemId}`, data);
      return res.json();
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      if ("dayNumber" in vars.data) {
        onDayMoved();
        toast({ title: "Item moved" });
      } else if ("locationName" in vars.data) {
        // Honest wording (§13): only claim a pin when coordinates were actually attached.
        toast({
          title: "Location saved",
          description: "latitude" in vars.data
            ? "Pinned on the plan map."
            : vars.data.locationName
              ? "No map pin yet — the location couldn't be geocoded right now."
              : undefined,
        });
      } else {
        toast({ title: "Expert note saved" });
      }
    },
    // Plan-approval mode flip (migration 164): once the client approves a delivered plan, this
    // PATCH 409s with an honest "send it as a suggestion instead" message — surface it verbatim
    // rather than the generic fallback (the existing parseApiErrorMessage pattern above).
    onError: (err: any) => toast({ title: "Failed to update item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  // FIX 2 (QA pass): item-level delete. Must use the TRIP-SCOPED endpoint — the bare
  // DELETE /api/itinerary-items/:id gates on trips.userId only (verifyTripOwnership), which 403s
  // on authored builds (userId=NULL); the trip-scoped route carries the parallel isTripAuthor
  // branch, the same reason move-item's PATCH above uses it. Mirrors the move-item mutation's
  // invalidation set (itinerary-items + plancard) and also triggers the same energy recalc a
  // day-move does via onDayMoved, since removing an item changes a day's load too.
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/trips/${tripId}/itinerary-items/${itemId}`);
    },
    onSuccess: (_res, itemId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onDayMoved();
      if (expandedId === itemId) setExpandedId(null);
      toast({ title: "Item removed" });
    },
    // See the update mutation's onError above — same mode-flip 409, same honest surfacing.
    onError: (err: any) => toast({ title: "Failed to remove item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  // Same two-tier resolution as InlineAddItemForm: an exact Places pick wins; otherwise the
  // shared submit-time geocode. Coords are PATCHed only when NEW ones were actually resolved —
  // clearing the text never wipes existing coordinates, which may be real facts from the item's
  // source (a DMO row's own lat/lng) rather than derived from this label (§13: don't destroy
  // real data on a label edit; the pin outliving a cleared label is the honest state).
  const saveLocation = async (item: ItineraryItem) => {
    const text = (locationDrafts[item.id] ?? item.locationName ?? "").trim();
    const picked = locationPickCoords[item.id];
    let coords: { latitude: string; longitude: string } | undefined;
    if (picked) {
      coords = { latitude: picked.lat, longitude: picked.lng };
    } else if (text) {
      setGeocodingItemId(item.id);
      coords = await geocodeLocationText(text, destination);
      setGeocodingItemId(null);
    }
    updateMutation.mutate(
      { itemId: item.id, data: { locationName: text || null, ...(coords ?? {}) } },
      { onSuccess: () => setLocationPickCoords(c => ({ ...c, [item.id]: null })) },
    );
  };

  const allItems = days.flatMap(d => d.items);
  if (allItems.length === 0) return null;

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: MID, display: "block", marginBottom: 3 };
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${LINE}`, fontSize: 12.5, outline: "none", boxSizing: "border-box" as any, background: CARD, color: INK };

  return (
    <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${LINE}`, marginTop: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-item-editor"
        style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
      >
        <Pencil style={{ width: 12, height: 12, color: MID }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Edit items</span>
        <span style={{ fontSize: 11, color: FAINT }}>({allItems.length})</span>
        <span style={{ marginLeft: "auto", color: FAINT, display: "flex" }}>
          {open ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {days.filter(d => d.items.length > 0).map(day => {
            const suggestion = suggestedOrder[day.dayNumber];
            return (
              <div key={day.dayNumber} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.05em" }}>Day {day.dayNumber}</span>
                  <button
                    onClick={() => optimizeMutation.mutate(day.dayNumber)}
                    disabled={day.items.length < 2 || (optimizeMutation.isPending && optimizeMutation.variables === day.dayNumber)}
                    data-testid={`button-suggest-order-day-${day.dayNumber}`}
                    title="Compute a suggested order for this day — nothing changes until you apply it"
                    style={{ ...btnQuietStyle, marginLeft: "auto", padding: "2px 8px", fontSize: 10.5, display: "flex", alignItems: "center", gap: 4, opacity: day.items.length < 2 ? 0.5 : 1 }}
                  >
                    {(optimizeMutation.isPending && optimizeMutation.variables === day.dayNumber)
                      ? <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />
                      : <Sparkles style={{ width: 10, height: 10 }} />}
                    Suggest best order
                  </button>
                </div>

                {suggestion && (
                  <div data-testid={`panel-suggested-order-day-${day.dayNumber}`} style={{ background: BRAND_SOFT, border: `1px dashed ${BRAND}`, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: INK }}>Suggested order for Day {day.dayNumber}</div>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: MID, display: "flex", flexDirection: "column", gap: 2 }}>
                      {suggestion.map(id => (
                        <li key={id}>{day.items.find(i => i.id === id)?.title ?? id}</li>
                      ))}
                    </ol>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => discardSuggestedOrder(day.dayNumber)} data-testid={`button-discard-order-day-${day.dayNumber}`} style={{ ...btnQuietStyle, flex: 1, padding: "5px", fontSize: 11 }}>Discard</button>
                      <button
                        onClick={() => applySuggestedOrder(day.dayNumber)}
                        disabled={reorderMutation.isPending}
                        data-testid={`button-apply-order-day-${day.dayNumber}`}
                        style={{ ...btnPrimaryStyle, flex: 2, padding: "5px", fontSize: 11, opacity: reorderMutation.isPending ? 0.6 : 1 }}
                      >
                        Apply this order?
                      </button>
                    </div>
                  </div>
                )}

                {day.items.map((item, index) => {
                  const isExpanded = expandedId === item.id;
                  const draftNote = noteDrafts[item.id] ?? (item.expertNote ?? "");
                  // W3-A: an item carrying the "Partner: <Network>" marker (written by
                  // partner-catalog-picker.tsx) gets a Booking Brief entry point. Its presence in
                  // `days` at all IS the gate — see the prop comment above.
                  const partnerSource = parsePartnerSource(item.description);
                  const alreadyConfirmed = partnerSource
                    ? (confirmedProviders?.has(normalizeProvider(partnerSource.network)) ?? false)
                    : false;
                  return (
                    <div
                      key={item.id}
                      data-testid={`item-editor-row-${item.id}`}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(id => id === item.id ? null : id)}
                      style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Item 18: within-day reorder — swaps this item with its neighbor and
                            sends the day's full ordered id list to the existing reorder endpoint.
                            Disabled at the day's edges. */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <button
                            onClick={() => moveWithinDay(day, index, -1)}
                            disabled={index === 0 || reorderMutation.isPending}
                            data-testid={`button-move-up-${item.id}`}
                            title="Move earlier"
                            style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", padding: 1, color: index === 0 ? FAINT : MID, opacity: index === 0 ? 0.4 : 1, display: "flex" }}
                          >
                            <ChevronUp style={{ width: 12, height: 12 }} />
                          </button>
                          <button
                            onClick={() => moveWithinDay(day, index, 1)}
                            disabled={index === day.items.length - 1 || reorderMutation.isPending}
                            data-testid={`button-move-down-${item.id}`}
                            title="Move later"
                            style={{ background: "none", border: "none", cursor: index === day.items.length - 1 ? "default" : "pointer", padding: 1, color: index === day.items.length - 1 ? FAINT : MID, opacity: index === day.items.length - 1 ? 0.4 : 1, display: "flex" }}
                          >
                            <ChevronDown style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                        {partnerSource && <StateChip tone="brand">{partnerSource.network}</StateChip>}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                        {/* WORKSTATION_LOCATION_MAP_SPEC Part B "vice versa": only rendered for a
                            row that actually has real coordinates — an unlocated item has no pin
                            to show, and this button never pretends otherwise (§13). */}
                        {onSelectItem && isLocatedItem(item) && (
                          <button
                            onClick={() => onSelectItem(item.id)}
                            data-testid={`button-show-on-map-${item.id}`}
                            title="Show on map"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: MID, display: "flex" }}
                          >
                            <MapPin style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                        {/* Per-item Booking Brief: always visible (keyboard/touch accessible);
                            hover lifts opacity to full. Shows "✓ on file" when this provider
                            has already been confirmed this session (task #128). */}
                        <button
                          onClick={() => {
                            const ps = parsePartnerSource(item.description);
                            const bookingUrl = ps ? resolveBookingUrl?.(ps.network) : undefined;
                            setBookingBriefItem({ item, bookingUrl });
                          }}
                          data-testid={`button-book-item-${item.id}`}
                          title="Pull client details to book this item"
                          style={{
                            ...btnQuietStyle,
                            padding: "3px 9px",
                            fontSize: 11,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            opacity: hoveredItemId === item.id ? 1 : 0.45,
                            transition: "opacity 0.15s",
                          }}
                        >
                          <ShieldCheck style={{ width: 11, height: 11 }} /> Book
                          {alreadyConfirmed && <StateChip tone="ok">✓ on file</StateChip>}
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          data-testid={`button-expand-item-${item.id}`}
                          style={{ ...btnQuietStyle, padding: "3px 9px", fontSize: 11 }}
                        >
                          {isExpanded ? "Close" : "Edit"}
                        </button>
                      </div>
                      {isExpanded && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <label style={labelStyle}>Move to day</label>
                      <select
                        value={item.dayNumber}
                        onChange={e => updateMutation.mutate({ itemId: item.id, data: { dayNumber: parseInt(e.target.value, 10) } })}
                        disabled={updateMutation.isPending}
                        data-testid={`select-move-day-${item.id}`}
                        style={fieldStyle}
                      >
                        {Array.from({ length: maxDay }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>Day {n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Location{" "}
                        <span style={{ fontWeight: 400, color: FAINT }}>
                          {isLocatedItem(item) ? "(pinned on the plan map)" : "(no map pin yet)"}
                        </span>
                      </label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <PlacesAutocompleteInput
                            value={locationDrafts[item.id] ?? (item.locationName ?? "")}
                            onChange={v => {
                              setLocationDrafts(d => ({ ...d, [item.id]: v }));
                              setLocationPickCoords(c => ({ ...c, [item.id]: null }));
                            }}
                            onPlaceSelected={place => {
                              setLocationDrafts(d => ({ ...d, [item.id]: place.text }));
                              setLocationPickCoords(c => ({
                                ...c,
                                [item.id]: place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null,
                              }));
                            }}
                            placeholder="Venue or address…"
                            testId={`input-item-location-${item.id}`}
                            style={fieldStyle}
                          />
                        </div>
                        <button
                          onClick={() => void saveLocation(item)}
                          disabled={updateMutation.isPending || geocodingItemId === item.id}
                          data-testid={`button-save-location-${item.id}`}
                          style={{ ...btnPrimaryStyle, padding: "5px 12px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5, opacity: updateMutation.isPending || geocodingItemId === item.id ? 0.6 : 1 }}
                        >
                          {geocodingItemId === item.id ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : null}
                          Save location
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Expert note <span style={{ fontWeight: 400, color: FAINT }}>(traveler-visible tip)</span></label>
                      <textarea
                        value={draftNote}
                        onChange={e => setNoteDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                        placeholder="A tip your traveler will see on this item…"
                        data-testid={`textarea-expert-note-${item.id}`}
                        style={{ ...fieldStyle, minHeight: 56, resize: "vertical", fontFamily: "inherit" }}
                      />
                      <button
                        onClick={() => updateMutation.mutate({ itemId: item.id, data: { expertNote: draftNote.trim() || null } })}
                        disabled={updateMutation.isPending}
                        data-testid={`button-save-expert-note-${item.id}`}
                        style={{ ...btnPrimaryStyle, marginTop: 6, padding: "5px 12px", fontSize: 11.5 }}
                      >
                        Save note
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        if (!window.confirm(`Remove "${item.title}" from this build?`)) return;
                        deleteMutation.mutate(item.id);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-item-${item.id}`}
                      style={{ ...btnQuietStyle, alignSelf: "flex-start", padding: "5px 12px", fontSize: 11.5, color: DANGER, display: "flex", alignItems: "center", gap: 5, opacity: deleteMutation.isPending ? 0.6 : 1 }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} /> Remove item
                    </button>

                    {/* QA_PUNCH_LIST W3-C item 12 — the expert-side half of the per-item thread.
                        Shared component with the Trip Card's ActivitiesSection; plain shadcn
                        tokens read fine inside this console-scoped panel (same posture as the
                        other shared Add-panel pickers on this page). */}
                    <ItemComments tripId={tripId} itemId={item.id} />
                  </div>
                )}
              </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {/* Per-item Booking Brief modal — opened from any item's "Book" button.
          Provides client PII for vendor bookings; on confirm (with checkbox) PATCHes
          bookingStatus → "pending" so the center panel reflects the change. */}
      {bookingBriefItem && (
        <BookingBriefModal
          tripId={tripId}
          provider={parsePartnerSource(bookingBriefItem.item.description)?.network ?? bookingBriefItem.item.locationName ?? bookingBriefItem.item.title}
          bookingUrl={bookingBriefItem.bookingUrl}
          itemId={bookingBriefItem.item.id}
          itemTitle={bookingBriefItem.item.title}
          onClose={() => setBookingBriefItem(null)}
          onConfirm={() => setBookingBriefItem(null)}
          onConfirmed={(provider) => {
            onConfirmedProvider?.(provider);
            setBookingBriefItem(null);
          }}
        />
      )}
    </div>
  );
}
// ── L4b: the between-stops transport-leg editor (docs/briefs/L4-transport-legs.md) ──────────────
// Server contracts (L4a, migration 154 — final, do not adjust to fit the client):
//   POST   /api/trips/:tripId/transport-legs/generate           → born 'proposed', replaces the
//          trip's OWN proposed rows, never touches confirmed ones; response carries created/
//          keptConfirmed/replacedProposed/skipped[] (reason: 'missing_coordinates' only).
//   GET    /api/trips/:tripId/transport-legs?includeProposed=1  → { legs, variantId }; legs mixes
//          this trip's rows (proposalStatus set) with any legacy variant rows (proposalStatus
//          NULL) — filtered out below, they are a separate mechanism.
//   PATCH  /api/trips/:tripId/transport-legs/:legId             → allow-list ONLY: userSelectedMode,
//          pickupPoint, pickupTime, proposalStatus ('proposed'|'confirmed'). Never a body spread.
//   DELETE /api/trips/:tripId/transport-legs/:legId

/** Mirrors the server's own pair identity (`pairKey` in trip-transport-legs.service.ts) so a leg
 *  from the fetched list is matched to the exact same-day gap it was computed for. */
function legPairKey(dayNumber: number, fromId: string | null | undefined, toId: string | null | undefined): string {
  return `${dayNumber}|${fromId ?? ""}|${toId ?? ""}`;
}

/** Mirrors the server's own `realCoord` guard (trip-transport-legs.service.ts): rejects null/NaN,
 *  out-of-range, and the (0,0) "Null Island" sentinel. Deciding "located" client-side with the
 *  SAME rule the engine uses is what makes the "add a location to route this leg" state honest —
 *  it is never a guess, and it never depends on a stale generate response to be accurate. */
function isLocatedItem(item: { latitude?: unknown; longitude?: unknown }): boolean {
  const lat = item.latitude == null ? NaN : typeof item.latitude === "number" ? item.latitude : parseFloat(String(item.latitude));
  const lng = item.longitude == null ? NaN : typeof item.longitude === "number" ? item.longitude : parseFloat(String(item.longitude));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Item 16 (QA_PUNCH_LIST): "fit the map to these pins" — mirrors the Trip Card's own
 *  MapControlCenter bounds-fit (`client/src/components/plancard/MapControlCenter.tsx`), a
 *  proven pattern: `useMap()` + `google.maps.LatLngBounds` + `map.fitBounds`. Needs a `<Map>`
 *  ancestor to call `useMap()`, so it renders nothing and lives INSIDE the `<Map>` below. */
function PlanMapFitBounds({ items }: { items: ItineraryItem[] }) {
  const map = useMap();
  // Stable dependency: only re-fit when the actual set of pinned coordinates changes, not on
  // every parent re-render (a fresh `items` array reference on every render is expected here).
  const fitKey = items.map(i => `${i.id}:${i.latitude}:${i.longitude}`).join("|");
  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps || items.length === 0) return;
    if (items.length === 1) {
      map.setCenter({ lat: parseFloat(String(items[0].latitude)), lng: parseFloat(String(items[0].longitude)) });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    items.forEach(i => bounds.extend({ lat: parseFloat(String(i.latitude)), lng: parseFloat(String(i.longitude)) }));
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

/** WORKSTATION_LOCATION_MAP_SPEC Part B — "vice versa" of PlanMapFitBounds above: a list-row
 *  selection (the row's "Show on map" pin button) pans the plan map to that one pin and reports
 *  the match back so the caller can select it (opens the InfoWindow). Looks up against the FULL
 *  located set, not the day-filtered `visibleItems` — CanvasMapSection widens the day filter in
 *  its own effect when needed, so this never silently misses an item sitting outside today's
 *  filter. Needs a `<Map>` ancestor for `useMap()`, so it renders nothing and lives INSIDE the
 *  `<Map>` below, beside PlanMapFitBounds. */
function PlanMapFocusFromList({
  focusId, items, onFocus,
}: {
  focusId: string | null;
  items: ItineraryItem[];
  onFocus: (item: ItineraryItem) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusId || !map) return;
    const item = items.find(i => i.id === focusId);
    if (!item) return;
    map.setCenter({ lat: parseFloat(String(item.latitude)), lng: parseFloat(String(item.longitude)) });
    map.setZoom(15);
    onFocus(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusId]);
  return null;
}

/** W5-A (QA_PUNCH_LIST item 19) — thin mount/unmount publisher for the Platform-services drawer,
 *  which (unlike the other five Add-panel sources) is inline JSX in this file rather than its own
 *  component. Rendered ONLY inside the `addSource === "platform"` block, so its mount lifetime is
 *  the same "is this drawer open" signal `usePublishMapCandidates` relies on everywhere else. */
function MapCandidatesPublisher({
  source, sourceLabel, items, onAdd,
}: {
  source: string;
  sourceLabel: string;
  items: MapCandidate[];
  onAdd: (id: string) => void;
}) {
  usePublishMapCandidates(source, sourceLabel, items, onAdd);
  return null;
}

/** GOOGLE-PLACES-SOURCE-PILL: case-insensitive, either-direction substring match — mirrors the
 *  Research Reader's best-effort place-highlight matching (dmo-picker-modal.tsx). Used ONLY to
 *  offer a "Also on Traveloure" cross-link chip; never gates anything, so a false positive/negative
 *  here is cosmetic, not a correctness issue. */
function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/** GOOGLE-PLACES-SOURCE-PILL split "+ Day N ▾" add button for a Google Places result — mirrors
 *  dmo-picker-modal.tsx's AddPlaceSplitButton (shadcn DropdownMenu there), reimplemented with a
 *  plain absolutely-positioned menu since this file doesn't use shadcn dropdowns elsewhere. Left
 *  side adds straight to `focusDay`; the caret opens Day 1..maxDay plus "+ New day" (maxDay+1). */
function GooglePlaceSplitButton({
  placeKey, focusDay, maxDay, pending, onPick,
}: {
  placeKey: string;
  focusDay: number;
  maxDay: number;
  pending: boolean;
  onPick: (day: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${BRAND}` }}>
        <button
          onClick={() => onPick(focusDay)}
          disabled={pending}
          data-testid={`button-add-gplace-${placeKey}`}
          style={{ padding: "4px 8px", fontSize: 11, fontWeight: 800, cursor: pending ? "default" : "pointer", background: BRAND_SOFT, color: BRAND, border: "none", whiteSpace: "nowrap" }}
        >
          + Day {focusDay}
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={pending}
          data-testid={`menu-add-gplace-${placeKey}`}
          style={{ padding: "4px 6px", cursor: pending ? "default" : "pointer", background: BRAND_SOFT, color: BRAND, border: "none", borderLeft: `1px solid ${BRAND}`, display: "flex", alignItems: "center" }}
        >
          <ChevronDown style={{ width: 11, height: 11 }} />
        </button>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 3, zIndex: 40, background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.18)", minWidth: 100, overflow: "hidden" }}>
          {dayOptions.map(d => (
            <button
              key={d}
              onClick={() => { setOpen(false); onPick(d); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: INK }}
            >
              Day {d}
            </button>
          ))}
          <button
            onClick={() => { setOpen(false); onPick(maxDay + 1); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", fontSize: 12, background: "none", border: "none", borderTop: `1px solid ${LINE}`, cursor: "pointer", color: MID }}
          >
            + New day
          </button>
        </div>
      )}
    </div>
  );
}

/** QA_PUNCH_LIST item 16 (plan layer) + item 19 (discovery layer) — the plan map ON the build
 *  canvas.
 *
 *  PLAN layer (always on, unchanged from #374): pins for items already IN the plan, filtered by
 *  `mapDayFilter`. Never fabricates a pin (§13): only items passing `isLocatedItem` are ever
 *  rendered; the unlocated count below the map is real.
 *
 *  DISCOVERY layer (item 19, ratified): whenever an Add-panel source drawer is open, that
 *  drawer's CURRENT results render as candidate pins on this SAME map, in a visually distinct
 *  (hollow) style — read from the single active publisher via `useMapCandidates`. ONE filter
 *  state drives both the drawer's list and its pins (no separate map filter bar — see
 *  map-candidates.ts). Clicking a candidate opens a preview InfoWindow with an "Add to Day N"
 *  action that calls back into the SAME add handler the drawer's own list button uses — never a
 *  duplicated write path. Only items with real coords ever publish as candidates (§13); the
 *  drawer's list remains the complete view regardless of what the map can show.
 *
 *  Collapsible (closed→open persisted per-trip in sessionStorage, mirroring the "closed by
 *  default" convention ItemsEditorPanel/TransportLegsPanel already use for canvas sections).
 *  Reuses the file's existing @vis.gl/react-google-maps imports and the MapSectionErrorBoundary
 *  pattern verbatim (a Maps billing/key failure collapses to a one-line notice, never blanks the
 *  canvas — see that class's doc comment above). */
function CanvasMapSection({
  tripId, days, destination, onGoToItem, discoveryDayNumber, focusFromListId, onListFocusHandled,
}: {
  tripId: string;
  days: { dayNumber: number; items: ItineraryItem[] }[];
  destination: string;
  onGoToItem: (itemId: string) => void;
  /** The Add panel's current day-focus (item 19) — labels/targets the discovery layer's
   *  "Add to Day N" action. Purely a label/target for candidates; never affects plan pins. */
  discoveryDayNumber: number;
  /** WORKSTATION_LOCATION_MAP_SPEC Part B "vice versa": a one-shot signal from a list row's
   *  "Show on map" button. Handled below by opening the map (if closed), widening the day filter
   *  so the target pin is guaranteed to be in `visibleItems`, then reported back via
   *  onListFocusHandled once consumed. */
  focusFromListId?: string | null;
  onListFocusHandled?: () => void;
}) {
  const storageKey = `workstation-map-open-${tripId}`;
  const [open, setOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* sessionStorage unavailable — the toggle just won't persist */ }
  }, [open, storageKey]);

  // Map-local day filter — mirrors the Add panel's day-focus control (all-days default,
  // focusing a day filters the pins to it). Deliberately its OWN state, not the Add panel's
  // `focusDay`: that control picks WHERE a new item is added; this picks WHICH pins show.
  const [mapDayFilter, setMapDayFilter] = useState<number | "all">("all");
  // Runtime key rejection (gm_authFailure) — flips the render below to the Leaflet fallback.
  const mapsAuthFailed = useGoogleMapsAuthFailed();
  const googleMapActive = !!MAPS_KEY && !mapsAuthFailed;
  const [selectedPinItem, setSelectedPinItem] = useState<ItineraryItem | null>(null);
  // Item 19 — the discovery layer's own selection, kept separate from the plan layer's so
  // opening one InfoWindow never closes/overrides the other's state by accident.
  const [selectedCandidate, setSelectedCandidate] = useState<MapCandidate | null>(null);
  const { source: candidateSource, sourceLabel: candidateSourceLabel, items: candidateItems, onAdd: onAddCandidate } = useMapCandidates();
  // Drawer switched (or its filter narrowed the set to nothing) — drop any stale selection
  // rather than leave an InfoWindow open referencing a candidate that's no longer published.
  useEffect(() => {
    setSelectedCandidate(null);
  }, [candidateSource, candidateSourceLabel]);

  const allItems = days.flatMap(d => d.items);
  const locatedItems = allItems.filter(isLocatedItem);
  // §13: the honest "not on map" tray (Part B) — the actual rows, not just a count, so an expert
  // can see WHICH items still need a location rather than guessing from a number.
  const unlocatedItems = allItems.filter(i => !isLocatedItem(i));
  const visibleItems = mapDayFilter === "all" ? locatedItems : locatedItems.filter(i => i.dayNumber === mapDayFilter);
  const dayNumbersWithItems = Array.from(new Set(days.filter(d => d.items.length > 0).map(d => d.dayNumber))).sort((a, b) => a - b);
  // Resolved once against the FULL located set (never the day-filtered `visibleItems`) so a
  // cross-day focus request is never missed by a stale filter — see LeafletPlanMap's FocusFromList
  // doc comment for why this matters there specifically.
  const focusFromListItem = focusFromListId ? (locatedItems.find(i => i.id === focusFromListId) ?? null) : null;

  // WORKSTATION_LOCATION_MAP_SPEC Part B "vice versa": open the map and widen the day filter (if
  // narrower than the target's own day) so the requested pin is guaranteed to render — the actual
  // pan happens in PlanMapFocusFromList/LeafletPlanMap below, which need a map instance.
  useEffect(() => {
    if (!focusFromListId) return;
    if (!focusFromListItem) { onListFocusHandled?.(); return; }
    setOpen(true);
    setMapDayFilter(f => (f === "all" || f === focusFromListItem.dayNumber ? f : "all"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFromListId]);

  // The Leaflet branch has no `<Map>`-descendant to report the InfoWindow-equivalent selection
  // back up (its FocusFromList only pans — it has no reason to also own selection state), so that
  // half of "vice versa" is handled here instead, gated to when Leaflet is actually the active
  // renderer. The Google branch's own PlanMapFocusFromList/onFocus callback covers that branch.
  useEffect(() => {
    if (googleMapActive || !focusFromListItem) return;
    setSelectedPinItem(focusFromListItem);
    onListFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFromListItem?.id]);

  // Center fallback ONLY needed when the plan has zero located items anywhere (not just the
  // current filter) — same destination-geocode rail the Add panel's Platform-services browse
  // map already fetches (`["/api/geocode", destination]`); broadening its `enabled` here reuses
  // that query/cache rather than adding a parallel fetch.
  const { data: fallbackCenter } = useQuery<{ lat: number; lng: number } | null>({
    queryKey: ["/api/geocode", destination],
    queryFn: async () => {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(destination)}`);
      if (!res.ok) return null;
      const j = await res.json();
      return Number.isFinite(j?.lat) && Number.isFinite(j?.lng) ? j : null;
    },
    enabled: open && !!destination && locatedItems.length === 0,
    staleTime: Infinity,
  });

  // ── Advisor Phase 1 — route layer (persisted per-trip like the map-open toggle above). ──
  const routesStorageKey = `workstation-map-routes-${tripId}`;
  const [routesOn, setRoutesOn] = useState<boolean>(() => {
    try { return sessionStorage.getItem(routesStorageKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(routesStorageKey, routesOn ? "1" : "0"); } catch { /* best-effort */ }
  }, [routesOn, routesStorageKey]);

  // Same query key TransportLegsPanel uses (`includeProposed: 1`) — a shared react-query cache
  // entry, not a second fetch; enabled only while the map is open, matching this section's own
  // "only pay for it while visible" convention (mirrors the fallback-geocode query above).
  const { data: routeLegsData } = useQuery<TripTransportLegsResponse>({
    queryKey: [`/api/trips/${tripId}/transport-legs`, { includeProposed: 1 }],
    enabled: !!tripId && open,
  });
  // Trip-scoped legs only (proposalStatus NULL = legacy variant-scoped legs — see
  // TransportLegsPanel's identical filter/comment below).
  const routeTripLegs = (routeLegsData?.legs ?? []).filter(
    (l) => l.proposalStatus === "proposed" || l.proposalStatus === "confirmed",
  );
  const hasRouteLegsData = routeTripLegs.length > 0;
  const routeDistanceMetersByDay: Record<number, number> = {};
  for (const leg of routeTripLegs) {
    routeDistanceMetersByDay[leg.dayNumber] = (routeDistanceMetersByDay[leg.dayNumber] ?? 0) + (leg.distanceMeters || 0);
  }
  // Respect mapDayFilter — only visible days ever get a line or a chip.
  const routeVisibleDayNumbers = mapDayFilter === "all" ? dayNumbersWithItems : [mapDayFilter];
  // §13: never estimate a distance client-side — a line is drawn from the items' OWN real
  // coordinates (order-visualization only), a chip is drawn ONLY from the engine's own leg sums.
  const routeDayColor = (dayNumber: number): string =>
    [BRAND, "var(--console-info)", OK, WARN][(dayNumber - 1) % 4];
  const routeLines: { day: number; color: string; points: { lat: number; lng: number }[] }[] = routesOn
    ? days
        .filter((d) => routeVisibleDayNumbers.includes(d.dayNumber))
        .map((d) => ({
          day: d.dayNumber,
          color: routeDayColor(d.dayNumber),
          points: d.items
            .filter(isLocatedItem)
            .map((i) => ({ lat: parseFloat(String(i.latitude)), lng: parseFloat(String(i.longitude)) })),
        }))
        .filter((r) => r.points.length >= 2)
    : [];
  const routeDistanceChipDays = routesOn && hasRouteLegsData
    ? routeVisibleDayNumbers.filter((d) => routeDistanceMetersByDay[d] != null).sort((a, b) => a - b)
    : [];

  if (allItems.length === 0) return null;

  // Three-tier center rule (item 16 spec): located pins → bounds-fit; none but a destination
  // geocode exists → center there; neither → no map box at all, honest notice only.
  const hasAnyLocated = locatedItems.length > 0;
  const canShowMap = hasAnyLocated || !!fallbackCenter;
  const initialCenter = visibleItems[0]
    ? { lat: parseFloat(String(visibleItems[0].latitude)), lng: parseFloat(String(visibleItems[0].longitude)) }
    : (fallbackCenter ?? { lat: 35.0116, lng: 135.7681 }); // Kyoto — only reached when canShowMap is already false and this value is never rendered

  return (
    <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${LINE}`, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-plan-map"
        style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
      >
        <MapPinned style={{ width: 12, height: 12, color: MID }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Plan map</span>
        <span style={{ fontSize: 11, color: FAINT }}>({locatedItems.length} located)</span>
        <span style={{ marginLeft: "auto", color: FAINT, display: "flex" }}>
          {open ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          {(dayNumbersWithItems.length > 1 || locatedItems.length > 0) && (
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8, alignItems: "center" }}>
              {dayNumbersWithItems.length > 1 && (
                <>
                  <button
                    onClick={() => setMapDayFilter("all")}
                    data-testid="button-map-day-filter-all"
                    style={{ padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: mapDayFilter === "all" ? `1.5px solid ${BRAND}` : `1.5px solid ${LINE}`, background: mapDayFilter === "all" ? BRAND_SOFT : CARD, color: mapDayFilter === "all" ? BRAND : MID }}
                  >
                    All days
                  </button>
                  {dayNumbersWithItems.map(n => (
                    <button
                      key={n}
                      onClick={() => setMapDayFilter(n)}
                      data-testid={`button-map-day-filter-${n}`}
                      style={{ padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: mapDayFilter === n ? `1.5px solid ${BRAND}` : `1.5px solid ${LINE}`, background: mapDayFilter === n ? BRAND_SOFT : CARD, color: mapDayFilter === n ? BRAND : MID }}
                    >
                      Day {n}
                    </button>
                  ))}
                </>
              )}
              {/* Advisor Phase 1 — route layer toggle. Draws per-day polylines connecting that
                  day's located items in their current order (never a distance claim by itself —
                  see the distance-chip gating below, which needs real engine data). */}
              <button
                onClick={() => setRoutesOn(r => !r)}
                data-testid="button-toggle-routes"
                style={{ marginLeft: dayNumbersWithItems.length > 1 ? "auto" : undefined, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: routesOn ? `1.5px solid ${BRAND}` : `1.5px solid ${LINE}`, background: routesOn ? BRAND_SOFT : CARD, color: routesOn ? BRAND : MID }}
              >
                <Route style={{ width: 11, height: 11 }} /> Routes
              </button>
            </div>
          )}

          <div style={{ height: 260, borderRadius: 8, overflow: "hidden", position: "relative" }}>
            <MapSectionErrorBoundary>
              {googleMapActive && canShowMap ? (
                <APIProvider apiKey={MAPS_KEY}>
                  <Map
                    mapId={GOOGLE_MAPS_MAP_ID}
                    defaultCenter={initialCenter}
                    defaultZoom={13}
                    gestureHandling="greedy"
                    disableDefaultUI={true}
                    style={{ width: "100%", height: "100%" }}
                    onClick={() => { setSelectedPinItem(null); setSelectedCandidate(null); }}
                  >
                    <PlanMapFitBounds items={visibleItems} />
                    <PlanMapFocusFromList
                      focusId={focusFromListId ?? null}
                      items={locatedItems}
                      onFocus={(item) => { setSelectedPinItem(item); onListFocusHandled?.(); }}
                    />

                    {/* Advisor Phase 1 — route layer: per-day polylines, day-color cycling. */}
                    {routeLines.map(r => (
                      <Polyline
                        key={`route-${r.day}`}
                        path={r.points}
                        strokeColor={r.color}
                        strokeOpacity={0.9}
                        strokeWeight={3}
                      />
                    ))}

                    {visibleItems.map(item => (
                      <MapMarker
                        key={item.id}
                        position={{ lat: parseFloat(String(item.latitude)), lng: parseFloat(String(item.longitude)) }}
                        onClick={() => setSelectedPinItem(item)}
                      >
                        <div
                          data-testid={`map-pin-${item.id}`}
                          title={item.title}
                          style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: "var(--console-brand)", color: "var(--console-card)",
                            border: selectedPinItem?.id === item.id ? "2px solid var(--console-card)" : "2px solid transparent",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {item.dayNumber}
                        </div>
                      </MapMarker>
                    ))}

                    {selectedPinItem && isLocatedItem(selectedPinItem) && (
                      <InfoWindow
                        position={{ lat: parseFloat(String(selectedPinItem.latitude)), lng: parseFloat(String(selectedPinItem.longitude)) }}
                        onCloseClick={() => setSelectedPinItem(null)}
                      >
                        <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 160, maxWidth: 220 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>{selectedPinItem.title}</div>
                          <div style={{ fontSize: 11.5, color: MID, marginBottom: 8 }}>Day {selectedPinItem.dayNumber}</div>
                          <button
                            onClick={() => { const id = selectedPinItem.id; setSelectedPinItem(null); onGoToItem(id); }}
                            data-testid={`button-goto-item-${selectedPinItem.id}`}
                            style={{ ...btnPrimaryStyle, width: "100%", padding: "5px 8px", borderRadius: 7, fontSize: 12 }}
                          >
                            Go to item
                          </button>
                        </div>
                      </InfoWindow>
                    )}

                    {/* Item 19 — DISCOVERY layer: candidate pins from whichever Add-panel source
                        drawer is currently open (empty when none is), hollow/secondary style to
                        stay visually distinct from the plan layer's solid brand-filled pins. */}
                    {candidateItems.map(cand => (
                      <MapMarker
                        key={`candidate-${cand.id}`}
                        position={{ lat: cand.lat, lng: cand.lng }}
                        onClick={() => setSelectedCandidate(cand)}
                      >
                        <div
                          data-testid={`map-candidate-pin-${cand.id}`}
                          title={cand.title}
                          style={{
                            width: 20, height: 20, borderRadius: "50%",
                            background: "var(--console-card)",
                            border: `2.5px solid var(--console-brand)`,
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Plus style={{ width: 10, height: 10, color: "var(--console-brand)" }} />
                        </div>
                      </MapMarker>
                    ))}

                    {selectedCandidate && (
                      <InfoWindow
                        position={{ lat: selectedCandidate.lat, lng: selectedCandidate.lng }}
                        onCloseClick={() => setSelectedCandidate(null)}
                      >
                        <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 160, maxWidth: 220 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>{selectedCandidate.title}</div>
                          <div style={{ fontSize: 11.5, color: MID, marginBottom: selectedCandidate.price ? 2 : 8 }}>{candidateSourceLabel}</div>
                          {selectedCandidate.price && (
                            <div style={{ fontSize: 11.5, color: MID, marginBottom: 8 }}>{selectedCandidate.price}</div>
                          )}
                          <button
                            onClick={() => { const id = selectedCandidate.id; setSelectedCandidate(null); onAddCandidate(id); }}
                            data-testid={`button-add-candidate-${selectedCandidate.id}`}
                            style={{ ...btnPrimaryStyle, width: "100%", padding: "5px 8px", borderRadius: 7, fontSize: 12 }}
                          >
                            Add to Day {discoveryDayNumber}
                          </button>
                        </div>
                      </InfoWindow>
                    )}
                  </Map>
                </APIProvider>
              ) : canShowMap ? (
                // WORKSTATION_LOCATION_MAP_SPEC Part B — the "Google swap point": no client Maps
                // key OR a runtime key rejection (gm_authFailure) ⇒ Leaflet + OSM tiles (keyless)
                // instead of an unavailable notice / dead AuthFailure overlay. The moment a valid
                // MAPS_KEY loads cleanly, the branch above takes over on its own.
                <LeafletPlanMap
                  items={visibleItems.map(item => ({
                    id: item.id,
                    title: item.title,
                    dayNumber: item.dayNumber,
                    lat: parseFloat(String(item.latitude)),
                    lng: parseFloat(String(item.longitude)),
                  }))}
                  center={initialCenter}
                  selectedId={selectedPinItem?.id ?? null}
                  onSelect={(id) => setSelectedPinItem(id ? (visibleItems.find(i => i.id === id) ?? null) : null)}
                  onGoToItem={(id) => { setSelectedPinItem(null); onGoToItem(id); }}
                  focusTarget={focusFromListItem ? {
                    id: focusFromListItem.id,
                    title: focusFromListItem.title,
                    dayNumber: focusFromListItem.dayNumber,
                    lat: parseFloat(String(focusFromListItem.latitude)),
                    lng: parseFloat(String(focusFromListItem.longitude)),
                  } : null}
                  candidates={candidateItems}
                  candidateSourceLabel={candidateSourceLabel}
                  onAddCandidate={onAddCandidate}
                  addCandidateLabel={`Add to Day ${discoveryDayNumber}`}
                  routes={routeLines.map(r => ({ day: r.day, color: r.color, points: r.points.map(p => [p.lat, p.lng] as [number, number]) }))}
                />
              ) : (
                <div data-testid="text-plan-map-unavailable" style={{ height: "100%", background: GROUND, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <MapPin style={{ width: 24, height: 24, color: FAINT }} />
                  <span style={{ fontSize: 12, color: MID }}>No located items to show yet</span>
                </div>
              )}
            </MapSectionErrorBoundary>

            {/* Advisor Phase 1 — per-day distance chips, engine sums only. Lines draw as soon as
                Routes is on (order-visualization); a distance chip only ever appears once the
                transport-legs engine has actually computed that day — never a client estimate
                (§13). No legs data ⇒ no chips, even with the lines showing. */}
            {routeDistanceChipDays.length > 0 && (
              <div style={{ position: "absolute", left: 8, bottom: 8, zIndex: 20, display: "flex", flexDirection: "column", gap: 3 }}>
                {routeDistanceChipDays.map(d => (
                  <div
                    key={d}
                    data-testid={`chip-route-distance-day-${d}`}
                    style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, color: INK, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
                  >
                    Day {d} · {(routeDistanceMetersByDay[d] / 1000).toFixed(1)} km
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* §13: honest, never fabricated — the "not on map" tray lists the actual unlocated
              rows (Part B), not just a count, so an expert can see and jump to WHICH items still
              need a location rather than guessing from a number. */}
          {unlocatedItems.length > 0 && (
            <div data-testid="tray-unlocated-items" style={{ marginTop: 8, borderRadius: 8, border: `1px solid ${LINE}`, background: GROUND, padding: "6px 8px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: MID, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                Not on map — {unlocatedItems.length} item{unlocatedItems.length === 1 ? "" : "s"} have no location yet
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 120, overflowY: "auto" }}>
                {unlocatedItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onGoToItem(item.id)}
                    data-testid={`button-unlocated-item-${item.id}`}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "3px 2px", textAlign: "left", color: MID, fontSize: 11.5 }}
                  >
                    <span style={{ fontWeight: 700, color: FAINT, flexShrink: 0 }}>D{item.dayNumber}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TransportLegAlternative { mode: string; durationMinutes: number; costUsd: number | null; energyCost: number; reason: string; }
interface TripTransportLeg {
  id: string;
  tripId?: string | null;
  variantId?: string | null;
  dayNumber: number;
  legOrder: number;
  fromActivityId: string | null;
  fromName: string;
  toActivityId: string | null;
  toName: string;
  distanceMeters: number;
  distanceDisplay: string;
  recommendedMode: string;
  userSelectedMode: string | null;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  alternativeModes?: TransportLegAlternative[] | null;
  pickupPoint: string | null;
  pickupTime: string | null;
  proposalStatus: "proposed" | "confirmed" | null;
}
interface TripTransportLegsResponse { legs: TripTransportLeg[]; variantId: string | null; }
interface GenerateLegsSkip { dayNumber: number; fromItemId: string; fromTitle: string; toItemId: string; toTitle: string; reason: "missing_coordinates"; }
interface GenerateLegsResult { tripId: string; proposalStatus: "proposed"; created: number; keptConfirmed: number; replacedProposed: number; skipped: GenerateLegsSkip[]; }

/** The mode picker's option set for ONE leg — never a hand-typed full vocabulary. It unions this
 *  leg's own engine-computed recommendation + alternatives (guaranteed valid against the server's
 *  SELECTABLE_TRANSPORT_MODES enum, since both are derived from the same destination-profile
 *  data the server reads) with the exact shared CHAUFFEURED_MODES constant (imported from
 *  @shared/trip-plan, not retyped) so a chauffeured option is always offered even on a leg the
 *  engine didn't recommend one for — matching the brief's "taxi/rideshare/private_driver/…" ask
 *  without drifting from what PATCH actually accepts. */
function legModeOptions(leg: TripTransportLeg): string[] {
  const set = new Set<string>();
  set.add(leg.recommendedMode);
  (leg.alternativeModes ?? []).forEach((a) => set.add(a.mode));
  CHAUFFEURED_MODES.forEach((m) => set.add(m));
  if (leg.userSelectedMode) set.add(leg.userSelectedMode);
  return Array.from(set).sort();
}

function transportModeLabel(mode: string): string {
  return TRANSPORT_MODE_LABELS[mode] || mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function transportModeIcon(mode: string): string {
  return TRANSPORT_MODE_ICONS[mode] || "🚌";
}

/** One leg's row: mode icon/duration/distance/status, the mode picker, chauffeured-only pickup
 *  fields, Confirm, and Remove. Pickup fields save via an explicit button (mirrors the Edit
 *  items expert-note pattern above) so a half-typed pickup note is never PATCHed on every
 *  keystroke; the mode select PATCHes immediately (mirrors the Edit items "Move to day" select). */
function TransportLegRow({
  leg, draft, onDraftChange, onModeChange, onSavePickup, onConfirm, onDelete, pending,
}: {
  leg: TripTransportLeg;
  draft: { pickupPoint: string; pickupTime: string };
  onDraftChange: (d: { pickupPoint: string; pickupTime: string }) => void;
  onModeChange: (mode: string) => void;
  onSavePickup: (d: { pickupPoint: string; pickupTime: string }) => void;
  onConfirm: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const currentMode = leg.userSelectedMode || leg.recommendedMode;
  const chauffeured = isChauffeuredMode(currentMode);
  const options = legModeOptions(leg);
  const pickupDirty = draft.pickupPoint !== (leg.pickupPoint ?? "") || draft.pickupTime !== (leg.pickupTime ?? "");

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: MID, display: "block", marginBottom: 3 };
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${LINE}`, fontSize: 12.5, outline: "none", boxSizing: "border-box" as any, background: CARD, color: INK, minHeight: 44 };

  return (
    <div data-testid={`transport-leg-row-${leg.id}`} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{transportModeIcon(currentMode)}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {leg.fromName} → {leg.toName}
        </span>
        <StateChip tone={leg.proposalStatus === "confirmed" ? "ok" : "warn"} testId={`chip-leg-status-${leg.id}`}>
          {leg.proposalStatus === "confirmed" ? "Confirmed" : "Proposed"}
        </StateChip>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: MID }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock style={{ width: 11, height: 11 }} /> {leg.estimatedDurationMinutes} min</span>
        <span>{leg.distanceDisplay}</span>
      </div>

      <div>
        <label style={labelStyle}>Mode</label>
        <select
          value={currentMode}
          onChange={(e) => onModeChange(e.target.value)}
          disabled={pending}
          data-testid={`select-transport-mode-${leg.id}`}
          style={fieldStyle}
        >
          {options.map((m) => <option key={m} value={m}>{transportModeLabel(m)}</option>)}
        </select>
      </div>

      {/* Chauffeured-only: an expert-stated arrangement fact, not a booking record (§18/L4a). */}
      {chauffeured && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={labelStyle}>Pickup point</label>
            <input
              value={draft.pickupPoint}
              onChange={(e) => onDraftChange({ ...draft, pickupPoint: e.target.value })}
              placeholder="e.g. Hotel lobby"
              data-testid={`input-pickup-point-${leg.id}`}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pickup time</label>
            <input
              value={draft.pickupTime}
              onChange={(e) => onDraftChange({ ...draft, pickupTime: e.target.value })}
              placeholder="e.g. 9:15 AM"
              data-testid={`input-pickup-time-${leg.id}`}
              style={fieldStyle}
            />
          </div>
          {pickupDirty && (
            <button
              onClick={() => onSavePickup(draft)}
              disabled={pending}
              data-testid={`button-save-pickup-${leg.id}`}
              style={{ ...btnQuietStyle, gridColumn: "1 / -1", padding: "6px", fontSize: 11.5, minHeight: 44 }}
            >
              Save pickup details
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {leg.proposalStatus === "proposed" && (
          <button
            onClick={onConfirm}
            disabled={pending}
            data-testid={`button-confirm-leg-${leg.id}`}
            style={{ ...btnPrimaryStyle, flex: 1, padding: "7px", fontSize: 11.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44, opacity: pending ? 0.6 : 1 }}
          >
            <CheckCircle style={{ width: 12, height: 12 }} /> Confirm
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={pending}
          data-testid={`button-delete-leg-${leg.id}`}
          style={{ ...btnQuietStyle, flex: leg.proposalStatus === "proposed" ? undefined : 1, padding: "7px 10px", fontSize: 11.5, color: DANGER, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44, opacity: pending ? 0.6 : 1 }}
        >
          <Trash2 style={{ width: 12, height: 12 }} /> Remove
        </button>
      </div>
    </div>
  );
}

/** The panel itself: collapsible (closed by default, mirrors Edit items), a "Generate transport"
 *  action with a replace-warning dialog when proposed legs already exist, an honest summary of
 *  the last generate response, and per-day gap rows. A day with fewer than two located stops
 *  renders ONE honest line instead of gap rows that could never route (§13); a located pair with
 *  no leg yet renders a neutral "not routed yet" placeholder — never a fabricated leg. */
function TransportLegsPanel({ tripId, days }: { tripId: string; days: { dayNumber: number; items: ItineraryItem[] }[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [lastResult, setLastResult] = useState<GenerateLegsResult | null>(null);
  const [pickupDrafts, setPickupDrafts] = useState<Record<string, { pickupPoint: string; pickupTime: string }>>({});

  const totalItems = days.reduce((n, d) => n + d.items.length, 0);

  const { data, isLoading } = useQuery<TripTransportLegsResponse>({
    queryKey: [`/api/trips/${tripId}/transport-legs`, { includeProposed: 1 }],
    enabled: !!tripId && open,
  });

  // Trip-scoped legs only. `proposalStatus` is NULL on legacy variant-scoped legs (migration 154
  // grandfather) — those ride a separate mechanism this editor does not touch, so they're
  // filtered out here rather than rendered as an unexplained third state.
  const tripLegs = (data?.legs ?? []).filter(
    (l) => l.proposalStatus === "proposed" || l.proposalStatus === "confirmed",
  );
  // globalThis.Map: the `Map` component from @vis.gl/react-google-maps (imported above) shadows
  // the global constructor within this file — same workaround as the energy-tracking dedup above.
  const legByPair = new globalThis.Map<string, TripTransportLeg>();
  for (const leg of tripLegs) legByPair.set(legPairKey(leg.dayNumber, leg.fromActivityId, leg.toActivityId), leg);
  const proposedCount = tripLegs.filter((l) => l.proposalStatus === "proposed").length;
  const confirmedCount = tripLegs.filter((l) => l.proposalStatus === "confirmed").length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/transport-legs`] });
    // Confirming/removing a leg can change what a traveler-facing surface renders (only
    // 'confirmed' legs are ever traveler-visible) — keep the embedded PlanCard in sync.
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/transport-legs/generate`, {});
      return (await res.json()) as GenerateLegsResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      invalidate();
      toast({
        title: "Transport legs generated",
        description: `${result.created} proposed · ${result.keptConfirmed} confirmed kept · ${result.replacedProposed} replaced${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`,
      });
    },
    onError: (e: any) => toast({ title: "Couldn't generate transport legs", description: e?.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ legId, data }: { legId: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/transport-legs/${legId}`, data);
      return res.json();
    },
    onSuccess: (_res, vars) => {
      invalidate();
      if ("proposalStatus" in vars.data) toast({ title: "Leg confirmed" });
      else if ("pickupPoint" in vars.data || "pickupTime" in vars.data) toast({ title: "Pickup details saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't update leg", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (legId: string) => { await apiRequest("DELETE", `/api/trips/${tripId}/transport-legs/${legId}`); },
    onSuccess: () => { invalidate(); toast({ title: "Leg removed" }); },
    onError: (e: any) => toast({ title: "Couldn't remove leg", description: e?.message, variant: "destructive" }),
  });

  if (totalItems === 0) return null;

  const runGenerate = () => { setConfirmGenerateOpen(false); generateMutation.mutate(); };
  const onGenerateClick = () => { if (proposedCount > 0) setConfirmGenerateOpen(true); else runGenerate(); };
  const rowPending = patchMutation.isPending || deleteMutation.isPending;

  return (
    <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${LINE}`, marginTop: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="button-toggle-transport-legs"
        style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minHeight: 44 }}
      >
        <Route style={{ width: 12, height: 12, color: MID }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Transport legs</span>
        {(proposedCount + confirmedCount) > 0 && (
          <span style={{ fontSize: 11, color: FAINT }}>({confirmedCount} confirmed, {proposedCount} proposed)</span>
        )}
        <span style={{ marginLeft: "auto", color: FAINT, display: "flex" }}>
          {open ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: MID }}>Run the routing engine across this trip's same-day stops.</span>
            <button
              onClick={onGenerateClick}
              disabled={generateMutation.isPending}
              data-testid="button-generate-transport"
              style={{ ...btnPrimaryStyle, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, minHeight: 44, opacity: generateMutation.isPending ? 0.6 : 1 }}
            >
              {generateMutation.isPending ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <RefreshCw style={{ width: 13, height: 13 }} />}
              Generate transport
            </button>
          </div>

          {lastResult && (
            <div style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px" }} data-testid="panel-generate-result">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>
                  {lastResult.created} proposed · {lastResult.keptConfirmed} confirmed kept · {lastResult.replacedProposed} replaced
                </span>
                <button onClick={() => setLastResult(null)} data-testid="button-dismiss-generate-result" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 4, display: "flex" }}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              </div>
              {lastResult.skipped.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {lastResult.skipped.map((s, i) => (
                    <div key={i} data-testid={`generate-skip-${s.fromItemId}-${s.toItemId}`} style={{ fontSize: 11, color: WARN, display: "flex", alignItems: "center", gap: 5 }}>
                      <AlertTriangle style={{ width: 11, height: 11, flexShrink: 0 }} />
                      Day {s.dayNumber}: {s.fromTitle} → {s.toTitle} — add a location to route this leg
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div style={{ fontSize: 12, color: MID, padding: "8px 0" }}>Loading transport legs…</div>
          ) : (
            days.map((day) => {
              const locatedCount = day.items.filter(isLocatedItem).length;
              if (day.items.length < 2 || locatedCount < 2) {
                return (
                  <div key={day.dayNumber} data-testid={`transport-day-empty-${day.dayNumber}`} style={{ fontSize: 11.5, color: FAINT, padding: "4px 0" }}>
                    Day {day.dayNumber} — add locations to at least two stops to route transport between them.
                  </div>
                );
              }
              return (
                <div key={day.dayNumber} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day {day.dayNumber}</span>
                  {day.items.slice(0, -1).map((from, i) => {
                    const to = day.items[i + 1];
                    const bothLocated = isLocatedItem(from) && isLocatedItem(to);
                    const leg = legByPair.get(legPairKey(day.dayNumber, from.id, to.id));
                    if (!bothLocated) {
                      return (
                        <div key={`${from.id}-${to.id}`} data-testid={`transport-gap-coordless-${from.id}-${to.id}`} style={{ border: `1px dashed ${LINE}`, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, color: FAINT, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
                          {from.title} → {to.title}: add a location to route this leg
                        </div>
                      );
                    }
                    if (!leg) {
                      return (
                        <div key={`${from.id}-${to.id}`} data-testid={`transport-gap-pending-${from.id}-${to.id}`} style={{ border: `1px dashed ${LINE}`, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, color: MID }}>
                          {from.title} → {to.title}: not routed yet — use Generate transport above.
                        </div>
                      );
                    }
                    return (
                      <TransportLegRow
                        key={leg.id}
                        leg={leg}
                        draft={pickupDrafts[leg.id] ?? { pickupPoint: leg.pickupPoint ?? "", pickupTime: leg.pickupTime ?? "" }}
                        onDraftChange={(d) => setPickupDrafts((prev) => ({ ...prev, [leg.id]: d }))}
                        onModeChange={(mode) => patchMutation.mutate({ legId: leg.id, data: { userSelectedMode: mode } })}
                        onSavePickup={(d) => patchMutation.mutate({ legId: leg.id, data: { pickupPoint: d.pickupPoint.trim() || null, pickupTime: d.pickupTime.trim() || null } })}
                        onConfirm={() => patchMutation.mutate({ legId: leg.id, data: { proposalStatus: "confirmed" } })}
                        onDelete={() => deleteMutation.mutate(leg.id)}
                        pending={rowPending}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}

      {confirmGenerateOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: CARD, borderRadius: 14, width: "100%", maxWidth: 400, padding: 18 }} data-testid="dialog-confirm-generate-transport">
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>Regenerate transport legs?</div>
            <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.5, marginBottom: 14 }}>
              This trip already has {proposedCount} proposed leg{proposedCount === 1 ? "" : "s"}. Generating again replaces
              every proposed leg with a fresh route — but any leg you've already confirmed is never touched or replaced.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmGenerateOpen(false)} data-testid="button-cancel-generate-transport" style={{ ...btnQuietStyle, flex: 1, padding: "8px", fontSize: 13, minHeight: 44 }}>Cancel</button>
              <button onClick={runGenerate} data-testid="button-confirm-generate-transport" style={{ ...btnPrimaryStyle, flex: 1, padding: "8px", fontSize: 13, minHeight: 44 }}>Regenerate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AssignedTrip {
  trip_id: string; trip_title: string; destination: string;
  start_date: string; end_date: string; traveler_name: string;
  traveler_user_id?: string; // served by /api/expert/assigned-trips; used for the chat deep-link
  status: string; assigned_at: string; suggestion_count: number;
}
interface ItineraryItem {
  id: string; title: string; itemType: string; status: string; dayNumber: number;
  startTime?: string | null; estimatedCost?: string | null; locationName?: string | null;
  bookingStatus?: string | null; notes?: string | null;
  // Real column on itinerary_items (full storage row, same as latitude/longitude below) — used
  // by W3-A's parsePartnerSource to detect a partner-catalog-sourced item ("Partner: <Network>"
  // prefix) and gate the item editor's Booking Brief action.
  description?: string | null;
  // Durable per-item expert note (migration 152, Workstation audit C-1) — the traveler-visible
  // tip PlanCard renders per activity. Distinct from `notes` above.
  expertNote?: string | null;
  // Real DB columns on itinerary_items (server/routes.ts returns the full storage row; this
  // interface simply hadn't declared them before). L4b's transport-leg editor uses these to
  // decide, per same-day gap, whether a leg is even routable — never invented client-side.
  latitude?: string | number | null;
  longitude?: string | number | null;
}
interface ItineraryData { days: { dayNumber: number; items: ItineraryItem[] }[]; total: number; }
interface MyAssignment {
  id: string; tripId: string; localExpertId: string; status: string; workspaceStatus: string | null; message?: string | null;
  // Plan-approval handshake (migration 164) — `GET .../my-assignment` selects the whole row, so
  // these ride along for free; NULL until the customer decides.
  planApprovalStatus?: "approved" | "changes_requested" | null;
  planReviewNote?: string | null;
}

interface AnchorImpact { type: string; message: string; severity: 'warning' | 'critical'; }
interface AnchorConflict { anchorId: string; anchorType: string; description: string; impacts: AnchorImpact[]; }
interface EnergyRecord { id?: string; dayNumber: number; startingEnergy: number; activityDepletion: number; endingEnergy: number; recoveryNeeded: boolean; recoveryReason?: string | null; createdAt?: string | null; }

// QA_PUNCH_LIST item 21 — transport-gap checker (server/services/transport-gap.service.ts).
type TransportGapFlag = "transport_gap" | "timing_infeasible" | "missing_pickup_detail";
interface TransportGapPair {
  dayNumber: number; fromItemId: string; fromTitle: string; toItemId: string; toTitle: string;
  flags: TransportGapFlag[]; assumedPrevDuration: boolean; availableGapMinutes: number;
  estimatedTravelMinutes: number; estimatedTravelMode: string;
}
interface TransportGapSkip {
  dayNumber: number; fromItemId: string; fromTitle: string; toItemId: string; toTitle: string;
  reason: "insufficient_data"; detail: "missing_coordinates" | "missing_start_time";
}
interface TransportGapDayResult { dayNumber: number; pairs: TransportGapPair[]; skipped: TransportGapSkip[]; }
interface TransportGapAnalysis { tripId: string; days: TransportGapDayResult[]; }

// Advisor Phase 2-4 (client build against the server contract below — built in parallel):
//   GET  /api/trips/:tripId/advisor/route-efficiency
//   GET  /api/trips/:tripId/advisor/stay-anchor
//   GET  /api/trips/:tripId/advisor/narration  (204 when none generated yet)
//   POST /api/trips/:tripId/advisor/narration  (502 on generation failure)
interface AdvisorRouteEfficiencyDay {
  dayNumber: number; itemCount: number; currentKm: number; optimizedKm: number;
  savingsKm: number; savingsPct: number; materiallyImprovable: boolean; optimizedOrder: string[];
}
interface AdvisorRouteEfficiencyResponse { metric: "straight_line"; days: AdvisorRouteEfficiencyDay[]; }
interface AdvisorPlatformStay { providerServiceId: string; name: string; distanceKm: number; price?: number | string | null; }
interface AdvisorStayAnchorResponse {
  anchor: { lat: number; lng: number; spreadKm: number; neighborhood?: string | null } | null;
  platformStays: AdvisorPlatformStay[];
  placesHint: { source: "google"; category: string };
}
interface AdvisorNarrationResponse { narration: string; generatedAt: string; stale: boolean; }
interface AdvisorNarrationPostResponse { narration: string; generatedAt: string; planHash: string; cached: boolean; }

// Advisor fundamentals (CLAUDE.md §21's ratified checklist) — built by the sibling server agent
// in parallel: GET /api/trips/:tripId/advisor/fundamentals. Deterministic, §13-honest: a check
// omitted for insufficient data is named with its reason, never silently dropped or guessed.
interface AdvisorFundamentalCheck {
  key: string;
  tier: 1 | 2 | 3;
  dayNumber?: number;
  message: string;
  cta?: "stays" | "editor" | "distribute";
  data?: Record<string, any>;
}
interface AdvisorFundamentalOmission { key: string; reason: string; }
interface AdvisorFundamentalsResponse {
  checks: AdvisorFundamentalCheck[];
  omitted: AdvisorFundamentalOmission[];
  tripDays: number;
}

const TRANSPORT_GAP_FLAG_COPY: Record<TransportGapFlag, string> = {
  transport_gap: "No confirmed transport arranged for this leg.",
  timing_infeasible: "The estimated travel time doesn't fit in the gap between these stops.",
  missing_pickup_detail: "Transport is provided, but no pickup point is recorded yet.",
};

// calculate-energy INSERTS a fresh energy_tracking row per day on every recalculation
// (triggered on every itinerary edit) rather than upserting — so a trip edited N times
// accumulates N rows per day, all returned by the API. Collapse to the latest row per
// dayNumber before rendering so "Day 1" renders once (was the AI Gaps tab's duplicate-key
// warning / repeated "Day 1 — 80%" rows). Root fix belongs server-side in
// storage.saveEnergyTracking (upsert on tripId+dayNumber); this is the display-side guard.
function latestEnergyPerDay(records: EnergyRecord[]): EnergyRecord[] {
  // `Map` here must be the JS built-in — the module scope also imports a React `Map`
  // component from @vis.gl/react-google-maps (line 17), which shadows the global.
  const byDay = new globalThis.Map<number, EnergyRecord>();
  for (const record of records) {
    const existing = byDay.get(record.dayNumber);
    if (!existing) {
      byDay.set(record.dayNumber, record);
      continue;
    }
    const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : NaN;
    const recordTime = record.createdAt ? new Date(record.createdAt).getTime() : NaN;
    if (!isNaN(recordTime) && (isNaN(existingTime) || recordTime >= existingTime)) {
      byDay.set(record.dayNumber, record);
    } else if (isNaN(existingTime) && isNaN(recordTime)) {
      // Neither row carries a timestamp — fall back to array order (later = more recent).
      byDay.set(record.dayNumber, record);
    }
  }
  return Array.from(byDay.values());
}
interface DayBoundaryRecord { id: string; dayNumber: number; latestActivityEnd?: string | null; earliestActivityStart?: string | null; mustReturnToHotel: boolean; reasonForConstraint?: string | null; }
interface BoundaryViolation { dayNumber: number; violation: string; severity: 'warning' | 'critical'; }
interface WorkspaceConstraints {
  anchors: Array<{ id: string; anchorType: string; anchorDatetime: string; bufferBefore: number; bufferAfter: number; isImmovable: boolean; description?: string | null }>;
  dayBoundaries: DayBoundaryRecord[];
  energyTracking: EnergyRecord[];
  anchorConflicts: AnchorConflict[];
  boundaryViolations: BoundaryViolation[];
  optimizerScores: Record<string, number> | null;
  tripExperienceType: string | null;
}

/** Store-lane listing → distribution-chip state (real listing status only, §13). */
const LISTING_CHIP: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: "Store — draft", tone: "mut" },
  submitted: { label: "Store — in review", tone: "warn" },
  approved: { label: "Store — approved", tone: "ok" },
  rejected: { label: "Store — needs changes", tone: "danger" },
  withdrawn: { label: "Store — withdrawn", tone: "mut" },
};

const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ── Suggest flow (Console IA C5): moved here from the retired /expert/assigned-trips
// page — the traveler-approval suggestion rail is client-delivery state, so it lives on
// the Distribute→Client card. Endpoints unchanged: POST /api/trips/:id/suggestions +
// GET /api/trips/:id/suggestions (the log). Assignment trips only (the Client card's
// non-authoring branch guarantees that).
interface TripSuggestion {
  id: string;
  type: string;
  day_number: number | null;
  title: string;
  description: string | null;
  estimated_cost: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  created_at: string;
}

interface SuggestionPayload {
  type: string;
  dayNumber?: number;
  title: string;
  description?: string;
  // string, not number — mirrors `createTripSuggestion`'s `estimatedCost?: string | null` param
  // (Fix 1's same-drift sibling: `trip_suggestions.estimated_cost` is a decimal column too).
  estimatedCost?: string;
}

// Add-panel source pills (§17 Central Content network). D1/D5 (UX audit Jul 29): every
// pill now carries a plain-language caption so a first-time expert can tell what each
// source actually is without hovering a tooltip; `comingSoon` sources stay honestly
// labeled but are clickable (§13 "coming soon" pattern) instead of dead/disabled.
// W1-A: "Platform content" and "My services" are wired up (platform-content-picker.tsx /
// my-services-picker.tsx) — comingSoon removed from both.
const ADD_SOURCES: { k: string; l: string; caption: string; comingSoon?: boolean }[] = [
  { k: "dmo", l: "DMO Library", caption: "Local research your admin has approved for Kyoto — refine it, then drop it into a day." },
  { k: "content", l: "Platform content", caption: "The shared Traveloure content library, scoped to this build's destination." },
  { k: "platform", l: "Platform services", caption: "Traveloure's approved bookable services in this city, plus a map to browse them." },
  { k: "google", l: "Google Places", caption: "Live Google Places search for this destination — nothing here is stored in Traveloure's catalog." },
  { k: "viator", l: "Viator", caption: "Bookable tours and activities from Viator — add them straight to the itinerary." },
  { k: "partner", l: "Partner inventory", caption: "Browse tours & activities from Traveloure's partner networks, or jump straight to a network's booking site." },
  { k: "mine", l: "My services", caption: "Your own approved, active listings — drop one straight onto this build." },
  { k: "custom", l: "Custom", caption: "Add anything by hand — a place, a note, or a reservation with no catalog match." },
  { k: "transport", l: "Transport", caption: "Ground-transport routes (train, taxi, transfer) between stops." },
];

const SUGGESTION_TYPES = [
  { value: "activity", label: "Activity" },
  { value: "food", label: "Food / Restaurant" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "venue", label: "Venue" },
  { value: "note", label: "General note" },
];

const suggestFieldStyle: React.CSSProperties = {
  width: "100%", padding: "6px 9px", borderRadius: 8, border: `1px solid ${LINE}`,
  background: CARD, color: INK, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box",
};

function ClientSuggestPanel({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "activity", dayNumber: "", title: "", description: "", estimatedCost: "" });

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ suggestions: TripSuggestion[] }>({
    queryKey: [`/api/trips/${tripId}/suggestions`],
    enabled: !!tripId && open,
  });
  const suggestions = suggestionsData?.suggestions ?? [];

  const submitSuggestionMutation = useMutation({
    mutationFn: async (payload: SuggestionPayload) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/suggestions`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/suggestions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/assigned-trips"] });
      setForm({ type: "activity", dayNumber: "", title: "", description: "", estimatedCost: "" });
      toast({ title: "Suggestion sent!", description: "The traveler will review your idea." });
    },
    onError: (err: any) => {
      toast({ title: "Could not submit suggestion", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: SuggestionPayload = { type: form.type, title: form.title.trim() };
    if (form.dayNumber) payload.dayNumber = parseInt(form.dayNumber, 10);
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.estimatedCost) payload.estimatedCost = String(parseFloat(form.estimatedCost));
    submitSuggestionMutation.mutate(payload);
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-suggest"
        style={{ width: "100%", padding: "7px 10px", background: GROUND, border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <Lightbulb style={{ width: 11, height: 11, color: MID }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Suggest to client</span>
        {open && !suggestionsLoading && <StateChip tone="mut">{suggestions.length}</StateChip>}
        <span style={{ marginLeft: "auto", display: "flex", color: FAINT }}>
          {open ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 11, color: MID, margin: 0 }}>
            Your suggestion goes to the traveler for approval. Approved suggestions are added to their itinerary.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <select
              value={form.type}
              onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
              data-testid="select-suggestion-type"
              style={suggestFieldStyle}
            >
              {SUGGESTION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="Day (optional)"
              value={form.dayNumber}
              onChange={(e) => setForm(f => ({ ...f, dayNumber: e.target.value }))}
              data-testid="input-suggestion-day"
              style={suggestFieldStyle}
            />
          </div>
          <input
            placeholder="Title — e.g. Visit Senso-ji Temple at sunrise"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            data-testid="input-suggestion-title"
            style={suggestFieldStyle}
          />
          <textarea
            placeholder="Details (optional) — why this is special, how to book, insider tips…"
            rows={2}
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            data-testid="input-suggestion-description"
            style={{ ...suggestFieldStyle, resize: "vertical" }}
          />
          <input
            type="number"
            min={0}
            placeholder="Estimated cost (USD, optional)"
            value={form.estimatedCost}
            onChange={(e) => setForm(f => ({ ...f, estimatedCost: e.target.value }))}
            data-testid="input-suggestion-cost"
            style={suggestFieldStyle}
          />
          <button
            onClick={handleSubmit}
            disabled={submitSuggestionMutation.isPending || !form.title.trim()}
            data-testid="button-submit-suggestion"
            style={{ ...btnPrimaryStyle, padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: submitSuggestionMutation.isPending || !form.title.trim() ? 0.6 : 1 }}
          >
            {submitSuggestionMutation.isPending
              ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
              : <Lightbulb style={{ width: 12, height: 12 }} />}
            Send suggestion
          </button>

          {/* Suggestion log — real statuses only (§13). */}
          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: INK, marginBottom: 6 }}>Your previous suggestions</div>
            {suggestionsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1, 2].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : suggestions.length === 0 ? (
              <p style={{ fontSize: 11.5, color: MID, margin: 0 }}>No suggestions sent yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="expert-suggestions-log">
                {suggestions.map(s => {
                  // W3-A: a partner-catalog suggestion (see partner-catalog-picker.tsx) carries
                  // the same "Partner: <Network>" marker as the eventual item. Booking still has
                  // exactly ONE home (the item editor's Booking Brief button, which only exists
                  // once the item is real) — this row never opens it itself, it only ever states
                  // the honest gate state truthfully: never an enabled Book action pre-approval.
                  const partnerSource = parsePartnerSource(s.description);
                  return (
                  <div
                    key={s.id}
                    data-testid={`expert-suggestion-log-${s.id}`}
                    style={{
                      border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 10px", fontSize: 12,
                      background: s.status === "approved" ? OK_SOFT : s.status === "rejected" ? DANGER_SOFT : GROUND,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, color: INK, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                      {partnerSource && (
                        <StateChip tone="brand" testId={`suggestion-partner-badge-${s.id}`}>{partnerSource.network}</StateChip>
                      )}
                      {s.status === "approved" && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: OK, flexShrink: 0 }}>
                          <CheckCircle style={{ width: 11, height: 11 }} /> Approved
                        </span>
                      )}
                      {s.status === "rejected" && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: DANGER, flexShrink: 0 }}>
                          <XCircle style={{ width: 11, height: 11 }} /> Declined
                        </span>
                      )}
                      {s.status === "pending" && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: WARN, flexShrink: 0 }}>
                          <Clock style={{ width: 11, height: 11 }} /> Pending
                        </span>
                      )}
                    </div>
                    {s.rejection_note && (
                      <p style={{ fontSize: 10.5, color: DANGER, fontStyle: "italic", margin: "3px 0 0" }}>"{s.rejection_note}"</p>
                    )}
                    {partnerSource && s.status === "pending" && (
                      <div
                        data-testid={`text-booking-brief-gated-${s.id}`}
                        style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: FAINT }}
                      >
                        <Lock style={{ width: 10, height: 10 }} /> Booking Brief — Awaiting client approval
                      </div>
                    )}
                    {partnerSource && s.status === "approved" && (
                      <div
                        data-testid={`text-booking-brief-ready-${s.id}`}
                        style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: MID }}
                      >
                        <ShieldCheck style={{ width: 10, height: 10 }} /> Booking Brief available in Edit items
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// FIX 2 (W1c polish): "+ Day" persistence. Per-trip sessionStorage so the extended day range
// survives a reload instead of collapsing back to the real max day. Read/write are best-effort —
// a storage failure (private mode, quota) must never break the workspace, so both fall back to
// the pre-existing behavior (default 1 / silent no-op).
function extraMaxDayStorageKey(tripId: string): string {
  return `workspace-extra-day-${tripId}`;
}

function readExtraMaxDay(tripId: string): number {
  try {
    const raw = sessionStorage.getItem(extraMaxDayStorageKey(tripId));
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

function writeExtraMaxDay(tripId: string, value: number): void {
  try {
    sessionStorage.setItem(extraMaxDayStorageKey(tripId), String(value));
  } catch {
    // best-effort — never block the UI on a storage failure
  }
}

// ── Booking-brief session cache (trip-scoped, sessionStorage-backed) ─────────
// Keyed per tripId so confirming a provider for one trip never skips the modal
// on a different client's trip. sessionStorage survives page reloads but is
// cleared when the browser tab/session ends — matching "same session" semantics.
// All errors are swallowed: private-browsing / quota failures silently degrade
// to in-memory-only behaviour (the state Set still works for the current mount).
const BOOKING_BRIEF_STORE = (tripId: string) => `booking-brief-confirmed:${tripId}`;
const normalizeProvider = (p: string) => p.trim().toLowerCase();

function readConfirmedFromSession(tripId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(BOOKING_BRIEF_STORE(tripId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeConfirmedToSession(tripId: string, providers: Set<string>): void {
  try {
    sessionStorage.setItem(BOOKING_BRIEF_STORE(tripId), JSON.stringify(Array.from(providers)));
  } catch {
    // quota / private-browsing — silently degrade
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// hint: Logic changed on both sides. Requires understanding intent of each change.
export default function ExpertWorkspace() {
  const { tripId } = useParams<{ tripId: string }>();
  // (The runtime-auth-failure hook is consumed inside PlacesAutocompleteInput and
  // CanvasMapSection; ExpertWorkspace's own copy served only the retired in-drawer
  // browse map and was removed with it in the merge.)
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Panel tabs are exactly Add · AI Gaps · Distribute (v9 spec :264). "add" is the
  // assignment-mode default; authoring mode defaults to "distribute" once the mode resolves.
  const [rightTab, setRightTab] = useState("add");
  // Add-panel source pill (§17 "Add panel = the Central Content network").
  const [addSource, setAddSource] = useState("dmo");
  const [cat, setCat] = useState("all");
  // Viator detail expand — tracks which result card (by productCode) is currently expanded.
  const [expandedViatorId, setExpandedViatorId] = useState<string | null>(null);
  // P2-13: ONE day-focus control for the whole Add panel — every add row targets this day.
  const [focusDay, setFocusDay] = useState<number>(1);
  // A-1 "+ Day": highest expert-added target day. MUST live here with the other top-level
  // hooks — the landing view early-returns before the trip canvas, so any hook declared
  // below that return crashes with "Rendered more hooks than during the previous render"
  // when navigating landing → trip. The rendered range merges this with the real max day.
  const [extraMaxDay, setExtraMaxDay] = useState<number>(1);
  // Trip-scoped UI state must reset when navigating between trips in the same mounted
  // component instance, or Trip B inherits Trip A's expanded day range / focused day.
  // FIX 2: "reset" for extraMaxDay means "restore this trip's own persisted value" (default 1
  // when none was ever saved), not always 1 — so a reload of the SAME trip keeps its "+ Day"
  // extension instead of losing it.
  useEffect(() => {
    setExtraMaxDay(tripId ? readExtraMaxDay(tripId) : 1);
    setFocusDay(1);
  }, [tripId]);

  // Unowned-item fix: pulls active affiliate partners from the admin-editable
  // affiliate_partners table (LB-P4a made that table the source of truth).
  const { data: affiliatePartnersData, isLoading: affiliatePartnersLoading } = useQuery<{
    partners: Array<{ id: string; name: string; category: string | null; websiteUrl: string; description: string | null; logoUrl: string | null }>;
  }>({
    queryKey: ["/api/affiliate/partners", "active"],
    queryFn: async () => {
      const res = await fetch("/api/affiliate/partners?isActive=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load affiliate partners");
      const data = await res.json();
      // Endpoint returns either { partners: [...] } or [...] depending on the underlying service; normalize.
      return { partners: Array.isArray(data) ? data : (data.partners ?? []) };
    },
    staleTime: 5 * 60 * 1000,
  });
  const affiliatePartners = affiliatePartnersData?.partners ?? [];
  // W3-A: resolves a partner-catalog network name (e.g. "Klook", from the item's "Partner: <X>"
  // marker) to the admin-managed affiliate_partners homepage URL, so the item editor's Booking
  // Brief action can reuse the exact same sanctioned "Continue to <provider>" mechanism the
  // existing Affiliate Networks list already uses — never a new/derived URL. No match → no
  // bookingUrl, and BookingBriefModal's Continue action simply closes (existing fallback).
  const resolvePartnerBookingUrl = useCallback((network: string): string | undefined => {
    const needle = network.trim().toLowerCase();
    if (!needle) return undefined;
    const match = affiliatePartners.find(
      (p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()),
    );
    return match?.websiteUrl;
  }, [affiliatePartners]);
  const [identityRevealed, setIdentityRevealed] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  // W3-A: the Partner pill's sub-tab — the new browsable catalog (default) vs. the existing
  // affiliate-networks list, kept intact below.
  const [partnerSubTab, setPartnerSubTab] = useState<"catalog" | "networks">("catalog");
  const [, setNowTick] = useState(0);
  const noteInitialized = useRef(false);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Persists across renders: true when the last flush attempt for private notes failed so that
  // safeNavigate retries on every subsequent navigation click until a flush succeeds.
  const noteFlushFailedRef = useRef(false);
  // CLAUDE.md §21 (ratified Aug 9, 2026) — the trip-level "Expert Notes" card, traveler-visible
  // (trips.expert_traveler_note, migration 187), distinct from the private Build notes state
  // directly above. Mirrors that card's own save/debounce/status pattern exactly.
  const [travelerNoteText, setTravelerNoteText] = useState("");
  const [travelerNoteSaveStatus, setTravelerNoteSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [travelerNoteLastSavedAt, setTravelerNoteLastSavedAt] = useState<Date | null>(null);
  const [travelerNotesOpen, setTravelerNotesOpen] = useState(false);
  const travelerNoteInitialized = useRef(false);
  const travelerNotesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same failure-tracking ref for traveler-facing notes (mirrors noteFlushFailedRef above).
  const travelerNoteFlushFailedRef = useRef(false);
  const [bookingBrief, setBookingBrief] = useState<{ provider: string; bookingUrl?: string } | null>(null);
  // Session cache: normalized provider names already confirmed (via "Continue to [Provider]")
  // for the CURRENT trip in this browser session. Keyed by tripId in sessionStorage so
  // switching trips never carries over a previous client's confirmations.
  const [confirmedProviders, setConfirmedProviders] = useState<Set<string>>(() =>
    tripId ? readConfirmedFromSession(tripId) : new Set(),
  );
  // Re-hydrate whenever the active trip changes (e.g. sidebar navigation without full reload).
  useEffect(() => {
    if (tripId) setConfirmedProviders(readConfirmedFromSession(tripId));
  }, [tripId]);

  /** Session-aware booking brief opener.
   *  First click for a given provider (per trip) → shows the full modal.
   *  Subsequent clicks in the same session for the same trip → skips the modal, opens the
   *  URL directly, and shows a brief toast so the expert knows client details are still in play. */
  const handleOpenBookingBrief = useCallback((provider: string, bookingUrl?: string) => {
    if (confirmedProviders.has(normalizeProvider(provider))) {
      if (bookingUrl) window.open(bookingUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "Client details on file",
        description: `Opening ${provider} — your client's details are ready to use.`,
      });
      return;
    }
    setBookingBrief({ provider, bookingUrl });
  }, [confirmedProviders, toast]);

  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  // W1-A: "Log completed booking" — which affiliate-network card (by name) has its inline
  // log-a-booking form open. One at a time, mirroring ItemsEditorPanel's single-expanded-row pattern.
  const [logBookingOpenFor, setLogBookingOpenFor] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // W-4 location-aware builds: the destination chip is editable for authored builds.
  const [editingDest, setEditingDest] = useState(false);
  const [destDraft, setDestDraft] = useState("");
  // W-4: destination set at CREATE time — it drives what data the build loads. Server
  // defaults to the launch market when left blank.
  const [newBuildDest, setNewBuildDest] = useState("");

  // Browse / map search state
  const [browseQuery, setBrowseQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPin, setSelectedPin] = useState<any | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Item 16: "Go to item" from the plan-map InfoWindow — a one-shot signal consumed by
  // ItemsEditorPanel (the canvas's only per-item, DOM-addressable list) which opens/expands/
  // scrolls to the row, then clears this back to null.
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  // WORKSTATION_LOCATION_MAP_SPEC Part B — "vice versa" of the above: a one-shot signal in the
  // OPPOSITE direction, from a list row's "Show on map" button to CanvasMapSection, which pans to
  // and selects the matching pin, then clears this back to null.
  const [mapFocusItemId, setMapFocusItemId] = useState<string | null>(null);
  // Advisor Phase 2-4: a THIRD one-shot signal, same shape as focusItemId — the reorder-nudge
  // card's "See suggested order" button sets a dayNumber here; ItemsEditorPanel opens itself and
  // fires its OWN optimizeMutation for that day (never a duplicated algorithm/write here), then
  // clears this back to null via onSuggestHandled.
  const [suggestOrderForDay, setSuggestOrderForDay] = useState<number | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(browseQuery), 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [browseQuery]);

  // ── Data fetching ──
  // Mode resolution is the SERVER's call (ready-made brief §2): assignment (an advisor row exists)
  // vs authoring (this expert is the trip's author). The client never infers it from a role string.
  const { data: workspaceCtx, isLoading: ctxLoading } = useQuery<{
    mode: "assignment" | "authoring" | "booking_request";
    trip: any;
    listing?: ReadyMadeListing | null;
  }>({
    queryKey: [`/api/expert/workspace-context/${tripId}`],
    enabled: !!tripId,
    retry: false,
  });
  const isAuthoring = workspaceCtx?.mode === "authoring";
  /** Provider landed here via a booking-request notification — advisor row not yet created. */
  const isBookingRequest = workspaceCtx?.mode === "booking_request";
  const listing = (workspaceCtx?.listing ?? null) as ReadyMadeListing | null;

  // Decision-maker ruling (Aug 8 2026): the workspace ALWAYS lands on Add — building comes
  // before distributing. The former authoring-opens-on-Distribute effect is deliberately gone;
  // "add" is the useState default above, so no effect is needed at all.

  const { data: assignedTrips, isLoading: tripsLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    // Wait for workspace-context to resolve so isAuthoring/isBookingRequest are known before firing.
    // authoring trips have no advisor row; booking_request providers are not assigned advisors yet.
    enabled: !!workspaceCtx && !isAuthoring && !isBookingRequest,
  });

  const { data: expertRoleData } = useQuery<{ role: string; roleLabel: string | null; applicationStatus: string | null }>({
    queryKey: ["/api/expert/role"],
  });
  const isEventPlanner = expertRoleData?.role === "event_planner";

  // P1-1 (§17 build-first): ONE create action. POST /api/expert/ready-made creates a BUILD
  // only (trip, authorId=caller, NO listing) — where it ships is decided later in Distribute.
  const startBuild = useMutation({
    mutationFn: async () => {
      // W-4: the build's destination — the location its data loads from. Blank → the
      // server's launch-market default. The §12 gate applies only at ship-to-store.
      const dest = newBuildDest.trim();
      const res = await fetch("/api/expert/ready-made", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(dest ? { destination: dest } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Could not start a new build");
      return body as { tripId: string; redirect: string };
    },
    onSuccess: (body) => setLocation(body.redirect),
  });

  // P1-2 unified builds list, W-3 task 3: the authored lane rides GET /api/expert/ready-made/builds
  // — every authored trip, INCLUDING unshipped builds with no listing yet, LEFT-JOINed with the
  // store listing when one exists (one row per trip, so no duplicates). Home-only.
  const { data: myBuildsData } = useQuery<{
    builds: Array<{ id: string; title: string | null; destination: string | null; startDate: string | null; endDate: string | null; status: string | null; createdAt: string | null; listingId: string | null; listingStatus: string | null }>;
  }>({
    queryKey: ["/api/expert/ready-made/builds"],
    enabled: !tripId,
  });
  const smartLandingFired = useRef(false);
  useEffect(() => {
    if (tripId || smartLandingFired.current) return;
    if (!assignedTrips || assignedTrips.length !== 1) return;
    if (!myBuildsData) return; // wait for the builds answer — never guess
    if ((myBuildsData.builds ?? []).length !== 0) return;
    smartLandingFired.current = true;
    setLocation(`/expert/workspace/${assignedTrips[0].trip_id}`);
  }, [tripId, assignedTrips, myBuildsData, setLocation]);

  // Distribute → Direct channel: trackable booking link for the store listing
  // (mirrors share-promote.tsx's ensureShortLink pattern; owner-verified server-side).
  const [directLink, setDirectLink] = useState<string | null>(null);
  const getBookingLinkMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType: "ready_made", targetId: listingId }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = (await res.json()) as { url: string };
      return `${window.location.origin}${data.url}`;
    },
    onSuccess: (url) => setDirectLink(url),
    onError: () => toast({ title: "Couldn't create the booking link", variant: "destructive" }),
  });

  // P1-3 Store channel on an authored build with no listing: "ship to store" creates the
  // listing FROM the build (W-1 endpoint; idempotent server-side — alreadyExists on retry).
  const shipToStoreMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expert/ready-made/from-trip/${tripId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Could not ship this build to the store");
      return body as { listingId: string | null; alreadyExists: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/builds"] });
      toast({ title: "Shipped to store", description: "Price it and submit for review below." });
    },
  });

  // Editable build title (bld-top). PATCH /api/expert/ready-made/:id syncs the source trip's
  // title server-side, so the ONE title the author edits stays real everywhere.
  const renameListingMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!listing?.id) throw new Error("No listing");
      const res = await apiRequest("PATCH", `/api/expert/ready-made/${listing.id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/builds"] });
    },
    onError: (e: any) => toast({ title: "Couldn't rename the build", description: e.message, variant: "destructive" }),
  });

  // W-3/W-4: authored-build edit — title and/or destination via the build-only endpoint
  // (owner-gated server-side; strict two-field allow-list). commitTitle picks between the
  // listing PATCH and this by whether workspaceCtx.listing exists; destination edits always
  // go here (W-4 location-aware builds — the destination drives what data loads, and the
  // derived `destination`/format/neighborhood reads all recompute on context invalidation).
  const renameBuildMutation = useMutation({
    mutationFn: async (patch: { title?: string; destination?: string }) => {
      const res = await apiRequest("PATCH", `/api/expert/ready-made/build/${tripId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/builds"] });
    },
    onError: (e: any) => toast({ title: "Couldn't rename the build", description: e.message, variant: "destructive" }),
  });

  // W-5: delete a never-shipped draft build (Workstation home "Your builds" list). Only rows
  // with no listing yet expose the control (server refuses shipped builds with 409 regardless —
  // this is UI-side scoping, not the real gate). Id from the path, no body.
  const deleteBuildMutation = useMutation({
    mutationFn: async (buildId: string) => {
      await apiRequest("DELETE", `/api/expert/ready-made/build/${buildId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ready-made/builds"] });
      toast({ title: "Draft deleted" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't delete this build", description: parseApiErrorMessage(e, "Something went wrong."), variant: "destructive" }),
  });

  const assignedTrip = assignedTrips?.find(t => t.trip_id === tripId);
  // Authoring trips carry userId=NULL and no traveler, so they cannot come from assigned-trips.
  // booking_request mode: provider landed via a notification link before the advisor row exists —
  // shape the context trip the same way so the rest of the page can render with the trip data.
  // Shape the context's trip row into the same view model the whole page already reads.
  const trip: AssignedTrip | undefined = assignedTrip ?? ((isAuthoring || isBookingRequest) && workspaceCtx?.trip ? {
    trip_id: workspaceCtx.trip.id,
    trip_title: workspaceCtx.trip.title ?? "Untitled build",
    destination: workspaceCtx.trip.destination ?? "",
    start_date: workspaceCtx.trip.startDate ?? "",
    end_date: workspaceCtx.trip.endDate ?? "",
    traveler_name: "", // there is no traveler — an authored build has no client attached
    status: workspaceCtx.trip.status ?? "draft",
    assigned_at: "",
    suggestion_count: 0,
  } : undefined);

  // booking_request mode: provider landed via a notification link with an active booking but
  // no advisor assignment yet. Every trip-scoped sub-query is gated on !!workspaceCtx so the
  // mode is known before any request fires — on the initial render workspaceCtx is undefined,
  // making isBookingRequest false, which would otherwise enable the queries prematurely.
  const { data: itineraryData, isLoading: itemsLoading } = useQuery<ItineraryData>({
    queryKey: [`/api/trips/${tripId}/itinerary-items`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest,
  });

  const { data: assignment, isLoading: assignmentLoading } = useQuery<MyAssignment>({
    queryKey: [`/api/trips/${tripId}/my-assignment`],
    enabled: !!tripId && !!workspaceCtx && !isAuthoring && !isBookingRequest,
  });

  const { data: expertNotesData } = useQuery<{ expertNotes: string; expertNotesUpdatedAt?: string | null }>({
    queryKey: [`/api/trips/${tripId}/expert-notes`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest,
  });

  // CLAUDE.md §21 — the trip-level traveler-facing note's INITIAL value. There is no dedicated
  // GET for `trips.expert_traveler_note` (only the PATCH below); the field rides the plancard
  // fetch instead (contract: "the trip GET will include expertTravelerNote" — the plancard route
  // is the trip GET every other traveler-facing surface already reads it from, PlanCard.tsx
  // included). Reuses the SAME query key every itinerary/plancard mutation in this file already
  // invalidates, so this stays in sync for free rather than adding a second cache to babysit.
  const { data: plancardForNote } = useQuery<{ trip?: { expertTravelerNote?: string | null } }>({
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest,
    staleTime: 30 * 1000,
    retry: false,
  });

  const { data: workspaceConstraints, isLoading: constraintsLoading } = useQuery<WorkspaceConstraints>({
    queryKey: [`/api/trips/${tripId}/workspace-constraints`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest,
    staleTime: 30 * 1000,
  });

  // QA_PUNCH_LIST item 21 — lazy-loaded only when the AI Gaps tab is actually open, mirroring
  // TransportLegsPanel's own `enabled: open` gating (the underlying analysis calls the travel-time
  // estimator per same-day pair — no reason to pay for it on every workspace load).
  const { data: transportGaps, isLoading: transportGapsLoading } = useQuery<TransportGapAnalysis>({
    queryKey: [`/api/trips/${tripId}/transport-gaps`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
  });

  // Advisor Phase 1 — the Route summary card's data. Same queryKey/shape TransportLegsPanel and
  // CanvasMapSection's own route layer use (`includeProposed: 1`) — a shared react-query cache
  // entry, gated the same "only while the tab is open" way transportGaps above is.
  const { data: advisorLegsData } = useQuery<TripTransportLegsResponse>({
    queryKey: [`/api/trips/${tripId}/transport-legs`, { includeProposed: 1 }],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
  });

  // Advisor Phase 2-4 — reorder-nudge source (route-efficiency), stays card (stay-anchor), and
  // the on-open narration read. All three gate on the tab being open exactly like advisorLegsData
  // above; staleTime keeps a tab flip from re-fetching every time within the same minute. Errors
  // are swallowed (§13: a failed card renders nothing or a one-line muted note, never breaks the
  // tab) — react-query's own `isError` flag is read directly rather than a toast.
  const { data: advisorRouteEfficiency, isError: advisorRouteEfficiencyError } = useQuery<AdvisorRouteEfficiencyResponse>({
    queryKey: [`/api/trips/${tripId}/advisor/route-efficiency`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
    staleTime: 60 * 1000,
    retry: false,
  });

  const { data: advisorStayAnchor, isError: advisorStayAnchorError } = useQuery<AdvisorStayAnchorResponse>({
    queryKey: [`/api/trips/${tripId}/advisor/stay-anchor`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
    staleTime: 60 * 1000,
    retry: false,
  });

  // Narration GET can 204 ("none yet") — a bare res.json() would throw on the empty body, so this
  // is a custom queryFn that reads the status first. 204 resolves to `null`, which is a valid,
  // successful "no narration yet" state (distinct from isLoading/isError).
  const { data: advisorNarration, isLoading: advisorNarrationLoading, isError: advisorNarrationError } = useQuery<AdvisorNarrationResponse | null>({
    queryKey: [`/api/trips/${tripId}/advisor/narration`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/trips/${tripId}/advisor/narration`);
      if (res.status === 204) return null;
      return res.json();
    },
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
    staleTime: 60 * 1000,
    retry: false,
  });

  // POST /advisor/narration is explicitly ON-DEMAND (never auto-fired) — the button below is its
  // only caller. A 502 is surfaced as an honest inline error, not retried automatically.
  const narrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/advisor/narration`, {});
      return res.json() as Promise<AdvisorNarrationPostResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([`/api/trips/${tripId}/advisor/narration`], { narration: data.narration, generatedAt: data.generatedAt, stale: false });
    },
  });

  // Fundamentals card — deterministic pass/fail checklist (§21's ratified list, built
  // server-side). staleTime keeps a tab flip from re-fetching every time within the same window,
  // same convention as the other three advisor queries just above; the default queryFn throws
  // on a non-2xx OR on a route the sibling hasn't mounted yet (Vite's catch-all 200-HTML fails
  // res.json() parsing — CLAUDE.md rule 9, never trust a 404 as the dead-route signal, but either
  // way this ends up isError, which the card below renders as an honest "unavailable" line rather
  // than fake results (§13).
  const { data: fundamentalsData, isLoading: fundamentalsLoading, isError: fundamentalsError } = useQuery<AdvisorFundamentalsResponse>({
    queryKey: [`/api/trips/${tripId}/advisor/fundamentals`],
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && rightTab === "gaps",
    staleTime: 30 * 1000,
    retry: false,
  });

  const proposeLegsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/transport-legs/generate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/transport-gaps`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/transport-legs`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      toast({ title: "Transport legs proposed", description: "Review them in Transport legs on the canvas." });
    },
    onError: (e: any) => toast({ title: "Couldn't propose transport legs", description: e?.message, variant: "destructive" }),
  });

  const tripExperienceType = workspaceConstraints?.tripExperienceType ?? null;
  // Event coordination is a per-CLIENT engagement (a coordination_states row for a real traveler).
  // An authored build has no traveler yet, so there is nothing to coordinate — assignment-only.
  const isEvent =
    !isAuthoring && ["wedding", "proposal", "corporate", "birthday"].includes(tripExperienceType ?? "");

  // ── Event Coordination (Stage 2) ─────────────────────────────────────
  const { data: eventCoordState } = useQuery<any>({
    queryKey: [`/api/expert/coordination-states`, tripId],
    queryFn: async () => {
      const res = await fetch(`/api/expert/coordination-states/${tripId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tripId && !!workspaceCtx && !isBookingRequest && isEvent,
    staleTime: 60 * 1000,
  });

  const coordinationId = eventCoordState?.id;

  const { data: eventTimeline } = useQuery<any>({
    queryKey: [`/api/coordination-states`, coordinationId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/coordination-states/${coordinationId}/timeline`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!coordinationId,
    staleTime: 60 * 1000,
  });

  const { data: eventVendorGaps } = useQuery<any>({
    queryKey: [`/api/coordination-states`, coordinationId, "vendor-gaps"],
    queryFn: async () => {
      const res = await fetch(`/api/coordination-states/${coordinationId}/vendor-gaps`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!coordinationId,
    staleTime: 60 * 1000,
  });

  const { data: eventCoordFee } = useQuery<any>({
    queryKey: [`/api/coordination-states`, coordinationId, "fee"],
    queryFn: async () => {
      const res = await fetch(`/api/coordination-states/${coordinationId}/fee`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!coordinationId,
    staleTime: 60 * 1000,
  });

  const { data: partnerBookingRequests, isLoading: partnerBookingLoading } = useQuery<any[]>({
    queryKey: ["/api/affiliate-booking-requests/expert"],
    staleTime: 30 * 1000,
  });

  const updateBookingMutation = useMutation({
    // Pass the trip-scoped workspace tripId so confirming a booking logs the
    // booked item onto this Trip (Phase 2.2). The server only logs on confirm and
    // only after the cross-trip guard passes (Phase 2.3).
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/affiliate-booking-requests/${id}`, { status, tripId });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-booking-requests/expert"] });
      if (data?.attachmentBlocked) {
        const why =
          data.attachmentReason === "booking_not_owned_by_trip_traveler"
            ? "This booking belongs to a different traveler than this trip."
            : data.attachmentReason === "expert_not_assigned_to_trip"
              ? "You aren't assigned to this trip."
              : "It could not be linked to this trip.";
        toast({ title: "Confirmed, but not added to this trip", description: why, variant: "destructive" });
      } else {
        toast({ title: "Booking updated" });
      }
    },
  });

  // AI booking copilot — verification leg. Tracks which request card is mid-verify so only that
  // row's button shows a spinner (the mutation object itself is shared across all rows).
  const [verifyingBookingId, setVerifyingBookingId] = useState<string | null>(null);
  const verifyBookingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/affiliate-booking-requests/${id}/verify`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-booking-requests/expert"] });
      if (data?.available === false) {
        const reason =
          data.reason === "verification_unavailable"
            ? "AI verification isn't configured right now."
            : data.reason === "partner_page_unreachable"
              ? "Couldn't reach the partner's page to verify it."
              : "Couldn't verify this request right now.";
        toast({ title: "Not verified", description: reason, variant: "destructive" });
      } else {
        toast({ title: "Verified", description: "The AI checked the partner page — review the result below." });
      }
    },
    onError: (err: any) => {
      const message = String(err?.message ?? "");
      const description = message.startsWith("429:")
        ? "Please wait a bit before re-verifying this request."
        : message.startsWith("409:")
          ? "A verification is already in progress for this request."
          : "Couldn't verify this request right now.";
      toast({ title: "Verification failed", description, variant: "destructive" });
    },
    onSettled: () => setVerifyingBookingId(null),
  });

  const energyCalcRef = useRef(false);
  const energyRecalcInFlight = useRef(false);
  const triggerEnergyRecalc = useCallback(() => {
    // booking_request mode: provider/expert has no assignment yet — skip all trip-scoped writes.
    if (!tripId || isBookingRequest || energyRecalcInFlight.current) return;
    energyRecalcInFlight.current = true;
    apiRequest("POST", `/api/trips/${tripId}/calculate-energy`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .catch(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .finally(() => { energyRecalcInFlight.current = false; });
  }, [tripId, isBookingRequest]);

  useEffect(() => {
    // booking_request mode: no assignment, no trip-scoped writes allowed.
    if (!tripId || isBookingRequest || energyCalcRef.current) return;
    energyCalcRef.current = true;
    apiRequest("POST", `/api/trips/${tripId}/calculate-energy`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .catch(() => {});
  }, [tripId, isBookingRequest]);

  const presetsAppliedRef = useRef(false);
  useEffect(() => {
    if (!tripId || presetsAppliedRef.current) return;
    if (!workspaceConstraints || !trip) return;
    // Gate on trip.start_date being available before deciding
    const startDate = trip?.start_date;
    if (!startDate) return;
    // Already populated — skip if any anchors exist (idempotency guard)
    const hasAnchors = workspaceConstraints.anchors.length > 0;
    if (hasAnchors) { presetsAppliedRef.current = true; return; }
    const slug = workspaceConstraints.tripExperienceType;
    if (!slug) { presetsAppliedRef.current = true; return; }
    // Mark applied only now that we're about to attempt (all guards passed)
    presetsAppliedRef.current = true;
    apiRequest("POST", `/api/trips/${tripId}/generate-presets`, { templateSlug: slug, eventDate: startDate })
      .then(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .catch(() => {});
  }, [tripId, workspaceConstraints, trip]);

  useEffect(() => {
    if (expertNotesData !== undefined && !noteInitialized.current) {
      setNoteText(expertNotesData.expertNotes || "");
      if (expertNotesData.expertNotesUpdatedAt) {
        setLastSavedAt(new Date(expertNotesData.expertNotesUpdatedAt));
      }
      noteInitialized.current = true;
    }
  }, [expertNotesData]);

  useEffect(() => {
    if (plancardForNote !== undefined && !travelerNoteInitialized.current) {
      setTravelerNoteText(plancardForNote.trip?.expertTravelerNote || "");
      travelerNoteInitialized.current = true;
    }
  }, [plancardForNote]);

  // (The destination-geocode map-center query that lived here served only the retired
  // in-drawer browse map; CanvasMapSection keeps its own identical query for its fallback
  // center, so the shared ["/api/geocode", destination] cache entry lives on there.)
  const destination = (trip as any)?.destination || "";

  // ── Browse: live experience search (lives under the Add panel's "Platform services" pill) ──
  // GOOGLE-PLACES-SOURCE-PILL: narrowed to sources=platform (the two sources no longer share one
  // ambiguous surface — Google-sourced results now live only under the "google" pill's own query
  // below). The queryKey carries the "platform" marker so its cache entry never collides with the
  // unfiltered pre-narrowing key or the new google-only key.
  const searchEnabled = rightTab === "add" && addSource === "platform" && !!(debouncedQuery || destination);
  const { data: searchData, isFetching: searchFetching } = useQuery<{ results: any[]; count: number }>({
    queryKey: ["/api/search/experiences", "platform", debouncedQuery, destination, cat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (destination) params.set("destination", destination);
      if (cat && cat !== "all") params.set("category", cat);
      params.set("sources", "platform");
      return fetch(`/api/search/experiences?${params}`).then(r => r.json());
    },
    enabled: searchEnabled,
    staleTime: 2 * 60 * 1000,
  });
  const searchResults = searchData?.results || [];

  // ── Browse: Google Places-only search (the "Google Places" Add-panel pill). Shares the same
  // browseQuery/debouncedQuery/cat state as the platform drawer above (one search box concept,
  // never a duplicated query field) but hits sources=google so results are Google-only — no
  // platform inventory shows up here (that stays the platform pill's job). ──
  const googleSearchEnabled = rightTab === "add" && addSource === "google" && !!(debouncedQuery || destination);
  const { data: googleSearchData, isFetching: googleSearchFetching } = useQuery<{ results: any[]; count: number; placesUnavailable?: boolean }>({
    queryKey: ["/api/search/experiences", "google", debouncedQuery, destination, cat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (destination) params.set("destination", destination);
      if (cat && cat !== "all") params.set("category", cat);
      params.set("sources", "google");
      return fetch(`/api/search/experiences?${params}`).then(r => r.json());
    },
    enabled: googleSearchEnabled,
    staleTime: 2 * 60 * 1000,
  });
  const googleSearchResults = googleSearchData?.results || [];
  // placesUnavailable: the server sets this when the Places API call fails (billing error,
  // quota exhaustion, key misconfiguration) so the client can show an honest notice rather
  // than a silently empty list. It is only present when sources=google was requested.
  const googlePlacesUnavailable = !!(googleSearchData?.placesUnavailable);
  // Per-result "added" state (green check chip) — keyed by placeId (falls back to the result's
  // own id if a placeId is ever absent). Best-effort cross-link: matched against whatever the
  // platform drawer's OWN query currently has cached (may be empty/stale if that drawer was never
  // opened this session — skip cleanly rather than firing a second fetch just for this).
  const [googleAddedDays, setGoogleAddedDays] = useState<Record<string, number>>({});

  // ── Browse: Viator bookable-activities search (the "Viator" Add-panel pill). Shares
  // browseQuery/debouncedQuery/cat with the other drawers (one search-box concept). Sources=viator
  // so the server hits only the Viator arm — no Google or platform results mix in. ──
  const viatorSearchEnabled = rightTab === "add" && addSource === "viator" && !!(debouncedQuery || destination);
  const { data: viatorSearchData, isFetching: viatorSearchFetching } = useQuery<{ results: any[]; count: number }>({
    queryKey: ["/api/search/experiences", "viator", debouncedQuery, destination, cat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (destination) params.set("destination", destination);
      if (cat && cat !== "all") params.set("category", cat);
      params.set("sources", "viator");
      return fetch(`/api/search/experiences?${params}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: viatorSearchEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const viatorSearchResults = viatorSearchData?.results || [];

  // ── Browse: add result to itinerary (day-aware — targets a chosen day, defaulting to the
  // focused day). GOOGLE-PLACES-SOURCE-PILL: generalized from a hardcoded `focusDay` write to an
  // explicit `day` field on the mutation variables so the new Google Places drawer's split-button
  // day picker can target any day (or a brand-new one) — the two pre-existing callsites below now
  // just pass `focusDay` explicitly, so their behavior is byte-identical to before. ──
  const addFromSearchMutation = useMutation({
    mutationFn: async (vars: { result: any; day: number }) => {
      const { result, day } = vars;
      const catToType: Record<string, string> = { dining: "dining", hotel: "hotel", culture: "culture", activity: "activity" };
      // L27-P1: carry through the pin's own coordinates — this is the SAME result.location
      // already used to render the AdvancedMarker above (:~2287), so it is real, not
      // fabricated. `latitude`/`longitude` are decimal DB columns (drizzle-zod validates
      // them as strings, not numbers), so they must be sent as strings. Honestly omitted
      // when absent (today: the /api/search/experiences "platform" arm returns
      // `location: null` — a server-side gap, out of this lane's scope — so only
      // `google_places` results currently carry coordinates here).
      const hasCoords = Number.isFinite(result.location?.lat) && Number.isFinite(result.location?.lng);
      const body = {
        title: result.name,
        itemType: catToType[result.category] || "activity",
        dayNumber: day,
        locationName: result.address || result.name,
        ...(hasCoords ? { latitude: String(result.location.lat), longitude: String(result.location.lng) } : {}),
        // Audit A-4 (§13): Google's priceLevel is a 0-4 band, not a dollar amount — never
        // convert it into an invented cost figure on the itinerary.
        notes: result.mapsUrl ? `Google Maps: ${result.mapsUrl}` : undefined,
        // W-3 task 1: a platform result is REAL bookable inventory — carry the
        // provider_services id exactly as the ServicePickerModal path does
        // (providerServiceId), so the plan item keeps its inventory link. Google
        // Places results stay unlinked — they have no platform inventory (§13 honest).
        ...(result.source === "platform" && result.platformId
          ? { providerServiceId: result.platformId }
          : {}),
        // GOOGLE-PLACES-SOURCE-PILL: carry the Google Place id through when the result actually
        // has one (itinerary_items.google_place_id, shared/schema.ts) — never invented for a
        // platform-sourced result (§13).
        ...(result.source === "google_places" && result.placeId
          ? { googlePlaceId: result.placeId }
          : {}),
      };
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, body);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/commission`] });
      triggerEnergyRecalc();
      toast({ title: "Added to itinerary", description: `${vars.result.name} → Day ${vars.day}` });
      setSelectedPin(null);
    },
    // Plan-approval mode flip (migration 164) — see ItemsEditorPanel's updateMutation above.
    onError: (err: any) => toast({ title: "Failed to add item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" }),
  });

  // ── Coordination status advance (coordinator-side) ──
  const COORD_STATUS_ORDER = [
    "intake", "expert_matching", "vendor_discovery", "itinerary_generation",
    "optimization", "booking_coordination", "confirmed", "in_progress", "completed",
  ] as const;

  const coordStatusLabel: Record<string, string> = {
    intake: "Intake",
    expert_matching: "Expert Matching",
    vendor_discovery: "Vendor Discovery",
    itinerary_generation: "Itinerary Generation",
    optimization: "Optimization",
    booking_coordination: "Booking Coordination",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
  };

  const currentCoordStatus = (eventCoordState?.status ?? "intake") as string;
  const currentCoordIdx = COORD_STATUS_ORDER.indexOf(currentCoordStatus as any);
  const nextCoordStatus = currentCoordIdx >= 0 && currentCoordIdx < COORD_STATUS_ORDER.length - 1
    ? COORD_STATUS_ORDER[currentCoordIdx + 1]
    : null;

  const advanceCoordStatusMutation = useMutation({
    mutationFn: async (targetStatus: string) => {
      const res = await apiRequest("PATCH", `/api/coordination-states/${coordinationId}/status`, {
        status: targetStatus,
        note: `Advanced by coordinator`,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/coordination-states`, tripId] });
      toast({ title: "Status updated", description: "Coordination stage advanced successfully." });
    },
    onError: (e: any) => toast({ title: "Could not advance status", description: e.message, variant: "destructive" }),
  });

  // ── Mutations ──
  const advanceStatusMutation = useMutation({
    mutationFn: async () => {
      if (!assignment?.id) throw new Error("No assignment");
      // Server derives the next status (ruling 25) — client only sends the intent.
      const res = await apiRequest("PATCH", `/api/expert/assignments/${assignment.id}/workspace-status`, { intent: "advance" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/my-assignment`] });
      toast({ title: "Status updated", description: "Workspace status advanced successfully." });
    },
    onError: (e: any) => toast({ title: "Could not update status", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const autoSaveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/expert-notes`, { expertNotes: notes });
      return res.json();
    },
    onSuccess: (data: any) => {
      noteFlushFailedRef.current = false;
      setNoteSaveStatus("saved");
      setLastSavedAt(data?.expertNotesUpdatedAt ? new Date(data.expertNotesUpdatedAt) : new Date());
      const t = setTimeout(() => setNoteSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    },
    onError: () => {
      noteFlushFailedRef.current = true;
      setNoteSaveStatus("idle");
    },
  });

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    setNoteSaveStatus("saving");
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => {
      autoSaveNotesMutation.mutate(text);
    }, 1500);
  };

  useEffect(() => {
    return () => { if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current); };
  }, []);

  // CLAUDE.md §21 — trip-level traveler-facing "Expert Notes" autosave. Mirrors
  // autoSaveNotesMutation/handleNoteChange above exactly (same debounce, same status lifecycle),
  // pointed at the DELIVERED field instead of the private one. Also invalidates the plancard
  // query on success — that's the query PlanCard.tsx itself reads, so a save here is reflected
  // the next time the traveler-facing card refetches, with no separate push needed.
  const autoSaveTravelerNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/expert-traveler-note`, { expertTravelerNote: note || null });
      return res.json();
    },
    onSuccess: () => {
      travelerNoteFlushFailedRef.current = false;
      setTravelerNoteSaveStatus("saved");
      setTravelerNoteLastSavedAt(new Date());
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      const t = setTimeout(() => setTravelerNoteSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    },
    onError: () => {
      travelerNoteFlushFailedRef.current = true;
      setTravelerNoteSaveStatus("idle");
    },
  });

  const handleTravelerNoteChange = (text: string) => {
    setTravelerNoteText(text);
    setTravelerNoteSaveStatus("saving");
    if (travelerNotesDebounceRef.current) clearTimeout(travelerNotesDebounceRef.current);
    travelerNotesDebounceRef.current = setTimeout(() => {
      autoSaveTravelerNoteMutation.mutate(text);
    }, 1500);
  };

  useEffect(() => {
    return () => { if (travelerNotesDebounceRef.current) clearTimeout(travelerNotesDebounceRef.current); };
  }, []);

  // ── beforeunload guard: warn on tab close / refresh while save is pending ──
  // Covers BOTH note fields (private Build notes + the traveler-facing card below) — same guard,
  // widened rather than duplicated.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (noteSaveStatus === "saving" || travelerNoteSaveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [noteSaveStatus, travelerNoteSaveStatus]);

  // ── popstate guard: intercept browser back/forward while save is pending ──
  useEffect(() => {
    if (noteSaveStatus !== "saving" && travelerNoteSaveStatus !== "saving") return;

    const currentPath = window.location.pathname + window.location.search;

    const handlePopState = () => {
      const confirmed = window.confirm("Your notes haven't been saved yet. Leave anyway?");
      if (!confirmed) {
        window.history.pushState(null, "", currentPath);
        setLocation(currentPath);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [noteSaveStatus, travelerNoteSaveStatus]);

  // ── safeNavigate: flush pending note saves before navigating ──
  // Cancels the debounce timer, fires each pending mutation immediately, and awaits all of
  // them. If every flush succeeds, a confirmation toast appears and navigation proceeds.
  // If any flush fails, an error toast appears and navigation is BLOCKED — the expert
  // remains on the page with their unsaved work intact so they can retry or copy it out.
  const safeNavigate = async (path: string) => {
    type FlushResult = { label: string; promise: Promise<unknown> };
    const flushes: FlushResult[] = [];

    // Flush if a save is actively debounced (status === "saving") OR if a previous flush
    // attempt failed (ref === true). The ref persists across renders and navigation clicks,
    // so every subsequent attempt retries until the save succeeds or the expert discards.
    if (noteSaveStatus === "saving" || noteFlushFailedRef.current) {
      if (notesDebounceRef.current) {
        clearTimeout(notesDebounceRef.current);
        notesDebounceRef.current = null;
      }
      flushes.push({ label: "private notes", promise: autoSaveNotesMutation.mutateAsync(noteText) });
    }

    if (travelerNoteSaveStatus === "saving" || travelerNoteFlushFailedRef.current) {
      if (travelerNotesDebounceRef.current) {
        clearTimeout(travelerNotesDebounceRef.current);
        travelerNotesDebounceRef.current = null;
      }
      flushes.push({ label: "traveler notes", promise: autoSaveTravelerNoteMutation.mutateAsync(travelerNoteText) });
    }

    if (flushes.length > 0) {
      const results = await Promise.allSettled(flushes.map((f) => f.promise));
      const failed = flushes.filter((_, i) => results[i].status === "rejected");
      if (failed.length > 0) {
        // refs already set to true in each mutation's onError — next navigation click retries
        toast({
          title: "Could not save notes",
          description: `${failed.map((f) => f.label).join(" and ")} could not be saved. Stay on this page to try again or copy your notes before leaving.`,
          variant: "destructive",
        });
        return; // block navigation — unsaved work must not be silently lost
      }
      // refs cleared to false in each mutation's onSuccess
      toast({ title: "Notes saved", description: "Your notes were saved before leaving." });
    }

    setLocation(path);
  };

  const workspaceStatus = assignment?.workspaceStatus || "draft";
  // Plan-approval mode flip (migration 164): once true, this expert's direct item writes on
  // this trip 409 server-side (see server/utils/plan-approval.ts) — the Client card below
  // reflects that honestly instead of leaving the delivered chip as the only signal.
  const planApproved = assignment?.planApprovalStatus === "approved";
  const days = itineraryData?.days || [];
  const totalItems = itineraryData?.total || 0;

  const anchorConflicts = workspaceConstraints?.anchorConflicts || [];
  const dayBoundaries = workspaceConstraints?.dayBoundaries || [];
  const energyTracking = latestEnergyPerDay(workspaceConstraints?.energyTracking || []);
  const boundaryViolations = workspaceConstraints?.boundaryViolations || [];
  const optimizerScores = workspaceConstraints?.optimizerScores || null;
  const totalConstraintIssues = anchorConflicts.reduce((sum, c) => sum + c.impacts.length, 0) + energyTracking.filter(e => e.recoveryNeeded).length + boundaryViolations.length;

  // Advisor Phase 1 — Routing-blocked card: the real unlocated rows (§13 — never just a count),
  // same isLocatedItem predicate the plan map and the transport-leg engine both use.
  const advisorUnlocatedItems = days.flatMap(d => d.items).filter(i => !isLocatedItem(i));

  // Advisor Phase 1 — Route summary card: trip-scoped legs only (`proposalStatus != null` per
  // the brief — legacy variant-scoped legs carry a NULL proposalStatus and belong to a separate
  // mechanism this card doesn't touch). Distances are the engine's own `distanceMeters` sums —
  // never estimated client-side (§13).
  const advisorTripLegs = (advisorLegsData?.legs ?? []).filter((l) => l.proposalStatus != null);
  const advisorLegMetersByDay: Record<number, number> = {};
  for (const leg of advisorTripLegs) {
    advisorLegMetersByDay[leg.dayNumber] = (advisorLegMetersByDay[leg.dayNumber] ?? 0) + (leg.distanceMeters || 0);
  }
  const advisorLegDays = Object.keys(advisorLegMetersByDay).map(Number).sort((a, b) => a - b);
  const advisorLegTotalMeters = advisorTripLegs.reduce((sum, l) => sum + (l.distanceMeters || 0), 0);

  const isLoading = ctxLoading || (!isAuthoring && !isBookingRequest && (tripsLoading || assignmentLoading));

  // ── Screen 1: workspace home — ONE create action + ONE "Your builds" list (v9 :208-224).
  if (!tripId) {
    const builds = myBuildsData?.builds ?? [];
    type BuildRow = { key: string; title: string; sub: React.ReactNode; open: () => void; sortKey: string; deleteId?: string };
    const rows: BuildRow[] = [
      ...(assignedTrips ?? []).map((t): BuildRow => ({
        key: `trip-${t.trip_id}`,
        title: t.trip_title || t.destination,
        sub: (
          <>
            {t.destination}{t.start_date ? ` · ${formatDate(t.start_date)}` : ""}{" "}
            <StateChip tone="brand">Client — {t.traveler_name || "assigned"}</StateChip>
          </>
        ),
        open: () => setLocation(`/expert/workspace/${t.trip_id}`),
        sortKey: t.assigned_at ?? "",
        // No delete control: assigned-client rows are never author-deletable here.
      })),
      // W-3 task 3: authored lane = the builds endpoint — unshipped builds (no listing)
      // appear too, badged "Draft — not distributed"; shipped ones keep the Store badge
      // from the REAL listing status (§13). One row per trip — no duplicates.
      ...builds.map((b): BuildRow => {
        const chip = b.listingId
          ? (LISTING_CHIP[b.listingStatus ?? ""] ?? { label: `Store — ${b.listingStatus}`, tone: "mut" as ChipTone })
          : { label: "Draft — not distributed", tone: "mut" as ChipTone };
        // Honest duration from the build's own date window (the same window ship-to-store reads).
        const spanMs = b.startDate && b.endDate ? new Date(b.endDate).getTime() - new Date(b.startDate).getTime() : NaN;
        const durationDays = Number.isFinite(spanMs) ? Math.max(1, Math.round(spanMs / 86_400_000) + 1) : null;
        return {
          key: `build-${b.id}`,
          title: b.title || "Untitled build",
          sub: (
            <>
              {/* FIX 6 (QA pass): this is the calendar-span duration (start/end date window — the
                  same figure "Days" on the store listing reads) — kept as the honest ship-to-store
                  number rather than re-derived. It disagreed in wording with the build header's
                  "N items · N days" chip, which counts days that actually HAVE content once items
                  exist — a genuinely different number once a build's content doesn't fill its
                  whole date window. Cheapest honest fix: relabel here ("N-day trip") rather than
                  invent a third derivation or fetch each build's item count just for this list. */}
              {b.destination || "—"}{durationDays ? ` · ${durationDays}-day trip` : ""}{" "}
              <StateChip tone={chip.tone}>{chip.label}</StateChip>
            </>
          ),
          open: () => setLocation(`/expert/workspace/${b.id}`),
          sortKey: b.createdAt ?? "",
          // Delete control: never-shipped drafts (no listing row yet) OR — W2-B — a shipped
          // build whose listing has been WITHDRAWN. The server is the real gate (it also
          // refuses a withdrawn listing that was ever sold, §409 "This build was sold"); this
          // is UI-side scoping so the control isn't offered for a live/pending listing at all.
          deleteId: (!b.listingId || b.listingStatus === "withdrawn") ? b.id : undefined,
        };
      }),
    ].sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));
    const listLoading = tripsLoading || !myBuildsData;

    return (
      <ExpertLayout title="Workspace">
      <div style={{ padding: "40px 24px", maxWidth: 760, margin: "0 auto", fontFamily: "'Inter',-apple-system,sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <PenSquare style={{ width: 24, height: 24, color: BRAND }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: INK, margin: 0 }}>Workstation</h1>
        </div>
        <div style={{ fontSize: 14, color: MID, marginBottom: 22 }}>
          One door in — build first, decide where it ships later.
        </div>

        {/* ONE create action (P1-1). The build is unlabeled at birth; channels attach in Distribute.
            W-4: the destination is set here — it is the location the build's data loads from
            (neighborhoods, platform-services search, format). Blank → the launch-market default. */}
        {/* Item 17: Places autocomplete on the destination text — just the text (the destination
            geocode rail elsewhere in this page already handles centering off it), lat/lng not
            needed here. */}
        <PlacesAutocompleteInput
          value={newBuildDest}
          onChange={setNewBuildDest}
          onPlaceSelected={place => setNewBuildDest(place.text)}
          placeholder="Where is this build for? (default: Kyoto)"
          testId="input-new-build-destination"
          disabled={isEventPlanner}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: INK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 12px", marginBottom: 8, outline: "none", background: CARD }}
        />
        <button
          onClick={() => !isEventPlanner && startBuild.mutate()}
          disabled={startBuild.isPending || isEventPlanner}
          data-testid="button-new-build"
          style={{
            ...btnPrimaryStyle,
            width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 10, fontSize: 14,
            cursor: startBuild.isPending ? "wait" : isEventPlanner ? "not-allowed" : "pointer",
            opacity: isEventPlanner ? 0.55 : 1,
          }}
        >
          <Pencil style={{ width: 16, height: 16, color: BRAND, flexShrink: 0 }} />
          <span>
            {startBuild.isPending ? "Starting your build…" : "New build"}
            <small style={{ display: "block", fontWeight: 400, fontSize: 11.5, color: MID }}>
              Opens a blank build in the Workstation. Decide where it ships later.
            </small>
          </span>
        </button>
        {isEventPlanner && (
          <div style={{ fontSize: 12, color: MID, marginBottom: 8 }} data-testid="text-new-build-gate">
            {STORE_GATE_MESSAGE}
          </div>
        )}
        {startBuild.isError && (
          <div style={{ fontSize: 12.5, color: WARN, marginBottom: 8 }} data-testid="text-new-build-error">
            {(startBuild.error as Error)?.message ?? "Could not start the build."}
          </div>
        )}

        {/* ONE list: client builds and own drafts together, badged by distribution state (P1-2). */}
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MID, margin: "16px 0 8px" }}>
          Your builds
        </div>
        {listLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 12, border: `1px dashed ${LINE}`, fontSize: 13.5, color: MID }} data-testid="text-builds-empty">
            Nothing here yet — start a new build above, or accept a trip assignment.{" "}
            <button onClick={() => setLocation("/expert/inbox?tab=assignments")} data-testid="link-assigned-trips-empty" style={{ color: BRAND, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13.5, fontWeight: 600 }}>
              View Assigned Trips
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {rows.map((r) => (
              <div
                key={r.key}
                onClick={r.open}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") r.open(); }}
                data-testid={`workspace-open-${r.key}`}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${LINE}`, background: CARD,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 650, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </span>
                  <span style={{ fontSize: 11.5, color: MID }}>{r.sub}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {/* W-5/W2-B: never-shipped drafts, or a shipped build whose listing was
                      withdrawn (deleteId is unset for assigned rows and live/pending listings). */}
                  {r.deleteId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${r.title}"? This can't be undone.`)) {
                          deleteBuildMutation.mutate(r.deleteId!);
                        }
                      }}
                      disabled={deleteBuildMutation.isPending}
                      data-testid={`button-delete-build-${r.deleteId}`}
                      title="Delete draft"
                      style={{
                        background: "none", border: "none", padding: 4, display: "flex",
                        alignItems: "center", color: DANGER,
                        cursor: deleteBuildMutation.isPending ? "wait" : "pointer",
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND, whiteSpace: "nowrap" }}>Open →</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Quiet links (v9 :226-228): consolidation targets are struck from here, not re-linked.
            C7: "DMO Library" struck — /expert/dmo-library now redirects here; the library lives
            in the per-build Add panel's DMO drawer (browse/add + review-and-refine). */}
        {!isEventPlanner && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: MID, borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 18 }}>
            {[
              { label: "Store Listings", href: "/expert/ready-made", icon: Store },
            ].map((l) => (
              <button key={l.href} onClick={() => setLocation(l.href)} data-testid={`workspace-link-${l.label.toLowerCase().replace(/\s+/g, "-")}`} style={{ display: "flex", alignItems: "center", gap: 6, color: MID, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12 }}>
                <l.icon style={{ width: 13, height: 13 }} /> {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
      </ExpertLayout>
    );
  }

  if (isLoading) return (
    <ExpertLayout title="Workspace">
      <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, margin: "0 auto" }}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </ExpertLayout>
  );

  if (!trip && !tripsLoading && !ctxLoading) return (
    <ExpertLayout title="Workspace">
      <div style={{ padding: 40, textAlign: "center" }}>
        <Users style={{ width: 48, height: 48, color: FAINT, margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 18, fontWeight: 600, color: INK, margin: "0 0 8px" }}>Build not found</h1>
        <div style={{ fontSize: 14, color: MID, marginBottom: 20 }}>This trip isn't assigned to you, you didn't author it, or it no longer exists.</div>
        <button onClick={() => safeNavigate("/expert/workspace")} data-testid="button-back-workspace-home" style={{ ...btnPrimaryStyle, padding: "8px 20px", fontSize: 14 }}>Back to Workstation</button>
      </div>
    </ExpertLayout>
  );

  // Booking-request mode: the provider has an active booking on this trip but is not yet an
  // assigned advisor. Show a scoped landing view — no itinerary/notes/plancard data is fetched
  // (those queries are disabled above); all information here comes solely from workspace-context.
  if (isBookingRequest && trip) {
    const brTitle = trip.trip_title || trip.destination || `Trip ${tripId}`;
    const brDest  = trip.destination || "";
    return (
      <ExpertLayout title="Booking Request">
        <div style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: BRAND_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Briefcase style={{ width: 22, height: 22, color: BRAND }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: INK }}>{brTitle}</div>
                {brDest && <div style={{ fontSize: 13, color: MID, marginTop: 2 }}>{brDest}</div>}
              </div>
            </div>
            <div style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: MID, lineHeight: 1.6 }}>
              A traveler has sent you a booking request for this trip. Review and respond in your bookings dashboard.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                data-testid="button-booking-request-go-to-bookings"
                onClick={() => safeNavigate("/expert/bookings")}
                style={{ ...btnPrimaryStyle, flex: 1, padding: "9px 16px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
              >
                <Briefcase style={{ width: 15, height: 15 }} />
                Review Booking Request
              </button>
              <button
                data-testid="button-booking-request-back"
                onClick={() => safeNavigate("/expert/workspace")}
                style={{ ...btnQuietStyle, padding: "9px 16px", fontSize: 14 }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </ExpertLayout>
    );
  }

  const tripTitle = trip?.trip_title || trip?.destination || `Trip ${tripId}`;
  const travelerCode = trip?.trip_id?.slice(-6)?.toUpperCase() || "??????";
  const travelerName = trip?.traveler_name || "Client";
  const travelerInitials = travelerName.charAt(0).toUpperCase() + (travelerName.split(" ")[1]?.[0] || "").toUpperCase();

  // F1: the canvas consumes the format registry. client:default resolves to today's PlanCard
  // day-list — zero visual change from the registry itself.
  const buildFormat = resolveFormat("client", tripExperienceType, trip?.destination ?? null);

  // Day numbers for the day-focus control (P2-13). Fall back to the build's declared duration
  // (authoring) or a 7-day scaffold before any items exist — same fallback the old selects used.
  const dayNumbers: number[] = days.length > 0
    ? days.map(d => d.dayNumber)
    : Array.from({ length: (isAuthoring && (listing as any)?.durationDays) ? (listing as any).durationDays : 7 }, (_, i) => i + 1);

  // A-1 (Workstation audit): "+ Day" affordance. The day-focus row only renders a button per
  // EXISTING day_number, so a fresh 1-day build has no way to target Day 2 — a day exists in
  // the data model the moment an item is added with that dayNumber (no server change). Track
  // the highest day the expert can target locally, seeded from (and never allowed to fall
  // below) the highest real day, and merge it into the rendered range.
  const existingMaxDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 1;
  const maxDay = Math.max(extraMaxDay, existingMaxDay);
  const displayDayNumbers: number[] = Array.from(
    new Set([...dayNumbers, ...Array.from({ length: maxDay }, (_, i) => i + 1)]),
  ).sort((a, b) => a - b);

  // ── Distribution-state chips (P2-9): derived from REAL state only (§13) ──
  const distChips: Array<{ label: string; tone: ChipTone; testId: string }> = [];
  if (isAuthoring) {
    if (listing) {
      const chip = LISTING_CHIP[(listing as any).status] ?? { label: `Store — ${(listing as any).status}`, tone: "mut" as ChipTone };
      distChips.push({ label: chip.label, tone: chip.tone, testId: "chip-dist-store" });
    } else {
      distChips.push({ label: "Draft — not distributed", tone: "mut", testId: "chip-dist-draft" });
    }
    distChips.push({ label: "Client — not attached", tone: "mut", testId: "chip-dist-client" });
    if (directLink) distChips.push({ label: "Booking link — ready", tone: "mut", testId: "chip-dist-direct" });
  } else {
    distChips.push({ label: `Client — ${identityRevealed ? travelerName : `#${travelerCode}`}`, tone: "brand", testId: "chip-dist-client" });
    const stepIdx = STEPS.findIndex(s => s.key === workspaceStatus);
    if (stepIdx >= 0) distChips.push({ label: STEPS[stepIdx].label, tone: workspaceStatus === "delivered" ? "ok" : "mut", testId: "chip-dist-delivery" });
  }

  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === tripTitle) return;
    // W-3 task 4: with a listing → PATCH the listing (it syncs the trip title server-side);
    // without one → the build-only rename endpoint. Picked by whether the listing exists.
    if (listing?.id) renameListingMutation.mutate(next);
    else renameBuildMutation.mutate({ title: next });
  };

  // W-4: commit an authoring build's destination — the location the data loads from.
  const commitDestination = () => {
    setEditingDest(false);
    const next = destDraft.trim();
    if (!next || next === (trip?.destination ?? "")) return;
    renameBuildMutation.mutate({ destination: next });
  };

  const sectionLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 };
  const chanCardStyle: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 };
  const chanHeadStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 6, background: GROUND };

  return (
    <ExpertLayout title="Workspace">
    {/* Sized against the shell's 52px sticky header so the builder owns its own scrolling
        (internal panes scroll; the shell's <main> never double-scrolls). */}
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", background: GROUND, overflow: "hidden" }}>
      {bookingBrief && tripId && (
        <BookingBriefModal
          provider={bookingBrief.provider}
          bookingUrl={bookingBrief.bookingUrl}
          tripId={tripId}
          onClose={() => setBookingBrief(null)}
          onConfirmed={(provider) => {
            const key = normalizeProvider(provider);
            setConfirmedProviders(prev => {
              const s = new Set(prev);
              s.add(key);
              if (tripId) writeConfirmedToSession(tripId, s);
              return s;
            });
          }}
        />
      )}
      {servicePickerOpen && tripId && (
        <ServicePickerModal tripId={tripId} dayNumber={focusDay} destination={trip?.destination || ""} onClose={() => setServicePickerOpen(false)} onAdded={triggerEnergyRecalc} />
      )}

      {/* ── One slim builder bar (.bld-top, v9 :248-253): back · title · distribution chips ── */}
      <header style={{ background: CARD, borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", flexWrap: "wrap", flexShrink: 0 }}>
        <button onClick={() => safeNavigate("/expert/workspace")} data-testid="button-back-workspace" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: MID, padding: 2 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </button>

        {editingTitle ? (
          <input
            value={titleDraft}
            autoFocus
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            data-testid="input-build-title"
            style={{ fontSize: 15, fontWeight: 750, color: INK, border: `1.5px solid ${LINE}`, borderRadius: 8, padding: "3px 8px", outline: "none", background: CARD, minWidth: 180 }}
          />
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 750, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="text-build-title">{tripTitle}</span>
            {isAuthoring && (
              <button onClick={() => { setTitleDraft(tripTitle); setEditingTitle(true); }} data-testid="button-edit-title" title="Rename build" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, display: "flex", padding: 2 }}>
                {(renameListingMutation.isPending || renameBuildMutation.isPending) ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Pencil style={{ width: 12, height: 12 }} />}
              </button>
            )}
          </span>
        )}

        {/* Trip facts as header chips (P2-7/8: the left rail folds away).
            W-4: the destination is EDITABLE for authored builds — it is the location the data
            loads from (neighborhood grouping, platform-services search, format resolution all
            derive from trip.destination and recompute when the context query invalidates).
            Assignment trips keep it read-only (the destination belongs to the traveler). */}
        {editingDest ? (
          // Workstation improvement (Aug 9 2026): same Places typeahead the landing page's
          // new-build destination field already has — text-only (the destination geocode rail
          // elsewhere handles centering off it). Commit-on-blur is safe with the dropdown: a
          // suggestion click uses onMouseDown preventDefault, so picking never blurs mid-pick.
          <div style={{ width: 180 }}>
            <PlacesAutocompleteInput
              value={destDraft}
              autoFocus
              onChange={setDestDraft}
              onPlaceSelected={place => setDestDraft(place.text)}
              onBlur={commitDestination}
              onKeyDown={e => { if (e.key === "Enter") commitDestination(); if (e.key === "Escape") setEditingDest(false); }}
              testId="input-build-destination"
              placeholder="Destination city"
              style={{ fontSize: 12, color: INK, border: `1.5px solid ${LINE}`, borderRadius: 999, padding: "2px 10px", outline: "none", background: CARD, width: "100%", boxSizing: "border-box" }}
            />
          </div>
        ) : trip?.destination ? (
          isAuthoring ? (
            <button
              onClick={() => { setDestDraft(trip.destination || ""); setEditingDest(true); }}
              data-testid="chip-build-destination"
              title="Change destination — the build's data loads from this location"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <StateChip tone="mut"><MapPin style={{ width: 9, height: 9 }} /> {trip.destination} <Pencil style={{ width: 8, height: 8 }} /></StateChip>
            </button>
          ) : (
            <StateChip tone="mut" testId="chip-build-destination"><MapPin style={{ width: 9, height: 9 }} /> {trip.destination}</StateChip>
          )
        ) : isAuthoring ? (
          <button
            onClick={() => { setDestDraft(""); setEditingDest(true); }}
            data-testid="chip-build-destination"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <StateChip tone="warn"><MapPin style={{ width: 9, height: 9 }} /> Set destination</StateChip>
          </button>
        ) : null}
        {/* Day count — the itinerary day list (days.length) is the ONE source of truth once real
            items exist (matches the store listing's Days field, the social caption, and the story
            slide — was "3 days" here vs "2 items · 2 days" below, two sources disagreeing). Before
            any items exist there's no itinerary to conflict with, so the authored pre-planning
            duration is shown instead. The assignment (non-authoring) path shows the real date
            RANGE, never a converted "N days" figure that could contradict the items chip. */}
        {isAuthoring ? (
          totalItems === 0 && (listing as any)?.durationDays
            ? <StateChip tone="mut" testId="chip-build-duration">{(listing as any).durationDays} days</StateChip>
            : null
        ) : (
          trip?.start_date ? <StateChip tone="mut" testId="chip-build-dates">{formatDate(trip.start_date)} – {formatDate(trip.end_date)}</StateChip> : null
        )}
        {totalItems > 0 && <StateChip tone="mut" testId="chip-build-items">{totalItems} items · {days.length} days</StateChip>}

        {/* Distribution chips — real channel state (P2-9) */}
        {distChips.map(c => <StateChip key={c.testId} tone={c.tone} testId={c.testId}>{c.label}</StateChip>)}

        {/* Client-privacy reveal (assignment only) */}
        {!isAuthoring && (
          <button onClick={() => setIdentityRevealed(!identityRevealed)} data-testid="button-reveal-identity" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, padding: 0, color: FAINT, fontSize: 10.5, fontWeight: 600 }}>
            {identityRevealed ? <><EyeOff style={{ width: 12, height: 12 }} /> Hide</> : <><Eye style={{ width: 12, height: 12 }} /> Reveal</>}
          </button>
        )}
      </header>

      {/* ── Body: TWO columns — canvas left, panel right (v9 .bld :114) ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Canvas: the canvas IS the itinerary (P2-18) ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "14px 16px", minWidth: 0 }}>
          {itemsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ background: CARD, borderRadius: 12, border: `1px solid ${LINE}`, padding: 16, height: 100 }}><Skeleton className="h-full w-full" /></div>)}
            </div>
          ) : days.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <FileText style={{ width: 40, height: 40, color: FAINT, margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginBottom: 8 }}>No itinerary items yet</div>
              <div style={{ fontSize: 13, color: MID, marginBottom: 20 }}>Build the itinerary from the Add panel — DMO places, platform services, or your own items.</div>
              {/* FIX 3 (QA pass): the Add panel's default source pill is already "dmo" (line ~1160) —
                  this CTA used to override that to "custom" (the hand-entry form), pushing every
                  first-time builder past the platform's DMO catalog. Just open the panel; let the
                  existing default stand. */}
              <button onClick={() => { setRightTab("add"); setAddSource("dmo"); }} data-testid="button-add-first-item" style={{ ...btnPrimaryStyle, padding: "9px 20px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus style={{ width: 14, height: 14 }} /> Add your first item
              </button>
            </div>
          ) : (
            <>
              {/* Item 16 (plan layer) + item 19 (discovery layer, ratified) — the plan map.
                  Sits above the day list per the punch-list spec. */}
              {tripId && (
                <CanvasMapSection
                  tripId={tripId}
                  days={days}
                  destination={destination}
                  onGoToItem={(itemId) => setFocusItemId(itemId)}
                  discoveryDayNumber={focusDay}
                  focusFromListId={mapFocusItemId}
                  onListFocusHandled={() => setMapFocusItemId(null)}
                />
              )}

              {/* F1: the format registry picks the structure; client:default = the existing
                  PlanCard day-list, rendered exactly as before. */}
              {buildFormat.grouping === "days" && trip && (
                <PlanCard
                  trip={{
                    id: tripId!,
                    destination: trip.destination,
                    title: trip.trip_title,
                    startDate: trip.start_date,
                    endDate: trip.end_date,
                    numberOfTravelers: (trip as any).number_of_travelers ?? 1,
                  }}
                  role="expert"
                  stage="full"
                  embedded
                />
              )}

              {/* F2: the non-days client-channel structures (client:kyoto-cultural neighborhoods,
                  client:kyoto-wedding / client:event venue-timeline). ClientFormatView's quiet
                  "Day list" toggle re-renders the same PlanCard embedded block above, so the
                  expert keeps PlanCard's item controls for editing (Structure is the default). */}
              {buildFormat.grouping !== "days" && trip && (
                <ClientFormatView
                  format={buildFormat}
                  destination={trip.destination || null}
                  days={days}
                  bestSeason={listing?.bestSeason ?? null}
                  dayListView={
                    <PlanCard
                      trip={{
                        id: tripId!,
                        destination: trip.destination,
                        title: trip.trip_title,
                        startDate: trip.start_date,
                        endDate: trip.end_date,
                        numberOfTravelers: (trip as any).number_of_travelers ?? 1,
                      }}
                      role="expert"
                      stage="full"
                      embedded
                    />
                  }
                />
              )}

              {/* Cost footer — real item costs only (the earnings surfaces live in /expert/money, P2-15) */}
              {totalItems > 0 && (
                <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${LINE}`, padding: "10px 14px", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {[
                      { l: buildFormat.vocabulary.activityLabel, v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "activity" || i.itemType === "culture").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                      { l: "Dining", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "dining" || i.itemType === "food").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                      { l: buildFormat.vocabulary.transportLabel, v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "transport").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                      { l: "Hotels", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "hotel" || i.itemType === "accommodation").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                    ].map(s => (
                      <div key={s.l}><div style={{ fontSize: 10, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div><div style={{ fontSize: 13, fontWeight: 700, color: INK }}>${s.v.toLocaleString()}</div></div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: FAINT, fontWeight: 600, textTransform: "uppercase" }}>Total Est.</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>
                      ${days.reduce((s, d) => s + d.items.reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {/* A-2 / C-1b (Workstation audit): day-move + expert-note editor for existing items. */}
              {tripId && (
                <ItemsEditorPanel
                  tripId={tripId}
                  days={days}
                  maxDay={maxDay}
                  destination={destination}
                  onDayMoved={triggerEnergyRecalc}
                  onOpenBookingBrief={(network) => handleOpenBookingBrief(network, resolvePartnerBookingUrl(network))}
                  confirmedProviders={confirmedProviders}
                  onConfirmedProvider={(provider) => {
                    const key = normalizeProvider(provider);
                    setConfirmedProviders(prev => {
                      const s = new Set(prev);
                      s.add(key);
                      if (tripId) writeConfirmedToSession(tripId, s);
                      return s;
                    });
                  }}
                  resolveBookingUrl={resolvePartnerBookingUrl}
                  focusItemId={focusItemId}
                  onFocusHandled={() => setFocusItemId(null)}
                  onSelectItem={(itemId) => setMapFocusItemId(itemId)}
                  suggestOrderForDay={suggestOrderForDay}
                  onSuggestHandled={() => setSuggestOrderForDay(null)}
                />
              )}

              {/* L4b (docs/briefs/L4-transport-legs.md): the between-stops transport editor. */}
              {tripId && <TransportLegsPanel tripId={tripId} days={days} />}
            </>
          )}
        </main>

        {/* ── Right Panel: Add · AI Gaps · Distribute (v9 :264) ── */}
        <aside style={{ width: 380, background: CARD, borderLeft: `1px solid ${LINE}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ borderBottom: `1px solid ${LINE}`, padding: "0 10px", display: "flex", gap: 2, flexShrink: 0 }}>
            {[
              { k: "add", l: "Add" },
              // Advisor Phase 1: visible label only — the "gaps" key/testids are untouched below
              // so every existing consumer (tab-right-gaps, the AI Gaps section content, etc.)
              // stays exactly as it was.
              { k: "gaps", l: totalConstraintIssues > 0 ? `Advisor (${totalConstraintIssues})` : "Advisor" },
              { k: "distribute", l: "Distribute" },
            ].map(t => (
              <button key={t.k} onClick={() => setRightTab(t.k)} data-testid={`tab-right-${t.k}`} style={{ padding: "10px 10px 8px", fontSize: 12, fontWeight: 650, cursor: "pointer", background: "none", border: "none", borderBottom: rightTab === t.k ? `2px solid ${BRAND}` : "2px solid transparent", color: rightTab === t.k ? INK : MID, whiteSpace: "nowrap" }}>{t.l}</button>
            ))}
          </div>

          {/* ── Add panel: seven source pills (§17 Central Content network). D1 (UX audit Jul
              29): the row used to sit in a horizontal-scroll container with no scroll
              affordance — at 1440px only 3 of 7 pills were visible, so My services/Custom/
              Transport were effectively undiscoverable. Fix: the row WRAPS instead of
              scrolling (every pill always visible, no hidden overflow) and each pill carries
              a one-line "what is this" caption below the row instead of a hover-only title
              tooltip. Not-yet-built sources stay honestly labeled (§13 "coming soon", the
              same pattern as the EA-console gate) but are now CLICKABLE — clicking shows the
              real explanation inline instead of a disabled nub with no feedback. */}
          {rightTab === "add" && (
            <>
              <div style={{ padding: "8px 10px 4px", display: "flex", flexWrap: "wrap", gap: 5, flexShrink: 0 }}>
                {ADD_SOURCES.map(s => (
                  <button
                    key={s.k}
                    onClick={() => setAddSource(s.k)}
                    // GOOGLE-PLACES-SOURCE-PILL: the mockup names this pill's testid
                    // `button-add-source-google` specifically — every other pill keeps the
                    // pre-existing `pill-add-<key>` convention untouched.
                    data-testid={s.k === "google" ? "button-add-source-google" : `pill-add-${s.k}`}
                    style={{
                      padding: "4px 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: "pointer", opacity: s.comingSoon && addSource !== s.k ? 0.6 : 1,
                      border: addSource === s.k ? `1px solid ${BRAND}` : s.comingSoon ? `1px dashed ${LINE}` : `1px solid ${LINE}`,
                      background: addSource === s.k ? BRAND : CARD,
                      color: addSource === s.k ? CARD : MID,
                    }}
                  >
                    {s.l}{s.comingSoon ? " · Soon" : ""}
                  </button>
                ))}
              </div>
              <div style={{ padding: "0 10px 8px", fontSize: 11, color: FAINT, flexShrink: 0 }}>
                {ADD_SOURCES.find(s => s.k === addSource)?.caption}
              </div>

              {/* Day-focus control (P2-13): every add row below targets this day. */}
              <div style={{ padding: "0 10px 8px", borderBottom: `1px solid ${LINE}`, display: "flex", gap: 5, overflowX: "auto", flexShrink: 0, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: MID, fontWeight: 600, flexShrink: 0 }}>Adding to</span>
                {displayDayNumbers.map(n => (
                  <button
                    key={n}
                    onClick={() => setFocusDay(n)}
                    data-testid={`button-focus-day-${n}`}
                    style={{
                      padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 650, whiteSpace: "nowrap", cursor: "pointer",
                      border: focusDay === n ? `1px solid ${BRAND}` : `1px dashed ${LINE}`,
                      background: focusDay === n ? BRAND_SOFT : "transparent",
                      color: focusDay === n ? BRAND : MID,
                    }}
                  >
                    Day {n}
                  </button>
                ))}
                {/* A-1 (Workstation audit): extend the selectable range by one day, client-side —
                    a day exists in the data model the moment an item lands with that dayNumber. */}
                <button
                  onClick={() => { const next = maxDay + 1; setExtraMaxDay(next); setFocusDay(next); if (tripId) writeExtraMaxDay(tripId, next); }}
                  data-testid="button-add-day"
                  style={{
                    padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 650, whiteSpace: "nowrap", cursor: "pointer",
                    border: `1px dashed ${LINE}`, background: "transparent", color: MID,
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >
                  <Plus style={{ width: 10, height: 10 }} /> Day
                </button>
              </div>
            </>
          )}

          {/* Add · Platform content — W1-A: the shared content_registry library, embedded
              (same fetch + same write as every other Add-panel source). */}
          {rightTab === "add" && addSource === "content" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
              <PlatformContentPickerCore tripId={tripId!} destination={destination} dayNumber={focusDay} onAdded={triggerEnergyRecalc} />
            </div>
          )}

          {/* Add · My services — W1-A: the expert's own approved+active listings, embedded. */}
          {rightTab === "add" && addSource === "mine" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
              <MyServicesPickerCore tripId={tripId!} dayNumber={focusDay} onAdded={triggerEnergyRecalc} />
            </div>
          )}

          {/* Add · DMO Library — the picker's core, embedded (same fetch + same write). */}
          {rightTab === "add" && addSource === "dmo" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
              <DmoPickerCore tripId={tripId!} dayNumber={focusDay} maxDay={maxDay} onAdded={triggerEnergyRecalc} />
            </div>
          )}

          {/* Add · Custom — the add-item form, inline; day-aware. */}
          {rightTab === "add" && addSource === "custom" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
              <InlineAddItemForm tripId={tripId!} dayNumber={focusDay} destination={destination} onAdded={triggerEnergyRecalc} />
            </div>
          )}

          {/* Add · Platform services — map browse (the ONLY map surface, P2-18) + the
               approved-catalog picker. Both write through POST /api/trips/:tripId/itinerary-items. */}
          {rightTab === "add" && addSource === "platform" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Item 19 — publish this SAME search+category-filtered `searchResults` list (the
                  exact set already rendered as pins on this drawer's OWN local browse map below)
                  as candidate pins for the canvas map's discovery layer too. */}
              <MapCandidatesPublisher
                source="platform"
                sourceLabel="Platform services"
                items={searchResults
                  .filter((r: any) => Number.isFinite(r.location?.lat) && Number.isFinite(r.location?.lng))
                  .map((r: any) => ({ id: r.id, title: r.name, lat: r.location.lat, lng: r.location.lng, price: r.priceLabel ?? null }))}
                onAdd={(id) => {
                  const result = searchResults.find((r: any) => r.id === id);
                  if (result) addFromSearchMutation.mutate({ result, day: focusDay });
                }}
              />

              {/* Search bar + category chips */}
              <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${LINE}`, background: CARD, flexShrink: 0 }}>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: FAINT, pointerEvents: "none" }} />
                  <input
                    value={browseQuery}
                    onChange={e => setBrowseQuery(e.target.value)}
                    placeholder={`Search in ${destination || "destination"}…`}
                    data-testid="input-browse-search"
                    style={{ width: "100%", paddingLeft: 30, paddingRight: searchFetching ? 30 : 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${LINE}`, fontSize: 13, outline: "none", boxSizing: "border-box", background: GROUND, color: INK }}
                  />
                  {searchFetching && <Loader2 style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: FAINT }} className="animate-spin" />}
                </div>
                <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
                  {[{ k: "all", l: "All" }, { k: "dining", l: "Dining" }, { k: "activities", l: "Activities" }, { k: "hotels", l: "Hotels" }].map(c => (
                    <Chip key={c.k} active={cat === c.k} onClick={() => { setCat(c.k); setSelectedPin(null); }}>{c.l}</Chip>
                  ))}
                  <button onClick={() => setServicePickerOpen(true)} data-testid="button-open-service-picker" style={{ ...btnQuietStyle, marginLeft: "auto", padding: "4px 10px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                    <Store style={{ width: 11, height: 11 }} /> Service catalog
                  </button>
                </div>
              </div>

              {/* RETIRED (decision-maker, Aug 9 2026): the in-drawer browse map that lived here
                  (P2-18 "lives ONLY here") is gone — superseded by the canvas Plan map's
                  discovery layer (item 19): MapCandidatesPublisher above already renders this
                  SAME filtered result set as candidate pins on the ONE canvas map, so two maps
                  were showing identical pins. The list below plus the canvas pins are the whole
                  browse surface now. `selectedPin` survives as the list's row-highlight state. */}

              {/* Results list — day-aware add rows ("+ Day N", v9 :277-292) */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {searchFetching && searchResults.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 56, borderRadius: 8, background: GROUND }}><Skeleton className="h-full w-full rounded-lg" /></div>)}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: MID }}>
                    <Search style={{ width: 28, height: 28, color: FAINT, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      {destination ? `Showing ${destination}` : "Type to search"}
                    </div>
                    <div style={{ fontSize: 11, color: FAINT }}>Try "ramen", "temple", "rooftop bar"</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 2 }}>
                      {searchResults.length} results
                    </div>
                    {searchResults.map((result: any) => {
                      const isSelected = selectedPin?.id === result.id;
                      return (
                        <div
                          key={result.id}
                          data-testid={`card-search-result-${result.id}`}
                          onClick={() => setSelectedPin(isSelected ? null : result)}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px", borderRadius: 9, border: isSelected ? `1.5px solid ${BRAND}` : `1px solid ${LINE}`, background: isSelected ? BRAND_SOFT : CARD, marginBottom: 6, cursor: "pointer", transition: "border-color 0.15s" }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 7, background: result.photoUrl ? "transparent" : GROUND, border: result.photoUrl ? "none" : `1px solid ${LINE}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {result.photoUrl ? <img src={result.photoUrl} alt={result.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MapPin style={{ width: 14, height: 14, color: FAINT }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                              <span style={{ fontSize: 10, color: MID, fontWeight: 600, textTransform: "capitalize" }}>{result.category}</span>
                              {result.rating && <><span style={{ color: FAINT, fontSize: 10 }}>·</span><span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: WARN }}><Star style={{ width: 9, height: 9 }} />{result.rating}</span></>}
                              {result.priceLabel && <><span style={{ color: FAINT, fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: MID }}>{result.priceLabel}</span></>}
                              {result.source === "platform" && <StateChip tone="brand">Platform</StateChip>}
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); addFromSearchMutation.mutate({ result, day: focusDay }); }}
                            disabled={addFromSearchMutation.isPending}
                            data-testid={`button-add-result-${result.id}`}
                            style={{ padding: "4px 10px", borderRadius: 8, background: BRAND_SOFT, color: BRAND, border: `1px solid ${BRAND}`, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                          >
                            + Day {focusDay}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${LINE}`, padding: "5px 12px", textAlign: "center", flexShrink: 0 }}>
                {/* W-3 task 2: Google attribution stays (TOS), but the catalog is Traveloure's —
                    only the supplemental places results are Google's. */}
                <span style={{ fontSize: 10, color: FAINT }}>Traveloure platform catalog · Places results powered by Google</span>
              </div>
            </div>
          )}

          {/* Add · Google Places — GOOGLE-PLACES-SOURCE-PILL (approved mockup): a Google-only
              live search (sources=google — no platform inventory shows here, that's the Platform
              services pill's job). Writes through the SAME addFromSearchMutation the platform
              drawer uses, extended with googlePlaceId when the server result carries one. */}
          {rightTab === "add" && addSource === "google" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Item 19 discovery layer — its own "google-places" source key so the two drawers'
                  candidate pins never collide (ADD_SOURCES is single-select — only one drawer, and
                  so only one publisher, is ever mounted at a time). */}
              <MapCandidatesPublisher
                source="google-places"
                sourceLabel="Google Places"
                items={googleSearchResults
                  .filter((r: any) => Number.isFinite(r.location?.lat) && Number.isFinite(r.location?.lng))
                  .map((r: any) => ({ id: r.id, title: r.name, lat: r.location.lat, lng: r.location.lng, price: r.priceLabel ?? null }))}
                onAdd={(id) => {
                  const result = googleSearchResults.find((r: any) => r.id === id);
                  if (!result) return;
                  const placeKey = result.placeId ?? result.id;
                  addFromSearchMutation.mutate({ result, day: focusDay }, {
                    onSuccess: () => setGoogleAddedDays(prev => ({ ...prev, [placeKey]: focusDay })),
                  });
                }}
              />

              {/* Search bar + category chips — shares browseQuery/debouncedQuery/cat with the
                  platform drawer (one search-box concept), sources=google underneath. */}
              <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${LINE}`, background: CARD, flexShrink: 0 }}>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: FAINT, pointerEvents: "none" }} />
                  <input
                    value={browseQuery}
                    onChange={e => setBrowseQuery(e.target.value)}
                    placeholder={`Search Google Places in ${destination || "destination"}…`}
                    data-testid="input-browse-search-google"
                    style={{ width: "100%", paddingLeft: 30, paddingRight: googleSearchFetching ? 30 : 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${LINE}`, fontSize: 13, outline: "none", boxSizing: "border-box", background: GROUND, color: INK }}
                  />
                  {googleSearchFetching && <Loader2 style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: FAINT }} className="animate-spin" />}
                </div>
                <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
                  {[{ k: "all", l: "All" }, { k: "dining", l: "Dining" }, { k: "activities", l: "Activities" }, { k: "hotels", l: "Hotels" }].map(c => (
                    <Chip key={c.k} active={cat === c.k} onClick={() => setCat(c.k)}>{c.l}</Chip>
                  ))}
                </div>
              </div>

              {/* Results list — approved mockup card shape: photo thumb, name, neutral "Google"
                  badge, rating/price-band/category line, address, split-button add. */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {googleSearchFetching && googleSearchResults.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ height: 72, borderRadius: 8, background: GROUND }}><Skeleton className="h-full w-full rounded-lg" /></div>)}
                  </div>
                ) : googlePlacesUnavailable ? (
                  <div data-testid="notice-places-unavailable" style={{ textAlign: "center", padding: "24px 16px", color: MID }}>
                    <MapPin style={{ width: 28, height: 28, color: FAINT, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: INK }}>
                      External results unavailable
                    </div>
                    <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.5 }}>
                      Google Places couldn't be reached right now. Platform and Viator results are still available on the other tabs.
                    </div>
                  </div>
                ) : googleSearchResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: MID }}>
                    <Search style={{ width: 28, height: 28, color: FAINT, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      {destination ? `Showing ${destination}` : "Type to search"}
                    </div>
                    <div style={{ fontSize: 11, color: FAINT }}>Try "ramen", "temple", "rooftop bar"</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 2 }}>
                      {googleSearchResults.length} results
                    </div>
                    {googleSearchResults.map((result: any) => {
                      const placeKey = result.placeId ?? result.id;
                      const addedDay = googleAddedDays[placeKey];
                      // Best-effort cross-link: reads whatever the platform drawer's OWN query
                      // already has cached (react-query keeps it around after that drawer closes,
                      // for as long as its cache entry survives) — never fires a second fetch just
                      // for this chip; when nothing is cached yet, this simply finds nothing (§13
                      // "skip cleanly").
                      const crossLinkedPlatform = searchResults.find((p: any) => p.source === "platform" && namesMatch(p.name, result.name));
                      return (
                        <div
                          key={result.id}
                          data-testid={`card-gplace-${placeKey}`}
                          style={{ display: "flex", flexDirection: "column", gap: 6, padding: 9, borderRadius: 9, border: `1px solid ${LINE}`, background: CARD, marginBottom: 7 }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 7, background: result.photoUrl ? "transparent" : GROUND, border: result.photoUrl ? "none" : `1px solid ${LINE}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {result.photoUrl ? <img src={result.photoUrl} alt={result.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MapPin style={{ width: 16, height: 16, color: FAINT }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.name}</span>
                                <StateChip tone="mut">Google</StateChip>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 10.5, color: MID, flexWrap: "wrap" }}>
                                {result.rating != null && (
                                  <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <Star style={{ width: 9, height: 9, color: WARN }} />
                                    {result.rating}{result.reviewCount != null && ` (${result.reviewCount.toLocaleString()})`}
                                  </span>
                                )}
                                {result.rating != null && result.priceLabel && <span style={{ color: FAINT }}>·</span>}
                                {/* Google's priceLevel (0-4) surfaces ONLY as its $ band (priceLabel,
                                    already server-derived) — never converted into an invented
                                    dollar figure here (§13). */}
                                {result.priceLabel && <span>{result.priceLabel}</span>}
                                {(result.rating != null || result.priceLabel) && result.category && <span style={{ color: FAINT }}>·</span>}
                                {result.category && <span style={{ textTransform: "capitalize" }}>{result.category}</span>}
                              </div>
                              {result.address && (
                                <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.address}</div>
                              )}
                            </div>
                            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                              {addedDay != null ? (
                                <span
                                  data-testid={`button-add-gplace-${placeKey}`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 8, background: OK_SOFT, color: OK, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}
                                >
                                  <CheckCircle style={{ width: 11, height: 11 }} /> Day {addedDay}
                                </span>
                              ) : (
                                <GooglePlaceSplitButton
                                  placeKey={placeKey}
                                  focusDay={focusDay}
                                  maxDay={maxDay}
                                  pending={addFromSearchMutation.isPending}
                                  onPick={(day) => {
                                    // Mirrors the existing "+ Day" affordance (A-1, Workstation
                                    // audit): picking "+ New day" extends the selectable range.
                                    if (day > maxDay) {
                                      setExtraMaxDay(day);
                                      if (tripId) writeExtraMaxDay(tripId, day);
                                    }
                                    addFromSearchMutation.mutate({ result, day }, {
                                      onSuccess: () => setGoogleAddedDays(prev => ({ ...prev, [placeKey]: day })),
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          {crossLinkedPlatform && (
                            <button
                              onClick={() => setAddSource("platform")}
                              data-testid={`chip-gplace-platform-${placeKey}`}
                              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: BRAND_SOFT, color: BRAND, border: "none", cursor: "pointer" }}
                            >
                              Also on Traveloure — bookable
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${LINE}`, padding: "5px 12px", textAlign: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: FAINT }}>Places results powered by Google · live search, nothing stored</span>
              </div>
            </div>
          )}

          {/* Add · Viator — live bookable-activities search. Writes through addFromSearchMutation
              (same POST /api/trips/:tripId/itinerary-items rail as every other source). Results
              carry source="viator" + productCode so the item description carries an honest
              attribution note; no affiliate URL is ever embedded (§16). */}
          {rightTab === "add" && addSource === "viator" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Discovery-layer candidates for the canvas plan map (same contract as other
                  drawers; Viator products carry no coordinates so this publisher emits an
                  empty list — the map simply shows nothing, which is honest: §13). */}
              <MapCandidatesPublisher
                source="viator"
                sourceLabel="Viator"
                items={[]}
                onAdd={() => {}}
              />

              {/* Search bar + category chips */}
              <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${LINE}`, background: CARD, flexShrink: 0 }}>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: FAINT, pointerEvents: "none" }} />
                  <input
                    value={browseQuery}
                    onChange={e => setBrowseQuery(e.target.value)}
                    placeholder={`Search Viator in ${destination || "destination"}…`}
                    data-testid="input-browse-search-viator"
                    style={{ width: "100%", paddingLeft: 30, paddingRight: viatorSearchFetching ? 30 : 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${LINE}`, fontSize: 13, outline: "none", boxSizing: "border-box", background: GROUND, color: INK }}
                  />
                  {viatorSearchFetching && <Loader2 style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: FAINT }} className="animate-spin" />}
                </div>
                <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
                  {[{ k: "all", l: "All" }, { k: "activities", l: "Activities" }, { k: "dining", l: "Dining" }, { k: "hotels", l: "Hotels" }, { k: "transport", l: "Transport" }].map(c => (
                    <Chip key={c.k} active={cat === c.k} onClick={() => setCat(c.k)}>{c.l}</Chip>
                  ))}
                </div>
              </div>

              {/* Results list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {viatorSearchFetching && viatorSearchResults.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ height: 72, borderRadius: 8, background: GROUND }}><Skeleton className="h-full w-full rounded-lg" /></div>)}
                  </div>
                ) : !viatorSearchEnabled ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: MID }}>
                    <Search style={{ width: 28, height: 28, color: FAINT, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      {destination ? `Search activities in ${destination}` : "Enter a destination to browse Viator"}
                    </div>
                    <div style={{ fontSize: 11, color: FAINT }}>Try "food tour", "day trip", "snorkelling"</div>
                  </div>
                ) : viatorSearchResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: MID }}>
                    <Search style={{ width: 28, height: 28, color: FAINT, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No Viator results</div>
                    <div style={{ fontSize: 11, color: FAINT }}>
                      {cat !== "all" ? 'Try the "All" category or a different search term.' : "Try a different search or check the destination."}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 2 }}>
                      {viatorSearchResults.length} result{viatorSearchResults.length !== 1 ? "s" : ""}
                    </div>
                    {viatorSearchResults.map((result: any) => {
                      const isExpanded = expandedViatorId === result.productCode;
                      const toggleExpand = () =>
                        setExpandedViatorId(isExpanded ? null : (result.productCode ?? null));
                      return (
                        <div
                          key={result.id}
                          data-testid={`card-viator-result-${result.id}`}
                          style={{ display: "flex", flexDirection: "column", padding: 9, borderRadius: 9, border: `1px solid ${isExpanded ? BRAND : LINE}`, background: CARD, marginBottom: 7, transition: "border-color 0.15s" }}
                        >
                          {/* Card header row — click anywhere except the Add button to expand */}
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                            <button
                              onClick={toggleExpand}
                              aria-expanded={isExpanded}
                              data-testid={`button-viator-expand-${result.id}`}
                              style={{ width: 44, height: 44, borderRadius: 7, background: result.photoUrl ? "transparent" : GROUND, border: result.photoUrl ? "none" : `1px solid ${LINE}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer" }}
                            >
                              {result.photoUrl
                                ? <img src={result.photoUrl} alt={result.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <MapPin style={{ width: 16, height: 16, color: FAINT }} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={toggleExpand}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{result.name}</span>
                                <StateChip tone="brand">Viator</StateChip>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 10.5, color: MID, flexWrap: "wrap" }}>
                                {result.rating != null && (
                                  <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <Star style={{ width: 9, height: 9, color: WARN }} />
                                    {result.rating.toFixed(1)}{result.reviewCount != null && ` (${result.reviewCount.toLocaleString()})`}
                                  </span>
                                )}
                                {result.rating != null && result.priceLabel && <span style={{ color: FAINT }}>·</span>}
                                {result.priceLabel && <span style={{ fontWeight: 600, color: OK }}>{result.priceLabel}</span>}
                                {(result.rating != null || result.priceLabel) && <span style={{ color: FAINT }}>·</span>}
                                <span style={{ textTransform: "capitalize" }}>{result.category}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                              <button
                                onClick={toggleExpand}
                                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                                style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 2, display: "flex", alignItems: "center" }}
                              >
                                {isExpanded
                                  ? <ChevronUp style={{ width: 14, height: 14 }} />
                                  : <ChevronDown style={{ width: 14, height: 14 }} />}
                              </button>
                              <button
                                onClick={() => addFromSearchMutation.mutate({ result, day: focusDay })}
                                disabled={addFromSearchMutation.isPending}
                                data-testid={`button-add-viator-${result.id}`}
                                style={{ padding: "4px 10px", borderRadius: 8, background: BRAND_SOFT, color: BRAND, border: `1px solid ${BRAND}`, fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                              >
                                + Day {focusDay}
                              </button>
                            </div>
                          </div>

                          {/* Inline detail section — rendered only when expanded */}
                          {isExpanded && result.productCode && (
                            <ViatorDetailPanel productCode={result.productCode} />
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${LINE}`, padding: "5px 12px", textAlign: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: FAINT }}>Activity results from Viator · bookable tours and experiences</span>
              </div>
            </div>
          )}

          {/* Add · Partner inventory — a browsable catalog (W3-A, default) plus the existing
              affiliate-networks list as a sub-tab (booking-brief rail, §16). */}
          {rightTab === "add" && addSource === "partner" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: BRAND_SOFT, display: "flex", alignItems: "center", justifyContent: "center" }}><Link2 style={{ width: 11, height: 11, color: BRAND }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Partner inventory</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button
                  onClick={() => setPartnerSubTab("catalog")}
                  data-testid="button-partner-subtab-catalog"
                  style={{
                    padding: "4px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${partnerSubTab === "catalog" ? BRAND : LINE}`,
                    background: partnerSubTab === "catalog" ? BRAND : CARD,
                    color: partnerSubTab === "catalog" ? CARD : MID,
                  }}
                >
                  Catalog
                </button>
                <button
                  onClick={() => setPartnerSubTab("networks")}
                  data-testid="button-partner-subtab-networks"
                  style={{
                    padding: "4px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${partnerSubTab === "networks" ? BRAND : LINE}`,
                    background: partnerSubTab === "networks" ? BRAND : CARD,
                    color: partnerSubTab === "networks" ? CARD : MID,
                  }}
                >
                  Networks
                </button>
              </div>

              {partnerSubTab === "catalog" && (
                <>
                  <p style={{ fontSize: 11, color: MID, marginBottom: 12 }}>
                    Tours & activities from Traveloure's partner networks.{" "}
                    {isAuthoring ? "Add straight to a day." : "Adding sends it to your client for approval before it lands on their plan."}
                  </p>
                  <PartnerCatalogPickerCore
                    tripId={tripId!}
                    destination={destination}
                    dayNumber={focusDay}
                    isAuthoring={isAuthoring}
                    onAdded={triggerEnergyRecalc}
                  />
                </>
              )}

              {partnerSubTab === "networks" && (
              <>
              <p style={{ fontSize: 11, color: MID, marginBottom: 12 }}>External booking networks integrated by Traveloure. Use these to complete bookings on behalf of your client. Managed by admins at /admin/affiliate-partners.</p>
              {affiliatePartnersLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : affiliatePartners.length === 0 ? (
                <div style={{ padding: "16px 12px", background: GROUND, borderRadius: 8, textAlign: "center", color: MID, fontSize: 12 }}>
                  No active affiliate networks configured yet.
                </div>
              ) : (
                affiliatePartners.map((aff) => (
                  <div
                    key={aff.id}
                    data-testid={`card-affiliate-${aff.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    style={{ padding: "10px 11px", border: `1px solid ${LINE}`, borderRadius: 10, marginBottom: 8, background: CARD }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                      {aff.logoUrl ? (
                        <img src={aff.logoUrl} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: GROUND, border: `1px solid ${LINE}`, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{aff.name}</span>
                          <StateChip tone="ok">Active</StateChip>
                        </div>
                        <div style={{ fontSize: 11, color: FAINT }}>{aff.category || "—"}</div>
                      </div>
                      <button
                        onClick={() => handleOpenBookingBrief(aff.name, aff.websiteUrl)}
                        data-testid={`button-affiliate-${aff.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                        style={{ ...btnPrimaryStyle, flexShrink: 0, padding: "4px 9px", borderRadius: 7, fontSize: 11 }}
                      >
                        Open →
                      </button>
                    </div>
                    {aff.description && (
                      <div style={{ fontSize: 11, color: MID, background: GROUND, borderRadius: 6, padding: "5px 8px", marginBottom: 6 }}>{aff.description}</div>
                    )}
                    <button
                      onClick={() => setLogBookingOpenFor(o => o === aff.name ? null : aff.name)}
                      data-testid={`button-log-booking-${aff.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                      style={{ ...btnQuietStyle, padding: "4px 9px", borderRadius: 7, fontSize: 11 }}
                    >
                      {logBookingOpenFor === aff.name ? "Close log-booking form" : "Log completed booking"}
                    </button>
                    {logBookingOpenFor === aff.name && (
                      <LogBookingForm
                        tripId={tripId!}
                        dayNumber={focusDay}
                        providerName={aff.name}
                        destination={destination}
                        onAdded={triggerEnergyRecalc}
                        onClose={() => setLogBookingOpenFor(null)}
                      />
                    )}
                  </div>
                ))
              )}
              </>
              )}
            </div>
          )}

          {/* Add · Transport — ground-transport routes from the existing Travelpayouts/Omio
              catalog feed (§16-compliant: informational add only, no affiliate/booking URL
              ever reaches this surface — see transport-picker.tsx). */}
          {rightTab === "add" && addSource === "transport" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
              <TransportPickerCore tripId={tripId!} destination={destination} dayNumber={focusDay} onAdded={triggerEnergyRecalc} />
            </div>
          )}

          {/* ── AI Gaps: the ONE home for Schedule Check (P2-15/P3-19) ── */}
          {rightTab === "gaps" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>

              {/* Advisor Phase 2-4 — narration block, FIRST in the tab. Strictly ON-DEMAND: the
                  POST only ever fires from a click on button-advisor-narrate, never automatically
                  on tab open (only the GET runs then). A GET failure renders nothing (quiet —
                  never breaks the tab); a POST failure renders an honest inline note next to
                  whatever was already known, with no auto-retry loop. */}
              {!advisorNarrationError && (
                <div data-testid="card-advisor-narration" style={{ border: `1px solid ${BRAND}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, background: BRAND_SOFT }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <Sparkles style={{ width: 13, height: 13, color: BRAND }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Today's read on this build</span>
                  </div>

                  {narrateMutation.isPending ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MID }}>
                      <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                      Reading your build…
                    </div>
                  ) : (
                    <>
                      {narrateMutation.isError && (
                        <div data-testid="text-advisor-narration-error" style={{ fontSize: 11.5, color: MID, fontStyle: "italic", marginBottom: 8 }}>
                          Advice unavailable right now.
                        </div>
                      )}
                      {advisorNarrationLoading ? null : advisorNarration ? (
                        <>
                          <div data-testid="text-advisor-narration" style={{ fontSize: 12, color: INK, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                            {advisorNarration.narration}
                          </div>
                          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 7 }}>
                            AI summary · {formatRelativeTime(new Date(advisorNarration.generatedAt))}
                          </div>
                          {advisorNarration.stale && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: WARN_SOFT, color: WARN, fontSize: 10, fontWeight: 700 }}>
                                Plan changed — advice may be stale
                              </span>
                              <button
                                onClick={() => narrateMutation.mutate()}
                                data-testid="button-advisor-narrate"
                                style={{ ...btnQuietStyle, padding: "3px 9px", fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}
                              >
                                <RefreshCw style={{ width: 10, height: 10 }} />
                                Refresh advice
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => narrateMutation.mutate()}
                          data-testid="button-advisor-narrate"
                          style={{ ...btnPrimaryStyle, padding: "6px 11px", fontSize: 11.5 }}
                        >
                          Get advice on this build
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* CLAUDE.md §21 — Fundamentals card, FIRST after the narration card (before the
                  reorder nudges). Deterministic checklist from the sibling server's
                  GET /api/trips/:tripId/advisor/fundamentals — built in parallel; an honest
                  "unavailable" line renders on 404/error, never fake results (§13). */}
              <div data-testid="card-advisor-fundamentals" style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, background: CARD }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <ShieldCheck style={{ width: 13, height: 13, color: BRAND }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Fundamentals</span>
                </div>
                {fundamentalsError ? (
                  <div data-testid="text-fundamentals-unavailable" style={{ fontSize: 11.5, color: FAINT, fontStyle: "italic" }}>
                    Fundamentals unavailable
                  </div>
                ) : fundamentalsLoading ? (
                  <div style={{ fontSize: 11.5, color: MID, display: "flex", alignItems: "center", gap: 6 }}>
                    <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Checking the plan…
                  </div>
                ) : !fundamentalsData ? (
                  <div data-testid="text-fundamentals-unavailable" style={{ fontSize: 11.5, color: FAINT, fontStyle: "italic" }}>
                    Fundamentals unavailable
                  </div>
                ) : (() => {
                  const checks = fundamentalsData.checks ?? [];
                  const omitted = fundamentalsData.omitted ?? [];
                  const tier1 = checks.filter(c => c.tier === 1);
                  const tier2 = checks.filter(c => c.tier === 2);
                  const tier3 = checks.filter(c => c.tier === 3);

                  if (checks.length === 0) {
                    return (
                      <div data-testid="text-fundamentals-clear" style={{ fontSize: 11.5, color: OK, display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle style={{ width: 12, height: 12 }} /> All fundamentals covered
                      </div>
                    );
                  }

                  const rowTestId = (c: AdvisorFundamentalCheck) => `row-fundamental-${c.key}${c.dayNumber != null ? `-${c.dayNumber}` : ""}`;
                  const ctaLabel = (cta?: AdvisorFundamentalCheck["cta"]) =>
                    cta === "stays" ? "View stays" : cta === "editor" ? "Fix in editor" : cta === "distribute" ? "Go to Distribute" : "";
                  const runCta = (c: AdvisorFundamentalCheck) => {
                    if (c.cta === "stays") {
                      document.querySelector('[data-testid="card-advisor-stays"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
                    } else if (c.cta === "editor") {
                      // Reuses the SAME focusItemId one-shot button-advisor-add-locations uses
                      // above — day-scoped when the check names a day (its first item stands in
                      // for "this day's row" since ItemsEditorPanel opens/expands by item id,
                      // not by day), otherwise the plan's first item, otherwise just opens the
                      // panel via its own toggle (no items to focus at all).
                      let itemId = c.data?.itemId as string | undefined;
                      if (!itemId && c.dayNumber != null) itemId = days.find(d => d.dayNumber === c.dayNumber)?.items[0]?.id;
                      if (!itemId) itemId = days.flatMap(d => d.items)[0]?.id;
                      if (itemId) setFocusItemId(itemId);
                      else (document.querySelector('[data-testid="button-toggle-item-editor"]') as HTMLElement | null)?.click();
                    } else if (c.cta === "distribute") {
                      setRightTab("distribute");
                    }
                  };

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {tier1.map(c => (
                        <div key={rowTestId(c)} data-testid={rowTestId(c)} style={{ border: `1px solid ${WARN}`, borderRadius: 8, padding: "8px 10px", background: WARN_SOFT, display: "flex", alignItems: "flex-start", gap: 7 }}>
                          <AlertTriangle style={{ width: 13, height: 13, color: WARN, flexShrink: 0, marginTop: 1 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: INK, fontWeight: 600, lineHeight: 1.4 }}>
                              {c.dayNumber != null && <span style={{ color: FAINT, fontWeight: 700 }}>D{c.dayNumber} · </span>}
                              {c.message}
                            </div>
                            {c.cta && (
                              <button onClick={() => runCta(c)} data-testid={`button-fundamental-${c.key}${c.dayNumber != null ? `-${c.dayNumber}` : ""}`} style={{ ...btnPrimaryStyle, marginTop: 6, padding: "4px 10px", fontSize: 10.5 }}>
                                {ctaLabel(c.cta)}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {tier2.length > 0 && (
                        <>
                          <div style={{ ...sectionLabelStyle, marginTop: tier1.length > 0 ? 2 : 0, marginBottom: 0 }}>Worth a look</div>
                          {tier2.map(c => (
                            <div key={rowTestId(c)} data-testid={rowTestId(c)} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: MID }}>
                              <Lightbulb style={{ width: 11, height: 11, color: FAINT, flexShrink: 0, marginTop: 2 }} />
                              <span style={{ flex: 1 }}>
                                {c.dayNumber != null && <span style={{ color: FAINT, fontWeight: 700 }}>D{c.dayNumber} · </span>}
                                {c.message}
                                {c.cta && (
                                  <button onClick={() => runCta(c)} data-testid={`button-fundamental-${c.key}${c.dayNumber != null ? `-${c.dayNumber}` : ""}`} style={{ background: "none", border: "none", padding: 0, marginLeft: 6, color: BRAND, fontWeight: 700, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>
                                    {ctaLabel(c.cta)}
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </>
                      )}

                      {tier3.length > 0 && (
                        <>
                          <div style={{ ...sectionLabelStyle, marginTop: 2, marginBottom: 0 }}>Polish</div>
                          {tier3.map(c => (
                            <div key={rowTestId(c)} data-testid={rowTestId(c)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: FAINT }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: FAINT, flexShrink: 0 }} />
                              <span>{c.dayNumber != null && `D${c.dayNumber} · `}{c.message}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {omitted.length > 0 && (
                        <div
                          data-testid="text-fundamentals-omitted"
                          title={omitted.map(o => `${o.key}: ${o.reason}`).join("\n")}
                          style={{ fontSize: 10, color: FAINT, marginTop: 2 }}
                        >
                          {omitted.length} check{omitted.length === 1 ? "" : "s"} skipped (insufficient data)
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Advisor Phase 2-4 — reorder-nudge cards. Source: route-efficiency's own per-day
                  straight-line comparison (§13: the "straight-line comparison" label is
                  load-bearing honesty — this is NOT a real routed distance, keep the wording).
                  Only materially-improvable days render anything; a day with no meaningful
                  savings shows nothing (no noise). A failed fetch renders nothing (same quiet
                  posture as the narration GET above). */}
              {!advisorRouteEfficiencyError && (advisorRouteEfficiency?.days ?? []).filter(d => d.materiallyImprovable).map(d => (
                <div key={d.dayNumber} data-testid={`card-advisor-reorder-day-${d.dayNumber}`} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, background: CARD }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                    <Lightbulb style={{ width: 13, height: 13, color: BRAND, flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                      Day {d.dayNumber} walks {d.savingsKm.toFixed(1)} km further than it needs to
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: MID, marginBottom: 9, paddingLeft: 19 }}>
                    Current {d.currentKm.toFixed(1)} km → best found {d.optimizedKm.toFixed(1)} km · straight-line comparison
                  </div>
                  <button
                    onClick={() => setSuggestOrderForDay(d.dayNumber)}
                    data-testid={`button-advisor-suggest-order-${d.dayNumber}`}
                    style={{ ...btnPrimaryStyle, padding: "5px 11px", fontSize: 11 }}
                  >
                    See suggested order
                  </button>
                </div>
              ))}

              {/* Advisor Phase 1 — routing-blocked card. Shown only when at least one item fails
                  isLocatedItem (the SAME predicate the plan map and transport-leg engine use —
                  never a second, looser notion of "located"). */}
              {advisorUnlocatedItems.length > 0 && (
                <div data-testid="card-advisor-routing-blocked" style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, background: WARN_SOFT }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <AlertTriangle style={{ width: 13, height: 13, color: WARN }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                      {advisorUnlocatedItems.length} item{advisorUnlocatedItems.length === 1 ? "" : "s"} can't be routed
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 9 }}>
                    {advisorUnlocatedItems.slice(0, 4).map(item => (
                      <div key={item.id} style={{ fontSize: 11, color: MID, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700, color: FAINT }}>D{item.dayNumber}</span> {item.title}
                      </div>
                    ))}
                    {advisorUnlocatedItems.length > 4 && (
                      <div style={{ fontSize: 10, color: FAINT }}>+{advisorUnlocatedItems.length - 4} more</div>
                    )}
                  </div>
                  <button
                    // Reuses the EXISTING focusItemId one-shot (item 16) — ItemsEditorPanel
                    // opens/expands/scrolls to this row, where the location field lives.
                    onClick={() => setFocusItemId(advisorUnlocatedItems[0].id)}
                    data-testid="button-advisor-add-locations"
                    style={{ ...btnPrimaryStyle, padding: "6px 11px", fontSize: 11.5 }}
                  >
                    Add locations
                  </button>
                </div>
              )}

              {/* Advisor Phase 1 — route summary card. Per-day + total distance, engine sums only
                  (never a client-side estimate, §13); an honest empty state when nothing has been
                  generated yet rather than a fabricated zero. */}
              <div data-testid="card-advisor-route-summary" style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, background: CARD }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <Route style={{ width: 13, height: 13, color: BRAND }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Route summary</span>
                </div>
                {advisorLegDays.length === 0 ? (
                  <div data-testid="text-advisor-no-routes" style={{ fontSize: 11.5, color: MID }}>
                    No routes computed yet.{" "}
                    <button
                      onClick={() => document.querySelector('[data-testid="button-toggle-transport-legs"]')?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      data-testid="button-advisor-goto-transport-legs"
                      style={{ background: "none", border: "none", padding: 0, color: BRAND, fontWeight: 700, cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}
                    >
                      Generate transport legs
                    </button>{" "}
                    on the canvas to see day-by-day distances.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {advisorLegDays.map(d => (
                      <div key={d} data-testid={`advisor-route-day-${d}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MID }}>
                        <span>Day {d}</span>
                        <span style={{ fontWeight: 600, color: INK }}>{(advisorLegMetersByDay[d] / 1000).toFixed(1)} km</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: INK, borderTop: `1px solid ${LINE}`, paddingTop: 5, marginTop: 2 }}>
                      <span>Total</span>
                      <span data-testid="text-advisor-route-total">{(advisorLegTotalMeters / 1000).toFixed(1)} km</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Advisor Phase 2-4 — stays card. §16: platform inventory is listed FIRST by
                  design; the Google Places hop below stays inside our own live-search Add-panel
                  surface (never an external/off-site link — the same rule the affiliate-outbound
                  cards on Discover follow). No anchor (nothing to cluster near yet) → nothing
                  rendered; a failed fetch is the same quiet no-render. */}
              {!advisorStayAnchorError && advisorStayAnchor?.anchor && (
                <div data-testid="card-advisor-stays" style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, background: CARD }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <Building2 style={{ width: 13, height: 13, color: BRAND }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                      Days cluster near {advisorStayAnchor.anchor.neighborhood ?? "your route center"}
                    </span>
                  </div>
                  {advisorStayAnchor.platformStays.length === 0 ? (
                    <div data-testid="text-advisor-no-stays" style={{ fontSize: 11.5, color: MID, marginBottom: 9 }}>
                      No bookable stays on Traveloure within 5 km yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
                      {advisorStayAnchor.platformStays.map(stay => (
                        <div key={stay.providerServiceId} data-testid={`row-advisor-stay-${stay.providerServiceId}`} style={{ fontSize: 11.5, color: INK, display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stay.name}</span>
                          <span style={{ color: MID, flexShrink: 0 }}>
                            {stay.distanceKm.toFixed(1)} km{stay.price != null ? ` · $${stay.price}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setRightTab("add"); setAddSource("google"); setCat("hotels"); }}
                    data-testid="button-advisor-stays-places"
                    style={{ ...btnQuietStyle, padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Search style={{ width: 11, height: 11 }} />
                    Browse more stays on Google Places
                  </button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <Shield style={{ width: 14, height: 14, color: BRAND }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>AI Gaps</span>
                {workspaceConstraints && (
                  totalConstraintIssues > 0
                    ? <StateChip tone="warn">{totalConstraintIssues} issue{totalConstraintIssues > 1 ? "s" : ""}</StateChip>
                    : <StateChip tone="ok">No issues</StateChip>
                )}
              </div>

              {/* Optimizer Scores */}
              {optimizerScores && (
                <div style={{ marginBottom: 14 }}>
                  <div style={sectionLabelStyle}>Optimizer Scores</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { key: "balance_score", label: "Balance" },
                      { key: "wellness_score", label: "Wellness" },
                      { key: "pace_score", label: "Pace" },
                      { key: "diversity_score", label: "Diversity" },
                    ].map(s => {
                      const val = optimizerScores[s.key] ?? null;
                      if (val === null) return null;
                      const pct = Math.min(100, Math.max(0, val));
                      const tone = pct >= 70 ? OK : pct >= 40 ? WARN : DANGER;
                      return (
                        <div key={s.key} data-testid={`score-${s.key}`} style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 9px" }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: MID, marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: tone, lineHeight: 1 }}>{Math.round(val)}</div>
                          <div style={{ marginTop: 4, height: 3, background: LINE, borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Anchor Conflicts */}
              <div style={{ marginBottom: 14 }}>
                <div style={sectionLabelStyle}>Anchor Conflicts</div>
                {constraintsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : anchorConflicts.length === 0 ? (
                  <div style={{ background: OK_SOFT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle style={{ width: 12, height: 12, color: OK }} />
                    <span style={{ fontSize: 12, color: OK, fontWeight: 500 }}>No anchor conflicts</span>
                  </div>
                ) : anchorConflicts.map(conflict => {
                  const critical = conflict.impacts.some(i => i.severity === "critical");
                  return (
                    <div key={conflict.anchorId} style={{ border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 11px", marginBottom: 7, background: critical ? DANGER_SOFT : WARN_SOFT }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                        <StateChip tone={critical ? "danger" : "warn"}>{critical ? "Critical" : "Warning"}</StateChip>
                        <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{conflict.description}</span>
                      </div>
                      {conflict.impacts.map((imp, idx) => (
                        <div key={idx} data-testid={`anchor-impact-${conflict.anchorId}-${idx}`} style={{ display: "flex", gap: 5, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: imp.severity === "critical" ? DANGER : WARN, marginTop: 2, flexShrink: 0 }}>•</span>
                          <span style={{ fontSize: 11, color: imp.severity === "critical" ? DANGER : WARN }}>{imp.message}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Day Boundaries */}
              <div style={{ marginBottom: 14 }}>
                <div style={sectionLabelStyle}>Day Boundaries</div>
                {constraintsLoading ? (
                  <Skeleton className="h-12 rounded-lg" />
                ) : dayBoundaries.length === 0 ? (
                  <div style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: FAINT }}>No day boundaries set</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {dayBoundaries.map(b => {
                      const violations = boundaryViolations.filter(v => v.dayNumber === b.dayNumber);
                      return (
                        <div key={b.id} data-testid={`day-boundary-${b.dayNumber}`} style={{ background: violations.length > 0 ? WARN_SOFT : GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <StateChip tone="mut">Day {b.dayNumber}</StateChip>
                            <div style={{ display: "flex", gap: 4 }}>
                              {b.mustReturnToHotel && <StateChip tone="mut">Must return to hotel</StateChip>}
                              {violations.length > 0 && <StateChip tone="warn">{violations.length} violation{violations.length > 1 ? "s" : ""}</StateChip>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: MID }}>
                            {b.earliestActivityStart && <span>From {b.earliestActivityStart} </span>}
                            {b.latestActivityEnd && <span>until {b.latestActivityEnd}</span>}
                            {b.reasonForConstraint && <div style={{ marginTop: 2, fontSize: 10, color: FAINT }}>{b.reasonForConstraint}</div>}
                          </div>
                          {violations.length > 0 && (
                            <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                              {violations.map((v, idx) => (
                                <div key={idx} data-testid={`boundary-violation-day${b.dayNumber}-${idx}`} style={{ display: "flex", gap: 5 }}>
                                  <AlertTriangle style={{ width: 10, height: 10, color: WARN, marginTop: 2, flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: WARN }}>{v.violation}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Energy Tracking */}
              <div style={{ marginBottom: 14 }}>
                <div style={sectionLabelStyle}>Energy per Day</div>
                {constraintsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : energyTracking.length === 0 ? (
                  <div style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: FAINT }}>No energy data yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {energyTracking.sort((a, b) => a.dayNumber - b.dayNumber).map(e => {
                      const pct = e.endingEnergy;
                      const barColor = pct < 20 ? DANGER : pct < 40 ? WARN : OK;
                      return (
                        <div key={e.dayNumber} data-testid={`energy-day-${e.dayNumber}`} style={{ background: e.recoveryNeeded ? DANGER_SOFT : GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <BatteryLow style={{ width: 11, height: 11, color: barColor }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>Day {e.dayNumber}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{e.endingEnergy}%</span>
                              {e.recoveryNeeded && <StateChip tone="danger">Burnout risk</StateChip>}
                            </div>
                          </div>
                          <div style={{ height: 4, background: LINE, borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
                          </div>
                          {e.recoveryNeeded && e.recoveryReason && (
                            <div style={{ fontSize: 10, color: DANGER, marginTop: 4 }}>{e.recoveryReason}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transport Gaps (QA_PUNCH_LIST item 21) — rules-first checker over the content
                  logistics envelope (item 20). "Propose leg" calls the EXISTING §18 L4
                  leg-proposal engine (POST .../transport-legs/generate, the same action
                  TransportLegsPanel's "Generate transport" button triggers below on the canvas). */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={sectionLabelStyle}>Transport Gaps</div>
                  {transportGaps && transportGaps.days.some(d => d.pairs.length > 0) && (
                    <button
                      onClick={() => proposeLegsMutation.mutate()}
                      disabled={proposeLegsMutation.isPending}
                      data-testid="button-propose-transport-legs-gaps"
                      style={{ ...btnQuietStyle, padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 5, opacity: proposeLegsMutation.isPending ? 0.6 : 1 }}
                    >
                      {proposeLegsMutation.isPending ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Route style={{ width: 11, height: 11 }} />}
                      Propose all
                    </button>
                  )}
                </div>
                {transportGapsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : !transportGaps || transportGaps.days.every(d => d.pairs.length === 0 && d.skipped.length === 0) ? (
                  <div style={{ background: OK_SOFT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle style={{ width: 12, height: 12, color: OK }} />
                    <span style={{ fontSize: 12, color: OK, fontWeight: 500 }}>No transport gaps flagged</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {transportGaps.days.map(day => (
                      <div key={day.dayNumber}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day {day.dayNumber}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                          {day.pairs.map(pair => {
                            const critical = pair.flags.includes("timing_infeasible");
                            return (
                              <div
                                key={`${pair.fromItemId}-${pair.toItemId}`}
                                data-testid={`transport-gap-card-${pair.fromItemId}-${pair.toItemId}`}
                                style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", background: critical ? DANGER_SOFT : WARN_SOFT }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 4 }}>{pair.fromTitle} → {pair.toTitle}</div>
                                {pair.flags.map(flag => (
                                  <div key={flag} data-testid={`transport-gap-flag-${flag}-${pair.fromItemId}-${pair.toItemId}`} style={{ display: "flex", gap: 5, marginBottom: 2 }}>
                                    <AlertTriangle style={{ width: 10, height: 10, color: flag === "timing_infeasible" ? DANGER : WARN, marginTop: 2, flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: flag === "timing_infeasible" ? DANGER : WARN }}>{TRANSPORT_GAP_FLAG_COPY[flag]}</span>
                                  </div>
                                ))}
                                <div style={{ fontSize: 10, color: MID, marginTop: 3 }}>
                                  ~{pair.estimatedTravelMinutes} min by {pair.estimatedTravelMode} needed · {pair.availableGapMinutes} min available
                                  {pair.assumedPrevDuration && (
                                    <span> (assumed "{pair.fromTitle}" lasts 60 min — no recorded duration)</span>
                                  )}
                                </div>
                                {pair.flags.includes("transport_gap") && (
                                  <button
                                    onClick={() => proposeLegsMutation.mutate()}
                                    disabled={proposeLegsMutation.isPending}
                                    data-testid={`button-propose-leg-${pair.fromItemId}-${pair.toItemId}`}
                                    style={{ ...btnQuietStyle, marginTop: 6, padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 5, opacity: proposeLegsMutation.isPending ? 0.6 : 1 }}
                                  >
                                    <Route style={{ width: 10, height: 10 }} /> Propose leg
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {day.skipped.map(skip => (
                            <div
                              key={`${skip.fromItemId}-${skip.toItemId}`}
                              data-testid={`transport-gap-skip-${skip.fromItemId}-${skip.toItemId}`}
                              style={{ fontSize: 11, color: FAINT, padding: "4px 0" }}
                            >
                              {skip.fromTitle} → {skip.toTitle}: not enough data to check ({skip.detail === "missing_coordinates" ? "missing location" : "missing start time"})
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Distribute: four channel cards, EVERY build, honest per-channel state (P1-3) ── */}
          {rightTab === "distribute" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Megaphone style={{ width: 14, height: 14, color: BRAND }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Distribute</span>
              </div>

              {/* Client channel */}
              <div style={chanCardStyle}>
                <div style={chanHeadStyle}>
                  <User style={{ width: 12, height: 12, color: MID }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Client</span>
                  {!isAuthoring && workspaceStatus === "delivered" && <StateChip tone="ok">Delivered</StateChip>}
                  {!isAuthoring && planApproved && <StateChip tone="ok">Approved</StateChip>}
                </div>
                {isAuthoring ? (
                  <div style={{ padding: "14px 12px", fontSize: 12.5, color: MID, lineHeight: 1.55 }} data-testid="text-distribute-client-muted">
                    Not attached to a client. Client delivery starts from an accepted trip assignment.
                  </div>
                ) : (
                  <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <Av i={identityRevealed ? travelerInitials : "??"} s={26} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="text-distribute-client-name">
                          {identityRevealed ? travelerName : `Client #${travelerCode}`}
                        </span>
                      </div>
                      {/* F3: land in THIS client's thread, not the chat lobby — /chat already reads ?clientId. */}
                      <button
                        onClick={() => safeNavigate(trip?.traveler_user_id ? `/chat?clientId=${trip.traveler_user_id}` : "/chat")}
                        data-testid="button-open-chat"
                        style={{ ...btnQuietStyle, flexShrink: 0, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5, color: MID }}
                      >
                        <MessageSquare style={{ width: 12, height: 12 }} /> Chat
                      </button>
                    </div>

                    {/* Delivery lifecycle — draft → client review → delivered (ONE home). */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {STEPS.map((s, i) => {
                        const idx = STEPS.findIndex(x => x.key === workspaceStatus);
                        const effectiveIdx = idx === -1 ? 0 : idx;
                        const done = i < effectiveIdx, active = i === effectiveIdx;
                        return (
                          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <StateChip tone={done ? "ok" : active ? "brand" : "mut"}>{s.label}</StateChip>
                            {i < STEPS.length - 1 && <ChevronRight style={{ width: 10, height: 10, color: FAINT }} />}
                          </span>
                        );
                      })}
                    </div>
                    {workspaceStatus !== "delivered" && (
                      <button onClick={() => advanceStatusMutation.mutate()} disabled={advanceStatusMutation.isPending} data-testid="button-send-edits" style={{ ...btnPrimaryStyle, padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: advanceStatusMutation.isPending ? 0.7 : 1 }}>
                        {advanceStatusMutation.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Send style={{ width: 12, height: 12 }} />}
                        {workspaceStatus === "draft" ? "Send edits for client review" : "Mark delivered"}
                      </button>
                    )}

                    {/* Plan-approval mode flip (migration 164): the customer's decision on a
                        delivered plan. `planApproved` is the honest signal the item-write 409s
                        already enforce server-side — this just names it instead of leaving the
                        expert to discover the flip from a failed edit. */}
                    {planApproved && (
                      <div
                        style={{ background: OK_SOFT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: OK, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
                        data-testid="text-plan-approved-notice"
                      >
                        <CheckCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
                        Approved by client — changes now go through suggestions.
                      </div>
                    )}
                    {!planApproved && assignment?.planApprovalStatus === "changes_requested" && assignment?.planReviewNote && (
                      <div
                        style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: MID }}
                        data-testid="text-plan-changes-requested-note"
                      >
                        <strong style={{ color: INK }}>Client requested changes:</strong> {assignment.planReviewNote}
                      </div>
                    )}

                    {/* Suggest to client — traveler-approval rail (C5, from /expert/assigned-trips). */}
                    <ClientSuggestPanel tripId={tripId!} />

                    {/* Event coordination — client-delivery state for event-type trips (P3-19). */}
                    {isEvent && (
                      <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ padding: "7px 10px", background: GROUND, display: "flex", alignItems: "center", gap: 6 }}>
                          <CalendarDays style={{ width: 11, height: 11, color: MID }} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Event coordination</span>
                        </div>
                        <div style={{ padding: "10px" }}>
                          {!coordinationId && (
                            <div style={{ background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px", fontSize: 12, color: MID }}>
                              No coordination state linked to this trip yet. The traveler will create one during the concierge flow.
                            </div>
                          )}
                          {coordinationId && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={sectionLabelStyle}>Engagement Stage</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
                                {COORD_STATUS_ORDER.map((s, idx) => {
                                  const isDone = idx < currentCoordIdx;
                                  const isCurrent = idx === currentCoordIdx;
                                  return (
                                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                                      <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isDone ? OK : isCurrent ? BRAND : LINE }} />
                                      <span style={{ fontSize: 10, fontWeight: isCurrent ? 700 : 400, color: isDone ? OK : isCurrent ? BRAND : FAINT, whiteSpace: "nowrap" }}>
                                        {coordStatusLabel[s]}
                                      </span>
                                      {idx < COORD_STATUS_ORDER.length - 1 && (
                                        <span style={{ fontSize: 10, color: FAINT, marginLeft: 1 }}>›</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {nextCoordStatus ? (
                                <button
                                  data-testid="button-advance-coord-status"
                                  onClick={() => advanceCoordStatusMutation.mutate(nextCoordStatus)}
                                  disabled={advanceCoordStatusMutation.isPending}
                                  style={{ ...btnPrimaryStyle, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12, opacity: advanceCoordStatusMutation.isPending ? 0.6 : 1 }}
                                >
                                  {advanceCoordStatusMutation.isPending
                                    ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                                    : <ChevronRight style={{ width: 13, height: 13 }} />
                                  }
                                  Advance to {coordStatusLabel[nextCoordStatus]}
                                </button>
                              ) : (
                                <div style={{ fontSize: 12, color: OK, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                                  <CheckCircle style={{ width: 12, height: 12 }} /> Coordination complete
                                </div>
                              )}
                            </div>
                          )}

                          {coordinationId && eventCoordFee && (
                            <div style={{ background: OK_SOFT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                              <div style={sectionLabelStyle}>Coordination Fee</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: OK, lineHeight: 1 }}>
                                ${(eventCoordFee.feeCents / 100).toFixed(2)}
                              </div>
                              {eventCoordFee.optimizeCreditCents > 0 && (
                                <div style={{ fontSize: 11, color: OK, marginTop: 4 }}>
                                  ${(eventCoordFee.optimizeCreditCents / 100).toFixed(2)} optimize fee credited
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: MID, marginTop: 4 }}>
                                Rule: {eventCoordFee.rule} · Greater of $499 or 8% of budget
                              </div>
                            </div>
                          )}

                          {coordinationId && eventTimeline && eventTimeline.blocks && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={sectionLabelStyle}>Timeline</div>
                              <div style={{ fontSize: 12, color: MID, marginBottom: 8 }}>
                                Anchor: {eventTimeline.anchorType} at {eventTimeline.anchorTime}
                              </div>
                              {eventTimeline.blocks.map((block: any, idx: number) => (
                                <div key={block.key ?? idx} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, background: block.isLocked ? WARN_SOFT : CARD }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{block.label}</span>
                                    {block.isLocked && <StateChip tone="warn">Locked</StateChip>}
                                  </div>
                                  <div style={{ fontSize: 11, color: MID, marginTop: 2 }}>
                                    {block.startTime} – {block.endTime} ({block.duration} min)
                                  </div>
                                  {block.vendorName && (
                                    <div style={{ fontSize: 11, color: MID, marginTop: 2 }}>
                                      Vendor: {block.vendorName} ({block.vendorStatus})
                                    </div>
                                  )}
                                </div>
                              ))}
                              {eventTimeline.conflicts && eventTimeline.conflicts.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                  {eventTimeline.conflicts.map((c: any, idx: number) => (
                                    <div key={idx} style={{ background: DANGER_SOFT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 11, color: DANGER }}>
                                      <strong>{c.type}</strong>: {c.description}
                                      {c.suggestion && <div style={{ marginTop: 2, color: WARN }}>{c.suggestion}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {coordinationId && eventVendorGaps && eventVendorGaps.length > 0 && (
                            <div>
                              <div style={sectionLabelStyle}>Vendor Gaps</div>
                              {eventVendorGaps.map((gap: any, idx: number) => (
                                <div key={idx} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, background: gap.priority === "critical" ? DANGER_SOFT : gap.priority === "high" ? WARN_SOFT : GROUND }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{gap.label}</span>
                                    <StateChip tone={gap.priority === "critical" ? "danger" : gap.priority === "high" ? "warn" : "mut"}>{gap.priority}</StateChip>
                                  </div>
                                  <div style={{ fontSize: 11, color: MID, marginTop: 2 }}>{gap.reason}</div>
                                  <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>
                                    Needed: {gap.neededFrom} – {gap.neededUntil}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Partner booking requests — collapsed card (agent-booking rail, §16). */}
                    <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                      <button
                        onClick={() => setPartnerOpen(o => !o)}
                        data-testid="button-toggle-partner-bookings"
                        style={{ width: "100%", padding: "7px 10px", background: GROUND, border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                      >
                        <ShoppingBag style={{ width: 11, height: 11, color: MID }} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Partner booking requests</span>
                        {!partnerBookingLoading && <StateChip tone="mut">{partnerBookingRequests?.length ?? 0}</StateChip>}
                        <span style={{ marginLeft: "auto", display: "flex", color: FAINT }}>
                          {partnerOpen ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                        </span>
                      </button>
                      {partnerOpen && (
                        <div style={{ padding: "10px" }}>
                          <p style={{ fontSize: 11, color: MID, marginBottom: 10, marginTop: 0 }}>Requests from users to book partner-affiliate items on their behalf.</p>
                          {partnerBookingLoading && <div style={{ textAlign: "center", padding: 20, color: FAINT, fontSize: 12 }}>Loading…</div>}
                          {!partnerBookingLoading && (!partnerBookingRequests || partnerBookingRequests.length === 0) && (
                            <div style={{ textAlign: "center", padding: 20, color: MID, fontSize: 12, background: GROUND, borderRadius: 10 }}>
                              <ShoppingBag style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                              No partner booking requests yet
                            </div>
                          )}
                          {partnerBookingRequests?.map((req: any) => (
                            <div key={req.id} data-testid={`card-partner-booking-${req.id}`} style={{ padding: "11px 12px", border: `1px solid ${LINE}`, borderRadius: 10, marginBottom: 10, background: CARD }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 2 }}>{req.itemName}</div>
                                  <div style={{ fontSize: 11, color: MID }}>{req.partnerName} · {req.partnerCategory ?? "activity"}</div>
                                </div>
                                <StateChip tone={req.status === "confirmed" ? "ok" : req.status === "failed" ? "danger" : "mut"}>{req.status}</StateChip>
                              </div>
                              {(req.travelDate || req.travelers) && (
                                <div style={{ fontSize: 11, color: MID, display: "flex", gap: 10, marginBottom: 6 }}>
                                  {req.travelDate && <span>{req.travelDate}</span>}
                                  {req.travelers && <span>{req.travelers} traveler{req.travelers !== 1 ? "s" : ""}</span>}
                                </div>
                              )}
                              {req.userNotes && <div style={{ fontSize: 11, color: MID, background: GROUND, borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>{req.userNotes}</div>}
                              {req.expertNotes && <div data-testid={`text-expert-notes-${req.id}`} style={{ fontSize: 11, color: req.expertNotes.includes("[ATTACHMENT BLOCKED]") ? DANGER : MID, background: req.expertNotes.includes("[ATTACHMENT BLOCKED]") ? DANGER_SOFT : GROUND, borderRadius: 6, padding: "4px 8px", marginBottom: 6, whiteSpace: "pre-wrap" }}>{req.expertNotes}</div>}
                              {req.affiliateUrl && (
                                <a href={req.affiliateUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-booking-${req.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: BRAND, fontWeight: 600, textDecoration: "none", padding: "4px 9px", border: `1px solid ${BRAND}`, background: BRAND_SOFT, borderRadius: 7, marginBottom: 8 }}>
                                  <ExternalLink style={{ width: 11, height: 11 }} />Open booking link
                                </a>
                              )}
                              {req.status !== "confirmed" && req.status !== "failed" && (
                                <>
                                  <VerificationPanel verification={req.verification} testId={`verification-panel-${req.id}`} />
                                  <button
                                    onClick={() => { setVerifyingBookingId(req.id); verifyBookingMutation.mutate(req.id); }}
                                    disabled={verifyingBookingId === req.id && verifyBookingMutation.isPending}
                                    data-testid={`button-verify-${req.id}`}
                                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: CARD, color: BRAND, border: `1px solid ${BRAND}`, marginBottom: 8, opacity: verifyingBookingId === req.id && verifyBookingMutation.isPending ? 0.7 : 1 }}
                                  >
                                    {verifyingBookingId === req.id && verifyBookingMutation.isPending ? (
                                      <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                                    ) : (
                                      <Sparkles style={{ width: 11, height: 11 }} />
                                    )}
                                    {req.verification ? "Re-verify with AI" : "Verify with AI"}
                                  </button>
                                </>
                              )}
                              {req.status !== "confirmed" && req.status !== "failed" && (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => updateBookingMutation.mutate({ id: req.id, status: "confirmed" })} disabled={updateBookingMutation.isPending} data-testid={`button-confirm-${req.id}`} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: OK_SOFT, color: OK, border: `1px solid ${OK}` }}>Confirm</button>
                                  <button onClick={() => updateBookingMutation.mutate({ id: req.id, status: "failed" })} disabled={updateBookingMutation.isPending} data-testid={`button-fail-${req.id}`} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: CARD, color: DANGER, border: `1px solid ${DANGER}` }}>Failed</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Store channel */}
              <div style={chanCardStyle}>
                <div style={chanHeadStyle}>
                  <Store style={{ width: 12, height: 12, color: MID }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Store</span>
                  {isAuthoring && listing && (() => {
                    const chip = LISTING_CHIP[(listing as any).status];
                    return chip ? <StateChip tone={chip.tone}>{chip.label}</StateChip> : null;
                  })()}
                </div>
                {isAuthoring ? (
                  listing ? (
                    <ReadyMadeListingPanel listing={listing} tripId={tripId!} days={days} />
                  ) : (
                    <div style={{ padding: "12px" }}>
                      <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.55, marginBottom: 10 }}>
                        Create a store listing from this build — price it, submit for admin review, sell it in Ready Made Trips.
                      </div>
                      <button
                        onClick={() => shipToStoreMutation.mutate()}
                        disabled={shipToStoreMutation.isPending}
                        data-testid="button-ship-to-store"
                        style={{ ...btnPrimaryStyle, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5, opacity: shipToStoreMutation.isPending ? 0.7 : 1 }}
                      >
                        {shipToStoreMutation.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Store style={{ width: 12, height: 12 }} />}
                        Ship to store
                      </button>
                      {shipToStoreMutation.isError && (
                        <div style={{ fontSize: 12, color: WARN, marginTop: 8 }} data-testid="text-ship-to-store-error">
                          {(shipToStoreMutation.error as Error)?.message}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ padding: "14px 12px", fontSize: 12.5, color: MID, lineHeight: 1.55 }} data-testid="text-distribute-store-muted">
                    Client trips ship to the store via a copy of the build — coming with the clone-to-build step.
                  </div>
                )}
              </div>

              {/* Direct channel — trackable booking link (the §16 short-link rail) */}
              <div style={chanCardStyle}>
                <div style={chanHeadStyle}>
                  <Link2 style={{ width: 12, height: 12, color: MID }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Direct</span>
                </div>
                {isAuthoring ? (
                  listing?.id ? (
                    <div style={{ padding: "12px" }}>
                      {directLink ? (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: INK, background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 10px", marginBottom: 8, wordBreak: "break-all" }} data-testid="text-direct-booking-link">
                            {directLink}
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(directLink);
                                  toast({ title: "Copied", description: "Booking link copied to your clipboard." });
                                } catch {
                                  toast({ title: "Couldn't copy", variant: "destructive" });
                                }
                              }}
                              data-testid="button-direct-copy"
                              style={{ ...btnPrimaryStyle, flex: 1, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                            >
                              <Copy style={{ width: 12, height: 12 }} /> Copy
                            </button>
                            <button
                              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(directLink)}`, "_blank", "noopener,noreferrer")}
                              data-testid="button-direct-whatsapp"
                              style={{ ...btnQuietStyle, flex: 1, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, color: MID }}
                            >
                              <Send style={{ width: 12, height: 12 }} /> WhatsApp
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => getBookingLinkMutation.mutate(listing.id)}
                          disabled={getBookingLinkMutation.isPending}
                          data-testid="button-direct-get-link"
                          style={{ ...btnPrimaryStyle, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5, cursor: getBookingLinkMutation.isPending ? "wait" : "pointer", opacity: getBookingLinkMutation.isPending ? 0.7 : 1 }}
                        >
                          {getBookingLinkMutation.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Link2 style={{ width: 12, height: 12 }} />}
                          Get booking link
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "14px 12px", fontSize: 12.5, color: MID }} data-testid="text-direct-no-listing">
                      Ship to store first — the trackable booking link points at your store listing.
                    </div>
                  )
                ) : (
                  <div style={{ padding: "14px 12px", fontSize: 12.5, color: MID, lineHeight: 1.55 }} data-testid="text-direct-muted">
                    Direct links ride a store listing — available on builds shipped to the store.
                  </div>
                )}
              </div>

              {/* Social channel — F3 social kit (registry social:default → social:story): story
                  preview rail + the caption/share-image pack riding the existing promo-text +
                  SH1 share-image endpoints. All data already in scope; the handle resolves
                  inside SocialKitCard from the cached auth user. */}
              <div style={chanCardStyle}>
                <div style={chanHeadStyle}>
                  <Sparkles style={{ width: 12, height: 12, color: MID }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Social</span>
                </div>
                <SocialKitCard
                  tripTitle={tripTitle}
                  destination={trip?.destination || null}
                  experienceType={tripExperienceType}
                  days={days}
                  listing={isAuthoring && listing?.id ? { id: listing.id, status: (listing as any).status } : null}
                  directLink={directLink}
                />
                <div style={{ padding: "0 12px 12px" }}>
                  <button
                    onClick={() => safeNavigate(`/expert/content-studio?prefill=1&title=${encodeURIComponent(tripTitle)}&destination=${encodeURIComponent(trip?.destination ?? "")}${isAuthoring && listing?.id ? `&targetType=ready_made&targetId=${listing.id}` : ""}`)}
                    data-testid="button-distribute-social-studio"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: MID, fontWeight: 600 }}
                  >
                    Open Content Studio →
                  </button>
                </div>
              </div>

              {/* P2-15: earnings have ONE home — the Money module. */}
              <button onClick={() => safeNavigate("/expert/money")} data-testid="link-view-earnings" style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: MID, fontWeight: 600 }}>
                View earnings →
              </button>
            </div>
          )}

          {/* ── Build notes (private) — compact collapsible card (P2-17) ── */}
          <div style={{ borderTop: `1px solid ${LINE}`, flexShrink: 0 }}>
            <button
              onClick={() => setNotesOpen(o => !o)}
              data-testid="button-toggle-build-notes"
              style={{ width: "100%", padding: "8px 12px", background: CARD, border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <StickyNote style={{ width: 12, height: 12, color: MID }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Build notes (private)</span>
              <Lock style={{ width: 9, height: 9, color: FAINT }} />
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                {noteSaveStatus === "saving" && (
                  <span data-testid="text-notes-saving" style={{ fontSize: 10, color: MID, display: "flex", alignItems: "center", gap: 3 }}>
                    <Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> Saving…
                  </span>
                )}
                {noteSaveStatus === "saved" && (
                  <span data-testid="text-notes-saved" style={{ fontSize: 10, color: OK, display: "flex", alignItems: "center", gap: 3 }}>
                    <CheckCircle style={{ width: 9, height: 9 }} /> Saved
                  </span>
                )}
                {noteSaveStatus === "idle" && lastSavedAt && (
                  <span data-testid="text-notes-last-saved" style={{ fontSize: 10, color: MID, display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock style={{ width: 9, height: 9 }} /> {formatRelativeTime(lastSavedAt)}
                  </span>
                )}
                <span style={{ display: "flex", color: FAINT }}>
                  {notesOpen ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronUp style={{ width: 12, height: 12 }} />}
                </span>
              </span>
            </button>
            {notesOpen && (
              <div style={{ padding: "0 12px 10px" }}>
                <textarea
                  value={noteText}
                  onChange={e => handleNoteChange(e.target.value)}
                  placeholder={isAuthoring ? "Notes to yourself about this build — what to add, what to verify, what to avoid…" : "Add private notes about this client, their preferences, things to avoid..."}
                  data-testid="textarea-expert-notes"
                  style={{ width: "100%", minHeight: 64, padding: "6px 9px", fontSize: 11.5, color: INK, lineHeight: 1.55, background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as any }}
                />
                <div style={{ fontSize: 10, color: FAINT, marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                  <Lock style={{ width: 9, height: 9 }} /> Only you can see this
                </div>
              </div>
            )}
          </div>

          {/* ── Expert Notes (traveler-visible) — CLAUDE.md §21 (ratified Aug 9, 2026). Directly
              adjacent to Build notes (private) above; mirrors that card's own collapsible/
              save-status/debounce pattern exactly, but writes trips.expert_traveler_note (via
              the sibling server's PATCH /expert-traveler-note) — a DIFFERENT column from the
              private trips.expert_notes card above, delivered to the traveler rather than kept
              back. ── */}
          <div style={{ borderTop: `1px solid ${LINE}`, flexShrink: 0 }} data-testid="card-trip-expert-note">
            <button
              onClick={() => setTravelerNotesOpen(o => !o)}
              data-testid="button-toggle-trip-expert-note"
              style={{ width: "100%", padding: "8px 12px", background: CARD, border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <Eye style={{ width: 12, height: 12, color: MID }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Expert Notes</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                {travelerNoteSaveStatus === "saving" && (
                  <span data-testid="text-trip-expert-note-saving" style={{ fontSize: 10, color: MID, display: "flex", alignItems: "center", gap: 3 }}>
                    <Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> Saving…
                  </span>
                )}
                {travelerNoteSaveStatus === "saved" && (
                  <span data-testid="text-trip-expert-note-saved" style={{ fontSize: 10, color: OK, display: "flex", alignItems: "center", gap: 3 }}>
                    <CheckCircle style={{ width: 9, height: 9 }} /> Saved
                  </span>
                )}
                {travelerNoteSaveStatus === "idle" && travelerNoteLastSavedAt && (
                  <span data-testid="text-trip-expert-note-last-saved" style={{ fontSize: 10, color: MID, display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock style={{ width: 9, height: 9 }} /> {formatRelativeTime(travelerNoteLastSavedAt)}
                  </span>
                )}
                <span style={{ display: "flex", color: FAINT }}>
                  {travelerNotesOpen ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronUp style={{ width: 12, height: 12 }} />}
                </span>
              </span>
            </button>
            {travelerNotesOpen && (
              <div style={{ padding: "0 12px 10px" }}>
                <div style={{ fontSize: 10, color: FAINT, marginBottom: 4 }}>Delivered with the plan — visible to your traveler</div>
                <textarea
                  value={travelerNoteText}
                  onChange={e => handleTravelerNoteChange(e.target.value)}
                  placeholder="A note that ships with the plan — arrival tips, what to expect, how to reach you…"
                  data-testid="input-trip-expert-note"
                  style={{ width: "100%", minHeight: 64, padding: "6px 9px", fontSize: 11.5, color: INK, lineHeight: 1.55, background: GROUND, border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as any }}
                />
                <div style={{ fontSize: 10, color: FAINT, marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                  <Eye style={{ width: 9, height: 9 }} /> Your traveler will see this
                </div>
              </div>
            )}
          </div>

          {/* ── Persistent dist-strip (P2-9): channel state, derived from REAL state only ── */}
          <div style={{ borderTop: `1px solid ${LINE}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 0, background: CARD }} data-testid="dist-strip">
            <span style={{ fontSize: 11.5, color: MID }}>Distribute:</span>
            {distChips.map(c => <StateChip key={`strip-${c.testId}`} tone={c.tone} testId={`strip-${c.testId}`}>{c.label}</StateChip>)}
          </div>
        </aside>
      </div>
    </div>
    </ExpertLayout>
  );
}
