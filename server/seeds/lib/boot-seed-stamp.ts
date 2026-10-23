/**
 * Seed-version stamps (ledger `2026-10-22-boot-seed-stamps`).
 *
 * A boot whose stored overall stamp matches the version derived from `BOOT_SEED_VERSION` and the
 * per-seeder input hashes skips every seeder. The read happens after the boot-seed lock is held,
 * so a second instance that waited on the lock sees the first instance's stamp and becomes a no-op.
 * Each seeder has its own stamp: a changed input reruns only that seeder. A seeder that throws,
 * or whose stamp row cannot be written, leaves its stamp unwritten. The overall stamp is written
 * only after every seeder in the pass succeeded (ran or already matched). No stamp at all — a fresh
 * or empty database, or a database whose stamp table is not there yet — never skips.
 *
 * `BOOT_SEED_VERSION` is the hand bump. The rest of the version is a sha256 of the seeder's input
 * files. Bump the constant when seeder behavior changes and those files do not.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

/** Hand-bumped seed version. Included in every seeder hash and in the overall version. */
export const BOOT_SEED_VERSION = "1";

/** The one overall row. Every other stamp key is a seeder name. */
export const OVERALL_STAMP_KEY = "boot";

export type SeedOutcome = "skipped" | "ran" | "partial";

export type SeederAction = "skipped" | "ran" | "failed";

export type StampedSeeder = {
  name: string;
  /** Null when the input files cannot be read. The seeder runs and is not stamped. */
  inputHash: string | null;
  run: () => Promise<void>;
  onError?: (err: unknown) => void;
};

export type SeederPassRow = {
  name: string;
  action: SeederAction;
  durationMs: number;
  /** Set when the seeder ran and the stamp write threw. The stamp row was not written. */
  stampError?: unknown;
};

export type StampRead = {
  /** False when `boot_seed_stamps` is not there yet. That is "no stamp": seed, and do not write. */
  available: boolean;
  stamps: Map<string, string>;
};

export type SeedPassResult = {
  outcome: SeedOutcome;
  perSeeder: SeederPassRow[];
  overallWritten: boolean;
  /** Set when every seeder succeeded but the overall stamp row could not be written. */
  overallError?: unknown;
};

/**
 * Input files for each boot seeder, repo-relative. The hash is the file bytes plus
 * `BOOT_SEED_VERSION`, so a data or logic edit in one of these files reruns that seeder only.
 */
export const SEEDER_INPUT_FILES = {
  seedCategories: ["server/seed-categories.ts"],
  seedExperienceTypes: ["server/seed-experience-types.ts"],
  seedExperienceTemplateTabs: [
    "server/seeds/experience-template-tabs.seed.ts",
    "shared/selection-control-seed.ts",
    "shared/cancellation-schedule.ts",
  ],
  seedExpertServices: ["server/seed-expert-services.ts"],
  seedRoleScopedTemplates: ["server/seeds/role-scoped-templates.seed.ts"],
  seedCanonicalServiceTemplates: ["server/seeds/canonical-service-templates.seed.ts"],
  seedCanonicalExpertOfferings: ["server/seeds/canonical-service-templates.seed.ts"],
  ensureDefaultBookingFeeConfig: ["server/services/booking-fee-bootstrap.ts"],
  seedDmoSources: ["server/seeds/dmo-sources.seed.ts", "server/content/providers/DMOSourceRegistry.ts"],
  seedDmoKyotoHeritage: ["server/seeds/dmo-kyoto-heritage.seed.ts"],
  seedLocationCache: ["server/seeds/location-cache.seed.ts", "server/data/iata-airports.json"],
  seedMockExperts: ["server/seed-expert-services.ts"],
  seedLandingMomentDemo: ["server/seeds/landing-moment-demo.seed.ts"],
  seedProviderServices: ["server/seed-expert-services.ts"],
  seedDestinationCalendar: ["server/seed-destination-calendar.ts"],
  seedTravelPulseData: [
    "server/seed-travelpulse.ts",
    "server/data/calendar-events.json",
    "server/data/cities.json",
    "server/data/hidden-gems.json",
    "server/data/live-activity.json",
    "server/data/happening-now.json",
  ],
  seedCityNeighborhoods: ["server/seeds/city-neighborhoods.seed.ts"],
  seedManualCityEvents: ["server/seeds/city-events.manual.ts", "server/services/city-events.service.ts"],
  seedLandingHeroDemo: ["server/seeds/landing-hero-demo.seed.ts"],
  seedPopularCitiesContent: ["server/seeds/popular-cities-content.seed.ts"],
  seedMajorCitiesBackfill: ["server/seeds/major-cities-backfill.seed.ts"],
  seedPhaseDKyotoVendors: ["server/seeds/phase-d-kyoto-vendors.seed.ts"],
  seedTripOwnership: ["server/seeds/trip-ownership.seed.ts"],
  seedE2EAccounts: ["server/seeds/e2e-test-accounts.seed.ts"],
  backfillAffiliateProviderMetadata: ["server/storage.ts"],
} as const;

export type BootSeederName = keyof typeof SEEDER_INPUT_FILES;

export function bootSeedingLogMessage(outcome: SeedOutcome): "Boot seeding skipped" | "Boot seeding ran" {
  return outcome === "skipped" ? "Boot seeding skipped" : "Boot seeding ran";
}

