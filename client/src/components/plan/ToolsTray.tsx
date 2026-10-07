/**
 * `ToolsTray` — the slip's tools, as the group manifest names them (surface spec v1.2 §2/§4; step 2,
 * ledger `2026-10-03-surface-step2-tools-tray`).
 *
 * One chip per tool in `manifestFor(group, occasionSlug).tools`; each opens a sheet that mounts the
 * EXISTING component for that tool — this file builds no tool. A tool with no existing component
 * renders as a DISABLED chip saying "coming soon" (§13: never a chip that opens nothing, never a
 * placeholder pretending to be the tool). The registry below is the ONE place a tool key meets a
 * component (§18 rule 1).
 */
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EnergyBudgetDisplay, ScheduleValidator } from "@/components/logistics";
import { VendorContractBoard } from "@/components/logistics/vendor-contract-board";
import { SlipTravelingParty } from "@/components/plancard/SlipTravelingParty";
import { SlipAnchorsTool, SlipGuestsTool } from "@/components/plancard/SlipLogisticsSection";
import { GettingThereSheet } from "./GettingThereSheet";
import { GettingAroundSheet } from "./GettingAroundSheet";
import { TOOL_LABEL, manifestFor, type ToolKey } from "@shared/group-manifest";
import type { PlanEvent } from "@/lib/slip-events";

export const TOOL_COMING_SOON = "coming soon";

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
}

/** The tool → existing component registry. `null` ⇒ no existing component: a disabled chip. */
export function toolContent(key: ToolKey, p: ToolsTrayProps): ReactNode | null {
  switch (key) {
    case "getting_there":
      return <GettingThereSheet tripId={p.tripId} trip={p.trip} />;
    case "where_to_stay":
    case "shared_lodging":
      return p.whereToStay;
    case "travel_party":
    case "whos_coming":
      return <SlipTravelingParty tripId={p.tripId} />;
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
    // No existing component — "coming soon", never built here. Getting home stays so: a Moment has no
    // departure point and `users.home_city` is a city, not a point (D7, FU-9C-2).
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

export function trayTools(p: Pick<ToolsTrayProps, "group" | "occasionSlug" | "isHidden">): ToolKey[] {
  return manifestFor(p.group, p.occasionSlug).tools.filter((k) => !(p.isHidden && HIDDEN_OCCASION_ABSENT.has(k)));
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
  return (
    <div className="flex flex-wrap gap-2" data-testid="slip-tools-tray">
      {tools.map((key) => {
        const available = toolContent(key, props) !== null;
        return (
          <button
            key={key}
            type="button"
            disabled={!available}
            onClick={() => setOpen(key)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-sm ${
              available
                ? "border-border bg-background text-foreground hover:bg-muted/50"
                : "border-dashed border-border text-muted-foreground cursor-not-allowed"
            }`}
            data-testid={`tool-chip-${key}`}
            data-available={available ? "true" : "false"}
          >
            {TOOL_LABEL[key]}
            {!available ? <span className="text-[11px]">· {TOOL_COMING_SOON}</span> : null}
          </button>
        );
      })}
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
    </div>
  );
}
