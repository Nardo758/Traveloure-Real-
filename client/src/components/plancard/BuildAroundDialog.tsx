import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  Loader2,
  Map,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { OPTIMIZE_UNAVAILABLE, optimizeContinueLabel, optimizePayLine, optimizeRunPriced, optimizeUnavailable } from "@/lib/optimize-pay-copy";
import type { OptimizationFeeQuote } from "@/lib/optimization-preview";
import type {
  ComparisonPinnedAnchor,
  ComparisonPinnedAnchorType,
} from "@/lib/create-comparison";
import { CUSTOM_PIN_REFUSAL_STRINGS, planAnchorBareId, refusalMessage, refusalOptions, type PinRefusal } from "@/lib/custom-pin-refusal";
import { ITINERARY_WORDING } from "@/lib/itinerary-wording";
import { formatTripDates } from "@/lib/trip-dates";

export interface AnchorCandidate {
  anchorId: string;
  type: ComparisonPinnedAnchorType;
  name: string;
  medianMeters: number | null;
  estMedianWalkMinutes: number | null;
  within15MinCount: number;
  locatedStops: number;
  totalStops: number;
  rating?: number | string | null;
  area?: string | null;
}

/** OPT-A's event candidate: a plan stop with a place and a start time ("HH:MM", shown as stored). */
export interface EventAnchorCandidate {
  anchorId: string;
  type: "event";
  name: string;
  dayNumber: number;
  scheduledDate: string | null;
  startTime: string;
  medianMeters: number | null;
  locatedStops: number;
  totalStops: number;
}

/** OPT-A's day candidate: one trip day; `anchorable` false is drawn disabled with a reason. */
export interface DayAnchorCandidate {
  anchorId: string;
  type: "day";
  name: string;
  dayNumber: number;
  date: string | null;
  stopCount: number;
  locatedStops: number;
  anchorable: boolean;
}

type PlaceAnchorType = "hotel" | "neighborhood" | "activity";
export interface RankedAnchors {
  hotel: AnchorCandidate[];
  neighborhood: AnchorCandidate[];
  activity: AnchorCandidate[];
  event: EventAnchorCandidate[];
  day: DayAnchorCandidate[];
}
export type AnchorMode = "auto" | ComparisonPinnedAnchorType;
/** The three groups under the Auto card (Leon, Nov 1: Place, Date, Event — the Experiences page's words). */
export type AnchorGroup = "place" | "date" | "event";

/** The pick: a list row of any kind, by its candidate id. */
export interface SelectedAnchor {
  anchorId: string;
  name: string;
}

const EMPTY_RANKED: RankedAnchors = {
  hotel: [],
  neighborhood: [],
  activity: [],
  event: [],
  day: [],
};

function isPlaceType(mode: AnchorMode): mode is PlaceAnchorType {
  return mode === "hotel" || mode === "neighborhood" || mode === "activity";
}

function groupOf(mode: AnchorMode): AnchorGroup | null {
  if (mode === "auto") return null;
  if (mode === "event") return "event";
  if (mode === "day") return "date";
  return "place";
}

const GROUP_OPTIONS: AnchorGroup[] = ["place", "date", "event"];

const TYPE_OPTIONS: Array<{
  type: PlaceAnchorType;
  label: string;
  Icon: typeof Building2;
}> = [
  { type: "hotel", label: "Hotel", Icon: Building2 },
  { type: "neighborhood", label: "Neighborhood", Icon: Map },
  { type: "activity", label: "Activity", Icon: Activity },
];

/**
 * Row 198 (strings 24–27, 29, 30; approved by Leon Oct 26, 2026): the Build-around dialog's words.
 * OPT-B (ledger 2026-11-02-opt-b-build-around-place-date-event): `description` (H1), `autoLabel` (H2),
 * `loadError` (H3) and `dayReason` (D1, D2) are HELD for Leon's approval. The group labels are the
 * Experiences page's words and `customPlaceholder` was approved by the Architect.
 */
