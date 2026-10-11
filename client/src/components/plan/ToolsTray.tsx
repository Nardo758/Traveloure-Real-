/**
 * `ToolsTray` — the slip's tools, as the group manifest names them (surface spec v1.2 §2/§4; step 2,
 * ledger `2026-10-03-surface-step2-tools-tray`).
 *
 * One chip per tool in `manifestFor(group, occasionSlug).tools`; each opens a sheet that mounts the
 * EXISTING component for that tool — this file builds no tool. ONLY LIVE TOOLS RENDER (ledger
 * `2026-10-08-tools-tray-live-only`): whether a tool is live is the manifest's `toolIsLive`
 * (`TOOL_STATE`, plus the `/api/health` flag a flag-gated tool names) — a coming-soon tool draws
 * nothing, and a tray with no live tools draws no chips and no wrapper. The SHEET stays mounted either
 * way, because the day rows' "Add your flight" opens Getting there through it even while its chip is
 * hidden (lookup off ⇒ the sheet takes a manual time). The registry below is the ONE place a tool key
 * meets a component (§18 rule 1); a tool with no component is `coming_soon` in the manifest.
 */
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EnergyBudgetDisplay, ScheduleValidator } from "@/components/logistics";
import { VendorContractBoard } from "@/components/logistics/vendor-contract-board";
import { SlipTravelingParty } from "@/components/plancard/SlipTravelingParty";
import { SlipAnchorsTool, SlipGuestsTool } from "@/components/plancard/SlipLogisticsSection";
import { GettingThereSheet } from "./GettingThereSheet";
import { GettingAroundSheet } from "./GettingAroundSheet";
import { TOOL_LABEL, manifestFor, toolIsLive, type ToolFlags, type ToolKey } from "@shared/group-manifest";
import type { PlanEvent } from "@/lib/slip-events";

export interface ToolsTrayProps {
  tripId: string;
  /** `experienceGroupFor`'s answer for this plan (unknown ⇒ Trip). */
  group: string | null;
  occasionSlug: string | null;
  planEvents?: readonly PlanEvent[];
  /** A hidden occasion (LD 28) has no guest or traveling-party surface — those chips are absent. */
  isHidden: boolean;
  /** The plan's own "Where to stay" surface, as the slip already resolves it (the panel or the compare). */
  whereToStay: ReactNode;
  trip: { destination: string | null; startDate: string | null; endDate: string | null };
  /** Controlled: which tool's sheet is open (the day rows' "Add your flight" opens Getting there). */
  openTool?: ToolKey | null;
  onOpenToolChange?: (key: ToolKey | null) => void;
  /** The `/api/health` `flags` block (or null while unknown — a flag-gated tool then stays hidden). */
  flags?: ToolFlags;
  /** The manifest's tool list for this plan. Defaults to `manifestFor(group, occasionSlug).tools`;
   *  passed only to prove the tray against a list no group carries today (e.g. none live). */
  manifestTools?: readonly ToolKey[];
  /**
   * Tools whose question the plan already answers, drawn filled with a "✓" (the Moment board's
   * "The reservation ✓", slip conformance; ledger `2026-10-08-slip-moment-board`). The caller
   * decides from the plan's own facts. A key the plan has not answered is never marked done (§13).
   */
  doneTools?: ReadonlySet<ToolKey>;
  /** The header's own zone line (`slipZoneLine`), shown again in the Travel party sheet (ruling 3,
   *  ledger `2026-10-08-slip-main-rail`). Null ⇒ the plan states no zone and nothing is printed (LD 30). */
  zoneLine?: string | null;
}

