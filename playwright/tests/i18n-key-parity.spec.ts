import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../../client/src/locales');
const I18N_CONFIG = path.resolve(__dirname, '../../client/src/lib/i18n.ts');

/**
 * i18n key-parity spec — pure static analysis, no browser, server, or DB.
 *
 * WHY THIS EXISTS (test-strategy P1): `client/src/lib/i18n.ts` sets
 * `fallbackLng: 'en'` deliberately — ruling 60's chrome contract is that an untranslated
 * chrome key renders its English string rather than a raw key ("nav.dashboard"). That
 * fallback is CORRECT behavior and must not be removed; its cost is that it is also
 * SILENT. A key added to `en/common.json` and forgotten in `ja/common.json` renders
 * English to a Japanese user, throws nothing, logs nothing, and fails no existing test.
 * Nobody finds out until a Japanese user does.
 *
 * So the fallback stays and the DETECTION lives here: this suite diffs the flattened key
 * SETS of the reference locale (en) against every other locale on disk and fails naming
 * the exact keys and the exact file. It asserts nothing about translation *values* — a
 * Japanese string that is still English prose is a translation-quality question, not a
 * key-parity one, and pretending otherwise would make this gate noisy and ignorable.
 *
 * BOTH DIRECTIONS are checked, because the two failures are different bugs:
 *   - en-key missing from ja  ⇒ a silent English fallback in the Japanese UI (the P1 case).
 *   - ja-key missing from en  ⇒ an ORPHAN: a translated string no call site can reach any
 *     more (the en key was renamed or deleted), i.e. dead weight that hides the rename.
 *
 * A leaf/branch type mismatch (en has `a.b` as an object, ja has `a` as a string) needs no
 * special case: the two flatten to different key paths and surface as one missing + one
 * orphan, which is exactly what a reader needs to see.
 *
 * KNOWN_GAPS below is the escape hatch for a genuine, deliberate divergence — it is
 * currently EMPTY because the six namespaces are at full parity (286 keys each side as of
 * this commit). A stale entry (allowlisted but no longer a gap) FAILS, so the allowlist can
 * never quietly become a permanent baseline — the same posture as the fee-gate's
 * `fee-literal-debt` reporting rule (§18d).
 *
 * No workflow runs this yet; run it locally or wire it beside the other browserless suites
 * (crash-filter-unit, neighborhoods) with `npx playwright test i18n-key-parity`.
 */

/** The locale every other locale is diffed against (i18n.ts `DEFAULT_LOCALE` / `fallbackLng`). */
const REFERENCE_LOCALE = 'en';

/**
 * Deliberate, reviewed divergences — format: `"<locale>:<namespace>.<dot.key.path>"`,
 * e.g. `"ja:nav.legacyBanner.title"`. An entry here exempts that ONE key from failing.
 *
 * EMPTY BY DESIGN — there are zero pre-existing gaps. Do not add an entry to make a red
 * build green; a missing translation is a translation task. An entry is only appropriate
 * for a key that intentionally exists in one locale and must not exist in another, and it
 * must carry a comment saying why.
 */
const KNOWN_GAPS: readonly string[] = [
  // (none)
];

type KeySet = { readonly namespace: string; readonly keys: readonly string[] };

