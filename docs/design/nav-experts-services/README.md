# Nav proof captures — provenance

`experts-services-LIVE.png` and `marketplace-LIVE.png` were captured from the
**production client (`client/src`)** served by a local dev server at branch commit
`e1905398` (`claude/sync-local-repo-2j7ghv`). They prove the ratified 4-item
"Experts & Services" dropdown (Service Providers, Local Experts, Trip Planners,
Event Planners) as rendered by `client/src/lib/nav-config.ts` at that commit.

They were NOT captured from the parallel `artifacts/traveloure` app, whose own
`nav-config.ts` is stale (3 items, no Service Providers / Event Planners) — that tree
is a design reference only, never a deploy target (ledger
`2026-08-24-client-tree-canonical`). If a screenshot of the site shows the 3-item
dropdown, check which frontend served it before reporting a regression.
