import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Menu, Bell, MapPin, ChevronRight, Pencil, Sparkles, Link2,
  AlertTriangle, Send, MessageSquare, Plus, Filter, Zap,
  Navigation, Train, Footprints, Car, Lock, Eye, EyeOff,
  FileText, DollarSign, CheckCircle, Clock, LayoutTemplate,
  TrendingUp, StickyNote, X, ShieldCheck, ExternalLink, User, Mail,
  Phone, CreditCard, CalendarDays, Loader2, ArrowLeft, Users,
} from "lucide-react";

const P = "#FF385C";
const G: Record<number, string> = {
  50: "#F9FAFB", 100: "#F3F4F6", 200: "#E5E7EB", 300: "#D1D5DB",
  400: "#9CA3AF", 500: "#6B7280", 600: "#4B5563", 700: "#374151", 900: "#111827",
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

function TConn({ mode, dur }: { mode: string; dur: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0 2px 10px", margin: "1px 0" }}>
      <div style={{ width: 1, height: 12, background: G[200], marginLeft: 3 }} />
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: G[50], border: `1px solid ${G[200]}`, borderRadius: 99, color: G[500], fontSize: 11 }}>
        {mode === "walk" ? <Footprints style={{ width: 10, height: 10 }} /> : mode === "taxi" ? <Car style={{ width: 10, height: 10 }} /> : <Train style={{ width: 10, height: 10 }} />}
        {dur}
      </div>
    </div>
  );
}

const CAT_DOTS: Record<string, string> = { food: "#EA580C", culture: "#2563EB", activity: "#2563EB", hotel: "#7C3AED", transport: "#16A34A", accommodation: "#7C3AED", dining: "#EA580C" };

