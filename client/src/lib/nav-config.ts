/**
 * nav-config.ts — pure nav data, no React or icon deps.
 *
 * Single source of truth for every href that appears in the navbar.
 * Imported by:
 *   - client/src/components/layout.tsx  (adds icons and renders the UI)
 *   - playwright/tests/navbar-links.spec.ts  (smoke-tests every route)
 *
 * Adding or renaming a link here automatically propagates to the smoke
 * test on the next PR, so broken routes are caught in CI before they
 * reach production.
 */

import type { PlanningSource } from "@/contexts/PlanningContext";
import { OCCASION_GROUP_LABELS, OCCASION_GROUP_ORDER } from "@shared/experience-group";

/**
 * Ruling 60 Phase A (chrome i18n): every label-bearing entry gains an OPTIONAL `i18nKey` into
 * the `nav` namespace, and keeps its English `name`/`title`/`label` verbatim. The English
 * string stays load-bearing for three reasons and must not be replaced by the key:
 *   1. it is the render fallback when a key has no translation (never a raw "nav.x" key);
 *   2. layout.tsx derives `data-testid` values from it (`link-mobile-${child.name...}`), and
 *      Playwright selects on those — translating in place would rename them;
 *   3. it is the React `key` for these lists.
 * An entry with no `i18nKey` renders English in every locale — deliberate, and the documented
 * migration path for anything added later.
 */
export interface NavLeafConfig {
  name: string;
  i18nKey?: string;
  href: string;
  description?: string;
  descriptionI18nKey?: string;
  requiresAuth?: boolean;
  featured?: NavLeafFeaturedConfig;
}

/**
 * A FEATURED leaf carries a second, non-navigational affordance beside its link: the row still
 * goes where it always went, and the affordance opens THE single planning entry
 * (`usePlanning().open`, ruling `2026-08-28-single-planning-entry`) with the source below.
 *
 * IT IS A DATA FLAG, NOT A PER-OCCASION BRANCH. `layout.tsx` renders whatever leaf carries this
 * key, generically — there is no `if (name === "Wedding")` anywhere. Locked Decision 28 is the
 * reason the shape matters: an occasion's behaviour lives on its own `experience_types` row's
 * switch columns, never in the menu, so the menu may say "this row is featured" and may hand the
 * chooser an occasion identity, but must not grow a behaviour switch of its own.
 *
 * `source` is typed against `PlanningSource` through a TYPE-ONLY import, which is erased at
 * compile time — this module stays pure data with no React or runtime dependency, as its header
 * says, while still being unable to drift from the opener's contract.
 */
export interface NavLeafFeaturedConfig {
  /**
   * Optional label override. Omitted by the one leaf that uses this today, on purpose:
   * `layout.tsx` falls back to the shared `START_PLAN_LABEL`, so the nav cannot drift into a
   * second spelling of "Start a plan" (the drift `2026-09-04-entry-unification` closed one
   * level down).
   */
  cta?: string;
  /** Context the DOOR already answers. Never a guess — an absent field means "not known" (§13). */
  source: PlanningSource;
}

export interface NavSectionConfig {
  title: string;
  i18nKey?: string;
  items: NavLeafConfig[];
}

export interface NavGroupConfig {
  name: string;
  i18nKey?: string;
  href?: string;
  /**
   * R2 (cosmetic-public-surfaces dispatch, A2): the header row is over budget at every
   * desktop width up to 1440px with the full group name, even with `nowrap` — three trigger
   * labels wrap to two lines and their chevrons detach. An OPTIONAL short form for the
   * TOP-LEVEL TRIGGER TEXT ONLY: the dropdown's own section headings and the mobile menu's
   * group heading keep rendering `name`/`i18nKey` untouched (layout.tsx reads `shortName` only
   * at the desktop trigger's two render sites), so shortening here never shortens those.
   */
  shortName?: string;
  shortI18nKey?: string;
  sections?: NavSectionConfig[];
  /**
   * A group-level FOOTER leaf, rendered once beneath the dropdown's sections (ledger
   * `2026-09-04-reaudit-fixes`; ratified `docs/design/wedding-flow/NavTuned.dc.html`).
   *
   * It is a DATA SLOT, not a per-group branch: `layout.tsx` renders whatever group carries this
   * key, generically, so a second group gaining one is a one-line data change. It is deliberately
   * NOT a section with one item — a section would grow a column heading in the 4-up mega layout
   * and read as a fifth category, which is exactly what "browse all of them" is not.
   *
   * Its href is counted by `getAllNavHrefs`, so the navbar-links gate smoke-tests it like every
   * other nav link.
   */
  footer?: NavLeafConfig;
}

export interface AuthNavConfig {
  href: string;
  label: string;
}

