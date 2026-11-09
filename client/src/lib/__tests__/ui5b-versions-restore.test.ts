/**
 * UI-5b — the restore strip's layout and the compare card's rhythm (ruled 2026-11-09).
 *
 * TWO THINGS ARE FROZEN IN THIS SLICE and are pinned here as such:
 *   · W13's seen-once behaviour — the three localStorage call sites in `VersionsRestoreStrip`
 *     (`readExpiredSeen` once at mount, `markExpiredSeen` once after a draw and once on dismiss).
 *     The slice may move markup AROUND them; it may not touch them.
 *   · the storage KEYS themselves. A changed key would silently re-show every expired line to every
 *     traveler, and no test that renders the component would notice.
 *
 *   S1 the strip is a card in the board's family (card radius, p-4, the family's eyebrow)
 *   S2 W13's three call sites are byte-for-byte what they were
 *   S3 the two localStorage keys are unchanged
 *   S4 the compare card's day cells and back control take radius tokens, its eyebrow the family's metrics
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui5b-versions-restore.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RESTORE_EXPIRED_SEEN_KEY, restorableKey } from "../versions-restore";

const STRIP = fs.readFileSync("client/src/components/plancard/VersionsRestoreStrip.tsx", "utf8");
const COMPARE = fs.readFileSync("client/src/pages/plan-compare.tsx", "utf8");

describe("UI-5b — the restore strip's shell", () => {
  it("S1 the strip is a card in the board's family", () => {
    assert.match(
      STRIP,
      /className="rounded-\[var\(--slip-radius-card\)\] border border-\[color:var\(--slip-line\)\] bg-\[color:var\(--slip-card\)\] p-4 text-xs"/,
      "card radius, the card's padding, 12px body copy",
    );
    const heading = STRIP.slice(STRIP.indexOf('data-testid="versions-restore-heading"') - 260, STRIP.indexOf('data-testid="versions-restore-heading"'));
    assert.match(heading, /text-\[11px\]/, "the family's eyebrow size");
    assert.match(heading, /uppercase/);
    assert.match(heading, /tracking-\[0\.08em\]/);
    // The label still names the same thing, and the section still points at it.
    assert.ok(STRIP.includes("{C.heading}"), "the heading is still the approved string");
    assert.ok(STRIP.includes('aria-labelledby="versions-restore-heading"'));
    // The error state is the same card, so a failed read is not a different-looking surface.
    assert.match(STRIP, /className="rounded-\[var\(--slip-radius-card\)\] border border-\[color:var\(--slip-line\)\] bg-\[color:var\(--slip-card\)\] p-4 text-xs"[\s\S]*?data-testid="versions-restore-strip-error"/);
  });
});

describe("UI-5b — W13 is frozen", () => {
  it("S2 the seen-once call sites are unchanged", () => {
    // One read at mount, one write after a draw, one write on dismiss — exactly three guards, and
    // each is the whole expression, so a move that "tidies" them fails here.
    assert.equal(
      (STRIP.match(/typeof localStorage !== "undefined" \? localStorage : null/g) ?? []).length,
      3,
      "the localStorage guard appears exactly three times",
    );
    assert.equal((STRIP.match(/markExpiredSeen\(/g) ?? []).length, 2, "two writes: after a draw, and on dismiss");
    assert.equal((STRIP.match(/readExpiredSeen\(/g) ?? []).length, 1, "one read, at mount");
    assert.ok(
      STRIP.includes(
        "const [seenAtMount] = useState(() => readExpiredSeen(typeof localStorage !== \"undefined\" ? localStorage : null));",
      ),
      "W13 :188 — the mount read",
    );
    assert.ok(
      STRIP.includes(
        'if (shownForRole && expiredIds) markExpiredSeen(typeof localStorage !== "undefined" ? localStorage : null, expiredIds.split(","));',
      ),
      "W13 :194 — recorded once drawn",
    );
    assert.ok(
      STRIP.includes('markExpiredSeen(typeof localStorage !== "undefined" ? localStorage : null, [id]);'),
      "W13 :245 — recorded on dismiss",
    );
  });

  it("S3 the storage keys are unchanged", () => {
    assert.equal(RESTORE_EXPIRED_SEEN_KEY, "traveloure_restore_expired_seen", "the seen key is permanent");
    // The restorable read is keyed under the board's own versions key so the board's refresh()
    // invalidates it by prefix — changing either half would silently stale the strip.
    assert.deepEqual(restorableKey("t1"), ["/api/trips/t1/versions", "restorable"]);
  });
});

describe("UI-5b — the compare card's rhythm", () => {
  it("S4 day cells and the back control take radius tokens, the eyebrow the family's metrics", () => {
    assert.match(
      COMPARE,
      /rounded-\[var\(--slip-radius-chip\)\] bg-\[color:var\(--slip-wash\)\] px-1 py-1\.5/,
      "the plan-fit day cell",
    );
    assert.match(
      COMPARE,
      /flex h-11 w-11 shrink-0 items-center justify-center rounded-\[var\(--slip-radius-chip\)\]/,
      "the back control",
    );
    assert.match(COMPARE, /text-\[11px\] font-semibold uppercase tracking-\[0\.08em\] text-\[color:var\(--slip-muted\)\]" data-testid="compare-eyebrow"/);
    // No ad-hoc radii left on the card family.
    assert.doesNotMatch(COMPARE, /rounded-lg\b/);
    assert.doesNotMatch(COMPARE, /rounded-md\b/);
    // And the card's own tokens are untouched.
    assert.match(COMPARE, /rounded-\[var\(--slip-radius-card\)\]/);
  });
});
