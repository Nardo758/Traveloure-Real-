import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";

// Real build SHA for GET /api/version + GET /api/health (server/services/build-info.ts) —
// Replit's Autoscale deploy does not inject a GIT_COMMIT env var at runtime, so the endpoint
// always reported "dev" in production. Embedding the SHA at bundle time via esbuild's `define`
// fixes that without depending on any runtime env.
//
// FULL sha, not `--short`: `.github/workflows/e2e-tests.yml` compares the deploy's reported sha
// against `$GITHUB_SHA` (40 chars), so a short sha there could never match even on a perfectly
// fresh deploy — the freshness check silently reported "STALE DEPLOY" forever.
//
// §13: "" (never a placeholder that reads like a real value) when no git repo is available — e.g.
// a tarball build outside a checkout. `build-info.ts` treats a non-sha as ABSENT and falls through
// to its next source, ending at `commit: null, source: "unknown"`.
function getGitSha(): string {
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : "";
  } catch {
    return "";
  }
}

// The COMMIT time (`%cI`), not `new Date()` — two builds of the same commit then agree.
function getBuiltAt(): string {
  try {
    const iso = execSync("git show -s --format=%cI HEAD", { encoding: "utf-8" }).trim();
    return Number.isNaN(new Date(iso).getTime()) ? "" : new Date(iso).toISOString();
  } catch {
    return "";
  }
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "__GIT_SHA__": JSON.stringify(getGitSha()),
      "__BUILT_AT__": JSON.stringify(getBuiltAt()),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