export const navGroupsConfig: NavGroupConfig[] = [
  {
    // MP-1 (Jul 30, 2026): this group lists ALL FOUR /discover tabs. It previously
    // listed only two — "Ready Made Trips" had NO nav entry anywhere on the site
    // (the entire expert store lane was nav-invisible), and the services tab was
    // filed under "Experts & Services" as "Service Providers".
    //
    // Marketplace un-group (decision-maker ratified Aug 23, ledger
    // 2026-08-23-marketplace-ungroup): "Marketplace" is DROPDOWN-ONLY (no href on the
    // group, no hub page) and each item deep-links straight to that surface's OWN page —
    // no tabbed shell, no grouped header, no extra step. Old /discover?tab= links are
    // mapped by the App.tsx DiscoverRedirect.
    // Naming facts this encodes:
    //  - "Services", NOT "Service Providers". `provider_services` is role-agnostic
    //    (CLAUDE.md "one builder" — ServiceForm serves both roles), so EXPERTS list
    //    services there too. Naming it after one role was wrong about who sells there.
    //  - Canonical noun vocabulary (ratified Aug 23): "Destinations · Ready-Made Trips ·
    //    Events · Services" — used identically in nav, footer, and page mastheads (no
    //    aliases like "By Date"/"Global Calendar" or "By Location"/"TravelPulse").
    name: "Marketplace",
    i18nKey: "groups.marketplace",
    sections: [
      {
        title: "BROWSE",
        i18nKey: "sections.browse",
        items: [
          { name: "Destinations", i18nKey: "links.byLocation", href: "/destinations", description: "Explore destinations & trending cities" },
          { name: "Events", i18nKey: "links.byDate", href: "/events", description: "Upcoming events & activities" },
          { name: "Ready-Made Trips", i18nKey: "links.readyMadeTrips", href: "/ready-made", description: "Expert-built trips, ready to buy" },
          { name: "Services", i18nKey: "links.browseServices", href: "/services", description: "Book tours, photography, transport & more" },
        ],
      },
    ],
  },
  {
    name: "Experts & Services",
    i18nKey: "groups.expertsAndServices",
    shortName: "Experts",
    shortI18nKey: "groups.expertsAndServicesShort",
    sections: [
      {
        title: "FIND HELP",
        i18nKey: "sections.findHelp",
        items: [
          { name: "Service Providers", i18nKey: "links.serviceProviders", href: "/providers", description: "Browse local businesses & book direct" },
          { name: "Local Experts", i18nKey: "links.localExperts", href: "/experts?role=local_expert", description: "City guides & neighbourhood specialists" },
          { name: "Trip Planners", i18nKey: "links.tripPlanners", href: "/experts?role=travel_expert", description: "Trip planners who handle every detail" },
          { name: "Event Planners", i18nKey: "links.eventPlanners", href: "/experts?role=event_planner", description: "Weddings, corporate events & celebrations" },
        ],
      },
    ],
  },
  {
    name: "Experiences",
    i18nKey: "groups.experiences",
    sections: [
      // ── THE FIVE GROUPS, FROM THE ONE SOURCE (ledger `2026-10-07-nav-experience-groups`) ──
      // The menu lists the occasion GROUPS the start page's picker shows, in its order and with its
      // labels (`OCCASION_GROUP_ORDER` / `OCCASION_GROUP_LABELS`, `shared/experience-group.ts`) —
      // never a copy here. Each opens `/experiences?group=<key>`, which pre-picks that group's tab
      // (exact key only). The key is an address and is never rendered (R127); the label is.
      // This replaces the curated per-occasion lists (and the Wedding row's featured planning door),
      // which the start page's picker now carries.
      {
        title: "WHAT ARE YOU PLANNING?",
        items: OCCASION_GROUP_ORDER.map((key) => ({
          name: OCCASION_GROUP_LABELS[key],
          href: `/experiences?group=${key}`,
        })),
      },
    ],
    // The artboard's dropdown footer. The groups above open the start page on a group's tab; this
    // is the way straight to every occasion. The target is `/experiences/travel`, the SAME href the landing
    // Moments section's "All occasions →" already uses (`moments-section.tsx`), so the two doors
    // to "everything" cannot drift apart (§18 rule 1).
    footer: {
      name: "Browse all occasions",
      i18nKey: "links.browseAllOccasions",
      href: "/experiences/travel",
    },
  },
  {
    name: "Planning Tools",
    i18nKey: "groups.planningTools",
    shortName: "Tools",
    shortI18nKey: "groups.planningToolsShort",
    sections: [
      {
        title: "TOOLS",
        i18nKey: "sections.tools",
        items: [
          { name: "AI Planner", i18nKey: "links.aiPlanPlanner", href: "/ai-assistant", description: "Instant AI-powered itineraries", requiresAuth: true },
          { name: "Visa Help", i18nKey: "links.visaHelp", href: "/visa-help", description: "Visa requirements & expert help" },
        ],
      },
      {
        title: "EXPLORE",
        i18nKey: "sections.explore",
        items: [
          // "Live Intel" was merged into the Destinations surface (decision-maker Aug 23),
          // so a separate entry just duplicated it — removed per the no-aliases rule
          // (ledger 2026-08-23-marketplace-ungroup). `links.liveIntel` locale key kept
          // (unused) so en/ja parity is untouched.
          { name: "Today's Deals", i18nKey: "links.todaysDeals", href: "/deals", description: "Special offers & discounts" },
        ],
      },
    ],
  },
  { name: "Ways to Earn", i18nKey: "groups.waysToEarn", href: "/earn" },
  // 2026-08-26: plain main-nav leaf beside Ways to Earn per the ratified pricing map
  // (ledger 2026-08-27-pricing-nav, corrected same day) — not the utility cluster.
  { name: "Pricing", i18nKey: "groups.pricing", href: "/pricing" },
];

