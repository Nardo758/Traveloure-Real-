import { useState, useEffect, useRef, useCallback } from "react";
import { PlanCard } from "@/components/plancard/PlanCard";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";
import type { PlanCardDay, PlanCardActivity } from "@/components/plancard/plancard-types";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DmoPickerModal } from "@/components/expert/dmo-picker-modal";
import { ServicePickerModal } from "@/components/expert/service-picker-modal";
import ReadyMadeListingPanel, { type ReadyMadeListing } from "@/components/expert/ready-made-listing-panel";
import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import {
  Menu, Bell, MapPin, ChevronRight, Pencil, Sparkles, Link2, PenSquare,
  AlertTriangle, Send, MessageSquare, Plus, Filter, Zap,
  Navigation, Lock, Eye, EyeOff,
  FileText, DollarSign, CheckCircle, Clock,
  TrendingUp, StickyNote, X, ShieldCheck, ExternalLink, User, Mail,
  Phone, CreditCard, CalendarDays, Loader2, ArrowLeft, Users,
  Search, Star, MapPinned, Activity, Battery, Shield, BatteryLow,
  ShoppingBag, Store,
} from "lucide-react";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const P = "#FF385C";
const G: Record<number, string> = {
  50: "#F9FAFB", 100: "#F3F4F6", 200: "#E5E7EB", 300: "#D1D5DB",
  400: "#9CA3AF", 500: "#6B7280", 600: "#4B5563", 700: "#374151", 900: "#111827", // fee-literal-ok: color palette shade, not fee config
};

function Av({ i, s = 32 }: { i: string; s?: number }) {
  return (
    <div style={{ width: s, height: s, borderRadius: "50%", background: "linear-gradient(135deg,#FF385C,#FF6B8A)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: s * 0.35, fontWeight: 600, flexShrink: 0 }}>{i}</div>
  );
}

function Bdg({ children, c = "gray" }: { children: any; c?: string }) {
  const m: any = {
    gray: { bg: G[100], tx: G[600] }, amber: { bg: "#FEF3C7", tx: "#B45309" },
    green: { bg: "#BBF7D0", tx: "#15803D" }, rose: { bg: "#FFE4E6", tx: "#BE123C" },
    violet: { bg: "#EDE9FE", tx: "#7C3AED" }, blue: { bg: "#DBEAFE", tx: "#2563EB" },
    primary: { bg: P + "18", tx: P }, teal: { bg: "#CCFBF1", tx: "#0F766E" },
  };
  const col = m[c] || m.gray;
  return <span style={{ background: col.bg, color: col.tx, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 3 }}>{children}</span>;
}

function Chip({ children, active = false, onClick }: any) {
  return <button data-testid={`chip-${String(children).toLowerCase().replace(/[^a-z0-9]/g, "-")}`} onClick={onClick} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 500, cursor: "pointer", border: active ? `1.5px solid ${P}` : `1.5px solid ${G[200]}`, background: active ? `${P}0F` : "white", color: active ? P : G[600] }}>{children}</button>;
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
  { key: "draft", label: "Draft", icon: <FileText style={{ width: 11, height: 11 }} /> },
  { key: "in_review", label: "Expert Review", icon: <Eye style={{ width: 11, height: 11 }} /> },
  { key: "delivered", label: "Confirmed", icon: <CheckCircle style={{ width: 11, height: 11 }} /> },
];