/** Recursively dot-flattens an object to its leaf key paths. Arrays are leaves (i18next lists). */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(...flattenKeys(v, prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

function readNamespace(locale: string, file: string): KeySet {
  const full = path.join(LOCALES_DIR, locale, file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(`Locale file is not valid JSON: client/src/locales/${locale}/${file} — ${String(err)}`);
  }
  return { namespace: path.basename(file, '.json'), keys: flattenKeys(parsed) };
}

function listJsonFiles(locale: string): string[] {
  return fs
    .readdirSync(path.join(LOCALES_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .sort();
}

const localeDirs = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const otherLocales = localeDirs.filter((l) => l !== REFERENCE_LOCALE);

test.describe('i18n key parity — locale files', () => {
  test('the reference locale exists and ships at least one namespace', () => {
    expect(
      localeDirs,
      `No "${REFERENCE_LOCALE}" directory under client/src/locales — the diff has no reference side.`,
    ).toContain(REFERENCE_LOCALE);
    expect(listJsonFiles(REFERENCE_LOCALE).length).toBeGreaterThan(0);
  });

  test('there is at least one non-reference locale to diff against', () => {
    // If this fails, either a locale directory was deleted or this suite is now a no-op
    // reporting green while checking nothing.
    expect(
      otherLocales,
      'Only the reference locale is present — nothing to diff, so this gate would pass vacuously.',
    ).not.toHaveLength(0);
  });

  test('locale directories on disk match SUPPORTED_LOCALES in client/src/lib/i18n.ts', () => {
    // A locale directory nobody registered is dead weight that looks translated; a
    // registered locale with no directory is a build-breaking import. Static parse
    // (no import) keeps this suite free of i18next/React.
    const src = fs.readFileSync(I18N_CONFIG, 'utf8');
    const match = src.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]/);
    expect(match, 'Could not find SUPPORTED_LOCALES in client/src/lib/i18n.ts').not.toBeNull();
    const registered = [...(match![1].matchAll(/["']([a-z-]+)["']/g))].map((m) => m[1]).sort();
    expect(registered, 'SUPPORTED_LOCALES and client/src/locales/* have diverged').toEqual(localeDirs);
  });

  for (const locale of otherLocales) {
    test(`${locale}: ships the same namespace files as ${REFERENCE_LOCALE}`, () => {
      const reference = listJsonFiles(REFERENCE_LOCALE);
      const actual = listJsonFiles(locale);
      const missingFiles = reference.filter((f) => !actual.includes(f));
      const extraFiles = actual.filter((f) => !reference.includes(f));

      expect(
        missingFiles,
        `Namespace file(s) missing from client/src/locales/${locale}/: ${missingFiles.join(', ')} — ` +
          `every key in them silently falls back to ${REFERENCE_LOCALE}.`,
      ).toEqual([]);
      expect(
        extraFiles,
        `Namespace file(s) in client/src/locales/${locale}/ with no ${REFERENCE_LOCALE} counterpart: ` +
          `${extraFiles.join(', ')} — orphaned, unreachable from any call site.`,
      ).toEqual([]);
    });

    test(`${locale}: has every ${REFERENCE_LOCALE} key (no silent English fallback)`, () => {
      const failures: string[] = [];
      let compared = 0;

      for (const file of listJsonFiles(REFERENCE_LOCALE)) {
        if (!fs.existsSync(path.join(LOCALES_DIR, locale, file))) continue; // reported by the file-set test
        const reference = readNamespace(REFERENCE_LOCALE, file);
        const target = readNamespace(locale, file);
        const targetKeys = new Set(target.keys);
        compared += reference.keys.length;

        const missing = reference.keys
          .filter((k) => !targetKeys.has(k))
          .filter((k) => !KNOWN_GAPS.includes(`${locale}:${reference.namespace}.${k}`));

        if (missing.length > 0) {
          failures.push(
            `client/src/locales/${locale}/${file} is missing ${missing.length} key(s) present in ` +
              `${REFERENCE_LOCALE}/${file}:\n    ${missing.join('\n    ')}`,
          );
        }
      }

      expect(compared, `No keys were compared for "${locale}" — the diff ran on nothing.`).toBeGreaterThan(0);
      expect(
        failures.join('\n\n'),
        `Untranslated chrome keys will render English to a "${locale}" user with no error ` +
          `(i18n.ts fallbackLng). Translate them, or add a justified entry to KNOWN_GAPS.`,
      ).toBe('');
    });

    test(`${locale}: has no orphan keys absent from ${REFERENCE_LOCALE}`, () => {
      const failures: string[] = [];

      for (const file of listJsonFiles(locale)) {
        if (!fs.existsSync(path.join(LOCALES_DIR, REFERENCE_LOCALE, file))) continue;
        const reference = readNamespace(REFERENCE_LOCALE, file);
        const target = readNamespace(locale, file);
        const referenceKeys = new Set(reference.keys);

        const orphans = target.keys
          .filter((k) => !referenceKeys.has(k))
          .filter((k) => !KNOWN_GAPS.includes(`${locale}:${target.namespace}.${k}`));

        if (orphans.length > 0) {
          failures.push(
            `client/src/locales/${locale}/${file} has ${orphans.length} key(s) with no ` +
              `${REFERENCE_LOCALE}/${file} counterpart:\n    ${orphans.join('\n    ')}`,
          );
        }
      }

      expect(
        failures.join('\n\n'),
        `Orphan keys are unreachable (a renamed/deleted ${REFERENCE_LOCALE} key leaves its ` +
          `translation stranded). Delete them, or add a justified entry to KNOWN_GAPS.`,
      ).toBe('');
    });
  }

  test('KNOWN_GAPS contains no stale entries', () => {
    // An allowlist entry that is no longer a real gap must be deleted, otherwise the list
    // grows into a permanent baseline that hides the next regression.
    const stale: string[] = [];

    for (const entry of KNOWN_GAPS) {
      const [locale, rest] = entry.split(':', 2);
      if (!locale || !rest) {
        stale.push(`${entry} (malformed — expected "<locale>:<namespace>.<key.path>")`);
        continue;
      }
      const [namespace, ...keyParts] = rest.split('.');
      const key = keyParts.join('.');
      const file = `${namespace}.json`;
      const refPath = path.join(LOCALES_DIR, REFERENCE_LOCALE, file);
      const targetPath = path.join(LOCALES_DIR, locale, file);

      const refKeys = fs.existsSync(refPath) ? readNamespace(REFERENCE_LOCALE, file).keys : [];
      const targetKeys = fs.existsSync(targetPath) ? readNamespace(locale, file).keys : [];

      const isMissingGap = refKeys.includes(key) && !targetKeys.includes(key);
      const isOrphanGap = targetKeys.includes(key) && !refKeys.includes(key);
      if (!isMissingGap && !isOrphanGap) {
        stale.push(`${entry} (no longer diverges — remove it)`);
      }
    }

    expect(stale, `Stale KNOWN_GAPS entries:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
