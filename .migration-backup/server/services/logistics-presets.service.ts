/**
 * Logistics Presets Service
 *
 * Auto-generates temporal anchors, day boundaries, and energy tracking
 * based on experience type. Each template has default anchor patterns
 * that users can customize.
 */

import { storage } from "../storage";
import type { InsertTemporalAnchor, InsertDayBoundary } from "@shared/schema";

interface AnchorPreset {
  anchorType: string;
  label: string;
  defaultBufferBefore: number; // minutes
  defaultBufferAfter: number; // minutes
  defaultTimeOfDay: string; // "HH:MM"
  dayOffset: number; // 0 = event day, -1 = day before, etc.
  isImmovable: boolean;
  description: string;
}

interface TemplatePresets {
  anchors: AnchorPreset[];
  dayBoundaries: Array<{
    dayOffset: number;
    latestActivityEnd: string;
    earliestActivityStart?: string;
    mustReturnToHotel: boolean;
    reason: string;
  }>;
}

// Wedding template: ceremony is the central anchor, everything radiates from it
const WEDDING_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "rehearsal_time",
      label: "Rehearsal Dinner",
      defaultBufferBefore: 60,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "18:00",
      dayOffset: -1,
      isImmovable: true,
      description: "Rehearsal dinner the evening before the wedding",
    },
    {
      anchorType: "hair_makeup_start",
      label: "Hair & Makeup",
      defaultBufferBefore: 30,
      defaultBufferAfter: 180,
      defaultTimeOfDay: "08:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Bridal hair and makeup session",
    },
    {
      anchorType: "photographer_arrival",
      label: "Photographer Arrival",
      defaultBufferBefore: 0,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "12:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Photographer arrives for pre-ceremony shots",
    },
    {
      anchorType: "ceremony_time",
      label: "Ceremony",
      defaultBufferBefore: 120,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Wedding ceremony — the main event",
    },
    {
      anchorType: "reception_start",
      label: "Reception",
      defaultBufferBefore: 30,
      defaultBufferAfter: 240,
      defaultTimeOfDay: "17:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Wedding reception with dinner and celebration",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: -1,
      latestActivityEnd: "22:00",
      mustReturnToHotel: true,
      reason: "Rest needed before wedding day",
    },
    {
      dayOffset: 0,
      latestActivityEnd: "23:59",
      earliestActivityStart: "07:00",
      mustReturnToHotel: false,
      reason: "Wedding day — full day commitment",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "20:00",
      earliestActivityStart: "10:00",
      mustReturnToHotel: false,
      reason: "Post-wedding recovery and brunch",
    },
  ],
};

// Proposal template: the proposal moment is the secret anchor
const PROPOSAL_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "dinner_reservation",
      label: "Dinner Reservation",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Special dinner reservation",
    },
    {
      anchorType: "proposal_moment",
      label: "The Proposal",
      defaultBufferBefore: 60,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "20:30",
      dayOffset: 0,
      isImmovable: true,
      description: "The proposal moment — everything leads to this",
    },
    {
      anchorType: "photographer_arrival",
      label: "Secret Photographer",
      defaultBufferBefore: 30,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "20:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Hidden photographer positioning",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:00",
      mustReturnToHotel: false,
      reason: "Special evening — keep schedule light",
    },
  ],
};

// Travel template: flights are the primary anchors
const TRAVEL_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "flight_arrival",
      label: "Arrival Flight",
      defaultBufferBefore: 0,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Arrival at destination — customs, baggage, transit to hotel",
    },
    {
      anchorType: "hotel_checkin",
      label: "Hotel Check-in",
      defaultBufferBefore: 0,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Hotel check-in and settling in",
    },
    {
      anchorType: "hotel_checkout",
      label: "Hotel Check-out",
      defaultBufferBefore: 60,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "11:00",
      dayOffset: -1, // Last day (relative to end)
      isImmovable: false,
      description: "Hotel check-out and luggage storage",
    },
    {
      anchorType: "flight_departure",
      label: "Departure Flight",
      defaultBufferBefore: 180,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "16:00",
      dayOffset: -1, // Last day
      isImmovable: true,
      description: "Departure flight — need 3 hours before for airport",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "22:00",
      earliestActivityStart: "16:00",
      mustReturnToHotel: true,
      reason: "Arrival day — limited time after check-in",
    },
  ],
};

