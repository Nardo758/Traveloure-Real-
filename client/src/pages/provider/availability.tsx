/**
 * Provider Availability — full-page editor matching the AvailabilityNightly mockup.
 *
 * Layout: listing tab strip across the top, then a 2-column grid:
 *   left  — month calendar (AvailabilityMonthGrid from the manager)
 *   right — semantic rail:
 *     property/room  → Published date ranges + Blackouts
 *     scheduled      → Repeats weekly + One-off slots + Blackouts
 *     instant/async  → No-calendar message
 *
 * Uses real APIs throughout. Design tokens match the console mockup.
 */
import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProviderLayout } from "@/components/provider/provider-layout";
import {
  AvailabilityMonthGrid,
  type DateRange,
  type AvailabilityBlackout,
  type AvailabilityPattern,
  type VendorAvailabilitySlot,
} from "@/components/logistics/provider-availability-manager";
import type { ProviderService } from "@shared/schema";
import { needsScheduling } from "@shared/service-fundamentals";
import { Info } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────

const INK  = "#1A1A18";
const MUT  = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD  = "#FAFAF8";
const PAP  = "#FFFFFF";
const ACC  = "#35605A";
const ASF  = "#EDF2F1";

// ── Service shape helpers ─────────────────────────────────────────────────────

function isPropertyShaped(s: ProviderService) {
  return s.productShape === "property" || s.productShape === "property_room";
}

function serviceMeta(s: ProviderService): string {
  if (isPropertyShaped(s)) {
    return s.productShape === "property_room" ? "Property room · nightly" : "Property · nightly";
  }
  if (needsScheduling({ deliveryMethod: s.deliveryMethod, productShape: s.productShape })) {
    const dm = s.deliveryMethod ?? "";
    if (dm === "in_person") return "In person · scheduled";
    if (dm === "hybrid") return "Hybrid · scheduled";
    if (dm === "call" || dm === "video") return "Call or video · scheduled";
    return "Scheduled";
  }
  return "Instant delivery";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Primitive UI helpers ──────────────────────────────────────────────────────

function ConsoleCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: PAP, border: `1px solid ${HAIR}`, borderRadius: 7, ...style }}>
      {children}
    </div>
  );
}

function CardHd({ title }: { title: string }) {
  return (
    <div style={{
      padding: "14px 20px", borderBottom: `1px solid ${HAIR}`,
      fontSize: 14, fontWeight: 600, color: INK,
    }}>
      {title}
    </div>
  );
}

function MiniRow({
  title, sub, onRemove,
}: { title: string; sub: string; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", fontSize: 12.5 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontWeight: 600, color: INK }}>{title}</b>
        <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 1 }}>{sub}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{ background: "none", border: "none", color: ACC, padding: 0, cursor: "pointer", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}
      >
        Remove
      </button>
    </div>
  );
}

function GhostBtn({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent", color: INK, border: `1px solid ${HAIR}`, borderRadius: 6,
        padding: "7px 12px", fontSize: 12.5, fontWeight: 550, cursor: "pointer",
        font: "inherit", whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </button>
  );
}

function Capline({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 10 }}>
      {children}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  border: `1px solid ${HAIR}`, borderRadius: 6, background: PAP,
  color: INK, fontFamily: "inherit", fontSize: 13, outline: "none",
};

// ── Date-ranges right-rail card ───────────────────────────────────────────────

