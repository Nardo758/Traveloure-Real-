/**
 * Coral fill contrast (ledger `2026-10-05-coral-fill-contrast`, R333; `2026-10-05-coral-three-tokens`,
 * R337; events-page lane E8). White text on a filled coral surface must reach WCAG AA, 4.5:1.
 *
 *   C1  the three coral tokens exist once each in :root, with the ruled values
 *   C2  :root --primary IS the fill (#C8443D) and white on it is ≥ 4.5:1
 *   C3  .console-scope --primary IS the fill too, and white on it is ≥ 4.5:1
 *   C4  every --primary-hover a page can paint behind white text is ≥ 4.5:1
 *   C5  the coral text token reads ≥ 4.5:1 on white and on the cream ground
 *   C6  the accent stays the ring colour and is never --primary (it is 3.43:1 under white)
 *   C7  the dark theme is not ruled and is left as it was
 *
 * NEGATIVE SPACE: this reads the TOKENS in client/src/index.css. It cannot see a page that paints
 * white text on `var(--earn-coral-ink)` or a raw hex — retokenizing those sites and the coral check
 * script are Lane 1's (R337), not this test's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(process.cwd(), "client/src/index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block exists`);
  return css.slice(start, css.indexOf("}", start));
}

function decl(scope: string, name: string): string {
  const m = scope.match(new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`));
  assert.ok(m, `${name} is declared`);
  return m![1].trim();
}

function hslToHex(hsl: string): string {
  const m = hsl.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  assert.ok(m, `"${hsl}" is an h s% l% triple`);
  const h = Number(m![1]) / 360;
  const s = Number(m![2]) / 100;
  const l = Number(m![3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return "#" + [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#FFFFFF";
const CREAM = "#FAFAF8"; // --earn-ground
const root = block(":root");
const consoleScope = block(".console-scope");

test("C1 the three coral tokens carry the ruled values", () => {
  assert.equal(decl(root, "--coral-fill").toUpperCase(), "#C8443D");
  assert.equal(decl(root, "--coral-text").toUpperCase(), "#B8403A");
  assert.equal(decl(root, "--coral-accent").toUpperCase(), "#E85D55");
  for (const t of ["--coral-fill", "--coral-text", "--coral-accent"]) {
    assert.equal(css.split(`${t}:`).length - 1, 1, `${t} is defined exactly once`);
  }
});

test("C2 public --primary is the fill and white on it passes AA", () => {
  assert.equal(hslToHex(decl(root, "--primary")), "#C8443D");
  assert.equal(decl(root, "--primary-foreground"), "0 0% 100%");
  assert.ok(contrast(WHITE, hslToHex(decl(root, "--primary"))) >= 4.5);
});

test("C3 the console's --primary is the fill too", () => {
  assert.equal(hslToHex(decl(consoleScope, "--primary")), "#C8443D");
  assert.ok(contrast(WHITE, hslToHex(decl(consoleScope, "--primary"))) >= 4.5);
});

test("C4 every hover state behind white text passes AA", () => {
  for (const [name, scope] of [[":root", root], [".console-scope", consoleScope]] as const) {
    const hover = hslToHex(decl(scope, "--primary-hover"));
    assert.ok(contrast(WHITE, hover) >= 4.5, `${name} --primary-hover ${hover} is ${contrast(WHITE, hover).toFixed(2)}:1`);
  }
});

test("C5 coral text reads AA on white and on cream", () => {
  const text = decl(root, "--coral-text");
  assert.ok(contrast(text, WHITE) >= 4.5);
  assert.ok(contrast(text, CREAM) >= 4.5);
});

test("C6 the accent rings but never fills", () => {
  const accent = decl(root, "--coral-accent");
  assert.ok(contrast(WHITE, accent) < 4.5, "the accent is the colour that fails under white — the reason it is not the fill");
  assert.equal(hslToHex(decl(consoleScope, "--ring")), "#E85C54", "the console ring stays the accent (3 76% 62%)");
  assert.notEqual(hslToHex(decl(root, "--primary")), accent.toUpperCase());
});

test("C7 the dark theme is not ruled and is left as it was", () => {
  assert.equal(decl(block(".dark"), "--primary"), "350 100% 65%");
});