export const BUILD_AROUND_COPY = {
  description: "We suggest 3 starting points. Or build around a place, a date or an event on your plan.",
  // #30: shown only for a priced run on a mount that shows the pay line.
  paidStep: "This is a paid step. You'll see the price before you pay, and nothing runs until you do.",
  autoLabel: "We'll suggest 3",
  autoBody: "We suggest a hotel, a neighborhood and an activity to build around, ranked by straight-line distance to your stops.",
  chooseYourOwn: "Or choose your own",
  loadError: "We couldn't load places to build around. Close and reopen to try again, or let us suggest 3.",
  optionsLabel: (typeLabel: string): string => `${typeLabel} options`,
  groups: { place: "Place", date: "Date", event: "Event" } satisfies Record<AnchorGroup, string>,
  customPlaceholder: "Type an address or place name",
  dayReason: {
    noLocatedStops: "Nothing on this day has a location yet.",
    allFixed: "Everything on this day is already fixed.",
  },
} as const;

const EMPTY_COPY: Record<PlaceAnchorType | "event", string> = {
  hotel: "No hotel suggestions near your stops yet. You can type one below.",
  neighborhood: "No neighborhood suggestions near your stops yet. You can type one below.",
  activity: "No activity suggestions near your stops yet. You can type one below.",
  // OPT-B E1, HELD for Leon's approval.
  event: "No events with a time on your plan yet. Add one with a start time first.",
};

/** "{name} · Day {n} · {HH:MM}" — the start time exactly as stored, no zone and no arithmetic. */
export function eventCandidateLabel(c: { name: string; dayNumber: number; startTime: string }): string {
  return `${c.name} · Day ${c.dayNumber} · ${c.startTime}`;
}

/** "Day {n} · {date}" — the date as a calendar day (formatTripDates, never `new Date("YYYY-MM-DD")`). */
export function dayCandidateLabel(c: { dayNumber: number; date: string | null }): string {
  const date = c.date ? formatTripDates(c.date) : null;
  return date ? `Day ${c.dayNumber} · ${date}` : `Day ${c.dayNumber}`;
}

/** Why a day cannot be built around: D1 when nothing on it is located, D2 otherwise. */
export function dayCandidateReason(c: DayAnchorCandidate): string | null {
  if (c.anchorable) return null;
  return c.locatedStops === 0 ? BUILD_AROUND_COPY.dayReason.noLocatedStops : BUILD_AROUND_COPY.dayReason.allFixed;
}

/**
 * The pin the confirm button posts. Auto posts none; a list pick posts its id (an event or day by the
 * BARE id the server takes) and name; a place's typed name posts `{ type, name }` as before.
 */
export function buildAroundPin(
  mode: AnchorMode,
  selected: SelectedAnchor | null,
  customName: string,
): ComparisonPinnedAnchor | undefined {
  if (mode === "auto") return undefined;
  if (selected) return { type: mode, id: planAnchorBareId(mode, selected.anchorId), name: selected.name };
  const name = customName.trim();
  return isPlaceType(mode) && name ? { type: mode, name } : undefined;
}

/** The row an event or day pin opens on, once its list has loaded; null for anything else. */
export function initialPlanAnchorPick(
  pin: ComparisonPinnedAnchor | undefined,
  ranked: Pick<RankedAnchors, "event" | "day">,
): SelectedAnchor | null {
  if (!pin?.id || (pin.type !== "event" && pin.type !== "day")) return null;
  const list: Array<{ anchorId: string; name: string; anchorable?: boolean }> = ranked[pin.type];
  const match = list.find((c) => c.anchorable !== false && candidateMatchesPin(c.anchorId, pin));
  return match ? { anchorId: match.anchorId, name: match.name } : null;
}

/** True when a candidate id names the pin (the candidate read's prefixed id, or the bare one the server took). */
function candidateMatchesPin(anchorId: string, pin: ComparisonPinnedAnchor): boolean {
  if (!pin.id) return false;
  return anchorId === pin.id || planAnchorBareId(pin.type, anchorId) === planAnchorBareId(pin.type, pin.id);
}

