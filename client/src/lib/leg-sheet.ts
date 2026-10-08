/**
 * The LegSheet's words and decisions, stated once (step 9c D3/D4/D8, ledger `2026-10-07-step9c-leg-options`).
 * Pure.
 */
import type { RoutingMode } from "@shared/routing-engine";
import { LEG_MODE_STORED } from "@shared/travel-speeds";

export const LEG_MODE_LABEL: Readonly<Record<RoutingMode, string>> = { walk: "Walk", cycle: "Cycle", transit: "Transit", drive: "Drive" };

/** L7 / R-au: the host-pickup line — shown only when a provider-confirmed pickup exists (D8: none yet). */
export const LEG_HOST_PICKUP_LINE = "via host pickup · as described by the host";

export const LEG_OPTIONS_PAUSED_LINE = "Travel options paused today — resumes tomorrow";
export const LEG_OPTIONS_UNAVAILABLE_LINE = "Travel options aren't available for this leg right now.";

/** The value the leg PATCH takes for a mode (the stored spelling the server's mode list holds). */
export function legPatchMode(mode: RoutingMode): string {
  return LEG_MODE_STORED[mode];
}

/**
 * D4 "Book this for me": the handoff is scoped to the leg's two END ITEMS. A stay is an item; an
 * airport end (`anchor:<id>`) is not, and is dropped.
 */
export function legHandoffItemIds(fromId: string, toId: string): string[] {
  return Array.from(new Set([fromId, toId].filter((id) => !!id && !id.startsWith("anchor:"))));
}

/**
 * Who sees what on the sheet. Picking a mode is a plan edit (owner or delegate — LD 52 (C)); booking is the
 * owner's alone (LD 42 D19: a helper never books or pays). A confirmed host pickup (D8) replaces Book.
 */
export function legSheetActions(input: { canEditItems: boolean; isOwner: boolean; hostPickupConfirmed: boolean }): {
  canPick: boolean;
  showBook: boolean;
  showHostPickup: boolean;
} {
  return {
    canPick: input.canEditItems,
    showBook: input.isOwner && !input.hostPickupConfirmed,
    showHostPickup: input.hostPickupConfirmed,
  };
}
