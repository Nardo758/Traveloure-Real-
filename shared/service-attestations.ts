/**
 * D9 — ONBOARDING ATTESTATIONS, keyed to delivery METHOD + category RISK
 * (docs/DECISIONS.md ruling 62's D9 clause, decision-maker ratified Aug 11 2026; executed by
 * ruling 67).
 *
 * Ruling 62, verbatim: *"D9: onboarding attestations keyed to method + category risk,
 * inapplicable ones OMITTED with a reason — the D2 honesty shape at the top of the funnel."*
 *
 * ONE DEFINITION, BOTH SIDES OF THE WIRE — the `shared/service-fundamentals.ts` placement
 * rationale applied one lane over. The server resolves the applicable set on every read AND
 * re-resolves it on every write (the client's opinion of what applies to it is never trusted —
 * §14's "derive it server-side" posture generalized from amounts to APPLICABILITY); the wizard
 * imports the same predicate so the card it renders and the set the server will accept can never
 * drift. A second local method list or a second category list is the defect this file prevents.
 *
 * METHOD PREDICATES ARE REUSED, NEVER RE-IMPLEMENTED: `isPlaceAnchored` / `isClassifiable` come
 * from `shared/service-fundamentals.ts`. This module adds only the CATEGORY axis.
 *
 * ── §13 HONESTY SHAPE (the D2 pattern, and the reason this file has three states not two) ────
 *   APPLICABLE   — the row's method/category say this attestation applies. Rendered, affirmable.
 *   OMITTED      — the row does not carry enough signal to decide. Reported with a STATED REASON,
 *                  never guessed either way, never rendered as "compliant".
 *   (silent)     — we know it does NOT apply. It never appears at all: an omission entry would
 *                  still read as "this could apply to you" (the D3/`delivery_asset` precedent in
 *                  provider-listing-health.routes.ts, which deliberately emits no entry for a
 *                  non-artifact listing).
 *
 * ── SCOPE (ruling 67's negative space — read this before extending) ──────────────────────────
 * These are AFFIRMATIONS, not verifications and not gates. Nothing here blocks a listing from
 * publishing, nothing is shown to a traveler, no document is uploaded or checked, and no listing
 * text is scanned for violating phrases. Each of those is its own unruled question, filed on the
 * punch list. An attestation is a provider's own statement, recorded with who said it and when.
 *
 * ── WHY THESE THREE (small, defensible, each with a stated rationale) ────────────────────────
 * The catalog is deliberately 3 types, not a compliance matrix. Every type must name a concrete
 * risk this platform's own product surface creates; a type nobody can point at a surface for does
 * not belong here.
 */
import { isClassifiable, isPlaceAnchored, type FundamentalsShape } from "./service-fundamentals";

export const ATTESTATION_KEYS = [
  "title_claim_honesty",
  "in_person_safety_basics",
  "food_safety_disclosure",
] as const;
export type AttestationKey = (typeof ATTESTATION_KEYS)[number];

export function isAttestationKey(v: unknown): v is AttestationKey {
  return typeof v === "string" && (ATTESTATION_KEYS as readonly string[]).includes(v);
}

/** Stable machine codes for an omission — the free-text `reason` is the human half. */
export const ATTESTATION_OMISSION_CODES = [
  "no_category",
  "no_delivery_method",
] as const;
export type AttestationOmissionCode = (typeof ATTESTATION_OMISSION_CODES)[number];

// ── The category axis ────────────────────────────────────────────────────────────────────────
// `provider_services.categoryId` FKs `service_categories`, whose rows carry BOTH a legacy `slug`
// and the Phase-1 `category_key` — and the live taxonomy has rows with a key and rows with only
// a slug (e.g. "Language & Translation" has `category_key IS NULL`). Keying on one alone would
// silently miss half the taxonomy, so both are matched and either is enough.

/**
 * Guiding / interpreting categories — the SS-5 surface. `tour_guide` ("Tours & Experiences") is
 * the obvious one; `language-translation` is included deliberately because 通訳案内士 is literally
 * an *interpreter*-guide title, so an interpretation listing can make exactly the same claim.
 */
export const GUIDE_CATEGORY_KEYS: ReadonlySet<string> = new Set(["tour_guide"]);
export const GUIDE_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  "tours-experiences",
  "language-translation",
]);

