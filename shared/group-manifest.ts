/**
 * THE GROUP MANIFEST — what each experience group's slip asks, counts in, and offers as tools
 * (surface spec v1.2 §4, verbatim; step 2, ledger `2026-10-03-surface-step2-tools-tray`). PURE.
 *
 * One row per group. The GROUP is decided by `experienceGroupFor` (`shared/experience-group.ts`,
 * §B2 — never restated here, §18 rule 1); this file only says what that group's slip carries. A
 * group the manifest does not name (today: `plain_plan`, the LD 28 fallback) reads as a TRIP — the
 * spec's "unknown group → Trip".
 *
 * Show / Festival is NOT a group: it is an OCCASION overlay on whatever group its row resolves to
 * (§4's last row — eyebrow "—", time unit and threshold the parent's). It replaces the anchor
 * question and appends two tools.
 *
 * Every tool is a KEY. Which component a key mounts is the client's business
 * (`client/src/components/plan/ToolsTray.tsx`); a key with no existing component renders disabled
 * with "coming soon" — no tool is built here.
 */
import type { ExperienceGroup } from "./experience-group";

export type ToolKey =
  | "getting_there"
  | "where_to_stay"
  | "travel_party"
  | "getting_around"
  | "pace"
  | "the_reservation"
  | "timing_check"
  | "getting_home"
  | "the_venue"
  | "guests"
  | "vendors"
  | "budget"
  | "run_of_show"
  | "guest_invites"
  | "vendor_contracts"
  | "arrivals_split_groups"
  | "shared_lodging"
  | "whos_coming"
  | "split_activities"
  | "who_pays_what"
  | "the_show"
  | "getting_back_late";

/** The chip label, verbatim from §4. */
export const TOOL_LABEL: Readonly<Record<ToolKey, string>> = {
  getting_there: "Getting there",
  where_to_stay: "Where to stay",
  travel_party: "Travel party",
  getting_around: "Getting around",
  pace: "Pace",
  the_reservation: "The reservation",
  timing_check: "Timing check",
  getting_home: "Getting home",
  the_venue: "The venue",
  guests: "Guests",
  vendors: "Vendors",
  budget: "Budget",
  run_of_show: "Run of show",
  guest_invites: "Guest invites",
  vendor_contracts: "Vendor contracts",
  arrivals_split_groups: "Arrivals & split groups",
  shared_lodging: "Shared lodging",
  whos_coming: "Who's coming",
  split_activities: "Split activities",
  who_pays_what: "Who pays what",
  the_show: "The show",
  getting_back_late: "Getting back late",
};

/** When the anchor panel (step 3) shows. Declared here; not read until step 3. */
export type AnchorPanelThreshold = { kind: "min_days"; days: number } | { kind: "always" };

export type ManifestGroup = "trip" | "moment" | "celebration" | "hosted_event" | "group_travel";

export interface GroupManifestRow {
  group: ManifestGroup;
  eyebrow: string;
  anchorQuestion: string;
  timeUnit: string;
  tools: readonly ToolKey[];
  anchorPanelThreshold: AnchorPanelThreshold;
}

export const GROUP_MANIFEST: Readonly<Record<ManifestGroup, GroupManifestRow>> = {
  trip: {
    group: "trip",
    eyebrow: "Your plan · Trip",
    anchorQuestion: "Where are you staying?",
    timeUnit: "days",
    tools: ["getting_there", "where_to_stay", "travel_party", "getting_around", "pace"],
    anchorPanelThreshold: { kind: "min_days", days: 2 },
  },
  moment: {
    group: "moment",
    eyebrow: "Your plan · Moment",
    anchorQuestion: "What's the reservation?",
    timeUnit: "hours",
    tools: ["the_reservation", "timing_check", "getting_home"],
    anchorPanelThreshold: { kind: "always" },
  },
  celebration: {
    group: "celebration",
    eyebrow: "Your plan · Celebration",
    anchorQuestion: "Where's it happening?",
    timeUnit: "one day, hours",
    tools: ["the_venue", "guests", "vendors", "budget"],
    anchorPanelThreshold: { kind: "always" },
  },
  hosted_event: {
    group: "hosted_event",
    eyebrow: "Your plan · Event",
    anchorQuestion: "Where's the venue?",
    timeUnit: "run of show",
    tools: ["run_of_show", "guest_invites", "vendor_contracts", "arrivals_split_groups"],
    anchorPanelThreshold: { kind: "always" },
  },
  group_travel: {
    group: "group_travel",
    eyebrow: "Your plan · Group",
    anchorQuestion: "Where is everyone staying?",
    timeUnit: "days",
    tools: ["getting_there", "shared_lodging", "whos_coming", "split_activities", "who_pays_what"],
    anchorPanelThreshold: { kind: "min_days", days: 2 },
  },
};

/** §4's Show / Festival row — an overlay on the parent group, keyed by occasion slug. */
export const SHOW_FESTIVAL_OVERLAY = {
  anchorQuestion: "Which night(s)? (ticket = anchor)",
  extraTools: ["the_show", "getting_back_late"] as readonly ToolKey[],
} as const;

/**
 * The occasions that take the Show / Festival overlay. Only `show` is a seeded occasion today; a
 * festival occasion joins this list when one is seeded — the list names real rows, never a guess.
 */
export const SHOW_FESTIVAL_OCCASION_SLUGS: readonly string[] = ["show"];

const GROUP_TO_MANIFEST: Readonly<Partial<Record<ExperienceGroup, ManifestGroup>>> = {
  trips: "trip",
  moments: "moment",
  celebrations: "celebration",
  hosted_events: "hosted_event",
  group_travel: "group_travel",
};

/**
 * The manifest row for a plan. `group` is `experienceGroupFor`'s answer; anything it does not map
 * (`plain_plan`, an unknown string, null) is a Trip. `occasionSlug` applies the overlay.
 */
export function manifestFor(group: string | null | undefined, occasionSlug?: string | null): GroupManifestRow {
  const key = group ? GROUP_TO_MANIFEST[group as ExperienceGroup] : undefined;
  const base = GROUP_MANIFEST[key ?? "trip"];
  if (!occasionSlug || !SHOW_FESTIVAL_OCCASION_SLUGS.includes(occasionSlug)) return base;
  return {
    ...base,
    anchorQuestion: SHOW_FESTIVAL_OVERLAY.anchorQuestion,
    tools: [...base.tools, ...SHOW_FESTIVAL_OVERLAY.extraTools],
  };
}
