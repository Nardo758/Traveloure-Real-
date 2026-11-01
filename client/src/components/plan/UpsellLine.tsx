/**
 * `UpsellLine` — row 179 screen (ledger `2026-10-30-row179-upsell-line-screen`; surface spec §7.2). One line under a
 * selected item on the Trip Card: "Add X for this leg" (approved, Architect Oct 29, 2026), linking to the services
 * browse for X's category on this plan. The line comes from the on-trip upsell read (`shared/upsell-line.ts`); this
 * component builds the sentence and nothing else.
 *
 * The social-proof line ("Most people…") is HELD FOR LEON and never drawn: a DTO that carries social proof draws
 * nothing at all rather than a line that leaves out what the server sent.
 */
import { Link } from "wouter";
import type { UpsellLine as UpsellLineDto } from "@shared/upsell-line";

/** Every string this component says. */
export const UPSELL_LINE_COPY = {
  addForLeg: (title: string) => `Add ${title} for this leg`,
} as const;

export function upsellLineVisible(line: Pick<UpsellLineDto, "title" | "socialProof"> | null | undefined): boolean {
  return !!line && line.socialProof == null && line.title.trim().length > 0;
}

/** `onClick` records the tap through the existing upsell click event (the caller passes it); no new tracking. */
export function UpsellLine({ line, href, onClick }: { line: UpsellLineDto; href: string; onClick?: () => void }) {
  if (!upsellLineVisible(line)) return null;
  return (
    <p className="text-xs" data-testid={`item-upsell-line-${line.itemId}`}>
      <Link
        href={href}
        onClick={onClick}
        className="font-semibold underline underline-offset-2 hover:text-foreground"
        data-testid={`item-upsell-link-${line.itemId}`}
      >
        {UPSELL_LINE_COPY.addForLeg(line.title.trim())}
      </Link>
    </p>
  );
}
