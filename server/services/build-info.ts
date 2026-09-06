/**
 * BUILD IDENTITY — what commit is this process actually running?
 *
 * Post-publish QA (2026-09-05) could not answer that question for three deploy checks in a row.
 * `GET /api/health` returned `{status, db, timestamp}` and nothing else, and `GET /api/version`
 * returned a SHORT sha under the key `sha` — which `.github/workflows/e2e-tests.yml` then
 * compares against `$GITHUB_SHA`, a FULL 40-char sha, so that comparison could never match even
 * on a perfectly fresh deploy. The only remaining way to tell one build from another was to diff
 * the Vite bundle hash by hand.
 *
 * ONE implementation, resolved ONCE at boot (CLAUDE.md §18 rule 1) and served verbatim by BOTH
 * `GET /api/version` and `GET /api/health`. A second resolver is how the two endpoints would
 * start disagreeing about which commit is live.
 *
 * §13 — NOTHING HERE IS EVER FABRICATED. Every source is tried in order and the FIRST hit wins;
 * when they all miss, `commit` is `null` and `source` is `"unknown"`. A guessed sha is worse
 * than no sha, because it looks authoritative: a deploy check would compare it, match nothing,
 * and blame the code. `builtAt` and `bundle` follow the same rule — absent means never captured.
 *
 * RESOLUTION ORDER (first hit wins):
 *   1. env      — `GIT_COMMIT` / `GIT_SHA` / `SOURCE_COMMIT` / `SOURCE_VERSION`.
 *                 EVIDENCE that Replit Autoscale injects NONE of these: docs/STAGING.md §4.6
 *                 ("production does not inject it"), docs/audits/e2e-model-b-triage.md
 *                 ("does not inject GIT_COMMIT ... so GET /api/version returns 'dev'"), and
 *                 `.replit [deployment]`, which sets no env at all. `GIT_COMMIT` is real in CI:
 *                 ~20 workflows set `GIT_COMMIT: ${{ github.sha }}` for app-in-Actions gates.
 *                 No env name is invented here — every one is a name this repo already uses.
 *   2. file     — `build-info.json`, written next to the server bundle by
 *                 `scripts/write-build-info.cjs` (npm `build`). This is the source that actually
 *                 works on Replit Autoscale, because it needs neither an env var nor a `.git`
 *                 directory at RUNTIME. It also carries `builtAt` and the client `bundle` hash.
 *   3. embedded — `__GIT_SHA__` / `__BUILT_AT__`, substituted into the bundle by esbuild's
 *                 `define` (script/build.ts). Kept as a second build-time source so a build whose
 *                 `build-info.json` was lost still reports a real commit.
 *   4. git      — `.git/HEAD` (+ `.git/packed-refs`) read directly, no child process. Last
 *                 resort: true in dev and in a git checkout, absent in the deployed container.
 */
import fs from "fs";
import path from "path";

/** Injected by esbuild `define` at bundle time; absent under dev-mode tsx. */
declare const __GIT_SHA__: string | undefined;
declare const __BUILT_AT__: string | undefined;

export type BuildInfoSource = "env" | "file" | "embedded" | "git" | "unknown";

export interface BuildInfo {
  /** Full 40-char commit sha, or null when no source could name it (§13 — never guessed). */
  commit: string | null;
  /** First 7 chars of `commit`, or null. Derived — never read from anywhere independently. */
  commitShort: string | null;
  /** ISO-8601 build (or commit) timestamp, or null when not captured. */
  builtAt: string | null;
  /** Vite index chunk hash, present ONLY when the build recorded one. */
  bundle?: string;
  /** Which of the ordered sources answered. `"unknown"` means none did. */
  source: BuildInfoSource;
}

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const ANY_SHA_RE = /^[0-9a-f]{7,40}$/i;

/** A sha we are willing to publish: hex, 7–40 chars. Anything else is treated as absent. */
function cleanSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  return ANY_SHA_RE.test(raw) ? raw.toLowerCase() : null;
}

/** An ISO timestamp we are willing to publish. A value Date cannot parse is treated as absent. */
function cleanIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanBundle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  return raw ? raw : undefined;
}