export const authNavConfig: AuthNavConfig[] = [
  { href: "/dashboard", label: "My Plans" },
  // Un-group (Aug 23): "Marketplace" is dropdown-only; this flat entry (currently
  // rendered nowhere — authNavItems has no render site) points at the default
  // surface so it can never resurrect a hub.
  { href: "/destinations", label: "Marketplace" },
  { href: "/concierge", label: "Concierge" },
  { href: "/chat", label: "Expert Chat" },
];

/**
 * footer-config.ts (inline) — single source of truth for every href that
 * appears in the site footer (layout.tsx).
 *
 * Imported by:
 *   - client/src/components/layout.tsx  (renders the UI)
 *   - playwright/tests/footer-links.spec.ts  (smoke-tests every route)
 *
 * Adding or renaming a link here automatically propagates to the smoke
 * test on the next PR, so broken routes are caught in CI before they
 * reach production.
 */

/**
 * A footer entry is EITHER a route link (`href`) OR an in-page action (`action`), never both.
 *
 * `action: "startPlan"` opens the ONE planning modal through `usePlanning().open()` — the
 * same opener the landing hero's "Plan my trip" calls (ruling 2026-08-28-single-planning-entry,
 * Locked Decision 33). It has no URL on purpose: the chooser is not a page, and a second
 * route standing in for it would be the second front door ruling 33 / LD 42 D14 retired.
 * An action entry carries no href, so it is outside every href smoke gate by construction.
 */
export type FooterLinkConfig = {
  label: string;
  /** Ruling 60 Phase A — see the NavLeafConfig note above; `label` remains the fallback. */
  i18nKey?: string;
} & (
  | { href: string; action?: never }
  | { action: "startPlan"; href?: never }
);

export interface FooterSectionConfig {
  title: string;
  i18nKey?: string;
  links: FooterLinkConfig[];
}

/*
 * Footer IA (decision-maker, Sep 2026 — footer and closing-section lane).
 *
 * REMOVED, deliberately: `/chat` (a signed-in inbox — a guest clicking it was bounced to "/"
 * behind a sign-in modal) and `/executive-assistant`. `footer-guest-routes.test.ts` refuses a
 * footer href whose route is wrapped in `ProtectedRoute`, so neither can drift back.
 *
 * BLOG IS HIDDEN, NOT DELETED: the footer shows no Blog link until five posts are published.
 * The `/blog` route stays (inbound links keep resolving) and its empty state is `noindex`.
 * There is no post store yet, so there is no count to read — when one exists, the link returns
 * behind that count, never a hand-flipped flag.
 */
