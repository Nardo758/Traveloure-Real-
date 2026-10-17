# infra/osrm — the self-hosted OSRM VM (9a-ii)

Ledger `2026-10-17-9a-ii-osrm-vm`. Serves the planning-tier `drive` and `walk` legs that
`server/services/routing/osrm-routing-adapter.ts` asks for. Kyoto only for now.

| File | Runs where | What |
|---|---|---|
| `build.sh` | workspace | Downloads Geofabrik Kansai, checks its md5, clips separately for wide-area `driving` (car.lua) and Kyoto-city `foot` (foot.lua), builds both with MLD into `data/`, writes `data/EXTRACT.txt` (extract date = the "checked <date>" on legs). |
| `start.sh` | VM | Two `osrm-routed --mmap` on 127.0.0.1:5001/5002 behind `proxy.mjs`. Builds nothing. |
| `proxy.mjs` | VM | The one public port. Allowlist: `GET /<prefix>/route/v1/{driving,foot}/<2 points>?overview=false&steps=false&alternatives=false`. Everything else is 404 with no body. |
| `proxy.test.mjs` | CI | OP1–OP6. |
| `.replit.example`, `replit.nix.example` | dedicated OSRM Repl | Root configuration templates: copy as `.replit` and `replit.nix` to the repository root in that Repl only. Replit's config guard blocks writing even nested files with the exact config names. |

Driving retains `BBOX=134.80,34.33,136.11,35.83` for Kyoto plus Osaka Bay/KIX.
Foot uses `FOOT_BBOX=135.60,34.85,135.90,35.15` for Kyoto city only.
Each profile builds from its own clip. `data/EXTRACT.txt` records the driving bbox
as `bbox` and the foot bbox as `foot_bbox`.

The public proxy still accepts **exactly two coordinate points**, unchanged.
The upstream engines use `--max-viaroute-size 3` because OSRM 5.26 rejects 2 at
startup; that engine limit does not widen the proxy allowlist. Both engines use
`--mmap`; memory usage must be measured again after rebuilding.

## Operator steps (Replit)

1. A separate Repl that clones this repo. Copy `infra/osrm/.replit.example` to `.replit` and `infra/osrm/replit.nix.example` to `replit.nix` at its repository root (not into the Platform Repl's root), using Replit's validated configuration tools where required. The templates declare `osrm-backend`, `osmium-tool` and `nodejs_20`, and run `bash infra/osrm/start.sh` from the repository root. If Replit requires its supported dependency tool instead of direct config edits, install the same three packages through that tool.
2. In its workspace: `bash infra/osrm/build.sh`. `data/` and `build/` are gitignored and never committed.
3. Before you buy a VM size, record `du -sh data/driving data/foot`. After startup and 60 seconds without requests, record each `osrm-routed` RSS in KiB with `ps -C osrm-routed -o pid=,rss=,args=`. Send 20 local route requests to each profile, then record both processes' RSS again. Report data size and idle/after-20 RSS per profile before purchase.
4. Reserved VM deployment. Run command: `bash infra/osrm/start.sh`. Expose one port, 8080.
5. Secrets. The prefix is ≥32 random bytes, base64url. It is generated once and held only as production secrets. It never goes in files, the repo or chat.
   - OSRM Repl deployment: `OSRM_PATH_PREFIX=<prefix>`.
   - Platform production: `OSRM_BASE_URL=https://<osrm host>/<prefix>`.
   - The adapter defaults (`driving`, `foot`) already match, so no profile variables are needed.
6. `OSRM_ENABLED` stays unset until the smoke passes: `npx tsx scripts/smoke-osrm-kyoto.ts`, with `OSRM_BASE_URL` read from the environment. The smoke prints the host only.

To refresh the map data, re-run `build.sh` in the workspace and redeploy.
