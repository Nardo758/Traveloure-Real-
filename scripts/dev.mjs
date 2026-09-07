/**
 * Cross-platform dev entry for `npm run dev`.
 *
 * Why this exists: the old script was `NODE_ENV=development tsx server/index.ts`,
 * whose POSIX VAR=value prefix only works in bash — cmd.exe and PowerShell (what
 * a Windows preview runner spawns) fail on it. Node runs identically everywhere,
 * so the env is set here and every CLI arg (e.g. `-- --port 7100 --host 0.0.0.0`
 * from a preview runner) is forwarded to the server verbatim.
 *
 * In production nothing changes: `npm start` runs the esbuild bundle where
 * `process.env.NODE_ENV` is compiled to the literal "production" (script/build.ts).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Spawn node + tsx's JS entry directly — NEVER npx/npx.cmd: spawning a .cmd
// without shell:true throws EINVAL on modern Node/Windows, and shell:true
// re-parses the args. process.execPath is the same Node that's running this.
const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
const child = spawn(process.execPath, [tsxCli, "server/index.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
