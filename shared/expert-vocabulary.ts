/**
 * expert-vocabulary.ts — the ONE label map for the two expert vocabularies that
 * are STORED AS SLUGS and were being rendered raw.
 *
 * Ledger `2026-09-04-earn-contained-fixes` (gaps 7 and 8 of the Ways-to-Earn audit).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
 * Two columns hold a machine value and two surfaces printed it verbatim:
 *
 *   • `expert_specializations.specialization` / `local_expert_forms.specializations`
 *     hold a MIX — `expertSpecializationEnum` slugs (`food_wine`) written by the
 *     application wizard, `expert_offering_types.offering_type_key` values and, since
 *     the Event Planner track, an offering DISPLAY NAME prepended by the same submit.
 *     `expert-detail.tsx` and `expert-card.tsx` each rendered whatever string came back,
 *     so one badge row could read "Food & Wine" beside "food_wine" beside
 *     "wedding_planner".
 *   • `local_expert_forms.local_specialties` holds a second slug vocabulary
 *     (`food_drink`, `safety_navigation`, …) that the wizard asks for, REQUIRES, and
 *     that nothing outside the wizard's own review step ever rendered.
 *
 * ── THE RULES ───────────────────────────────────────────────────────────────────
 *  1. A slug this module KNOWS renders as its human label.
 *  2. An `expert_offering_types.offering_type_key` renders as that row's
 *     `display_name` — passed IN by the caller, never restated here: the offering
 *     catalog is admin-editable DB content and a copy of it in code would be wrong
 *     the day someone renames a row (§18 rule 1 — one authority per fact).
 *  3. ANYTHING ELSE RENDERS AS-IS, trimmed. A free-typed specialization (the
 *     `POST /api/expert/specializations` rail accepts any sanitized string) is the
 *     expert's own words; inventing a label for it, or hiding it, would both be
 *     claims this module cannot make (§13).
 *
 * No amount, identity, rate or grant is read or written here (§14/§18/§19 N/A —
 * this is presentation over content the expert authored).
 */
import { expertSpecializationEnum } from "./schema";

/**
 * `expertSpecializationEnum` → the label the application wizard shows for it.
 *
 * Typed against the enum so COMPLETENESS IS A COMPILE ERROR, not a runtime surprise:
 * a member added to `expertSpecializationEnum` without a label here fails `tsc`, rather
 * than silently falling through to rule 3 and printing the slug — which is the defect
 * this module exists to close. The export is widened to a string index so callers can
 * look up an arbitrary stored value without a cast.
 */
const SPECIALIZATION_LABELS: Record<(typeof expertSpecializationEnum)[number], string> = {
  budget_travel: "Budget Travel",
  luxury_experiences: "Luxury Experiences",
  adventure_outdoor: "Adventure & Outdoor",
  cultural_immersion: "Cultural Immersion",
  family_friendly: "Family Friendly",
  solo_travel: "Solo Travel",
  food_wine: "Food & Wine",
  photography_tours: "Photography Tours",
  honeymoon: "Honeymoon Planning",
  wellness_retreat: "Wellness & Retreat",
  group_travel: "Group Travel",
  backpacking: "Backpacking",
};

export const EXPERT_SPECIALIZATION_LABELS: Readonly<Record<string, string>> = SPECIALIZATION_LABELS;

export interface LocalSpecialtyOption {
  readonly value: string;
  readonly label: string;
  readonly emoji: string;
}

/**
 * `local_expert_forms.local_specialties` vocabulary. App-enforced (no DB table and no
 * CHECK — the column is jsonb), and this is its one home: the Local Expert wizard's
 * picker, the expert's public profile and the admin review queue all read it here
 * rather than each carrying a copy.
 */
export const LOCAL_SPECIALTY_OPTIONS: readonly LocalSpecialtyOption[] = [
  { value: "food_drink", label: "Food & Drink", emoji: "🍜" },
  { value: "safety_navigation", label: "Safety & Navigation", emoji: "🧭" },
  { value: "cultural_interpretation", label: "Cultural Interpretation", emoji: "🎭" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "family_travel", label: "Family Travel", emoji: "👨‍👩‍👧" },
  { value: "lgbtq_friendly", label: "LGBTQ+ Friendly", emoji: "🏳️‍🌈" },
  { value: "budget_tips", label: "Budget Tips", emoji: "💰" },
  { value: "luxury_access", label: "Luxury Access", emoji: "✨" },
  { value: "photography_spots", label: "Photography Spots", emoji: "📸" },
  { value: "hidden_gems", label: "Hidden Gems", emoji: "💎" },
] as const;

