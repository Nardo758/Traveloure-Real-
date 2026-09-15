/**
 * D-40 — THE HYBRID LISTING'S DECLARED ARTIFACT: admission, in ONE implementation with two callers.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-40 = option A, hybrid sub-question = YES; ledger
 * `2026-09-15-d24-d26-acceptance-columns`; migration 303). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part II §10.
 *
 * WHAT IT IS. `POST` and `PATCH /api/provider/services` both admit
 * `provider_services.declared_artifact_deliverable` through the pick-based, `.strict()`
 * `providerServiceDeclaredArtifactSchema` (§19 — the generic body schema `.omit()`s the column, so
 * nothing else on either rail can set it). This module is the ONE reading of that field off a
 * request body; two copies of an admission decision is the derivation-drift class §18 rule 1 names.
 * It is the `admitExpertOfferingTypeKey` shape one column over, deliberately.
 *
 * KEY-PRESENCE, NOT `??`. An explicit `null` is a WITHDRAWAL of the declaration — an honest state —
 * and it is a different fact from an ABSENT key, which means "this write is not about the declared
 * artifact" and must leave the column exactly as it is. An unrelated edit never wipes it.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, stated because green means green-within-stated-bounds (§18d):
 *  · **The DELIVERY METHOD is not consulted here.** A non-hybrid listing may carry the column
 *    without effect: `acceptanceModeFor` (`shared/acceptance-window.ts`) reads `hybrid` + a declared
 *    artifact and nothing else, so a `pdf` listing is already `gates_completion` by its own rule and
 *    an `in_person` one takes no acceptance whatever this column says. Refusing the write would be a
 *    SECOND place the D-40 predicate is stated, and the day the ruling widens to another method the
 *    two would disagree — which is exactly the drift §18 rule 1 names. ONE predicate, in the shared
 *    module, read by every decision.
 *  · **It grants nothing and claims nothing.** Declaring an artifact says the listing also produces
 *    a document; it makes no claim about quality, credentials or verification, and it moves no
 *    money: acceptance of a hybrid's declared artifact gates NO completion and NO mint.
 *
 * IT IS AN IDENTITY EDIT UNDER CLAUDE.md §23. Adding an acceptance obligation changes what a buyer
 * is committing to, so on an APPROVED listing it is staged into `pending_changes` rather than
 * applied to the live row — through `IDENTITY_EDIT_FIELDS` (`shared/edit-split.ts`), which the PATCH
 * handler already iterates. The split stays decided ONLY in that handler; this module never decides
 * a lane.
 */
import { providerServiceDeclaredArtifactSchema } from "@shared/schema";

export interface DeclaredArtifactRefusal {
  status: number;
  body: { message: string; code: "INVALID_DECLARED_ARTIFACT" };
}

export interface DeclaredArtifactAdmission {
  /** `false` = the body never mentioned the field; the caller must leave the column alone. */
  present: boolean;
  /** The value to write. `null` = an explicit withdrawal of the declaration. */
  value: string | null;
  refusal: DeclaredArtifactRefusal | null;
}

const ABSENT: DeclaredArtifactAdmission = { present: false, value: null, refusal: null };

export function admitDeclaredArtifactDeliverable(body: unknown): DeclaredArtifactAdmission {
  if (!body || typeof body !== "object") return ABSENT;
  if (!Object.prototype.hasOwnProperty.call(body, "declaredArtifactDeliverable")) return ABSENT;

  // `.strict()` refuses an unknown key, so the object handed to it is exactly this one field.
  const parsed = providerServiceDeclaredArtifactSchema.safeParse({
    declaredArtifactDeliverable: (body as Record<string, unknown>).declaredArtifactDeliverable,
  });
  if (!parsed.success) {
    return {
      present: true,
      value: null,
      refusal: {
        status: 400,
        body: {
          // §13: a refusal is a sentence. It says what a good answer looks like rather than echoing
          // a validator's shape.
          message:
            "Name the one deliverable this listing also produces (up to 200 characters), or clear it to declare none.",
          code: "INVALID_DECLARED_ARTIFACT",
        },
      },
    };
  }
  return { present: true, value: parsed.data.declaredArtifactDeliverable, refusal: null };
}
