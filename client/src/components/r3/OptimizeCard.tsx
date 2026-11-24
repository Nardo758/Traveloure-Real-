/**
 * R3 U2 - the Optimize card's body (board V1: "WHAT OPTIMIZE FOUND IN YOUR PLAN").
 *
 * Reads the SAME data the old page's lead reads - `useOptimizerLeadData` (findings + the server's fee quote) and the
 * app's own `optimizeCtaLabel` / `findingBadge` - so no number or finding is invented here, and no fee literal exists in
 * this file. Board look only: purple-tinted card, findings bullets, the sentence, then the two buttons.
 *
 * Every string below is a DRAFT for Leon: the sentence and the expert button.
 */
import { Link } from "wouter";
import { useOptimizerLeadData } from "@/components/plan/use-optimizer-lead-data";
import { useSignupMode } from "@/lib/signup-mode";
import { findingBadge, optimizeCtaLabel } from "@/components/plan/OptimizerLead";
import { BOARD_BORDER, BOARD_CTA, BOARD_FILL, BOARD_INK, BOARD_SLATE, BOARD_TEXT } from "@/components/r3/tokens";

const OPTIMIZE_SENTENCE =
  "Optimize fills these, checks real travel times and builds three versions to compare. Your pinned stops stay where they are.";
const EXPERT_CTA = "Get help from a local expert";
/** U2 (Leon, Nov 23 2026): with nothing to report, the card keeps both buttons and says what Optimize does. DRAFT. */
const OPTIMIZE_EMPTY_LINE =
  "Optimize checks real travel times and builds three versions to compare. Your pinned stops stay where they are.";

export function OptimizeCard({ tripId, enabled, isOwner }: { tripId: string; enabled: boolean; isOwner: boolean }) {
  // V22 note 6 (Leon, Nov 24 2026): the whole card is hidden for anyone who is not the owner, and in waitlist mode.
  // The mode is the ONE the app already reads for priced controls (`useSignupMode`, `lib/signup-mode.ts`).
  const { mode } = useSignupMode();
  const waitlist = mode === "waitlist";
  const { findings, fee } = useOptimizerLeadData(tripId, enabled && isOwner && !waitlist);
  const shown = (findings ?? []).slice(0, 3);
  if (!isOwner || waitlist) return null;

  return (
    <section
      className="mt-4 rounded-xl border p-4"
      style={{ backgroundColor: BOARD_FILL, borderColor: BOARD_BORDER }}
      data-testid="r3-optimize-card"
    >
      {shown.length ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD_TEXT }}>
          What Optimize found in your plan
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          {shown.length ? (
            <ul className="list-disc space-y-1 pl-4" data-testid="r3-optimize-findings">
              {shown.map((f, i) => {
                const { badge, rest } = findingBadge(f);
                return (
                  <li key={i} className="text-[13px] leading-snug" style={{ color: BOARD_INK }} data-testid="r3-optimize-finding">
                    {badge ? <span className="font-semibold">{badge} </span> : null}
                    {rest}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="mt-2 text-[12px]" style={{ color: BOARD_SLATE }} data-testid="r3-optimize-sentence">
            {shown.length ? OPTIMIZE_SENTENCE : OPTIMIZE_EMPTY_LINE}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/itinerary-comparison/${tripId}`}
            className="h-11 rounded-lg px-4 text-[13px] font-semibold leading-[44px] text-white"
            style={{ backgroundColor: BOARD_CTA }}
            data-testid="r3-optimize-cta"
          >
            {optimizeCtaLabel(fee)}
          </Link>
          <Link
            href="/experts"
            className="h-11 rounded-lg border bg-card px-4 text-[13px] font-medium leading-[44px]"
            style={{ borderColor: BOARD_BORDER, color: BOARD_INK }}
            data-testid="r3-optimize-expert"
          >
            {EXPERT_CTA}
          </Link>
        </div>
      </div>
    </section>
  );
}
