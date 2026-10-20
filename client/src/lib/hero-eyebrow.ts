/**
 * The destination hero's eyebrow: DESTINATION · {COUNTRY}, the country omitted when unknown (§13). SH-1 item 2 (ledger
 * `2026-10-19-sh1-banned-copy`): no TREND score, whatever the resolver returns.
 */
export function heroEyebrowFragments(country: string | null): string[] {
  const fragments = ["DESTINATION"];
  if (country) fragments.push(country.toUpperCase());
  return fragments;
}
