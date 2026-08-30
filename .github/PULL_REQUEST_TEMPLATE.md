<!-- Merge write-back checklist (DECISIONS.md ruling 26 §4; content locked by ruling 30 — additions require a ruling). -->

- [ ] **CLAUDE.md delta** for any state this merge changed — or explicit "no delta".
- [ ] **Expired** any `deferred:` / expected-fail tags this merge satisfies.
- [ ] **`superseded@<sha>`** annotation appended to any brief section whose volatile claims this merge invalidated (annotation, not rewrite).
- [ ] **Ledger append** (docs/DECISIONS.md) if this lane executed or amended a ruling (implementation reference added to the ruling's line — as a new entry, never an edit).