function DateRangesRail({ serviceId, presetDate }: { serviceId: string; presetDate?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const qKey = ["/api/provider/services", serviceId, "date-ranges"];

  const { data } = useQuery<{ dateRanges: DateRange[] }>({
    queryKey: qKey,
    queryFn: async () => (await apiRequest("GET", `/api/provider/services/${serviceId}/date-ranges`)).json(),
  });

  const [rows, setRows] = useState<{ startDate: string; endDate: string; nightlyPrice: string; capacity: number }[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Ghost-slot deep-link (3.3 Item 1.2): a `?date=` window opens the add-range form with the
  // requested day as the start, so a "requested" tap on a property lands ready to open the window.
  const [showAdd, setShowAdd] = useState(!!presetDate);
  const [newStart, setNewStart] = useState(presetDate ?? "");
  const [newEnd, setNewEnd] = useState("");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    if (presetDate) { setNewStart(presetDate); setShowAdd(true); }
  }, [presetDate]);
  useEffect(() => { setHydrated(false); }, [serviceId]);
  useEffect(() => {
    if (!hydrated && data) {
      setRows((data.dateRanges ?? []).map((r) => ({
        startDate: r.startDate, endDate: r.endDate,
        nightlyPrice: r.nightlyPrice ?? "", capacity: r.capacity ?? 1,
      })));
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async (next: typeof rows) => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/date-ranges`, {
        ranges: next.map((r) => ({
          startDate: r.startDate, endDate: r.endDate,
          nightlyPrice: r.nightlyPrice === "" ? null : Number(r.nightlyPrice),
          capacity: r.capacity,
        })),
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); toast({ title: "Date ranges saved" }); },
    onError: (e: any) => toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  function removeRow(i: number) {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    saveMutation.mutate(next);
  }

  function addRow() {
    if (!newStart || !newEnd) return;
    const next = [...rows, { startDate: newStart, endDate: newEnd, nightlyPrice: newPrice, capacity: 1 }];
    setRows(next);
    saveMutation.mutate(next);
    setShowAdd(false);
    setNewStart(""); setNewEnd(""); setNewPrice("");
  }

  return (
    <ConsoleCard style={{ marginBottom: 12 }}>
      <CardHd title="Published date ranges" />
      <div style={{ padding: "16px 20px" }}>
        {rows.length === 0 && !showAdd && (
          <div style={{ fontSize: 12.5, color: MUT, marginBottom: 8 }}>No open date ranges yet.</div>
        )}
        {rows.map((r, i) => (
          <div key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${HAIR}` : "none" }}>
            <MiniRow
              title={`${formatDate(r.startDate)} — ${formatDate(r.endDate)}`}
              sub={r.nightlyPrice ? `$${r.nightlyPrice} per night` : "Base price"}
              onRemove={() => removeRow(i)}
            />
          </div>
        ))}

        {showAdd ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
              <input
                type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                style={{ ...fieldStyle, flex: "1 1 120px", minWidth: 0, width: "auto" }}
                aria-label="Start date"
              />
              <span style={{ fontSize: 12, color: MUT }}>to</span>
              <input
                type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                style={{ ...fieldStyle, flex: "1 1 120px", minWidth: 0, width: "auto" }}
                aria-label="End date"
              />
            </div>
            <input
              type="number" min={0} step="0.01" value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Nightly price (leave blank for base price)"
              style={fieldStyle}
              aria-label="Nightly price"
            />
            <div style={{ display: "flex", gap: 7 }}>
              <GhostBtn onClick={addRow} style={{ background: ACC, color: PAP, borderColor: ACC }}>
                Publish range
              </GhostBtn>
              <GhostBtn onClick={() => setShowAdd(false)}>Cancel</GhostBtn>
            </div>
          </div>
        ) : (
          <GhostBtn style={{ marginTop: rows.length ? 10 : 0 }} onClick={() => setShowAdd(true)}>
            + Publish a range
          </GhostBtn>
        )}

        <Capline>
          A room is bookable <b style={{ color: INK }}>by the night across a range</b>, not by slot.
          Nightly price belongs to the range, so a season can be priced without touching the listing.
          There are no weekly day chips here — a room is not open "on Tuesdays".
        </Capline>
      </div>
    </ConsoleCard>
  );
}

// ── Blackouts right-rail card ─────────────────────────────────────────────────

