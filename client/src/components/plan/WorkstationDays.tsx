/**
 * `WorkstationDays` — the Workstation's day surface (R322, step 7a; surface spec §10 step 7, R-bh).
 *
 * The expert builds on the SAME shared rows the traveler reads: one `DayBlock` per day, the day's
 * stops as `ItemRow mode="edit" role="expert"`, and between each pair of stops ONE `LegRow` (kind
 * "stops") from `transport_legs` — or, where no leg exists yet, an honest gap line that says why
 * (never a fabricated leg, §13). It replaces `ItemsEditorPanel`'s rows and `TransportLegsPanel`'s
 * leg list.
 *
 * Writes are the caller's (the existing item and leg routes, unchanged): the surface only says which
 * row asked for what. 7a keeps the transitional write access exactly as it is (R300/R310); an expert
 * editing their own authoring build writes directly, and suggestions on a traveler's plan are 7b.
 *
 * Every day, stop and leg carries its readiness jump target (`@shared/plan-jump-targets`), so the
 * checklist's jump-to (L2-5) lands on this surface.
 */
import { useEffect, useState, type ReactNode } from "react";
import { DayBlock } from "./DayBlock";
import { ItemRow } from "./ItemRow";
import { LegRow, type HostPickupChoice, type StopLeg } from "./LegRow";
import type { PlanCardActivity, PlanCardDay } from "@/components/plancard/plancard-types";
import type { FactView } from "@shared/content-facts";
import { dayBlockHeading, dayBlockStats } from "@/lib/plan-day";
import { itemFactsLine } from "@/lib/place-facts";
import { planDayDomId, planItemDomId, planLegPairDomId } from "@shared/plan-jump-targets";
import { effectiveRoutingStatus } from "@/lib/item-booking-state";
import { ROUTING_TINTS } from "@/components/plancard/slip-tokens";
import { legBetween, located } from "@/lib/leg-review";

// L2-4: `located` and `legBetween` moved to `@/lib/leg-review` (one home, read by the leg review too).
export { legBetween, located };

/**
 * The expert READS every routing state (contract §2): a stop the traveler sent to the expert, staged
 * for checkout or bought says so on the row — through the ONE `effectiveRoutingStatus` and the token
 * layer's own labels, never a restated vocabulary (§18 rule 1). In planning ⇒ nothing (the default);
 * no routing bucket ⇒ nothing (§13).
 */
export function expertRoutingLine(a: PlanCardActivity): string | null {
  const status = effectiveRoutingStatus(a as any) as keyof typeof ROUTING_TINTS | null;
  if (!status || status === "in_planning") return null;
  return ROUTING_TINTS[status]?.label ?? null;
}

export interface LegPatch {
  userSelectedMode?: string;
  authorTip?: string | null;
  pickupProviderServiceId?: string | null;
  pickupPoint?: string | null;
  pickupTime?: string | null;
  proposalStatus?: "confirmed";
}

export interface WorkstationDaysProps {
  days: readonly PlanCardDay[];
  placeFacts?: Record<string, FactView[]>;
  timeZone?: string | null;
  /** Trip-scoped legs (`proposed` / `confirmed`); legacy variant legs are not this editor's. */
  legs: readonly StopLeg[];
  /** False ⇒ the rows render read-only (no menu, no leg controls). */
  canEdit: boolean;
  onReorder: (dayNumber: number, itemIds: string[]) => void;
  onRemove: (item: PlanCardActivity) => void;
  onLegPatch: (legId: string, patch: LegPatch) => void;
  onLegRemove: (legId: string) => void;
  pickupChoices?: readonly HostPickupChoice[];
  pickupUnavailableReason?: string | null;
  /** The stop's edit panel (day, location, expert note, …) — rendered under the row when open. */
  renderEdit?: (item: PlanCardActivity, close: () => void) => ReactNode;
  /** The expert's own-stop form, after `afterItemId` (null = at the end of the day). */
  renderAddForm?: (dayNumber: number, afterItemId: string | null, close: () => void) => ReactNode;
  /** A control beside each day's header (e.g. "Suggest best order"). */
  dayAside?: (dayNumber: number) => ReactNode;
  /** One-shot: open the item's day, scroll to it and open its edit panel. */
  focusItemId?: string | null;
  onFocusHandled?: () => void;
  busy?: boolean;
}

/** Pure. The leg between two consecutive stops, or null. Same pair identity as the server's `pairKey`. */
/** Pure. What a gap with no leg row says (§13): never a time, never a mode it does not have. */
export function legGapLine(from: PlanCardActivity, to: PlanCardActivity): string {
  if (!located(from) || !located(to)) return "Add a location to both stops to route this leg";
  return "Not routed yet — generate transport to propose this leg";
}

