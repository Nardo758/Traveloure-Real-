/**
 * Who is looking at the slip, and what that lets them draw (Locked Decision 52 (C), ledger
 * `2026-09-24-ea-plans-for-executive`).
 *
 * The plancard payload's `tripRole` is the server's answer. A fourth value, `delegate`, is the
 * executive assistant who builds a plan the executive owns: it edits the plan's items like the
 * owner, and nothing else the owner does — no booking, paying, finalizing, sharing, guests,
 * money between people or hiring (LD 42 D19: a helper never pays). It is never shown as
 * "your expert". Like D16 this is a RENDER rule and grants nothing: every server rail keeps its
 * own gate.
 */
export type SlipViewer = "owner" | "expert" | "delegate" | "other";

export function slipViewer(tripRole: string | null | undefined): SlipViewer {
  if (tripRole === "owner" || tripRole === "expert" || tripRole === "delegate") return tripRole;
  return "other";
}

/** Item add / edit / reorder / remove on the slip (D16's owner tools, shared with the delegate). */
export function canEditPlanItems(viewer: SlipViewer): boolean {
  return viewer === "owner" || viewer === "delegate";
}

export const SLIP_DELEGATE_NOTE =
  "You're building this plan for your client. You can add and change items; they approve, book and pay.";