function BlackoutsRail({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const qKey = ["/api/provider/services", serviceId, "blackouts"];

  const { data } = useQuery<{ blackouts: AvailabilityBlackout[] }>({
    queryKey: qKey,
    queryFn: async () => (await apiRequest("GET", `/api/provider/services/${serviceId}/blackouts`)).json(),
  });

  const [rows, setRows] = useState<{ startDate: string; endDate: string; reason: string }[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [reason, setReason] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => { setHydrated(false); }, [serviceId]);
  useEffect(() => {
    if (!hydrated && data) {
      setRows((data.blackouts ?? []).map((b) => ({ startDate: b.startDate, endDate: b.endDate, reason: b.reason ?? "" })));
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async (next: typeof rows) => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/blackouts`, {
        blackouts: next.map((b) => ({ startDate: b.startDate, endDate: b.endDate, reason: b.reason || null })),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      qc.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      toast({ title: "Blackouts saved" });
    },
    onError: (e: any) => toast({ title: "Could not save blackouts", description: e?.message, variant: "destructive" }),
  });

  function removeRow(i: number) {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    saveMutation.mutate(next);
  }

  function addRow() {
    if (!fromDate || !toDate) return;
    const next = [...rows, { startDate: fromDate, endDate: toDate, reason }];
    setRows(next);
    saveMutation.mutate(next);
    setReason(""); setFromDate(""); setToDate("");
  }

  return (
    <ConsoleCard>
      <CardHd title="Blackouts" />
      <div style={{ padding: "16px 20px" }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 12.5, color: MUT, marginBottom: 10 }}>No blackouts.</div>
        )}
        {rows.map((r, i) => (
          <div key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${HAIR}` : "none" }}>
            <MiniRow
              title={r.reason || "Blocked"}
              sub={`${formatDate(r.startDate)} — ${formatDate(r.endDate)}`}
              onRemove={() => removeRow(i)}
            />
          </div>
        ))}

        <div style={{ marginTop: rows.length ? 12 : 0, display: "flex", flexDirection: "column", gap: 7 }}>
          <input
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (shown only to you)"
            style={fieldStyle}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
            <input
              type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 110px", minWidth: 0, width: "auto" }}
              aria-label="Blackout from"
            />
            <span style={{ fontSize: 12, color: MUT }}>to</span>
            <input
              type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 110px", minWidth: 0, width: "auto" }}
              aria-label="Blackout to"
            />
          </div>
          <GhostBtn onClick={addRow}>Block this range</GhostBtn>
        </div>

        <Capline>
          A blackout <b style={{ color: INK }}>subtracts</b> — it never edits the pattern or the
          range. Remove it and the days come back exactly as they were.
        </Capline>
      </div>
    </ConsoleCard>
  );
}

// ── Weekly-patterns right-rail card ──────────────────────────────────────────