// Birthday template: venue and surprise coordination
const BIRTHDAY_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "dinner_reservation",
      label: "Birthday Dinner",
      defaultBufferBefore: 60,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Birthday dinner reservation",
    },
    {
      anchorType: "custom",
      label: "Cake & Surprise",
      defaultBufferBefore: 15,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "20:30",
      dayOffset: 0,
      isImmovable: true,
      description: "Cake reveal and birthday surprise moment",
    },
    {
      anchorType: "pre_booked_tour",
      label: "Birthday Activity",
      defaultBufferBefore: 30,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Main birthday activity (escape room, cooking class, etc.)",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:30",
      mustReturnToHotel: false,
      reason: "Birthday celebration — late night allowed",
    },
  ],
};

// Corporate event template: meetings, team building, networking
const CORPORATE_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "meeting_time",
      label: "Morning Session",
      defaultBufferBefore: 30,
      defaultBufferAfter: 15,
      defaultTimeOfDay: "09:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Morning keynote or meeting session",
    },
    {
      anchorType: "custom",
      label: "Lunch Break",
      defaultBufferBefore: 0,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "12:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Group lunch — networking opportunity",
    },
    {
      anchorType: "meeting_time",
      label: "Afternoon Session",
      defaultBufferBefore: 15,
      defaultBufferAfter: 15,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Afternoon workshop or team building",
    },
    {
      anchorType: "dinner_reservation",
      label: "Team Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Team dinner and social event",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "22:00",
      earliestActivityStart: "08:00",
      mustReturnToHotel: true,
      reason: "Corporate schedule — early start, structured day",
    },
  ],
};

// Date Night template: intimate, focused on the special evening
const DATE_NIGHT_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "pre_booked_tour",
      label: "Pre-Dinner Activity",
      defaultBufferBefore: 15,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "17:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Sunset cruise, gallery visit, or cocktail class",
    },
    {
      anchorType: "dinner_reservation",
      label: "Dinner Reservation",
      defaultBufferBefore: 15,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "19:30",
      dayOffset: 0,
      isImmovable: true,
      description: "Restaurant reservation for the evening",
    },
    {
      anchorType: "custom",
      label: "Evening Entertainment",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "21:30",
      dayOffset: 0,
      isImmovable: false,
      description: "Show, jazz bar, rooftop lounge, or nightcap",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:59",
      earliestActivityStart: "16:00",
      mustReturnToHotel: false,
      reason: "Evening-only event — relaxed timing",
    },
  ],
};

// Anniversary template: romantic, milestone celebration
const ANNIVERSARY_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "pre_booked_tour",
      label: "Couples Activity",
      defaultBufferBefore: 30,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "10:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Couples spa, wine tasting, or scenic tour",
    },
    {
      anchorType: "photographer_arrival",
      label: "Photo Session",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "16:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Anniversary photo shoot at scenic location",
    },
    {
      anchorType: "dinner_reservation",
      label: "Anniversary Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Special anniversary dinner celebration",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:00",
      mustReturnToHotel: false,
      reason: "Anniversary celebration — romantic evening",
    },
  ],
};