const LOCAL_SPECIALTY_BY_VALUE = new Map(LOCAL_SPECIALTY_OPTIONS.map((o) => [o.value, o]));

/** A lookup of `offering_type_key` → `display_name`, supplied by the caller from the DB. */
export type OfferingDisplayNames = Readonly<Record<string, string>> | ReadonlyMap<string, string> | null | undefined;

function lookupOffering(names: OfferingDisplayNames, key: string): string | undefined {
  if (!names) return undefined;
  if (names instanceof Map) return names.get(key);
  return (names as Record<string, string>)[key];
}

/**
 * Render one stored specialization. See "THE RULES" above — enum slug, then offering
 * display name, then the raw string unchanged.
 */
export function labelForExpertSpecialization(raw: string, offeringDisplayNames?: OfferingDisplayNames): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const enumLabel = EXPERT_SPECIALIZATION_LABELS[value];
  if (enumLabel) return enumLabel;
  const offeringLabel = lookupOffering(offeringDisplayNames, value);
  if (offeringLabel && offeringLabel.trim()) return offeringLabel.trim();
  return value;
}

/** Render one stored local specialty. Unknown values render as-is (rule 3). */
export function labelForLocalSpecialty(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  return LOCAL_SPECIALTY_BY_VALUE.get(value)?.label ?? value;
}

/** The emoji for a known local specialty; `null` when the value is not one of ours (§13). */
export function emojiForLocalSpecialty(raw: string): string | null {
  return LOCAL_SPECIALTY_BY_VALUE.get((raw ?? "").trim())?.emoji ?? null;
}

/**
 * The shape every expert DTO carries the three specialization stores in. Deliberately loose —
 * the browse list, the detail page and the admin queue each hand this in with their own
 * surrounding type, and this module only needs these three keys.
 */
export interface ExpertSpecializationSource {
  /** `users.specialties` — edited from the expert's own profile editor. */
  specialties?: unknown;
  /** `expert_specializations` rows, flattened by `getExpertsWithProfiles`. */
  specializations?: unknown;
  /** `local_expert_forms.specializations` — what the APPLICATION captured. */
  expertForm?: { specializations?: unknown } | null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * ONE answer to "which specializations does this expert show?", for every surface.
 *
 * Gap 9 (ledger `2026-09-04-earn-contained-fixes`): there are THREE stores and two surfaces
 * were reading different ones — `expert-card.tsx` took `users.specialties` else the
 * `expert_specializations` table, while `expert-detail.tsx` read only the application's
 * `local_expert_forms.specializations` jsonb. The same expert could therefore show one set on
 * the browse card and a different set on their own profile.
 *
 * PRECEDENCE, and why. The stores are not merged — merging three vocabularies produces a badge
 * row nobody authored — and the FIRST non-empty one wins:
 *   1. `users.specialties`      — the expert's own live profile edit. Most recent intent.
 *   2. `expert_specializations` — the table the console's add/remove rail writes.
 *   3. `local_expert_forms.specializations` — HISTORICAL. It is the APPLICATION's answer, and
 *      nothing writes it after submit. It stays as a LAST RESORT rather than being dropped
 *      outright because no signup path writes store 2, so dropping it would blank the badge row
 *      for every expert who has never touched the console rail — deleting real, expert-authored
 *      content in the name of tidiness. It is never merged with 1 or 2, and it is never the
 *      thing a writer should target.
 *
 * An empty array is treated as ABSENT, not as "this expert has none": `users.specialties`
 * defaults to `[]`, so reading it as an answer is what made the card's fallback dead code.
 */
export function resolveExpertSpecializations(expert: ExpertSpecializationSource | null | undefined): string[] {
  if (!expert) return [];
  const fromUser = asStringArray(expert.specialties);
  if (fromUser.length > 0) return fromUser;
  const fromTable = asStringArray(expert.specializations);
  if (fromTable.length > 0) return fromTable;
  return asStringArray(expert.expertForm?.specializations);
}
