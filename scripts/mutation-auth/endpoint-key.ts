/**
 * THE ONE spelling of a mutation-auth ENDPOINT — `METHOD effectivePath` — and the grouping
 * every consumer of the generated manifest derives from it (CLAUDE.md §18 rule 1: one
 * implementation, callers).
 *
 * Ledger `2026-09-16-ci-manifest-pin-role-auth-mock`. The manifest generator, the coverage
 * generator and three audit suites each re-typed `${method} ${effectivePath}` for themselves,
 * and one of those suites then pinned the number of unique keys as a LITERAL (`575`). The
 * literal was a hand-copied derivative of the manifest: when three rails landed and the
 * generator honestly wrote 578, the suite compared the file against a number nobody had
 * re-copied and turned CI red on main — the exact drift class §18 rule 1 names. A consumer
 * that needs the unique-endpoint count DERIVES it from the manifest's own rows through this
 * module and never writes it down.
 *
 * `groupByEndpoint` keeps FIRST-REGISTRATION order and every registration under its key, so
 * the generator's "first registration classifies the endpoint" rule and the audits' "one
 * effective row per endpoint" rule read the same grouping.
 */

export type EndpointLike = { method: string; effectivePath: string };

/** One endpoint → one stable string. The normalized (effective) path, never the raw spelling. */
export const endpointKey = (mutation: EndpointLike): string =>
  `${mutation.method} ${mutation.effectivePath}`;

/** Every registration under its endpoint key, keys in first-seen order. */
export function groupByEndpoint<T extends EndpointLike>(mutations: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const mutation of mutations) {
    const key = endpointKey(mutation);
    grouped.set(key, [...(grouped.get(key) ?? []), mutation]);
  }
  return grouped;
}

/** The set of unique endpoint keys — what `uniqueMethodNormalizedPathCount` counts. */
export function uniqueEndpointKeys(mutations: readonly EndpointLike[]): Set<string> {
  return new Set(groupByEndpoint(mutations).keys());
}
