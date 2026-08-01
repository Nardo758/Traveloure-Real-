import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { PlanCard } from "@/components/plancard/PlanCard";
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
import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import {
  MapPin, ChevronRight, ChevronDown, ChevronUp, Pencil, Sparkles, Link2, PenSquare,
  Send, MessageSquare, Plus, Lock, Eye, EyeOff,
  FileText, CheckCircle, Clock, StickyNote, X, ShieldCheck, ExternalLink, User, Mail,
  CreditCard, CalendarDays, Loader2, ArrowLeft, Users,
  Search, Star, MapPinned, Shield, BatteryLow,
  ShoppingBag, Store, Copy, Megaphone, AlertTriangle, Lightbulb, XCircle,
  Trash2, RefreshCw, Route,
} from "lucide-react";
// L4b: the mode picker's chauffeured-field gate mirrors the SAME shared constant/predicate the
// server uses (CLAUDE.md §18's chauffeured set) — never a hand-typed duplicate list.
import { CHAUFFEURED_MODES, isChauffeuredMode } from "@shared/trip-plan";
import { TRANSPORT_MODE_ICONS, TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { parseApiErrorMessage } from "@/lib/api-error";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

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

function BookingBriefModal({ provider, bookingUrl, tripId, onClose }: { provider: string; bookingUrl?: string; tripId: string; onClose: () => void }) {
  const { data: profile, isLoading } = useQuery<TravelerProfile>({
    queryKey: [`/api/trips/${tripId}/traveler-profile`],
    enabled: !!tripId,
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
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: CARD, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: BRAND_SOFT, display: "flex", alignItems: "center", justifyContent: "center" }}><ShieldCheck style={{ width: 16, height: 16, color: BRAND }} /></div>
            <div><div style={{ fontSize: 14, fontWeight: 700, color: INK }}>Booking Brief</div><div style={{ fontSize: 11, color: MID }}>Secure client details for {provider}</div></div>
          </div>
          <button onClick={onClose} data-testid="button-close-booking-brief" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 4, display: "flex" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
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
        <div style={{ padding: "14px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btnQuietStyle, flex: 1, padding: "8px", fontSize: 13, color: MID }}>Cancel</button>
          <button onClick={handleContinue} data-testid="button-confirm-booking" style={{ ...btnPrimaryStyle, flex: 2, padding: "8px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ExternalLink style={{ width: 13, height: 13 }} /> Continue to {provider}
          </button>
        </div>
      </div>
    </div>
  );
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
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Item added", description: `Added to Day ${dayNumber}` });
      setForm({ title: "", itemType: "activity", startTime: "", estimatedCost: "", locationName: "" });
    },
    onError: (err: any) => toast({ title: "Failed to add item", description: parseApiErrorMessage(err, "Please check the fields and try again."), variant: "destructive" }),
  });
  // FIX 4 (QA pass): geocode-on-add, never fabricate. A custom item previously carried no
  // coordinates at all — this leaves it unroutable (no transport legs, no map pin) forever.
  // We now try the existing /api/geocode rail (same one the destination map-center lookup
  // above uses) with "<locationName>, <destination>" when a location name was typed. On
  // success we attach real latitude/longitude (as STRINGS — decimal DB columns, matching the
  // platform-services add path). On any failure/miss we submit exactly as before: no coords,
  // honest null — never a city-center guess. Geocoding is best-effort and must never block
  // the add.
  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    let coords: { latitude: string; longitude: string } | undefined;
    const locationName = form.locationName.trim();
    if (locationName) {
      setGeocoding(true);
      try {
        const address = destination ? `${locationName}, ${destination}` : locationName;
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
        if (res.ok) {
          const j = await res.json();
          if (Number.isFinite(j?.lat) && Number.isFinite(j?.lng)) {
            coords = { latitude: String(j.lat), longitude: String(j.lng) };
          }
        }
      } catch {
        // Geocode failure must not block the add — submit without coords, exactly as today.
      } finally {
        setGeocoding(false);
      }
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
          <input value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))} placeholder="Venue name" data-testid="input-inline-add-location" style={inputStyle} />
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
  tripId, dayNumber, providerName, onAdded, onClose,
}: { tripId: string; dayNumber: number; providerName: string; onAdded: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", startTime: "", estimatedCost: "", locationName: "" });
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
  const handleSubmit = () => {
    if (!form.title.trim()) return;
    createMutation.mutate({
      title: form.title.trim(),
      itemType: "activity",
      dayNumber,
      startTime: form.startTime || undefined,
      estimatedCost: form.estimatedCost ? String(parseFloat(form.estimatedCost)) : undefined,
      locationName: form.locationName.trim() || undefined,
      description: `Booked via ${providerName}`,
      bookingStatus: "confirmed",
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
        <input value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))} placeholder="Meeting point" data-testid="input-log-booking-location" style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onClose} data-testid="button-log-booking-cancel" style={{ ...btnQuietStyle, flex: 1, padding: "6px", fontSize: 12 }}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!form.title.trim() || createMutation.isPending}
          data-testid="button-log-booking-confirm"
          style={{ ...btnPrimaryStyle, flex: 2, padding: "6px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: !form.title.trim() || createMutation.isPending ? 0.6 : 1 }}
        >
          {createMutation.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <CheckCircle style={{ width: 12, height: 12 }} />} Log booking
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

/** A-2 / C-1 (Workstation audit): the canvas item editor. Collapsible, day-grouped list of
 *  every item on the build with a "Move to day" select (A-2) and an "Expert note" textarea
 *  (C-1b — the traveler-visible tip, distinct from the private Build notes sidebar). Both
 *  write through the existing PATCH /api/trips/:tripId/itinerary-items/:itemId endpoint
 *  (trips.routes.ts) — no new server surface for A-2; C-1's server change is the read-side
 *  column preference in plancard.routes.ts. */
function ItemsEditorPanel({
  tripId, days, maxDay, onDayMoved, onOpenBookingBrief,
}: {
  tripId: string;
  days: { dayNumber: number; items: ItineraryItem[] }[];
  maxDay: number;
  onDayMoved: () => void;
  // W3-A: opens the shared BookingBriefModal for a partner-sourced item. The item's mere
  // presence here is the gate itself — on an assignment trip a partner item ONLY reaches
  // itinerary_items via an approved suggestion (partner-catalog-picker.tsx never creates the
  // item directly there), so any row this panel can show is already either author-owned or
  // client-approved. Nothing here needs to re-check approval state.
  onOpenBookingBrief: (network: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

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
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {allItems.map(item => {
            const isExpanded = expandedId === item.id;
            const draftNote = noteDrafts[item.id] ?? (item.expertNote ?? "");
            // W3-A: an item carrying the "Partner: <Network>" marker (written by
            // partner-catalog-picker.tsx) gets a Booking Brief entry point. Its presence in
            // `days`/`allItems` at all IS the gate — see the prop comment above.
            const partnerSource = parsePartnerSource(item.description);
            return (
              <div key={item.id} data-testid={`item-editor-row-${item.id}`} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StateChip tone="mut">Day {item.dayNumber}</StateChip>
                  {partnerSource && <StateChip tone="brand">{partnerSource.network}</StateChip>}
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
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
                    {partnerSource && (
                      <button
                        onClick={() => onOpenBookingBrief(partnerSource.network)}
                        data-testid={`button-booking-brief-${item.id}`}
                        style={{ ...btnQuietStyle, alignSelf: "flex-start", padding: "5px 12px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}
                      >
                        <ShieldCheck style={{ width: 12, height: 12 }} /> Booking Brief — {partnerSource.network}
                      </button>
                    )}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

export default function ExpertWorkspace() {
  const { tripId } = useParams<{ tripId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Panel tabs are exactly Add · AI Gaps · Distribute (v9 spec :264). "add" is the
  // assignment-mode default; authoring mode defaults to "distribute" once the mode resolves.
  const [rightTab, setRightTab] = useState("add");
  // Add-panel source pill (§17 "Add panel = the Central Content network").
  const [addSource, setAddSource] = useState("dmo");
  const [cat, setCat] = useState("all");
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
  const [bookingBrief, setBookingBrief] = useState<{ provider: string; bookingUrl?: string } | null>(null);
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

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(browseQuery), 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [browseQuery]);

  // ── Data fetching ──
  // Mode resolution is the SERVER's call (ready-made brief §2): assignment (an advisor row exists)
  // vs authoring (this expert is the trip's author). The client never infers it from a role string.
  const { data: workspaceCtx, isLoading: ctxLoading } = useQuery<{
    mode: "assignment" | "authoring";
    trip: any;
    listing?: ReadyMadeListing | null;
  }>({
    queryKey: [`/api/expert/workspace-context/${tripId}`],
    enabled: !!tripId,
    retry: false,
  });
  const isAuthoring = workspaceCtx?.mode === "authoring";
  const listing = (workspaceCtx?.listing ?? null) as ReadyMadeListing | null;

  // Authoring opens on Distribute (the ship-it surface); guarded by a ref so it lands once
  // and never yanks the panel back while the author is working elsewhere.
  const authoringTabDefaulted = useRef(false);
  useEffect(() => {
    if (isAuthoring && !authoringTabDefaulted.current) {
      authoringTabDefaulted.current = true;
      setRightTab("distribute");
    }
  }, [isAuthoring]);

  const { data: assignedTrips, isLoading: tripsLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    enabled: !isAuthoring, // an authoring trip is never in the assignment list (it has no advisor row)
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
  // Shape the context's trip row into the same view model the whole page already reads.
  const trip: AssignedTrip | undefined = assignedTrip ?? (isAuthoring && workspaceCtx?.trip ? {
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

  const { data: itineraryData, isLoading: itemsLoading } = useQuery<ItineraryData>({
    queryKey: [`/api/trips/${tripId}/itinerary-items`],
    enabled: !!tripId,
  });

  const { data: assignment, isLoading: assignmentLoading } = useQuery<MyAssignment>({
    queryKey: [`/api/trips/${tripId}/my-assignment`],
    enabled: !!tripId && !isAuthoring,
  });

  const { data: expertNotesData } = useQuery<{ expertNotes: string }>({
    queryKey: [`/api/trips/${tripId}/expert-notes`],
    enabled: !!tripId,
  });

  const { data: workspaceConstraints, isLoading: constraintsLoading } = useQuery<WorkspaceConstraints>({
    queryKey: [`/api/trips/${tripId}/workspace-constraints`],
    enabled: !!tripId,
    staleTime: 30 * 1000,
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
    enabled: !!tripId && isEvent,
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

  const energyCalcRef = useRef(false);
  const energyRecalcInFlight = useRef(false);
  const triggerEnergyRecalc = useCallback(() => {
    if (!tripId || energyRecalcInFlight.current) return;
    energyRecalcInFlight.current = true;
    apiRequest("POST", `/api/trips/${tripId}/calculate-energy`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .catch(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .finally(() => { energyRecalcInFlight.current = false; });
  }, [tripId]);

  useEffect(() => {
    if (!tripId || energyCalcRef.current) return;
    energyCalcRef.current = true;
    apiRequest("POST", `/api/trips/${tripId}/calculate-energy`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/workspace-constraints`] }))
      .catch(() => {});
  }, [tripId]);

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
      noteInitialized.current = true;
    }
  }, [expertNotesData]);

  // ── Browse: geocode destination for map center ──
  const destination = (trip as any)?.destination || "";
  const { data: geocodeData } = useQuery<{ lat: number; lng: number }>({
    queryKey: ["/api/geocode", destination],
    queryFn: async () => {
      // 404/errors return a JSON error body — must NOT flow into geocodeData, or the
      // map receives a non-LatLng object as `center` and vis.gl throws obj.toJSON().
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(destination)}`);
      if (!res.ok) return null;
      const j = await res.json();
      return Number.isFinite(j?.lat) && Number.isFinite(j?.lng) ? j : null;
    },
    enabled: !!destination && rightTab === "add" && addSource === "platform",
    staleTime: Infinity,
  });

  // ── Browse: live experience search (lives under the Add panel's "Platform services" pill) ──
  const searchEnabled = rightTab === "add" && addSource === "platform" && !!(debouncedQuery || destination);
  const { data: searchData, isFetching: searchFetching } = useQuery<{ results: any[]; count: number }>({
    queryKey: ["/api/search/experiences", debouncedQuery, destination, cat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (destination) params.set("destination", destination);
      if (cat && cat !== "all") params.set("category", cat);
      return fetch(`/api/search/experiences?${params}`).then(r => r.json());
    },
    enabled: searchEnabled,
    staleTime: 2 * 60 * 1000,
  });
  const searchResults = searchData?.results || [];
  const mapCenter = (Number.isFinite((geocodeData as any)?.lat) && Number.isFinite((geocodeData as any)?.lng))
    ? geocodeData!
    : { lat: 35.6762, lng: 139.6503 };

  // ── Browse: add result to itinerary (day-aware — targets the focused day) ──
  const addFromSearchMutation = useMutation({
    mutationFn: async (result: any) => {
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
        dayNumber: focusDay,
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
      };
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, body);
      return res.json();
    },
    onSuccess: (_, result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/commission`] });
      triggerEnergyRecalc();
      toast({ title: "Added to itinerary", description: `${result.name} → Day ${focusDay}` });
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
      const current = assignment.workspaceStatus || "draft";
      const next = current === "draft" ? "in_review" : "delivered";
      const res = await apiRequest("PATCH", `/api/expert/assignments/${assignment.id}/workspace-status`, { workspaceStatus: next });
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
    onSuccess: () => {
      setNoteSaveStatus("saved");
      setLastSavedAt(new Date());
      const t = setTimeout(() => setNoteSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    },
    onError: () => setNoteSaveStatus("idle"),
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

  // ── beforeunload guard: warn on tab close / refresh while save is pending ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (noteSaveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [noteSaveStatus]);

  // ── popstate guard: intercept browser back/forward while save is pending ──
  useEffect(() => {
    if (noteSaveStatus !== "saving") return;

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
  }, [noteSaveStatus]);

  // ── safeNavigate: intercept in-app navigation while save is pending ──
  const safeNavigate = (path: string) => {
    if (noteSaveStatus === "saving") {
      const confirmed = window.confirm("Your notes haven't been saved yet. Leave anyway?");
      if (!confirmed) return;
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

  const isLoading = ctxLoading || (!isAuthoring && (tripsLoading || assignmentLoading));

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
        <input
          value={newBuildDest}
          onChange={e => setNewBuildDest(e.target.value)}
          placeholder="Where is this build for? (default: Kyoto)"
          data-testid="input-new-build-destination"
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
  const chanCardStyle: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" };
  const chanHeadStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 6, background: GROUND };

  return (
    <ExpertLayout title="Workspace">
    {/* Sized against the shell's 52px sticky header so the builder owns its own scrolling
        (internal panes scroll; the shell's <main> never double-scrolls). */}
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", background: GROUND, overflow: "hidden" }}>
      {bookingBrief && tripId && (
        <BookingBriefModal provider={bookingBrief.provider} bookingUrl={bookingBrief.bookingUrl} tripId={tripId} onClose={() => setBookingBrief(null)} />
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
          <input
            value={destDraft}
            autoFocus
            onChange={e => setDestDraft(e.target.value)}
            onBlur={commitDestination}
            onKeyDown={e => { if (e.key === "Enter") commitDestination(); if (e.key === "Escape") setEditingDest(false); }}
            data-testid="input-build-destination"
            placeholder="Destination city"
            style={{ fontSize: 12, color: INK, border: `1.5px solid ${LINE}`, borderRadius: 999, padding: "2px 10px", outline: "none", background: CARD, width: 150 }}
          />
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
                  onDayMoved={triggerEnergyRecalc}
                  onOpenBookingBrief={(network) => setBookingBrief({ provider: network, bookingUrl: resolvePartnerBookingUrl(network) })}
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
              { k: "gaps", l: totalConstraintIssues > 0 ? `AI Gaps (${totalConstraintIssues})` : "AI Gaps" },
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
                    data-testid={`pill-add-${s.k}`}
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
              <DmoPickerCore tripId={tripId!} dayNumber={focusDay} onAdded={triggerEnergyRecalc} />
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

              {/* Map — browse surface (lives ONLY here, P2-18). D-1 (Workstation audit):
                  wrapped in a section-local error boundary — Maps can throw at mount
                  (billing/key errors) and must not blank the results list below it. */}
              <div style={{ height: 220, flexShrink: 0, position: "relative" }}>
                <MapSectionErrorBoundary>
                {MAPS_KEY ? (
                  <APIProvider apiKey={MAPS_KEY}>
                    <Map
                      mapId="browse-map"
                      defaultCenter={mapCenter}
                      center={mapCenter}
                      defaultZoom={13}
                      gestureHandling="greedy"
                      disableDefaultUI={true}
                      style={{ width: "100%", height: "100%" }}
                      onClick={() => setSelectedPin(null)}
                    >
                      {searchResults.filter(r => r.location?.lat).map((result: any) => (
                        <AdvancedMarker
                          key={result.id}
                          position={{ lat: result.location.lat, lng: result.location.lng }}
                          onClick={() => setSelectedPin(result)}
                        >
                          <div style={{ background: "var(--console-brand)", color: "var(--console-card)", borderRadius: 20, padding: "3px 8px", fontSize: 11, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.3)", border: selectedPin?.id === result.id ? `2px solid var(--console-card)` : "none", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {result.name.length > 16 ? result.name.slice(0, 16) + "…" : result.name}
                          </div>
                        </AdvancedMarker>
                      ))}

                      {selectedPin && selectedPin.location?.lat && (
                        <InfoWindow
                          position={{ lat: selectedPin.location.lat, lng: selectedPin.location.lng }}
                          onCloseClick={() => setSelectedPin(null)}
                        >
                          <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 180, maxWidth: 220 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 3 }}>{selectedPin.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              {selectedPin.rating && (
                                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: WARN, fontWeight: 600 }}>
                                  <Star style={{ width: 11, height: 11 }} /> {selectedPin.rating}
                                  {selectedPin.reviewCount && <span style={{ color: FAINT, fontWeight: 400 }}>({selectedPin.reviewCount.toLocaleString()})</span>}
                                </span>
                              )}
                              {selectedPin.priceLabel && <span style={{ fontSize: 11, color: MID, background: GROUND, padding: "1px 5px", borderRadius: 4 }}>{selectedPin.priceLabel}</span>}
                            </div>
                            {selectedPin.address && <div style={{ fontSize: 11, color: MID, marginBottom: 7, lineHeight: 1.4 }}>{selectedPin.address}</div>}
                            <div style={{ display: "flex", gap: 5 }}>
                              <button
                                onClick={() => addFromSearchMutation.mutate(selectedPin)}
                                disabled={addFromSearchMutation.isPending}
                                data-testid={`button-add-from-map-${selectedPin.id}`}
                                style={{ ...btnPrimaryStyle, flex: 1, padding: "5px 8px", borderRadius: 7, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                              >
                                {addFromSearchMutation.isPending ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Plus style={{ width: 11, height: 11 }} />}
                                + Day {focusDay}
                              </button>
                              {selectedPin.mapsUrl && (
                                <a href={selectedPin.mapsUrl} target="_blank" rel="noopener noreferrer">
                                  <button data-testid={`button-maps-link-${selectedPin.id}`} style={{ ...btnQuietStyle, padding: "5px 8px", borderRadius: 7, fontSize: 12, display: "flex", alignItems: "center", gap: 3, color: MID }}>
                                    <MapPinned style={{ width: 11, height: 11 }} />
                                  </button>
                                </a>
                              )}
                            </div>
                          </div>
                        </InfoWindow>
                      )}
                    </Map>
                  </APIProvider>
                ) : (
                  <div style={{ height: "100%", background: GROUND, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                    <MapPin style={{ width: 24, height: 24, color: FAINT }} />
                    <span style={{ fontSize: 12, color: MID }}>Map unavailable</span>
                  </div>
                )}
                </MapSectionErrorBoundary>
                {searchResults.filter((r: any) => r.location?.lat).length > 0 && (
                  <div style={{ position: "absolute", bottom: 8, left: 8, background: CARD, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 600, color: INK, boxShadow: "0 1px 4px rgba(0,0,0,0.2)", zIndex: 10 }}>
                    {searchResults.filter((r: any) => r.location?.lat).length} pins
                  </div>
                )}
              </div>

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
                            onClick={e => { e.stopPropagation(); addFromSearchMutation.mutate(result); }}
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
                        onClick={() => setBookingBrief({ provider: aff.name, bookingUrl: aff.websiteUrl })}
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
