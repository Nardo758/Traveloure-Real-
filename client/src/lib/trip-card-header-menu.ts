/**
 * Row 194 (R2): the Trip Card header's ⋯ menu. Share stays a visible button; Calendar, PDF, Export and
 * phone delivery move into this menu. The mobile BottomActionBar and the slip's SlipPlanMenu are unchanged.
 *
 * The four entry labels are the ones given with the R2 ruling (Nov 1, 2026), held until Leon approves
 * the wording. PLAN-2 lane 2 replaces the trigger's held placeholder with W6 below: it is
 * **proposed**, and Leon's own "Wording approved — Leon" comment on the PR is the approval.
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
  /** The ⋯ trigger's accessible name (W6). Proposed. */
  trigger: "More actions",
} as const;
