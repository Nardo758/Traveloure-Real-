/**
 * TRACK A STEP A7 — the paid run, one version per hotel — its switch (ledger
 * `2026-09-30-a7-version-per-option`; product map §M5 / §F2; R128).
 *
 * OFF unless an operator sets `OPTIMIZER_VERSION_PER_OPTION_ENABLED=1` (R211: built ahead of the
 * visual artifact and the census, behind a flag). With it off, a run anchors exactly as before, the
 * comparison read carries no badges or option picks, adopt never chooses a set, the preview carries
 * no open-comparison count, `POST …/adopt-stops` answers 404, and no `slip_version_adopted` row is
 * written — today, unchanged.
 */
export function versionPerOptionEnabled(): boolean {
  return process.env.OPTIMIZER_VERSION_PER_OPTION_ENABLED === "1";
}