/**
 * Audit B8: a candidate shows a labelled straight-line DISTANCE, never a travel time.
 * Wording approved by Leon (founder comment: #1703 2026-10-26T01:02:00Z).
 * Row 198 (string 28; approved by Leon Oct 26, 2026): always metres, to the nearest 10 m.
 */
export const ANCHOR_CANDIDATE_DISTANCE_COPY = {
  distance: (meters: string) => `about ${meters} m apart in a straight line`,
  none: "—",
  tooltip: "A straight-line distance, not a walking route.",
} as const;

export function formatAnchorCandidateMedian(candidate: AnchorCandidate): string {
  const m = candidate.medianMeters;
  if (m == null || !Number.isFinite(m) || m < 0) return ANCHOR_CANDIDATE_DISTANCE_COPY.none;
  const meters = Math.max(10, Math.round(m / 10) * 10);
  return ANCHOR_CANDIDATE_DISTANCE_COPY.distance(meters.toLocaleString("en-US"));
}

export function BuildAroundDialog({
  open,
  tripId,
  planName,
  fee,
  busy = false,
  refusal = null,
  initialPin,
  hidePayLine = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  tripId: string;
  /** The plan being optimized, named in the dialog (ledger `2026-10-08-optimize-pay-flow`). */
  planName?: string | null;
  /** The server's band-resolved quote — the price on the confirm button. Never a literal (§8). */
  fee?: OptimizationFeeQuote | null;
  busy?: boolean;
  /** Rows 196/197: the server could not place the custom pin — show the refusal state. */
  refusal?: PinRefusal | null;
  /** The pin the dialog opens on (the refused one), so its type and list come back. */
  initialPin?: ComparisonPinnedAnchor;
  /** A re-run on a comparison's recorded payment charges nothing — no pay line. */
  hidePayLine?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pinnedAnchor?: ComparisonPinnedAnchor) => void;
}) {
  const [mode, setMode] = useState<AnchorMode>("auto");
  const [ranked, setRanked] = useState<RankedAnchors>(EMPTY_RANKED);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<SelectedAnchor | null>(null);
  // The Place group remembers which of its three types was last open.
  const [placeType, setPlaceType] = useState<PlaceAnchorType>("hotel");
  const [customName, setCustomName] = useState("");
  // The refusal the dialog is showing; (a) and (b) set it aside so the field or the list can be used.
  const [refusalShown, setRefusalShown] = useState<PinRefusal | null>(null);
  const requestedRef = useRef(false);
  const requestEpochRef = useRef(0);
  // An event/day pin the dialog opens on is chosen once its list arrives (not while a refusal shows).
  const autoPickedRef = useRef(false);

  useEffect(() => {
    requestEpochRef.current += 1;
    if (!open) return;
    requestedRef.current = false;
    setMode(initialPin?.type ?? "auto");
    if (initialPin && isPlaceType(initialPin.type)) setPlaceType(initialPin.type);
    autoPickedRef.current = false;
    setRanked(EMPTY_RANKED);
    setLoading(false);
    setLoadError(null);
    setSelectedCandidate(null);
    setCustomName(initialPin && !initialPin.id ? initialPin.name ?? "" : "");
    // A stale id reloads the list in the refusal effect below; anything else loads it once here.
    if (initialPin && refusal !== "stale_pin") void loadCandidatesOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setRefusalShown(refusal ?? null);
    // A stale list-pick id: drop the pick and refresh the candidate list from the server.
    if (refusal === "stale_pin" && initialPin) {
      setSelectedCandidate(null);
      requestedRef.current = false;
      void loadCandidatesOnce();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusal]);

  async function loadCandidatesOnce() {
    if (requestedRef.current) return;
    requestedRef.current = true;
    const epoch = requestEpochRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(
        "GET",
        `/api/trips/${encodeURIComponent(tripId)}/anchor-candidates`,
      );
      const data = (await response.json()) as Partial<RankedAnchors>;
      if (epoch !== requestEpochRef.current) return;
      setRanked({
        hotel: Array.isArray(data.hotel) ? data.hotel : [],
        neighborhood: Array.isArray(data.neighborhood) ? data.neighborhood : [],
        activity: Array.isArray(data.activity) ? data.activity : [],
        event: Array.isArray(data.event) ? data.event : [],
        day: Array.isArray(data.day) ? data.day : [],
      });
    } catch {
      if (epoch !== requestEpochRef.current) return;
      setLoadError(BUILD_AROUND_COPY.loadError);
    } finally {
      if (epoch === requestEpochRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || autoPickedRef.current || refusal || !initialPin?.id) return;
    if (initialPin.type !== "event" && initialPin.type !== "day") return;
    const match = initialPlanAnchorPick(initialPin, ranked);
    if (!match) return;
    autoPickedRef.current = true;
    setSelectedCandidate(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, open]);

  function selectMode(nextMode: AnchorMode) {
    setMode(nextMode);
    if (isPlaceType(nextMode)) setPlaceType(nextMode);
    setSelectedCandidate(null);
    setCustomName("");
    if (nextMode !== "auto") void loadCandidatesOnce();
  }

  function selectGroup(group: AnchorGroup) {
    selectMode(group === "place" ? placeType : group === "date" ? "day" : "event");
  }

  const group = groupOf(mode);
  const customLocationName = customName.trim();
  const selectedName =
    selectedCandidate?.name || (isPlaceType(mode) ? customLocationName : "");
  const canConfirm =
    !busy &&
    (mode === "auto" || selectedCandidate !== null || (isPlaceType(mode) && customLocationName.length > 0));

  function confirm() {
    if (!canConfirm) return;
    onConfirm(buildAroundPin(mode, selectedCandidate, customLocationName));
  }

  const pickableCount =
    mode === "auto" ? 0 : mode === "day" ? ranked.day.filter((d) => d.anchorable).length : ranked[mode].length;
  const refusalChoices = refusalShown ? refusalOptions(refusalShown, pickableCount > 0) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[100dvh] max-h-none w-full max-w-none gap-0 overflow-y-auto overflow-x-hidden rounded-none border-0 border-[color:var(--earn-border)] bg-[var(--earn-card)] grid-rows-[auto_1fr_auto] p-0 min-[430px]:grid-rows-none min-[430px]:h-auto min-[430px]:max-h-[88dvh] min-[430px]:w-[calc(100%-1.5rem)] min-[430px]:max-w-[560px] min-[430px]:gap-4 min-[430px]:rounded-lg min-[430px]:border"
        data-testid="build-around-dialog"
      >
        <BuildAroundPanel
          planName={planName}
          fee={fee}
          busy={busy}
          hidePayLine={hidePayLine}
          mode={mode}
          group={group}
          ranked={ranked}
          loading={loading}
          loadError={loadError}
          selectedCandidate={selectedCandidate}
          customName={customName}
          refusalShown={refusalShown}
          refusalChoices={refusalChoices}
          selectedName={selectedName}
          canConfirm={canConfirm}
          selectMode={selectMode}
          selectGroup={selectGroup}
          setSelectedCandidate={setSelectedCandidate}
          setCustomName={setCustomName}
          setRefusalShown={setRefusalShown}
          confirm={confirm}
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

export interface BuildAroundPanelProps {
  planName?: string | null;
  fee?: OptimizationFeeQuote | null;
  busy: boolean;
  hidePayLine: boolean;
  mode: AnchorMode;
  group: AnchorGroup | null;
  ranked: RankedAnchors;
  loading: boolean;
  loadError: string | null;
  selectedCandidate: SelectedAnchor | null;
  customName: string;
  refusalShown: PinRefusal | null;
  refusalChoices: ReturnType<typeof refusalOptions> | null;
  selectedName: string;
  canConfirm: boolean;
  selectMode: (mode: AnchorMode) => void;
  selectGroup: (group: AnchorGroup) => void;
  setSelectedCandidate: (pick: SelectedAnchor | null) => void;
  setCustomName: (name: string) => void;
  setRefusalShown: (refusal: PinRefusal | null) => void;
  confirm: () => void;
  onConfirm: (pinnedAnchor?: ComparisonPinnedAnchor) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * OPT-B: the dialog's contents, split from the shell so they render without a portal (the render
 * test mounts it inside a <Dialog> root). Every handler is the shell's own; nothing is decided here.
 */
export function BuildAroundPanel({
  planName,
  fee,
  busy,
  hidePayLine,
  mode,
  group,
  ranked,
  loading,
  loadError,
  selectedCandidate,
  customName,
  refusalShown,
  refusalChoices,
  selectedName,
  canConfirm,
  selectMode,
  selectGroup,
  setSelectedCandidate,
  setCustomName,
  setRefusalShown,
  confirm,
  onConfirm,
  onOpenChange,
}: BuildAroundPanelProps) {
  const visibleCandidates: AnchorCandidate[] = isPlaceType(mode) ? ranked[mode] : [];
  return (
    <>

      <DialogHeader className="border-b border-[color:var(--earn-border)] px-5 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
        <DialogTitle className="font-display text-2xl text-[color:var(--earn-ink)]">
          Build around a location
        </DialogTitle>
        <DialogDescription className="text-[15px] leading-6 text-[color:var(--earn-muted)]">
          {planName?.trim() ? (
            <>
              Optimize <span className="font-semibold text-[color:var(--earn-ink)]" data-testid="build-around-plan">{planName.trim()}</span>:{" "}
            </>
          ) : null}
          {BUILD_AROUND_COPY.description}
          {optimizeRunPriced(fee) && !hidePayLine ? <> {BUILD_AROUND_COPY.paidStep}</> : null}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 px-5 py-4 min-[430px]:py-0 sm:px-6">
        <button
          type="button"
          onClick={() => selectMode("auto")}
          aria-pressed={mode === "auto"}
          className={`flex min-h-20 w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 ${
            mode === "auto"
              ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)]"
              : "border-[color:var(--earn-border)] bg-[var(--earn-card)] hover:border-[color:var(--earn-teal)]"
          }`}
          data-testid="build-around-auto"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-[color:var(--earn-ink)]">
              {BUILD_AROUND_COPY.autoLabel}
            </span>
            <span className="mt-1 block text-sm leading-5 text-[color:var(--earn-muted)]">
              {BUILD_AROUND_COPY.autoBody}
            </span>
          </span>
          <span
            className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
              mode === "auto"
                ? "border-[color:var(--earn-teal)] bg-[var(--earn-teal)] text-white"
                : "border-[color:var(--earn-border-dash)]"
            }`}
            aria-hidden="true"
          >
            {mode === "auto" && <Check className="h-3 w-3" />}
          </span>
        </button>

        <div>
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-muted)]">
            {BUILD_AROUND_COPY.chooseYourOwn}
          </p>
          <div
            className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-[color:var(--earn-border)] p-1"
            role="group"
            data-testid="build-around-kinds"
          >
            {GROUP_OPTIONS.map((g) => {
              const selected = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => selectGroup(g)}
                  aria-pressed={selected}
                  className={`min-h-10 rounded-lg px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] ${
                    selected
                      ? "bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                      : "text-[color:var(--earn-ink)] hover:bg-[color:var(--earn-teal-wash)]"
                  }`}
                  data-testid={`build-around-kind-${g}`}
                >
                  {BUILD_AROUND_COPY.groups[g]}
                </button>
              );
            })}
          </div>
          {group === "place" && (
          <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
            {TYPE_OPTIONS.map(({ type, label, Icon }) => {
              const selected = mode === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectMode(type)}
                  aria-pressed={selected}
                  className={`flex min-h-16 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 min-[430px]:flex-col min-[430px]:items-start ${
                    selected
                      ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                      : "border-[color:var(--earn-border)] text-[color:var(--earn-ink)] hover:border-[color:var(--earn-teal)]"
                  }`}
                  data-testid={`build-around-type-${type}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              );
            })}
          </div>
          )}
        </div>

        {(mode === "day" || mode === "event") && (
          <div className="space-y-3" data-testid={`build-around-candidates-${mode}`}>
            {loading ? (
              <div className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--earn-border-dash)] text-sm text-[color:var(--earn-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {ITINERARY_WORDING.checkingPlaces}
              </div>
            ) : loadError ? (
              <div
                className="rounded-xl border border-[color:var(--earn-coral-border)] bg-[var(--earn-coral-bg)] p-3 text-sm text-[color:var(--earn-coral-ink)]"
                role="alert"
                data-testid="build-around-load-error"
              >
                {BUILD_AROUND_COPY.loadError}
              </div>
            ) : mode === "event" && ranked.event.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-[color:var(--earn-border-dash)] p-4 text-sm text-[color:var(--earn-muted)]"
                data-testid="build-around-empty-event"
              >
                {EMPTY_COPY.event}
              </div>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label={BUILD_AROUND_COPY.optionsLabel(BUILD_AROUND_COPY.groups[mode === "day" ? "date" : "event"])}>
                {(mode === "day"
                  ? ranked.day.map((d) => ({ anchorId: d.anchorId, name: d.name, label: dayCandidateLabel(d), reason: dayCandidateReason(d) }))
                  : ranked.event.map((e) => ({ anchorId: e.anchorId, name: e.name, label: eventCandidateLabel(e), reason: null as string | null }))
                ).map((row) => {
                  const selected = selectedCandidate?.anchorId === row.anchorId;
                  const disabled = row.reason !== null;
                  return (
                    <button
                      key={row.anchorId}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-disabled={disabled || undefined}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setSelectedCandidate({ anchorId: row.anchorId, name: row.name });
                      }}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 ${
                        disabled
                          ? "cursor-not-allowed border-dashed border-[color:var(--earn-border-dash)] opacity-70"
                          : selected
                            ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)]"
                            : "border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]"
                      }`}
                      data-testid={`build-around-candidate-${row.anchorId}`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                          selected
                            ? "border-[color:var(--earn-teal)] bg-[var(--earn-teal)] text-white"
                            : "border-[color:var(--earn-border-dash)]"
                        }`}
                        aria-hidden="true"
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-[color:var(--earn-ink)]">{row.label}</span>
                        {row.reason ? (
                          <span className="mt-0.5 block text-xs text-[color:var(--earn-muted)]" data-testid={`build-around-day-reason-${row.anchorId}`}>
                            {row.reason}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isPlaceType(mode) && (
          <div className="space-y-3" data-testid={`build-around-candidates-${mode}`}>
            {loading ? (
              <div className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--earn-border-dash)] text-sm text-[color:var(--earn-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {ITINERARY_WORDING.checkingPlaces}
              </div>
            ) : loadError ? (
              <div
                className="rounded-xl border border-[color:var(--earn-coral-border)] bg-[var(--earn-coral-bg)] p-3 text-sm text-[color:var(--earn-coral-ink)]"
                role="alert"
                data-testid="build-around-load-error"
              >
                {BUILD_AROUND_COPY.loadError}
              </div>
            ) : visibleCandidates.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-[color:var(--earn-border-dash)] p-4 text-sm text-[color:var(--earn-muted)]"
                data-testid={`build-around-empty-${mode}`}
              >
                {EMPTY_COPY[mode]}
              </div>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label={BUILD_AROUND_COPY.optionsLabel(TYPE_OPTIONS.find((o) => o.type === mode)?.label ?? "")}>
                {visibleCandidates.map((candidate) => {
                  const selected = selectedCandidate?.anchorId === candidate.anchorId;
                  const details = [candidate.area || null].filter(Boolean);
                  return (
                    <button
                      key={`${candidate.type}:${candidate.anchorId}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setSelectedCandidate(candidate);
                        setCustomName("");
                      }}
                      className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 ${
                        selected
                          ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)]"
                          : "border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]"
                      }`}
                      data-testid={`build-around-candidate-${candidate.anchorId}`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                          selected
                            ? "border-[color:var(--earn-teal)] bg-[var(--earn-teal)] text-white"
                            : "border-[color:var(--earn-border-dash)]"
                        }`}
                        aria-hidden="true"
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[color:var(--earn-ink)]">
                            {candidate.name}
                          </span>
                        </span>
                        {details.length > 0 && (
                          <span className="mt-0.5 block text-xs text-[color:var(--earn-muted)]">
                            {details.join(" · ")}
                          </span>
                        )}
                      </span>
                      <span
                        className="shrink-0 font-mono text-xs text-[color:var(--earn-muted)]"
                        title={ANCHOR_CANDIDATE_DISTANCE_COPY.tooltip}
                      >
                        {formatAnchorCandidateMedian(candidate)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[color:var(--earn-ink)]">
                Not listed? Build around a custom location
              </span>
              <Input
                value={customName}
                onChange={(event) => {
                  setCustomName(event.target.value);
                  if (event.target.value.trim()) setSelectedCandidate(null);
                }}
                placeholder={BUILD_AROUND_COPY.customPlaceholder}
                maxLength={200}
                data-testid="build-around-custom"
              />
            </label>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto border-t border-[color:var(--earn-border)] bg-[var(--earn-card)] px-5 pb-5 pt-4 min-[430px]:static sm:px-6 sm:pb-6">
        {refusalShown && refusalChoices ? (
          <div className="space-y-3" role="alert" data-testid="build-around-refusal" data-reason={refusalShown}>
            <p className="text-sm text-[color:var(--earn-ink)]" data-testid="build-around-refusal-reason">
              {refusalMessage(refusalShown)}
            </p>
            <div className="flex flex-col gap-2">
              {refusalChoices.tryDifferentName ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setRefusalShown(null);
                    setSelectedCandidate(null);
                    setCustomName("");
                  }}
                  data-testid="build-around-refusal-try-name"
                >
                  {CUSTOM_PIN_REFUSAL_STRINGS.options.tryDifferentName}
                </Button>
              ) : null}
              {refusalChoices.pickFromList ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setRefusalShown(null);
                    setCustomName("");
                  }}
                  data-testid="build-around-refusal-pick-list"
                >
                  {CUSTOM_PIN_REFUSAL_STRINGS.options.pickFromList}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onConfirm()}
                data-testid="build-around-refusal-no-pin"
              >
                {CUSTOM_PIN_REFUSAL_STRINGS.options.continueWithoutPin}
              </Button>
              {optimizeRunPriced(fee) ? (
                <p className="text-xs text-[color:var(--earn-muted)]" data-testid="build-around-refusal-no-pin-note">
                  {CUSTOM_PIN_REFUSAL_STRINGS.options.optionCPaidNote}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {refusalShown ? null : optimizeUnavailable(fee) ? (
          <p className="mb-4 text-sm text-[color:var(--earn-ink)]" data-testid="optimize-unavailable">
            {OPTIMIZE_UNAVAILABLE}
          </p>
        ) : (
          <>
        {selectedName ? (
          <p className="mb-2 text-sm text-[color:var(--earn-ink)]" data-testid="build-around-selected">
            Three versions built around {selectedName}.
          </p>
        ) : null}
        {hidePayLine ? null : (
        <p className="mb-4 font-mono text-[11px] leading-5 text-[color:var(--earn-muted)]" data-testid="build-around-pay-line">
          {optimizePayLine(fee)}
        </p>
        )}
          </>
        )}
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="build-around-cancel"
          >
            Cancel
          </Button>
          {refusalShown || optimizeUnavailable(fee) ? null : (
          <Button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="bg-[var(--earn-coral-ink)] text-white hover:bg-[var(--earn-coral-ink)] hover:brightness-95"
            data-testid="build-around-confirm"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {optimizeContinueLabel(fee)}
          </Button>
          )}
        </DialogFooter>
      </div>
    </>
  );
}