import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, History, MessageSquare, Activity,
  CheckCircle2, Circle, Navigation2, ChevronDown, ChevronUp, Map, Phone, BadgeCheck,
  Users, ShoppingCart, Undo2, type LucideIcon,
} from "lucide-react";
import {
  TYPE_COLORS, STATUS_STYLES,
  type TemplateConfig, type PlanCardDay, type PlanCardActivity, type RoutingStatus,
} from "./plancard-types";
import { TRANSPORT_MODE_ICONS, TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { openInMaps, type TraveloureMode } from "@/lib/navigate";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import {
  type TemporalState, canonicalMode, hasValidCoords, nowHHMM,
  useLiveNow, useVisitedActivities, getUpNextInfo,
} from "./plancard-temporal";

// ── W7 — per-item routing (Trip-Canon Lane 1, Phase 1d) ─────────────────────
// Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md §1 W7, docs/briefs/ROUTING_STATE_CONTRACT.md.
// The ONLY endpoint this drives is POST /api/trips/:tripId/items/:itemId/route (routing.routes.ts) —
// read that file's header before changing which edges this component offers; it is THE authority on
// which actor may write which edge, not this comment.

/**
 * The badge is READ-ONLY status — every viewer who can see the card sees it (contract §2: expert
 * workspace, admin, and share surfaces all have READS on every state). It renders nothing for the
 * default `in_planning` state (no badge noise) and nothing when the item carries no `routingStatus`
 * key at all (a variant-snapshot / generated-itinerary item is not on the routing state machine —
 * §13, never guessed as `in_planning`).
 *
 * `booking` presence — NOT `routingStatus === 'purchased'` — is the sole signal for the booked/
 * receipt treatment (ROUTING_STATE_CONTRACT §2: "presence is the booked state, never inferred from
 * routing_status alone").
 */
function RoutingBadge({ activity }: { activity: PlanCardActivity }) {
  if (activity.booking) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300"
        data-testid={`badge-routing-booked-${activity.id}`}
      >
        <BadgeCheck className="w-3 h-3" /> Booked
      </span>
    );
  }
  if (activity.routingStatus === "with_expert") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300"
        data-testid={`badge-routing-with-expert-${activity.id}`}
      >
        <Users className="w-3 h-3" /> With your expert
      </span>
    );
  }
  if (activity.routingStatus === "ready_for_checkout") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300"
        data-testid={`badge-routing-checkout-${activity.id}`}
      >
        <ShoppingCart className="w-3 h-3" /> In checkout
      </span>
    );
  }
  return null;
}

function RoutingActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  busy: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      data-testid={testId}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

/**
 * Offers exactly the edges `routing.routes.ts` grants the ACTOR for the item's CURRENT state
 * (the endpoint is the authority; this list is not re-derived from the state-machine diagram, it
 * mirrors the endpoint's owner/expert branches):
 *   OWNER:
 *     in_planning        → "Send to expert" (with_expert) · "Add to checkout" (ready_for_checkout)
 *     with_expert        → "Recall from expert" (in_planning) — the endpoint's owner branch permits
 *                           this recall (actor=owner is granted for any `to` in TRANSITIONABLE, and
 *                           `in_planning`'s LEGAL_FROM includes `with_expert`), so it is offered.
 *     ready_for_checkout → "Remove from checkout" (in_planning) + a "Go to checkout" link to /cart
 *   EXPERT (the ONE cell the endpoint grants the assigned expert — see routing.routes.ts header):
 *     with_expert        → "Return to planning" (in_planning). No other edge is offered to the
 *                           expert actor; every other state renders nothing for them.
 *   purchased / booked → no actions for either actor (checkout is the sole forward writer, refund
 *                         the sole reverser)
 *   no routingStatus   → no actions (nothing real to route — §13, never a button that would 404)
 */
