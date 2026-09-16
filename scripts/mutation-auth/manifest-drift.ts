/**
 * THE DRIFT PREDICATE for the generated mutation-auth manifest — line numbers are NOT in it.
 *
 * Ledger `2026-09-16-ci-main-red-repairs`. `generate-mutation-auth-manifest.ts --check` used to
 * compare the regenerated JSON and Markdown BYTE-FOR-BYTE against the committed files. Every
 * mutation carries the `line` its registration sits on, so ANY merge that shifted a line in any
 * mounted route file — 513 line-only diffs on the night this was diagnosed, zero rails changed —
 * turned the check red. A guard that is red whenever the tree moves is a guard nobody reads.
 *
 * A RAIL is identified by what an authorization audit actually probes: METHOD + normalized PATH +
 * the SOURCE file it is mounted from + the GUARD SET the extractor derived (risk class, expected
 * auth, expected roles, expected boundary, expected ownership, whether ownership applies). Two
 * registrations of the same method+path (a monolith copy shadowing a router twin) are two
 * entries, so a lost or gained shadow is drift too. `line`, `rawPath` (trailing-slash spelling)
 * and the per-mutation extraction `diagnostics` are OUT of the predicate: they are kept in the
 * files for the humans who open them and change nothing about which rail is guarded by what.
 *
 * STATED NEGATIVE SPACE: a route whose HANDLER changed without its guard chain, method, path or
 * mount file changing is invisible here — this predicate reads the extractor's classification,
 * not the handler body. That is `check-money-endpoints.cjs`'s job, not this one's.
 */

export type RailLike = {
  method: string;
  effectivePath: string;
  source: string;
  risk: string;
  expectedAuth: string;
  expectedRoles: readonly string[];
  expectedBoundary: string;
  expectedOwnership: string;
  ownershipApplies: boolean;
};

/** One rail → one stable string. Sorted roles so ordering noise is not drift. */
export function railKey(m: RailLike): string {
  return [
    m.method,
    m.effectivePath,
    m.source,
    m.risk,
    m.expectedAuth,
    [...m.expectedRoles].sort().join(","),
    m.expectedBoundary,
    m.expectedOwnership,
    m.ownershipApplies ? "ownership-applies" : "ownership-n/a",
  ].join(" | ");
}

/** The whole manifest's rail set, as a sorted multiset (duplicates preserved on purpose). */
export function railSignature(mutations: readonly RailLike[]): string[] {
  return mutations.map(railKey).sort();
}

export type Drift = { added: string[]; removed: string[] };

/**
 * Multiset difference between the committed manifest's rails and the freshly extracted ones.
 * Empty on both sides ⇒ no drift, whatever the line numbers did.
 */
export function diffRails(previous: readonly RailLike[], current: readonly RailLike[]): Drift {
  const count = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const prev = count(railSignature(previous));
  const curr = count(railSignature(current));
  const added: string[] = [];
  const removed: string[] = [];
  for (const [k, n] of curr) {
    const p = prev.get(k) ?? 0;
    for (let i = p; i < n; i++) added.push(k);
  }
  for (const [k, n] of prev) {
    const c = curr.get(k) ?? 0;
    for (let i = c; i < n; i++) removed.push(k);
  }
  return { added: added.sort(), removed: removed.sort() };
}

export function hasDrift(d: Drift): boolean {
  return d.added.length > 0 || d.removed.length > 0;
}
