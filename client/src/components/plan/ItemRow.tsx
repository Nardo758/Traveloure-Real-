/**
 * `ItemRow` — the ONE item renderer (surface spec v1.2 §3 / §10, R-c; step 1, ledger
 * `2026-10-03-surface-step1-item-row`). Replaces the slip's `SlipItemRow` now; the Trip Card's
 * `ActivitiesSection` rows and the Workstation's `ItemsEditorPanel` rows move onto it in steps 6–7.
 *
 * THE CONTRACT IS DECLARED IN FULL; ONLY WHAT THE SLIP NEEDS TODAY IS DRAWN. `routing`, `suggestion`
 * and `upsell` are accepted and not rendered yet (steps 7 and 10 draw them); `mode: "read"` draws the
 * row without its ⋯ menu — its booking chip and "Message host" arrive with the Trip Card in step 6.
 *
 * WHAT A ROW SAYS, top to bottom (edit mode):
 *   time · title                                   ⋯ (Swap · Move · Remove · Ask a local about this
 *   place line — a Google-located ward/area, or       · Find a host · Build my days around this)
 *     the words a person typed; NEVER AI text
 *   facts line — "<Wkd> · <hours> · Google Maps · checked <d Mon>" (or "checking hours…")
 *   booking line — only when a real booking says something
 *   expert note — `ExpertNote`, with the follow-up thread under it
 * No routing pill, no kind chip, no origin chip, and no per-item checkout control (R-l): the draft is
 * a plan, not a basket.
 */
import { SET_AS_STAY_LABEL } from "@shared/where-to-stay";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, Lock, MoreHorizontal, Navigation } from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FactView } from "@shared/content-facts";
import type { PlanCardActivity } from "@/components/plancard/plancard-types";
import { itemFactsLine, itemPlaceLine, sourcedLineSuffix } from "@/lib/place-facts";
import { CHECKING_HOURS_LABEL } from "@/lib/plancard-refetch";
import { AnchorRow } from "./AnchorRow";
import { ExpertNote } from "./ExpertNote";
import { PlacePhoto } from "./PlacePhoto";
import type { PhotoView } from "@shared/place-photos";

export type ItemRowMode = "edit" | "read";
export type ItemRowRole = "traveler" | "expert";
export type ItemRowRouting = "own" | "with_expert";

/** The ⋯ menu's actions. An absent handler is an absent entry — never a greyed one (§13). */
export interface ItemRowMenu {
  /** Smoke 7 item 4: a question is already saved on this row ⇒ the entry reads "See your question". */
  askLocalSaved?: boolean;
  onSwap?: () => void;
  onMoveUp?: (() => void) | null;
  onMoveDown?: (() => void) | null;
  onRemove?: () => void;
  onAskLocal?: () => void;
  /** Generic items only: the existing search, with the category preset. */
  findHostHref?: string | null;
  /** Step 5: on the slip, "Find a host" opens the map's Browse layer filtered to the item's category. */
  onFindHost?: () => void;
  onBuildAround?: () => void;
  /** Smoke 9 S9-2 amendment: a hand-added lodging item becomes the plan's stay. */
  onSetAsStay?: () => void;
  /** R-ah: "Keep this" (unlocked) / "Unlock" (locked) — the owner's own lock. */
  onToggleLock?: () => void;
  /** Step 6 R-ap: ⋯ → Details opens the `ItemSheet`. */
  onDetails?: () => void;
}

