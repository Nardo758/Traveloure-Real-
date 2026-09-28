/**
 * The shared editorial layout for /about, /press, /careers and /help (Lane B): the site grammar
 * (earn tokens, Fraunces headings, Geist Mono eyebrows — LD 45 (7)) on one narrow reading column.
 */
import type { ReactNode } from "react";

export const FRAUNCES = "'Fraunces', Georgia, serif";
export const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function CompanyPage({
  eyebrow,
  title,
  lead,
  children,
  testId,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--earn-ground, #FAFAF8)" }} data-testid={testId}>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
        {eyebrow && (
          <p
            className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.12em]"
            style={{ fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="text-[34px] font-semibold leading-tight sm:text-[42px]"
          style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
        >
          {title}
        </h1>
        {lead && (
          <div className="mt-5 text-[17px] leading-relaxed" style={{ color: "var(--earn-ink)" }}>
            {lead}
          </div>
        )}
        <div className="mt-10 space-y-10">{children}</div>
      </div>
    </div>
  );
}

export function CompanySection({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h2
        className="mb-3 text-[22px] font-semibold"
        style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-[15.5px] leading-relaxed" style={{ color: "var(--earn-ink)" }}>
        {children}
      </div>
    </section>
  );
}