function ARow({ time, cat, name, price, edited, alts, gap, onAddOne, onEdit }: any) {
  if (gap) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, border: `1.5px dashed ${P}50`, background: `${P}06`, margin: "3px 0" }}>
      <AlertTriangle style={{ width: 13, height: 13, color: P, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: P, fontWeight: 500 }}>No dinner booked — <span onClick={onAddOne} style={{ textDecoration: "underline", cursor: "pointer" }}>Add one?</span></span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 7px", borderRadius: 8, background: "white", border: `1px solid ${G[100]}`, margin: "2px 0" }}>
      <span style={{ fontSize: 11, color: G[400], minWidth: 40, fontFamily: "monospace", flexShrink: 0 }}>{time || "—"}</span>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: CAT_DOTS[cat] || G[400], flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: G[900], fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {price && <span style={{ fontSize: 11, color: G[500], background: G[100], padding: "2px 6px", borderRadius: 6, flexShrink: 0 }}>{price}</span>}
      {edited && <Bdg c="amber">edited</Bdg>}
      {alts && <button style={{ fontSize: 11, color: P, background: `${P}10`, border: `1px solid ${P}30`, borderRadius: 6, padding: "2px 7px", cursor: "pointer", flexShrink: 0, fontWeight: 500 }}>Find Alternatives</button>}
      {onEdit && <button onClick={onEdit} data-testid={`button-edit-item-${name?.slice(0, 20)}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: G[400], flexShrink: 0, display: "flex" }}><Pencil style={{ width: 11, height: 11 }} /></button>}
    </div>
  );
}

function DayCard({ day, date, loc, children, onAdd, onTemplate }: any) {
  return (
    <div style={{ background: "white", borderRadius: 12, border: `1px solid ${G[200]}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 12, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", borderBottom: `1px solid ${G[100]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${P}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: P }}>{day}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: G[900] }}>Day {day} · {date}</div>
            {loc && <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: G[500] }}><MapPin style={{ width: 10, height: 10 }} />{loc}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={onTemplate} data-testid={`button-template-day-${day}`} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: G[600], background: G[50], border: `1px solid ${G[200]}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 500 }}>
            <LayoutTemplate style={{ width: 11, height: 11 }} /> Template
          </button>
          <button onClick={onAdd} data-testid={`button-add-day-${day}`} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: P, background: `${P}10`, border: `1px solid ${P}30`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 500 }}>
            <Plus style={{ width: 11, height: 11 }} /> Add
          </button>
        </div>
      </div>
      <div style={{ padding: "8px 10px" }}>{children}</div>
    </div>
  );
}

const STEPS = [
  { key: "draft", label: "Draft", icon: <FileText style={{ width: 11, height: 11 }} /> },
  { key: "in_review", label: "Expert Review", icon: <Eye style={{ width: 11, height: 11 }} /> },
  { key: "notes", label: "Expert Notes", icon: <StickyNote style={{ width: 11, height: 11 }} /> },
  { key: "pending", label: "Awaiting Approval", icon: <Clock style={{ width: 11, height: 11 }} /> },
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

function AddItemModal({ dayNumber, tripId, onClose }: { dayNumber: number; tripId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", itemType: "activity", startTime: "", estimatedCost: "", locationName: "" });
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
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
  const [collapsed, setCollapsed] = useState(false);
  const [identityRevealed, setIdentityRevealed] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const noteInitialized = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookingBrief, setBookingBrief] = useState<{ provider: string; bookingUrl?: string } | null>(null);
  const [addingItemDay, setAddingItemDay] = useState<number | null>(null);

  // ── Data fetching ──
  const { data: assignedTrips, isLoading: tripsLoading } = useQuery<AssignedTrip[]>({ queryKey: ["/api/expert/assigned-trips"] });
  const trip = assignedTrips?.find(t => t.trip_id === tripId);

  const { data: itineraryData, isLoading: itemsLoading } = useQuery<ItineraryData>({
    queryKey: [`/api/trips/${tripId}/itinerary-items`],
    enabled: !!tripId,
  });

  const { data: commission, isLoading: commissionLoading } = useQuery<CommissionData>({
    queryKey: [`/api/trips/${tripId}/commission`],
    enabled: !!tripId,
  });

  const { data: assignment, isLoading: assignmentLoading } = useQuery<MyAssignment>({
    queryKey: [`/api/trips/${tripId}/my-assignment`],
    enabled: !!tripId,
  });

  const { data: providers } = useQuery<any[]>({
    queryKey: ["/api/provider/services", { status: "active" }],
    queryFn: () => fetch("/api/provider/services?status=active").then(r => r.json()),
  });

  const { data: expertNotesData } = useQuery<{ expertNotes: string }>({
    queryKey: [`/api/trips/${tripId}/expert-notes`],
    enabled: !!tripId,
  });

  useEffect(() => {
    if (expertNotesData !== undefined && !noteInitialized.current) {
      setNoteText(expertNotesData.expertNotes || "");
      noteInitialized.current = true;
    }
  }, [expertNotesData]);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!assignment?.id) return;
      await apiRequest("PATCH", `/api/expert/assignments/${assignment.id}/workspace-status`, {});
    },
  });

  const autoSaveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/expert-notes`, { expertNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      setNoteSaveStatus("saved");
      const t = setTimeout(() => setNoteSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    },
    onError: () => setNoteSaveStatus("idle"),
  });

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    setNoteSaveStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autoSaveNotesMutation.mutate(text);
    }, 1500);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const workspaceStatus = assignment?.workspaceStatus || "draft";
  const days = itineraryData?.days || [];
  const totalItems = itineraryData?.total || 0;

  // Detect evening dinner gap (no dining item in evening)
  const daysWithDinnerGap = days.filter(d => {
    const hasEvening = d.items.some(i => {
      const t = i.startTime; if (!t) return false;
      const h = parseInt(t.split(":")[0]); return h >= 18 && (i.itemType === "dining" || i.itemType === "food");
    });
    return !hasEvening && d.items.length > 0;
  }).map(d => d.dayNumber);

  const isLoading = tripsLoading || assignmentLoading;

  if (!tripId) return <div style={{ padding: 40, textAlign: "center", color: G[500] }}>No trip selected.</div>;

  if (isLoading) return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, margin: "0 auto" }}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );

  if (!trip && !tripsLoading) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <Users style={{ width: 48, height: 48, color: G[300], margin: "0 auto 16px" }} />
      <div style={{ fontSize: 18, fontWeight: 600, color: G[900], marginBottom: 8 }}>Trip not found</div>
      <div style={{ fontSize: 14, color: G[500], marginBottom: 20 }}>This trip isn't assigned to you, or it no longer exists.</div>
      <button onClick={() => setLocation("/expert/assigned-trips")} data-testid="button-back-assigned" style={{ padding: "8px 20px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>View Assigned Trips</button>
    </div>
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
        <AddItemModal dayNumber={addingItemDay} tripId={tripId} onClose={() => setAddingItemDay(null)} />
      )}

      {/* ── Header ── */}
      <header style={{ height: 56, background: "white", borderBottom: `1px solid ${G[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCollapsed(!collapsed)} data-testid="button-toggle-sidebar" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: G[500], display: "flex" }}><Menu style={{ width: 20, height: 20 }} /></button>
          <Link href="/expert/dashboard"><button style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G[400], fontSize: 13 }}><ArrowLeft style={{ width: 14, height: 14 }} /></button></Link>
          <span style={{ fontSize: 15, fontWeight: 700, color: G[900] }}>Itinerary Workspace</span>
          <ChevronRight style={{ width: 14, height: 14, color: G[400] }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: G[50], borderRadius: 99, border: `1px solid ${G[200]}` }}>
            <Lock style={{ width: 11, height: 11, color: G[400] }} />
            <span style={{ fontSize: 13, color: G[600], fontWeight: 500 }} data-testid="text-client-identity">
              {identityRevealed ? travelerName : `Client #${travelerCode}`}
            </span>
            <button onClick={() => setIdentityRevealed(!identityRevealed)} data-testid="button-reveal-identity" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0, color: G[400] }}>
              {identityRevealed ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#F0FDF4", borderRadius: 99, border: "1px solid #BBF7D0" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16A34A" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>AI: Active</span>
          </div>
          <Av i={travelerName.charAt(0).toUpperCase() + (travelerName.split(" ")[1]?.[0] || "").toUpperCase()} s={32} />
        </div>
      </header>

      {/* ── Approval Bar ── */}
      <ApprovalBar current={workspaceStatus} onSubmit={() => advanceStatusMutation.mutate()} isPending={advanceStatusMutation.isPending} />

      {/* ── Expert Notes ── */}
      <div style={{ background: "#FEFCE8", borderBottom: `1px solid #FEF08A`, padding: "8px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "#EAB308", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><StickyNote style={{ width: 12, height: 12, color: "white" }} /></div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#713F12", letterSpacing: "0.02em" }}>Expert Notes</div>
            <div style={{ fontSize: 10, color: "#A16207", display: "flex", alignItems: "center", gap: 3 }}><Lock style={{ width: 9, height: 9 }} /> Only you can see this</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <textarea value={noteText} onChange={e => handleNoteChange(e.target.value)} placeholder="Add private notes about this client, their preferences, things to avoid..." data-testid="textarea-expert-notes" style={{ width: "100%", minHeight: 48, padding: "6px 9px", fontSize: 11, color: "#713F12", lineHeight: 1.55, background: "white", border: "1px solid #FDE68A", borderRadius: 8, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as any }} />
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
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, paddingTop: 2 }}>
          <Bdg c="amber">Step {["draft","in_review","notes","pending","delivered"].indexOf(workspaceStatus) + 1} of 5</Bdg>
          {workspaceStatus !== "delivered" && (
            <button onClick={() => advanceStatusMutation.mutate()} disabled={advanceStatusMutation.isPending} data-testid="button-mark-complete" style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "#EAB308", color: "white", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
              Mark Complete →
            </button>
          )}
        </div>
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
                  <div style={{ position: "absolute", bottom: 6, right: 8, background: "white", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 600, color: P }}>
                    {trip ? `${Math.max(1, Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000))} nights` : "—"}
                  </div>
                  <div style={{ position: "absolute", top: 6, left: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.35)", borderRadius: 99, padding: "2px 7px" }}>
                    <Lock style={{ width: 9, height: 9, color: "white" }} /><span style={{ fontSize: 9, color: "white", fontWeight: 600 }}>PRIVATE</span>
                  </div>
                </div>
                <div style={{ padding: "9px 11px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>{tripTitle}</div>
                  {trip && <div style={{ fontSize: 11, color: G[500], marginTop: 2 }}>📅 {formatDate(trip.start_date)} – {formatDate(trip.end_date)}</div>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Av i={identityRevealed ? (travelerName.charAt(0).toUpperCase() + (travelerName.split(" ")[1]?.[0] || "").toUpperCase()) : "??"} s={20} />
                      <span style={{ fontSize: 12, color: G[700], fontWeight: 500 }} data-testid="text-left-rail-client">{identityRevealed ? travelerName : `Client #${travelerCode}`}</span>
                    </div>
                    <button onClick={() => setIdentityRevealed(!identityRevealed)} data-testid="button-left-rail-reveal" style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: `1px solid ${G[200]}`, borderRadius: 99, padding: "2px 7px", fontSize: 10, color: G[500], cursor: "pointer", fontWeight: 600 }}>
                      {identityRevealed ? <><EyeOff style={{ width: 9, height: 9 }} /> Hide</> : <><Eye style={{ width: 9, height: 9 }} /> Reveal</>}
                    </button>
                  </div>
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
                      <div style={{ fontSize: 10, color: G[400] }}>{trip?.status === "accepted" ? "Active assignment" : "Pending acceptance"}</div>
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
                      <span style={{ fontSize: 10, color: G[500] }}>{Math.round(commission.revenueShareRate * 100)}% of gross · {commission.itemCount} items</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI gaps */}
              {daysWithDinnerGap.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>AI Gap Analysis</div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FEF3C7", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}><AlertTriangle style={{ width: 13, height: 13, color: "#D97706" }} /><span style={{ fontSize: 12, fontWeight: 700, color: "#B45309" }}>{daysWithDinnerGap.length} gap{daysWithDinnerGap.length > 1 ? "s" : ""} found</span></div>
                    {daysWithDinnerGap.map(d => <div key={d} style={{ display: "flex", gap: 5, marginBottom: 3 }}><span style={{ fontSize: 10, color: "#D97706", marginTop: 1 }}>•</span><span style={{ fontSize: 11, color: "#B45309" }}>Day {d} — no evening dining</span></div>)}
                  </div>
                </div>
              )}

              <button onClick={() => setLocation(`/trip/${tripId}?tab=itinerary`)} data-testid="button-open-full-logistics" style={{ width: "100%", padding: "6px 12px", borderRadius: 8, border: `1px solid ${G[200]}`, background: "white", fontSize: 12, color: G[600], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontWeight: 500 }}>
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
            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/chat`}>
                <button data-testid="button-open-chat" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "white", color: G[700], border: `1.5px solid ${G[200]}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <MessageSquare style={{ width: 13, height: 13 }} /> Chat
                </button>
              </Link>
              <button onClick={() => advanceStatusMutation.mutate()} disabled={advanceStatusMutation.isPending || workspaceStatus === "delivered"} data-testid="button-send-edits" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: P, color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, opacity: workspaceStatus === "delivered" ? 0.5 : 1 }}>
                <Send style={{ width: 13, height: 13 }} /> Send Edits
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            {cTab === "map" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                <MapPin style={{ width: 40, height: 40, color: G[300] }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: G[600] }}>Map view coming soon</div>
                <div style={{ fontSize: 13, color: G[400] }}>Open the full itinerary to see the map view</div>
                <a href={`/trip/${tripId}?tab=transport`} target="_blank" rel="noopener noreferrer">
                  <button data-testid="button-open-map-itinerary" style={{ padding: "8px 16px", borderRadius: 8, background: P, color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Open Full Itinerary</button>
                </a>
              </div>
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
                {days.map(d => (
                  <DayCard key={d.dayNumber} day={d.dayNumber} date={`Day ${d.dayNumber}`} loc={trip?.destination || ""} onAdd={() => setAddingItemDay(d.dayNumber)} onTemplate={() => toast({ title: "Templates coming soon" })}>
                    {d.items.map((item, idx) => (
                      <div key={item.id}>
                        {idx > 0 && item.startTime && <TConn mode="walk" dur="walk" />}
                        <ARow
                          time={item.startTime}
                          cat={item.itemType}
                          name={item.title}
                          price={formatCost(item.estimatedCost)}
                          edited={item.bookingStatus === "pending"}
                          alts={item.itemType === "dining" || item.itemType === "food"}
                          onEdit={() => toast({ title: "Edit coming soon", description: item.title })}
                        />
                      </div>
                    ))}
                    {daysWithDinnerGap.includes(d.dayNumber) && (
                      <ARow gap onAddOne={() => { setRightTab("browse"); }} />
                    )}
                  </DayCard>
                ))}

                {/* Budget footer */}
                {commission && (
                  <div style={{ background: "white", borderRadius: 10, border: `1px solid ${G[200]}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            {[{ k: "gaps", l: "⚡ AI Gaps" }, { k: "browse", l: "🔍 Browse" }, { k: "commission", l: "💰 Earnings" }, { k: "providers", l: "👥 Providers" }, { k: "affiliates", l: "🔗 Affiliates" }].map(t => (
              <button key={t.k} onClick={() => setRightTab(t.k)} data-testid={`tab-right-${t.k}`} style={{ padding: "10px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer", background: "none", border: "none", borderBottom: rightTab === t.k ? `2px solid ${P}` : "2px solid transparent", color: rightTab === t.k ? P : G[500], marginBottom: -1, whiteSpace: "nowrap" }}>{t.l}</button>
            ))}
          </div>

          {/* AI Gaps Tab */}
          {rightTab === "gaps" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}><Zap style={{ width: 14, height: 14, color: P }} /><span style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>AI Gap Analysis</span></div>
              {daysWithDinnerGap.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <CheckCircle style={{ width: 36, height: 36, color: "#22C55E", margin: "0 auto 12px" }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: G[900], marginBottom: 6 }}>No gaps found!</div>
                  <div style={{ fontSize: 12, color: G[500] }}>All days have complete coverage.</div>
                </div>
              ) : (
                daysWithDinnerGap.map((d, i) => (
                  <div key={d} style={{ border: `1px solid ${P}40`, borderRadius: 10, padding: "10px 12px", marginBottom: 9, background: `${P}05` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Bdg c="primary">Day {d}</Bdg><span style={{ fontSize: 13, fontWeight: 600, color: G[900] }}>No evening dining booked</span></div>
                    <p style={{ fontSize: 12, color: G[500], margin: "0 0 5px" }}>Add a dinner recommendation for this evening</p>
                    <div style={{ fontSize: 11, color: "#15803D", fontWeight: 600, marginBottom: 7 }}>💰 Add a restaurant to earn commission</div>
                    <button onClick={() => { setRightTab("browse"); setCat("dining"); }} data-testid={`button-fill-gap-day-${d}`} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: P, color: "white", border: "none", cursor: "pointer" }}>Fill This Gap →</button>
                  </div>
                ))
              )}
              {totalItems > 0 && commission && (
                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "8px 12px", marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#15803D", display: "flex", alignItems: "center", gap: 5 }}>
                    <TrendingUp style={{ width: 12, height: 12 }} /> Your estimated earnings: ${parseFloat(commission.expertShare).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Browse Tab */}
          {rightTab === "browse" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: G[900] }}>Providers</span>
                  {trip?.destination && <span style={{ fontSize: 11, background: G[100], padding: "2px 7px", borderRadius: 99, color: G[500], display: "flex", alignItems: "center", gap: 3 }}><MapPin style={{ width: 10, height: 10 }} /> {trip.destination}</span>}
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: G[400] }}><Filter style={{ width: 14, height: 14 }} /></button>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                {[{ k: "all", l: "All" }, { k: "dining", l: "🍽 Dining" }, { k: "activities", l: "🏛 Activities" }, { k: "hotels", l: "🏨 Hotels" }, { k: "transport", l: "🚌 Transport" }].map(c => (
                  <Chip key={c.k} active={cat === c.k} onClick={() => setCat(c.k)}>{c.l}</Chip>
                ))}
              </div>
              <div style={{ background: `${P}08`, border: `1px solid ${P}25`, borderRadius: 8, padding: "6px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles style={{ width: 13, height: 13, color: P, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: P }}>Filtered for {trip?.destination || "destination"} · {cat === "all" ? "all categories" : cat}</span>
              </div>
              {providers && providers.length > 0 ? (
                providers.filter(p => cat === "all" || p.category?.toLowerCase().includes(cat) || p.serviceType?.toLowerCase().includes(cat)).slice(0, 8).map((p: any) => (
                  <div key={p.id} data-testid={`card-provider-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 10, border: `1px solid ${G[100]}`, background: "white", marginBottom: 7, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: G[100], flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🏢</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: G[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.serviceName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: G[500] }}>{p.serviceType || p.category}</span>
                        {p.price && <><span style={{ color: G[300] }}>·</span><span style={{ fontSize: 11, color: G[500] }}>${p.price}</span></>}
                      </div>
                    </div>
                    <button onClick={() => setAddingItemDay(daysWithDinnerGap[0] || 1)} data-testid={`button-add-provider-${p.id}`} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: P, color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <Plus style={{ width: 10, height: 10 }} /> Add
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: "center", padding: "30px 0", color: G[400], fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  No platform providers found for this destination yet.
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => setBookingBrief({ provider: "Viator", bookingUrl: "https://www.viator.com" })} data-testid="button-browse-viator" style={{ padding: "6px 14px", borderRadius: 7, background: P, color: "white", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Browse Viator</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${G[100]}`, textAlign: "center" }}><span style={{ fontSize: 10, color: G[400] }}>Powered by Traveloure · Viator · Google Places</span></div>
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
                    <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600, marginTop: 2 }}>{Math.round(commission.revenueShareRate * 100)}% revenue share · {commission.itemCount} items</div>
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
          {rightTab === "affiliates" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: `${P}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Link2 style={{ width: 11, height: 11, color: P }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, color: G[900] }}>Affiliate Networks</span>
              </div>
              <p style={{ fontSize: 11, color: G[500], marginBottom: 12 }}>External booking networks integrated by Traveloure. Use these to complete bookings on behalf of your client.</p>
              {[
                { n: "Booking.com", c: "Hotels", e: "🏨", active: true, url: "https://www.booking.com", note: "Use for hotel reservations — enter client details from Booking Brief" },
                { n: "Viator", c: "Activities & Experiences", e: "🎭", active: true, url: "https://www.viator.com", note: "Best for tours, tickets & experiences — client name required at checkout" },
                { n: "12Go Asia", c: "Ground Transport", e: "🚅", active: true, url: "https://12go.asia", note: "Trains, buses, ferries — great for multi-city transport legs" },
                { n: "SafetyWing", c: "Travel Insurance", e: "🛡️", active: false, url: "", note: "Connect to offer travel insurance add-ons" },
                { n: "Airalo", c: "eSIM Data", e: "📱", active: false, url: "", note: "Connect to offer destination eSIM before departure" },
              ].map((aff, i) => (
                <div key={i} data-testid={`card-affiliate-${aff.n.toLowerCase().replace(/[^a-z0-9]/g, "-")}`} style={{ padding: "10px 11px", border: `1px solid ${aff.active ? G[200] : G[100]}`, borderRadius: 10, marginBottom: 8, background: "white" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: aff.active ? 6 : 0 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{aff.e}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: G[900] }}>{aff.n}</span>
                        {aff.active && <Bdg c="green">Active</Bdg>}
                      </div>
                      <div style={{ fontSize: 11, color: G[400] }}>{aff.c}</div>
                    </div>
                    <button onClick={() => aff.active ? setBookingBrief({ provider: aff.n, bookingUrl: aff.url }) : toast({ title: "Coming soon", description: `${aff.n} integration is in progress.` })} data-testid={`button-affiliate-${aff.n.toLowerCase().replace(/[^a-z0-9]/g, "-")}`} style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: aff.active ? "white" : P, color: aff.active ? P : "white", border: `1.5px solid ${P}`, cursor: "pointer" }}>
                      {aff.active ? "Open →" : "Connect →"}
                    </button>
                  </div>
                  {aff.active && <div style={{ fontSize: 11, color: G[500], background: G[50], borderRadius: 6, padding: "5px 8px" }}>{aff.note}</div>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