export interface ItemRowProps {
  item: PlanCardActivity;
  /** The item's facts, each with its `checkedAt`. */
  facts?: readonly FactView[];
  /** The plan day's date — the facts line reads THAT day's weekday, and none without it (§13). */
  dateIso?: string | null;
  /** S9-6: the plan's zone (`trips.timezone`) — the facts line's "checked" day is read in it. */
  timeZone?: string | null;
  mode: ItemRowMode;
  role: ItemRowRole;
  /** The line a real booking says ("booked · #A1B2", "Payment failed — …"); null ⇒ nothing. */
  bookingState?: string | null;
  /** Declared for step 7 (handoff); not drawn in step 1. */
  routing?: ItemRowRouting;
  expertNote?: { note: string; author: string | null; neighbourhood?: string | null; followUp?: ReactNode } | null;
  /** Declared for step 7 (suggestions); not drawn in step 1. */
  suggestion?: unknown;
  /** Declared for step 10 (`UpsellLine`); not drawn in step 1. */
  upsell?: unknown;
  /**
   * This row is a fixed point; `fromTool` names where it was fixed. Anchors carry no Move. A null
   * `fromTool` is a TRAVEL row nothing has fixed yet (step 2 addendum: an AI arrival/departure item
   * standing in for the placeholder) — glyph and `action`, no "fixed" label. `time` overrides the
   * item's own (a flight's time); `detail` is one line under the title (what the flight is).
   */
  anchor?: {
    fromTool: string | null;
    time?: string | null;
    action?: { label: string; onClick: () => void } | null;
    detail?: string | null;
    /** S10-4: a travel row's title is the anchor's ("Arrival in Kyoto"), never the model's. */
    title?: string | null;
  } | null;
  /** The place-facts run is still checking this stop. */
  checkingHours?: boolean;
  menu?: ItemRowMenu | null;
  highlighted?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  /** Under the booking line: the owner's one booking action ("View booking" / "Try again"). */
  bookingAction?: ReactNode;
  /** Inline panels the menu opens (the edit form, the remove confirmation). */
  children?: ReactNode;
  /** Step 6 R-ap: tapping the title (or the photo) opens the stop's `ItemSheet`. */
  onOpenDetails?: () => void;
  /** Step 6 R-aq: a thumbnail — Trip Card today rows only (none on slip rows, versions or the map). */
  photo?: PhotoView | null;
  /** Step 6 R-ay: read mode's Navigate — a Google Maps directions deep link, no API call. */
  navigateHref?: string | null;
  /** R297: the Trip Card's today rows — the traveler's own "visited" tick (device-local, no write). */
  visited?: { checked: boolean; onToggle: () => void } | null;
}

