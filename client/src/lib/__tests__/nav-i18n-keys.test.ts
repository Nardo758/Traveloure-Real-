/**
 * nav-i18n-keys.test.ts (QA F10)
 *
 * Unit test — no browser required. Sibling of nav-route-coverage.test.ts, which asks the same
 * question about the other half of a nav entry: that file pins every `href` to a real route,
 * this one pins every `i18nKey` to a real translation.
 *
 * THE BUG IT EXISTS FOR. `nav-config.ts` gained a group-level `footer` leaf carrying
 * `i18nKey: "links.browseAllOccasions"`, and no locale file ever gained that key. The
 * Experiences dropdown then rendered the literal string `browseAllOccasions →` to every visitor
 * in production. Two documented protections both looked like they covered this and neither did:
 *
 *   - `nav-config.ts` keeps the English `name` "as the render fallback when a key has no
 *     translation (never a raw 'nav.x' key)", and `layout.tsx` duly passes it to `t()` as a
 *     defaultValue — but `i18n.ts`'s `parseMissingKeyHandler` ran AFTER that and threw the
 *     default away, returning the key's last dot segment. (Fixed in the same change; a missing
 *     key now renders its English default. This test is the layer that stops the situation
 *     arising at all, because a lower-case run-together word on screen and an English label are
 *     both wrong when a translation was intended.)
 *   - `playwright/tests/i18n-key-parity.spec.ts` diffs the locale files AGAINST EACH OTHER. A key
 *     missing from `en` AND `ja` is at perfect parity, so that suite was — correctly, by its own
 *     stated scope — green the whole time.
 *
 * NEGATIVE SPACE (§18d — green here means green within these bounds). This checks the keys that
 * `nav-config.ts` DECLARES, in the `nav` namespace, against the locale JSON on disk. It does not
 * see a `t()` call written inline in a component, another namespace, an interpolation variable,
 * or whether a translation is any good — a Japanese value that is still English prose passes
 * here and is a translation-quality question, not a missing-key one.
 *
 * Run with: npx tsx --test client/src/lib/__tests__/nav-i18n-keys.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { navGroupsConfig, footerSectionsConfig } from "../nav-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOCALES_DIR = resolve(__dirname, "../../locales");

/** The namespace layout.tsx passes to useTranslation for both the navbar and the footer. */
const NAMESPACE = "nav";

/** Every `<name, key>` pair the nav config declares, so a failure names the row a reader sees. */
function declaredKeys(): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const push = (key: string | undefined, label: string) => {
    if (key) out.push({ key, label });
  };

  for (const group of navGroupsConfig) {
    push(group.i18nKey, group.name);
    for (const section of group.sections ?? []) {
      push(section.i18nKey, section.title);
      for (const item of section.items) {
        push(item.i18nKey, item.name);
        push(item.descriptionI18nKey, `${item.name} (description)`);
      }
    }
    // The group footer is the leaf that shipped without a translation and started this.
    push(group.footer?.i18nKey, group.footer?.name ?? "(footer)");
  }

  for (const section of footerSectionsConfig) {
    push(section.i18nKey, section.title);
    for (const link of section.links) {
      push(link.i18nKey, link.label);
    }
  }

  return out;
}

function localeDirs(): string[] {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Resolves a dotted key against one locale's namespace file; undefined when any segment misses. */
function lookup(locale: string, key: string): unknown {
  const parsed = JSON.parse(
    readFileSync(resolve(LOCALES_DIR, locale, `${NAMESPACE}.json`), "utf-8"),
  ) as unknown;
  let node: unknown = parsed;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

describe("nav i18n keys", () => {
  it("declares at least one key (the walk found something to check)", () => {
    // Without this, a refactor that stopped collecting keys would leave every assertion below
    // vacuously true and this file reporting green while checking nothing.
    assert.ok(declaredKeys().length > 20, `only ${declaredKeys().length} nav i18n keys collected`);
  });

  it("finds locale directories to check against", () => {
    assert.ok(localeDirs().length > 0, "no locale directories under client/src/locales");
  });

  for (const locale of localeDirs()) {
    it(`${locale}: every nav-config i18nKey resolves to a string`, () => {
      const missing: string[] = [];
      for (const { key, label } of declaredKeys()) {
        const value = lookup(locale, key);
        if (typeof value !== "string" || value === "") {
          missing.push(`${key} (renders as "${label}")`);
        }
      }
      assert.deepEqual(
        missing,
        [],
        `client/src/locales/${locale}/${NAMESPACE}.json is missing ${missing.length} key(s) that ` +
          `nav-config.ts declares — each one renders wrongly in the navbar:\n    ` +
          missing.join("\n    "),
      );
    });
  }
});
