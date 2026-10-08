/**
 * SLIP TOKENS CONTRAST (ledger `2026-10-08-slip-tokens-contrast`; decision-maker, Oct 8, 2026): teal
 * TEXT is --slip-teal-ink, quiet TEXT is --slip-muted, and --slip-faint is allowed on non-text only.
 * Both text tokens clear WCAG AA (4.5:1) on every slip ground they sit on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../../", import.meta.url).pathname;
const css = readFileSync(join(SRC, "styles/slip-tokens.css"), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} is defined`);
  return m![1];
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("K1: the text tokens clear 4.5:1 on the card, the ground and the washes they sit on", () => {
  for (const fg of ["slip-teal-ink", "slip-muted"]) {
    for (const bg of ["slip-card", "slip-ground", "slip-teal-wash", "slip-wash"]) {
      assert.ok(ratio(token(fg), token(bg)) >= 4.5, `--${fg} on --${bg}: ${ratio(token(fg), token(bg)).toFixed(2)}`);
    }
  }
  assert.ok(ratio(token("slip-faint"), token("slip-card")) < 4.5, "faint is below AA — which is why it is non-text only");
});

function* tsx(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "__tests__" || e === "node_modules") continue;
    if (statSync(p).isDirectory()) yield* tsx(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

test("K2: no text is drawn in --slip-faint, and teal is a text colour only on an aria-hidden icon", () => {
  const offences: string[] = [];
  for (const f of tsx(SRC)) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/text-\[color:var\(--slip-faint\)\]/.test(line)) offences.push(`${f}:${i + 1} faint text`);
      if (/text-\[color:var\(--slip-teal\)\]/.test(line) && !/aria-hidden="true"/.test(line)) offences.push(`${f}:${i + 1} teal text`);
    });
  }
  assert.deepEqual(offences, []);
});