/**
 * Source 1 — environment. Names only; the values come from the caller so this stays pure and
 * testable. Order matters: `GIT_COMMIT` is the name this repo's own CI sets.
 */
export const BUILD_SHA_ENV_NAMES = ["GIT_COMMIT", "GIT_SHA", "SOURCE_COMMIT", "SOURCE_VERSION"] as const;
export const BUILD_TIME_ENV_NAMES = ["BUILD_TIME", "BUILT_AT"] as const;

function fromEnv(env: NodeJS.ProcessEnv): BuildInfo | null {
  for (const name of BUILD_SHA_ENV_NAMES) {
    const commit = cleanSha(env[name]);
    if (commit) {
      return {
        commit,
        commitShort: commit.slice(0, 7),
        builtAt: BUILD_TIME_ENV_NAMES.map((n) => cleanIso(env[n])).find((v) => v) ?? null,
        source: "env",
      };
    }
  }
  return null;
}

/**
 * Source 2 — the file the build step writes. Parsed defensively: a truncated or hand-edited
 * file must not crash boot, and a file with no usable commit is treated as a MISS so the next
 * source still gets its turn (rather than pinning `source: "file"` onto a null commit).
 */
export function parseBuildInfoFile(raw: string): BuildInfo | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const commit = cleanSha(obj.commit);
  if (!commit) return null;
  const bundle = cleanBundle(obj.bundle);
  return {
    commit,
    commitShort: commit.slice(0, 7),
    builtAt: cleanIso(obj.builtAt),
    ...(bundle ? { bundle } : {}),
    source: "file",
  };
}

/** Candidate locations for build-info.json, most specific first. */
export function buildInfoFileCandidates(): string[] {
  const candidates: string[] = [];
  const override = process.env.BUILD_INFO_PATH;
  if (override) candidates.push(override);
  // The bundle lives at dist/index.cjs, so its own directory is where the build wrote the file.
  // `__dirname` does not exist under dev-mode tsx (ESM) — `typeof` never throws on an undeclared
  // global, so this stays safe there and simply contributes no candidate.
  if (typeof __dirname !== "undefined") candidates.push(path.join(__dirname, "build-info.json"));
  candidates.push(path.resolve(process.cwd(), "dist", "build-info.json"));
  candidates.push(path.resolve(process.cwd(), "build-info.json"));
  return candidates;
}

function fromFile(): BuildInfo | null {
  for (const candidate of buildInfoFileCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const info = parseBuildInfoFile(fs.readFileSync(candidate, "utf-8"));
      if (info) return info;
    } catch {
      // An unreadable candidate is a MISS, never a crash — this runs on the boot path.
    }
  }
  return null;
}

/** Source 3 — the esbuild `define` substitution. */
function fromEmbedded(): BuildInfo | null {
  const commit = cleanSha(typeof __GIT_SHA__ !== "undefined" ? __GIT_SHA__ : undefined);
  if (!commit) return null;
  return {
    commit,
    commitShort: commit.slice(0, 7),
    builtAt: cleanIso(typeof __BUILT_AT__ !== "undefined" ? __BUILT_AT__ : undefined),
    source: "embedded",
  };
}

/**
 * Source 4 — read `.git` directly. No child process (a deploy container may have no git binary,
 * and spawning one on the boot path is a cost we do not need). Pure given its inputs so the test
 * can exercise the packed-refs branch without a real repository.
 */
export function resolveGitHeadSha(
  readFile: (relPath: string) => string | null,
): string | null {
  const head = readFile("HEAD");
  if (!head) return null;
  const trimmed = head.trim();
  const direct = cleanSha(trimmed);
  if (direct && FULL_SHA_RE.test(direct)) return direct;
  const refMatch = trimmed.match(/^ref:\s*(\S+)$/);
  if (!refMatch) return null;
  const ref = refMatch[1];
  const loose = readFile(ref);
  const looseSha = cleanSha(loose?.trim());
  if (looseSha && FULL_SHA_RE.test(looseSha)) return looseSha;
  const packed = readFile("packed-refs");
  if (!packed) return null;
  for (const line of packed.split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref) {
      const packedSha = cleanSha(sha);
      if (packedSha && FULL_SHA_RE.test(packedSha)) return packedSha;
    }
  }
  return null;
}

