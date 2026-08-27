/**
 * occasion-templates.ts — the occasion template catalog.
 *
 * Ledger 2026-08-27-plus-is-delivery. Each template_key selects how the scheduled draft is
 * generated in resident mode: the eventType passed to the AI-Concierge task, the interests that
 * shape the plan, a default label, and a special-request hint. These are RESIDENT, day-scale
 * occasions (you are home, not travelling), so every template is a single-day plan on the
 * occasion date.
 *
 * template_key is validated against this catalog app-side (no DB CHECK — publish-trap posture).
 * An unknown key falls back to GENERIC_OCCASION_TEMPLATE so the flow degrades honestly rather
 * than throwing.
 */
export interface OccasionTemplate {
  key: string;
  defaultLabel: string;
  /** eventType handed to grokService.generateAutonomousItinerary (steers tone/shape). */
  eventType: string;
  interests: string[];
  specialRequests: string;
  /** Resident occasions are day-scale; kept explicit so a future multi-day template can differ. */
  dayCount: number;
}

export const OCCASION_TEMPLATES: Record<string, OccasionTemplate> = {
  date_night: {
    key: "date_night",
    defaultLabel: "Date night",
    eventType: "date_night",
    interests: ["romantic", "fine dining", "evening", "local culture"],
    specialRequests:
      "A romantic evening for two in the member's home city — dinner plus one memorable evening activity. Keep it walkable and local.",
    dayCount: 1,
  },
  birthday: {
    key: "birthday",
    defaultLabel: "Birthday",
    eventType: "birthday",
    interests: ["celebration", "dining", "activities", "local culture"],
    specialRequests:
      "A birthday celebration in the member's home city — a standout meal and a fun activity to mark the day.",
    dayCount: 1,
  },
  proposal: {
    key: "proposal",
    defaultLabel: "Proposal",
    eventType: "proposal",
    interests: ["romantic", "scenic", "memorable", "fine dining"],
    specialRequests:
      "A proposal day in the member's home city — a scenic, memorable setting for the moment plus a celebratory dinner.",
    dayCount: 1,
  },
  celebration: {
    key: "celebration",
    defaultLabel: "Celebration",
    eventType: "celebration",
    interests: ["celebration", "dining", "nightlife", "activities"],
    specialRequests:
      "A celebration in the member's home city — a lively evening with a great meal and something to do afterwards.",
    dayCount: 1,
  },
  anniversary: {
    key: "anniversary",
    defaultLabel: "Anniversary",
    eventType: "anniversary",
    interests: ["romantic", "fine dining", "scenic", "local culture"],
    specialRequests:
      "An anniversary in the member's home city — a special dinner and a meaningful, romantic activity for two.",
    dayCount: 1,
  },
};

export const GENERIC_OCCASION_TEMPLATE: OccasionTemplate = {
  key: "occasion",
  defaultLabel: "Occasion",
  eventType: "celebration",
  interests: ["local culture", "food", "activities"],
  specialRequests: "A special day planned in the member's home city.",
  dayCount: 1,
};

export function resolveOccasionTemplate(templateKey: string): OccasionTemplate {
  return OCCASION_TEMPLATES[templateKey] ?? GENERIC_OCCASION_TEMPLATE;
}

/** The template keys the calendar UI offers and the API accepts. */
export const OCCASION_TEMPLATE_KEYS = Object.keys(OCCASION_TEMPLATES);

/** Recurrence vocabulary (validated app-side; no DB CHECK). */
export const OCCASION_RECURRENCES = ["none", "annual", "biweekly"] as const;
export type OccasionRecurrence = (typeof OCCASION_RECURRENCES)[number];
