/**
 * how-it-works.tsx — the one-line "How it works" strip directly under the hero (landing
 * reorder, ledger `2026-09-28-landing-reorder`).
 *
 * It names the four steps and links out; the step descriptions live on /how-it-works and
 * every price lives on /pricing, which renders them from fee_bands. The
 * former four-column section, its price rows (Free, pay-per-use, Trip Pass, expert-priced,
 * quote) and the Plus band are removed from the landing page by that ruling — they are not
 * to be re-added here; a missing number is added to /pricing instead.
 */
import { Fragment } from "react";
import { Link } from "wouter";
import { HOW_IT_WORKS_STEPS } from "@/lib/how-it-works-steps";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function HowItWorks() {
  return (
    <section
      className="w-full border-y px-4"
      style={{ background: "var(--earn-ground)", borderColor: "var(--earn-border)" }}
      data-testid="section-how-it-works"
    >
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3 py-5 lg:flex-row lg:items-center lg:gap-6">
        <span
          className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.12em]"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}
        >
          How it works
        </span>
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="how-it-works-steps">
          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <Fragment key={step.n}>
              {i > 0 && (
                <li aria-hidden="true" className="text-[13px]" style={{ color: "var(--earn-faint)" }}>
                  →
                </li>
              )}
              <li className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium" style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}>
                  {step.n}
                </span>
                <span className="text-[15px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
                  {step.title}
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
        <span className="flex shrink-0 gap-4 text-[13px] font-semibold lg:ml-auto">
          <Link href="/how-it-works" className="hover:underline" style={{ color: "var(--earn-teal-ink)" }} data-testid="link-see-how-it-works">
            See how it works →
          </Link>
          <Link href="/pricing" className="hover:underline" style={{ color: "var(--earn-teal-ink)" }} data-testid="link-see-pricing">
            See pricing →
          </Link>
        </span>
      </div>
    </section>
  );
}
