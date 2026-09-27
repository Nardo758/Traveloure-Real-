/**
 * scripts/e2e/coverage.ts — Tier-1 action→effect coverage by the supply-demand e2e harness.
 *
 *   npx tsx scripts/e2e/coverage.ts            # markdown tables to stdout
 *   npx tsx scripts/e2e/coverage.ts --json     # the same numbers as JSON
 *
 * DENOMINATOR. Every row of docs/audits/action-effect.json with `tier === 1`. Persona is the row's
 * `persona` field; a row with none is a TRAVELER row (the base audit covered traveler surfaces only
 * and added no persona field — docs/audits/pass2/ACTION_EFFECT_SUPPLY_NOTES.md).
 *
 * EACH ROW LANDS IN EXACTLY ONE BUCKET, first match wins:
 *   1. PROVEN      — `verdict.evidence === "behavioral"` AND `verdict.evidenceRef` names a spec under
 *                    e2e/supply-demand/. The spec is taken from that reference. This is the only
 *                    bucket that means "a harness run drove this trigger and asserted its DB effect".
 *   2. REFERENCED  — a supply-demand spec (or a lib/flows.ts function that spec calls) mentions the
 *                    row's trigger testid in a string literal. STATIC match: it shows the harness
 *                    touches the control, not that it asserted the row's effect, and a testid shared
 *                    by two surfaces is credited to both. Listed separately so it is never read as
 *                    PROVEN.
 *   3. NOT PROVEN  — held by the environment: the row's API route is a Stripe rail (HELD:stripe), or
 *                    its behavioural evidence comes from an EARLIER audit pass (the J- and U- journeys),
 *                    which this harness has not re-run.
 *   4. UNCOVERED   — everything else.
 *
 * NEGATIVE SPACE (§18d): a supply-side row is REFERENCED only by a spec that names that persona's
 * console route (drivesPersona) — a heuristic, not proof of which console the click happened on;
 * rows with no testid cannot be REFERENCED (125 of 351 at the time of
 * writing — effects, auth-resume and url-consumer triggers); a testid built at runtime from a
 * template is matched on its static prefix only; the HELD:stripe predicate is a route regex, so a
 * money row whose route does not look like one lands in UNCOVERED rather than NOT PROVEN.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd(); // run from the repo root (every scripts/e2e tool assumes it)
const JSON_PATH = path.join(ROOT, 'docs', 'audits', 'action-effect.json');
const SPEC_DIR = path.join(ROOT, 'e2e', 'supply-demand');

type Row = {
  id: string;
  tier: number;
  persona?: string | null;
  surface: string;
  label: { testId?: string | null; text: string };
  chain: { api?: { route?: string } | null };
  verdict: { evidence: string; evidenceRef?: string | null };
};

const STRIPE_ROUTE = /stripe|checkout|payout|payment|trip-pass|optimization-payments|pay-balance|connect\/onboard|identity/i;

function specFiles(): string[] {
  return fs
    .readdirSync(SPEC_DIR)
    .filter((f) => /\.spec\.ts$/.test(f))
    .sort();
}

/** lib/flows.ts split into its exported functions, so a spec is credited with what it CALLS. */
function flowsFunctions(): Map<string, string> {
  const out = new Map<string, string>();
  const p = path.join(SPEC_DIR, 'lib', 'flows.ts');
  if (!fs.existsSync(p)) return out;
  const src = fs.readFileSync(p, 'utf8');
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, starts[i + 1]?.at ?? src.length)));
  return out;
}

/** The static text a spec can be credited with: its own source + the flows functions it calls. */
function specCorpus(): Map<string, { own: string; all: string }> {
  const flows = flowsFunctions();
  const out = new Map<string, { own: string; all: string }>();
  for (const f of specFiles()) {
    const own = fs.readFileSync(path.join(SPEC_DIR, f), 'utf8');
    let all = own;
    for (const [name, body] of Array.from(flows.entries())) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(own)) all += '\n' + body;
    }
    out.set(f, { own, all });
  }
  return out;
}

/**
 * The static forms a row's testid can appear as: `{a,b}` expanded; a `*`, `${…}`, `<…>` or `:`
 * tail makes it a PREFIX match, otherwise it must match EXACTLY (so `button-save` is not credited
 * by a spec that clicks `button-save-draft`).
 */
function testidPatterns(raw: string | null | undefined): RegExp[] {
  if (!raw) return [];
  const t = raw.replace(/^\(.*\)$/, '').trim();
  if (!t || /\s/.test(t)) return [];
  const brace = t.match(/^(.*)\{([^}]+)\}(.*)$/);
  const variants = brace ? brace[2].split(',').map((v) => `${brace[1]}${v}${brace[3]}`) : [t];
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: RegExp[] = [];
  for (const v of variants) {
    const cut = v.split(/\$\{|\*|<|:/)[0];
    if (cut.length < 6) continue;
    const isPrefix = cut.length < v.length;
    out.push(new RegExp(isPrefix ? `['"\`]${esc(cut)}` : `['"\`]${esc(cut)}['"\`]`));
  }
  return out;
}

/**
 * A supply-side row (expert/provider) is credited only to a spec that also drives that persona's
 * console — it names the `/expert/` or `/provider/` route prefix, or passes `role: '<persona>'` to
 * a flows helper. Shared components (ServiceForm, SellerQuotesPanel, …) carry the SAME testid on
 * both consoles, so without this an expert-only spec would be credited with the provider row.
 */
function drivesPersona(text: string, persona: string): boolean {
  if (persona === 'traveler') return true;
  return text.includes(`'/${persona}/`) || text.includes(`\`/${persona}/`) || text.includes(`role: '${persona}'`);
}