/** The tool → existing component registry. `null` ⇒ no existing component (`coming_soon` in the manifest). */
export function toolContent(key: ToolKey, p: ToolsTrayProps): ReactNode | null {
  switch (key) {
    case "getting_there":
      return <GettingThereSheet tripId={p.tripId} trip={p.trip} />;
    case "where_to_stay":
    case "shared_lodging":
      return p.whereToStay;
    case "travel_party":
    case "whos_coming":
      return (
        <>
          {p.zoneLine ? (
            <p className="mb-3 text-xs text-muted-foreground" data-testid="tool-travel-party-zone">
              {p.zoneLine}
            </p>
          ) : null}
          <SlipTravelingParty tripId={p.tripId} />
        </>
      );
    case "pace":
      return <EnergyBudgetDisplay tripId={p.tripId} />;
    case "the_reservation":
    case "the_venue":
    case "the_show":
      return <SlipAnchorsTool tripId={p.tripId} planEvents={p.planEvents} />;
    case "run_of_show":
      return (
        <div className="space-y-4">
          <SlipAnchorsTool tripId={p.tripId} planEvents={p.planEvents} />
          <ScheduleValidator tripId={p.tripId} />
        </div>
      );
    case "timing_check":
      return <ScheduleValidator tripId={p.tripId} />;
    case "guests":
    case "guest_invites":
      return <SlipGuestsTool tripId={p.tripId} planEvents={p.planEvents} />;
    case "vendors":
    case "vendor_contracts":
      return <VendorContractBoard tripId={p.tripId} />;
    // Step 9c D7 (ledger `2026-10-07-step9c-leg-options`): the plan's own legs, zero Maps calls.
    case "getting_around":
      return <GettingAroundSheet tripId={p.tripId} />;
    // No existing component — `coming_soon` in the manifest, so not drawn. Getting home stays so: a Moment
    // has no departure point and `users.home_city` is a city, not a point (D7, FU-9C-2).
    case "getting_home":
    case "budget":
    case "arrivals_split_groups":
    case "split_activities":
    case "who_pays_what":
    case "getting_back_late":
      return null;
  }
}

/** Tools that do not exist under a hidden occasion (the guest and party surfaces, LD 28). */
const HIDDEN_OCCASION_ABSENT: ReadonlySet<ToolKey> = new Set<ToolKey>(["guests", "guest_invites", "travel_party", "whos_coming"]);

/** The chips this plan draws: the manifest's tools, minus a hidden occasion's absent ones, LIVE only. */
export function trayTools(p: Pick<ToolsTrayProps, "group" | "occasionSlug" | "isHidden" | "flags" | "manifestTools">): ToolKey[] {
  return (p.manifestTools ?? manifestFor(p.group, p.occasionSlug).tools)
    .filter((k) => !(p.isHidden && HIDDEN_OCCASION_ABSENT.has(k)))
    .filter((k) => toolIsLive(k, p.flags));
}

export function ToolsTray(props: ToolsTrayProps) {
  const [ownOpen, setOwnOpen] = useState<ToolKey | null>(null);
  const open = props.openTool !== undefined ? props.openTool : ownOpen;
  const setOpen = (k: ToolKey | null) => {
    if (props.openTool === undefined) setOwnOpen(k);
    props.onOpenToolChange?.(k);
  };
  const tools = trayTools(props);
  const content = open ? toolContent(open, props) : null;
  const sheet = (
    <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid={open ? `tool-sheet-${open}` : undefined}>
        {open ? (
          <>
            <SheetHeader>
              <SheetTitle>{TOOL_LABEL[open]}</SheetTitle>
              <SheetDescription className="sr-only">{TOOL_LABEL[open]}</SheetDescription>
            </SheetHeader>
            <div className="mt-4">{content}</div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
  // An empty tray draws nothing of its own — no chips, no wrapper — only the sheet.
  if (tools.length === 0) return sheet;
  return (
    // The boards' tray: one horizontal row of pills that scrolls rather than wraps (ruling 7, "the tray
    // stays a row"), navy outline, filled navy with a ✓ once the plan answers that tool.
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" data-testid="slip-tools-tray">
      {tools.map((key) => {
        const done = props.doneTools?.has(key) === true;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setOpen(key)}
            className={
              done
                ? "inline-flex h-[38px] flex-shrink-0 items-center whitespace-nowrap rounded-[var(--slip-radius-chip)] bg-[color:var(--slip-navy)] px-3.5 text-[13px] font-semibold text-white hover:brightness-110"
                : "inline-flex h-[38px] flex-shrink-0 items-center whitespace-nowrap rounded-[var(--slip-radius-chip)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-3.5 text-[13px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-ground)]"
            }
            data-testid={`tool-chip-${key}`}
            data-tool-done={done ? "true" : undefined}
          >
            {TOOL_LABEL[key]}
            {done ? " ✓" : null}
          </button>
        );
      })}
      {sheet}
    </div>
  );
}
