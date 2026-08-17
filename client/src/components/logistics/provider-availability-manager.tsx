import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Calendar, CalendarOff, CalendarClock, Info, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProviderService } from "@shared/schema";
import { needsScheduling } from "@shared/service-fundamentals";

// C2 repair (historical): this manager previously POSTed a {dayOfWeek, startTime, endTime,
// isAvailable, pricingModifier} weekly-schedule shape the server never accepted (it required
// serviceId + date), and its GET expected {schedule, blackoutDates} while the server returned a
// flat vendor_availability_slots row array — every real submit 400d and nothing ever rendered. The
// weekly-schedule/blackout sections were removed rather than left pretending to work, because
// `provider_availability_schedule` (a recurring-pattern model) never existed.
//
// S7 (DECISIONS.md ledger row 102, Wave 3 schema ballot ratified as recommended, decision-maker
// Aug 13, 2026; docs/briefs/WAVE3_SCHEMA_PROPOSALS.md) builds that model for real:
// `service_availability_patterns` / `service_date_ranges` / `service_availability_blackouts`
// (migration 210), with owner-gated replace-list write rails at
// PUT /api/provider/services/:id/{availability-patterns,date-ranges,blackouts}. This component is
// ONE editor with per-method semantics (G1 REC): a scheduled method (in_person/hybrid/call/video)
// gets weekly patterns + blackouts; a property/property_room listing gets date-ranges (+
// blackouts, which apply to either shape); an artifact/async method (pdf/voice_notes/
// async_messaging) gets an honest "no scheduling needed" state — no third option, no guessed UI
// (§13). The original concrete-dated-slot CRUD below (against vendor_availability_slots directly)
// keeps working completely unchanged — it is still useful for a one-off exception date.
export interface VendorAvailabilitySlot {
  id: string;
  serviceId: string;
  providerId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null;
}

export interface AvailabilityPattern {
  id: string;
  serviceId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number | null;
}

export interface DateRange {
  id: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  nightlyPrice: string | null;
  capacity: number | null;
}

