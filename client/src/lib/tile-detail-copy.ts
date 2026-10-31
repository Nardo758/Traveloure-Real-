/**
 * Row 303b: the words on the Discover tile detail panel that are not section headings.
 *
 * The section headings are NOT here. Row 303a ships them as the approved
 * `TILE_PANEL_SECTION_HEADINGS` (`shared/tile-detail-panel.ts`) and the panel read returns that map;
 * the screen reads the response and does not restate it.
 *
 * Every value below is a new traveler-facing string. Each is HELD for Leon and is a placeholder
 * until approved.
 */
export const TILE_DETAIL_COPY = {
  /** Before the checked-on date beside each fact. HELD for Leon. */
  checkedOn: "[HELD for Leon]",
  /** The link to a photo's license, beside its credit. HELD for Leon. */
  photoLicense: "[HELD for Leon]",
  /** Shown while the panel read is in flight. HELD for Leon. */
  loading: "[HELD for Leon]",
  /** Shown when the read returns no sourced fact and no credited photo. HELD for Leon. */
  nothingChecked: "[HELD for Leon]",
  /** Shown when the panel read fails. HELD for Leon. */
  readFailed: "[HELD for Leon]",
  /** The panel title when the tile carries no name of its own. HELD for Leon. */
  untitled: "[HELD for Leon]",
  /** Screen-reader description of the panel. HELD for Leon. */
  description: "[HELD for Leon]",
} as const;
