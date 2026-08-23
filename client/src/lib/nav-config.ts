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
  sections?: NavSectionConfig[];
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
    // Naming facts this encodes:
    //  - "Services", NOT "Service Providers". `provider_services` is role-agnostic
    //    (CLAUDE.md "one builder" — ServiceForm serves both roles), so EXPERTS list
    //    services in that tab too. Naming it after one role was wrong about who sells there.
    //  - Canonical tab vocabulary (decision-maker ratified Aug 23): the four tabs are
    //    NOUNS naming what each surface IS — "Destinations · Ready-Made Trips · Events ·
    //    Services" — used identically on the tab, in nav, and in the footer (no aliases
    //    like "By Date"/"Global Calendar" or "By Location"/"TravelPulse"). This supersedes
    //    the earlier MP-1 "By Location / By Date" paired-axis phrasing. The `?tab=` tokens
    //    stay the URL contract (§10) and never change with the labels.
    name: "Marketplace",
    i18nKey: "groups.marketplace",
    sections: [
      {
        title: "BROWSE",
        i18nKey: "sections.browse",
        items: [
          { name: "Destinations", i18nKey: "links.byLocation", href: "/discover", description: "Explore destinations & trending cities" },
          { name: "Events", i18nKey: "links.byDate", href: "/discover?tab=events", description: "Upcoming events & activities" },
          { name: "Ready-Made Trips", i18nKey: "links.readyMadeTrips", href: "/discover?tab=packages", description: "Expert-built trips, ready to buy" },
          { name: "Services", i18nKey: "links.browseServices", href: "/discover?tab=services", description: "Book tours, photography, transport & more" },
        ],
      },
    ],
  },
  {
    name: "Experts & Services",
    i18nKey: "groups.expertsAndServices",
    sections: [
      {
        title: "FIND HELP",
        i18nKey: "sections.findHelp",
        items: [
          { name: "Local Experts", i18nKey: "links.localExperts", href: "/experts?role=local_expert", description: "City guides & neighbourhood specialists" },
          { name: "Trip Planners", i18nKey: "links.tripPlanners", href: "/experts?role=travel_expert", description: "Trip planners who handle every detail" },
        ],
      },
    ],
  },
  {
    name: "Experiences",
    i18nKey: "groups.experiences",
    sections: [
      {
        title: "TRAVEL & GETAWAYS",
        i18nKey: "sections.travelAndGetaways",
        items: [
          { name: "Travel Planning", i18nKey: "links.travelPlanning", href: "/experiences/travel", description: "Plan your perfect trip" },
          { name: "Romantic Getaways", i18nKey: "links.romanticGetaways", href: "/experiences/romance", description: "Special romantic escapes" },
          { name: "Date Night", i18nKey: "links.dateNight", href: "/experiences/date-night", description: "Perfect evening plans" },
          { name: "Retreats", i18nKey: "links.retreats", href: "/experiences/retreats", description: "Relaxation & wellness" },
        ],
      },
      {
        title: "CELEBRATIONS",
        i18nKey: "sections.celebrations",
        items: [
          { name: "Birthday Party", i18nKey: "links.birthdayParty", href: "/experiences/birthday", description: "Unforgettable celebrations" },
        ],
      },
      {
        title: "LIFE MILESTONES",
        i18nKey: "sections.lifeMilestones",
        items: [
          { name: "Wedding", i18nKey: "links.wedding", href: "/experiences/wedding", description: "Dream wedding planning" },
          { name: "Proposal", i18nKey: "links.proposal", href: "/experiences/proposal", description: "Perfect proposal moment" },
          { name: "Engagement Party", i18nKey: "links.engagementParty", href: "/experiences/engagement-party", description: "Celebrate your love" },
          { name: "Baby Shower", i18nKey: "links.babyShower", href: "/experiences/baby-shower", description: "Welcome the new arrival" },
          { name: "Anniversary", i18nKey: "links.anniversary", href: "/experiences/wedding-anniversaries", description: "Celebrate your journey" },
        ],
      },
      {
        title: "GROUP EVENTS",
        i18nKey: "sections.groupEvents",
        items: [
          { name: "Corporate Events", i18nKey: "links.corporateEvents", href: "/experiences/corporate-events", description: "Team events & meetings" },
          { name: "Corporate Retreats", i18nKey: "links.corporateRetreats", href: "/experiences/corporate", description: "Team building retreats" },
          { name: "Boys Trip", i18nKey: "links.boysTrip", href: "/experiences/boys-trip", description: "Epic adventures" },
          { name: "Girls Trip", i18nKey: "links.girlsTrip", href: "/experiences/girls-trip", description: "Getaways with friends" },
          { name: "Reunions", i18nKey: "links.reunions", href: "/experiences/reunions", description: "Reconnect & celebrate" },
        ],
      },
    ],
  },
  {
    name: "Planning Tools",
    i18nKey: "groups.planningTools",
    sections: [
      {
        title: "TOOLS",
        i18nKey: "sections.tools",
        items: [
          { name: "AI Plan Planner", i18nKey: "links.aiPlanPlanner", href: "/ai-assistant", description: "Instant AI-powered itineraries", requiresAuth: true },
          { name: "Visa Help", i18nKey: "links.visaHelp", href: "/visa-help", description: "Visa requirements & expert help" },
        ],
      },
      {
        title: "EXPLORE",
        i18nKey: "sections.explore",
        items: [
          { name: "Live Intel", i18nKey: "links.liveIntel", href: "/discover", description: "Real-time local insights" },
          { name: "Today's Deals", i18nKey: "links.todaysDeals", href: "/deals", description: "Special offers & discounts" },
        ],
      },
    ],
  },
  { name: "Ways to Earn", i18nKey: "groups.waysToEarn", href: "/earn" },
];