function referencedBy(row: Row, corpus: Map<string, { own: string; all: string }>): string[] {
  const patterns = testidPatterns(row.label.testId);
  if (patterns.length === 0) return [];
  const persona = row.persona ?? 'traveler';
  const hits: string[] = [];
  for (const [spec, text] of Array.from(corpus.entries())) {
    // The testid may live in a flows helper the spec calls; the persona must be the SPEC's own
    // (every flows helper is role-parameterised, so its body names both consoles).
    if (patterns.some((p) => p.test(text.all)) && drivesPersona(text.own, persona)) hits.push(spec);
  }
  return hits;
}

function provenBy(row: Row): string | null {
  if (row.verdict.evidence !== 'behavioral') return null;
  const m = (row.verdict.evidenceRef ?? '').match(/e2e\/supply-demand\/([\w.-]+\.spec\.ts)/);
  return m ? m[1] : null;
}

type Bucket = 'proven' | 'referenced' | 'notProven' | 'uncovered';

function classify(row: Row, corpus: Map<string, { own: string; all: string }>): { bucket: Bucket; specs: string[]; reason?: string } {
  const proven = provenBy(row);
  if (proven) return { bucket: 'proven', specs: [proven] };
  const refs = referencedBy(row, corpus);
  if (refs.length) return { bucket: 'referenced', specs: refs };
  const route = row.chain?.api?.route ?? '';
  if (STRIPE_ROUTE.test(route)) return { bucket: 'notProven', specs: [], reason: 'HELD:stripe' };
  if (row.verdict.evidence === 'behavioral') {
    return { bucket: 'notProven', specs: [], reason: `earlier-pass evidence only (${row.verdict.evidenceRef ?? 'n/a'})` };
  }
  return { bucket: 'uncovered', specs: [] };
}

function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as { rows: Row[]; baseSha?: string };
  const rows = data.rows.filter((r) => r.tier === 1);
  const corpus = specCorpus();
  const classified = rows.map((r) => ({ row: r, persona: r.persona ?? 'traveler', ...classify(r, corpus) }));

  const personas = ['traveler', 'expert', 'provider'];
  const tally = (list: typeof classified) => ({
    total: list.length,
    proven: list.filter((c) => c.bucket === 'proven').length,
    referenced: list.filter((c) => c.bucket === 'referenced').length,
    notProven: list.filter((c) => c.bucket === 'notProven').length,
    uncovered: list.filter((c) => c.bucket === 'uncovered').length,
  });

  if (process.argv.includes('--json')) {
    const out = {
      denominator: rows.length,
      byPersona: Object.fromEntries(personas.map((p) => [p, tally(classified.filter((c) => c.persona === p))])),
      rows: classified.map((c) => ({ id: c.row.id, persona: c.persona, surface: c.row.surface, bucket: c.bucket, specs: c.specs, reason: c.reason ?? null })),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const lines: string[] = [];
  const all = tally(classified);
  lines.push(`Denominator: ${rows.length} Tier-1 rows in docs/audits/action-effect.json (baseSha ${data.baseSha ?? '?'}).`);
  lines.push(`Specs scanned: ${specFiles().join(', ')}.`);
  lines.push('');
  lines.push('### By persona');
  lines.push('');
  lines.push('| persona | total | proven (behavioural, row-level) | referenced (static testid match) | not proven | uncovered |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const p of personas) {
    const t = tally(classified.filter((c) => c.persona === p));
    lines.push(`| ${p} | ${t.total} | ${t.proven} | ${t.referenced} | ${t.notProven} | ${t.uncovered} |`);
  }
  lines.push(`| **all** | **${all.total}** | **${all.proven}** | **${all.referenced}** | **${all.notProven}** | **${all.uncovered}** |`);
  lines.push('');
  lines.push('### By persona and surface');
  lines.push('');
  lines.push('| persona | surface | total | proven | referenced | not proven | uncovered | specs |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---|');
  for (const p of personas) {
    const surfaces = Array.from(new Set(classified.filter((c) => c.persona === p).map((c) => c.row.surface))).sort();
    for (const s of surfaces) {
      const list = classified.filter((c) => c.persona === p && c.row.surface === s);
      const t = tally(list);
      const specs = Array.from(new Set(list.flatMap((c) => c.specs))).sort().join(', ') || '—';
      lines.push(`| ${p} | ${s} | ${t.total} | ${t.proven} | ${t.referenced} | ${t.notProven} | ${t.uncovered} | ${specs} |`);
    }
  }
  lines.push('');
  lines.push('### Expert and provider rows, one by one');
  lines.push('');
  lines.push('| persona | row | bucket | spec / reason |');
  lines.push('|---|---|---|---|');
  for (const c of classified.filter((c) => c.persona !== 'traveler')) {
    lines.push(`| ${c.persona} | \`${c.row.id}\` | ${c.bucket} | ${c.specs.join(', ') || c.reason || '—'} |`);
  }
  lines.push('');
  lines.push('### NOT PROVEN, with reason');
  lines.push('');
  const np = classified.filter((c) => c.bucket === 'notProven');
  const reasons = new Map<string, number>();
  for (const c of np) {
    const key = c.reason?.startsWith('earlier-pass') ? 'earlier-pass evidence only (J-/U- journeys, not re-run by this harness)' : c.reason ?? '?';
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  lines.push('| reason | rows |');
  lines.push('|---|---:|');
  for (const [k, v] of Array.from(reasons.entries())) lines.push(`| ${k} | ${v} |`);
  process.stdout.write(lines.join('\n') + '\n');
}

main();
