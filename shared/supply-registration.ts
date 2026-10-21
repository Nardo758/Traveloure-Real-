/**
 * Supply registration answers shared by the wizards, the insert schemas, and the
 * review/admin readers (ledger `2026-10-21-supply-registration-fixes`).
 *
 * Phone is optional on step 1. A blank is allowed. A number that was typed is checked
 * here, once, so the two wizards and the two insert schemas cannot drift.
 *
 * Insurance and licences have three stored answers. `null` is unanswered and every
 * reader omits it. `true` is yes. `false` is Not applicable — a chosen answer, not a
 * blank and not a "no".
 */

export const PROVIDER_BUSINESS_TYPES = [
  "Individual",
  "Sole Proprietorship",
  "Partnership",
  "LLC",
  "Corporation",
  "Non-Profit",
] as const;

export const OPTIONAL_PHONE_ERROR =
  "Enter a phone number with 7 to 15 digits, or leave this blank.";

const PHONE_CHARS = /^[0-9+().\-\s]+$/;

/** Null when the value is blank or a usable phone number. */
export function optionalPhoneError(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!PHONE_CHARS.test(trimmed) || digits.length < 7 || digits.length > 15) {
    return OPTIONAL_PHONE_ERROR;
  }
  return null;
}

export const ATTESTATION_YES = "Yes";
export const ATTESTATION_NOT_APPLICABLE = "Not applicable";

/** The words a review or admin screen shows, or null when the applicant has not answered. */
export function attestationLabel(value: boolean | null | undefined): string | null {
  if (value === true) return ATTESTATION_YES;
  if (value === false) return ATTESTATION_NOT_APPLICABLE;
  return null;
}

/**
 * Old local drafts stored an unticked box as `false`. That value now means Not applicable,
 * so a draft written before `attestationAnswers` existed is read as unanswered unless the
 * applicant had actually ticked yes.
 */
export function restoreAttestationAnswers(saved: {
  hasInsurance?: boolean | null;
  hasLicense?: boolean | null;
  attestationAnswers?: boolean;
} | null | undefined): {
  hasInsurance: boolean | null;
  hasLicense: boolean | null;
  attestationAnswers: true;
} {
  if (!saved || !Object.prototype.hasOwnProperty.call(saved, "attestationAnswers")) {
    return {
      hasInsurance: saved?.hasInsurance === true ? true : null,
      hasLicense: saved?.hasLicense === true ? true : null,
      attestationAnswers: true,
    };
  }
  return {
    hasInsurance: saved.hasInsurance ?? null,
    hasLicense: saved.hasLicense ?? null,
    attestationAnswers: true,
  };
}
