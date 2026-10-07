/**
 * `LegRow` — the ONE leg renderer (R-c). Two shapes, one component:
 *   · `kind: "stops"` (R322, step 7a — R-bh): the leg BETWEEN two stops, from `transport_legs`
 *     (R-bp: the only leg source). Read by everyone; the expert role edits it — mode picker from the
 *     leg's candidate modes (`legModeOptions`, the same rule the leg-review read uses), the author's
 *     tip (≤ `AUTHOR_TIP_MAX_CHARS`, R-ay), "via host pickup" ONLY from the choices the caller says the
 *     server would accept (R-az), and Confirm (the server stamps `checked_by/checked_at`, R-bf).
 *   · `kind: "routed"` (step 9a): the routing engine's leg on a routed plan, one read-only line.
 *   · the airport ↔ lodging leg (surface step 3, ruling R-i), below.
 *
 * The airport leg: Sits between the arrival anchor
 * and the first stop, and before the departure anchor, when the plan has a flight AND a stay.
 *
 * "Book": the per-leg booking path (`transport_booking_options`) is keyed on a computed
 * `transport_legs` row, which exists only after an optimization — so before one, every bookable mode
 * goes to an AGENT BOOKING REQUEST (the existing `POST /api/affiliate-booking-requests`, partner
 * route built server-side, §16). A platform private car opens the platform's own drivers browse.
 * No travel minutes or distance are shown (A8 off).
 */
