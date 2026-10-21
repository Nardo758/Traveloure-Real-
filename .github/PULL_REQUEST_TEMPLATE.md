<!-- Merge write-back checklist (DECISIONS.md ruling 26 §4; content locked by ruling 30 — additions require a ruling). -->

- [ ] **CLAUDE.md delta** for any state this merge changed — or explicit "no delta".
- [ ] **Expired** any `deferred:` / expected-fail tags this merge satisfies.
- [ ] **`superseded@<sha>`** annotation appended to any brief section whose volatile claims this merge invalidated (annotation, not rewrite).
- [ ] **Ledger file** (`docs/decisions/pending/<YYYY-MM-DD-slug>.md`, one row, `R?`) if this lane executed or amended a ruling — a new file, never an edit of an existing row or of `docs/DECISIONS.md`.