function ApprovalBar({ current, onSubmit, isPending }: { current: string; onSubmit: () => void; isPending: boolean }) {
  const idx = STEPS.findIndex(s => s.key === current);
  const effectiveIdx = idx === -1 ? 0 : idx;
  return (
    <div style={{ background: "white", borderBottom: `1px solid ${G[200]}`, padding: "7px 18px", display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
      {STEPS.map((s, i) => {
        const done = i < effectiveIdx, active = i === effectiveIdx, future = i > effectiveIdx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "auto" as any }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px 3px 6px", borderRadius: 99, background: active ? `${P}12` : done ? "#F0FDF4" : "transparent", border: active ? `1.5px solid ${P}40` : done ? "1.5px solid #86EFAC" : "1.5px solid transparent" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: active ? P : done ? "#22C55E" : "white", border: future ? `1.5px solid ${G[300]}` : "none", color: active || done ? "white" : G[400], flexShrink: 0 }}>
                {done ? <CheckCircle style={{ width: 11, height: 11 }} /> : s.icon}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? P : done ? "#15803D" : G[400], whiteSpace: "nowrap" }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < effectiveIdx ? "#86EFAC" : G[200], margin: "0 2px" }} />}
          </div>
        );
      })}
      {current !== "delivered" && (
        <button onClick={onSubmit} disabled={isPending} data-testid="button-submit-approval" style={{ marginLeft: 12, padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: P, color: "white", border: "none", cursor: isPending ? "not-allowed" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4, opacity: isPending ? 0.7 : 1 }}>
          {isPending ? <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" /> : <Send style={{ width: 10, height: 10 }} />}
          {current === "draft" ? "Submit for Review" : "Mark Delivered"}
        </button>
      )}
    </div>
  );
}

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

  const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const rows = profile ? [
    { icon: <User style={{ width: 13, height: 13 }} />, label: "Booking name", value: profile.travelerName },
    { icon: <Mail style={{ width: 13, height: 13 }} />, label: "Contact email", value: profile.travelerEmail || "Not on file" },
    { icon: <MapPin style={{ width: 13, height: 13 }} />, label: "Destination", value: profile.destination },
    { icon: <CalendarDays style={{ width: 13, height: 13 }} />, label: "Travel dates", value: `${formatDate(profile.startDate)} → ${formatDate(profile.endDate)}` },
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
      <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${G[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${P}15`, display: "flex", alignItems: "center", justifyContent: "center" }}><ShieldCheck style={{ width: 16, height: 16, color: P }} /></div>
            <div><div style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>Booking Brief</div><div style={{ fontSize: 11, color: G[500] }}>Secure client details for {provider}</div></div>
          </div>
          <button onClick={onClose} data-testid="button-close-booking-brief" style={{ background: "none", border: "none", cursor: "pointer", color: G[400], padding: 4, display: "flex" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <div style={{ margin: "12px 18px 0", padding: "8px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Lock style={{ width: 13, height: 13, color: "#2563EB", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: "#1D4ED8", lineHeight: 1.5 }}>Booking context only. Use these details to complete your client's reservation. Do not save or share with unrelated third parties.</span>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {isLoading ? (
            <>
              <div style={{ height: 44, background: G[100], borderRadius: 8, animation: "pulse 1.5s infinite" }} />
              <div style={{ height: 44, background: G[100], borderRadius: 8, animation: "pulse 1.5s infinite" }} />
              <div style={{ height: 44, background: G[100], borderRadius: 8, animation: "pulse 1.5s infinite" }} />
            </>
          ) : rows.map((row, i) => (
            <div key={i} data-testid={`booking-brief-row-${row.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: G[50], borderRadius: 8, border: `1px solid ${G[200]}` }}>
              <div style={{ color: G[400], flexShrink: 0 }}>{row.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: row.value === "Not on file" ? G[400] : G[900] }}>{row.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${G[200]}`, background: "white", fontSize: 13, fontWeight: 600, color: G[600], cursor: "pointer" }}>Cancel</button>
          <button onClick={handleContinue} data-testid="button-confirm-booking" style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: P, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ExternalLink style={{ width: 13, height: 13 }} /> Continue to {provider}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddItemModal({ dayNumber, tripId, onClose, onItemAdded }: { dayNumber: number; tripId: string; onClose: () => void; onItemAdded: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", itemType: "activity", startTime: "", estimatedCost: "", locationName: "" });
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onItemAdded();
      toast({ title: "Item added", description: `Added to Day ${dayNumber}` });
      onClose();
    },
    onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
  });
  const handleSubmit = () => {
    if (!form.title.trim()) return;
    createMutation.mutate({ ...form, dayNumber, estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : undefined });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${G[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: G[900] }}>Add Item — Day {dayNumber}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: G[400] }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: G[600], display: "block", marginBottom: 4 }}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senso-ji Temple visit" data-testid="input-add-item-title" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G[600], display: "block", marginBottom: 4 }}>Type</label>
              <select value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))} data-testid="select-add-item-type" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13, background: "white" }}>
                <option value="activity">Activity</option>
                <option value="dining">Dining</option>
                <option value="hotel">Hotel</option>
                <option value="transport">Transport</option>
                <option value="culture">Culture</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G[600], display: "block", marginBottom: 4 }}>Start Time</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} data-testid="input-add-item-time" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13 }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G[600], display: "block", marginBottom: 4 }}>Location</label>
              <input value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))} placeholder="Venue name" data-testid="input-add-item-location" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G[600], display: "block", marginBottom: 4 }}>Est. Cost (USD)</label>
              <input type="number" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="0" data-testid="input-add-item-cost" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13 }} />
            </div>
          </div>
        </div>
        <div style={{ padding: "0 18px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1.5px solid ${G[200]}`, background: "white", fontSize: 13, fontWeight: 600, color: G[600], cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!form.title.trim() || createMutation.isPending} data-testid="button-add-item-confirm" style={{ flex: 2, padding: "9px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {createMutation.isPending ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Plus style={{ width: 13, height: 13 }} />} Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssignedTrip {
  trip_id: string; trip_title: string; destination: string;
  start_date: string; end_date: string; traveler_name: string;
  status: string; assigned_at: string; suggestion_count: number;
}
interface ItineraryItem {
  id: string; title: string; itemType: string; status: string; dayNumber: number;
  startTime?: string | null; estimatedCost?: string | null; locationName?: string | null;
  bookingStatus?: string | null; notes?: string | null;
}
interface ItineraryData { days: { dayNumber: number; items: ItineraryItem[] }[]; total: number; }
interface CommissionData {
  totalGross: string; expertShare: string; platformFee: string;
  revenueShareRate: number; itemCount: number;
  itemBreakdown: { id: string; title: string; dayNumber: number; cost: string; revenueShareRate: number; expertEarning: string; platformFee: string }[];
}
interface MyAssignment { id: string; tripId: string; localExpertId: string; status: string; workspaceStatus: string | null; message?: string | null; }

interface AnchorImpact { type: string; message: string; severity: 'warning' | 'critical'; }
interface AnchorConflict { anchorId: string; anchorType: string; description: string; impacts: AnchorImpact[]; }
interface EnergyRecord { dayNumber: number; startingEnergy: number; activityDepletion: number; endingEnergy: number; recoveryNeeded: boolean; recoveryReason?: string | null; }
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

const formatCost = (c?: string | null) => {
  if (!c || c === "0" || c === "0.00") return null;
  const n = parseFloat(c);
  return isNaN(n) ? null : `$${n.toLocaleString()}`;
};
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ExpertWorkspace() {
  const { tripId } = useParams<{ tripId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [rightTab, setRightTab] = useState("gaps");
  const [cat, setCat] = useState("all");
  const [cTab, setCTab] = useState("itinerary");
  const [mapSelectedDay, setMapSelectedDay] = useState(1); // LB-P5b: MapControlCenter day picker

  // Unowned-item fix: pulls active affiliate partners from the admin-editable
  // affiliate_partners table (LB-P4a made that table the source of truth).
  // Replaces the previous hardcoded 5-partner list whose "Connect" button
  // toasted "Coming soon" for any partner not in code.
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
  const [collapsed, setCollapsed] = useState(false);
  const [identityRevealed, setIdentityRevealed] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setNowTick] = useState(0);
  const noteInitialized = useRef(false);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookingBrief, setBookingBrief] = useState<{ provider: string; bookingUrl?: string } | null>(null);
  const [addingItemDay, setAddingItemDay] = useState<number | null>(null);
  const [dmoPickerDay, setDmoPickerDay] = useState<number | null>(null);
  const [servicePickerDay, setServicePickerDay] = useState<number | null>(null);

  // Browse / map search state
  const [browseQuery, setBrowseQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPin, setSelectedPin] = useState<any | null>(null);
  const [addToDay, setAddToDay] = useState<number>(1);
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

  // The listing is the first thing an author needs; open on it once the mode resolves. Guarded by a
  // ref so it lands once and never yanks the panel back while the author is working elsewhere.
  const authoringTabDefaulted = useRef(false);
  useEffect(() => {
    if (isAuthoring && !authoringTabDefaulted.current) {
      authoringTabDefaulted.current = true;
      setRightTab("listing");
    }
  }, [isAuthoring]);

  const { data: assignedTrips, isLoading: tripsLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    enabled: !isAuthoring, // an authoring trip is never in the assignment list (it has no advisor row)
  });
  const assignedTrip = assignedTrips?.find(t => t.trip_id === tripId);
  // Authoring trips carry userId=NULL and no traveler, so they cannot come from assigned-trips.
  // Shape the context's trip row into the same view model the whole page already reads.
  const trip: AssignedTrip | undefined = assignedTrip ?? (isAuthoring && workspaceCtx?.trip ? {
    trip_id: workspaceCtx.trip.id,
    trip_title: workspaceCtx.trip.title ?? "Untitled ready-made trip",
    destination: workspaceCtx.trip.destination ?? "",
    start_date: workspaceCtx.trip.startDate ?? "",
    end_date: workspaceCtx.trip.endDate ?? "",
    traveler_name: "", // there is no traveler — an authoring trip is built for sale, not for a client
    status: workspaceCtx.trip.status ?? "draft",
    assigned_at: "",
    suggestion_count: 0,
  } : undefined);

  const { data: itineraryData, isLoading: itemsLoading } = useQuery<ItineraryData>({
    queryKey: [`/api/trips/${tripId}/itinerary-items`],
    enabled: !!tripId,
  });

  // Assignment-only reads. In authoring mode there is no client booking to take commission on and
  // no advisory assignment to advance — the listing panel's fee-band preview is the earnings surface.
  const { data: commission, isLoading: commissionLoading } = useQuery<CommissionData>({
    queryKey: [`/api/trips/${tripId}/commission`],
    enabled: !!tripId && !isAuthoring,
  });

  const { data: assignment, isLoading: assignmentLoading } = useQuery<MyAssignment>({
    queryKey: [`/api/trips/${tripId}/my-assignment`],
    enabled: !!tripId && !isAuthoring,
  });

  const { data: providers } = useQuery<any[]>({
    queryKey: ["/api/provider/services", { status: "active" }],
    queryFn: () => fetch("/api/provider/services?status=active").then(r => r.json()),
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
  // A ready-made trip is built for sale with no traveler yet, so the Event Coord surface has
  // nothing to coordinate — suppress it in authoring mode rather than show an empty engagement.
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
    queryFn: () => fetch(`/api/geocode?address=${encodeURIComponent(destination)}`).then(r => r.json()),
    enabled: !!destination && rightTab === "browse",
    staleTime: Infinity,
  });

  // ── Browse: live experience search ──
  const searchEnabled = rightTab === "browse" && !!(debouncedQuery || destination);
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
  const mapCenter = geocodeData ?? { lat: 35.6762, lng: 139.6503 };

  // ── Browse: add result to itinerary ──
  const addFromSearchMutation = useMutation({
    mutationFn: async (result: any) => {
      const catToType: Record<string, string> = { dining: "dining", hotel: "hotel", culture: "culture", activity: "activity" };
      const body = {
        title: result.name,
        itemType: catToType[result.category] || "activity",
        dayNumber: addToDay,
        locationName: result.address || result.name,
        estimatedCost: result.priceLevel ? String(result.priceLevel * 30) : undefined,
        notes: result.mapsUrl ? `Google Maps: ${result.mapsUrl}` : undefined,
      };
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, body);
      return res.json();
    },
    onSuccess: (_, result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/commission`] });
      triggerEnergyRecalc();
      toast({ title: "Added to itinerary", description: `${result.name} → Day ${addToDay}` });
      setSelectedPin(null);
    },
    onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
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
  const days = itineraryData?.days || [];
  const totalItems = itineraryData?.total || 0;

  const anchorConflicts = workspaceConstraints?.anchorConflicts || [];
  const dayBoundaries = workspaceConstraints?.dayBoundaries || [];
  const energyTracking = workspaceConstraints?.energyTracking || [];
  const boundaryViolations = workspaceConstraints?.boundaryViolations || [];
  const optimizerScores = workspaceConstraints?.optimizerScores || null;
  const totalConstraintIssues = anchorConflicts.reduce((sum, c) => sum + c.impacts.length, 0) + energyTracking.filter(e => e.recoveryNeeded).length + boundaryViolations.length;

  const isLoading = ctxLoading || (!isAuthoring && (tripsLoading || assignmentLoading));

  // No trip open → a real launchpad (not a dead-end): open a client trip to plan, or start creating.
  if (!tripId) {
    const homeCards: Array<{ title: string; desc: string; href: string; icon: any; primary?: boolean }> = [
      { title: "Assigned Trips", desc: "Open a client trip to build its itinerary", href: "/expert/assigned-trips", icon: MapPin, primary: true },
      { title: "Store Listings", desc: "Build trips & plans to sell in the Ready Made Trips store", href: "/expert/ready-made", icon: Store },
      { title: "Itinerary Templates", desc: "Manage your existing store itineraries", href: "/expert/templates", icon: FileText },
      { title: "DMO Library", desc: "Research Kyoto content to build from", href: "/expert/dmo-library", icon: Search },
      { title: "Content Studio", desc: "Create promo & social content", href: "/expert/content-studio", icon: Sparkles },
    ];
    return (
      <main style={{ padding: "40px 24px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <PenSquare style={{ width: 24, height: 24, color: P }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: G[900], margin: 0 }}>Expert workspace</h1>
        </div>
        <div style={{ fontSize: 14, color: G[500], marginBottom: 24 }}>
          Open an assigned client trip to build its itinerary — or jump straight into creating.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {homeCards.map((c) => (
            <button
              key={c.href}
              onClick={() => setLocation(c.href)}
              data-testid={`workspace-home-${c.title.toLowerCase().replace(/\s+/g, "-")}`}
              style={{
                textAlign: "left", cursor: "pointer", padding: 18, borderRadius: 14,
                border: `1px solid ${c.primary ? P : G[200]}`,
                background: c.primary ? `${P}0A` : "white",
                display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${P}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <c.icon style={{ width: 18, height: 18, color: P }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: G[900] }}>{c.title}</span>
              <span style={{ fontSize: 12.5, color: G[500], lineHeight: 1.45 }}>{c.desc}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (isLoading) return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, margin: "0 auto" }}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );

  if (!trip && !tripsLoading && !ctxLoading) return (
    <main style={{ padding: 40, textAlign: "center" }}>
      <Users style={{ width: 48, height: 48, color: G[300], margin: "0 auto 16px" }} />
      <h1 style={{ fontSize: 18, fontWeight: 600, color: G[900], margin: "0 0 8px" }}>Trip not found</h1>
      <div style={{ fontSize: 14, color: G[500], marginBottom: 20 }}>This trip isn't assigned to you, you didn't author it, or it no longer exists.</div>
      <button onClick={() => safeNavigate("/expert/assigned-trips")} data-testid="button-back-assigned" style={{ padding: "8px 20px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>View Assigned Trips</button>
    </main>
  );

  const tripTitle = trip?.trip_title || trip?.destination || `Trip ${tripId}`;
  const travelerCode = trip?.trip_id?.slice(-6)?.toUpperCase() || "??????";
  const travelerName = trip?.traveler_name || "Client";

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: G[50], overflow: "hidden" }}>
      {bookingBrief && tripId && (
        <BookingBriefModal provider={bookingBrief.provider} bookingUrl={bookingBrief.bookingUrl} tripId={tripId} onClose={() => setBookingBrief(null)} />
      )}
      {addingItemDay !== null && tripId && (
        <AddItemModal dayNumber={addingItemDay} tripId={tripId} onClose={() => setAddingItemDay(null)} onItemAdded={triggerEnergyRecalc} />
      )}
      {dmoPickerDay !== null && tripId && (
        <DmoPickerModal tripId={tripId} dayNumber={dmoPickerDay} onClose={() => setDmoPickerDay(null)} onAdded={triggerEnergyRecalc} />
      )}
      {servicePickerDay !== null && tripId && (
        <ServicePickerModal tripId={tripId} dayNumber={servicePickerDay} destination={trip?.destination || ""} onClose={() => setServicePickerDay(null)} onAdded={triggerEnergyRecalc} />
      )}

      {/* ── Header ── */}
      <header style={{ height: 56, background: "white", borderBottom: `1px solid ${G[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCollapsed(!collapsed)} data-testid="button-toggle-sidebar" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: G[500], display: "flex" }}><Menu style={{ width: 20, height: 20 }} /></button>
          <button onClick={() => safeNavigate("/expert/dashboard")} data-testid="button-back-dashboard" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G[400], fontSize: 13 }}><ArrowLeft style={{ width: 14, height: 14 }} /></button>
          <span style={{ fontSize: 15, fontWeight: 700, color: G[900] }}>
            {isAuthoring ? "Ready-Made Builder" : "Itinerary Workspace"}
          </span>
          <ChevronRight style={{ width: 14, height: 14, color: G[400] }} />
          {isAuthoring ? (
            // No client to protect — an authoring trip has no traveler. Show what's being built
            // instead of a "Client #……" chip that would imply someone is waiting on it.
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: G[50], borderRadius: 99, border: `1px solid ${G[200]}` }}>
              <Store style={{ width: 11, height: 11, color: G[400] }} />
              <span style={{ fontSize: 13, color: G[600], fontWeight: 500 }} data-testid="text-authoring-identity">
                {trip?.destination || "Ready-made trip"} · for sale
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: G[50], borderRadius: 99, border: `1px solid ${G[200]}` }}>
              <Lock style={{ width: 11, height: 11, color: G[400] }} />
              <span style={{ fontSize: 13, color: G[600], fontWeight: 500 }} data-testid="text-client-identity">
                {identityRevealed ? travelerName : `Client #${travelerCode}`}
              </span>
              <button onClick={() => setIdentityRevealed(!identityRevealed)} data-testid="button-reveal-identity" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0, color: G[400] }}>
                {identityRevealed ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#F0FDF4", borderRadius: 99, border: "1px solid #BBF7D0" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16A34A" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>AI: Active</span>
          </div>
          {!isAuthoring && (
            <Av i={travelerName.charAt(0).toUpperCase() + (travelerName.split(" ")[1]?.[0] || "").toUpperCase()} s={32} />
          )}
        </div>
      </header>

      {/* ── Approval Bar ── (assignment lifecycle: draft → in_review → delivered to the client.
           An authoring trip has no client to deliver to; its lifecycle is the LISTING's
           draft → submitted → approved, shown in the listing panel.) */}
      {!isAuthoring && (
        <ApprovalBar current={workspaceStatus} onSubmit={() => advanceStatusMutation.mutate()} isPending={advanceStatusMutation.isPending} />
      )}

      {/* ── Expert Notes ── */}
      <div style={{ background: "#FEFCE8", borderBottom: `1px solid #FEF08A`, padding: "8px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "#EAB308", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><StickyNote style={{ width: 12, height: 12, color: "white" }} /></div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#713F12", letterSpacing: "0.02em" }}>
              {isAuthoring ? "Build Notes" : "Expert Notes"}
            </div>
            <div style={{ fontSize: 10, color: "#A16207", display: "flex", alignItems: "center", gap: 3 }}><Lock style={{ width: 9, height: 9 }} /> Only you can see this</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <textarea value={noteText} onChange={e => handleNoteChange(e.target.value)} placeholder={isAuthoring ? "Notes to yourself about this build — what to add, what to verify, what to avoid…" : "Add private notes about this client, their preferences, things to avoid..."} data-testid="textarea-expert-notes" style={{ width: "100%", minHeight: 48, padding: "6px 9px", fontSize: 11, color: "#713F12", lineHeight: 1.55, background: "white", border: "1px solid #FDE68A", borderRadius: 8, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as any }} />
          <div style={{ height: 14, display: "flex", alignItems: "center", gap: 4 }}>
            {noteSaveStatus === "saving" && (
              <span data-testid="text-notes-saving" style={{ fontSize: 10, color: "#A16207", display: "flex", alignItems: "center", gap: 3 }}>
                <Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> Saving…
              </span>
            )}
            {noteSaveStatus === "saved" && (
              <span data-testid="text-notes-saved" style={{ fontSize: 10, color: "#15803D", display: "flex", alignItems: "center", gap: 3 }}>
                <CheckCircle style={{ width: 9, height: 9 }} /> Saved
              </span>
            )}
            {noteSaveStatus === "idle" && lastSavedAt && (
              <span data-testid="text-notes-last-saved" style={{ fontSize: 10, color: "#A16207", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock style={{ width: 9, height: 9 }} /> Last saved {formatRelativeTime(lastSavedAt)}
              </span>
            )}
          </div>
        </div>
        {/* The 3-step deliver-to-client progression only exists for an assignment. */}
        {!isAuthoring && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, paddingTop: 2 }}>
            <Bdg c="amber">Step {["draft","in_review","delivered"].indexOf(workspaceStatus) + 1} of 3</Bdg>
            {workspaceStatus !== "delivered" && (
              <button onClick={() => advanceStatusMutation.mutate()} disabled={advanceStatusMutation.isPending} data-testid="button-mark-complete" style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "#EAB308", color: "white", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                Mark Complete →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left Rail ── */}
        {!collapsed && (
          <aside style={{ width: 282, background: "white", borderRight: `1px solid ${G[200]}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 11px" }}>

              {/* Trip card */}
              <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 11, border: `1px solid ${G[200]}` }}>
                <div style={{ height: 64, background: "linear-gradient(135deg,#FF385C22,#FF6B8A33)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <span style={{ fontSize: 24 }}>✈️</span>
                  {/* Nights are derived from the trip's dates. An authoring trip's dates are
                      placeholders (the buyer's clone gets real ones), so a nights count here would
                      contradict the listing's own duration — the listing line below is the truth. */}
                  {!isAuthoring && (
                    <div style={{ position: "absolute", bottom: 6, right: 8, background: "white", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 600, color: P }}>
                      {trip ? `${Math.max(1, Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000))} nights` : "—"}
                    </div>
                  )}
                  <div style={{ position: "absolute", top: 6, left: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.35)", borderRadius: 99, padding: "2px 7px" }}>
                    {isAuthoring ? (
                      <><Store style={{ width: 9, height: 9, color: "white" }} /><span style={{ fontSize: 9, color: "white", fontWeight: 600 }}>FOR SALE</span></>
                    ) : (
                      <><Lock style={{ width: 9, height: 9, color: "white" }} /><span style={{ fontSize: 9, color: "white", fontWeight: 600 }}>PRIVATE</span></>
                    )}
                  </div>
                </div>
                <div style={{ padding: "9px 11px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>{tripTitle}</div>
                  {/* Authoring trips carry placeholder dates (the BUYER's clone gets real ones), so a
                      date range here would be a fiction. Show what actually defines the listing. */}
                  {isAuthoring ? (
                    <div style={{ fontSize: 11, color: G[500], marginTop: 2 }}>
                      🗓️ {listing?.durationDays ?? "—"} days{listing?.bestSeason ? ` · best in ${listing.bestSeason}` : ""}
                    </div>
                  ) : (
                    trip && <div style={{ fontSize: 11, color: G[500], marginTop: 2 }}>📅 {formatDate(trip.start_date)} – {formatDate(trip.end_date)}</div>
                  )}
                  {/* Identity reveal is a client-privacy control; there is no client in authoring mode. */}
                  {!isAuthoring && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Av i={identityRevealed ? (travelerName.charAt(0).toUpperCase() + (travelerName.split(" ")[1]?.[0] || "").toUpperCase()) : "??"} s={20} />
                        <span style={{ fontSize: 12, color: G[700], fontWeight: 500 }} data-testid="text-left-rail-client">{identityRevealed ? travelerName : `Client #${travelerCode}`}</span>
                      </div>
                      <button onClick={() => setIdentityRevealed(!identityRevealed)} data-testid="button-left-rail-reveal" style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: `1px solid ${G[200]}`, borderRadius: 99, padding: "2px 7px", fontSize: 10, color: G[500], cursor: "pointer", fontWeight: 600 }}>
                        {identityRevealed ? <><EyeOff style={{ width: 9, height: 9 }} /> Hide</> : <><Eye style={{ width: 9, height: 9 }} /> Reveal</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Trip stats */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Trip Overview</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {trip?.destination && (
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", background: G[50], borderRadius: 7, border: `1px solid ${G[200]}` }}>
                      <MapPin style={{ width: 11, height: 11, color: P, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: G[700] }}>{trip.destination}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", background: G[50], borderRadius: 7, border: `1px solid ${G[200]}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: P, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: G[700] }}>Status</div>
                      <div style={{ fontSize: 10, color: G[400] }} data-testid="text-left-rail-status">
                        {isAuthoring
                          ? ({ draft: "Draft listing", submitted: "Listing in review", approved: "Listing approved", rejected: "Listing needs changes" }[listing?.status ?? "draft"])
                          : (trip?.status === "accepted" ? "Active assignment" : "Pending acceptance")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Item count */}
              {totalItems > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Itinerary</div>
                  <div style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: G[600], fontWeight: 500 }}>Total items</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: G[900] }}>{totalItems}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: G[600], fontWeight: 500 }}>Days planned</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: G[900] }}>{days.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Commission summary */}
              {commission && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Your Earnings</div>
                  <div style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: G[600] }}>Revenue share</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D" }}>${parseFloat(commission.expertShare).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: G[500] }}>{isNaN(commission.revenueShareRate) ? '—' : `${Math.round(commission.revenueShareRate * 100)}%`} of gross · {commission.itemCount} items</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule Check summary */}
              {totalConstraintIssues > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Schedule Check</div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FEF3C7", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      <AlertTriangle style={{ width: 13, height: 13, color: "#D97706" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309" }}>{totalConstraintIssues} issue{totalConstraintIssues > 1 ? "s" : ""} detected</span>
                    </div>
                    {anchorConflicts.map(c => (
                      <div key={c.anchorId} style={{ display: "flex", gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: c.impacts.some(i => i.severity === "critical") ? "#DC2626" : "#D97706", marginTop: 1 }}>•</span>
                        <span style={{ fontSize: 11, color: "#B45309" }}>{c.description} conflict</span>
                      </div>
                    ))}
                    {energyTracking.filter(e => e.recoveryNeeded).map(e => (
                      <div key={e.dayNumber} style={{ display: "flex", gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#D97706", marginTop: 1 }}>•</span>
                        <span style={{ fontSize: 11, color: "#B45309" }}>Day {e.dayNumber} — energy critical</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {totalConstraintIssues === 0 && workspaceConstraints && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Schedule Check</div>
                  <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle style={{ width: 13, height: 13, color: "#16A34A" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#15803D" }}>No constraint issues</span>
                  </div>
                </div>
              )}

              <button onClick={() => safeNavigate(`/trip/${tripId}?tab=itinerary`)} data-testid="button-open-full-logistics" style={{ width: "100%", padding: "6px 12px", borderRadius: 8, border: `1px solid ${G[200]}`, background: "white", fontSize: 12, color: G[600], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontWeight: 500 }}>
                <Navigation style={{ width: 12, height: 12 }} /> Open Full Itinerary <ChevronRight style={{ width: 11, height: 11, color: G[400] }} />
              </button>
            </div>
          </aside>
        )}

        {/* ── Center Itinerary ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{ background: "white", borderBottom: `1px solid ${G[200]}`, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ k: "itinerary", l: "📋 Itinerary" }, { k: "map", l: "🗺 Map View" }].map(t => (
                <button key={t.k} onClick={() => setCTab(t.k)} data-testid={`tab-center-${t.k}`} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: cTab === t.k ? `${P}12` : "none", color: cTab === t.k ? P : G[500], border: cTab === t.k ? `1.5px solid ${P}40` : "1.5px solid transparent", cursor: "pointer" }}>{t.l}</button>
              ))}
            </div>
            {/* Chat + Send Edits both address the CLIENT. An authoring trip has no client to
                message or deliver to — its outbound step is submitting the listing for review. */}
            {!isAuthoring && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => safeNavigate("/chat")} data-testid="button-open-chat" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "white", color: G[700], border: `1.5px solid ${G[200]}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <MessageSquare style={{ width: 13, height: 13 }} /> Chat
                </button>
                <button onClick={() => advanceStatusMutation.mutate()} disabled={advanceStatusMutation.isPending || workspaceStatus === "delivered"} data-testid="button-send-edits" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: P, color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, opacity: workspaceStatus === "delivered" ? 0.5 : 1 }}>
                  <Send style={{ width: 13, height: 13 }} /> Send Edits
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            {cTab === "map" ? (
              days.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                  <MapPin style={{ width: 40, height: 40, color: G[300] }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: G[600] }}>No itinerary items yet</div>
                  <div style={{ fontSize: 13, color: G[400] }}>Add activities, dining, or hotels for at least one day to see the map.</div>
                </div>
              ) : (
                // LB-P5b: reuse PlanCard's MapControlCenter (711 LOC, already built).
                // Adapt the workspace's day/item shape to the PlanCard shape it expects.
                (() => {
                  const startDateMs = trip?.start_date ? new Date(trip.start_date).getTime() : Date.now();
                  const planCardDays: PlanCardDay[] = days.map(d => {
                    const date = new Date(startDateMs + (d.dayNumber - 1) * 86400000).toISOString().slice(0, 10);
                    const activities: PlanCardActivity[] = d.items.map(item => ({
                      id: item.id,
                      name: item.title,
                      type: item.itemType,
                      status: item.status || "pending",
                      time: item.startTime || "",
                      location: item.locationName || "",
                      cost: item.estimatedCost ? parseFloat(item.estimatedCost) : 0,
                      comments: 0,
                    }));
                    return {
                      dayNum: d.dayNumber,
                      date,
                      label: `Day ${d.dayNumber}`,
                      activities,
                      transports: [],
                    };
                  });
                  return (
                    <MapControlCenter
                      tripId={tripId!}
                      tripDestination={trip?.destination || ""}
                      days={planCardDays}
                      selectedDay={mapSelectedDay}
                      onSelectDay={setMapSelectedDay}
                    />
                  );
                })()
              )
            ) : itemsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ background: "white", borderRadius: 12, border: `1px solid ${G[200]}`, padding: 16, height: 100 }}><Skeleton className="h-full w-full" /></div>)}
              </div>
            ) : days.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: G[900], marginBottom: 8 }}>No itinerary items yet</div>
                <div style={{ fontSize: 13, color: G[500], marginBottom: 20 }}>Start building the itinerary by adding activities, dining, and transport for each day.</div>
                <button onClick={() => setAddingItemDay(1)} data-testid="button-add-first-item" style={{ padding: "9px 20px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Plus style={{ width: 14, height: 14 }} /> Add First Item
                </button>
              </div>
            ) : (
              <>
                {/* Add item buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
                  <button
                    onClick={() => setDmoPickerDay(1)}
                    data-testid="button-add-from-dmo"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "white", color: G[700], border: `1px solid ${G[200]}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Search style={{ width: 12, height: 12 }} /> Add from DMO Library
                  </button>
                  <button
                    onClick={() => setServicePickerDay(1)}
                    data-testid="button-add-service"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "white", color: G[700], border: `1px solid ${G[200]}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Store style={{ width: 12, height: 12 }} /> Add Service
                  </button>
                  <button
                    onClick={() => setAddingItemDay(1)}
                    data-testid="button-add-item-expert"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Plus style={{ width: 12, height: 12 }} /> Add Item
                  </button>
                </div>

                {trip && (
                  <PlanCard
                    trip={{
                      id: tripId!,
                      destination: trip.destination,
                      title: trip.trip_title,
                      startDate: trip.start_date,
                      endDate: trip.end_date,
                      numberOfTravelers: trip.number_of_travelers ?? 1,
                    }}
                    role="expert"
                    stage="full"
                  />
                )}

                {/* Budget footer */}
                {commission && (
                  <div style={{ background: "white", borderRadius: 10, border: `1px solid ${G[200]}`, padding: "10px 14px", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 20 }}>
                      {[
                        { l: "Activities", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "activity" || i.itemType === "culture").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                        { l: "Dining", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "dining" || i.itemType === "food").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                        { l: "Transport", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "transport").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                        { l: "Hotels", v: days.reduce((s, d) => s + d.items.filter(i => i.itemType === "hotel" || i.itemType === "accommodation").reduce((a, i) => a + parseFloat(i.estimatedCost || "0"), 0), 0) },
                      ].map(s => (
                        <div key={s.l}><div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div><div style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>${s.v.toLocaleString()}</div></div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase" }}>Total Est.</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: P }}>${parseFloat(commission.totalGross).toLocaleString()}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 380, background: "white", borderLeft: `1px solid ${G[200]}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ borderBottom: `1px solid ${G[200]}`, padding: "0 10px", display: "flex", gap: 0, flexShrink: 0, overflowX: "auto" }}>
            {[
              // Authoring: the listing IS the primary panel, and "Earnings" (per-client commission)
              // is replaced by the listing panel's fee-band share preview.
              ...(isAuthoring ? [{ k: "listing", l: "🏷️ Listing" }] : []),
              { k: "gaps", l: totalConstraintIssues > 0 ? `⚠️ Schedule Check (${totalConstraintIssues})` : "⚠️ Schedule Check" },
              ...(isEvent ? [{ k: "event-coord", l: "📅 Event Coord" }] : []),
              { k: "browse", l: "🔍 Browse" },
              ...(isAuthoring ? [] : [{ k: "commission", l: "💰 Earnings" }]),
              { k: "providers", l: "👥 Providers" },
              { k: "affiliates", l: "🔗 Affiliates" },
              ...(isAuthoring ? [] : [{ k: "partner-bookings", l: "🛍️ Partner Bookings" }]),
            ].map(t => (
              <button key={t.k} onClick={() => setRightTab(t.k)} data-testid={`tab-right-${t.k}`} style={{ padding: "10px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer", background: "none", border: "none", borderBottom: rightTab === t.k ? `2px solid ${P}` : "2px solid transparent", color: rightTab === t.k ? P : G[500], marginBottom: -1, whiteSpace: "nowrap" }}>{t.l}</button>
            ))}
          </div>

          {/* Listing Tab (authoring only) */}
          {rightTab === "listing" && isAuthoring && (
            listing ? (
              <ReadyMadeListingPanel listing={listing} tripId={tripId!} />
            ) : (
              <div style={{ flex: 1, padding: "18px 14px", fontSize: 12.5, color: G[500], lineHeight: 1.55 }}>
                This trip has no ready-made listing attached, so there's nothing to price or publish.
                Start a new one from the Ready Made Trips console.
              </div>
            )
          )}

          {/* Schedule Check Tab */}
          {rightTab === "gaps" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <Shield style={{ width: 14, height: 14, color: P }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>Schedule Check</span>
              </div>

              {/* Optimizer Scores */}
              {optimizerScores && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Optimizer Scores</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { key: "balance_score", label: "Balance", color: "#2563EB" },
                      { key: "wellness_score", label: "Wellness", color: "#16A34A" },
                      { key: "pace_score", label: "Pace", color: "#9333EA" },
                      { key: "diversity_score", label: "Diversity", color: "#EA580C" },
                    ].map(s => {
                      const val = optimizerScores[s.key] ?? null;
                      if (val === null) return null;
                      const pct = Math.min(100, Math.max(0, val));
                      return (
                        <div key={s.key} data-testid={`score-${s.key}`} style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "7px 9px" }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: G[500], marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{Math.round(val)}</div>
                          <div style={{ marginTop: 4, height: 3, background: G[200], borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Anchor Conflicts */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Anchor Conflicts</div>
                {constraintsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : anchorConflicts.length === 0 ? (
                  <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle style={{ width: 12, height: 12, color: "#16A34A" }} />
                    <span style={{ fontSize: 12, color: "#15803D", fontWeight: 500 }}>No anchor conflicts</span>
                  </div>
                ) : anchorConflicts.map(conflict => (
                  <div key={conflict.anchorId} style={{ border: `1px solid ${conflict.impacts.some(i => i.severity === "critical") ? "#FCA5A5" : "#FDE68A"}`, borderRadius: 9, padding: "9px 11px", marginBottom: 7, background: conflict.impacts.some(i => i.severity === "critical") ? "#FEF2F2" : "#FFFBEB" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <Bdg c={conflict.impacts.some(i => i.severity === "critical") ? "rose" : "amber"}>{conflict.impacts.some(i => i.severity === "critical") ? "CRITICAL" : "WARNING"}</Bdg>
                      <span style={{ fontSize: 12, fontWeight: 600, color: G[900] }}>{conflict.description}</span>
                    </div>
                    {conflict.impacts.map((imp, idx) => (
                      <div key={idx} data-testid={`anchor-impact-${conflict.anchorId}-${idx}`} style={{ display: "flex", gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: imp.severity === "critical" ? "#DC2626" : "#D97706", marginTop: 2, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: 11, color: imp.severity === "critical" ? "#991B1B" : "#B45309" }}>{imp.message}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Day Boundaries */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Day Boundaries</div>
                {constraintsLoading ? (
                  <Skeleton className="h-12 rounded-lg" />
                ) : dayBoundaries.length === 0 ? (
                  <div style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: G[400] }}>No day boundaries set</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {dayBoundaries.map(b => {
                      const violations = boundaryViolations.filter(v => v.dayNumber === b.dayNumber);
                      return (
                        <div key={b.id} data-testid={`day-boundary-${b.dayNumber}`} style={{ background: violations.length > 0 ? "#FFFBEB" : G[50], border: `1px solid ${violations.length > 0 ? "#FDE68A" : G[200]}`, borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <Bdg c="blue">Day {b.dayNumber}</Bdg>
                            <div style={{ display: "flex", gap: 4 }}>
                              {b.mustReturnToHotel && <Bdg c="violet">Must return to hotel</Bdg>}
                              {violations.length > 0 && <Bdg c="amber">{violations.length} violation{violations.length > 1 ? "s" : ""}</Bdg>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: G[600] }}>
                            {b.earliestActivityStart && <span>From {b.earliestActivityStart} </span>}
                            {b.latestActivityEnd && <span>until {b.latestActivityEnd}</span>}
                            {b.reasonForConstraint && <div style={{ marginTop: 2, fontSize: 10, color: G[400] }}>{b.reasonForConstraint}</div>}
                          </div>
                          {violations.length > 0 && (
                            <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                              {violations.map((v, idx) => (
                                <div key={idx} data-testid={`boundary-violation-day${b.dayNumber}-${idx}`} style={{ display: "flex", gap: 5 }}>
                                  <span style={{ fontSize: 10, color: "#D97706", marginTop: 2, flexShrink: 0 }}>⚠</span>
                                  <span style={{ fontSize: 11, color: "#B45309" }}>{v.violation}</span>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Energy per Day</div>
                {constraintsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : energyTracking.length === 0 ? (
                  <div style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: G[400] }}>No energy data yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {energyTracking.sort((a, b) => a.dayNumber - b.dayNumber).map(e => {
                      const pct = e.endingEnergy;
                      const barColor = pct < 20 ? "#DC2626" : pct < 40 ? "#D97706" : "#16A34A";
                      return (
                        <div key={e.dayNumber} data-testid={`energy-day-${e.dayNumber}`} style={{ background: e.recoveryNeeded ? "#FEF2F2" : G[50], border: `1px solid ${e.recoveryNeeded ? "#FCA5A5" : G[200]}`, borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <BatteryLow style={{ width: 11, height: 11, color: barColor }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: G[700] }}>Day {e.dayNumber}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{e.endingEnergy}%</span>
                              {e.recoveryNeeded && <Bdg c="rose">Burnout risk</Bdg>}
                            </div>
                          </div>
                          <div style={{ height: 4, background: G[200], borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
                          </div>
                          {e.recoveryNeeded && e.recoveryReason && (
                            <div style={{ fontSize: 10, color: "#991B1B", marginTop: 4 }}>{e.recoveryReason}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Earnings reminder */}
              {totalItems > 0 && commission && (
                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#15803D", display: "flex", alignItems: "center", gap: 5 }}>
                    <TrendingUp style={{ width: 12, height: 12 }} /> Estimated earnings: ${parseFloat(commission.expertShare).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Event Coordination Tab (Stage 2) */}
          {rightTab === "event-coord" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <CalendarDays style={{ width: 14, height: 14, color: P }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>Event Coordination</span>
              </div>

              {!coordinationId && (
                <div style={{ background: G[50], border: `1px solid ${G[200]}`, borderRadius: 8, padding: "12px", fontSize: 12, color: G[500] }}>
                  No coordination state linked to this trip yet. The traveler will create one during the concierge flow.
                </div>
              )}

              {/* Status advance control */}
              {coordinationId && (
                <div style={{ background: "white", border: `1px solid ${G[200]}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Engagement Stage</div>
                  {/* Stage progress strip */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
                    {COORD_STATUS_ORDER.map((s, idx) => {
                      const isDone = idx < currentCoordIdx;
                      const isCurrent = idx === currentCoordIdx;
                      return (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                            background: isDone ? "#16A34A" : isCurrent ? P : G[300],
                          }} />
                          <span style={{
                            fontSize: 10, fontWeight: isCurrent ? 700 : 400,
                            color: isDone ? "#16A34A" : isCurrent ? P : G[400],
                            whiteSpace: "nowrap",
                          }}>
                            {coordStatusLabel[s]}
                          </span>
                          {idx < COORD_STATUS_ORDER.length - 1 && (
                            <span style={{ fontSize: 10, color: G[300], marginLeft: 1 }}>›</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Advance button */}
                  {nextCoordStatus ? (
                    <button
                      data-testid="button-advance-coord-status"
                      onClick={() => advanceCoordStatusMutation.mutate(nextCoordStatus)}
                      disabled={advanceCoordStatusMutation.isPending}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
                        borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: P, color: "white", border: "none",
                        opacity: advanceCoordStatusMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {advanceCoordStatusMutation.isPending
                        ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                        : <ChevronRight style={{ width: 13, height: 13 }} />
                      }
                      Advance to {coordStatusLabel[nextCoordStatus]}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                      ✓ Coordination complete
                    </div>
                  )}
                </div>
              )}

              {coordinationId && eventCoordFee && (
                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Coordination Fee</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#15803D", lineHeight: 1 }}>
                    ${(eventCoordFee.feeCents / 100).toFixed(2)}
                  </div>
                  {eventCoordFee.optimizeCreditCents > 0 && (
                    <div style={{ fontSize: 11, color: "#15803D", marginTop: 4 }}>
                      ✓ ${(eventCoordFee.optimizeCreditCents / 100).toFixed(2)} optimize fee credited
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: G[500], marginTop: 4 }}>
                    Rule: {eventCoordFee.rule} · Greater of $499 or 8% of budget
                  </div>
                </div>
              )}

              {coordinationId && eventTimeline && eventTimeline.blocks && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Timeline</div>
                  <div style={{ fontSize: 12, color: G[500], marginBottom: 8 }}>
                    Anchor: {eventTimeline.anchorType} at {eventTimeline.anchorTime}
                  </div>
                  {eventTimeline.blocks.map((block: any, idx: number) => (
                    <div key={block.key ?? idx} style={{ border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, background: block.isLocked ? "#FEF3C7" : "white" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: G[900] }}>{block.label}</span>
                        {block.isLocked && <Bdg c="amber">Locked</Bdg>}
                      </div>
                      <div style={{ fontSize: 11, color: G[500], marginTop: 2 }}>
                        {block.startTime} – {block.endTime} ({block.duration} min)
                      </div>
                      {block.vendorName && (
                        <div style={{ fontSize: 11, color: "#2563EB", marginTop: 2 }}>
                          Vendor: {block.vendorName} ({block.vendorStatus})
                        </div>
                      )}
                    </div>
                  ))}
                  {eventTimeline.conflicts && eventTimeline.conflicts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {eventTimeline.conflicts.map((c: any, idx: number) => (
                        <div key={idx} style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 11, color: "#DC2626" }}>
                          <strong>{c.type}</strong>: {c.description}
                          {c.suggestion && <div style={{ marginTop: 2, color: "#B45309" }}>💡 {c.suggestion}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {coordinationId && eventVendorGaps && eventVendorGaps.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 }}>Vendor Gaps</div>
                  {eventVendorGaps.map((gap: any, idx: number) => (
                    <div key={idx} style={{ border: `1px solid ${G[200]}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, background: gap.priority === "critical" ? "#FEF2F2" : gap.priority === "high" ? "#FFFBEB" : G[50] }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: G[900] }}>{gap.label}</span>
                        <Bdg c={gap.priority === "critical" ? "rose" : gap.priority === "high" ? "amber" : "gray"}>{gap.priority}</Bdg>
                      </div>
                      <div style={{ fontSize: 11, color: G[500], marginTop: 2 }}>{gap.reason}</div>
                      <div style={{ fontSize: 10, color: G[400], marginTop: 2 }}>
                        Needed: {gap.neededFrom} – {gap.neededUntil}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Browse Tab — Map-based live search */}
          {rightTab === "browse" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Search bar + category chips */}
              <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${G[100]}`, background: "white", flexShrink: 0 }}>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: G[400], pointerEvents: "none" }} />
                  <input
                    value={browseQuery}
                    onChange={e => setBrowseQuery(e.target.value)}
                    placeholder={`Search in ${destination || "destination"}…`}
                    data-testid="input-browse-search"
                    style={{ width: "100%", paddingLeft: 30, paddingRight: searchFetching ? 30 : 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${G[200]}`, fontSize: 13, outline: "none", boxSizing: "border-box", background: G[50] }}
                  />
                  {searchFetching && <Loader2 style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: G[400] }} className="animate-spin" />}
                </div>
                <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
                  {[{ k: "all", l: "All" }, { k: "dining", l: "🍽 Dining" }, { k: "activities", l: "🏛 Activities" }, { k: "hotels", l: "🏨 Hotels" }].map(c => (
                    <Chip key={c.k} active={cat === c.k} onClick={() => { setCat(c.k); setSelectedPin(null); }}>{c.l}</Chip>
                  ))}
                </div>
              </div>

              {/* Map */}
              <div style={{ height: 220, flexShrink: 0, position: "relative" }}>
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
                      {searchResults.filter(r => r.location?.lat).map((result: any) => {
                        const catColor: Record<string, string> = { dining: "#EA580C", hotel: "#7C3AED", culture: "#2563EB", activity: P };
                        const color = catColor[result.category] || P;
                        return (
                          <AdvancedMarker
                            key={result.id}
                            position={{ lat: result.location.lat, lng: result.location.lng }}
                            onClick={() => setSelectedPin(result)}
                          >
                            <div style={{ background: color, color: "white", borderRadius: 20, padding: "3px 8px", fontSize: 11, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.3)", border: selectedPin?.id === result.id ? "2px solid white" : "none", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {result.name.length > 16 ? result.name.slice(0, 16) + "…" : result.name}
                            </div>
                          </AdvancedMarker>
                        );
                      })}

                      {selectedPin && selectedPin.location?.lat && (
                        <InfoWindow
                          position={{ lat: selectedPin.location.lat, lng: selectedPin.location.lng }}
                          onCloseClick={() => setSelectedPin(null)}
                        >
                          <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 180, maxWidth: 220 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: G[900], marginBottom: 3 }}>{selectedPin.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              {selectedPin.rating && (
                                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#B45309", fontWeight: 600 }}>
                                  <Star style={{ width: 11, height: 11, fill: "#B45309" }} /> {selectedPin.rating}
                                  {selectedPin.reviewCount && <span style={{ color: G[400], fontWeight: 400 }}>({selectedPin.reviewCount.toLocaleString()})</span>}
                                </span>
                              )}
                              {selectedPin.priceLabel && <span style={{ fontSize: 11, color: G[500], background: G[100], padding: "1px 5px", borderRadius: 4 }}>{selectedPin.priceLabel}</span>}
                            </div>
                            {selectedPin.address && <div style={{ fontSize: 11, color: G[500], marginBottom: 7, lineHeight: 1.4 }}>{selectedPin.address}</div>}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                              <span style={{ fontSize: 11, color: G[600] }}>Day:</span>
                              <select
                                value={addToDay}
                                onChange={e => setAddToDay(Number(e.target.value))}
                                data-testid="select-add-to-day"
                                style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: `1px solid ${G[200]}`, fontSize: 12, background: "white" }}
                              >
                                {days.length > 0 ? days.map(d => (
                                  <option key={d.dayNumber} value={d.dayNumber}>Day {d.dayNumber}</option>
                                )) : [1,2,3,4,5,6,7].map(n => <option key={n} value={n}>Day {n}</option>)}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button
                                onClick={() => addFromSearchMutation.mutate(selectedPin)}
                                disabled={addFromSearchMutation.isPending}
                                data-testid={`button-add-from-map-${selectedPin.id}`}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 7, background: P, color: "white", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                              >
                                {addFromSearchMutation.isPending ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Plus style={{ width: 11, height: 11 }} />}
                                Add to Day {addToDay}
                              </button>
                              {selectedPin.mapsUrl && (
                                <a href={selectedPin.mapsUrl} target="_blank" rel="noopener noreferrer">
                                  <button data-testid={`button-maps-link-${selectedPin.id}`} style={{ padding: "5px 8px", borderRadius: 7, background: "white", color: G[600], border: `1px solid ${G[200]}`, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
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
                  <div style={{ height: "100%", background: G[100], display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                    <MapPin style={{ width: 24, height: 24, color: G[300] }} />
                    <span style={{ fontSize: 12, color: G[400] }}>Map unavailable</span>
                  </div>
                )}
                {/* Pin count badge */}
                {searchResults.filter((r: any) => r.location?.lat).length > 0 && (
                  <div style={{ position: "absolute", bottom: 8, left: 8, background: "white", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 600, color: G[700], boxShadow: "0 1px 4px rgba(0,0,0,0.2)", zIndex: 10 }}>
                    {searchResults.filter((r: any) => r.location?.lat).length} pins
                  </div>
                )}
              </div>

              {/* Results list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {searchFetching && searchResults.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 56, borderRadius: 8, background: G[100] }}><Skeleton className="h-full w-full rounded-lg" /></div>)}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: G[400] }}>
                    <Search style={{ width: 28, height: 28, color: G[300], margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      {destination ? `Showing ${destination}` : "Type to search"}
                    </div>
                    <div style={{ fontSize: 11, color: G[400] }}>Try "ramen", "temple", "rooftop bar"</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 2 }}>
                      {searchResults.length} results · click a pin or card to add
                    </div>
                    {searchResults.map((result: any) => {
                      const catColor: Record<string, string> = { dining: "#EA580C", hotel: "#7C3AED", culture: "#2563EB", activity: P };
                      const catEmoji: Record<string, string> = { dining: "🍽", hotel: "🏨", culture: "🏛", activity: "🎯" };
                      const isSelected = selectedPin?.id === result.id;
                      return (
                        <div
                          key={result.id}
                          data-testid={`card-search-result-${result.id}`}
                          onClick={() => setSelectedPin(isSelected ? null : result)}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px", borderRadius: 9, border: isSelected ? `1.5px solid ${P}` : `1px solid ${G[100]}`, background: isSelected ? `${P}06` : "white", marginBottom: 6, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", transition: "border-color 0.15s" }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 7, background: result.photoUrl ? "transparent" : `${catColor[result.category] || P}18`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                            {result.photoUrl ? <img src={result.photoUrl} alt={result.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : catEmoji[result.category] || "📍"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: G[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                              <span style={{ fontSize: 10, color: catColor[result.category] || G[500], fontWeight: 600, textTransform: "capitalize" }}>{result.category}</span>
                              {result.rating && <><span style={{ color: G[300], fontSize: 10 }}>·</span><span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "#B45309" }}><Star style={{ width: 9, height: 9, fill: "#B45309" }} />{result.rating}</span></>}
                              {result.priceLabel && <><span style={{ color: G[300], fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: G[500] }}>{result.priceLabel}</span></>}
                              {result.source === "platform" && <Bdg c="primary">Platform</Bdg>}
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedPin(result); }}
                            data-testid={`button-select-result-${result.id}`}
                            style={{ padding: "4px 8px", borderRadius: 6, background: isSelected ? P : G[50], color: isSelected ? "white" : G[600], border: `1px solid ${isSelected ? P : G[200]}`, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                          >
                            {isSelected ? "✓" : "+"}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: `1px solid ${G[100]}`, padding: "5px 12px", textAlign: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: G[400] }}>Powered by Google Places · Traveloure</span>
              </div>
            </div>
          )}

          {/* Earnings / Commission Tab */}
          {rightTab === "commission" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}><TrendingUp style={{ width: 14, height: 14, color: P }} /><span style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>Your Earnings</span></div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: 14 }}>
                <DollarSign style={{ width: 13, height: 13, color: "#2563EB", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11, color: "#1D4ED8", lineHeight: 1.5 }}>Traveloure earns booking revenue from partner platforms. <strong>You receive {commission ? Math.round(commission.revenueShareRate * 100) : 30}% of that as your revenue share</strong> for every booking you add to a client's itinerary.</span>
              </div>
              {commissionLoading ? <Skeleton className="h-32 mb-4" /> : commission ? (
                <>
                  <div style={{ background: "linear-gradient(135deg,#FF385C12,#FF6B8A08)", border: `1px solid ${P}30`, borderRadius: 12, padding: "14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: G[500], marginBottom: 2 }}>Your estimated earnings · this trip</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: G[900] }}>${parseFloat(commission.expertShare).toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600, marginTop: 2 }}>{isNaN(commission.revenueShareRate) ? '—' : `${Math.round(commission.revenueShareRate * 100)}%`} revenue share · {commission.itemCount} items</div>
                    <div style={{ height: 1, background: G[200], margin: "10px 0" }} />
                    <div style={{ display: "flex", gap: 16 }}>
                      <div><div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase" }}>Gross</div><div style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>${parseFloat(commission.totalGross).toFixed(2)}</div></div>
                      <div><div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase" }}>Your Share</div><div style={{ fontSize: 13, fontWeight: 700, color: "#15803D" }}>${parseFloat(commission.expertShare).toFixed(2)}</div></div>
                      <div><div style={{ fontSize: 10, color: G[400], fontWeight: 600, textTransform: "uppercase" }}>Platform</div><div style={{ fontSize: 13, fontWeight: 700, color: G[500] }}>${parseFloat(commission.platformFee).toFixed(2)}</div></div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Booking Breakdown</div>
                  {commission.itemBreakdown.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: G[400], fontSize: 13 }}>No confirmed items yet.</div>
                  ) : (
                    commission.itemBreakdown.map((b, i) => (
                      <div key={b.id || i} data-testid={`row-commission-${i}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: `1px solid ${G[100]}`, borderRadius: 9, marginBottom: 7, background: "white" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: G[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                          <div style={{ fontSize: 11, color: G[400] }}>Day {b.dayNumber} · ${parseFloat(b.cost).toFixed(2)} gross</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>${parseFloat(b.expertEarning).toFixed(2)}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#DCFCE7", color: "#15803D", padding: "1px 6px", borderRadius: 99 }}>confirmed</span>
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0", color: G[400], fontSize: 13 }}>No earnings data yet — add items to the itinerary to start earning.</div>
              )}
            </div>
          )}

          {/* Providers Tab */}
          {rightTab === "providers" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: P, display: "flex", alignItems: "center", justifyContent: "center" }}><User style={{ width: 11, height: 11, color: "white" }} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>Platform Service Providers</span>
                  </div>
                  {trip?.destination && <Bdg c="primary">{trip.destination}</Bdg>}
                </div>
                <p style={{ fontSize: 11, color: G[500], marginBottom: 10 }}>Traveloure-verified providers you can book directly for this client.</p>
                {providers && providers.length > 0 ? providers.slice(0, 6).map((p: any, i: number) => (
                  <div key={p.id || i} data-testid={`card-sp-${p.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px", border: `1px solid ${G[100]}`, borderRadius: 10, marginBottom: 7, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg,${P}30,${P}60)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏢</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>{p.serviceName}</span>
                        {p.status === "active" && <div title="Active" style={{ width: 14, height: 14, borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CheckCircle style={{ width: 9, height: 9, color: "white" }} /></div>}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: G[700], marginBottom: 1 }}>{p.serviceType || p.category || "Service"}</div>
                      {p.location && <div style={{ fontSize: 11, color: G[400], marginBottom: 4 }}>{p.location}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {p.price && <span style={{ fontSize: 11, color: G[600], fontWeight: 600 }}>${p.price}</span>}
                        <button onClick={() => setBookingBrief({ provider: p.serviceName, bookingUrl: p.websiteUrl || p.bookingUrl })} data-testid={`button-book-provider-${p.id}`} style={{ padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: P, color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle style={{ width: 10, height: 10 }} /> Book
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: "center", padding: "30px 0", color: G[400], fontSize: 13 }}>
                    <Users style={{ width: 32, height: 32, color: G[300], margin: "0 auto 8px" }} />
                    No platform providers found yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Affiliates Tab */}
          {rightTab === "partner-bookings" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: "#7c3aed22", display: "flex", alignItems: "center", justifyContent: "center" }}><ShoppingBag style={{ width: 11, height: 11, color: "#7c3aed" }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>Partner Booking Requests</span>
              </div>
              <p style={{ fontSize: 11, color: G[500], marginBottom: 12 }}>Requests from users to book partner-affiliate items on their behalf.</p>
              {partnerBookingLoading && <div style={{ textAlign: "center", padding: 20, color: G[400], fontSize: 12 }}>Loading…</div>}
              {!partnerBookingLoading && (!partnerBookingRequests || partnerBookingRequests.length === 0) && (
                <div style={{ textAlign: "center", padding: 24, color: G[400], fontSize: 12, background: G[50], borderRadius: 10 }}>
                  <ShoppingBag style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.3 }} />
                  No partner booking requests yet
                </div>
              )}
              {partnerBookingRequests?.map((req: any) => (
                <div key={req.id} data-testid={`card-partner-booking-${req.id}`} style={{ padding: "11px 12px", border: `1px solid ${G[200]}`, borderRadius: 10, marginBottom: 10, background: "white" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: G[900], marginBottom: 2 }}>{req.itemName}</div>
                      <div style={{ fontSize: 11, color: G[500] }}>{req.partnerName} · {req.partnerCategory ?? "activity"}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: req.status === "confirmed" ? "#dcfce7" : req.status === "failed" ? "#fee2e2" : "#f3e8ff", color: req.status === "confirmed" ? "#16a34a" : req.status === "failed" ? "#dc2626" : "#7c3aed" }}>{req.status}</span>
                  </div>
                  {(req.travelDate || req.travelers) && (
                    <div style={{ fontSize: 11, color: G[500], display: "flex", gap: 10, marginBottom: 6 }}>
                      {req.travelDate && <span>📅 {req.travelDate}</span>}
                      {req.travelers && <span>👥 {req.travelers} traveler{req.travelers !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                  {req.userNotes && <div style={{ fontSize: 11, color: G[600], background: G[50], borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>{req.userNotes}</div>}
                  {req.expertNotes && <div data-testid={`text-expert-notes-${req.id}`} style={{ fontSize: 11, color: req.expertNotes.includes("[ATTACHMENT BLOCKED]") ? "#dc2626" : G[600], background: req.expertNotes.includes("[ATTACHMENT BLOCKED]") ? "#fef2f2" : G[50], borderRadius: 6, padding: "4px 8px", marginBottom: 6, whiteSpace: "pre-wrap" }}>{req.expertNotes}</div>}
                  {req.affiliateUrl && (
                    <a href={req.affiliateUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-booking-${req.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#7c3aed", fontWeight: 600, textDecoration: "none", padding: "4px 9px", border: "1.5px solid #c4b5fd", borderRadius: 7, marginBottom: 8 }}>
                      <ExternalLink style={{ width: 11, height: 11 }} />Open booking link
                    </a>
                  )}
                  {req.status !== "confirmed" && req.status !== "failed" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => updateBookingMutation.mutate({ id: req.id, status: "confirmed" })} disabled={updateBookingMutation.isPending} data-testid={`button-confirm-${req.id}`} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "#16a34a", color: "white", border: "none" }}>✓ Confirm</button>
                      <button onClick={() => updateBookingMutation.mutate({ id: req.id, status: "failed" })} disabled={updateBookingMutation.isPending} data-testid={`button-fail-${req.id}`} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "white", color: "#dc2626", border: "1.5px solid #fca5a5" }}>✗ Failed</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {rightTab === "affiliates" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: `${P}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Link2 style={{ width: 11, height: 11, color: P }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>Affiliate Networks</span>
              </div>
              <p style={{ fontSize: 11, color: G[500], marginBottom: 12 }}>External booking networks integrated by Traveloure. Use these to complete bookings on behalf of your client. Managed by admins at /admin/affiliate-partners.</p>
              {affiliatePartnersLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : affiliatePartners.length === 0 ? (
                <div style={{ padding: "16px 12px", background: G[50], borderRadius: 8, textAlign: "center", color: G[500], fontSize: 12 }}>
                  No active affiliate networks configured yet.
                </div>
              ) : (
                affiliatePartners.map((aff) => (
                  <div
                    key={aff.id}
                    data-testid={`card-affiliate-${aff.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    style={{ padding: "10px 11px", border: `1px solid ${G[200]}`, borderRadius: 10, marginBottom: 8, background: "white" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                      {aff.logoUrl ? (
                        <img src={aff.logoUrl} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: G[100], flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: G[900] }}>{aff.name}</span>
                          <Bdg c="green">Active</Bdg>
                        </div>
                        <div style={{ fontSize: 11, color: G[400] }}>{aff.category || "—"}</div>
                      </div>
                      <button
                        onClick={() => setBookingBrief({ provider: aff.name, bookingUrl: aff.websiteUrl })}
                        data-testid={`button-affiliate-${aff.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                        style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "white", color: P, border: `1.5px solid ${P}`, cursor: "pointer" }}
                      >
                        Open →
                      </button>
                    </div>
                    {aff.description && (
                      <div style={{ fontSize: 11, color: G[500], background: G[50], borderRadius: 6, padding: "5px 8px" }}>{aff.description}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
