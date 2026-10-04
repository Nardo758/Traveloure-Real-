/**
 * R-bo (decision-maker ratified 2026-10-04, "aligned with the beta launch"; work plan L1-19).
 *
 * `/api/expert-workspace/scrape-jobs` queues crawls over URLs, so it is closed unless
 * `EXPERT_SCRAPE_JOBS_ENABLED=1` — the same "1" test every operator switch uses — and is OFF in
 * production. The switch is reported by `/api/health` (`HEALTH_FLAG_NAMES`). Pure.
 */
export function expertScrapeJobsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EXPERT_SCRAPE_JOBS_ENABLED === "1";
}

export type ScrapeJobsAccess =
  | { ok: true }
  | { ok: false; status: 404 | 403; reason: "disabled" | "admin_only" };

/**
 * ONE decision for all three scrape-jobs routes. Switch off ⇒ 404 for everyone, admins included (the
 * route answers as if it were not there). Switch on ⇒ admins only, role read from the DB by the caller
 * (never the session claim). An unauthenticated caller is refused before this is asked.
 */
export function scrapeJobsAccess(enabled: boolean, dbRole: string | null | undefined): ScrapeJobsAccess {
  if (!enabled) return { ok: false, status: 404, reason: "disabled" };
  if (dbRole !== "admin") return { ok: false, status: 403, reason: "admin_only" };
  return { ok: true };
}

/**
 * The source rule R-bo states for a re-enabled switch: a REGISTRY source with `public_ok = true`
 * (R-p) that is not a transport source (R-as). Free URLs (`targetUrls`, `startUrl`, a search `query`)
 * are never admitted.
 *
 * STATED LIMIT (§13): a scrape job's `source_id` is a foreign key to `dmo_sources`, and that table has
 * no `public_ok` and no needs list — `public_ok` lives on `content_sources` (migration 341), a different
 * registry the job cannot reference. So no source can be shown to meet the rule today, and this
 * refuses every source: the route stays closed even with the switch on, until a ruling says how a DMO
 * source earns `public_ok` (or the jobs move onto `content_sources`). It never guesses one.
 */
export type ScrapeJobSourceRefusal = "source_required" | "source_not_found" | "source_not_public_ok";

export function admitScrapeJobSource(
  source: { id: string; publicOk?: boolean | null; transport?: boolean | null } | null,
  sourceIdGiven: boolean,
): { ok: true } | { ok: false; reason: ScrapeJobSourceRefusal } {
  if (!sourceIdGiven) return { ok: false, reason: "source_required" };
  if (!source) return { ok: false, reason: "source_not_found" };
  if (source.publicOk !== true || source.transport !== false) return { ok: false, reason: "source_not_public_ok" };
  return { ok: true };
}