export interface AvailabilityBlackout {
  id: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type PatternRow = { dayOfWeek: number; startTime: string; endTime: string; capacity: number };
type DateRangeRow = { startDate: string; endDate: string; nightlyPrice: string; capacity: number };
type BlackoutRow = { startDate: string; endDate: string; reason: string };

function isPropertyShaped(service: ProviderService | undefined): boolean {
  return service?.productShape === "property" || service?.productShape === "property_room";
}

export function ProviderAvailabilityManager({
  initialServiceId,
}: {
  /** CATALOG REBUILD (mock `?availability=<id>` deep-link + the Catalog "Edit slots"
   *  affordance): preselect this service once the real service list has loaded. A stale
   *  id (not in this owner's list) is simply never applied — no guessed fallback. */
  initialServiceId?: string;
} = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: services } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider/services"],
  });

  const { data: slots } = useQuery<VendorAvailabilitySlot[]>({
    queryKey: ["/api/provider/availability"],
  });

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");

  useEffect(() => {
    if (!initialServiceId || selectedServiceId) return;
    if ((services ?? []).some((s) => s.id === initialServiceId)) {
      setSelectedServiceId(initialServiceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialServiceId, services]);
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [newCapacity, setNewCapacity] = useState(1);

  const addSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/availability", {
        serviceId: selectedServiceId,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
        capacity: newCapacity,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      setNewDate("");
      toast({ title: "Availability slot added" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not add slot",
        description: error?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
    },
  });

  const services_ = services || [];
  const serviceNameById = new Map(services_.map((s) => [s.id, s.serviceName]));

  const selectedService = services_.find((s) => s.id === selectedServiceId);

  // The editor is PER-LISTING (the mock: "Choose a listing, then publish the schedule travelers
  // can book against") — the one-off card scopes to the drawer's one selection, never a
  // provider-wide list where another listing's slots render under this one's name.
  const upcomingSlots = [...(slots || [])]
    .filter((s) => s.serviceId === selectedServiceId)
    .filter((s) => s.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  // One-off dated slots are SCHEDULED semantics only (the same routing
  // ServiceAvailabilityEditor uses): a property room's nights come from its published ranges
  // (the materializer owns those slots), and an artifact/async listing has no calendar at all —
  // rendering an authoring card under its "No calendar" state would invent a question the
  // listing does not have (§13 / S-4).
  const selectedTakesOneOffSlots = Boolean(
    selectedService &&
      !isPropertyShaped(selectedService) &&
      needsScheduling({
        deliveryMethod: selectedService.deliveryMethod,
        productShape: selectedService.productShape,
      }),
  );

  const canSubmit = Boolean(selectedServiceId && newDate && newStart && newEnd);

  // Ruling 112 Q5 (mock's "Next available" chip): the earliest upcoming slot with seats left for
  // the selected listing. Derived from real rows only — no slots, no chip (§13).
  const nextAvailable = selectedServiceId
    ? upcomingSlots.find(
        (s) =>
          s.serviceId === selectedServiceId &&
          (s.bookedCount ?? 0) < (s.capacity ?? 1) &&
          s.status !== "withdrawn",
      )
    : undefined;
  const formatSlotDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Availability
          </CardTitle>
          <CardDescription>
            Choose a listing, then publish the schedule travelers can book against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {services_.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a service before setting availability.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="max-w-sm flex-1 min-w-[220px]">
                <Label className="text-xs">Service</Label>
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger className="h-9" data-testid="select-availability-service">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services_.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.serviceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedServiceId && (
                nextAvailable ? (
                  <Badge
                    variant="secondary"
                    className="h-7 rounded-full px-3 text-xs font-medium"
                    data-testid="chip-next-available"
                  >
                    Next available: {formatSlotDate(nextAvailable.date)}
                    {nextAvailable.startTime ? ` · ${nextAvailable.startTime}` : ""}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground pb-1.5" data-testid="text-no-next-available">
                    No upcoming bookable dates yet.
                  </span>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedService && <ServiceAvailabilityEditor service={selectedService} />}

      {selectedTakesOneOffSlots && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            One-off dated slots
          </CardTitle>
          <CardDescription>
            A concrete exception date and time — useful outside the recurring schedule above, or
            for a listing that doesn't use a weekly pattern.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {services_.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a service before adding availability.
            </p>
          ) : upcomingSlots.length > 0 ? (
            <div className="space-y-2">
              {upcomingSlots.map((slot) => {
                const capacity = slot.capacity ?? 1;
                const booked = slot.bookedCount ?? 0;
                const fullyBooked = booked >= capacity;
                return (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 border border-console-light rounded px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {serviceNameById.get(slot.serviceId) || "Service"}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {slot.date} · {slot.startTime}–{slot.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={fullyBooked ? "outline" : "secondary"} className="text-[10px]">
                        {fullyBooked ? "Fully booked" : `${capacity - booked} of ${capacity} open`}
                      </Badge>
                      <button
                        onClick={() => deleteSlotMutation.mutate(slot.id)}
                        className="text-red-400 hover:text-red-600"
                        aria-label="Delete slot"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No slots scheduled yet.</p>
          )}

          <Separator />

          {/* ONE listing picker per editor (the drawer's own, above) — the add form authors
              slots for that selection; a second picker here let a dated slot be authored onto
              an async listing the no-calendar branch had just refused a calendar for. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            <div>
              <Label className="text-xs">Capacity</Label>
              <Input
                type="number"
                min={1}
                value={newCapacity}
                onChange={(e) => setNewCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              onClick={() => addSlotMutation.mutate()}
              disabled={!canSubmit || addSlotMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add slot
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

/**
 * Per-method routing (G1 REC): property/room shapes get date-ranges; a scheduled delivery method
 * gets weekly patterns + blackouts; everything else (artifact/async delivery, or a listing with no
 * method classified yet) gets an honest no-scheduling state. No third option (§13).
 *
 * S-3 (ledger 2026-08-16-console-sweep): both calendar-bearing semantics now share the mock's
 * ONE month grid (Bookable / Blacked out / Nothing published / Today), mounted above the rails —
 * "the grid is the outcome, not a second thing to keep in sync". The no-calendar branch keeps
 * its sentence instead of an empty grid, in the mock's own words (S-4).
 */
function ServiceAvailabilityEditor({ service }: { service: ProviderService }) {
  if (isPropertyShaped(service)) {
    return (
      <div className="space-y-4">
        <AvailabilityMonthGrid serviceId={service.id} semantics="nightly" />
        <DateRangesEditor serviceId={service.id} />
        <BlackoutsEditor serviceId={service.id} />
      </div>
    );
  }
  if (needsScheduling({ deliveryMethod: service.deliveryMethod, productShape: service.productShape })) {
    return (
      <div className="space-y-4">
        <AvailabilityMonthGrid serviceId={service.id} semantics="scheduled" />
        <WeeklyPatternsEditor serviceId={service.id} />
        <BlackoutsEditor serviceId={service.id} />
      </div>
    );
  }
  return (
    <Card data-testid="card-availability-no-schedule">
      <CardContent className="p-6 flex items-start gap-3">
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          {/* S-4: the mock's words. An empty month grid here would invent a question this
              listing does not have — so the editor says so instead. */}
          <p className="text-sm font-medium text-console-darkest">
            No calendar — this sells without slots
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            This listing is delivered as a file or asynchronously the moment it is bought. There
            is nothing to publish, nothing to black out, and no &ldquo;next available&rdquo;.
            Calendars apply to phone/video calls, in-person or hybrid services, and property
            listings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── S-3: the shared month grid ────────────────────────────────────────────────────────────────
//
// ONE grid for both calendar-bearing semantics (the mock's core claim about gap #2: weekly
// patterns and date ranges are "three semantics, not three products — they share the same month
// grid, the same blackout rail and the same published/not-published vocabulary"). Derived from
// REAL rows only (§13):
//   · scheduled — the materialized vendor_availability_slots the traveler can actually book
//     (the same read the "Next available" chip uses), so the grid is the OUTCOME of the weekly
//     pattern + one-off slots, never a re-derivation of the pattern itself (§18 rule 1).
//   · nightly  — the published service_date_ranges.
// Blackouts overlay either shape (a blackout subtracts; it never edits the pattern or range).
// A day with nothing behind it renders as nothing published — never guessed bookable.
// The grid OPENS on the month of the next bookable day (the mock: "the grid opens where the
// availability is"); prev/next then hand control to the provider.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function AvailabilityMonthGrid({
  serviceId,
  semantics,
}: {
  serviceId: string;
  semantics: "scheduled" | "nightly";
}) {
  // Same query keys as the sibling editors/parent — shared cache, no second fetch shape.
  const { data: slotsData } = useQuery<VendorAvailabilitySlot[]>({
    queryKey: ["/api/provider/availability"],
    enabled: semantics === "scheduled",
  });
  const { data: rangesData } = useQuery<{ dateRanges: DateRange[] }>({
    queryKey: ["/api/provider/services", serviceId, "date-ranges"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}/date-ranges`);
      return res.json();
    },
    enabled: semantics === "nightly",
  });
  const { data: blackoutsData } = useQuery<{ blackouts: AvailabilityBlackout[] }>({
    queryKey: ["/api/provider/services", serviceId, "blackouts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}/blackouts`);
      return res.json();
    },
  });

  const now = new Date();
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const [month, setMonth] = useState<{ y: number; m: number }>({
    y: now.getFullYear(),
    m: now.getMonth(),
  });

  const serviceSlots = (slotsData ?? []).filter(
    (s) => s.serviceId === serviceId && s.status !== "withdrawn",
  );
  const ranges = rangesData?.dateRanges ?? [];
  const blackouts = blackoutsData?.blackouts ?? [];

  type DayState =
    | { kind: "block"; label: string | null }
    | { kind: "open"; label: string | null }
    | { kind: "none" };

  function dayState(d: string): DayState {
    const blackout = blackouts.find((b) => d >= b.startDate && d <= b.endDate);
    if (blackout) return { kind: "block", label: blackout.reason };
    if (semantics === "scheduled") {
      const daySlots = serviceSlots.filter((s) => s.date === d);
      if (daySlots.length > 0) {
        const first = [...daySlots].sort((a, b) =>
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
        )[0];
        const left = Math.max(0, (first.capacity ?? 1) - (first.bookedCount ?? 0));
        const label =
          (first.startTime ? first.startTime : "") +
          (first.startTime ? " · " : "") +
          `${left} left` +
          (daySlots.length > 1 ? ` +${daySlots.length - 1}` : "");
        return { kind: "open", label };
      }
      return { kind: "none" };
    }
    const range = ranges.find((r) => d >= r.startDate && d <= r.endDate);
    if (range) {
      return {
        kind: "open",
        // §13: a range without its own nightly price uses the listing's base price — say
        // "Bookable" rather than inventing a number here.
        label: range.nightlyPrice != null && range.nightlyPrice !== "" ? `$${range.nightlyPrice} / night` : "Bookable",
      };
    }
    return { kind: "none" };
  }

  // First bookable day from today forward — the month the grid should open on.
  const nextBookable = (() => {
    if (semantics === "scheduled") {
      const upcoming = serviceSlots
        .filter((s) => s.date >= todayIso && (s.bookedCount ?? 0) < (s.capacity ?? 1))
        .map((s) => s.date)
        .sort();
      return upcoming.find((d) => dayState(d).kind === "open") ?? null;
    }
    const candidates = ranges
      .filter((r) => r.endDate >= todayIso)
      .map((r) => (r.startDate >= todayIso ? r.startDate : todayIso))
      .sort();
    return candidates.find((d) => dayState(d).kind === "open") ?? null;
  })();

  // Open where the availability is — once per listing, then prev/next belong to the provider.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  useEffect(() => {
    if (openedFor === serviceId) return;
    if (slotsData === undefined && semantics === "scheduled") return;
    if (rangesData === undefined && semantics === "nightly") return;
    if (nextBookable) {
      const [y, m] = nextBookable.split("-").map(Number);
      setMonth({ y, m: m - 1 });
    } else {
      setMonth({ y: now.getFullYear(), m: now.getMonth() });
    }
    setOpenedFor(serviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, slotsData, rangesData, nextBookable, openedFor]);

  const firstDow = new Date(month.y, month.m, 1).getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;

  const blockStripes =
    "repeating-linear-gradient(135deg,#FBF6EC,#FBF6EC 6px,#F5EDDC 6px,#F5EDDC 12px)";

  return (
    <Card className="overflow-hidden" data-testid="card-availability-month-grid">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <CardTitle className="text-base flex-1 min-w-[8rem]" data-testid="text-month-grid-title">
            {MONTH_NAMES[month.m]} {month.y}
          </CardTitle>
          {nextBookable ? (
            <button
              type="button"
              onClick={() => {
                const [y, m] = nextBookable.split("-").map(Number);
                setMonth({ y, m: m - 1 });
              }}
              className="rounded-full border border-[#CBDAD7] bg-[#EDF2F1] px-3 py-1 text-xs font-medium text-[#35605A]"
              data-testid="button-month-grid-next-available"
            >
              {(() => {
                const [y, m, d] = nextBookable.split("-").map(Number);
                return "Next available: " + new Date(y, m - 1, d).toLocaleDateString("en-US", {
                  weekday: "short", day: "numeric", month: "short",
                });
              })()}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground" data-testid="text-month-grid-nothing">
              Nothing published yet
            </span>
          )}
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              type="button"
              aria-label="Previous month"
              className="px-2 py-1 hover:bg-muted/40 border-r"
              onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
              data-testid="button-month-grid-prev"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              className="px-2 py-1 hover:bg-muted/40"
              onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
              data-testid="button-month-grid-next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-t border-b">
          {DAY_LABELS.map((d) => (
            <span
              key={d}
              className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7" data-testid="month-grid-body">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[3.5rem] border-r border-b bg-muted/30 [&:nth-child(7n)]:border-r-0" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const d = isoOf(month.y, month.m, dayNum);
            const state = dayState(d);
            const isToday = d === todayIso;
            return (
              <div
                key={d}
                className={
                  "min-h-[3.5rem] border-r border-b px-1.5 py-1 text-[11px] " +
                  (state.kind === "open" ? "bg-[#EDF2F1] " : "") +
                  (isToday ? "shadow-[inset_0_0_0_2px_#1A1A18] " : "")
                }
                style={state.kind === "block" ? { background: blockStripes } : undefined}
                data-testid={`month-grid-day-${d}`}
                data-day-state={state.kind}
              >
                <span
                  className={
                    "block " +
                    (state.kind === "open"
                      ? "font-semibold text-[#35605A]"
                      : state.kind === "block"
                        ? "font-semibold text-[#6B551F]"
                        : "text-muted-foreground")
                  }
                >
                  {dayNum}
                </span>
                {state.kind === "open" && state.label && (
                  <span className="block leading-tight font-medium text-[#35605A]">{state.label}</span>
                )}
                {state.kind === "block" && (
                  <span className="block leading-tight text-[10.5px] text-[#6B551F]">
                    {state.label || "Blacked out"}
                  </span>
                )}
              </div>
            );
          })}
          {Array.from({ length: trailing }).map((_, i) => (
            <div key={`trail-${i}`} className="min-h-[3.5rem] border-r border-b bg-muted/30 [&:nth-child(7n)]:border-r-0" />
          ))}
        </div>
        <div className="flex gap-4 flex-wrap px-4 py-2.5 text-[11px] text-muted-foreground" data-testid="month-grid-legend">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-[2px] border border-[#CBDAD7] bg-[#EDF2F1]" />
            Bookable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-[2px] border border-[#D9C79A] bg-[#F5EDDC]" />
            Blacked out
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-[2px] border bg-white" />
            Nothing published
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-[2px] border border-[#1A1A18] bg-white" />
            Today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyPatternsEditor({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/provider/services", serviceId, "availability-patterns"];

  const { data, isLoading } = useQuery<{ patterns: AvailabilityPattern[] }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}/availability-patterns`);
      return res.json();
    },
  });

  const [rows, setRows] = useState<PatternRow[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
  }, [serviceId]);

  useEffect(() => {
    if (!hydrated && data) {
      setRows(
        (data.patterns ?? []).map((p) => ({
          dayOfWeek: p.dayOfWeek,
          startTime: p.startTime,
          endTime: p.endTime,
          capacity: p.capacity ?? 1,
        })),
      );
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/availability-patterns`, {
        patterns: rows,
      });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      const created = result?.materialized?.created ?? 0;
      toast({
        title: "Weekly schedule saved",
        description: created > 0 ? `${created} bookable slot${created === 1 ? "" : "s"} published.` : undefined,
      });
    },
    onError: (error: any) => {
      // Replit assessment note (post-ruling-116): the two failure modes are different acts and
      // deserve different words — 400 is "this payload repeats a window" (fix the rows), 409 is
      // "someone else saved meanwhile" (reload, then reapply). apiRequest throws "STATUS: body".
      const msg: string = error?.message ?? "";
      const serverMessage = (() => {
        try { return JSON.parse(msg.replace(/^\d{3}:\s*/, "")).message as string; } catch { return null; }
      })();
      const description = msg.startsWith("409")
        ? "This schedule was changed elsewhere (another tab or device). Reload to pick up the latest version, then reapply your edit."
        : msg.startsWith("400")
          ? (serverMessage ?? "Two windows in this schedule overlap or repeat — fix the highlighted rows and save again.")
          : (serverMessage ?? msg) || "Please check the fields and try again.";
      toast({
        title: "Could not save weekly schedule",
        description,
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-availability-patterns">
      <CardHeader>
        {/* S-4: the mock's section vocabulary. */}
        <CardTitle className="text-base">Repeats weekly</CardTitle>
        <CardDescription>
          Repeating windows travelers can book, expanded automatically into a rolling 60-day
          calendar. One pattern, written once — the month grid above is the outcome, not a second
          thing to keep in sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weekly pattern set yet.</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2" data-testid={`row-pattern-${i}`}>
              <div>
                <Label className="text-xs">Day</Label>
                <Select
                  value={String(row.dayOfWeek)}
                  onValueChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], dayOfWeek: Number(v) };
                    setRows(next);
                  }}
                >
                  <SelectTrigger className="h-9 w-28" data-testid={`select-pattern-day-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((label, dow) => (
                      <SelectItem key={dow} value={String(dow)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input
                  type="time" className="h-9"
                  value={row.startTime}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], startTime: e.target.value };
                    setRows(next);
                  }}
                  data-testid={`input-pattern-start-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input
                  type="time" className="h-9"
                  value={row.endTime}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], endTime: e.target.value };
                    setRows(next);
                  }}
                  data-testid={`input-pattern-end-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">Capacity</Label>
                <Input
                  type="number" min={1} className="h-9 w-20"
                  value={row.capacity}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], capacity: Math.max(1, parseInt(e.target.value) || 1) };
                    setRows(next);
                  }}
                  data-testid={`input-pattern-capacity-${i}`}
                />
              </div>
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                data-testid={`button-remove-pattern-${i}`}
              >
                Remove
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setRows([...rows, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", capacity: 1 }])}
            data-testid="button-add-pattern"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add a repeating window
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-patterns"
          >
            Save weekly schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DateRangesEditor({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/provider/services", serviceId, "date-ranges"];

  const { data, isLoading } = useQuery<{ dateRanges: DateRange[] }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}/date-ranges`);
      return res.json();
    },
  });

  const [rows, setRows] = useState<DateRangeRow[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(false); }, [serviceId]);
  useEffect(() => {
    if (!hydrated && data) {
      setRows(
        (data.dateRanges ?? []).map((r) => ({
          startDate: r.startDate,
          endDate: r.endDate,
          nightlyPrice: r.nightlyPrice ?? "",
          capacity: r.capacity ?? 1,
        })),
      );
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/date-ranges`, {
        ranges: rows.map((r) => ({
          startDate: r.startDate,
          endDate: r.endDate,
          nightlyPrice: r.nightlyPrice === "" ? null : Number(r.nightlyPrice),
          capacity: r.capacity,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Date-range availability saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not save date ranges",
        description: error?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-availability-date-ranges">
      <CardHeader>
        {/* S-4: the mock's section vocabulary. */}
        <CardTitle className="text-base">Published date ranges</CardTitle>
        <CardDescription>
          Check-in/check-out windows this property or room is bookable, with an optional nightly
          price override. Leave the price blank to use the listing's base price. A room is
          bookable by the night across a range, not by slot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open date ranges yet.</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2" data-testid={`row-date-range-${i}`}>
              <div>
                <Label className="text-xs">Start date</Label>
                <Input
                  type="date" className="h-9"
                  value={row.startDate}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], startDate: e.target.value }; setRows(next); }}
                  data-testid={`input-range-start-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input
                  type="date" className="h-9"
                  value={row.endDate}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], endDate: e.target.value }; setRows(next); }}
                  data-testid={`input-range-end-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">Nightly price ($)</Label>
                <Input
                  type="number" min={0} step="0.01" className="h-9 w-32"
                  placeholder="Use base price"
                  value={row.nightlyPrice}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], nightlyPrice: e.target.value }; setRows(next); }}
                  data-testid={`input-range-price-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">Units available</Label>
                <Input
                  type="number" min={1} className="h-9 w-24"
                  value={row.capacity}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], capacity: Math.max(1, parseInt(e.target.value) || 1) }; setRows(next); }}
                  data-testid={`input-range-capacity-${i}`}
                />
              </div>
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                data-testid={`button-remove-range-${i}`}
              >
                Remove
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setRows([...rows, { startDate: "", endDate: "", nightlyPrice: "", capacity: 1 }])}
            data-testid="button-add-range"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add a date range
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-ranges"
          >
            Save date ranges
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BlackoutsEditor({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/provider/services", serviceId, "blackouts"];

  const { data, isLoading } = useQuery<{ blackouts: AvailabilityBlackout[] }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}/blackouts`);
      return res.json();
    },
  });

  const [rows, setRows] = useState<BlackoutRow[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(false); }, [serviceId]);
  useEffect(() => {
    if (!hydrated && data) {
      setRows((data.blackouts ?? []).map((b) => ({ startDate: b.startDate, endDate: b.endDate, reason: b.reason ?? "" })));
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/blackouts`, {
        blackouts: rows.map((b) => ({ startDate: b.startDate, endDate: b.endDate, reason: b.reason || null })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      toast({ title: "Blackout dates saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not save blackout dates",
        description: error?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-availability-blackouts">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarOff className="h-4 w-4" />
          Blackout dates
        </CardTitle>
        <CardDescription>
          Dates to exclude from booking going forward. A blackout never cancels a booking that
          already exists — it only stops new availability from being published on those dates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blackout dates set.</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2" data-testid={`row-blackout-${i}`}>
              <div>
                <Label className="text-xs">Start date</Label>
                <Input
                  type="date" className="h-9"
                  value={row.startDate}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], startDate: e.target.value }; setRows(next); }}
                  data-testid={`input-blackout-start-${i}`}
                />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input
                  type="date" className="h-9"
                  value={row.endDate}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], endDate: e.target.value }; setRows(next); }}
                  data-testid={`input-blackout-end-${i}`}
                />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <Label className="text-xs">Reason (optional)</Label>
                <Input
                  className="h-9"
                  value={row.reason}
                  onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], reason: e.target.value }; setRows(next); }}
                  data-testid={`input-blackout-reason-${i}`}
                />
              </div>
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                data-testid={`button-remove-blackout-${i}`}
              >
                Remove
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setRows([...rows, { startDate: "", endDate: "", reason: "" }])}
            data-testid="button-add-blackout"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add a blackout
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-blackouts"
          >
            Save blackouts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
