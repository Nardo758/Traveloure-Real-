/**
 * dedupe.ts — cross-spec-file dedupe flags for findings that describe the SAME class of
 * R-1 write regardless of which spec (S1/S2/S3) triggers it (e.g. the seeded meeting-pin
 * fallback). All three spec files run in ONE Playwright worker process for this suite
 * (test.describe.configure({mode:'serial'}) + a single `playwright test` invocation with
 * all three files), so a plain module-level object survives across them — this is the
 * shared home for flags that would otherwise be re-declared per file and file the same
 * finding two or three times (lead review, findings hygiene: one finding per distinct
 * write kind for the WHOLE run, not per spec file).
 */
export const dedupe = {
  filedMeetingPinFinding: false,
  filedBornSubmittedRaceFinding: false,
};