export function WorkstationDays(props: WorkstationDaysProps) {
  const { days, legs, canEdit } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ day: number; after: string | null } | null>(null);
  const [openDays, setOpenDays] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!props.focusItemId) return;
    const day = days.find((d) => d.activities.some((a) => a.id === props.focusItemId));
    if (day) setOpenDays((o) => ({ ...o, [day.dayNum]: true }));
    if (canEdit) setEditing(props.focusItemId);
    const t = setTimeout(() => {
      if (typeof document !== "undefined") {
        document.getElementById(planItemDomId(props.focusItemId!))?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      props.onFocusHandled?.();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusItemId]);

  return (
    <div className="space-y-1" data-testid="workstation-days">
      {days.map((d) => {
        const acts = d.activities ?? [];
        const ids = acts.map((a) => a.id);
        const move = (index: number, dir: -1 | 1) => {
          const target = index + dir;
          if (target < 0 || target >= ids.length) return;
          const next = [...ids];
          [next[index], next[target]] = [next[target], next[index]];
          props.onReorder(d.dayNum, next);
        };
        // Every day starts open: the build is the whole plan, and a readiness jump target must be in
        // the page to be jumped to.
        const isOpen = openDays[d.dayNum] ?? true;
        return (
          <DayBlock
            key={d.dayNum}
            dayKey={String(d.dayNum)}
            domId={planDayDomId(d.dayNum)}
            heading={dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null })}
            stats={dayBlockStats({
              stops: acts.length,
              hoursOn: acts.filter((a) => itemFactsLine(props.placeFacts?.[a.id], d.dateIso ?? null)).length,
            })}
            open={isOpen}
            onOpenChange={(o) => setOpenDays((s) => ({ ...s, [d.dayNum]: o }))}
            aside={props.dayAside ? props.dayAside(d.dayNum) : null}
          >
            {acts.map((a, i) => {
              const prev = i > 0 ? acts[i - 1] : null;
              const leg = prev ? legBetween(legs, d.dayNum, prev.id, a.id) : null;
              return (
                <div key={a.id}>
                  {prev ? (
                    leg ? (
                      <LegRow
                        kind="stops"
                        leg={leg}
                        role={canEdit ? "expert" : "traveler"}
                        pickupChoices={props.pickupChoices}
                        pickupUnavailableReason={props.pickupUnavailableReason}
                        onModeChange={(m) => props.onLegPatch(leg.id, { userSelectedMode: m })}
                        onTipSave={(tip) => props.onLegPatch(leg.id, { authorTip: tip })}
                        onPickupChange={(id) => props.onLegPatch(leg.id, { pickupProviderServiceId: id })}
                        onPickupDetailsSave={(p) => props.onLegPatch(leg.id, p)}
                        onConfirm={() => props.onLegPatch(leg.id, { proposalStatus: "confirmed" })}
                        onRemove={() => props.onLegRemove(leg.id)}
                        busy={props.busy}
                      />
                    ) : (
                      <p
                        id={planLegPairDomId(d.dayNum, prev.id, a.id)}
                        className="ml-4 border-l-2 border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground"
                        data-testid={`leg-gap-${prev.id}-${a.id}`}
                      >
                        {legGapLine(prev, a)}
                      </p>
                    )
                  ) : null}
                  <ItemRow
                    item={a}
                    facts={props.placeFacts?.[a.id]}
                    dateIso={d.dateIso ?? null}
                    timeZone={props.timeZone ?? null}
                    mode={canEdit ? "edit" : "read"}
                    role="expert"
                    expertNote={a.expertNote ? { note: a.expertNote, author: "You" } : null}
                    bookingState={expertRoutingLine(a)}
                    highlighted={editing === a.id}
                    menu={
                      canEdit
                        ? {
                            onEdit: props.renderEdit ? () => setEditing(editing === a.id ? null : a.id) : undefined,
                            onAddAfter: props.renderAddForm ? () => setAdding({ day: d.dayNum, after: a.id }) : undefined,
                            onMoveUp: i > 0 ? () => move(i, -1) : null,
                            onMoveDown: i < acts.length - 1 ? () => move(i, 1) : null,
                            onRemove: () => props.onRemove(a),
                          }
                        : null
                    }
                  >
                    {editing === a.id && props.renderEdit ? (
                      <div className="mt-2" data-testid={`workstation-item-edit-${a.id}`}>
                        {props.renderEdit(a, () => setEditing(null))}
                      </div>
                    ) : null}
                  </ItemRow>
                  {adding && adding.day === d.dayNum && adding.after === a.id && props.renderAddForm ? (
                    <div className="px-3 pb-2" data-testid={`workstation-add-after-${a.id}`}>
                      {props.renderAddForm(d.dayNum, a.id, () => setAdding(null))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canEdit && props.renderAddForm ? (
              adding && adding.day === d.dayNum && adding.after === null ? (
                <div className="px-3 pb-2" data-testid={`workstation-add-day-${d.dayNum}`}>
                  {props.renderAddForm(d.dayNum, null, () => setAdding(null))}
                </div>
              ) : (
                <button
                  type="button"
                  className="ml-3 mb-1 text-xs text-primary underline underline-offset-2"
                  onClick={() => setAdding({ day: d.dayNum, after: null })}
                  data-testid={`workstation-add-stop-day-${d.dayNum}`}
                >
                  + Add a stop of your own
                </button>
              )
            ) : null}
          </DayBlock>
        );
      })}
    </div>
  );
}
