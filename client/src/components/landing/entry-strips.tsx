/**
 * entry-strips.tsx — "Where do you want to begin?" (landing-build Phase 2.4).
 * Visual of record: docs/design/landing-earn-mock.html "ENTRY: open list".
 *
 * The two strips DERIVE from navGroupsConfig (the BROWSE and FIND HELP sections) with
 * icons from the shared NAV_LEAF_ICONS map — the same single source the navbar and the
 * route-coverage gates read, so a route rename can never strand a landing tile (§18
 * rule 1: never restate a server/nav-owned list). Labels/descriptions render verbatim
 * from config.
 */
import { Link } from "wouter";
import { MapPin } from "lucide-react";
import { navGroupsConfig, type NavLeafConfig } from "@/lib/nav-config";
import { NAV_LEAF_ICONS } from "@/components/layout";
import { SectionHeader, OpenSection } from "./section-header";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function sectionItems(sectionTitle: string): NavLeafConfig[] {
  for (const group of navGroupsConfig) {
    for (const section of group.sections ?? []) {
      if (section.title.toUpperCase() === sectionTitle) return section.items;
    }
  }
  return [];
}

function Strip({ label, items, testId }: { label: string; items: NavLeafConfig[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <>
      <div
        className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}
      >
        {label}
      </div>
      {/* Mobile fix (v2.5 Lane 3): at ≤640px the strip is a 2-col grid of COMPACT tiles —
          icon + title only (description sr-only), 44px tap targets, hairline dividers instead
          of cards — so eight entries become four short rows (~half the height) with no
          horizontal scroll. From sm up it reverts to the desktop bordered-card layout with
          descriptions, unchanged. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0 sm:gap-x-7 sm:gap-y-3 lg:grid-cols-4" data-testid={testId}>
        {items.map((item) => {
          const Icon = NAV_LEAF_ICONS[item.name] ?? MapPin;
          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex min-h-[44px] items-center gap-2.5 border-b py-2.5 sm:min-h-0 sm:items-start sm:gap-3 sm:rounded-[12px] sm:border sm:bg-white sm:px-3.5 sm:py-3"
              style={{ borderColor: "var(--earn-border, #E4E4DE)", color: "var(--earn-ink)" }}
              data-testid={`entry-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                style={{ background: "var(--earn-teal-wash)", color: "var(--earn-teal-ink)" }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <b className="block text-[14px]">{item.name}</b>
                <small
                  className="sr-only text-[12px] leading-[1.35] sm:not-sr-only sm:block"
                  style={{ color: "var(--earn-muted)" }}
                >
                  {item.description}
                </small>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function EntryStrips() {
  return (
    <OpenSection testId="section-entry-strips">
      <SectionHeader eyebrow="Start with a direction" title="Where do you want to begin?" />
      <Strip label="Marketplace" items={sectionItems("BROWSE")} testId="entry-strip-marketplace" />
      <div className="mt-[22px]" />
      <Strip label="Find help" items={sectionItems("FIND HELP")} testId="entry-strip-find-help" />
    </OpenSection>
  );
}
