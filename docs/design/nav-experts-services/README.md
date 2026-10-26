# Nav proof captures — provenance

`experts-services-LIVE.png` and `marketplace-LIVE.png` were captured from the
**production client (`client/src`)** served by a local dev server at branch commit
`e1905398` (`claude/sync-local-repo-2j7ghv`). They prove the ratified 4-item
"Experts & Services" dropdown (Service Providers, Local Experts, Trip Planners,
Event Planners) as rendered by `client/src/lib/nav-config.ts` at that commit.

They were captured from `client/src`, which is the sole production client. The parallel
`artifacts/traveloure` app (whose `nav-config.ts` was a stale 3-item menu) was deleted
on 2026-10-25 (ledger `2026-10-25-delete-artifacts-traveloure`). That deletion supersedes
the design-reference-only rule in `2026-08-24-client-tree-canonical` for this tree.