/**
 * `.git` is a DIRECTORY in a normal clone and a FILE (`gitdir: <path>`) inside a worktree. Both
 * are resolved; anything else is a miss, never a guess.
 */
export function resolveGitDir(
  cwd: string,
  stat: (p: string) => "dir" | "file" | null,
  readFile: (p: string) => string | null,
): string | null {
  const dotGit = path.resolve(cwd, ".git");
  const kind = stat(dotGit);
  if (kind === "dir") return dotGit;
  if (kind !== "file") return null;
  const pointer = readFile(dotGit);
  const match = pointer?.trim().match(/^gitdir:\s*(.+)$/);
  if (!match) return null;
  const target = match[1].trim();
  return path.isAbsolute(target) ? target : path.resolve(cwd, target);
}

function fromGit(): BuildInfo | null {
  let gitDir: string | null = null;
  try {
    gitDir = resolveGitDir(
      process.cwd(),
      (p) => {
        try {
          const st = fs.statSync(p);
          return st.isDirectory() ? "dir" : st.isFile() ? "file" : null;
        } catch {
          return null;
        }
      },
      (p) => {
        try {
          return fs.readFileSync(p, "utf-8");
        } catch {
          return null;
        }
      },
    );
  } catch {
    return null;
  }
  if (!gitDir) return null;
  const readAt = (dir: string, relPath: string): string | null => {
    try {
      const target = path.join(dir, relPath);
      return fs.existsSync(target) ? fs.readFileSync(target, "utf-8") : null;
    } catch {
      return null;
    }
  };
  // A worktree's own gitdir holds HEAD but NOT the shared refs — those live in the common dir it
  // points at (`commondir`). Without this, a worktree checkout resolves HEAD to a ref it can then
  // never look up, and the source honestly reports nothing (which is what it did before this).
  const commonRaw = readAt(gitDir, "commondir")?.trim();
  const commonDir = commonRaw
    ? path.isAbsolute(commonRaw)
      ? commonRaw
      : path.resolve(gitDir, commonRaw)
    : null;
  const read = (relPath: string): string | null =>
    readAt(gitDir!, relPath) ?? (commonDir ? readAt(commonDir, relPath) : null);
  let commit: string | null = null;
  try {
    commit = resolveGitHeadSha(read);
  } catch {
    return null;
  }
  if (!commit) return null;
  // No commit TIME here on purpose: reading it means parsing a packed object, and §13 prefers a
  // stated absence to a plausible one.
  return { commit, commitShort: commit.slice(0, 7), builtAt: null, source: "git" };
}

/** The honest empty answer — every field absent, and the source says so. */
export const UNKNOWN_BUILD_INFO: BuildInfo = {
  commit: null,
  commitShort: null,
  builtAt: null,
  source: "unknown",
};

/**
 * Pure form of the resolver: the ordered sources as functions, so the test can drive each branch
 * (and the all-miss branch) without touching the filesystem or the environment.
 */
export function resolveBuildInfoFrom(sources: Array<() => BuildInfo | null>): BuildInfo {
  for (const source of sources) {
    let value: BuildInfo | null = null;
    try {
      value = source();
    } catch {
      value = null;
    }
    if (value && value.commit) return value;
  }
  return { ...UNKNOWN_BUILD_INFO };
}

let cached: BuildInfo | null = null;

/** Resolved ONCE per process — the answer cannot change while the process runs. */
export function getBuildInfo(): BuildInfo {
  if (!cached) {
    cached = resolveBuildInfoFrom([() => fromEnv(process.env), fromFile, fromEmbedded, fromGit]);
  }
  return cached;
}

/** Test seam: drop the memo so a test can re-resolve. Never called by product code. */
export function __resetBuildInfoCacheForTests(): void {
  cached = null;
}

/**
 * The ONE boot line, printed beside the `[Migrations]` summary so the deploy console shows which
 * commit answered. §13: an unknown commit says "unknown", never a placeholder that reads like one.
 */
export function formatBuildBootLine(info: BuildInfo = getBuildInfo()): string {
  const commit = info.commitShort ?? "unknown";
  const built = info.builtAt ?? "unknown";
  return `[build] commit ${commit} built ${built} (source: ${info.source})`;
}
