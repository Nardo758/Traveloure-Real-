/**
 * final-cta.tsx — "Ready when you are" (landing-build Phase 2.9).
 * Visual of record: docs/design/landing-earn-mock.html "FINAL".
 *
 * Coral button 3 of the ruled 3. "Plan my trip" calls the SAME preserved handler chain
 * as the hero (setPlanningOpen(true) → EnhancedPlanningModal) via the onPlanTrip prop.
 */
import { Link } from "wouter";
import { Sparkles } from "lucide-react";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function FinalCta({ onPlanTrip }: { onPlanTrip: () => void }) {
  return (
    <section
      className="w-full px-4"
      style={{ background: "var(--earn-ground, #FAFAF8)" }}
      data-testid="section-final-cta"
    >
      <div
        className="mx-auto max-w-[1180px] pb-[30px] pt-12 text-center"
        style={{ borderTop: "1px solid var(--earn-border, #E4E4DE)" }}
      >
        <span
          className="text-[10.5px] font-medium uppercase tracking-[0.12em]"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" }}
        >
          Ready when you are
        </span>
        <h3
          className="mb-1.5 mt-1 text-[28px] font-semibold sm:text-[34px]"
          style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
        >
          Plan the trip a local would take.
        </h3>
        <p className="mb-[18px] text-[14px]" style={{ color: "var(--earn-muted)" }}>
          Start with AI, find a local expert, or browse what's already live.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {/* Coral 3 of 3 (ruled). Same handler as the hero. */}
          <button
            type="button"
            onClick={onPlanTrip}
            className="inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--earn-coral-ink)" }}
            data-testid="button-final-plan-trip"
          >
            <Sparkles className="h-4 w-4" />
            Plan my trip
          </button>
          <Link
            href="/experts"
            className="inline-flex items-center rounded-[8px] border px-3.5 py-2 text-[13px] font-semibold"
            style={{ borderColor: "var(--earn-border, #E4E4DE)", color: "var(--earn-ink)", background: "#fff" }}
            data-testid="button-final-browse-experts"
          >
            Browse local experts
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-[8px] px-3.5 py-2 text-[13px] font-semibold"
            style={{ color: "var(--earn-ink)" }}
            data-testid="button-final-see-pricing"
          >
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