import { useEffect, useState } from "react";
import { Bike, Car, CheckCircle2, Clock, Footprints, TrainFront, Trash2 } from "lucide-react";
import { routedLegLine, type RouteAnswer, type RoutingMode } from "@shared/routing-engine";
import { Link } from "wouter";
import { AIRPORT_LEG_MODE_LABEL, airportLegLine, type AirportLegMode } from "@shared/airport-leg";
import { AUTHOR_TIP_MAX_CHARS, isChauffeuredMode, legModeOptions } from "@shared/trip-plan";
import { planLegDomId, planLegPairDomId } from "@shared/plan-jump-targets";
import { TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";

/** The leg between two stops, as `GET /api/trips/:tripId/transport-legs` returns it (no user id). */
export interface StopLeg {
  id: string;
  dayNumber: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  fromName: string;
  toName: string;
  recommendedMode: string;
  userSelectedMode: string | null;
  alternativeModes?: ReadonlyArray<{ mode: string }> | null;
  /** S12-1: the server's own mode list for this leg — the one its PATCH accepts. */
  candidateModes?: ReadonlyArray<string> | null;
  estimatedDurationMinutes?: number | null;
  distanceDisplay?: string | null;
  proposalStatus: "proposed" | "confirmed" | null;
  authorTip?: string | null;
  pickupProviderServiceId?: string | null;
  /** Chauffeured modes only: what the expert typed (an arrangement fact, not a booking record). */
  pickupPoint?: string | null;
  pickupTime?: string | null;
  checkedAt?: string | null;
}

/**
 * R-az, stated limit (§13): a host pickup is selectable only for a listing whose pickup the PROVIDER
 * has confirmed, and that confirmation (work plan L1-7) is not built — so today the server refuses
 * every pickup and the row offers none, saying why rather than drawing a control that cannot work.
 */
export const HOST_PICKUP_UNAVAILABLE_NOTE =
  "Via host pickup becomes available once a host confirms their pickup details on their listing.";

/** A listing the server would accept as this leg's host pickup (R-az: offers pickup AND provider-confirmed). */
export interface HostPickupChoice {
  id: string;
  name: string;
}

export interface StopLegRowProps {
  kind: "stops";
  leg: StopLeg;
  role: "traveler" | "expert";
  /** Expert role: R-az choices. Empty ⇒ no "via host pickup" control (and the row says why). */
  pickupChoices?: readonly HostPickupChoice[];
  /** Why there are no choices, said once under the control (e.g. confirmation not built yet). */
  pickupUnavailableReason?: string | null;
  onModeChange?: (mode: string) => void;
  onTipSave?: (tip: string | null) => void;
  onPickupChange?: (providerServiceId: string | null) => void;
  /** Chauffeured modes: save the typed pickup point/time (explicit button, never per keystroke). */
  onPickupDetailsSave?: (d: { pickupPoint: string | null; pickupTime: string | null }) => void;
  onConfirm?: () => void;
  onRemove?: () => void;
  busy?: boolean;
  /** Stamp the readiness jump ids (default). A copy of the row elsewhere (the leg review drawer, L2-4)
   *  passes false, so an id names exactly one element and a checklist jump lands on the day surface. */
  domIds?: boolean;
}

export function legModeLabel(mode: string): string {
  return TRANSPORT_MODE_LABELS[mode] || mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** R-ay: "Author's pick: {mode} · {tip}" — null when no tip was written. */
export function authorPickLine(leg: Pick<StopLeg, "authorTip" | "userSelectedMode" | "recommendedMode">): string | null {
  const tip = (leg.authorTip ?? "").trim();
  if (!tip) return null;
  return `Author's pick: ${legModeLabel(leg.userSelectedMode || leg.recommendedMode)} · ${tip}`;
}

/** R-bf: the stamp line. Only a CONFIRMED leg with a stamp says it was checked (§13). */
export function legCheckedLine(leg: Pick<StopLeg, "proposalStatus" | "checkedAt">): string | null {
  if (leg.proposalStatus !== "confirmed" || !leg.checkedAt) return null;
  const d = new Date(leg.checkedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Checked ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export function StopLegRow({
  leg,
  role,
  pickupChoices = [],
  pickupUnavailableReason = null,
  onModeChange,
  onTipSave,
  onPickupChange,
  onPickupDetailsSave,
  onConfirm,
  onRemove,
  busy = false,
  domIds = true,
}: Omit<StopLegRowProps, "kind">) {
  const [pickupPoint, setPickupPoint] = useState(leg.pickupPoint ?? "");
  const [pickupTime, setPickupTime] = useState(leg.pickupTime ?? "");
  useEffect(() => setPickupPoint(leg.pickupPoint ?? ""), [leg.pickupPoint]);
  useEffect(() => setPickupTime(leg.pickupTime ?? ""), [leg.pickupTime]);
  const pickupDirty = pickupPoint !== (leg.pickupPoint ?? "") || pickupTime !== (leg.pickupTime ?? "");
  const mode = leg.userSelectedMode || leg.recommendedMode;
  const [tip, setTip] = useState(leg.authorTip ?? "");
  useEffect(() => setTip(leg.authorTip ?? ""), [leg.authorTip]);
  const tipDirty = tip.trim() !== (leg.authorTip ?? "").trim();
  const pick = authorPickLine(leg);
  const checked = legCheckedLine(leg);
  const expert = role === "expert";
  const pairId =
    leg.fromActivityId && leg.toActivityId ? planLegPairDomId(leg.dayNumber, leg.fromActivityId, leg.toActivityId) : undefined;
  const pickupName = leg.pickupProviderServiceId
    ? pickupChoices.find((c) => c.id === leg.pickupProviderServiceId)?.name ?? null
    : null;
  return (
    <div
      id={domIds ? planLegDomId(leg.id) : undefined}
      className="ml-4 border-l-2 border-dashed border-border px-3 py-2 space-y-1.5"
      data-testid={`leg-row-${leg.id}`}
      data-pair-id={pairId}
      data-leg-status={leg.proposalStatus ?? "none"}
    >
      {pairId && domIds ? <span id={pairId} aria-hidden="true" /> : null}
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground" data-testid={`leg-mode-${leg.id}`}>{legModeLabel(mode)}</span>
        {typeof leg.estimatedDurationMinutes === "number" ? (
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {leg.estimatedDurationMinutes} min
          </span>
        ) : null}
        {leg.distanceDisplay ? <span>· {leg.distanceDisplay}</span> : null}
        {leg.pickupProviderServiceId ? (
          <span data-testid={`leg-host-pickup-${leg.id}`}>· via host pickup{pickupName ? ` (${pickupName})` : ""} — as described by the host</span>
        ) : null}
        {expert ? (
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${leg.proposalStatus === "confirmed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
            data-testid={`leg-status-${leg.id}`}
          >
            {leg.proposalStatus === "confirmed" ? "Confirmed" : "Proposed"}
          </span>
        ) : null}
      </p>
      {pick ? <p className="text-xs" data-testid={`leg-author-pick-${leg.id}`}>{pick}</p> : null}
      {checked ? <p className="text-[11px] text-muted-foreground" data-testid={`leg-checked-${leg.id}`}>{checked}</p> : null}

      {expert ? (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-muted-foreground" htmlFor={`leg-mode-select-${leg.id}`}>Mode</label>
            <select
              id={`leg-mode-select-${leg.id}`}
              className="h-8 rounded border border-border bg-background px-2 text-xs"
              value={mode}
              disabled={busy || !onModeChange}
              onChange={(e) => onModeChange?.(e.target.value)}
              data-testid={`leg-mode-select-${leg.id}`}
            >
              {(leg.candidateModes ?? legModeOptions(leg)).map((m) => (
                <option key={m} value={m}>{legModeLabel(m)}</option>
              ))}
            </select>
            {pickupChoices.length > 0 ? (
              <select
                className="h-8 rounded border border-border bg-background px-2 text-xs"
                value={leg.pickupProviderServiceId ?? ""}
                disabled={busy || !onPickupChange}
                onChange={(e) => onPickupChange?.(e.target.value || null)}
                data-testid={`leg-pickup-select-${leg.id}`}
              >
                <option value="">No host pickup</option>
                {pickupChoices.map((c) => (
                  <option key={c.id} value={c.id}>Via host pickup — {c.name}</option>
                ))}
              </select>
            ) : null}
          </div>
          {pickupChoices.length === 0 && pickupUnavailableReason ? (
            <p className="text-[11px] text-muted-foreground" data-testid={`leg-pickup-unavailable-${leg.id}`}>{pickupUnavailableReason}</p>
          ) : null}
          {isChauffeuredMode(mode) && onPickupDetailsSave ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs"
                value={pickupPoint}
                placeholder="Pickup point (e.g. hotel lobby)"
                onChange={(e) => setPickupPoint(e.target.value)}
                disabled={busy}
                aria-label="Pickup point"
                data-testid={`leg-pickup-point-${leg.id}`}
              />
              <input
                className="h-8 w-28 rounded border border-border bg-background px-2 text-xs"
                value={pickupTime}
                placeholder="Pickup time"
                onChange={(e) => setPickupTime(e.target.value)}
                disabled={busy}
                aria-label="Pickup time"
                data-testid={`leg-pickup-time-${leg.id}`}
              />
              {pickupDirty ? (
                <button
                  type="button"
                  className="h-8 rounded border border-border px-2 text-xs disabled:opacity-50"
                  onClick={() => onPickupDetailsSave({ pickupPoint: pickupPoint.trim() || null, pickupTime: pickupTime.trim() || null })}
                  disabled={busy}
                  data-testid={`leg-pickup-save-${leg.id}`}
                >
                  Save pickup
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs"
              value={tip}
              maxLength={AUTHOR_TIP_MAX_CHARS}
              placeholder="Your tip for this leg (optional)"
              onChange={(e) => setTip(e.target.value)}
              disabled={busy || !onTipSave}
              aria-label="Author's tip"
              data-testid={`leg-tip-input-${leg.id}`}
            />
            <span className="text-[10px] tabular-nums text-muted-foreground" data-testid={`leg-tip-count-${leg.id}`}>
              {tip.length}/{AUTHOR_TIP_MAX_CHARS}
            </span>
            {tipDirty ? (
              <button
                type="button"
                className="h-8 rounded border border-border px-2 text-xs disabled:opacity-50"
                onClick={() => onTipSave?.(tip.trim() || null)}
                disabled={busy}
                data-testid={`leg-tip-save-${leg.id}`}
              >
                Save tip
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {leg.proposalStatus !== "confirmed" && onConfirm ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                onClick={onConfirm}
                disabled={busy}
                data-testid={`leg-confirm-${leg.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Confirm
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded border border-border px-2.5 text-xs text-destructive disabled:opacity-50"
                onClick={onRemove}
                disabled={busy}
                data-testid={`leg-remove-${leg.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface AirportLegRowProps {
  direction: "arrival" | "departure";
  stayName: string;
  airport: string | null;
  modes: AirportLegMode[];
  /** Owner only — everyone else reads the leg and books nothing. */
  canBook: boolean;
  /** The platform's drivers browse for this plan (a private car is a platform listing). */
  driversHref?: string | null;
  onRequest?: (mode: AirportLegMode) => void;
  busy?: boolean;
}

/**
 * Step 9a (ledger `2026-10-07-step9a-routing-engine`; spec §3 LegRow, §14.1): a ROUTED leg between two
 * stops on a plan that passes `planGetsRoutedLegs` — the routing engine's answer in ONE line,
 * "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct", spelled by the shared `routedLegLine`
 * (the Trip Card reads the same helper). Fare only when the source gave one, in its own currency;
 * minutes in-plan only (R-h). Read-only here; per-leg options and booking are 9c.
 */
export interface RoutedLegRowProps {
  kind: "routed";
  legId: string;
  mode: RoutingMode;
  route: RouteAnswer;
  timeZone: string | null;
}

export type LegRowProps = AirportLegRowProps | StopLegRowProps | RoutedLegRowProps;

/** The ONE leg row (R-c): a between-stops leg (`stops`, `routed`), else the airport leg. */
export function LegRow(props: LegRowProps) {
  if ("kind" in props && props.kind === "stops") {
    const { kind: _kind, ...rest } = props;
    return <StopLegRow {...rest} />;
  }
  if ("kind" in props && props.kind === "routed") return <RoutedLegRow {...props} />;
  return <AirportLegRow {...(props as AirportLegRowProps)} />;
}

const ROUTED_MODE_ICON: Readonly<Record<RoutingMode, typeof Car>> = { walk: Footprints, cycle: Bike, transit: TrainFront, drive: Car };

function RoutedLegRow({ legId, mode, route, timeZone }: RoutedLegRowProps) {
  const Icon = ROUTED_MODE_ICON[mode] ?? Car;
  return (
    <p
      className="ml-4 border-l-2 border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5"
      data-testid={`slip-leg-routed-${legId}`}
      data-leg-source={route.provenance.source}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span data-testid={`slip-leg-routed-line-${legId}`}>{routedLegLine({ mode, route }, timeZone)}</span>
    </p>
  );
}

function AirportLegRow({ direction, stayName, airport, modes, canBook, driversHref, onRequest, busy = false }: AirportLegRowProps) {
  return (
    <div className="px-3 py-2 border-l-2 border-dashed border-border ml-4 space-y-1" data-testid={`slip-leg-airport-${direction}`}>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Car className="w-3.5 h-3.5" aria-hidden="true" />
        <span data-testid={`slip-leg-airport-${direction}-line`}>{airportLegLine(direction, stayName, airport)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {modes.map((m) => (
          <span key={m} className="inline-flex items-center gap-1 text-xs" data-testid={`slip-leg-mode-${direction}-${m}`}>
            <span className="rounded border border-border px-1.5 py-0.5">{AIRPORT_LEG_MODE_LABEL[m]}</span>
            {canBook ? (
              m === "private_car" ? (
                driversHref ? (
                  <Link href={driversHref} className="underline underline-offset-2" data-testid={`slip-leg-book-${direction}-${m}`}>
                    Book
                  </Link>
                ) : null
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-2 disabled:opacity-50"
                  onClick={() => onRequest?.(m)}
                  disabled={busy}
                  data-testid={`slip-leg-book-${direction}-${m}`}
                >
                  Book
                </button>
              )
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