function RoutingActions({
  tripId,
  itemId,
  routingStatus,
  hasBooking,
  actor,
}: {
  tripId: string;
  itemId: string;
  routingStatus: RoutingStatus | undefined;
  hasBooking: boolean;
  actor: "owner" | "expert";
}) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (to: RoutingStatus) =>
      apiRequest("POST", `/api/trips/${tripId}/items/${itemId}/route`, { to }),
    onSuccess: () => {
      // The transition endpoint reconciles the cart projection itself (W2) — this just refreshes
      // the two client-visible reads of that state: the plan (badge/actions) and the cart page.
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update item",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (hasBooking || routingStatus == null || routingStatus === "purchased") return null;

  const busy = mutation.isPending;

  // EXPERT: the endpoint grants exactly one edge (with_expert → in_planning, the expert-return
  // edge). Every other state — including in_planning and ready_for_checkout, which the expert
  // must never act on — renders nothing.
  if (actor === "expert") {
    if (routingStatus === "with_expert") {
      return (
        <RoutingActionButton
          icon={Undo2}
          label="Return to planning"
          busy={busy}
          onClick={() => mutation.mutate("in_planning")}
          testId={`button-route-return-planning-${itemId}`}
        />
      );
    }
    return null;
  }

  if (routingStatus === "with_expert") {
    return (
      <RoutingActionButton
        icon={Undo2}
        label="Recall from expert"
        busy={busy}
        onClick={() => mutation.mutate("in_planning")}
        testId={`button-route-recall-${itemId}`}
      />
    );
  }

  if (routingStatus === "ready_for_checkout") {
    return (
      <>
        <RoutingActionButton
          icon={Undo2}
          label="Remove from checkout"
          busy={busy}
          onClick={() => mutation.mutate("in_planning")}
          testId={`button-route-remove-checkout-${itemId}`}
        />
        {/* The projection row this state implies already exists (W2) — a persistent link, not a
            one-shot toast, so it stays correct across reloads/remounts (§13). */}
        <Link
          href="/cart"
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full text-primary hover:underline"
          data-testid={`link-go-to-checkout-${itemId}`}
        >
          <ShoppingCart className="w-3 h-3" /> Go to checkout
        </Link>
      </>
    );
  }

  // in_planning — the born/default/returned state.
  return (
    <>
      <RoutingActionButton
        icon={Users}
        label="Send to expert"
        busy={busy}
        onClick={() => mutation.mutate("with_expert")}
        testId={`button-route-send-expert-${itemId}`}
      />
      <RoutingActionButton
        icon={ShoppingCart}
        label="Add to checkout"
        busy={busy}
        onClick={() => mutation.mutate("ready_for_checkout")}
        testId={`button-route-add-checkout-${itemId}`}
      />
    </>
  );
}

interface ActivitiesSectionProps {
  tripId: string;
  day: PlanCardDay | undefined;
  templateConfig: TemplateConfig;
  legs?: InlineTransportLegData[];
  /**
   * W7: routing actions (send-to-expert / add-to-checkout / etc.) render ONLY for the trip owner —
   * the contract matrix marks every other viewer (expert, admin, share/collaborator) READ-only on
   * routing state. The badge itself is NOT gated on this — it renders for every viewer.
   */
  isOwner?: boolean;
  /**
   * The ONE non-owner actor the routing endpoint grants a write to: the trip's assigned expert,
   * restricted to the single with_expert → in_planning "Return to planning" edge (routing.routes.ts
   * header). Never combined with owner actions on the same render — `isOwner` takes precedence.
   */
  isExpertViewer?: boolean;
}

interface ConnectorProps {
  tripId: string;
  leg: InlineTransportLegData;
  modeOverride?: string;
  onModeChange: (mode: string) => void;
}