/** Walk `cwd` upward so a bundled process whose cwd is the repo still finds the seed files. */
export function resolveRepoFile(rel: string, cwd = process.cwd()): string | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, rel);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function hashSeederInput(versionConstant: string, name: string, files: { path: string; bytes: Buffer }[]): string | null {
  if (files.length === 0) return null;
  const h = crypto.createHash("sha256");
  h.update(versionConstant);
  h.update("\0");
  h.update(name);
  for (const file of files) {
    h.update("\0");
    h.update(file.path);
    h.update("\0");
    h.update(file.bytes);
  }
  return h.digest("hex");
}

const hashCache = new Map<string, string | null>();

export function loadSeederInputHash(name: BootSeederName, versionConstant = BOOT_SEED_VERSION): string | null {
  const cacheKey = `${versionConstant}\0${name}`;
  if (hashCache.has(cacheKey)) return hashCache.get(cacheKey) ?? null;
  const rels = SEEDER_INPUT_FILES[name];
  const files: { path: string; bytes: Buffer }[] = [];
  for (const rel of rels) {
    const abs = resolveRepoFile(rel);
    if (!abs) {
      hashCache.set(cacheKey, null);
      return null;
    }
    files.push({ path: rel, bytes: fs.readFileSync(abs) });
  }
  const hash = hashSeederInput(versionConstant, name, files);
  hashCache.set(cacheKey, hash);
  return hash;
}

export function clearSeederInputHashCacheForTests(): void {
  hashCache.clear();
}

/**
 * Overall version of one boot's seeder list. Null when any seeder's input could not be hashed —
 * the boot must seed, and it must not record an overall stamp that would skip the next one.
 */
export function overallSeedVersion(
  versionConstant: string,
  seeders: { name: string; inputHash: string | null }[],
): string | null {
  if (seeders.some((s) => s.inputHash == null)) return null;
  const h = crypto.createHash("sha256");
  h.update(versionConstant);
  h.update("\n");
  const ordered = [...seeders].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const s of ordered) {
    h.update(s.name);
    h.update("=");
    h.update(s.inputHash as string);
    h.update("\n");
  }
  return h.digest("hex");
}

export function isUndefinedTableError(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (code === "42P01") return true;
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && /boot_seed_stamps/.test(message) && /does not exist/.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function outcomeOf(rows: SeederPassRow[]): SeedOutcome {
  if (rows.some((r) => r.action === "failed")) return "partial";
  if (rows.some((r) => r.action === "ran")) return "ran";
  return "skipped";
}

/**
 * Decide and run one locked pass. The caller holds the boot-seed lock and calls this only after
 * that acquisition, so `readStamps` is the re-read the second waiter performs.
 */
export async function executeStampedSeeders(
  loaded: StampRead,
  seeders: StampedSeeder[],
  writeStamp: (key: string, inputHash: string) => Promise<void>,
  versionConstant = BOOT_SEED_VERSION,
): Promise<SeedPassResult> {
  const version = overallSeedVersion(versionConstant, seeders);
  const canRecordOverall = loaded.available && version != null;
  if (canRecordOverall && loaded.stamps.get(OVERALL_STAMP_KEY) === version) {
    return {
      outcome: "skipped",
      overallWritten: false,
      perSeeder: seeders.map((s) => ({ name: s.name, action: "skipped", durationMs: 0 })),
    };
  }

  let failed = false;
  const perSeeder: SeederPassRow[] = [];
  for (const seeder of seeders) {
    const hash = seeder.inputHash;
    if (loaded.available && hash != null && loaded.stamps.get(seeder.name) === hash) {
      perSeeder.push({ name: seeder.name, action: "skipped", durationMs: 0 });
      continue;
    }
    const started = Date.now();
    try {
      await seeder.run();
    } catch (err) {
      failed = true;
      perSeeder.push({ name: seeder.name, action: "failed", durationMs: Date.now() - started });
      seeder.onError?.(err);
      continue;
    }
    const durationMs = Date.now() - started;
    if (loaded.available && hash != null) {
      try {
        await writeStamp(seeder.name, hash);
        loaded.stamps.set(seeder.name, hash);
      } catch (err) {
        failed = true;
        perSeeder.push({ name: seeder.name, action: "failed", durationMs, stampError: err });
        continue;
      }
    }
    perSeeder.push({ name: seeder.name, action: "ran", durationMs });
  }

  let overallWritten = false;
  let overallError: unknown;
  if (!failed && canRecordOverall && version != null) {
    try {
      await writeStamp(OVERALL_STAMP_KEY, version);
      overallWritten = true;
    } catch (err) {
      failed = true;
      overallError = err;
    }
  }

  return {
    outcome: failed ? "partial" : outcomeOf(perSeeder),
    overallWritten,
    perSeeder,
    ...(overallError !== undefined ? { overallError } : {}),
  };
}

export type SeedPassDeps = {
  /** Must not run `fn` until the caller has the boot-seed lock. `fn` re-reads the stamp. */
  lock: <T>(fn: () => Promise<T>) => Promise<T>;
  readStamps: () => Promise<StampRead>;
  writeStamp: (key: string, inputHash: string) => Promise<void>;
  seeders: StampedSeeder[];
  versionConstant?: string;
};

/**
 * Acquire `lock`, then re-read stamps and seed or skip. A snapshot taken before the lock is not
 * an input: the second pass reads whatever the first pass wrote before it released the lock.
 */
export async function runSeedPass(deps: SeedPassDeps): Promise<SeedPassResult & { lockWaitMs: number }> {
  const started = Date.now();
  let lockWaitMs = 0;
  const result = await deps.lock(async () => {
    lockWaitMs = Date.now() - started;
    const loaded = await deps.readStamps();
    return executeStampedSeeders(loaded, deps.seeders, deps.writeStamp, deps.versionConstant ?? BOOT_SEED_VERSION);
  });
  return { ...result, lockWaitMs };
}