export function ItemRow(props: ItemRowProps) {
  const { item: a, facts, dateIso = null, timeZone = null, mode, anchor = null, menu = null, highlighted = false } = props;
  const place = itemPlaceLine(facts, a, timeZone);
  const factsLine = itemFactsLine(facts, dateIso, timeZone);
  const showMenu = mode === "edit" && menu && hasAnyEntry(menu, !!anchor);

  const titleLine = (
    <p className={`font-medium flex items-start gap-1.5 ${props.visited?.checked ? "text-muted-foreground line-through" : "text-foreground"}`}>
      {props.visited ? (
        <button
          type="button"
          onClick={props.visited.onToggle}
          className={`flex-shrink-0 -my-1 p-1 ${props.visited.checked ? "text-green-600" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
          title={props.visited.checked ? "Mark as not visited" : "Mark as visited"}
          aria-pressed={props.visited.checked}
          data-testid={`button-visited-${a.id}`}
        >
          {props.visited.checked ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
        </button>
      ) : null}
      {a.time ? (
        <span className="text-muted-foreground font-normal tabular-nums" data-testid={`slip-item-time-${a.id}`}>
          {a.time}
        </span>
      ) : null}
      {props.onOpenDetails ? (
        <button
          type="button"
          onClick={props.onOpenDetails}
          className="min-w-0 break-words text-left hover:underline underline-offset-2"
          data-testid={`slip-item-name-${a.id}`}
        >
          {a.name}
        </button>
      ) : (
        <span className="min-w-0 break-words" data-testid={`slip-item-name-${a.id}`}>{a.name}</span>
      )}
    </p>
  );

  const below = (
    <>
      {a.locked ? (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`slip-item-locked-${a.id}`}>
          <Lock className="w-3 h-3" aria-hidden="true" />
          {ITEM_LOCKED_LABEL}
        </p>
      ) : null}
      {place ? (
        // S10-9: the same format and the same link as the facts line below — one sourced-line style.
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`slip-item-place-${a.id}`}>
          {place.provenance && place.sourceUrl ? (
            <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              <span data-testid={`slip-item-address-${a.id}`}>{place.text}</span>
              {sourcedLineSuffix(place)}
            </a>
          ) : (
            <>
              <span data-testid={`slip-item-address-${a.id}`}>{place.text}</span>
              {sourcedLineSuffix(place)}
            </>
          )}
        </p>
      ) : null}
      {factsLine ? (
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`slip-item-facts-${a.id}`}>
          {factsLine.sourceUrl ? (
            <a href={factsLine.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {factsLine.text}
            </a>
          ) : (
            factsLine.text
          )}
        </p>
      ) : props.checkingHours ? (
        <p className="mt-0.5 text-xs text-muted-foreground italic" data-testid={`slip-item-facts-checking-${a.id}`}>
          {CHECKING_HOURS_LABEL}
        </p>
      ) : null}
      {props.bookingState ? (
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`slip-item-booking-${a.id}`}>
          {props.bookingState}
        </p>
      ) : null}
      {props.bookingAction ? <div className="mt-1.5">{props.bookingAction}</div> : null}
      {mode === "read" && props.navigateHref ? (
        <a
          href={props.navigateHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid={`slip-item-navigate-${a.id}`}
        >
          <Navigation className="w-3 h-3" aria-hidden="true" />
          Navigate
        </a>
      ) : null}
      {props.expertNote ? (
        <ExpertNote
          note={props.expertNote.note}
          author={props.expertNote.author}
          neighbourhood={props.expertNote.neighbourhood ?? null}
          followUp={props.expertNote.followUp}
        />
      ) : null}
      {props.children}
    </>
  );

  return (
    <div
      ref={props.rowRef}
      className={`py-3 px-3 rounded-lg transition-shadow ${highlighted ? "ring-2 ring-primary/60 bg-primary/5" : ""}`}
      data-testid={`slip-item-${a.id}`}
      data-item-mode={mode}
    >
      <div className="flex items-start justify-between gap-2">
        {props.photo ? <PlacePhoto photo={props.photo} size="thumb" testId={`slip-item-photo-${a.id}`} onClick={props.onOpenDetails} /> : null}
        <div className="min-w-0 flex-1">
          {anchor ? (
            <AnchorRow
              id={a.id}
              time={anchor.time !== undefined ? anchor.time : a.time || null}
              title={anchor.title || a.name}
              fromTool={anchor.fromTool}
              action={anchor.action ?? null}
            >
              {anchor.detail ? (
                <p className="text-xs text-muted-foreground" data-testid={`slip-anchor-detail-${a.id}`}>
                  {anchor.detail}
                </p>
              ) : null}
              {below}
            </AnchorRow>
          ) : (
            <>
              {titleLine}
              {below}
            </>
          )}
        </div>
        {showMenu ? <ItemRowMenuButton id={a.id} menu={menu!} isAnchor={!!anchor} locked={!!a.locked} /> : null}
      </div>
    </div>
  );
}

function hasAnyEntry(m: ItemRowMenu, isAnchor: boolean): boolean {
  return !!(m.onDetails || m.onSwap || (!isAnchor && (m.onMoveUp || m.onMoveDown)) || m.onRemove || m.onToggleLock || m.onAskLocal || m.findHostHref || m.onBuildAround || m.onSetAsStay);
}

/** The labels, ONCE (spec §3's order). */
export const ITEM_MENU_LABELS = {
  details: "Details",
  swap: "Swap",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
  askLocal: "Ask a local about this",
  seeQuestion: "See your question",
  findHost: "Find a host",
  buildAround: "Build my days around this",
  setAsStay: SET_AS_STAY_LABEL,
  lock: "Keep this",
  unlock: "Unlock",
} as const;

/** R-ah: the row's own word for a locked item. Optimize, Regenerate and Build-around leave it in place. */
export const ITEM_LOCKED_LABEL = "Kept · Optimize and redrafts leave it in place";

function ItemRowMenuButton({ id, menu, isAnchor, locked }: { id: string; menu: ItemRowMenu; isAnchor: boolean; locked: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="More actions"
          data-testid={`item-menu-${id}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menu.onDetails ? (
          <DropdownMenuItem onSelect={menu.onDetails} data-testid={`item-menu-details-${id}`}>{ITEM_MENU_LABELS.details}</DropdownMenuItem>
        ) : null}
        {menu.onSwap ? (
          <DropdownMenuItem onSelect={menu.onSwap} data-testid={`item-menu-swap-${id}`}>{ITEM_MENU_LABELS.swap}</DropdownMenuItem>
        ) : null}
        {!isAnchor && menu.onMoveUp ? (
          <DropdownMenuItem onSelect={menu.onMoveUp} data-testid={`item-menu-move-up-${id}`}>{ITEM_MENU_LABELS.moveUp}</DropdownMenuItem>
        ) : null}
        {!isAnchor && menu.onMoveDown ? (
          <DropdownMenuItem onSelect={menu.onMoveDown} data-testid={`item-menu-move-down-${id}`}>{ITEM_MENU_LABELS.moveDown}</DropdownMenuItem>
        ) : null}
        {menu.onToggleLock ? (
          <DropdownMenuItem onSelect={menu.onToggleLock} data-testid={`item-menu-lock-${id}`}>
            {locked ? ITEM_MENU_LABELS.unlock : ITEM_MENU_LABELS.lock}
          </DropdownMenuItem>
        ) : null}
        {menu.onRemove ? (
          <DropdownMenuItem onSelect={menu.onRemove} data-testid={`item-menu-remove-${id}`}>{ITEM_MENU_LABELS.remove}</DropdownMenuItem>
        ) : null}
        {(menu.onAskLocal || menu.findHostHref || menu.onBuildAround || menu.onSetAsStay) && (menu.onSwap || menu.onRemove || menu.onToggleLock || menu.onMoveUp || menu.onMoveDown) ? (
          <DropdownMenuSeparator />
        ) : null}
        {menu.onAskLocal ? (
          <DropdownMenuItem onSelect={menu.onAskLocal} data-testid={`item-menu-ask-local-${id}`}>{menu.askLocalSaved ? ITEM_MENU_LABELS.seeQuestion : ITEM_MENU_LABELS.askLocal}</DropdownMenuItem>
        ) : null}
        {menu.findHostHref && menu.onFindHost ? (
          <DropdownMenuItem onSelect={menu.onFindHost} data-testid={`item-menu-find-host-${id}`}>
            {ITEM_MENU_LABELS.findHost}
          </DropdownMenuItem>
        ) : menu.findHostHref ? (
          <DropdownMenuItem asChild data-testid={`item-menu-find-host-${id}`}>
            <Link href={menu.findHostHref}>{ITEM_MENU_LABELS.findHost}</Link>
          </DropdownMenuItem>
        ) : null}
        {menu.onSetAsStay ? (
          <DropdownMenuItem onSelect={menu.onSetAsStay} data-testid={`item-menu-set-as-stay-${id}`}>{ITEM_MENU_LABELS.setAsStay}</DropdownMenuItem>
        ) : null}
        {menu.onBuildAround ? (
          <DropdownMenuItem onSelect={menu.onBuildAround} data-testid={`item-menu-build-around-${id}`}>{ITEM_MENU_LABELS.buildAround}</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
