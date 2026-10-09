/**
 * THE TRIP PASS RUN ALLOWANCE, SAID ONCE (ledger `2026-10-08-trip-pass-five-runs`; R-ac, ruling 3 of
 * `2026-10-08-slip-main-rail`). A pass covers a CAPPED number of full Optimize runs on its trip —
 * `TRIP_PASS_RUNS_PER_TRIP` on the server, default 5 — and AI tasks are what stays unlimited. Every
 * surface that sells or shows the pass reads the server's number through these, never a literal
 * (§18 rule 1), so the card and /pricing cannot disagree the day the config moves.
 */

/** "5 optimizer runs" from the server's count; "optimizer runs" when no count arrived (§13). */
export function tripPassRunsPhrase(runs: number | null | undefined): string {
  return typeof runs === "number" && Number.isFinite(runs) && runs > 0
    ? `${runs} optimizer ${runs === 1 ? "run" : "runs"}`
    : "optimizer runs";
}

/** The /pricing checklist line: "5 optimizer runs + unlimited AI tasks on that trip". */
export function tripPassPricingLine(runs: number | null | undefined): string {
  const phrase = tripPassRunsPhrase(runs);
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} + unlimited AI tasks on that trip`;
}
