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
 *
 * A fifth value, `payer` (Locked Decision 42 D9, ledger `2026-09-27-payer-reads-plancard`), is a
 * `payer`-role `trip_participants` row: half of the bookings section's audience, so it READS the
 * plan the balance belongs to. It is READ-ONLY here — no item tools, no owner controls — because
 * the server admits it to the plancard read and to nothing else.
 */
export type SlipViewer = "owner" | "expert" | "delegate" | "payer" | "other";

export function slipViewer(tripRole: string | null | undefined): SlipViewer {
  if (
    tripRole === "owner" ||
    tripRole === "expert" ||
    tripRole === "delegate" ||
    tripRole === "payer"
  ) {
    return tripRole;
  }
  return "other";
}

/**
 * Item add / edit / reorder / remove on the slip (D16's owner tools, shared with the delegate).
 * A `payer` never gets them: reading the plan to pay its balance is not a grant to change it.
 */
export function canEditPlanItems(viewer: SlipViewer): boolean {
  return viewer === "owner" || viewer === "delegate";
}

export const SLIP_DELEGATE_NOTE =
  "You're building this plan for your client. You can add and change items; they approve, book and pay.";