/** Categories where the provider may prepare, serve or supply food or drink. */
export const FOOD_CATEGORY_KEYS: ReadonlySet<string> = new Set([
  "private_chef",
  "caterer",
  "dining_venue",
]);
export const FOOD_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  "food-culinary",
  "caterer",
  "restaurants-dining",
]);

export interface AttestationShape extends FundamentalsShape {
  /** service_categories.category_key for the listing's category, when it has one. */
  categoryKey: string | null | undefined;
  /** service_categories.slug for the listing's category — the fallback join for keyless rows. */
  categorySlug: string | null | undefined;
}

/** True when the row names a category at all (either identifier is enough). */
export function hasCategorySignal(s: AttestationShape): boolean {
  return !!(s.categoryKey || s.categorySlug);
}

function inCategorySets(
  s: AttestationShape,
  keys: ReadonlySet<string>,
  slugs: ReadonlySet<string>,
): boolean {
  return (!!s.categoryKey && keys.has(s.categoryKey)) || (!!s.categorySlug && slugs.has(s.categorySlug));
}

export function isGuideCategory(s: AttestationShape): boolean {
  return inCategorySets(s, GUIDE_CATEGORY_KEYS, GUIDE_CATEGORY_SLUGS);
}

export function isFoodCategory(s: AttestationShape): boolean {
  return inCategorySets(s, FOOD_CATEGORY_KEYS, FOOD_CATEGORY_SLUGS);
}

// ── The catalog ──────────────────────────────────────────────────────────────────────────────

export interface LocalizedCopy {
  en: string;
  /**
   * MACHINE-AUTHORED platform copy (ruling 60 system A — chrome, not provider content). Native
   * review is OWED and is filed on the EXISTING I18N-1 debt, as a SET with the ruling-65 glossary.
   * This is legally-loaded copy in the launch market; do not treat the JA as reviewed.
   */
  ja: string;
}

export interface AttestationType {
  key: AttestationKey;
  /** Short heading for the checkbox row. */
  label: LocalizedCopy;
  /** The sentence the provider is actually affirming. This IS the record. */
  body: LocalizedCopy;
  /** Why this type exists at all — the concrete risk, stated (ruling 67). */
  rationale: string;
  /** The keying rule in one line, for anyone reading the API response. */
  keying: string;
}