// Bachelor/Bachelorette party: group coordination across multiple days
const BACHELOR_BACHELORETTE_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "group_dinner",
      label: "Welcome Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Group kick-off dinner on arrival",
    },
    {
      anchorType: "daytime_activity",
      label: "Daytime Activity",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "10:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Adventure activity (golf, water sports, etc.)",
    },
    {
      anchorType: "nightlife",
      label: "Main Event Night",
      defaultBufferBefore: 60,
      defaultBufferAfter: 180,
      defaultTimeOfDay: "21:00",
      dayOffset: 1,
      isImmovable: true,
      description: "Main celebration night with VIP reservations",
    },
    {
      anchorType: "group_dinner",
      label: "Farewell Brunch",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "11:00",
      dayOffset: 2,
      isImmovable: false,
      description: "Final group meal before departure",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:00",
      mustReturnToHotel: false,
      reason: "Arrival day — acclimate and socialize",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "23:59",
      earliestActivityStart: "09:00",
      mustReturnToHotel: false,
      reason: "Main party day — full energy, late night allowed",
    },
    {
      dayOffset: 2,
      latestActivityEnd: "14:00",
      mustReturnToHotel: false,
      reason: "Departure day — brunch then leave",
    },
  ],
};

// Boys Trip: adventure and group activities
const BOYS_TRIP_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "hotel_checkin",
      label: "Hotel Check-in",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Arrival and hotel check-in",
    },
    {
      anchorType: "daytime_activity",
      label: "First Day Adventure",
      defaultBufferBefore: 15,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Sports or outdoor activity after arrival",
    },
    {
      anchorType: "group_dinner",
      label: "Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Group dinner at established restaurant",
    },
    {
      anchorType: "hotel_checkout",
      label: "Check-out",
      defaultBufferBefore: 60,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "11:00",
      dayOffset: -1,
      isImmovable: false,
      description: "Final day check-out",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:30",
      earliestActivityStart: "14:00",
      mustReturnToHotel: false,
      reason: "Arrival day — limited time after check-in",
    },
  ],
};

// Girls Trip: wellness and social activities
const GIRLS_TRIP_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "hotel_checkin",
      label: "Hotel Check-in",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Arrival and hotel check-in",
    },
    {
      anchorType: "spa_booking",
      label: "Spa Day",
      defaultBufferBefore: 15,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "10:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Full spa experience or massages",
    },
    {
      anchorType: "group_dinner",
      label: "Group Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Nice dinner reservation",
    },
    {
      anchorType: "hotel_checkout",
      label: "Check-out",
      defaultBufferBefore: 60,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "11:00",
      dayOffset: -1,
      isImmovable: false,
      description: "Final day check-out",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "22:00",
      earliestActivityStart: "15:00",
      mustReturnToHotel: false,
      reason: "Arrival day — settle in",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "23:00",
      mustReturnToHotel: false,
      reason: "Main day — spa and dinner",
    },
  ],
};

// Anniversary Trip: romantic getaway
const ANNIVERSARY_TRIP_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "hotel_checkin",
      label: "Romantic Hotel Check-in",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Check into romantic suite or resort",
    },
    {
      anchorType: "pre_booked_tour",
      label: "Couples Experience",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "16:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Couples massage, wine tasting, or private tour",
    },
    {
      anchorType: "dinner_reservation",
      label: "Anniversary Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Special romantic anniversary dinner",
    },
    {
      anchorType: "photographer_arrival",
      label: "Romantic Photos",
      defaultBufferBefore: 15,
      defaultBufferAfter: 45,
      defaultTimeOfDay: "17:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Sunset or scenic couple photos",
    },
    {
      anchorType: "hotel_checkout",
      label: "Check-out",
      defaultBufferBefore: 60,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "11:00",
      dayOffset: -1,
      isImmovable: false,
      description: "Final day departure",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:00",
      earliestActivityStart: "15:00",
      mustReturnToHotel: false,
      reason: "Romantic evening — no late-night activities",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "21:00",
      mustReturnToHotel: false,
      reason: "Final day — leisure pace",
    },
  ],
};