const DAY_LABELS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function WeeklyPatternsRail({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const qKey = ["/api/provider/services", serviceId, "availability-patterns"];

  const { data } = useQuery<{ patterns: AvailabilityPattern[] }>({
    queryKey: qKey,
    queryFn: async () => (await apiRequest("GET", `/api/provider/services/${serviceId}/availability-patterns`)).json(),
  });

  const [rows, setRows] = useState<{ dayOfWeek: number; startTime: string; endTime: string; capacity: number }[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(false); }, [serviceId]);
  useEffect(() => {
    if (!hydrated && data) {
      setRows((data.patterns ?? []).map((p) => ({
        dayOfWeek: p.dayOfWeek, startTime: p.startTime,
        endTime: p.endTime, capacity: p.capacity ?? 1,
      })));
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/availability-patterns`, { patterns: rows });
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qKey });
      qc.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      const created = result?.materialized?.created ?? 0;
      toast({ title: "Weekly schedule saved", description: created > 0 ? `${created} slot${created === 1 ? "" : "s"} published.` : undefined });
    },
    onError: (e: any) => {
      const msg: string = e?.message ?? "";
      const serverMsg = (() => { try { return JSON.parse(msg.replace(/^\d{3}:\s*/, "")).message as string; } catch { return null; } })();
      toast({ title: "Could not save", description: (serverMsg ?? msg) || "Check fields and try again.", variant: "destructive" });
    },
  });

  // Compute which days are active across all pattern rows
  const activeDays = new Set(rows.map((r) => r.dayOfWeek));
  const firstRow = rows[0];
  const startTime = firstRow?.startTime ?? "09:00";
  const capacity = firstRow?.capacity ?? 1;

  function toggleDay(dow: number) {
    if (activeDays.has(dow)) {
      setRows(rows.filter((r) => r.dayOfWeek !== dow));
    } else {
      // Inherit time/capacity from first row
      setRows([...rows, { dayOfWeek: dow, startTime: firstRow?.startTime ?? "09:00", endTime: firstRow?.endTime ?? "17:00", capacity: firstRow?.capacity ?? 1 }]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek));
    }
  }

  function setTimeForAll(field: "startTime" | "endTime", val: string) {
    setRows(rows.map((r) => ({ ...r, [field]: val })));
  }

  function setCapacityForAll(val: number) {
    setRows(rows.map((r) => ({ ...r, capacity: val })));
  }

  return (
    <ConsoleCard style={{ marginBottom: 12 }}>
      <CardHd title="Repeats weekly" />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 550, color: INK, marginBottom: 6 }}>
            On these days
          </label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
            {DAY_LABELS_SHORT.map((d, i) => {
              const on = activeDays.has(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(i)}
                  style={{
                    width: 30, height: 30, borderRadius: 6, cursor: "pointer", font: "inherit",
                    border: `1px solid ${on ? ACC : HAIR}`,
                    background: on ? ACC : PAP,
                    color: on ? "#fff" : MUT,
                    fontSize: 11.5, fontWeight: on ? 650 : 400,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 550, marginBottom: 5 }}>Start time</label>
            <input
              type="time" value={startTime}
              onChange={(e) => setTimeForAll("startTime", e.target.value)}
              style={fieldStyle}
              data-testid="input-patterns-start"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 550, marginBottom: 5 }}>Seats</label>
            <input
              type="number" min={1} value={capacity}
              onChange={(e) => setCapacityForAll(Math.max(1, parseInt(e.target.value) || 1))}
              style={fieldStyle}
              data-testid="input-patterns-capacity"
            />
          </div>
        </div>

        <GhostBtn
          onClick={() => saveMutation.mutate()}
          style={{ background: ACC, color: PAP, borderColor: ACC }}
        >
          {saveMutation.isPending ? "Saving…" : "Save schedule"}
        </GhostBtn>

        <Capline>
          One pattern, written once — the grid is the <b style={{ color: INK }}>outcome</b>, not a
          second thing to keep in sync.
        </Capline>
      </div>
    </ConsoleCard>
  );
}

// ── One-off slots right-rail card ─────────────────────────────────────────────

function OneOffSlotsRail({ serviceId, presetDate }: { serviceId: string; presetDate?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allSlots } = useQuery<VendorAvailabilitySlot[]>({
    queryKey: ["/api/provider/availability"],
  });

  const today = new Date().toISOString().slice(0, 10);
  const serviceSlots = (allSlots ?? [])
    .filter((s) => s.serviceId === serviceId && s.date >= today && s.status !== "withdrawn")
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calendar ghost-slot deep-link (3.3 Item 1.2): a `?date=` window preselects the add-slot form
  // with that day filled in and open, so tapping a "requested" day lands ready to publish a slot.
  const [showAdd, setShowAdd] = useState(!!presetDate);
  const [newDate, setNewDate] = useState(presetDate ?? "");
  useEffect(() => {
    if (presetDate) { setNewDate(presetDate); setShowAdd(true); }
  }, [presetDate]);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [newSeats, setNewSeats] = useState(1);
  const [note, setNote] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/availability", {
        serviceId, date: newDate, startTime: newStart, endTime: newEnd, capacity: newSeats,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      toast({ title: "One-off slot added" });
      setShowAdd(false); setNewDate(""); setNewStart("09:00"); setNewEnd("17:00"); setNewSeats(1); setNote("");
    },
    onError: (e: any) => toast({ title: "Could not add slot", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/provider/availability/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/provider/availability"] }),
  });

  return (
    <ConsoleCard style={{ marginBottom: 12 }}>
      <CardHd title="One-off slots" />
      <div style={{ padding: "16px 20px" }}>
        {serviceSlots.length === 0 && !showAdd && (
          <div style={{ fontSize: 12.5, color: MUT, marginBottom: 8 }}>No one-off slots yet.</div>
        )}
        {serviceSlots.map((s, i) => (
          <div key={s.id} style={{ borderBottom: i < serviceSlots.length - 1 ? `1px solid ${HAIR}` : "none" }}>
            <MiniRow
              title={`${formatDate(s.date)} · ${s.startTime ?? "–"} · ${s.capacity ?? 1} seat${(s.capacity ?? 1) === 1 ? "" : "s"}`}
              sub={`${Math.max(0, (s.capacity ?? 1) - (s.bookedCount ?? 0))} available`}
              onRemove={() => deleteMutation.mutate(s.id)}
            />
          </div>
        ))}

        {showAdd ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            <input
              type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              style={fieldStyle} aria-label="Date"
            />
            <div style={{ display: "flex", gap: 7 }}>
              <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} style={{ ...fieldStyle, flex: 1 }} aria-label="Start" />
              <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} style={{ ...fieldStyle, flex: 1 }} aria-label="End" />
            </div>
            <input
              type="number" min={1} value={newSeats}
              onChange={(e) => setNewSeats(Math.max(1, parseInt(e.target.value) || 1))}
              placeholder="Seats"
              style={fieldStyle}
            />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} />
            <div style={{ display: "flex", gap: 7 }}>
              <GhostBtn onClick={() => addMutation.mutate()} style={{ background: ACC, color: PAP, borderColor: ACC }}>
                {addMutation.isPending ? "Adding…" : "Add slot"}
              </GhostBtn>
              <GhostBtn onClick={() => setShowAdd(false)}>Cancel</GhostBtn>
            </div>
          </div>
        ) : (
          <GhostBtn style={{ marginTop: serviceSlots.length ? 10 : 0 }} onClick={() => setShowAdd(true)}>
            + Add a one-off
          </GhostBtn>
        )}

        <Capline>
          Marked * on the grid so a one-off never looks like the pattern.
        </Capline>
      </div>
    </ConsoleCard>
  );
}

// ── No-calendar panel (2-col layout matching the mockup) ─────────────────────

function NoCalendarPanel({ deliveryMethod }: { deliveryMethod?: string | null }) {
  const opener = (() => {
    if (deliveryMethod === "pdf_guide")        return "A PDF guide is delivered the moment it is bought.";
    if (deliveryMethod === "async_messaging")  return "Async messages are sent on demand — there are no calendar slots.";
    if (deliveryMethod === "voice_notes")      return "Voice notes are delivered the moment they are bought.";
    return "This listing is delivered instantly the moment it is bought.";
  })();

  return (
    <>
      {/* 2-column: no-cal message + right card */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start", marginBottom: 20 }}>

        {/* Left — no-calendar message */}
        <div
          style={{
            background: GRD, border: `1px solid ${HAIR}`, borderRadius: 7,
            padding: "32px 26px", textAlign: "center",
          }}
        >
          <b style={{ color: INK, fontSize: 14, display: "block", marginBottom: 10 }}>
            No calendar — this sells without slots
          </b>
          <p style={{ fontSize: 13, color: MUT, lineHeight: 1.65, margin: 0 }}>
            {opener} There is nothing to publish, nothing to black out, and no "next available".
            Showing an empty month grid here would invent a question this listing does not have —
            so the editor says so instead.
          </p>
        </div>

        {/* Right — "Nothing to publish" card */}
        <ConsoleCard>
          <CardHd title="Nothing to publish" />
          <div style={{ padding: "14px 20px" }}>
            <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.55, margin: "0 0 12px" }}>
              This listing sells without a calendar, so there is no pattern, no range and no
              blackout rail. The editor states that rather than showing three empty controls that
              would never do anything.
            </p>
            <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.55, margin: 0 }}>
              <strong style={{ color: INK }}>
                The honest answer is a sentence, not an empty grid.
              </strong>{" "}
              A provider who sees a month here would reasonably think their listing needs dates.
            </p>
          </div>
        </ConsoleCard>
      </div>

      {/* Footer note — "Why one editor and not three" */}
      <div
        style={{
          fontSize: 12.5, color: MUT, lineHeight: 1.65,
          paddingTop: 16, borderTop: `1px solid ${HAIR}`,
        }}
      >
        <strong style={{ color: INK }}>Why one editor and not three.</strong>{" "}
        A weekly pattern, a date range and "no calendar" are three{" "}
        <em>semantics</em>, not three products — they share the same month grid, the same
        blackout rail and the same published/not-published vocabulary. Splitting them would give a
        provider with a tour <em>and</em> a room two unrelated calendars to keep in their head.
      </div>
    </>
  );
}

// ── Service editor — dispatches by product shape / delivery method ─────────────

function ServiceEditor({ service, presetDate }: { service: ProviderService; presetDate?: string }) {
  if (isPropertyShaped(service)) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
        <AvailabilityMonthGrid serviceId={service.id} semantics="nightly" />
        <div>
          <DateRangesRail serviceId={service.id} presetDate={presetDate} />
          <BlackoutsRail serviceId={service.id} />
        </div>
      </div>
    );
  }
  if (needsScheduling({ deliveryMethod: service.deliveryMethod, productShape: service.productShape })) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
        <AvailabilityMonthGrid serviceId={service.id} semantics="scheduled" />
        <div>
          <WeeklyPatternsRail serviceId={service.id} />
          <OneOffSlotsRail serviceId={service.id} presetDate={presetDate} />
          <BlackoutsRail serviceId={service.id} />
        </div>
      </div>
    );
  }
  return <NoCalendarPanel deliveryMethod={service.deliveryMethod} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProviderAvailability() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const deepLinkId = params.get("serviceId") ?? undefined;
  // 3.3 Item 1.2 — the Calendar ghost-slot chip deep-links here with `?date=YYYY-MM-DD` to
  // preselect the requested window in the add-slot/add-range form. Validated shape (ignored if
  // malformed) so a stray param never seeds a bad date.
  const dateParam = params.get("date") ?? undefined;
  const presetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const { data: services, isLoading } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider/services"],
  });

  const [selectedId, setSelectedId] = useState<string>(deepLinkId ?? "");

  // Auto-select: deep-link id first, then first service
  useEffect(() => {
    if (selectedId || !services?.length) return;
    setSelectedId(deepLinkId && services.some((s) => s.id === deepLinkId)
      ? deepLinkId
      : services[0].id);
  }, [services, deepLinkId, selectedId]);

  const selectedService = services?.find((s) => s.id === selectedId);

  return (
    <ProviderLayout title="Availability">
      <div style={{ padding: "24px 28px", maxWidth: 1080 }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 20, color: MUT }}>
          <Link href="/provider/services">
            <span style={{ color: ACC, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
              Catalog
            </span>
          </Link>
          <span style={{ color: "#C4C4BC" }}>›</span>
          <span style={{ color: INK, fontWeight: 600 }}>Availability</span>
          {selectedService && (
            <>
              <span style={{ color: "#C4C4BC" }}>›</span>
              <span style={{ color: INK }}>{selectedService.serviceName}</span>
            </>
          )}
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: INK, margin: "0 0 4px" }}>
            Availability
          </h1>
          <p style={{ fontSize: 13, color: MUT, margin: 0, maxWidth: "72ch", lineHeight: 1.55 }}>
            Choose a listing, then publish the schedule travelers can book against. Scheduled
            listings use weekly patterns, property rooms publish date ranges, and instant-delivery
            listings need no calendar at all.
          </p>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 13, color: MUT }}>Loading listings…</div>
        ) : !services?.length ? (
          <div style={{
            background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 7,
            padding: "28px 22px", textAlign: "center", fontSize: 13, color: MUT,
          }}>
            Create a service before setting availability.
          </div>
        ) : (
          <>
            {/* Listing tab strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(services.length, 4)}, minmax(0, 1fr))`,
                border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden",
                marginBottom: 18, background: PAP,
              }}
              role="tablist"
              aria-label="Listings"
              data-testid="availability-tab-strip"
            >
              {services.map((svc, i) => {
                const on = svc.id === selectedId;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSelectedId(svc.id)}
                    style={{
                      background: on ? ASF : PAP,
                      border: "none",
                      borderRight: i < services.length - 1 ? `1px solid ${HAIR}` : "none",
                      boxShadow: on ? `inset 0 -2px 0 ${ACC}` : "none",
                      padding: "11px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    data-testid={`tab-service-${svc.id}`}
                  >
                    <b style={{ display: "block", fontSize: 13, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {svc.serviceName || "Untitled"}
                    </b>
                    <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 2 }}>
                      {serviceMeta(svc)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Editor */}
            {selectedService && <ServiceEditor service={selectedService} presetDate={presetDate} />}
          </>
        )}
      </div>
    </ProviderLayout>
  );
}
