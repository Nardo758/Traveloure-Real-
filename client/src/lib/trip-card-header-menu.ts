/**
 * Row 194 (R2): the Trip Card header's ⋯ menu. Share stays a visible button; Calendar, PDF, Export and
 * phone delivery move into this menu. The mobile BottomActionBar and the slip's SlipPlanMenu are unchanged.
 *
 * Every label here is HELD for Leon. The four entry labels are the ones given with the R2 ruling (Nov 1,
 * 2026), held until Leon approves the wording; the trigger's accessible name is a placeholder.
 */
export const TRIP_CARD_HEADER_MENU_COPY = {
  /** HELD. */
  calendar: "Add to calendar",
  /** HELD. */
  pdf: "Download PDF",
  /** HELD. */
  export: "Export",
  /** HELD. */
  phone: "Send to my phone",
  /** The ⋯ trigger's accessible name. HELD for Leon (placeholder). */
  trigger: "[HELD for Leon]",
} as const;
