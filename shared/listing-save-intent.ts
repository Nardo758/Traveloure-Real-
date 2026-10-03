/**
 * LISTING SAVE INTENT — the only way a request body asks for a private draft.
 *
 * `insertProviderServiceSchema` omits `approvalStatus` (§19). Storage still honors an explicit
 * `approvalStatus: "draft"`, but the omit meant the wizard's Save-as-Draft never reached it, so
 * every create was born `submitted` and entered the admin review queue — including a $0 listing
 * with no category (roles-dev QA H2).
 *
 * This admission is a pick of one field. `draft` is the private save. `submit` is an explicit
 * request to enter review. An absent field is not a draft: F2's born-`submitted` default stands
 * for every other create (HTTP fixtures, duplicates, publish). A value outside the pair is a 400,
 * never coerced into a draft and never into `approved`.
 */
import { z } from "zod";

const listingSaveIntentSchema = z
  .object({
    saveIntent: z.enum(["draft", "submit"]),
  })
  .strict();

export type ListingSaveIntentAdmission =
  | { ok: true; draft: boolean; submit: boolean }
  | { ok: false; status: 400; body: { message: string; code: "INVALID_SAVE_INTENT" } };

export function admitListingSaveIntent(body: unknown): ListingSaveIntentAdmission {
  if (body == null || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "saveIntent")) {
    return { ok: true, draft: false, submit: false };
  }
  const parsed = listingSaveIntentSchema.safeParse({ saveIntent: (body as { saveIntent: unknown }).saveIntent });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        message: "saveIntent must be draft or submit.",
        code: "INVALID_SAVE_INTENT",
      },
    };
  }
  return {
    ok: true,
    draft: parsed.data.saveIntent === "draft",
    submit: parsed.data.saveIntent === "submit",
  };
}
