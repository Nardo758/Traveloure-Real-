# Part 7 gate — READY FOR PART 8, with accepted carried-forward blockers

## Final rule matrix

| Part 7 rule / open item | Status | Evidence | Loop count / clean loops |
|---|---|---|---|
| Exact classification before further removal | APPROVED; cleanup deferred | Founder approved the eight REMOVE proposals and deferred cleanup; historical identities remain explicitly UNKNOWN and are accepted as carried-forward blockers | One read-only classification; zero additional removals |
| Remove original mutation hooks, 37 wrappers, lifecycle helpers and unregistered drafts | ACCEPTED CARRIED-FORWARD BLOCKER | Exact historical identities remain unavailable; founder explicitly accepted this unresolved requirement for Part 7 readiness; no guessed deletion or replacement of valid registry wrappers | 0 / 0; removal remains unproven, not certified by absence |
| Keep shared cancellation, locks, timezone, registry, outbox and paid/send checks | PASS for inspected current dependencies | Existing import inventory, zero runtime edits, full historical regression set restored | 2 / 2 |
| Archive full 15-trigger DDL before DEV uninstall; zero DEV commerce triggers | PASS | Draft PR #1391 has full DDL; guarded uninstall completed earlier; fresh catalog: commerce triggers 0, protected itinerary triggers 5, commerce dedupe index 1 | Two prior post-removal catalog checks plus fresh read; 2 clean post-removal checks |
| No new migration; main owns 346 and 347 | PASS | No migration or registry file changed; only disposable fixture namespaces created/dropped | Entire task scope; no migration change |
| Keep commerce-step1 documentation | PASS for existing files | No documentation deleted; missing source reports are documented as missing, not fabricated | Entire task scope |
| Direct senders untouched; ten-family inventory and unused helper | PASS for current-source inventory | `commerce-direct-senders.md`; all grouped variants and extra operational paths identified; vendor bulk first; historical labels not assumed | One read-only inventory |
| Original golden runner restored and coverage explained | PASS | Three original verification files restored unchanged; `commerce-part7-golden-db-proof.md`; every stage-qualified name matches historical evidence | 2 / 2; 143/143 each |
| Full itinerary DB proof after trigger removal | PASS for the existing full itinerary regression set | Fresh isolated DB+private HTTP stage: 20 named leaf tests each loop, plus generation-authoritative DB tests; per-rule counts in DB proof report | 2 / 2 |
| Full signup DB proof | PASS | 13 DB leaf tests each loop; 7 pure guard/wiring tests and 2 parent summaries; no live transport | 2 / 2 |
| Corrected test and new cart-write-only assertions | PASS | Final isolated native suite 75/75 each loop, zero skips; cart authorship/guest claim/projection enqueue zero rows; only explicit setup + guarded producer rows exist after cleanup and benchmark | 2 / 2 outer loops; 2 randomized inner loops each |
| No references to removed helper | PASS for actual removals; remainder accepted as carried forward | Removed trigger instances have no remaining callers; backing functions remain; no TS helper was removed, so the original 37-wrapper condition remains unproven and explicitly carried forward | Catalog/source search; not a vacuous all-legacy claim |
| Build and fresh typecheck | PASS AT BASELINE | Build exit 0; typecheck 117 diagnostics, no corrected/restored test diagnostics; test wiring passes | One fresh build/typecheck/wiring pass |
| Current guard batch | PASS | Restored runner's `--guards-only`: 78/78 | One fresh batch |
| Implementation PR carries corrected fixture | PRESERVED; merge gate required | Dedicated `work/commerce-part7-verified-carry-20261010` source branch includes the corrected file, restored runner and reports. Documentation PR #1391 is not the implementation carrier | Source-tree/hash verification; final commit/remote details recorded in PR body |

## Explicitly accepted carried-forward blockers

1. Original 37-wrapper, mutation-hook, lifecycle-helper and unregistered-trigger
   draft identities are still UNKNOWN. The founder explicitly accepted these as
   carried-forward blockers. This is not evidence that their removal occurred.
2. Eight SQL backing functions are classified REMOVE with founder approval,
   but cleanup is explicitly deferred. All remain installed. Approval of the
   proposal does not authorize executing development DDL now; actual cleanup
   requires a later explicit instruction.

No further deletion or DDL is performed. The original 15-trigger archive and
uninstall stand; no production action is needed. Only approval documentation
changed after the recorded passing verification; no tests were rerun or results
invented for this documentation-only update.

## Merge carriage

The corrected test did not exist on the base of the documentation PR. Copying
it alone onto main would omit its development implementation dependencies.
The dedicated carry branch preserves the complete tested source tree instead.
The eventual commerce implementation PR must include:

- `server/__tests__/cart-email-state.db.test.ts`, including the guarded producer,
  dispatcher hold, dedupe/snapshot and zero-writer-email assertions;
- the three restored golden verification infrastructure files;
- the implementation dependencies already present on the tested source branch.

Before any merge, inspect that actual implementation PR's file list and file
content against the carry branch. A documentation-only PR or body diff is not
enough. No implementation PR, main merge, publication or release activation is
claimed by this report.

Normal commerce sending and Parts 4–6 payment-provenance/must-have-ordering
release blockers remain unchanged. Historical regression parity is not all-rail
release certification. Part 8 is not started.

**READY FOR PART 8:** the remaining decisions are approved or explicitly accepted
as carried-forward blockers. This is development progression readiness, not
RELEASE-CERTIFIED status. Wait for the founder to provide Part 8 before starting.
