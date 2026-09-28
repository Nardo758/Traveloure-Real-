/**
 * THE shared page layout for every public page the footer links to (footer-pages ruling, Sep 28,
 * 2026 — ledger `2026-09-28-footer-pages-one-layout`). It began as the editorial layout for
 * /about, /press, /careers and /help (Lane B) and now carries the whole site grammar, so a page
 * states its content and never its own chrome:
 *
 *   - GROUND: the cream token (`--earn-ground`), never white and never a grey.
 *   - WIDTH: exactly two, both tokens — `content` (--page-content, 1280) and `reading`
 *     (--page-reading, ~720). A page picks one; none sets its own max-width.
 *   - TYPE: page H1 is Fraunces 42 (34 on phones), navy; a section H2 is Fraunces 26. The 54 hero
 *     scale belongs to the landing page alone. Eyebrows are Geist Mono caps in coral.
 *   - ACTIONS: primary = coral filled, secondary = navy outline, same radius and height; text
 *     links are navy with a coral hover. Pass `PAGE_ACTION.*` / `PAGE_LINK` as a className.
 *
 * The shared header and footer come from `Layout` (client/src/components/layout.tsx), which every
 * footer route mounts; this component is what goes inside it.
 */
import type { ReactNode } from "react";

export const FRAUNCES = "'Fraunces', Georgia, serif";
export const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export type PageWidth = "content" | "reading";

/** The one horizontal container: a width token plus the site gutters. */
export function pageContainerClass(width: PageWidth): string {
  return `mx-auto w-full ${width === "content" ? "max-w-content" : "max-w-reading"} px-4 sm:px-6 lg:px-8`;
}

/** Page H1 — Fraunces 42 (34 on phones), navy. */
export const PAGE_H1_CLASS = "text-[34px] font-semibold leading-tight sm:text-[42px]";
/** Section H2 — Fraunces 26, navy. */
export const PAGE_H2_CLASS = "text-[26px] font-semibold leading-snug";
export const HEADING_STYLE = { fontFamily: FRAUNCES, color: "var(--earn-navy)" } as const;
export const EYEBROW_CLASS = "text-[10.5px] font-medium uppercase tracking-[0.12em]";
export const EYEBROW_STYLE = { fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" } as const;

/**
 * Action and link classes. Applied through `className` on `<Button>` / `<Link>`; tailwind-merge
 * lets these win over the primitive's own radius and height.
 */
export const PAGE_ACTION = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-transparent bg-[color:var(--earn-coral-ink)] px-5 text-[15px] font-semibold text-white hover:opacity-90",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[color:var(--earn-navy)] bg-transparent px-5 text-[15px] font-semibold text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-chip)]",
} as const;
export const PAGE_LINK =
  "font-medium text-[color:var(--earn-navy)] underline underline-offset-2 hover:text-[color:var(--earn-coral-ink)]";

export function PageEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className={`mb-3 ${EYEBROW_CLASS}`} style={EYEBROW_STYLE}>
      {children}
    </p>
  );
}

export function PageTitle({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <h1 className={PAGE_H1_CLASS} style={HEADING_STYLE} data-testid={testId}>
      {children}
    </h1>
  );
}

export function SectionTitle({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <h2 className={`${PAGE_H2_CLASS} ${className}`} style={HEADING_STYLE} data-testid={testId}>
      {children}
    </h2>
  );
}

/**
 * A full page: cream ground, one width token, the page header (eyebrow, H1, lead, actions), then
 * the body. `header={false}` is for a page whose H1 is rendered by a shared masthead it already
 * owns (the marketplace surfaces), so the width and ground still come from here.
 */
export function PageLayout({
  eyebrow,
  title,
  lead,
  actions,
  width = "content",
  children,
  testId,
  titleTestId,
  headerSlot,
}: {
  eyebrow?: string;
  title?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  width?: PageWidth;
  children?: ReactNode;
  testId?: string;
  titleTestId?: string;
  /** Replaces the default header block (for a page with its own masthead component). */
  headerSlot?: ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--earn-ground)" }}
      data-testid={testId}
      data-page-layout={width}
    >
      <div className={`${pageContainerClass(width)} pb-20 pt-12 sm:pt-14`}>
        {headerSlot ??
          (title !== undefined && (
            <div data-page-header>
              {eyebrow && <PageEyebrow>{eyebrow}</PageEyebrow>}
              <PageTitle testId={titleTestId}>{title}</PageTitle>
              {lead && (
                <div className="mt-5 max-w-reading text-[17px] leading-relaxed" style={{ color: "var(--earn-ink)" }}>
                  {lead}
                </div>
              )}
              {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
            </div>
          ))}
        <div className={title !== undefined || headerSlot ? "mt-10 space-y-12" : "space-y-12"}>{children}</div>
      </div>
    </div>
  );
}

/** A titled body section: Fraunces 26 H2, ink body. */
export function PageSection({
  title,
  children,
  testId,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section data-testid={testId} className={className}>
      {title !== undefined && <SectionTitle className="mb-4">{title}</SectionTitle>}
      <div className="space-y-3 text-[15.5px] leading-relaxed" style={{ color: "var(--earn-ink)" }}>
        {children}
      </div>
    </section>
  );
}

/** The company and help pages: the reading width. Kept as names so their call sites stay short. */
export function CompanyPage(props: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return <PageLayout {...props} width="reading" />;
}

export function CompanySection({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <PageSection title={title} testId={testId}>
      {children}
    </PageSection>
  );
}
