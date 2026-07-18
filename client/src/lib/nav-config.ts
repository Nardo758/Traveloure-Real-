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

export interface NavLeafConfig {
  name: string;
  href: string;
  description?: string;
  requiresAuth?: boolean;
}

export interface NavSectionConfig {
  title: string;
  items: NavLeafConfig[];
}

export interface NavGroupConfig {
  name: string;
  href?: string;
  sections?: NavSectionConfig[];
}

export interface AuthNavConfig {
  href: string;
  label: string;
}

export const navGroupsConfig: NavGroupConfig[] = [
  {
    name: "Discover",
    sections: [
      {
        title: "BROWSE",
        items: [
          { name: "By Location", href: "/discover", description: "Explore destinations & trending cities" },
          { name: "By Date", href: "/discover?tab=events", description: "Upcoming events & activities" },
        ],
      },
    ],
  },
  {
    name: "Experts & Services",
    sections: [
      {
        title: "FIND HELP",
        items: [
          { name: "Local Experts", href: "/experts?role=local_expert", description: "City guides & neighbourhood specialists" },
          { name: "Travel Advisors", href: "/experts?role=travel_expert", description: "Trip planners who handle every detail" },
          { name: "Service Providers", href: "/discover?tab=services", description: "Book tours, photography, transport & more" },
        ],
      },
    ],
  },
  {
    name: "Experiences",
    sections: [
      {
        title: "TRAVEL & GETAWAYS",
        items: [
          { name: "Travel Planning", href: "/experiences/travel", description: "Plan your perfect trip" },
          { name: "Romantic Getaways", href: "/experiences/romance", description: "Special romantic escapes" },
          { name: "Date Night", href: "/experiences/date-night", description: "Perfect evening plans" },
          { name: "Retreats", href: "/experiences/retreats", description: "Relaxation & wellness" },
        ],
      },
      {
        title: "CELEBRATIONS",
        items: [
          { name: "Birthday Party", href: "/experiences/birthday", description: "Unforgettable celebrations" },
        ],
      },
      {
        title: "LIFE MILESTONES",
        items: [
          { name: "Wedding", href: "/experiences/wedding", description: "Dream wedding planning" },
          { name: "Proposal", href: "/experiences/proposal", description: "Perfect proposal moment" },
          { name: "Engagement Party", href: "/experiences/engagement-party", description: "Celebrate your love" },
          { name: "Baby Shower", href: "/experiences/baby-shower", description: "Welcome the new arrival" },
          { name: "Anniversary", href: "/experiences/wedding-anniversaries", description: "Celebrate your journey" },
        ],
      },
      {
        title: "GROUP EVENTS",
        items: [
          { name: "Corporate Events", href: "/experiences/corporate-events", description: "Team events & meetings" },
          { name: "Corporate Retreats", href: "/experiences/corporate", description: "Team building retreats" },
          { name: "Boys Trip", href: "/experiences/boys-trip", description: "Epic adventures" },
          { name: "Girls Trip", href: "/experiences/girls-trip", description: "Getaways with friends" },
          { name: "Reunions", href: "/experiences/reunions", description: "Reconnect & celebrate" },
        ],
      },
    ],
  },
  {
    name: "Planning Tools",
    sections: [
      {
        title: "TOOLS",
        items: [
          { name: "AI Plan Planner", href: "/ai-assistant", description: "Instant AI-powered itineraries", requiresAuth: true },
          { name: "Visa Help", href: "/visa-help", description: "Visa requirements & expert help" },
        ],
      },
      {
        title: "EXPLORE",
        items: [
          { name: "Live Intel", href: "/discover", description: "Real-time local insights" },
          { name: "Today's Deals", href: "/deals", description: "Special offers & discounts" },
        ],
      },
    ],
  },
  { name: "Ways to earn", href: "/earn" },
  { name: "Contact", href: "/contact" },
];

export const authNavConfig: AuthNavConfig[] = [
  { href: "/dashboard", label: "My Plans" },
  { href: "/discover", label: "Discover" },
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
  href: string;
}

export interface FooterSectionConfig {
  title: string;
  links: FooterLinkConfig[];
}

export const footerSectionsConfig: FooterSectionConfig[] = [
  {
    title: 'Product',
    links: [
      { label: 'Plan an Experience',     href: '/experiences' },
      { label: 'Discover Services',      href: '/discover' },
      { label: 'Talk to Experts',        href: '/chat' },
      { label: 'How It Works',           href: '/how-it-works' },
      { label: 'Pricing',                href: '/pricing' },
      { label: 'Features',               href: '/features' },
      { label: 'Global Calendar',        href: '/global-calendar' },
      { label: 'Executive Assistant',    href: '/executive-assistant' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us',       href: '/about' },
      { label: 'Ways to earn',   href: '/earn' },
      { label: 'Careers',        href: '/careers' },
      { label: 'Blog',           href: '/blog' },
      { label: 'Press',          href: '/press' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center',       href: '/help' },
      { label: 'Contact Us',        href: '/contact' },
      { label: 'Visa Help',         href: '/visa-help' },
      { label: 'Privacy Policy',    href: '/privacy' },
      { label: 'Terms of Service',  href: '/terms' },
      { label: 'FAQ',               href: '/faq' },
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