// Sports Event: ticket anchor and group logistics
const SPORTS_EVENT_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "event_time",
      label: "Game/Event Start",
      defaultBufferBefore: 120,
      defaultBufferAfter: 180,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Main sporting event — arrive 2 hours early for parking/seating",
    },
    {
      anchorType: "pre_event_gathering",
      label: "Pre-Game Gathering",
      defaultBufferBefore: 60,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "12:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Meet up with group, tailgate or bar visit",
    },
    {
      anchorType: "group_dinner",
      label: "Post-Event Celebration",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Dinner or celebration after game",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "23:59",
      earliestActivityStart: "10:00",
      mustReturnToHotel: false,
      reason: "Full sports day — early morning to late night",
    },
  ],
};

// Retreats: wellness and structured activities
const RETREATS_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "hotel_checkin",
      label: "Arrival & Welcome",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Check-in and orientation",
    },
    {
      anchorType: "custom",
      label: "Morning Yoga",
      defaultBufferBefore: 15,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "07:00",
      dayOffset: 1,
      isImmovable: true,
      description: "Daily morning yoga or meditation session",
    },
    {
      anchorType: "group_dinner",
      label: "Group Meals",
      defaultBufferBefore: 15,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "12:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Healthy group lunch",
    },
    {
      anchorType: "custom",
      label: "Wellness Workshop",
      defaultBufferBefore: 15,
      defaultBufferAfter: 90,
      defaultTimeOfDay: "14:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Afternoon wellness workshop or activity",
    },
    {
      anchorType: "hotel_checkout",
      label: "Departure",
      defaultBufferBefore: 60,
      defaultBufferAfter: 0,
      defaultTimeOfDay: "11:00",
      dayOffset: -1,
      isImmovable: false,
      description: "Final day check-out",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "21:00",
      mustReturnToHotel: true,
      reason: "Arrival day — early evening mandatory retreat",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "21:00",
      earliestActivityStart: "07:00",
      mustReturnToHotel: false,
      reason: "Full retreat day — structured schedule",
    },
  ],
};

// Wedding Anniversaries: party celebration
const WEDDING_ANNIVERSARIES_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "custom",
      label: "Venue Arrival",
      defaultBufferBefore: 30,
      defaultBufferAfter: 15,
      defaultTimeOfDay: "17:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Arrival at party venue for setup/photos",
    },
    {
      anchorType: "group_dinner",
      label: "Anniversary Celebration",
      defaultBufferBefore: 15,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "18:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Main anniversary celebration with guests",
    },
    {
      anchorType: "photographer_arrival",
      label: "Photos",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "17:30",
      dayOffset: 0,
      isImmovable: false,
      description: "Formal anniversary couple photos",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "22:00",
      mustReturnToHotel: false,
      reason: "Party evening — celebration timing",
    },
  ],
};

// Party templates (baby shower, graduation, engagement, housewarming, retirement, career, farewell, holiday)
const PARTY_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "venue_setup",
      label: "Venue Setup",
      defaultBufferBefore: 120,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "14:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Early arrival for setup and decorations",
    },
    {
      anchorType: "custom",
      label: "Guest Arrival",
      defaultBufferBefore: 15,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Guest arrival window",
    },
    {
      anchorType: "custom",
      label: "Main Activity/Cake",
      defaultBufferBefore: 30,
      defaultBufferAfter: 30,
      defaultTimeOfDay: "16:00",
      dayOffset: 0,
      isImmovable: true,
      description: "Cake cutting, toasts, main celebration moment",
    },
    {
      anchorType: "custom",
      label: "Dinner/Refreshments",
      defaultBufferBefore: 15,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "17:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Catered meal or refreshments",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "20:00",
      mustReturnToHotel: false,
      reason: "Party afternoon/evening",
    },
  ],
};