export const authNavConfig: AuthNavConfig[] = [
  { href: "/dashboard", label: "My Plans" },
  // MP-1: label only — the route stays /discover (URL contract unchanged).
  { href: "/discover", label: "Marketplace" },
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

export interface FooterLinkConfig {
  label: string;
  /** Ruling 60 Phase A — see the NavLeafConfig note above; `label` remains the fallback. */
  i18nKey?: string;
  href: string;
}

export interface FooterSectionConfig {
  title: string;
  i18nKey?: string;
  links: FooterLinkConfig[];
}

export const footerSectionsConfig: FooterSectionConfig[] = [
  {
    title: 'Product',
    i18nKey: 'footer.sections.product',
    links: [
      { label: 'Plan an Experience', i18nKey: 'footer.links.planAnExperience',     href: '/experiences' },
      { label: 'Marketplace', i18nKey: 'footer.links.marketplace',            href: '/discover' },
      { label: 'Talk to Experts', i18nKey: 'footer.links.talkToExperts',        href: '/chat' },
      { label: 'How It Works', i18nKey: 'footer.links.howItWorks',           href: '/how-it-works' },
      { label: 'Pricing', i18nKey: 'footer.links.pricing',                href: '/pricing' },
      { label: 'Features', i18nKey: 'footer.links.features',               href: '/features' },
      { label: 'Events', i18nKey: 'footer.links.globalCalendar',        href: '/discover?tab=events' },
      { label: 'Executive Assistant', i18nKey: 'footer.links.executiveAssistant',    href: '/executive-assistant' },
    ],
  },
  {
    title: 'Company',
    i18nKey: 'footer.sections.company',
    links: [
      { label: 'About Us', i18nKey: 'footer.links.aboutUs',       href: '/about' },
      { label: 'Ways to Earn', i18nKey: 'footer.links.waysToEarn',   href: '/earn' },
      { label: 'Careers', i18nKey: 'footer.links.careers',        href: '/careers' },
      { label: 'Blog', i18nKey: 'footer.links.blog',           href: '/blog' },
      { label: 'Press', i18nKey: 'footer.links.press',          href: '/press' },
    ],
  },
  {
    title: 'Support',
    i18nKey: 'footer.sections.support',
    links: [
      { label: 'Help Center', i18nKey: 'footer.links.helpCenter',       href: '/help' },
      { label: 'Contact Us', i18nKey: 'footer.links.contactUs',        href: '/contact' },
      { label: 'Visa Help', i18nKey: 'footer.links.visaHelp',         href: '/visa-help' },
      { label: 'Privacy Policy', i18nKey: 'footer.links.privacyPolicy',    href: '/privacy' },
      { label: 'Terms of Service', i18nKey: 'footer.links.termsOfService',  href: '/terms' },
      { label: 'FAQ', i18nKey: 'footer.links.faq',               href: '/faq' },
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
      seen.add(link.href);
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