export const ATTESTATION_CATALOG: Readonly<Record<AttestationKey, AttestationType>> = {
  // SS-5 / six-sigma R-1. Japan DEREGULATED paid guiding on 2018-01-04 — no licence is required
  // to trade, and this platform must never behave as though one were. What survived the
  // deregulation is the TITLE: only certified guides may call themselves 通訳案内士, and an
  // unlicensed guide may not use a title implying official certification ("Government certified
  // guide"). Listing name and description are free text with nothing asking, so the honest
  // intervention is an affirmation about the CLAIM, not a gate on the trade.
  title_claim_honesty: {
    key: "title_claim_honesty",
    label: {
      en: "Professional title claims",
      ja: "職業名称に関する表明",
    },
    body: {
      en:
        "I will not describe myself, my business or this listing as a 通訳案内士 (Tsūyaku Annai-shi), " +
        "a government-certified or nationally licensed guide, or use any other title implying an " +
        "official certification I do not actually hold. (Paid guiding in Japan has needed no licence " +
        "since 4 January 2018 — it is the title that is protected, not the work.)",
      ja:
        "私は、実際には保有していない資格を有するかのように、自身・事業・本出品を「通訳案内士」" +
        "「政府公認ガイド」「国家資格ガイド」等と表示したり、公的な認定を示唆する名称を使用したり" +
        "しません。（日本では2018年1月4日以降、有償のガイド業務に免許は不要です。保護されているのは" +
        "業務ではなく名称です。）",
    },
    rationale:
      "The platform gives every provider a free-text listing title and description and asks nothing " +
      "about certification claims; the title is legally protected in the launch market even though " +
      "the work is not licensed. Title-claim affirmation, NOT a licensing gate.",
    keying: "guide/interpreting categories, every delivery method (a pdf itinerary can claim a title too)",
  },

  // Place-anchored delivery is the only shape where the platform puts a traveler physically in a
  // provider's care. The platform verifies nothing and carries no cover, and never says so
  // anywhere the provider can see. This states both halves at the moment of listing.
  in_person_safety_basics: {
    key: "in_person_safety_basics",
    label: {
      en: "Insurance and permits for in-person services",
      ja: "対面サービスの保険・許認可",
    },
    body: {
      en:
        "I hold whatever insurance, permits and local authorisations my activity and locality " +
        "actually require in order to meet travelers in person, and I will keep them current. I " +
        "understand Traveloure does not verify this and provides no insurance cover of its own.",
      ja:
        "私は、対面でお客様に対応するにあたり、実施する活動および地域において実際に必要とされる保険・" +
        "許認可・行政上の届出を保有し、有効に維持します。Traveloure がこれらを確認するものではなく、" +
        "独自の補償を提供するものでもないことを理解しています。",
    },
    rationale:
      "Place-anchored delivery is the only shape that puts a traveler physically in the provider's " +
      "care. The platform runs no insurance check and carries no cover — an unstated fact until now.",
    keying: "place-anchored methods (shared isPlaceAnchored — in_person/hybrid, or productShape=property), any category",
  },

  // Food is the one category family where the platform's own logistics capture (meeting point,
  // party size, in-person delivery) describes an activity that is separately regulated almost
  // everywhere, and where a traveler's exposure is not visible in advance.
  food_safety_disclosure: {
    key: "food_safety_disclosure",
    label: {
      en: "Food handling",
      ja: "食品衛生の遵守",
    },
    body: {
      en:
        "Where I prepare, serve or supply food or drink as part of this service, I comply with the " +
        "food-handling rules and registrations that apply to me locally, and I will disclose " +
        "allergens and ingredients honestly when a traveler asks.",
      ja:
        "本サービスの一環として飲食物の調理・提供・販売を行う場合、私は自身に適用される地域の食品衛生" +
        "規則および営業許可の要件を遵守し、お客様から求められた際にはアレルゲンおよび原材料を正直に" +
        "開示します。",
    },
    rationale:
      "Food-serving categories delivered in person are separately regulated nearly everywhere, and " +
      "the traveler cannot see the exposure in advance. Narrow on purpose: remote food listings " +
      "(a recipe pdf) are not asked.",
    keying: "food categories AND place-anchored methods — both axes, because a food pdf serves nobody",
  },
};

// ── Resolution ───────────────────────────────────────────────────────────────────────────────

export interface AttestationOmission {
  key: AttestationKey;
  code: AttestationOmissionCode;
  /** Localized like the catalog copy — see the reason tables below for why. */
  reason: LocalizedCopy;
}

export interface AttestationResolution {
  applicable: AttestationKey[];
  /** §13: keys we could NOT decide about, each with a stated reason. Never a guess. */
  omitted: AttestationOmission[];
}

// A reason names the missing signal AND what that signal would have decided — per KEY, not one
// shared sentence. (Found by the live wizard probe on the way in: a generic reason rendered the
// same line twice on a listing missing its category, and the second copy described the wrong
// attestation. A reason that does not fit the key it is attached to is a §13 defect, not a
// wording preference.)
// A reason is LOCALIZED like the label/body it sits beside — an omission rendered in English
// inside an otherwise-Japanese card is exactly the mixed-copy failure I18N-2 warns about, and the
// §13 sentence is the one part a provider most needs to understand. (Both defects here were found
// by driving the real wizard: a generic reason rendered twice, and rendered in the wrong language.)
const NO_CATEGORY_REASON: Record<AttestationKey, LocalizedCopy> = {
  title_claim_honesty: {
    en: "this listing has no category yet — we cannot tell whether the guiding title-claim rules apply to it",
    ja: "この出品にはまだカテゴリーが設定されていないため、ガイドの名称表示に関する規定が該当するかどうか判定できません",
  },
  food_safety_disclosure: {
    en: "this listing has no category yet — we cannot tell whether it involves food or drink",
    ja: "この出品にはまだカテゴリーが設定されていないため、飲食物を扱うかどうか判定できません",
  },
  // Never emitted (this key is decided on the method axis alone) — present so the record is total.
  in_person_safety_basics: {
    en: "this listing has no category yet",
    ja: "この出品にはまだカテゴリーが設定されていません",
  },
};
const NO_METHOD_REASON: Record<AttestationKey, LocalizedCopy> = {
  in_person_safety_basics: {
    en: "this listing has no delivery method yet — we cannot tell whether you meet travelers in person",
    ja: "この出品にはまだ提供方法が設定されていないため、お客様と対面するかどうか判定できません",
  },
  food_safety_disclosure: {
    en: "this listing has no delivery method yet — we cannot tell whether food would be served in person",
    ja: "この出品にはまだ提供方法が設定されていないため、対面で飲食物を提供するかどうか判定できません",
  },
  // Never emitted (decided on the category axis alone).
  title_claim_honesty: {
    en: "this listing has no delivery method yet",
    ja: "この出品にはまだ提供方法が設定されていません",
  },
};
const NO_BOTH_REASON: LocalizedCopy = {
  en: "this listing has neither a category nor a delivery method yet — we cannot tell whether food handling applies to it",
  ja: "この出品にはカテゴリーも提供方法も設定されていないため、食品衛生に関する事項が該当するかどうか判定できません",
};