// Reunions: group gathering with flexible schedule
const REUNIONS_PRESETS: TemplatePresets = {
  anchors: [
    {
      anchorType: "hotel_checkin",
      label: "Check-in",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "15:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Hotel arrival and check-in",
    },
    {
      anchorType: "group_dinner",
      label: "Welcome Dinner",
      defaultBufferBefore: 30,
      defaultBufferAfter: 120,
      defaultTimeOfDay: "19:00",
      dayOffset: 0,
      isImmovable: false,
      description: "Opening group dinner and socializing",
    },
    {
      anchorType: "daytime_activity",
      label: "Group Activities",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "10:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Games, tours, or group excursion",
    },
    {
      anchorType: "custom",
      label: "Closing Gathering",
      defaultBufferBefore: 30,
      defaultBufferAfter: 60,
      defaultTimeOfDay: "17:00",
      dayOffset: 1,
      isImmovable: false,
      description: "Final evening gathering before departure",
    },
  ],
  dayBoundaries: [
    {
      dayOffset: 0,
      latestActivityEnd: "22:00",
      mustReturnToHotel: false,
      reason: "Arrival day — welcome dinner",
    },
    {
      dayOffset: 1,
      latestActivityEnd: "22:00",
      mustReturnToHotel: false,
      reason: "Reunion day — full schedule with activities",
    },
  ],
};

const TEMPLATE_PRESETS: Record<string, TemplatePresets> = {
  wedding: WEDDING_PRESETS,
  proposal: PROPOSAL_PRESETS,
  travel: TRAVEL_PRESETS,
  vacation: TRAVEL_PRESETS,
  birthday: BIRTHDAY_PRESETS,
  "corporate-events": CORPORATE_PRESETS,
  date_night: DATE_NIGHT_PRESETS,
  "date-night": DATE_NIGHT_PRESETS,
  "anniversary-trip": ANNIVERSARY_TRIP_PRESETS,
  anniversary: ANNIVERSARY_PRESETS,
  honeymoon: TRAVEL_PRESETS,
  adventure: TRAVEL_PRESETS,
  "bachelor-bachelorette": BACHELOR_BACHELORETTE_PRESETS,
  "boys-trip": BOYS_TRIP_PRESETS,
  "girls-trip": GIRLS_TRIP_PRESETS,
  "sports-event": SPORTS_EVENT_PRESETS,
  retreats: RETREATS_PRESETS,
  "wedding-anniversaries": WEDDING_ANNIVERSARIES_PRESETS,
  "baby-shower": PARTY_PRESETS,
  "graduation-party": PARTY_PRESETS,
  "engagement-party": PARTY_PRESETS,
  "housewarming-party": PARTY_PRESETS,
  "retirement-party": PARTY_PRESETS,
  "career-achievement-party": PARTY_PRESETS,
  "farewell-party": PARTY_PRESETS,
  "holiday-party": PARTY_PRESETS,
  reunions: REUNIONS_PRESETS,
};

/**
 * Get the preset anchors for a given experience type.
 * Returns the raw presets so the frontend can display them for customization.
 */
export function getPresetsForTemplate(templateSlug: string): TemplatePresets | null {
  return TEMPLATE_PRESETS[templateSlug] || null;
}

/**
 * Auto-generate temporal anchors and day boundaries for a trip
 * based on its experience type. Uses the event date as day 0.
 */