export const footerSectionsConfig: FooterSectionConfig[] = [
  {
    title: 'Plan',
    i18nKey: 'footer.sections.plan',
    links: [
      // Same target as the hero CTA: the planning modal, occasion step first.
      { label: 'Start a plan', i18nKey: 'footer.links.startAPlan', action: 'startPlan' },
      { label: 'Occasions', i18nKey: 'footer.links.occasions',       href: '/experiences' },
      { label: 'Destinations', i18nKey: 'footer.links.destinations', href: '/destinations' },
      { label: 'How it works', i18nKey: 'footer.links.howItWorks',   href: '/how-it-works' },
      { label: 'Pricing', i18nKey: 'footer.links.pricing',           href: '/pricing' },
    ],
  },
  {
    title: 'Locals',
    i18nKey: 'footer.sections.locals',
    links: [
      { label: 'Meet the locals', i18nKey: 'footer.links.meetTheLocals',             href: '/experts' },
      { label: 'Local businesses', i18nKey: 'footer.links.localBusinesses',          href: '/providers' },
      { label: 'Become a local expert', i18nKey: 'footer.links.becomeALocalExpert',  href: '/earn?role=local_expert' },
      { label: 'Trip planners', i18nKey: 'footer.links.tripPlanners',                href: '/earn?role=trip_planner' },
      { label: 'Event planners', i18nKey: 'footer.links.eventPlanners',              href: '/earn?role=event_planner' },
      { label: 'Service providers', i18nKey: 'footer.links.serviceProviders',        href: '/earn?role=service_provider' },
    ],
  },
  {
    title: 'Company',
    i18nKey: 'footer.sections.company',
    links: [
      { label: 'About', i18nKey: 'footer.links.about',     href: '/about' },
      { label: 'Press', i18nKey: 'footer.links.press',     href: '/press' },
      { label: 'Careers', i18nKey: 'footer.links.careers', href: '/careers' },
    ],
  },
  {
    title: 'Support',
    i18nKey: 'footer.sections.support',
    links: [
      { label: 'Help center', i18nKey: 'footer.links.helpCenter', href: '/help' },
      // No FAQ link: /faq redirects to /help, and two links to one page is one too many (Lane B).
      { label: 'Contact', i18nKey: 'footer.links.contact',        href: '/contact' },
      { label: 'Visa help', i18nKey: 'footer.links.visaHelp',     href: '/visa-help' },
      { label: 'Privacy', i18nKey: 'footer.links.privacy',        href: '/privacy' },
      { label: 'Terms', i18nKey: 'footer.links.terms',            href: '/terms' },
    ],
  },
];

/**
 * Returns a de-duplicated array of every href referenced in the footer.
 * Auth-gated hrefs are included — they redirect to "/" rather than 404ing,
 * so the smoke test still passes for them.
 */
export function getAllFooterHrefs(): string[] {
  const seen = new Set<string>();
  for (const section of footerSectionsConfig) {
    for (const link of section.links) {
      // An action entry (the planning modal) has no URL to smoke-test.
      if (link.href) seen.add(link.href);
    }
  }
  return Array.from(seen);
}

/**
 * Returns a de-duplicated array of every href referenced in the navbar.
 * Auth-gated hrefs are included — they redirect to "/" rather than 404ing,
 * so the smoke test still passes for them.
 */
export function getAllNavHrefs(): string[] {
  const seen = new Set<string>();
  for (const group of navGroupsConfig) {
    if (group.href) seen.add(group.href);
    for (const section of group.sections ?? []) {
      for (const item of section.items) {
        seen.add(item.href);
      }
    }
    // The group-level footer leaf is a nav link like any other, so both link gates smoke-test it.
    if (group.footer) seen.add(group.footer.href);
  }
  for (const item of authNavConfig) {
    seen.add(item.href);
  }
  return Array.from(seen);
}

/**
 * Returns a de-duplicated union of every href that appears in EITHER the
 * navbar OR the footer.
 *
 * Both CI smoke-test gates (navbar-links-gate.yml and footer-links-gate.yml)
 * import this function so that a stale link in *either* config causes *both*
 * gates to fail.  Concretely:
 *
 *   - Route /foo is in App.tsx, navGroupsConfig, and footerSectionsConfig.
 *   - Developer removes /foo from App.tsx and from navGroupsConfig only.
 *   - getAllHrefs() still contains /foo (pulled from footerSectionsConfig).
 *   - Both navbar-links and footer-links gate runs attempt /foo → 404 → fail.
 *
 * This makes it impossible for a removed route to slip past only one gate.
 */
export function getAllHrefs(): string[] {
  const seen = new Set<string>([...getAllNavHrefs(), ...getAllFooterHrefs()]);
  return Array.from(seen);
}

/**
 * Which header group the current page belongs to, so a page reached through a DROPDOWN lights up
 * its parent item the way a top-level link already does (footer-pages ruling, Sep 28, 2026 —
 * the header used to highlight only the top-level links, so Destinations, Local Experts, Service
 * Providers and Visa Help highlighted nothing).
 *
 * A page belongs to a group when its path equals one of the group's links (query string ignored),
 * or is the parent path of one (`/experiences` for `/experiences/wedding`). The first group in
 * header order wins, so one page never lights two items. Returns null for a page no group names.
 */
export function activeNavGroupName(location: string, groups: NavGroupConfig[] = navGroupsConfig): string | null {
  const path = location.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return null;
  for (const group of groups) {
    const hrefs = [
      ...(group.href ? [group.href] : []),
      ...(group.sections ?? []).flatMap((s) => s.items.map((i) => i.href)),
      ...(group.footer ? [group.footer.href] : []),
    ].map((h) => h.split("?")[0].split("#")[0].replace(/\/+$/, ""));
    if (hrefs.some((h) => h === path || h.startsWith(path + "/"))) return group.name;
  }
  return null;
}
