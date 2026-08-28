/**
 * section-header.tsx — the mock's `.h-row` (eyebrow + Fraunces h3 + optional right link),
 * shared by every landing section (landing-build lane). Eyebrows are coral TEXT per the
 * mock; the ruled coral BUTTON count (3) is unaffected by them.
 */
import { Link } from "wouter";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function SectionHeader({
  eyebrow,
  title,
  link,
  rightNote,
}: {
  eyebrow: string;
  title: string;
  link?: { label: string; href: string; testId?: string };
  rightNote?: string;
}) {
  return (
    <div className="mb-[18px] flex items-baseline justify-between gap-4">
      <div>
        <span
          className="text-[10.5px] font-medium uppercase tracking-[0.12em]"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" }}
        >
          {eyebrow}
        </span>
        <h3
          className="mt-1 text-[22px] font-semibold sm:text-[26px]"
          style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
        >
          {title}
        </h3>
      </div>
      {link && (
        <Link
          href={link.href}
          className="whitespace-nowrap text-[13px] font-semibold"
          style={{ color: "var(--earn-coral-ink)" }}
          data-testid={link.testId}
        >
          {link.label}
        </Link>
      )}
      {rightNote && (
        <span className="text-[11px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
          {rightNote}
        </span>
      )}
    </div>
  );
}

/** The mock's `.osec` open-section wrapper: hairline top border, no card chrome. */
export function OpenSection({
  children,
  first,
  testId,
}: {
  children: React.ReactNode;
  first?: boolean;
  testId?: string;
}) {
  return (
    <section
      className="w-full px-4"
      style={{ background: "var(--earn-ground, #FAFAF8)" }}
      data-testid={testId}
    >
      <div
        className="mx-auto max-w-[1180px] pb-2 pt-[34px]"
        style={first ? undefined : { borderTop: "1px solid var(--earn-border, #E4E4DE)" }}
      >
        {children}
      </div>
    </section>
  );
}