export async function generatePresetsForTrip(
  tripId: string,
  templateSlug: string,
  eventDate: string | Date,
  userExperienceId?: string
): Promise<{ anchorsCreated: number; boundariesCreated: number }> {
  const presets = TEMPLATE_PRESETS[templateSlug];
  if (!presets) {
    return { anchorsCreated: 0, boundariesCreated: 0 };
  }

  const baseDate = new Date(eventDate);
  baseDate.setHours(0, 0, 0, 0);
  let anchorsCreated = 0;
  let boundariesCreated = 0;

  // Load existing data upfront to ensure idempotency
  const [existingAnchors, existingBoundaries] = await Promise.all([
    storage.getTemporalAnchors(tripId),
    storage.getDayBoundaries(tripId),
  ]);

  // Build sets of already-existing anchor types and day numbers
  const existingAnchorTypes = new Set(existingAnchors.map(a => a.anchorType));
  const existingDayNumbers = new Set(existingBoundaries.map(b => b.dayNumber));

  // Create temporal anchors — skip any anchor type already present
  for (const preset of presets.anchors) {
    if (existingAnchorTypes.has(preset.anchorType)) continue;

    const anchorDate = new Date(baseDate);
    anchorDate.setDate(anchorDate.getDate() + preset.dayOffset);
    const [hours, minutes] = preset.defaultTimeOfDay.split(':').map(Number);
    anchorDate.setHours(hours, minutes, 0, 0);

    const anchor: InsertTemporalAnchor = {
      tripId,
      userExperienceId: userExperienceId || null,
      anchorType: preset.anchorType,
      anchorDatetime: anchorDate,
      bufferBefore: preset.defaultBufferBefore,
      bufferAfter: preset.defaultBufferAfter,
      isImmovable: preset.isImmovable,
      description: preset.description,
    };

    await storage.createTemporalAnchor(anchor);
    existingAnchorTypes.add(preset.anchorType); // prevent duplicates within same preset set
    anchorsCreated++;
  }

  // Create day boundaries — skip any day number already present
  for (const boundary of presets.dayBoundaries) {
    // Calculate day number relative to trip (not event)
    // For simplicity, dayOffset 0 = event day = day 1
    const dayNumber = boundary.dayOffset + 1;
    if (dayNumber < 1) continue; // Skip days before trip start
    if (existingDayNumbers.has(dayNumber)) continue;

    const dayBoundary: InsertDayBoundary = {
      tripId,
      dayNumber,
      latestActivityEnd: boundary.latestActivityEnd,
      earliestActivityStart: boundary.earliestActivityStart || null,
      mustReturnToHotel: boundary.mustReturnToHotel,
      reasonForConstraint: boundary.reason,
    };

    await storage.createDayBoundary(dayBoundary);
    existingDayNumbers.add(dayNumber); // prevent duplicates within same preset set
    boundariesCreated++;
  }

  return { anchorsCreated, boundariesCreated };
}

/**
 * Detect conflicts when an anchor changes.
 * Returns a list of downstream impacts.
 */
export async function detectAnchorImpacts(
  tripId: string,
  changedAnchorId: string
): Promise<Array<{ type: string; message: string; severity: 'warning' | 'critical' }>> {
  const anchors = await storage.getTemporalAnchors(tripId);
  const changed = anchors.find(a => a.id === changedAnchorId);
  if (!changed) return [];

  const impacts: Array<{ type: string; message: string; severity: 'warning' | 'critical' }> = [];
  const changedTime = new Date(changed.anchorDatetime).getTime();
  const changedStart = changedTime - (changed.bufferBefore || 0) * 60000;
  const changedEnd = changedTime + (changed.bufferAfter || 0) * 60000;

  // Check against other anchors
  for (const anchor of anchors) {
    if (anchor.id === changedAnchorId) continue;

    const anchorTime = new Date(anchor.anchorDatetime).getTime();
    const anchorStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
    const anchorEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;

    // Buffer zone overlap
    if (changedStart < anchorEnd && changedEnd > anchorStart) {
      const anchorLabel = anchor.anchorType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      impacts.push({
        type: 'anchor_conflict',
        message: `Buffer zone overlaps with "${anchorLabel}" — they may be too close together.`,
        severity: anchor.isImmovable ? 'critical' : 'warning',
      });
    }
  }

  // Check if ceremony time has enough prep time
  if (changed.anchorType === 'ceremony_time') {
    const hairMakeup = anchors.find(a => a.anchorType === 'hair_makeup_start');
    if (hairMakeup) {
      const hmEnd = new Date(hairMakeup.anchorDatetime).getTime() + (hairMakeup.bufferAfter || 0) * 60000;
      const ceremonyStart = changedStart;
      const gapMinutes = (ceremonyStart - hmEnd) / 60000;

      if (gapMinutes < 30) {
        impacts.push({
          type: 'prep_time',
          message: `Only ${Math.max(0, Math.round(gapMinutes))} minutes between hair/makeup end and ceremony — consider more buffer.`,
          severity: 'critical',
        });
      }
    }
  }

  return impacts;
}