function TransportConnector({ tripId, leg, modeOverride, onModeChange }: ConnectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const activeMode = canonicalMode(modeOverride || leg.userSelectedMode || leg.recommendedMode || "walk");

  // Persist the per-leg mode choice. Copies the reference callers
  // (DayTransportPanel / InlineTransportSelector): PATCH the live route with
  // { selectedMode }, optimistic-update the displayed mode, roll back on error,
  // and invalidate the plancard query so the transport tab + map agree.
  const updateMode = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode });
    },
    onMutate: (selectedMode: string) => {
      const prev = modeOverride ?? leg.userSelectedMode ?? leg.recommendedMode ?? "walk";
      onModeChange(selectedMode);
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (_err, _selectedMode, context) => {
      if (context?.prev) onModeChange(context.prev);
      toast({
        title: "Update failed",
        description: "Could not change transport mode",
        variant: "destructive",
      });
    },
  });
  const modeIcon = TRANSPORT_MODE_ICONS[activeMode] || "🚶";
  const modeLabel = TRANSPORT_MODE_LABELS[activeMode] || activeMode;

  const recommendedEntry = {
    mode: canonicalMode(leg.recommendedMode || leg.userSelectedMode || "walk"),
    durationMinutes: leg.estimatedDurationMinutes,
    costUsd: leg.estimatedCostUsd,
  };
  const altEntries = (leg.alternativeModes || []).map((m) => ({
    mode: canonicalMode(m.mode),
    durationMinutes: m.durationMinutes,
    costUsd: m.costUsd,
  }));
  const allModes = [recommendedEntry, ...altEntries.filter((m) => m.mode !== recommendedEntry.mode)];

  const selectedEntry =
    allModes.find((m) => m.mode === activeMode) ??
    { mode: activeMode, durationMinutes: leg.estimatedDurationMinutes, costUsd: leg.estimatedCostUsd };
  const displayDuration = selectedEntry.durationMinutes;
  const displayCost = selectedEntry.costUsd;

  const canNavigate =
    hasValidCoords(leg.fromLat ?? undefined, leg.fromLng ?? undefined) &&
    hasValidCoords(leg.toLat ?? undefined, leg.toLng ?? undefined);

  const openMapsForMode = (mode: string) => {
    openInMaps({
      origin: {
        lat: leg.fromLat ?? undefined,
        lng: leg.fromLng ?? undefined,
        name: leg.fromName,
      },
      destination: {
        lat: leg.toLat ?? undefined,
        lng: leg.toLng ?? undefined,
        name: leg.toName,
      },
      mode: canonicalMode(mode),
    });
  };

  return (
    <div className="flex gap-3.5 py-0.5" data-testid={`transport-connector-${leg.id}`}>
      <div className="flex flex-col items-center w-12 flex-shrink-0 pt-1.5">
        <div className="w-px h-full bg-border/40" style={{ minHeight: 16 }} />
      </div>
      <div className="flex-1 min-w-0 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors text-left group flex-1 min-w-0"
            data-testid={`button-connector-toggle-${leg.id}`}
          >
            <span className="text-sm leading-none flex-shrink-0">{modeIcon}</span>
            <span className="font-medium">{modeLabel}</span>
            {displayDuration > 0 && (
              <span className="text-muted-foreground/60">{displayDuration}m</span>
            )}
            {displayCost != null && displayCost > 0 && (
              <span className="text-green-600 dark:text-green-400">${displayCost}</span>
            )}
            {leg.distanceDisplay && (
              <span className="text-muted-foreground/50 text-[11px]">{leg.distanceDisplay}</span>
            )}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>

          {canNavigate && (
            <button
              onClick={() => openMapsForMode(activeMode)}
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-primary/10"
              title={`Open route in Maps (${modeLabel})`}
              data-testid={`button-connector-maps-${leg.id}`}
            >
              <Map className="w-3 h-3" />
              <span>Open in Maps</span>
            </button>
          )}
        </div>

        {open && (
          <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`mode-picker-${leg.id}`}>
            {allModes.map((m) => {
              const icon = TRANSPORT_MODE_ICONS[m.mode] || "🚶";
              const label = TRANSPORT_MODE_LABELS[m.mode] || m.mode;
              const isActive = m.mode === activeMode;
              return (
                <button
                  key={m.mode}
                  onClick={() => {
                    updateMode.mutate(m.mode);
                    setOpen(false);
                    if (canNavigate) openMapsForMode(m.mode);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent"
                  }`}
                  data-testid={`mode-option-${leg.id}-${m.mode}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                  {m.durationMinutes > 0 && (
                    <span className="opacity-70">{m.durationMinutes}m</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivitiesSection({
  tripId,
  day,
  templateConfig,
  legs = [],
  isOwner = false,
  isExpertViewer = false,
}: ActivitiesSectionProps) {
  const [visited, toggleVisited] = useVisitedActivities(tripId, day);
  const now = useLiveNow();
  const [legModes, setLegModes] = useState<Record<string, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  if (!day) return null;

  const { isLiveDay, states, upNextIndex, upNextActivity, upNextLeg, lastPastIndex, showNowLine } =
    getUpNextInfo(day, legs, now, visited);

  const upNextMode: TraveloureMode = canonicalMode(
    upNextLeg ? (legModes[upNextLeg.id] || upNextLeg.userSelectedMode || upNextLeg.recommendedMode || "walk") : "walk"
  );

  const fabCanShow =
    isLiveDay &&
    upNextActivity != null &&
    // Navigable when we have real coordinates OR a provider-canonical place link.
    // Items with neither resolve to no button (never a broken link).
    (hasValidCoords(upNextActivity.lat, upNextActivity.lng) || !!upNextActivity.mapsUrl);

  const activities = day.activities || [];

  return (
    <div className="px-5 pt-3 pb-6 relative" data-testid={`activities-section-${tripId}`}>
      <div className="flex justify-between mb-3">
        <div className="text-[13px] text-muted-foreground" data-testid={`text-day-info-${tripId}`}>
          {day.date} — <span className="text-foreground font-semibold">{day.label}</span>
        </div>
        {isLiveDay && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400"
            data-testid="badge-live-day"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live today
          </div>
        )}
      </div>

      {activities.length === 0 && (
        <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-activities-${tripId}`}>
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No activities planned for this day</p>
        </div>
      )}

      {activities.map((a, i) => {
        const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
        const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
        const typeLabel = templateConfig.activityTypes[a.type] || a.type;
        const state = states[a.id] as TemporalState | undefined;
        const isPast = state === "past";
        const isUpcoming = state === "upcoming";
        const isVisited = visited.has(a.id);
        const legAfter = i < activities.length - 1 ? legs[i] : undefined;
        // Mobile-lens audit #4: same guard/helper as the up-next FAB, attached per-row
        // instead of only the single live-day FAB target.
        const canNavigateRow = hasValidCoords(a.lat, a.lng) || !!a.mapsUrl;
        const navigateRow = () =>
          openInMaps({ destination: { lat: a.lat, lng: a.lng, name: a.name, mapsUrl: a.mapsUrl } });

        return (
          <div key={a.id}>
            {showNowLine && i === upNextIndex && (
              <div className="flex items-center gap-2 py-1.5 -mx-1" data-testid="now-line">
                <div className="flex-1 h-px bg-red-400/60" />
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full shrink-0 border border-red-200 dark:border-red-800">
                  {nowHHMM(now)} now
                </span>
                <div className="flex-1 h-px bg-red-400/60" />
              </div>
            )}

            {isVisited ? (
              <div
                className={`flex gap-3.5 py-2.5 opacity-40 ${
                  i < activities.length - 1 ? "border-b border-border/20" : ""
                } border-l-[3px] border-l-transparent pl-1`}
                data-testid={`activity-row-${a.id}`}
              >
                <div className="w-12 flex-shrink-0">
                  <div className="text-[12px] text-muted-foreground" data-testid={`text-activity-time-${a.id}`}>
                    {a.time}
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => toggleVisited(a.id)}
                    className="flex-shrink-0 -m-3.5 p-3.5 text-green-500 hover:text-green-600 transition-colors"
                    title="Mark as not visited"
                    data-testid={`button-visited-${a.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <span
                    className="text-[13px] text-muted-foreground line-through truncate"
                    data-testid={`text-activity-name-${a.id}`}
                  >
                    {a.name}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={`flex gap-3.5 py-3.5 transition-all ${
                  i < activities.length - 1 ? "border-b border-border/30" : ""
                } border-l-[3px] pl-1 ${
                  isUpcoming
                    ? "border-l-primary bg-primary/5 rounded-r-lg"
                    : "border-l-transparent"
                } ${isPast ? "opacity-50" : ""}`}
                data-testid={`activity-row-${a.id}`}
              >
                <div className="flex flex-col items-center w-12 flex-shrink-0">
                  <div
                    className={`text-[13px] font-bold ${isUpcoming ? "text-primary" : "text-foreground"}`}
                    data-testid={`text-activity-time-${a.id}`}
                  >
                    {a.time}
                  </div>
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-card transition-all ${
                      isUpcoming ? "scale-125 ring-2 ring-primary/40" : ""
                    }`}
                    style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }}
                  />
                  {i < activities.length - 1 && (
                    <div
                      className="w-0.5 flex-1 mt-1"
                      style={{
                        background: `linear-gradient(to bottom, ${tc.dot}40, transparent)`,
                      }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <button
                      onClick={() => toggleVisited(a.id)}
                      className="flex-shrink-0 -m-3.5 p-3.5 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
                      title="Mark as visited"
                      data-testid={`button-visited-${a.id}`}
                    >
                      <Circle className="w-4 h-4" />
                    </button>

                    <span
                      className={`text-[15px] font-semibold flex-1 min-w-0 ${
                        isUpcoming ? "text-primary" : "text-foreground"
                      }`}
                      data-testid={`text-activity-name-${a.id}`}
                    >
                      {a.name}
                      {isUpcoming && (
                        <span
                          className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-md align-middle"
                          data-testid={`badge-up-next-${a.id}`}
                        >
                          Up Next
                        </span>
                      )}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${tc.bg} ${tc.fg}`}
                      data-testid={`badge-activity-type-${a.id}`}
                    >
                      {typeLabel}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 ${ss.bg} ${ss.fg}`}
                      data-testid={`badge-activity-status-${a.id}`}
                    >
                      {ss.label}
                    </span>
                  </div>

                  <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                    {canNavigateRow ? (
                      <button
                        type="button"
                        onClick={navigateRow}
                        className="flex items-center gap-1 -my-2 py-2 hover:text-primary transition-colors min-w-0"
                        title="Open in Maps"
                        data-testid={`button-navigate-row-${a.id}`}
                      >
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="hover:underline truncate" data-testid={`text-activity-location-${a.id}`}>{a.location}</span>
                      </button>
                    ) : (
                      <>
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span data-testid={`text-activity-location-${a.id}`}>{a.location}</span>
                      </>
                    )}
                    {a.cost > 0 && (
                      <span
                        className="ml-2 text-green-600 dark:text-green-400 font-semibold"
                        data-testid={`text-activity-cost-${a.id}`}
                      >
                        ${a.cost}
                      </span>
                    )}
                  </div>

                  {/* §5 — vendor phone + confirmation number: real data only, rendered when
                      present (no placeholders for items with neither). */}
                  {(a.vendorPhone || a.confirmationNumber) && (
                    <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      {a.vendorPhone && (
                        <a
                          href={`tel:${a.vendorPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 -my-2 py-2 text-blue-600 dark:text-blue-400 hover:underline"
                          data-testid={`link-call-vendor-${a.id}`}
                        >
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          {a.vendorPhone}
                        </a>
                      )}
                      {a.confirmationNumber && (
                        <span
                          className="flex items-center gap-1"
                          data-testid={`text-confirmation-number-${a.id}`}
                        >
                          <BadgeCheck className="w-3 h-3 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                          Confirmation: {a.confirmationNumber}
                        </span>
                      )}
                    </div>
                  )}

                  {a.expertNote && (
                    <div
                      className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 overflow-hidden"
                      data-testid={`expert-note-callout-${a.id}`}
                    >
                      <button
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left"
                        onClick={() =>
                          setExpandedNotes(prev => ({ ...prev, [a.id]: !prev[a.id] }))
                        }
                        data-testid={`button-toggle-expert-note-${a.id}`}
                      >
                        <span className="text-[11px]">💡</span>
                        <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex-1">
                          Expert Tip
                        </span>
                        <ChevronDown
                          className={`w-3 h-3 text-amber-600 transition-transform flex-shrink-0 ${
                            expandedNotes[a.id] ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {expandedNotes[a.id] && (
                        <div
                          className="px-2.5 pb-2.5 text-[11px] text-amber-800 dark:text-amber-300 italic leading-relaxed"
                          data-testid={`text-expert-note-${a.id}`}
                        >
                          {a.expertNote}
                        </div>
                      )}
                    </div>
                  )}

                  {/* W7 — routing badge (every viewer) + owner-only routing actions. Both halves
                      independently decide whether they have anything to show; the row itself
                      renders only when at least one of them does (no empty row, §13). */}
                  {(() => {
                    const hasBadge =
                      !!a.booking || a.routingStatus === "with_expert" || a.routingStatus === "ready_for_checkout";
                    const hasActions =
                      (isOwner || isExpertViewer) && a.routingStatus != null && !a.booking && a.routingStatus !== "purchased";
                    if (!hasBadge && !hasActions) return null;
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2" data-testid={`routing-row-${a.id}`}>
                        <RoutingBadge activity={a} />
                        {hasActions && (
                          <RoutingActions
                            tripId={tripId}
                            itemId={a.id}
                            routingStatus={a.routingStatus}
                            hasBooking={!!a.booking}
                            actor={isOwner ? "owner" : "expert"}
                          />
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-2.5 mt-2">
                    {/* Mobile-lens audit #6: this was styled cursor-pointer/hover:underline with
                        no onClick — a dead-looking-live control. No comments panel exists at this
                        layer to open, so it's a plain (non-interactive) count, honestly styled. */}
                    {a.comments > 0 && (
                      <span
                        className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1"
                        data-testid={`link-comments-${a.id}`}
                      >
                        <MessageSquare className="w-3 h-3" /> {a.comments} comment
                        {a.comments > 1 ? "s" : ""}
                      </span>
                    )}
                    {(a.changes?.length ?? 0) > 0 && (
                      <span
                        className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"
                        data-testid={`text-activity-change-${a.id}`}
                      >
                        <History className="w-3 h-3" /> {a.changes![0].who}: {a.changes![0].what}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {legAfter && (
              <TransportConnector
                tripId={tripId}
                leg={legAfter}
                modeOverride={legModes[legAfter.id]}
                onModeChange={(mode) =>
                  setLegModes((prev) => ({ ...prev, [legAfter.id]: mode }))
                }
              />
            )}
          </div>
        );
      })}

      {fabCanShow && (
        <div className="sticky bottom-0 mt-4 flex justify-end pb-1 pointer-events-none">
          <button
            onClick={() =>
              openInMaps({
                destination: {
                  lat: upNextActivity!.lat,
                  lng: upNextActivity!.lng,
                  name: upNextActivity!.name,
                  mapsUrl: upNextActivity!.mapsUrl,
                },
                mode: upNextMode,
              })
            }
            className="pointer-events-auto bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl flex items-center gap-2 text-sm font-bold hover:bg-primary/90 transition-colors active:scale-95"
            data-testid="button-navigate-fab"
          >
            <Navigation2 className="w-4 h-4" />
            Navigate ↗
          </button>
        </div>
      )}
    </div>
  );
}
