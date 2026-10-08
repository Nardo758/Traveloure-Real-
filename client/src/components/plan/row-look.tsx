/**
 * WHICH LOOK THE SHARED DAY AND ITEM ROWS TAKE (slip conformance, Main board, boards rev 15; ledger
 * `2026-10-08-slip-main-rows`).
 *
 * `DayBlock`, `ItemRow`, `AnchorRow` and `ExpertNote` are mounted by three surfaces: the slip, the
 * Trip Card (`TripCardDays`) and the Workstation (`WorkstationDays`). The board look draws them as the
 * Main board does — one card per day, a time column, a dot rail — using the slip's scoped tokens
 * (`client/src/styles/slip-tokens.css`), which exist only under the slip's root class. So the look is
 * opted INTO by the surface that owns those tokens: the slip provides "board", and every other mount
 * reads the default, "plain", and renders exactly as before. The Trip Card takes the board look in its
 * own PR (TripCard board), not as a side effect of this one.
 */
import { createContext, useContext, type ReactNode } from "react";

export type PlanRowLook = "plain" | "board";

const PlanRowLookContext = createContext<PlanRowLook>("plain");

export function PlanRowLookProvider({ look, children }: { look: PlanRowLook; children: ReactNode }) {
  return <PlanRowLookContext.Provider value={look}>{children}</PlanRowLookContext.Provider>;
}

export function usePlanRowLook(): PlanRowLook {
  return useContext(PlanRowLookContext);
}
