/**
 * Profile write-back consent. The sentence is HELD and is not rendered.
 *   C1 absent, blank, and a bare boolean are off; a grant timestamp is on
 *   C2 the sentence is one constant, marked HELD, and no client or route file carries it or the grant call
 *   C3 both write functions consult the consent read; the selection read does not
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PROFILE_WRITE_CONSENT_SENTENCE_HELD, profileWriteConsentGranted } from "../profile-write-consent";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

test("C1 a grant timestamp is the only on state", () => {
  assert.equal(profileWriteConsentGranted(null), false);
  assert.equal(profileWriteConsentGranted({}), false);
  assert.equal(profileWriteConsentGranted({ profileWriteConsent: true }), false);
  assert.equal(profileWriteConsentGranted({ profileWriteConsent: { grantedAt: "  " } }), false);
  assert.equal(profileWriteConsentGranted({ profileWriteConsent: { grantedAt: "2026-11-07T00:00:00.000Z" } }), true);
});

test("C2 the sentence is HELD and is not shipped on a traveler surface", () => {
  assert.match(PROFILE_WRITE_CONSENT_SENTENCE_HELD, /^HELD:/);
  assert.doesNotMatch(PROFILE_WRITE_CONSENT_SENTENCE_HELD, /\b(AI|founding|secret|trending|crowd|perfect|coming soon)\b/i);
  const files: string[] = [];
  walk(path.join(ROOT, "client", "src"), files);
  walk(path.join(ROOT, "server", "routes"), files);
  const hits = files.filter((file) => {
    const text = fs.readFileSync(file, "utf8");
    return text.includes(PROFILE_WRITE_CONSENT_SENTENCE_HELD) || text.includes("grantProfileWriteConsent");
  });
  assert.deepEqual(hits, []);
});

test("C3 writes check consent; the selection read does not", () => {
  const dislike = fs.readFileSync(path.join(ROOT, "server/services/traveler-profile.service.ts"), "utf8");
  const selection = fs.readFileSync(path.join(ROOT, "server/services/selection-profile.service.ts"), "utf8");
  const write = dislike.slice(dislike.indexOf("export async function recordDislikeFeedback"));
  assert.match(write, /if \(!\(await hasProfileWriteConsent\(userId\)\)\) return;/);
  const record = selection.slice(selection.indexOf("export async function recordSelection"));
  const read = selection.slice(selection.indexOf("export async function readSelectionTraits"));
  assert.match(record, /if \(!\(await hasProfileWriteConsent\(input\.userId\)\)\) return false;/);
  assert.doesNotMatch(read.slice(0, read.indexOf("export async function resetSelectionProfile")), /hasProfileWriteConsent/);
});