/**
 * THE keying predicate. Server-derived on every read and re-derived on every write; the client
 * calls the same function purely to render the card, never to decide what it is allowed to affirm.
 *
 * Ordering inside each block matters and is deliberate: a decision we CAN make ("this is not a
 * food category, so food handling does not apply") outranks missing data on the other axis. We
 * only omit when the missing signal is genuinely load-bearing for that key.
 */
export function resolveApplicableAttestations(s: AttestationShape): AttestationResolution {
  const applicable: AttestationKey[] = [];
  const omitted: AttestationOmission[] = [];

  const categoryKnown = hasCategorySignal(s);
  const methodKnown = isClassifiable(s);
  const placeAnchored = methodKnown && isPlaceAnchored(s);

  // (1) title_claim_honesty — CATEGORY axis only. Every delivery method: a pdf itinerary sold by
  //     a "government certified guide" makes exactly the claim SS-5 is about.
  if (!categoryKnown) {
    omitted.push({
      key: "title_claim_honesty",
      code: "no_category",
      reason: NO_CATEGORY_REASON.title_claim_honesty,
    });
  } else if (isGuideCategory(s)) {
    applicable.push("title_claim_honesty");
  }

  // (2) in_person_safety_basics — METHOD axis only, via the SHARED isPlaceAnchored predicate.
  if (!methodKnown) {
    omitted.push({
      key: "in_person_safety_basics",
      code: "no_delivery_method",
      reason: NO_METHOD_REASON.in_person_safety_basics,
    });
  } else if (placeAnchored) {
    applicable.push("in_person_safety_basics");
  }

  // (3) food_safety_disclosure — BOTH axes. A known-negative on either axis settles it (silence,
  //     not an omission entry); only genuine ignorance produces an omission.
  const categorySettlesItNegative = categoryKnown && !isFoodCategory(s);
  const methodSettlesItNegative = methodKnown && !placeAnchored;
  if (!categorySettlesItNegative && !methodSettlesItNegative) {
    if (!categoryKnown && !methodKnown) {
      omitted.push({ key: "food_safety_disclosure", code: "no_category", reason: NO_BOTH_REASON });
    } else if (!categoryKnown) {
      omitted.push({
        key: "food_safety_disclosure",
        code: "no_category",
        reason: NO_CATEGORY_REASON.food_safety_disclosure,
      });
    } else if (!methodKnown) {
      omitted.push({
        key: "food_safety_disclosure",
        code: "no_delivery_method",
        reason: NO_METHOD_REASON.food_safety_disclosure,
      });
    } else {
      applicable.push("food_safety_disclosure");
    }
  }

  return { applicable, omitted };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SS-5c — PROTECTED-TITLE SOFT WARNING (docs/DECISIONS.md ruling 69 disposition 5).
//
// Ruling 67 filed the whole of SS-5c and started none of it: *"A provider can affirm
// `title_claim_honesty` and still type 'Government certified guide' into `service_name`/
// `description` — the attestation records a promise, it does not detect a breach."* The
// disposition ratifies the CHEAP HALF only: a submit-time SOFT WARNING that nudges toward the
// attestation. It **never blocks and never auto-edits**. The full product — two-language phrase
// detection at scale, a false-positive policy, and an enforcement/review path that does not exist
// — stays FILED, explicitly.
//
// WHY A SMALL NAMED LIST AND NOT A CLEVER MATCHER. Ruling 67's own note: *"'certified' is
// legitimate in many compounds"*. A broad matcher on a bare word would fire on "PADI certified
// divemaster" (a true, lawful claim) and teach providers to ignore the warning — which is worse
// than not warning at all. So this list contains only phrases that assert OFFICIAL/GOVERNMENT
// sanction, plus the legally protected Japanese title itself. A phrase earns its place here by
// being a claim about the STATE, not about competence.
//
// THIS IS NOT A COMPLIANCE CHECK. A hit means "this reads like a claim of official certification —
// here is the statement it relates to". It is not evidence of a breach, it does not decide
// anything, and its absence proves nothing (§13: the negative space is the whole rest of the
// language).
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The protected/official-sanction phrases. Matched case-insensitively as substrings after
 * whitespace normalisation. Japanese needs no case folding and no word boundaries — 通訳案内士 is
 * the legally protected title itself, and its 士-less stem 通訳案内 is deliberately NOT listed
 * (it is ordinary description: "interpreting and guiding").
 */
export const PROTECTED_TITLE_PHRASES: readonly string[] = [
  // The legally protected Japanese title (SS-5 / ruling 67's research) and the common variants.
  "通訳案内士",
  "全国通訳案内士",
  "地域通訳案内士",
  // English claims of STATE sanction. Each asserts an authority granted this status, which is the
  // claim Japan's 2018 deregulation makes unnecessary and the title law makes unlawful to imply.
  "government certified",
  "government-certified",
  "government licensed",
  "government-licensed",
  "government approved",
  "government-approved",
  "nationally certified",
  "nationally-certified",
  "national guide license",
  "national guide licence",
  "licensed national guide",
  "certified national guide",
  "officially certified guide",
  "state certified guide",
  "state-certified guide",
];

export interface ProtectedTitleWarning {
  /** The phrases that matched, as written in this list (not as written by the provider). */
  matches: string[];
  /** Which listing fields they were found in. */
  fields: ("serviceName" | "description")[];
  /** The attestation this nudges toward — always the SS-5 one. */
  attestationKey: AttestationKey;
  message: LocalizedCopy;
}

const PROTECTED_TITLE_MESSAGE: LocalizedCopy = {
  en:
    "This listing's wording reads like a claim of official or government certification. Guiding in Japan has not required a licence since 2018, but the title 通訳案内士 is legally protected — please make sure the wording is accurate, and review the confirmation about how you describe your qualifications.",
  ja:
    "この出品の文言は、公的機関による認定を主張しているように読めます。日本では2018年以降ガイド業に資格は不要ですが、「通訳案内士」の名称は法律で保護されています。記載内容が正確かご確認のうえ、資格の表示に関する確認事項をご覧ください。",
};

/**
 * Scan a listing's own free text for protected-title claims. Returns null when nothing matched —
 * which, per the header, is NOT a clean bill of health.
 *
 * Never throws, never mutates its input, and has no side effects: a warning is advisory data the
 * caller attaches to a successful response.
 */
export function detectProtectedTitleClaims(input: {
  serviceName?: string | null;
  description?: string | null;
}): ProtectedTitleWarning | null {
  const fields: ("serviceName" | "description")[] = [];
  const matches = new Set<string>();

  const scan = (raw: string | null | undefined, field: "serviceName" | "description") => {
    if (typeof raw !== "string" || !raw.trim()) return;
    // Normalise runs of whitespace (including full-width spaces) so "government   certified"
    // and a line break between the words both match.
    const hay = raw.replace(/[\s　]+/g, " ").toLowerCase();
    let hitHere = false;
    for (const phrase of PROTECTED_TITLE_PHRASES) {
      if (hay.includes(phrase.toLowerCase())) {
        matches.add(phrase);
        hitHere = true;
      }
    }
    if (hitHere) fields.push(field);
  };

  scan(input.serviceName, "serviceName");
  scan(input.description, "description");

  if (matches.size === 0) return null;
  return {
    matches: Array.from(matches),
    fields,
    attestationKey: "title_claim_honesty",
    message: PROTECTED_TITLE_MESSAGE,
  };
}
